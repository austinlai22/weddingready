'use client';

import { useState } from 'react';
import { track } from '@/lib/analytics';
import { amountText, optionToEntry, searchFoods, type MealOption } from '@/lib/engine/meals';
import { kcalFromMacros } from '@/lib/engine/nutrition';
import { useApp } from '@/lib/state/store';
import type { Diet, FoodItem, MealEntry, NutritionMode, SlotId } from '@/lib/types';
import { useOnline } from '@/lib/ui';
import { CheckBox, Radio } from '../ui/icons';

type Mode = 'list' | 'ai' | 'manual';

export interface SlotProps {
  slot: SlotId;
  label: string;
  placeholder: string;
  date: string;
  options: MealOption[];
  current: MealEntry | null | undefined;
  extras: MealEntry[];
  note: string;
  noteStrong?: boolean;
  mode: NutritionMode;
  diet: Diet;
}

function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
}

export function MacroChips({ p, c, f, k, kLabel, mode }: { p: number; c: number; f: number; k: number; kLabel?: string; mode: NutritionMode }) {
  if (mode === 'portions_only') return null;
  return (
    <span className="macros">
      <span className="m-p">{Math.round(p)} g protein</span>
      {mode === 'habits_numbers' && (
        <>
          <span className="m-o">{kLabel ?? `~${Math.round(k)} kcal`}</span>
          <span className="m-o">{Math.round(c)} g carbs · {Math.round(f)} g fat</span>
        </>
      )}
    </span>
  );
}

function sourceLine(e: MealEntry): string {
  if (e.src === 'manual') return 'Your numbers';
  if (e.src === 'list') return 'From the food list · USDA values where available';
  if (e.src === 'template') return 'From your plan';
  return `AI estimate · ${e.conf ?? 'low'} confidence${e.note ? ` · ${e.note}` : ''}`;
}

export function MealSlot(props: SlotProps) {
  const { slot, label, date, options, current, extras, note, noteStrong, mode } = props;
  const setMeal = useApp((s) => s.setMeal);
  const addExtra = useApp((s) => s.addExtra);
  const removeExtra = useApp((s) => s.removeExtra);
  const [open, setOpen] = useState(false);
  const isExtras = slot === 'e';

  const save = (entry: MealEntry) => {
    if (isExtras) addExtra(date, entry);
    else setMeal(date, slot as Exclude<SlotId, 'e'>, entry);
    track('meal_logged', { method: entry.src });
    setOpen(false);
  };

  const logged: { entry: MealEntry; remove: () => void }[] = isExtras
    ? extras.map((e, i) => ({ entry: e, remove: () => removeExtra(date, i) }))
    : current && current.src !== 'template'
      ? [{ entry: current, remove: () => setMeal(date, slot as Exclude<SlotId, 'e'>, null) }]
      : [];

  return (
    <section className="stack-10" aria-labelledby={`slot-${slot}`}>
      <div className="row-between">
        <h2 id={`slot-${slot}`} className="h2" style={{ fontSize: 26 }}>{label}</h2>
        <span style={{ fontSize: 13, fontWeight: 600, color: noteStrong ? '#A63D63' : '#6E5F65' }}>{note}</span>
      </div>

      {options.length > 0 && (
        <div className="options">
          {options.map((o) => {
            const on = current?.src === 'template' && current.templateId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                className="option"
                aria-pressed={on}
                onClick={() => {
                  if (on) setMeal(date, slot as Exclude<SlotId, 'e'>, null);
                  else {
                    setMeal(date, slot as Exclude<SlotId, 'e'>, optionToEntry(o));
                    track('meal_logged', { method: 'template' });
                  }
                }}
              >
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="name">{o.name}</span>
                  <Radio on={on} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {o.lines.map((l) => (
                    <span key={l} className="line">{l}</span>
                  ))}
                </span>
                <MacroChips p={o.p} c={o.c} f={o.f} k={o.k} kLabel={o.kLabel} mode={mode} />
                {o.swap && <span className="swap">{o.swap}</span>}
              </button>
            );
          })}
        </div>
      )}

      {logged.map(({ entry, remove }, i) => (
        <div key={`${entry.name}-${i}`} className="logged">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span className="tag">YOU HAD</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{entry.name}</span>
            </div>
            <button type="button" className="btn-ghost" style={{ minHeight: 44, fontSize: 13 }} aria-label={`Remove ${entry.name}`} onClick={remove}>
              Remove
            </button>
          </div>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {entry.items.map((it) => (
              <span key={it} className="line" style={{ fontSize: 14, lineHeight: 1.4, color: '#4A3D42' }}>{it}</span>
            ))}
          </span>
          <MacroChips p={entry.p} c={entry.c} f={entry.f} k={entry.k} mode={mode} />
          <span className="tiny muted">{sourceLine(entry)}</span>
        </div>
      ))}

      {!open ? (
        <button type="button" className="open-logger" onClick={() => setOpen(true)}>
          {isExtras ? '+ Add a food or drink' : '+ Had something else? Log it'}
        </button>
      ) : (
        <Logger {...props} onSave={save} onCancel={() => setOpen(false)} />
      )}
    </section>
  );
}

function Logger({ slot, placeholder, mode, diet, onSave, onCancel }: SlotProps & { onSave: (e: MealEntry) => void; onCancel: () => void }) {
  const [tab, setTab] = useState<Mode>('list');
  const [notice, setNotice] = useState('');
  return (
    <div className="logger">
      <div className="mode-tabs" role="group" aria-label="How to log it">
        <button type="button" aria-pressed={tab === 'list'} onClick={() => setTab('list')}>Search foods</button>
        <button type="button" aria-pressed={tab === 'ai'} onClick={() => setTab('ai')}>Describe it</button>
        <button type="button" aria-pressed={tab === 'manual'} onClick={() => setTab('manual')}>I know the numbers</button>
      </div>
      {tab === 'list' && <ListLogger placeholder={placeholder} mode={mode} diet={diet} onSave={onSave} onCancel={onCancel} />}
      {tab === 'ai' && (
        <AiLogger
          slot={slot}
          mode={mode}
          onSave={onSave}
          onCancel={onCancel}
          onManual={(why) => {
            setNotice(why);
            setTab('manual');
          }}
        />
      )}
      {tab === 'manual' && (
        <>
          {notice && <p role="status" className="err">{notice}</p>}
          <ManualLogger mode={mode} onSave={onSave} onCancel={onCancel} />
        </>
      )}
    </div>
  );
}

function SaveToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" className="toggle-line" aria-pressed={on} onClick={onToggle}>
      <CheckBox on={on} size={22} />
      <span>{label}</span>
    </button>
  );
}

function Actions({ primary, onPrimary, busy, onCancel }: { primary: string; onPrimary: () => void; busy?: boolean; onCancel: () => void }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn" onClick={onPrimary} disabled={busy}>{primary}</button>
      <button type="button" className="btn-text" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function myFoodFrom(name: string, p: number, c: number, f: number, k: number, source: string): FoodItem {
  return { id: newId('my'), name: name.slice(0, 80), unit: 'serving', kcal: k, protein: p, carbs: c, fat: f, defaultAmount: 1, step: 0.5, category: 'my', isRestaurantEstimate: false, source, mine: true };
}

// ---------- 1. Search the food list ----------

function ListLogger({ placeholder, mode, diet, onSave, onCancel }: { placeholder: string; mode: NutritionMode; diet: Diet; onSave: (e: MealEntry) => void; onCancel: () => void }) {
  const myFoods = useApp((s) => s.myFoods);
  const addMyFood = useApp((s) => s.addMyFood);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<{ food: FoodItem; a: number }[]>([]);
  const [saveMine, setSaveMine] = useState(false);
  const [err, setErr] = useState('');
  const { results, total } = searchFoods(q, myFoods, diet);
  const hint = q.trim()
    ? total
      ? `${total} ${total === 1 ? 'match' : 'matches'}${total > results.length ? ` · showing ${results.length}` : ''}`
      : 'No match. Try a simpler word, or use “Describe it” or “I know the numbers”.'
    : 'Popular picks · or search by name';
  const tot = items.reduce((t, { food, a }) => ({ k: t.k + food.kcal * a, p: t.p + food.protein * a, c: t.c + food.carbs * a, f: t.f + food.fat * a }), { k: 0, p: 0, c: 0, f: 0 });

  const log = () => {
    if (!items.length) {
      setErr('Search and tap at least one food to add it.');
      return;
    }
    const names = items.map((i) => i.food.name);
    const name = (names.length <= 2 ? names.join(' + ') : `${names[0]} + ${names.length - 1} more`).slice(0, 60);
    const entry: MealEntry = {
      name,
      items: items.slice(0, 8).map(({ food, a }) => `${amountText(food, a)} · ${food.name}`),
      p: Math.round(tot.p),
      c: Math.round(tot.c),
      f: Math.round(tot.f),
      k: Math.round(tot.k),
      src: 'list',
      typed: names.join(' ').slice(0, 200),
    };
    if (saveMine) addMyFood(myFoodFrom(name, entry.p, entry.c, entry.f, entry.k, 'My food (built from the food list)'));
    onSave(entry);
  };

  return (
    <div className="stack-10">
      <label className="field">
        <span>Search foods</span>
        <input className="input" type="search" value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} />
      </label>
      <span className="tiny muted" aria-live="polite">{hint}</span>
      <div className="stack-8" style={{ gap: 6 }}>
        {results.map((f) => (
          <button
            key={f.id}
            type="button"
            className="result"
            aria-label={`Add ${f.name}`}
            onClick={() => {
              setItems((cur) => [...cur, { food: f, a: f.defaultAmount }]);
              setQ('');
              setErr('');
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span className="n">{f.name}</span>
              <span className="s">
                {f.mine ? 'My food · ' : f.isRestaurantEstimate ? 'Restaurant estimate, varies · ' : f.isLabelEstimate ? 'Check your label · ' : ''}
                per 1 {f.unit}
                {mode === 'habits_numbers' ? ` · ${Math.round(f.kcal)} kcal` : ''}
                {mode !== 'portions_only' ? ` · ${Math.round(f.protein * 10) / 10} g protein` : ''}
              </span>
            </span>
            <span className="plus" aria-hidden="true">+</span>
          </button>
        ))}
      </div>
      {items.length > 0 && (
        <div className="meal-items">
          <span className="tag" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: '#A63D63' }}>YOUR MEAL</span>
          {items.map(({ food, a }, j) => {
            const st = food.step > 0 ? food.step : 0.5;
            const change = (dir: number) =>
              setItems((cur) => cur.map((x, k) => (k === j ? { ...x, a: Math.max(st, Math.round((x.a + dir * st) / st) * st) } : x)));
            return (
              <div key={`${food.id}-${j}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 160px' }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{food.name}</span>
                  {mode !== 'portions_only' && (
                    <span className="tiny muted">
                      {mode === 'habits_numbers' ? `${Math.round(food.kcal * a)} kcal · ` : ''}
                      {Math.round(food.protein * a)} g protein
                      {mode === 'habits_numbers' ? ` · ${Math.round(food.carbs * a)} g carbs · ${Math.round(food.fat * a)} g fat` : ''}
                    </span>
                  )}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" className="stepper" aria-label={`Less ${food.name}`} onClick={() => change(-1)}>−</button>
                  <span style={{ minWidth: 72, textAlign: 'center', fontSize: 14, fontWeight: 700 }}>{amountText(food, a)}</span>
                  <button type="button" className="stepper" aria-label={`More ${food.name}`} onClick={() => change(1)}>+</button>
                  <button type="button" className="x-btn" aria-label={`Remove ${food.name}`} onClick={() => setItems((cur) => cur.filter((_, k) => k !== j))}>×</button>
                </span>
              </div>
            );
          })}
          {mode !== 'portions_only' && (
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              Total: {mode === 'habits_numbers' ? `${Math.round(tot.k)} kcal · ` : ''}
              {Math.round(tot.p)} g protein
              {mode === 'habits_numbers' ? ` · ${Math.round(tot.c)} g carbs · ${Math.round(tot.f)} g fat` : ''}
            </span>
          )}
        </div>
      )}
      <SaveToggle on={saveMine} onToggle={() => setSaveMine((v) => !v)} label="Save this meal to My foods" />
      <Actions primary="Log meal" onPrimary={log} onCancel={onCancel} />
      {err && <span role="alert" className="err">{err}</span>}
    </div>
  );
}

// ---------- 2. Describe it (AI) ----------

interface Estimate {
  name: string;
  items: string[];
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  kcal: number;
  confidence: 'low' | 'medium' | 'high';
  note: string;
}

function AiLogger({ slot, mode, onSave, onCancel, onManual }: { slot: SlotId; mode: NutritionMode; onSave: (e: MealEntry) => void; onCancel: () => void; onManual: (why: string) => void }) {
  const deviceId = useApp((s) => s.deviceId);
  const addMyFood = useApp((s) => s.addMyFood);
  const online = useOnline();
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [est, setEst] = useState<Estimate | null>(null);
  const [nums, setNums] = useState({ p: '', c: '', f: '', k: '' });
  const [saveMine, setSaveMine] = useState(true);

  const ask = async () => {
    if (!item.trim() || !qty.trim()) {
      setErr('Fill in what you had and how much.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/estimate-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, slot, item: item.trim(), quantity: qty.trim(), details: details.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        track('ai_estimate', { status: String(body.code ?? res.status) });
        const message = body.error ?? 'Something went wrong. Try again, or enter the numbers yourself.';
        if (res.status === 503 || res.status === 429) onManual(message);
        else setErr(message);
        return;
      }
      const e = body as Estimate;
      track('ai_estimate', { status: 'ok' });
      setEst(e);
      setNums({ p: String(e.protein_g), c: String(e.carbs_g), f: String(e.fat_g), k: String(e.kcal) });
    } catch {
      track('ai_estimate', { status: 'network' });
      setErr('Couldn’t reach the estimator. Check your connection, or enter the numbers yourself.');
    } finally {
      setBusy(false);
    }
  };

  const n = (x: string) => {
    const v = parseFloat(x);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
  };

  const log = () => {
    if (!est) return;
    const p = n(nums.p), c = n(nums.c), f = n(nums.f);
    const k = nums.k.trim() ? n(nums.k) : kcalFromMacros(p, c, f);
    const entry: MealEntry = { name: est.name.slice(0, 80), items: est.items.slice(0, 8), p, c, f, k, src: 'ai', conf: est.confidence, note: est.note.slice(0, 240), typed: item.trim().slice(0, 200) };
    if (saveMine) addMyFood(myFoodFrom(`${est.name} (${qty.trim()})`, p, c, f, k, 'My food (AI estimate, edited by you)'));
    onSave(entry);
  };

  if (!online) {
    return (
      <div className="ai-card">
        <span style={{ fontSize: 14, fontWeight: 600 }}>Needs a connection.</span>
        <span className="small">You’re offline. Search the food list or enter the numbers yourself, and it will all still save.</span>
      </div>
    );
  }

  return (
    <div className="stack-10">
      {!est ? (
        <>
          <label className="field">
            <span>What did you have?</span>
            <input className="input" value={item} maxLength={200} placeholder="e.g. beef chow fun" onChange={(e) => setItem(e.target.value)} />
          </label>
          <label className="field">
            <span>How much?</span>
            <input className="input" value={qty} maxLength={200} placeholder="e.g. 2 cups, half the plate, 1 order" onChange={(e) => setQty(e.target.value)} />
          </label>
          <label className="field">
            <span>Ingredients or details (optional)</span>
            <input className="input" value={details} maxLength={200} placeholder="e.g. extra oil, no rice, oat milk" onChange={(e) => setDetails(e.target.value)} />
          </label>
          <span className="tiny muted">Sent to an AI estimator. Only what you type here is sent, nothing about you.</span>
          <Actions primary={busy ? 'Estimating…' : 'Estimate it'} onPrimary={ask} busy={busy} onCancel={onCancel} />
        </>
      ) : (
        <>
          <div className="ai-card">
            <span style={{ fontSize: 16, fontWeight: 700 }}>{est.name}</span>
            {est.items.map((i) => (
              <span key={i} className="small" style={{ color: '#4A3D42' }}>{i}</span>
            ))}
            <span className="tiny" style={{ color: '#4A3D42' }}>
              {est.confidence[0].toUpperCase() + est.confidence.slice(1)} confidence · {est.note}
            </span>
          </div>
          {mode !== 'portions_only' && (
            <>
              <span className="tiny muted">Check the numbers and change anything that looks off.</span>
              <NumberFields mode={mode} nums={nums} setNums={setNums} />
            </>
          )}
          <SaveToggle on={saveMine} onToggle={() => setSaveMine((v) => !v)} label="Save to My foods for next time" />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn" onClick={log}>Log meal</button>
            <button type="button" className="btn-ghost" onClick={() => setEst(null)}>Start over</button>
            <button type="button" className="btn-text" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
      {err && <span role="alert" className="err">{err}</span>}
    </div>
  );
}

function NumberFields({ mode, nums, setNums }: { mode: NutritionMode; nums: { p: string; c: string; f: string; k: string }; setNums: (n: { p: string; c: string; f: string; k: string }) => void }) {
  const fields: { key: keyof typeof nums; label: string }[] =
    mode === 'habits_numbers'
      ? [
          { key: 'p', label: 'Protein (g)' },
          { key: 'c', label: 'Carbs (g)' },
          { key: 'f', label: 'Fat (g)' },
          { key: 'k', label: 'Calories' },
        ]
      : [{ key: 'p', label: 'Protein (g)' }];
  return (
    <div className="num-grid">
      {fields.map((fd) => (
        <label key={fd.key} className="field">
          <span>{fd.label}</span>
          <input className="input" type="number" inputMode="decimal" min={0} placeholder="0" value={nums[fd.key]} onChange={(e) => setNums({ ...nums, [fd.key]: e.target.value })} />
        </label>
      ))}
    </div>
  );
}

// ---------- 3. I know the numbers ----------

function ManualLogger({ mode, onSave, onCancel }: { mode: NutritionMode; onSave: (e: MealEntry) => void; onCancel: () => void }) {
  const addMyFood = useApp((s) => s.addMyFood);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [nums, setNums] = useState({ p: '', c: '', f: '', k: '' });
  const [saveMine, setSaveMine] = useState(true);
  const [err, setErr] = useState('');
  const n = (x: string) => {
    const v = parseFloat(x);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
  };
  const add = () => {
    const p = n(nums.p), c = n(nums.c), f = n(nums.f);
    let k = n(nums.k);
    if (mode !== 'portions_only' && !p && !c && !f && !k) {
      setErr('Enter at least one number.');
      return;
    }
    if (mode === 'portions_only' && !name.trim()) {
      setErr('Say what you had.');
      return;
    }
    if (!k) k = kcalFromMacros(p, c, f);
    const item = name.trim() || 'Custom entry';
    const full = (qty.trim() ? `${item} (${qty.trim()})` : item).slice(0, 70);
    if (saveMine && name.trim()) addMyFood(myFoodFrom(full, p, c, f, k, 'My food (your numbers)'));
    onSave({
      name: full,
      items: mode === 'habits_numbers' ? [`${p} g protein · ${c} g carbs · ${f} g fat`] : mode === 'habits' ? [`${p} g protein`] : [qty.trim() || 'Logged'],
      p, c, f, k,
      src: 'manual',
      typed: item.slice(0, 200),
    });
  };
  return (
    <div className="stack-8">
      <label className="field">
        <span>What was it?</span>
        <input className="input" value={name} maxLength={60} placeholder="e.g. protein bar" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>How much? (optional)</span>
        <input className="input" value={qty} maxLength={40} placeholder="e.g. 1 bar, 2 cups" onChange={(e) => setQty(e.target.value)} />
      </label>
      {mode !== 'portions_only' && <NumberFields mode={mode} nums={nums} setNums={setNums} />}
      {mode === 'habits_numbers' && (
        <span className="tiny muted">Use the nutrition label or the restaurant’s numbers. Leave calories blank and they’re worked out from the macros.</span>
      )}
      <SaveToggle on={saveMine} onToggle={() => setSaveMine((v) => !v)} label="Save to My foods for next time" />
      <Actions primary="Add" onPrimary={add} onCancel={onCancel} />
      {err && <span role="alert" className="err">{err}</span>}
    </div>
  );
}
