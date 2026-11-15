'use client';

import { DAY_ABBR, DAY_NAMES } from '@/lib/engine/dates';
import { ED_HELPLINE, loseFatBlockedReason, MIN_BMI } from '@/lib/engine/guardrails';
import { ACTIVITY_DEFAULT_LABEL, draftHeightCm, draftWeightKg, maxFittingDate, OUTFIT_FOCUS, switchUnits, type Draft } from '@/lib/draft';
import { ACTIVITY_TYPES, FOCUS_AREAS, type ActivityType, type FocusArea, type Goal } from '@/lib/types';
import { CheckBox } from '../ui/icons';

export type SetDraft = (patch: Partial<Draft> | ((d: Draft) => Draft)) => void;
interface F { d: Draft; set: SetDraft }

function Choice({ on, onClick, title, sub, disabled, role = 'button' }: { on: boolean; onClick: () => void; title: string; sub?: string; disabled?: boolean; role?: 'button' | 'radio' }) {
  return (
    <button type="button" className="choice" {...(role === 'radio' ? { role: 'radio', 'aria-checked': on } : { 'aria-pressed': on })} onClick={onClick} disabled={disabled}>
      <CheckBox on={on} size={24} />
      <span>
        {title}
        {sub && <span className="sub">{sub}</span>}
      </span>
    </button>
  );
}

function Pills<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="pill-row" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.v)} type="button" role="radio" aria-checked={value === o.v} className="pill" onClick={() => onChange(o.v)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NameFields({ d, set }: F) {
  return (
    <label className="field">
      <span>First name or nickname (optional)</span>
      <input className="input" value={d.name} maxLength={40} autoComplete="given-name" onChange={(e) => set({ name: e.target.value })} placeholder="Used only in messages on this device" />
    </label>
  );
}

export function DateFields({ d, set, today }: F & { today: string }) {
  return (
    <div className="stack-12">
      <label className="field">
        <span>Wedding date</span>
        <input className="input" type="date" value={d.weddingDate} min={today} onChange={(e) => set({ weddingDate: e.target.value })} required />
      </label>
      <label className="field">
        <span>Outfit fitting date (optional)</span>
        <input className="input" type="date" value={d.fittingUnknown ? '' : d.fittingDate} min={today} max={maxFittingDate(d.weddingDate) || undefined} disabled={d.fittingUnknown} onChange={(e) => set({ fittingDate: e.target.value })} />
      </label>
      <Choice on={d.fittingUnknown} onClick={() => set({ fittingUnknown: !d.fittingUnknown, fittingDate: '' })} title="I don’t know yet" sub="You can add it later in Settings." />
      <p className="small muted">With a fitting date, your plan holds steady from 2 weeks before it, so your size is stable for alterations.</p>
    </div>
  );
}

export function BodyFields({ d, set }: F) {
  const metric = d.units === 'metric';
  return (
    <div className="stack-12">
      <Pills label="Units" value={d.units} options={[{ v: 'imperial', label: 'lb, ft/in' }, { v: 'metric', label: 'kg, cm' }]} onChange={(u) => set((cur) => switchUnits(cur, u))} />
      <label className="field">
        <span>Age</span>
        <input className="input" type="number" inputMode="numeric" min={1} max={110} value={d.age} onChange={(e) => set({ age: e.target.value })} style={{ maxWidth: 160 }} />
      </label>
      <div className="field">
        <span>Sex for the calorie math</span>
        <div className="choice-grid" role="radiogroup" aria-label="Sex for the calorie math">
          <Choice role="radio" on={d.sex === 'female'} onClick={() => set({ sex: 'female' })} title="Female" />
          <Choice role="radio" on={d.sex === 'male'} onClick={() => set({ sex: 'male' })} title="Male" />
          <Choice role="radio" on={d.sex === 'unspecified'} onClick={() => set({ sex: 'unspecified' })} title="Prefer not to say" sub="We’ll use an average of both formulas." />
        </div>
      </div>
      {metric ? (
        <label className="field">
          <span>Height (cm)</span>
          <input className="input" type="number" inputMode="decimal" value={d.heightCm} onChange={(e) => set({ heightCm: e.target.value })} style={{ maxWidth: 160 }} />
        </label>
      ) : (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Height</legend>
          <div className="row">
            <label className="row" style={{ gap: 6 }}>
              <input className="input" type="number" inputMode="numeric" aria-label="Feet" value={d.heightFt} onChange={(e) => set({ heightFt: e.target.value })} style={{ width: 80 }} />
              <span className="small">ft</span>
            </label>
            <label className="row" style={{ gap: 6 }}>
              <input className="input" type="number" inputMode="numeric" aria-label="Inches" value={d.heightIn} onChange={(e) => set({ heightIn: e.target.value })} style={{ width: 80 }} />
              <span className="small">in</span>
            </label>
          </div>
        </fieldset>
      )}
      <label className="field">
        <span>Current weight ({metric ? 'kg' : 'lb'})</span>
        <input className="input" type="number" inputMode="decimal" value={d.weight} onChange={(e) => set({ weight: e.target.value })} style={{ maxWidth: 160 }} />
      </label>
      <p className="small muted">Used only to estimate your protein and energy needs. It stays on this device.</p>
    </div>
  );
}

export function OutfitFields({ d, set }: F) {
  const pick = (o: Draft['outfit']) =>
    set((cur) => ({ ...cur, outfit: o, focusAreas: cur.focusTouched || !o ? cur.focusAreas : OUTFIT_FOCUS[o] }));
  return (
    <div className="choice-grid" role="radiogroup" aria-label="What are you wearing?">
      <Choice role="radio" on={d.outfit === 'dress'} onClick={() => pick('dress')} title="Dress" />
      <Choice role="radio" on={d.outfit === 'suit'} onClick={() => pick('suit')} title="Suit or tux" />
      <Choice role="radio" on={d.outfit === 'other'} onClick={() => pick('other')} title="Something else" />
    </div>
  );
}

const GOALS: { g: Goal; title: string; sub: string }[] = [
  { g: 'tone', title: 'Tone and sculpt for the outfit', sub: 'Extra work for your focus muscles' },
  { g: 'strength', title: 'Build strength', sub: 'More time on the heavier lifts' },
  { g: 'lose_fat', title: 'Lose fat', sub: 'A gentle, capped calorie deficit' },
  { g: 'maintain', title: 'Maintain and feel energized', sub: 'No deficit, steady training' },
];

export function GoalFields({ d, set }: F) {
  const kg = draftWeightKg(d);
  const cm = draftHeightCm(d);
  const blocked = Number.isFinite(kg) && Number.isFinite(cm) ? loseFatBlockedReason({ safety: d.safety, weightKg: kg, heightCm: cm }) : null;
  const toggle = (g: Goal) => set((cur) => ({ ...cur, goals: cur.goals.includes(g) ? cur.goals.filter((x) => x !== g) : [...cur.goals, g] }));
  return (
    <div className="stack-8">
      {GOALS.map(({ g, title, sub }) => {
        const exclusive = (g === 'lose_fat' && d.goals.includes('maintain')) || (g === 'maintain' && d.goals.includes('lose_fat'));
        const disabled = exclusive || (g === 'lose_fat' && !!blocked);
        const reason = g === 'lose_fat' && blocked ? blocked : exclusive ? (g === 'lose_fat' ? 'Turn off Maintain to pick this.' : 'Turn off Lose fat to pick this.') : sub;
        return <Choice key={g} on={d.goals.includes(g)} onClick={() => toggle(g)} title={title} sub={reason} disabled={disabled && !d.goals.includes(g)} />;
      })}
      <p className="small muted">Pick as many as you like. Lose fat and Maintain can’t both be on.</p>
    </div>
  );
}

const FOCUS_LABEL: Record<FocusArea, string> = {
  shoulders: 'Shoulders',
  upper_back: 'Upper back and posture',
  arms: 'Arms',
  chest: 'Chest',
  glutes: 'Glutes',
  legs: 'Legs',
  core: 'Core',
};

export function FocusFields({ d, set }: F) {
  const toggle = (a: FocusArea) =>
    set((cur) => ({ ...cur, focusTouched: true, focusAreas: cur.focusAreas.includes(a) ? cur.focusAreas.filter((x) => x !== a) : [...cur.focusAreas, a] }));
  return (
    <div className="stack-8">
      <div className="choice-grid">
        {FOCUS_AREAS.map((a) => (
          <Choice key={a} on={d.focusAreas.includes(a)} onClick={() => toggle(a)} title={FOCUS_LABEL[a]} disabled={!d.focusAreas.includes(a) && d.focusAreas.length >= 3} />
        ))}
      </div>
      <p className="small muted">Up to 3. These get a dot in your workouts and extra sets in the Shape phase.</p>
    </div>
  );
}

export function TrainingFields({ d, set }: F) {
  return (
    <div className="stack-12">
      <Pills label="Strength days per week" value={d.strengthDays} options={[2, 3, 4, 5].map((n) => ({ v: n as 2 | 3 | 4 | 5, label: String(n) }))} onChange={(v) => set({ strengthDays: v })} />
      <div className="field">
        <span>Equipment</span>
        <div className="choice-grid" role="radiogroup" aria-label="Equipment">
          <Choice role="radio" on={d.equipment === 'home_db'} onClick={() => set({ equipment: 'home_db' })} title="Home dumbbells" />
          <Choice role="radio" on={d.equipment === 'gym'} onClick={() => set({ equipment: 'gym' })} title="Gym" />
          <Choice role="radio" on={d.equipment === 'bodyweight'} onClick={() => set({ equipment: 'bodyweight' })} title="Bodyweight only" />
        </div>
      </div>
      <Pills label="Experience" value={d.experience} options={[{ v: 'new', label: 'New to it' }, { v: 'some', label: 'Some' }, { v: 'experienced', label: 'Experienced' }]} onChange={(v) => set({ experience: v })} />
      <Pills label="Session length" value={d.sessionMinutes} options={[30, 45, 60].map((n) => ({ v: n as 30 | 45 | 60, label: `${n} min` }))} onChange={(v) => set({ sessionMinutes: v })} />
    </div>
  );
}

const ACT_LABEL: Record<ActivityType, string> = { walk: 'Walk', run: 'Run', pilates: 'Pilates', yoga: 'Yoga', cycling: 'Cycling', classes: 'Classes', sports: 'Sports', other: 'Other' };

export function ActivityFields({ d, set }: F) {
  const update = (id: string, patch: Partial<Draft['activities'][number]>) =>
    set((cur) => ({ ...cur, activities: cur.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const add = (type: ActivityType) =>
    set((cur) => ({
      ...cur,
      activities: [
        ...cur.activities,
        {
          id: `${type}-${Date.now().toString(36)}`,
          type,
          label: ACTIVITY_DEFAULT_LABEL[type],
          days: type === 'walk' ? [0, 1, 2, 3, 4, 5, 6] : [],
          ...(type === 'walk' ? { minutes: 30 } : {}),
        },
      ],
    }));
  return (
    <div className="stack-12">
      <p className="small muted">Add what you already do. It goes into your week as your own sessions.</p>
      {d.activities.map((a) => (
        <div key={a.id} className="card stack-10">
          <div className="row-between">
            <strong>{ACT_LABEL[a.type]}</strong>
            <button type="button" className="btn-text" onClick={() => set((cur) => ({ ...cur, activities: cur.activities.filter((x) => x.id !== a.id) }))}>
              Remove
            </button>
          </div>
          <label className="field">
            <span>Name</span>
            <input className="input" value={a.label} maxLength={40} placeholder="e.g. Tennis" onChange={(e) => update(a.id, { label: e.target.value })} />
          </label>
          <div className="field">
            <span>Days</span>
            <div className="pill-row" role="group" aria-label={`Days for ${a.label || ACT_LABEL[a.type]}`}>
              {DAY_ABBR.map((n, i) => (
                <button
                  key={n}
                  type="button"
                  className="pill"
                  aria-pressed={a.days.includes(i)}
                  aria-label={DAY_NAMES[i]}
                  onClick={() => update(a.id, { days: a.days.includes(i) ? a.days.filter((x) => x !== i) : [...a.days, i].sort() })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {a.type === 'walk' && (
            <label className="field">
              <span>Minutes per walk</span>
              <input className="input" type="number" inputMode="numeric" min={5} max={300} value={a.minutes ?? ''} onChange={(e) => update(a.id, { minutes: e.target.value === '' ? undefined : Math.max(0, Math.min(300, Number(e.target.value))) })} style={{ maxWidth: 140 }} />
            </label>
          )}
        </div>
      ))}
      <div className="field">
        <span>Add an activity</span>
        <div className="pill-row">
          {ACTIVITY_TYPES.map((t) => (
            <button key={t} type="button" className="pill" onClick={() => add(t)}>
              + {ACT_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MovementFields({ d, set }: F) {
  return (
    <div className="stack-12">
      <div className="field">
        <span>Most days, you’re…</span>
        <div className="choice-grid" role="radiogroup" aria-label="Your typical day">
          <Choice role="radio" on={d.job === 'sitting'} onClick={() => set({ job: 'sitting' })} title="Mostly sitting" sub="Desk job, driving" />
          <Choice role="radio" on={d.job === 'mixed'} onClick={() => set({ job: 'mixed' })} title="A mix" sub="Some sitting, some moving" />
          <Choice role="radio" on={d.job === 'on_feet'} onClick={() => set({ job: 'on_feet' })} title="On your feet" sub="Retail, nursing, trades" />
        </div>
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 160px' }}>
          <span>Walking per day (minutes)</span>
          <input className="input" type="number" inputMode="numeric" min={0} max={600} value={d.walkMinutes} onChange={(e) => set({ walkMinutes: e.target.value })} />
        </label>
        <label className="field" style={{ flex: '1 1 160px' }}>
          <span>or typical daily steps</span>
          <input className="input" type="number" inputMode="numeric" min={0} max={60000} value={d.steps} onChange={(e) => set({ steps: e.target.value })} />
        </label>
      </div>
      <p className="small muted">Optional, and rough is fine. A daily walk you added above already counts.</p>
    </div>
  );
}

const DIETS: { v: Draft['diet']; label: string }[] = [
  { v: 'none', label: 'No restrictions' },
  { v: 'vegetarian', label: 'Vegetarian' },
  { v: 'vegan', label: 'Vegan' },
  { v: 'pescatarian', label: 'Pescatarian' },
  { v: 'no_pork', label: 'No pork' },
  { v: 'gluten_free', label: 'Gluten-free' },
  { v: 'dairy_free', label: 'Dairy-free' },
];

export function FoodFields({ d, set }: F) {
  const ed = d.safety.edHistory;
  return (
    <div className="stack-12">
      <div className="field">
        <span>How do you want to handle food?</span>
        <div className="stack-8" role="radiogroup" aria-label="Nutrition style">
          <Choice role="radio" on={d.nutritionMode === 'habits'} onClick={() => set({ nutritionMode: 'habits', nutritionTouched: true })} title="Habits only" sub="Plate guide and a protein target. No calories anywhere." disabled={ed} />
          <Choice role="radio" on={d.nutritionMode === 'habits_numbers'} onClick={() => set({ nutritionMode: 'habits_numbers', nutritionTouched: true })} title="Habits + numbers" sub="Adds calorie, carb and fat targets and totals." disabled={ed} />
          <Choice role="radio" on={d.nutritionMode === 'portions_only'} onClick={() => set({ nutritionMode: 'portions_only', nutritionTouched: true })} title="Protein and portions only" sub="Hand-size portions and protein at every meal. No numbers." />
        </div>
        {ed && <p className="small muted">Your plan uses portions only, with no numbers.</p>}
      </div>
      <label className="field">
        <span>Eating pattern</span>
        <select className="input" value={d.diet} onChange={(e) => set({ diet: e.target.value as Draft['diet'] })}>
          {DIETS.map((x) => (
            <option key={x.v} value={x.v}>{x.label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Foods to avoid (optional, comma-separated)</span>
        <input className="input" value={d.avoid} maxLength={300} placeholder="e.g. mushrooms, shrimp" onChange={(e) => set({ avoid: e.target.value })} />
      </label>
      <label className="field">
        <span>A treat you want to keep (optional)</span>
        <input className="input" value={d.treat} maxLength={40} placeholder="e.g. ice cream" onChange={(e) => set({ treat: e.target.value })} />
      </label>
      <p className="small muted">Your plan keeps 1–2 treat nights a week. Really.</p>
    </div>
  );
}

export function SafetyFields({ d, set }: F) {
  const toggle = (k: 'pregnantOrPostpartum' | 'edHistory' | 'medicalCondition') =>
    set((cur) => {
      const safety = { ...cur.safety, [k]: !cur.safety[k], none: false };
      // ED history: portions only. Pregnancy: numbers off by default unless the person already chose a style.
      const nutritionMode = safety.edHistory
        ? 'portions_only'
        : safety.pregnantOrPostpartum && !cur.nutritionTouched
          ? 'habits'
          : cur.nutritionMode;
      return { ...cur, safety, nutritionMode };
    });
  return (
    <div className="stack-8">
      <p className="small muted">This shapes your plan so it’s safe for you. It stays on this device and is never sent anywhere.</p>
      <Choice on={d.safety.pregnantOrPostpartum} onClick={() => toggle('pregnantOrPostpartum')} title="Pregnant or postpartum" />
      <Choice on={d.safety.edHistory} onClick={() => toggle('edHistory')} title="History of an eating disorder" />
      <Choice on={d.safety.medicalCondition} onClick={() => toggle('medicalCondition')} title="A medical condition that affects diet or exercise" />
      <Choice
        on={d.safety.none}
        onClick={() => set((cur) => ({ ...cur, safety: { pregnantOrPostpartum: false, edHistory: false, medicalCondition: false, none: !cur.safety.none } }))}
        title="None of these"
      />
      {d.safety.edHistory && (
        <div className="banner small">
          Thanks for telling us. Your plan focuses on strength, energy and regular meals, with no calorie numbers or weight goals. If food feels hard right now, you’re not alone:{' '}
          <a href={ED_HELPLINE.url} target="_blank" rel="noreferrer">{ED_HELPLINE.name}</a>, <a href={ED_HELPLINE.tel}>{ED_HELPLINE.phone}</a>, or talk to your doctor.
        </div>
      )}
      {d.safety.pregnantOrPostpartum && <div className="banner small">Check with your doctor or midwife before changing your training. Your plan has no calorie deficit.</div>}
      {d.safety.medicalCondition && <div className="banner small">Check with your doctor before you start. Your plan is still ready for you.</div>}
    </div>
  );
}

export { MIN_BMI };
