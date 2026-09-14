import { DatabaseSync } from 'node:sqlite';
import * as crypto from 'node:crypto';
import { Folder } from '../../domain/folder.js';

export class FolderRepository {
  constructor(private readonly db: DatabaseSync) {}

  public createFolder(name: string, parentId?: string | null, position = 0): Folder {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO folders (id, parent_id, name, position)
      VALUES (?, ?, ?, ?);
    `).run(id, parentId ?? null, name, position);

    return {
      id,
      parentId: parentId ?? null,
      name,
      position
    };
  }

  public getFolder(id: string): Folder | null {
    const row = this.db.prepare(`
      SELECT id, parent_id, name, position
      FROM folders
      WHERE id = ?;
    `).get(id) as any;

    if (!row) return null;
    return {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      position: row.position
    };
  }

  public listFolders(): Folder[] {
    const rows = this.db.prepare(`
      SELECT id, parent_id, name, position
      FROM folders
      ORDER BY position ASC, name ASC;
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      parentId: r.parent_id,
      name: r.name,
      position: r.position
    }));
  }

  public deleteFolder(id: string): void {
    this.db.prepare('DELETE FROM folders WHERE id = ?;').run(id);
  }

  /**
   * Assign playlist to folder with strict 1:1 mapping (playlist_id is PK)
   */
  public assignPlaylistToFolder(playlistId: string, folderId: string): void {
    this.db.prepare(`
      INSERT INTO playlist_folders (playlist_id, folder_id)
      VALUES (?, ?)
      ON CONFLICT(playlist_id) DO UPDATE SET folder_id = excluded.folder_id;
    `).run(playlistId, folderId);
  }

  public removePlaylistFromFolder(playlistId: string): void {
    this.db.prepare('DELETE FROM playlist_folders WHERE playlist_id = ?;').run(playlistId);
  }

  public getFolderForPlaylist(playlistId: string): string | null {
    const row = this.db.prepare(`
      SELECT folder_id FROM playlist_folders WHERE playlist_id = ?;
    `).get(playlistId) as { folder_id: string } | undefined;

    return row?.folder_id ?? null;
  }

  public getPlaylistsInFolder(folderId: string): string[] {
    const rows = this.db.prepare(`
      SELECT playlist_id FROM playlist_folders WHERE folder_id = ?;
    `).all(folderId) as Array<{ playlist_id: string }>;

    return rows.map(r => r.playlist_id);
  }
}
