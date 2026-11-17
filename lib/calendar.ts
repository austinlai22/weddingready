// Training sessions as calendar events: a list (for AI assistants, which add
// them with their own calendar connectors) and an .ics file (for any calendar
// app). Times are "floating": 7:00 means 7:00 wherever the calendar is.

import { addDays, daysBetween, fmtShort } from './engine/dates';
import { dayPlan, type Plan } from './engine/plan';
import type { Schedule } from './engine/schedule';
import { sessionMinutes } from './engine/workouts';
import type { WeekTemplate } from './types';

export interface CalendarEvent {
  date: string;
  start: string; // HH:MM
  minutes: number;
  title: string;
  description: string;
  uid: string;
}

export interface CalendarOptions {
  from: string;
  weeks: number;
  time?: string;
  includeActivities?: boolean;
  appUrl?: string;
}

export const MAX_CALENDAR_WEEKS = 16;

/** Strength sessions (and, optionally, the person's other activities except walks) from `from` for `weeks` weeks. */
export function calendarEvents(plan: Plan, schedule: Schedule | WeekTemplate | null, opts: CalendarOptions): CalendarEvent[] {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(opts.time ?? '') ? opts.time! : '07:00';
  const weeks = Math.min(Math.max(Math.round(opts.weeks), 1), MAX_CALENDAR_WEEKS);
  const app = opts.appUrl ?? 'https://weddingready.vercel.app';
  const start = opts.from < plan.profile.startDate ? plan.profile.startDate : opts.from;
  const end = addDays(start, weeks * 7 - 1);
  const events: CalendarEvent[] = [];
  for (let date = start; date <= end && date < plan.timeline.weddingDate; date = addDays(date, 1)) {
    const day = dayPlan(plan, schedule, date);
    if (day.status !== 'active') continue;
    for (const s of day.mainSessions) {
      if (s.kind === 'strength') {
        const lines = s.exercises.map((e) => `• ${e.exercise.name}: ${e.rx}`);
        const notes = [
          `${day.phase.label} phase, week ${day.week} of ${plan.timeline.totalWeeks}.${day.recovery ? ' Recovery week: 2 sets each.' : ''}${day.taper ? ' Final 10 days: 2 sets each.' : ''}`,
          `Warm-up (5 min): ${s.warmup}`,
          ...lines,
          `Log it in WeddingReady: ${app}/train`,
        ];
        events.push({
          date,
          start: time,
          minutes: Math.round(sessionMinutes(s.exercises) / 5) * 5,
          title: `${s.meta.title}: ${s.meta.subtitle}`,
          description: notes.join('\n'),
          uid: `${date}-${s.ref.id}@weddingready`,
        });
      } else if (opts.includeActivities && !s.isWalk) {
        events.push({ date, start: time, minutes: 45, title: s.title, description: s.how, uid: `${date}-${s.ref.id}@weddingready` });
      }
    }
  }
  return events;
}

const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// RFC 5545 lines are at most 75 octets; longer ones continue on lines starting with a space.
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Minutes `tz` is ahead of UTC at the instant `utcMs`. */
function offsetMinutes(utcMs: number, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** A wall-clock date and time in `tz` as a UTC stamp ("20261124T023000Z"), right across daylight-saving changes. */
export function utcStamp(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - offsetMinutes(guess, tz) * 60000;
  const second = guess - offsetMinutes(utc, tz) * 60000;
  if (second !== utc) utc = second;
  return new Date(utc).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const d = addDays(date, Math.floor(total / 1440));
  const rest = total % 1440;
  return { date: d, time: `${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}` };
}

/**
 * With `timeZone` (the person's, e.g. "America/Los_Angeles") times are written
 * in UTC, which Apple, Google and Outlook all read the same way. Without it
 * they're "floating" local times.
 */
export function toICS(events: CalendarEvent[], opts: { timeZone?: string; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  const tz = opts.timeZone && isTimeZone(opts.timeZone) ? opts.timeZone : null;
  const at = (date: string, time: string) => (tz ? utcStamp(date, time, tz) : stamp(date, time));
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WeddingReady//Training plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:WeddingReady training',
    ...(tz ? [`X-WR-TIMEZONE:${tz}`] : []),
    // Subscribed calendars check back about twice a day.
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ];
  for (const e of events) {
    const end = addMinutes(e.date, e.start, e.minutes);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${at(e.date, e.start)}`,
      `DTEND:${at(end.date, end.time)}`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(e.description)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** "Nov 16 to Feb 7" for the range a set of events covers. */
export function eventsRange(events: CalendarEvent[]): string {
  if (!events.length) return '';
  const first = events[0].date;
  const last = events[events.length - 1].date;
  return daysBetween(first, last) === 0 ? fmtShort(first) : `${fmtShort(first)} to ${fmtShort(last)}`;
}
