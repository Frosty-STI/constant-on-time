import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Constant On-Time Lab' })).toBeVisible();
});

test('runs the predict-simulate-explain workflow', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Inductor Ripple Sandbox' })).toBeVisible();
  await expect(page.getByTestId('scope-plot')).toHaveCount(0);
  await expect(page.locator('.current-path path')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run simulation' })).toBeDisabled();
  await page.getByLabel('Your prediction').fill('5.833');
  await page.getByRole('button', { name: 'Submit prediction' }).click();
  await expect(page.getByText(/Prediction locked/)).toBeVisible();
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(page.getByText(/within the accepted range/)).toBeVisible();
  await expect(page.getByText('Interpret the result')).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Step event' }).click();
  await expect(page.getByText(/Cursor/).first()).toBeVisible();
});

test('navigates every required lab and rejects impossible input', async ({ page, browserName }) => {
  test.setTimeout(120_000);
  test.skip(browserName !== 'chromium', 'Chromium is the configured offline QA engine.');
  const compactNavigation = (page.viewportSize()?.width ?? 1440) <= 1100;
  const selectLab = async (label: string) => {
    if (compactNavigation) await page.getByRole('button', { name: 'Toggle curriculum' }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
  };
  const labs = [
    ['Current paths', 'Current-Path Puzzle'], ['Inductor ripple', 'Inductor Ripple Sandbox'], ['Output ripple', 'Capacitor and Output-Ripple Sandbox'],
    ['CCM / DCM', 'CCM/DCM Waveform Identification'], ['Operating point', 'Buck Operating-Point Designer'], ['Pole / zero', 'Pole-and-Zero Explorer'],
    ['Crossover tuning', 'Crossover-Frequency Tuning Lab'], ['Error amplifier', 'Error-Amplifier Builder'], ['Peak current mode', 'Peak-Current-Mode Pulse Simulator'],
    ['COT pulse explorer', 'Constant On-Time Pulse Simulator'], ['Ripple injection', 'COT Ripple-Injection Challenge'], ['Mode comparison', 'Control-Mode Comparison Lab'],
    ['Interleaving', 'Multiphase Interleaving Visualizer'], ['COT scheduler', 'Multiphase COT Scheduler Simulator'], ['Current sharing', 'Current-Sharing Challenge'],
    ['PSpice blocks', 'PSpice Block-Construction Puzzle'], ['Debugging lab', 'Broken-Model Debugging Laboratory'],
  ] as const;
  for (const [label, title] of labs) {
    await selectLab(label);
    await expect(page.locator('.workbench-header h2')).toHaveText(title);
  }
  await selectLab('Inductor ripple');
  await page.getByLabel('Output target').fill('20');
  await expect(page.getByRole('alert')).toContainText(/below input/i);
  await expect(page.getByRole('button', { name: 'Run simulation' })).toBeDisabled();
  await page.getByRole('button', { name: /Restore valid defaults/ }).click();
  await expect(page.getByRole('button', { name: 'Run simulation' })).toBeDisabled();
  await page.getByLabel('Your prediction').fill('0');
  await page.getByRole('button', { name: 'Submit prediction' }).click();
  await expect(page.getByRole('button', { name: 'Run simulation' })).toBeEnabled();
});

test('persists notes and exports local progress', async ({ page }) => {
  if ((page.viewportSize()?.width ?? 1440) <= 1100) {
    await page.getByRole('button', { name: 'Toggle curriculum' }).click();
  }
  await page.getByRole('button', { name: 'Lab notes' }).click();
  const notes = page.getByPlaceholder(/Record a derivation/);
  await notes.fill('The off-slope is -Vout/L under the ground-referenced freewheel assumption.');
  await page.waitForTimeout(100);
  await page.reload();
  if ((page.viewportSize()?.width ?? 1440) <= 1100) {
    await page.getByRole('button', { name: 'Toggle curriculum' }).click();
  }
  await page.getByRole('button', { name: 'Lab notes' }).click();
  await expect(page.getByPlaceholder(/Record a derivation/)).toHaveValue(/off-slope/);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export progress' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('constant-on-time-progress.json');
});

test('uses no external runtime network and has no serious accessibility violations', async ({ page }) => {
  test.setTimeout(60_000);
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') externalRequests.push(request.url());
  });
  await page.reload();
  if ((page.viewportSize()?.width ?? 1440) <= 1100) {
    await page.getByRole('button', { name: 'Toggle curriculum' }).click();
  }
  await page.getByRole('button', { name: /COT pulse explorer/i }).click();
  await page.getByLabel('Your prediction').fill('0');
  await page.getByRole('button', { name: 'Submit prediction' }).click();
  await expect(page.getByRole('button', { name: 'Run simulation' })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(page.getByText('Interpret the result')).toBeVisible();
  expect(externalRequests).toEqual([]);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('is keyboard operable', async ({ page }) => {
  await page.keyboard.press('Tab');
  const first = page.getByRole('button', { name: 'Toggle curriculum' });
  await expect(first).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus-visible')).toBeVisible();
});

test('reloads from the service-worker cache while offline', async ({ page, context }) => {
  await expect.poll(
    () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? 'missing'),
    { timeout: 20_000, message: 'the production service worker should install and activate' },
  ).toBe('activated');
  await expect.poll(
    () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    { timeout: 20_000, message: 'the active service worker should control the laboratory page' },
  ).toBe(true);

  await context.setOffline(true);
  try {
    const response = await page.reload({ waitUntil: 'domcontentloaded' });
    expect(response, 'offline navigation should be served by the service worker').not.toBeNull();
    expect(response?.fromServiceWorker(), 'offline navigation response should originate in the service worker').toBe(true);
    await expect(page.getByRole('heading', { name: 'Constant On-Time Lab' })).toBeVisible();
    await expect(page.getByText('Offline-ready')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('exports data, round-trips a scenario, pins a baseline, and runs a sweep', async ({ page }) => {
  await page.getByLabel('Your prediction').fill('0');
  await page.getByRole('button', { name: 'Submit prediction' }).click();
  await expect(page.getByRole('button', { name: 'Run simulation' })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(page.getByTestId('scope-plot')).toBeVisible();
  const scenarioDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scenario JSON' }).click();
  expect((await scenarioDownload).suggestedFilename()).toBe('inductor-ripple-scenario.json');

  await page.getByRole('button', { name: 'Pin baseline' }).click();
  await expect(page.getByRole('heading', { name: 'Current scenario' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pinned baseline' })).toBeVisible();
  await expect(page.getByTestId('comparison-summary')).toContainText('Input voltage');
  await expect(page.getByTestId('comparison-summary')).toContainText('12 V');
  await expect(page.getByTestId('comparison-seed')).toHaveText('Seed 0x0c072024');

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV data' }).first().click();
  expect((await csvDownload).suggestedFilename()).toBe('constant-on-time-lab-data.csv');

  await page.getByText('Parameter sweep', { exact: true }).click();
  await page.getByLabel('Sweep parameter').selectOption('phases');
  await page.getByLabel('Sweep start').fill('1');
  await page.getByLabel('Sweep stop').fill('2');
  await page.getByLabel('Sweep points').fill('9');
  await page.getByRole('button', { name: 'Run sweep' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Sweep complete: 2 distinct operating points \(9 requested\)/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.sweep-table-wrap tbody tr')).toHaveCount(2);

  const scenario = {
    schemaVersion: 1,
    kind: 'constant-on-time-lab-scenario',
    labId: 'inductor-ripple',
    seed: 0x12345678,
    parameters: { vin: 12, vout: 5, fs: 500, inductance: 1.5, load: 8, phases: 2, dcr: 3, deadTime: 50, dt: 2 },
  };
  await page.locator('.scenario-import input').setInputFiles({ name: 'scenario.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(scenario)) });
  const importStatuses = page.getByRole('status').filter({ hasText: /imported/i });
  await expect(importStatuses).toHaveCount(1);
  await expect(importStatuses).toContainText('0x12345678');
  await expect(page.getByLabel('Inductance / phase')).toHaveValue('1.5');

  await page.getByLabel('Your prediction').fill('0');
  await page.getByRole('button', { name: 'Submit prediction' }).click();
  await expect(page.getByRole('button', { name: 'Run simulation' })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(page.getByRole('region', { name: 'Current scenario' }).getByTestId('scope-plot')).toBeVisible();
  await expect(page.getByTestId('scenario-seed')).toHaveText('Seed 0x12345678');

  const importedScenarioDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scenario JSON' }).click();
  const importedDownload = await importedScenarioDownload;
  const importedDownloadPath = await importedDownload.path();
  expect(importedDownloadPath).not.toBeNull();
  const exportedScenario = JSON.parse(await readFile(importedDownloadPath ?? '', 'utf8')) as { seed?: number };
  expect(exportedScenario.seed).toBe(0x12345678);

  const impossibleScenario = { ...scenario, parameters: { ...scenario.parameters, vout: 12 } };
  await page.locator('.scenario-import input').setInputFiles({ name: 'impossible-scenario.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(impossibleScenario)) });
  await expect(page.getByRole('status').filter({ hasText: /below input voltage/i })).toHaveCount(1);
  await expect(page.getByLabel('Output target')).toHaveValue('5');
});
