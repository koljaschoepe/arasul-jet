import { test, expect } from '@playwright/test';

/**
 * Store E2E Tests
 * Verifies the model/app store lists its catalog and opens without errors.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

test.describe('Store', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[name="username"], input[type="text"]', ADMIN_USER);
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });

  test('navigates to the store', async ({ page }) => {
    await page.goto('/store');
    await expect(
      page.locator('text=/Store|Modelle|Models|Apps/i').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('lists available models or apps', async ({ page }) => {
    await page.goto('/store');
    // Either the model catalog or an app grid should surface at least one entry
    // or an explicit empty-state — never a blank/error screen.
    await expect(
      page.locator('text=/installier|Install|verfügbar|available|Aktiviere|Details/i').first()
    ).toBeVisible({ timeout: 15000 });
  });
});
