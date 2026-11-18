import { z } from 'zod';
import { ACTIVITY_TYPES, DAY_IDS, type ActivityType, type Equipment, type FocusArea, type Profile, type ScheduleHistoryEntry, type SessionRef, type WeekTemplate } from '../types';
import { addDays, DAY_NAMES, mondayOf } from './dates';
import { defaultWeekTemplate, shapeOf, weekIssues } from './split';

export function cloneTemplate(t: WeekTemplate): WeekTemplate {
  return { days: t.days.map((d) => d.map((s) => ({ ...s }))), effectiveFrom: t.effectiveFrom };
}

export function engineTemplate(p: Profile): WeekTemplate {
  return defaultWeekTemplate(p.strengthDays, p.activities, p.equipment, p.focusAreas);
}

/** The person's schedule: their current edits plus the layouts that were in force before each change. */
export interface Schedule {
  overrides: WeekTemplate | null;
  history: ScheduleHistoryEntry[];
}

export function asSchedule(s: Schedule | WeekTemplate | null | undefined): Schedule {
  if (s && 'overrides' in s) return s;
  return { overrides: (s as WeekTemplate | null | undefined) ?? null, history: [] };
}

/**
 * Template in force on `date`. A change applies from the day it was made, so
 * earlier days keep the layout they had (from the history); otherwise the
 * person's edits from their start date on, else the engine default.
 */
export function templateForDate(p: Profile, schedule: Schedule | WeekTemplate | null, date: string): WeekTemplate {
  const { overrides, history } = asSchedule(schedule);
  for (const h of history) if (date < h.until) return h.template;
  if (overrides && (!overrides.effectiveFrom || overrides.effectiveFrom <= date)) return overrides;
  return engineTemplate(p);
}

/** Template shown in the editor: the one in force from `date` on. */
export function templateForWeek(p: Profile, schedule: Schedule | WeekTemplate | null, monday: string): WeekTemplate {
  return templateForDate(p, schedule, monday);
}

/**
 * Before a change that takes effect on `from`, records the layout in force
 * the day before, so days before `from` keep it. Several changes on the same
 * day share one entry. Keeps the newest entries only.
 */
export function freezeBefore(p: Profile, schedule: Schedule, from: string, max = 30): ScheduleHistoryEntry[] {
  const before = templateForDate(p, schedule, addDays(from, -1));
  // An entry reaching past `from` (a "this week only" change) now stops at `from`;
  // anything after it is replaced by the new change.
  const kept: ScheduleHistoryEntry[] = [];
  for (const h of schedule.history) {
    if (h.until <= from) kept.push(h);
    else {
      kept.push({ ...h, until: from });
      break;
    }
  }
  if (from <= p.startDate || kept[kept.length - 1]?.until === from) return kept.slice(-max);
  return [...kept, { until: from, template: { days: cloneTemplate(before).days } }].slice(-max);
}

/**
 * A change for the rest of this week only: `next` applies from `from` until
 * Sunday, then the usual layout comes back.
 */
export function thisWeekOnly(p: Profile, schedule: Schedule, next: WeekTemplate, from: string, max = 30): Schedule {
  const nextMonday = addDays(mondayOf(from), 7);
  const history = freezeBefore(p, schedule, from, max - 1);
  return { overrides: schedule.overrides, history: [...history, { until: nextMonday, template: { days: cloneTemplate(next).days } }] };
}

/** The usual layout: what's in force once any "this week only" change has ended. */
export function usualTemplate(p: Profile, schedule: Schedule | WeekTemplate | null, from: string): WeekTemplate {
  return templateForDate(p, schedule, addDays(mondayOf(from), 7));
}

/**
 * A lasting change: the usual week becomes `usual` from next Monday, and the
 * rest of this week becomes `thisWeek` if given (otherwise it keeps its
 * layout). Starting next Monday means a "this week only" change and sessions
 * already done this week are never rewritten or repeated.
 */
export function lastingChange(p: Profile, schedule: Schedule, usual: WeekTemplate, from: string, thisWeek?: WeekTemplate | null, max = 30): Schedule {
  const nextMonday = addDays(mondayOf(from), 7);
  const next: Schedule = { overrides: { days: cloneTemplate(usual).days, effectiveFrom: nextMonday }, history: freezeBefore(p, schedule, nextMonday, max - 1) };
  return thisWeek ? thisWeekOnly(p, next, thisWeek, from, max) : next;
}

export interface ScheduleWarning {
  day: number;
  text: string;
  severity: 'rule' | 'note';
}

/** Warnings only, never blocks (SPEC §9). Same training rules the default placement uses. */
export function validateTemplate(t: WeekTemplate, equipment: Equipment, focus: FocusArea[]): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  const nonWalk = (d: SessionRef[]) => d.filter((s) => !(s.kind === 'activity' && s.type === 'walk'));
  for (let d = 0; d < 7; d++) {
    const count = nonWalk(t.days[d]).length;
    const hasStrength = t.days[d].some((s) => s.kind === 'strength');
    // Strength days are checked by weekIssues (busy_day); this covers days of the person's own activities.
    if (count > 2 && !hasStrength) warnings.push({ day: d, severity: 'rule', text: `${DAY_NAMES[d]} has ${count} sessions. Two a day is plenty.` });
    const strength = t.days[d].filter((s) => s.kind === 'strength').length;
    if (strength > 1) warnings.push({ day: d, severity: 'rule', text: `${DAY_NAMES[d]} has ${strength} strength sessions. Spread them out.` });
  }
  for (const i of weekIssues(shapeOf(t), equipment, focus)) warnings.push({ day: i.day, text: i.text, severity: i.severity });
  return warnings;
}

// ---------- Operations (drag-and-drop and AI edits share these) ----------

const DayIdSchema = z.enum(DAY_IDS);
export const ScheduleOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('move'), sessionId: z.string().min(1).max(80), toDay: DayIdSchema }),
  z.object({ op: z.literal('add'), activity: z.string().min(1).max(40), day: DayIdSchema }),
  z.object({ op: z.literal('remove'), sessionId: z.string().min(1).max(80) }),
  z.object({ op: z.literal('swap'), a: z.string().min(1).max(80), b: z.string().min(1).max(80) }),
]);
export type ScheduleOp = z.infer<typeof ScheduleOpSchema>;

function locate(t: WeekTemplate, id: string): { day: number; index: number } | null {
  for (let d = 0; d < 7; d++) {
    const index = t.days[d].findIndex((s) => s.id === id);
    if (index !== -1) return { day: d, index };
  }
  return null;
}

let counter = 0;
export function newSessionId(prefix: string): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`;
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  walk: 'Walk',
  run: 'Run',
  pilates: 'Pilates',
  yoga: 'Yoga',
  cycling: 'Cycling',
  classes: 'Class',
  sports: 'Sports',
  other: 'Activity',
};

export function activityTypeFrom(text: string): ActivityType {
  const t = text.toLowerCase().trim();
  if ((ACTIVITY_TYPES as readonly string[]).includes(t)) return t as ActivityType;
  if (/walk|hike/.test(t)) return 'walk';
  if (/run|jog/.test(t)) return 'run';
  if (/pilates|reformer/.test(t)) return 'pilates';
  if (/yoga/.test(t)) return 'yoga';
  if (/cycl|bike|spin/.test(t)) return 'cycling';
  if (/class|barre|hiit|bootcamp|dance|zumba/.test(t)) return 'classes';
  if (/tennis|soccer|basketball|pickleball|golf|swim|climb|sport/.test(t)) return 'sports';
  return 'other';
}

function labelFor(text: string, type: ActivityType): string {
  const clean = text.trim().replace(/\s+/g, ' ').slice(0, 30);
  if (!clean || clean.toLowerCase() === type) return ACTIVITY_LABELS[type];
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export class OpError extends Error {}

/** Applies ops to a copy. Throws OpError on an op that refers to nothing. */
export function applyOps(t: WeekTemplate, ops: ScheduleOp[], profile?: Profile): WeekTemplate {
  const out = cloneTemplate(t);
  for (const op of ops) {
    switch (op.op) {
      case 'move': {
        const at = locate(out, op.sessionId);
        if (!at) throw new OpError(`No session called ${op.sessionId}`);
        const [s] = out.days[at.day].splice(at.index, 1);
        out.days[DAY_IDS.indexOf(op.toDay)].push(s);
        break;
      }
      case 'remove': {
        const at = locate(out, op.sessionId);
        if (!at) throw new OpError(`No session called ${op.sessionId}`);
        out.days[at.day].splice(at.index, 1);
        break;
      }
      case 'swap': {
        const a = locate(out, op.a);
        const b = locate(out, op.b);
        if (!a || !b) throw new OpError('Both sessions must exist to swap them');
        const sa = out.days[a.day][a.index];
        const sb = out.days[b.day][b.index];
        out.days[a.day][a.index] = sb;
        out.days[b.day][b.index] = sa;
        break;
      }
      case 'add': {
        const type = activityTypeFrom(op.activity);
        const existing = profile?.activities.find((x) => x.type === type);
        out.days[DAY_IDS.indexOf(op.day)].push({
          id: newSessionId('act'),
          kind: 'activity',
          activityId: existing?.id,
          type,
          label: existing?.label ?? labelFor(op.activity, type),
        });
        break;
      }
    }
  }
  return out;
}

export function duplicateSession(t: WeekTemplate, id: string, toDay: number): WeekTemplate {
  const out = cloneTemplate(t);
  const at = locate(out, id);
  if (!at) return out;
  const s = out.days[at.day][at.index];
  if (s.kind !== 'activity') return out;
  out.days[toDay].push({ ...s, id: newSessionId('act') });
  return out;
}

/**
 * After a profile change, keeps the user's edits where they still make sense:
 * the strength sessions must match the new split exactly, and activities that
 * point at a deleted activity are dropped. An activity whose days changed in
 * the profile (compared with `previous`) moves to its new days. Returns null
 * when the strength layout no longer fits (the caller falls back to the engine
 * default).
 */
export function reconcileOverrides(
  overrides: WeekTemplate | null,
  profile: Profile,
  previous?: Profile,
): { template: WeekTemplate | null; dropped: number } {
  if (!overrides) return { template: null, dropped: 0 };
  const fresh = engineTemplate(profile);
  const key = (t: WeekTemplate) =>
    t.days.flat().filter((s) => s.kind === 'strength').map((s) => (s.kind === 'strength' ? `${s.id}:${s.workout}` : '')).sort().join('|');
  if (key(fresh) !== key(overrides)) {
    return { template: null, dropped: overrides.days.flat().length };
  }
  const ids = new Set(profile.activities.map((a) => a.id));
  const daysKey = (days: number[]) => [...new Set(days)].sort().join(',');
  const before = new Map((previous?.activities ?? []).map((a) => [a.id, daysKey(a.days)]));
  // The person changed these activities' days in Settings: the new days win over the old placement.
  const redayed = new Set(profile.activities.filter((a) => before.has(a.id) && before.get(a.id) !== daysKey(a.days)).map((a) => a.id));
  let dropped = 0;
  const out = cloneTemplate(overrides);
  out.days = out.days.map((d) =>
    d.filter((s) => {
      if (s.kind !== 'activity' || !s.activityId) return true;
      if (redayed.has(s.activityId)) return false;
      if (!ids.has(s.activityId)) {
        dropped++;
        return false;
      }
      return true;
    }),
  );
  // Activities the user added in setup after the edit appear on their chosen days.
  const present = new Set(out.days.flat().map((s) => (s.kind === 'activity' ? s.activityId : undefined)));
  for (const a of profile.activities) {
    if (present.has(a.id)) continue;
    for (const d of new Set(a.days)) {
      out.days[d].push({ id: `act-${a.id}-${d}`, kind: 'activity', activityId: a.id, type: a.type, label: a.label });
    }
  }
  // Keep labels in sync with the profile.
  out.days = out.days.map((d) =>
    d.map((s) => {
      if (s.kind !== 'activity' || !s.activityId) return s;
      const a = profile.activities.find((x) => x.id === s.activityId);
      return a ? { ...s, type: a.type, label: a.label } : s;
    }),
  );
  return { template: out, dropped };
}

export function sessionLabel(s: SessionRef, strengthTag: (k: SessionRef & { kind: 'strength' }) => string): string {
  return s.kind === 'strength' ? strengthTag(s) : s.label;
}
