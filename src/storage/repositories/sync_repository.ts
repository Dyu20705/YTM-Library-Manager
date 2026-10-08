import { DatabaseSync } from 'node:sqlite';
import { SyncSession, SyncCheckpoint, StagingItem, StagingCompletionCheck } from '../../sync/types.js';
import { TrackRepository } from './track_repository.js';
import { PlaylistRepository } from './playlist_repository.js';
import { RemotePlaylistSummary, RemoteTrackItem } from '../../gateway/interfaces.js';

export class SyncRepository {
  private readonly trackRepo: TrackRepository;
  private readonly playlistRepo: PlaylistRepository;

  constructor(private readonly db: DatabaseSync) {
    this.trackRepo = new TrackRepository(db);
    this.playlistRepo = new PlaylistRepository(db);
  }

  // Session management
  public createSession(session: SyncSession): void {
    const stmt = this.db.prepare(`
      INSERT INTO sync_sessions (
        id, mode, status, total_playlists, completed_playlists, total_tracks_indexed, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?);
    `);
    stmt.run(
      session.sessionId,
      session.mode,
      session.status,
      session.totalPlaylists,
      session.completedPlaylists,
      session.totalTracksIndexed,
      session.startedAt.toISOString()
    );
  }

  public updateSession(session: SyncSession): void {
    const stmt = this.db.prepare(`
      UPDATE sync_sessions
      SET status = ?,
          total_playlists = ?,
          completed_playlists = ?,
          total_tracks_indexed = ?,
          completed_at = ?,
          error_message = ?
      WHERE id = ?;
    `);
    stmt.run(
      session.status,
      session.totalPlaylists,
      session.completedPlaylists,
      session.totalTracksIndexed,
      session.completedAt ? session.completedAt.toISOString() : null,
      session.errorMessage ?? null,
      session.sessionId
    );
  }

  public getSession(sessionId: string): SyncSession | null {
    const row = this.db.prepare('SELECT * FROM sync_sessions WHERE id = ?;').get(sessionId) as any;
    if (!row) return null;
    return {
      sessionId: row.id,
      mode: row.mode,
      status: row.status,
      totalPlaylists: row.total_playlists,
      completedPlaylists: row.completed_playlists,
      totalTracksIndexed: row.total_tracks_indexed,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      errorMessage: row.error_message
    };
  }

  // Checkpoint management
  public saveCheckpoint(cp: SyncCheckpoint): void {
    const stmt = this.db.prepare(`
      INSERT INTO sync_checkpoints (
        session_id, resource_type, resource_id, state, page_index,
        next_cursor, committed_through_cursor, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, resource_type, resource_id) DO UPDATE SET
        state = excluded.state,
        page_index = excluded.page_index,
        next_cursor = excluded.next_cursor,
        committed_through_cursor = excluded.committed_through_cursor,
        updated_at = excluded.updated_at;
    `);
    stmt.run(
      cp.sessionId,
      cp.resourceType,
      cp.resourceId,
      cp.state,
      cp.pageIndex,
      cp.cursorState?.nextCursor ?? null,
      cp.cursorState?.committedThroughCursor ?? null,
      cp.updatedAt.toISOString()
    );
  }

  public getCheckpoint(sessionId: string, resourceType: string, resourceId: string): SyncCheckpoint | null {
    const row = this.db.prepare(`
      SELECT * FROM sync_checkpoints
      WHERE session_id = ? AND resource_type = ? AND resource_id = ?;
    `).get(sessionId, resourceType, resourceId) as any;

    if (!row) return null;
    return {
      sessionId: row.session_id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      state: row.state,
      pageIndex: row.page_index,
      cursorState: {
        nextCursor: row.next_cursor ?? undefined,
        committedThroughCursor: row.committed_through_cursor ?? undefined
      },
      updatedAt: new Date(row.updated_at)
    };
  }

  // Staging operations (per-playlist)
  public stageItems(sessionId: string, playlistId: string, items: StagingItem[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO sync_staging (
        session_id, playlist_id, video_id, title, normalized_title,
        artist_names, album_name, duration_seconds, year,
        remote_item_id, position, added_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, playlist_id, remote_item_id) DO UPDATE SET
        position = excluded.position,
        title = excluded.title,
        normalized_title = excluded.normalized_title,
        artist_names = excluded.artist_names,
        album_name = excluded.album_name,
        duration_seconds = excluded.duration_seconds,
        year = excluded.year,
        added_at = excluded.added_at;
    `);

    for (const item of items) {
      stmt.run(
        sessionId,
        playlistId,
        item.videoId,
        item.title,
        item.normalizedTitle,
        JSON.stringify(item.artistNames),
        item.albumName ?? null,
        item.durationSeconds,
        item.year ?? null,
        item.remoteItemId,
        item.position,
        item.addedAt ? item.addedAt.toISOString() : null
      );
    }
  }

  public checkStagingCompletion(sessionId: string, playlistId: string, expectedItemCount: number): StagingCompletionCheck {
    const row = this.db.prepare(`
      SELECT COUNT(*) as c FROM sync_staging
      WHERE session_id = ? AND playlist_id = ?;
    `).get(sessionId, playlistId) as { c: number };

    const stagedItemCount = row.c;
    return {
      sessionId,
      playlistId,
      expectedItemCount,
      stagedItemCount,
      isComplete: stagedItemCount === expectedItemCount
    };
  }

  /**
   * Atomic promotion of staged playlist data into canonical tables + checkpoint in a SINGLE transaction (P0-C, P0-4, INV-010).
   * Validates staging completeness before replacing.
   */
  public commitStagedPlaylist(sessionId: string, playlistId: string, expectedItemCount: number): void {
    const check = this.checkStagingCompletion(sessionId, playlistId, expectedItemCount);
    if (!check.isComplete) {
      throw new Error(`Cannot commit incomplete staging for playlist ${playlistId}: staged ${check.stagedItemCount} vs expected ${check.expectedItemCount}`);
    }

    const stagedRows = this.db.prepare(`
      SELECT * FROM sync_staging
      WHERE session_id = ? AND playlist_id = ?
      ORDER BY position ASC;
    `).all(sessionId, playlistId) as any[];

    // Execute in a single atomic transaction
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const itemsToReplace: Array<{ trackId: number; remoteItemId: string; position: number; addedAt?: Date | null; videoId: string }> = [];

      for (const row of stagedRows) {
        const artistNames = JSON.parse(row.artist_names) as string[];
        const track = this.trackRepo.upsert({
          videoId: row.video_id,
          title: row.title,
          artistNames,
          albumName: row.album_name,
          durationSeconds: row.duration_seconds,
          year: row.year
        });

        itemsToReplace.push({
          trackId: track.id,
          remoteItemId: row.remote_item_id,
          position: row.position,
          addedAt: row.added_at ? new Date(row.added_at) : null,
          videoId: row.video_id
        });
      }

      // Replace items in playlist
      this.playlistRepo.replaceItems(playlistId, itemsToReplace);

      // Advance checkpoint to COMMITTED in same transaction (INV-010)
      const now = new Date();
      this.db.prepare(`
        UPDATE sync_checkpoints
        SET state = 'COMMITTED', updated_at = ?
        WHERE session_id = ? AND resource_id = ? AND resource_type = 'PLAYLIST_ITEMS';
      `).run(now.toISOString(), sessionId, playlistId);

      // Clean up staging for this playlist
      this.db.prepare('DELETE FROM sync_staging WHERE session_id = ? AND playlist_id = ?;').run(sessionId, playlistId);

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  public clearStaging(sessionId: string): void {
    this.db.prepare('DELETE FROM sync_staging WHERE session_id = ?;').run(sessionId);
  }

  public clearPlaylistStaging(sessionId: string, playlistId: string): void {
    this.db.prepare('DELETE FROM sync_staging WHERE session_id = ? AND playlist_id = ?').run(sessionId, playlistId);
  }

  public getSessionPlaylistIds(sessionId: string): string[] {
    return (this.db.prepare("SELECT resource_id FROM sync_checkpoints WHERE session_id = ? AND resource_type = 'PLAYLIST_LIST' AND resource_id != '__catalog__' ORDER BY resource_id")
      .all(sessionId) as Array<{ resource_id: string }>).map(r => r.resource_id);
  }

  public getCommittedProgress(sessionId: string): { playlists: number; tracks: number } {
    return this.db.prepare(`SELECT COUNT(*) AS playlists,
      COALESCE(SUM((SELECT COUNT(*) FROM playlist_items pi WHERE pi.playlist_id = cp.resource_id)), 0) AS tracks
      FROM sync_checkpoints cp WHERE session_id = ? AND resource_type = 'PLAYLIST_ITEMS' AND state = 'COMMITTED'`)
      .get(sessionId) as { playlists: number; tracks: number };
  }

  public hasPlaylistList(sessionId: string): boolean {
    return this.getCheckpoint(sessionId, 'PLAYLIST_LIST', '__catalog__')?.state === 'COMMITTED';
  }

  public registerPlaylists(sessionId: string, playlists: RemotePlaylistSummary[]): void {
    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const playlist of playlists) {
        const previous = this.playlistRepo.getPlaylist(playlist.id);
        this.playlistRepo.upsertPlaylist({ ...playlist, trackCount: previous?.trackCount ?? playlist.trackCount });
        this.saveCheckpoint({ sessionId, resourceType: 'PLAYLIST_LIST', resourceId: playlist.id,
          state: 'COMMITTED', pageIndex: 0, updatedAt: new Date() });
      }
      this.saveCheckpoint({ sessionId, resourceType: 'PLAYLIST_LIST', resourceId: '__catalog__',
        state: 'COMMITTED', pageIndex: 0, updatedAt: new Date() });
      this.db.exec('COMMIT');
    } catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }

  public commitLibrary(songs: RemoteTrackItem[], likedVideoIds: string[]): void {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.exec("UPDATE tracks SET in_library = 0, rating = CASE WHEN rating = 'LIKE' THEN 'INDIFFERENT' ELSE rating END");
      for (const song of songs) {
        if (!song.videoId || typeof song.title !== 'string') throw new Error('Incomplete library song');
        this.trackRepo.upsert({ ...song, inLibrary: true });
      }
      for (const videoId of likedVideoIds) this.trackRepo.setRating(videoId, 'LIKE');
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
