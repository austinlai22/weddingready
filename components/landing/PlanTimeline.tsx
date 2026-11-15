import { fmtShort } from '@/lib/engine/dates';
import { PHASE_COPY } from '@/lib/engine/copy';
import { examplePlan, PHASE_FILL } from '@/lib/example';

/** The example plan's phases as a bar, with what each phase does underneath. */
export function PlanTimeline({ detail = true }: { detail?: boolean }) {
  const t = examplePlan.timeline;
  const fitting = examplePlan.profile.fittingDate!;
  return (
    <figure className="m-0">
      <div className="flex h-12 overflow-hidden rounded-md" role="img" aria-label={t.phases.map((p) => `${p.label}, ${p.weeks} weeks`).join('; ')}>
        {t.phases.map((p) => (
          <div key={p.name} style={{ width: `${(p.weeks / t.totalWeeks) * 100}%`, background: PHASE_FILL[p.name] }} className="border-r-2 border-ground last:border-r-0" />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[13px] text-muted">
        <span>{fmtShort(t.startMonday)}</span>
        <span>
          Fitting <span className="text-ink">{fmtShort(fitting)}</span>
        </span>
        <span>
          Wedding <span className="text-ink">{fmtShort(t.weddingDate)}</span>
        </span>
      </div>
      {detail && (
        <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.phases.map((p) => (
            <div key={p.name} className="border-t border-line pt-4">
              <dt className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ background: PHASE_FILL[p.name] }} />
                {p.label}
              </dt>
              <dd className="m-0 mt-1 text-sm text-muted">
                {p.weeks} weeks · {fmtShort(p.startDate)} to {fmtShort(p.endDate)}
              </dd>
              <dd className="m-0 mt-2 text-[15px] leading-relaxed text-ink-2">{PHASE_COPY[p.name].focus}</dd>
            </div>
          ))}
        </dl>
      )}
    </figure>
  );
}
