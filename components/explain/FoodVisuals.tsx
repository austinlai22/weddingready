import type { ReactNode } from 'react';
import type { Targets } from '@/lib/engine/nutrition';

const n = (v: number) => v.toLocaleString('en-US');

function Mock({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2.5 rounded-xl bg-plum p-3.5 text-ground">{children}</div>;
}

function ProteinBar({ t, eaten }: { t: Targets; eaten: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px] text-on-plum">
        <span>Protein</span>
        <span>
          <b className="font-display text-[17px] text-ground">{eaten}</b> of {t.protein[0]}–{t.protein[1]} g
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-plum-line">
        <div className="h-2 rounded-full bg-gold" style={{ width: `${(eaten / t.protein[1]) * 100}%` }} />
      </div>
    </div>
  );
}

function Tile({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-plum-2 px-2 py-1.5">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-on-plum-2">{k}</span>
      <span className="block text-[13px] font-semibold">{v}</span>
    </div>
  );
}

/** The three ways the Eat tab can look, drawn from the example's targets. */
export function NutritionModes({ t }: { t: Targets }) {
  const eaten = Math.round(t.protein[0] * 0.6);
  const modes: { name: string; note: string; mock: ReactNode }[] = [
    {
      name: 'Habits',
      note: 'A plate guide and a protein target. No calories anywhere.',
      mock: (
        <Mock>
          <ProteinBar t={t} eaten={eaten} />
          <p className="text-[12px] text-on-plum">Half your plate veggies at lunch and dinner.</p>
        </Mock>
      ),
    },
    {
      name: 'Habits and numbers',
      note: 'Adds calorie, carb and fat targets.',
      mock: (
        <Mock>
          <ProteinBar t={t} eaten={eaten} />
          <div className="grid grid-cols-3 gap-1.5">
            <Tile k="Calories" v={n(t.kcal)} />
            <Tile k="Carbs" v={`${t.carbs[0]}–${t.carbs[1]} g`} />
            <Tile k="Fat" v={`${t.fat[0]}–${t.fat[1]} g`} />
          </div>
        </Mock>
      ),
    },
    {
      name: 'Portions only',
      note: 'Hand-sized portions and protein at every meal. No numbers at all.',
      mock: (
        <Mock>
          <div className="grid grid-cols-2 gap-1.5">
            <Tile k="Palm" v="Protein" />
            <Tile k="½ plate" v="Veggies" />
            <Tile k="Handful" v="Carbs" />
            <Tile k="Thumb" v="Fat" />
          </div>
          <p className="text-[12px] text-on-plum">Protein at 2 of 3 meals so far.</p>
        </Mock>
      ),
    },
  ];
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
      {modes.map((m) => (
        <li key={m.name} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3">
          <div aria-hidden="true">{m.mock}</div>
          <div className="px-1 pb-1">
            <p className="font-display text-lg font-semibold text-ink">{m.name}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{m.note}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Where the calorie target sits: the maintenance estimate, the lose-fat range
 * below it, and resting needs as the floor nothing goes under.
 */
export function EnergyRange({ maintenance, loseFat }: { maintenance: Targets; loseFat: Targets }) {
  const lo = Math.floor((Math.min(loseFat.bmr, loseFat.kcalRange[0]) - 150) / 100) * 100;
  const hi = Math.ceil((maintenance.kcalRange[1] + 120) / 100) * 100;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / 300) * 300; v <= hi; v += 300) ticks.push(v);
  const rows = [
    { label: 'Maintenance', range: maintenance.kcalRange, fill: '#C9A9B5' },
    { label: 'Lose fat', range: loseFat.kcalRange, fill: '#A63D63' },
  ];
  const summary = `Maintenance about ${n(maintenance.kcalRange[0])} to ${n(maintenance.kcalRange[1])} calories a day; lose fat about ${n(loseFat.kcalRange[0])} to ${n(loseFat.kcalRange[1])}; resting needs ${n(loseFat.bmr)}, which the target never goes below.`;
  return (
    <figure className="m-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <figcaption className="text-[15px] font-semibold text-ink">Calories a day, for the example plan</figcaption>
      <div className="mt-5" role="img" aria-label={summary}>
        <div className="relative">
          <div aria-hidden="true" className="absolute inset-y-0 border-l-2 border-dashed border-ink/40" style={{ left: x(loseFat.bmr) }} />
          {rows.map((r) => (
            <div key={r.label} className="relative h-16">
              <div className="absolute left-0 top-1 z-10 bg-surface pr-1.5 text-[13px] text-ink-2">
                <span className="font-semibold text-ink">{r.label}</span> {n(r.range[0])}–{n(r.range[1])}
              </div>
              <div className="absolute top-8 h-3 rounded-[4px]" style={{ left: x(r.range[0]), width: `calc(${x(r.range[1])} - ${x(r.range[0])})`, background: r.fill }} />
            </div>
          ))}
        </div>
        <div className="relative mt-1 h-5 border-t border-line text-[11px] tabular-nums text-muted" aria-hidden="true">
          {ticks.map((v) => (
            <span key={v} className="absolute top-1 -translate-x-1/2" style={{ left: x(v) }}>
              {n(v)}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted" aria-hidden="true">
          Dashed line: resting needs, {n(loseFat.bmr)}. The target never goes below it.
        </p>
      </div>
    </figure>
  );
}
