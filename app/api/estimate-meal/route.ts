import { estimateMeal, MealRequestSchema } from '@/lib/server/ai';
import { clientAddress, count, withinLimits } from '@/lib/server/limits';
import { fail, ok, readJson, runAi } from '@/lib/server/route';
import { getStore } from '@/lib/server/store';

// SPEC §10.1. Limits: 30 per device and 60 per IP per day.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return fail(400, 'That request couldn’t be read.', 'bad_request');
  }
  const parsed = MealRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, 'Fill in what you had and how much (up to 200 characters each).', 'bad_request');
  const store = getStore();
  const allowed = await withinLimits(store, 'estimate', [
    { kind: 'device', who: parsed.data.deviceId, max: 30 },
    { kind: 'ip', who: clientAddress(request), max: 60 },
  ]);
  if (!allowed) {
    await count(store, 'estimate', 'limited');
    return fail(429, 'That’s the daily limit for AI estimates. You can still enter the numbers yourself.', 'rate_limited');
  }
  return runAi(store, 'estimate', () => estimateMeal(parsed.data), (estimate) =>
    estimate ? ok(estimate) : fail(422, 'That doesn’t look like a food or drink. Try describing it differently.', 'not_food'),
  );
}
