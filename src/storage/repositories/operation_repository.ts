import { DatabaseSync } from 'node:sqlite';
import { OperationLog, OperationType } from '../../domain/operation.js';
import { MutationIntent, MutationState, RemoteMutationResult } from '../../domain/mutation.js';
import { assertInvariant } from '../../domain/invariants.js';
import { LogSanitizer } from '../../gateway/sanitizer.js';

export class OperationRepository {
  constructor(private readonly db: DatabaseSync) {}

  public logOperation(op: OperationLog): void {
    const stmt = this.db.prepare(`
      INSERT INTO operations (
        id, created_at, target_playlist_id, type, state,
        failure_reason, failure_message, preconditions,
        intended_changes, actual_results, rollback_intent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    stmt.run(
      op.id,
      op.createdAt.toISOString(),
      op.targetPlaylistId,
      op.type,
      op.state,
      op.failureReason ?? null,
      op.failureMessage ? LogSanitizer.sanitize(op.failureMessage) : null,
      LogSanitizer.sanitize(JSON.stringify(op.preconditions)),
      LogSanitizer.sanitize(JSON.stringify(op.intendedChanges)),
      op.actualResults ? LogSanitizer.sanitize(JSON.stringify(op.actualResults)) : null,
      op.rollbackIntent ? LogSanitizer.sanitize(JSON.stringify(op.rollbackIntent)) : null
    );
  }

  public getOperation(id: string): OperationLog | null {
    const row = this.db.prepare(`
      SELECT id, created_at, target_playlist_id, type, state,
             failure_reason, failure_message, preconditions,
             intended_changes, actual_results, rollback_intent
      FROM operations
      WHERE id = ?;
    `).get(id) as any;

    if (!row) return null;
    return {
      id: row.id,
      createdAt: new Date(row.created_at),
      targetPlaylistId: row.target_playlist_id,
      type: row.type as OperationType,
      state: row.state as MutationState,
      failureReason: row.failure_reason,
      failureMessage: row.failure_message,
      preconditions: JSON.parse(row.preconditions),
      intendedChanges: JSON.parse(row.intended_changes) as MutationIntent[],
      actualResults: row.actual_results ? JSON.parse(row.actual_results) as RemoteMutationResult : null,
      rollbackIntent: row.rollback_intent ? JSON.parse(row.rollback_intent) : null
    };
  }

  /**
   * Update operation state, ensuring immutability invariant (INV-009):
   * A COMPLETED operation cannot have its intendedChanges or actualResults modified.
   */
  public updateState(
    id: string,
    newState: MutationState,
    actualResults?: RemoteMutationResult,
    failureReason?: string,
    failureMessage?: string
  ): void {
    const existing = this.getOperation(id);
    if (!existing) {
      throw new Error(`Operation with ID ${id} not found.`);
    }

    if (existing.state === 'COMPLETED' && newState !== 'ROLLED_BACK') {
      assertInvariant(false, 'INV_009', 'Cannot modify COMPLETED operation except to mark ROLLED_BACK');
    }

    const stmt = this.db.prepare(`
      UPDATE operations
      SET state = ?,
          actual_results = COALESCE(?, actual_results),
          failure_reason = COALESCE(?, failure_reason),
          failure_message = COALESCE(?, failure_message)
      WHERE id = ?;
    `);

    stmt.run(
      newState,
      actualResults ? LogSanitizer.sanitize(JSON.stringify(actualResults)) : null,
      failureReason ?? null,
      failureMessage ? LogSanitizer.sanitize(failureMessage) : null,
      id
    );
  }

  public listOperations(limit = 50): OperationLog[] {
    const rows = this.db.prepare(`
      SELECT id, created_at, target_playlist_id, type, state,
             failure_reason, failure_message, preconditions,
             intended_changes, actual_results, rollback_intent
      FROM operations
      ORDER BY created_at DESC
      LIMIT ?;
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      createdAt: new Date(row.created_at),
      targetPlaylistId: row.target_playlist_id,
      type: row.type as OperationType,
      state: row.state as MutationState,
      failureReason: row.failure_reason,
      failureMessage: row.failure_message,
      preconditions: JSON.parse(row.preconditions),
      intendedChanges: JSON.parse(row.intended_changes) as MutationIntent[],
      actualResults: row.actual_results ? JSON.parse(row.actual_results) as RemoteMutationResult : null,
      rollbackIntent: row.rollback_intent ? JSON.parse(row.rollback_intent) : null
    }));
  }
}
