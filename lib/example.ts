import { daysBetween } from './engine/dates';
import { PROTOTYPE_USER } from './engine/fixtures';
import { buildPlan, dayPlan, targetsFor, type StrengthSession } from './engine/plan';
import { sessionMinutes } from './engine/workouts';

// The example shown on the home page and "How the plan works", produced by the
// real engine so those pages can never show something the app wouldn't. Every
// detail is invented.
export const EXAMPLE_TODAY = '2027-02-01';
export const examplePlan = buildPlan({ ...PROTOTYPE_USER, startDate: '2026-11-16', weddingDate: '2027-10-16', fittingDate: '2027-09-04' });
export const exampleDay = dayPlan(examplePlan, null, EXAMPLE_TODAY);
export const exampleWorkout = exampleDay.sessions.find((s): s is StrengthSession => s.kind === 'strength')!;
export const exampleTargets = targetsFor(examplePlan, EXAMPLE_TODAY);
export const exampleDaysToGo = daysBetween(EXAMPLE_TODAY, examplePlan.timeline.weddingDate);
export const exampleMinutes = Math.round(sessionMinutes(exampleWorkout.exercises) / 5) * 5;

export const PHASE_FILL: Record<string, string> = {
  foundation: '#F6E4EA',
  strength: '#E3CCD4',
  shape: '#C9A9B5',
  build: '#C9A9B5',
  maintain: '#E4C79A',
  feelgood: '#E4C79A',
};
