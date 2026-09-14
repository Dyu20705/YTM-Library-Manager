import { spawn } from 'node:child_process';
import * as path from 'node:path';
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

export interface YtmGatewayOptions {
  pythonPath?: string;
  bridgeScriptPath?: string;
  authFilePath?: string;
}

export class SubprocessYtmGateway implements YtmPlaylistGateway {
  private readonly pythonPath: string;
  private readonly bridgeScriptPath: string;
  private readonly authFilePath?: string;
  public readonly observationCache = new RemoteObservationCache();

  constructor(options: YtmGatewayOptions = {}) {
    this.pythonPath = options.pythonPath ?? path.resolve(process.cwd(), '.venv/bin/python3');
    this.bridgeScriptPath = options.bridgeScriptPath ?? path.resolve(process.cwd(), 'python/ytm_bridge.py');
    this.authFilePath = options.authFilePath;
  }

  private async callBridge<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        command,
        args,
        authFile: this.authFilePath
      });

      const proc = spawn(this.pythonPath, [this.bridgeScriptPath, payload]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => {
        stdout += data.toString();
      });

      proc.stderr.on('data', data => {
        stderr += data.toString();
      });

      proc.on('close', code => {
        if (code !== 0) {
          try {
            const errJson = JSON.parse(stdout || stderr);
            return reject(new RemoteError('INVALID_REQUEST', errJson.message ?? 'Unknown bridge error'));
          } catch {
            return reject(new RemoteError('REMOTE_UNAVAILABLE', stderr || `Process exited with code ${code}`));
          }
        }

        try {
          const res = JSON.parse(stdout);
          if (res.status === 'error') {
            return reject(new RemoteError('INVALID_REQUEST', res.message));
          }
          resolve((res.data !== undefined ? res.data : res) as T);
        } catch (err) {
          reject(new RemoteError('REMOTE_UNAVAILABLE', `Failed to parse response: ${stdout}`));
        }
      });
    });
  }

  public async getPlaylists(): Promise<RemotePlaylistSummary[]> {
    const raw = await this.callBridge<any[]>('get_library_playlists');
    return (raw || []).map(p => ({
      id: p.playlistId ?? p.id,
      title: p.title,
      description: p.description ?? null,
      trackCount: p.count ?? p.trackCount ?? 0,
      ownerName: p.author ? (typeof p.author === 'string' ? p.author : p.author[0]?.name) : null,
      isEditable: true
    }));
  }

  public async getPlaylistItems(
    playlistId: string,
    limit = 100
  ): Promise<{ items: RemoteTrackItem[]; nextCursor?: string }> {
    const raw = await this.callBridge<any>('get_playlist', { playlistId, limit });
    const tracks = raw.tracks ?? [];

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
        inLibrary: t.inLibrary ?? false,
        feedbackTokens
      };
    });

    return { items };
  }

  public async getLibrarySongs(limit = 100): Promise<RemoteTrackItem[]> {
    const raw = await this.callBridge<any[]>('get_library_songs', { limit });
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
        feedbackTokens
      };
    });
  }

  public async addItems(playlistId: string, items: AddItemRequest[]): Promise<RemoteMutationResult> {
    const videoIds = items.map(i => i.videoId);
    await this.callBridge<any>('add_playlist_items', { playlistId, videoIds });

    return {
      operationId: crypto.randomUUID(),
      state: 'COMPLETED',
      requestedCount: items.length,
      appliedCount: items.length,
      failedCount: 0,
      unknownCount: 0,
      appliedItems: items.map(i => ({ videoId: i.videoId })),
      failedItems: [],
      unknownItems: [],
      remoteObservedAt: new Date()
    };
  }

  public async removeItems(playlistId: string, items: RemoveItemRequest[]): Promise<RemoteMutationResult> {
    const payload = items.map(i => ({ videoId: i.videoId, setVideoId: i.remoteItemId }));
    await this.callBridge<any>('remove_playlist_items', { playlistId, items: payload });

    return {
      operationId: crypto.randomUUID(),
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

  public async moveItem(_playlistId: string, _itemRemoteId: string, _anchor: MoveAnchor): Promise<RemoteMutationResult> {
    throw new RemoteError('UNSUPPORTED_OPERATION', 'Direct move via ytmusicapi bridge requires setVideoId successor anchor');
  }

  public async rateSong(videoId: string, rating: RatingState): Promise<RemoteMutationResult> {
    await this.callBridge<any>('rate_song', { videoId, rating });
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
    let tokens = this.observationCache.getTokens(videoId);
    if (!tokens) {
      // Need fresh tokens
      await this.getLibrarySongs(50);
      tokens = this.observationCache.getTokens(videoId);
    }

    const token = desiredInLibrary ? tokens?.add : tokens?.remove;
    if (!token) {
      throw new RemoteError('INVALID_REQUEST', `Missing feedbackToken for videoId ${videoId}`);
    }

    await this.callBridge<any>('edit_song_library_status', { feedbackTokens: [token] });

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
}
