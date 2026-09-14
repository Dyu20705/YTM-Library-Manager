import { SyncPolicy } from './types.js';

export function createDefaultSyncPolicy(): SyncPolicy {
  return {
    maxConcurrency: 1,
    baseDelayMs: 350,
    currentDelayMs: 350,
    maxRetries: 3,
    backoffFactor: 2.0,
    respectRetryAfterHeader: true
  };
}

export class AdaptiveSyncController {
  private policy: SyncPolicy;

  constructor(policy?: Partial<SyncPolicy>) {
    this.policy = { ...createDefaultSyncPolicy(), ...policy };
  }

  public getPolicy(): SyncPolicy {
    return { ...this.policy };
  }

  public async waitDelay(): Promise<void> {
    if (this.policy.currentDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.policy.currentDelayMs));
    }
  }

  public recordRateLimit(retryAfterSeconds?: number): number {
    if (retryAfterSeconds && retryAfterSeconds > 0) {
      this.policy.currentDelayMs = Math.max(this.policy.currentDelayMs, retryAfterSeconds * 1000);
    } else {
      this.policy.currentDelayMs = Math.round(this.policy.currentDelayMs * this.policy.backoffFactor);
    }
    return this.policy.currentDelayMs;
  }

  public recordSuccess(): void {
    // Gradually recover to base delay
    if (this.policy.currentDelayMs > this.policy.baseDelayMs) {
      this.policy.currentDelayMs = Math.max(
        this.policy.baseDelayMs,
        Math.round(this.policy.currentDelayMs * 0.8)
      );
    }
  }
}
