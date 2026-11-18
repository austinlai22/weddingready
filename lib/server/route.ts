import { NextResponse } from 'next/server';
import { AiBadOutput, AiRefused, AiUnavailable, aiConfigured } from './ai';
import { budgetLeft, count, recordSpend, withinLimits } from './limits';
import type { Store } from './store';

export function fail(status: number, error: string, code: string) {
  return NextResponse.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function ok(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * True for a request a browser sent from another website (a page spending its
 * visitors' requests on our free quota). Same-site pages, localhost and
 * non-browser callers (no Origin header) pass; the daily limits cover those.
 */
export function fromOtherSite(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    return !(o.host === host || o.hostname === 'localhost' || o.hostname === '127.0.0.1');
  } catch {
    return true;
  }
}

export function otherSiteRefused() {
  return fail(403, 'This only works from WeddingReady itself.', 'forbidden');
}

export async function readJson(request: Request, maxBytes = 8_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new RangeError('too large');
  return JSON.parse(text);
}

/**
 * Rate limits for an AI route. If the limit store can't be reached, AI is
 * treated as off (the app falls back to manual entry) rather than crashing or
 * running without limits.
 */
export async function checkLimits(
  store: Store,
  scope: string,
  limits: Parameters<typeof withinLimits>[2],
  limitedMessage: string,
): Promise<Response | null> {
  try {
    if (await withinLimits(store, scope, limits)) return null;
  } catch {
    console.warn('AI: the rate-limit store is unreachable, so AI is off for this request.');
    return fail(503, 'AI help isn’t available right now. You can still enter it yourself.', 'ai_unavailable');
  }
  await count(store, scope, 'limited');
  return fail(429, limitedMessage, 'rate_limited');
}

/** Shared budget gate + error mapping for the AI routes. Only anonymous counts are recorded. */
export async function runAi<T>(store: Store, name: string, work: () => Promise<{ data: T; usd: number }>, respond: (data: T) => Response) {
  if (!aiConfigured()) {
    await count(store, name, 'unavailable');
    return fail(503, 'AI help isn’t switched on right now. You can still enter it yourself.', 'ai_unavailable');
  }
  let underBudget: boolean;
  try {
    underBudget = await budgetLeft(store);
  } catch {
    return fail(503, 'AI help isn’t available right now. You can still enter it yourself.', 'ai_unavailable');
  }
  if (!underBudget) {
    await count(store, name, 'budget');
    return fail(503, 'AI help is taking a break for today. You can still enter it yourself.', 'budget');
  }
  try {
    const { data, usd } = await work();
    await recordSpend(store, usd).catch(() => undefined);
    await count(store, name, 'ok');
    return respond(data);
  } catch (e) {
    const usd = (e as { usd?: number }).usd;
    if (usd) await recordSpend(store, usd).catch(() => undefined);
    if (e instanceof AiUnavailable) {
      const busy = /busy|quota/.test(e.message);
      await count(store, name, busy ? 'busy' : 'unavailable');
      return busy
        ? fail(503, 'AI help is busy right now. Try again in a minute, or enter it yourself.', 'ai_busy')
        : fail(503, 'AI help isn’t switched on right now. You can still enter it yourself.', 'ai_unavailable');
    }
    if (e instanceof AiRefused) {
      await count(store, name, 'refused');
      return fail(422, 'Couldn’t help with that one. Try describing it differently, or enter it yourself.', 'refused');
    }
    if (e instanceof AiBadOutput) {
      await count(store, name, 'bad_output');
      return fail(502, 'That didn’t come back right. Try again, or enter it yourself.', 'bad_output');
    }
    await count(store, name, 'error');
    return fail(502, 'Something went wrong. Try again in a moment, or enter it yourself.', 'error');
  }
}
