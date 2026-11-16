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
