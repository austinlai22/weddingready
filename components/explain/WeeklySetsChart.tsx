'use client';

import { useState } from 'react';
import { fmtShort } from '@/lib/engine/dates';
import type { WeekVolume } from '@/lib/explain';

const PHASE_BAND: Record<string, { fill: string; ink: string }> = {
  foundation: { fill: '#F6E4EA', ink: '#7E2A49' },
  strength: { fill: '#E3CCD4', ink: '#4A2A3B' },
  shape: { fill: '#C9A9B5', ink: '#2A1F23' },
  build: { fill: '#C9A9B5', ink: '#2A1F23' },
  maintain: { fill: '#E4C79A', ink: '#3B1F2E' },
  feelgood: { fill: '#E4C79A', ink: '#3B1F2E' },
};

const MAX = 50;
const TICKS = [0, 25, 50];

function describe(w: WeekVolume): string {
  const note = w.taper ? ' · last ten days' : w.recovery ? ' · recovery week' : '';
  return `Week ${w.week} · ${w.phaseLabel}${note}`;
}

/**
 * Strength sets per week, one bar per week, under a band naming each phase.
 * One series, so no legend: the heading names it. Hover or tap a week to read it.
 */
export function WeeklySetsChart({ weeks, fittingWeek, weddingDate }: { weeks: WeekVolume[]; fittingWeek: number; weddingDate: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = weeks.length;
  const bands: { phase: string; label: string; from: number; span: number }[] = [];
  for (const w of weeks) {
    const last = bands[bands.length - 1];
    if (last && last.phase === w.phase) last.span++;
    else bands.push({ phase: w.phase, label: w.phaseLabel, from: w.week, span: 1 });
  }
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const h = hover === null ? null : weeks[hover];
  const at = (week: number) => `${((week - 0.5) / n) * 100}%`;

  return (
    <figure className="m-0">
      <div className="relative pl-7">
        {/* Phase band */}
        <div className="grid gap-[2px]" style={cols} aria-hidden="true">
          {bands.map((b) => (
            <div
              key={b.phase}
              className="flex h-8 items-center overflow-hidden rounded-[4px] px-2 text-[12px] font-semibold sm:text-[13px]"
              style={{ gridColumn: `${b.from} / span ${b.span}`, background: PHASE_BAND[b.phase].fill, color: PHASE_BAND[b.phase].ink }}
            >
              <span className="hidden truncate sm:inline">{b.label}</span>
            </div>
          ))}
        </div>

        {/* Plot */}
        <div className="relative mt-3 h-44 sm:h-52" onPointerLeave={() => setHover(null)}>
          {TICKS.map((t) => (
            <div key={t} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / MAX) * 100}%` }}>
              <span className="absolute -left-7 -translate-y-1/2 text-[11px] tabular-nums text-muted">{t}</span>
            </div>
          ))}
          <div className="absolute inset-0 grid gap-[2px]" style={cols} aria-hidden="true">
            {weeks.map((w, i) => (
              <div key={w.week} className="flex h-full items-end" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
                <div
                  className="w-full rounded-t-[4px] transition-colors motion-reduce:transition-none"
                  style={{
                    height: `${(w.sets / MAX) * 100}%`,
                    background: hover === i ? '#2A1F23' : w.recovery || w.taper ? '#C9A9B5' : '#6B4A5B',
                  }}
                />
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-rose" style={{ left: at(fittingWeek) }}>
            <span className="absolute right-1.5 top-0 whitespace-nowrap rounded bg-surface px-1 text-[12px] font-semibold text-rose-dark">Fitting</span>
          </div>
          {h && (
            <div
              role="status"
              className="pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-[13px] leading-snug text-ground shadow-lg"
              style={{ left: `clamp(90px, ${at(h.week)}, calc(100% - 90px))` }}
            >
              <span className="block font-semibold">{h.sets} sets</span>
              <span className="block text-on-plum">{describe(h)}</span>
              <span className="block text-on-plum-2">From {fmtShort(h.start)}</span>
            </div>
          )}
        </div>

        {/* Axis */}
        <div className="relative mt-2 h-6 text-[12px] text-muted" aria-hidden="true">
          <span className="absolute left-0">Week 1</span>
          <span className="absolute right-0 text-right">
            Wedding <span className="text-ink">{fmtShort(weddingDate)}</span>
          </span>
        </div>
      </div>

      <figcaption className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
        Strength sets per week. Lighter bars are easy weeks: every sixth week, and the last ten days.
      </figcaption>

      <table className="sr-only">
        <caption>Strength sets per week</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Phase</th>
            <th scope="col">Sets</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <td>{w.week}</td>
              <td>{describe(w).replace(/^Week \d+ · /, '')}</td>
              <td>{w.sets}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
