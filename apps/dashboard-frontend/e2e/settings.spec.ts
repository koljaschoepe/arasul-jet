import { test, expect } from '@playwright/test';

/**
 * Settings E2E Tests
 *
 * Exercises the refactored 6-tab Settings page:
 *   Allgemein · KI · Sicherheit · Datenschutz · System · Fernzugriff
 * plus the internal sub-navigations of the KI and System tabs, and a
 * profile save that surfaces a success toast.
 *
 * Runnable against E2E_BASE_URL (set by playwright.config). Not required in CI.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

const TOP_LEVEL_TABS = ['Allgemein', 'KI', 'Sicherheit', 'Datenschutz', 'System', 'Fernzugriff'];

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

  test('shows all six top-level tabs', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Einstellungen')).toBeVisible({ timeout: 10000 });

    for (const label of TOP_LEVEL_TABS) {
      await expect(page.getByRole('button', { name: label, exact: true }).first()).toBeVisible();
    }

    // Old top-level tabs are gone.
    await expect(page.getByRole('button', { name: 'KI-Profil', exact: true })).toHaveCount(0);
  });

  test('KI tab exposes its Firmenprofil / RAG & LLM sub-navigation', async ({ page }) => {
    await page.goto('/settings?tab=ki');

    await expect(page.getByText('Firmenprofil & Kontext').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('RAG & LLM').first()).toBeVisible();

    // Switch to the RAG & LLM sub-section.
    await page.getByRole('button', { name: /RAG & LLM/ }).first().click();
  });

  test('System tab exposes its Services / Updates / Self-Healing sub-navigation', async ({
    page,
  }) => {
    await page.goto('/settings?tab=system');

    await expect(page.getByText('Services').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Updates').first()).toBeVisible();
    await expect(page.getByText('Self-Healing').first()).toBeVisible();

    // Legacy deep-link should also resolve to System.
    await page.goto('/settings?tab=selfhealing');
    await expect(page.getByText('Self-Healing').first()).toBeVisible({ timeout: 10000 });
  });

  test('saving the KI profile shows a success toast', async ({ page }) => {
    await page.goto('/settings?tab=ki');

    const textarea = page.getByPlaceholder('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Make a change so the save button enables.
    await textarea.fill(`E2E context ${Date.now()}`);

    const saveButton = page.getByRole('button', { name: /Speichern/ });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // Success feedback is a toast now (no inline message).
    await expect(page.getByText(/erfolgreich gespeichert/i)).toBeVisible({ timeout: 10000 });
  });
});
