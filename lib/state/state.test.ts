import { describe, expect, it } from 'vitest';
import { PROTOTYPE_USER } from '../engine/fixtures';
import { emptyState, migrateState, parseImport, parseState, STATE_VERSION } from './schema';

describe('persisted state (SPEC §11)', () => {
  it('accepts a full valid state', () => {
    const s = { ...emptyState('device-1'), profile: PROTOTYPE_USER };
    s.logs.sets['2026-11-16'] = { 'goblet-squat': 2 };
    s.logs.meals['2026-11-16'] = { b: { name: 'Eggs', items: [], p: 20, c: 1, f: 10, k: 170, src: 'manual' } };
    expect(parseState(s).ok).toBe(true);
  });

  it('rejects invalid data instead of loading it', () => {
    const bad = { ...emptyState('d'), profile: { ...PROTOTYPE_USER, goals: ['lose_fat', 'maintain'] } };
    expect(parseState(bad).ok).toBe(false);
    const under18 = { ...emptyState('d'), profile: { ...PROTOTYPE_USER, age: 16 } };
    expect(parseState(under18).ok).toBe(false);
    const badDate = { ...emptyState('d'), logs: { ...emptyState().logs, sets: { 'not-a-date': {} } } };
    expect(parseState(badDate).ok).toBe(false);
  });

  it('migrates a pre-release (version 0) state that lacks newer collections', () => {
    const old = { deviceId: 'x', logs: { sets: {} }, myFoods: [], scheduleOverrides: null };
    const migrated = migrateState(old, 0);
    const r = parseState(migrated);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.logs.extras).toEqual({});
  });

  it('refuses state from a newer app version', () => {
    expect(migrateState(emptyState(), STATE_VERSION + 1)).toBeNull();
  });

  it('round-trips an export file and rejects other files', () => {
    const state = { ...emptyState('abc'), profile: PROTOTYPE_USER };
    const file = JSON.stringify({ app: 'weddingready', version: STATE_VERSION, exportedAt: '2026-11-14T00:00:00Z', state });
    const r = parseImport(file);
    expect(r.ok).toBe(true);
    expect(parseImport('{"hello":1}').ok).toBe(false);
    expect(parseImport('not json').ok).toBe(false);
  });
});
