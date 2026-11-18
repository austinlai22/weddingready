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

/** One scripted model step for the coach: tool calls the browser should run, and/or the reply text. */
export interface FakeStep {
  text?: string;
  calls?: { name: string; args: Record<string, unknown> }[];
}

/**
 * Stands in for Gemini behind /api/coach: each request gets the next scripted
 * step, and the app runs the tools and the loop itself, as it does for real.
 */
export async function fakeCoach(page: Page, steps: FakeStep[], onRequest?: (body: { context: Record<string, unknown>; contents: { role: string; parts: Record<string, unknown>[] }[] }, index: number) => void) {
  let i = 0;
  await page.route('**/api/coach', async (route) => {
    const body = route.request().postDataJSON();
    onRequest?.(body, i);
    const s = steps[Math.min(i, steps.length - 1)];
    i++;
    const calls = (s.calls ?? []).map((c, k) => ({ ...c, id: `call-${i}-${k}` }));
    await route.fulfill({
      json: { model: 'test-model', text: s.text ?? '', calls, turn: { role: 'model', parts: [...calls.map((c) => ({ functionCall: c })), ...(s.text ? [{ text: s.text }] : [])] } },
    });
  });
  return { requests: () => i };
}
