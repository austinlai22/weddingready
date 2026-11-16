// Data for the diagrams on "How the plan works", all produced by the real
// engine (like lib/example.ts) so the page can't drift from what the app does.

import type { Activity } from './types';
import { addDays } from './engine/dates';
import { dayPlan } from './engine/plan';
import { PHASE_LABEL, weekOf, type PhaseName } from './engine/phases';
import { defaultWeekTemplate, isHardActivity } from './engine/split';
import { examplePlan } from './example';

// ---------- Strength sets per week across the example plan ----------

export interface WeekVolume {
  week: number;
  start: string;
  phase: PhaseName;
  phaseLabel: string;
  sets: number;
  recovery: boolean;
  taper: boolean;
}

export const weeklyVolume: WeekVolume[] = (() => {
  const t = examplePlan.timeline;
  const rows: WeekVolume[] = [];
  for (let w = 1; w <= t.totalWeeks; w++) {
    const start = addDays(t.startMonday, (w - 1) * 7);
    let sets = 0;
    let recovery = false;
    let taper = false;
    let phase: PhaseName = 'foundation';
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, d);
      if (date > t.weddingDate) break;
      const day = dayPlan(examplePlan, null, date);
      phase = day.phase.name;
      recovery ||= day.recovery;
      taper ||= day.taper;
      for (const s of day.sessions) if (s.kind === 'strength') sets += s.exercises.reduce((n, e) => n + e.sets, 0);
    }
    rows.push({ week: w, start, phase, phaseLabel: PHASE_LABEL[phase], sets, recovery, taper });
  }
  return rows;
})();

export const fittingWeek = weekOf(examplePlan.timeline.startMonday, examplePlan.profile.fittingDate!);

// ---------- Example weeks ----------

export type ChipKind = 'strength' | 'hard' | 'easy';
export interface Chip {
  kind: ChipKind;
  label: string;
}

const WALK: Activity = { id: 'walk', type: 'walk', label: 'Walk', days: [0, 1, 2, 3, 4, 5, 6] };

/** The week the app lays out for these inputs, as chips per day. Walks are left out to keep it readable. */
function weekFor(strengthDays: 2 | 3 | 4 | 5, activities: Activity[]): Chip[][] {
  return defaultWeekTemplate(strengthDays, [...activities, WALK], 'home_db', []).days.map((d) =>
    d.flatMap((s): Chip[] => {
      if (s.kind === 'strength') return [{ kind: 'strength', label: 'Lift' }];
      if (s.type === 'walk') return [];
      return [{ kind: isHardActivity(s.type) ? 'hard' : 'easy', label: s.label }];
    }),
  );
}

export const exampleWeeks = {
  fullBody: weekFor(3, [
    { id: 'run', type: 'run', label: 'Run', days: [1] },
    { id: 'yoga', type: 'yoga', label: 'Yoga', days: [5] },
  ]),
  split: weekFor(4, [{ id: 'spin', type: 'cycling', label: 'Spin', days: [2] }]),
};
