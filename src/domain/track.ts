import { TrackLibraryState } from './types.js';

export interface Artist {
  id: number;
  name: string;
  normalizedName: string;
}

export interface TrackArtist {
  trackId: number;
  artistId: number;
  position: number;
}

export interface YtmTrack {
  id: number;
  videoId: string;
  title: string;
  normalizedTitle: string;
  artists: Array<{ id: number; name: string }>;
  albumName: string | null;
  durationSeconds: number;
  year: number | null;
  isAvailable: boolean;
  libraryState: TrackLibraryState;
  firstSeenAt: Date;
  lastSeenAt: Date;
}
