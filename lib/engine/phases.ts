import type { Goal } from '../types';
import { addDays, daysBetween, mondayOf } from './dates';

export type PhaseName = 'foundation' | 'strength' | 'shape' | 'build' | 'maintain' | 'feelgood';

export const PHASE_LABEL: Record<PhaseName, string> = {
  foundation: 'Foundation',
  strength: 'Strength',
  shape: 'Shape',
  build: 'Build',
  maintain: 'Maintain',
  feelgood: 'Feel-good',
};

export interface Phase {
  name: PhaseName;
  label: string;
  startWeek: number;
  endWeek: number;
  weeks: number;
  startDate: string;
  endDate: string;
}

export interface Timeline {
  startMonday: string;
  weddingDate: string;
  totalWeeks: number;
  phases: Phase[];
  recoveryWeeks: number[];
  taperStart: string;
  maintainStartDate: string;
  /** Set when a fitting date asked for an earlier Maintain than the phase minimums allow. */
  fittingConstrained: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Whole weeks from the start Monday through the week that contains the wedding (SPEC §6.1). */
export function weeksToWedding(startDate: string, weddingDate: string): number {
  return daysBetween(mondayOf(startDate), mondayOf(weddingDate)) / 7 + 1;
}

/** 1-based plan week containing `date`. Can be ≤ 0 before the start. */
export function weekOf(startMonday: string, date: string): number {
  return Math.floor(daysBetween(startMonday, date) / 7) + 1;
}

type Alloc = { name: PhaseName; weeks: number }[];

// Minimum lengths used when a fitting date forces Maintain earlier. The spec
// fixes Foundation's minimum per timeline band; the others are our choice
// (documented in the README): Shape 2, Strength 2, Build 1.
function foundationMin(W: number): number {
  if (W >= 16) return 4;
  if (W >= 8) return 2;
  return 1;
}
const SHRINK_MIN: Partial<Record<PhaseName, number>> = { shape: 2, strength: 2, build: 1 };

/** SPEC §6.1 phase table plus the §6.2 goal modifiers, before any fitting-date shift. */
export function allocatePhases(W: number, goals: Goal[]): Alloc {
  if (W < 4) return [{ name: 'feelgood', weeks: Math.max(W, 1) }];
  if (W < 8) {
    const F = W <= 5 ? 1 : 2;
    const M = 1;
    return [
      { name: 'foundation', weeks: F },
      { name: 'build', weeks: W - F - M },
      { name: 'maintain', weeks: M },
    ];
  }
  if (W < 16) {
    const F = clamp(Math.round(0.25 * W), 2, 3);
    const M = 2;
    return [
      { name: 'foundation', weeks: F },
      { name: 'build', weeks: W - F - M },
      { name: 'maintain', weeks: M },
    ];
  }
  const F = clamp(Math.round(0.17 * W), 4, 8);
  const M = clamp(Math.round(0.25 * W), 3, 14);
  const R = W - F - M;
  let S = Math.round(0.46 * R);
  let Sh = R - S;
  // Goal modifiers: Build strength moves 2 weeks Shape → Strength, Tone moves 2
  // weeks Strength → Shape. Both together cancel out.
  let delta = 0;
  if (goals.includes('strength')) delta += 2;
  if (goals.includes('tone')) delta -= 2;
  if (delta > 0) delta = Math.min(delta, Sh - 2);
  if (delta < 0) delta = -Math.min(-delta, S - 2);
  S += delta;
  Sh -= delta;
  return [
    { name: 'foundation', weeks: F },
    { name: 'strength', weeks: S },
    { name: 'shape', weeks: Sh },
    { name: 'maintain', weeks: M },
  ];
}

/**
 * Maintain must start no later than 2 weeks before the fitting so size is
 * stable for alterations. Shrinks Shape, then Strength (or Build), then
 * Foundation down to its minimum. Returns whether the minimums stopped it.
 */
export function applyFittingShift(
  alloc: Alloc,
  W: number,
  startMonday: string,
  fittingDate: string | undefined,
  weddingDate: string,
): { alloc: Alloc; constrained: boolean } {
  if (!fittingDate || fittingDate >= weddingDate) return { alloc, constrained: false };
  const maintain = alloc.find((p) => p.name === 'maintain');
  if (!maintain) return { alloc, constrained: false };
  const latestStartWeek = weekOf(startMonday, addDays(fittingDate, -14));
  const currentStart = W - maintain.weeks + 1;
  let need = currentStart - latestStartWeek;
  if (need <= 0) return { alloc, constrained: false };
  const next = alloc.map((p) => ({ ...p }));
  const order: PhaseName[] = ['shape', 'strength', 'build', 'foundation'];
  for (const name of order) {
    const p = next.find((x) => x.name === name);
    if (!p || need <= 0) continue;
    const min = name === 'foundation' ? foundationMin(W) : (SHRINK_MIN[name] ?? 1);
    const take = Math.max(0, Math.min(need, p.weeks - min));
    p.weeks -= take;
    need -= take;
  }
  const taken = currentStart - latestStartWeek - need;
  next.find((x) => x.name === 'maintain')!.weeks += taken;
  return { alloc: next.filter((p) => p.weeks > 0), constrained: need > 0 };
}

export function buildTimeline(
  startDate: string,
  weddingDate: string,
  goals: Goal[],
  fittingDate?: string,
): Timeline {
  const startMonday = mondayOf(startDate);
  const W = weeksToWedding(startDate, weddingDate);
  const base = allocatePhases(W, goals);
  const { alloc, constrained } = applyFittingShift(base, W, startMonday, fittingDate, weddingDate);

  let week = 1;
  const phases: Phase[] = alloc.map((p) => {
    const startWeek = week;
    const endWeek = week + p.weeks - 1;
    week = endWeek + 1;
    const startDate = addDays(startMonday, (startWeek - 1) * 7);
    const lastSunday = addDays(startMonday, endWeek * 7 - 1);
    return {
      name: p.name,
      label: PHASE_LABEL[p.name],
      startWeek,
      endWeek,
      weeks: p.weeks,
      startDate,
      endDate: lastSunday > weddingDate ? weddingDate : lastSunday,
    };
  });

  // Recovery weeks (SPEC §6.1): every 6th week of the training block that follows
  // Foundation, only inside Strength / Shape / Build and only when W ≥ 12.
  const recoveryWeeks: number[] = [];
  if (W >= 12) {
    const foundationWeeks = phases.find((p) => p.name === 'foundation')?.weeks ?? 0;
    for (const p of phases) {
      if (p.name !== 'strength' && p.name !== 'shape' && p.name !== 'build') continue;
      for (let w = p.startWeek; w <= p.endWeek; w++) {
        const k = w - foundationWeeks;
        if (k > 0 && k % 6 === 0) recoveryWeeks.push(w);
      }
    }
  }

  const maintainPhase = phases.find((p) => p.name === 'maintain' || p.name === 'feelgood')!;
  return {
    startMonday,
    weddingDate,
    totalWeeks: W,
    phases,
    recoveryWeeks,
    taperStart: addDays(weddingDate, -9),
    maintainStartDate: maintainPhase.startDate,
    fittingConstrained: constrained,
  };
}

export function phaseForWeek(t: Timeline, week: number): Phase {
  const w = clamp(week, 1, t.totalWeeks);
  return t.phases.find((p) => w >= p.startWeek && w <= p.endWeek) ?? t.phases[t.phases.length - 1];
}

export function phaseForDate(t: Timeline, date: string): Phase {
  return phaseForWeek(t, weekOf(t.startMonday, date));
}
