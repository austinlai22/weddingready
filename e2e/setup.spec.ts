import { expect, test, type Page } from '@playwright/test';
import { SATURDAY, stored, watchConsole } from './helpers';

async function basicsAndBody(page: Page) {
  await page.getByLabel('First name or nickname (optional)').fill('Sam');
  await page.getByLabel('Wedding date').fill('2027-10-17');
  await page.getByRole('button', { name: /I don’t know yet/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('radio', { name: 'lb, ft/in' }).click();
  await page.getByLabel('Age', { exact: true }).fill('26');
  await page.getByRole('radio', { name: 'Female' }).click();
  await page.getByLabel('Feet').fill('5');
  await page.getByLabel('Inches').fill('4');
  await page.getByLabel('Current weight (lb)').fill('135');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('radio', { name: 'Dress' }).click();
  await page.getByRole('button', { name: /Tone and sculpt/ }).click();
  await page.getByRole('button', { name: /^Lose fat/ }).click();
  await expect(page.getByRole('button', { name: /Maintain and feel energized/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Shoulders', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Next' }).click();
}

async function addActivity(page: Page, type: string, label: string, days: string[]) {
  await page.getByRole('button', { name: `+ ${type}` }).click();
  for (const d of days) await page.getByRole('group', { name: `Days for ${label}` }).getByRole('button', { name: d }).click();
}

async function foodAndHealth(page: Page) {
  await expect(page.getByRole('radio', { name: /Habits \+ numbers/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('A treat you want to keep (optional)').fill('ice cream');
  await page.getByRole('button', { name: 'None of these' }).click();
  await page.getByRole('button', { name: 'See my plan' }).click();
}

test('complete setup in 5 screens and see the plan', async ({ page }) => {
  const con = watchConsole(page);
  await page.clock.install({ time: SATURDAY });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'A plan for every day between now and your wedding.' })).toBeVisible();
  await page.getByRole('link', { name: 'Start my plan' }).first().click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  await basicsAndBody(page);

  await page.getByRole('radio', { name: '2', exact: true }).click();
  await page.getByRole('radio', { name: '60 min' }).click();
  await addActivity(page, 'Run', 'Run', ['Tuesday']);
  await addActivity(page, 'Pilates', 'Pilates', ['Saturday']);
  await page.getByRole('button', { name: '+ Walk' }).click();
  await page.getByLabel('Minutes per walk').fill('60');
  await page.getByRole('radio', { name: /Mostly sitting/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await foodAndHealth(page);

  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByText('Foundation · Nov 16 – Jan 10 · 8 weeks')).toBeVisible();
  await expect(page.getByText('Protein 98–122 g a day')).toBeVisible();
  await expect(page.getByText(/~1,580–1,830 kcal a day/)).toBeVisible();
  await expect(page.getByText(/What to expect/)).toBeVisible();
  await expect(page.getByText('Heads up.')).toHaveCount(0);
  await page.getByRole('button', { name: /Start my plan on Monday, Nov 16/ }).click();

  await expect(page).toHaveURL(/\/train$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Strength A' })).toBeVisible();
  await expect(page.getByText('Day 1 is Monday, Nov 16.')).toBeVisible();
  await expect(page.getByText('Week 1 of 48 · Foundation')).toBeVisible();
  const s = await stored(page);
  expect(s.profile?.goals).toEqual(['tone', 'lose_fat']);
  expect(s.profile?.startDate).toBe('2026-11-16');
  expect(s.profile?.dailyWalkMinutes).toBe(60);
  con.expectClean();
});

test('a packed week gets full-body days apart, and a one-tap fix', async ({ page }) => {
  await page.clock.install({ time: SATURDAY });
  await page.goto('/setup');
  await basicsAndBody(page);
  await page.getByRole('radio', { name: '3', exact: true }).click();
  await page.getByRole('button', { name: '+ Walk' }).click();
  await addActivity(page, 'Run', 'Run', ['Thursday']);
  await addActivity(page, 'Classes', 'Class', ['Monday', 'Tuesday', 'Wednesday', 'Thursday']);
  await addActivity(page, 'Sports', 'Sports', ['Monday']);
  await page.getByRole('radio', { name: /Mostly sitting/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await foodAndHealth(page);

  const week = page.locator('.card').filter({ hasText: 'Your week' });
  const strengthDays = async () => (await week.locator('p').allTextContents()).filter((t) => /Strength/.test(t)).map((t) => t.slice(0, 3));
  const before = await strengthDays();
  expect(before).toHaveLength(3);
  expect(before).not.toEqual(['Fri', 'Sat', 'Sun']);
  await expect(page.getByText(/2 full-body strength days fit around them better than 3/)).toBeVisible();
  await page.getByRole('button', { name: 'Switch to 2 days' }).click();
  await expect(page.getByText('Heads up.')).toHaveCount(0);
  expect(await strengthDays()).toHaveLength(2);
});

test('blocks under-18s with a friendly message', async ({ page }) => {
  await page.clock.install({ time: SATURDAY });
  await page.goto('/setup');
  await page.getByLabel('Wedding date').fill('2027-06-01');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Age', { exact: true }).fill('16');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'This plan is for adults' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
});
