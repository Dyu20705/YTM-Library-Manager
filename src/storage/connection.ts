import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DatabaseConnectionOptions {
  path?: string; // ':memory:' or file path
  schemaPath?: string;
}

export class DatabaseConnection {
  public readonly db: DatabaseSync;
  private readonly dbPath: string;

  constructor(options: DatabaseConnectionOptions = {}) {
    this.dbPath = options.path ?? ':memory:';
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(this.dbPath);
    this.configurePragmas();

    const schemaFile = options.schemaPath ?? path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaFile)) {
      this.initSchema(schemaFile);
    }
  }

  private configurePragmas(): void {
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (this.dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }
  }

  public initSchema(schemaPath: string): void {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    this.db.exec(sql);
  }

  public transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  public close(): void {
    this.db.close();
  }

  public getPath(): string {
    return this.dbPath;
  }
}
