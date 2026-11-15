import { NextResponse } from 'next/server';
import { AiBadOutput, AiRefused, AiUnavailable, aiConfigured } from './ai';
import { budgetLeft, count, recordSpend } from './limits';
import type { Store } from './store';

export function fail(status: number, error: string, code: string) {
  return NextResponse.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function ok(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

export async function readJson(request: Request, maxBytes = 8_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new RangeError('too large');
  return JSON.parse(text);
}

/** Shared budget gate + error mapping for the AI routes. Only anonymous counts are recorded. */
export async function runAi<T>(store: Store, name: string, work: () => Promise<{ data: T; usd: number }>, respond: (data: T) => Response) {
  if (!aiConfigured()) {
    await count(store, name, 'unavailable');
    return fail(503, 'AI help isn’t switched on right now. You can still enter it yourself.', 'ai_unavailable');
  }
  if (!(await budgetLeft(store))) {
    await count(store, name, 'budget');
    return fail(503, 'AI help is taking a break for today. You can still enter it yourself.', 'budget');
  }
  try {
    const { data, usd } = await work();
    await recordSpend(store, usd);
    await count(store, name, 'ok');
    return respond(data);
  } catch (e) {
    const usd = (e as { usd?: number }).usd;
    if (usd) await recordSpend(store, usd);
    if (e instanceof AiUnavailable) {
      await count(store, name, 'unavailable');
      return fail(503, 'AI help isn’t switched on right now. You can still enter it yourself.', 'ai_unavailable');
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
