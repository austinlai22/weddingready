import type { Activity, ActivityType, Equipment, FocusArea, SessionRef, WeekTemplate, WorkoutKey } from '../types';
import { DAY_NAMES } from './dates';
import { mainPatterns } from './workouts';

/** SPEC §6.3 weekly split, in session order. */
export function splitFor(strengthDays: number): WorkoutKey[] {
  switch (strengthDays) {
    case 2:
      return ['A', 'B'];
    case 3:
      return ['A', 'B', 'C'];
    case 4:
      // A true upper/lower split, so back-to-back days never work the same muscles hard.
      return ['U', 'L', 'U', 'L'];
    default:
      return ['U', 'L', 'U', 'L', 'F'];
  }
}

// ---------- Training rules ----------
//
// - 2–3 strength days are full-body sessions: never on consecutive days, and
//   between any two of them at least one recovery day (nothing harder than a
//   walk, yoga or Pilates).
// - 4 days (upper/lower) and 5 days (upper/lower + focus) may run back to
//   back, but never the same session two days running, at most two strength
//   days in a row for 4 days (three for 5), and never a week without a
//   recovery day.
// - Hard activities (runs, classes, sports, rides) are best kept off strength
//   days and off the day before one, so the lifts happen on fresh legs.
// The week repeats, so Sunday is next to Monday.

/** Activities that count as hard training for recovery purposes. Walks, yoga and Pilates are recovery-friendly. */
const HARD: Record<ActivityType, boolean> = {
  walk: false,
  yoga: false,
  pilates: false,
  run: true,
  cycling: true,
  classes: true,
  sports: true,
  other: true,
};

export function isHardActivity(type: ActivityType): boolean {
  return HARD[type];
}

export function isFullBodySplit(strengthCount: number): boolean {
  return strengthCount <= 3;
}

const PREFERRED_DAYS: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
};

export interface WeekShape {
  /** Strength sessions per day: workout keys. */
  strength: WorkoutKey[][];
  /** Hard activity labels per day. */
  hard: string[][];
}

const next = (d: number) => (d + 1) % 7;
// Activity labels sit mid-sentence; keep acronyms (HIIT) as typed.
const lower = (label: string) => (/^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label);
const prev = (d: number) => (d + 6) % 7;

/** Runs of consecutive strength days around the week (Sunday wraps to Monday). */
function strengthRuns(days: boolean[]): number[] {
  if (days.every(Boolean)) return [7];
  const start = days.findIndex((on, i) => !on && days[next(i)]);
  const runs: number[] = [];
  let len = 0;
  for (let k = 1; k <= 7; k++) {
    const d = (start + k) % 7;
    if (days[d]) len++;
    else if (len) {
      runs.push(len);
      len = 0;
    }
  }
  if (len) runs.push(len);
  return runs;
}

export type IssueKind = 'back_to_back' | 'no_recovery' | 'too_many_in_row' | 'same_session' | 'no_rest_day' | 'busy_day' | 'stacked' | 'hard_before';

export interface WeekIssue {
  kind: IssueKind;
  day: number;
  text: string;
  /** Rule breaks score high; stacked/hard_before are compromises worth mentioning. */
  severity: 'rule' | 'note';
}

function list(labels: string[]): string {
  const u = [...new Set(labels)];
  return u.length <= 1 ? u.join('') : `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
}

/** Checks a week against the training rules above. Used for default placement, editor warnings and AI previews. */
export function weekIssues(shape: WeekShape, equipment: Equipment, focus: FocusArea[]): WeekIssue[] {
  const issues: WeekIssue[] = [];
  const on = shape.strength.map((s) => s.length > 0);
  const count = shape.strength.reduce((t, s) => t + s.length, 0);
  if (count === 0) return issues;
  const fullBody = isFullBodySplit(count);
  const recovery = (d: number) => !on[d] && shape.hard[d].length === 0;

  if (fullBody) {
    for (let d = 0; d < 7; d++) {
      if (on[d] && on[next(d)]) {
        issues.push({ kind: 'back_to_back', day: next(d), severity: 'rule', text: `${DAY_NAMES[d]} and ${DAY_NAMES[next(d)]} are both strength days. Full-body sessions need a rest day between them.` });
      }
    }
    // Between each pair of strength days that aren't adjacent, at least one gap day must be a recovery day.
    const days = on.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
    if (days.length >= 2) {
      for (let i = 0; i < days.length; i++) {
        const a = days[i];
        const b = days[(i + 1) % days.length];
        const gap: number[] = [];
        for (let d = next(a); d !== b; d = next(d)) gap.push(d);
        if (gap.length && !gap.some(recovery)) {
          const what = gap.flatMap((d) => shape.hard[d].map((h) => `${DAY_NAMES[d]}’s ${lower(h)}`));
          issues.push({
            kind: 'no_recovery',
            day: gap[0],
            severity: 'rule',
            text: `There’s no easy day between ${DAY_NAMES[a]} and ${DAY_NAMES[b]} strength (${list(what)}). Full-body sessions recover best with a walk, yoga or rest day between them.`,
          });
        }
      }
    }
  } else {
    const maxRun = count >= 5 ? 3 : 2;
    const runs = strengthRuns(on);
    if (runs.some((r) => r > maxRun)) {
      const first = on.findIndex((x, i) => x && !on[prev(i)]);
      issues.push({ kind: 'too_many_in_row', day: Math.max(0, first), severity: 'rule', text: `That’s more than ${maxRun} strength days in a row. Add a rest day so your muscles can recover.` });
    }
    for (let d = 0; d < 7; d++) {
      if (!on[d] || !on[next(d)]) continue;
      const today = new Set(shape.strength[d].flatMap((k) => mainPatterns(k, equipment, focus)));
      const tomorrow = shape.strength[next(d)].flatMap((k) => mainPatterns(k, equipment, focus));
      if (tomorrow.some((p) => today.has(p))) {
        issues.push({ kind: 'same_session', day: next(d), severity: 'rule', text: `${DAY_NAMES[d]} and ${DAY_NAMES[next(d)]} train the same main lifts back to back. Alternate them so each gets a rest day.` });
      }
    }
    if (![0, 1, 2, 3, 4, 5, 6].some(recovery)) {
      issues.push({ kind: 'no_rest_day', day: 6, severity: 'rule', text: 'There’s no easy day this week. Keep at least one day for a walk, yoga or rest.' });
    }
  }

  for (let d = 0; d < 7; d++) {
    if (!on[d]) continue;
    const hardToday = shape.hard[d].map(lower);
    if (hardToday.length >= 2) {
      issues.push({ kind: 'busy_day', day: d, severity: 'rule', text: `${DAY_NAMES[d]} has strength plus ${list(hardToday)}. That’s a lot for one day; move one if you can.` });
    } else if (hardToday.length === 1) {
      issues.push({ kind: 'stacked', day: d, severity: 'note', text: `${DAY_NAMES[d]} has strength and ${hardToday[0]}. Lift first, and keep the ${hardToday[0]} easy.` });
    }
    if (shape.hard[prev(d)].length && !on[prev(d)]) {
      issues.push({ kind: 'hard_before', day: d, severity: 'note', text: `${DAY_NAMES[prev(d)]}’s ${list(shape.hard[prev(d)].map(lower))} comes the day before ${DAY_NAMES[d]} strength. Keep it easy so your legs are fresh.` });
    }
  }
  return issues;
}

const WEIGHT: Record<IssueKind, number> = {
  // Hard rules: larger than every softer penalty combined, so they always win.
  back_to_back: 10000,
  same_session: 10000,
  too_many_in_row: 10000,
  no_rest_day: 400,
  no_recovery: 300,
  busy_day: 150,
  stacked: 40,
  hard_before: 15,
};

function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < n; i++) {
      acc.push(i);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

function hardByDay(activities: Activity[]): string[][] {
  const hard: string[][] = Array.from({ length: 7 }, () => []);
  for (const a of activities) {
    if (!isHardActivity(a.type)) continue;
    for (const d of new Set(a.days)) if (d >= 0 && d <= 6) hard[d].push(a.label);
  }
  return hard;
}

/** Score for a set of strength days: rule breaks dominate, then compromises, then even spacing, then closeness to the usual days. */
export function scorePlacement(days: number[], strengthDays: number, activities: Activity[], equipment: Equipment, focus: FocusArea[]): number {
  const keys = splitFor(strengthDays);
  const strength: WorkoutKey[][] = Array.from({ length: 7 }, () => []);
  days.forEach((d, i) => strength[d].push(keys[i]));
  const hard = hardByDay(activities);
  let score = 0;
  for (const issue of weekIssues({ strength, hard }, equipment, focus)) {
    score += WEIGHT[issue.kind];
  }
  // Full-body sessions: spread evenly through the week. Splits (4–5 days) keep the classic pairs.
  if (isFullBodySplit(strengthDays)) {
    const gaps = days.map((d, i) => (days[(i + 1) % days.length] - d + 7) % 7 || 7);
    score += (Math.max(...gaps) - Math.min(...gaps)) * 3;
  }
  const pref = PREFERRED_DAYS[strengthDays] ?? PREFERRED_DAYS[2];
  score += days.reduce((t, d, i) => t + Math.abs(d - pref[i]), 0) * 0.5;
  return score;
}

/** Picks the strength days with the best score. Deterministic. */
export function placeStrengthDays(strengthDays: number, activities: Activity[], equipment: Equipment, focus: FocusArea[]): number[] {
  let best: number[] = PREFERRED_DAYS[strengthDays] ?? PREFERRED_DAYS[2];
  let bestScore = Infinity;
  for (const combo of combinations(7, strengthDays)) {
    const s = scorePlacement(combo, strengthDays, activities, equipment, focus);
    if (s < bestScore) {
      bestScore = s;
      best = combo;
    }
  }
  return best;
}

export function defaultWeekTemplate(strengthDays: number, activities: Activity[], equipment: Equipment, focus: FocusArea[]): WeekTemplate {
  const keys = splitFor(strengthDays);
  const placed = placeStrengthDays(strengthDays, activities, equipment, focus);
  const days: SessionRef[][] = Array.from({ length: 7 }, () => []);
  placed.forEach((d, i) => days[d].push({ id: `str-${i + 1}`, kind: 'strength', workout: keys[i] }));
  for (const a of activities) {
    for (const d of [...new Set(a.days)].sort()) {
      if (d < 0 || d > 6) continue;
      days[d].push({ id: `act-${a.id}-${d}`, kind: 'activity', activityId: a.id, type: a.type, label: a.label });
    }
  }
  return { days };
}

/** The shape of any week template, for weekIssues. */
export function shapeOf(t: WeekTemplate): WeekShape {
  return {
    strength: t.days.map((d) => d.flatMap((s) => (s.kind === 'strength' ? [s.workout] : []))),
    hard: t.days.map((d) => d.flatMap((s) => (s.kind === 'activity' && isHardActivity(s.type) ? [s.label] : []))),
  };
}
