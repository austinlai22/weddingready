'use client';

import { useId, useState } from 'react';
import type { Prescribed } from '@/lib/engine/workouts';
import type { WeightLog } from '@/lib/types';
import { Chevron } from '../ui/icons';

function displayWeight(log: WeightLog | undefined, unit: 'lb' | 'kg'): string {
  if (!log) return '';
  if (log.unit === unit) return String(log.value);
  const v = unit === 'kg' ? log.value / 2.20462 : log.value * 2.20462;
  return String(Math.round(v * 2) / 2);
}

export function ExerciseCard({
  p,
  done,
  lastWeight,
  unit,
  onTap,
  onWeight,
  locked = false,
}: {
  p: Prescribed;
  done: number;
  lastWeight: WeightLog | undefined;
  unit: 'lb' | 'kg';
  onTap: (index: number) => void;
  onWeight: (value: number | null) => void;
  /** A day still to come: shown, but nothing can be logged yet. */
  locked?: boolean;
}) {
  const ex = p.exercise;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => displayWeight(lastWeight, unit));
  // Reset the field when the remembered weight comes from a different day or unit
  // (adjusting state during render, not in an effect). Same-day typing keeps the text.
  const sourceKey = `${lastWeight?.date ?? ''}|${unit}`;
  const [shownKey, setShownKey] = useState(sourceKey);
  if (shownKey !== sourceKey) {
    setShownKey(sourceKey);
    setText(displayWeight(lastWeight, unit));
  }
  const detailsId = useId();
  const got = Math.min(done, p.sets);
  const complete = got >= p.sets;
  const mediaSrc = ex.media?.src;
  return (
    <div className={`ex-card${complete ? ' complete' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <button type="button" className="ex-name" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((o) => !o)}>
            {p.focus && <span className="focus-dot" title="Focus muscle" aria-hidden="true" />}
            <span>{ex.name}</span>
            {p.focus && <span className="sr-only">(focus muscle)</span>}
            <Chevron open={open} size={16} />
          </button>
          <span className={`rx${p.changed ? ' changed' : ''}`}>{p.rx}</span>
          {ex.note && <span className="tiny muted" style={{ fontSize: 13 }}>{ex.note}</span>}
        </div>
        {ex.loaded ? (
          <label className="weight">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={unit === 'kg' ? 0.5 : 1}
              placeholder="–"
              value={text}
              disabled={locked}
              aria-label={`${ex.name} weight in ${unit === 'kg' ? 'kilograms' : 'pounds'}`}
              onChange={(e) => {
                setText(e.target.value);
                const v = parseFloat(e.target.value);
                onWeight(e.target.value === '' ? null : Number.isFinite(v) && v >= 0 ? v : null);
              }}
            />
            <span>{unit}</span>
          </label>
        ) : (
          <span className="weight" style={{ fontSize: 13, fontWeight: 600, color: '#6E5F65' }}>bodyweight</span>
        )}
      </div>
      {open && (
        <div id={detailsId} className="media-box">
          {mediaSrc ? (
            <video src={mediaSrc} poster={ex.media?.poster} muted autoPlay loop playsInline preload="none" aria-label={`${ex.name} demonstration`} />
          ) : (
            <p className="tiny muted">Video coming soon. How to do it:</p>
          )}
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ex.cues.map((c) => (
              <li key={c} className="small" style={{ color: '#4A3D42' }}>{c}</li>
            ))}
          </ol>
          {ex.media?.credit && <p className="tiny muted">{ex.media.credit}</p>}
        </div>
      )}
      <div className="row">
        {Array.from({ length: p.sets }, (_, i) => {
          const on = i < got;
          return (
            <button key={i} type="button" className="bubble" aria-pressed={on} aria-label={`${ex.name} set ${i + 1}${on ? ', done' : ''}`} disabled={locked} onClick={() => onTap(i)}>
              {on ? (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                i + 1
              )}
            </button>
          );
        })}
        <span className="muted" style={{ fontSize: 13 }}>{complete ? 'Done' : `${got} of ${p.sets}`}</span>
      </div>
    </div>
  );
}
