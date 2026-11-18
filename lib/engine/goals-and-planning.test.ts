import { describe, expect, it } from 'vitest';
import { PROTOTYPE_USER } from './fixtures';
import { buildPlan, dayPlan, targetsFor } from './plan';
import { targets, plannedDeficit } from './nutrition';
import { recommendWeek, EASY_CARDIO_ID } from './recommend';
import { replanWeek } from './replan';
import { engineTemplate, validateTemplate } from './schedule';
import { defaultWeekTemplate } from './split';
import { buildWorkout, sexAdjustedRest } from './workouts';
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
