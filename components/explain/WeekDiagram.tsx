import { DAY_ABBR, DAY_NAMES } from '@/lib/engine/dates';
import type { Chip, ExampleWeek } from '@/lib/explain';

const CHIP: Record<Chip['kind'], string> = {
  strength: 'bg-plum text-ground',
  hard: 'bg-rose-tint text-rose-dark',
  easy: 'bg-chip text-ink-2',
};

function chipText(c: Chip) {
  return c.kind === 'strength' ? `Lift ${c.label}` : c.label;
}

/** A Monday-to-Sunday week as the app would lay it out. */
export function WeekDiagram({ week, title, tone = 'plain' }: { week: ExampleWeek; title: string; tone?: 'plain' | 'warn' }) {
  const summary = week.days
    .map((d, i) => `${DAY_NAMES[i]}: ${d.length ? d.map(chipText).join(', ') : 'rest'}`)
    .join('; ');
  return (
    <figure className={`m-0 rounded-2xl border bg-surface p-3 sm:p-5 ${tone === 'warn' ? 'border-rose/40' : 'border-line'}`}>
      <figcaption className="mb-3 text-[15px] font-semibold text-ink">{title}</figcaption>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5" role="img" aria-label={summary}>
        {week.days.map((chips, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-1">
            <span className="pb-0.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">{DAY_ABBR[i]}</span>
            <div className="flex min-h-[76px] flex-col gap-1 rounded-lg bg-ground p-0.5 sm:p-1">
              {chips.length === 0 ? (
                <span className="m-auto text-[11px] text-muted">Rest</span>
              ) : (
                chips.map((c, j) => (
                  <span key={j} className={`overflow-hidden whitespace-nowrap rounded-md px-0 py-1.5 text-center text-[10px] font-semibold leading-none tracking-tight sm:px-1 sm:text-[12px] sm:tracking-normal ${CHIP[c.kind]}`}>
                    {chipText(c)}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
      {week.sessions.length > 0 && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          {week.sessions.map((s, i) => (
            <span key={s.key}>
              {i > 0 && ' · '}
              <span className="font-semibold text-ink-2">Lift {s.key}</span> {s.subtitle.toLowerCase()}
            </span>
          ))}
        </p>
      )}
      {tone === 'warn' && week.problems.length > 0 && (
        <ul className="mt-3 list-none space-y-1 p-0 text-[13px] leading-relaxed text-rose-dark">
          {week.problems.map((p) => (
            <li key={p} className="flex gap-2">
              <span aria-hidden="true">!</span>
              {p}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

export function WeekLegend() {
  const items: [string, string][] = [
    [CHIP.strength, 'Strength session'],
    [CHIP.hard, 'Hard: runs, rides, classes, sports'],
    [CHIP.easy, 'Easy: yoga, Pilates'],
  ];
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[13px] text-ink-2">
      {items.map(([cls, label]) => (
        <li key={label} className="flex items-center gap-2">
          <span aria-hidden="true" className={`inline-block h-3.5 w-5 rounded ${cls}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}
