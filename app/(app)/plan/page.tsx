'use client';

import { Closer } from '@/components/AppShell';
import { PhaseTimeline } from '@/components/plan/PhaseTimeline';
import { ScheduleEditor } from '@/components/plan/ScheduleEditor';
import { PhaseSection } from '@/components/train/PhaseSection';
import { daysBetween, fmtLong, fmtShort } from '@/lib/engine/dates';
import { weekOf } from '@/lib/engine/phases';
import { targetsFor } from '@/lib/engine/plan';
import { ED_HELPLINE } from '@/lib/engine/guardrails';
import { usePlan, useToday } from '@/lib/ui';
import { ExpectationLine } from '@/components/setup/ExpectationLine';

export default function PlanPage() {
  const plan = usePlan()!;
  const today = useToday();
  const t = plan.timeline;
  const week = weekOf(t.startMonday, today < plan.profile.startDate ? plan.profile.startDate : today);
  const targets = targetsFor(plan, today < plan.profile.startDate ? plan.profile.startDate : today);
  const p = plan.profile;
  // Weeks left including this one; the whole plan before it starts.
  const weeksLeft = Math.max(1, t.totalWeeks - week + 1);
  return (
    <>
      <section className="hero" aria-labelledby="plan-title">
        <p className="kicker">Your plan</p>
        <h1 id="plan-title" style={{ fontSize: 40 }}>{weeksLeft} {weeksLeft === 1 ? 'week' : 'weeks'} to {fmtShort(t.weddingDate)}</h1>
        <p className="pep">
          {fmtLong(t.weddingDate)} · {Math.max(0, daysBetween(today, t.weddingDate))} days to go · week {Math.min(week, t.totalWeeks)} of {t.totalWeeks}
          {p.fittingDate ? ` · fitting ${fmtShort(p.fittingDate)}` : ''}
        </p>
        <div className="chips">
          {p.nutritionMode !== 'portions_only' && <span className="chip">Protein {targets.protein[0]}–{targets.protein[1]} g a day</span>}
          {p.nutritionMode === 'habits_numbers' && <span className="chip">~{targets.kcalRange[0].toLocaleString('en-US')}–{targets.kcalRange[1].toLocaleString('en-US')} kcal</span>}
          <span className="chip">{p.strengthDays} strength days a week</span>
        </div>
      </section>

      <PhaseTimeline plan={plan} today={today} />
      {t.fittingConstrained && (
        <div className="banner">
          <strong>About your fitting.</strong> It’s soon enough that Maintain can’t start a full 2 weeks before it without cutting the early phases too short, so it starts as early as it can.
        </div>
      )}
      {plan.shortTimeline && (
        <div className="banner">
          <strong>Feel-good plan.</strong> With under 4 weeks to go, the plan keeps your training steady and skips any calorie deficit. Sleep, water and feeling good matter most now.
        </div>
      )}
      <ExpectationLine plan={plan} />
      {plan.notes.length > 0 && (
        <div className="banner">
          {plan.notes.map((n) => (
            <p key={n.kind}>{n.text}</p>
          ))}
          {p.safety.edHistory && (
            <p>
              <a href={ED_HELPLINE.url} target="_blank" rel="noreferrer">{ED_HELPLINE.name}</a> helpline: <a href={ED_HELPLINE.tel}>{ED_HELPLINE.phone}</a>
            </p>
          )}
        </div>
      )}

      <PhaseSection plan={plan} currentWeek={week} heading="Phases" />
      <ScheduleEditor plan={plan} today={today} />
      <Closer line="Consistent, not perfect." />
    </>
  );
}
