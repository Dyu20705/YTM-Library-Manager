import { PlaylistItem } from '../domain/playlist.js';
import { MutationIntent, AddIntent, RemoveIntent, MoveIntent } from '../domain/mutation.js';
import { RollbackIntent, RestoreMembershipEntry } from '../domain/operation.js';
import { MoveOperationCompiler } from './move_compiler.js';

export interface ChangePlan {
  targetPlaylistId: string;
  beforeTrackCount: number;
  afterTrackCount: number;
  intents: MutationIntent[];
  skippedVideoIds: string[];
  summary: {
    addedCount: number;
    removedCount: number;
    movedCount: number;
    skippedCount: number;
  };
  rollbackIntent: RollbackIntent;
  isApproved: boolean; // INV-006: Must be true before executing mutations
}

export class ChangePlanner {
  /**
   * Plan adding tracks to a playlist with DuplicatePolicy = 'SKIP_EXISTING' (P0-H).
   */
  public static planAddTracks(
    playlistId: string,
    existingItems: PlaylistItem[],
    existingVideoIds: Set<string>,
    videoIdsToAdd: string[]
  ): ChangePlan {
    const skippedVideoIds: string[] = [];
    const toAdd: string[] = [];

    for (const vId of videoIdsToAdd) {
      if (existingVideoIds.has(vId)) {
        skippedVideoIds.push(vId);
      } else {
        toAdd.push(vId);
      }
    }

    const intents: AddIntent[] = toAdd.map(videoId => ({
      action: 'ADD',
      playlistId,
      videoId,
      postcondition: { check: 'PRESENT', videoId }
    }));

    const rollbackIntent: RollbackIntent = {
      kind: 'UNDO_ADDED',
      targetPlaylistId: playlistId,
      undoMembership: toAdd.map(videoId => ({ videoId }))
    };

    return {
      targetPlaylistId: playlistId,
      beforeTrackCount: existingItems.length,
      afterTrackCount: existingItems.length + toAdd.length,
      intents,
      skippedVideoIds,
      summary: {
        addedCount: toAdd.length,
        removedCount: 0,
        movedCount: 0,
        skippedCount: skippedVideoIds.length
      },
      rollbackIntent,
      isApproved: false
    };
  }

  /**
   * Plan removing tracks from a playlist.
   * Generates RollbackIntent with relative position anchors (P0-E, Review §20).
   */
  public static planRemoveTracks(
    playlistId: string,
    existingItems: PlaylistItem[],
    itemsToRemove: Array<{ videoId: string; remoteItemId: string }>
  ): ChangePlan {
    const removeSet = new Set(itemsToRemove.map(i => i.remoteItemId));

    const intents: RemoveIntent[] = itemsToRemove.map(item => ({
      action: 'REMOVE',
      playlistId,
      videoId: item.videoId,
      remoteItemId: item.remoteItemId,
      postcondition: { check: 'ABSENT', remoteItemId: item.remoteItemId }
    }));

    // Build relative anchors for rollback (Review §20)
    const restoreEntries: RestoreMembershipEntry[] = [];
    for (let i = 0; i < existingItems.length; i++) {
      const cur = existingItems[i]!;
      if (removeSet.has(cur.remoteItemId)) {
        const videoId = itemsToRemove.find(it => it.remoteItemId === cur.remoteItemId)?.videoId ?? '';

        // Predecessor in Base
        const pred = i > 0 ? existingItems[i - 1]?.remoteItemId : undefined;
        // Successor in Base
        const succ = i + 1 < existingItems.length ? existingItems[i + 1]?.remoteItemId : undefined;

        restoreEntries.push({
          videoId,
          originalPosition: cur.position, // Diagnostic only
          predecessorVideoId: pred,
          successorVideoId: succ
        });
      }
    }

    const rollbackIntent: RollbackIntent = {
      kind: 'RESTORE_REMOVED',
      targetPlaylistId: playlistId,
      restoreMembership: restoreEntries
    };

    return {
      targetPlaylistId: playlistId,
      beforeTrackCount: existingItems.length,
      afterTrackCount: Math.max(0, existingItems.length - intents.length),
      intents,
      skippedVideoIds: [],
      summary: {
        addedCount: 0,
        removedCount: intents.length,
        movedCount: 0,
        skippedCount: 0
      },
      rollbackIntent,
      isApproved: false
    };
  }

  /**
   * Plan moving a track within a playlist.
   */
  public static planMoveTrack(
    playlistId: string,
    existingItems: PlaylistItem[],
    itemToMove: PlaylistItem,
    targetIndex: number,
    videoId: string
  ): ChangePlan {
    const compiled = MoveOperationCompiler.compileMove(existingItems, itemToMove, targetIndex);

    const intent: MoveIntent = {
      action: 'MOVE',
      playlistId,
      videoId,
      remoteItemId: itemToMove.remoteItemId,
      anchor: compiled.anchor,
      postcondition: {
        check: 'AT_RELATIVE_POSITION',
        remoteItemId: itemToMove.remoteItemId,
        relativeAnchor: compiled.anchor
      }
    };

    const rollbackIntent: RollbackIntent = {
      kind: 'UNDO_MOVED',
      targetPlaylistId: playlistId,
      undoMove: {
        videoId,
        originalPosition: itemToMove.position,
        predecessorVideoId: itemToMove.position > 0 ? existingItems[itemToMove.position - 1]?.remoteItemId : undefined,
        successorVideoId: itemToMove.position + 1 < existingItems.length ? existingItems[itemToMove.position + 1]?.remoteItemId : undefined
      }
    };

    return {
      targetPlaylistId: playlistId,
      beforeTrackCount: existingItems.length,
      afterTrackCount: existingItems.length,
      intents: [intent],
      skippedVideoIds: [],
      summary: {
        addedCount: 0,
        removedCount: 0,
        movedCount: 1,
        skippedCount: 0
      },
      rollbackIntent,
      isApproved: false
    };
  }
}
