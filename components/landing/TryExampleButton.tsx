'use client';

import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { DEMO_KEY, demoState } from '@/lib/demo';
import { todayISO } from '@/lib/engine/dates';
import { STATE_VERSION } from '@/lib/state/schema';
import { STORAGE_KEY, useApp } from '@/lib/state/store';

function hasPlanOnDevice(): boolean {
  try {
    return !!JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')?.state?.profile;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/**
 * Opens the app with a ready-made example plan, skipping setup. Hidden when
 * this device already has a plan, so it can never overwrite someone's own.
 */
export function TryExampleButton({ className }: { className: string }) {
  const hasPlan = useSyncExternalStore(subscribe, hasPlanOnDevice, () => false);
  const router = useRouter();
  if (hasPlan) return null;

  const start = () => {
    const state = demoState(todayISO(), crypto.randomUUID());
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: STATE_VERSION }));
      localStorage.setItem(DEMO_KEY, '1');
    } catch {
      /* storage blocked: the example still works for this visit */
    }
    useApp.getState().replaceState(state);
    router.push('/train');
  };

  return (
    <button type="button" onClick={start} className={className}>
      Try the example plan
    </button>
  );
}
