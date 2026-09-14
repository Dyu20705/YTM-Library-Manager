export interface FeedbackTokens {
  add?: string;
  remove?: string;
}

/**
 * Infrastructure-only ephemeral cache (INV-018, P0-1).
 * NEVER persisted to SQLite, OperationLog, ChangePlan, or logs.
 * Cleared on each new sync session.
 */
export class RemoteObservationCache {
  private currentSessionId: string | null = null;
  private cache = new Map<string, FeedbackTokens>();

  public startSession(sessionId: string): void {
    if (this.currentSessionId !== sessionId) {
      this.clear();
      this.currentSessionId = sessionId;
    }
  }

  public getSessionId(): string | null {
    return this.currentSessionId;
  }

  public getTokens(videoId: string): FeedbackTokens | undefined {
    return this.cache.get(videoId);
  }

  public setTokens(videoId: string, tokens: FeedbackTokens): void {
    this.cache.set(videoId, tokens);
  }

  public invalidate(videoId: string): void {
    this.cache.delete(videoId);
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}
