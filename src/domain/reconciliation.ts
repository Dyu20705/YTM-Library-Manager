export type ReconciliationOutcome =
  | 'EFFECT_SATISFIED'    // Desired postcondition holds in current remote state
  | 'MISSING_EFFECT'      // Desired postcondition NOT met; retry is needed
  | 'CONFLICT'            // Ambiguous or externally conflicting state
  | 'INDETERMINATE';      // Cannot determine (e.g. remote fetch failed)

export type DeltaType = 'ADDED' | 'REMOVED' | 'MOVED' | 'UNCHANGED';

export interface OccurrenceDelta {
  videoId: string;
  remoteItemId?: string;
  delta: DeltaType;
  basePosition?: number;
  currentPosition?: number;
}
