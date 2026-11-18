// npm run plan:sweep
//
// Builds plans across sex, age, body size, every goal combination, experience,
// strength days, equipment, session length and timeline (152,744 of 291,600
// combinations), and checks rules that must always hold: no rule-breaking default or
// chosen week, no duplicate exercises, sessions within their length, every
// deficit inside its caps and floors, goal ranges that never pass the goal or a
// healthy weight, and no 5-day split from 65. Prints any break with its inputs.

import { PROTOTYPE_USER } from '../lib/engine/fixtures';
import { buildPlan, dayPlan, targetsFor } from '../lib/engine/plan';
import { bmr, weightAtBmi } from '../lib/engine/nutrition';
import { engineTemplate, validateTemplate } from '../lib/engine/schedule';
import { sessionMinutes } from '../lib/engine/workouts';
import { recommendWeek } from '../lib/engine/recommend';
import { addDays } from '../lib/engine/dates';
import type { Goal, Profile } from '../lib/types';

const problems = new Map<string, string>();
const flag = (k: string, ctx: string) => { if (!problems.has(k)) problems.set(k, ctx); };
const goalSets: Goal[][] = [['tone'], ['strength'], ['lose_fat'], ['maintain'], ['tone', 'lose_fat'], ['strength', 'lose_fat'], ['tone', 'strength'], ['tone', 'strength', 'lose_fat'], ['tone', 'maintain'], ['strength', 'maintain']];
let n = 0;
let built = 0;
for (const sex of ['female', 'male', 'unspecified'] as const)
for (const age of [18, 30, 45, 60, 65, 80])
for (const [h, w] of [[150, 45], [162, 61], [175, 110], [190, 85], [160, 50]])
for (const goals of goalSets)
for (const experience of ['new', 'some', 'experienced'] as const)
for (const strengthDays of [2, 3, 4, 5] as const)
for (const equipment of ['home_db', 'gym', 'bodyweight'] as const)
for (const sessionMinutes_ of [30, 45, 60] as const)
for (const wedding of ['2026-12-10', '2027-02-20', '2027-10-17']) {
  if ((n++ % 7) !== 0 && !(age === 65 || sex === 'male')) continue; // sample to keep it quick
  built++;
  const goalWeightKg = goals.includes('lose_fat') ? Math.max(weightAtBmi(18.6, h), w - 8) : undefined;
  const p: Profile = { ...PROTOTYPE_USER, sex, age, heightCm: h, weightKg: w, goals, experience, strengthDays, equipment, sessionMinutes: sessionMinutes_, weddingDate: wedding, activities: [], dailyWalkMinutes: 0, ...(goalWeightKg && goalWeightKg < w ? { goalWeightKg } : {}) };
  const ctx = JSON.stringify({ sex, age, h, w, goals, experience, strengthDays, equipment, sessionMinutes_, wedding });
  let plan;
  try { plan = buildPlan(p); } catch (e) { flag('buildPlan throws: ' + (e as Error).message, ctx); continue; }
  const t = engineTemplate(plan.profile);
  if (validateTemplate(t, equipment, plan.profile.focusAreas).some((x) => x.severity === 'rule')) flag('default week breaks a rule', ctx);
  // Every 3rd week through the plan.
  for (let d = plan.timeline.startMonday; d <= plan.timeline.weddingDate; d = addDays(d, 17)) {
    const day = dayPlan(plan, null, d);
    for (const s of day.sessions) if (s.kind === 'strength') {
      const ids = s.exercises.map((e) => e.exercise.id);
      if (new Set(ids).size !== ids.length) flag('duplicate exercise', ctx + d);
      const mins = sessionMinutes(s.exercises);
      if (mins > sessionMinutes_ + 0.01 && s.exercises.some((e) => !e.main)) flag('session over length with accessories left', ctx + d);
      if (s.exercises.some((e) => e.restMin < 30 || e.restMax <= e.restMin)) flag('odd rest', ctx + d);
      if (sex !== 'female' || experience !== 'new' || day.phase.name !== 'foundation') if (ids.includes('bw-incline-pushup') && equipment !== 'bodyweight') flag('incline outside its case', ctx + d + day.phase.name);
    }
    const tg = targetsFor(plan, d);
    const floor = Math.max(bmr(plan.profile), sex === 'male' ? 1500 : 1200);
    if (tg.deficit > 0 && tg.kcal + 1 < Math.min(floor, tg.tdee)) flag('below floor', ctx + d);
    if (tg.deficit > 0 && !plan.profile.goals.includes('lose_fat')) flag('deficit without lose_fat', ctx);
    const weeklyCap = (age >= 65 ? 0.005 : 0.0075) * w * 7700 / 7;
    if (tg.deficit > weeklyCap + 1) flag('deficit over weekly cap', ctx + d + ' ' + tg.deficit);
    if (goals.includes('strength') && tg.deficit > 501) flag('strength deficit over 500', ctx + d + ' ' + tg.deficit);
    if (!(tg.protein[0] > 0 && tg.protein[1] >= tg.protein[0])) flag('protein range', ctx);
  }
  if (plan.goal) {
    if (plan.goal.highKg > plan.goal.toLoseKg + 1e-9 || plan.goal.lowKg > plan.goal.highKg + 1e-9) flag('goal range', ctx);
    if (w - plan.goal.highKg < weightAtBmi(18.5, h) - 0.01) flag('goal range below healthy BMI', ctx);
  }
  if (plan.profile.goals.includes('lose_fat') && plan.profile.goals.includes('maintain')) flag('lose+maintain', ctx);
  const weeks = plan.timeline.totalWeeks;
  const rec = recommendWeek({ goals: plan.profile.goals, experience, weeksToWedding: weeks, activities: [], equipment, focusAreas: plan.profile.focusAreas, age });
  if (age >= 65 && rec.strengthDays === 5) flag('5 days at 65+', ctx);
  if (rec.cardio && new Set(rec.cardio.days).size !== rec.cardio.days.length) flag('cardio dup days', ctx);
  const recPlan = buildPlan({ ...p, strengthDays: rec.strengthDays, activities: rec.cardio ? [rec.cardio] : [] });
  const rt = engineTemplate(recPlan.profile);
  if (validateTemplate(rt, equipment, recPlan.profile.focusAreas).some((x) => x.severity === 'rule')) flag('chosen week breaks a rule', ctx);
  if (rec.cardio) { const sd = new Set(rt.days.flatMap((d, i) => d.some((s) => s.kind === 'strength') ? [i] : [])); if (rec.cardio.days.some((d) => sd.has(d)) && rec.cardio.days.length + sd.size <= 7) flag('cardio on a lifting day despite free days', ctx + JSON.stringify([...sd]) + JSON.stringify(rec.cardio.days)); }
}
console.log(`built and checked ${built} plans (of ${n} combinations)`);
for (const [k, v] of problems) console.log('✗', k, '\n   ', v);
if (!problems.size) console.log('no problems');
