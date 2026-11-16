import { z } from 'zod';
import { ACTIVITY_TYPES, FOCUS_AREAS, type AppState } from '../types';
import { isISODate } from '../engine/dates';

// Zod mirror of lib/types.ts. Every load from localStorage and every import is
// parsed through AppStateSchema; nothing unvalidated reaches the app.

const ISODate = z.string().refine(isISODate, 'Expected a YYYY-MM-DD date');
export const MAX_SCHEDULE_HISTORY = 30;
const num = z.number().finite();

export const ActivitySchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(ACTIVITY_TYPES),
  label: z.string().min(1).max(40),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  minutes: num.min(0).max(600).optional(),
});

export const ProfileSchema = z
  .object({
    version: z.literal(1),
    name: z.string().max(40).optional(),
    weddingDate: ISODate,
    fittingDate: ISODate.optional(),
    age: num.min(18).max(110),
    sex: z.enum(['female', 'male', 'unspecified']),
    heightCm: num.min(100).max(250),
    weightKg: num.min(30).max(350),
    units: z.enum(['imperial', 'metric']),
    outfit: z.enum(['dress', 'suit', 'other']),
    goals: z.array(z.enum(['tone', 'strength', 'lose_fat', 'maintain'])).min(1).max(4),
    focusAreas: z.array(z.enum(FOCUS_AREAS)).max(3),
    strengthDays: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    equipment: z.enum(['home_db', 'gym', 'bodyweight']),
    experience: z.enum(['new', 'some', 'experienced']),
    sessionMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
    activities: z.array(ActivitySchema).max(12),
    job: z.enum(['sitting', 'mixed', 'on_feet']),
    dailyWalkMinutes: num.min(0).max(600).optional(),
    dailySteps: num.min(0).max(60000).optional(),
    nutritionMode: z.enum(['habits', 'habits_numbers', 'portions_only']),
    diet: z.enum(['none', 'vegetarian', 'vegan', 'pescatarian', 'no_pork', 'gluten_free', 'dairy_free']),
    avoid: z.array(z.string().max(60)).max(20),
    treat: z.string().max(40).optional(),
    safety: z.object({ pregnantOrPostpartum: z.boolean(), edHistory: z.boolean(), medicalCondition: z.boolean() }),
    startDate: ISODate,
    goalReachedAt: ISODate.optional(),
  })
  .refine((p) => !(p.goals.includes('lose_fat') && p.goals.includes('maintain')), 'Lose fat and Maintain cannot both be goals')
  .refine((p) => !p.fittingDate || p.fittingDate < p.weddingDate, 'The fitting must be before the wedding')
  .refine((p) => p.startDate <= p.weddingDate, 'The plan must start before the wedding');

const SessionRefSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().min(1).max(80), kind: z.literal('strength'), workout: z.enum(['A', 'B', 'C', 'U', 'L', 'P', 'R', 'G', 'F']) }),
  z.object({
    id: z.string().min(1).max(80),
    kind: z.literal('activity'),
    activityId: z.string().max(64).optional(),
    type: z.enum(ACTIVITY_TYPES),
    label: z.string().min(1).max(40),
  }),
]);

export const WeekTemplateSchema = z.object({
  days: z.array(z.array(SessionRefSchema).max(8)).length(7),
  effectiveFrom: ISODate.optional(),
});

export const MealEntrySchema = z.object({
  name: z.string().max(80),
  items: z.array(z.string().max(160)).max(12),
  p: num.min(0).max(1000),
  c: num.min(0).max(2000),
  f: num.min(0).max(1000),
  k: num.min(0).max(10000),
  src: z.enum(['template', 'list', 'ai', 'manual']),
  templateId: z.string().max(64).optional(),
  conf: z.enum(['low', 'medium', 'high']).optional(),
  note: z.string().max(240).optional(),
  typed: z.string().max(200).optional(),
});

export const FoodItemSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  unit: z.string().min(1).max(40),
  kcal: num.min(0).max(10000),
  protein: num.min(0).max(1000),
  carbs: num.min(0).max(2000),
  fat: num.min(0).max(1000),
  defaultAmount: num.positive().max(100),
  step: num.positive().max(100),
  category: z.string().max(40),
  isRestaurantEstimate: z.boolean(),
  isLabelEstimate: z.boolean().optional(),
  source: z.string().max(400),
  mine: z.boolean().optional(),
});

const SLOT = z.enum(['b', 'l', 'd', 's', 'x', 'e']);

export const LogsSchema = z.object({
  sets: z.record(ISODate, z.record(z.string(), z.number().int().min(0).max(20))),
  weights: z.record(
    z.string(),
    z.array(z.object({ value: num.min(0).max(2000), unit: z.enum(['lb', 'kg']), date: ISODate })).max(400),
  ),
  sessionsDone: z.record(ISODate, z.array(z.string().max(80)).max(20)),
  warmups: z.record(z.string(), z.boolean()),
  meals: z.record(ISODate, z.partialRecord(SLOT, MealEntrySchema.nullable())),
  extras: z.record(ISODate, z.array(MealEntrySchema).max(30)),
});

export const AppStateSchema = z.object({
  profile: ProfileSchema.optional(),
  scheduleOverrides: WeekTemplateSchema.nullable(),
  scheduleHistory: z.array(z.object({ until: ISODate, template: WeekTemplateSchema })).max(MAX_SCHEDULE_HISTORY).optional(),
  logs: LogsSchema,
  myFoods: z.array(FoodItemSchema).max(500),
  deviceId: z.string().max(64),
  settings: z.object({ analyticsOptOut: z.boolean() }),
});

export const STATE_VERSION = 1;

export function emptyState(deviceId = ''): AppState {
  return {
    profile: undefined,
    scheduleOverrides: null,
    scheduleHistory: [],
    logs: { sets: {}, weights: {}, sessionsDone: {}, warmups: {}, meals: {}, extras: {} },
    myFoods: [],
    deviceId,
    settings: { analyticsOptOut: false },
  };
}

/**
 * Brings a persisted state from any earlier schema version to the current one.
 * Version 1 is the first shipped schema; future versions add a case here and a
 * test in state.test.ts. Unknown future versions are rejected (null).
 */
export function migrateState(persisted: unknown, version: number): unknown {
  if (version > STATE_VERSION) return null;
  let s = persisted as Record<string, unknown> | null;
  if (!s || typeof s !== 'object') return null;
  if (version < 1) {
    // Pre-release builds stored no version and may lack newer collections.
    const base = emptyState(typeof s.deviceId === 'string' ? s.deviceId : '');
    s = { ...base, ...s, logs: { ...base.logs, ...((s.logs as object) ?? {}) }, settings: { ...base.settings, ...((s.settings as object) ?? {}) } };
  }
  return s;
}

export type ParseResult = { ok: true; state: AppState } | { ok: false; error: string };

export function parseState(raw: unknown): ParseResult {
  const r = AppStateSchema.safeParse(raw);
  if (r.success) return { ok: true, state: r.data as AppState };
  return { ok: false, error: r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}

/** Export file format: the app state plus a header so imports can be recognised and migrated. */
export interface ExportFile {
  app: 'weddingready';
  version: number;
  exportedAt: string;
  state: AppState;
}

export function parseImport(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file isn’t valid JSON.' };
  }
  const file = data as Partial<ExportFile>;
  if (!file || file.app !== 'weddingready' || typeof file.version !== 'number') {
    return { ok: false, error: 'That file isn’t a WeddingReady export.' };
  }
  const migrated = migrateState(file.state, file.version);
  if (!migrated) return { ok: false, error: 'That export is from a newer version of the app.' };
  return parseState(migrated);
}
