import { describe, expect, it } from 'vitest';
import { calendarEvents, toICS } from './calendar';
import { PROTOTYPE_USER } from './engine/fixtures';
import { buildPlan, dayPlan } from './engine/plan';
import { applyOps, engineTemplate, templateForDate, thisWeekOnly } from './engine/schedule';
import { alternativesFor } from './engine/workouts';
import { codeFromHash, decodePlan, encodePlan, handoffFromProfile, setupLink } from './handoff';

describe('plan codes', () => {
  it('round-trip the training details, and only those', () => {
    const p = { ...PROTOTYPE_USER, fittingDate: '2027-09-04', activities: [...PROTOTYPE_USER.activities, { id: 'x', type: 'classes' as const, label: 'Barre café', days: [2] }] };
    const code = encodePlan(handoffFromProfile(p));
    expect(code).toMatch(/^wr1\.[A-Za-z0-9_-]+$/);
    const back = decodePlan(code)!;
    expect(back.weddingDate).toBe(p.weddingDate);
    expect(back.fittingDate).toBe('2027-09-04');
    expect(back.startDate).toBe(p.startDate);
    expect(back.strengthDays).toBe(p.strengthDays);
    expect(back.activities.map((a) => [a.type, a.label, a.days])).toEqual(p.activities.map((a) => [a.type, a.label, [...a.days].sort()]));
    // Nothing about the body or health goes in a code.
    const json = JSON.stringify(back);
    for (const k of ['weightKg', 'heightCm', 'age', 'safety', 'sex']) expect(json).not.toContain(k);
  });

  it('reject damaged codes and read them from a link', () => {
    expect(decodePlan('wr1.not-base64!')).toBeNull();
    expect(decodePlan('hello')).toBeNull();
    const code = encodePlan(handoffFromProfile(PROTOTYPE_USER));
    expect(codeFromHash(new URL(setupLink(code)).hash)).toBe(code);
  });
});

describe('agent actions in the engine', () => {
  it('swaps an exercise in every workout that has it', () => {
    const alt = alternativesFor('reverse-lunge', 'home_db');
    expect(alt.some((a) => !a.same && a.exercise.pattern === 'bridge')).toBe(true);
    const swapped = buildPlan({ ...PROTOTYPE_USER, exerciseSwaps: { 'reverse-lunge': 'db-glute-bridge' } });
    const thursday = dayPlan(swapped, null, '2026-11-19');
    const names = thursday.sessions.flatMap((s) => (s.kind === 'strength' ? s.exercises.map((e) => e.exercise.id) : []));
    expect(names).toContain('db-glute-bridge');
    expect(names).not.toContain('reverse-lunge');
  });

  it('uses different equipment only for the dates given', () => {
    const plan = buildPlan({ ...PROTOTYPE_USER, equipmentOverrides: [{ from: '2026-11-23', to: '2026-11-29', equipment: 'gym' }] });
    const ids = (date: string) => dayPlan(plan, null, date).sessions.flatMap((s) => (s.kind === 'strength' ? s.exercises.map((e) => e.exercise.equipment) : []));
    expect(ids('2026-11-23')).toContain('gym');
    expect(ids('2026-11-16')).not.toContain('gym');
    expect(ids('2026-11-30')).not.toContain('gym');
  });

  it('applies a "this week only" change until Sunday, then the usual week returns', () => {
    const moved = applyOps(engineTemplate(PROTOTYPE_USER), [{ op: 'move', sessionId: 'str-2', toDay: 'sat' }]);
    // Wednesday of week 1: Thursday's Strength B moves to Saturday, this week only.
    const sched = thisWeekOnly(PROTOTYPE_USER, { overrides: null, history: [] }, moved, '2026-11-18');
    const strengthOn = (date: string, day: number) => templateForDate(PROTOTYPE_USER, sched, date).days[day].some((s) => s.kind === 'strength');
    expect(strengthOn('2026-11-16', 0)).toBe(true); // Monday unchanged
    expect(strengthOn('2026-11-21', 5)).toBe(true); // this Saturday has it
    expect(strengthOn('2026-11-19', 3)).toBe(false); // this Thursday doesn't
    expect(strengthOn('2026-11-26', 3)).toBe(true); // next Thursday is back
    expect(strengthOn('2026-11-28', 5)).toBe(false);
  });
});

describe('calendar', () => {
  it('lists the strength sessions with times and writes a valid .ics', () => {
    const plan = buildPlan(PROTOTYPE_USER);
    const events = calendarEvents(plan, null, { from: '2026-11-16', weeks: 2, time: '18:30' });
    expect(events.map((e) => e.date)).toEqual(['2026-11-16', '2026-11-19', '2026-11-23', '2026-11-26']);
    expect(events[0]).toMatchObject({ start: '18:30', title: 'Strength A: Legs & push' });
    const ics = toICS(events, new Date('2026-11-16T12:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(ics).toContain('DTSTART:20261116T183000');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('can include the person’s other activities, never walks', () => {
    const plan = buildPlan(PROTOTYPE_USER);
    const events = calendarEvents(plan, null, { from: '2026-11-16', weeks: 1, includeActivities: true });
    expect(events.map((e) => e.title)).toEqual(['Strength A: Legs & push', 'Easy run', 'Strength B: Glutes & pull', 'Pilates']);
  });
});
