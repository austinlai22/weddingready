import type { Equipment, FocusArea, SessionRef, WeekTemplate } from '../types';
import { DAY_IDS } from '../types';
import { cloneTemplate, validateTemplate, type ScheduleOp } from './schedule';
import { scoreWeek } from './split';

// The best week when some days are off-limits: every arrangement of the
// movable strength sessions is tried and scored with the same training rules
// as everything else, preferring the fewest changes. No AI involved: the coach
// asks the person which days they can't train, then calls this, so it can't
// invent a move that breaks a rule.

export interface ReplanInput {
  /** The week as it stands from `fromDay` on. */
  template: WeekTemplate;
  /** 0 = Monday. this_week: days before it are past; from_now_on: 0. */
  fromDay: number;
  scope: 'this_week' | 'from_now_on';
  /** Days (0–6) the person can't train. */
  unavailable: number[];
  /** Session ids already done this week; they stay put. */
  done: string[];
  /** Days the person said suit them; used when they keep the rules. */
  preferred?: number[];
  equipment: Equipment;
  focusAreas: FocusArea[];
}

export interface ReplanResult {
  ops: ScheduleOp[];
  after: WeekTemplate;
  moved: { id: string; from: number; to: number }[];
  /** Sessions skipped this week because no arrangement kept the rules. */
  skipped: string[];
  problems: string[];
  changed: boolean;
}

function combinations(pool: number[], k: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) return void out.push([...acc]);
    for (let i = start; i < pool.length; i++) {
      acc.push(pool[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

const MOVE_COST = 4;

export function replanWeek(input: ReplanInput): ReplanResult {
  const t = cloneTemplate(input.template);
  const blocked = new Set(input.unavailable);
  const done = new Set(input.done);
  const preferred = new Set(input.preferred ?? []);
  const first = input.scope === 'this_week' ? input.fromDay : 0;

  // Strength sessions that may move, in their current order (keeps A → B → C).
  const movable: { s: SessionRef; day: number }[] = [];
  t.days.forEach((d, day) => {
    for (const s of d) if (s.kind === 'strength' && day >= first && !done.has(s.id)) movable.push({ s, day });
  });
  const base = cloneTemplate(t);
  base.days = base.days.map((d) => d.filter((s) => !movable.some((m) => m.s.id === s.id)));
  const fixedStrength = new Set(base.days.flatMap((d, day) => (d.some((s) => s.kind === 'strength') ? [day] : [])));
  const pool = [0, 1, 2, 3, 4, 5, 6].filter((d) => d >= first && !blocked.has(d) && !fixedStrength.has(d));

  const evaluate = (keep: typeof movable, days: number[]) => {
    const next = cloneTemplate(base);
    keep.forEach((m, i) => next.days[days[i]].push({ ...m.s }));
    const moves = keep.filter((m, i) => m.day !== days[i]).length;
    // A moved session landing on a day they didn't say suits them costs a little more.
    const off = preferred.size ? keep.filter((m, i) => m.day !== days[i] && !preferred.has(days[i])).length : 0;
    return { next, days, score: scoreWeek(next, input.equipment, input.focusAreas) + moves * MOVE_COST + off * MOVE_COST };
  };

  const search = (keep: typeof movable) => {
    let best: ReturnType<typeof evaluate> | null = null;
    for (const days of combinations(pool, keep.length)) {
      const r = evaluate(keep, days);
      if (!best || r.score < best.score) best = r;
    }
    return best;
  };

  const rulesBroken = (w: WeekTemplate) => validateTemplate(w, input.equipment, input.focusAreas).filter((x) => x.severity === 'rule');

  let keep = movable;
  let best = search(keep);
  // If every arrangement breaks a rule (or there aren't enough days), skipping
  // one session this week beats training through a rule. Never for lasting changes.
  if (input.scope === 'this_week' && movable.length > 0 && (!best || rulesBroken(best.next).length > 0)) {
    let bestDrop: { keep: typeof movable; r: NonNullable<ReturnType<typeof search>> } | null = null;
    for (let i = movable.length - 1; i >= 0; i--) {
      const k = movable.filter((_, j) => j !== i);
      const r = search(k);
      if (r && rulesBroken(r.next).length === 0 && (!bestDrop || r.score < bestDrop.r.score)) bestDrop = { keep: k, r };
    }
    if (bestDrop) {
      keep = bestDrop.keep;
      best = bestDrop.r;
    }
  }
  if (!best) {
    return { ops: [], after: t, moved: [], skipped: [], problems: ['There aren’t enough days left this week for these sessions.'], changed: false };
  }

  const ops: ScheduleOp[] = [];
  const moved: ReplanResult['moved'] = [];
  const skipped = movable.filter((m) => !keep.includes(m)).map((m) => m.s.id);
  for (const id of skipped) ops.push({ op: 'remove', sessionId: id });
  keep.forEach((m, i) => {
    if (m.day !== best!.days[i]) {
      ops.push({ op: 'move', sessionId: m.s.id, toDay: DAY_IDS[best!.days[i]] });
      moved.push({ id: m.s.id, from: m.day, to: best!.days[i] });
    }
  });
  return { ops, after: best.next, moved, skipped, problems: rulesBroken(best.next).map((w) => w.text), changed: ops.length > 0 };
}
