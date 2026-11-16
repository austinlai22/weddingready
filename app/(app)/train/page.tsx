'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Closer } from '@/components/AppShell';
import { ExerciseCard } from '@/components/train/ExerciseCard';
import { PhaseSection } from '@/components/train/PhaseSection';
import { WeekStrip, type StripDay } from '@/components/train/WeekStrip';
import { CheckBox } from '@/components/ui/icons';
import { track } from '@/lib/analytics';
import { PHASE_COPY } from '@/lib/engine/copy';
import { daysBetween, fmtDayLong, fmtShort } from '@/lib/engine/dates';
import { dayPlan, weekDates, type ActivitySession, type DayPlan, type Plan, type StrengthSession } from '@/lib/engine/plan';
import { doneTargets, isDayDone, latestWeight, REST_ID, weekSessions } from '@/lib/progress';
import { useApp } from '@/lib/state/store';
import { usePlan, useToday, useUi, useViewDate } from '@/lib/ui';

const ACTIVITY_TAG = { walk: 'Walk', run: 'Run', pilates: 'Pilates', yoga: 'Yoga', cycling: 'Cycle', classes: 'Class', sports: 'Sport', other: '' } as const;

function stripTag(d: DayPlan): string {
  if (d.status === 'wedding') return 'Wedding';
  if (d.status === 'after') return '';
  const first = d.mainSessions[0];
  if (first?.kind === 'strength') return first.meta.tag;
  if (first?.kind === 'activity') return first.ref.type === 'other' ? first.title.split(' ')[0] : ACTIVITY_TAG[first.ref.type];
  return d.walk ? 'Walk' : 'Rest';
}

/** Keeps the screen on during a workout where the Wake Lock API exists. */
function useWakeLock(active: boolean) {
  const lock = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) void l.release();
        else lock.current = l;
      } catch {
        /* not allowed right now */
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock.current?.release().catch(() => undefined);
      lock.current = null;
    };
  }, [active]);
}

export default function TrainPage() {
  const plan = usePlan()!;
  const today = useToday();
  const date = useViewDate(plan, today);
  const overrides = useApp((s) => s.scheduleOverrides);
  const logs = useApp((s) => s.logs);
  const select = useUi((s) => s.select);

  const day = useMemo(() => dayPlan(plan, overrides, date), [plan, overrides, date]);
  const dates = weekDates(date);
  const strip: StripDay[] = dates.map((dt) => {
    const d = dayPlan(plan, overrides, dt);
    return { date: dt, tag: stripTag(d), done: isDayDone(d, logs), aria: d.title };
  });
  const week = weekSessions(plan, overrides, dates, logs);

  useEffect(() => {
    track('plan_viewed');
  }, []);

  const strength = day.sessions.filter((s): s is StrengthSession => s.kind === 'strength');
  const done = new Set(logs.sessionsDone[date] ?? []);
  const inWorkout = strength.some((s) => !done.has(s.ref.id) && s.exercises.some((e) => (logs.sets[date]?.[e.exercise.id] ?? 0) > 0));
  useWakeLock(inWorkout && date === today);

  const preStart = today < plan.profile.startDate;
  const daysLeft = Math.max(0, daysBetween(today, plan.timeline.weddingDate));
  const heading = (preStart ? 'Preview · ' : date === today ? 'Today · ' : '') + fmtDayLong(date);
  const dayDone = isDayDone(day, logs);
  const closer = PHASE_COPY[day.phase.name].closer;

  return (
    <>
      <section className="hero" aria-labelledby="day-title">
        <div className="hero-top">
          <p className="kicker">{heading}</p>
          <p className="countdown">
            <b>{daysLeft}</b> {daysLeft === 1 ? 'day' : 'days'} to {fmtShort(plan.timeline.weddingDate)}
          </p>
        </div>
        <h1 id="day-title">{day.title}</h1>
        <p className="pep">{day.pep}</p>
        <div className="chips">
          <span className="chip">
            Week {Math.min(Math.max(day.week, 1), plan.timeline.totalWeeks)} of {plan.timeline.totalWeeks} · {day.phase.label}
          </span>
          {week.total > 0 && (
            <span className="chip">
              {week.done} of {week.total} sessions this week
            </span>
          )}
        </div>
        {preStart && (
          <p className="hero-note">
            <strong>Day 1 is {fmtDayLong(plan.profile.startDate)}.</strong> This is your first week, ready to go.
          </p>
        )}
      </section>

      <WeekStrip days={strip} selected={date} today={today} onPick={select} />

      <div className="stack" style={{ paddingTop: 0 }}>
        {plan.notes.length > 0 && day.status !== 'after' && (
          <div className="banner">
            {plan.notes.map((n) => (
              <p key={n.kind}>{n.text}</p>
            ))}
          </div>
        )}
        {day.recovery && strength.length > 0 && !day.taper && (
          <div className="banner">
            <strong>Recovery week.</strong> 2 sets per exercise, same weights. Let your body catch up.
          </div>
        )}
        {day.taper && day.status === 'active' && (
          <div className="banner">
            <strong>Final 10 days.</strong> 2 sets per exercise. Keep your usual easy activities. Sleep and water first. Nothing new.
          </div>
        )}

        {day.mainSessions.map((s) =>
          s.kind === 'strength' ? (
            <StrengthBlock key={s.ref.id} plan={plan} date={date} s={s} isDone={done.has(s.ref.id)} />
          ) : (
            <ActivityBlock key={s.ref.id} date={date} s={s} isDone={done.has(s.ref.id)} />
          ),
        )}

        {day.mainSessions.length === 0 && day.status !== 'wedding' && day.status !== 'after' && (
          <SimpleDay date={date} day={day} />
        )}

        {dayDone && <DoneCard plan={plan} day={day} weekDone={week.done} weekTotal={week.total} daysLeft={daysLeft} />}

        {day.walk && day.mainSessions.length > 0 && <WalkCheck date={date} walk={day.walk} />}

        <PhaseSection plan={plan} currentWeek={day.week} />
        <Closer line={day.status === 'wedding' ? 'Enjoy every minute.' : closer} />
      </div>
    </>
  );
}

function StrengthBlock({ plan, date, s, isDone }: { plan: Plan; date: string; s: StrengthSession; isDone: boolean }) {
  const logs = useApp((st) => st.logs);
  const tapSet = useApp((st) => st.tapSet);
  const setWeight = useApp((st) => st.setWeight);
  const toggleWarmup = useApp((st) => st.toggleWarmup);
  const setSessionDone = useApp((st) => st.setSessionDone);
  const startRest = useUi((st) => st.startRest);
  const stopRest = useUi((st) => st.stopRest);
  const unit = plan.profile.units === 'metric' ? 'kg' : 'lb';
  const sets = logs.sets[date] ?? {};
  const total = s.exercises.reduce((t, e) => t + e.sets, 0);
  const doneSets = s.exercises.reduce((t, e) => t + Math.min(sets[e.exercise.id] ?? 0, e.sets), 0);
  const warm = !!logs.warmups[`${date}:${s.ref.id}`];
  const restText = s.restMin === 60 && s.restMax === 120 ? '60–120 sec' : `${s.restMin}–${s.restMax} sec`;

  return (
    <section className="stack-12" aria-label={s.meta.title}>
      <div className="row-between">
        <h2 className="h2">{s.meta.subtitle}</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          Rest <strong style={{ color: '#2A1F23' }}>{restText}</strong> · tap a set to start the timer
        </p>
      </div>
      <button type="button" className="check-card" aria-pressed={warm} onClick={() => toggleWarmup(date, s.ref.id)}>
        <CheckBox on={warm} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t">Warm-up · 5 min</span>
          <span className="s">{s.warmup}</span>
        </span>
      </button>
      {s.exercises.map((p) => (
        <ExerciseCard
          key={p.exercise.id}
          p={p}
          done={sets[p.exercise.id] ?? 0}
          unit={unit}
          lastWeight={latestWeight(logs.weights[p.exercise.id], date)}
          onTap={(i) => {
            const added = tapSet(date, p.exercise.id, i);
            if (added) {
              startRest(p.restMin, p.restMax);
              track('set_logged');
            }
          }}
          onWeight={(v) => setWeight(p.exercise.id, v, unit, date)}
        />
      ))}
      <p className="small muted">{s.weightTip}</p>
      {!isDone && (
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setSessionDone(date, s.ref.id, true);
            stopRest();
            track('session_finished', { type: 'strength' });
          }}
        >
          {doneSets >= total ? 'Finish workout' : `Finish workout (${doneSets} of ${total} sets)`}
        </button>
      )}
    </section>
  );
}

function ActivityBlock({ date, s, isDone }: { date: string; s: ActivitySession; isDone: boolean }) {
  const setSessionDone = useApp((st) => st.setSessionDone);
  return (
    <section className="card-lg" style={{ padding: 24 }} aria-label={s.title}>
      <h2 className="h2">{s.title}</h2>
      <p style={{ fontSize: 16, lineHeight: 1.55, color: '#4A3D42' }}>{s.how}</p>
      {!isDone && (
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setSessionDone(date, s.ref.id, true);
            track('session_finished', { type: s.ref.type });
          }}
        >
          Mark {s.title.toLowerCase()} done
        </button>
      )}
    </section>
  );
}

function SimpleDay({ date, day }: { date: string; day: DayPlan }) {
  const setSessionDone = useApp((st) => st.setSessionDone);
  const logs = useApp((st) => st.logs);
  const id = doneTargets(day)[0];
  const isDone = (logs.sessionsDone[date] ?? []).includes(id);
  return (
    <section className="card-lg" style={{ padding: 24 }}>
      <h2 className="h2">{day.subtitle}</h2>
      <p style={{ fontSize: 16, lineHeight: 1.55, color: '#4A3D42' }}>{day.how}</p>
      {!isDone && (
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setSessionDone(date, id, true);
            track('session_finished', { type: id === REST_ID ? 'rest' : 'walk' });
          }}
        >
          {id === REST_ID ? 'Mark rest day done' : 'Mark walk done'}
        </button>
      )}
    </section>
  );
}

function DoneCard({ plan, day, weekDone, weekTotal, daysLeft }: { plan: Plan; day: DayPlan; weekDone: number; weekTotal: number; daysLeft: number }) {
  const setSessionDone = useApp((st) => st.setSessionDone);
  const name = plan.profile.name?.trim();
  return (
    <div className="done-card" role="status">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p className="title">Done. Nice work{name ? `, ${name}` : ''}.</p>
        <p className="sub">
          {weekTotal > 0 ? `${weekDone} of ${weekTotal} sessions this week. ` : ''}
          {daysLeft} {daysLeft === 1 ? 'day' : 'days'} to go.
        </p>
      </div>
      <button type="button" onClick={() => doneTargets(day).forEach((id) => setSessionDone(day.date, id, false))}>
        Undo
      </button>
    </div>
  );
}

function WalkCheck({ date, walk }: { date: string; walk: ActivitySession }) {
  const logs = useApp((st) => st.logs);
  const setSessionDone = useApp((st) => st.setSessionDone);
  const on = (logs.sessionsDone[date] ?? []).includes(walk.ref.id);
  return (
    <button type="button" className="check-card" style={{ borderRadius: 18 }} aria-pressed={on} onClick={() => setSessionDone(date, walk.ref.id, !on)}>
      <CheckBox on={on} size={26} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="t" style={{ fontSize: 15 }}>{walk.title}</span>
        <span className="s" style={{ fontSize: 13 }}>{walk.how}</span>
      </span>
    </button>
  );
}
