import { describe, expect, it } from 'vitest';
import { PROTOTYPE_USER } from './fixtures';
import { addDays } from './dates';
import { buildPlan, dayPlan, targetsFor } from './plan';
import { targets, plannedDeficit } from './nutrition';
import { recommendWeek, EASY_CARDIO_ID } from './recommend';
import { replanWeek } from './replan';
import { engineTemplate, validateTemplate } from './schedule';
import { defaultWeekTemplate } from './split';
import { buildWorkout, phaseRest, sessionMinutes, sexAdjustedRest } from './workouts';
import { effectiveProfile } from './guardrails';
import type { Activity } from '../types';

const strengthDays = (t: { days: { kind: string }[][] }) => t.days.flatMap((d, i) => (d.some((s) => s.kind === 'strength') ? [i] : []));

describe('the week search (coach’s find_best_week)', () => {
  it('moves a missed session to the best remaining day, keeping the rules', () => {
    // 2-day full body: Strength A Mon (done), Strength B Thu. Wednesday: can't train Thursday.
    const t = engineTemplate(PROTOTYPE_USER);
    const r = replanWeek({ template: t, fromDay: 2, scope: 'this_week', unavailable: [3], done: ['str-1'], equipment: 'home_db', focusAreas: [] });
    expect(r.changed).toBe(true);
    expect(r.moved).toEqual([{ id: 'str-2', from: 3, to: expect.any(Number) }]);
    expect([4, 5]).toContain(r.moved[0].to);
    expect(r.problems).toEqual([]);
  });

  it('skips a session this week rather than breaking the recovery rules', () => {
    // 3-day full body, nothing done yet, Friday morning, can't train Saturday: Fri and Sun would leave no easy day between.
    const t = defaultWeekTemplate(3, [], 'home_db', []);
    const r = replanWeek({ template: t, fromDay: 4, scope: 'this_week', unavailable: [5], done: ['str-1', 'str-2'], equipment: 'home_db', focusAreas: [] });
    expect(validateTemplate(r.after, 'home_db', []).filter((w) => w.severity === 'rule')).toEqual([]);
  });

  it('re-places every session around a new standing commitment', () => {
    const t = defaultWeekTemplate(3, [], 'home_db', []);
    const r = replanWeek({ template: t, fromDay: 0, scope: 'from_now_on', unavailable: [0, 2], done: [], equipment: 'home_db', focusAreas: [] });
    const days = strengthDays(r.after);
    expect(days).toHaveLength(3);
    expect(days.some((d) => d === 0 || d === 2)).toBe(false);
    expect(r.skipped).toEqual([]);
    expect(r.problems).toEqual([]);
  });

  it('moves only the sessions on days the person can’t train, unless a rule needs more', () => {
    // Strength A shares Monday with a run (a compromise, not a rule break). Thursday is out: only Strength B moves.
    const t = engineTemplate(PROTOTYPE_USER);
    const run = t.days[1].find((x) => x.kind === 'activity' && x.type === 'run')!;
    t.days[0].push({ ...run, id: 'run-mon' });
    const r = replanWeek({ template: t, fromDay: 0, scope: 'this_week', unavailable: [3], done: [], preferred: [4, 5], equipment: 'home_db', focusAreas: [] });
    expect(r.moved.map((m) => m.id)).toEqual(['str-2']);
  });

  it('can put sessions in a different order when that avoids a compromise', () => {
    // No more Mondays: Strength A goes to Saturday (after B), not Tuesday's run day.
    const r = replanWeek({ template: engineTemplate(PROTOTYPE_USER), fromDay: 0, scope: 'from_now_on', unavailable: [0], done: [], equipment: 'home_db', focusAreas: [] });
    expect(r.moved).toEqual([{ id: 'str-1', from: 0, to: 5 }]);
    expect(r.problems).toEqual([]);
  });

  it('changes nothing when the week already works', () => {
    const t = engineTemplate(PROTOTYPE_USER);
    expect(replanWeek({ template: t, fromDay: 0, scope: 'this_week', unavailable: [6], done: [], equipment: 'home_db', focusAreas: [] }).changed).toBe(false);
  });
});

describe('choose for me', () => {
  const base = { goals: ['tone' as const], experience: 'new' as const, weeksToWedding: 40, activities: [] as Activity[], equipment: 'home_db' as const, focusAreas: [] };
  it('gives a new lifter 3 full-body days and easy cardio, with reasons', () => {
    const r = recommendWeek(base);
    expect(r.strengthDays).toBe(3);
    expect(r.cardio?.id).toBe(EASY_CARDIO_ID);
    expect(r.cardio?.days.length).toBe(2);
    expect(r.reasons[0]).toMatch(/3 full-body/);
    // Cardio goes on days without lifting.
    const lifting = new Set(strengthDays(defaultWeekTemplate(3, [], 'home_db', [])));
    expect(r.cardio!.days.some((d) => lifting.has(d))).toBe(false);
  });
  it('adds more cardio for fat loss, more strength days for experience, and fewer when the week is already full', () => {
    expect(recommendWeek({ ...base, goals: ['lose_fat'] }).cardio?.days.length).toBe(3);
    expect(recommendWeek({ ...base, experience: 'some', goals: ['strength'] }).strengthDays).toBe(4);
    expect(recommendWeek({ ...base, experience: 'experienced', goals: ['strength'] }).strengthDays).toBe(5);
    const busy = [{ id: 'c', type: 'classes' as const, label: 'Class', days: [0, 1, 2, 3] }];
    const r = recommendWeek({ ...base, activities: busy });
    expect(r.strengthDays).toBe(2);
    expect(r.cardio).toBeNull(); // four classes already cover the active minutes
  });
  it('the chosen cardio shows as its own session, counts as cardio, and stops the "add cardio" tip', () => {
    const r = recommendWeek({ ...base, goals: ['tone', 'lose_fat'] });
    const p = { ...PROTOTYPE_USER, strengthDays: r.strengthDays, activities: [...PROTOTYPE_USER.activities.filter((a) => a.type === 'walk'), r.cardio!] };
    const plan = buildPlan(p);
    expect(plan.suggestCardio).toBe(false);
    expect(buildPlan({ ...p, activities: p.activities.filter((a) => a.id !== EASY_CARDIO_ID) }).suggestCardio).toBe(true);
    // Every cardio day shows it as a session, next to the everyday walk.
    const monday = plan.timeline.startMonday;
    for (const d of r.cardio!.days) {
      const day = dayPlan(plan, null, addDays(monday, d));
      expect(day.mainSessions.some((x) => x.kind === 'activity' && x.ref.activityId === EASY_CARDIO_ID)).toBe(true);
      expect(day.walk?.title).toBe('60-minute walk');
    }
  });
  it('keeps it light with under a month to go', () => {
    const r = recommendWeek({ ...base, weeksToWedding: 3 });
    expect(r.strengthDays).toBe(2);
    expect(r.cardio).toBeNull();
  });
});

describe('men and women', () => {
  it('rest differs where the evidence says it does', () => {
    expect(sexAdjustedRest(60, 90, false, 'female')).toEqual([45, 75]);
    expect(sexAdjustedRest(60, 90, true, 'female')).toEqual([60, 90]);
    expect(sexAdjustedRest(90, 120, true, 'male')).toEqual([120, 150]);
    expect(sexAdjustedRest(60, 90, false, 'unspecified')).toEqual([60, 90]);
  });
  it('the plan card shows the rest the workouts use', () => {
    expect(phaseRest('foundation', 'unspecified')).toBe('60–90 sec');
    expect(phaseRest('foundation', 'male')).toBe('90–120 sec main lifts · 60–90 sec others');
    expect(phaseRest('foundation', 'female')).toBe('60–90 sec main lifts · 45–75 sec others');
    expect(phaseRest('strength', 'unspecified')).toBe('90–120 sec main lifts · 60–90 sec others');
  });
  it('starts a new female lifter’s push-ups on an incline', () => {
    const ctx = { phase: 'foundation' as const, goals: ['tone' as const], experience: 'new' as const, focusAreas: [], recovery: false, taper: false };
    const ids = (sex: 'female' | 'male') => buildWorkout('A', 'bodyweight', 60, { ...ctx, sex }).map((e) => e.exercise.id);
    expect(ids('female')).toContain('bw-incline-pushup');
    expect(ids('female')).not.toContain('pushup');
    expect(ids('male')).toContain('pushup');
  });
  it('the plan uses the person’s sex', () => {
    const rest = (sex: 'female' | 'male') => {
      const s = dayPlan(buildPlan({ ...PROTOTYPE_USER, sex }), null, '2026-11-16').sessions.find((x) => x.kind === 'strength');
      return s?.kind === 'strength' ? [s.restMin, s.restMax] : [];
    };
    expect(rest('female')).toEqual([45, 90]);
    expect(rest('male')).toEqual([60, 120]);
  });
});

describe('goal weight', () => {
  it('sizes the deficit to the goal, within the safety limits', () => {
    const tdee = 2000;
    // 2 kg over 40 weeks: a small deficit, well under the default 15%.
    expect(plannedDeficit({ weightKg: 61, goalWeightKg: 59 }, tdee, 280)).toBeLessThan(0.15 * tdee);
    // 10 kg over 10 weeks: capped at 20% or 0.75% of body weight a week, whichever is lower.
    const big = plannedDeficit({ weightKg: 61, goalWeightKg: 51 }, tdee, 70);
    expect(big).toBeLessThanOrEqual(0.2 * tdee + 0.01);
    expect(big).toBeLessThanOrEqual((0.0075 * 61 * 7700) / 7 + 0.01);
    // No goal: the gentle 15%.
    expect(plannedDeficit({ weightKg: 61 }, tdee, 70)).toBeCloseTo(Math.min(0.15 * tdee, (0.0075 * 61 * 7700) / 7));
  });
  it('the plan says honestly whether the goal is within reach', () => {
    const near = buildPlan({ ...PROTOTYPE_USER, goalWeightKg: 59 });
    expect(near.goal).toMatchObject({ reachable: true });
    expect(targetsFor(near, '2026-11-20').kcal).toBeGreaterThan(targets(PROTOTYPE_USER, true).kcal);
    const far = buildPlan({ ...PROTOTYPE_USER, goalWeightKg: 50 });
    expect(far.goal).toMatchObject({ reachable: false });
    // Never below resting needs.
    expect(targetsFor(far, '2026-11-20').kcal).toBeGreaterThanOrEqual(targetsFor(far, '2026-11-20').bmr);
  });
  it('ignores a goal below a healthy weight, or with an eating-disorder history', () => {
    expect(effectiveProfile({ ...PROTOTYPE_USER, goalWeightKg: 45 }).goalWeightKg).toBeUndefined();
    expect(effectiveProfile({ ...PROTOTYPE_USER, goalWeightKg: 58, safety: { ...PROTOTYPE_USER.safety, edHistory: true } }).goalWeightKg).toBeUndefined();
    expect(buildPlan({ ...PROTOTYPE_USER, goalWeightKg: 58, goals: ['tone'] }).goal).toBeNull();
  });
});

describe('starting variants, swaps and session length', () => {
  const ctx = { phase: 'foundation' as const, goals: ['tone' as const], experience: 'new' as const, focusAreas: [], recovery: false, taper: false, sex: 'female' as const };
  const ids = (key: 'B' | 'P', eq: 'home_db' | 'bodyweight', c: object, swaps: Record<string, string> = {}) => buildWorkout(key, eq, 60, { ...ctx, ...c }, swaps).map((e) => e.exercise.id);
  it('incline push-ups only in Foundation, then the floor', () => {
    expect(ids('B', 'home_db', {})).toContain('bw-incline-pushup');
    expect(ids('B', 'home_db', { phase: 'strength' })).toContain('pushup');
  });
  it('never the same exercise twice in a workout', () => {
    for (const phase of ['foundation', 'strength', 'shape', 'build', 'maintain'] as const) {
      const list = ids('P', 'bodyweight', { phase });
      expect(new Set(list).size).toBe(list.length);
    }
  });
  it('a swap of the incline push-up the person saw sticks in every phase', () => {
    const swaps = { 'bw-incline-pushup': 'db-floor-fly' };
    for (const phase of ['foundation', 'strength'] as const) {
      const list = ids('B', 'home_db', { phase }, swaps);
      expect(list).toContain('db-floor-fly');
      expect(list).not.toContain('bw-incline-pushup');
      expect(list).not.toContain('pushup');
    }
  });
  it('session length counts the longer or shorter rest', () => {
    const w = (sex: 'female' | 'male' | 'unspecified') => buildWorkout('A', 'gym', 90, { ...ctx, experience: 'some', sex });
    const mainSets = w('unspecified').filter((e) => e.main).reduce((t, e) => t + e.sets, 0);
    const accSets = w('unspecified').filter((e) => !e.main).reduce((t, e) => t + e.sets, 0);
    expect(sessionMinutes(w('male')) - sessionMinutes(w('unspecified'))).toBeCloseTo(mainSets * 0.5);
    expect(sessionMinutes(w('unspecified')) - sessionMinutes(w('female'))).toBeCloseTo(accSets * 0.25);
    // A 45-minute session still fits in 45 minutes with longer rest.
    expect(sessionMinutes(buildWorkout('A', 'gym', 45, { ...ctx, experience: 'some', sex: 'male' }))).toBeLessThanOrEqual(45);
  });
});

describe('age and goal combinations', () => {
  it('from 65, a gentler weekly pace', () => {
    expect(plannedDeficit({ weightKg: 61, goalWeightKg: 51, age: 70 }, 3000, 70)).toBeCloseTo((0.005 * 61 * 7700) / 7);
    expect(plannedDeficit({ weightKg: 61, goalWeightKg: 51, age: 40 }, 3000, 70)).toBeCloseTo((0.0075 * 61 * 7700) / 7);
  });
  it('strength plus fat loss keeps the deficit at 500 kcal or less', () => {
    expect(plannedDeficit({ weightKg: 110, goalWeightKg: 90, goals: ['strength', 'lose_fat'] }, 3200, 100)).toBe(500);
    expect(plannedDeficit({ weightKg: 110, goalWeightKg: 90, goals: ['tone', 'lose_fat'] }, 3200, 100)).toBeCloseTo(640);
  });
  it('from 65: a balance drill in the warm-up and no 5-day split', () => {
    const warmup = (age: number) => {
      const s = dayPlan(buildPlan({ ...PROTOTYPE_USER, age }), null, '2026-11-16').sessions.find((x) => x.kind === 'strength');
      return s?.kind === 'strength' ? s.warmup : '';
    };
    expect(warmup(68)).toMatch(/standing on each leg/);
    expect(warmup(40)).not.toMatch(/standing on each leg/);
    const base = { goals: ['strength' as const], experience: 'experienced' as const, weeksToWedding: 40, activities: [] as Activity[], equipment: 'gym' as const, focusAreas: [] };
    expect(recommendWeek({ ...base, age: 30 }).strengthDays).toBe(5);
    const older = recommendWeek({ ...base, age: 68 });
    expect(older.strengthDays).toBe(4);
    expect(older.reasons.join(' ')).toMatch(/balance/);
  });
  it('a goal below BMI 22 but healthy is judged by the deficit actually set', () => {
    // BMI 23 now, goal BMI 21.6: reachable over ~9 months, and the range never passes the goal.
    const plan = buildPlan({ ...PROTOTYPE_USER, goalWeightKg: 57 });
    expect(plan.goal).toMatchObject({ reachable: true });
    expect(plan.goal!.highKg).toBeLessThanOrEqual(plan.goal!.toLoseKg);
    expect(plan.goal!.lowKg).toBeLessThanOrEqual(plan.goal!.highKg);
  });
});
