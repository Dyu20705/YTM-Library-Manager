import { DatabaseSync } from 'node:sqlite';
import { YtmTrack } from '../../domain/track.js';
import { RatingState } from '../../domain/types.js';

export function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

export interface SaveTrackInput {
  videoId: string;
  title: string;
  artistNames: string[];
  albumName?: string | null;
  durationSeconds: number;
  year?: number | null;
  inLibrary?: boolean;
  rating?: RatingState;
  isAvailable?: boolean;
}

export class TrackRepository {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Save or update a track using UPSERT to preserve the autoincrement ID (INV-001, INV-002).
   * Normalizes artists into artists and track_artists tables (P1-1).
   */
  public upsert(input: SaveTrackInput): YtmTrack {
    const normalizedTitle = normalizeText(input.title);
    const artistNamesFts = input.artistNames.join(' ');
    const inLibraryInt = input.inLibrary ? 1 : 0;
    const rating = input.rating ?? 'INDIFFERENT';
    const isAvailableInt = input.isAvailable !== false ? 1 : 0;

    // 1. Upsert track record
    const upsertStmt = this.db.prepare(`
      INSERT INTO tracks (
        video_id, title, normalized_title, album_name,
        duration_seconds, year, in_library, rating, is_available,
        artist_names_fts, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(video_id) DO UPDATE SET
        title = excluded.title,
        normalized_title = excluded.normalized_title,
        album_name = excluded.album_name,
        duration_seconds = excluded.duration_seconds,
        year = excluded.year,
        in_library = COALESCE(?, tracks.in_library),
        rating = COALESCE(?, tracks.rating),
        is_available = excluded.is_available,
        artist_names_fts = excluded.artist_names_fts,
        last_seen_at = CURRENT_TIMESTAMP
      RETURNING id, first_seen_at, last_seen_at;
    `);

    const trackRow = upsertStmt.get(
      input.videoId,
      input.title,
      normalizedTitle,
      input.albumName ?? null,
      input.durationSeconds,
      input.year ?? null,
      inLibraryInt,
      rating,
      isAvailableInt,
      artistNamesFts,
      input.inLibrary === undefined ? null : inLibraryInt,
      input.rating ?? null
    ) as { id: number; first_seen_at: string; last_seen_at: string };

    const trackId = trackRow.id;

    // 2. Clear old track_artists relations for this track to refresh
    this.db.prepare('DELETE FROM track_artists WHERE track_id = ?;').run(trackId);

    // 3. Normalize and insert artists
    const findArtistStmt = this.db.prepare('SELECT id, name, normalized_name FROM artists WHERE normalized_name = ?;');
    const insertArtistStmt = this.db.prepare(`
      INSERT INTO artists (name, normalized_name) VALUES (?, ?)
      ON CONFLICT(normalized_name) DO UPDATE SET name = excluded.name
      RETURNING id;
    `);
    const linkArtistStmt = this.db.prepare('INSERT OR IGNORE INTO track_artists (track_id, artist_id, position) VALUES (?, ?, ?);');

    for (let pos = 0; pos < input.artistNames.length; pos++) {
      const name = input.artistNames[pos] ?? '';
      const normalizedName = normalizeText(name);
      if (!normalizedName) continue;

      let artistId: number;
      const existing = findArtistStmt.get(normalizedName) as { id: number } | undefined;
      if (existing) {
        artistId = existing.id;
      } else {
        const inserted = insertArtistStmt.get(name, normalizedName) as { id: number };
        artistId = inserted.id;
      }

      linkArtistStmt.run(trackId, artistId, pos);
    }

    return this.findById(trackId)!;
  }

  public findByVideoId(videoId: string): YtmTrack | null {
    const row = this.db.prepare(`
      SELECT id, video_id, title, normalized_title, album_name,
             duration_seconds, year, in_library, rating, is_available,
             first_seen_at, last_seen_at
      FROM tracks
      WHERE video_id = ?;
    `).get(videoId) as any;

    if (!row) return null;
    return this.hydrateTrack(row);
  }

  public findById(id: number): YtmTrack | null {
    const row = this.db.prepare(`
      SELECT id, video_id, title, normalized_title, album_name,
             duration_seconds, year, in_library, rating, is_available,
             first_seen_at, last_seen_at
      FROM tracks
      WHERE id = ?;
    `).get(id) as any;

    if (!row) return null;
    return this.hydrateTrack(row);
  }

  public setRating(videoId: string, rating: RatingState): void {
    this.db.prepare('UPDATE tracks SET rating = ?, last_seen_at = CURRENT_TIMESTAMP WHERE video_id = ?;').run(rating, videoId);
  }

  public setInLibrary(videoId: string, inLibrary: boolean): void {
    this.db.prepare('UPDATE tracks SET in_library = ?, last_seen_at = CURRENT_TIMESTAMP WHERE video_id = ?;').run(inLibrary ? 1 : 0, videoId);
  }

  private hydrateTrack(row: any): YtmTrack {
    const artistsRows = this.db.prepare(`
      SELECT a.id, a.name
      FROM track_artists ta
      JOIN artists a ON a.id = ta.artist_id
      WHERE ta.track_id = ?
      ORDER BY ta.position ASC;
    `).all(row.id) as Array<{ id: number; name: string }>;

    return {
      id: row.id,
      videoId: row.video_id,
      title: row.title,
      normalizedTitle: row.normalized_title,
      artists: artistsRows,
      albumName: row.album_name,
      durationSeconds: row.duration_seconds,
      year: row.year,
      isAvailable: row.is_available === 1,
      libraryState: {
        inLibrary: row.in_library === 1,
        rating: row.rating as RatingState,
        updatedAt: new Date(row.last_seen_at)
      },
      firstSeenAt: new Date(row.first_seen_at),
      lastSeenAt: new Date(row.last_seen_at)
    };
  }

  public getLikedTracks(): YtmTrack[] {
    const rows = this.db.prepare(`
      SELECT id, video_id, title, normalized_title, album_name,
             duration_seconds, year, in_library, rating, is_available,
             first_seen_at, last_seen_at
      FROM tracks
      WHERE rating = 'LIKE'
      ORDER BY last_seen_at DESC;
    `).all() as any[];

    return rows.map(r => this.hydrateTrack(r));
  }

  public getLibraryTracks(): YtmTrack[] {
    const rows = this.db.prepare(`
      SELECT id, video_id, title, normalized_title, album_name,
             duration_seconds, year, in_library, rating, is_available,
             first_seen_at, last_seen_at
      FROM tracks
      WHERE in_library = 1
      ORDER BY last_seen_at DESC;
    `).all() as any[];

    return rows.map(r => this.hydrateTrack(r));
  }
}
