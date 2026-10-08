import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MigrationRunner } from '../../src/storage/migrations.js';
import { ReconciliationEngine } from '../../src/reconciliation/reconciliation_engine.js';
import { ChangePlanner } from '../../src/planner/change_planner.js';
import { OccurrenceItem } from '../../src/reconciliation/delta_classifier.js';

const base: OccurrenceItem[] = ['A', 'B', 'C', 'D'].map((videoId, position) => ({ videoId, remoteItemId: `r${videoId}`, position }));
describe('Occurrence-safe rollback', () => {
  it('restores adjacent removals in order using evolving occurrence anchors', () => {
    const items = base.map((i, id) => ({ id, trackId: id, playlistId: 'PL', remoteItemId: i.remoteItemId!, position: id, addedAt: null }));
    const plan = ChangePlanner.planRemoveTracks('PL', items, [{ videoId: 'B', remoteItemId: 'rB' }, { videoId: 'C', remoteItemId: 'rC' }]);
    expect(plan.rollbackIntent.restoreMembership?.[0]).toMatchObject({ remoteItemId: 'rB', predecessorRemoteItemId: 'rA', successorRemoteItemId: 'rC' });
    const result = ReconciliationEngine.reconcileRollback(base, [base[0]!, base[3]!], plan.rollbackIntent);
    expect(result.reconciledOrder).toEqual(['A', 'B', 'C', 'D']);
  });
  it('undoes only the bound added occurrence and preserves external duplicates', () => {
    const current = [...base, { videoId: 'X', remoteItemId: 'ours', position: 4 }, { videoId: 'X', remoteItemId: 'external', position: 5 }];
    const result = ReconciliationEngine.reconcileRollback(base, current, { kind: 'UNDO_ADDED', targetPlaylistId: 'PL', undoMembership: [{ videoId: 'X', remoteItemId: 'ours' }] });
    expect(result.reconciledItems?.map(i => i.remoteItemId)).toEqual(['rA', 'rB', 'rC', 'rD', 'external']);
    expect(ReconciliationEngine.reconcileRollback(base, current, { kind: 'UNDO_ADDED', targetPlaylistId: 'PL', undoMembership: [{ videoId: 'X' }] }).state).toBe('CONFLICT');
  });
  it('undoes a move and detects reversed/missing anchors', () => {
    const undoMove = { videoId: 'B', remoteItemId: 'rB', predecessorRemoteItemId: 'rA', successorRemoteItemId: 'rC' };
    const intent = { kind: 'UNDO_MOVED' as const, targetPlaylistId: 'PL', undoMove };
    expect(ReconciliationEngine.reconcileRollback(base, [base[0]!, base[2]!, base[3]!, base[1]!], intent).reconciledOrder).toEqual(['A', 'B', 'C', 'D']);
    expect(ReconciliationEngine.reconcileRollback(base, [base[1]!, base[3]!], intent).state).toBe('CONFLICT');
  });
  it('deduplicates additions within the same plan', () => {
    expect(ChangePlanner.planAddTracks('PL', [], new Set(), ['A', 'A']).intents).toHaveLength(1);
  });
});

it('backs up committed WAL data before destructive migration, including on migration failure', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ytm-wal-'));
  const file = path.join(dir, 'library.db');
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE important(value TEXT); INSERT INTO important VALUES (\'committed in WAL\')');
    const runner = new MigrationRunner(db, file);
    expect(() => runner.apply([{ version: 1, description: 'Failing migration', isDestructive: true,
      up(connection) { connection.exec('DROP TABLE important'); throw new Error('failure'); } }])).toThrow('failure');
    const backup = new DatabaseSync(path.join(dir, readdirSync(dir).find(n => n.includes('.bak.'))!), { readOnly: true });
    try { expect(backup.prepare('SELECT value FROM important').get()).toMatchObject({ value: 'committed in WAL' }); }
    finally { backup.close(); }
    expect(db.prepare('SELECT value FROM important').get()).toMatchObject({ value: 'committed in WAL' });
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
