import { YtmTrack } from '../domain/track.js';

export type Collection = 'ALL' | 'LIKED' | 'LIBRARY' | 'PLAYLIST';
export interface TrackRow extends YtmTrack {
  selectionId: string;
  remoteItemId?: string;
  position?: number;
}

export interface ApplicationStatus {
  connected: boolean;
  syncing: boolean;
  readOnly: true;
  freshness: {
    lastSuccessfulSyncAt: string | null;
    lastSyncAttemptAt: string | null;
    lastSyncResult: 'SUCCESS' | 'FAILED' | null;
    source: 'REMOTE_SYNCED' | 'LOCAL_ONLY';
  };
}
