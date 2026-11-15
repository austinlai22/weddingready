import { expect, test } from '@playwright/test';
import { MONDAY, seed, stored, watchConsole } from './helpers';

test('log a template meal, a searched meal, manual numbers and an AI estimate', async ({ page }) => {
  const con = watchConsole(page);
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await page.route('**/api/estimate-meal', async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ item: 'beef chow fun', quantity: '2 cups', slot: 'd' });
    await route.fulfill({
      json: { name: 'Beef chow fun', items: ['2 cups beef chow fun (~400 g)'], protein_g: 26, carbs_g: 70, fat_g: 24, kcal: 600, confidence: 'medium', note: 'Assumed restaurant portion with ~2 tbsp oil' },
    });
  });
  await page.goto('/eat');
  await expect(page.getByRole('heading', { name: 'Eat to feel strong.' })).toBeVisible();
  await expect(page.getByText('/ 98–122 g')).toBeVisible();
  await expect(page.getByText(/aim ~1,580–1,830/)).toBeVisible();

  // Template
  const breakfast = page.getByRole('region', { name: 'Breakfast' });
  await breakfast.locator('.option').first().click();
  await expect(breakfast.locator('.option').first()).toHaveAttribute('aria-pressed', 'true');

  // Search the food list
  const lunch = page.getByRole('region', { name: 'Lunch' });
  await lunch.getByRole('button', { name: '+ Had something else? Log it' }).click();
  await lunch.getByLabel('Search foods').fill('chicken breast');
  await lunch.getByRole('button', { name: 'Add Chicken breast, cooked' }).click();
  await lunch.getByRole('button', { name: 'More Chicken breast, cooked' }).click();
  await expect(lunch.getByText('5 oz', { exact: true })).toBeVisible();
  await lunch.getByLabel('Search foods').fill('white rice');
  await lunch.getByRole('button', { name: 'Add White rice, cooked' }).click();
  await lunch.getByRole('button', { name: 'Log meal' }).click();
  await expect(lunch.getByText('YOU HAD')).toBeVisible();
  await expect(lunch.getByText('Chicken breast, cooked + White rice, cooked')).toBeVisible();

  // AI estimate (mocked), edit a number, save
  const dinner = page.getByRole('region', { name: 'Dinner' });
  await dinner.getByRole('button', { name: '+ Had something else? Log it' }).click();
  await dinner.getByRole('button', { name: 'Describe it' }).click();
  await dinner.getByLabel('What did you have?').fill('beef chow fun');
  await dinner.getByLabel('How much?').fill('2 cups');
  await dinner.getByRole('button', { name: 'Estimate it' }).click();
  await expect(dinner.getByText('Medium confidence · Assumed restaurant portion with ~2 tbsp oil')).toBeVisible();
  await dinner.getByLabel('Protein (g)').fill('28');
  await dinner.getByRole('button', { name: 'Log meal' }).click();
  await expect(dinner.getByText('28 g protein')).toBeVisible();

  // Manual numbers, calories worked out from macros
  const snack = page.getByRole('region', { name: 'Protein snack' });
  await snack.getByRole('button', { name: '+ Had something else? Log it' }).click();
  await snack.getByRole('button', { name: 'I know the numbers' }).click();
  await snack.getByLabel('What was it?').fill('Protein bar');
  await snack.getByLabel('Protein (g)').fill('20');
  await snack.getByLabel('Carbs (g)').fill('22');
  await snack.getByLabel('Fat (g)').fill('7');
  await snack.getByRole('button', { name: 'Add' }).click();
  await expect(snack.getByText('~231 kcal')).toBeVisible();

  const s = await stored(page);
  const day = s.logs.meals['2026-11-16']!;
  expect(day.b?.src).toBe('template');
  expect(day.l?.src).toBe('list');
  expect(day.d).toMatchObject({ src: 'ai', p: 28, k: 600, conf: 'medium' });
  expect(day.s).toMatchObject({ src: 'manual', k: 231 });
  expect(s.myFoods.map((f) => f.name)).toEqual(['Beef chow fun (2 cups)', 'Protein bar']);
  await expect(page.getByRole('button', { name: /Monday \(today\), meals, done/ })).toBeVisible();

  // My foods appear first in search
  const extras = page.getByRole('region', { name: 'Extras & drinks' });
  await extras.getByRole('button', { name: '+ Add a food or drink' }).click();
  await extras.getByLabel('Search foods').fill('protein bar');
  await expect(extras.locator('.result').first()).toContainText('My food');
  con.expectClean();
});

test('AI estimate falls back to manual entry when AI is unavailable', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await page.route('**/api/estimate-meal', (route) => route.fulfill({ status: 503, json: { error: 'AI help is taking a break for today. You can still enter it yourself.', code: 'budget' } }));
  await page.goto('/eat');
  const dinner = page.getByRole('region', { name: 'Dinner' });
  await dinner.getByRole('button', { name: '+ Had something else? Log it' }).click();
  await dinner.getByRole('button', { name: 'Describe it' }).click();
  await dinner.getByLabel('What did you have?').fill('pho');
  await dinner.getByLabel('How much?').fill('1 bowl');
  await dinner.getByRole('button', { name: 'Estimate it' }).click();
  await expect(dinner.getByRole('button', { name: 'I know the numbers' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dinner.getByLabel('What was it?')).toBeVisible();
  await expect(dinner.getByText('AI help is taking a break for today. You can still enter it yourself.')).toBeVisible();
});
