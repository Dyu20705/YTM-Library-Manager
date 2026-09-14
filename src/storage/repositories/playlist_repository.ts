import { DatabaseSync } from 'node:sqlite';
import * as crypto from 'node:crypto';
import { PlaylistAggregate, PlaylistItem, ObservedRemoteFingerprint } from '../../domain/playlist.js';
import { YtmTrack } from '../../domain/track.js';
import { TrackRepository } from './track_repository.js';

export interface SavePlaylistInput {
  id: string;
  title: string;
  description?: string | null;
  trackCount?: number;
  ownerName?: string | null;
  isEditable?: boolean;
}

export interface PlaylistItemWithTrack extends PlaylistItem {
  track: YtmTrack;
}

export class PlaylistRepository {
  private readonly trackRepo: TrackRepository;

  constructor(private readonly db: DatabaseSync) {
    this.trackRepo = new TrackRepository(db);
  }

  public upsertPlaylist(input: SavePlaylistInput): PlaylistAggregate {
    const isEditableInt = input.isEditable !== false ? 1 : 0;
    const stmt = this.db.prepare(`
      INSERT INTO playlists (
        id, title, description, track_count, owner_name, is_editable, local_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        track_count = excluded.track_count,
        owner_name = excluded.owner_name,
        is_editable = excluded.is_editable,
        local_updated_at = CURRENT_TIMESTAMP
      RETURNING local_updated_at, observed_fingerprint_hash, observed_fingerprint_at;
    `);

    const res = stmt.get(
      input.id,
      input.title,
      input.description ?? null,
      input.trackCount ?? 0,
      input.ownerName ?? null,
      isEditableInt
    ) as { local_updated_at: string; observed_fingerprint_hash: string | null; observed_fingerprint_at: string | null };

    return {
      id: input.id,
      title: input.title,
      description: input.description ?? null,
      trackCount: input.trackCount ?? 0,
      ownerName: input.ownerName ?? null,
      isEditable: isEditableInt === 1,
      observedFingerprintHash: res.observed_fingerprint_hash,
      observedFingerprintAt: res.observed_fingerprint_at ? new Date(res.observed_fingerprint_at) : null,
      localUpdatedAt: new Date(res.local_updated_at)
    };
  }

  public getPlaylist(id: string): PlaylistAggregate | null {
    const row = this.db.prepare(`
      SELECT id, title, description, track_count, owner_name, is_editable,
             observed_fingerprint_hash, observed_fingerprint_at, local_updated_at
      FROM playlists
      WHERE id = ?;
    `).get(id) as any;

    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      trackCount: row.track_count,
      ownerName: row.owner_name,
      isEditable: row.is_editable === 1,
      observedFingerprintHash: row.observed_fingerprint_hash,
      observedFingerprintAt: row.observed_fingerprint_at ? new Date(row.observed_fingerprint_at) : null,
      localUpdatedAt: new Date(row.local_updated_at)
    };
  }

  public listPlaylists(): PlaylistAggregate[] {
    const rows = this.db.prepare(`
      SELECT id, title, description, track_count, owner_name, is_editable,
             observed_fingerprint_hash, observed_fingerprint_at, local_updated_at
      FROM playlists
      ORDER BY title ASC;
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      trackCount: row.track_count,
      ownerName: row.owner_name,
      isEditable: row.is_editable === 1,
      observedFingerprintHash: row.observed_fingerprint_hash,
      observedFingerprintAt: row.observed_fingerprint_at ? new Date(row.observed_fingerprint_at) : null,
      localUpdatedAt: new Date(row.local_updated_at)
    }));
  }

  public getPlaylistItems(playlistId: string): PlaylistItemWithTrack[] {
    const rows = this.db.prepare(`
      SELECT pi.id, pi.playlist_id, pi.track_id, pi.remote_item_id, pi.position, pi.added_at
      FROM playlist_items pi
      WHERE pi.playlist_id = ?
      ORDER BY pi.position ASC;
    `).all(playlistId) as any[];

    return rows.map(row => {
      const track = this.trackRepo.findById(row.track_id);
      if (!track) {
        throw new Error(`Orphaned playlist_item references non-existent track_id: ${row.track_id}`);
      }
      return {
        id: row.id,
        playlistId: row.playlist_id,
        trackId: row.track_id,
        remoteItemId: row.remote_item_id,
        position: row.position,
        addedAt: row.added_at ? new Date(row.added_at) : null,
        track
      };
    });
  }

  /**
   * Replace all items in a playlist atomically and update the observed fingerprint (P0-C, P0-F).
   */
  public replaceItems(
    playlistId: string,
    items: Array<{ trackId: number; remoteItemId: string; position: number; addedAt?: Date | null; videoId: string }>
  ): ObservedRemoteFingerprint {
    // 1. Delete existing items
    this.db.prepare('DELETE FROM playlist_items WHERE playlist_id = ?;').run(playlistId);

    // 2. Insert new items
    const insertStmt = this.db.prepare(`
      INSERT INTO playlist_items (playlist_id, track_id, remote_item_id, position, added_at)
      VALUES (?, ?, ?, ?, ?);
    `);

    // Sort items by position to guarantee monotonic ordering
    const sorted = [...items].sort((a, b) => a.position - b.position);

    let concatString = '';
    for (const item of sorted) {
      insertStmt.run(
        playlistId,
        item.trackId,
        item.remoteItemId,
        item.position,
        item.addedAt ? item.addedAt.toISOString() : null
      );
      concatString += `${item.remoteItemId}:${item.videoId}:${item.position};`;
    }

    // 3. Compute observed fingerprint (SHA-256)
    const hash = crypto.createHash('sha256').update(concatString).digest('hex');
    const now = new Date();

    // 4. Update playlist metadata
    this.db.prepare(`
      UPDATE playlists
      SET track_count = ?,
          observed_fingerprint_hash = ?,
          observed_fingerprint_at = ?,
          local_updated_at = ?
      WHERE id = ?;
    `).run(sorted.length, hash, now.toISOString(), now.toISOString(), playlistId);

    return {
      playlistId,
      itemCount: sorted.length,
      orderedItemHash: hash,
      capturedAt: now
    };
  }

  /**
   * Find exact duplicates within a playlist (same videoId appearing > 1 time)
   */
  public findExactDuplicates(playlistId: string): Array<{
    videoId: string;
    occurrences: PlaylistItemWithTrack[];
  }> {
    const items = this.getPlaylistItems(playlistId);
    const groups = new Map<string, PlaylistItemWithTrack[]>();

    for (const item of items) {
      const vId = item.track.videoId;
      const list = groups.get(vId) ?? [];
      list.push(item);
      groups.set(vId, list);
    }

    const result: Array<{ videoId: string; occurrences: PlaylistItemWithTrack[] }> = [];
    for (const [videoId, occurrences] of groups.entries()) {
      if (occurrences.length > 1) {
        result.push({
          videoId,
          occurrences: occurrences.sort((a, b) => a.position - b.position)
        });
      }
    }
    return result;
  }
}
