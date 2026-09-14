export type RatingState = 'LIKE' | 'DISLIKE' | 'INDIFFERENT';

export interface TrackLibraryState {
  inLibrary: boolean;
  rating: RatingState;
  updatedAt: Date;
}

export type RemoteCollectionType =
  | 'USER_PLAYLIST'     // Has PlaylistItems with setVideoId
  | 'LIKED_MUSIC'       // Virtual; state lives in tracks.rating
  | 'LIBRARY_SONGS';    // Virtual; state lives in tracks.in_library

export interface DataFreshness {
  lastSuccessfulSyncAt: Date | null;    // null = never synced
  lastSyncAttemptAt: Date | null;
  lastSyncResult: 'SUCCESS' | 'PARTIAL' | 'FAILED' | null;
  source: 'REMOTE_SYNCED' | 'LOCAL_ONLY';
}

export type AppOperatingMode =
  | 'FULL'               // Auth valid, all features available
  | 'LOCAL_ONLY'         // Auth expired/missing, read-only local features
  | 'SYNC_IN_PROGRESS';  // Transitional state during sync

export type DuplicatePolicy = 'SKIP_EXISTING';
