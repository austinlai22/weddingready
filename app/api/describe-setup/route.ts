import { DescribeRequestSchema } from '@/lib/describe';
import { describeSetup } from '@/lib/server/describe';
import { clientAddress, freeModelCap } from '@/lib/server/limits';
import { checkLimits, fail, fromOtherSite, ok, otherSiteRefused, readJson, runAi } from '@/lib/server/route';
import { getStore } from '@/lib/server/store';

// "Describe yourself" in setup: free Gemini only ($0), nothing stored. Limits:
// 10 per device and 30 per IP per day, plus the daily cap on free-model calls.
export async function POST(request: Request) {
  if (fromOtherSite(request)) return otherSiteRefused();
  let body: unknown;
  try {
    body = await readJson(request, 4_000);
  } catch {
    return fail(400, 'That request couldn’t be read.', 'bad_request');
  }
  const parsed = DescribeRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, 'Describe it in up to 600 characters.', 'bad_request');
  const store = getStore();
  const limited = await checkLimits(
    store,
    'describe',
    [
      { kind: 'device', who: parsed.data.deviceId, max: 10 },
      { kind: 'ip', who: clientAddress(request), max: 30 },
      { kind: 'global', who: 'all', max: freeModelCap() },
    ],
    'That’s the daily limit for filling in setup this way. You can still fill it in yourself.',
  );
  if (limited) return limited;
  return runAi(store, 'describe', () => describeSetup(parsed.data), (r) => ok(r));
}
