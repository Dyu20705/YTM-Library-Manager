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
  reconciledItems?: OccurrenceItem[];
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
    const key = (item: OccurrenceItem): string => item.remoteItemId ?? item.videoId;
    const conflict = (reason: string): RollbackReconciliationResult => ({
      state: 'CONFLICT', conflictReason: reason,
      diff: { baseOrder: baseItems.map(key), currentOrder: currentItems.map(key), intentDescription: `Rollback ${rollbackIntent.kind}` }
    });
    const affected = new Set<string>();
    const entries = rollbackIntent.restoreMembership ?? rollbackIntent.undoMembership ??
      (rollbackIntent.undoMove ? [rollbackIntent.undoMove] : []);
    for (const entry of entries) {
      if (entry.remoteItemId) affected.add(entry.remoteItemId);
      else {
        const candidates = [...new Map([...baseItems, ...currentItems].filter(i => i.videoId === entry.videoId).map(i => [key(i), i])).values()];
        if (rollbackIntent.kind === 'UNDO_ADDED') {
          const baseKeys = new Set(baseItems.map(key));
          const additions = candidates.filter(i => !baseKeys.has(key(i)));
          if (additions.length > 1) return conflict('Ambiguous added occurrence identity');
          additions.forEach(i => affected.add(key(i)));
        } else {
          if (candidates.length > 1) return conflict('Ambiguous occurrence identity');
          candidates.forEach(i => affected.add(key(i)));
        }
      }
    }
    const unaffectedBase = baseItems.filter(i => !affected.has(key(i))).map(key);
    const unaffectedCurrent = currentItems.filter(i => !affected.has(key(i))).map(key);
    const baseSet = new Set(unaffectedBase);
    const currentSet = new Set(unaffectedCurrent);
    const commonBase = unaffectedBase.filter(k => currentSet.has(k));
    const commonCurrent = unaffectedCurrent.filter(k => baseSet.has(k));
    if (commonBase.some((k, i) => k !== commonCurrent[i])) {
      return conflict('External reordering of unchanged playlist items detected (Rule 5 Conservative Policy)');
    }
    let result = currentItems.map(i => ({ ...i }));
    if (rollbackIntent.kind === 'UNDO_ADDED') {
      // Remove only our bound additions, preserving identical songs added by others.
      const baseKeys = new Set(baseItems.map(key));
      if ([...affected].some(k => baseKeys.has(k))) return conflict('Undo would remove a pre-existing occurrence');
      result = result.filter(i => !affected.has(key(i)));
    } else {
      const restores = rollbackIntent.kind === 'RESTORE_REMOVED' ? rollbackIntent.restoreMembership :
        rollbackIntent.undoMove ? [rollbackIntent.undoMove] : undefined;
      if (!restores) return conflict('Missing rollback entries');
      const pending = [...restores];
      // Resolve chains of adjacent removed anchors against the evolving result.
      while (pending.length) {
        let progress = false;
        for (let e = 0; e < pending.length; e++) {
          const entry = pending[e]!;
          const candidates = result.filter(i => entry.remoteItemId ? i.remoteItemId === entry.remoteItemId : i.videoId === entry.videoId);
          if (candidates.length > 1) return conflict('Ambiguous rollback occurrence');
          if (rollbackIntent.kind === 'RESTORE_REMOVED' && candidates.length === 1) {
            pending.splice(e--, 1); progress = true; continue;
          }
          if (rollbackIntent.kind === 'UNDO_MOVED' && candidates.length === 0) return conflict('Moved occurrence was removed externally');
          const moving = candidates[0];
          const remaining = moving ? result.filter(i => i !== moving) : result;
          const anchorIndex = (remoteId?: string, videoId?: string): number => {
            if (remoteId) return remaining.findIndex(i => i.remoteItemId === remoteId);
            if (!videoId) return -1;
            const matches = remaining.filter(i => i.videoId === videoId);
            return matches.length === 1 ? remaining.indexOf(matches[0]!) : -1;
          };
          const pred = anchorIndex(entry.predecessorRemoteItemId, entry.predecessorVideoId);
          const succ = anchorIndex(entry.successorRemoteItemId, entry.successorVideoId);
          if (pred >= 0 && succ >= 0 && pred >= succ) return conflict('Relative anchors are reversed');
          const hasAnchors = entry.predecessorRemoteItemId || entry.predecessorVideoId || entry.successorRemoteItemId || entry.successorVideoId;
          if (pred < 0 && succ < 0 && hasAnchors) continue;
          // Prefer successor to preserve additions already occupying the original interval.
          const index = succ >= 0 ? succ : pred >= 0 ? pred + 1 : remaining.length;
          const restored = moving ?? { videoId: entry.videoId, remoteItemId: entry.remoteItemId, position: index };
          remaining.splice(index, 0, restored);
          result = remaining;
          pending.splice(e--, 1); progress = true;
        }
        if (!progress) return conflict('Relative anchors were removed externally or are ambiguous');
      }
    }
    result = result.map((item, position) => ({ ...item, position }));
    return { state: 'READY', reconciledOrder: result.map(i => i.videoId), reconciledItems: result };
  }
}
