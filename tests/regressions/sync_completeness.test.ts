import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseConnection } from '../../src/storage/connection.js';
import { LibraryApplication } from '../../src/application/service.js';
import { MockYtmGateway } from '../../src/gateway/mock_gateway.js';
import { AdaptiveSyncController } from '../../src/sync/policy.js';
import { RemoteTrackItem } from '../../src/gateway/interfaces.js';
import { readCompletePlaylist } from '../../src/gateway/complete_playlist.js';

const connections: DatabaseConnection[] = [];
afterEach(() => connections.splice(0).forEach(c => c.close()));
function setup() {
  const connection = new DatabaseConnection(); connections.push(connection);
  const gateway = new MockYtmGateway();
  const app = new LibraryApplication(connection, gateway, true, new AdaptiveSyncController({ currentDelayMs: 0 }));
  return { app, gateway, connection };
}
const song = (i: number): RemoteTrackItem => ({ videoId: `v${i}`, title: `Song ${i}`, remoteItemId: `r${i}`, artistNames: ['Ado'], durationSeconds: 200 });

describe('Complete snapshot sync', () => {
  it.each([101, 501])('commits all %i occurrences and starts a fresh token-cache session', async size => {
    const { app, gateway, connection } = setup();
    gateway.observationCache.startSession('old'); gateway.observationCache.setTokens('old', { add: 'stale' });
    vi.spyOn(gateway, 'getPlaylists').mockResolvedValue([{ id: 'PL', title: 'Large', trackCount: size, isEditable: true }]);
    const fetch = vi.spyOn(gateway, 'getPlaylistItems').mockImplementation(async (_id, limit = 100, cursor) => {
      const start = Number(cursor ?? 0); const end = Math.min(start + limit, size);
      return { items: Array.from({ length: end - start }, (_, i) => song(start + i)), nextCursor: end < size ? String(end) : undefined, expectedItemCount: size };
    });
    await app.sync();
    expect(fetch).toHaveBeenCalledTimes(Math.ceil(size / 100));
    expect(app.playlists.getPlaylistItems('PL')).toHaveLength(size);
    expect(app.playlists.getPlaylistItems('PL').at(-1)?.position).toBe(size - 1);
    expect(gateway.observationCache.getTokens('old')).toBeUndefined();
    expect(connection.db.prepare("SELECT state FROM sync_checkpoints WHERE resource_type='PLAYLIST_ITEMS'").get()).toMatchObject({ state: 'COMMITTED' });
  });

  it('retains the prior snapshot on a late-page failure; a retry clears stale staging', async () => {
    const { app, gateway, connection } = setup();
    await app.sync();
    const original = app.playlists.getPlaylistItems('PL_JPOP').map(i => i.remoteItemId);
    vi.spyOn(gateway, 'getPlaylistItems').mockImplementation(async (id, _limit, cursor) => {
      if (id === 'LM') return { items: [] };
      if (cursor) throw new Error('Second page unavailable');
      return { items: [song(1)], nextCursor: 'second' };
    });
    await expect(app.sync()).rejects.toThrow('Second page');
    expect(app.playlists.getPlaylistItems('PL_JPOP').map(i => i.remoteItemId)).toEqual(original);
    expect(app.status().freshness.lastSyncResult).toBe('FAILED');
    expect(app.status().freshness.lastSuccessfulSyncAt).not.toBeNull();
    const failed = connection.db.prepare("SELECT id FROM sync_sessions WHERE status='FAILED'").get() as { id: string };
    const { SyncEngine } = await import('../../src/sync/sync_engine.js');
    const { SyncRepository } = await import('../../src/storage/repositories/sync_repository.js');
    const { SearchIndexManager } = await import('../../src/storage/fts.js');
    vi.mocked(gateway.getPlaylistItems).mockResolvedValue({ items: [song(2)] });
    const engine = new SyncEngine(gateway, new SyncRepository(connection.db), app.playlists, new SearchIndexManager(connection.db), new AdaptiveSyncController({ currentDelayMs: 0 }));
    await engine.syncAllPlaylists(failed.id);
    expect(app.playlists.getPlaylistItems('PL_JPOP').map(i => i.remoteItemId)).toEqual(['r2']);
  });

  it('keeps library membership separate from likes and preserves it during metadata upsert', async () => {
    const { app, gateway, connection } = setup();
    vi.spyOn(gateway, 'getLibrarySongs').mockResolvedValue([song(200)]);
    await app.sync();
    expect(app.browse('', 'LIBRARY', undefined, 500, 0).tracks.map(t => t.videoId)).toEqual(['v200']);
    expect(app.browse('', 'LIKED', undefined, 500, 0).tracks.map(t => t.videoId).sort()).toEqual(['v1_ado', 'v4_vaundy']);
    const { TrackRepository } = await import('../../src/storage/repositories/track_repository.js');
    const repo = new TrackRepository(connection.db);
    repo.upsert({ ...song(200), title: 'Updated metadata' });
    expect(repo.findByVideoId('v200')?.libraryState.inLibrary).toBe(true);
  });

  it.each(['repeated', 'missing', 'overlap'])('rejects %s pagination evidence', async mode => {
    const fetch = vi.fn().mockResolvedValueOnce({ items: [song(1)], nextCursor: 'next', expectedItemCount: 3 })
      .mockResolvedValue({ items: [song(mode === 'overlap' ? 1 : 2)], nextCursor: mode === 'repeated' ? 'next' : undefined, expectedItemCount: 3 });
    await expect(readCompletePlaylist(fetch)).rejects.toThrow();
  });
});
