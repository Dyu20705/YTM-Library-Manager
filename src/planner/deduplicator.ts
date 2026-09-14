import { PlaylistItem } from '../domain/playlist.js';
import { RemoveIntent } from '../domain/mutation.js';

export interface DeduplicationGroup {
  videoId: string;
  retainedOccurrence: PlaylistItem;
  redundantOccurrences: PlaylistItem[];
}

export interface DeduplicationPlan {
  playlistId: string;
  totalDuplicatesFound: number;
  groups: DeduplicationGroup[];
  removeIntents: RemoveIntent[];
}

export class ExactDeduplicator {
  /**
   * Scan playlist items for duplicate videoId occurrences.
   * Designates the earliest position as Retained Playlist Occurrence (V1.1 §6.3).
   * Generates typed RemoveIntent for all redundant occurrences.
   */
  public static planDeduplication(playlistId: string, items: PlaylistItem[]): DeduplicationPlan {
    const groupsByVideoId = new Map<string, PlaylistItem[]>();

    for (const item of items) {
      const list = groupsByVideoId.get(item.trackId ? String(item.trackId) : item.remoteItemId) ?? [];
      list.push(item);
      groupsByVideoId.set(item.trackId ? String(item.trackId) : item.remoteItemId, list);
    }

    const groups: DeduplicationGroup[] = [];
    const removeIntents: RemoveIntent[] = [];
    let totalDuplicates = 0;

    for (const occurrences of groupsByVideoId.values()) {
      if (occurrences.length > 1) {
        // Sort by position ascending
        const sorted = [...occurrences].sort((a, b) => a.position - b.position);
        const retained = sorted[0]!;
        const redundant = sorted.slice(1);

        totalDuplicates += redundant.length;

        groups.push({
          videoId: '', // populated below
          retainedOccurrence: retained,
          redundantOccurrences: redundant
        });

        for (const red of redundant) {
          removeIntents.push({
            action: 'REMOVE',
            playlistId,
            videoId: '', // populated below or by caller
            remoteItemId: red.remoteItemId,
            postcondition: { check: 'ABSENT', remoteItemId: red.remoteItemId }
          });
        }
      }
    }

    return {
      playlistId,
      totalDuplicatesFound: totalDuplicates,
      groups,
      removeIntents
    };
  }
}
