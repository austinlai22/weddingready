// A plan code: the training details of a plan (dates, goals, days, equipment,
// activities) packed into a short string, so a plan can move between the app
// and an AI assistant without accounts or server storage. It never contains
// body measurements, health answers or logs. In links it goes after the "#",
// which browsers don't send to the server.

import { z } from 'zod';
import { isISODate } from './engine/dates';
import { ACTIVITY_TYPES, FOCUS_AREAS, type Activity, type Equipment, type Experience, type FocusArea, type Goal, type Outfit, type Profile } from './types';

const PREFIX = 'wr1.';
const isoDate = z.string().refine(isISODate);

const HandoffSchema = z.object({
  w: isoDate,
  f: isoDate.optional(),
  s: isoDate.optional(),
  sw: z.record(z.string().max(64), z.string().max(64)).optional(),
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
  exerciseSwaps?: Record<string, string>;
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

export function handoffFromProfile(p: Profile): PlanHandoff {
  return {
    weddingDate: p.weddingDate,
    ...(p.fittingDate ? { fittingDate: p.fittingDate } : {}),
    startDate: p.startDate,
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
    ...(h.exerciseSwaps ? { sw: h.exerciseSwaps } : {}),
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
  return {
    weddingDate: c.w,
    ...(c.f ? { fittingDate: c.f } : {}),
    ...(c.s ? { startDate: c.s } : {}),
    ...(c.sw ? { exerciseSwaps: c.sw } : {}),
    goals: c.g,
    strengthDays: c.d,
    equipment: c.e,
    experience: c.x,
    sessionMinutes: c.m,
    outfit: c.o,
    focusAreas: c.a,
    activities: c.t.map((a, i) => ({ id: `a${i + 1}`, type: a.y, label: a.l || a.y, days: a.d, ...(a.n ? { minutes: a.n } : {}) })),
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
