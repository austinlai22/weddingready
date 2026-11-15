'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

/** Registers the service worker in production builds and reports PWA installs. */
export function ServiceWorker() {
  useEffect(() => {
    const onInstalled = () => track('pwa_installed');
    window.addEventListener('appinstalled', onInstalled);
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    }
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);
  return null;
}
