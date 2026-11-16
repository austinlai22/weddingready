// Data for the diagrams on "How the plan works", all produced by the real
// engine (like lib/example.ts) so the page can't drift from what the app does.

import type { Activity, WeekTemplate, WorkoutKey } from './types';
import { addDays } from './engine/dates';
import { dayPlan } from './engine/plan';
import { PHASE_LABEL, weekOf, type PhaseName } from './engine/phases';
import { targets } from './engine/nutrition';
import { defaultWeekTemplate, isHardActivity, shapeOf, weekIssues } from './engine/split';
import { suggestWeekFix } from './engine/suggest';
import { workoutMeta } from './engine/workouts';
import { examplePlan, exampleTargets } from './example';

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
export interface ExampleWeek {
  days: Chip[][];
  /** Workout letter → what it trains, for the legend. */
  sessions: { key: string; subtitle: string }[];
  problems: string[];
}

const WALK: Activity = { id: 'walk', type: 'walk', label: 'Walk', days: [0, 1, 2, 3, 4, 5, 6] };

function weekFor(strengthDays: 2 | 3 | 4 | 5, activities: Activity[]): ExampleWeek {
  const t: WeekTemplate = defaultWeekTemplate(strengthDays, activities, 'home_db', []);
  const keys = new Set<string>();
  const days = t.days.map((d) =>
    d.flatMap((s): Chip[] => {
      if (s.kind === 'strength') {
        keys.add(s.workout);
        return [{ kind: 'strength', label: s.workout }];
      }
      if (s.type === 'walk') return []; // every example walks daily; said once in the caption
      return [{ kind: isHardActivity(s.type) ? 'hard' : 'easy', label: s.label }];
    }),
  );
  const problems = weekIssues(shapeOf(t), 'home_db', [])
    .filter((i) => i.severity === 'rule')
    .map((i) => i.text);
  return { days, sessions: [...keys].map((key) => ({ key, subtitle: workoutMeta(key as WorkoutKey, strengthDays).subtitle })), problems };
}

const threeDay = [{ id: 'run', type: 'run', label: 'Run', days: [1] }, { id: 'yoga', type: 'yoga', label: 'Yoga', days: [5] }, WALK] satisfies Activity[];
const fourDay = [{ id: 'spin', type: 'cycling', label: 'Spin', days: [2] }, WALK] satisfies Activity[];
const packed = [
  { id: 'class', type: 'classes', label: 'Class', days: [0, 1, 2, 3] },
  { id: 'run', type: 'run', label: 'Run', days: [3] },
  { id: 'sports', type: 'sports', label: 'Sports', days: [0] },
  WALK,
] satisfies Activity[];

const packedFix = suggestWeekFix({ strengthDays: 3, activities: packed, equipment: 'home_db', focusAreas: [] });

export const exampleWeeks = {
  three: weekFor(3, threeDay),
  four: weekFor(4, fourDay),
  packed: weekFor(3, packed),
  packedFix,
  packedFixed: packedFix?.kind === 'days' ? weekFor(packedFix.strengthDays, packed) : null,
};

// ---------- Energy ----------

/** Same person, no deficit: their estimated maintenance. */
export const exampleMaintenance = targets(examplePlan.profile, false);
export const exampleLoseFat = exampleTargets;
