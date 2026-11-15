import type { Activity, Equipment, FocusArea, SessionRef, WeekTemplate, WorkoutKey } from '../types';
import { mainPatterns } from './workouts';

/** SPEC §6.3 weekly split, in session order. */
export function splitFor(strengthDays: number): WorkoutKey[] {
  switch (strengthDays) {
    case 2:
      return ['A', 'B'];
    case 3:
      return ['A', 'B', 'C'];
    case 4:
      return ['A', 'B', 'A', 'B'];
    default:
      return ['U', 'L', 'U', 'L', 'F'];
  }
}

const PREFERRED_DAYS: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
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

/** True when two sessions with overlapping main patterns sit on adjacent days (Sunday → Monday wraps). */
function patternClashes(days: number[], keys: WorkoutKey[], equipment: Equipment, focus: FocusArea[]): number {
  const pats = keys.map((k) => new Set(mainPatterns(k, equipment, focus)));
  let clashes = 0;
  for (let i = 0; i < days.length; i++) {
    for (let j = 0; j < days.length; j++) {
      if (i === j) continue;
      const adjacent = (days[i] + 1) % 7 === days[j];
      if (adjacent && [...pats[i]].some((p) => pats[j].has(p))) clashes++;
    }
  }
  return clashes;
}

/**
 * Chooses strength days: no same-pattern sessions on consecutive days, avoid
 * the user's own (non-walk) activity days, stay close to the default spread,
 * and keep Sunday free when possible. Deterministic.
 */
export function placeStrengthDays(
  strengthDays: number,
  activities: Activity[],
  equipment: Equipment,
  focus: FocusArea[],
): number[] {
  const keys = splitFor(strengthDays);
  const pref = PREFERRED_DAYS[strengthDays] ?? PREFERRED_DAYS[2];
  const busy = new Set(activities.filter((a) => a.type !== 'walk').flatMap((a) => a.days));
  let best: number[] = pref;
  let bestScore = Infinity;
  for (const combo of combinations(7, strengthDays)) {
    const clash = patternClashes(combo, keys, equipment, focus);
    const overlap = combo.filter((d) => busy.has(d)).length;
    const drift = combo.reduce((t, d, i) => t + Math.abs(d - pref[i]), 0);
    const sunday = combo.includes(6) ? 1 : 0;
    const score = clash * 100 + overlap * 10 + drift + sunday * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = combo;
    }
  }
  return best;
}

export function defaultWeekTemplate(
  strengthDays: number,
  activities: Activity[],
  equipment: Equipment,
  focus: FocusArea[],
): WeekTemplate {
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
