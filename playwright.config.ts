import chromiumPack from '@sparticuz/chromium';
import { defineConfig, devices } from '@playwright/test';

const executablePath = await chromiumPack.executablePath();
const chromiumArgs = chromiumPack.args.filter((arg) => arg !== '--single-process' && arg !== '--no-zygote');

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  // The bundled serverless Chromium build runs in single-process mode in the
  // restricted verification container, so serialize launches to avoid one
  // project's browser starving another of shared-memory/file descriptors.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    colorScheme: 'dark',
    launchOptions: {
      executablePath,
      args: [...chromiumArgs, '--hide-scrollbars', '--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome HiDPI'], viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 },
    },
    {
      name: 'tablet-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
