// "Try the example plan": a ready-made plan so visitors can look around the
// app without going through setup. Dates are relative to today, so the
// example is always ten weeks in, with the last fortnight's sessions done.

import { PROTOTYPE_USER } from './engine/fixtures';
import { addDays, mondayOf } from './engine/dates';
import { buildPlan, dayPlan } from './engine/plan';
import { emptyState } from './state/schema';
import type { AppState, Profile } from './types';

/** Set while the plan on this device is the example; cleared by "Delete everything". */
export const DEMO_KEY = 'weddingready-demo';

export function demoProfile(today: string): Profile {
  const startDate = addDays(mondayOf(today), -10 * 7);
  const weddingDate = addDays(startDate, 47 * 7 + 5); // a Saturday, 48 weeks after the start
  return { ...PROTOTYPE_USER, startDate, weddingDate, fittingDate: addDays(weddingDate, -6 * 7) };
}

export function demoState(today: string, deviceId: string): AppState {
  const profile = demoProfile(today);
  const plan = buildPlan(profile);
  const state = emptyState(deviceId);
  for (let back = 14; back >= 1; back--) {
    const date = addDays(today, -back);
    const ids = dayPlan(plan, null, date).mainSessions.map((s) => s.ref.id);
    if (ids.length) state.logs.sessionsDone[date] = ids;
  }
  return { ...state, profile };
}
