/**
 * Rate limiting and security features
 * Implements token bucket algorithm for request throttling
 */

import {
  RateLimitConfig,
  RateLimitResult,
  RateLimitEntry,
  RateLimitError,
} from './types.js';

export class RateLimiter {
  private limits: Map<string, RateLimitEntry>;
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimitConfig) {
    this.limits = new Map();
    this.config = config;

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Check if request is allowed under rate limit
   * @param identifier Unique identifier (e.g., agent ID, IP address)
   * @returns Rate limit result
   */
  checkLimit(identifier: string): RateLimitResult {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    // No previous requests from this identifier
    if (!entry) {
      this.limits.set(identifier, {
        count: 1,
        resetAt: now + this.config.windowMs,
      });

      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime: now + this.config.windowMs,
      };
    }

    // Reset window has passed
    if (now >= entry.resetAt) {
      this.limits.set(identifier, {
        count: 1,
        resetAt: now + this.config.windowMs,
      });

      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime: now + this.config.windowMs,
      };
    }

    // Within window - check limit
    if (entry.count >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetAt,
        retryAfter: entry.resetAt - now,
      };
    }

    // Increment count
    entry.count++;
    this.limits.set(identifier, entry);

    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      resetTime: entry.resetAt,
    };
  }

  /**
   * Get current rate limit status without incrementing
   * @param identifier Unique identifier
   * @returns Current status
   */
  getStatus(identifier: string): RateLimitResult {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    if (!entry || now >= entry.resetAt) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
      };
    }

    return {
      allowed: entry.count < this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetTime: entry.resetAt,
      retryAfter: entry.count >= this.config.maxRequests ? entry.resetAt - now : undefined,
    };
  }

  /**
   * Reset rate limit for an identifier
   * @param identifier Unique identifier
   */
  reset(identifier: string): void {
    this.limits.delete(identifier);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.limits.clear();
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [identifier, entry] of this.limits.entries()) {
      if (now >= entry.resetAt + this.config.windowMs) {
        toDelete.push(identifier);
      }
    }

    toDelete.forEach((id) => this.limits.delete(id));

    if (toDelete.length > 0) {
      console.log(`Cleaned up ${toDelete.length} expired rate limit entries`);
    }
  }

  /**
   * Stop the rate limiter and cleanup
   */
  stop(): void {
    clearInterval(this.cleanupInterval);
    this.limits.clear();
  }

  /**
   * Get statistics about rate limiting
   */
  getStats(): {
    totalTracked: number;
    limitedIdentifiers: number;
    averageUsage: number;
  } {
    const now = Date.now();
    let limitedCount = 0;
    let totalUsage = 0;
    let activeCount = 0;

    for (const entry of this.limits.values()) {
      if (now < entry.resetAt) {
        activeCount++;
        totalUsage += entry.count;
        if (entry.count >= this.config.maxRequests) {
          limitedCount++;
        }
      }
    }

    return {
      totalTracked: this.limits.size,
      limitedIdentifiers: limitedCount,
      averageUsage: activeCount > 0 ? totalUsage / activeCount : 0,
    };
  }
}

// Export singleton instance with default config
export const rateLimiter = new RateLimiter({
  maxRequests: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '60'),
  windowMs: 60000, // 1 minute
});

/**
 * Middleware function to check rate limit and throw if exceeded
 * @param identifier Unique identifier
 */
export function enforceRateLimit(identifier: string): void {
  const result = rateLimiter.checkLimit(identifier);
  
  if (!result.allowed) {
    throw new RateLimitError(
      `Rate limit exceeded. Please try again in ${Math.ceil((result.retryAfter || 0) / 1000)} seconds.`,
      result.retryAfter || 0
    );
  }
}
