import * as crypto from 'node:crypto';
import {
  YtmPlaylistGateway,
  RemotePlaylistSummary,
  RemoteTrackItem,
  AddItemRequest,
  RemoveItemRequest
} from './interfaces.js';
import { MoveAnchor, RemoteMutationResult } from '../domain/mutation.js';
import { RatingState } from '../domain/types.js';
import { RemoteError } from './errors.js';
import { RemoteObservationCache } from './observation_cache.js';

export class MockYtmGateway implements YtmPlaylistGateway {
  // Remote state simulation
  private playlists: Map<string, RemotePlaylistSummary> = new Map();
  private playlistItems: Map<string, RemoteTrackItem[]> = new Map();
  private librarySongs: RemoteTrackItem[] = [];
  private songRatings: Map<string, RatingState> = new Map();

  // Test fault injection flags
  public simulateNetworkTimeoutOnNextMutation = false;
  public simulateRateLimitOnNextCall: number | null = null; // retryAfterSeconds
  public simulateFailureOnNextMutation: string | null = null;

  public readonly observationCache = new RemoteObservationCache();

  public startSession(sessionId: string): void {
    this.observationCache.startSession(sessionId);
  }

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const p1: RemotePlaylistSummary = {
      id: 'PL_JPOP',
      title: 'J-Pop Hits',
      description: 'Top Japanese Pop',
      trackCount: 3,
      ownerName: 'TestUser',
      isEditable: true
    };
    this.playlists.set(p1.id, p1);

    this.playlistItems.set(p1.id, [
      {
        videoId: 'v1_ado',
        title: 'Usseewa',
        artistNames: ['Ado'],
        albumName: 'Kyogen',
        durationSeconds: 204,
        year: 2020,
        remoteItemId: 'item_1_usseewa',
        inLibrary: true,
        feedbackTokens: { add: 'fb_add_ado', remove: 'fb_rem_ado' }
      },
      {
        videoId: 'v2_yoasobi',
        title: 'Racing into the Night',
        artistNames: ['YOASOBI'],
        albumName: 'THE BOOK',
        durationSeconds: 261,
        year: 2019,
        remoteItemId: 'item_2_yoru',
        inLibrary: false,
        feedbackTokens: { add: 'fb_add_yoasobi', remove: 'fb_rem_yoasobi' }
      },
      {
        videoId: 'v3_eve',
        title: 'Kaikai Kitan',
        artistNames: ['Eve'],
        albumName: 'Kaizin',
        durationSeconds: 220,
        year: 2020,
        remoteItemId: 'item_3_eve',
        inLibrary: true,
        feedbackTokens: { add: 'fb_add_eve', remove: 'fb_rem_eve' }
      }
    ]);

    // System playlist: Liked Music (LM) without setVideoId (P0-A)
    const plLM: RemotePlaylistSummary = {
      id: 'LM',
      title: 'Liked Music',
      description: 'Your liked songs',
      trackCount: 2,
      ownerName: 'YouTube Music',
      isEditable: false
    };
    this.playlists.set(plLM.id, plLM);

    this.playlistItems.set(plLM.id, [
      {
        videoId: 'v1_ado',
        title: 'Usseewa',
        artistNames: ['Ado'],
        albumName: 'Kyogen',
        durationSeconds: 204,
        year: 2020,
        // remoteItemId is undefined for Liked Music! (P0-A)
        inLibrary: true
      },
      {
        videoId: 'v4_vaundy',
        title: 'Odoriko',
        artistNames: ['Vaundy'],
        albumName: 'strobo',
        durationSeconds: 215,
        year: 2021,
        inLibrary: true
      }
    ]);
  }

  public async getPlaylists(): Promise<RemotePlaylistSummary[]> {
    this.checkRateLimit();
    return Array.from(this.playlists.values());
  }

  public async getPlaylistItems(
    playlistId: string,
    limit?: number,
    cursor?: string
  ): Promise<{ items: RemoteTrackItem[]; nextCursor?: string }> {
    this.checkRateLimit();
    const allItems = this.playlistItems.get(playlistId) ?? [];

    let startIndex = 0;
    if (cursor) {
      const parsed = parseInt(cursor, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        startIndex = parsed;
      }
    }

    const pageSize = limit ?? allItems.length;
    const pageItems = allItems.slice(startIndex, startIndex + pageSize);
    const nextIndex = startIndex + pageSize;
    const nextCursor = nextIndex < allItems.length ? String(nextIndex) : undefined;

    // Cache feedback tokens if present
    for (const item of pageItems) {
      if (item.feedbackTokens) {
        this.observationCache.setTokens(item.videoId, item.feedbackTokens);
      }
    }

    return { items: [...pageItems], nextCursor };
  }

  public async getLibrarySongs(_limit?: number): Promise<RemoteTrackItem[]> {
    this.checkRateLimit();
    return [...this.librarySongs];
  }

  public async addItems(playlistId: string, items: AddItemRequest[]): Promise<RemoteMutationResult> {
    this.checkRateLimit();
    const opId = crypto.randomUUID();

    if (this.simulateFailureOnNextMutation) {
      const err = this.simulateFailureOnNextMutation;
      this.simulateFailureOnNextMutation = null;
      throw new RemoteError('INVALID_REQUEST', err);
    }

    if (this.simulateNetworkTimeoutOnNextMutation) {
      this.simulateNetworkTimeoutOnNextMutation = false;
      // Server actually applied it, but client got disconnected!
      const current = this.playlistItems.get(playlistId) ?? [];
      const appliedItems: Array<{ videoId: string; remoteItemId?: string }> = [];
      for (const item of items) {
        const remoteItemId = `setVideoId_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        current.push({
          videoId: item.videoId,
          title: `Track ${item.videoId}`,
          artistNames: ['Unknown Artist'],
          durationSeconds: 180,
          remoteItemId
        });
        appliedItems.push({ videoId: item.videoId, remoteItemId });
      }
      this.playlistItems.set(playlistId, current);

      // Return UNKNOWN state result or throw NETWORK_UNAVAILABLE
      return {
        operationId: opId,
        state: 'UNKNOWN',
        requestedCount: items.length,
        appliedCount: 0,
        failedCount: 0,
        unknownCount: items.length,
        appliedItems: [],
        failedItems: [],
        unknownItems: items.map(i => ({ videoId: i.videoId })),
        remoteObservedAt: new Date()
      };
    }

    const current = this.playlistItems.get(playlistId) ?? [];
    const appliedItems: Array<{ videoId: string; remoteItemId?: string }> = [];

    for (const item of items) {
      const remoteItemId = `setVideoId_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      current.push({
        videoId: item.videoId,
        title: `Track ${item.videoId}`,
        artistNames: ['Unknown Artist'],
        durationSeconds: 180,
        remoteItemId
      });
      appliedItems.push({ videoId: item.videoId, remoteItemId });
    }
    this.playlistItems.set(playlistId, current);

    // Update playlist count
    const pl = this.playlists.get(playlistId);
    if (pl) pl.trackCount = current.length;

    return {
      operationId: opId,
      state: 'COMPLETED',
      requestedCount: items.length,
      appliedCount: appliedItems.length,
      failedCount: 0,
      unknownCount: 0,
      appliedItems,
      failedItems: [],
      unknownItems: [],
      remoteObservedAt: new Date()
    };
  }

  public async removeItems(playlistId: string, items: RemoveItemRequest[]): Promise<RemoteMutationResult> {
    this.checkRateLimit();
    const opId = crypto.randomUUID();

    if (this.simulateNetworkTimeoutOnNextMutation) {
      this.simulateNetworkTimeoutOnNextMutation = false;
      // Server applied removal, but client timed out
      const current = this.playlistItems.get(playlistId) ?? [];
      const remoteIdsToRemove = new Set(items.map(i => i.remoteItemId));
      const remaining = current.filter(i => !i.remoteItemId || !remoteIdsToRemove.has(i.remoteItemId));
      this.playlistItems.set(playlistId, remaining);

      return {
        operationId: opId,
        state: 'UNKNOWN',
        requestedCount: items.length,
        appliedCount: 0,
        failedCount: 0,
        unknownCount: items.length,
        appliedItems: [],
        failedItems: [],
        unknownItems: items.map(i => ({ videoId: i.videoId })),
        remoteObservedAt: new Date()
      };
    }

    const current = this.playlistItems.get(playlistId) ?? [];
    const remoteIdsToRemove = new Set(items.map(i => i.remoteItemId));
    const remaining = current.filter(i => !i.remoteItemId || !remoteIdsToRemove.has(i.remoteItemId));
    this.playlistItems.set(playlistId, remaining);

    const pl = this.playlists.get(playlistId);
    if (pl) pl.trackCount = remaining.length;

    return {
      operationId: opId,
      state: 'COMPLETED',
      requestedCount: items.length,
      appliedCount: items.length,
      failedCount: 0,
      unknownCount: 0,
      appliedItems: items.map(i => ({ videoId: i.videoId, remoteItemId: i.remoteItemId })),
      failedItems: [],
      unknownItems: [],
      remoteObservedAt: new Date()
    };
  }

  public async moveItem(playlistId: string, itemRemoteId: string, anchor: MoveAnchor): Promise<RemoteMutationResult> {
    this.checkRateLimit();
    const opId = crypto.randomUUID();

    if (playlistId === 'LM') {
      throw new RemoteError('UNSUPPORTED_OPERATION', 'Cannot reorder items in Liked Music playlist.');
    }

    const current = this.playlistItems.get(playlistId) ?? [];
    const itemIndex = current.findIndex(i => i.remoteItemId === itemRemoteId);
    if (itemIndex === -1) {
      throw new RemoteError('INVALID_REQUEST', `Item with remoteId ${itemRemoteId} not found.`);
    }

    const [item] = current.splice(itemIndex, 1);
    if (!item) {
      throw new RemoteError('INVALID_REQUEST', 'Item could not be extracted');
    }

    if (anchor.type === 'END') {
      current.push(item);
    } else {
      const targetIndex = current.findIndex(i => i.remoteItemId === anchor.remoteItemId);
      if (targetIndex === -1) {
        throw new RemoteError('INVALID_REQUEST', `Anchor remoteItemId ${anchor.remoteItemId} not found.`);
      }
      current.splice(targetIndex, 0, item);
    }

    this.playlistItems.set(playlistId, current);

    return {
      operationId: opId,
      state: 'COMPLETED',
      requestedCount: 1,
      appliedCount: 1,
      failedCount: 0,
      unknownCount: 0,
      appliedItems: [{ videoId: item.videoId, remoteItemId: item.remoteItemId }],
      failedItems: [],
      unknownItems: [],
      remoteObservedAt: new Date()
    };
  }

  public async rateSong(videoId: string, rating: RatingState): Promise<RemoteMutationResult> {
    this.checkRateLimit();
    this.songRatings.set(videoId, rating);

    return {
      operationId: crypto.randomUUID(),
      state: 'COMPLETED',
      requestedCount: 1,
      appliedCount: 1,
      failedCount: 0,
      unknownCount: 0,
      appliedItems: [{ videoId }],
      failedItems: [],
      unknownItems: [],
      remoteObservedAt: new Date()
    };
  }

  public async setLibraryStatus(videoId: string, desiredInLibrary: boolean): Promise<RemoteMutationResult> {
    this.checkRateLimit();

    // Look up feedbackToken from observation cache
    let tokens = this.observationCache.getTokens(videoId);
    if (!tokens) {
      // Simulate fetching tokens on cache miss
      tokens = { add: `token_add_${videoId}`, remove: `token_rem_${videoId}` };
      this.observationCache.setTokens(videoId, tokens);
    }

    const requiredToken = desiredInLibrary ? tokens.add : tokens.remove;
    if (!requiredToken) {
      throw new RemoteError('INVALID_REQUEST', `No feedbackToken found for desired inLibrary: ${desiredInLibrary}`);
    }

    return {
      operationId: crypto.randomUUID(),
      state: 'COMPLETED',
      requestedCount: 1,
      appliedCount: 1,
      failedCount: 0,
      unknownCount: 0,
      appliedItems: [{ videoId }],
      failedItems: [],
      unknownItems: [],
      remoteObservedAt: new Date()
    };
  }

  private checkRateLimit(): void {
    if (this.simulateRateLimitOnNextCall !== null) {
      const delay = this.simulateRateLimitOnNextCall;
      this.simulateRateLimitOnNextCall = null;
      throw new RemoteError('RATE_LIMITED', 'Rate limited by remote', delay);
    }
  }

  // Helpers for testing
  public reorderItemsExternally(playlistId: string, newOrder: string[]): void {
    const current = this.playlistItems.get(playlistId) ?? [];
    const itemMap = new Map(current.map(i => [i.remoteItemId ?? i.videoId, i]));
    const reordered: RemoteTrackItem[] = [];
    for (const id of newOrder) {
      const it = itemMap.get(id);
      if (it) reordered.push(it);
    }
    this.playlistItems.set(playlistId, reordered);
  }

  public addExternalItem(playlistId: string, item: RemoteTrackItem, atIndex?: number): void {
    const current = this.playlistItems.get(playlistId) ?? [];
    if (atIndex !== undefined && atIndex >= 0 && atIndex <= current.length) {
      current.splice(atIndex, 0, item);
    } else {
      current.push(item);
    }
    this.playlistItems.set(playlistId, current);
  }
}
