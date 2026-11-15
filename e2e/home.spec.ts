import { expect, test } from '@playwright/test';
import { seed, watchConsole } from './helpers';

test('home page explains the app and starts setup', async ({ page }) => {
  const con = watchConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Feel strong on your wedding day.' })).toBeVisible();
  for (const h of ['From date to daily plan in three steps.', 'Built for the five minutes you actually have.', 'Questions, answered', 'Where the plan comes from.']) {
    await expect(page.getByRole('heading', { name: h })).toBeVisible();
  }
  await expect(page.locator('video')).toHaveCount(4);
  await page.getByText('Do I need an account?').click();
  await expect(page.getByText(/saved on your device/)).toBeVisible();
  const hrefs = await page.getByRole('link', { name: 'Start my plan' }).evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(new Set(hrefs)).toEqual(new Set(['/setup']));
  con.expectClean();
});

test('returning visitors get “Open my plan”', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Open my plan' }).first()).toHaveAttribute('href', '/train');
});
