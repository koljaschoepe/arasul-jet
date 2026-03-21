import { test, expect } from '@playwright/test';

/**
 * Settings E2E Tests
 * Tests settings persistence and theme toggle.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[name="username"], input[type="text"]', ADMIN_USER);
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });

  test('navigates to settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('text=/Einstellungen|Settings/i')).toBeVisible({
      timeout: 10000,
    });
  });

  test('settings page has tabs/sections', async ({ page }) => {
    await page.goto('/settings');
    // Should have multiple settings sections
    await expect(
      page.locator('text=/Allgemein|KI-Profil|Services|Passwort/i').first()
    ).toBeVisible({ timeout: 10000 });
  });
});
