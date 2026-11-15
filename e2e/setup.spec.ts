import { expect, test } from '@playwright/test';
import { SATURDAY, stored, watchConsole } from './helpers';

test('complete setup and see the plan', async ({ page }) => {
  const con = watchConsole(page);
  await page.clock.install({ time: SATURDAY });
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByLabel('First name or nickname (optional)').fill('Sam');
  await page.getByRole('button', { name: 'Start' }).click();

  await page.getByLabel('Wedding date').fill('2027-10-17');
  await page.getByRole('button', { name: /I don’t know yet/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('radio', { name: 'lb, ft/in' }).click();
  await page.getByLabel('Age').fill('26');
  await page.getByRole('radio', { name: 'Female' }).click();
  await page.getByLabel('Feet').fill('5');
  await page.getByLabel('Inches').fill('4');
  await page.getByLabel('Current weight (lb)').fill('135');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('radio', { name: 'Dress' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: /Tone and sculpt/ }).click();
  await page.getByRole('button', { name: /^Lose fat/ }).click();
  await expect(page.getByRole('button', { name: /Maintain and feel energized/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('button', { name: 'Shoulders', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('radio', { name: '2', exact: true }).click();
  await page.getByRole('radio', { name: '60 min' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: '+ Run' }).click();
  await page.getByRole('group', { name: 'Days for Run' }).getByRole('button', { name: 'Tuesday' }).click();
  await page.getByRole('button', { name: '+ Pilates' }).click();
  await page.getByRole('group', { name: 'Days for Pilates' }).getByRole('button', { name: 'Saturday' }).click();
  await page.getByRole('button', { name: '+ Walk' }).click();
  await page.getByLabel('Minutes per walk').fill('60');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('radio', { name: /Mostly sitting/ }).click();
  await expect(page.getByLabel('Walking per day (minutes)')).toHaveValue('60');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('radio', { name: /Habits \+ numbers/ }).click();
  await page.getByLabel('A treat you want to keep (optional)').fill('ice cream');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: 'None of these' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByText('Foundation · Nov 16 – Jan 10 · 8 weeks')).toBeVisible();
  await expect(page.getByText('Protein 98–122 g a day')).toBeVisible();
  await expect(page.getByText(/~1,580–1,830 kcal a day/)).toBeVisible();
  await expect(page.getByText(/What to expect/)).toBeVisible();
  await page.getByRole('button', { name: /Start my plan on Monday, Nov 16/ }).click();

  await expect(page).toHaveURL(/\/train$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Strength A' })).toBeVisible();
  await expect(page.getByText('Day 1 is Monday, Nov 16.')).toBeVisible();
  await expect(page.getByText('Week 1 of 48 · Foundation')).toBeVisible();
  const s = await stored(page);
  expect(s.profile?.goals).toEqual(['tone', 'lose_fat']);
  expect(s.profile?.startDate).toBe('2026-11-16');
  con.expectClean();
});

test('blocks under-18s with a friendly message', async ({ page }) => {
  await page.clock.install({ time: SATURDAY });
  await page.goto('/setup');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByLabel('Wedding date').fill('2027-06-01');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Age').fill('16');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'This plan is for adults' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
});
