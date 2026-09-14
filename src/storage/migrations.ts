import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';

export interface Migration {
  version: number;
  description: string;
  isDestructive?: boolean;
  up(db: DatabaseSync): void;
}

export class MigrationRunner {
  constructor(private readonly db: DatabaseSync, private readonly dbFilePath?: string) {
    this.ensureMigrationTable();
  }

  private ensureMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  public getCurrentVersion(): number {
    const row = this.db.prepare('SELECT MAX(version) as current_version FROM schema_migrations;').get() as { current_version: number | null };
    return row?.current_version ?? 0;
  }

  public apply(migrations: Migration[]): void {
    const currentVersion = this.getCurrentVersion();
    const pending = migrations
      .filter(m => m.version > currentVersion)
      .sort((a, b) => a.version - b.version);

    for (const migration of pending) {
      // If destructive and file path exists, backup before applying
      if (migration.isDestructive && this.dbFilePath && this.dbFilePath !== ':memory:' && fs.existsSync(this.dbFilePath)) {
        const backupPath = `${this.dbFilePath}.bak.${Date.now()}`;
        fs.copyFileSync(this.dbFilePath, backupPath);
      }

      this.db.exec('BEGIN TRANSACTION;');
      try {
        migration.up(this.db);
        const stmt = this.db.prepare('INSERT INTO schema_migrations (version, description) VALUES (?, ?);');
        stmt.run(migration.version, migration.description);
        this.db.exec('COMMIT;');
      } catch (err) {
        this.db.exec('ROLLBACK;');
        throw new Error(`Failed to apply migration v${migration.version} (${migration.description}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
