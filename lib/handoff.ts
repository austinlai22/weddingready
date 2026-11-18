// A plan code: the training details of a plan (dates, goals, days, equipment,
// activities) packed into a short string, so a plan can move between the app
// and an AI assistant without accounts or server storage. It never contains
// body measurements, health answers or logs. In links it goes after the "#",
// which browsers don't send to the server.

import { z } from 'zod';
import { isISODate } from './engine/dates';
import { ACTIVITY_TYPES, FOCUS_AREAS, type Activity, type ActivityType, type Equipment, type EquipmentOverride, type Experience, type FocusArea, type Goal, type Outfit, type Profile, type SessionRef, type Sex, type WeekTemplate } from './types';

const PREFIX = 'wr1.';
const isoDate = z.string().refine(isISODate);

const HandoffSchema = z.object({
  w: isoDate,
  f: isoDate.optional(),
  s: isoDate.optional(),
  sx: z.enum(['female', 'male', 'unspecified']).optional(),
  sw: z.record(z.string().max(64), z.string().max(64)).optional(),
  // The week as the person has arranged it: per day, strength workout keys ("S:A"), activities by index ("a0"), or added ones ("x:yoga:Yoga").
  l: z.array(z.array(z.string().max(60)).max(8)).length(7).optional(),
  eo: z.array(z.object({ f: isoDate, t: isoDate, e: z.enum(['home_db', 'gym', 'bodyweight']) })).max(20).optional(),
  g: z.array(z.enum(['tone', 'strength', 'lose_fat', 'maintain'])).max(4),
  d: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  e: z.enum(['home_db', 'gym', 'bodyweight']),
  x: z.enum(['new', 'some', 'experienced']),
  m: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  o: z.enum(['dress', 'suit', 'other']),
  a: z.array(z.enum(FOCUS_AREAS)).max(3),
  t: z
    .array(z.object({ y: z.enum(ACTIVITY_TYPES), l: z.string().max(40), d: z.array(z.number().int().min(0).max(6)).max(7), n: z.number().int().min(5).max(300).optional() }))
    .max(10),
});

export interface PlanHandoff {
  weddingDate: string;
  fittingDate?: string;
  /** The plan's first day, so phases and week numbers line up with the app. */
  startDate?: string;
  /** Changes rest times between sets (see workouts.ts). */
  sex?: Sex;
  exerciseSwaps?: Record<string, string>;
  /** The person's own week layout, if they rearranged it. */
  layout?: WeekTemplate;
  equipmentOverrides?: EquipmentOverride[];
  goals: Goal[];
  strengthDays: 2 | 3 | 4 | 5;
  equipment: Equipment;
  experience: Experience;
  sessionMinutes: 30 | 45 | 60;
  outfit: Outfit;
  focusAreas: FocusArea[];
  activities: Activity[];
}

// UTF-8 safe base64url in both the browser and Node.
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** `layout`: the week as arranged in the app (from the schedule), so other places show the same sessions. */
export function handoffFromProfile(p: Profile, layout?: WeekTemplate | null): PlanHandoff {
  return {
    ...(layout ? { layout } : {}),
    ...(p.equipmentOverrides?.length ? { equipmentOverrides: p.equipmentOverrides } : {}),
    weddingDate: p.weddingDate,
    ...(p.fittingDate ? { fittingDate: p.fittingDate } : {}),
    startDate: p.startDate,
    ...(p.sex !== 'unspecified' ? { sex: p.sex } : {}),
    ...(p.exerciseSwaps && Object.keys(p.exerciseSwaps).length ? { exerciseSwaps: p.exerciseSwaps } : {}),
    goals: p.goals,
    strengthDays: p.strengthDays,
    equipment: p.equipment,
    experience: p.experience,
    sessionMinutes: p.sessionMinutes,
    outfit: p.outfit,
    focusAreas: p.focusAreas,
    activities: p.activities,
  };
}

export function encodePlan(h: PlanHandoff): string {
  const compact: z.infer<typeof HandoffSchema> = {
    w: h.weddingDate,
    ...(h.fittingDate ? { f: h.fittingDate } : {}),
    ...(h.startDate ? { s: h.startDate } : {}),
    ...(h.sex ? { sx: h.sex } : {}),
    ...(h.exerciseSwaps ? { sw: h.exerciseSwaps } : {}),
    ...(h.layout ? { l: encodeLayout(h.layout, h.activities) } : {}),
    ...(h.equipmentOverrides?.length ? { eo: h.equipmentOverrides.map((o) => ({ f: o.from, t: o.to, e: o.equipment })) } : {}),
    g: h.goals,
    d: h.strengthDays,
    e: h.equipment,
    x: h.experience,
    m: h.sessionMinutes,
    o: h.outfit,
    a: h.focusAreas.slice(0, 3),
    t: h.activities.slice(0, 10).map((a) => ({ y: a.type, l: a.label.slice(0, 40), d: [...new Set(a.days)].sort(), ...(a.minutes ? { n: a.minutes } : {}) })),
  };
  return PREFIX + toBase64Url(JSON.stringify(compact));
}

/** The plan in a code, or null if the code is damaged, from a newer version, or invalid. */
export function decodePlan(code: string): PlanHandoff | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX) || trimmed.length > 2000) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(trimmed.slice(PREFIX.length)));
  } catch {
    return null;
  }
  const r = HandoffSchema.safeParse(raw);
  if (!r.success) return null;
  const c = r.data;
  const activities: Activity[] = c.t.map((a, i) => ({ id: `a${i + 1}`, type: a.y, label: a.l || a.y, days: a.d, ...(a.n ? { minutes: a.n } : {}) }));
  return {
    ...(c.l ? { layout: decodeLayout(c.l, activities) } : {}),
    ...(c.eo ? { equipmentOverrides: c.eo.map((o) => ({ from: o.f, to: o.t, equipment: o.e })) } : {}),
    weddingDate: c.w,
    ...(c.f ? { fittingDate: c.f } : {}),
    ...(c.s ? { startDate: c.s } : {}),
    ...(c.sx ? { sex: c.sx } : {}),
    ...(c.sw ? { exerciseSwaps: c.sw } : {}),
    goals: c.g,
    strengthDays: c.d,
    equipment: c.e,
    experience: c.x,
    sessionMinutes: c.m,
    outfit: c.o,
    focusAreas: c.a,
    activities,
  };
}

const KEYS = ['A', 'B', 'C', 'U', 'L', 'P', 'R', 'G', 'F'] as const;

function encodeLayout(t: WeekTemplate, activities: Activity[]): string[][] {
  return t.days.map((day) =>
    day.map((s) => {
      if (s.kind === 'strength') return `S:${s.workout}`;
      const i = activities.findIndex((a) => a.id === s.activityId);
      return i >= 0 ? `a${i}` : `x:${s.type}:${s.label.replace(/:/g, ' ').slice(0, 40)}`;
    }),
  );
}

function decodeLayout(days: string[][], activities: Activity[]): WeekTemplate {
  let n = 0;
  return {
    days: days.map((day, d) =>
      day.flatMap((tok): SessionRef[] => {
        if (tok.startsWith('S:')) {
          const key = tok.slice(2) as (typeof KEYS)[number];
          return KEYS.includes(key) ? [{ id: `str-${++n}`, kind: 'strength', workout: key }] : [];
        }
        if (/^a\d+$/.test(tok)) {
          const a = activities[Number(tok.slice(1))];
          return a ? [{ id: `act-${a.id}-${d}`, kind: 'activity', activityId: a.id, type: a.type, label: a.label }] : [];
        }
        const [, type, label] = tok.split(':');
        return (ACTIVITY_TYPES as readonly string[]).includes(type) ? [{ id: `act-x${d}-${label}`, kind: 'activity', type: type as ActivityType, label: label || type }] : [];
      }),
    ),
  };
}

export const SITE_URL = 'https://weddingready.vercel.app';

/** A link that opens setup with this plan filled in. */
export function setupLink(code: string, origin = SITE_URL): string {
  return `${origin}/setup#plan=${code}`;
}

/** The plan code in a link's "#plan=" fragment, if any. */
export function codeFromHash(hash: string): string | null {
  const m = /(?:^#|&)plan=([^&]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
}
