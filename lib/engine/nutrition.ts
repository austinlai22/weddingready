import { EASY_CARDIO_ID } from '../types';
import type { Profile } from '../types';

// SPEC §6.6. These are starting heuristics and must be reviewed by a registered
// dietitian before any paid launch (see README → Known limitations).

export const KCAL_PER_KG = 7700;

export function bmr(p: Pick<Profile, 'sex' | 'weightKg' | 'heightCm' | 'age'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  if (p.sex === 'male') return base + 5;
  if (p.sex === 'female') return base - 161;
  return base - 78; // mean of the female (-161) and male (+5) equations
}

/** Weekly training sessions that count toward the activity factor: strength + non-walk activities. */
export function weeklySessions(p: Pick<Profile, 'strengthDays' | 'activities'>): number {
  // Everyday walks count through daily walking; planned easy cardio counts as sessions.
  return p.strengthDays + p.activities.filter((a) => a.type !== 'walk' || a.id === EASY_CARDIO_ID).reduce((t, a) => t + new Set(a.days).size, 0);
}

export function activityFactor(p: Pick<Profile, 'job' | 'strengthDays' | 'activities' | 'dailyWalkMinutes' | 'dailySteps'>): number {
  const base = p.job === 'on_feet' ? 1.6 : p.job === 'mixed' ? 1.45 : 1.3;
  const sessions = Math.max(0, weeklySessions(p) - 2) * 0.05;
  const walkBlocks = Math.max(
    Math.floor((p.dailyWalkMinutes ?? 0) / 30),
    Math.floor((p.dailySteps ?? 0) / 3500),
  );
  const walking = Math.min(0.15, walkBlocks * 0.05);
  return Math.min(1.75, round2(base + sessions + walking));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function weightAtBmi(target: number, heightCm: number): number {
  const m = heightCm / 100;
  return target * m * m;
}

export interface Targets {
  bmr: number;
  factor: number;
  tdee: number;
  deficit: number;
  kcal: number;
  kcalRange: [number, number];
  protein: [number, number];
  fat: [number, number];
  carbs: [number, number];
  inDeficit: boolean;
}

const round10 = (n: number) => Math.round(n / 10) * 10;

/**
 * Daily targets. `deficitAllowed` is decided by the plan (goal, phase,
 * guardrails, "I've reached my goal"); this function only does the math.
 */
/** Share of the straight-line weight-loss maths people actually see (adaptation, real life); also used for expectations. */
export const REALISTIC_SHARE = 0.7;

/** Older adults lose muscle and bone more easily while dieting, so their weekly pace is gentler. */
export const OLDER_ADULT_AGE = 65;
/** Larger deficits blunt muscle and strength gains, so a strength goal keeps the deficit at or under this. */
export const STRENGTH_DEFICIT_CAP = 500;

/** The most body weight a week the plan will aim to lose: 0.75%, or 0.5% from 65. */
export function weeklyLossCap(age?: number): number {
  return age !== undefined && age >= OLDER_ADULT_AGE ? 0.005 : 0.0075;
}

/**
 * Daily deficit for Lose fat. With a goal weight and the days left until
 * Maintain, it's sized to reach the goal (allowing for adaptation), up to 20%
 * of needs; without one, a gentle 15%. Never more than 0.75% of body weight a
 * week (0.5% from 65), and at most 500 kcal alongside a strength goal.
 */
export function plannedDeficit(p: Pick<Profile, 'weightKg' | 'goalWeightKg'> & Partial<Pick<Profile, 'age' | 'goals'>>, tdee: number, deficitDays?: number): number {
  let cap = (weeklyLossCap(p.age) * p.weightKg * KCAL_PER_KG) / 7;
  if (p.goals?.includes('strength')) cap = Math.min(cap, STRENGTH_DEFICIT_CAP);
  if (p.goalWeightKg && deficitDays && deficitDays > 0) {
    const toLose = p.weightKg - p.goalWeightKg;
    if (toLose <= 0) return 0;
    const needed = (toLose * KCAL_PER_KG) / deficitDays / REALISTIC_SHARE;
    return Math.min(needed, 0.2 * tdee, cap);
  }
  return Math.min(0.15 * tdee, cap);
}

export function targets(p: Profile, deficitAllowed: boolean, deficitDays?: number): Targets {
  const b = bmr(p);
  const factor = activityFactor(p);
  const tdee = b * factor;
  let kcal = tdee;
  let deficit = 0;
  if (deficitAllowed) {
    deficit = plannedDeficit(p, tdee, deficitDays);
    const floor = Math.max(b, p.sex === 'male' ? 1500 : 1200);
    kcal = Math.min(tdee, Math.max(tdee - deficit, floor));
    deficit = tdee - kcal;
  }
  const refWeight = bmi(p.weightKg, p.heightCm) >= 30 ? weightAtBmi(27, p.heightCm) : p.weightKg;
  const protein: [number, number] = [Math.round(1.6 * refWeight), Math.round(2.0 * refWeight)];
  const fatMin = 0.6 * p.weightKg;
  const fat: [number, number] = [
    Math.round(Math.max((0.25 * kcal) / 9, fatMin)),
    Math.round(Math.max((0.3 * kcal) / 9, fatMin)),
  ];
  const carbs: [number, number] = [
    Math.max(0, Math.round((kcal - protein[1] * 4 - fat[1] * 9) / 4)),
    Math.max(0, Math.round((kcal - protein[0] * 4 - fat[0] * 9) / 4)),
  ];
  return {
    bmr: Math.round(b),
    factor,
    tdee: Math.round(tdee),
    deficit: Math.round(deficit),
    kcal: Math.round(kcal),
    kcalRange: [round10(kcal * 0.925), round10(kcal * 1.075)],
    protein,
    fat,
    carbs,
    inDeficit: deficit > 0,
  };
}

export interface Expectation {
  lowKg: number;
  highKg: number;
}

/**
 * Realistic-expectations range for Lose fat: 40–70% of the straight-line
 * projection (adaptation and real-life consistency), never projecting below
 * BMI 22, and so never near BMI 18.5. Owner decision, flagged for RD review.
 */
export function expectedLoss(p: Profile, deficitKcal: number, weeks: number): Expectation | null {
  if (deficitKcal <= 0 || weeks <= 0) return null;
  const linear = (deficitKcal * 7 * weeks) / KCAL_PER_KG;
  const cap = Math.max(0, p.weightKg - weightAtBmi(22, p.heightCm));
  if (cap <= 0) return null;
  const lowKg = Math.min(linear * 0.4, cap * 0.6);
  const highKg = Math.min(linear * REALISTIC_SHARE, cap);
  return { lowKg, highKg };
}

export const kcalFromMacros = (p: number, c: number, f: number) => Math.round(4 * p + 4 * c + 9 * f);
