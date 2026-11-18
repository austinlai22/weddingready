import { describe, expect, it } from 'vitest';
import { PROTOTYPE_USER } from '../../engine/fixtures';
import { buildPlan, dayPlan } from '../../engine/plan';
import { targets } from '../../engine/nutrition';
import { createMemoryStore } from '../store';
import { createMcpEndpoint } from './server';
import { buildWeddingPlan, calendarForPlan, getWorkout, icsForPlan, nutritionTargets, planWeek, searchFoodList, ToolInputError } from './tools';
import { codeFromHash, decodePlan } from '../../handoff';

const TODAY = '2026-11-14'; // the Saturday before the fixture plan's Monday start
// The fixture person, as an assistant would describe them.
const fixture = {
  wedding_date: PROTOTYPE_USER.weddingDate,
  start_date: PROTOTYPE_USER.startDate,
  goals: PROTOTYPE_USER.goals,
  strength_days: PROTOTYPE_USER.strengthDays,
  equipment: 'home_dumbbells' as const,
  outfit: 'dress' as const,
  session_minutes: 60 as const,
  activities: [
    { type: 'run' as const, days: ['tue' as const], label: 'Easy run' },
    { type: 'pilates' as const, days: ['sat' as const] },
  ],
};

describe('agent tools match the web app', () => {
  it('builds the same phases as the app', () => {
    const tool = buildWeddingPlan(fixture, TODAY);
    const app = buildPlan(PROTOTYPE_USER).timeline;
    expect(tool.total_weeks).toBe(app.totalWeeks);
    expect(tool.phases.map((p) => [p.phase, p.weeks, p.from])).toEqual(app.phases.map((p) => [p.label, p.weeks, p.startDate]));
    expect(tool.recovery_weeks.map((r) => r.week)).toEqual(app.recoveryWeeks);
    expect(tool.weekly_schedule.week.mon[0]).toMatch(/^Strength A/);
    expect(tool.weekly_schedule.rule_problems).toEqual([]);
  });

  it('gives the same workout as the Train tab', () => {
    const tool = getWorkout({ ...fixture, date: '2026-11-16' }, TODAY);
    const app = dayPlan(buildPlan(PROTOTYPE_USER), null, '2026-11-16');
    const strength = tool.sessions.find((s) => s.type === 'strength') as { exercises: { name: string; prescription: string }[] };
    const appStrength = app.sessions.find((s) => s.kind === 'strength');
    expect(strength.exercises.map((e) => [e.name, e.prescription])).toEqual(appStrength?.kind === 'strength' ? appStrength.exercises.map((e) => [e.exercise.name, e.rx]) : []);
    expect(tool.week).toBe('1 of 48');
  });

  it('places strength days by the same rules, with a fix for a packed week', () => {
    const packed = planWeek({
      strength_days: 3,
      activities: [
        { type: 'classes', days: ['mon', 'tue', 'wed', 'thu'] },
        { type: 'run', days: ['thu'] },
        { type: 'sports', days: ['mon'] },
      ],
    });
    expect(packed.rule_problems.length).toBeGreaterThan(0);
    expect(packed.suggested_fix).toMatchObject({ change: 'fewer strength days', strength_days: 2 });
    expect(planWeek({ strength_days: 5 }).week).toMatchObject({ mon: ['Upper body (chest, back, shoulders & arms)'] });
  });

  it('gives the app’s nutrition targets, and its safety rules', () => {
    const base = { age: 26, sex: 'female' as const, height_cm: 162.6, weight_kg: 61.2, job: 'sitting' as const, daily_walk_minutes: 60, strength_days: 2, activities: [{ type: 'run' as const, days: ['tue' as const] }, { type: 'pilates' as const, days: ['sat' as const] }] };
    const loss = nutritionTargets({ ...base, goal: 'lose_fat' });
    const app = targets({ ...PROTOTYPE_USER, activities: PROTOTYPE_USER.activities.filter((a) => a.type !== 'walk') }, true);
    expect(loss.calories_per_day?.target_range).toEqual(app.kcalRange);
    expect(loss.protein_g_per_day).toEqual(app.protein);

    const pregnant = nutritionTargets({ ...base, goal: 'lose_fat', pregnant_or_postpartum: true });
    expect(pregnant.calories_per_day?.deficit).toBe(0);
    expect(pregnant.lose_fat_not_offered).toMatch(/pregnant/);

    const ed = nutritionTargets({ ...base, goal: 'lose_fat', eating_disorder_history: true });
    expect(JSON.stringify(ed)).not.toMatch(/kcal|calories_per_day|protein_g/);
    expect(ed.support?.phone).toBeTruthy();

    expect(() => nutritionTargets({ ...base, age: 16 })).toThrow(ToolInputError);
    const low = nutritionTargets({ ...base, weight_kg: 45, goal: 'lose_fat' });
    expect(low.goal).toBe('maintain');
  });

  it('sizes the deficit to a goal weight within the same caps, and checks the inputs', async () => {
    const { addDays, todayISO } = await import('../../engine/dates');
    const base = { age: 26, sex: 'female' as const, height_cm: 162.6, weight_kg: 61.2, job: 'sitting' as const, goal: 'lose_fat' as const };
    const plain = nutritionTargets(base).calories_per_day!.deficit;
    const later = addDays(todayISO(), 270);
    // A small goal over nine months: a smaller deficit than the default.
    expect(nutritionTargets({ ...base, goal_weight_kg: 58, goal_date: later }).calories_per_day!.deficit).toBeLessThan(plain);
    // Below a healthy weight: ignored, with a note.
    const low = nutritionTargets({ ...base, goal_weight_kg: 47, goal_date: later });
    expect(low.goal_weight_note).toMatch(/healthy weight/);
    expect(low.calories_per_day!.deficit).toBe(plain);
    // Needs a date, below the current weight, and at least two weeks away.
    expect(() => nutritionTargets({ ...base, goal_weight_kg: 58 })).toThrow(/goal_date/);
    expect(() => nutritionTargets({ ...base, goal_weight_kg: 62, goal_date: later })).toThrow(/below/);
    expect(() => nutritionTargets({ ...base, goal_weight_kg: 58, goal_date: addDays(todayISO(), 5) })).toThrow(/two weeks/);
    // From 65, never faster than 0.5% of body weight a week.
    const older = nutritionTargets({ ...base, age: 70, weight_kg: 90, height_cm: 170, goal_weight_kg: 75, goal_date: addDays(todayISO(), 60) });
    expect(older.calories_per_day!.deficit).toBeLessThanOrEqual(Math.round((0.005 * 90 * 7700) / 7) + 10);
  });

  it('looks foods up with their source, diet-fitting ones first', () => {
    const r = searchFoodList({ query: 'egg', diet: 'vegan' });
    expect(r.foods.length).toBeGreaterThan(0);
    expect(r.foods.every((f) => f.source)).toBe(true);
    expect(r.foods.some((f) => f.fits_diet === false)).toBe(true);
  });

  it('hands the plan to the app and back with a plan code', () => {
    const built = buildWeddingPlan(fixture, TODAY);
    expect(built.plan_code).toMatch(/^wr1\./);
    expect(codeFromHash(new URL(built.open_in_app).hash)).toBe(built.plan_code);
    expect(decodePlan(built.plan_code)?.weddingDate).toBe(fixture.wedding_date);
    // The code alone stands in for the details; explicit fields still win.
    const again = buildWeddingPlan({ plan_code: built.plan_code }, TODAY);
    expect(again.phases).toEqual(built.phases);
    expect(buildWeddingPlan({ plan_code: built.plan_code, start_date: fixture.start_date, strength_days: 4 }, TODAY).weekly_schedule.week.mon[0]).toMatch(/^Upper body/);
    expect(() => buildWeddingPlan({ plan_code: 'wr1.broken' }, TODAY)).toThrow(/plan code/);
  });

  it('gives calendar events and a calendar file for the same sessions', () => {
    const cal = calendarForPlan({ ...fixture, from: '2026-11-16', weeks: 1, time: '18:30' }, TODAY);
    expect(cal.events.map((e) => [e.date, e.start, e.title])).toEqual([
      ['2026-11-16', '18:30', 'Strength A: Legs & push'],
      ['2026-11-19', '18:30', 'Strength B: Glutes & pull'],
    ]);
    const url = new URL(cal.ics_url);
    expect(url.pathname).toBe('/api/ics');
    const ics = icsForPlan({ plan_code: url.searchParams.get('plan')!, from: '2026-11-16', weeks: 1, time: '18:30' }, TODAY);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(() => calendarForPlan({ ...fixture, time: '7am' }, TODAY)).toThrow(/HH:MM/);
  });

  it('rejects dates the app would reject', () => {
    expect(() => buildWeddingPlan({ ...fixture, wedding_date: '2026-11-01' }, TODAY)).toThrow(/after today/);
    expect(() => buildWeddingPlan({ ...fixture, wedding_date: '2030-01-01' }, TODAY)).toThrow(/two years/);
    expect(() => buildWeddingPlan({ ...fixture, fitting_date: '2027-12-01' }, TODAY)).toThrow(/before wedding_date/);
  });
});

// Claude's custom connectors speak the 2025 protocol revision over HTTP.
describe('the /api/mcp endpoint', () => {
  async function call(endpoint: ReturnType<typeof createMcpEndpoint>, body: unknown, headers: Record<string, string> = {}) {
    const response = await endpoint.fetch(
      new Request('https://weddingready.vercel.app/api/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-06-18',
          'x-forwarded-for': '203.0.113.9',
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
    const text = await response.text();
    const json = text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data:'))?.slice(5);
    return { status: response.status, body: json ? JSON.parse(json) : null };
  }

  it('initializes, lists six read-only tools, and answers a call', async () => {
    const store = createMemoryStore();
    const endpoint = createMcpEndpoint({ store, today: () => TODAY });
    const init = await call(endpoint, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
    });
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe('weddingready');
    expect(init.body.result.instructions).toMatch(/not medical advice/);

    const list = await call(endpoint, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = list.body.result.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
    expect(tools.map((t) => t.name).sort()).toEqual(['build_plan', 'calendar_events', 'get_workout', 'nutrition_targets', 'plan_week', 'search_foods']);
    for (const t of tools) expect(t.annotations.readOnlyHint, t.name).toBe(true);

    const result = await call(endpoint, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'build_plan', arguments: fixture } });
    expect(JSON.parse(result.body.result.content[0].text).total_weeks).toBe(48);
    // Counted by tool, with nothing about the caller.
    const day = new Date().toISOString().slice(0, 10);
    expect(await store.get(`count:mcp:${day}#build_plan`)).toBe('1');
  });

  it('returns a clear error, not a crash, for bad input', async () => {
    const endpoint = createMcpEndpoint({ store: createMemoryStore(), today: () => TODAY });
    const bad = await call(endpoint, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'build_plan', arguments: { wedding_date: '2020-01-01' } } });
    expect(bad.status).toBe(200);
    expect(bad.body.result.isError).toBe(true);
    expect(bad.body.result.content[0].text).toMatch(/after today/);
  });

  it('turns away a browser page from another site', async () => {
    const endpoint = createMcpEndpoint({ store: createMemoryStore() });
    const response = await endpoint.fetch(new Request('https://weddingready.vercel.app/api/mcp', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }));
    expect(response.status).toBe(403);
  });

  it('rate-limits one sender per day', async () => {
    const endpoint = createMcpEndpoint({ store: createMemoryStore(), maxCallsPerDay: 3 });
    const ping = { jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} };
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await call(endpoint, ping)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
