import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { MONDAY, seed, stored, watchConsole } from './helpers';

test('changing the wedding date rebuilds the plan and keeps logs', async ({ page }) => {
  const con = watchConsole(page);
  await page.clock.install({ time: MONDAY });
  await seed(page, undefined, {
    logs: { sets: { '2026-11-16': { 'goblet-squat': 3 } }, weights: {}, sessionsDone: { '2026-11-16': ['str-1'] }, warmups: {}, meals: {}, extras: {} },
  });
  await page.goto('/settings');
  await page.getByLabel('Wedding date').fill('2027-06-12');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Plan updated. Your logs are kept.')).toBeVisible();
  const s = await stored(page);
  expect(s.profile?.weddingDate).toBe('2027-06-12');
  expect(s.logs.sets['2026-11-16']['goblet-squat']).toBe(3);
  await page.getByRole('link', { name: 'Train', exact: true }).click();
  await expect(page.getByText(/Week 1 of 30 · Foundation/)).toBeVisible();
  await expect(page.getByText('Done. Nice work.')).toBeVisible();
  con.expectClean();
});

test('export, import and delete everything', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await page.goto('/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export my data' }).click()]);
  const file = await download.path();
  const exported = JSON.parse(readFileSync(file, 'utf8'));
  expect(exported).toMatchObject({ app: 'weddingready', version: 1 });
  expect(exported.state.profile.weddingDate).toBe('2027-10-17');

  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.getByRole('button', { name: 'Yes, delete everything' }).click();
  await expect(page).toHaveURL(/\/setup$/);
  const after = await stored(page);
  expect(after.profile).toBeUndefined();
  expect(after.deviceId).not.toBe('e2e-device-0001');

  // Import brings it all back
  await page.goto('/settings').catch(() => undefined);
  await expect(page).toHaveURL(/\/setup$/);
  await page.evaluate(() => localStorage.clear());
  await seed(page, { ...exported.state.profile, name: 'Before import' });
  await page.goto('/settings');
  await page.getByLabel('Choose a WeddingReady export file').setInputFiles(file);
  await page.getByRole('button', { name: 'Replace and import' }).click();
  await expect(page).toHaveURL(/\/train$/);
  const imported = await stored(page);
  expect(imported.profile?.name).toBeUndefined();

  await page.goto('/settings');
  await page.getByLabel('Choose a WeddingReady export file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
  await expect(page.getByText('That file isn’t a WeddingReady export.')).toBeVisible();
});

test('eating-disorder history turns off numbers and Lose fat', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Health and safety' }).click();
  await page.getByRole('button', { name: 'History of an eating disorder' }).click();
  await expect(page.getByRole('link', { name: '866-662-1235' })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  const s = await stored(page);
  expect(s.profile?.nutritionMode).toBe('portions_only');
  expect(s.profile?.goals).toEqual(['tone']);
  await page.getByRole('link', { name: 'Eat', exact: true }).click();
  await expect(page.getByText(/of 4 meals with protein/)).toBeVisible();
  await expect(page.getByText(/kcal/)).toHaveCount(0);
  await expect(page.getByText(/g protein/)).toHaveCount(0);
});
