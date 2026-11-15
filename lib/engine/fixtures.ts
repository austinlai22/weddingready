import type { Profile } from '../types';

/** SPEC §15 reference-prototype user (no name: the prototype's personal data never ships). */
export const PROTOTYPE_USER: Profile = {
  version: 1,
  weddingDate: '2027-10-17',
  age: 26,
  sex: 'female',
  heightCm: 162.6,
  weightKg: 61.2,
  units: 'imperial',
  outfit: 'dress',
  goals: ['tone', 'lose_fat'],
  focusAreas: ['shoulders', 'upper_back', 'arms'],
  strengthDays: 2,
  equipment: 'home_db',
  experience: 'some',
  sessionMinutes: 60,
  activities: [
    { id: 'run', type: 'run', label: 'Easy run', days: [1] },
    { id: 'pilates', type: 'pilates', label: 'Pilates', days: [5] },
    { id: 'walk', type: 'walk', label: '60-minute walk', days: [0, 1, 2, 3, 4, 5, 6], minutes: 60 },
  ],
  job: 'sitting',
  dailyWalkMinutes: 60,
  nutritionMode: 'habits_numbers',
  diet: 'none',
  avoid: [],
  treat: 'ice cream',
  safety: { pregnantOrPostpartum: false, edHistory: false, medicalCondition: false },
  startDate: '2026-11-16',
};
