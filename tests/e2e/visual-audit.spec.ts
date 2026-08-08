import { expect, test } from '@playwright/test';

const labs = [
  ['current-path', 'Current paths', 'Current-Path Puzzle'],
  ['inductor-ripple', 'Inductor ripple', 'Inductor Ripple Sandbox'],
  ['capacitor-ripple', 'Output ripple', 'Capacitor and Output-Ripple Sandbox'],
  ['conduction-identification', 'CCM / DCM', 'CCM/DCM Waveform Identification'],
  ['operating-point', 'Operating point', 'Buck Operating-Point Designer'],
  ['pole-zero', 'Pole / zero', 'Pole-and-Zero Explorer'],
  ['crossover-tuning', 'Crossover tuning', 'Crossover-Frequency Tuning Lab'],
  ['error-amplifier', 'Error amplifier', 'Error-Amplifier Builder'],
  ['peak-current', 'Peak current mode', 'Peak-Current-Mode Pulse Simulator'],
  ['cot-pulse', 'COT pulse explorer', 'Constant On-Time Pulse Simulator'],
  ['ripple-injection', 'Ripple injection', 'COT Ripple-Injection Challenge'],
  ['control-comparison', 'Mode comparison', 'Control-Mode Comparison Lab'],
  ['interleaving', 'Interleaving', 'Multiphase Interleaving Visualizer'],
  ['cot-scheduler', 'COT scheduler', 'Multiphase COT Scheduler Simulator'],
  ['current-sharing', 'Current sharing', 'Current-Sharing Challenge'],
  ['pspice-blocks', 'PSpice blocks', 'PSpice Block-Construction Puzzle'],
  ['broken-model', 'Debugging lab', 'Broken-Model Debugging Laboratory'],
] as const;

for (const [id, navigationLabel, title] of labs) {
  test(`captures ${id} at a representative operating point`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'The tablet continuation is covered by the primary visual regression.');
    test.setTimeout(60_000);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Constant On-Time Lab' })).toBeVisible();
    await page.getByRole('button', { name: navigationLabel, exact: true }).click({ force: true });
    await expect(page.locator('.workbench-header h2')).toHaveText(title);
    await page.getByLabel('Your prediction').fill('0');
    await page.getByRole('button', { name: 'Submit prediction' }).click();
    await expect(page.getByRole('button', { name: 'Run simulation' })).toBeEnabled({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Run simulation' }).click();
    await expect(page.getByTestId('scope-plot')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await page.screenshot({ path: `docs/screenshots/labs/${id}.png`, animations: 'disabled' });
    const supplemental = page.getByTestId('supplemental-scope').first();
    if (await supplemental.count()) {
      await supplemental.scrollIntoViewIfNeeded();
      await supplemental.screenshot({ path: `docs/screenshots/labs/${id}-supplemental.png`, animations: 'disabled' });
    }
  });
}
