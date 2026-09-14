import { MutationPostcondition } from '../domain/mutation.js';
import { ReconciliationOutcome } from '../domain/reconciliation.js';
import { RemoteTrackItem } from '../gateway/interfaces.js';

export class PostconditionEvaluator {
  /**
   * Evaluate whether a desired postcondition is satisfied in the observed remote state (P0-2, INV-019).
   */
  public static evaluate(
    postcondition: MutationPostcondition,
    observedRemoteItems: RemoteTrackItem[]
  ): ReconciliationOutcome {
    switch (postcondition.check) {
      case 'PRESENT': {
        const found = observedRemoteItems.some(item => item.videoId === postcondition.videoId);
        return found ? 'EFFECT_SATISFIED' : 'MISSING_EFFECT';
      }

      case 'ABSENT': {
        const found = observedRemoteItems.some(item => item.remoteItemId === postcondition.remoteItemId);
        return found ? 'MISSING_EFFECT' : 'EFFECT_SATISFIED';
      }

      case 'AT_RELATIVE_POSITION': {
        const targetId = postcondition.remoteItemId;
        const targetIndex = observedRemoteItems.findIndex(item => item.remoteItemId === targetId);
        if (targetIndex === -1) {
          // Target item itself is missing!
          return 'MISSING_EFFECT';
        }

        const anchor = postcondition.relativeAnchor;
        if (anchor.type === 'END') {
          return targetIndex === observedRemoteItems.length - 1
            ? 'EFFECT_SATISFIED'
            : 'MISSING_EFFECT';
        }

        // Anchor is BEFORE some other item
        const successorId = anchor.remoteItemId;
        const successorIndex = observedRemoteItems.findIndex(item => item.remoteItemId === successorId);
        if (successorIndex === -1) {
          // The anchor item was removed externally! Ambiguous situation -> CONFLICT (Rule 5)
          return 'CONFLICT';
        }

        if (successorIndex === targetIndex + 1) {
          return 'EFFECT_SATISFIED';
        }

        return 'MISSING_EFFECT';
      }
    }
  }
}
