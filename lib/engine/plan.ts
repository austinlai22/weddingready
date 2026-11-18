import { EASY_CARDIO_ID, type ActivityType, type Profile, type SessionRef, type WeekTemplate, type WorkoutKey } from '../types';
import { ACTIVITY_PEP, activityHow, PHASE_COPY, REST_PEP, rotateLine, STRENGTH_PEP } from './copy';
import { addDays, daysBetween, mondayOf } from './dates';
import { effectiveProfile, safetyNotes, type SafetyNote } from './guardrails';
import { menuForDate, type DayMenu } from './meals';
import { expectedLoss, KCAL_PER_KG, OLDER_ADULT_AGE, REALISTIC_SHARE, targets, type Expectation, type Targets } from './nutrition';
import { buildTimeline, phaseForWeek, weekOf, type Phase, type PhaseName, type Timeline } from './phases';
import { templateForDate, type Schedule } from './schedule';
import { buildWorkout, equipmentOn, WARMUP, weightTip, workoutMeta, type Prescribed, type WorkoutMeta } from './workouts';

export interface Plan {
  profile: Profile;
  timeline: Timeline;
  notes: SafetyNote[];
  /** Lose fat with fewer than 2 weekly cardio sessions: suggest (not require) easy cardio. */
  suggestCardio: boolean;
  expectation: Expectation | null;
  expectationUntil: string;
  /** Days the deficit runs: from when the weight or goal was set (or the start) to Maintain. */
  deficitDays: number;
  /** With a goal weight: how far it is, a realistic range toward it, and whether the plan can safely reach it. */
  goal: GoalOutlook | null;
  shortTimeline: boolean;
}

const CARDIO: ActivityType[] = ['run', 'cycling', 'classes', 'sports'];

export interface GoalOutlook {
  kg: number;
  toLoseKg: number;
  /** Realistic loss by Maintain, never past the goal itself. */
  lowKg: number;
  highKg: number;
  reachable: boolean;
}

/**
 * The goal is checked against the deficit actually set (after every cap and
 * floor), not the general BMI-22 expectation, so the line tells people the
 * truth about their own goal.
 */
function goalOutlook(toLoseKg: number, kg: number, deficit: number, deficitDays: number): GoalOutlook {
  const linear = (deficit * deficitDays) / KCAL_PER_KG;
  const highKg = Math.min(linear * REALISTIC_SHARE, toLoseKg);
  return { kg, toLoseKg, lowKg: Math.min(linear * 0.4, highKg), highKg, reachable: linear * REALISTIC_SHARE + 0.25 >= toLoseKg };
}

export function buildPlan(raw: Profile): Plan {
  const profile = effectiveProfile(raw);
  const timeline = buildTimeline(profile.startDate, profile.weddingDate, profile.goals, profile.fittingDate);
  const cardioSessions = profile.activities
    .filter((a) => CARDIO.includes(a.type) || a.id === EASY_CARDIO_ID)
    .reduce((t, a) => t + new Set(a.days).size, 0);
  const loseFat = profile.goals.includes('lose_fat') && timeline.totalWeeks >= 4;
  const from = profile.goalSetOn && profile.goalSetOn > timeline.startMonday ? profile.goalSetOn : timeline.startMonday;
  const deficitDays = Math.max(0, daysBetween(from, timeline.maintainStartDate));
  const t = targets(profile, loseFat, deficitDays);
  const expectation = loseFat && !profile.safety.edHistory ? expectedLoss(profile, t.deficit, deficitDays / 7) : null;
  const goalKg = loseFat && !profile.safety.edHistory ? profile.goalWeightKg : undefined;
  const goal = goalKg && goalKg < profile.weightKg ? goalOutlook(profile.weightKg - goalKg, goalKg, t.deficit, deficitDays) : null;
  return {
    profile,
    timeline,
    notes: safetyNotes(profile.safety),
    suggestCardio: loseFat && cardioSessions < 2,
    expectation,
    expectationUntil: profile.fittingDate && profile.fittingDate < profile.weddingDate ? 'your fitting' : 'Maintain',
    deficitDays,
    goal,
    shortTimeline: timeline.totalWeeks < 4,
  };
}

/** A calorie deficit runs only for Lose fat, before Maintain starts and before "I've reached my goal". */
export function deficitOn(plan: Plan, date: string): boolean {
  const p = plan.profile;
  if (!p.goals.includes('lose_fat') || plan.timeline.totalWeeks < 4) return false;
  if (date >= plan.timeline.maintainStartDate) return false;
  if (p.goalReachedAt && date >= p.goalReachedAt) return false;
  return true;
}

export function targetsFor(plan: Plan, date: string): Targets {
  return targets(plan.profile, deficitOn(plan, date), plan.deficitDays);
}

export type DayStatus = 'before' | 'active' | 'wedding' | 'after';

export interface StrengthSession {
  kind: 'strength';
  ref: SessionRef & { kind: 'strength' };
  meta: WorkoutMeta;
  exercises: Prescribed[];
  restMin: number;
  restMax: number;
  warmup: string;
  weightTip: string;
}

export interface ActivitySession {
  kind: 'activity';
  ref: SessionRef & { kind: 'activity' };
  title: string;
  how: string;
  isWalk: boolean;
}

export type SessionView = StrengthSession | ActivitySession;

export interface DayPlan {
  date: string;
  week: number;
  phase: Phase;
  status: DayStatus;
  recovery: boolean;
  taper: boolean;
  sessions: SessionView[];
  /** Strength + non-walk activities: what "x of y sessions" and the Done card count. */
  mainSessions: SessionView[];
  walk: ActivitySession | null;
  title: string;
  subtitle: string;
  pep: string;
  how: string;
}

function strengthView(plan: Plan, ref: SessionRef & { kind: 'strength' }, phase: PhaseName, recovery: boolean, taper: boolean, date: string): StrengthSession {
  const p = plan.profile;
  const equipment = equipmentOn(p, date);
  const exercises = buildWorkout(ref.workout, equipment, p.sessionMinutes, {
    phase,
    goals: p.goals,
    experience: p.experience,
    focusAreas: p.focusAreas,
    recovery,
    taper,
    sex: p.sex,
  }, p.exerciseSwaps);
  const restMin = Math.min(...exercises.map((e) => e.restMin));
  const restMax = Math.max(...exercises.map((e) => e.restMax));
  return {
    kind: 'strength',
    ref,
    meta: workoutMeta(ref.workout, p.strengthDays),
    exercises,
    restMin,
    restMax,
    // WHO advises balance training for adults 65 and over; it slots into the warm-up.
    warmup: p.age >= OLDER_ADULT_AGE ? `${WARMUP[equipment]} · 30 sec standing on each leg (hold something steady if needed)` : WARMUP[equipment],
    weightTip: weightTip(phase, p.units),
  };
}

function walkMinutesFor(plan: Plan, ref: SessionRef & { kind: 'activity' }): number | undefined {
  const a = plan.profile.activities.find((x) => x.id === ref.activityId);
  return a?.minutes ?? plan.profile.dailyWalkMinutes;
}

export function dayPlan(plan: Plan, schedule: Schedule | WeekTemplate | null, date: string): DayPlan {
  const t = plan.timeline;
  const week = weekOf(t.startMonday, date);
  const phase = phaseForWeek(t, week);
  const status: DayStatus =
    date < plan.profile.startDate ? 'before' : date === t.weddingDate ? 'wedding' : date > t.weddingDate ? 'after' : 'active';
  const recovery = t.recoveryWeeks.includes(week);
  const taper = date >= t.taperStart && date <= t.weddingDate;
  const seed = Math.max(0, daysBetween(t.startMonday, date));

  const template = templateForDate(plan.profile, schedule, date);
  const refs = status === 'wedding' || status === 'after' ? [] : template.days[(daysBetween(t.startMonday, date) % 7 + 7) % 7];
  const sessions: SessionView[] = refs.map((ref) =>
    ref.kind === 'strength'
      ? strengthView(plan, ref, phase.name, recovery, taper, date)
      : {
          kind: 'activity',
          ref,
          title: ref.label,
          how: activityHow(ref.type, ref.label, phase.name, taper, ref.type === 'walk' ? walkMinutesFor(plan, ref) : undefined),
          // Planned easy cardio is a session of its own, not the everyday walk.
          isWalk: ref.type === 'walk' && ref.activityId !== EASY_CARDIO_ID,
        },
  );
  const mainSessions = sessions.filter((s) => s.kind === 'strength' || !s.isWalk);
  const walk = (sessions.find((s) => s.kind === 'activity' && s.isWalk) as ActivitySession | undefined) ?? null;

  let title: string;
  let subtitle: string;
  let pep: string;
  let how = '';
  const first = mainSessions[0];
  if (status === 'wedding') {
    title = 'Wedding day';
    subtitle = 'Today is the day';
    pep = 'No workout today. Eat breakfast, drink water, enjoy every minute.';
  } else if (status === 'after') {
    title = 'Congratulations';
    subtitle = 'You did it';
    pep = 'Your plan is complete. Keep the habits you love.';
  } else if (first?.kind === 'strength') {
    title = first.meta.title;
    subtitle = first.meta.subtitle;
    pep = rotateLine(STRENGTH_PEP[first.meta.key as WorkoutKey], Math.floor(seed / 7));
  } else if (first?.kind === 'activity') {
    title = walk ? `${first.title} + walk` : first.title;
    subtitle = first.title;
    pep = ACTIVITY_PEP[first.ref.type];
    how = first.how;
  } else if (walk) {
    title = 'Walk day';
    subtitle = walk.title;
    pep = ACTIVITY_PEP.walk;
    how = walk.how;
  } else {
    title = 'Rest day';
    subtitle = 'Recover';
    pep = rotateLine(REST_PEP, seed);
    how = 'A walk if you feel like it, or a full rest day.';
  }
  if (status === 'before' && !pep) pep = PHASE_COPY.foundation.focus;
  return { date, week, phase, status, recovery, taper, sessions, mainSessions, walk, title, subtitle, pep, how };
}

/** Week dates (Mon → Sun) for the week containing `date`. */
export function weekDates(date: string): string[] {
  const m = mondayOf(date);
  return Array.from({ length: 7 }, (_, i) => addDays(m, i));
}

export function menuFor(plan: Plan, date: string): DayMenu {
  const p = plan.profile;
  return menuForDate(date, { diet: p.diet, avoid: p.avoid, kcal: targetsFor(plan, date).kcal, treat: p.treat });
}

/** Weeks-to-wedding analytics bucket (SPEC §12). */
export function weeksBucket(W: number): string {
  if (W < 8) return '<8';
  if (W < 16) return '8-15';
  if (W < 32) return '16-31';
  return '32+';
}
