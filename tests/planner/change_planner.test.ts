import { describe, it, expect } from 'vitest';
import { ExactDeduplicator } from '../../src/planner/deduplicator.js';
import { MoveOperationCompiler } from '../../src/planner/move_compiler.js';
import { ChangePlanner } from '../../src/planner/change_planner.js';
import { PlaylistItem } from '../../src/domain/playlist.js';

describe('Change Planner, Move Compiler, and Exact Deduplication', () => {
  it('identifies earliest occurrence as retained and subsequent as redundant (V1.1 §6.3)', () => {
    const items: PlaylistItem[] = [
      { id: 1, playlistId: 'PL1', trackId: 101, remoteItemId: 'set_A1', position: 12, addedAt: null },
      { id: 2, playlistId: 'PL1', trackId: 202, remoteItemId: 'set_B', position: 100, addedAt: null },
      { id: 3, playlistId: 'PL1', trackId: 101, remoteItemId: 'set_A2', position: 450, addedAt: null },
      { id: 4, playlistId: 'PL1', trackId: 101, remoteItemId: 'set_A3', position: 910, addedAt: null }
    ];

    const plan = ExactDeduplicator.planDeduplication('PL1', items);

    expect(plan.totalDuplicatesFound).toBe(2);
    expect(plan.groups.length).toBe(1);

    const group = plan.groups[0]!;
    expect(group.retainedOccurrence.remoteItemId).toBe('set_A1');
    expect(group.retainedOccurrence.position).toBe(12);

    expect(group.redundantOccurrences.length).toBe(2);
    expect(group.redundantOccurrences[0]?.remoteItemId).toBe('set_A2');
    expect(group.redundantOccurrences[1]?.remoteItemId).toBe('set_A3');

    // Remove intents generated for redundant occurrences
    expect(plan.removeIntents.length).toBe(2);
    expect(plan.removeIntents[0]?.remoteItemId).toBe('set_A2');
    expect(plan.removeIntents[1]?.remoteItemId).toBe('set_A3');
  });

  it('compiles domain index moves into BEFORE anchor or END anchor', () => {
    const items: PlaylistItem[] = [
      { id: 1, playlistId: 'PL1', trackId: 1, remoteItemId: 'rA', position: 0, addedAt: null },
      { id: 2, playlistId: 'PL1', trackId: 2, remoteItemId: 'rB', position: 1, addedAt: null },
      { id: 3, playlistId: 'PL1', trackId: 3, remoteItemId: 'rC', position: 2, addedAt: null },
      { id: 4, playlistId: 'PL1', trackId: 4, remoteItemId: 'rD', position: 3, addedAt: null }
    ];

    // Move rD to index 1 (between rA and rB) -> anchor BEFORE rB
    const move1 = MoveOperationCompiler.compileMove(items, items[3]!, 1);
    expect(move1.anchor).toEqual({ type: 'BEFORE', remoteItemId: 'rB' });

    // Move rA to end of list (index 100) -> anchor END
    const move2 = MoveOperationCompiler.compileMove(items, items[0]!, 100);
    expect(move2.anchor).toEqual({ type: 'END' });
  });

  it('ChangePlanner generates preview diff with rollback intent', () => {
    const items: PlaylistItem[] = [
      { id: 1, playlistId: 'PL1', trackId: 1, remoteItemId: 'rA', position: 0, addedAt: null },
      { id: 2, playlistId: 'PL1', trackId: 2, remoteItemId: 'rB', position: 1, addedAt: null },
      { id: 3, playlistId: 'PL1', trackId: 3, remoteItemId: 'rC', position: 2, addedAt: null }
    ];

    const removePlan = ChangePlanner.planRemoveTracks('PL1', items, [
      { videoId: 'vB', remoteItemId: 'rB' }
    ]);

    expect(removePlan.intents.length).toBe(1);
    expect(removePlan.summary.removedCount).toBe(1);
    expect(removePlan.rollbackIntent.kind).toBe('RESTORE_REMOVED');
    expect(removePlan.rollbackIntent.restoreMembership?.[0]?.predecessorVideoId).toBe('rA');
    expect(removePlan.rollbackIntent.restoreMembership?.[0]?.successorVideoId).toBe('rC');
  });
});
