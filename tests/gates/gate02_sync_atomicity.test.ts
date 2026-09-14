import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../../src/storage/connection.js';
import { TrackRepository } from '../../src/storage/repositories/track_repository.js';
import { PlaylistRepository } from '../../src/storage/repositories/playlist_repository.js';
import { SyncRepository } from '../../src/storage/repositories/sync_repository.js';
import { SearchIndexManager } from '../../src/storage/fts.js';
import { SyncEngine } from '../../src/sync/sync_engine.js';
import { MockYtmGateway } from '../../src/gateway/mock_gateway.js';

describe('GATE-02: Sync Atomicity, Crash Resilience & FTS Consistency', () => {
  let dbConn: DatabaseConnection;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;
  let syncRepo: SyncRepository;
  let ftsManager: SearchIndexManager;
  let gateway: MockYtmGateway;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    dbConn = new DatabaseConnection({ path: ':memory:' });
    trackRepo = new TrackRepository(dbConn.db);
    playlistRepo = new PlaylistRepository(dbConn.db);
    syncRepo = new SyncRepository(dbConn.db);
    ftsManager = new SearchIndexManager(dbConn.db);
    gateway = new MockYtmGateway();
    syncEngine = new SyncEngine(gateway, syncRepo, playlistRepo, ftsManager);
  });

  afterEach(() => {
    dbConn.close();
  });

  it('performs full sync and creates atomic checkpoint with consistent data (INV-010)', async () => {
    const session = await syncEngine.syncAllPlaylists();
    expect(session.status).toBe('COMPLETED');
    expect(session.completedPlaylists).toBe(2); // J-Pop and LM

    // Verify J-Pop items committed
    const items = playlistRepo.getPlaylistItems('PL_JPOP');
    expect(items.length).toBe(3);

    // Verify checkpoint is COMMITTED
    const cp = syncRepo.getCheckpoint(session.sessionId, 'PLAYLIST_ITEMS', 'PL_JPOP');
    expect(cp?.state).toBe('COMMITTED');

    // Verify staging is cleaned up after commit
    const check = syncRepo.checkStagingCompletion(session.sessionId, 'PL_JPOP', 0);
    expect(check.stagedItemCount).toBe(0);
  });

  it('prevents partial playlist replacement if staging is incomplete (P0-4)', async () => {
    playlistRepo.upsertPlaylist({ id: 'PL_INCOMPLETE', title: 'Incomplete PL' });
    const sessionId = 'session_inc';

    syncRepo.createSession({
      sessionId,
      mode: 'SINGLE_PLAYLIST',
      status: 'IN_PROGRESS',
      totalPlaylists: 1,
      completedPlaylists: 0,
      totalTracksIndexed: 0,
      startedAt: new Date()
    });

    // Stage 1 item but tell commit that expected count is 2
    syncRepo.stageItems(sessionId, 'PL_INCOMPLETE', [{
      videoId: 'v1',
      title: 'T1',
      normalizedTitle: 't1',
      artistNames: ['A'],
      durationSeconds: 100,
      remoteItemId: 'r1',
      position: 0
    }]);

    expect(() => {
      syncRepo.commitStagedPlaylist(sessionId, 'PL_INCOMPLETE', 2);
    }).toThrow('Cannot commit incomplete staging');

    // Canonical items table must remain untouched (no partial replacement)
    const items = playlistRepo.getPlaylistItems('PL_INCOMPLETE');
    expect(items.length).toBe(0);
  });

  it('resumes interrupted sync without duplicating records (INV-011)', async () => {
    const session1 = await syncEngine.syncAllPlaylists();
    const countBefore = playlistRepo.getPlaylistItems('PL_JPOP').length;

    // Run sync again with same session
    const session2 = await syncEngine.syncAllPlaylists(session1.sessionId);
    const countAfter = playlistRepo.getPlaylistItems('PL_JPOP').length;

    expect(countAfter).toBe(countBefore);
    expect(session2.status).toBe('COMPLETED');
  });

  it('FTS5 Consistency Matrix: INSERT, UPDATE, UPSERT, DELETE, and REBUILD (Review §7)', () => {
    // 1. INSERT track -> FTS row created
    const t1 = trackRepo.upsert({ videoId: 'v_fts_1', title: 'First Song', artistNames: ['Ado'], durationSeconds: 200 });
    let res = ftsManager.search('First');
    expect(res.length).toBe(1);
    expect(ftsManager.getStatus()).toBe('HEALTHY');

    // 2. UPDATE track title -> FTS row updated
    trackRepo.upsert({ videoId: 'v_fts_1', title: 'Renamed Song', artistNames: ['Ado'], durationSeconds: 200 });
    res = ftsManager.search('Renamed');
    expect(res.length).toBe(1);
    expect(ftsManager.search('First').length).toBe(0);
    expect(ftsManager.getStatus()).toBe('HEALTHY');

    // 3. UPSERT existing track with new artists -> FTS row consistent
    trackRepo.upsert({ videoId: 'v_fts_1', title: 'Renamed Song', artistNames: ['Ado', 'Eve'], durationSeconds: 200 });
    expect(ftsManager.getStatus()).toBe('HEALTHY');

    // 4. DELETE track -> FTS row removed
    dbConn.db.prepare('DELETE FROM tracks WHERE id = ?;').run(t1.id);
    res = ftsManager.search('Renamed');
    expect(res.length).toBe(0);
    expect(ftsManager.getStatus()).toBe('HEALTHY');

    // 5. Manual REBUILD -> FTS fully reconstructed
    trackRepo.upsert({ videoId: 'v_fts_2', title: 'Another Track', artistNames: ['YOASOBI'], durationSeconds: 150 });
    ftsManager.rebuildIndex();
    expect(ftsManager.getStatus()).toBe('HEALTHY');
    expect(ftsManager.search('Another').length).toBe(1);
  });
});
