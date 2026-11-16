'use client';

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AppState, FoodItem, MealEntry, Profile, SlotId, WeekTemplate } from '../types';
import { addDays, todayISO } from '../engine/dates';
import { freezeBefore, reconcileOverrides, templateForDate, thisWeekOnly, type Schedule } from '../engine/schedule';
import { emptyState, migrateState, parseState, STATE_VERSION } from './schema';

export const STORAGE_KEY = 'weddingready-v1';

interface Actions {
  /** Saves a new or edited profile; keeps logs and the user's schedule edits where they still fit. Returns how many edits were dropped. */
  saveProfile: (p: Profile) => number;
  patchProfile: (patch: Partial<Profile>) => number;
  tapSet: (date: string, exerciseId: string, index: number) => boolean;
  setWeight: (exerciseId: string, value: number | null, unit: 'lb' | 'kg', date: string) => void;
  toggleWarmup: (date: string, sessionId: string) => void;
  setSessionDone: (date: string, sessionId: string, done: boolean) => void;
  setMeal: (date: string, slot: Exclude<SlotId, 'e'>, entry: MealEntry | null) => void;
  addExtra: (date: string, entry: MealEntry) => void;
  removeExtra: (date: string, index: number) => void;
  addMyFood: (f: FoodItem) => void;
  updateMyFood: (id: string, patch: Partial<FoodItem>) => void;
  deleteMyFood: (id: string) => void;
  /** A schedule change (drag, menu, AI or reset) that applies from `from` on; earlier days keep their layout. */
  editSchedule: (next: WeekTemplate | null, from: string) => void;
  /** A change to the rest of this week only; the usual layout returns next Monday. */
  editScheduleThisWeek: (next: WeekTemplate, from: string) => void;
  /** Puts back a schedule saved before an edit (Undo). */
  restoreSchedule: (s: Schedule) => void;
  setAnalyticsOptOut: (v: boolean) => void;
  replaceState: (s: AppState) => void;
  deleteEverything: () => void;
  ensureDeviceId: () => void;
  markHydrated: () => void;
}

export interface Store extends AppState, Actions {
  hydrated: boolean;
  /** Set when stored data failed validation and was backed up and reset. */
  loadError: string | null;
}

function newDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `d-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// localStorage can throw (private mode, quota, blocked storage). The app keeps
// working in memory and simply won't persist.
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
  },
};

function backupRaw(reason: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) localStorage.setItem(`weddingready-backup-${Date.now()}`, raw);
    console.warn(`WeddingReady: stored data was invalid and has been backed up (${reason}).`);
  } catch {
    /* nothing to back up */
  }
}

function dataOf(s: Store): AppState {
  return {
    profile: s.profile,
    scheduleOverrides: s.scheduleOverrides,
    scheduleHistory: s.scheduleHistory ?? [],
    logs: s.logs,
    myFoods: s.myFoods,
    deviceId: s.deviceId,
    settings: s.settings,
  };
}

export const useApp = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyState(),
      hydrated: false,
      loadError: null,

      saveProfile: (p) => {
        const old = get();
        const { template, dropped } = reconcileOverrides(old.scheduleOverrides, p, old.profile);
        let history = old.scheduleHistory ?? [];
        // A profile change that moves sessions applies from today: days already past keep their layout.
        const today = todayISO();
        if (old.profile && today > old.profile.startDate) {
          const oldSchedule = { overrides: old.scheduleOverrides, history };
          const yesterday = addDays(today, -1);
          const before = templateForDate(old.profile, oldSchedule, yesterday);
          const after = templateForDate(p, { overrides: template, history }, yesterday);
          if (JSON.stringify(before.days) !== JSON.stringify(after.days)) history = freezeBefore(old.profile, oldSchedule, today);
        }
        set({ profile: p, scheduleOverrides: template, scheduleHistory: history });
        return dropped;
      },
      patchProfile: (patch) => {
        const cur = get().profile;
        if (!cur) return 0;
        return get().saveProfile({ ...cur, ...patch });
      },
      tapSet: (date, exerciseId, index) => {
        const logs = get().logs;
        const got = logs.sets[date]?.[exerciseId] ?? 0;
        const undo = index < got;
        set({
          logs: { ...logs, sets: { ...logs.sets, [date]: { ...logs.sets[date], [exerciseId]: undo ? index : index + 1 } } },
        });
        return !undo;
      },
      setWeight: (exerciseId, value, unit, date) => {
        const logs = get().logs;
        const hist = (logs.weights[exerciseId] ?? []).filter((w) => w.date !== date);
        if (value !== null && Number.isFinite(value) && value >= 0) hist.push({ value, unit, date });
        hist.sort((a, b) => (a.date < b.date ? -1 : 1));
        set({ logs: { ...logs, weights: { ...logs.weights, [exerciseId]: hist.slice(-400) } } });
      },
      toggleWarmup: (date, sessionId) => {
        const logs = get().logs;
        const key = `${date}:${sessionId}`;
        set({ logs: { ...logs, warmups: { ...logs.warmups, [key]: !logs.warmups[key] } } });
      },
      setSessionDone: (date, sessionId, done) => {
        const logs = get().logs;
        const cur = new Set(logs.sessionsDone[date] ?? []);
        if (done) cur.add(sessionId);
        else cur.delete(sessionId);
        set({ logs: { ...logs, sessionsDone: { ...logs.sessionsDone, [date]: [...cur] } } });
      },
      setMeal: (date, slot, entry) => {
        const logs = get().logs;
        set({ logs: { ...logs, meals: { ...logs.meals, [date]: { ...logs.meals[date], [slot]: entry } } } });
      },
      addExtra: (date, entry) => {
        const logs = get().logs;
        set({ logs: { ...logs, extras: { ...logs.extras, [date]: [...(logs.extras[date] ?? []), entry] } } });
      },
      removeExtra: (date, index) => {
        const logs = get().logs;
        set({ logs: { ...logs, extras: { ...logs.extras, [date]: (logs.extras[date] ?? []).filter((_, i) => i !== index) } } });
      },
      addMyFood: (f) => set({ myFoods: [...get().myFoods, { ...f, mine: true }].slice(-500) }),
      updateMyFood: (id, patch) => set({ myFoods: get().myFoods.map((f) => (f.id === id ? { ...f, ...patch } : f)) }),
      deleteMyFood: (id) => set({ myFoods: get().myFoods.filter((f) => f.id !== id) }),
      editSchedule: (next, from) => {
        const s = get();
        if (!s.profile) return;
        const history = freezeBefore(s.profile, { overrides: s.scheduleOverrides, history: s.scheduleHistory ?? [] }, from);
        set({ scheduleHistory: history, scheduleOverrides: next ? { ...next, effectiveFrom: from } : null });
      },
      editScheduleThisWeek: (next, from) => {
        const s = get();
        if (!s.profile) return;
        const sched = thisWeekOnly(s.profile, { overrides: s.scheduleOverrides, history: s.scheduleHistory ?? [] }, next, from);
        set({ scheduleOverrides: sched.overrides, scheduleHistory: sched.history });
      },
      restoreSchedule: (sched) => set({ scheduleOverrides: sched.overrides, scheduleHistory: sched.history }),
      setAnalyticsOptOut: (v) => set({ settings: { ...get().settings, analyticsOptOut: v } }),
      replaceState: (s) => set({ ...s, deviceId: s.deviceId || get().deviceId || newDeviceId(), loadError: null }),
      deleteEverything: () => {
        try {
          for (const k of Object.keys(localStorage)) if (k.startsWith('weddingready')) localStorage.removeItem(k);
        } catch {
          safeStorage.removeItem(STORAGE_KEY);
        }
        set({ ...emptyState(newDeviceId()), loadError: null });
      },
      ensureDeviceId: () => {
        if (!get().deviceId) set({ deviceId: newDeviceId() });
      },
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: STORAGE_KEY,
      version: STATE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => dataOf(s),
      migrate: (persisted, version) => migrateState(persisted, version) as AppState,
      merge: (persisted, current) => {
        if (persisted === undefined || persisted === null) return current;
        const parsed = parseState(persisted);
        if (!parsed.ok) {
          backupRaw(parsed.error);
          return { ...current, loadError: 'Your saved data couldn’t be read, so the app started fresh. A backup copy is kept on this device.' };
        }
        return { ...current, ...parsed.state };
      },
      // Rehydrated from a client effect (HydrationGate) so the server render and
      // the first client render match.
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        const s = useApp.getState();
        if (error) {
          backupRaw(String(error));
          useApp.setState({ loadError: 'Your saved data couldn’t be read, so the app started fresh. A backup copy is kept on this device.' });
        }
        s.ensureDeviceId();
        s.markHydrated();
      },
    },
  ),
);

export function exportData(s: AppState) {
  return { app: 'weddingready' as const, version: STATE_VERSION, exportedAt: new Date().toISOString(), state: s };
}

export function currentData(): AppState {
  return dataOf(useApp.getState());
}
