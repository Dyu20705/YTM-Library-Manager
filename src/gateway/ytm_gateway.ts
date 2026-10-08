import { spawn } from 'node:child_process';
import * as path from 'node:path';
import {
  YtmPlaylistGateway,
  RemotePlaylistSummary,
  RemoteTrackItem,
  AddItemRequest,
  RemoveItemRequest
} from './interfaces.js';
import { AppliedItem, MoveAnchor, MutationIntent, RemoteMutationResult } from '../domain/mutation.js';
import { RatingState } from '../domain/types.js';
import { RemoteError, RemoteErrorCode } from './errors.js';
import { RemoteObservationCache } from './observation_cache.js';
import { LogSanitizer } from './sanitizer.js';
import { readCompletePlaylist } from './complete_playlist.js';
import { ReconciliationEngine } from '../reconciliation/reconciliation_engine.js';

export interface YtmGatewayOptions {
  pythonPath?: string;
  bridgeScriptPath?: string;
  authFilePath?: string;
  timeoutMs?: number;
}

export class SubprocessYtmGateway implements YtmPlaylistGateway {
  private readonly pythonPath: string;
  private readonly bridgeScriptPath: string;
  private readonly authFilePath?: string;
  private readonly timeoutMs: number;
  public readonly observationCache = new RemoteObservationCache();

  constructor(options: YtmGatewayOptions = {}) {
    this.pythonPath = options.pythonPath ?? path.resolve(process.cwd(), process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python3');
    this.bridgeScriptPath = options.bridgeScriptPath ?? path.resolve(process.cwd(), 'python/ytm_bridge.py');
    this.authFilePath = options.authFilePath;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  public startSession(sessionId: string): void {
    this.observationCache.startSession(sessionId);
  }

  private async callBridge<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, [this.bridgeScriptPath], { windowsHide: true });
      let stdout = '';
      const timer = setTimeout(() => {
        proc.kill();
        reject(new RemoteError('NETWORK_UNAVAILABLE', 'Bridge request timed out'));
      }, this.timeoutMs);
      proc.on('error', () => {
        clearTimeout(timer);
        reject(new RemoteError('REMOTE_UNAVAILABLE', 'Unable to start Python bridge'));
      });
      // Do not retain stderr or echo malformed output: it may contain credentials.
      proc.stderr.resume();
      proc.stdin.on('error', () => {}); // close/error handler reports failed transport
      proc.stdout.on('data', data => { stdout += data.toString(); });
      proc.on('close', code => {
        clearTimeout(timer);
        try {
          const res = JSON.parse(stdout);
          if (code !== 0 || res.status === 'error') {
            const allowed: RemoteErrorCode[] = ['AUTH_EXPIRED', 'PERMISSION_DENIED', 'RATE_LIMITED',
              'NETWORK_UNAVAILABLE', 'REMOTE_UNAVAILABLE', 'INVALID_REQUEST', 'UNSUPPORTED_OPERATION'];
            const errCode = allowed.includes(res.code) ? res.code : 'REMOTE_UNAVAILABLE';
            reject(new RemoteError(errCode, LogSanitizer.sanitize('Remote bridge request failed'), res.retryAfterSeconds));
          } else {
            resolve((res.data !== undefined ? res.data : res) as T);
          }
        } catch {
          reject(new RemoteError('REMOTE_UNAVAILABLE', 'Invalid bridge response'));
        }
      });
      proc.stdin.end(JSON.stringify({ command, args, authFile: this.authFilePath }));
    });
  }

  public async getPlaylists(): Promise<RemotePlaylistSummary[]> {
    const raw = await this.callBridge<any[]>('get_library_playlists', { limit: null });
    const playlists: RemotePlaylistSummary[] = (raw || []).map(p => {
      const id = p.playlistId ?? p.id;
      const isSystemPlaylist = id === 'LM';
      const isEditable = !isSystemPlaylist && Boolean(p.owned ?? p.isEditable ?? false);
      return {
        id,
        title: p.title,
        description: p.description ?? null,
        trackCount: typeof p.count === 'string' ? parseInt(p.count, 10) : (p.count ?? p.trackCount ?? 0),
        ownerName: p.author ? (typeof p.author === 'string' ? p.author : p.author.name ?? p.author[0]?.name) : null,
        isEditable
      };
    });
    if (!playlists.some(p => p.id === 'LM')) playlists.push({ id: 'LM', title: 'Liked Music', trackCount: 0, isEditable: false });
    return playlists;
  }

  public async getPlaylistItems(
    playlistId: string,
    limit = 100,
    cursor?: string
  ): Promise<{ items: RemoteTrackItem[]; nextCursor?: string; expectedItemCount?: number }> {
    const raw = await this.callBridge<any>('get_playlist', { playlistId, limit, cursor });
    const tracks = raw?.tracks ?? (Array.isArray(raw) ? raw : []);

    const items: RemoteTrackItem[] = tracks.map((t: any) => {
      const videoId = t.videoId;
      const feedbackTokens = t.feedbackTokens
        ? { add: t.feedbackTokens.add, remove: t.feedbackTokens.remove }
        : undefined;

      if (videoId && feedbackTokens) {
        this.observationCache.setTokens(videoId, feedbackTokens);
      }

      return {
        videoId,
        title: t.title,
        artistNames: (t.artists ?? []).map((a: any) => (typeof a === 'string' ? a : a.name)),
        albumName: t.album?.name ?? null,
        durationSeconds: t.duration_seconds ?? 0,
        year: t.year ? parseInt(t.year, 10) : null,
        remoteItemId: t.setVideoId,
        inLibrary: t.inLibrary,
        rating: t.likeStatus,
        isAvailable: t.isAvailable,
        feedbackTokens
      };
    });

    return { items, nextCursor: raw?.nextCursor ?? undefined, expectedItemCount: raw?.expectedItemCount ?? undefined };
  }

  public async getLibrarySongs(limit?: number): Promise<RemoteTrackItem[]> {
    const raw = await this.callBridge<any[]>('get_library_songs', { limit: limit ?? null });
    return (raw || []).map((t: any) => {
      const feedbackTokens = t.feedbackTokens
        ? { add: t.feedbackTokens.add, remove: t.feedbackTokens.remove }
        : undefined;

      if (t.videoId && feedbackTokens) {
        this.observationCache.setTokens(t.videoId, feedbackTokens);
      }

      return {
        videoId: t.videoId,
        title: t.title,
        artistNames: (t.artists ?? []).map((a: any) => (typeof a === 'string' ? a : a.name)),
        albumName: t.album?.name ?? null,
        durationSeconds: t.duration_seconds ?? 0,
        year: t.year ? parseInt(t.year, 10) : null,
        inLibrary: true,
        rating: t.likeStatus,
        isAvailable: t.isAvailable,
        feedbackTokens
      };
    });
  }

  private readPlaylist(playlistId: string): Promise<RemoteTrackItem[]> {
    return readCompletePlaylist(cursor => this.getPlaylistItems(playlistId, 100, cursor));
  }

  private outcome(requests: AppliedItem[], applied: AppliedItem[], unknown: AppliedItem[]): RemoteMutationResult {
    return {
      operationId: crypto.randomUUID(),
      state: unknown.length ? (applied.length ? 'PARTIAL_SUCCESS' : 'UNKNOWN') : 'COMPLETED',
      requestedCount: requests.length,
      appliedCount: applied.length,
      failedCount: 0,
      unknownCount: unknown.length,
      appliedItems: applied, failedItems: [], unknownItems: unknown,
      remoteObservedAt: new Date()
    };
  }

  private assertEditablePlaylist(playlistId: string): void {
    if (playlistId === 'LM') throw new RemoteError('UNSUPPORTED_OPERATION', 'Cannot reorder items in Liked Music playlist.');
  }

  // The response only acknowledges transport. A complete read-back establishes effects.
  // Missing effects after dispatch stay UNKNOWN; callers must reconcile before retrying.
  private async dispatchAndProbe(
    playlistId: string, command: string, args: Record<string, unknown>, intents: MutationIntent[]
  ): Promise<RemoteMutationResult> {
    const requests = intents.map(i => ({ videoId: i.videoId, remoteItemId: i.action === 'ADD' ? undefined : i.remoteItemId }));
    try { await this.callBridge(command, args); } catch { /* dispatch may have reached the server */ }
    try {
      const observed = await this.readPlaylist(playlistId);
      const reconciliation = ReconciliationEngine.reconcileUnknownBatch(intents, observed);
      const satisfied = new Set(reconciliation.satisfiedIntents);
      const applied = requests.filter((_, i) => satisfied.has(intents[i]!));
      const unknown = requests.filter((_, i) => !satisfied.has(intents[i]!));
      const result = this.outcome(requests, applied, unknown);
      if (reconciliation.conflictIntents.length) result.state = 'CONFLICT';
      return result;
    } catch {
      return this.outcome(requests, [], requests);
    }
  }

  public async addItems(playlistId: string, items: AddItemRequest[]): Promise<RemoteMutationResult> {
    this.assertEditablePlaylist(playlistId);
    // Capture occurrence identities before dispatch, so duplicates cannot prove our ADD.
    const before = await this.readPlaylist(playlistId);
    const known = new Set(before.map(i => i.remoteItemId));
    const unique = new Set<string>();
    for (const item of items) {
      if (unique.has(item.videoId) || before.some(i => i.videoId === item.videoId)) {
        throw new RemoteError('INVALID_REQUEST', 'ADD must use the SKIP_EXISTING plan');
      }
      unique.add(item.videoId);
    }
    try { await this.callBridge('add_playlist_items', { playlistId, videoIds: items.map(i => i.videoId), duplicates: false }); } catch { /* probe uncertain dispatch */ }
    try {
      const after = await this.readPlaylist(playlistId);
      const applied: AppliedItem[] = [];
      const unknown: AppliedItem[] = [];
      for (const item of items) {
        const candidates = after.filter(i => i.videoId === item.videoId && i.remoteItemId && !known.has(i.remoteItemId));
        if (candidates.length === 1) applied.push({ videoId: item.videoId, remoteItemId: candidates[0]!.remoteItemId });
        else unknown.push(item);
      }
      return this.outcome(items, applied, unknown);
    } catch { return this.outcome(items, [], items); }
  }

  public async removeItems(playlistId: string, items: RemoveItemRequest[]): Promise<RemoteMutationResult> {
    this.assertEditablePlaylist(playlistId);
    return this.dispatchAndProbe(playlistId, 'remove_playlist_items', { playlistId, items: items.map(i => ({ videoId: i.videoId, setVideoId: i.remoteItemId })) },
      items.map(i => ({ action: 'REMOVE', playlistId, ...i, postcondition: { check: 'ABSENT', remoteItemId: i.remoteItemId } })));
  }

  public async moveItem(playlistId: string, itemRemoteId: string, anchor: MoveAnchor): Promise<RemoteMutationResult> {
    this.assertEditablePlaylist(playlistId);
    const before = await this.readPlaylist(playlistId);
    const item = before.find(i => i.remoteItemId === itemRemoteId);
    if (!item) throw new RemoteError('INVALID_REQUEST', 'Occurrence to move is absent');
    return this.dispatchAndProbe(playlistId, 'move_playlist_item', {
      playlistId, itemRemoteId, successorRemoteId: anchor.type === 'BEFORE' ? anchor.remoteItemId : undefined
    }, [{ action: 'MOVE', playlistId, videoId: item.videoId, remoteItemId: itemRemoteId, anchor,
      postcondition: { check: 'AT_RELATIVE_POSITION', remoteItemId: itemRemoteId, relativeAnchor: anchor } }]);
  }

  public async rateSong(videoId: string, rating: RatingState): Promise<RemoteMutationResult> {
    try { await this.callBridge('rate_song', { videoId, rating }); } catch { /* outcome uncertain */ }
    // There is no reliable per-song rating probe in this contract yet.
    return this.outcome([{ videoId }], [], [{ videoId }]);
  }

  public async setLibraryStatus(videoId: string, desiredInLibrary: boolean): Promise<RemoteMutationResult> {
    let tokens = this.observationCache.getTokens(videoId);
    if (!tokens) {
      const resolved = await this.callBridge<{ add?: string; remove?: string } | null>('resolve_feedback_tokens', { videoId });
      if (resolved) { this.observationCache.setTokens(videoId, resolved); tokens = resolved; }
    }
    const token = desiredInLibrary ? tokens?.add : tokens?.remove;
    if (!token) throw new RemoteError('INVALID_REQUEST', 'Missing library feedback token');
    try { await this.callBridge('edit_song_library_status', { feedbackTokens: [token] }); } catch { /* probe uncertain dispatch */ }
    try {
      const songs = await this.getLibrarySongs();
      if (songs.some(i => i.videoId === videoId) === desiredInLibrary) return this.outcome([{ videoId }], [{ videoId }], []);
    } catch { /* no reliable observation */ }
    return this.outcome([{ videoId }], [], [{ videoId }]);
  }
}
