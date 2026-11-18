'use client';

import { useState } from 'react';
import { PHASE_COPY } from '@/lib/engine/copy';
import { fmtShort } from '@/lib/engine/dates';
import type { Plan } from '@/lib/engine/plan';
import type { Phase } from '@/lib/engine/phases';
import { phaseRest, weightTip } from '@/lib/engine/workouts';

function notesFor(plan: Plan, phase: Phase): { k: string; v: string }[] {
  const p = plan.profile;
  const notes: { k: string; v: string }[] = [];
  const types = new Set(p.activities.map((a) => a.type));
  if (types.has('run')) {
    notes.push({ k: 'Runs:', v: phase.name === 'maintain' || phase.name === 'feelgood' ? 'Easy, keep the distance familiar.' : 'Easy, at a pace where you can talk. Add 5 minutes every 3–4 weeks.' });
  }
  notes.push({ k: 'Weights:', v: weightTip(phase.name, p.units) });
  if (phase.name !== 'foundation' && phase.name !== 'maintain' && phase.name !== 'feelgood') {
    notes.push({ k: 'Progress:', v: 'When every set hits the top of the rep range with about 2 reps left, go up to the next weight.' });
  }
  if (plan.suggestCardio && phase.name !== 'maintain' && phase.name !== 'feelgood') {
    notes.push({ k: 'Optional:', v: '1–2 easy cardio sessions a week, like a brisk walk, easy ride or class. Add them in the schedule.' });
  }
  if (p.goals.includes('lose_fat') && !p.safety.edHistory && phase.name !== 'maintain') {
    notes.push({ k: 'Stuck for 4–6 weeks?', v: 'Change one thing: a slightly smaller dinner carb portion, or one more easy walk.' });
  }
  if (phase.name === 'maintain' || phase.name === 'feelgood') {
    notes.push({ k: `Final 10 days (${fmtShort(plan.timeline.taperStart)}–${fmtShort(plan.timeline.weddingDate)}):`, v: '2 sets per exercise, keep your usual easy activities, no crash diets, nothing new.' });
  }
  notes.push(
    p.safety.edHistory
      ? { k: 'Check in monthly:', v: 'how strong you feel, your energy, and how you’re sleeping.' }
      : { k: 'Track monthly:', v: `how your clothes fit, a waist measurement, photos in the same light${p.sex === 'female' ? ', at the same point in your cycle' : ''}.` },
  );
  return notes;
}

export function PhaseSection({ plan, currentWeek, heading = 'The plan' }: { plan: Plan; currentWeek: number; heading?: string }) {
  const phases = plan.timeline.phases;
  const nowIdx = Math.max(0, phases.findIndex((p) => currentWeek >= p.startWeek && currentWeek <= p.endWeek));
  const [view, setView] = useState<number | null>(null);
  const idx = view ?? nowIdx;
  const ph = phases[idx];
  const copy = PHASE_COPY[ph.name];
  const isNow = idx === nowIdx && currentWeek >= 1;
  return (
    <section className="stack-12" aria-labelledby="phase-heading">
      <h2 id="phase-heading" className="h2-sm">{heading}</h2>
      <div className="phase-tabs" role="group" aria-label="Phases">
        {phases.map((p, i) => (
          <button key={p.name} type="button" className="phase-tab" aria-pressed={i === idx} onClick={() => setView(i)}>
            <span className="n">{p.label}</span>
            <span className={`t${i === nowIdx && currentWeek >= 1 ? ' now' : ''}`}>{i === nowIdx && currentWeek >= 1 ? 'Now' : `Phase ${i + 1}`}</span>
          </button>
        ))}
      </div>
      <div className="card-lg">
        <p className="kicker-rose">
          {isNow ? 'Now' : 'Preview'} · Phase {idx + 1} · Weeks {ph.startWeek}–{ph.endWeek} · {fmtShort(ph.startDate)} – {fmtShort(ph.endDate)}
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.5 }}>{copy.focus}</p>
        <div className="tiles-2">
          <div className="tile"><span className="k">Sets × reps</span><span className="v">{copy.sets}</span></div>
          <div className="tile"><span className="k">Rest</span><span className="v">{phaseRest(ph.name, plan.profile.sex)}</span></div>
        </div>
        {notesFor(plan, ph).map((n) => (
          <p key={n.k} className="note-line"><strong>{n.k}</strong> {n.v}</p>
        ))}
      </div>
    </section>
  );
}
