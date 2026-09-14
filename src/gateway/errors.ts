export type RemoteErrorCode =
  | 'AUTH_EXPIRED'            // Session or cookie expired
  | 'PERMISSION_DENIED'       // Playlist of another user, not editable
  | 'RATE_LIMITED'            // Server rate-limited / backoff required
  | 'NETWORK_UNAVAILABLE'     // Network drop / timeout
  | 'REMOTE_UNAVAILABLE'      // YouTube Music server 5xx
  | 'INVALID_REQUEST'         // Malformed payload
  | 'UNSUPPORTED_OPERATION';  // E.g. reordering on Liked Music

export class RemoteError extends Error {
  constructor(
    public readonly code: RemoteErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly cause?: unknown
  ) {
    super(`[RemoteError: ${code}] ${message}`);
    this.name = 'RemoteError';
  }
}
