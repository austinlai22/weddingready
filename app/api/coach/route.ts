import { CoachRequestSchema, runCoach } from '@/lib/server/coach';
import { clientAddress } from '@/lib/server/limits';
import { ToolInputError } from '@/lib/server/mcp/tools';
import { checkLimits, fail, ok, readJson, runAi } from '@/lib/server/route';
import { getStore } from '@/lib/server/store';

// The in-app coach. Free Gemini models only, so it costs nothing. Limits: 25 per
// device and 60 per IP per day. It returns proposals; the app applies nothing
// until the person taps Apply.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readJson(request, 40_000);
  } catch {
    return fail(400, 'That request couldn’t be read.', 'bad_request');
  }
  const parsed = CoachRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, 'Ask in up to 500 characters.', 'bad_request');
  const store = getStore();
  const limited = await checkLimits(
    store,
    'coach',
    [
      { kind: 'device', who: parsed.data.deviceId, max: 25 },
      { kind: 'ip', who: clientAddress(request), max: 60 },
    ],
    'That’s the daily limit for the coach. You can still change your week by dragging sessions.',
  );
  if (limited) return limited;
  return runAi(
    store,
    'coach',
    async () => {
      try {
        return { data: await runCoach(parsed.data), usd: 0 };
      } catch (e) {
        if (e instanceof ToolInputError) return { data: { reply: e.message, proposals: [], model: 'none' }, usd: 0 };
        throw e;
      }
    },
    (r) => ok(r),
  );
}
