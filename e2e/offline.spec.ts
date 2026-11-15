import { expect, test } from '@playwright/test';
import { seed } from './helpers';

test('loads offline after the first visit', async ({ page, context }) => {
  await seed(page);
  await page.goto('/train');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  // Let the install step precache the shell.
  await page.waitForFunction(async () => (await caches.keys()).includes('pages-v1') && (await (await caches.open('pages-v1')).keys()).length >= 8, null, { timeout: 15_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Eat', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Eat to feel strong.' })).toBeVisible();
  const dinner = page.getByRole('region', { name: 'Dinner' });
  await dinner.getByRole('button', { name: '+ Had something else? Log it' }).click();
  await dinner.getByRole('button', { name: 'Describe it' }).click();
  await expect(dinner.getByText('Needs a connection.')).toBeVisible();
  await context.setOffline(false);
});
