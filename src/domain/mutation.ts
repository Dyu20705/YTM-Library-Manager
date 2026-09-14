export type MoveAnchor =
  | { type: 'BEFORE'; remoteItemId: string }
  | { type: 'END' };

export type MutationPostcondition =
  | { check: 'PRESENT'; videoId: string }
  | { check: 'ABSENT'; remoteItemId: string }
  | { check: 'AT_RELATIVE_POSITION'; remoteItemId: string; relativeAnchor: MoveAnchor };

export interface AddIntent {
  action: 'ADD';
  playlistId: string;
  videoId: string;
  postcondition: { check: 'PRESENT'; videoId: string };
}

export interface RemoveIntent {
  action: 'REMOVE';
  playlistId: string;
  videoId: string;
  remoteItemId: string; // REQUIRED: which specific occurrence to remove
  postcondition: { check: 'ABSENT'; remoteItemId: string };
}

export interface MoveIntent {
  action: 'MOVE';
  playlistId: string;
  videoId: string;
  remoteItemId: string; // REQUIRED: which occurrence to move
  anchor: MoveAnchor;
  postcondition: {
    check: 'AT_RELATIVE_POSITION';
    remoteItemId: string;
    relativeAnchor: MoveAnchor;
  };
}

export type MutationIntent = AddIntent | RemoveIntent | MoveIntent;

export type MutationState =
  | 'DRAFT'
  | 'READY'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'PARTIAL_SUCCESS'
  | 'FAILED'
  | 'UNKNOWN'
  | 'RECONCILING'
  | 'CONFLICT'
  | 'ROLLED_BACK';

export interface AppliedItem {
  videoId: string;
  remoteItemId?: string; // Present for ADD (newly assigned), always present for REMOVE/MOVE
}

export interface FailedItem {
  videoId: string;
  error: string;
}

export interface UnknownItem {
  videoId: string;
}

export interface RemoteMutationResult {
  operationId: string;
  state: MutationState;
  requestedCount: number;
  appliedCount: number;
  failedCount: number;
  unknownCount: number;
  appliedItems: AppliedItem[];
  failedItems: FailedItem[];
  unknownItems: UnknownItem[];
  remoteObservedAt: Date;
  remoteRevision?: string;
}
