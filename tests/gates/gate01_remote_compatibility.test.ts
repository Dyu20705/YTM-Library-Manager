import { describe, it, expect } from 'vitest';
import { MockYtmGateway } from '../../src/gateway/mock_gateway.js';
import { SubprocessYtmGateway } from '../../src/gateway/ytm_gateway.js';

describe('GATE-01: Remote API Compatibility & Contract Verification', () => {
  it('verifies candidate version ytmusicapi 1.12.2 via python bridge ping', async () => {
    const gateway = new SubprocessYtmGateway();
    // Test the bridge script with ping command
    const res = await (gateway as any).callBridge('ping');
    expect(res).toEqual({ status: 'ok', version: '1.12.2' });
  });

  it('verifies regular playlists return items with setVideoId (remoteItemId)', async () => {
    const mockGateway = new MockYtmGateway();
    const { items } = await mockGateway.getPlaylistItems('PL_JPOP');

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.remoteItemId).toBeDefined();
      expect(typeof item.remoteItemId).toBe('string');
    }
  });

  it('verifies Liked Music (LM) items lack setVideoId (P0-A contract exception)', async () => {
    const mockGateway = new MockYtmGateway();
    const { items } = await mockGateway.getPlaylistItems('LM');

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.remoteItemId).toBeUndefined(); // LM items do not have setVideoId
    }
  });

  it('verifies feedbackTokens are extracted and cached from get_library_songs / get_playlist (P0-1)', async () => {
    const mockGateway = new MockYtmGateway();
    const { items } = await mockGateway.getPlaylistItems('PL_JPOP');

    const adoTrack = items.find(i => i.videoId === 'v1_ado');
    expect(adoTrack?.feedbackTokens).toBeDefined();
    expect(adoTrack?.feedbackTokens?.add).toBe('fb_add_ado');
    expect(adoTrack?.feedbackTokens?.remove).toBe('fb_rem_ado');

    // Verify gateway caches them in RemoteObservationCache
    const cached = mockGateway.observationCache.getTokens('v1_ado');
    expect(cached).toEqual({ add: 'fb_add_ado', remove: 'fb_rem_ado' });
  });

  it('verifies setLibraryStatus resolves feedbackTokens internally (P0-1 Domain isolation)', async () => {
    const mockGateway = new MockYtmGateway();

    // Domain passes ONLY videoId and desiredInLibrary boolean (no feedback tokens)
    const result = await mockGateway.setLibraryStatus('v1_ado', false);
    expect(result.state).toBe('COMPLETED');
    expect(result.appliedItems[0]?.videoId).toBe('v1_ado');
  });

  it('verifies reordering Liked Music throws UNSUPPORTED_OPERATION', async () => {
    const mockGateway = new MockYtmGateway();
    await expect(
      mockGateway.moveItem('LM', 'fake_remote_id', { type: 'END' })
    ).rejects.toThrow('Cannot reorder items in Liked Music playlist.');

    const realGateway = new SubprocessYtmGateway();
    await expect(
      realGateway.moveItem('LM', 'fake_remote_id', { type: 'END' })
    ).rejects.toThrow('Cannot reorder items in Liked Music playlist.');
  });

  it('verifies getPlaylistItems pagination contract with limit and cursor (P0-1)', async () => {
    const mockGateway = new MockYtmGateway();
    // Request page 1 with limit 2
    const page1 = await mockGateway.getPlaylistItems('PL_JPOP', 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBe('2');

    // Request page 2 with cursor '2'
    const page2 = await mockGateway.getPlaylistItems('PL_JPOP', 2, page1.nextCursor);
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeUndefined();
  });

  it('verifies moveItem contract with BEFORE and END anchors (P0-2)', async () => {
    const mockGateway = new MockYtmGateway();
    // Move item 1 to END
    const endResult = await mockGateway.moveItem('PL_JPOP', 'item_1_usseewa', { type: 'END' });
    expect(endResult.state).toBe('COMPLETED');
    expect(endResult.appliedItems[0]?.remoteItemId).toBe('item_1_usseewa');

    const { items: afterEnd } = await mockGateway.getPlaylistItems('PL_JPOP');
    expect(afterEnd[afterEnd.length - 1]?.remoteItemId).toBe('item_1_usseewa');

    // Move item 1 BEFORE item 2
    const beforeResult = await mockGateway.moveItem('PL_JPOP', 'item_1_usseewa', {
      type: 'BEFORE',
      remoteItemId: 'item_2_yoru'
    });
    expect(beforeResult.state).toBe('COMPLETED');

    const { items: afterBefore } = await mockGateway.getPlaylistItems('PL_JPOP');
    expect(afterBefore[0]?.remoteItemId).toBe('item_1_usseewa');
  });

  it('verifies bridge error code normalization into typed RemoteError (P0-3)', async () => {
    const gateway = new SubprocessYtmGateway();
    await expect(
      (gateway as any).callBridge('nonexistent_command')
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST'
    });
  });

  it('verifies observation cache scopes to sessionId and clears on session switch (P0-5)', () => {
    const mockGateway = new MockYtmGateway();
    mockGateway.observationCache.startSession('session-1');
    mockGateway.observationCache.setTokens('track-1', { add: 'add-1', remove: 'rem-1' });
    expect(mockGateway.observationCache.getTokens('track-1')).toBeDefined();

    // Switch session
    mockGateway.observationCache.startSession('session-2');
    expect(mockGateway.observationCache.getTokens('track-1')).toBeUndefined();
    expect(mockGateway.observationCache.getSessionId()).toBe('session-2');
  });

  it('verifies getPlaylists enforces isEditable false for LM and unowned playlists (P0-6)', async () => {
    const mockGateway = new MockYtmGateway();
    const playlists = await mockGateway.getPlaylists();
    const lm = playlists.find(p => p.id === 'LM');
    expect(lm).toBeDefined();
    expect(lm?.isEditable).toBe(false);

    const jpop = playlists.find(p => p.id === 'PL_JPOP');
    expect(jpop).toBeDefined();
    expect(jpop?.isEditable).toBe(true);
  });
});
