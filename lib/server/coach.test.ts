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
  message: 'I can’t train tomorrow. Saturday works instead.',
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
const session = (overrides: Partial<Omit<typeof request, 'schedule'>> & { schedule?: import('../engine/schedule').Schedule } = {}) => {
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

  it('list only the days a session can move to without breaking a rule', () => {
    const week = session().run('get_week', {}) as { move_options: { session_id: string; now_on: string; can_move_to: string[] }[] };
    const b = week.move_options.find((o) => o.session_id === 'str-2')!;
    expect(b.now_on).toBe('thu');
    // Wednesday or Friday would be the day after/before nothing hard; Sunday is the day before Monday's Strength A.
    expect(b.can_move_to).not.toContain('sun');
    expect(b.can_move_to).toContain('sat');
    expect(week.move_options.some((o) => o.session_id === 'str-1')).toBe(false); // already done on Monday
  });

  it('sharp pain or swelling always gets the stop-and-see-someone advice', async () => {
    const { withPainSafety } = await import('./coach');
    const req = { ...request, message: 'I get a sharp pain in my knee when I squat, and it’s swollen.' };
    expect(withPainSafety(req, 'How is the knee feeling today?')).toMatch(/see a doctor or physio/);
    expect(withPainSafety(req, 'Please see a physio.')).toBe('Please see a physio.');
    expect(withPainSafety({ ...request, message: 'Lunges give me a dull ache.' }, 'Let’s swap lunges.')).toBe('Let’s swap lunges.');
  });

  it('only uses days the person actually named as the ones that suit', async () => {
    const { daysTheySaid } = await import('./coach');
    expect(daysTheySaid('I can’t train tomorrow', 2)).toEqual(new Set([3]));
    expect(daysTheySaid('Saturday works, or the weekend', 2)).toEqual(new Set([5, 6]));
    expect(daysTheySaid('any day is fine', 2)).toBe('any');
    expect(daysTheySaid('I can’t do either Thursday or Friday', 2)).toEqual(new Set([3, 4]));
    expect(daysTheySaid('Our wedding is in a month', 2)).toEqual(new Set());
    // The model guessing Friday when the person only said "tomorrow" doesn't count as their answer.
    expect(session().run('find_best_week', { scope: 'this_week', unavailable_days: ['thu'], preferred_days: ['fri'], based_on: 'can’t train tomorrow' })).toHaveProperty('error');
  });

  it('never moves a one-off session to a day the person didn’t name', () => {
    // They asked for Sunday, which breaks the recovery rules; the best fit is another day, so the coach must ask.
    const s = session({ message: 'I can’t train tomorrow. Can I do it on Sunday instead, just this week?' });
    const r = s.run('find_best_week', { scope: 'this_week', unavailable_days: ['thu'], preferred_days: ['sun'], based_on: 'wants Sunday' }) as { error?: string };
    expect(r.error).toMatch(/haven’t said works. Ask/);
    expect(s.run('propose_schedule_change', { based_on: 'x', scope: 'this_week', changes: [{ op: 'move', session_id: 'str-2', to_day: 'fri' }], summary: 'x' })).toHaveProperty('error');
    expect(s.proposals).toHaveLength(0);
  });

  it('find the best week with the engine, not the model', () => {
    const s = session({ message: 'I can’t train tomorrow. Friday or Saturday would work.' });
    // Without a day the person said works, it asks rather than guessing.
    expect(s.run('find_best_week', { scope: 'this_week', unavailable_days: ['thu'], based_on: 'busy Thursday' })).toHaveProperty('error');
    const r = s.run('find_best_week', { scope: 'this_week', unavailable_days: ['thu'], preferred_days: ['fri', 'sat'], based_on: 'busy Thursday, free at the weekend' }) as { changes: string[]; rule_problems: string[] };
    expect(r.rule_problems).toEqual([]);
    expect(r.changes[0]).toMatch(/^Strength B Thursday → (Friday|Saturday)$/);
    expect(s.proposals[0]).toMatchObject({ kind: 'schedule', scope: 'this_week', basedOn: 'busy Thursday, free at the weekend' });
    // Monday's done session never moves.
    expect(JSON.stringify(s.proposals[0])).not.toContain('str-1');
    expect(session().run('find_best_week', { scope: 'this_week', unavailable_days: ['sun'], preferred_days: ['thu'], based_on: 'busy Sunday' })).toHaveProperty('no_change_needed', true);
  });

  it('a lasting change goes on the usual week from next Monday, never repeating or undoing this week', async () => {
    const { lastingChange, templateForDate, thisWeekOnly, applyOps } = await import('../engine/schedule');
    const p = profileFromCode(request.plan, request.today);
    // Wednesday, Monday's Strength A done: "from now on I can't train Mondays".
    const s = session();
    s.run('find_best_week', { scope: 'from_now_on', unavailable_days: ['mon'], based_on: 'a new Monday class' });
    const pr = s.proposals[0] as Extract<(typeof s.proposals)[number], { kind: 'schedule' }>;
    expect(pr.scope).toBe('from_now_on');
    expect(pr.ops).toContainEqual(expect.objectContaining({ op: 'move', sessionId: 'str-1' }));
    expect(pr.thisWeekOps).toBeUndefined(); // nothing left this week is on a Monday
    expect(pr.summary).toMatch(/Every week from Monday 2026-11-23/);
    const empty = { overrides: null, history: [] };
    const after = lastingChange(p, empty, applyOps(templateForDate(p, empty, '2026-11-23'), pr.ops, p), '2026-11-18');
    const hasA = (date: string, day: number) => templateForDate(p, after, date).days[day].some((x) => x.id === 'str-1');
    // This week keeps its layout: Strength A stays on (done) Monday and doesn't come back later in the week.
    expect(hasA('2026-11-16', 0)).toBe(true);
    for (let d = 2; d < 7; d++) expect(hasA('2026-11-18', d)).toBe(false);
    // From next Monday, no Monday strength.
    expect(hasA('2026-11-23', 0)).toBe(false);

    // A one-off this week (Strength B moved to Saturday) survives a lasting change, and isn't made permanent.
    const base = templateForDate(p, empty, '2026-11-18');
    const oneOff = thisWeekOnly(p, empty, applyOps(base, [{ op: 'move', sessionId: 'str-2', toDay: 'sat' }], p), '2026-11-18');
    const s2 = session({ schedule: oneOff });
    s2.run('find_best_week', { scope: 'from_now_on', unavailable_days: ['tue'], based_on: 'busy Tuesdays' });
    const pr2 = s2.proposals[0] as typeof pr | undefined;
    // Nothing is on a Tuesday in the usual week or this week, so there's nothing to change.
    expect(pr2).toBeUndefined();
    const lasting = lastingChange(p, oneOff, applyOps(templateForDate(p, oneOff, '2026-11-23'), [{ op: 'move', sessionId: 'str-2', toDay: 'fri' }], p), '2026-11-18');
    expect(templateForDate(p, lasting, '2026-11-21').days[5].some((x) => x.id === 'str-2')).toBe(true); // still Saturday this week
    expect(templateForDate(p, lasting, '2026-11-23').days[4].some((x) => x.id === 'str-2')).toBe(true); // Friday from next week
    expect(templateForDate(p, lasting, '2026-11-23').days[5].some((x) => x.id === 'str-2')).toBe(false);
  });

  it('check every schedule proposal against the recovery rules', () => {
    const s = session();
    const bad = s.run('propose_schedule_change', { based_on: 'what they said', scope: 'this_week', changes: [{ op: 'move', session_id: 'str-2', to_day: 'tue' }], summary: 'x' }) as { error?: string };
    expect(bad.error).toMatch(/already passed/);
    const backToBack = s.run('propose_schedule_change', { based_on: 'what they said', scope: 'from_now_on', changes: [{ op: 'move', session_id: 'str-2', to_day: 'sun' }], summary: 'x' }) as { rule_problems: string[] };
    expect(backToBack.rule_problems.join(' ')).toMatch(/Sunday and Monday/);
    const ok = s.run('propose_schedule_change', { based_on: 'what they said', scope: 'this_week', changes: [{ op: 'move', session_id: 'str-2', to_day: 'sat' }], summary: 'Thursday to Saturday' }) as { rule_problems: string[] };
    expect(ok.rule_problems).toEqual([]);
    // A later schedule proposal replaces the earlier one.
    expect(s.proposals.filter((p) => p.kind === 'schedule')).toHaveLength(1);
    expect(s.proposals[0]).toMatchObject({ kind: 'schedule', scope: 'this_week', ops: [{ op: 'move', sessionId: 'str-2', toDay: 'sat' }] });
  });

  it('only swap to real alternatives, and only change equipment for up to 4 weeks', () => {
    const s = session({ message: 'Next week the hotel gym only has dumbbells, and dinner tonight is a bowl.' });
    const alts = s.run('exercise_alternatives', { exercise_id: 'reverse-lunge' }) as { options: { exercise_id: string }[] };
    expect(alts.options.length).toBeGreaterThan(0);
    expect(s.run('propose_exercise_swap', { based_on: 'what they said', from_exercise_id: 'reverse-lunge', to_exercise_id: 'lat-pulldown', reason: 'x' })).toHaveProperty('error');
    expect(s.run('propose_exercise_swap', { based_on: 'what they said', from_exercise_id: 'reverse-lunge', to_exercise_id: alts.options[0].exercise_id, reason: 'knee' })).toHaveProperty('proposed', true);
    expect(s.run('propose_equipment_change', { based_on: 'what they said', from_date: '2026-11-23', to_date: '2027-01-30', equipment: 'gym', reason: 'x' })).toHaveProperty('error');
    expect(s.run('propose_equipment_change', { based_on: 'what they said', from_date: '2026-11-23', to_date: '2026-11-29', equipment: 'gym', reason: 'trip' })).toHaveProperty('proposed', true);
    expect(s.proposals.map((p) => p.kind)).toEqual(['swap', 'equipment']);
  });

  it('respect how the person sees food, and keep meal numbers honest', () => {
    const portions = session({ nutrition: { mode: 'portions_only', diet: 'none', logged: [] } as never });
    expect(JSON.stringify(portions.run('get_nutrition_today', {}))).not.toMatch(/\d/);
    expect(JSON.stringify(portions.run('search_foods', { query: 'chicken' }))).not.toMatch(/kcal|protein_g/);
    const s = session({ message: 'Next week the hotel gym only has dumbbells, and dinner tonight is a bowl.' });
    expect(s.run('propose_meal', { based_on: 'what they said', slot: 'dinner', name: 'Bowl', items: ['bowl'], protein_g: 40, carbs_g: 60, fat_g: 20, kcal: 1500 })).toHaveProperty('error');
    expect(s.run('propose_meal', { based_on: 'what they said', slot: 'dinner', name: 'Bowl', items: ['bowl'], protein_g: 40, carbs_g: 60, fat_g: 20, kcal: 580 })).toHaveProperty('proposed', true);
    expect(s.proposals[0]).toMatchObject({ kind: 'meal', slot: 'd', entry: { p: 40, k: 580, src: 'ai' } });
  });

  it('only propose what the person actually said', () => {
    const s = session({ message: 'I’m eating out tonight and travelling next week.' });
    expect(s.run('propose_meal', { slot: 'dinner', name: 'Grilled salmon', items: ['salmon', 'potatoes'], protein_g: 40, carbs_g: 50, fat_g: 20, kcal: 540, based_on: 'eating out' })).toHaveProperty('error');
    expect(s.run('propose_equipment_change', { from_date: '2026-11-23', to_date: '2026-11-29', equipment: 'gym', reason: 'trip', based_on: 'travelling' })).toHaveProperty('error');
    expect(s.proposals).toEqual([]);
  });

  it('turn bad arguments into an error the model can read', () => {
    expect(session().run('propose_schedule_change', { based_on: 'what they said', scope: 'later' })).toHaveProperty('error');
    expect(session().run('no_such_tool', {})).toHaveProperty('error');
  });
});

describe('the coach loop', () => {
  it('looks, proposes, then answers, returning the proposals', async () => {
    generateContent
      .mockResolvedValueOnce(call('get_week', {}))
      .mockResolvedValueOnce(call('propose_schedule_change', { based_on: 'free Saturday', scope: 'this_week', changes: [{ op: 'move', session_id: 'str-2', to_day: 'sat' }], summary: 'Thursday’s session moves to Saturday.' }))
      .mockResolvedValueOnce(text('I suggest moving Thursday’s session to Saturday this week.'));
    const r = await runCoach(request);
    expect(r.reply).toMatch(/Saturday/);
    expect(r.proposals).toHaveLength(1);
    // Each tool result went back to the model.
    const lastContents = generateContent.mock.calls[2][0].contents;
    expect(JSON.stringify(lastContents)).toMatch(/functionResponse/);
    expect(generateContent.mock.calls[0][0].config.tools[0].functionDeclarations.map((d: { name: string }) => d.name)).toContain('propose_meal');
  });

  it('asks the person when it needs more, with options, and proposes nothing yet', async () => {
    generateContent
      .mockResolvedValueOnce(call('get_week', {}))
      .mockResolvedValueOnce({
        functionCalls: [
          { name: 'propose_schedule_change', args: { scope: 'this_week', changes: [{ op: 'move', session_id: 'str-2', to_day: 'sat' }], summary: 'x', based_on: 'a guess' } },
          { name: 'ask_question', args: { question: 'Which day works instead?', options: ['Friday', 'Saturday', 'Not this week'] } },
        ],
        candidates: [{ content: { role: 'model', parts: [{ text: 'No problem.' }, { functionCall: { name: 'ask_question', args: {} } }] } }],
      });
    const r = await runCoach(request);
    expect(r.reply).toBe('No problem. Which day works instead?');
    expect(r.options).toEqual(['Friday', 'Saturday', 'Not this week']);
    // A proposal made in the same breath as a question was made without the answer.
    expect(r.proposals).toEqual([]);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('carries what each proposal is based on to the preview', () => {
    const s = session({ message: 'Next week the hotel gym only has dumbbells, and dinner tonight is a bowl.' });
    s.run('propose_equipment_change', { from_date: '2026-11-23', to_date: '2026-11-29', equipment: 'home_dumbbells', reason: 'trip', based_on: 'hotel gym has dumbbells only' });
    expect(s.proposals[0]).toMatchObject({ kind: 'equipment', equipment: 'home_db', basedOn: 'hotel gym has dumbbells only' });
    expect(s.run('propose_equipment_change', { from_date: '2026-11-23', to_date: '2026-11-29', equipment: 'gym', reason: 'trip' })).toHaveProperty('error');
  });

  it('asks the model to propose when it only described a change', async () => {
    generateContent
      .mockResolvedValueOnce(text('Would you like me to move it to Saturday?'))
      .mockResolvedValueOnce(call('propose_schedule_change', { based_on: 'free Saturday', scope: 'this_week', changes: [{ op: 'move', session_id: 'str-2', to_day: 'sat' }], summary: 'x' }))
      .mockResolvedValueOnce(text('Here’s a change you can apply.'));
    const r = await runCoach(request);
    expect(r.proposals).toHaveLength(1);
    expect(JSON.stringify(generateContent.mock.calls[1][0].contents)).toMatch(/Nothing has been proposed.*call ask_question/);
  });

  it('never says a proposal is already done', async () => {
    const { honest } = await import('./coach');
    expect(honest('I’ve also updated your training for next week and I have moved Thursday.')).toBe('I suggest updating your training for next week and I suggest moving Thursday.');
    expect(honest('I’ve proposed a swap.')).toBe('I’ve proposed a swap.');
    expect(honest('I’ve put that bowl in your dinner slot.')).toBe('I suggest putting that bowl in your dinner slot.');
  });

  it('needs the free Gemini key, and costs nothing', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(runCoach(request)).rejects.toBeInstanceOf(AiUnavailable);
  });
});
