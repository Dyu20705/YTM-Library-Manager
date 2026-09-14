import { DatabaseSync } from 'node:sqlite';

export interface IntegrityCheckResult {
  isHealthy: boolean;
  quickCheckPassed: boolean;
  diagnosticMessages: string[];
  recommendation?: 'NONE' | 'RESTORE_FROM_BACKUP' | 'RECREATE_FROM_SYNC';
}

export class DatabaseIntegrityDiagnostic {
  /**
   * Run quick_check first. Only escalate to full integrity_check if quick_check fails.
   * Diagnostic only; never claims to repair.
   */
  static check(db: DatabaseSync): IntegrityCheckResult {
    try {
      const quickRows = db.prepare('PRAGMA quick_check;').all() as Array<{ quick_check: string }>;
      const quickPassed = quickRows.length === 1 && quickRows[0]?.quick_check === 'ok';

      if (quickPassed) {
        return {
          isHealthy: true,
          quickCheckPassed: true,
          diagnosticMessages: ['ok'],
          recommendation: 'NONE'
        };
      }

      // Escalate to full integrity check
      const fullRows = db.prepare('PRAGMA integrity_check;').all() as Array<{ integrity_check: string }>;
      const messages = fullRows.map(r => r.integrity_check);
      const isHealthy = messages.length === 1 && messages[0] === 'ok';

      return {
        isHealthy,
        quickCheckPassed: false,
        diagnosticMessages: messages,
        recommendation: isHealthy ? 'NONE' : 'RESTORE_FROM_BACKUP'
      };
    } catch (err) {
      return {
        isHealthy: false,
        quickCheckPassed: false,
        diagnosticMessages: [err instanceof Error ? err.message : String(err)],
        recommendation: 'RECREATE_FROM_SYNC'
      };
    }
  }
}
