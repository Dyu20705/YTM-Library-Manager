import { MutationIntent, MutationState, RemoteMutationResult } from './mutation.js';

export interface RestoreMembershipEntry {
  videoId: string;
  remoteItemId?: string; // Occurrence identity (setVideoId)
  predecessorVideoId?: string; // Anchor: item before in Base state
  successorVideoId?: string;   // Anchor: item after in Base state
  predecessorRemoteItemId?: string;
  successorRemoteItemId?: string;
  originalPosition?: number;   // DIAGNOSTIC ONLY — not used for restore logic
}

export type RollbackIntentKind = 'RESTORE_REMOVED' | 'UNDO_ADDED' | 'UNDO_MOVED';

export interface RollbackIntent {
  kind: RollbackIntentKind;
  targetPlaylistId: string;
  restoreMembership?: RestoreMembershipEntry[];
  undoMembership?: Array<{ videoId: string; remoteItemId?: string }>;
  undoMove?: {
    videoId: string;
    remoteItemId?: string;
    originalPosition?: number; // diagnostic only
    predecessorVideoId?: string;
    successorVideoId?: string;
    predecessorRemoteItemId?: string;
    successorRemoteItemId?: string;
  };
}

export type OperationType = 'ADD_TRACKS' | 'REMOVE_TRACKS' | 'MOVE_TRACK' | 'DEDUPLICATE';

export interface OperationLog {
  id: string;
  createdAt: Date;
  targetPlaylistId: string;
  type: OperationType;
  state: MutationState;
  failureReason?: string | null;
  failureMessage?: string | null;
  preconditions: {
    expectedTrackCount: number;
    observedFingerprint?: string;
  };
  intendedChanges: MutationIntent[];
  actualResults?: RemoteMutationResult | null;
  rollbackIntent?: RollbackIntent | null;
}
