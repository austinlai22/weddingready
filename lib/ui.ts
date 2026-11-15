'use client';

import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { buildPlan, type Plan } from './engine/plan';
import { todayISO } from './engine/dates';
import { useApp } from './state/store';

// Session-only UI state shared by Train and Eat (not persisted).
interface Ui {
  selected: string | null;
  rest: { endAt: number; min: number; max: number } | null;
  restReady: { max: number } | null;
  toast: { text: string; undo?: () => void } | null;
  select: (d: string | null) => void;
  startRest: (min: number, max: number) => void;
  stopRest: () => void;
  showToast: (text: string, undo?: () => void) => void;
  hideToast: () => void;
}

export const useUi = create<Ui>((set) => ({
  selected: null,
  rest: null,
  restReady: null,
  toast: null,
  select: (d) => set({ selected: d }),
  startRest: (min, max) => set({ rest: { endAt: Date.now() + min * 1000, min, max }, restReady: null }),
  stopRest: () => set({ rest: null, restReady: null }),
  showToast: (text, undo) => set({ toast: { text, undo } }),
  hideToast: () => set({ toast: null }),
}));

/** Today's local date; re-checks every minute so the app rolls over at midnight. */
export function useToday(): string {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const id = setInterval(() => {
      const t = todayISO();
      setToday((cur) => (cur === t ? cur : t));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

export function usePlan(): Plan | null {
  const profile = useApp((s) => s.profile);
  return useMemo(() => (profile ? buildPlan(profile) : null), [profile]);
}

/** The day the Train/Eat views show: the picked day, or today (or Day 1 before the plan starts). */
export function useViewDate(plan: Plan | null, today: string): string {
  const selected = useUi((s) => s.selected);
  if (selected) return selected;
  if (plan && today < plan.profile.startDate) return plan.profile.startDate;
  return today;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export const kgToLb = (kg: number) => kg * 2.20462;
export const lbToKg = (lb: number) => lb / 2.20462;
export const cmToFtIn = (cm: number) => {
  const totalIn = Math.round(cm / 2.54);
  return { ft: Math.floor(totalIn / 12), inch: totalIn % 12 };
};
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * 2.54;
