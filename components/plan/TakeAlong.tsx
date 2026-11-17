'use client';

import Link from 'next/link';
import { useState } from 'react';
import { track } from '@/lib/analytics';
import { calendarEvents, eventsRange, toICS } from '@/lib/calendar';
import type { Plan } from '@/lib/engine/plan';
import { templateForDate } from '@/lib/engine/schedule';
import { encodePlan, handoffFromProfile, SITE_URL } from '@/lib/handoff';
import { useSchedule } from '@/lib/ui';

type Provider = 'apple' | 'google' | 'outlook' | 'file';

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'apple', label: 'Apple Calendar' },
  { id: 'google', label: 'Google Calendar' },
  { id: 'outlook', label: 'Outlook' },
  { id: 'file', label: 'Other app' },
];

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Links that add the plan to each calendar. They subscribe to /api/ics, which builds the events from the plan code in the link. */
export function calendarLinks(origin: string, params: URLSearchParams) {
  const https = `${origin}/api/ics?${params}`;
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  const name = encodeURIComponent('WeddingReady training');
  return {
    apple: webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${name}`,
    outlookWork: `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${name}`,
    https,
  };
}

/** Calendars and a plan code for AI assistants. */
export function TakeAlong({ plan, today }: { plan: Plan; today: string }) {
  const schedule = useSchedule();
  const p = plan.profile;
  const [provider, setProvider] = useState<Provider>('apple');
  const [time, setTime] = useState('07:00');
  const [weeks, setWeeks] = useState(8);
  const [activities, setActivities] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  const from = today < p.startDate ? p.startDate : today;
  // The week as arranged here, so calendars and assistants show the same sessions.
  const layout = templateForDate(p, schedule, from);
  const code = encodePlan(handoffFromProfile(p, layout));
  const message = `My WeddingReady plan code is ${code}. Use the WeddingReady connector with it.`;
  const tz = deviceTimeZone();
  // Calendar services fetch the link themselves, so it must be the public site.
  const origin = typeof window !== 'undefined' && !/localhost|127\.0\.0\.1/.test(window.location.host) ? window.location.origin : SITE_URL;
  const links = calendarLinks(origin, new URLSearchParams({ plan: code, weeks: String(weeks), time, tz, ...(activities ? { activities: '1' } : {}) }));

  const download = () => {
    const events = calendarEvents(plan, schedule, { from: today, weeks, time, includeActivities: activities });
    if (!events.length) {
      setNote('There are no sessions in those weeks.');
      return;
    }
    const url = URL.createObjectURL(new Blob([toICS(events, { timeZone: tz })], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'weddingready-training.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    track('calendar_exported', { provider: 'file', weeks });
    setNote(`${events.length} sessions, ${eventsRange(events)}. Open the file to add them to your calendar app. Download it again after changing your week.`);
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

  const added = (which: Provider) => () => track('calendar_exported', { provider: which, weeks });

  return (
    <section className="card-lg" aria-labelledby="take-heading">
      <h2 id="take-heading" className="h3">Take your plan with you</h2>

      <div className="stack-10">
        <p className="note-line"><strong>Add to your calendar.</strong> Your strength sessions as events, with the workout in each one.</p>

        <div className="mode-tabs" role="group" aria-label="Your calendar" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {PROVIDERS.map((pr) => (
            <button key={pr.id} type="button" aria-pressed={provider === pr.id} onClick={() => setProvider(pr.id)}>
              {pr.label}
            </button>
          ))}
        </div>

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

        {provider === 'apple' && (
          <div className="stack-8">
            <div>
              <a className="btn-dark" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={links.apple} onClick={added('apple')}>
                Add to Apple Calendar
              </a>
            </div>
            <p className="small muted">On iPhone, iPad or Mac, Calendar asks to subscribe. Not on an Apple device? Choose Other app.</p>
          </div>
        )}
        {provider === 'google' && (
          <div className="stack-8">
            <div>
              <a className="btn-dark" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={links.google} target="_blank" rel="noreferrer" onClick={added('google')}>
                Add to Google Calendar
              </a>
            </div>
            <p className="small muted">Opens Google Calendar and asks to add “WeddingReady training”. Google checks for new weeks about once a day.</p>
          </div>
        )}
        {provider === 'outlook' && (
          <div className="stack-8">
            <div>
              <a className="btn-dark" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={links.outlook} target="_blank" rel="noreferrer" onClick={added('outlook')}>
                Add to Outlook
              </a>
            </div>
            <p className="small muted">
              For Outlook.com and Hotmail accounts.{' '}
              <a href={links.outlookWork} target="_blank" rel="noreferrer" onClick={added('outlook')}>
                Using a work or school account?
              </a>
            </p>
          </div>
        )}
        {provider === 'file' && (
          <div className="stack-8">
            <div>
              <button type="button" className="btn-dark" onClick={download}>
                Download calendar file
              </button>
            </div>
            <p className="small muted">An .ics file that works with almost any calendar app.</p>
          </div>
        )}
        {provider !== 'file' && (
          <p className="tiny muted">
            Your calendar follows the plan as it moves through the phases and adds new weeks as they come. If you rearrange your week here later, add it again and
            remove the old one.
          </p>
        )}
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
