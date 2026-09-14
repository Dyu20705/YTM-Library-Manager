import { DatabaseSync } from 'node:sqlite';

export type SearchIndexStatus = 'HEALTHY' | 'DEGRADED';

export class SearchIndexManager {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Rebuild the entire FTS5 search index using the SQLite FTS5 rebuild command:
   * INSERT INTO tracks_fts(tracks_fts) VALUES('rebuild');
   */
  public rebuildIndex(): void {
    this.db.exec("INSERT INTO tracks_fts(tracks_fts) VALUES('rebuild');");
  }

  /**
   * Check FTS index consistency with the tracks table (INV-016).
   */
  public getStatus(): SearchIndexStatus {
    try {
      const tracksCountRow = this.db.prepare('SELECT COUNT(*) as c FROM tracks;').get() as { c: number };
      const ftsCountRow = this.db.prepare('SELECT COUNT(*) as c FROM tracks_fts;').get() as { c: number };

      if (tracksCountRow.c === ftsCountRow.c) {
        return 'HEALTHY';
      }
      return 'DEGRADED';
    } catch {
      return 'DEGRADED';
    }
  }

  /**
   * Search query over FTS5 table
   */
  public search(term: string, limit = 100): Array<{ id: number; title: string; albumName: string | null }> {
    // Sanitized match query
    const cleanTerm = term.replace(/['"*]/g, '');
    if (!cleanTerm.trim()) {
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT rowid as id, title, album_name as albumName
        FROM tracks_fts
        WHERE tracks_fts MATCH ?
        LIMIT ?;
      `);
      return stmt.all(`${cleanTerm}*`, limit) as Array<{ id: number; title: string; albumName: string | null }>;
    } catch {
      return [];
    }
  }
}
