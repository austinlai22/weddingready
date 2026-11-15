import type { ActivityType, WorkoutKey } from '../types';
import type { PhaseName } from './phases';

// Written copy (no AI). Voice: short, warm, never shaming, gender-neutral.

export const PHASE_COPY: Record<PhaseName, { focus: string; sets: string; rest: string; closer: string }> = {
  foundation: {
    focus: 'Learn the moves and lock in the habit.',
    sets: '3 × 10–12',
    rest: '60–90 sec',
    closer: 'Every rep now is the foundation for the big day.',
  },
  strength: {
    focus: 'Go heavier on the big lifts.',
    sets: '4 × 8–10 on the main lifts',
    rest: '90–120 sec',
    closer: 'Stronger every week. Keep stacking it.',
  },
  shape: {
    focus: 'Extra work for your focus muscles.',
    sets: '+1 set on focus muscles',
    rest: '60–90 sec',
    closer: 'This is the phase your outfit will show off.',
  },
  build: {
    focus: 'Heavier main lifts plus extra work for your focus muscles.',
    sets: '4 sets on main lifts and focus muscles',
    rest: '90–120 sec main · 60–90 sec others',
    closer: 'Short timeline, smart plan. Keep showing up.',
  },
  maintain: {
    focus: 'Hold your strength and feel fresh. Same weights, nothing new.',
    sets: 'Same weights, 3 sets',
    rest: '60–90 sec',
    closer: 'You’ve already done the work. Walk in feeling strong.',
  },
  feelgood: {
    focus: 'Move, sleep well and feel good. No big changes this close to the day.',
    sets: 'Same weights, 3 sets',
    rest: '60–90 sec',
    closer: 'Feel good, rest well, enjoy it.',
  },
};

export const STRENGTH_PEP: Record<WorkoutKey, string[]> = {
  A: ['Strong legs, strong shoulders. Let’s go.', 'Big lifts first, then the details.', 'Steady reps, good form. You’ve got this.'],
  B: ['Back and posture day. Stand tall for the aisle.', 'Glutes and back. Every set counts.', 'Pull, push, hold. Feel strong.'],
  C: ['Full body today. Smooth and steady.', 'A little of everything. Make it count.', 'Consistent, not perfect.'],
  U: ['Shoulders, back and arms. Let’s build.', 'Upper body day. Good posture starts here.', 'Pull as hard as you push.'],
  L: ['Legs and glutes. Strong from the ground up.', 'Big lifts, steady pace.', 'Drive through the floor.'],
  F: ['Your focus muscles, your way.', 'Extra work where you want it most.', 'Small muscles, big difference.'],
};

export const ACTIVITY_PEP: Record<ActivityType, string> = {
  walk: 'Your walk is today’s workout. Put on a good playlist.',
  run: 'Easy miles count. Keep it conversational.',
  pilates: 'Core, posture, and that tall walk down the aisle.',
  yoga: 'Breathe, stretch, recover. This counts too.',
  cycling: 'Spin it out. Easy effort is the point.',
  classes: 'Enjoy the class. Go at your own pace.',
  sports: 'Play, have fun, warm up first.',
  other: 'Your session, your way. It all adds up.',
};

export const REST_PEP = ['Rest is part of the plan. Recover well.', 'A walk if you feel like it, or a full rest day.', 'Recovery is where you get stronger.'];

export function activityHow(type: ActivityType, label: string, phase: PhaseName, taper: boolean, walkMinutes?: number): string {
  if (taper) {
    return type === 'walk'
      ? 'Keep your walk easy. Fresh legs for the big day.'
      : `${label} as usual, at an easy effort. Nothing new this close to the day.`;
  }
  switch (type) {
    case 'walk':
      return walkMinutes ? `${walkMinutes} minutes of walking. Steady pace, any route.` : 'A steady walk, any route.';
    case 'run':
      return phase === 'maintain' || phase === 'feelgood'
        ? 'Easy, at a pace where you can talk. Keep the distance familiar.'
        : 'Easy, at a pace where you can talk. Add 5 minutes every 3–4 weeks if it feels good.';
    case 'pilates':
      return 'Pilates as you do it now, for core strength and posture.';
    case 'yoga':
      return 'Yoga as you do it now. Great for mobility and recovery.';
    case 'cycling':
      return 'Easy to moderate effort. Keep most rides relaxed.';
    case 'classes':
      return 'Your class as usual. Go lighter if your legs are tired from strength day.';
    case 'sports':
      return 'Play as usual. Warm up for 5 minutes first.';
    default:
      return `${label}, the way you usually do it.`;
  }
}

export const EAT_CLOSER = 'Fuel the work. Strong is the goal.';

export function rotateLine<T>(lines: T[], seed: number): T {
  return lines[((seed % lines.length) + lines.length) % lines.length];
}
