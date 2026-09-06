/**
 * Server-only, cross-instance rate limiting backed by Upstash Redis.
 *
 * State lives in Redis (@upstash/ratelimit fixed-window counters), so limits
 * hold across serverless cold starts and concurrent instances - never in
 * process memory.
 *
 * Configure:
 *   UPSTASH_REDIS_REST_URL=   (Upstash console -> REST API)
 *   UPSTASH_REDIS_REST_TOKEN=
 *
 * When the Upstash env vars are missing (local dev / unconfigured deploy)
 * the limiter fails OPEN with a server-side error log, so apps keep working
 * but the gap is loud in logs. Production deployments must set both vars.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv();
  }
} catch {
  redis = null;
}

let warnedUnconfigured = false;
const limiters = new Map<string, Ratelimit>();

function limiterFor(prefix: string, max: number, windowSeconds: number): Ratelimit | null {
  if (!redis) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.error(
        "[ratelimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set - " +
          "rate limiting is DISABLED. Set both vars in production."
      );
    }
    return null;
  }
  let rl = limiters.get(prefix);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(max, `${windowSeconds} s`),
      prefix: `hcratelimit:${prefix}`,
    });
    limiters.set(prefix, rl);
  }
  return rl;
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds the client should wait before retrying (Retry-After). */
  retryAfterSeconds: number;
}

/**
 * Consumes one token for the caller's IP. A Redis outage or a missing
 * configuration fails OPEN (request allowed) rather than locking everyone
 * out - the limiter is an abuse guard, not an availability dependency.
 */
export async function enforceRateLimit(
  request: Request,
  prefix: string,
  max: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const rl = limiterFor(prefix, max, windowSeconds);
  if (!rl) return { ok: true, retryAfterSeconds: 0 };

  try {
    const { success, reset } = await rl.limit(clientIp(request));
    return {
      ok: success,
      retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch (err) {
    console.error("[ratelimit] limiter unavailable, allowing request:", err);
    return { ok: true, retryAfterSeconds: 0 };
  }
}
