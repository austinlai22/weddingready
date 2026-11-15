import { describe, expect, it } from 'vitest';
import type { Profile } from '../types';
import { addDays, dayIndex, mondayOf, nextMonday } from './dates';
import { PROTOTYPE_USER } from './fixtures';
import { allowedGoals, allowedNutritionMode, effectiveProfile, isAdult, loseFatBlockedReason, targetWeightAllowed } from './guardrails';
import { menuForDate, portionTier, TEMPLATES, templateAllowed } from './meals';
import { activityFactor, bmr, expectedLoss, kcalFromMacros, targets } from './nutrition';
import { allocatePhases, buildTimeline, weeksToWedding } from './phases';
import { buildPlan, dayPlan, deficitOn, targetsFor } from './plan';
import { applyOps, OpError, reconcileOverrides, validateTemplate } from './schedule';
import { defaultWeekTemplate } from './split';
import { buildWorkout, exerciseById, EXERCISES, prescribe, sessionMinutes, trimToFit } from './workouts';

const weeks = (a: ReturnType<typeof allocatePhases>) => Object.fromEntries(a.map((p) => [p.name, p.weeks]));

describe('dates', () => {
  it('uses Monday-first weeks and survives DST changes', () => {
    expect(dayIndex('2026-11-16')).toBe(0);
    expect(dayIndex('2027-10-17')).toBe(6);
    expect(mondayOf('2026-11-14')).toBe('2026-11-09');
    expect(nextMonday('2026-11-14')).toBe('2026-11-16');
    expect(nextMonday('2026-11-16')).toBe('2026-11-23');
    // US DST ends Nov 1 2026 and starts Mar 14 2027
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
    expect(addDays('2027-03-13', 2)).toBe('2027-03-15');
  });
});

describe('phase allocation (SPEC §6.1)', () => {
  it('matches the 48-week sanity check without goal modifiers', () => {
    expect(weeks(allocatePhases(48, ['lose_fat']))).toEqual({ foundation: 8, strength: 13, shape: 15, maintain: 12 });
  });

  it.each([
    [2, { feelgood: 2 }],
    [4, { foundation: 1, build: 2, maintain: 1 }],
    [7, { foundation: 2, build: 4, maintain: 1 }],
    [8, { foundation: 2, build: 4, maintain: 2 }],
    [12, { foundation: 3, build: 7, maintain: 2 }],
    [15, { foundation: 3, build: 10, maintain: 2 }],
    [16, { foundation: 4, strength: 4, shape: 4, maintain: 4 }],
    [24, { foundation: 4, strength: 6, shape: 8, maintain: 6 }],
    [48, { foundation: 8, strength: 13, shape: 15, maintain: 12 }],
    [60, { foundation: 8, strength: 17, shape: 21, maintain: 14 }],
  ])('W = %i', (W, expected) => {
    const a = allocatePhases(W, ['maintain']);
    expect(weeks(a)).toEqual(expected);
    expect(a.reduce((t, p) => t + p.weeks, 0)).toBe(W);
  });

  it('applies goal modifiers for W ≥ 16', () => {
    expect(weeks(allocatePhases(48, ['tone', 'lose_fat']))).toEqual({ foundation: 8, strength: 11, shape: 17, maintain: 12 });
    expect(weeks(allocatePhases(48, ['strength']))).toEqual({ foundation: 8, strength: 15, shape: 13, maintain: 12 });
    expect(weeks(allocatePhases(48, ['strength', 'tone']))).toEqual({ foundation: 8, strength: 13, shape: 15, maintain: 12 });
    expect(weeks(allocatePhases(12, ['tone']))).toEqual({ foundation: 3, build: 7, maintain: 2 });
  });

  it('builds the prototype user timeline: 48 weeks, tone modifier applied', () => {
    const t = buildTimeline(PROTOTYPE_USER.startDate, PROTOTYPE_USER.weddingDate, PROTOTYPE_USER.goals);
    expect(t.totalWeeks).toBe(48);
    expect(t.phases.map((p) => [p.name, p.weeks])).toEqual([
      ['foundation', 8],
      ['strength', 11],
      ['shape', 17],
      ['maintain', 12],
    ]);
    expect(t.phases[0].startDate).toBe('2026-11-16');
    expect(t.phases[3].endDate).toBe('2027-10-17');
    expect(t.taperStart).toBe('2027-10-08');
  });

  it('counts the wedding week as the last week', () => {
    expect(weeksToWedding('2026-11-16', '2026-11-22')).toBe(1);
    expect(weeksToWedding('2026-11-16', '2026-11-23')).toBe(2);
  });
});

describe('fitting-date shift', () => {
  it('starts Maintain at least 2 weeks before the fitting, shrinking Shape first', () => {
    // Fitting Aug 15 2027 → Maintain must start by the week of Aug 1 2027 (week 37).
    const t = buildTimeline('2026-11-16', '2027-10-17', ['tone', 'lose_fat'], '2027-08-15');
    const m = t.phases.find((p) => p.name === 'maintain')!;
    expect(m.startDate <= addDays('2027-08-15', -14)).toBe(true);
    expect(t.phases.map((p) => [p.name, p.weeks])).toEqual([
      ['foundation', 8],
      ['strength', 11],
      ['shape', 17],
      ['maintain', 12],
    ]);
    const early = buildTimeline('2026-11-16', '2027-10-17', ['tone', 'lose_fat'], '2027-05-02');
    const m2 = early.phases.find((p) => p.name === 'maintain')!;
    expect(m2.startDate <= '2027-04-18').toBe(true);
    const shape = early.phases.find((p) => p.name === 'shape')!;
    const strength = early.phases.find((p) => p.name === 'strength')!;
    expect(shape.weeks).toBe(2);
    expect(strength.weeks).toBe(11);
    const earlier = buildTimeline('2026-11-16', '2027-10-17', ['tone', 'lose_fat'], '2027-02-28');
    expect(earlier.phases.map((p) => [p.name, p.weeks])).toEqual([
      ['foundation', 8],
      ['strength', 2],
      ['shape', 2],
      ['maintain', 36],
    ]);
    expect(early.phases.find((p) => p.name === 'foundation')!.weeks).toBe(8);
    expect(early.fittingConstrained).toBe(false);
  });

  it('never shrinks Foundation below its minimum, and reports when it cannot fit', () => {
    const t = buildTimeline('2026-11-16', '2027-10-17', ['lose_fat'], '2026-12-20');
    expect(t.phases.find((p) => p.name === 'foundation')!.weeks).toBe(4);
    expect(t.fittingConstrained).toBe(true);
    expect(t.phases.reduce((s, p) => s + p.weeks, 0)).toBe(48);
  });
});

describe('recovery weeks and taper', () => {
  it('puts a recovery week every 6th week after Foundation', () => {
    const t = buildTimeline(PROTOTYPE_USER.startDate, PROTOTYPE_USER.weddingDate, PROTOTYPE_USER.goals);
    expect(t.recoveryWeeks).toEqual([14, 20, 26, 32]);
  });

  it('has no recovery weeks under 12 weeks', () => {
    const start = '2026-11-16';
    expect(buildTimeline(start, addDays(start, 7 * 10), ['tone']).recoveryWeeks).toEqual([]);
  });

  it('drops to 2 sets in recovery weeks and the final 10 days', () => {
    const plan = buildPlan(PROTOTYPE_USER);
    const recoveryMonday = addDays(plan.timeline.startMonday, 13 * 7);
    const day = dayPlan(plan, null, recoveryMonday);
    expect(day.recovery).toBe(true);
    const s = day.sessions.find((x) => x.kind === 'strength');
    expect(s && s.kind === 'strength' && s.exercises.every((e) => e.sets === 2)).toBe(true);
    const taperDay = dayPlan(plan, null, '2027-10-11');
    expect(taperDay.taper).toBe(true);
    const ts = taperDay.sessions.find((x) => x.kind === 'strength');
    expect(ts && ts.kind === 'strength' && ts.exercises.every((e) => e.sets === 2)).toBe(true);
    expect(dayPlan(plan, null, '2027-10-17').status).toBe('wedding');
    expect(dayPlan(plan, null, '2027-10-17').sessions).toHaveLength(0);
  });
});

describe('workouts and prescriptions (SPEC §6.2–6.4)', () => {
  const ctx = { goals: PROTOTYPE_USER.goals, experience: 'some' as const, focusAreas: PROTOTYPE_USER.focusAreas, recovery: false, taper: false };

  it('reproduces the prototype A/B exercise lists for home dumbbells', () => {
    const a = buildWorkout('A', 'home_db', 60, { ...ctx, phase: 'foundation' }).map((e) => e.exercise.name);
    expect(a).toEqual(['Goblet squat', 'Dumbbell Romanian deadlift', 'Floor press', 'Bulgarian split squat', 'Lateral raise', 'Overhead triceps extension', 'Dead bug']);
    const b = buildWorkout('B', 'home_db', 60, { ...ctx, phase: 'foundation' }).map((e) => e.exercise.name);
    expect(b).toEqual(['Hip thrust', 'Reverse lunge', 'One-arm row', 'Overhead press', 'Rear-delt fly', 'Push-ups', 'Side plank']);
  });

  it('marks focus muscles like the prototype’s dress muscles', () => {
    const b = buildWorkout('B', 'home_db', 60, { ...ctx, phase: 'foundation' });
    expect(b.filter((e) => e.focus).map((e) => e.exercise.id)).toEqual(['one-arm-row', 'ohp', 'rear-delt-fly']);
  });

  it('prescribes by phase', () => {
    const squat = exerciseById('goblet-squat');
    const raise = exerciseById('lateral-raise');
    expect(prescribe(squat, true, { ...ctx, phase: 'foundation' }).rx).toBe('3 × 10–12');
    expect(prescribe(raise, false, { ...ctx, phase: 'foundation' }).rx).toBe('3 × 12–15');
    const s = prescribe(squat, true, { ...ctx, phase: 'strength' });
    expect([s.rx, s.restMin, s.restMax, s.changed]).toEqual(['4 × 8–10', 90, 120, true]);
    expect(prescribe(squat, true, { ...ctx, goals: ['strength'], phase: 'strength' }).rx).toBe('4 × 6–8');
    expect(prescribe(squat, true, { ...ctx, goals: ['strength'], experience: 'new', phase: 'strength' }).rx).toBe('4 × 8–10');
    expect(prescribe(raise, false, { ...ctx, phase: 'shape' }).sets).toBe(4);
    expect(prescribe(exerciseById('bulgarian-split-squat'), false, { ...ctx, phase: 'shape' }).sets).toBe(3);
    expect(prescribe(squat, true, { ...ctx, phase: 'build' }).sets).toBe(4);
    expect(prescribe(raise, false, { ...ctx, phase: 'build' }).sets).toBe(4);
    expect(prescribe(raise, false, { ...ctx, phase: 'maintain' }).rx).toBe('3 × 12–15');
    expect(prescribe(raise, false, { ...ctx, goals: ['maintain'], phase: 'strength' }).sets).toBe(2);
    expect(prescribe(exerciseById('dead-bug'), false, { ...ctx, phase: 'foundation' }).rx).toBe('3 × 8 per side');
    expect(prescribe(exerciseById('side-plank'), false, { ...ctx, phase: 'foundation' }).rx).toBe('3 × 30 sec per side');
    expect(prescribe(exerciseById('pushup'), false, { ...ctx, phase: 'foundation' }).rx).toBe('3 sets · stop 2 reps before failure');
    expect(prescribe(exerciseById('reverse-lunge'), true, { ...ctx, phase: 'foundation' }).rx).toBe('3 × 10–12 per leg');
  });

  it('trims accessories from the end to fit the session length', () => {
    const full = buildWorkout('A', 'home_db', 60, { ...ctx, phase: 'foundation' });
    expect(sessionMinutes(full)).toBe(48.5);
    const t45 = trimToFit(full, 45);
    expect(t45.map((e) => e.exercise.id)).not.toContain('dead-bug');
    expect(sessionMinutes(t45)).toBeLessThanOrEqual(45);
    const t30 = trimToFit(full, 30);
    expect(t30.filter((e) => e.main)).toHaveLength(3);
    expect(sessionMinutes(t30)).toBeLessThanOrEqual(30);
  });

  it('has every pattern for every equipment type and 3 cues per exercise', () => {
    const patterns = new Set(EXERCISES.map((e) => e.pattern));
    for (const p of patterns) {
      for (const eq of ['home_db', 'gym', 'bodyweight']) {
        expect(EXERCISES.some((e) => e.pattern === p && e.equipment === eq), `${p} ${eq}`).toBe(true);
      }
    }
    expect(EXERCISES.every((e) => e.cues.length === 3)).toBe(true);
  });

  it('builds every split for every equipment type', () => {
    for (const days of [2, 3, 4, 5] as const) {
      for (const eq of ['home_db', 'gym', 'bodyweight'] as const) {
        const tpl = defaultWeekTemplate(days, [], eq, ['glutes', 'chest']);
        expect(tpl.days.flat().filter((s) => s.kind === 'strength')).toHaveLength(days);
        expect(validateTemplate(tpl, eq, ['glutes'])).toEqual([]);
      }
    }
  });
});

describe('weekly placement (SPEC §6.3)', () => {
  it('places the prototype week: strength Mon/Thu, run Tue, Pilates Sat, daily walks', () => {
    const tpl = defaultWeekTemplate(2, PROTOTYPE_USER.activities, 'home_db', PROTOTYPE_USER.focusAreas);
    const summary = tpl.days.map((d) => d.filter((s) => !(s.kind === 'activity' && s.type === 'walk')).map((s) => (s.kind === 'strength' ? s.workout : s.type)));
    expect(summary).toEqual([['A'], ['run'], [], ['B'], [], ['pilates'], []]);
    expect(tpl.days.every((d) => d.some((s) => s.kind === 'activity' && s.type === 'walk'))).toBe(true);
  });

  it('moves strength off the user’s activity days when it can', () => {
    const tpl = defaultWeekTemplate(2, [{ id: 'y', type: 'yoga', label: 'Yoga', days: [0, 3] }], 'gym', []);
    const strengthDays = tpl.days.map((d, i) => (d.some((s) => s.kind === 'strength') ? i : -1)).filter((i) => i >= 0);
    expect(strengthDays.some((d) => d === 0 || d === 3)).toBe(false);
  });
});

describe('nutrition (SPEC §6.6)', () => {
  it('matches the prototype fixture', () => {
    expect(Math.round(bmr(PROTOTYPE_USER))).toBe(1337);
    expect(activityFactor(PROTOTYPE_USER)).toBe(1.5);
    const t = targets(PROTOTYPE_USER, true);
    expect(t.tdee).toBe(2006);
    expect(t.kcal).toBe(1705);
    expect(t.kcalRange).toEqual([1580, 1830]);
    expect(t.protein).toEqual([98, 122]);
    expect(t.fat).toEqual([47, 57]);
    expect(t.carbs[0]).toBeGreaterThanOrEqual(170);
    expect(t.carbs[1]).toBeLessThanOrEqual(230);
  });

  it('uses the mean equation for unspecified sex', () => {
    const p = { ...PROTOTYPE_USER, sex: 'unspecified' as const };
    const f = bmr({ ...p, sex: 'female' });
    const m = bmr({ ...p, sex: 'male' });
    expect(bmr(p)).toBeCloseTo((f + m) / 2, 6);
  });

  it('caps the deficit at 0.75% of body weight per week and never goes below BMR or the floor', () => {
    const big: Profile = { ...PROTOTYPE_USER, weightKg: 140, heightCm: 180, sex: 'male', age: 35, job: 'on_feet', strengthDays: 5 };
    const t = targets(big, true);
    expect(t.deficit).toBeLessThanOrEqual(Math.round(0.15 * t.tdee) + 1);
    expect(t.deficit).toBeLessThanOrEqual(Math.round((0.0075 * 140 * 7700) / 7) + 1);
    const small: Profile = { ...PROTOTYPE_USER, weightKg: 48, heightCm: 152, age: 60, activities: [], dailyWalkMinutes: 0, strengthDays: 2 };
    const s = targets(small, true);
    expect(s.kcal).toBeGreaterThanOrEqual(Math.round(bmr(small)));
    expect(s.kcal).toBeGreaterThanOrEqual(1200);
    const man: Profile = { ...small, sex: 'male' };
    const tm = targets(man, true);
    // The floor never pushes the target above maintenance: then there is simply no deficit.
    expect(tm.kcal).toBeGreaterThanOrEqual(Math.min(tm.tdee, 1500));
    expect(tm.kcal).toBeLessThanOrEqual(tm.tdee);
  });

  it('caps the activity factor at 1.75', () => {
    const p: Profile = { ...PROTOTYPE_USER, job: 'on_feet', strengthDays: 5, dailyWalkMinutes: 120, activities: [{ id: 'r', type: 'run', label: 'Run', days: [0, 1, 2, 3, 4, 5, 6] }] };
    expect(activityFactor(p)).toBe(1.75);
  });

  it('uses the BMI-27 weight for protein when BMI ≥ 30', () => {
    const p: Profile = { ...PROTOTYPE_USER, weightKg: 100, heightCm: 165 };
    const ref = 27 * 1.65 * 1.65;
    expect(targets(p, false).protein).toEqual([Math.round(1.6 * ref), Math.round(2.0 * ref)]);
  });

  it('switches to maintenance at Maintain and after "I’ve reached my goal"', () => {
    const plan = buildPlan(PROTOTYPE_USER);
    expect(deficitOn(plan, '2027-01-04')).toBe(true);
    expect(deficitOn(plan, plan.timeline.maintainStartDate)).toBe(false);
    expect(targetsFor(plan, plan.timeline.maintainStartDate).kcal).toBe(2006);
    const reached = buildPlan({ ...PROTOTYPE_USER, goalReachedAt: '2027-03-01' });
    expect(deficitOn(reached, '2027-02-28')).toBe(true);
    expect(deficitOn(reached, '2027-03-01')).toBe(false);
  });

  it('gives no deficit for a < 4 week feel-good plan', () => {
    const p = { ...PROTOTYPE_USER, startDate: '2026-11-16', weddingDate: '2026-12-05' };
    const plan = buildPlan(p);
    expect(plan.shortTimeline).toBe(true);
    expect(deficitOn(plan, '2026-11-20')).toBe(false);
  });

  it('frames expectations conservatively and never below BMI 22', () => {
    const plan = buildPlan(PROTOTYPE_USER);
    const e = plan.expectation!;
    const bmi22 = 22 * 1.626 * 1.626;
    expect(PROTOTYPE_USER.weightKg - e.highKg).toBeGreaterThanOrEqual(bmi22 - 1e-9);
    expect(e.lowKg).toBeLessThan(e.highKg);
    expect(expectedLoss({ ...PROTOTYPE_USER, weightKg: 55 }, 300, 30)).toBeNull();
  });

  it('auto-calculates kcal from macros', () => {
    expect(kcalFromMacros(30, 40, 10)).toBe(370);
  });
});

describe('guardrails (SPEC §6.7)', () => {
  const base = { safety: PROTOTYPE_USER.safety, weightKg: 61, heightCm: 163 };
  it('requires 18+', () => {
    expect(isAdult(17)).toBe(false);
    expect(isAdult(18)).toBe(true);
  });
  it('keeps Lose fat and Maintain exclusive', () => {
    expect(allowedGoals(['lose_fat', 'maintain'], base)).toEqual(['lose_fat']);
  });
  it('removes Lose fat and numbers for eating-disorder history', () => {
    const safety = { ...PROTOTYPE_USER.safety, edHistory: true };
    expect(allowedGoals(['lose_fat', 'tone'], { ...base, safety })).toEqual(['tone']);
    expect(allowedGoals(['lose_fat'], { ...base, safety })).toEqual(['maintain']);
    expect(allowedNutritionMode('habits_numbers', safety)).toBe('portions_only');
    const plan = buildPlan({ ...PROTOTYPE_USER, safety });
    expect(plan.profile.nutritionMode).toBe('portions_only');
    expect(plan.expectation).toBeNull();
    expect(deficitOn(plan, '2027-01-04')).toBe(false);
  });
  it('removes the deficit while pregnant or postpartum', () => {
    const plan = buildPlan({ ...PROTOTYPE_USER, safety: { ...PROTOTYPE_USER.safety, pregnantOrPostpartum: true } });
    expect(deficitOn(plan, '2027-01-04')).toBe(false);
    expect(plan.notes.some((n) => n.kind === 'pregnancy')).toBe(true);
  });
  it('blocks Lose fat under BMI 18.5 and rejects low target weights', () => {
    expect(loseFatBlockedReason({ ...base, weightKg: 47 })).not.toBeNull();
    expect(effectiveProfile({ ...PROTOTYPE_USER, weightKg: 47 }).goals).toEqual(['tone']);
    expect(targetWeightAllowed(48, 163)).toBe(false);
    expect(targetWeightAllowed(55, 163)).toBe(true);
  });
});

describe('meals', () => {
  it('gives 3/3/4/3 options for every diet', () => {
    for (const diet of ['none', 'vegetarian', 'vegan', 'pescatarian', 'no_pork', 'gluten_free', 'dairy_free'] as const) {
      const m = menuForDate('2026-11-16', { diet, avoid: [], kcal: 1700 });
      expect([m.b.length, m.main.length, m.s.length, m.x.length], diet).toEqual([3, 3, 4, 3]);
    }
  });
  it('filters by diet and the avoid list', () => {
    const vegan = TEMPLATES.filter((t) => templateAllowed(t, 'vegan', []));
    expect(vegan.some((t) => t.id === 'chicken-bowl')).toBe(false);
    expect(vegan.some((t) => t.id === 'tofu-stir-fry')).toBe(true);
    const noSalmon = TEMPLATES.filter((t) => templateAllowed(t, 'none', ['salmon']));
    expect(noSalmon.some((t) => t.id === 'salmon-plate')).toBe(false);
  });
  it('scales portions in three tiers', () => {
    expect(portionTier(1400)).toBe(0.85);
    expect(portionTier(1800)).toBe(1);
    expect(portionTier(2500)).toBe(1.15);
    const small = menuForDate('2026-11-16', { diet: 'none', avoid: [], kcal: 1400 });
    const big = menuForDate('2026-11-16', { diet: 'none', avoid: [], kcal: 2500 });
    expect(big.main[0].k).toBeGreaterThan(small.main[0].k);
  });
  it('writes natural amounts, keeps countable foods whole, and varies dinner from lunch', () => {
    const all = [0, 1, 2, 3, 4, 5, 6].flatMap((i) => {
      const m = menuForDate(`2026-11-${16 + i}`, { diet: 'none', avoid: [], kcal: 1400 });
      return [...m.b, ...m.main, ...m.dinner];
    });
    const lines = all.flatMap((o) => o.lines);
    expect(lines.some((l) => /\b(eggs? large|whites egg|cakes rice)\b/.test(l))).toBe(false);
    expect(lines.some((l) => /[½¼¾] large eggs/.test(l))).toBe(false);
    const m = menuForDate('2026-11-16', { diet: 'none', avoid: [], kcal: 1700 });
    expect(m.dinner.map((o) => o.id)).not.toEqual(m.main.map((o) => o.id));
  });

  it('always keeps the treat night option', () => {
    const m = menuForDate('2026-11-17', { diet: 'none', avoid: [], kcal: 1700, treat: 'ice cream' });
    expect(m.x[2].name).toBe('Ice cream night');
  });
});

describe('schedule ops (SPEC §9–10.2)', () => {
  const plan = buildPlan(PROTOTYPE_USER);
  const tpl = defaultWeekTemplate(2, PROTOTYPE_USER.activities, 'home_db', PROTOTYPE_USER.focusAreas);
  it('moves, adds, removes and swaps', () => {
    const moved = applyOps(tpl, [{ op: 'move', sessionId: 'str-1', toDay: 'tue' }, { op: 'add', activity: 'yoga', day: 'sun' }], plan.profile);
    expect(moved.days[1].some((s) => s.id === 'str-1')).toBe(true);
    expect(moved.days[6].some((s) => s.kind === 'activity' && s.type === 'yoga')).toBe(true);
    const removed = applyOps(tpl, [{ op: 'remove', sessionId: 'act-run-1' }]);
    expect(removed.days[1].some((s) => s.id === 'act-run-1')).toBe(false);
    const swapped = applyOps(tpl, [{ op: 'swap', a: 'str-1', b: 'act-pilates-5' }]);
    expect(swapped.days[5].some((s) => s.id === 'str-1')).toBe(true);
    expect(() => applyOps(tpl, [{ op: 'remove', sessionId: 'nope' }])).toThrow(OpError);
    expect(tpl.days[0].some((s) => s.id === 'str-1')).toBe(true);
  });
  it('warns on back-to-back same-pattern sessions and busy days', () => {
    const t = applyOps(tpl, [{ op: 'move', sessionId: 'str-2', toDay: 'mon' }]);
    expect(validateTemplate(t, 'home_db', [])).toEqual([]);
    const four = defaultWeekTemplate(4, [], 'home_db', []);
    const clash = applyOps(four, [{ op: 'move', sessionId: 'str-3', toDay: 'tue' }]);
    expect(validateTemplate(clash, 'home_db', []).length).toBeGreaterThan(0);
    const busy = applyOps(tpl, [{ op: 'add', activity: 'yoga', day: 'tue' }, { op: 'add', activity: 'cycling', day: 'tue' }]);
    expect(validateTemplate(busy, 'home_db', []).some((w) => w.day === 1)).toBe(true);
  });
  it('keeps edits after a profile change only while they still fit', () => {
    const edited = applyOps(tpl, [{ op: 'move', sessionId: 'str-1', toDay: 'wed' }]);
    expect(reconcileOverrides(edited, { ...PROTOTYPE_USER, weddingDate: '2027-11-20' }).template).not.toBeNull();
    expect(reconcileOverrides(edited, { ...PROTOTYPE_USER, strengthDays: 3 }).template).toBeNull();
    const noRun = { ...PROTOTYPE_USER, activities: PROTOTYPE_USER.activities.filter((a) => a.id !== 'run') };
    const r = reconcileOverrides(edited, noRun);
    expect(r.dropped).toBe(1);
  });
});

describe('day plan', () => {
  it('shows the prototype Monday as Strength A in Foundation', () => {
    const plan = buildPlan(PROTOTYPE_USER);
    const d = dayPlan(plan, null, '2026-11-16');
    expect(d.title).toBe('Strength A');
    expect(d.phase.name).toBe('foundation');
    expect(d.week).toBe(1);
    expect(d.walk).not.toBeNull();
    expect(dayPlan(plan, null, '2026-11-14').status).toBe('before');
    const tue = dayPlan(plan, null, '2026-11-17');
    expect(tue.title).toBe('Easy run + walk');
  });
});
