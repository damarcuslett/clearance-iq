import { Redis } from "@upstash/redis";

function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
}

export const redis = createRedis();

/**
 * Get a cached value or compute it.
 * Falls back to computing without cache if Redis is unavailable.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  if (!redis) {
    return compute();
  }

  try {
    const existing = await redis.get<T>(key);
    if (existing !== null && existing !== undefined) {
      return existing;
    }
  } catch {
    // Redis unavailable — fall through to compute
  }

  const value = await compute();

  try {
    await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch {
    // Cache write failed — non-fatal
  }

  return value;
}
