import { MutationIntent, MutationState } from '../domain/mutation.js';
import { RollbackIntent } from '../domain/operation.js';
import { PostconditionEvaluator } from './postcondition_evaluator.js';
import { RemoteTrackItem } from '../gateway/interfaces.js';
import { OccurrenceItem } from './delta_classifier.js';

export interface UnknownReconciliationResult {
  state: MutationState; // COMPLETED | PARTIAL_SUCCESS | CONFLICT
  satisfiedIntents: MutationIntent[];
  missingIntents: MutationIntent[];
  conflictIntents: MutationIntent[];
}

export interface RollbackReconciliationResult {
  state: MutationState; // READY | CONFLICT
  reconciledOrder?: string[];
  conflictReason?: string;
  diff?: {
    baseOrder: string[];
    currentOrder: string[];
    intentDescription: string;
  };
}

export class ReconciliationEngine {
  /**
   * Reconcile an UNKNOWN mutation batch by evaluating postconditions against observed remote items (P0-2, INV-007, INV-019).
   */
  public static reconcileUnknownBatch(
    intents: MutationIntent[],
    observedRemoteItems: RemoteTrackItem[]
  ): UnknownReconciliationResult {
    const satisfiedIntents: MutationIntent[] = [];
    const missingIntents: MutationIntent[] = [];
    const conflictIntents: MutationIntent[] = [];

    for (const intent of intents) {
      const outcome = PostconditionEvaluator.evaluate(intent.postcondition, observedRemoteItems);
      switch (outcome) {
        case 'EFFECT_SATISFIED':
          satisfiedIntents.push(intent);
          break;
        case 'MISSING_EFFECT':
          missingIntents.push(intent);
          break;
        case 'CONFLICT':
        case 'INDETERMINATE':
          conflictIntents.push(intent);
          break;
      }
    }

    let state: MutationState;
    if (conflictIntents.length > 0) {
      state = 'CONFLICT';
    } else if (missingIntents.length === 0) {
      state = 'COMPLETED';
    } else {
      state = 'PARTIAL_SUCCESS';
    }

    return {
      state,
      satisfiedIntents,
      missingIntents,
      conflictIntents
    };
  }

  /**
   * 3-Way Reconciliation for Rollback operations adhering to the 5 formal rules (Review §18, Review §20, Review §29).
   */
  public static reconcileRollback(
    baseItems: OccurrenceItem[],
    currentItems: OccurrenceItem[],
    rollbackIntent: RollbackIntent
  ): RollbackReconciliationResult {
    const baseIds = baseItems.map(i => i.videoId);
    const currentIds = currentItems.map(i => i.videoId);

    // Rule 5: CONFLICT_ON_EXTERNAL_REORDER (Conservative V1 Policy, Review §18)
    // Find items present in both Base and Current that were NOT part of our mutation
    const affectedVideoIds = new Set<string>();
    if (rollbackIntent.restoreMembership) {
      rollbackIntent.restoreMembership.forEach(e => affectedVideoIds.add(e.videoId));
    }
    if (rollbackIntent.undoMembership) {
      rollbackIntent.undoMembership.forEach(e => affectedVideoIds.add(e.videoId));
    }
    if (rollbackIntent.undoMove) {
      affectedVideoIds.add(rollbackIntent.undoMove.videoId);
    }

    const unchangedInBase = baseItems
      .filter(i => !affectedVideoIds.has(i.videoId))
      .map(i => i.videoId);

    const unchangedInCurrent = currentItems
      .filter(i => !affectedVideoIds.has(i.videoId))
      .map(i => i.videoId);

    // Filter to common items between both
    const commonInBase = unchangedInBase.filter(id => unchangedInCurrent.includes(id));
    const commonInCurrent = unchangedInCurrent.filter(id => unchangedInBase.includes(id));

    // Compare ordering
    const isReordered = commonInBase.some((id, idx) => id !== commonInCurrent[idx]);
    if (isReordered) {
      return {
        state: 'CONFLICT',
        conflictReason: 'External reordering of unchanged playlist items detected (Rule 5 Conservative Policy)',
        diff: {
          baseOrder: baseIds,
          currentOrder: currentIds,
          intentDescription: `Rollback ${rollbackIntent.kind}`
        }
      };
    }

    // Rule 1: Preserve external additions & Rule 3: Restore using relative anchors
    if (rollbackIntent.kind === 'RESTORE_REMOVED' && rollbackIntent.restoreMembership) {
      const resultOrder = [...currentIds];

      for (const entry of rollbackIntent.restoreMembership) {
        // Find anchor position in current
        let insertIndex = -1;

        if (entry.predecessorVideoId) {
          const predIdx = resultOrder.indexOf(entry.predecessorVideoId);
          if (predIdx !== -1) {
            insertIndex = predIdx + 1;
          }
        }

        if (insertIndex === -1 && entry.successorVideoId) {
          const succIdx = resultOrder.indexOf(entry.successorVideoId);
          if (succIdx !== -1) {
            insertIndex = succIdx;
          }
        }

        // If neither anchor exists anymore -> CONFLICT
        if (insertIndex === -1 && (entry.predecessorVideoId || entry.successorVideoId)) {
          return {
            state: 'CONFLICT',
            conflictReason: `Relative anchors for track ${entry.videoId} were removed externally`,
            diff: {
              baseOrder: baseIds,
              currentOrder: currentIds,
              intentDescription: `Restore track ${entry.videoId}`
            }
          };
        }

        if (insertIndex !== -1) {
          resultOrder.splice(insertIndex, 0, entry.videoId);
        } else {
          resultOrder.push(entry.videoId);
        }
      }

      return {
        state: 'READY',
        reconciledOrder: resultOrder
      };
    }

    // Default READY
    return {
      state: 'READY',
      reconciledOrder: currentIds
    };
  }
}
