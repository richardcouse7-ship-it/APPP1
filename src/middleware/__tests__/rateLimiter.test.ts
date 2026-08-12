import { describe, it, expect, vi } from "vitest";
import {
  checkMemoryLimit,
  checkRedisLimit,
  resolveRateLimitCount,
  createRateLimiter,
} from "../rateLimiter";

function makeReq(ip: string) {
  return { headers: {}, socket: { remoteAddress: ip } } as any;
}

function makeRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: undefined,
    body: undefined,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    getHeader(name: string) {
      return headers[name];
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

/** A fake ioredis-shaped client backed by a plain in-process counter. */
function makeFakeRedisClient(overrides: Partial<{ counts: Record<string, number> }> = {}) {
  const counts: Record<string, number> = overrides.counts ?? {};
  return {
    async incr(key: string) {
      counts[key] = (counts[key] ?? 0) + 1;
      return counts[key];
    },
    async pexpire(_key: string, _ms: number) {
      return 1;
    },
    async pttl(_key: string) {
      return 30_000;
    },
  };
}

describe("checkMemoryLimit", () => {
  it("counts up within a window", () => {
    const key = "mem-key-1";
    const a = checkMemoryLimit(key, 60_000);
    const b = checkMemoryLimit(key, 60_000);
    expect(a.count).toBe(1);
    expect(b.count).toBe(2);
  });

  it("starts a fresh window once resetTime has passed", () => {
    const key = "mem-key-2";
    const a = checkMemoryLimit(key, -1); // already-expired window
    const b = checkMemoryLimit(key, 60_000);
    expect(a.count).toBe(1);
    expect(b.count).toBe(1);
  });
});

describe("checkRedisLimit", () => {
  it("increments via the client and sets TTL only on the first hit", async () => {
    const client = makeFakeRedisClient();
    const pexpireSpy = vi.spyOn(client, "pexpire");

    const first = await checkRedisLimit(client, "redis-key-1", 60_000);
    const second = await checkRedisLimit(client, "redis-key-1", 60_000);

    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(pexpireSpy).toHaveBeenCalledTimes(1);
  });
});

describe("resolveRateLimitCount", () => {
  it("uses the Redis client when it succeeds", async () => {
    const client = makeFakeRedisClient();
    const result = await resolveRateLimitCount(client, "resolve-key-1", 60_000);
    expect(result.count).toBe(1);
  });

  it("falls back to memory when the Redis client throws", async () => {
    const client = {
      async incr() {
        throw new Error("ECONNREFUSED simulated");
      },
      async pexpire() {
        return 1;
      },
      async pttl() {
        return 30_000;
      },
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await resolveRateLimitCount(client, "resolve-key-fallback", 60_000);

    expect(result.count).toBe(1); // served by the (fresh) in-memory store, not Redis
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("falling back to in-memory limiter"),
      expect.any(String)
    );
    warnSpy.mockRestore();
  });

  it("uses memory directly when no client is available", async () => {
    const result = await resolveRateLimitCount(null, "resolve-key-no-client", 60_000);
    expect(result.count).toBe(1);
  });
});

describe("createRateLimiter middleware (in-memory backend — no REDIS_URL)", () => {
  it("allows requests under the limit and sets rate-limit headers", async () => {
    const limiter = createRateLimiter(3, 60_000);
    const req = makeReq("203.0.113.10");
    const res = makeRes();
    const next = vi.fn();

    await limiter(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
    expect(res.getHeader("X-RateLimit-Limit")).toBe("3");
  });

  it("returns 429 once the limit is exceeded", async () => {
    const limiter = createRateLimiter(2, 60_000);
    const ip = "203.0.113.20";
    const next = vi.fn();

    await limiter(makeReq(ip), makeRes(), next); // 1
    await limiter(makeReq(ip), makeRes(), next); // 2
    const res3 = makeRes();
    await limiter(makeReq(ip), res3, next); // 3 — over limit

    expect(next).toHaveBeenCalledTimes(2);
    expect(res3.statusCode).toBe(429);
    expect(res3.body.error).toMatch(/rate limit exceeded/i);
    expect(res3.getHeader("Retry-After")).toBeDefined();
  });
});
