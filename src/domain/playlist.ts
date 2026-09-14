export interface PlaylistItem {
  id: number;
  playlistId: string;
  trackId: number;
  remoteItemId: string; // setVideoId (unique occurrence identifier)
  position: number;
  addedAt: Date | null;
}

export interface ObservedRemoteFingerprint {
  playlistId: string;
  itemCount: number;
  /**
   * SHA-256 of ordered concatenation: remoteItemId + videoId + position
   * for all items in the playlist at observation time.
   */
  orderedItemHash: string;
  capturedAt: Date;
}

export interface PlaylistAggregate {
  id: string;
  title: string;
  description: string | null;
  trackCount: number;
  ownerName: string | null;
  isEditable: boolean;
  observedFingerprintHash?: string | null;
  observedFingerprintAt?: Date | null;
  localUpdatedAt: Date;
}
