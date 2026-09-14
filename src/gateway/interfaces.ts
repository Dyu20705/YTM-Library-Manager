import { MoveAnchor, RemoteMutationResult } from '../domain/mutation.js';
import { RatingState } from '../domain/types.js';

export interface AddItemRequest {
  videoId: string;
}

export interface RemoveItemRequest {
  videoId: string;
  remoteItemId: string; // REQUIRED: setVideoId
}

export interface RemoteTrackItem {
  videoId: string;
  title: string;
  artistNames: string[];
  albumName?: string | null;
  durationSeconds: number;
  year?: number | null;
  remoteItemId?: string; // setVideoId (present for user playlists, absent for Liked Music)
  inLibrary?: boolean;
  feedbackTokens?: {
    add?: string;
    remove?: string;
  };
}

export interface RemotePlaylistSummary {
  id: string;
  title: string;
  description?: string | null;
  trackCount: number;
  ownerName?: string | null;
  isEditable: boolean;
}

export interface AuthSession {
  sessionId: string;
  authType: 'BROWSER_CREDENTIALS' | 'OAUTH';
  accountLabel?: string;
  isValid: boolean;
  expiresAt?: Date;
}

/**
 * IAuthProvider: Application only sees AuthSession.
 * NO method returns headers/cookies/tokens (INV-015, INV-020, P1-A).
 */
export interface IAuthProvider {
  getAuthType(): AuthSession['authType'];
  validate(): Promise<AuthSession>;
}

export interface YtmTransport {
  /** Infrastructure-only execution. Injects auth internally. */
  execute<T>(operation: string, payload?: Record<string, unknown>): Promise<T>;
}

/**
 * YtmPlaylistGateway interface.
 * Domain layer interacts only via this port.
 */
export interface YtmPlaylistGateway {
  getPlaylists(): Promise<RemotePlaylistSummary[]>;
  getPlaylistItems(playlistId: string, limit?: number, cursor?: string): Promise<{ items: RemoteTrackItem[]; nextCursor?: string }>;
  getLibrarySongs(limit?: number): Promise<RemoteTrackItem[]>;

  addItems(playlistId: string, items: AddItemRequest[]): Promise<RemoteMutationResult>;
  removeItems(playlistId: string, items: RemoveItemRequest[]): Promise<RemoteMutationResult>;
  moveItem(playlistId: string, itemRemoteId: string, anchor: MoveAnchor): Promise<RemoteMutationResult>;

  rateSong(videoId: string, rating: RatingState): Promise<RemoteMutationResult>;

  /**
   * Library status mutation (P0-1).
   * Application sends videoId + desired state.
   * Gateway internally resolves the required feedbackToken.
   */
  setLibraryStatus(videoId: string, desiredInLibrary: boolean): Promise<RemoteMutationResult>;
}
