'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  ActivityFields,
  BodyFields,
  DateFields,
  FocusFields,
  FoodFields,
  GoalFields,
  MovementFields,
  NameFields,
  OutfitFields,
  SafetyFields,
  TrainingFields,
  type SetDraft,
} from '@/components/setup/Fields';
import { Chevron, CheckBox } from '@/components/ui/icons';
import { track } from '@/lib/analytics';
import { defaultStart, draftFromProfile, profileFromDraft, validateAll, type Draft } from '@/lib/draft';
import { fmtMedium, todayISO } from '@/lib/engine/dates';
import { phaseForDate, weekOf } from '@/lib/engine/phases';
import { EXERCISES } from '@/lib/engine/workouts';
import { buildPlan } from '@/lib/engine/plan';
import { parseImport } from '@/lib/state/schema';
import { currentData, exportData, useApp } from '@/lib/state/store';
import type { FoodItem, Profile } from '@/lib/types';
import { useUi } from '@/lib/ui';

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ padding: 0 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', minHeight: 56, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '14px 18px', border: 0, background: 'transparent', fontSize: 16, fontWeight: 700, textAlign: 'left' }}
      >
        {title}
        <Chevron open={open} />
      </button>
      {open && <div style={{ padding: '0 18px 18px' }}>{children}</div>}
    </div>
  );
}

/**
 * New dates re-spread the phases over the whole plan, which can move today
 * into a different phase. Says where today now sits, so that's no surprise.
 */
function phaseNote(before: Profile, after: Profile, today: string): string {
  if (before.weddingDate === after.weddingDate && before.fittingDate === after.fittingDate) return 'Plan updated.';
  const at = today < after.startDate ? after.startDate : today;
  const t = buildPlan(after).timeline;
  const was = phaseForDate(buildPlan(before).timeline, at);
  const now = phaseForDate(t, at);
  const week = Math.min(Math.max(weekOf(t.startMonday, at), 1), t.totalWeeks);
  return was.name === now.name
    ? `Plan updated for your new dates: week ${week} of ${t.totalWeeks}, still in ${now.label}.`
    : `Your phases were re-spread over your new dates, so you’re now in ${now.label} (week ${week} of ${t.totalWeeks}), not ${was.label}.`;
}

function changedFields(a: Profile, b: Profile): string[] {
  return (Object.keys({ ...a, ...b }) as (keyof Profile)[]).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

export default function SettingsPage() {
  const profile = useApp((s) => s.profile)!;
  const saveProfile = useApp((s) => s.saveProfile);
  const patchProfile = useApp((s) => s.patchProfile);
  const showToast = useUi((s) => s.showToast);
  const [d, setD] = useState<Draft>(() => draftFromProfile(profile));
  const [err, setErr] = useState<string | null>(null);
  const today = todayISO();
  const set: SetDraft = (patch) => setD((cur) => (typeof patch === 'function' ? patch(cur) : { ...cur, ...patch }));
  const dirty = JSON.stringify(draftFromProfile(profile)) !== JSON.stringify(d);

  const save = () => {
    const weddingUnchanged = d.weddingDate === profile.weddingDate;
    const e = validateAll(d, today, { allowPastWedding: weddingUnchanged });
    if (e) {
      setErr(e);
      return;
    }
    let start = profile.startDate;
    if (start > d.weddingDate) start = defaultStart(today, d.weddingDate);
    const next = profileFromDraft(d, start);
    const fields = changedFields(profile, next);
    const dropped = saveProfile(next);
    fields.forEach((field) => track('settings_changed', { field }));
    setD(draftFromProfile(next));
    setErr(null);
    const where = phaseNote(profile, next, today);
    showToast(
      [where, dropped ? 'Some schedule edits no longer fit and were reset.' : 'Your logs are kept.'].filter(Boolean).join(' ') || 'Plan updated.',
    );
  };

  return (
    <>
      <header className="stack-8">
        <h1 className="display" style={{ margin: 0, fontSize: 40 }}>Settings</h1>
        <p className="small muted">Change anything here and your plan rebuilds. Everything you’ve logged is kept.</p>
      </header>

      <section className="stack-10" aria-label="Your plan details">
        <Section title="Name and dates" defaultOpen>
          <div className="stack-12">
            <NameFields d={d} set={set} />
            <DateFields d={d} set={set} today={today} />
            <p className="small muted">Plan started {fmtMedium(profile.startDate)}.</p>
          </div>
        </Section>
        <Section title="About you"><BodyFields d={d} set={set} /></Section>
        <Section title="Outfit and goals">
          <div className="stack-12">
            <OutfitFields d={d} set={set} />
            <GoalFields d={d} set={set} />
          </div>
        </Section>
        <Section title="Focus areas"><FocusFields d={d} set={set} /></Section>
        <Section title="Training"><TrainingFields d={d} set={set} /></Section>
        <Section title="Your activities"><ActivityFields d={d} set={set} /></Section>
        <Section title="Daily movement"><MovementFields d={d} set={set} /></Section>
        <Section title="Food and nutrition style"><FoodFields d={d} set={set} /></Section>
        <Section title="Health and safety"><SafetyFields d={d} set={set} /></Section>
        {err && <p role="alert" className="err" style={{ fontSize: 15 }}>{err}</p>}
        <button type="button" className="btn-primary" onClick={save} disabled={!dirty}>
          {dirty ? 'Save changes' : 'No changes to save'}
        </button>
      </section>

      {profile.goals.includes('lose_fat') && !profile.safety.edHistory && (
        <section className="card-lg">
          <h2 className="h3">Goal</h2>
          {profile.goalReachedAt ? (
            <>
              <p className="note-line">You switched to maintenance on {fmtMedium(profile.goalReachedAt)}.</p>
              <div>
                <button type="button" className="btn-ghost" onClick={() => patchProfile({ goalReachedAt: undefined })}>
                  Go back to the fat-loss target
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="note-line">Reached your goal early? Switch to maintenance and the calorie deficit goes away.</p>
              <div>
                <button type="button" className="btn-ghost" onClick={() => patchProfile({ goalReachedAt: today })}>
                  I’ve reached my goal
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <CoachChanges />

      <MyFoods />
      <PrivacyAndData />
    </>
  );
}

function MyFoods() {
  const foods = useApp((s) => s.myFoods);
  const update = useApp((s) => s.updateMyFood);
  const remove = useApp((s) => s.deleteMyFood);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="card-lg" aria-labelledby="myfoods">
      <h2 id="myfoods" className="h3">My foods</h2>
      {foods.length === 0 ? (
        <p className="small muted">Foods you save while logging show up here and first in search.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {foods.map((f) => (
            <li key={f.id} className="stack-8" style={{ borderTop: '1px solid #F3EAED', paddingTop: 8 }}>
              {editing === f.id ? (
                <FoodEditor food={f} onSave={(patch) => { update(f.id, patch); setEditing(null); }} onCancel={() => setEditing(null)} />
              ) : (
                <div className="row-between" style={{ alignItems: 'center' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{f.name}</span>
                    <span className="tiny muted">{Math.round(f.kcal)} kcal · {Math.round(f.protein)} g protein · {Math.round(f.carbs)} g carbs · {Math.round(f.fat)} g fat</span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn-ghost" onClick={() => setEditing(f.id)} aria-label={`Edit ${f.name}`}>Edit</button>
                    <button type="button" className="btn-ghost" onClick={() => remove(f.id)} aria-label={`Delete ${f.name}`}>Delete</button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FoodEditor({ food, onSave, onCancel }: { food: FoodItem; onSave: (p: Partial<FoodItem>) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: food.name, kcal: String(food.kcal), protein: String(food.protein), carbs: String(food.carbs), fat: String(food.fat) });
  const n = (s: string) => {
    const x = parseFloat(s);
    return Number.isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : 0;
  };
  return (
    <div className="stack-8">
      <label className="field">
        <span>Name</span>
        <input className="input" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </label>
      <div className="num-grid">
        {(['protein', 'carbs', 'fat', 'kcal'] as const).map((k) => (
          <label key={k} className="field">
            <span>{k === 'kcal' ? 'Calories' : `${k[0].toUpperCase()}${k.slice(1)} (g)`}</span>
            <input className="input" type="number" inputMode="decimal" min={0} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" onClick={() => onSave({ name: v.name.trim() || food.name, kcal: n(v.kcal), protein: n(v.protein), carbs: n(v.carbs), fat: n(v.fat) })}>Save</button>
        <button type="button" className="btn-text" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PrivacyAndData() {
  const router = useRouter();
  const optOut = useApp((s) => s.settings.analyticsOptOut);
  const setOptOut = useApp((s) => s.setAnalyticsOptOut);
  const replaceState = useApp((s) => s.replaceState);
  const deleteEverything = useApp((s) => s.deleteEverything);
  const showToast = useUi((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ReturnType<typeof parseImport> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportData(currentData()), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weddingready-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    track('settings_changed', { field: 'export' });
  };

  return (
    <section className="card-lg" aria-labelledby="data-heading">
      <h2 id="data-heading" className="h3">Privacy and your data</h2>
      <p className="note-line">Your plan and logs live only in this browser on this device. <Link href="/privacy">How your data is handled</Link>.</p>
      <button type="button" className="toggle-line" aria-pressed={!optOut} onClick={() => { setOptOut(!optOut); }}>
        <CheckBox on={!optOut} size={22} />
        <span>Share anonymous usage stats (no names, dates, weights or food)</span>
      </button>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn-dark" onClick={doExport}>Export my data</button>
        <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>Import</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose a WeddingReady export file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > 5_000_000) {
              setPending({ ok: false, error: 'That file is too big to be a WeddingReady export.' });
              return;
            }
            setPending(parseImport(await file.text()));
          }}
        />
      </div>
      {pending && !pending.ok && <p role="alert" className="err">{pending.error}</p>}
      {pending?.ok && (
        <div className="banner stack-8" role="alertdialog" aria-label="Confirm import">
          <p><strong>Replace everything on this device with this file?</strong> Your current plan and logs will be overwritten.</p>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (pending.ok) replaceState(pending.state);
                setPending(null);
                track('settings_changed', { field: 'import' });
                showToast('Imported. Your plan is up to date.');
                router.push(pending.ok && pending.state.profile ? '/train' : '/setup');
              }}
            >
              Replace and import
            </button>
            <button type="button" className="btn-text" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
      {!confirmDelete ? (
        <div>
          <button type="button" className="btn-ghost" style={{ color: '#7E2A49' }} onClick={() => setConfirmDelete(true)}>Delete everything</button>
        </div>
      ) : (
        <div className="banner stack-8" role="alertdialog" aria-label="Confirm delete">
          <p><strong>Delete your plan, logs and saved foods from this device?</strong> This can’t be undone. Export first if you want a copy.</p>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                deleteEverything();
                router.replace('/setup');
              }}
            >
              Yes, delete everything
            </button>
            <button type="button" className="btn-text" onClick={() => setConfirmDelete(false)}>Keep my data</button>
          </div>
        </div>
      )}
      <p className="tiny muted">General guidance, not medical advice. <Link href="/terms">Terms</Link></p>
    </section>
  );
}

const EQUIPMENT_LABEL = { home_db: 'Home dumbbells', gym: 'Gym', bodyweight: 'No equipment' } as const;

/** Exercise swaps and equipment changes (usually from the coach), each removable. */
function CoachChanges() {
  const profile = useApp((s) => s.profile)!;
  const patchProfile = useApp((s) => s.patchProfile);
  const swaps = Object.entries(profile.exerciseSwaps ?? {});
  const overrides = profile.equipmentOverrides ?? [];
  if (!swaps.length && !overrides.length) return null;
  const name = (id: string) => EXERCISES.find((e) => e.id === id)?.name ?? id;
  return (
    <section className="card-lg" aria-labelledby="coach-changes">
      <h2 id="coach-changes" className="h3">Changes from your coach</h2>
      <ul className="stack-8" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {swaps.map(([from, to]) => (
          <li key={from} className="row-between">
            <span className="note-line">{name(from)} → {name(to)}</span>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                const next = { ...(profile.exerciseSwaps ?? {}) };
                delete next[from];
                patchProfile({ exerciseSwaps: next });
              }}
            >
              Undo swap
            </button>
          </li>
        ))}
        {overrides.map((o, i) => (
          <li key={`${o.from}-${i}`} className="row-between">
            <span className="note-line">{EQUIPMENT_LABEL[o.equipment]}, {fmtMedium(o.from)} to {fmtMedium(o.to)}</span>
            <button type="button" className="btn-ghost" onClick={() => patchProfile({ equipmentOverrides: overrides.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
