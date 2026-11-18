'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { HydrationGate } from '@/components/AppShell';
import {
  ActivityFields,
  ExperienceFields,
  WeekChooser,
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
import { DescribeYourself } from '@/components/setup/DescribeYourself';
import { ExpectationLine } from '@/components/setup/ExpectationLine';
import { track } from '@/lib/analytics';
import { cleanVerbatim } from '@/lib/attribution';
import { defaultStart, draftFromHandoff, emptyDraft, profileFromDraft, SETUP_SCREENS, STEP_COUNT, validateScreen, type Draft } from '@/lib/draft';
import { codeFromHash, decodePlan, type PlanHandoff } from '@/lib/handoff';
import { WeekAdvice } from '@/components/plan/WeekAdvice';
import { applyMoves, suggestWeekFix } from '@/lib/engine/suggest';
import { validateTemplate } from '@/lib/engine/schedule';
import { DAY_ABBR, fmtDayLong, fmtShort, todayISO } from '@/lib/engine/dates';
import { ED_HELPLINE, MIN_AGE } from '@/lib/engine/guardrails';
import { buildPlan, targetsFor, weeksBucket } from '@/lib/engine/plan';
import { templateForWeek } from '@/lib/engine/schedule';
import { workoutMeta } from '@/lib/engine/workouts';
import { useApp } from '@/lib/state/store';


function Setup() {
  const router = useRouter();
  const existing = useApp((s) => s.profile);
  const saveProfile = useApp((s) => s.saveProfile);
  const today = todayISO();
  // A plan handed over from an AI assistant in the link ("#plan=…"). Setup only renders in the browser.
  const [linked] = useState<PlanHandoff | null>(() => {
    const code = codeFromHash(window.location.hash);
    const h = code ? decodePlan(code) : null;
    return h && h.weddingDate > today ? h : null;
  });
  const prefill = !!linked && !existing;
  const [step, setStep] = useState(prefill ? 2 : 1);
  const [d, setD] = useState<Draft>(() => (prefill ? draftFromHandoff(linked) : emptyDraft()));
  const [err, setErr] = useState<string | null>(null);
  const [heard, setHeard] = useState('');
  const [handoff, setHandoff] = useState<PlanHandoff | null>(linked && existing ? linked : null);
  const [fromAssistant, setFromAssistant] = useState(prefill);
  const set: SetDraft = (patch) => setD((cur) => (typeof patch === 'function' ? patch(cur) : { ...cur, ...patch }));
  const deleteEverything = useApp((s) => s.deleteEverything);

  const startFrom = (h: PlanHandoff) => {
    setD(draftFromHandoff(h));
    setStep(2);
    setFromAssistant(true);
    setHandoff(null);
    track('setup_started', { from: 'assistant' });
  };

  useEffect(() => {
    if (linked) {
      // The plan code has been read; keep it out of the address bar and history.
      history.replaceState(null, '', '/setup');
      if (!existing) track('setup_started', { from: 'assistant' });
      return;
    }
    if (existing) router.replace('/train');
    else track('setup_started');
    // Runs once: the link is read when setup opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.getElementById('setup-title')?.focus({ preventScroll: true });
  }, [step]);

  const under18 = err === `under-${MIN_AGE}`;
  const screen = SETUP_SCREENS[step - 1];
  const next = () => {
    const e = validateScreen(step, d, today);
    setErr(e);
    if (e) return;
    track('setup_step_completed', { step });
    setStep((s) => Math.min(STEP_COUNT, s + 1));
  };
  const back = () => {
    setErr(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const start = (startDate: string) => {
    const profile = profileFromDraft(d, startDate);
    saveProfile(profile);
    const plan = buildPlan(profile);
    track('setup_completed', {
      weeksToWedding_bucket: weeksBucket(plan.timeline.totalWeeks),
      goals: profile.goals,
      strengthDays: profile.strengthDays,
      equipment: profile.equipment,
      nutritionMode: profile.nutritionMode,
      ...(cleanVerbatim(heard) ? { heard_about: cleanVerbatim(heard) } : {}),
    });
    router.push('/train');
  };

  return (
    <main className="app-main">
      <div className="stack" style={{ maxWidth: 640, paddingTop: 20 }}>
        <div className="stack-8">
          <div className="row-between">
            <span className="small muted">
              Step {step} of {STEP_COUNT}
            </span>
            {step > 1 && (
              <button type="button" className="btn-text" onClick={back}>
                Back
              </button>
            )}
          </div>
          <div className="progress" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={STEP_COUNT} aria-valuenow={step}>
            <div style={{ width: `${(step / STEP_COUNT) * 100}%` }} />
          </div>
        </div>

        <header className="stack-8">
          <h1 id="setup-title" tabIndex={-1} className="display" style={{ margin: 0, fontSize: step === 1 ? 44 : 36, lineHeight: 1.1, outline: 'none' }}>
            {screen.title}
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.5, color: '#4A3D42' }}>{screen.intro}</p>
        </header>

        {handoff && (
          <div className="card-lg" role="alert">
            <h2 className="h3">You already have a plan on this device</h2>
            <p className="note-line">Replace it with the plan from your assistant? Your current plan and logs will be deleted from this device.</p>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const h = handoff;
                  deleteEverything();
                  startFrom(h);
                }}
              >
                Replace my plan
              </button>
              <button type="button" className="btn-ghost" onClick={() => router.replace('/train')}>
                Keep my plan
              </button>
            </div>
          </div>
        )}
        {fromAssistant && step === 2 && !handoff && (
          <div className="banner" role="status">
            <strong>Your plan from your assistant is filled in.</strong> Add a few details about you for your protein and energy estimates; you can check the rest on the next screens.
          </div>
        )}

        {handoff ? null : under18 ? (
          <div className="card-lg" role="alert">
            <h2 className="h3">This plan is for adults</h2>
            <p className="note-line">WeddingReady is built for people {MIN_AGE} and over. If you’re younger, a coach or doctor can help you plan training that’s right for you.</p>
            <div>
              <button type="button" className="btn-ghost" onClick={() => setErr(null)}>
                Change my age
              </button>
            </div>
          </div>
        ) : (
          <form
            className="stack-24"
            onSubmit={(e) => {
              e.preventDefault();
              if (step < STEP_COUNT) next();
            }}
            noValidate
          >
            {step === 1 && (
              <>
                <DescribeYourself d={d} set={set} today={today} />
                <NameFields d={d} set={set} />
                <DateFields d={d} set={set} today={today} />
              </>
            )}
            {step === 2 && <BodyFields d={d} set={set} />}
            {step === 3 && (
              <>
                <Group title="What are you wearing?"><OutfitFields d={d} set={set} /></Group>
                <Group title="Goals"><GoalFields d={d} set={set} /></Group>
                <Group title="Focus areas"><FocusFields d={d} set={set} /></Group>
              </>
            )}
            {step === 4 && (
              <>
                <Group title="Where you’re starting">
                  <div className="stack-12">
                    <ExperienceFields d={d} set={set} />
                    <WeekChooser d={d} set={set} today={today} />
                  </div>
                </Group>
                <Group title="Strength training"><TrainingFields d={d} set={set} /></Group>
                <Group title="What you already do"><ActivityFields d={d} set={set} /></Group>
                <Group title="Everyday movement"><MovementFields d={d} set={set} /></Group>
              </>
            )}
            {step === 5 && (
              <>
                <Group title="Food"><FoodFields d={d} set={set} /></Group>
                <Group title="Anything we should know?"><SafetyFields d={d} set={set} /></Group>
              </>
            )}
            {step === STEP_COUNT && <Summary d={d} set={set} today={today} onStart={start} heard={heard} setHeard={setHeard} />}

            {err && (
              <p role="alert" className="err" style={{ fontSize: 15 }}>
                {err}
              </p>
            )}
            {step < STEP_COUNT && (
              <button type="submit" className="btn-primary">
                {step === STEP_COUNT - 1 ? 'See my plan' : 'Next'}
              </button>
            )}
          </form>
        )}
        <p className="tiny muted">General guidance, not medical advice. Everything you enter stays on this device.</p>
      </div>
    </main>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="stack-10">
      <h2 className="h3">{title}</h2>
      {children}
    </section>
  );
}

function Summary({ d, set, today, onStart, heard, setHeard }: { d: Draft; set: SetDraft; today: string; onStart: (startDate: string) => void; heard: string; setHeard: (v: string) => void }) {
  const monday = defaultStart(today, d.weddingDate);
  const plan = useMemo(() => buildPlan(profileFromDraft(d, monday)), [d, monday]);
  const p = plan.profile;
  const t = targetsFor(plan, monday);
  const week = templateForWeek(p, null, plan.timeline.startMonday);
  const mondayIsToday = monday === today;
  const goalsDropped = d.goals.includes('lose_fat') && !p.goals.includes('lose_fat');
  const issues = validateTemplate(week, p.equipment, p.focusAreas).filter((w) => w.severity === 'rule');
  const suggestion = issues.length ? suggestWeekFix(p) : null;
  return (
    <div className="stack-12">
      <section className="hero" style={{ gap: 14 }}>
        <p className="kicker">{plan.timeline.totalWeeks} weeks · {fmtShort(p.weddingDate)}</p>
        <div className="stack-8">
          {plan.timeline.phases.map((ph) => (
            <p key={ph.name} style={{ fontSize: 15, color: '#EADCE2' }}>
              <strong style={{ color: '#FBF6F3' }}>{ph.label}</strong> · {fmtShort(ph.startDate)} – {fmtShort(ph.endDate)} · {ph.weeks} {ph.weeks === 1 ? 'week' : 'weeks'}
            </p>
          ))}
        </div>
        <div className="chips">
          {p.nutritionMode !== 'portions_only' && <span className="chip">Protein {t.protein[0]}–{t.protein[1]} g a day</span>}
          {p.nutritionMode === 'habits_numbers' && (
            <span className="chip">
              ~{t.kcalRange[0].toLocaleString('en-US')}–{t.kcalRange[1].toLocaleString('en-US')} kcal a day
            </span>
          )}
          {p.nutritionMode === 'portions_only' && <span className="chip">Protein at every meal</span>}
        </div>
        {p.nutritionMode === 'habits_numbers' && <p className="tiny" style={{ color: '#CDB8C1' }}>Estimates can be off by 10% or more.</p>}
      </section>

      <div className="card stack-8">
        <span className="label">Your week</span>
        {week.days.map((sessions, i) => (
          <p key={i} className="small">
            <strong>{DAY_ABBR[i]}</strong>{' '}
            {sessions.length ? sessions.map((s) => (s.kind === 'strength' ? workoutMeta(s.workout, p.strengthDays).title : s.label)).join(' · ') : 'Rest'}
          </p>
        ))}
        <p className="tiny muted">You can drag things around later in Plan.</p>
      </div>
      {issues.map((w) => (
        <p key={w.text} className="banner small"><strong>Heads up.</strong> {w.text}</p>
      ))}
      {suggestion && (
        <WeekAdvice
          suggestion={suggestion}
          onApply={
            suggestion.kind === 'moves'
              ? () => set((cur) => ({ ...cur, activities: applyMoves(cur.activities, suggestion.moves) }))
              : suggestion.kind === 'days'
                ? () => set({ strengthDays: suggestion.strengthDays })
                : undefined
          }
        />
      )}

      <ExpectationLine plan={plan} />
      {plan.suggestCardio && <p className="banner small">Optional: 1–2 easy cardio sessions a week help with fat loss. You can add them any time.</p>}
      {goalsDropped && <p className="banner small">We’ve left out Lose fat to keep your plan safe for you. You’ll still get stronger and feel good.</p>}
      {plan.notes.map((n) => (
        <p key={n.kind} className="banner small">
          {n.text}
          {n.kind === 'ed' && (
            <>
              {' '}
              <a href={ED_HELPLINE.tel}>{ED_HELPLINE.phone}</a>
            </>
          )}
        </p>
      ))}

      <label className="field">
        <span>How did you hear about WeddingReady? (optional)</span>
        <input className="input" type="text" maxLength={120} value={heard} onChange={(e) => setHeard(e.target.value)} placeholder="e.g. a friend, LinkedIn, a search" />
        <span className="tiny muted">Shared anonymously to help us improve. Please leave out names.</span>
      </label>

      <button type="button" className="btn-primary" onClick={() => onStart(monday)}>
        Start my plan{mondayIsToday ? ' today' : ` on ${fmtDayLong(monday)}`}
      </button>
      {!mondayIsToday && (
        <button type="button" className="btn-ghost" onClick={() => onStart(today)}>
          Start today instead
        </button>
      )}
    </div>
  );
}

export default function SetupPage() {
  return (
    <HydrationGate requireProfile={false}>
      <Setup />
    </HydrationGate>
  );
}
