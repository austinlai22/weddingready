'use client';

import { useState } from 'react';
import { WeekList } from '@/components/plan/ScheduleEditor';
import { track } from '@/lib/analytics';
import { DAY_NAMES, dayIndex, fmtShort, mondayOf, addDays } from '@/lib/engine/dates';
import { targetsFor, type Plan } from '@/lib/engine/plan';
import { applyOps, OpError, templateForDate, usualTemplate, validateTemplate } from '@/lib/engine/schedule';
import { encodePlan, handoffFromProfile } from '@/lib/handoff';
import { coachContext, CoachSession, runCoachLoop, type CoachRequest, type Proposal, type StepResult } from '@/lib/coach/session';
import { profileFromCode } from '@/lib/server/mcp/tools';
import { useApp } from '@/lib/state/store';
import type { MealEntry, NutritionMode, SlotId, WeekTemplate } from '@/lib/types';
import type { ScheduleOp } from '@/lib/engine/schedule';
import { useOnline, useSchedule, useUi } from '@/lib/ui';

interface Message {
  role: 'user' | 'coach';
  text: string;
  proposals?: Proposal[];
  /** Quick answers to the coach's question. */
  options?: string[];
  status?: 'applied' | 'discarded';
}

const EXAMPLES = [
  'I can’t train tomorrow. Fit it in later this week?',
  'My knee hurts doing lunges.',
  'I’m travelling next week with only a hotel gym.',
  'I’m eating out tonight. What should I order?',
];

const EQUIPMENT_NAMES = { home_db: 'home dumbbells', gym: 'a gym', bodyweight: 'no equipment' } as const;
const SLOT_NAMES: Record<SlotId, string> = { b: 'breakfast', l: 'lunch', d: 'dinner', s: 'snack', x: 'dessert', e: 'extras' };

/** A coach step the server turned down (limits, busy, off); the message is shown as is. */
class StepFailed extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function macros(e: MealEntry, mode: NutritionMode): string {
  if (mode === 'portions_only') return '';
  if (mode === 'habits') return ` · ${e.p} g protein`;
  return ` · ${e.k} kcal · ${e.p} g protein`;
}

/** The coach: an AI that looks at the plan and proposes changes. Nothing changes until Apply. */
export function Coach({ plan, today }: { plan: Plan; today: string }) {
  const p = plan.profile;
  const online = useOnline();
  const schedule = useSchedule();
  const deviceId = useApp((s) => s.deviceId);
  const logs = useApp((s) => s.logs);
  const editScheduleLasting = useApp((s) => s.editScheduleLasting);
  const editScheduleThisWeek = useApp((s) => s.editScheduleThisWeek);
  const patchProfile = useApp((s) => s.patchProfile);
  const setMeal = useApp((s) => s.setMeal);
  const addExtra = useApp((s) => s.addExtra);
  const showToast = useUi((s) => s.showToast);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const from = today < p.startDate ? p.startDate : today;

  const send = async (message: string) => {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setErr('');
    setText('');
    const history = messages.slice(-8).map(({ role, text: t }) => ({ role, text: t }));
    setMessages((cur) => [...cur, { role: 'user', text: m }]);
    // What the coach's tools can read: training details, this week's layout and ticks, and
    // today's food as the person has chosen to see it. No body measurements or health answers.
    const monday = mondayOf(from);
    const done = Object.fromEntries(Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d) => [d, logs.sessionsDone[d] ?? []]));
    const meals = logs.meals[today] ?? {};
    const all = [...(Object.values(meals).filter(Boolean) as MealEntry[]), ...(logs.extras[today] ?? [])];
    const eaten = all.reduce((t, e) => ({ p: t.p + e.p, c: t.c + e.c, f: t.f + e.f, k: t.k + e.k }), { p: 0, c: 0, f: 0, k: 0 });
    const t = targetsFor(plan, today);
    const numbers = p.nutritionMode !== 'portions_only';
    const req: CoachRequest = {
      deviceId,
      today,
      message: m,
      history,
      plan: encodePlan(handoffFromProfile(p)),
      equipmentOverrides: p.equipmentOverrides ?? [],
      schedule: { overrides: schedule.overrides, history: schedule.history },
      done,
      nutrition: {
        mode: p.nutritionMode,
        diet: p.diet,
        ...(numbers ? { targets: { kcal: t.kcalRange, protein: t.protein, carbs: t.carbs, fat: t.fat }, eaten } : {}),
        logged: (Object.keys(meals) as SlotId[]).filter((k) => meals[k as Exclude<SlotId, 'e'>]),
      },
    };
    try {
      // The tools run here, on a training-only copy of the plan; each model step goes
      // through the server with only what the coach has looked up so far.
      const session = new CoachSession(req, profileFromCode(req.plan, req.today, { equipmentOverrides: req.equipmentOverrides }));
      const context = coachContext(req, session.plan);
      const reply = await runCoachLoop(req, session, async (contents, model) => {
        const res = await fetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, context, contents, model }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new StepFailed(String(body.code ?? res.status), body.error ?? 'The coach couldn’t answer. Try again in a minute.');
        return body as StepResult;
      });
      track('coach', { status: reply.options ? 'asked' : 'ok', proposals: reply.proposals.length });
      setMessages((cur) => [...cur, { role: 'coach', text: reply.reply, proposals: reply.proposals, options: reply.options }]);
    } catch (e) {
      if (e instanceof StepFailed) {
        track('coach', { status: e.code });
        setErr(e.message);
      } else setErr('Couldn’t reach the coach. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const apply = (index: number, proposals: Proposal[]) => {
    try {
      for (const pr of proposals) {
        if (pr.kind === 'schedule') {
          const thisWeek = templateForDate(p, schedule, from);
          if (pr.scope === 'this_week') editScheduleThisWeek(applyOps(thisWeek, pr.ops, p), from);
          else editScheduleLasting(applyOps(usualTemplate(p, schedule, from), pr.ops, p), from, pr.thisWeekOps?.length ? applyOps(thisWeek, pr.thisWeekOps, p) : null);
        } else if (pr.kind === 'swap') {
          patchProfile({ exerciseSwaps: { ...(useApp.getState().profile?.exerciseSwaps ?? {}), [pr.from]: pr.to } });
        } else if (pr.kind === 'equipment') {
          patchProfile({ equipmentOverrides: [...(useApp.getState().profile?.equipmentOverrides ?? []), { from: pr.from, to: pr.to, equipment: pr.equipment }] });
        } else if (pr.kind === 'meal') {
          if (pr.slot === 'e') addExtra(today, pr.entry);
          else setMeal(today, pr.slot, pr.entry);
        }
      }
      setMessages((cur) => cur.map((msg, i) => (i === index ? { ...msg, status: 'applied' } : msg)));
      track('coach', { status: 'applied', proposals: proposals.length });
      showToast('Applied. You can change it any time.');
    } catch (e) {
      setErr(e instanceof OpError ? 'Your week changed since that suggestion. Ask again.' : 'Couldn’t apply that.');
    }
  };

  return (
    <section id="coach" className="card-lg scroll-mt-4" aria-labelledby="coach-heading">
      <h2 id="coach-heading" className="h3">Ask your coach</h2>
      <p className="small muted">
        Tell it what came up. It looks at your plan on this device and suggests changes; nothing changes until you tap Apply. Only your messages and what it looks up
        to answer them go to the AI, never your weight or health answers.
      </p>

      {messages.length > 0 && (
        <ol className="stack-12" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-live="polite">
          {messages.map((msg, i) => (
            <li key={i} className="stack-8">
              <p
                className="note-line"
                style={
                  msg.role === 'user'
                    ? { alignSelf: 'flex-end', background: '#F3E7EB', borderRadius: 14, padding: '10px 14px', maxWidth: '85%' }
                    : { borderLeft: '3px solid #A63D63', paddingLeft: 12 }
                }
              >
                {msg.role === 'coach' && <span className="sr-only">Coach: </span>}
                {msg.text}
              </p>
              {msg.options && msg.options.length > 0 && i === messages.length - 1 && !busy && (
                <ul className="chips" aria-label="Quick answers" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {msg.options.map((o) => (
                    <li key={o}>
                      <button type="button" className="btn-ghost" style={{ minHeight: 40, fontSize: 14 }} onClick={() => void send(o)}>
                        {o}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {msg.proposals && msg.proposals.length > 0 && (
                <ProposalCard
                  plan={plan}
                  from={from}
                  proposals={msg.proposals}
                  status={msg.status}
                  onApply={() => apply(i, msg.proposals!)}
                  onDiscard={() => setMessages((cur) => cur.map((m2, j) => (j === i ? { ...m2, status: 'discarded' } : m2)))}
                />
              )}
            </li>
          ))}
        </ol>
      )}

      {!online ? (
        <p className="small muted">Needs a connection. You can still drag sessions in your week below.</p>
      ) : (
        <form
          className="stack-8"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          {messages.length === 0 && (
            <ul className="chips" aria-label="Examples" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button type="button" className="btn-ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => void send(ex)} disabled={busy}>
                    {ex}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="field">
            <span className="sr-only">Message to your coach</span>
            <textarea
              className="input"
              rows={2}
              maxLength={500}
              value={text}
              placeholder="e.g. I’m away this weekend"
              aria-label="Message to your coach"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
              style={{ resize: 'vertical' }}
            />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn" disabled={busy || !text.trim()}>
              {busy ? 'Thinking…' : 'Ask'}
            </button>
            <span className="tiny muted">General guidance, not medical advice.</span>
          </div>
        </form>
      )}
      {err && <p role="alert" className="err">{err}</p>}
    </section>
  );
}

function ProposalCard({
  plan,
  from,
  proposals,
  status,
  onApply,
  onDiscard,
}: {
  plan: Plan;
  from: string;
  proposals: Proposal[];
  status?: 'applied' | 'discarded';
  onApply: () => void;
  onDiscard: () => void;
}) {
  const p = plan.profile;
  const schedule = useSchedule();
  return (
    <div className="stack-10" style={{ background: '#FBF6F3', border: '1px solid #EFE2E6', borderRadius: 16, padding: 14 }} aria-label="Suggested changes">
      {proposals.map((pr, i) => {
        if (pr.kind === 'schedule') {
          const preview = (before: WeekTemplate, ops: ScheduleOp[]) => {
            try {
              return applyOps(before, ops, p);
            } catch {
              return before; // shown as unchanged; Apply will report it
            }
          };
          const thisWeek = templateForDate(p, schedule, from);
          const nextMonday = addDays(mondayOf(from), 7);
          // A lasting change shows the usual week (from next Monday) and, if it changes too, the rest of this week.
          const parts: { label: string; before: WeekTemplate; after: WeekTemplate }[] =
            pr.scope === 'this_week'
              ? [{ label: 'This week', before: thisWeek, after: preview(thisWeek, pr.ops) }]
              : [
                  ...(pr.ops.length ? [{ label: `Every week from ${fmtShort(nextMonday)}`, before: usualTemplate(p, schedule, from), after: preview(usualTemplate(p, schedule, from), pr.ops) }] : []),
                  ...(pr.thisWeekOps?.length ? [{ label: 'The rest of this week', before: thisWeek, after: preview(thisWeek, pr.thisWeekOps) }] : []),
                ];
          const problems = [...new Set(parts.flatMap((x) => validateTemplate(x.after, p.equipment, p.focusAreas).filter((w) => w.severity === 'rule').map((w) => w.text)))];
          return (
            <div key={i} className="stack-8">
              <p className="small">
                <strong>{pr.scope === 'this_week' ? 'This week only' : 'From now on'}:</strong> {pr.summary}
              </p>
              {parts.map((x) => (
                <div key={x.label} className="stack-8">
                  {parts.length > 1 || pr.scope !== 'this_week' ? <span className="label">{x.label}</span> : null}
                  <div className="tiles-2">
                    <div className="stack-8" style={{ background: '#fff', borderRadius: 12, padding: 10 }}>
                      <span className="label">Before</span>
                      <WeekList t={x.before} strengthDays={p.strengthDays} />
                    </div>
                    <div className="stack-8" style={{ background: '#F6E4EA', borderRadius: 12, padding: 10 }}>
                      <span className="label">After</span>
                      <WeekList t={x.after} strengthDays={p.strengthDays} />
                    </div>
                  </div>
                </div>
              ))}
              {problems.map((text) => (
                <p key={text} className="small"><strong>Heads up.</strong> {text}</p>
              ))}
            </div>
          );
        }
        if (pr.kind === 'swap') {
          return (
            <p key={i} className="small">
              <strong>Swap in every workout:</strong> {pr.fromName} → {pr.toName}. <span className="muted">{pr.reason}</span>
            </p>
          );
        }
        if (pr.kind === 'equipment') {
          return (
            <p key={i} className="small">
              <strong>Equipment:</strong> {EQUIPMENT_NAMES[pr.equipment]} from {DAY_NAMES[dayIndex(pr.from)]} {fmtShort(pr.from)} to {DAY_NAMES[dayIndex(pr.to)]} {fmtShort(pr.to)}. <span className="muted">{pr.reason}</span>
            </p>
          );
        }
        return (
          <div key={i} className="small">
            <strong>Log for {SLOT_NAMES[pr.slot]}:</strong> {pr.entry.name}
            {macros(pr.entry, p.nutritionMode)}
            <div className="tiny muted">{pr.entry.items.join(' · ')}</div>
          </div>
        );
      })}
      {[...new Set(proposals.map((pr) => pr.basedOn).filter(Boolean))].map((b) => (
        <p key={b} className="tiny muted">Based on: {b}</p>
      ))}
      {status ? (
        <p className="small muted">{status === 'applied' ? 'Applied.' : 'Discarded.'}</p>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn" onClick={onApply}>
            Apply
          </button>
          <button type="button" className="btn-ghost" onClick={onDiscard}>
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
