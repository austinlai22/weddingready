import { coachStep, CoachStepRequestSchema } from '@/lib/server/coach';
import { clientAddress, freeModelCap } from '@/lib/server/limits';
import { checkLimits, fail, fromOtherSite, ok, otherSiteRefused, readJson, runAi } from '@/lib/server/route';
import { getStore } from '@/lib/server/store';

// One step of the in-app coach. The coach's tools and loop run in the browser
// on the person's own data; this only passes a step to Google's free Gemini
// models (so it costs nothing) with instructions the server writes itself, and
// stores nothing. Limits: 150 steps per device and 400 per IP per day (a
// message takes a few), plus the daily cap on free-model calls for everyone.
export async function POST(request: Request) {
  if (fromOtherSite(request)) return otherSiteRefused();
  let body: unknown;
  try {
    body = await readJson(request, 120_000);
  } catch {
    return fail(400, 'That request couldn’t be read.', 'bad_request');
  }
  const parsed = CoachStepRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, 'That request couldn’t be read. Ask in up to 500 characters.', 'bad_request');
  const store = getStore();
  const limited = await checkLimits(
    store,
    'coach',
    [
      { kind: 'device', who: parsed.data.deviceId, max: 150 },
      { kind: 'ip', who: clientAddress(request), max: 400 },
      { kind: 'global', who: 'all', max: freeModelCap() },
    ],
    'That’s the daily limit for the coach. You can still change your week by dragging sessions.',
  );
  if (limited) return limited;
  return runAi(store, 'coach', async () => ({ data: await coachStep(parsed.data.contents, parsed.data.context, parsed.data.model ?? null), usd: 0 }), (r) => ok(r));
}
