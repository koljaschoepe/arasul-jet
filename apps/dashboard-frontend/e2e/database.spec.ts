import { test, expect } from '@playwright/test';

/**
 * Datentabellen (Database) E2E Tests
 * Verifies the data-tables overview renders and can open a table or its
 * create affordance.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

test.describe('Datentabellen', () => {
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

  test('navigates to the data tables overview', async ({ page }) => {
    await page.goto('/database');
    await expect(
      page.locator('text=/Datentabelle|Tabelle|Daten|Table/i').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows a table list or a create-table affordance', async ({ page }) => {
    await page.goto('/database');
    await expect(
      page.locator('text=/erstellen|Neue Tabelle|hinzufügen|Create|import|Import/i').first()
    ).toBeVisible({ timeout: 15000 });
  });
});
