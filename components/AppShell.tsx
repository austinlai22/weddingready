'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { configureAnalytics } from '@/lib/analytics';
import { DEMO_KEY } from '@/lib/demo';
import { useApp } from '@/lib/state/store';
import { useUi } from '@/lib/ui';
import { Gear } from './ui/icons';

const TABS = [
  { href: '/train', label: 'Train' },
  { href: '/eat', label: 'Eat' },
  { href: '/plan', label: 'Plan' },
] as const;

/** Loads saved data on the client, then shows setup or the app. */
export function HydrationGate({ children, requireProfile = true }: { children: React.ReactNode; requireProfile?: boolean }) {
  const hydrated = useApp((s) => s.hydrated);
  const hasProfile = useApp((s) => !!s.profile);
  const deviceId = useApp((s) => s.deviceId);
  const optOut = useApp((s) => s.settings.analyticsOptOut);
  const router = useRouter();

  useEffect(() => {
    if (!useApp.getState().hydrated) void useApp.persist.rehydrate();
  }, []);
  useEffect(() => {
    if (hydrated && deviceId) configureAnalytics(deviceId, optOut);
  }, [hydrated, deviceId, optOut]);
  useEffect(() => {
    if (hydrated && requireProfile && !hasProfile) router.replace('/setup');
  }, [hydrated, requireProfile, hasProfile, router]);

  if (!hydrated || (requireProfile && !hasProfile)) {
    return (
      <div className="app-main" aria-busy="true">
        <div className="stack" style={{ paddingTop: 80, alignItems: 'center' }}>
          <p className="muted small">Loading your plan…</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function TopNav() {
  const path = usePathname();
  return (
    <div className="top-bar">
      <div className="top-inner">
        <nav aria-label="Sections" className="seg">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="seg-btn" aria-current={path === t.href ? 'page' : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        <Link href="/settings" className="icon-btn" aria-label="Settings" aria-current={path === '/settings' ? 'page' : undefined}>
          <Gear />
        </Link>
      </div>
    </div>
  );
}

export function Closer({ line }: { line: string }) {
  return (
    <section className="closer" aria-label="About this plan">
      <p className="big">{line}</p>
      <p className="fine">
        Progress saves on this device and browser only. General guidance, not medical advice, and not from a certified trainer or dietitian. If any exercise causes pain, stop it.{' '}
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
      </p>
    </section>
  );
}

export function LoadErrorNotice() {
  const loadError = useApp((s) => s.loadError);
  if (!loadError) return null;
  return (
    <div className="banner" role="alert">
      <strong>Heads up.</strong> {loadError}
    </div>
  );
}

export function Toast() {
  const toast = useUi((s) => s.toast);
  const hide = useUi((s) => s.hideToast);
  const resting = useUi((s) => !!s.rest || !!s.restReady);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(hide, 6000);
    return () => clearTimeout(id);
  }, [toast, hide]);
  if (!toast || resting) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          type="button"
          onClick={() => {
            toast.undo?.();
            hide();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}

function isDemo(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

function onStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/** Shown while the example plan is loaded, with a way to start a real one. */
export function DemoBanner() {
  const demo = useSyncExternalStore(onStorage, isDemo, () => false);
  const deleteEverything = useApp((s) => s.deleteEverything);
  const router = useRouter();
  if (!demo) return null;
  return (
    <div className="banner row-between" role="note" aria-label="Example plan">
      <span>
        <strong>This is an example plan.</strong> Tap around as much as you like. It’s saved only in this browser.
      </span>
      <button
        type="button"
        className="btn-dark"
        onClick={() => {
          deleteEverything();
          router.push('/setup');
        }}
      >
        Start my own plan
      </button>
    </div>
  );
}
