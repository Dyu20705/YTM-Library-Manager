import { describe, it, expect, beforeEach } from 'vitest';
import { MockYtmGateway } from '../../src/gateway/mock_gateway.js';
import { ChangePlanner } from '../../src/planner/change_planner.js';
import { ReconciliationEngine } from '../../src/reconciliation/reconciliation_engine.js';
import { MutationIntent } from '../../src/domain/mutation.js';

describe('GATE-03: Mutation Outcome Reconciliation & UNKNOWN State Handling', () => {
  let gateway: MockYtmGateway;

  beforeEach(() => {
    gateway = new MockYtmGateway();
  });

  it('handles simulated timeout after remote success: reconciles UNKNOWN to COMPLETED without duplicate retry (P0-2, INV-012)', async () => {
    // Inject timeout fault: server applies add, but network fails before response
    gateway.simulateNetworkTimeoutOnNextMutation = true;

    const result = await gateway.addItems('PL_JPOP', [{ videoId: 'v_timeout_track' }]);
    expect(result.state).toBe('UNKNOWN');
    expect(result.unknownCount).toBe(1);

    const intent: MutationIntent = {
      action: 'ADD',
      playlistId: 'PL_JPOP',
      videoId: 'v_timeout_track',
      postcondition: { check: 'PRESENT', videoId: 'v_timeout_track' }
    };

    // Auto-probe current remote state
    const { items: observedItems } = await gateway.getPlaylistItems('PL_JPOP');

    // Reconcile unknown intent batch against observed state
    const reconciliation = ReconciliationEngine.reconcileUnknownBatch([intent], observedItems);

    expect(reconciliation.state).toBe('COMPLETED');
    expect(reconciliation.satisfiedIntents.length).toBe(1);
    expect(reconciliation.missingIntents.length).toBe(0);

    // Verify track is in playlist only ONCE (no duplicate created)
    const matches = observedItems.filter(i => i.videoId === 'v_timeout_track');
    expect(matches.length).toBe(1);
  });

  it('handles simulated timeout where server did NOT apply change: identifies MISSING_EFFECT for safe retry', async () => {
    const intent: MutationIntent = {
      action: 'ADD',
      playlistId: 'PL_JPOP',
      videoId: 'v_never_added',
      postcondition: { check: 'PRESENT', videoId: 'v_never_added' }
    };

    const { items: observedItems } = await gateway.getPlaylistItems('PL_JPOP');
    const reconciliation = ReconciliationEngine.reconcileUnknownBatch([intent], observedItems);

    expect(reconciliation.state).toBe('PARTIAL_SUCCESS');
    expect(reconciliation.satisfiedIntents.length).toBe(0);
    expect(reconciliation.missingIntents.length).toBe(1);
    expect(reconciliation.missingIntents[0]?.videoId).toBe('v_never_added');
  });

  it('handles UNKNOWN removal: postcondition ABSENT is verified against remote state', async () => {
    gateway.simulateNetworkTimeoutOnNextMutation = true;

    const result = await gateway.removeItems('PL_JPOP', [
      { videoId: 'v1_ado', remoteItemId: 'item_1_usseewa' }
    ]);
    expect(result.state).toBe('UNKNOWN');

    const intent: MutationIntent = {
      action: 'REMOVE',
      playlistId: 'PL_JPOP',
      videoId: 'v1_ado',
      remoteItemId: 'item_1_usseewa',
      postcondition: { check: 'ABSENT', remoteItemId: 'item_1_usseewa' }
    };

    const { items: observedItems } = await gateway.getPlaylistItems('PL_JPOP');
    const reconciliation = ReconciliationEngine.reconcileUnknownBatch([intent], observedItems);

    expect(reconciliation.state).toBe('COMPLETED');
    expect(reconciliation.satisfiedIntents.length).toBe(1);
    expect(observedItems.some(i => i.remoteItemId === 'item_1_usseewa')).toBe(false);
  });

  it('SKIP_EXISTING duplicate policy prevents duplicate add intents from being sent (P0-H)', () => {
    const existingItems = [
      { id: 1, playlistId: 'PL1', trackId: 10, remoteItemId: 'r1', position: 0, addedAt: null },
      { id: 2, playlistId: 'PL1', trackId: 20, remoteItemId: 'r2', position: 1, addedAt: null }
    ];
    const existingVideoIds = new Set(['v1', 'v2']);

    const plan = ChangePlanner.planAddTracks('PL1', existingItems, existingVideoIds, ['v1', 'v3']);

    expect(plan.intents.length).toBe(1);
    expect(plan.intents[0]?.videoId).toBe('v3');
    expect(plan.skippedVideoIds).toEqual(['v1']);
    expect(plan.summary.skippedCount).toBe(1);
    expect(plan.summary.addedCount).toBe(1);
  });
});
