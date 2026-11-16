'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { DAY_ABBR, DAY_NAMES, DAY_SHORT } from '@/lib/engine/dates';
import type { Plan } from '@/lib/engine/plan';
import { applyOps, duplicateSession, OpError, templateForDate, validateTemplate, type Schedule, type ScheduleOp } from '@/lib/engine/schedule';
import { workoutMeta } from '@/lib/engine/workouts';
import { useApp } from '@/lib/state/store';
import { DAY_IDS, type SessionRef, type WeekTemplate } from '@/lib/types';
import { useSchedule } from '@/lib/ui';
import { Grip } from '../ui/icons';
import { WeekAdvice } from './WeekAdvice';
import { applyMoves, suggestWeekFix } from '@/lib/engine/suggest';
import { useUi } from '@/lib/ui';

export function chipLabel(s: SessionRef, strengthDays: number): string {
  return s.kind === 'strength' ? workoutMeta(s.workout, strengthDays).tag : s.label;
}

function chipClass(s: SessionRef): string {
  if (s.kind === 'strength') return 'sched-chip strength';
  return s.type === 'walk' ? 'sched-chip walk' : 'sched-chip';
}

function Chip({ s, strengthDays, onOpen, dragging }: { s: SessionRef; strengthDays: number; onOpen: () => void; dragging: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: s.id });
  const label = chipLabel(s, strengthDays);
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${chipClass(s)}${dragging ? ' dragging' : ''}`}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable session"
      aria-label={`${label}. Press Enter for options, or Space to pick up and arrow keys to move.`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen();
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <Grip size={10} />
        {label}
      </span>
    </button>
  );
}

function Column({ day, children }: { day: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day}` });
  return (
    <div ref={setNodeRef} className={`sched-col${isOver ? ' over' : ''}`} aria-label={DAY_NAMES[day]}>
      <div className="hd">{DAY_SHORT[day]}</div>
      {children}
    </div>
  );
}

function locateDay(t: WeekTemplate, id: string): number {
  return t.days.findIndex((d) => d.some((s) => s.id === id));
}

export function ScheduleEditor({ plan, today }: { plan: Plan; today: string }) {
  const schedule = useSchedule();
  const overrides = schedule.overrides;
  const editSchedule = useApp((s) => s.editSchedule);
  const restoreSchedule = useApp((s) => s.restoreSchedule);
  const p = plan.profile;
  // Changes apply from today (or Day 1 before the plan starts); earlier days keep their layout.
  const from = today < p.startDate ? p.startDate : today;
  const template = templateForDate(p, schedule, from);
  const [history, setHistory] = useState<Schedule[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [adviceDismissed, setAdviceDismissed] = useState(false);
  const patchProfile = useApp((s) => s.patchProfile);
  const showToast = useUi((s) => s.showToast);
  const justDragged = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const commit = (next: WeekTemplate, method: 'drag' | 'ai' | 'menu') => {
    setHistory((h) => [...h.slice(-19), schedule]);
    editSchedule(next, from);
    track('schedule_edited', { method: method === 'ai' ? 'ai' : 'drag' });
  };

  const run = (ops: ScheduleOp[], method: 'drag' | 'menu') => {
    try {
      commit(applyOps(template, ops, p), method);
      setErr('');
    } catch (e) {
      setErr(e instanceof OpError ? 'That session isn’t there anymore.' : 'Couldn’t make that change.');
    }
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    restoreSchedule(prev);
  };

  const onDragStart = (e: DragStartEvent) => {
    setActive(String(e.active.id));
    setMenuFor(null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 50);
    if (!e.over) return;
    const to = Number(String(e.over.id).replace('day-', ''));
    const from = locateDay(template, String(e.active.id));
    if (from === to || to < 0 || to > 6) return;
    run([{ op: 'move', sessionId: String(e.active.id), toDay: DAY_IDS[to] }], 'drag');
  };

  const warnings = validateTemplate(template, p.equipment, p.focusAreas);
  const rules = warnings.filter((w) => w.severity === 'rule');
  const tips = warnings.filter((w) => w.severity === 'note');
  // Offer a fix only for the suggested week; once someone edits it, the warnings speak for themselves.
  const suggestion = !overrides && !adviceDismissed && rules.length ? suggestWeekFix(p) : null;
  const applySuggestion = () => {
    if (!suggestion) return;
    const before = { activities: p.activities, strengthDays: p.strengthDays };
    if (suggestion.kind === 'moves') patchProfile({ activities: applyMoves(p.activities, suggestion.moves) });
    else if (suggestion.kind === 'days') patchProfile({ strengthDays: suggestion.strengthDays });
    track('settings_changed', { field: suggestion.kind === 'moves' ? 'activities_suggested' : 'strength_days_suggested' });
    showToast('Your week is updated.', () => patchProfile(before));
  };
  const all = template.days.flatMap((d, i) => d.map((s) => ({ s, day: i })));
  const activeSession = active ? all.find((x) => x.s.id === active)?.s : null;
  const menuSession = menuFor ? all.find((x) => x.s.id === menuFor) : null;
  const edited = !!overrides;

  return (
    <section className="stack-12" aria-labelledby="sched-heading">
      <div className="row-between">
        <h2 id="sched-heading" className="h2-sm">Your week</h2>
        {edited && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setHistory((h) => [...h.slice(-19), schedule]);
              editSchedule(null, from);
            }}
          >
            Reset to suggested
          </button>
        )}
      </div>
      <p className="small muted">Drag a session to another day, or tap it for options. Changes apply from today on; earlier days stay as they were.</p>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="sched">
          {template.days.map((sessions, d) => (
            <Column key={d} day={d}>
              {sessions.map((s) => (
                <Chip
                  key={s.id}
                  s={s}
                  strengthDays={p.strengthDays}
                  dragging={active === s.id}
                  onOpen={() => {
                    if (!justDragged.current) setMenuFor((cur) => (cur === s.id ? null : s.id));
                  }}
                />
              ))}
            </Column>
          ))}
        </div>
        <DragOverlay>{activeSession ? <div className={`${chipClass(activeSession)} overlay`}>{chipLabel(activeSession, p.strengthDays)}</div> : null}</DragOverlay>
      </DndContext>
      <div className="legend">
        <span><i style={{ background: '#3B1F2E' }} />Strength</span>
        <span><i style={{ background: '#FBF6F3', border: '1px solid #E3CCD4' }} />Your activities</span>
        <span><i style={{ background: 'transparent', border: '1px dashed #C9A9B5' }} />Walks</span>
      </div>

      {menuSession && (
        <SessionMenu
          key={menuSession.s.id}
          s={menuSession.s}
          day={menuSession.day}
          template={template}
          strengthDays={p.strengthDays}
          onClose={() => setMenuFor(null)}
          onOps={(ops) => {
            run(ops, 'menu');
            setMenuFor(null);
          }}
          onDuplicate={(toDay) => {
            commit(duplicateSession(template, menuSession.s.id, toDay), 'menu');
            setMenuFor(null);
          }}
        />
      )}

      {suggestion && <WeekAdvice suggestion={suggestion} onApply={suggestion.kind === 'lighter' ? undefined : applySuggestion} onDismiss={() => setAdviceDismissed(true)} />}

      {(warnings.length > 0 || history.length > 0 || err) && (
        <div className="banner" role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {err && <p className="err">{err}</p>}
          {rules.map((w) => (
            <p key={w.text}>
              <strong>Heads up.</strong> {w.text}
            </p>
          ))}
          {tips.map((w) => (
            <p key={w.text}>
              <strong>Tip.</strong> {w.text}
            </p>
          ))}
          {history.length > 0 && (
            <div>
              <button type="button" className="btn-ghost" onClick={undo}>Undo last change</button>
            </div>
          )}
        </div>
      )}

    </section>
  );
}

function SessionMenu({
  s,
  day,
  template,
  strengthDays,
  onClose,
  onOps,
  onDuplicate,
}: {
  s: SessionRef;
  day: number;
  template: WeekTemplate;
  strengthDays: number;
  onClose: () => void;
  onOps: (ops: ScheduleOp[]) => void;
  onDuplicate: (day: number) => void;
}) {
  const [moveTo, setMoveTo] = useState(String(day));
  const others = template.days.flatMap((d, i) => d.filter((x) => x.id !== s.id).map((x) => ({ x, i })));
  const [swapWith, setSwapWith] = useState(others[0]?.x.id ?? '');
  const [dupTo, setDupTo] = useState(String((day + 1) % 7));
  return (
    <div className="menu" role="dialog" aria-label={`Options for ${chipLabel(s, strengthDays)} on ${DAY_NAMES[day]}`}>
      <div className="row-between">
        <strong>{chipLabel(s, strengthDays)} · {DAY_NAMES[day]}</strong>
        <button type="button" className="btn-text" onClick={onClose}>Close</button>
      </div>
      <div className="row">
        <label className="field" style={{ flex: '1 1 140px' }}>
          <span>Move to</span>
          <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            {DAY_NAMES.map((n, i) => (
              <option key={n} value={i}>{n}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" style={{ alignSelf: 'flex-end' }} disabled={Number(moveTo) === day} onClick={() => onOps([{ op: 'move', sessionId: s.id, toDay: DAY_IDS[Number(moveTo)] }])}>
          Move
        </button>
      </div>
      {others.length > 0 && (
        <div className="row">
          <label className="field" style={{ flex: '1 1 140px' }}>
            <span>Swap with</span>
            <select className="input" value={swapWith} onChange={(e) => setSwapWith(e.target.value)}>
              {others.map(({ x, i }) => (
                <option key={x.id} value={x.id}>
                  {chipLabel(x, strengthDays)} ({DAY_ABBR[i]})
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-dark" style={{ alignSelf: 'flex-end' }} onClick={() => onOps([{ op: 'swap', a: s.id, b: swapWith }])}>
            Swap
          </button>
        </div>
      )}
      {s.kind === 'activity' && (
        <div className="row">
          <label className="field" style={{ flex: '1 1 140px' }}>
            <span>Duplicate to</span>
            <select className="input" value={dupTo} onChange={(e) => setDupTo(e.target.value)}>
              {DAY_NAMES.map((n, i) => (
                <option key={n} value={i}>{n}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-dark" style={{ alignSelf: 'flex-end' }} onClick={() => onDuplicate(Number(dupTo))}>
            Duplicate
          </button>
        </div>
      )}
      <div>
        <button type="button" className="btn-ghost" onClick={() => onOps([{ op: 'remove', sessionId: s.id }])}>
          Remove from the week
        </button>
      </div>
    </div>
  );
}

export function WeekList({ t, strengthDays }: { t: WeekTemplate; strengthDays: number }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {t.days.map((d, i) => (
        <li key={i} className="tiny">
          <strong>{DAY_ABBR[i]}</strong> {d.length ? d.map((s) => chipLabel(s, strengthDays)).join(', ') : 'Rest'}
        </li>
      ))}
    </ul>
  );
}
