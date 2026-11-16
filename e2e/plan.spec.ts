import { readFileSync } from 'node:fs';
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

test('the coach proposes, previews, and applies only on Apply', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await page.route('**/api/coach', async (route) => {
    const body = route.request().postDataJSON();
    // What the coach sees: a plan code and the week, never body measurements or health answers.
    expect(body.message).toBe('Move strength A to Tuesday and add yoga on Sunday');
    expect(body.plan).toMatch(/^wr1\./);
    expect(JSON.stringify(body)).not.toMatch(/weightKg|heightCm|edHistory|"age"/);
    await route.fulfill({
      json: {
        reply: 'I suggest moving Strength A to Tuesday and adding yoga on Sunday.',
        proposals: [{ kind: 'schedule', scope: 'from_now_on', ops: [{ op: 'move', sessionId: 'str-1', toDay: 'tue' }, { op: 'add', activity: 'yoga', day: 'sun' }], summary: 'Strength A moves to Tuesday; yoga on Sunday.' }],
      },
    });
  });
  await page.goto('/plan');
  await page.getByLabel('Message to your coach').fill('Move strength A to Tuesday and add yoga on Sunday');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('I suggest moving Strength A to Tuesday')).toBeVisible();
  await expect(page.getByText('Strength A moves to Tuesday; yoga on Sunday.')).toBeVisible();
  let s = await stored(page);
  expect(s.scheduleOverrides).toBeNull();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByLabel('Sunday', { exact: true }).getByRole('button', { name: /^Yoga\./ })).toBeVisible();
  s = await stored(page);
  expect(s.scheduleOverrides?.days[1].some((x) => x.id === 'str-1')).toBe(true);
});

test('a “this week only” change from the coach keeps past days and ends on Sunday', async ({ page }) => {
  // Wednesday of week 1: Strength A was done on Monday; Thursday's Strength B moves to Saturday, this week only.
  await page.clock.install({ time: new Date('2026-11-18T09:00:00') });
  await seed(page, undefined, {
    logs: { sets: {}, weights: {}, sessionsDone: { '2026-11-16': ['str-1'] }, warmups: {}, meals: {}, extras: {} },
  });
  await page.route('**/api/coach', (route) =>
    route.fulfill({ json: { reply: 'I suggest Saturday instead, this week only.', proposals: [{ kind: 'schedule', scope: 'this_week', ops: [{ op: 'move', sessionId: 'str-2', toDay: 'sat' }], summary: 'Thursday to Saturday.' }] } }),
  );
  await page.goto('/plan');
  await page.getByRole('button', { name: 'I can’t train tomorrow. Fit it in later this week?' }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const s = await stored(page);
  expect(s.scheduleOverrides).toBeNull();
  expect(s.scheduleHistory?.map((h) => h.until)).toEqual(['2026-11-18', '2026-11-23']);

  await page.getByRole('link', { name: 'Train', exact: true }).click();
  await expect(page.getByRole('button', { name: /Monday, Strength A, done/ })).toBeVisible();
  await page.getByRole('button', { name: /^Saturday/ }).click();
  await expect(page.getByRole('region', { name: 'Strength B' })).toBeVisible();
});

test('coach swaps and equipment changes show in Settings and can be undone', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await page.route('**/api/coach', (route) =>
    route.fulfill({
      json: {
        reply: 'I suggest a gentler swap, and gym versions for your trip.',
        proposals: [
          { kind: 'swap', from: 'reverse-lunge', to: 'db-glute-bridge', fromName: 'Reverse lunge', toName: 'Dumbbell glute bridge', reason: 'Sore knee.' },
          { kind: 'equipment', from: '2026-11-23', to: '2026-11-29', equipment: 'gym', reason: 'Hotel gym.' },
        ],
      },
    }),
  );
  await page.goto('/plan');
  await page.getByLabel('Message to your coach').fill('My knee hurts, and I’m at a hotel next week');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('Reverse lunge → Dumbbell glute bridge')).toBeVisible();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  let s = await stored(page);
  expect(s.profile?.exerciseSwaps).toEqual({ 'reverse-lunge': 'db-glute-bridge' });
  expect(s.profile?.equipmentOverrides).toEqual([{ from: '2026-11-23', to: '2026-11-29', equipment: 'gym' }]);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Changes from your coach' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo swap' }).click();
  s = await stored(page);
  expect(s.profile?.exerciseSwaps).toEqual({});
});

test('take your plan along: a calendar file and a plan code', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await page.goto('/plan');
  await page.getByLabel('How far ahead').selectOption('4');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download calendar file' }).click()]);
  expect(download.suggestedFilename()).toBe('weddingready-training.ics');
  const ics = readFileSync(await download.path(), 'utf8');
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(8);
  expect(ics).toContain('SUMMARY:Strength A: Legs & push');
  await expect(page.getByText(/8 sessions, Nov 16 to Dec 10/)).toBeVisible();
  await expect(page.getByText(/^wr1\./)).toBeVisible();
});

test('the current tab stays readable under the pointer', async ({ page }) => {
  await seed(page);
  await page.goto('/plan');
  const tab = page.getByRole('link', { name: 'Plan', exact: true });
  await tab.hover();
  await expect(tab).toHaveCSS('color', 'rgb(251, 246, 243)');
});
