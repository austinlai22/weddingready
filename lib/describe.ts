// "Describe yourself": one sentence about the wedding and the person's week
// fills in setup. The model only reads the sentence into these fields; every
// value is checked here, the app lists exactly what it filled (worked out from
// the draft, not from the model's say-so), and nothing about body or health is
// read at all: there are no fields for it.

import { z } from 'zod';
import { addDays, DAY_NAMES, fmtMedium, isISODate } from './engine/dates';
import { defaultFocus, MAX_PLAN_DAYS, type Draft } from './draft';
import { ACTIVITY_TYPES, DAY_IDS, type Activity, type ActivityType, type Diet, type Equipment, type Experience, type Goal, type Job, type Outfit } from './types';

export const DescribeRequestSchema = z.object({
  deviceId: z.string().min(8).max(64),
  today: z.string().refine(isISODate, 'Expected YYYY-MM-DD'),
  text: z.string().trim().min(3).max(600),
});
export type DescribeRequest = z.infer<typeof DescribeRequestSchema>;

const DIETS = ['none', 'vegetarian', 'vegan', 'pescatarian', 'no_pork', 'gluten_free', 'dairy_free'] as const;

/** What the model returns: '' / 0 / 'unknown' / [] for anything not stated (plain values, so every free model can follow it). */
export const SetupModelSchema = z.object({
  wedding_date: z.string().max(10).describe('YYYY-MM-DD, or "" if not stated'),
  fitting_date: z.string().max(10).describe('YYYY-MM-DD of an outfit fitting, or ""'),
  outfit: z.enum(['dress', 'suit', 'other', 'unknown']),
  goals: z.array(z.enum(['tone', 'strength', 'lose_fat', 'maintain'])).max(4),
  experience: z.enum(['new', 'some', 'experienced', 'unknown']).describe('With strength training'),
  strength_days: z.number().int().min(0).max(7).describe('Strength sessions a week they want, or 0'),
  session_minutes: z.number().int().min(0).max(240).describe('Minutes per strength session, or 0'),
  equipment: z.enum(['home_dumbbells', 'gym', 'bodyweight', 'unknown']),
  activities: z
    .array(
      z.object({
        type: z.enum(ACTIVITY_TYPES),
        label: z.string().max(40).describe('Their words, e.g. "Spin class"'),
        days: z.array(z.enum(DAY_IDS)).max(7),
        minutes: z.number().int().min(0).max(300).describe('0 if not stated'),
      }),
    )
    .max(8)
    .describe('Regular weekly activities other than strength training'),
  job: z.enum(['sitting', 'mixed', 'on_feet', 'unknown']).describe('What most of their working day looks like'),
  daily_walk_minutes: z.number().int().min(0).max(300).describe('Walking on most days, or 0'),
  diet: z.enum([...DIETS, 'unknown']),
  avoid: z.array(z.string().max(40)).max(10).describe('Foods they avoid or dislike'),
  treat: z.string().max(60).describe('A treat they want to keep, or ""'),
});
export type SetupModelOutput = z.infer<typeof SetupModelSchema>;

/** Checked values, only for what was stated and usable. */
export interface SetupFromText {
  weddingDate?: string;
  fittingDate?: string;
  outfit?: Outfit;
  goals?: Goal[];
  experience?: Experience;
  strengthDays?: 2 | 3 | 4 | 5;
  sessionMinutes?: 30 | 45 | 60;
  equipment?: Equipment;
  activities?: Omit<Activity, 'id'>[];
  job?: Job;
  dailyWalkMinutes?: number;
  diet?: Diet;
  avoid?: string[];
  treat?: string;
  /** Things it read but couldn't use, in plain words. */
  skipped: string[];
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty-first', 'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth', 'twenty-sixth', 'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth', 'thirty-first'];

const MONTHS = ['jan(uary)?', 'feb(ruary)?', 'mar(ch)?', 'apr(il)?', 'may', 'june?', 'july?', 'aug(ust)?', 'sep(t|tember)?', 'oct(ober)?', 'nov(ember)?', 'dec(ember)?'];

/**
 * Whether the person gave this day next to its month ("October 16", "16th of
 * Oct", "the sixteenth of October", "10/16"), so "in May, 3 days a week" never
 * becomes May 3.
 */
export function dayGiven(date: string, text: string): boolean {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const name = `(${MONTHS[month - 1]})\\.?`;
  const num = `0?${day}(st|nd|rd|th)?`;
  const word = ORDINALS[day - 1].replace('-', '[- ]');
  const t = text.toLowerCase();
  return [
    `\\b${name}\\s+(the\\s+)?(${num}|${word})\\b`,
    `\\b(${num}|${word})\\s+(of\\s+)?${name}\\b`,
    `\\b0?${month}[/.-]0?${day}\\b`,
    `\\b0?${day}[/.-]0?${month}\\b`,
    `\\b\\d{4}-0?${month}-0?${day}\\b`,
  ].some((p) => new RegExp(p, 'i').test(t));
}

/**
 * A date the model put in the past although the person gave no year ("October
 * 16") means the next one; a year they wrote is kept as written.
 */
function nextOccurrence(date: string, today: string, text: string): string {
  if (date > today || text.includes(date.slice(0, 4))) return date;
  let d = date;
  for (let i = 0; i < 3 && d <= today; i++) d = `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
  return isISODate(d) ? d : date;
}

const EQUIPMENT: Record<string, Equipment> = { home_dumbbells: 'home_db', gym: 'gym', bodyweight: 'bodyweight' };

/** Keeps what's usable from the model's reading of the sentence. Pure, so it's tested directly. */
export function normalizeSetup(m: SetupModelOutput, today: string, text: string): SetupFromText {
  const out: SetupFromText = { skipped: [] };
  const latest = addDays(today, MAX_PLAN_DAYS);
  if (m.wedding_date) {
    const w = isISODate(m.wedding_date) ? nextOccurrence(m.wedding_date, today, text) : '';
    if (w && !dayGiven(w, text)) out.skipped.push('the wedding date (add the day, e.g. “May 12”)');
    else if (w && w > today && w <= latest) out.weddingDate = w;
    else out.skipped.push('the wedding date (it needs to be in the next two years)');
  }
  if (m.fitting_date) {
    const f = isISODate(m.fitting_date) ? nextOccurrence(m.fitting_date, today, text) : '';
    const before = out.weddingDate ?? latest;
    if (f && !dayGiven(f, text)) out.skipped.push('the fitting date (add the day)');
    else if (f && f >= today && f < before) out.fittingDate = f;
    else out.skipped.push('the fitting date (it needs to be after today and before the wedding)');
  }
  if (m.outfit !== 'unknown') out.outfit = m.outfit;
  if (m.goals.length) {
    let goals = [...new Set(m.goals)] as Goal[];
    if (goals.includes('lose_fat') && goals.includes('maintain')) {
      goals = goals.filter((g) => g !== 'maintain');
      out.skipped.push('Maintain (it can’t be on with Lose fat)');
    }
    out.goals = goals;
  }
  if (m.experience !== 'unknown') out.experience = m.experience;
  if (m.strength_days) {
    if (m.strength_days >= 2 && m.strength_days <= 5) out.strengthDays = m.strength_days as 2 | 3 | 4 | 5;
    else out.skipped.push(`${m.strength_days} strength days (the plan does 2 to 5)`);
  }
  if (m.session_minutes) {
    if (m.session_minutes >= 20 && m.session_minutes <= 90) {
      out.sessionMinutes = ([30, 45, 60] as const).reduce((best, v) => (Math.abs(v - m.session_minutes) < Math.abs(best - m.session_minutes) ? v : best));
    } else out.skipped.push(`${m.session_minutes}-minute sessions (the plan does 30, 45 or 60)`);
  }
  if (m.equipment !== 'unknown') out.equipment = EQUIPMENT[m.equipment];
  const activities: Omit<Activity, 'id'>[] = [];
  for (const a of m.activities) {
    const days = [...new Set(a.days.map((d) => DAY_IDS.indexOf(d)))].sort((x, y) => x - y);
    if (!days.length) {
      out.skipped.push(`${a.label || a.type} (no days given)`);
      continue;
    }
    const raw = (a.label || TYPE_LABEL[a.type]).trim().slice(0, 40);
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (activities.some((x) => x.type === a.type && x.label.toLowerCase() === label.toLowerCase())) continue;
    activities.push({ type: a.type, label, days, ...(a.minutes >= 5 ? { minutes: a.minutes } : {}) });
  }
  if (activities.length) out.activities = activities;
  if (m.job !== 'unknown') out.job = m.job;
  if (m.daily_walk_minutes >= 5) out.dailyWalkMinutes = m.daily_walk_minutes;
  // "none" is the default, and models often put it when diet wasn't mentioned.
  if (m.diet !== 'unknown' && m.diet !== 'none') out.diet = m.diet;
  const avoid = m.avoid.map((s) => s.trim()).filter(Boolean);
  if (avoid.length) out.avoid = avoid;
  if (m.treat.trim()) out.treat = m.treat.trim().slice(0, 60);
  return out;
}

const TYPE_LABEL: Record<ActivityType, string> = { walk: 'Walk', run: 'Run', pilates: 'Pilates', yoga: 'Yoga', cycling: 'Cycling', classes: 'Class', sports: 'Sports', other: 'Activity' };
const GOAL_LABEL: Record<Goal, string> = { tone: 'tone', strength: 'strength', lose_fat: 'lose fat', maintain: 'maintain' };
const EQUIPMENT_LABEL: Record<Equipment, string> = { home_db: 'dumbbells at home', gym: 'a gym', bodyweight: 'no equipment' };
const JOB_LABEL: Record<Job, string> = { sitting: 'mostly sitting', mixed: 'a mix of sitting and moving', on_feet: 'on your feet' };
const DIET_LABEL: Record<Diet, string> = { none: 'no restrictions', vegetarian: 'vegetarian', vegan: 'vegan', pescatarian: 'pescatarian', no_pork: 'no pork', gluten_free: 'gluten-free', dairy_free: 'dairy-free' };
const OUTFIT_LABEL: Record<Outfit, string> = { dress: 'a dress', suit: 'a suit or tux', other: 'something else' };

const dayList = (days: number[]) => days.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ');

/**
 * Puts the checked values into the setup draft. `filled` lists, in plain
 * words, every value it set (including ones that match a default), so the
 * person can see what it understood and check it.
 */
export function applyDescription(d: Draft, s: SetupFromText, newId: (type: ActivityType, i: number) => string): { draft: Draft; filled: string[] } {
  const next: Draft = { ...d };
  const filled: string[] = [];
  if (s.weddingDate) {
    next.weddingDate = s.weddingDate;
    filled.push(`Wedding: ${fmtMedium(s.weddingDate)}`);
  }
  if (s.fittingDate) {
    next.fittingDate = s.fittingDate;
    next.fittingUnknown = false;
    filled.push(`Fitting: ${fmtMedium(s.fittingDate)}`);
  }
  if (s.outfit) {
    next.outfit = s.outfit;
    if (!d.focusTouched && s.outfit !== d.outfit) next.focusAreas = defaultFocus(s.outfit, d.sex);
    filled.push(`Wearing ${OUTFIT_LABEL[s.outfit]}`);
  }
  if (s.goals) {
    next.goals = s.goals;
    filled.push(`Goals: ${s.goals.map((g) => GOAL_LABEL[g]).join(', ')}`);
  }
  if (s.experience) {
    next.experience = s.experience;
    filled.push(`Experience: ${s.experience === 'new' ? 'new to strength training' : s.experience}`);
  }
  if (s.strengthDays) {
    next.strengthDays = s.strengthDays;
    filled.push(`${s.strengthDays} strength days a week`);
  }
  if (s.sessionMinutes) {
    next.sessionMinutes = s.sessionMinutes;
    filled.push(`${s.sessionMinutes}-minute sessions`);
  }
  if (s.equipment) {
    next.equipment = s.equipment;
    filled.push(`Training with ${EQUIPMENT_LABEL[s.equipment]}`);
  }
  if (s.activities) {
    const added: Activity[] = [];
    s.activities.forEach((a, i) => {
      const same = next.activities.some((x) => x.type === a.type && x.days.join() === a.days.join());
      if (!same) added.push({ ...a, id: newId(a.type, i) });
    });
    if (added.length) {
      next.activities = [...next.activities, ...added];
      for (const a of added) filled.push(`${a.label}: ${dayList(a.days)}${a.minutes ? `, ${a.minutes} min` : ''}`);
    }
  }
  if (s.job) {
    next.job = s.job;
    filled.push(`Most days: ${JOB_LABEL[s.job]}`);
  }
  if (s.dailyWalkMinutes) {
    next.walkMinutes = String(s.dailyWalkMinutes);
    filled.push(`About ${s.dailyWalkMinutes} minutes of walking a day`);
  }
  if (s.diet) {
    next.diet = s.diet;
    filled.push(`Eating: ${DIET_LABEL[s.diet]}`);
  }
  if (s.avoid) {
    const have = d.avoid.split(',').map((x) => x.trim()).filter(Boolean);
    const add = s.avoid.filter((x) => !have.some((h) => h.toLowerCase() === x.toLowerCase()));
    if (add.length) {
      next.avoid = [...have, ...add].join(', ');
      filled.push(`Avoiding: ${add.join(', ')}`);
    }
  }
  if (s.treat) {
    next.treat = s.treat;
    filled.push(`Treat to keep: ${s.treat}`);
  }
  return { draft: next, filled };
}
