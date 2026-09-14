export type SyncMode = 'FULL' | 'INCREMENTAL' | 'SINGLE_PLAYLIST';
export type SyncStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'PAUSED';

export interface SyncSession {
  sessionId: string;
  mode: SyncMode;
  status: SyncStatus;
  totalPlaylists: number;
  completedPlaylists: number;
  totalTracksIndexed: number;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface SyncCheckpoint {
  sessionId: string;
  resourceType: 'PLAYLIST_LIST' | 'PLAYLIST_ITEMS' | 'LIBRARY_SONGS';
  resourceId: string;
  state: 'NOT_STARTED' | 'FETCHING' | 'STAGED' | 'COMMITTED' | 'FAILED';
  pageIndex: number;
  updatedAt: Date;

  // Generic pagination cursor (V1.1.2 Review §17)
  cursorState?: {
    nextCursor?: string;              // Token for next page to fetch
    committedThroughCursor?: string;  // Last cursor whose data is committed
  };
}

export interface StagingItem {
  videoId: string;
  title: string;
  normalizedTitle: string;
  artistNames: string[];
  albumName?: string | null;
  durationSeconds: number;
  year?: number | null;
  remoteItemId: string; // setVideoId
  position: number;
  addedAt?: Date | null;
}

export interface StagingCompletionCheck {
  sessionId: string;
  playlistId: string;
  expectedItemCount: number;
  stagedItemCount: number;
  isComplete: boolean;
}

export interface SyncPolicy {
  maxConcurrency: number;           // Default: 1 or 2
  baseDelayMs: number;              // Default: 350ms
  currentDelayMs: number;
  maxRetries: number;               // Default: 3
  backoffFactor: number;            // 2.0
  respectRetryAfterHeader: boolean;
}
