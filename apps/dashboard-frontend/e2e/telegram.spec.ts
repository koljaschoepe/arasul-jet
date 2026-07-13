import { test, expect } from '@playwright/test';

/**
 * Telegram Bot E2E Tests
 * Verifies the Telegram bot management page renders its sections without errors.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

test.describe('Telegram', () => {
  test.beforeEach(async ({ page }) => {
    // Workspace-Shell ist Default (Schritt 10) — diese Legacy-Spec erwartet die
    // klassische Sidebar-UI auf '/', daher explizit den Opt-out setzen.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('arasul_workspace_shell', 'false');
      } catch {
        /* localStorage nicht verfügbar */
      }
    });
    await page.goto('/');
    await page.fill('input[name="username"], input[type="text"]', ADMIN_USER);
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });

  test('navigates to the telegram bot page', async ({ page }) => {
    await page.goto('/telegram-bot');
    await expect(
      page.locator('text=/Telegram|Bot/i').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows bot list or setup entry point', async ({ page }) => {
    await page.goto('/telegram-bot');
    // Either an existing bot list, or the "create/setup a bot" affordance.
    await expect(
      page.locator('text=/Bot erstellen|Neuer Bot|hinzufügen|Setup|einrichten|aktiv/i').first()
    ).toBeVisible({ timeout: 15000 });
  });
});
