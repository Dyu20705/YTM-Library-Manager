/**
 * Log and Crash Sanitizer (INV-014, INV-018, Gate-05).
 * Strips Cookie, Authorization, x-goog-authuser, and feedback tokens from log output.
 */
export class LogSanitizer {
  // Matches Cookie header and all its key=value pairs
  private static readonly COOKIE_HEADER_REGEX =
    /cookie\s*:\s*[^;\r\n]+(?:;\s*[^;\r\n]+)*/gi;

  // Matches Authorization and other sensitive headers
  private static readonly AUTH_HEADER_REGEX =
    /(?:authorization|x-goog-authuser)\s*:\s*[^;\r\n]+/gi;

  // Matches json fields containing tokens/secrets
  private static readonly SENSITIVE_JSON_FIELD_REGEX =
    /"(?:cookie|authorization|token|feedbackToken|feedbackTokens|addToken|removeToken)"\s*:\s*"(?:[^"\\]|\\.)*"/gi;

  public static sanitize(text: string): string {
    // Structured secrets can be objects/arrays, not just string-valued fields.
    try {
      const parsed = JSON.parse(text);
      const redact = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(redact);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) =>
          [key, /cookie|authorization|token|secret|password|x-goog-authuser|authfile/i.test(key) ? '[REDACTED]' : redact(child)]));
        if (typeof value === 'string') return this.sanitizePlainText(value);
        return value;
      };
      return JSON.stringify(redact(parsed));
    } catch { return this.sanitizePlainText(text); }
  }

  private static sanitizePlainText(text: string): string {
    let sanitized = text;

    sanitized = sanitized.replace(this.COOKIE_HEADER_REGEX, 'Cookie: [REDACTED]');
    sanitized = sanitized.replace(this.AUTH_HEADER_REGEX, match => {
      const parts = match.split(':');
      return `${parts[0]}: [REDACTED]`;
    });
    sanitized = sanitized.replace(this.SENSITIVE_JSON_FIELD_REGEX, match => {
      const parts = match.split(':');
      return `${parts[0]}: "[REDACTED]"`;
    });
    sanitized = sanitized.replace(/(["'](?:feedbackTokens?|listenAgainFeedbackTokens|oauth|access_token|refresh_token)["']\s*:\s*)(\{[^}]*\}|\[[^\]]*\])/gi, '$1"[REDACTED]"');

    return sanitized;
  }
}
