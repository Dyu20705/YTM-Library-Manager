import * as crypto from 'node:crypto';
import { SyncRepository } from '../storage/repositories/sync_repository.js';
import { PlaylistRepository } from '../storage/repositories/playlist_repository.js';
import { SearchIndexManager } from '../storage/fts.js';
import { YtmPlaylistGateway } from '../gateway/interfaces.js';
import { SyncSession, StagingItem, SyncCheckpoint } from './types.js';
import { AdaptiveSyncController } from './policy.js';
import { DataFreshness } from '../domain/types.js';
import { LogSanitizer } from '../gateway/sanitizer.js';
import { readCompletePlaylist } from '../gateway/complete_playlist.js';
import { assertInvariant } from '../domain/invariants.js';

export class SyncEngine {
  private syncController: AdaptiveSyncController;
  private freshness: DataFreshness = {
    lastSuccessfulSyncAt: null,
    lastSyncAttemptAt: null,
    lastSyncResult: null,
    source: 'LOCAL_ONLY'
  };

  constructor(
    private readonly gateway: YtmPlaylistGateway,
    private readonly syncRepo: SyncRepository,
    _playlistRepo: PlaylistRepository,
    private readonly ftsManager: SearchIndexManager,
    controller?: AdaptiveSyncController
  ) {
    this.syncController = controller ?? new AdaptiveSyncController();
  }

  public getDataFreshness(): DataFreshness {
    return { ...this.freshness };
  }

  /**
   * Run a full sync of all playlists and catalog metadata.
   */
  public async syncAllPlaylists(existingSessionId?: string): Promise<SyncSession> {
    this.freshness.lastSyncAttemptAt = new Date();

    const sessionId = existingSessionId ?? crypto.randomUUID();
    let session = this.syncRepo.getSession(sessionId);

    this.gateway.startSession?.(sessionId);
    try {
      if (!session) {
        session = { sessionId, mode: 'FULL', status: 'IN_PROGRESS', totalPlaylists: 0,
          completedPlaylists: 0, totalTracksIndexed: 0, startedAt: new Date() };
        this.syncRepo.createSession(session);
      }
      session.status = 'IN_PROGRESS';
      session.completedAt = undefined;
      session.errorMessage = undefined;
      this.syncRepo.updateSession(session);
      if (!this.syncRepo.hasPlaylistList(sessionId)) {
        const remotePlaylists = await this.gateway.getPlaylists();
        this.syncRepo.registerPlaylists(sessionId, remotePlaylists);
        session.totalPlaylists = remotePlaylists.length;
        this.syncRepo.updateSession(session);
      }
      const playlistIds = this.syncRepo.getSessionPlaylistIds(sessionId);
      session.totalPlaylists = playlistIds.length;
      for (const playlistId of playlistIds) {
        const checkpoint = this.syncRepo.getCheckpoint(sessionId, 'PLAYLIST_ITEMS', playlistId);
        if (checkpoint?.state !== 'COMMITTED') await this.syncPlaylist(playlistId, sessionId);
        // Derive progress from committed checkpoints to survive a crash between commit and counter update.
        const progress = this.syncRepo.getCommittedProgress(sessionId);
        session.completedPlaylists = progress.playlists;
        session.totalTracksIndexed = progress.tracks;
        this.syncRepo.updateSession(session);
      }
      const library = await this.gateway.getLibrarySnapshot?.();
      if (!library || library.completeness !== 'VERIFIED' || library.expectedItemCount === undefined ||
        library.expectedItemCount !== library.items.length) throw new Error('Unverified library completeness; prior membership retained');
      // Read likes independently, even when a catalog adapter omitted LM. Do not treat omission as empty.
      let likesCount: number | undefined;
      const likes = await readCompletePlaylist(cursor => this.gateway.getPlaylistItems('LM', 100, cursor), page => {
        if (page.expectedItemCount !== undefined) likesCount = page.expectedItemCount;
      });
      if (likesCount === undefined) throw new Error('Unverified likes completeness; prior membership retained');
      this.syncRepo.commitLibrary(library.items, likes.map(item => item.videoId),
        { libraryCount: library.expectedItemCount, likesCount });
      this.ftsManager.rebuildIndex();
      assertInvariant(this.ftsManager.getStatus() === 'HEALTHY', 'INV_016', 'FTS index must be consistent after full sync');
      session.status = 'COMPLETED';
      session.completedAt = new Date();
      this.syncRepo.updateSession(session);
      this.freshness.lastSuccessfulSyncAt = session.completedAt;
      this.freshness.lastSyncResult = 'SUCCESS';
      this.freshness.source = 'REMOTE_SYNCED';
      return session;
    } catch (err) {
      this.freshness.lastSyncResult = 'FAILED';
      if (session) {
        session.status = 'FAILED';
        session.errorMessage = LogSanitizer.sanitize(err instanceof Error ? err.message : 'Sync failed');
        this.syncRepo.updateSession(session);
      }
      throw err;
    }
  }

  /**
   * Sync a single playlist through staging and atomic promotion.
   */
  public async syncPlaylist(playlistId: string, sessionId: string): Promise<void> {
    const checkpoint: SyncCheckpoint = {
      sessionId,
      resourceType: 'PLAYLIST_ITEMS',
      resourceId: playlistId,
      state: 'FETCHING',
      pageIndex: 0,
      updatedAt: new Date()
    };
    this.syncRepo.saveCheckpoint(checkpoint);

    try {
      // Restart an incomplete playlist from page one. Old staging must not survive a changed snapshot.
      this.syncRepo.clearPlaylistStaging(sessionId, playlistId);
      let expectedItemCount: number | undefined;
      const items = await readCompletePlaylist(async cursor => {
        await this.syncController.waitDelay();
        return this.gateway.getPlaylistItems(playlistId, 100, cursor);
      }, (page, offset, pageIndex) => {
        if (page.expectedItemCount !== undefined) expectedItemCount = page.expectedItemCount;
        const stagingItems: StagingItem[] = page.items.map((item, idx) => {
          if (playlistId !== 'LM' && !item.remoteItemId) throw new Error('Missing playlist occurrence identity');
          return {
            videoId: item.videoId, title: item.title, normalizedTitle: item.title.toLowerCase().trim(),
            artistNames: item.artistNames, albumName: item.albumName ?? null,
            durationSeconds: item.durationSeconds, year: item.year ?? null,
            remoteItemId: item.remoteItemId ?? `virtual_${item.videoId}_${offset + idx}`,
            position: offset + idx, addedAt: new Date()
          };
        });
        this.syncRepo.stageItems(sessionId, playlistId, stagingItems);
        checkpoint.pageIndex = pageIndex;
        checkpoint.cursorState = { nextCursor: page.nextCursor };
        checkpoint.updatedAt = new Date();
        this.syncRepo.saveCheckpoint(checkpoint);
      });
      if (playlistId === 'LM' && expectedItemCount === undefined) throw new Error('Unverified likes completeness; prior snapshot retained');
      checkpoint.state = 'STAGED';
      checkpoint.updatedAt = new Date();
      this.syncRepo.saveCheckpoint(checkpoint);
      this.syncRepo.commitStagedPlaylist(sessionId, playlistId, items.length);

      this.syncController.recordSuccess();
    } catch (err) {
      checkpoint.state = 'FAILED';
      checkpoint.updatedAt = new Date();
      this.syncRepo.saveCheckpoint(checkpoint);
      throw err;
    }
  }
}
