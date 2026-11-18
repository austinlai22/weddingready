'use client';

import { useEffect } from 'react';
import { configureAnalytics, track } from '@/lib/analytics';
import { visitorId } from '@/lib/attribution';
import { STORAGE_KEY } from '@/lib/state/store';

/** The saved device ID and opt-out, read straight from storage so marketing pages stay light. */
function savedIdentity(): { id: string | null; optOut: boolean } {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')?.state;
    return { id: typeof s?.deviceId === 'string' && s.deviceId ? s.deviceId : null, optOut: !!s?.settings?.analyticsOptOut };
  } catch {
    return { id: null, optOut: false };
  }
}

/** Counts a view of a marketing page, with where the visitor first came from. Nothing without analytics switched on. */
export function LandingAnalytics({ page }: { page: 'home' | 'how_it_works' | 'agents' }) {
  useEffect(() => {
    const { id, optOut } = savedIdentity();
    configureAnalytics(id ?? visitorId(), optOut);
    track('landing_viewed', { page });
  }, [page]);
  return null;
}
