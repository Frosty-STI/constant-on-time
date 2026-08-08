import { expect, test } from '@playwright/test';

test('verified primary lab screenshot', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inductor Ripple Sandbox' })).toBeVisible();
  await page.getByLabel('Your prediction').fill('0');
  await page.getByRole('button', { name: 'Submit prediction' }).click();
  await expect(page.getByRole('button', { name: 'Run simulation' })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(page.getByTestId('scope-plot')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  // The tablet inspector stacks below the lesson and clicking Run scrolls it
  // into view. Normalize both projects to the top-of-lab composition before
  // capturing so the baseline reflects layout, not locator auto-scrolling.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `docs/screenshots/inductor-ripple-${testInfo.project.name}.png`,
    animations: 'disabled',
  });
  await expect(page).toHaveScreenshot(`inductor-ripple-${testInfo.project.name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.01,
  });
});
