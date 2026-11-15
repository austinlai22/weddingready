import type { Activity, Profile } from '../types';
import { DAY_NAMES } from './dates';
import { defaultWeekTemplate, isHardActivity, shapeOf, weekIssues } from './split';

type WeekInputs = Pick<Profile, 'strengthDays' | 'activities' | 'equipment' | 'focusAreas'>;

export interface ActivityMove {
  activityId: string;
  label: string;
  from: number;
  to: number;
}

export type WeekSuggestion =
  | { kind: 'moves'; moves: ActivityMove[]; text: string }
  | { kind: 'days'; strengthDays: 2 | 3 | 4 | 5; text: string }
  | { kind: 'lighter'; text: string };

function issuesFor(p: WeekInputs, activities = p.activities) {
  const t = defaultWeekTemplate(p.strengthDays, activities, p.equipment, p.focusAreas);
  const shape = shapeOf(t);
  const all = weekIssues(shape, p.equipment, p.focusAreas);
  // A move must not create a day with three or more hard sessions, with or without strength.
  const crowded = shape.hard.filter((h, d) => h.length + shape.strength[d].length >= 3).length;
  return { rules: all.filter((i) => i.severity === 'rule').length + crowded, notes: all.length };
}

export function applyMoves(activities: Activity[], moves: ActivityMove[]): Activity[] {
  return activities.map((a) => {
    const mine = moves.filter((m) => m.activityId === a.id);
    if (!mine.length) return a;
    const days = a.days.map((d) => mine.find((m) => m.from === d)?.to ?? d);
    return { ...a, days: [...new Set(days)].sort() };
  });
}

function candidateMoves(activities: Activity[]): ActivityMove[] {
  const out: ActivityMove[] = [];
  for (const a of activities) {
    if (!isHardActivity(a.type)) continue;
    for (const from of [...new Set(a.days)]) {
      for (let to = 0; to < 7; to++) if (!a.days.includes(to)) out.push({ activityId: a.id, label: a.label, from, to });
    }
  }
  return out;
}

function describe(moves: ActivityMove[]): string {
  const parts = moves.map((m) => `${DAY_NAMES[m.from]}’s ${m.label.toLowerCase()} to ${DAY_NAMES[m.to]}`);
  return `If you can, move ${parts.join(' and ')}. Then every strength session gets the recovery it needs.`;
}

/**
 * When the person's own activities leave no way to follow the recovery rules,
 * finds the smallest change (moving one or two sessions of a hard activity to
 * another day) after which the week follows every rule. Strength days are
 * re-placed around the change. Only ever offered, never applied on its own.
 */
function suggestActivityMoves(p: WeekInputs): ActivityMove[] | null {
  const singles = candidateMoves(p.activities);
  let best: { moves: ActivityMove[]; notes: number } | null = null;
  for (const m of singles) {
    const r = issuesFor(p, applyMoves(p.activities, [m]));
    if (r.rules === 0 && (!best || r.notes < best.notes)) best = { moves: [m], notes: r.notes };
  }
  if (!best) {
    for (let i = 0; i < singles.length; i++) {
      for (let j = i + 1; j < singles.length; j++) {
        const a = singles[i];
        const b = singles[j];
        // Two moves of the same session, or onto the same day of the same activity, aren't a real plan.
        if (a.activityId === b.activityId && (a.from === b.from || a.to === b.to)) continue;
        const r = issuesFor(p, applyMoves(p.activities, [a, b]));
        if (r.rules === 0 && (!best || r.notes < best.notes)) best = { moves: [a, b], notes: r.notes };
      }
    }
  }
  return best?.moves ?? null;
}

const DAYS_TEXT: Record<number, string> = {
  2: '2 full-body strength days',
  3: '3 full-body strength days',
  4: '4 strength days (lower and upper body, which can go back to back)',
};

/**
 * What to offer when the week can't follow the recovery rules: first the
 * smallest move of your own activities, then the nearest number of strength
 * days that fits around them, then a gentle "make one session lighter".
 * Nothing is ever applied without a tap.
 */
export function suggestWeekFix(p: WeekInputs): WeekSuggestion | null {
  if (issuesFor(p).rules === 0) return null;
  const moves = suggestActivityMoves(p);
  if (moves) return { kind: 'moves', moves, text: describe(moves) };
  // Only ever suggest fewer strength days: a packed week never needs more training.
  const order = [4, 3, 2].filter((n) => n < p.strengthDays);
  for (const n of order) {
    if (issuesFor({ ...p, strengthDays: n as WeekInputs['strengthDays'] }).rules === 0) {
      return {
        kind: 'days',
        strengthDays: n as 2 | 3 | 4 | 5,
        text: `Your week is already full of hard sessions, so ${DAYS_TEXT[n]} fit around them better than ${p.strengthDays}. Each one still gets an easy day to recover.`,
      };
    }
  }
  return { kind: 'lighter', text: 'Your week is packed. If you can, make one of your classes or runs a walk or yoga session, so your strength days get an easy day between them.' };
}
