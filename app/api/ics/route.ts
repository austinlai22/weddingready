// /api/ics?plan=wr1.…&from=YYYY-MM-DD&weeks=4&time=07:00[&activities=1]
// A calendar file built from a plan code. Stateless: the plan lives in the link.
import { todayISO } from '@/lib/engine/dates';
import { icsForPlan, ToolInputError } from '@/lib/server/mcp/tools';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  try {
    const ics = icsForPlan(
      {
        plan_code: q.get('plan') ?? '',
        from: q.get('from') ?? undefined,
        weeks: Number(q.get('weeks')) || 4,
        time: q.get('time') ?? undefined,
        include_activities: q.get('activities') === '1',
        time_zone: q.get('tz') ?? undefined,
      },
      todayISO(),
    );
    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="weddingready-training.ics"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof ToolInputError) return new Response(`That calendar link doesn’t work: ${e.message}`, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    throw e;
  }
}
