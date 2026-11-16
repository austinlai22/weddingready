import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOTYPE_USER } from '../engine/fixtures';
import { encodePlan, handoffFromProfile } from '../handoff';

const generateContent = vi.fn();
vi.mock('@google/genai', () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      message = 'error',
    ) {
      super(message);
    }
  }
  class GoogleGenAI {
    models = { generateContent };
  }
  return { GoogleGenAI, ApiError, ThinkingLevel: { MINIMAL: 'MINIMAL', LOW: 'LOW' } };
});

const { CoachSession, runCoach } = await import('./coach');
const { AiUnavailable, resetCooldowns } = await import('./ai');
const { profileFromCode } = await import('./mcp/tools');

const plan = encodePlan(handoffFromProfile(PROTOTYPE_USER));
// Wednesday of week 1. Strength A (Mon) done; Strength B is on Thursday.
const request = {
  deviceId: 'test-device-1',
  today: '2026-11-18',
  message: 'I can’t train tomorrow',
  history: [],
  plan,
  schedule: { overrides: null, history: [] },
  done: { '2026-11-16': ['str-1'] },
  nutrition: {
    mode: 'habits_numbers' as const,
    diet: 'none' as const,
    targets: { kcal: [1580, 1830] as [number, number], protein: [98, 122] as [number, number], carbs: [176, 222] as [number, number], fat: [47, 57] as [number, number] },
    eaten: { p: 40, c: 90, f: 25, k: 745 },
    logged: ['b' as const, 'l' as const],
  },
};
const session = (overrides: Partial<typeof request> = {}) => {
  const req = { ...request, ...overrides };
  return new CoachSession(req, profileFromCode(req.plan, req.today));
};

const call = (name: string, args: object) => ({ functionCalls: [{ name, args, id: name }], candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] } }] });
const text = (t: string) => ({ functionCalls: [], text: t, candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] });

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test';
  generateContent.mockReset();
  resetCooldowns();
});
afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe('coach tools', () => {
  it('show the week with ids and what’s done', () => {
    const week = session().run('get_week', {}) as { days: { day: string; sessions: { id: string; done: boolean }[] }[] };
    expect(week.days[0].sessions.find((s) => s.id === 'str-1')?.done).toBe(true);
    expect(week.days[3].sessions.some((s) => s.id === 'str-2')).toBe(true);
  });

  it('check every schedule proposal against the recovery rules', () => {
    const s = session();
    const bad = s.run('propose_schedule_change', { scope: 'this_week', changes: [{ op: 'move', session_id: 'str-2', to_day: 'tue' }], summary: 'x' }) as { error?: string };
    expect(bad.error).toMatch(/already passed/);
    const backToBack = s.run('propose_schedule_change', { scope: 'from_now_on', changes: [{ op: 'move', session_id: 'str-2', to_day: 'sun' }], summary: 'x' }) as { rule_problems: string[] };
    expect(backToBack.rule_problems.join(' ')).toMatch(/Sunday and Monday/);
    const ok = s.run('propose_schedule_change', { scope: 'this_week', changes: [{ op: 'move', session_id: 'str-2', to_day: 'sat' }], summary: 'Thursday to Saturday' }) as { rule_problems: string[] };
    expect(ok.rule_problems).toEqual([]);
    // A later schedule proposal replaces the earlier one.
    expect(s.proposals.filter((p) => p.kind === 'schedule')).toHaveLength(1);
    expect(s.proposals[0]).toMatchObject({ kind: 'schedule', scope: 'this_week', ops: [{ op: 'move', sessionId: 'str-2', toDay: 'sat' }] });
  });

  it('only swap to real alternatives, and only change equipment for up to 4 weeks', () => {
    const s = session();
    const alts = s.run('exercise_alternatives', { exercise_id: 'reverse-lunge' }) as { options: { exercise_id: string }[] };
    expect(alts.options.length).toBeGreaterThan(0);
    expect(s.run('propose_exercise_swap', { from_exercise_id: 'reverse-lunge', to_exercise_id: 'lat-pulldown', reason: 'x' })).toHaveProperty('error');
    expect(s.run('propose_exercise_swap', { from_exercise_id: 'reverse-lunge', to_exercise_id: alts.options[0].exercise_id, reason: 'knee' })).toHaveProperty('proposed', true);
    expect(s.run('propose_equipment_change', { from_date: '2026-11-23', to_date: '2027-01-30', equipment: 'gym', reason: 'x' })).toHaveProperty('error');
    expect(s.run('propose_equipment_change', { from_date: '2026-11-23', to_date: '2026-11-29', equipment: 'gym', reason: 'trip' })).toHaveProperty('proposed', true);
    expect(s.proposals.map((p) => p.kind)).toEqual(['swap', 'equipment']);
  });

  it('respect how the person sees food, and keep meal numbers honest', () => {
    const portions = session({ nutrition: { mode: 'portions_only', diet: 'none', logged: [] } as never });
    expect(JSON.stringify(portions.run('get_nutrition_today', {}))).not.toMatch(/\d/);
    expect(JSON.stringify(portions.run('search_foods', { query: 'chicken' }))).not.toMatch(/kcal|protein_g/);
    const s = session();
    expect(s.run('propose_meal', { slot: 'dinner', name: 'Bowl', items: ['bowl'], protein_g: 40, carbs_g: 60, fat_g: 20, kcal: 1500 })).toHaveProperty('error');
    expect(s.run('propose_meal', { slot: 'dinner', name: 'Bowl', items: ['bowl'], protein_g: 40, carbs_g: 60, fat_g: 20, kcal: 580 })).toHaveProperty('proposed', true);
    expect(s.proposals[0]).toMatchObject({ kind: 'meal', slot: 'd', entry: { p: 40, k: 580, src: 'ai' } });
  });

  it('turn bad arguments into an error the model can read', () => {
    expect(session().run('propose_schedule_change', { scope: 'later' })).toHaveProperty('error');
    expect(session().run('no_such_tool', {})).toHaveProperty('error');
  });
});

describe('the coach loop', () => {
  it('looks, proposes, then answers, returning the proposals', async () => {
    generateContent
      .mockResolvedValueOnce(call('get_week', {}))
      .mockResolvedValueOnce(call('propose_schedule_change', { scope: 'this_week', changes: [{ op: 'move', session_id: 'str-2', to_day: 'sat' }], summary: 'Thursday’s session moves to Saturday.' }))
      .mockResolvedValueOnce(text('I suggest moving Thursday’s session to Saturday this week.'));
    const r = await runCoach(request);
    expect(r.reply).toMatch(/Saturday/);
    expect(r.proposals).toHaveLength(1);
    // Each tool result went back to the model.
    const lastContents = generateContent.mock.calls[2][0].contents;
    expect(JSON.stringify(lastContents)).toMatch(/functionResponse/);
    expect(generateContent.mock.calls[0][0].config.tools[0].functionDeclarations.map((d: { name: string }) => d.name)).toContain('propose_meal');
  });

  it('asks the model to propose when it only described a change', async () => {
    generateContent
      .mockResolvedValueOnce(text('Would you like me to move it to Saturday?'))
      .mockResolvedValueOnce(call('propose_schedule_change', { scope: 'this_week', changes: [{ op: 'move', session_id: 'str-2', to_day: 'sat' }], summary: 'x' }))
      .mockResolvedValueOnce(text('Here’s a change you can apply.'));
    const r = await runCoach(request);
    expect(r.proposals).toHaveLength(1);
    expect(JSON.stringify(generateContent.mock.calls[1][0].contents)).toMatch(/Nothing has been proposed yet/);
  });

  it('never says a proposal is already done', async () => {
    const { honest } = await import('./coach');
    expect(honest('I’ve also updated your training for next week and I have moved Thursday.')).toBe('I suggest updating your training for next week and I suggest moving Thursday.');
    expect(honest('I’ve proposed a swap.')).toBe('I’ve proposed a swap.');
  });

  it('needs the free Gemini key, and costs nothing', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(runCoach(request)).rejects.toBeInstanceOf(AiUnavailable);
  });
});
