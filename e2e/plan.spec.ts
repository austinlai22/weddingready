import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fakeCoach, MONDAY, seed, stored, watchConsole } from './helpers';

test('drag a session to another day, then undo', async ({ page }) => {
  const con = watchConsole(page);
  // No fake clock here: dnd-kit measures with requestAnimationFrame, which page.clock would freeze.
  // Uses the real date: edits apply from the plan start or today, whichever is later.
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
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  expect(s.scheduleOverrides?.effectiveFrom).toBe(today > '2026-11-16' ? today : '2026-11-16');

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
  const seen: string[] = [];
  await fakeCoach(
    page,
    [
      { calls: [{ name: 'propose_schedule_change', args: { based_on: 'asked to move A and add yoga', scope: 'from_now_on', changes: [{ op: 'move', session_id: 'str-1', to_day: 'tue' }, { op: 'add', activity: 'yoga', day: 'sun' }], summary: 'Strength A moves to Tuesday; yoga on Sunday.' } }] },
      { text: 'I suggest moving Strength A to Tuesday and adding yoga on Sunday.' },
    ],
    (body) => seen.push(JSON.stringify(body)),
  );
  await page.goto('/plan');
  await page.getByLabel('Message to your coach').fill('Move strength A to Tuesday and add yoga on Sunday');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('I suggest moving Strength A to Tuesday')).toBeVisible();
  await expect(page.getByText('Strength A moves to Tuesday; yoga on Sunday.')).toBeVisible();
  await expect(page.getByText('Every week from Nov 23')).toBeVisible();
  await expect(page.getByText('The rest of this week')).toBeVisible();
  // What reaches the server: the message, a few plain facts, and tool results the app worked out
  // on this device. No plan code, body measurements or health answers.
  expect(seen).toHaveLength(2);
  expect(seen[0]).toContain('Move strength A to Tuesday and add yoga on Sunday');
  expect(JSON.parse(seen[0]).context).toEqual({ today: '2026-11-16', weddingDate: '2027-10-17', strengthDays: 2, equipment: 'home_db', numbers: 'habits_numbers' });
  expect(seen[1]).toContain('"proposed":true');
  for (const body of seen) expect(body).not.toMatch(/wr1\.|weightKg|heightCm|edHistory|"age"|61\.2/);
  let s = await stored(page);
  expect(s.scheduleOverrides).toBeNull();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByLabel('Sunday', { exact: true }).getByRole('button', { name: /^Yoga\./ })).toBeVisible();
  s = await stored(page);
  expect(s.scheduleOverrides?.days[1].some((x) => x.id === 'str-1')).toBe(true);
  expect(s.scheduleOverrides?.effectiveFrom).toBe('2026-11-23');
  // This week has the same change, until Sunday.
  expect(s.scheduleHistory?.at(-1)?.until).toBe('2026-11-23');
  expect(s.scheduleHistory?.at(-1)?.template.days[1].some((x) => x.id === 'str-1')).toBe(true);
});
test('a “this week only” change from the coach keeps past days and ends on Sunday', async ({ page }) => {
  // Wednesday of week 1: Strength A was done on Monday. Thursday is out; the coach asks which day,
  // then the app's planner moves Strength B to Saturday, this week only.
  await page.clock.install({ time: new Date('2026-11-18T09:00:00') });
  await seed(page, undefined, {
    logs: { sets: {}, weights: {}, sessionsDone: { '2026-11-16': ['str-1'] }, warmups: {}, meals: {}, extras: {} },
  });
  await fakeCoach(page, [
    { calls: [{ name: 'ask_question', args: { question: 'Which day works instead this week?', options: ['Friday', 'Saturday', 'Skip it this week'] } }] },
    { calls: [{ name: 'find_best_week', args: { scope: 'this_week', unavailable_days: ['thu'], preferred_days: ['sat'], based_on: 'Saturday works' } }] },
    { text: 'I suggest Saturday instead, this week only.' },
  ]);
  await page.goto('/plan');
  await page.getByRole('button', { name: 'I can’t train tomorrow. Fit it in later this week?' }).click();
  await expect(page.getByText('Which day works instead this week?')).toBeVisible();
  await page.getByRole('button', { name: 'Saturday', exact: true }).click();
  await expect(page.getByText('Strength B Thursday → Saturday.')).toBeVisible();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const s = await stored(page);
  expect(s.scheduleOverrides).toBeNull();
  expect(s.scheduleHistory?.map((h) => h.until)).toEqual(['2026-11-18', '2026-11-23']);

  await page.getByRole('link', { name: 'Train', exact: true }).click();
  await expect(page.getByRole('button', { name: /Monday, Strength A, done/ })).toBeVisible();
  await page.getByRole('button', { name: /^Saturday/ }).click();
  await expect(page.getByRole('region', { name: 'Strength B' })).toBeVisible();
});
test('the coach asks when it needs more, and proposes only after the answer', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await seed(page);
  const bodies: { contents: { role: string; parts: Record<string, unknown>[] }[] }[] = [];
  await fakeCoach(
    page,
    [
      { calls: [{ name: 'ask_question', args: { question: 'What will you have to train with at the hotel?', options: ['Dumbbells only', 'Full gym', 'Nothing'] } }] },
      { calls: [{ name: 'propose_equipment_change', args: { from_date: '2026-11-23', to_date: '2026-11-29', equipment: 'home_dumbbells', reason: 'Hotel stay.', based_on: 'hotel gym has dumbbells only' } }] },
      { text: 'I suggest dumbbell versions for your trip.' },
    ],
    (body) => bodies.push(body),
  );
  await page.goto('/plan');
  await page.getByLabel('Message to your coach').fill('I’m travelling next week');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('What will you have to train with at the hotel?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Dumbbells only' }).click();
  await expect(page.getByText('Based on: hotel gym has dumbbells only')).toBeVisible();
  // The answer goes back with the conversation so far.
  expect(bodies[1].contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const s = await stored(page);
  expect(s.profile?.equipmentOverrides).toEqual([{ from: '2026-11-23', to: '2026-11-29', equipment: 'home_db' }]);
});
test('coach swaps and equipment changes show in Settings and can be undone', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await fakeCoach(page, [
    {
      calls: [
        { name: 'propose_exercise_swap', args: { from_exercise_id: 'reverse-lunge', to_exercise_id: 'db-glute-bridge', reason: 'Sore knee.', based_on: 'lunges hurt my knee' } },
        { name: 'propose_equipment_change', args: { from_date: '2026-11-23', to_date: '2026-11-29', equipment: 'gym', reason: 'Hotel gym.', based_on: 'a hotel with a full gym' } },
      ],
    },
    { text: 'I suggest a gentler swap, and gym versions for your trip.' },
  ]);
  await page.goto('/plan');
  await page.getByLabel('Message to your coach').fill('Lunges hurt my knee, and next week I’m at a hotel with a full gym');
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
test('take your plan along: Apple, Google, Outlook or a file, and a plan code', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await seed(page);
  await page.goto('/plan');
  await page.getByLabel('How far ahead').selectOption('4');
  await page.getByLabel('Time', { exact: true }).fill('18:30');

  // Apple subscribes over webcal; Google and Outlook open their own "add calendar" pages.
  const apple = await page.getByRole('link', { name: 'Add to Apple Calendar' }).getAttribute('href');
  expect(apple).toMatch(/^webcal:\/\/[^/]+\/api\/ics\?plan=wr1\./);
  const params = new URL(apple!.replace('webcal://', 'https://')).searchParams;
  expect(params.get('time')).toBe('18:30');
  expect(params.get('weeks')).toBe('4');
  expect(params.get('tz')).toBeTruthy();
  await page.getByRole('button', { name: 'Google Calendar' }).click();
  const google = new URL((await page.getByRole('link', { name: 'Add to Google Calendar' }).getAttribute('href'))!);
  expect(google.host).toBe('calendar.google.com');
  expect(google.searchParams.get('cid')).toMatch(/^webcal:\/\/.+\/api\/ics\?plan=wr1\./);
  await page.getByRole('button', { name: 'Outlook' }).click();
  const outlook = new URL((await page.getByRole('link', { name: 'Add to Outlook' }).getAttribute('href'))!);
  expect(outlook.host).toBe('outlook.live.com');
  expect(outlook.searchParams.get('url')).toMatch(/^https:\/\/.+\/api\/ics\?plan=wr1\./);
  await expect(page.getByRole('link', { name: 'Using a work or school account?' })).toHaveAttribute('href', /outlook\.office\.com/);

  // The subscription address returns the same sessions.
  const res = await page.request.get(`/api/ics?${params}`);
  expect(res.headers()['content-type']).toContain('text/calendar');
  expect((await res.text()).match(/BEGIN:VEVENT/g)?.length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Other app' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download calendar file' }).click()]);
  expect(download.suggestedFilename()).toBe('weddingready-training.ics');
  const ics = readFileSync(await download.path(), 'utf8');
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(8);
  expect(ics).toContain('SUMMARY:Strength A: Legs & push');
  expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
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
