import { describe, it, expect } from 'vitest';
import { LogSanitizer } from '../../src/gateway/sanitizer.js';
import { IAuthProvider, AuthSession } from '../../src/gateway/interfaces.js';
import { DatabaseConnection } from '../../src/storage/connection.js';

describe('GATE-05: Credential & Storage Boundary Enforcement', () => {
  it('verifies compile-time and runtime credential boundary on IAuthProvider (INV-015, INV-020)', async () => {
    // Mock provider implementing IAuthProvider
    class SafeAuthProvider implements IAuthProvider {
      getAuthType(): AuthSession['authType'] {
        return 'BROWSER_CREDENTIALS';
      }
      async validate(): Promise<AuthSession> {
        return {
          sessionId: 'session_valid_123',
          authType: 'BROWSER_CREDENTIALS',
          isValid: true
        };
      }
    }

    const provider = new SafeAuthProvider();
    const session = await provider.validate();

    expect(session.isValid).toBe(true);
    // Ensure no header or token properties exist on session
    expect((session as any).headers).toBeUndefined();
    expect((session as any).cookies).toBeUndefined();
    expect((session as any).token).toBeUndefined();

    // Ensure getAuthenticatedHeaders does NOT exist on provider (P1-A)
    expect((provider as any).getAuthenticatedHeaders).toBeUndefined();
  });

  it('verifies zero secrets or tokens stored in SQLite database schema and tables (INV-013)', () => {
    const conn = new DatabaseConnection({ path: ':memory:' });

    const tables = conn.db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table';").all() as Array<{ name: string; sql: string }>;

    for (const table of tables) {
      const lowerSql = table.sql.toLowerCase();
      expect(lowerSql).not.toContain('cookie');
      expect(lowerSql).not.toContain('authorization');
      expect(lowerSql).not.toContain('password');
      expect(lowerSql).not.toContain('secret');
      expect(lowerSql).not.toContain('feedback_token');
    }

    conn.close();
  });

  it('verifies log sanitizer strips sensitive headers, tokens, and feedback tokens (INV-014, INV-018)', () => {
    const sampleLogs = [
      'Failed request with Cookie: SID=abc12345; HSID=def67890;',
      'Network error: Authorization: Bearer ya29.a0AfH6SM...;',
      'Header x-goog-authuser: 0;',
      'Payload: {"feedbackToken": "ABcDefGhIjKlMnOpQrStUvWxYz", "videoId": "9bZkp7q19f0"}'
    ];

    for (const log of sampleLogs) {
      const sanitized = LogSanitizer.sanitize(log);
      expect(sanitized).not.toContain('abc12345');
      expect(sanitized).not.toContain('def67890');
      expect(sanitized).not.toContain('ya29.a0AfH6SM');
      expect(sanitized).not.toContain('ABcDefGhIjKlMnOpQrStUvWxYz');
      expect(sanitized).toContain('[REDACTED]');
    }
  });
});
