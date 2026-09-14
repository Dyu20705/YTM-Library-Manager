import * as crypto from 'node:crypto';
import { SyncRepository } from '../storage/repositories/sync_repository.js';
import { PlaylistRepository } from '../storage/repositories/playlist_repository.js';
import { SearchIndexManager } from '../storage/fts.js';
import { YtmPlaylistGateway } from '../gateway/interfaces.js';
import { SyncSession, StagingItem, SyncCheckpoint } from './types.js';
import { AdaptiveSyncController } from './policy.js';
import { DataFreshness } from '../domain/types.js';
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
    private readonly playlistRepo: PlaylistRepository,
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

    if (!session) {
      const remotePlaylists = await this.gateway.getPlaylists();
      session = {
        sessionId,
        mode: 'FULL',
        status: 'IN_PROGRESS',
        totalPlaylists: remotePlaylists.length,
        completedPlaylists: 0,
        totalTracksIndexed: 0,
        startedAt: new Date()
      };
      this.syncRepo.createSession(session);

      // Upsert playlist metadata
      for (const pl of remotePlaylists) {
        this.playlistRepo.upsertPlaylist({
          id: pl.id,
          title: pl.title,
          description: pl.description,
          trackCount: pl.trackCount,
          ownerName: pl.ownerName,
          isEditable: pl.isEditable
        });
      }
    } else {
      session.status = 'IN_PROGRESS';
      this.syncRepo.updateSession(session);
    }

    const playlists = this.playlistRepo.listPlaylists();

    for (const pl of playlists) {
      const checkpoint = this.syncRepo.getCheckpoint(sessionId, 'PLAYLIST_ITEMS', pl.id);
      if (checkpoint?.state === 'COMMITTED') {
        // Skip already committed playlist (idempotent resume, INV-011)
        continue;
      }

      await this.syncPlaylist(pl.id, sessionId);
      session.completedPlaylists++;
      this.syncRepo.updateSession(session);
    }

    // Check search index status after sync (INV-016)
    this.ftsManager.rebuildIndex();
    const ftsStatus = this.ftsManager.getStatus();
    assertInvariant(ftsStatus === 'HEALTHY', 'INV_016', 'FTS index must be consistent after full sync');

    session.status = 'COMPLETED';
    session.completedAt = new Date();
    this.syncRepo.updateSession(session);

    this.freshness.lastSuccessfulSyncAt = new Date();
    this.freshness.lastSyncResult = 'SUCCESS';
    this.freshness.source = 'REMOTE_SYNCED';

    return session;
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
      await this.syncController.waitDelay();

      // Fetch items from remote gateway
      const { items } = await this.gateway.getPlaylistItems(playlistId);

      // Stage items into sync_staging (P0-4, INV-017)
      const stagingItems: StagingItem[] = items.map((item, idx) => ({
        videoId: item.videoId,
        title: item.title,
        normalizedTitle: item.title.toLowerCase().trim(),
        artistNames: item.artistNames,
        albumName: item.albumName ?? null,
        durationSeconds: item.durationSeconds,
        year: item.year ?? null,
        remoteItemId: item.remoteItemId ?? `virtual_${item.videoId}_${idx}`,
        position: idx,
        addedAt: new Date()
      }));

      this.syncRepo.stageItems(sessionId, playlistId, stagingItems);

      // Checkpoint state -> STAGED
      checkpoint.state = 'STAGED';
      checkpoint.updatedAt = new Date();
      this.syncRepo.saveCheckpoint(checkpoint);

      // Single transaction promotion into canonical DB (P0-C, INV-010)
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
