'use client';

import { useState } from 'react';
import { track } from '@/lib/analytics';
import { applyDescription, type SetupFromText } from '@/lib/describe';
import type { Draft } from '@/lib/draft';
import { useApp } from '@/lib/state/store';
import { useOnline } from '@/lib/ui';
import type { SetDraft } from './Fields';

/**
 * "Describe yourself": one sentence fills in the dates, week and food
 * preferences across setup. It lists exactly what it filled so the person can
 * check it on each step; body and health answers always stay in the form.
 */
export function DescribeYourself({ d, set, today }: { d: Draft; set: SetDraft; today: string }) {
  const online = useOnline();
  const deviceId = useApp((s) => s.deviceId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ filled: string[]; skipped: string[] } | null>(null);

  const fill = async () => {
    const t = text.trim();
    if (t.length < 3 || busy) return;
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      const res = await fetch('/api/describe-setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, today, text: t }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        track('setup_describe', { status: String(body.code ?? res.status) });
        setErr(body.error ?? 'That didn’t work. You can fill in setup yourself.');
        return;
      }
      const s = body as SetupFromText;
      const { draft, filled } = applyDescription(d, s, (type, i) => `${type}-${Date.now().toString(36)}-${i}`);
      set(draft);
      setResult({ filled, skipped: s.skipped ?? [] });
      track('setup_describe', { status: 'ok', filled: filled.length });
    } catch {
      setErr('Couldn’t reach the server. Check your connection, or fill in setup yourself.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack-12" aria-labelledby="describe-heading" style={{ padding: 18 }}>
      <div className="stack-8">
        <h2 id="describe-heading" className="h3" style={{ margin: 0 }}>Describe your plans (optional)</h2>
        <p className="small muted" style={{ margin: 0 }}>
          A sentence or two about the wedding and your week, and it fills in setup for you. Leave out your weight and health details: you’ll add those yourself, and they stay on this device.
        </p>
      </div>
      <label className="field">
        <span className="sr-only">Describe your plans</span>
        <textarea
          className="input"
          rows={3}
          maxLength={600}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Wedding Oct 16 next year, dress fitting Oct 2. I run Tuesdays and do Pilates Saturdays. Dumbbells at home, 3 days a week, 45 minutes. Vegetarian."
        />
      </label>
      <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn-dark" onClick={fill} disabled={busy || !online || text.trim().length < 3}>
          {busy ? 'Filling in…' : 'Fill in for me'}
        </button>
        <span className="tiny muted">{online ? 'Uses AI. Your text goes to Google’s free Gemini, not stored by us.' : 'Needs a connection.'}</span>
      </div>
      {err && (
        <p className="small" role="alert">
          {err}
        </p>
      )}
      {result && (
        <div className="banner small" aria-live="polite">
          {result.filled.length ? (
            <>
              <p style={{ margin: 0 }}>
                <strong>Filled in.</strong> Check these as you go:
              </p>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                {result.filled.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          ) : (
            <p style={{ margin: 0 }}>Nothing to fill in from that. Try naming your wedding date and what you do each week.</p>
          )}
          {result.skipped.length > 0 && <p style={{ margin: '6px 0 0' }}>Couldn’t use: {result.skipped.join('; ')}.</p>}
        </div>
      )}
    </section>
  );
}
