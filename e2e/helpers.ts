import { expect, type Page } from '@playwright/test';
import { PROTOTYPE_USER } from '../lib/engine/fixtures';
import { emptyState } from '../lib/state/schema';
import type { AppState, Profile } from '../lib/types';

/** Saturday before the fixture plan starts (Monday Nov 16, 2026). */
export const SATURDAY = new Date('2026-11-14T10:00:00');
export const MONDAY = new Date('2026-11-16T09:00:00');

export async function seed(page: Page, profile: Profile = PROTOTYPE_USER, extra: Partial<AppState> = {}) {
  const state: AppState = { ...emptyState('e2e-device-0001'), profile, ...extra };
  await page.addInitScript((s) => {
    if (!localStorage.getItem('weddingready-v1')) localStorage.setItem('weddingready-v1', JSON.stringify({ state: s, version: 1 }));
  }, state);
}

/** Fails the test on any console error or uncaught exception. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return {
    errors,
    expectClean: () => expect(errors, errors.join('\n')).toEqual([]),
  };
}

export async function stored(page: Page): Promise<AppState> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('weddingready-v1') || '{}').state);
}
