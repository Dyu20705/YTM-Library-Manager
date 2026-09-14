/**
 * YTM Library Manager — Invariants Catalog (INV-001 through INV-023)
 * As defined in docs/v1/v1.1.2_final_contract_patch.md
 */

export const INVARIANTS = {
  INV_001: 'INV-001: tracks.video_id is unique.',
  INV_002: 'INV-002: tracks.id is stable: once assigned for a video_id, it never changes.',
  INV_003: 'INV-003: playlist_items.track_id always references an existing tracks.id.',
  INV_004: 'INV-004: playlist_items.remote_item_id is unique within a playlist.',
  INV_005: 'INV-005: playlist_items positions are monotonically ordered per playlist (gaps permitted).',
  INV_006: 'INV-006: No remote mutation without an approved ChangePlan.',
  INV_007: 'INV-007: UNKNOWN cannot transition directly to RETRY. Must pass through RECONCILING first.',
  INV_008: 'INV-008: Rollback creates a new OperationLog entry (never mutates old entries except to mark status = ROLLED_BACK).',
  INV_009: 'INV-009: A COMPLETED operation is immutable in its intendedChanges and actualResults fields.',
  INV_010: 'INV-010: A COMMITTED checkpoint implies the corresponding data has been committed in the same transaction.',
  INV_011: 'INV-011: A resumed sync is idempotent: re-processing a committed playlist produces no duplicates (enforced by UPSERT + DELETE-then-INSERT).',
  INV_012: 'INV-012: Local canonical state is never advanced from an UNKNOWN mutation without reconciliation.',
  INV_013: 'INV-013: No authentication secret (cookie, token, header) is stored in SQLite.',
  INV_014: 'INV-014: No authentication secret is written to any log output.',
  INV_015: 'INV-015: Application layer cannot access authentication secrets by type/interface contract (compile-time enforced).',
  INV_016: 'INV-016: For every committed tracks row, the corresponding FTS row is either consistent or SearchStatus = DEGRADED.',
  INV_017: 'INV-017: sync_staging is unique by (session_id, playlist_id, remote_item_id).',
  INV_018: 'INV-018: Remote feedback tokens are ephemeral and never persisted in SQLite, logs, OperationLog, or crash reports.',
  INV_019: 'INV-019: Mutation postconditions determine reconciliation outcome.',
  INV_020: 'INV-020: Application layer cannot access authentication headers/tokens by type/interface.',
  INV_021: 'INV-021: A CONFLICT operation cannot auto-apply remote mutations without user review (V1 policy).',
  INV_022: 'INV-022: Rollback uses relative anchors (predecessor/successor) as authoritative restore positions. Absolute position is diagnostic only.',
  INV_023: 'INV-023: Local state must not claim REMOTE_SYNCED after UNKNOWN or CONFLICT without successful reconciliation.',
} as const;

export class InvariantViolationError extends Error {
  constructor(public readonly invariantCode: keyof typeof INVARIANTS, message: string) {
    super(`[${invariantCode}] Violation: ${message}`);
    this.name = 'InvariantViolationError';
  }
}

export function assertInvariant(
  condition: boolean,
  invariantCode: keyof typeof INVARIANTS,
  detailMessage?: string
): asserts condition {
  if (!condition) {
    throw new InvariantViolationError(
      invariantCode,
      detailMessage ? `${INVARIANTS[invariantCode]} — ${detailMessage}` : INVARIANTS[invariantCode]
    );
  }
}
