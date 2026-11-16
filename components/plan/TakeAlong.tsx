'use client';

import Link from 'next/link';
import { useState } from 'react';
import { track } from '@/lib/analytics';
import { calendarEvents, eventsRange, toICS } from '@/lib/calendar';
import type { Plan } from '@/lib/engine/plan';
import { encodePlan, handoffFromProfile } from '@/lib/handoff';
import { useSchedule } from '@/lib/ui';

/** Calendar export and a plan code for AI assistants. Both are made on this device. */
export function TakeAlong({ plan, today }: { plan: Plan; today: string }) {
  const schedule = useSchedule();
  const [time, setTime] = useState('07:00');
  const [weeks, setWeeks] = useState(8);
  const [activities, setActivities] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const code = encodePlan(handoffFromProfile(plan.profile));
  const message = `My WeddingReady plan code is ${code}. Use the WeddingReady connector with it.`;

  const download = () => {
    const events = calendarEvents(plan, schedule, { from: today, weeks, time, includeActivities: activities });
    if (!events.length) {
      setNote('There are no sessions in those weeks.');
      return;
    }
    const url = URL.createObjectURL(new Blob([toICS(events)], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'weddingready-training.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    track('calendar_exported', { weeks });
    setNote(`${events.length} sessions, ${eventsRange(events)}. Open the file to add them to Google, Apple or Outlook calendar. Download it again after changing your week.`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      track('plan_code_copied');
    } catch {
      /* clipboard blocked: the code is on screen */
    }
  };

  return (
    <section className="card-lg" aria-labelledby="take-heading">
      <h2 id="take-heading" className="h3">Take your plan with you</h2>

      <div className="stack-10">
        <p className="note-line"><strong>Add to your calendar.</strong> Your strength sessions as events, with the workout in each one.</p>
        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ minWidth: 120 }}>
            <span>Time</span>
            <input className="input" type="time" value={time} step={900} onChange={(e) => setTime(e.target.value || '07:00')} />
          </label>
          <label className="field" style={{ minWidth: 140 }}>
            <span>How far ahead</span>
            <select className="input" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {[4, 8, 12, 16].map((w) => (
                <option key={w} value={w}>
                  {w} weeks
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
          <input type="checkbox" checked={activities} onChange={(e) => setActivities(e.target.checked)} style={{ width: 20, height: 20, flex: 'none' }} />
          <span>Include my runs, classes and other activities</span>
        </label>
        <div>
          <button type="button" className="btn-dark" onClick={download}>
            Download calendar file
          </button>
        </div>
        {note && <p className="small muted" role="status">{note}</p>}
      </div>

      <div className="stack-10" style={{ borderTop: '1px solid #EFE2E6', paddingTop: 14 }}>
        <p className="note-line">
          <strong>Use it with Claude.</strong> With the WeddingReady connector, paste this and your assistant picks up your plan without asking again.{' '}
          <Link href="/agents">Set up the connector</Link>
        </p>
        <code className="tiny" title={code} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: '#FBF6F3', borderRadius: 10, padding: '8px 10px' }}>
          {code}
        </code>
        <div>
          <button type="button" className="btn-ghost" onClick={copy}>
            {copied ? 'Copied' : 'Copy for Claude'}
          </button>
        </div>
      </div>
    </section>
  );
}
