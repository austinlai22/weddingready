// Records the home page's looping demo clips from the real app.
//
//   npm run build && npx next start -p 3100   (in another terminal)
//   npm run demos:record                       (DEMO_BASE_URL to use another server)
//
// Each clip drives the app at phone size with an invented example user, shows a
// soft ripple wherever it taps, and is transcoded with ffmpeg (needs libx264 on
// the PATH) to a small looping MP4 plus a poster frame in public/media/landing/.
// The AI clip uses a canned estimate in the shape the live route returns, so the
// clip doesn't sit waiting on the network.

import { chromium, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addDays, mondayOf, todayISO } from '../lib/engine/dates';
import { PROTOTYPE_USER } from '../lib/engine/fixtures';
import { emptyState } from '../lib/state/schema';
import type { Profile } from '../lib/types';

const BASE = process.env.DEMO_BASE_URL || 'http://localhost:3100';
const OUT = path.join(process.cwd(), 'public', 'media', 'landing');
const VIEW = { width: 390, height: 844 };

// Three weeks into a plan, so the clips show a normal day rather than a preview.
const today = todayISO();
const DEMO_PROFILE: Profile = {
  ...PROTOTYPE_USER,
  name: 'Sam',
  startDate: addDays(mondayOf(today), -21),
  weddingDate: addDays(today, 240),
};

const RIPPLE = `
  addEventListener('pointerdown', (e) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:999px;background:rgba(166,61,99,.28);border:2px solid rgba(166,61,99,.55);transition:transform .45s ease-out,opacity .45s ease-out;left:' + e.clientX + 'px;top:' + e.clientY + 'px';
    document.body.appendChild(d);
    requestAnimationFrame(() => { d.style.transform = 'scale(1.6)'; d.style.opacity = '0'; });
    setTimeout(() => d.remove(), 500);
  }, true);
`;

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

async function scrollTo(page: Page, selector: string, offset = 90) {
  await page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel as string);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - (off as number), behavior: 'smooth' });
    },
    [selector, offset],
  );
  await pause(page, 700);
}

async function typeSlow(page: Page, label: string, text: string, scope = page.locator('body')) {
  const field = scope.getByLabel(label);
  await field.click();
  await field.pressSequentially(text, { delay: 55 });
}

const CLIPS: Record<string, (page: Page) => Promise<void>> = {
  async train(page) {
    await page.goto(`${BASE}/train`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await pause(page, 900);
    // Show a strength day (whatever day it is when this runs).
    await page.getByRole('button', { name: /^Monday/ }).click();
    await page.getByRole('heading', { level: 1, name: 'Strength A' }).waitFor();
    await pause(page, 1200);
    await scrollTo(page, '.check-card');
    await page.getByRole('button', { name: /^Warm-up/ }).click();
    await pause(page, 600);
    const weight = page.getByLabel(/weight in pounds/).first();
    await weight.click();
    await weight.fill('');
    await weight.pressSequentially('25', { delay: 120 });
    await pause(page, 500);
    const bubbles = page.locator('.ex-card').first().locator('.bubble');
    await bubbles.nth(0).click();
    await pause(page, 2200);
    await bubbles.nth(1).click();
    await pause(page, 1600);
    await bubbles.nth(2).click();
    await pause(page, 1400);
    await page.getByRole('button', { name: 'Skip' }).click();
    await pause(page, 1200);
  },

  async eat(page) {
    await page.goto(`${BASE}/eat`);
    await page.getByRole('heading', { name: 'Eat to feel strong.' }).waitFor();
    await pause(page, 1200);
    await scrollTo(page, '#slot-b', 70);
    await page.getByRole('region', { name: 'Breakfast' }).locator('.option').first().click();
    await pause(page, 900);
    const lunch = page.getByRole('region', { name: 'Lunch' });
    await scrollTo(page, '#slot-l', 70);
    await lunch.getByRole('button', { name: '+ Had something else? Log it' }).click();
    await pause(page, 400);
    await typeSlow(page, 'Search foods', 'salmon', lunch);
    await pause(page, 500);
    await lunch.getByRole('button', { name: 'Add Salmon, cooked' }).click();
    await pause(page, 500);
    await typeSlow(page, 'Search foods', 'rice', lunch);
    await pause(page, 400);
    await lunch.getByRole('button', { name: 'Add White rice, cooked' }).click();
    await pause(page, 500);
    await lunch.getByRole('button', { name: 'More Salmon, cooked' }).click();
    await pause(page, 700);
    await lunch.getByRole('button', { name: 'Log meal' }).click();
    await pause(page, 900);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await pause(page, 1800);
  },

  async ai(page) {
    await page.route('**/api/estimate-meal', async (route) => {
      await new Promise((r) => setTimeout(r, 1300));
      await route.fulfill({
        json: {
          name: 'Pad thai with shrimp',
          items: ['1 takeout box shrimp pad thai (~500 g)', 'Includes peanuts and about 2 tbsp cooking oil'],
          protein_g: 34,
          carbs_g: 118,
          fat_g: 32,
          kcal: 900,
          confidence: 'medium',
          note: 'Assumed a standard restaurant takeout portion.',
        },
      });
    });
    await page.goto(`${BASE}/eat`);
    await page.getByRole('heading', { name: 'Eat to feel strong.' }).waitFor();
    await pause(page, 600);
    const dinner = page.getByRole('region', { name: 'Dinner' });
    await scrollTo(page, '#slot-d', 70);
    await dinner.getByRole('button', { name: '+ Had something else? Log it' }).click();
    await pause(page, 400);
    await scrollTo(page, '#slot-d', 20);
    await dinner.getByRole('button', { name: 'Describe it' }).click();
    await pause(page, 400);
    await typeSlow(page, 'What did you have?', 'pad thai with shrimp', dinner);
    await typeSlow(page, 'How much?', '1 takeout box', dinner);
    await pause(page, 400);
    await dinner.getByRole('button', { name: 'Estimate it' }).click();
    await dinner.getByText(/confidence ·/).waitFor();
    await pause(page, 2000);
    await dinner.getByRole('button', { name: 'Log meal' }).click();
    await pause(page, 1800);
  },

  async plan(page) {
    await page.route('**/api/edit-schedule', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill({ json: { ops: [{ op: 'add', activity: 'yoga', day: 'sun' }], summary: 'Added yoga on Sunday, an easy day that keeps your strength days apart.' } });
    });
    await page.goto(`${BASE}/plan`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await pause(page, 1400);
    await scrollTo(page, '#sched-heading', 40);
    const chip = page.getByRole('button', { name: /^Str B\./ });
    const target = page.getByLabel('Friday', { exact: true });
    const a = (await chip.boundingBox())!;
    const b = (await target.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 4, { steps: 4 });
    await page.mouse.move(b.x + 70, b.y + b.height / 2, { steps: 28 });
    await page.mouse.up();
    await pause(page, 1500);
    await scrollTo(page, '.card-lg:has(textarea)', 120);
    await typeSlow(page, 'What should change?', 'Add yoga on Sunday');
    await page.getByRole('button', { name: 'Preview changes' }).click();
    await page.getByRole('button', { name: 'Apply' }).waitFor();
    await pause(page, 1800);
    await page.getByRole('button', { name: 'Apply' }).click();
    await pause(page, 600);
    await scrollTo(page, '#sched-heading', 40);
    await pause(page, 1600);
  },
};

async function record(name: string, run: (page: Page) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), `wr-${name}-`));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    // Playwright records in CSS pixels whatever the device scale, so the video
    // is the viewport size; a larger size only pads it with grey.
    recordVideo: { dir, size: VIEW },
  });
  await context.addInitScript((s) => localStorage.setItem('weddingready-v1', JSON.stringify({ state: s, version: 1 })), {
    ...emptyState('demo-device-0001'),
    profile: DEMO_PROFILE,
  });
  await context.addInitScript(RIPPLE);
  const started = Date.now();
  const page = await context.newPage();
  let readyAt = 0;
  page.once('load', () => (readyAt = Date.now()));
  await run(page);
  await context.close();
  await browser.close();
  const webm = readdirSync(dir).find((f) => f.endsWith('.webm'))!;
  // Skip the blank and half-painted frames before the first page settled.
  const trim = Math.max(0, (readyAt - started) / 1000 + 1.2).toFixed(2);
  const src = path.join(dir, webm);
  const mp4 = path.join(OUT, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', trim, '-i', src, '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', `${mp4}.tmp.mp4`]);
  renameSync(`${mp4}.tmp.mp4`, mp4);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.05', '-i', mp4, '-frames:v', '1', '-q:v', '4', path.join(OUT, `${name}.jpg`)]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`Recorded ${name}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  for (const [name, run] of Object.entries(CLIPS)) {
    if (only.length && !only.includes(name)) continue;
    await record(name, run);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
