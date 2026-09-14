import { PlaylistItem } from '../domain/playlist.js';
import { MoveAnchor } from '../domain/mutation.js';

export interface CompiledMove {
  remoteItemId: string;
  anchor: MoveAnchor;
}

export class MoveOperationCompiler {
  /**
   * Compiles a domain-level index move into a typed MoveAnchor for YTM (P0-G, P0-L).
   *
   * @param currentPlaylist Current list of playlist items in order
   * @param itemToMove The item being moved
   * @param targetIndex 0-based target position index
   */
  public static compileMove(
    currentPlaylist: PlaylistItem[],
    itemToMove: PlaylistItem,
    targetIndex: number
  ): CompiledMove {
    // Exclude the item being moved
    const filtered = currentPlaylist.filter(i => i.remoteItemId !== itemToMove.remoteItemId);
    const clampedIndex = Math.max(0, Math.min(targetIndex, filtered.length));

    // Successor is the item currently at the target position
    const successor = filtered[clampedIndex];

    return {
      remoteItemId: itemToMove.remoteItemId,
      anchor: successor
        ? { type: 'BEFORE', remoteItemId: successor.remoteItemId }
        : { type: 'END' }
    };
  }
}
