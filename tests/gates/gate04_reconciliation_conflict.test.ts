import { describe, it, expect } from 'vitest';
import { PostconditionEvaluator } from '../../src/reconciliation/postcondition_evaluator.js';
import { ReconciliationEngine } from '../../src/reconciliation/reconciliation_engine.js';
import { RemoteTrackItem } from '../../src/gateway/interfaces.js';
import { OccurrenceItem } from '../../src/reconciliation/delta_classifier.js';
import { RollbackIntent } from '../../src/domain/operation.js';

describe('GATE-04: Reconciliation & Conflict Detection (Review §29 Scenarios)', () => {
  // Test 1: ADD postcondition
  it('Test 1: ADD postcondition satisfied when item is present in remote probe', () => {
    const remoteItems: RemoteTrackItem[] = [
      { videoId: 'A', title: 'A', artistNames: [], durationSeconds: 100 },
      { videoId: 'B', title: 'B', artistNames: [], durationSeconds: 100 },
      { videoId: 'C', title: 'C', artistNames: [], durationSeconds: 100 },
      { videoId: 'X', title: 'X', artistNames: [], durationSeconds: 100 }
    ];

    const outcome = PostconditionEvaluator.evaluate(
      { check: 'PRESENT', videoId: 'X' },
      remoteItems
    );
    expect(outcome).toBe('EFFECT_SATISFIED');
  });

  // Test 2: ADD postcondition not met
  it('Test 2: ADD postcondition reports MISSING_EFFECT when item is absent after timeout', () => {
    const remoteItems: RemoteTrackItem[] = [
      { videoId: 'A', title: 'A', artistNames: [], durationSeconds: 100 },
      { videoId: 'B', title: 'B', artistNames: [], durationSeconds: 100 },
      { videoId: 'C', title: 'C', artistNames: [], durationSeconds: 100 }
    ];

    const outcome = PostconditionEvaluator.evaluate(
      { check: 'PRESENT', videoId: 'X' },
      remoteItems
    );
    expect(outcome).toBe('MISSING_EFFECT');
  });

  // Test 3: REMOVE postcondition satisfied
  it('Test 3: REMOVE postcondition satisfied when remoteItemId is absent', () => {
    const remoteItems: RemoteTrackItem[] = [
      { videoId: 'X', remoteItemId: 'A1', title: 'A1', artistNames: [], durationSeconds: 100 },
      { videoId: 'Y', remoteItemId: 'C3', title: 'C3', artistNames: [], durationSeconds: 100 }
    ];

    const outcome = PostconditionEvaluator.evaluate(
      { check: 'ABSENT', remoteItemId: 'B2' },
      remoteItems
    );
    expect(outcome).toBe('EFFECT_SATISFIED');
  });

  // Test 4: REMOVE postcondition not met
  it('Test 4: REMOVE postcondition reports MISSING_EFFECT when remoteItemId is still present', () => {
    const remoteItems: RemoteTrackItem[] = [
      { videoId: 'X', remoteItemId: 'A1', title: 'A1', artistNames: [], durationSeconds: 100 },
      { videoId: 'X', remoteItemId: 'B2', title: 'B2', artistNames: [], durationSeconds: 100 },
      { videoId: 'Y', remoteItemId: 'C3', title: 'C3', artistNames: [], durationSeconds: 100 }
    ];

    const outcome = PostconditionEvaluator.evaluate(
      { check: 'ABSENT', remoteItemId: 'B2' },
      remoteItems
    );
    expect(outcome).toBe('MISSING_EFFECT');
  });

  // Test 5: External reorder triggers CONFLICT
  it('Test 5: External reorder of unchanged items triggers CONFLICT (Rule 5 Conservative Policy)', () => {
    const baseItems: OccurrenceItem[] = [
      { videoId: 'A', remoteItemId: 'rA', position: 0 },
      { videoId: 'B', remoteItemId: 'rB', position: 1 },
      { videoId: 'C', remoteItemId: 'rC', position: 2 },
      { videoId: 'D', remoteItemId: 'rD', position: 3 }
    ];

    // Externally B and C swapped
    const currentItems: OccurrenceItem[] = [
      { videoId: 'A', remoteItemId: 'rA', position: 0 },
      { videoId: 'C', remoteItemId: 'rC', position: 1 },
      { videoId: 'B', remoteItemId: 'rB', position: 2 },
      { videoId: 'D', remoteItemId: 'rD', position: 3 }
    ];

    const rollbackIntent: RollbackIntent = {
      kind: 'RESTORE_REMOVED',
      targetPlaylistId: 'PL1',
      restoreMembership: [{
        videoId: 'E',
        predecessorVideoId: 'B',
        successorVideoId: 'C'
      }]
    };

    const res = ReconciliationEngine.reconcileRollback(baseItems, currentItems, rollbackIntent);

    expect(res.state).toBe('CONFLICT');
    expect(res.conflictReason).toContain('Rule 5 Conservative Policy');
    expect(res.diff).toBeDefined();
  });

  // Test 6: External addition preserved
  it('Test 6: External addition is preserved at its position while restoring changes (Rule 1 & Rule 3)', () => {
    const baseItems: OccurrenceItem[] = [
      { videoId: 'A', remoteItemId: 'rA', position: 0 },
      { videoId: 'B', remoteItemId: 'rB', position: 1 },
      { videoId: 'C', remoteItemId: 'rC', position: 2 }
    ];

    // Z was added externally after A; X was removed by us and needs restoration between B and C
    const currentItems: OccurrenceItem[] = [
      { videoId: 'A', remoteItemId: 'rA', position: 0 },
      { videoId: 'Z', remoteItemId: 'rZ', position: 1 }, // External addition
      { videoId: 'B', remoteItemId: 'rB', position: 2 },
      { videoId: 'C', remoteItemId: 'rC', position: 3 }
    ];

    const rollbackIntent: RollbackIntent = {
      kind: 'RESTORE_REMOVED',
      targetPlaylistId: 'PL1',
      restoreMembership: [{
        videoId: 'X',
        predecessorVideoId: 'B',
        successorVideoId: 'C'
      }]
    };

    const res = ReconciliationEngine.reconcileRollback(baseItems, currentItems, rollbackIntent);

    expect(res.state).toBe('READY');
    // Result preserves Z, and inserts X between B and C
    expect(res.reconciledOrder).toEqual(['A', 'Z', 'B', 'X', 'C']);
  });

  // Test 7: Duplicate occurrences of same videoId disambiguated by remoteItemId (P0-4)
  it('Test 7: Duplicate occurrences of same videoId disambiguated by remoteItemId without conflict (P0-4)', () => {
    const baseItems: OccurrenceItem[] = [
      { videoId: 'A', remoteItemId: 'rA_first', position: 0 },
      { videoId: 'B', remoteItemId: 'rB', position: 1 },
      { videoId: 'A', remoteItemId: 'rA_second', position: 2 }
    ];

    // Only the second occurrence 'rA_second' was removed by us; 'rA_first' and 'rB' remain untouched
    const currentItems: OccurrenceItem[] = [
      { videoId: 'A', remoteItemId: 'rA_first', position: 0 },
      { videoId: 'B', remoteItemId: 'rB', position: 1 }
    ];

    const rollbackIntent: RollbackIntent = {
      kind: 'RESTORE_REMOVED',
      targetPlaylistId: 'PL1',
      restoreMembership: [{
        videoId: 'A',
        remoteItemId: 'rA_second',
        predecessorRemoteItemId: 'rB'
      }]
    };

    const res = ReconciliationEngine.reconcileRollback(baseItems, currentItems, rollbackIntent);

    expect(res.state).toBe('READY');
    expect(res.reconciledOrder).toEqual(['A', 'B', 'A']);
  });
});
