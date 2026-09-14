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
  });
});
