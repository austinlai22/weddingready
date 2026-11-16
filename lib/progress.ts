import type { DayPlan, Plan } from './engine/plan';
import { dayPlan } from './engine/plan';
import type { Schedule } from './engine/schedule';
import type { Logs, MealEntry, WeekTemplate, WeightLog } from './types';

export const REST_ID = 'rest';

/** The sessions that make a day "done": its main sessions, else the walk, else the rest-day marker. */
export function doneTargets(d: DayPlan): string[] {
  if (d.status === 'wedding' || d.status === 'after') return [];
  if (d.mainSessions.length) return d.mainSessions.map((s) => s.ref.id);
  if (d.walk) return [d.walk.ref.id];
  return [REST_ID];
}

export function isDayDone(d: DayPlan, logs: Logs): boolean {
  const targets = doneTargets(d);
  const done = new Set(logs.sessionsDone[d.date] ?? []);
  return targets.length > 0 && targets.every((id) => done.has(id));
}

/** "x of y sessions this week": strength + non-walk activities from the plan start through the wedding. */
export function weekSessions(plan: Plan, schedule: Schedule | WeekTemplate | null, dates: string[], logs: Logs): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const date of dates) {
    const d = dayPlan(plan, schedule, date);
    if (d.status === 'before' || d.status === 'wedding' || d.status === 'after') continue;
    const set = new Set(logs.sessionsDone[date] ?? []);
    for (const s of d.mainSessions) {
      total++;
      if (set.has(s.ref.id)) done++;
    }
  }
  return { done, total };
}

export function latestWeight(hist: WeightLog[] | undefined, onOrBefore: string): WeightLog | undefined {
  if (!hist?.length) return undefined;
  for (let i = hist.length - 1; i >= 0; i--) if (hist[i].date <= onOrBefore) return hist[i];
  return undefined;
}

export function mealsLoggedCore(meals: Partial<Record<string, MealEntry | null>> | undefined): boolean {
  return !!(meals?.b && meals?.l && meals?.d && meals?.s);
}
