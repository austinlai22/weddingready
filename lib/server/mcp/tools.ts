// The agent tools' logic: plain functions over the same engine and data the
// web app uses, so an assistant and the app can never give different plans.
// Nothing here stores anything; every input arrives with the call.

import { PHASE_COPY } from '../../engine/copy';
import { addDays, DAY_NAMES, dayIndex, isISODate, nextMonday } from '../../engine/dates';
import { ED_HELPLINE, isAdult, loseFatBlockedReason, safetyNotes } from '../../engine/guardrails';
import { dietConflict, FOODS, searchFoods } from '../../engine/meals';
import { targets } from '../../engine/nutrition';
import { buildPlan, dayPlan, type Plan } from '../../engine/plan';
import { defaultWeekTemplate, shapeOf, weekIssues } from '../../engine/split';
import { suggestWeekFix } from '../../engine/suggest';
import { sessionMinutes, workoutMeta } from '../../engine/workouts';
import { MAX_PLAN_DAYS, OUTFIT_FOCUS } from '../../draft';
import {
  DAY_IDS,
  type Activity,
  type ActivityType,
  type DayId,
  type Diet,
  type Equipment,
  type Experience,
  type FocusArea,
  type Goal,
  type Job,
  type Outfit,
  type Profile,
  type SessionRef,
  type Sex,
  type WeekTemplate,
} from '../../types';

export class ToolInputError extends Error {}

export const SITE = 'https://weddingready.vercel.app';
export const DISCLAIMER = 'General guidance, not medical advice. No dietitian or certified trainer has reviewed these rules yet. If an exercise hurts, stop.';

// ---------- Inputs ----------

export const EQUIPMENT = { home_dumbbells: 'home_db', gym: 'gym', bodyweight: 'bodyweight' } as const satisfies Record<string, Equipment>;
export type EquipmentInput = keyof typeof EQUIPMENT;

export interface ActivityInput {
  type: ActivityType;
  days: DayId[];
  label?: string;
}

export interface TrainingInput {
  wedding_date: string;
  start_date?: string;
  fitting_date?: string;
  goals?: Goal[];
  strength_days?: number;
  equipment?: EquipmentInput;
  experience?: Experience;
  session_minutes?: number;
  outfit?: Outfit;
  focus_areas?: FocusArea[];
  activities?: ActivityInput[];
}

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  walk: 'Walk',
  run: 'Run',
  pilates: 'Pilates',
  yoga: 'Yoga',
  cycling: 'Cycling',
  classes: 'Class',
  sports: 'Sports',
  other: 'Activity',
};

function activitiesFrom(list: ActivityInput[] = []): Activity[] {
  return list.map((a, i) => ({
    id: `a${i + 1}`,
    type: a.type,
    label: (a.label?.trim() || ACTIVITY_LABEL[a.type]).slice(0, 40),
    days: [...new Set(a.days.map((d) => DAY_IDS.indexOf(d)))].sort(),
  }));
}

function strengthDaysFrom(n = 3): 2 | 3 | 4 | 5 {
  if (![2, 3, 4, 5].includes(n)) throw new ToolInputError('strength_days must be 2, 3, 4 or 5.');
  return n as 2 | 3 | 4 | 5;
}

/** The same date checks as setup: future wedding within two years, fitting before it. */
function checkDates(input: TrainingInput, today: string): { start: string } {
  const { wedding_date: wedding, fitting_date: fitting } = input;
  if (!isISODate(wedding)) throw new ToolInputError('wedding_date must be a real date as YYYY-MM-DD.');
  if (wedding <= today) throw new ToolInputError(`wedding_date must be after today (${today}).`);
  if (wedding > addDays(today, MAX_PLAN_DAYS)) throw new ToolInputError('wedding_date must be within two years of today. The plan is built for the final stretch.');
  if (fitting !== undefined) {
    if (!isISODate(fitting)) throw new ToolInputError('fitting_date must be a real date as YYYY-MM-DD.');
    if (fitting >= wedding) throw new ToolInputError('fitting_date must be before wedding_date.');
  }
  let start = input.start_date;
  if (start !== undefined) {
    if (!isISODate(start)) throw new ToolInputError('start_date must be a real date as YYYY-MM-DD.');
    if (start >= wedding) throw new ToolInputError('start_date must be before wedding_date.');
  } else {
    const mon = nextMonday(today);
    start = mon < wedding ? mon : today;
  }
  return { start };
}

/**
 * A training profile. Body measurements don't change the training plan, so
 * neutral placeholders stand in for them; nothing about calories is returned
 * from the training tools.
 */
function trainingProfile(input: TrainingInput, today: string): Profile {
  const { start } = checkDates(input, today);
  const outfit = input.outfit ?? 'other';
  const goals = input.goals?.length ? [...new Set(input.goals)] : (['tone'] as Goal[]);
  if (goals.includes('lose_fat') && goals.includes('maintain')) throw new ToolInputError('goals can’t include both lose_fat and maintain.');
  return {
    version: 1,
    weddingDate: input.wedding_date,
    ...(input.fitting_date ? { fittingDate: input.fitting_date } : {}),
    age: 30,
    sex: 'unspecified',
    heightCm: 170,
    weightKg: 70,
    units: 'metric',
    outfit,
    goals,
    focusAreas: (input.focus_areas ?? OUTFIT_FOCUS[outfit]).slice(0, 3),
    strengthDays: strengthDaysFrom(input.strength_days),
    equipment: EQUIPMENT[input.equipment ?? 'home_dumbbells'],
    experience: input.experience ?? 'some',
    sessionMinutes: ([30, 45, 60].includes(input.session_minutes ?? 45) ? (input.session_minutes ?? 45) : 45) as 30 | 45 | 60,
    activities: activitiesFrom(input.activities),
    job: 'mixed',
    nutritionMode: 'habits',
    diet: 'none',
    avoid: [],
    safety: { pregnantOrPostpartum: false, edHistory: false, medicalCondition: false },
    startDate: start,
  };
}

// ---------- Shared output pieces ----------

function sessionName(s: SessionRef, strengthDays: number): string {
  if (s.kind !== 'strength') return s.label;
  const m = workoutMeta(s.workout, strengthDays);
  return `${m.title} (${m.subtitle.toLowerCase()})`;
}

function weekOut(t: WeekTemplate, strengthDays: number) {
  return Object.fromEntries(DAY_IDS.map((d, i) => [d, t.days[i].map((s) => sessionName(s, strengthDays))])) as Record<DayId, string[]>;
}

function weekCheck(p: Pick<Profile, 'strengthDays' | 'activities' | 'equipment' | 'focusAreas'>) {
  const t = defaultWeekTemplate(p.strengthDays, p.activities, p.equipment, p.focusAreas);
  const issues = weekIssues(shapeOf(t), p.equipment, p.focusAreas);
  const fix = suggestWeekFix(p);
  return {
    week: weekOut(t, p.strengthDays),
    rule_problems: issues.filter((i) => i.severity === 'rule').map((i) => i.text),
    tips: issues.filter((i) => i.severity === 'note').map((i) => i.text),
    suggested_fix: fix
      ? fix.kind === 'moves'
        ? { change: 'move activities', moves: fix.moves.map((m) => ({ activity: m.label, from: DAY_IDS[m.from], to: DAY_IDS[m.to] })), why: fix.text }
        : fix.kind === 'days'
          ? { change: 'fewer strength days', strength_days: fix.strengthDays, why: fix.text }
          : { change: 'keep the week lighter', why: fix.text }
      : null,
  };
}

const SPLIT_RULES =
  '2–3 strength days are full body: never back to back, with an easy day (rest, walk, yoga or Pilates) between them. 4 days is upper/lower and 5 days is upper, lower, push, pull, legs; those may run back to back, but never the same main lifts two days running, and the week keeps at least one easy day. Runs, rides, classes and sports are kept off strength days where possible.';

// ---------- build_plan ----------

export function buildWeddingPlan(input: TrainingInput, today: string) {
  const profile = trainingProfile(input, today);
  const plan = buildPlan(profile);
  const t = plan.timeline;
  const weekStart = (w: number) => addDays(t.startMonday, (w - 1) * 7);
  return {
    wedding_date: t.weddingDate,
    start_date: profile.startDate,
    total_weeks: t.totalWeeks,
    phases: t.phases.map((p) => ({
      phase: p.label,
      weeks: p.weeks,
      from: p.startDate,
      to: p.endDate,
      focus: PHASE_COPY[p.name].focus,
      sets_and_reps: PHASE_COPY[p.name].sets,
      rest: PHASE_COPY[p.name].rest,
    })),
    recovery_weeks: t.recoveryWeeks.map((w) => ({ week: w, from: weekStart(w), to: addDays(weekStart(w), 6), what: '2 sets per exercise, same weights.' })),
    final_taper: { from: t.taperStart, to: t.weddingDate, what: '2 sets per exercise; keep usual easy activities; nothing new.' },
    fitting: profile.fittingDate
      ? {
          date: profile.fittingDate,
          maintain_starts: t.maintainStartDate,
          note: t.fittingConstrained
            ? 'The fitting is too soon for Maintain to start two weeks before it; Maintain starts as early as the plan allows.'
            : 'Maintain starts at least two weeks before the fitting so measurements stay stable for alterations.',
        }
      : null,
    weekly_schedule: weekCheck(profile),
    split_rules: SPLIT_RULES,
    open_in_app: `${SITE}/setup`,
    disclaimer: DISCLAIMER,
  };
}

// ---------- get_workout ----------

export function getWorkout(input: TrainingInput & { date?: string }, today: string) {
  const profile = trainingProfile(input, today);
  const plan: Plan = buildPlan(profile);
  const date = input.date ?? today;
  if (!isISODate(date)) throw new ToolInputError('date must be a real date as YYYY-MM-DD.');
  const day = dayPlan(plan, null, date);
  const t = plan.timeline;
  const status =
    day.status === 'before' ? `before the plan starts on ${profile.startDate} (this is a preview)` : day.status === 'after' ? 'after the wedding' : day.status === 'wedding' ? 'the wedding day' : 'during the plan';
  return {
    date,
    day: DAY_NAMES[dayIndex(date)],
    status,
    week: `${Math.min(Math.max(day.week, 1), t.totalWeeks)} of ${t.totalWeeks}`,
    phase: day.phase.label,
    recovery_week: day.recovery,
    final_taper: day.taper,
    title: day.title,
    sessions: day.sessions.map((s) =>
      s.kind === 'strength'
        ? {
            type: 'strength',
            name: s.meta.title,
            focus: s.meta.subtitle,
            about_minutes: Math.round(sessionMinutes(s.exercises) / 5) * 5,
            warm_up: `5 min: ${s.warmup}`,
            exercises: s.exercises.map((e) => ({
              name: e.exercise.name,
              prescription: e.rx,
              sets: e.sets,
              main_lift: e.main,
              focus_muscle: e.focus,
              rest_seconds: `${e.restMin}–${e.restMax}`,
              how_to: e.exercise.cues,
            })),
            weights: s.weightTip,
          }
        : { type: s.isWalk ? 'walk' : 'activity', name: s.title, how: s.how },
    ),
    note: day.sessions.length === 0 && day.how ? day.how : undefined,
    disclaimer: DISCLAIMER,
  };
}

// ---------- plan_week ----------

export function planWeek(input: { strength_days?: number; activities?: ActivityInput[]; equipment?: EquipmentInput; focus_areas?: FocusArea[] }) {
  const p = {
    strengthDays: strengthDaysFrom(input.strength_days),
    activities: activitiesFrom(input.activities),
    equipment: EQUIPMENT[input.equipment ?? 'home_dumbbells'],
    focusAreas: (input.focus_areas ?? []).slice(0, 3),
  };
  return { ...weekCheck(p), split_rules: SPLIT_RULES };
}

// ---------- nutrition_targets ----------

export interface NutritionInput {
  age: number;
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  job: Job;
  daily_walk_minutes?: number;
  strength_days?: number;
  activities?: ActivityInput[];
  goal?: 'lose_fat' | 'maintain';
  pregnant_or_postpartum?: boolean;
  eating_disorder_history?: boolean;
  medical_condition?: boolean;
}

export function nutritionTargets(input: NutritionInput) {
  if (!isAdult(input.age)) throw new ToolInputError('WeddingReady is for adults (18 and over), so it gives no targets for this age.');
  const safety = {
    pregnantOrPostpartum: !!input.pregnant_or_postpartum,
    edHistory: !!input.eating_disorder_history,
    medicalCondition: !!input.medical_condition,
  };
  const notes = safetyNotes(safety).map((n) => n.text);
  // Same rule as the app: with a history of eating disorders, no numbers at all.
  if (safety.edHistory) {
    return {
      mode: 'portions only, no numbers',
      guidance: [
        'A palm of protein at every meal and snack.',
        'Half the plate vegetables at lunch and dinner.',
        'A cupped handful of carbs, a thumb of fat.',
        'Regular meals, and one or two dessert nights a week.',
      ],
      why: 'With a history of eating disorders, WeddingReady leaves out calorie numbers and weight goals and focuses on strength, energy and regular meals.',
      support: { name: ED_HELPLINE.name, phone: ED_HELPLINE.phone, url: ED_HELPLINE.url },
      notes,
      disclaimer: DISCLAIMER,
    };
  }
  const profile: Profile = {
    ...trainingProfileFor(input),
    safety,
  };
  const blocked = loseFatBlockedReason({ safety, weightKg: input.weight_kg, heightCm: input.height_cm });
  const wantsLoss = input.goal === 'lose_fat';
  const maintenance = targets(profile, false);
  const deficit = wantsLoss && !blocked ? targets(profile, true) : null;
  const t = deficit ?? maintenance;
  return {
    goal: deficit ? 'lose fat' : 'maintain',
    lose_fat_not_offered: wantsLoss && blocked ? blocked : undefined,
    calories_per_day: {
      maintenance_range: maintenance.kcalRange,
      target_range: t.kcalRange,
      deficit: deficit ? deficit.deficit : 0,
      resting_needs: maintenance.bmr,
      activity_factor: maintenance.factor,
    },
    protein_g_per_day: t.protein,
    carbs_g_per_day: t.carbs,
    fat_g_per_day: t.fat,
    method: [
      'Resting needs: Mifflin-St Jeor (the mean of the female and male equations when sex is unspecified).',
      'Activity factor from job, daily walking and weekly sessions, capped at 1.75. Shown as a ±7.5% range because estimates can be off by 10% or more.',
      'Fat loss: 15% below maintenance, capped at 0.75% of body weight a week, never below resting needs (or 1,200 kcal; 1,500 for men).',
      'Protein 1.6–2.0 g per kg (at BMI 30+, per kg of the weight at BMI 27). Fat 25–30% of calories, at least 0.6 g/kg. Carbs are the rest.',
      'Calories go back to maintenance once the Maintain phase starts (two weeks before the fitting).',
    ],
    notes,
    disclaimer: DISCLAIMER,
  };
}

function trainingProfileFor(input: NutritionInput): Profile {
  if (!(input.height_cm >= 120 && input.height_cm <= 230)) throw new ToolInputError('height_cm must be between 120 and 230.');
  if (!(input.weight_kg >= 35 && input.weight_kg <= 300)) throw new ToolInputError('weight_kg must be between 35 and 300.');
  return {
    version: 1,
    weddingDate: '2099-01-01',
    age: Math.round(input.age),
    sex: input.sex,
    heightCm: input.height_cm,
    weightKg: input.weight_kg,
    units: 'metric',
    outfit: 'other',
    goals: [input.goal ?? 'maintain'],
    focusAreas: [],
    strengthDays: strengthDaysFrom(input.strength_days),
    equipment: 'home_db',
    experience: 'some',
    sessionMinutes: 45,
    activities: activitiesFrom(input.activities),
    job: input.job,
    ...(input.daily_walk_minutes != null ? { dailyWalkMinutes: input.daily_walk_minutes } : {}),
    nutritionMode: 'habits_numbers',
    diet: 'none',
    avoid: [],
    safety: { pregnantOrPostpartum: false, edHistory: false, medicalCondition: false },
    startDate: '2098-01-01',
  };
}

// ---------- search_foods ----------

export function searchFoodList(input: { query: string; diet?: Diet; limit?: number }) {
  const q = input.query.trim();
  if (!q) throw new ToolInputError('query must not be empty.');
  const diet = input.diet ?? 'none';
  const { results, total } = searchFoods(q, [], diet, Math.min(Math.max(input.limit ?? 8, 1), 20));
  return {
    query: q,
    matches: total,
    foods: results.map((f) => {
      const tags = (f as { tags?: string[] }).tags;
      return {
        name: f.name,
        per: `1 ${f.unit}`,
        kcal: Math.round(f.kcal),
        protein_g: Math.round(f.protein * 10) / 10,
        carbs_g: Math.round(f.carbs * 10) / 10,
        fat_g: Math.round(f.fat * 10) / 10,
        source: f.source,
        estimate: f.isRestaurantEstimate ? 'Restaurant estimate; varies a lot.' : f.isLabelEstimate ? 'Varies by brand; check the label.' : undefined,
        fits_diet: diet === 'none' ? undefined : dietConflict({ ...f, tags }, diet) === null,
      };
    }),
    note: `Searches the ${FOODS.length} foods in WeddingReady’s list. Whole foods use USDA FoodData Central values (the source names the FDC ID).`,
  };
}
