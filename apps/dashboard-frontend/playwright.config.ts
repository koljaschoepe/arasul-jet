import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for Arasul Dashboard
 *
 * Setup: npm install -D @playwright/test && npx playwright install chromium
 * Run:   npx playwright test
 *
 * On Jetson (ARM64), use snap Chromium:
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/snap/bin/chromium npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sequential on single Jetson device
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30000,

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Use snap Chromium on Jetson if available
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
      },
    },
  ],
});
