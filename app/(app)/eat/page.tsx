'use client';

import { useMemo } from 'react';
import { Closer } from '@/components/AppShell';
import { MealSlot } from '@/components/eat/MealSlot';
import { WeekStrip, type StripDay } from '@/components/train/WeekStrip';
import { EAT_CLOSER } from '@/lib/engine/copy';
import { dayOfMonth, fmtDayLong, todayISO } from '@/lib/engine/dates';
import { isTreatEntry, SLOT_DEFS } from '@/lib/engine/meals';
import { menuFor, targetsFor, weekDates } from '@/lib/engine/plan';
import { mealsLoggedCore } from '@/lib/progress';
import { useApp } from '@/lib/state/store';
import type { MealEntry } from '@/lib/types';
import { usePlan, useToday, useUi, useViewDate } from '@/lib/ui';

const fmt = (n: number) => n.toLocaleString('en-US');

export default function EatPage() {
  const plan = usePlan()!;
  const today = useToday();
  const date = useViewDate(plan, today);
  const select = useUi((s) => s.select);
  const logs = useApp((s) => s.logs);
  const patchProfile = useApp((s) => s.patchProfile);
  const showToast = useUi((s) => s.showToast);
  const p = plan.profile;
  const mode = p.nutritionMode;
  const t = useMemo(() => targetsFor(plan, date), [plan, date]);
  const menu = useMemo(() => menuFor(plan, date), [plan, date]);
  const meals = logs.meals[date] ?? {};
  const extras = logs.extras[date] ?? [];
  const dates = weekDates(date);

  const strip: StripDay[] = dates.map((d) => ({ date: d, tag: String(dayOfMonth(d)), done: mealsLoggedCore(logs.meals[d]), aria: 'meals' }));

  const all: MealEntry[] = [...(Object.values(meals).filter(Boolean) as MealEntry[]), ...extras];
  const tot = all.reduce((a, e) => ({ p: a.p + e.p, c: a.c + e.c, f: a.f + e.f, k: a.k + e.k }), { p: 0, c: 0, f: 0, k: 0 });
  const [pLow, pHigh] = t.protein;
  const nothing = all.length === 0;
  const msg = nothing
    ? 'Pick or log each meal to see your protein add up.'
    : tot.p >= pLow
      ? 'Protein goal hit. That’s how muscle gets built.'
      : `${Math.round(pLow - tot.p)} g to go. ${meals.s ? 'Add a bigger snack or a second one.' : 'Your protein snack can close it.'}`;
  const coreSlots = (['b', 'l', 'd', 's'] as const).filter((k) => meals[k]);
  const proteinMeals = coreSlots.filter((k) => (meals[k]?.p ?? 0) >= 15 || meals[k]?.src === 'template').length;

  const treatNights = dates.filter((d) => isTreatEntry(logs.meals[d]?.x, p.treat) || (logs.extras[d] ?? []).some((e) => isTreatEntry(e, p.treat))).length;
  const treatLabel = p.treat?.trim() || 'treat';

  const canReachGoal = p.goals.includes('lose_fat') && !p.safety.edHistory && !p.goalReachedAt && t.inDeficit;

  return (
    <>
      <section className="hero" aria-labelledby="eat-title" style={{ gap: 16 }}>
        <p className="kicker">{(date === today ? 'Today · ' : '') + fmtDayLong(date)}</p>
        <h1 id="eat-title" style={{ fontSize: 44 }}>Eat to feel strong.</h1>
        <p className="pep" style={{ fontSize: 16 }}>Pick a meal, or log what you had. Hit your protein. Keep your dessert.</p>
        <div className="eat-panel">
          {mode === 'portions_only' ? (
            <>
              <p style={{ fontSize: 15, color: '#EADCE2' }}>
                <span className="big">{proteinMeals}</span> of 4 meals with protein
              </p>
              <div className="bar" aria-hidden="true"><div style={{ width: `${(proteinMeals / 4) * 100}%` }} /></div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#E4C79A' }}>
                {proteinMeals >= 4 ? 'Protein at every meal. Nice.' : 'Aim for a palm of protein at every meal and snack.'}
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 15, color: '#EADCE2' }}>
                <span className="big">{Math.round(tot.p)}</span> g protein <span style={{ color: '#CDB8C1' }}>/ {pLow}–{pHigh} g</span>
              </p>
              <div className="bar" role="progressbar" aria-label="Protein today" aria-valuemin={0} aria-valuemax={pHigh} aria-valuenow={Math.round(tot.p)}>
                <div style={{ width: `${Math.min(100, Math.round((tot.p / pHigh) * 100))}%` }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#E4C79A' }}>{msg}</p>
              {mode === 'habits_numbers' && (
                <div className="mini-tiles">
                  <div className="mini-tile"><span className="v">{fmt(Math.round(tot.k))}</span><span className="k">kcal · aim ~{fmt(t.kcalRange[0])}–{fmt(t.kcalRange[1])}</span></div>
                  <div className="mini-tile"><span className="v">{Math.round(tot.c)} g</span><span className="k">carbs · aim ~{t.carbs[0]}–{t.carbs[1]}</span></div>
                  <div className="mini-tile"><span className="v">{Math.round(tot.f)} g</span><span className="k">fat · aim ~{t.fat[0]}–{t.fat[1]}</span></div>
                </div>
              )}
            </>
          )}
        </div>
        {mode === 'habits_numbers' && (
          <p className="tiny" style={{ color: '#CDB8C1' }}>
            Estimates can be off by 10% or more.{p.sex === 'unspecified' ? ' Calories use the average of the standard equations.' : ''}
            {t.inDeficit ? '' : ' You’re eating at maintenance right now.'}
          </p>
        )}
      </section>

      <WeekStrip days={strip} selected={date} today={today} onPick={select} />

      <div className="stack-24">
        <div className="plate" aria-label="Plate guide">
          <div><span className="k">PALM</span><span className="v">Protein</span></div>
          <div><span className="k">½ PLATE</span><span className="v">Veggies</span></div>
          <div><span className="k">HANDFUL</span><span className="v">Carbs</span></div>
          <div><span className="k">THUMB</span><span className="v">Fat</span></div>
        </div>

        {SLOT_DEFS.map((sd) => {
          const current = sd.id === 'e' ? undefined : meals[sd.id];
          let note = '';
          let strong = false;
          if (sd.id === 'x') {
            note = `${treatNights} of 2 ${treatLabel} nights this week`;
            strong = treatNights > 2;
          } else if (sd.id === 'e') note = extras.length ? `${extras.length} logged` : 'Optional';
          else if (current) {
            note = 'Logged';
            strong = true;
          }
          return (
            <MealSlot
              key={sd.id}
              slot={sd.id}
              label={sd.label}
              placeholder={sd.ph}
              date={date}
              options={sd.menu ? menu[sd.menu] : []}
              current={current}
              extras={extras}
              note={note}
              noteStrong={strong}
              mode={mode}
              diet={p.diet}
            />
          );
        })}

        <section className="card-lg" aria-labelledby="rules">
          <h2 id="rules" className="h3">Easy rules</h2>
          <p className="note-line">
            <strong>{mode === 'habits_numbers' ? `Still hungry, or under ~${fmt(t.kcalRange[0])} kcal?` : 'Still hungry?'}</strong> Add a piece of fruit or a slightly bigger carb handful. You’re training; fuel it.
          </p>
          <p className="note-line"><strong>Keep your dessert:</strong> 1–2 {treatLabel} nights a week are part of the plan.</p>
          <p className="note-line"><strong>Events:</strong> don’t skip meals beforehand. Enjoy it, then back to the plan at your next meal.</p>
          <p className="note-line"><strong>Drinks:</strong> set a weekly limit that feels realistic to you. Log them under Extras.</p>
          {canReachGoal && (
            <p className="note-line">
              <strong>Reached your goal?</strong> You can switch to maintenance now, which adds back roughly {fmt(t.deficit)} kcal a day.{' '}
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  patchProfile({ goalReachedAt: todayISO() });
                  showToast('Switched to maintenance. Enjoy the extra fuel.', () => patchProfile({ goalReachedAt: undefined }));
                }}
              >
                I’ve reached my goal
              </button>
            </p>
          )}
          <p className="tiny muted">
            Food-list values come from USDA FoodData Central. Restaurant dishes are estimates and vary a lot, so use the restaurant’s published numbers with “I know the numbers” when you have them.
          </p>
        </section>

        <Closer line={EAT_CLOSER} />
      </div>
    </>
  );
}
