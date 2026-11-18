import { describe, expect, it } from 'vitest';
import { applyDescription, normalizeSetup, SetupModelSchema, type SetupModelOutput } from './describe';
import { emptyDraft } from './draft';

const blank: SetupModelOutput = { wedding_date: '', fitting_date: '', outfit: 'unknown', goals: [], experience: 'unknown', strength_days: 0, session_minutes: 0, equipment: 'unknown', activities: [], job: 'unknown', daily_walk_minutes: 0, diet: 'unknown', avoid: [], treat: '' };
const TODAY = '2026-11-18';
const ids = (type: string, i: number) => `${type}-test-${i}`;

describe('describe yourself', () => {
  it('fills only what was said, and lists everything it set', () => {
    const s = normalizeSetup(
      {
        ...blank,
        wedding_date: '2027-10-16',
        fitting_date: '2027-10-02',
        outfit: 'dress',
        goals: ['tone', 'lose_fat'],
        strength_days: 3,
        session_minutes: 50,
        equipment: 'home_dumbbells',
        activities: [
          { type: 'run', label: 'Run', days: ['tue'], minutes: 0 },
          { type: 'pilates', label: 'Pilates', days: ['sat', 'sat'], minutes: 45 },
        ],
        diet: 'vegetarian',
      },
      TODAY,
      'Wedding October 16, fitting October 2.',
    );
    expect(s.skipped).toEqual([]);
    const { draft, filled } = applyDescription(emptyDraft('imperial'), s, ids);
    expect(draft).toMatchObject({ weddingDate: '2027-10-16', fittingDate: '2027-10-02', outfit: 'dress', goals: ['tone', 'lose_fat'], strengthDays: 3, sessionMinutes: 45, equipment: 'home_db', diet: 'vegetarian' });
    expect(draft.focusAreas).toEqual(['shoulders', 'upper_back', 'arms']);
    expect(draft.activities).toEqual([
      { id: 'run-test-0', type: 'run', label: 'Run', days: [1] },
      { id: 'pilates-test-1', type: 'pilates', label: 'Pilates', days: [5], minutes: 45 },
    ]);
    expect(filled).toEqual(['Wedding: Oct 16, 2027', 'Fitting: Oct 2, 2027', 'Wearing a dress', 'Goals: tone, lose fat', '3 strength days a week', '45-minute sessions', 'Training with dumbbells at home', 'Run: Tue', 'Pilates: Sat, 45 min', 'Eating: vegetarian']);
    // Body and health fields don't exist, so they can't be filled.
    expect(Object.keys(SetupModelSchema.shape)).not.toEqual(expect.arrayContaining(['weight', 'age', 'height']));
    expect(draft.weight).toBe('');
    expect(draft.age).toBe('');
  });

  it('turns down values the plan can’t use, and says so', () => {
    const s = normalizeSetup({ ...blank, wedding_date: '2025-06-01', fitting_date: '2027-13-40', strength_days: 6, session_minutes: 120, goals: ['lose_fat', 'maintain'], activities: [{ type: 'yoga', label: 'Yoga', days: [], minutes: 0 }] }, TODAY, 'June 1 2025, 13/40');
    expect(s.weddingDate).toBeUndefined();
    expect(s.fittingDate).toBeUndefined();
    expect(s.strengthDays).toBeUndefined();
    expect(s.sessionMinutes).toBeUndefined();
    expect(s.goals).toEqual(['lose_fat']);
    expect(s.activities).toBeUndefined();
    expect(s.skipped).toHaveLength(6);
  });

  it('a fitting after the wedding isn’t used; nothing already there is duplicated', () => {
    expect(normalizeSetup({ ...blank, wedding_date: '2027-06-01', fitting_date: '2027-07-01' }, TODAY, 'June 1, fitting July 1').fittingDate).toBeUndefined();
    const d = { ...emptyDraft('imperial'), activities: [{ id: 'run-1', type: 'run' as const, label: 'Run', days: [1] }], avoid: 'mushrooms' };
    const { draft, filled } = applyDescription(d, normalizeSetup({ ...blank, activities: [{ type: 'run', label: 'Run', days: ['tue'], minutes: 0 }], avoid: ['Mushrooms', 'shrimp'] }, TODAY, ''), ids);
    expect(draft.activities).toHaveLength(1);
    expect(draft.avoid).toBe('mushrooms, shrimp');
    expect(filled).toEqual(['Avoiding: shrimp']);
  });
});

describe('dates in a description', async () => {
  const { dayGiven } = await import('./describe');
  it('needs the day next to its month', () => {
    expect(dayGiven('2027-10-16', 'Wedding is October 16 next year')).toBe(true);
    expect(dayGiven('2027-10-16', 'on the 16th of Oct')).toBe(true);
    expect(dayGiven('2027-10-16', 'the sixteenth of October')).toBe(true);
    expect(dayGiven('2027-10-16', 'wedding 10/16/27')).toBe(true);
    expect(dayGiven('2027-05-03', 'Wedding in May, 3 days a week')).toBe(false);
    expect(dayGiven('2027-05-01', 'Wedding in May')).toBe(false);
    expect(dayGiven('2027-06-21', 'June twenty-first')).toBe(true);
  });
  it('a month and day with no year means the next one; a year they wrote stays', () => {
    const blankish = { wedding_date: '2026-10-16', fitting_date: '', outfit: 'unknown', goals: [], experience: 'unknown', strength_days: 0, session_minutes: 0, equipment: 'unknown', activities: [], job: 'unknown', daily_walk_minutes: 0, diet: 'none', avoid: [], treat: '' } as const;
    expect(normalizeSetup({ ...blankish, goals: [], activities: [], avoid: [] }, '2026-11-18', 'Wedding October 16').weddingDate).toBe('2027-10-16');
    expect(normalizeSetup({ ...blankish, goals: [], activities: [], avoid: [] }, '2026-11-18', 'Wedding October 16 2026').weddingDate).toBeUndefined();
    // "none" for diet isn't filled in: it's the default and usually wasn't said.
    expect(normalizeSetup({ ...blankish, goals: [], activities: [], avoid: [] }, '2026-11-18', 'Wedding October 16').diet).toBeUndefined();
  });
});
