import type { Activity, Equipment, Experience, FocusArea, Goal } from '../types';
import { DAY_NAMES } from './dates';
import { isHardActivity, placeStrengthDays } from './split';

// "Choose for me": a week for someone who doesn't know how many days to train.
// Rules, not guesswork, from widely used guidance:
// - New lifters progress well on 2–3 full-body sessions a week; 3 trains each
//   muscle three times a week, which is plenty while learning the moves.
// - Lifters with some experience and a strength goal do well on an
//   upper/lower split (4 days); experienced ones with a long runway, 5.
// - Adults are advised to get about 150 minutes of moderate activity a week
//   alongside strength training; easy cardio fills the gap without hurting
//   recovery, a little more of it when the goal is losing fat.
// - A week already full of hard sessions gets one fewer strength day.

export const EASY_CARDIO_ID = 'easy-cardio';
export const EASY_CARDIO_LABEL = 'Easy cardio';

export interface WeekRecommendation {
  strengthDays: 2 | 3 | 4 | 5;
  /** Easy cardio to add (as an activity on chosen days), or null when what they do already covers it. */
  cardio: Activity | null;
  reasons: string[];
}

interface Inputs {
  goals: Goal[];
  experience: Experience;
  weeksToWedding: number;
  /** What they already do (any earlier easy-cardio suggestion is ignored). */
  activities: Activity[];
  dailyWalkMinutes?: number;
  equipment: Equipment;
  focusAreas: FocusArea[];
}

const ACTIVE_MINUTES_GOAL = 150;
const MINUTES_PER_HARD_SESSION = 45;

function strengthDaysFor(i: Inputs): { days: 2 | 3 | 4 | 5; why: string } {
  if (i.weeksToWedding < 4) return { days: 2, why: 'With under a month to go, 2 full-body days keep you strong without anything new to recover from.' };
  const wantsStrength = i.goals.includes('strength');
  if (i.experience === 'new') {
    return i.weeksToWedding >= 8 && !(i.goals.length === 1 && i.goals[0] === 'maintain')
      ? { days: 3, why: '3 full-body strength days: the most reliable start for someone new. Each muscle gets worked three times a week while you learn the moves, with a rest day between sessions.' }
      : { days: 2, why: '2 full-body strength days: enough to build the habit and get stronger, with plenty of recovery.' };
  }
  if (i.experience === 'experienced' && wantsStrength && i.weeksToWedding >= 12) {
    return { days: 5, why: '5 days (upper, lower, push, pull, legs): every muscle twice a week, the volume an experienced lifter needs to keep progressing.' };
  }
  if (wantsStrength || i.experience === 'experienced') {
    return { days: 4, why: '4 days, upper and lower body: every muscle twice a week, and back-to-back days are fine because they work different muscles.' };
  }
  return { days: 3, why: '3 full-body strength days: every muscle trained regularly, with a rest day between sessions.' };
}

export function recommendWeek(i: Inputs): WeekRecommendation {
  const own = i.activities.filter((a) => a.id !== EASY_CARDIO_ID);
  const hardSessions = own.filter((a) => isHardActivity(a.type)).reduce((t, a) => t + new Set(a.days).size, 0);
  const first = strengthDaysFor(i);
  let days = first.days;
  const reasons = [first.why];
  if (hardSessions >= 4 && days > 2) {
    days = (days - 1) as 2 | 3 | 4;
    reasons.push(`One fewer strength day because you already do ${hardSessions} hard sessions a week; recovery matters as much as the training.`);
  }

  // Easy cardio to reach ~150 active minutes, counting what they already do.
  const walkPerWeek = (i.dailyWalkMinutes ?? 0) >= 20 ? (i.dailyWalkMinutes ?? 0) * 7 : 0;
  const ownMinutes = hardSessions * MINUTES_PER_HARD_SESSION + walkPerWeek;
  const losingFat = i.goals.includes('lose_fat');
  const want = losingFat ? { sessions: 3, minutes: 35 } : { sessions: 2, minutes: 30 };
  const shortfall = ACTIVE_MINUTES_GOAL + (losingFat ? 45 : 0) - ownMinutes;
  const sessions = i.weeksToWedding < 4 ? 0 : Math.min(want.sessions, Math.max(0, Math.ceil(shortfall / want.minutes)));

  let cardio: Activity | null = null;
  if (sessions > 0) {
    const strength = new Set(placeStrengthDays(days, own, i.equipment, i.focusAreas));
    const busy = new Set(own.filter((a) => isHardActivity(a.type)).flatMap((a) => a.days));
    // Free days first (no lifting, no hard session), spread out; then strength days if needed.
    const free = [0, 1, 2, 3, 4, 5, 6].filter((d) => !strength.has(d) && !busy.has(d));
    const pick: number[] = [];
    const spread = [...free].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3)); // a mid-week day first
    for (const d of spread) {
      if (pick.length >= sessions) break;
      if (!pick.some((p) => Math.abs(p - d) === 1)) pick.push(d);
    }
    for (const d of [...free, ...[...strength].sort()]) {
      if (pick.length >= sessions) break;
      if (!pick.includes(d)) pick.push(d);
    }
    pick.sort((a, b) => a - b);
    cardio = { id: EASY_CARDIO_ID, type: 'walk', label: EASY_CARDIO_LABEL, days: pick, minutes: want.minutes };
    reasons.push(
      `${pick.length} easy cardio session${pick.length === 1 ? '' : 's'} of ${want.minutes} minutes (${pick.map((d) => DAY_NAMES[d]).join(', ')}): a brisk walk, bike or swim at a pace you could talk through. ` +
        (losingFat ? 'With your strength days that’s a steady amount of activity for losing fat, without getting in the way of recovery.' : 'With your strength days that’s about the 150 active minutes a week adults are advised to get.'),
    );
  } else if (i.weeksToWedding >= 4) {
    reasons.push('No extra cardio: what you already do covers the 150 active minutes a week adults are advised to get.');
  }
  return { strengthDays: days, cardio, reasons };
}
