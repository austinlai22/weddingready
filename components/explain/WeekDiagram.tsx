import { DAY_ABBR, DAY_NAMES } from '@/lib/engine/dates';
import type { Chip } from '@/lib/explain';

const CHIP: Record<Chip['kind'], string> = {
  strength: 'bg-plum text-ground',
  hard: 'bg-rose-tint text-rose-dark',
  easy: 'bg-chip text-ink-2',
};

/** A Monday-to-Sunday week as the app would lay it out. */
export function WeekDiagram({ days }: { days: Chip[][] }) {
  const summary = days.map((d, i) => `${DAY_NAMES[i]}: ${d.length ? d.map((c) => c.label).join(', ') : 'rest'}`).join('; ');
  return (
    <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5" role="img" aria-label={summary}>
      {days.map((chips, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-1">
          <span className="pb-0.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">{DAY_ABBR[i]}</span>
          <div className="flex min-h-[64px] flex-col gap-1 rounded-lg bg-ground p-0.5 sm:p-1">
            {chips.length === 0 ? (
              <span className="m-auto text-[11px] text-muted">Rest</span>
            ) : (
              chips.map((c, j) => (
                <span
                  key={j}
                  className={`overflow-hidden whitespace-nowrap rounded-md py-1.5 text-center text-[11px] font-semibold leading-none sm:px-1 sm:text-[12px] ${CHIP[c.kind]}`}
                >
                  {c.label}
                </span>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
