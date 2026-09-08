/**
 * Rate limiting.
 *
 * An in-process fixed-window counter. It is honest about what it is: on a
 * serverless platform each instance keeps its own counters, so the effective
 * limit is the configured limit multiplied by the number of warm instances.
 *
 * That is still worth having. It stops a single client hammering an endpoint in
 * a loop, which is the case that actually costs money here, and it costs nothing
 * to run. It is NOT a defence against a distributed attack, and it should be
 * replaced with Upstash Redis or the platform's own edge rate limiting before
 * this product carries real traffic. See 18_Security_Requirements.
 */

interface Window {
  count: number;
  resetAt: number;
}

const WINDOWS = new Map<string, Window>();
let lastSweep = Date.now();

function sweep(now: number): void {
  // Amortised cleanup rather than a timer, so nothing keeps the process alive.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, window] of WINDOWS) {
    if (window.resetAt < now) WINDOWS.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = WINDOWS.get(key);

  if (!existing || existing.resetAt < now) {
    const window: Window = { count: 1, resetAt: now + windowMs };
    WINDOWS.set(key, window);
    return {
      ok: true,
      limit,
      remaining: limit - 1,
      resetAt: window.resetAt,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const ok = existing.count <= limit;

  return {
    ok,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/**
 * Identify the caller.
 *
 * Prefers the authenticated user id, because that is stable and cannot be
 * spoofed by a header. Falls back to the forwarded IP. On Vercel, x-forwarded-for
 * is set by the platform and the left-most entry is the client.
 */
export function callerKey(request: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`;

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

export const LIMITS = {
  /** Reads are cheap but a scraper should still be slowed down. */
  search: { limit: 60, windowMs: 60_000 },
  /** Hits an upstream we do not own and must be protective of. */
  geocode: { limit: 20, windowMs: 60_000 },
  /** Pure computation but hits the database. */
  quote: { limit: 40, windowMs: 60_000 },
  /** Creates real inventory holds, so it is the one to guard hardest. */
  booking: { limit: 8, windowMs: 60_000 },
  /** Money. */
  payment: { limit: 10, windowMs: 60_000 },
  /** Writes that a bot could use to spam a counterparty. */
  message: { limit: 30, windowMs: 60_000 },
  /** Anything that sends an email or an SMS. */
  auth: { limit: 6, windowMs: 60_000 },
} as const;

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    ...(result.ok ? {} : { 'Retry-After': String(result.retryAfterSeconds) }),
  };
}
