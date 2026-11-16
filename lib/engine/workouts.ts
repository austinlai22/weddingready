import exercisesData from '../../data/exercises.json';
import type { Equipment, FocusArea, Goal, Experience, WorkoutKey } from '../types';
import type { PhaseName } from './phases';

export type Pattern =
  | 'squat' | 'hinge' | 'lunge' | 'bridge' | 'hpush' | 'vpush' | 'hpull' | 'vpull'
  | 'lateral_raise' | 'rear_delt' | 'biceps' | 'triceps' | 'core_ext' | 'core_rot' | 'calf';

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  equipment: Equipment;
  primaryMuscles: string[];
  focusTags: FocusArea[];
  isMain: boolean;
  unit: 'reps' | 'seconds' | 'per-side';
  cues: string[];
  loaded: boolean;
  sideLabel?: 'leg' | 'side' | 'arm';
  fixedReps?: string;
  rirOnly?: boolean;
  note?: string;
  media: { type: 'video' | 'gif'; src: string; poster?: string; credit: string; license: string } | null;
}

export const EXERCISES = exercisesData as Exercise[];
const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function exerciseById(id: string): Exercise {
  const ex = BY_ID.get(id);
  if (!ex) throw new Error(`Unknown exercise ${id}`);
  return ex;
}

type Pick = Record<Equipment, string>;
interface Slot { pick: Pick; main: boolean }

export interface WorkoutMeta {
  key: WorkoutKey;
  title: string;
  subtitle: string;
  tag: string;
}

// Session templates as ordered slots. Home-dumbbell A and B reproduce the
// reference prototype's two workouts exactly; the rest follow the same shape.
const TEMPLATES: Record<Exclude<WorkoutKey, 'F'>, Slot[]> = {
  A: [
    { main: true, pick: { home_db: 'goblet-squat', gym: 'back-squat', bodyweight: 'bw-squat' } },
    { main: true, pick: { home_db: 'db-rdl', gym: 'bb-rdl', bodyweight: 'bw-sl-hinge' } },
    { main: true, pick: { home_db: 'floor-press', gym: 'db-bench', bodyweight: 'pushup' } },
    { main: false, pick: { home_db: 'bulgarian-split-squat', gym: 'gym-split-squat', bodyweight: 'bw-split-squat' } },
    { main: false, pick: { home_db: 'lateral-raise', gym: 'cable-lateral-raise', bodyweight: 'y-raise' } },
    { main: false, pick: { home_db: 'overhead-triceps-extension', gym: 'triceps-pushdown', bodyweight: 'bench-dip' } },
    { main: false, pick: { home_db: 'dead-bug', gym: 'ab-rollout', bodyweight: 'dead-bug' } },
  ],
  B: [
    { main: true, pick: { home_db: 'hip-thrust', gym: 'bb-hip-thrust', bodyweight: 'bw-sl-bridge' } },
    { main: true, pick: { home_db: 'reverse-lunge', gym: 'walking-lunge', bodyweight: 'bw-reverse-lunge' } },
    { main: true, pick: { home_db: 'one-arm-row', gym: 'cable-row', bodyweight: 'table-row' } },
    { main: false, pick: { home_db: 'ohp', gym: 'shoulder-press', bodyweight: 'pike-pushup' } },
    { main: false, pick: { home_db: 'rear-delt-fly', gym: 'face-pull', bodyweight: 't-raise' } },
    { main: false, pick: { home_db: 'pushup', gym: 'pushup', bodyweight: 'bw-incline-pushup' } },
    { main: false, pick: { home_db: 'side-plank', gym: 'pallof-press', bodyweight: 'side-plank' } },
  ],
  C: [
    { main: true, pick: { home_db: 'db-sumo-squat', gym: 'leg-press', bodyweight: 'bw-squat' } },
    { main: true, pick: { home_db: 'db-pullover', gym: 'lat-pulldown', bodyweight: 'floor-pulldown' } },
    { main: false, pick: { home_db: 'db-sl-rdl', gym: 'back-extension', bodyweight: 'bw-sl-hinge' } },
    { main: false, pick: { home_db: 'pushup', gym: 'incline-press', bodyweight: 'bw-incline-pushup' } },
    { main: false, pick: { home_db: 'db-curl', gym: 'cable-curl', bodyweight: 'towel-curl' } },
    { main: false, pick: { home_db: 'db-calf-raise', gym: 'machine-calf-raise', bodyweight: 'sl-calf-raise' } },
    { main: false, pick: { home_db: 'suitcase-carry', gym: 'pallof-press', bodyweight: 'bird-dog' } },
  ],
  U: [
    { main: true, pick: { home_db: 'floor-press', gym: 'db-bench', bodyweight: 'pushup' } },
    { main: true, pick: { home_db: 'one-arm-row', gym: 'cable-row', bodyweight: 'table-row' } },
    { main: false, pick: { home_db: 'ohp', gym: 'shoulder-press', bodyweight: 'pike-pushup' } },
    { main: false, pick: { home_db: 'db-pullover', gym: 'lat-pulldown', bodyweight: 'floor-pulldown' } },
    { main: false, pick: { home_db: 'lateral-raise', gym: 'cable-lateral-raise', bodyweight: 'y-raise' } },
    { main: false, pick: { home_db: 'db-curl', gym: 'cable-curl', bodyweight: 'towel-curl' } },
    { main: false, pick: { home_db: 'overhead-triceps-extension', gym: 'triceps-pushdown', bodyweight: 'bench-dip' } },
  ],
  // 5 days: push, pull and legs, so each muscle group gets a second session after Upper and Lower.
  P: [
    { main: true, pick: { home_db: 'floor-press', gym: 'db-bench', bodyweight: 'pushup' } },
    { main: true, pick: { home_db: 'ohp', gym: 'shoulder-press', bodyweight: 'pike-pushup' } },
    { main: false, pick: { home_db: 'db-floor-fly', gym: 'incline-press', bodyweight: 'bw-incline-pushup' } },
    { main: false, pick: { home_db: 'lateral-raise', gym: 'cable-lateral-raise', bodyweight: 'y-raise' } },
    { main: false, pick: { home_db: 'overhead-triceps-extension', gym: 'triceps-pushdown', bodyweight: 'bench-dip' } },
    { main: false, pick: { home_db: 'db-deadbug', gym: 'ab-rollout', bodyweight: 'plank' } },
  ],
  R: [
    { main: true, pick: { home_db: 'one-arm-row', gym: 'cable-row', bodyweight: 'table-row' } },
    { main: true, pick: { home_db: 'db-pullover', gym: 'lat-pulldown', bodyweight: 'floor-pulldown' } },
    { main: false, pick: { home_db: 'rear-delt-fly', gym: 'face-pull', bodyweight: 't-raise' } },
    { main: false, pick: { home_db: 'db-curl', gym: 'cable-curl', bodyweight: 'towel-curl' } },
    { main: false, pick: { home_db: 'suitcase-carry', gym: 'pallof-press', bodyweight: 'bird-dog' } },
  ],
  G: [
    { main: true, pick: { home_db: 'hip-thrust', gym: 'bb-hip-thrust', bodyweight: 'bw-sl-bridge' } },
    { main: true, pick: { home_db: 'bulgarian-split-squat', gym: 'gym-split-squat', bodyweight: 'bw-split-squat' } },
    // Main so the legs day is never placed the day after Lower (they share the hinge).
    { main: true, pick: { home_db: 'db-sl-rdl', gym: 'back-extension', bodyweight: 'bw-sl-hinge' } },
    { main: false, pick: { home_db: 'db-sumo-squat', gym: 'leg-press', bodyweight: 'bw-squat' } },
    { main: false, pick: { home_db: 'db-calf-raise', gym: 'machine-calf-raise', bodyweight: 'sl-calf-raise' } },
    { main: false, pick: { home_db: 'side-plank', gym: 'pallof-press', bodyweight: 'side-plank' } },
  ],
  L: [
    { main: true, pick: { home_db: 'goblet-squat', gym: 'back-squat', bodyweight: 'bw-squat' } },
    { main: true, pick: { home_db: 'db-rdl', gym: 'bb-rdl', bodyweight: 'bw-sl-hinge' } },
    { main: false, pick: { home_db: 'hip-thrust', gym: 'bb-hip-thrust', bodyweight: 'bw-sl-bridge' } },
    { main: false, pick: { home_db: 'reverse-lunge', gym: 'walking-lunge', bodyweight: 'bw-reverse-lunge' } },
    { main: false, pick: { home_db: 'db-calf-raise', gym: 'machine-calf-raise', bodyweight: 'sl-calf-raise' } },
    { main: false, pick: { home_db: 'dead-bug', gym: 'ab-rollout', bodyweight: 'plank' } },
  ],
};

/**
 * Display names. A, B and C are the full-body sessions (2–3 days); U and L the
 * upper/lower split (4 days, and 5 with the Focus day). `strengthDays` is kept
 * for callers that label by plan size; the names don't currently depend on it.
 */
export function workoutMeta(key: WorkoutKey, strengthDays?: number): WorkoutMeta {
  void strengthDays;
  switch (key) {
    case 'A':
      return { key, title: 'Strength A', subtitle: 'Legs & push', tag: 'Str A' };
    case 'B':
      return { key, title: 'Strength B', subtitle: 'Glutes & pull', tag: 'Str B' };
    case 'C':
      return { key, title: 'Strength C', subtitle: 'Full body', tag: 'Str C' };
    case 'U':
      return { key, title: 'Upper body', subtitle: 'Chest, back, shoulders & arms', tag: 'Upper' };
    case 'L':
      return { key, title: 'Lower body', subtitle: 'Legs & glutes', tag: 'Lower' };
    case 'P':
      return { key, title: 'Push', subtitle: 'Chest, shoulders & triceps', tag: 'Push' };
    case 'R':
      return { key, title: 'Pull', subtitle: 'Back, rear shoulders & biceps', tag: 'Pull' };
    case 'G':
      return { key, title: 'Legs', subtitle: 'Glutes, hamstrings & single-leg work', tag: 'Legs' };
    case 'F':
      return { key, title: 'Focus day', subtitle: 'Your focus areas + core', tag: 'Focus' };
  }
}

const ALLOWED_EQUIPMENT: Record<Equipment, Equipment[]> = {
  home_db: ['home_db', 'bodyweight'],
  gym: ['gym', 'home_db', 'bodyweight'],
  bodyweight: ['bodyweight'],
};

const DEFAULT_FOCUS: FocusArea[] = ['upper_back', 'glutes', 'shoulders'];

/** The 5-day plan's Focus day: two moves per focus area, then one of each core pattern. */
function focusSlots(equipment: Equipment, focusAreas: FocusArea[]): { id: string; main: boolean }[] {
  const allowed = ALLOWED_EQUIPMENT[equipment];
  const rank = (e: Exercise) => allowed.indexOf(e.equipment);
  const chosen: string[] = [];
  const areas = (focusAreas.length ? focusAreas : DEFAULT_FOCUS).filter((a) => a !== 'core');
  for (const area of areas) {
    const pool = EXERCISES.filter(
      (e) => e.focusTags.includes(area) && allowed.includes(e.equipment) && !e.pattern.startsWith('core') && !chosen.includes(e.id),
    ).sort((a, b) => rank(a) - rank(b) || Number(a.isMain) - Number(b.isMain));
    const patterns = new Set<string>();
    for (const e of pool) {
      if (patterns.has(e.pattern)) continue;
      chosen.push(e.id);
      patterns.add(e.pattern);
      if (patterns.size === 2) break;
    }
  }
  for (const pattern of ['core_ext', 'core_rot'] as const) {
    const e = EXERCISES.filter((x) => x.pattern === pattern && allowed.includes(x.equipment)).sort((a, b) => rank(a) - rank(b))[0];
    if (e && !chosen.includes(e.id)) chosen.push(e.id);
  }
  return chosen.map((id) => ({ id, main: false }));
}

export function workoutSlots(key: WorkoutKey, equipment: Equipment, focusAreas: FocusArea[]): { id: string; main: boolean }[] {
  if (key === 'F') return focusSlots(equipment, focusAreas);
  return TEMPLATES[key].map((s) => ({ id: s.pick[equipment], main: s.main }));
}

/** Main-lift patterns a session trains, for the same-pattern-on-consecutive-days warning. */
export function mainPatterns(key: WorkoutKey, equipment: Equipment, focusAreas: FocusArea[]): Pattern[] {
  return workoutSlots(key, equipment, focusAreas)
    .filter((s) => s.main)
    .map((s) => exerciseById(s.id).pattern);
}

// ---------- Prescription (SPEC §6.2) ----------

export interface RxContext {
  phase: PhaseName;
  goals: Goal[];
  experience: Experience;
  focusAreas: FocusArea[];
  recovery: boolean;
  taper: boolean;
}

export interface Prescribed {
  exercise: Exercise;
  main: boolean;
  focus: boolean;
  sets: number;
  reps: string;
  rx: string;
  /** True when phase, recovery or taper changed the prescription from the Foundation baseline (shown bold). */
  changed: boolean;
  restMin: number;
  restMax: number;
}

const SIDE_TEXT = { leg: 'per leg', side: 'per side', arm: 'per arm' } as const;

function strengthMainReps(ctx: RxContext): string {
  return ctx.goals.includes('strength') && ctx.experience !== 'new' ? '6–8' : '8–10';
}

export function prescribe(ex: Exercise, main: boolean, ctx: RxContext): Prescribed {
  const focus = ex.focusTags.some((t) => ctx.focusAreas.includes(t));
  const baseReps = main ? '10–12' : '12–15';
  let sets = 3;
  let reps = baseReps;
  let restMin = 60;
  let restMax = 90;

  switch (ctx.phase) {
    case 'strength':
      if (main) {
        sets = 4;
        reps = strengthMainReps(ctx);
        restMin = 90;
        restMax = 120;
      } else {
        reps = '10–12';
      }
      break;
    case 'shape':
      if (focus) sets = 4;
      break;
    case 'build':
      if (main) {
        sets = 4;
        reps = strengthMainReps(ctx);
        restMin = 90;
        restMax = 120;
      } else {
        reps = '10–12';
        if (focus) sets = 4;
      }
      break;
    default:
      break;
  }

  // Maintain & energized: Strength/Shape/Build stay, one set fewer on accessories.
  if (ctx.goals.includes('maintain') && !main && ['strength', 'shape', 'build'].includes(ctx.phase)) {
    sets = Math.max(2, sets - 1);
  }
  if (ctx.recovery || ctx.taper) sets = 2;

  const side = ex.unit !== 'reps' && ex.sideLabel ? ` ${SIDE_TEXT[ex.sideLabel]}` : '';
  let rx: string;
  let shownReps = reps;
  if (ex.rirOnly) {
    rx = `${sets} sets · stop 2 reps before failure`;
    shownReps = '';
  } else if (ex.fixedReps) {
    shownReps = ex.unit === 'seconds' ? `${ex.fixedReps} sec` : ex.fixedReps;
    rx = `${sets} × ${shownReps}${side}`;
  } else {
    rx = `${sets} × ${reps}${side}`;
  }
  const changed = sets !== 3 || (!ex.fixedReps && !ex.rirOnly && reps !== baseReps);
  return { exercise: ex, main, focus, sets, reps: shownReps, rx, changed, restMin, restMax };
}

/** Minutes for a list of prescriptions: 5 min warm-up + 2.5 min per main set + 1.75 min per accessory set. */
export function sessionMinutes(list: Prescribed[]): number {
  return 5 + list.reduce((t, p) => t + p.sets * (p.main ? 2.5 : 1.75), 0);
}

/** Drops accessories from the end until the session fits. Main lifts are never trimmed. */
export function trimToFit(list: Prescribed[], minutes: number): Prescribed[] {
  const out = [...list];
  while (sessionMinutes(out) > minutes) {
    let idx = -1;
    for (let i = out.length - 1; i >= 0; i--) {
      if (!out[i].main) {
        idx = i;
        break;
      }
    }
    if (idx === -1) break;
    out.splice(idx, 1);
  }
  return out;
}

export function buildWorkout(
  key: WorkoutKey,
  equipment: Equipment,
  sessionLength: number,
  ctx: RxContext,
  swaps: Record<string, string> = {},
): Prescribed[] {
  const list = workoutSlots(key, equipment, ctx.focusAreas).map((s) => {
    const to = swaps[s.id];
    const ex = to && BY_ID.has(to) ? exerciseById(to) : exerciseById(s.id);
    return prescribe(ex, s.main, ctx);
  });
  return trimToFit(list, sessionLength);
}

// Patterns that can stand in for each other when a joint needs a break.
const KINDER: Partial<Record<Pattern, Pattern[]>> = {
  squat: ['bridge', 'hinge'],
  lunge: ['bridge', 'hinge'],
  hinge: ['bridge'],
  vpush: ['hpush', 'lateral_raise'],
  hpush: ['vpush'],
  vpull: ['hpull'],
  hpull: ['vpull'],
  core_ext: ['core_rot'],
};

/** Exercises that can replace `id` with this equipment: the same movement first, then gentler related ones. */
export function alternativesFor(id: string, equipment: Equipment): { exercise: Exercise; same: boolean }[] {
  const ex = exerciseById(id);
  const allowed = ALLOWED_EQUIPMENT[equipment];
  const pool = (patterns: Pattern[]) => EXERCISES.filter((e) => e.id !== id && patterns.includes(e.pattern) && allowed.includes(e.equipment));
  return [...pool([ex.pattern]).map((e) => ({ exercise: e, same: true })), ...pool(KINDER[ex.pattern] ?? []).map((e) => ({ exercise: e, same: false }))];
}

/** Equipment for a given date: a temporary change if one covers it, else the usual. */
export function equipmentOn(p: { equipment: Equipment; equipmentOverrides?: { from: string; to: string; equipment: Equipment }[] }, date: string): Equipment {
  return p.equipmentOverrides?.find((o) => o.from <= date && date <= o.to)?.equipment ?? p.equipment;
}

export const WARMUP: Record<Equipment, string> = {
  home_db: '20 squats · 10 glute bridges · 10 arm circles each way · 10 light rows',
  gym: '5 min easy bike or rower · 10 bodyweight squats · 10 band pull-aparts or light rows',
  bodyweight: '20 squats · 10 glute bridges · 10 arm circles each way · 10 incline push-ups',
};

export function weightTip(phase: PhaseName, units: 'imperial' | 'metric'): string {
  const light = units === 'imperial' ? 'often 5–12 lb' : 'often 2–5 kg';
  switch (phase) {
    case 'foundation':
      return `Pick a weight where the last 2 reps feel hard, with about 2 left in you. Raises and flys usually need light dumbbells (${light}).`;
    case 'maintain':
    case 'feelgood':
      return 'Keep the weights you have. The goal now is to feel strong and rested.';
    default:
      return 'Hit the top of the rep range on every set, with about 2 reps left in you? Go up to the next weight next time.';
  }
}
