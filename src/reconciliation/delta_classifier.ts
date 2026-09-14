import { OccurrenceDelta } from '../domain/reconciliation.js';

export interface OccurrenceItem {
  videoId: string;
  remoteItemId: string;
  position: number;
}

export class DeltaClassifier {
  /**
   * Classify differences between Base (original state) and Current (observed remote state)
   * into the 4-Delta model: ADDED, REMOVED, MOVED, UNCHANGED.
   */
  public static classify(baseItems: OccurrenceItem[], currentItems: OccurrenceItem[]): OccurrenceDelta[] {
    const deltas: OccurrenceDelta[] = [];

    const baseMap = new Map<string, OccurrenceItem>();
    baseItems.forEach(item => baseMap.set(item.remoteItemId, item));

    const currentMap = new Map<string, OccurrenceItem>();
    currentItems.forEach(item => currentMap.set(item.remoteItemId, item));

    // 1. Process items in Current
    for (const cur of currentItems) {
      const base = baseMap.get(cur.remoteItemId);
      if (!base) {
        // Item in Current but not Base -> ADDED externally
        deltas.push({
          videoId: cur.videoId,
          remoteItemId: cur.remoteItemId,
          delta: 'ADDED',
          currentPosition: cur.position
        });
      } else {
        // Exists in both
        if (base.position !== cur.position) {
          deltas.push({
            videoId: cur.videoId,
            remoteItemId: cur.remoteItemId,
            delta: 'MOVED',
            basePosition: base.position,
            currentPosition: cur.position
          });
        } else {
          deltas.push({
            videoId: cur.videoId,
            remoteItemId: cur.remoteItemId,
            delta: 'UNCHANGED',
            basePosition: base.position,
            currentPosition: cur.position
          });
        }
      }
    }

    // 2. Process items in Base but absent in Current
    for (const base of baseItems) {
      if (!currentMap.has(base.remoteItemId)) {
        deltas.push({
          videoId: base.videoId,
          remoteItemId: base.remoteItemId,
          delta: 'REMOVED',
          basePosition: base.position
        });
      }
    }

    return deltas;
  }
}
