import { Request, Response, NextFunction } from "express";
import { getOptionalRequire } from "../utils/optionalRequire";

const require = getOptionalRequire(import.meta.url);

/**
 * Sliding-window rate limiter with an optional Redis backend.
 *
 * By default this is in-memory (per-instance), which is fine for a single
 * server but resets on restart and doesn't share state across instances.
 * Setting REDIS_URL enables a shared Redis-backed counter for multi-instance
 * deployments. ioredis is loaded dynamically (CJS/ESM-safe, same pattern as
 * firebase-admin in auth.ts) so the app still boots on memory-only limiting
 * when the package isn't installed, REDIS_URL isn't set, or Redis is
 * unreachable — rate limiting fails OPEN to memory, it never blocks the app.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitResult {
  count: number;
  resetTime: number;
}

/** Minimal shape of the ioredis client methods this module relies on. */
interface RedisLikeClient {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  pttl(key: string): Promise<number>;
}

const memoryStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpiredMemoryEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of memoryStore) {
    if (now > entry.resetTime) {
      memoryStore.delete(key);
    }
  }
}

/** In-memory sliding-window counter. Always available, no external deps. */
export function checkMemoryLimit(key: string, windowMs: number): RateLimitResult {
  cleanupExpiredMemoryEntries();
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetTime) {
    const fresh: RateLimitEntry = { count: 1, resetTime: now + windowMs };
    memoryStore.set(key, fresh);
    return { ...fresh };
  }

  entry.count++;
  // Return a snapshot, not the live mutable entry — callers must not see
  // their result change out from under them if the store is touched again.
  return { ...entry };
}

/** Redis-backed sliding-window counter, given an already-connected client. */
export async function checkRedisLimit(
  client: RedisLikeClient,
  key: string,
  windowMs: number
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const count = await client.incr(redisKey);
  if (count === 1) {
    await client.pexpire(redisKey, windowMs);
  }
  const ttl = await client.pttl(redisKey);
  const resetTime = Date.now() + (ttl > 0 ? ttl : windowMs);
  return { count, resetTime };
}

/**
 * Resolves the request count for this window, preferring Redis when a
 * client is given and falling back to the in-memory store on any Redis
 * failure (timeout, connection error, etc.) so a Redis outage degrades
 * rate-limit accuracy per-instance instead of taking the app down.
 */
export async function resolveRateLimitCount(
  client: RedisLikeClient | null,
  key: string,
  windowMs: number
): Promise<RateLimitResult> {
  if (client) {
    try {
      return await checkRedisLimit(client, key, windowMs);
    } catch (err: any) {
      console.warn("[RATE-LIMIT] Redis request failed, falling back to in-memory limiter:", err.message);
    }
  }
  return checkMemoryLimit(key, windowMs);
}

let redisClient: RedisLikeClient | null = null;
let redisLoadAttempted = false;
let redisMarkedDown = false;

/**
 * Lazily constructs (once) and returns the optional Redis client, or null
 * when REDIS_URL isn't set, ioredis isn't installed, construction fails, or
 * a prior connection error has marked this process's Redis as down.
 *
 * lazyConnect + a null retryStrategy + a disabled offline queue + a short
 * connectTimeout mean a dead Redis fails fast on the first command instead
 * of hanging requests or silently queueing them forever. Once a connection
 * error fires, Redis is marked down for the rest of the process — without
 * that, every subsequent request would pay its own multi-second connection
 * attempt while Redis stays unreachable, turning "fallback" into a
 * self-inflicted slowdown on every request instead of a one-time cost.
 */
function getRedisClient(): RedisLikeClient | null {
  if (redisMarkedDown) return null;
  if (redisLoadAttempted) return redisClient;
  redisLoadAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    // ioredis is an optional peer dependency — loaded dynamically so the
    // app still starts if the package is not installed.
    const Redis = require("ioredis");
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
    client.on("error", (err: Error) => {
      if (!redisMarkedDown) {
        redisMarkedDown = true;
        console.warn(
          "[RATE-LIMIT] Redis connection error — falling back to in-memory limiting for the rest of this process:",
          err.message
        );
      }
    });
    redisClient = client;
    console.log("[RATE-LIMIT] Redis-backed rate limiting enabled.");
  } catch (err: any) {
    if (err.code === "MODULE_NOT_FOUND") {
      console.warn("[RATE-LIMIT] ioredis not installed; REDIS_URL is set but will be ignored. Using in-memory limiter.");
    } else {
      console.error("[RATE-LIMIT] Failed to initialize Redis client:", err.message);
    }
    redisClient = null;
  }

  return redisClient;
}

function applyRateLimitHeaders(res: Response, maxRequests: number, count: number, resetTime: number): void {
  const remaining = Math.max(0, maxRequests - count);
  res.setHeader("X-RateLimit-Limit", String(maxRequests));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)));
}

/**
 * Creates a rate limiter middleware.
 *
 * @param maxRequests  Maximum requests allowed in the window
 * @param windowMs     Time window in milliseconds
 */
export function createRateLimiter(maxRequests: number = 30, windowMs: number = 60_000) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Use x-forwarded-for if behind a proxy, otherwise fall back to remote IP
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || req.socket.remoteAddress || "unknown";

    const client = getRedisClient();
    const { count, resetTime } = await resolveRateLimitCount(client, ip, windowMs);

    applyRateLimitHeaders(res, maxRequests, count, resetTime);

    if (count > maxRequests) {
      const retryAfterSeconds = Math.max(0, Math.ceil((resetTime - Date.now()) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000}s window. Retry in ${retryAfterSeconds}s.`,
      });
      return;
    }

    next();
  };
}
