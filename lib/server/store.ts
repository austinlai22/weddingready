// Server-side counters only: rate limits, the daily AI spend and anonymous
// usage counts. No user data is ever stored. Upstash Redis (REST) in
// production; an in-memory store when no Redis is configured (local dev,
// tests). Adapted from PointCompass's server/store.ts.

export interface Store {
  get(key: string): Promise<string | null>;
  /** Increments and returns the new value; the TTL is set when the key is new. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  /** Adds a float and returns the new total; the TTL is set when the key is new. */
  incrByFloat(key: string, by: number, ttlSeconds: number): Promise<number>;
  hincrby(key: string, field: string, by: number, ttlSeconds: number): Promise<void>;
}

type Command = (string | number)[];

export function createUpstashStore(url: string, token: string): Store {
  async function run<T>(command: Command): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      cache: 'no-store',
    });
    const body = (await response.json()) as { result?: T; error?: string };
    if (!response.ok || body.error) throw new Error(`Redis ${command[0]} failed: ${body.error ?? response.status}`);
    return body.result as T;
  }
  return {
    get: (key) => run<string | null>(['GET', key]),
    async incr(key, ttl) {
      const v = await run<number>(['INCR', key]);
      if (v === 1) await run(['EXPIRE', key, ttl]);
      return v;
    },
    async incrByFloat(key, by, ttl) {
      const v = Number(await run<string>(['INCRBYFLOAT', key, by]));
      await run(['EXPIRE', key, ttl, 'NX']);
      return v;
    },
    async hincrby(key, field, by, ttl) {
      await run(['HINCRBY', key, field, by]);
      await run(['EXPIRE', key, ttl, 'NX']);
    },
  };
}

export function createMemoryStore(now: () => number = Date.now): Store {
  const values = new Map<string, { v: string; exp: number }>();
  const live = (key: string) => {
    const e = values.get(key);
    if (e && e.exp <= now()) {
      values.delete(key);
      return undefined;
    }
    return e;
  };
  const put = (key: string, v: string, ttl: number) => {
    const e = live(key);
    values.set(key, { v, exp: e ? e.exp : now() + ttl * 1000 });
  };
  return {
    async get(key) {
      return live(key)?.v ?? null;
    },
    async incr(key, ttl) {
      const v = Number(live(key)?.v ?? 0) + 1;
      put(key, String(v), ttl);
      return v;
    },
    async incrByFloat(key, by, ttl) {
      const v = Number(live(key)?.v ?? 0) + by;
      put(key, String(v), ttl);
      return v;
    },
    async hincrby(key, field, by, ttl) {
      const k = `${key}#${field}`;
      put(k, String(Number(live(k)?.v ?? 0) + by), ttl);
    },
  };
}

let memory: Store | null = null;

// Vercel's Upstash integration names its variables KV_REST_API_*; a database
// created on upstash.com uses UPSTASH_REDIS_REST_*. Accept either.
export function getStore(env: Record<string, string | undefined> = process.env): Store {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return createUpstashStore(url, token);
  memory ??= createMemoryStore();
  return memory;
}
