import { editSchedule, ScheduleRequestSchema } from '@/lib/server/ai';
import { count, withinLimits } from '@/lib/server/limits';
import { fail, ok, readJson, runAi } from '@/lib/server/route';
import { getStore } from '@/lib/server/store';

// SPEC §10.2. Limit: 10 per device per day. The app previews the ops and
// applies nothing until the person taps Apply.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readJson(request, 16_000);
  } catch {
    return fail(400, 'That request couldn’t be read.', 'bad_request');
  }
  const parsed = ScheduleRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, 'Describe the change in up to 300 characters.', 'bad_request');
  const store = getStore();
  if (!(await withinLimits(store, 'schedule', [{ kind: 'device', who: parsed.data.deviceId, max: 10 }]))) {
    await count(store, 'schedule', 'limited');
    return fail(429, 'That’s the daily limit for AI schedule edits. You can still drag sessions yourself.', 'rate_limited');
  }
  return runAi(store, 'schedule', () => editSchedule(parsed.data), (result) => ok(result));
}
