// Shared domain types. The persisted shapes (Profile, AppState) follow SPEC §11;
// their Zod schemas live in lib/state/schema.ts and must stay in sync.

export type Units = 'imperial' | 'metric';
export type Goal = 'tone' | 'strength' | 'lose_fat' | 'maintain';
export type NutritionMode = 'habits' | 'habits_numbers' | 'portions_only';
export type Equipment = 'home_db' | 'gym' | 'bodyweight';
export type Sex = 'female' | 'male' | 'unspecified';
export type Outfit = 'dress' | 'suit' | 'other';
export type Experience = 'new' | 'some' | 'experienced';
export type Job = 'sitting' | 'mixed' | 'on_feet';
export type Diet =
  | 'none'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'no_pork'
  | 'gluten_free'
  | 'dairy_free';

export const FOCUS_AREAS = ['shoulders', 'upper_back', 'arms', 'chest', 'glutes', 'legs', 'core'] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

export const ACTIVITY_TYPES = ['walk', 'run', 'pilates', 'yoga', 'cycling', 'classes', 'sports', 'other'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** 0 = Monday … 6 = Sunday. */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayId = (typeof DAY_IDS)[number];

export interface Activity {
  id: string;
  type: ActivityType;
  label: string;
  days: number[];
  minutes?: number;
}

export interface Safety {
  pregnantOrPostpartum: boolean;
  edHistory: boolean;
  medicalCondition: boolean;
}

export interface Profile {
  version: 1;
  name?: string;
  weddingDate: string;
  fittingDate?: string;
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  units: Units;
  outfit: Outfit;
  goals: Goal[];
  focusAreas: FocusArea[];
  strengthDays: 2 | 3 | 4 | 5;
  equipment: Equipment;
  experience: Experience;
  sessionMinutes: 30 | 45 | 60;
  activities: Activity[];
  job: Job;
  dailyWalkMinutes?: number;
  dailySteps?: number;
  nutritionMode: NutritionMode;
  diet: Diet;
  avoid: string[];
  treat?: string;
  safety: Safety;
  startDate: string;
  goalReachedAt?: string;
}

/** A/B/C full body · U/L upper/lower · P/R/G push, pull, legs · F the old 5-day Focus day (kept so saved plans still load). */
export type WorkoutKey = 'A' | 'B' | 'C' | 'U' | 'L' | 'P' | 'R' | 'G' | 'F';

export type SessionRef =
  | { id: string; kind: 'strength'; workout: WorkoutKey }
  | { id: string; kind: 'activity'; activityId?: string; type: ActivityType; label: string };

export interface WeekTemplate {
  /** Seven entries, Monday first. */
  days: SessionRef[][];
  /** First date (ISO) the template applies from. Earlier days use the schedule history, else the engine default. */
  effectiveFrom?: string;
}

/** The layout that was in force for days before `until`, so changes never rewrite days already past. */
export interface ScheduleHistoryEntry {
  until: string;
  template: WeekTemplate;
}

export type SlotId = 'b' | 'l' | 'd' | 's' | 'x' | 'e';

export interface MealEntry {
  name: string;
  items: string[];
  p: number;
  c: number;
  f: number;
  k: number;
  src: 'template' | 'list' | 'ai' | 'manual';
  templateId?: string;
  conf?: 'low' | 'medium' | 'high';
  note?: string;
  typed?: string;
}

export interface FoodItem {
  id: string;
  name: string;
  unit: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  defaultAmount: number;
  step: number;
  category: string;
  isRestaurantEstimate: boolean;
  isLabelEstimate?: boolean;
  source: string;
  mine?: boolean;
}

export interface WeightLog {
  value: number;
  unit: 'lb' | 'kg';
  date: string;
}

export interface Logs {
  sets: Record<string, Record<string, number>>;
  weights: Record<string, WeightLog[]>;
  sessionsDone: Record<string, string[]>;
  warmups: Record<string, boolean>;
  meals: Partial<Record<string, Partial<Record<SlotId, MealEntry | null>>>>;
  extras: Record<string, MealEntry[]>;
}

export interface AppState {
  profile?: Profile;
  scheduleOverrides: WeekTemplate | null;
  /** Oldest first. Optional so data saved before it existed still loads. */
  scheduleHistory?: ScheduleHistoryEntry[];
  logs: Logs;
  myFoods: FoodItem[];
  deviceId: string;
  settings: { analyticsOptOut: boolean };
}
