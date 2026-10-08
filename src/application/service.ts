import { DatabaseConnection } from '../storage/connection.js';
import { PlaylistRepository } from '../storage/repositories/playlist_repository.js';
import { TrackRepository } from '../storage/repositories/track_repository.js';
import { FolderRepository } from '../storage/repositories/folder_repository.js';
import { SyncRepository } from '../storage/repositories/sync_repository.js';
import { SearchIndexManager } from '../storage/fts.js';
import { SyncEngine } from '../sync/sync_engine.js';
import { YtmPlaylistGateway } from '../gateway/interfaces.js';
import { AdaptiveSyncController } from '../sync/policy.js';
import { SearchQueryCompiler } from '../search/compiler.js';
import { ApplicationStatus, Collection, TrackRow } from './contracts.js';
import { SQLInputValue } from 'node:sqlite';

export class LibraryApplication {
  readonly playlists: PlaylistRepository;
  readonly folders: FolderRepository;
  private readonly tracks: TrackRepository;
  private readonly engine: SyncEngine;
  private syncing = false;

  constructor(readonly connection: DatabaseConnection, gateway: YtmPlaylistGateway,
    readonly connected = false, controller?: AdaptiveSyncController) {
    this.playlists = new PlaylistRepository(connection.db);
    this.tracks = new TrackRepository(connection.db);
    this.folders = new FolderRepository(connection.db);
    this.engine = new SyncEngine(gateway, new SyncRepository(connection.db), this.playlists,
      new SearchIndexManager(connection.db), controller);
  }

  status(): ApplicationStatus {
    const last = this.connection.db.prepare('SELECT status, started_at FROM sync_sessions ORDER BY started_at DESC, rowid DESC LIMIT 1').get() as
      { status: string; started_at: string } | undefined;
    const success = this.connection.db.prepare("SELECT completed_at FROM sync_sessions WHERE status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 1").get() as
      { completed_at: string } | undefined;
    return { connected: this.connected, syncing: this.syncing, readOnly: true, freshness: {
      lastSuccessfulSyncAt: success?.completed_at ?? null,
      lastSyncAttemptAt: last?.started_at ?? null,
      lastSyncResult: last?.status === 'COMPLETED' ? 'SUCCESS' : last?.status === 'FAILED' ? 'FAILED' : null,
      source: success ? 'REMOTE_SYNCED' : 'LOCAL_ONLY'
    } };
  }

  async sync(): Promise<void> {
    if (!this.connected) throw new Error('Configure YTM_AUTH_FILE before syncing');
    if (this.syncing) throw new Error('A sync is already running');
    this.syncing = true;
    try { await this.engine.syncAllPlaylists(); } finally { this.syncing = false; }
  }

  browse(query: string, collection: Collection, playlistId: string | undefined, limit: number, offset: number): { tracks: TrackRow[]; hasMore: boolean } {
    const plan = SearchQueryCompiler.compile(query, 2_147_483_647);
    const params = [...plan.params] as SQLInputValue[];
    const filters: string[] = [];
    if (collection === 'LIKED') filters.push("matched.rating = 'LIKE'");
    if (collection === 'LIBRARY') filters.push('matched.in_library = 1');
    const playlist = collection === 'PLAYLIST';
    if (playlist) {
      if (!playlistId || !this.playlists.getPlaylist(playlistId)) throw new Error('Playlist not found');
      filters.push('pi.playlist_id = ?'); params.push(playlistId);
    }
    params.push(limit + 1, offset);
    const rows = this.connection.db.prepare(`SELECT matched.id ${playlist ? ', pi.remote_item_id, pi.position' : ''}
      FROM (${plan.sql.replace(/;$/, '')}) matched
      ${playlist ? 'JOIN playlist_items pi ON pi.track_id = matched.id' : ''}
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ${playlist ? 'ORDER BY pi.position ASC' : ''} LIMIT ? OFFSET ?`).all(...params) as Array<{ id: number; remote_item_id?: string; position?: number }>;
    return { hasMore: rows.length > limit, tracks: rows.slice(0, limit).map(row => ({
      ...this.tracks.findById(row.id)!,
      selectionId: playlist ? `${playlistId}:${row.remote_item_id}` : `track:${row.id}`,
      remoteItemId: row.remote_item_id, position: row.position
    })) };
  }
}
