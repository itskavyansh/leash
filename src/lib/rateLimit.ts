interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * In-memory rate limiter: max 20 requests per minute per identifier/IP.
 * Returns true if allowed, false if limit exceeded.
 */
export function checkRateLimit(
  identifier: string,
  limit: number = 20,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count };
}

/**
 * Resets rate limit entries (useful for testing).
 */
export function resetRateLimits(): void {
  rateLimitMap.clear();
}
