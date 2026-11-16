import { expect, test } from '@playwright/test';
import { MONDAY, seed, stored, watchConsole } from './helpers';

test('log every set with the rest timer, then finish the workout', async ({ page }) => {
  const con = watchConsole(page);
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await page.goto('/train');
  await expect(page.getByRole('heading', { level: 1, name: 'Strength A' })).toBeVisible();
  await expect(page.getByText('Today · Monday, Nov 16')).toBeVisible();

  // Prototype list, focus dots on the focus-muscle moves
  await expect(page.getByRole('button', { name: /Lateral raise \(focus muscle\)/ })).toBeVisible();

  await page.getByRole('button', { name: /^Warm-up/ }).click();
  await page.getByLabel('Goblet squat weight in pounds').fill('25');

  await page.getByRole('button', { name: 'Goblet squat set 1', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Rest timer started: 60 to 90 seconds.' })).toBeAttached();
  await expect(page.locator('.rest-timer .clock')).toHaveText('1:00');
  await page.clock.runFor(61_000);
  await expect(page.getByText(/Ready for your next set \(rest up to 90 sec/)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Rest done.' })).toBeAttached();
  await page.getByRole('button', { name: 'Close' }).click();

  // Undo a set by tapping it again
  await page.getByRole('button', { name: 'Goblet squat set 1, done' }).click();
  await expect(page.getByRole('button', { name: 'Goblet squat set 1', exact: true })).toHaveAttribute('aria-pressed', 'false');

  const bubbles = page.locator('.bubble[aria-pressed="false"]');
  const n = await bubbles.count();
  expect(n).toBe(21);
  for (let i = 0; i < n; i++) await page.locator('.bubble[aria-pressed="false"]').first().click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await expect(page.getByText('Done. Nice work.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Monday \(today\), Strength A, done/ })).toBeVisible();

  const s = await stored(page);
  expect(s.logs.sessionsDone['2026-11-16']).toContain('str-1');
  expect(s.logs.weights['goblet-squat'][0]).toMatchObject({ value: 25, unit: 'lb', date: '2026-11-16' });

  // Undo the finish
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Finish workout', exact: true })).toBeVisible();

  // Weights are remembered on the next session of the same exercise
  await page.getByRole('button', { name: /^Thursday/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Strength B' })).toBeVisible();
  await page.getByRole('button', { name: /^Tuesday/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Easy run + walk' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark easy run done' }).click();
  await expect(page.getByText(/1 of 4 sessions this week/).first()).toBeVisible();
  con.expectClean();
});
