import { expect, test } from '@playwright/test';
import { seed, stored, watchConsole } from './helpers';

test('home page explains the app and starts setup', async ({ page }) => {
  const con = watchConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'A plan for every day between now and your wedding.' })).toBeVisible();
  for (const h of ['What it looks like day to day', 'How your plan is built', 'FAQs']) {
    await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible();
  }
  // One row per feature, each with its own recording; only the one on screen plays.
  const videos = page.locator('video');
  await expect(videos).toHaveCount(4);
  const playing = () => videos.evaluateAll((els) => (els as HTMLVideoElement[]).filter((v) => !v.paused).map((v) => v.getAttribute('src')));
  await page.locator('[data-feature="ai"] video').scrollIntoViewIfNeeded();
  await expect.poll(playing).toEqual(['/media/landing/ai.mp4']);
  await page.locator('[data-feature="train"] video').scrollIntoViewIfNeeded();
  await expect.poll(playing).toEqual(['/media/landing/train.mp4']);
  await page.getByText('Do I need an account?').click();
  await expect(page.getByText(/saved in your browser on your device/)).toBeVisible();
  const hrefs = await page.getByRole('link', { name: 'Start my plan' }).evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(new Set(hrefs)).toEqual(new Set(['/setup']));
  con.expectClean();
});

test('“How the plan works” explains the rules', async ({ page }) => {
  const con = watchConsole(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'How the plan works' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'How the plan works' })).toBeVisible();
  for (const h of ['Phases', 'Your week', 'Food', 'Safety', 'Where the numbers come from', 'What it isn’t']) {
    await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible();
  }
  // The pictures come from the engine.
  await expect(page.getByRole('table', { name: 'Strength sets per week' })).toBeAttached();
  await expect(page.getByRole('img', { name: /^Monday: Lift/ }).first()).toBeVisible();
  con.expectClean();
});

test('returning visitors get “Open my plan”', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Open my plan' }).first()).toHaveAttribute('href', '/train');
});

test('“Try the example plan” opens the app without setup, then hands over to a real plan', async ({ page }) => {
  const con = watchConsole(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the example plan' }).click();
  await expect(page).toHaveURL(/\/train$/);
  await expect(page.getByRole('note', { name: 'Example plan' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const s = await stored(page);
  expect(s.profile!.startDate < new Date().toISOString().slice(0, 10)).toBe(true);
  expect(Object.keys(s.logs.sessionsDone).length).toBeGreaterThan(0);

  // Home now offers "Open my plan" and no longer offers the example.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Open my plan' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try the example plan' })).toHaveCount(0);

  await page.goto('/train');
  await page.getByRole('button', { name: 'Start my own plan' }).click();
  await expect(page).toHaveURL(/\/setup$/);
  expect((await stored(page))?.profile).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem('weddingready-demo'))).toBeNull();
  con.expectClean();
});
