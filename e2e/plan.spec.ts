import { expect, test } from '@playwright/test';
import { MONDAY, seed, stored, watchConsole } from './helpers';

test('drag a session to another day, then undo', async ({ page }) => {
  const con = watchConsole(page);
  // No fake clock here: dnd-kit measures with requestAnimationFrame, which page.clock would freeze.
  // The real date (before the Nov 16 start) gives the same week.
  await seed(page);
  await page.goto('/plan');
  await expect(page.getByRole('img', { name: /Phase timeline: Foundation Nov 16 to Jan 10/ })).toBeVisible();

  const chip = page.getByRole('button', { name: /^Str A\./ });
  const wed = page.getByLabel('Wednesday', { exact: true });
  await wed.scrollIntoViewIfNeeded();
  const from = (await chip.boundingBox())!;
  const to = (await wed.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
  await page.mouse.up();
  // dnd-kit swallows clicks for 50 ms after a drop; a person never clicks that fast.
  await page.waitForTimeout(100);

  await expect(wed.getByRole('button', { name: /^Str A\./ })).toBeVisible();
  let s = await stored(page);
  expect(s.scheduleOverrides?.days[2].some((x) => x.id === 'str-1')).toBe(true);
  expect(s.scheduleOverrides?.effectiveFrom).toBe('2026-11-16');

  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(page.getByLabel('Monday', { exact: true }).getByRole('button', { name: /^Str A\./ })).toBeVisible();
  s = await stored(page);
  expect(s.scheduleOverrides).toBeNull();
  con.expectClean();
});

test('warns when full-body days land back to back, including Sunday into Monday', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await page.goto('/plan');
  await expect(page.getByText('Heads up.')).toHaveCount(0);
  await page.getByRole('button', { name: /^Str B\./ }).click();
  await page.getByLabel('Move to').selectOption('6');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByText(/Sunday and Monday are both strength days/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset to suggested' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset to suggested' }).click();
  await expect(page.getByLabel('Thursday', { exact: true }).getByRole('button', { name: /^Str B\./ })).toBeVisible();
  await expect(page.getByText('Heads up.')).toHaveCount(0);
});

test('AI schedule edit: preview, then apply', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await page.route('**/api/edit-schedule', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.instruction).toBe('Move strength A to Tuesday and add yoga on Sunday');
    expect(body.currentWeek.days).toHaveLength(7);
    await route.fulfill({ json: { ops: [{ op: 'move', sessionId: 'str-1', toDay: 'tue' }, { op: 'add', activity: 'yoga', day: 'sun' }], summary: 'Strength A moves to Tuesday and yoga is added on Sunday.' } });
  });
  await page.goto('/plan');
  await page.getByLabel('What should change?').fill('Move strength A to Tuesday and add yoga on Sunday');
  await page.getByRole('button', { name: 'Preview changes' }).click();
  await expect(page.getByText('Strength A moves to Tuesday and yoga is added on Sunday.')).toBeVisible();
  let s = await stored(page);
  expect(s.scheduleOverrides).toBeNull();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByLabel('Sunday', { exact: true }).getByRole('button', { name: /^Yoga\./ })).toBeVisible();
  s = await stored(page);
  expect(s.scheduleOverrides?.days[1].some((x) => x.id === 'str-1')).toBe(true);
});

test('the current tab stays readable under the pointer', async ({ page }) => {
  await seed(page);
  await page.goto('/plan');
  const tab = page.getByRole('link', { name: 'Plan', exact: true });
  await tab.hover();
  await expect(tab).toHaveCSS('color', 'rgb(251, 246, 243)');
});

test('a change made mid-week leaves the days already past alone', async ({ page }) => {
  // Wednesday of week 1: Strength A was done on Monday, then it's moved to Saturday.
  await page.clock.install({ time: new Date('2026-11-18T09:00:00') });
  await seed(page, undefined, {
    logs: { sets: {}, weights: {}, sessionsDone: { '2026-11-16': ['str-1'] }, warmups: {}, meals: {}, extras: {} },
  });
  await page.route('**/api/edit-schedule', (route) =>
    route.fulfill({ json: { ops: [{ op: 'move', sessionId: 'str-1', toDay: 'sat' }], summary: 'Strength A moves to Saturday.' } }),
  );
  await page.goto('/plan');
  await page.getByLabel('What should change?').fill('Move strength A to Saturday');
  await page.getByRole('button', { name: 'Preview changes' }).click();
  await page.getByRole('button', { name: 'Apply' }).click();
  const s = await stored(page);
  expect(s.scheduleOverrides?.effectiveFrom).toBe('2026-11-18');
  expect(s.scheduleHistory?.[0]?.until).toBe('2026-11-18');

  await page.getByRole('link', { name: 'Train', exact: true }).click();
  // Monday keeps its finished workout; Saturday gets Strength A from now on.
  await expect(page.getByRole('button', { name: /Monday, Strength A, done/ })).toBeVisible();
  await page.getByRole('button', { name: /^Saturday/ }).click();
  await expect(page.getByRole('region', { name: 'Strength A' })).toBeVisible();
});
