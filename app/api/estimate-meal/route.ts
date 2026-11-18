import { estimateMeal, MealRequestSchema } from '@/lib/server/ai';
import { clientAddress, freeModelCap } from '@/lib/server/limits';
import { checkLimits, fail, fromOtherSite, ok, otherSiteRefused, readJson, runAi } from '@/lib/server/route';
import { getStore } from '@/lib/server/store';

// SPEC §10.1. Limits: 30 per device and 60 per IP per day, plus the daily cap
// on free-model calls for everyone. Refused when another website sends it.
export async function POST(request: Request) {
  if (fromOtherSite(request)) return otherSiteRefused();
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return fail(400, 'That request couldn’t be read.', 'bad_request');
  }
  const parsed = MealRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, 'Fill in what you had and how much (up to 200 characters each).', 'bad_request');
  const store = getStore();
  const limited = await checkLimits(
    store,
    'estimate',
    [
      { kind: 'device', who: parsed.data.deviceId, max: 30 },
      { kind: 'ip', who: clientAddress(request), max: 60 },
      { kind: 'global', who: 'all', max: freeModelCap() },
    ],
    'That’s the daily limit for AI estimates. You can still enter the numbers yourself.',
  );
  if (limited) return limited;
  return runAi(store, 'estimate', () => estimateMeal(parsed.data), (estimate) =>
    estimate ? ok(estimate) : fail(422, 'That doesn’t look like a food or drink. Try describing it differently.', 'not_food'),
  );
}
