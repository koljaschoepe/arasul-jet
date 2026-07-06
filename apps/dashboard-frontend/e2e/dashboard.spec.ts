import { test, expect } from '@playwright/test';

/**
 * Dashboard E2E Tests
 * Verifies the authenticated landing dashboard renders its metric cards and
 * the system-health widget without runtime errors.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[name="username"], input[type="text"]', ADMIN_USER);
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });

  test('shows the metric stat cards', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('text=/RAM USAGE|STORAGE|TEMPERATUR|SWAP/i').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('renders the system-health widget for admins', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('text=/System-Gesundheit|Letztes Backup|Services/i').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows the navigation sidebar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=/Chat/i').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=/Einstellungen|Settings/i').first()).toBeVisible();
  });
});
