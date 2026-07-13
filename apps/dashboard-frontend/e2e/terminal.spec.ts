import { test, expect } from '@playwright/test';

/**
 * Terminal / Sandbox E2E Tests
 * Verifies the xterm-based sandbox terminal mounts and accepts a tab.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

test.describe('Terminal', () => {
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

  test('navigates to the terminal', async ({ page }) => {
    await page.goto('/terminal');
    await expect(
      page.locator('text=/Terminal|Sandbox|Konsole/i').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('mounts the xterm surface', async ({ page }) => {
    await page.goto('/terminal');
    // xterm renders a .xterm container once the terminal is initialised.
    await expect(page.locator('.xterm, [class*="terminal"]').first()).toBeVisible({
      timeout: 15000,
    });
  });
});
