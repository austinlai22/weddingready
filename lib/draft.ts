import { addDays, isISODate, nextMonday } from './engine/dates';
import { defaultNutritionMode, isAdult, loseFatBlockedReason, MIN_AGE } from './engine/guardrails';
import { bmi } from './engine/nutrition';
import type { PlanHandoff } from './handoff';
import type { Activity, ActivityType, Diet, Equipment, Experience, FocusArea, Goal, Job, NutritionMode, Outfit, Profile, Sex, Units } from './types';

// Onboarding/settings form state. Inputs stay strings until validated, so a
// half-typed number never reaches the profile.

export interface Draft {
  name: string;
  weddingDate: string;
  fittingDate: string;
  fittingUnknown: boolean;
  age: string;
  sex: Sex | '';
  units: Units;
  heightFt: string;
  heightIn: string;
  heightCm: string;
  weight: string;
  outfit: Outfit | '';
  goals: Goal[];
  focusAreas: FocusArea[];
  focusTouched: boolean;
  strengthDays: 2 | 3 | 4 | 5;
  equipment: Equipment;
  experience: Experience;
  sessionMinutes: 30 | 45 | 60;
  activities: Activity[];
  job: Job | '';
  walkMinutes: string;
  steps: string;
  nutritionMode: NutritionMode | '';
  nutritionTouched: boolean;
  diet: Diet;
  avoid: string;
  treat: string;
  safety: { pregnantOrPostpartum: boolean; edHistory: boolean; medicalCondition: boolean; none: boolean };
  startDate: string;
  goalReachedAt?: string;
}

export function defaultUnits(): Units {
  if (typeof navigator === 'undefined') return 'imperial';
  const lang = navigator.language || 'en-US';
  return /^en-(US|LR)$|^my(-|$)/i.test(lang) ? 'imperial' : 'metric';
}

export function emptyDraft(units: Units = defaultUnits()): Draft {
  return {
    name: '',
    weddingDate: '',
    fittingDate: '',
    fittingUnknown: false,
    age: '',
    sex: '',
    units,
    heightFt: '',
    heightIn: '',
    heightCm: '',
    weight: '',
    outfit: '',
    goals: [],
    focusAreas: [],
    focusTouched: false,
    strengthDays: 3,
    equipment: 'home_db',
    experience: 'some',
    sessionMinutes: 45,
    activities: [],
    job: '',
    walkMinutes: '',
    steps: '',
    nutritionMode: 'habits_numbers',
    nutritionTouched: false,
    diet: 'none',
    avoid: '',
    treat: '',
    safety: { pregnantOrPostpartum: false, edHistory: false, medicalCondition: false, none: false },
    startDate: '',
  };
}

export const OUTFIT_FOCUS: Record<Outfit, FocusArea[]> = {
  dress: ['shoulders', 'upper_back', 'arms'],
  suit: ['shoulders', 'chest', 'upper_back'],
  other: [],
};

const num = (s: string) => {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
};

export function draftHeightCm(d: Draft): number {
  if (d.units === 'metric') return num(d.heightCm);
  const ft = num(d.heightFt);
  const inch = d.heightIn.trim() === '' ? 0 : num(d.heightIn);
  return (ft * 12 + inch) * 2.54;
}

export function draftWeightKg(d: Draft): number {
  const w = num(d.weight);
  return d.units === 'metric' ? w : w / 2.20462;
}

/** Switching units converts what was typed instead of clearing it. */
export function switchUnits(d: Draft, units: Units): Draft {
  if (units === d.units) return d;
  const cm = draftHeightCm(d);
  const kg = draftWeightKg(d);
  const next = { ...d, units };
  if (Number.isFinite(cm) && cm > 0) {
    if (units === 'metric') next.heightCm = String(Math.round(cm));
    else {
      const totalIn = Math.round(cm / 2.54);
      next.heightFt = String(Math.floor(totalIn / 12));
      next.heightIn = String(totalIn % 12);
    }
  }
  if (Number.isFinite(kg) && kg > 0) next.weight = String(units === 'metric' ? Math.round(kg * 10) / 10 : Math.round(kg * 2.20462));
  return next;
}

/** A new setup draft from a plan code: the training details are filled in; body and health questions stay for the person. */
export function draftFromHandoff(h: PlanHandoff, units: Units = defaultUnits()): Draft {
  return {
    ...emptyDraft(units),
    weddingDate: h.weddingDate,
    fittingDate: h.fittingDate ?? '',
    fittingUnknown: !h.fittingDate,
    outfit: h.outfit,
    goals: h.goals,
    focusAreas: h.focusAreas,
    focusTouched: true,
    strengthDays: h.strengthDays,
    equipment: h.equipment,
    experience: h.experience,
    sessionMinutes: h.sessionMinutes,
    activities: h.activities,
  };
}

export function draftFromProfile(p: Profile): Draft {
  const totalIn = Math.round(p.heightCm / 2.54);
  return {
    ...emptyDraft(p.units),
    name: p.name ?? '',
    weddingDate: p.weddingDate,
    fittingDate: p.fittingDate ?? '',
    fittingUnknown: !p.fittingDate,
    age: String(p.age),
    sex: p.sex,
    heightFt: String(Math.floor(totalIn / 12)),
    heightIn: String(totalIn % 12),
    heightCm: String(Math.round(p.heightCm * 10) / 10),
    weight: String(p.units === 'metric' ? Math.round(p.weightKg * 10) / 10 : Math.round(p.weightKg * 2.20462)),
    outfit: p.outfit,
    goals: p.goals,
    focusAreas: p.focusAreas,
    focusTouched: true,
    strengthDays: p.strengthDays,
    equipment: p.equipment,
    experience: p.experience,
    sessionMinutes: p.sessionMinutes,
    activities: p.activities,
    job: p.job,
    walkMinutes: p.dailyWalkMinutes != null ? String(p.dailyWalkMinutes) : '',
    steps: p.dailySteps != null ? String(p.dailySteps) : '',
    nutritionMode: p.nutritionMode,
    nutritionTouched: true,
    diet: p.diet,
    avoid: p.avoid.join(', '),
    treat: p.treat ?? '',
    safety: { ...p.safety, none: !p.safety.edHistory && !p.safety.medicalCondition && !p.safety.pregnantOrPostpartum },
    startDate: p.startDate,
    goalReachedAt: p.goalReachedAt,
  };
}

// Setup screens. Each groups several question sets (SPEC §5 steps, listed in
// `checks`) so the flow is 5 short screens plus the plan summary.
export const SETUP_SCREENS = [
  { title: 'Let’s get you wedding ready.', intro: 'A free plan that works back from your wedding date and tells you what to do each day. About 2 minutes.', checks: [2] },
  { title: 'About you', intro: 'For your protein and energy estimates. It stays on this device.', checks: [3] },
  { title: 'Your goals', intro: 'What you’re wearing picks your focus muscles. Change them if you like.', checks: [4, 5, 6] },
  { title: 'Your week', intro: 'We’ll fit strength training around what you already do.', checks: [7, 8, 9] },
  { title: 'Food and health', intro: 'Pick the level of detail that feels good, and anything we should know.', checks: [10, 11] },
  { title: 'Your plan', intro: 'Here’s what the next few months look like.', checks: [] },
] as const;

export const STEP_COUNT = SETUP_SCREENS.length;

/** First problem on a setup screen (1-based), or null. */
export function validateScreen(screen: number, d: Draft, today: string): string | null {
  for (const step of SETUP_SCREENS[screen - 1]?.checks ?? []) {
    const e = validateStep(step, d, today);
    if (e) return e;
  }
  return null;
}

/** Validation for one step (1-based). Returns a short, friendly message or null. */
export function validateStep(step: number, d: Draft, today: string): string | null {
  switch (step) {
    case 2: {
      if (!isISODate(d.weddingDate)) return 'Pick your wedding date.';
      if (d.weddingDate <= today) return 'The wedding date needs to be in the future.';
      if (d.weddingDate > addDays(today, MAX_PLAN_DAYS)) return 'Pick a date within the next two years. The plan is built for the final stretch before the day.';
      const fitting = fittingProblem(d);
      if (fitting) return fitting;
      if (!d.fittingUnknown && d.fittingDate && d.fittingDate < today) return 'The fitting date has already passed. Leave it blank if it’s done.';
      return null;
    }
    case 3: {
      const age = num(d.age);
      if (!Number.isInteger(age) || age < 1 || age > 110) return 'Enter your age in whole years.';
      if (!isAdult(age)) return `under-${MIN_AGE}`;
      if (!d.sex) return 'Choose the option to use for the calorie math.';
      const cm = draftHeightCm(d);
      if (!Number.isFinite(cm) || cm < 120 || cm > 230) return 'Check your height.';
      const kg = draftWeightKg(d);
      if (!Number.isFinite(kg) || kg < 35 || kg > 300) return 'Check your weight.';
      return null;
    }
    case 4:
      return d.outfit ? null : 'Choose what you’re wearing.';
    case 5:
      if (!d.goals.length) return 'Pick at least one goal.';
      if (d.goals.includes('lose_fat') && d.goals.includes('maintain')) return 'Lose fat and Maintain can’t both be on.';
      return null;
    case 6:
      return d.focusAreas.length > 3 ? 'Pick up to 3 focus areas.' : null;
    case 8: {
      for (const a of d.activities) {
        if (!a.label.trim()) return 'Give each activity a name.';
        if (!a.days.length) return `Pick at least one day for ${a.label.trim() || 'each activity'}.`;
      }
      return null;
    }
    case 9: {
      if (!d.job) return 'Choose what your day mostly looks like.';
      if (d.walkMinutes && !(num(d.walkMinutes) >= 0 && num(d.walkMinutes) <= 600)) return 'Walking minutes should be between 0 and 600.';
      if (d.steps && !(num(d.steps) >= 0 && num(d.steps) <= 60000)) return 'Steps should be between 0 and 60,000.';
      return null;
    }
    case 10:
      return d.nutritionMode ? null : 'Choose a food style.';
    case 11:
      return d.safety.none || d.safety.edHistory || d.safety.medicalCondition || d.safety.pregnantOrPostpartum ? null : 'Choose one or more options, or “None of these”.';
    default:
      return null;
  }
}

/** Plans run at most two years: longer would stretch the phases far past what they're designed for. */
export const MAX_PLAN_DAYS = 730;

/** Fitting checks that hold whatever today is. */
function fittingProblem(d: Draft): string | null {
  if (d.fittingUnknown || !d.fittingDate) return null;
  if (!isISODate(d.fittingDate)) return 'That fitting date doesn’t look right.';
  if (d.fittingDate >= d.weddingDate) return 'The fitting needs to be before the wedding.';
  return null;
}

export function validateAll(d: Draft, today: string, opts: { allowPastWedding?: boolean } = {}): string | null {
  for (let s = 2; s <= 11; s++) {
    // Settings with an unchanged wedding date: the dates may already have passed, but the fitting must still come first.
    if (s === 2 && opts.allowPastWedding) {
      if (!isISODate(d.weddingDate)) return 'Pick your wedding date.';
      const fitting = fittingProblem(d);
      if (fitting) return fitting;
      continue;
    }
    const e = validateStep(s, d, today);
    if (e) return e === `under-${MIN_AGE}` ? `This plan is for people ${MIN_AGE} and over.` : e;
  }
  return null;
}

/** Monday after today, or today when the wedding comes first (or the person asks). */
export function defaultStart(today: string, weddingDate: string): string {
  const mon = nextMonday(today);
  return isISODate(weddingDate) && mon > weddingDate ? today : mon;
}

export function profileFromDraft(d: Draft, startDate: string): Profile {
  const heightCm = Math.round(draftHeightCm(d) * 10) / 10;
  const weightKg = Math.round(draftWeightKg(d) * 10) / 10;
  const safety = { pregnantOrPostpartum: d.safety.pregnantOrPostpartum, edHistory: d.safety.edHistory, medicalCondition: d.safety.medicalCondition };
  let goals = [...new Set(d.goals)];
  if (loseFatBlockedReason({ safety, weightKg, heightCm })) goals = goals.filter((g) => g !== 'lose_fat');
  if (!goals.length) goals = ['maintain'];
  const nutritionMode: NutritionMode = safety.edHistory ? 'portions_only' : (d.nutritionMode || defaultNutritionMode(safety));
  // A daily walk added as an activity counts as daily walking when no number was typed.
  const dailyWalk = d.activities.find((a) => a.type === 'walk' && new Set(a.days).size === 7 && a.minutes);
  const walk = d.walkMinutes.trim() ? Math.round(num(d.walkMinutes)) : dailyWalk?.minutes;
  const steps = d.steps.trim() ? Math.round(num(d.steps)) : undefined;
  return {
    version: 1,
    ...(d.name.trim() ? { name: d.name.trim().slice(0, 40) } : {}),
    weddingDate: d.weddingDate,
    ...(!d.fittingUnknown && d.fittingDate ? { fittingDate: d.fittingDate } : {}),
    age: Math.round(num(d.age)),
    sex: (d.sex || 'unspecified') as Sex,
    heightCm,
    weightKg,
    units: d.units,
    outfit: (d.outfit || 'other') as Outfit,
    goals,
    focusAreas: d.focusAreas.slice(0, 3),
    strengthDays: d.strengthDays,
    equipment: d.equipment,
    experience: d.experience,
    sessionMinutes: d.sessionMinutes,
    activities: d.activities.map((a) => ({ ...a, label: a.label.trim().slice(0, 40), days: [...new Set(a.days)].sort() })),
    job: (d.job || 'mixed') as Job,
    ...(walk != null ? { dailyWalkMinutes: walk } : {}),
    ...(steps != null ? { dailySteps: steps } : {}),
    nutritionMode,
    diet: d.diet,
    avoid: d.avoid.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20).map((s) => s.slice(0, 60)),
    ...(d.treat.trim() ? { treat: d.treat.trim().slice(0, 40) } : {}),
    safety,
    startDate,
    ...(d.goalReachedAt ? { goalReachedAt: d.goalReachedAt } : {}),
  };
}

export function draftBmi(d: Draft): number {
  const cm = draftHeightCm(d);
  const kg = draftWeightKg(d);
  return Number.isFinite(cm) && Number.isFinite(kg) && cm > 0 ? bmi(kg, cm) : NaN;
}

export const ACTIVITY_DEFAULT_LABEL: Record<ActivityType, string> = {
  walk: 'Walk',
  run: 'Run',
  pilates: 'Pilates',
  yoga: 'Yoga',
  cycling: 'Cycling',
  classes: 'Class',
  sports: 'Sports',
  other: '',
};

export function maxFittingDate(weddingDate: string): string {
  return isISODate(weddingDate) ? addDays(weddingDate, -1) : '';
}
