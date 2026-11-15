import { expect, test } from '@playwright/test';
import { seed, watchConsole } from './helpers';

test('home page explains the app and starts setup', async ({ page }) => {
  const con = watchConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'A plan for every day between now and your wedding.' })).toBeVisible();
  for (const h of ['What it looks like day to day', 'How your plan is built', 'Questions']) {
    await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible();
  }
  // One demo at a time; choosing a feature swaps the clip.
  await expect(page.locator('video')).toHaveCount(1);
  await expect(page.locator('video')).toHaveAttribute('src', '/media/landing/train.mp4');
  await page.getByRole('button', { name: /Logging takeout/ }).click();
  await expect(page.locator('video')).toHaveCount(1);
  await expect(page.locator('video')).toHaveAttribute('src', '/media/landing/ai.mp4');
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
  con.expectClean();
});

test('returning visitors get “Open my plan”', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Open my plan' }).first()).toHaveAttribute('href', '/train');
});
