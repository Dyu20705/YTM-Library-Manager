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

    return sanitized;
  }
}
