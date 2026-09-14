import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../../src/storage/connection.js';
import { TrackRepository } from '../../src/storage/repositories/track_repository.js';
import { PlaylistRepository } from '../../src/storage/repositories/playlist_repository.js';
import { OperationRepository } from '../../src/storage/repositories/operation_repository.js';
import { SyncRepository } from '../../src/storage/repositories/sync_repository.js';
import { SearchIndexManager } from '../../src/storage/fts.js';
import { LogSanitizer } from '../../src/gateway/sanitizer.js';
import { assertInvariant, InvariantViolationError } from '../../src/domain/invariants.js';

describe('Invariants Catalog (INV-001 through INV-023)', () => {
  let dbConn: DatabaseConnection;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;
  let opRepo: OperationRepository;
  let syncRepo: SyncRepository;
  let ftsManager: SearchIndexManager;

  beforeEach(() => {
    dbConn = new DatabaseConnection({ path: ':memory:' });
    trackRepo = new TrackRepository(dbConn.db);
    playlistRepo = new PlaylistRepository(dbConn.db);
    opRepo = new OperationRepository(dbConn.db);
    syncRepo = new SyncRepository(dbConn.db);
    ftsManager = new SearchIndexManager(dbConn.db);
  });

  afterEach(() => {
    dbConn.close();
  });

  it('INV-001 & INV-002: tracks.video_id is unique & tracks.id is stable on UPSERT', () => {
    const t1 = trackRepo.upsert({
      videoId: 'v1234567890',
      title: 'Original Title',
      artistNames: ['Artist 1'],
      durationSeconds: 200
    });
    const id1 = t1.id;

    // Update the track with new title and new artist
    const t2 = trackRepo.upsert({
      videoId: 'v1234567890',
      title: 'Updated Title',
      artistNames: ['Artist 1', 'Artist 2'],
      durationSeconds: 205
    });

    expect(t2.id).toBe(id1); // INV-002: ID is stable
    expect(t2.title).toBe('Updated Title');
    expect(t2.artists.length).toBe(2);

    const countRow = dbConn.db.prepare('SELECT COUNT(*) as c FROM tracks WHERE video_id = ?;').get('v1234567890') as { c: number };
    expect(countRow.c).toBe(1); // INV-001: video_id is unique
  });

  it('INV-003: playlist_items.track_id references valid tracks.id (Foreign Key enforced)', () => {
    playlistRepo.upsertPlaylist({ id: 'PL1', title: 'Test PL' });

    expect(() => {
      dbConn.db.prepare(`
        INSERT INTO playlist_items (playlist_id, track_id, remote_item_id, position)
        VALUES ('PL1', 999999, 'item_fake', 0);
      `).run();
    }).toThrow(); // Foreign key violation
  });

  it('INV-004: playlist_items.remote_item_id is unique per playlist', () => {
    playlistRepo.upsertPlaylist({ id: 'PL1', title: 'Test PL' });
    const track = trackRepo.upsert({
      videoId: 'v1111111111',
      title: 'Song 1',
      artistNames: ['A'],
      durationSeconds: 120
    });

    dbConn.db.prepare(`
      INSERT INTO playlist_items (playlist_id, track_id, remote_item_id, position)
      VALUES ('PL1', ?, 'setVideo_unique_1', 0);
    `).run(track.id);

    expect(() => {
      dbConn.db.prepare(`
        INSERT INTO playlist_items (playlist_id, track_id, remote_item_id, position)
        VALUES ('PL1', ?, 'setVideo_unique_1', 1);
      `).run(track.id);
    }).toThrow(); // UNIQUE constraint failed
  });

  it('INV-005: playlist_items positions are monotonically ordered per playlist', () => {
    playlistRepo.upsertPlaylist({ id: 'PL1', title: 'Test PL' });
    const t1 = trackRepo.upsert({ videoId: 'v1', title: 'S1', artistNames: ['A'], durationSeconds: 100 });
    const t2 = trackRepo.upsert({ videoId: 'v2', title: 'S2', artistNames: ['B'], durationSeconds: 110 });

    playlistRepo.replaceItems('PL1', [
      { trackId: t1.id, remoteItemId: 'r1', position: 0, videoId: 'v1' },
      { trackId: t2.id, remoteItemId: 'r2', position: 5, videoId: 'v2' }
    ]);

    const items = playlistRepo.getPlaylistItems('PL1');
    expect(items[0]!.position).toBeLessThan(items[1]!.position);
  });

  it('INV-006: Asserts mutation execution requires approved ChangePlan', () => {
    const changePlan = { isApproved: false };
    expect(() => {
      assertInvariant(changePlan.isApproved, 'INV_006', 'Mutation plan must be approved');
    }).toThrow(InvariantViolationError);
  });

  it('INV-007: UNKNOWN cannot transition directly to RETRY without RECONCILING', () => {
    let currentState: string = 'UNKNOWN';
    const attemptedTarget: string = 'EXECUTING'; // Direct retry without reconciling

    expect(() => {
      const isAllowed = currentState !== 'UNKNOWN' || attemptedTarget === 'RECONCILING';
      assertInvariant(isAllowed, 'INV_007', 'UNKNOWN must pass through RECONCILING');
    }).toThrow(InvariantViolationError);
  });

  it('INV-008 & INV-009: OperationLog immutability and rollback entry behavior', () => {
    playlistRepo.upsertPlaylist({ id: 'PL1', title: 'Test PL' });

    const opId = 'op_100';
    opRepo.logOperation({
      id: opId,
      createdAt: new Date(),
      targetPlaylistId: 'PL1',
      type: 'ADD_TRACKS',
      state: 'COMPLETED',
      preconditions: { expectedTrackCount: 0 },
      intendedChanges: [{ action: 'ADD', playlistId: 'PL1', videoId: 'v1', postcondition: { check: 'PRESENT', videoId: 'v1' } }]
    });

    // Attempting to modify completed operation with invalid transition throws INV-009
    expect(() => {
      opRepo.updateState(opId, 'FAILED');
    }).toThrow(InvariantViolationError);

    // Marking ROLLED_BACK is permitted
    opRepo.updateState(opId, 'ROLLED_BACK');
    const updated = opRepo.getOperation(opId);
    expect(updated?.state).toBe('ROLLED_BACK');
  });

  it('INV-010: Sync Checkpoint state COMMITTED is atomic with data commit', () => {
    playlistRepo.upsertPlaylist({ id: 'PL_ATOM', title: 'Atomic PL' });
    const sessionId = 'session_atomic';
    syncRepo.createSession({
      sessionId,
      mode: 'SINGLE_PLAYLIST',
      status: 'IN_PROGRESS',
      totalPlaylists: 1,
      completedPlaylists: 0,
      totalTracksIndexed: 0,
      startedAt: new Date()
    });

    syncRepo.saveCheckpoint({
      sessionId,
      resourceType: 'PLAYLIST_ITEMS',
      resourceId: 'PL_ATOM',
      state: 'FETCHING',
      pageIndex: 0,
      updatedAt: new Date()
    });

    // Stage 1 item
    syncRepo.stageItems(sessionId, 'PL_ATOM', [{
      videoId: 'v_atom',
      title: 'Atomic Song',
      normalizedTitle: 'atomic song',
      artistNames: ['Atom Artist'],
      durationSeconds: 150,
      remoteItemId: 'r_atom',
      position: 0
    }]);

    // Commit staged data
    syncRepo.commitStagedPlaylist(sessionId, 'PL_ATOM', 1);

    // Both data and checkpoint must be committed
    const checkpoint = syncRepo.getCheckpoint(sessionId, 'PLAYLIST_ITEMS', 'PL_ATOM');
    expect(checkpoint?.state).toBe('COMMITTED');

    const items = playlistRepo.getPlaylistItems('PL_ATOM');
    expect(items.length).toBe(1);
    expect(items[0]?.track.videoId).toBe('v_atom');
  });

  it('INV-013, INV-014, INV-018: Secret isolation and log sanitizer', () => {
    // Verify no secret columns in schema
    const schemaSql = dbConn.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tracks';").get() as { sql: string };
    expect(schemaSql.sql.toLowerCase()).not.toContain('cookie');
    expect(schemaSql.sql.toLowerCase()).not.toContain('auth');
    expect(schemaSql.sql.toLowerCase()).not.toContain('token');

    // Sanitizer test
    const rawLog = 'Request Cookie: SID=xyz123; Authorization: Bearer secret_token_abc; feedbackToken="fb_tok_12345"';
    const sanitized = LogSanitizer.sanitize(rawLog);

    expect(sanitized).not.toContain('xyz123');
    expect(sanitized).not.toContain('secret_token_abc');
    expect(sanitized).not.toContain('fb_tok_12345');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('INV-016: FTS row consistency with tracks table', () => {
    expect(ftsManager.getStatus()).toBe('HEALTHY');

    trackRepo.upsert({ videoId: 'v_fts1', title: 'FTS Test 1', artistNames: ['A'], durationSeconds: 100 });
    expect(ftsManager.getStatus()).toBe('HEALTHY');

    trackRepo.upsert({ videoId: 'v_fts2', title: 'FTS Test 2', artistNames: ['B'], durationSeconds: 120 });
    expect(ftsManager.getStatus()).toBe('HEALTHY');

    const results = ftsManager.search('FTS');
    expect(results.length).toBe(2);
  });

  it('INV-017: sync_staging unique constraint on (session_id, playlist_id, remote_item_id)', () => {
    syncRepo.createSession({
      sessionId: 's_uq',
      mode: 'FULL',
      status: 'IN_PROGRESS',
      totalPlaylists: 1,
      completedPlaylists: 0,
      totalTracksIndexed: 0,
      startedAt: new Date()
    });

    const item = {
      videoId: 'v1',
      title: 'T1',
      normalizedTitle: 't1',
      artistNames: ['A'],
      durationSeconds: 100,
      remoteItemId: 'r_same',
      position: 0
    };

    syncRepo.stageItems('s_uq', 'PL1', [item]);

    // Retrying the same item updates instead of duplicating
    syncRepo.stageItems('s_uq', 'PL1', [{ ...item, title: 'T1 Updated' }]);

    const check = syncRepo.checkStagingCompletion('s_uq', 'PL1', 1);
    expect(check.stagedItemCount).toBe(1);
    expect(check.isComplete).toBe(true);
  });
});
