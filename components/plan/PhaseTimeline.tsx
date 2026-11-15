import { daysBetween, fmtShort } from '@/lib/engine/dates';
import type { Plan } from '@/lib/engine/plan';
import type { PhaseName } from '@/lib/engine/phases';

const BAND: Record<PhaseName, { fill: string; ink: string }> = {
  foundation: { fill: '#F6E4EA', ink: '#7E2A49' },
  strength: { fill: '#E3CCD4', ink: '#4A2A3B' },
  shape: { fill: '#C9A9B5', ink: '#2A1F23' },
  build: { fill: '#C9A9B5', ink: '#2A1F23' },
  maintain: { fill: '#E4C79A', ink: '#3B1F2E' },
  feelgood: { fill: '#E4C79A', ink: '#3B1F2E' },
};

/** Horizontal phase bar with today, fitting and wedding markers (SPEC §9). Labels are HTML so they stay legible at any width. */
export function PhaseTimeline({ plan, today }: { plan: Plan; today: string }) {
  const t = plan.timeline;
  const totalDays = Math.max(1, daysBetween(t.startMonday, t.weddingDate) + 1);
  const pct = (date: string) => Math.min(100, Math.max(0, (daysBetween(t.startMonday, date) / totalDays) * 100));
  const fitting = plan.profile.fittingDate;
  const showFitting = !!fitting && fitting >= t.startMonday && fitting <= t.weddingDate;
  const showToday = today >= t.startMonday && today <= t.weddingDate;
  const summary = t.phases.map((p) => `${p.label} ${fmtShort(p.startDate)} to ${fmtShort(p.endDate)}`).join('; ');
  // Keep edge labels inside the bar.
  const place = (x: number) => ({ left: `${Math.min(94, Math.max(6, x))}%` });
  return (
    <figure style={{ margin: 0 }} className="stack-8">
      <div className="tl-labels" aria-hidden="true">
        {showToday && <span style={{ ...place(pct(today)), color: '#3B1F2E' }}>Today</span>}
      </div>
      <svg className="timeline" viewBox="0 0 1000 60" preserveAspectRatio="none" role="img" aria-label={`Phase timeline: ${summary}. Wedding ${fmtShort(t.weddingDate)}.`} style={{ height: 44 }}>
        {t.phases.map((p, i) => {
          const x0 = pct(p.startDate) * 10;
          const x1 = i === t.phases.length - 1 ? 1000 : pct(t.phases[i + 1].startDate) * 10;
          return <rect key={p.name} x={x0} y={8} width={Math.max(0, x1 - x0 - 3)} height={44} rx={10} fill={BAND[p.name].fill} />;
        })}
        {showToday && <rect x={pct(today) * 10 - 2} y={0} width={4} height={60} fill="#3B1F2E" />}
        {showFitting && <rect x={pct(fitting!) * 10 - 2} y={0} width={4} height={60} fill="#A63D63" />}
        <rect x={994} y={0} width={6} height={60} fill="#A63D63" />
      </svg>
      <div className="tl-labels" aria-hidden="true">
        {showFitting && <span style={{ ...place(pct(fitting!)), color: '#A63D63' }}>Fitting</span>}
        <span style={{ left: 'auto', right: 0, transform: 'none', color: '#3B1F2E' }}>Wedding</span>
      </div>
      <figcaption className="legend">
        {t.phases.map((p) => (
          <span key={p.name}>
            <i style={{ background: BAND[p.name].fill }} />
            {p.label} · {fmtShort(p.startDate)}–{fmtShort(p.endDate)} ({p.weeks} {p.weeks === 1 ? 'week' : 'weeks'})
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
