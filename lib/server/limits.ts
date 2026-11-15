import { createHmac } from 'node:crypto';
import type { Store } from './store';

// Per-device and per-IP daily limits that never store an IP address or device
// ID in the clear: each is HMAC'd with a secret and the UTC date, so keys
// can't be reversed and change every day. Adapted from PointCompass's
// server/ratelimit.ts.

const DAY_SECONDS = 86_400;

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function secret(): string {
  return process.env.RATE_LIMIT_SECRET || 'weddingready-dev-secret';
}

export function dayStamp(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function limitKey(scope: string, who: string, now: Date): string {
  const digest = createHmac('sha256', secret()).update(`${dayStamp(now)}|${who}`).digest('hex').slice(0, 32);
  return `rl:${scope}:${dayStamp(now)}:${digest}`;
}

/** Counts this request and returns false once any limit is exceeded. */
export async function withinLimits(
  store: Store,
  scope: string,
  limits: { kind: 'device' | 'ip'; who: string; max: number }[],
  now = new Date(),
): Promise<boolean> {
  let ok = true;
  for (const l of limits) {
    const n = await store.incr(limitKey(`${scope}:${l.kind}`, l.who, now), DAY_SECONDS);
    if (n > l.max) ok = false;
  }
  return ok;
}

// ---------- Daily spend cap ----------

// USD per million tokens. Fallback refusals may be served by another model,
// so the budget prices by the model that actually answered.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-fable-5-1': { input: 10, output: 50 },
};
const DEFAULT_PRICE = { input: 10, output: 50 };

export function costUSD(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? Object.entries(PRICES).find(([k]) => model.startsWith(k))?.[1] ?? DEFAULT_PRICE;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export function dailyBudget(): number {
  const v = Number(process.env.AI_DAILY_BUDGET_USD);
  return Number.isFinite(v) && v >= 0 ? v : 2;
}

const spendKey = (now: Date) => `ai:spend:${dayStamp(now)}`;

export async function budgetLeft(store: Store, now = new Date()): Promise<boolean> {
  const spent = Number((await store.get(spendKey(now))) ?? 0);
  return spent < dailyBudget();
}

export async function recordSpend(store: Store, usd: number, now = new Date()): Promise<void> {
  if (usd > 0) await store.incrByFloat(spendKey(now), usd, DAY_SECONDS * 2);
}

/** Anonymous counters (no text, no IDs): e.g. ai:estimate ok / error / limited. */
export async function count(store: Store, name: string, field: string, now = new Date()): Promise<void> {
  try {
    await store.hincrby(`count:${name}:${dayStamp(now)}`, field, 1, DAY_SECONDS * 90);
  } catch {
    /* counting must never break a request */
  }
}
