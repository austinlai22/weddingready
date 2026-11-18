'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { track } from '@/lib/analytics';
import { STORAGE_KEY } from '@/lib/state/store';

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

/** "Start my plan" for new visitors; "Open my plan" for someone who already has one on this device. */
export function OpenAppLink({ className, startLabel = 'Start my plan', where }: { className: string; startLabel?: string; where: string }) {
  const hasPlan = useSyncExternalStore(subscribe, hasPlanOnDevice, () => false);
  return (
    <Link href={hasPlan ? '/train' : '/setup'} className={className} data-cta={where} onClick={() => track('cta_clicked', { where, has_plan: hasPlan })}>
      {hasPlan ? 'Open my plan' : startLabel}
    </Link>
  );
}
