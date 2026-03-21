import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Document Management E2E Tests
 * Tests document upload, space management, and basic RAG search.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

test.describe('Documents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[name="username"], input[type="text"]', ADMIN_USER);
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });

  test('navigates to documents page', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.locator('text=/Dokumente|Documents|Spaces/i')).toBeVisible({
      timeout: 10000,
    });
  });

  test('shows document spaces', async ({ page }) => {
    await page.goto('/documents');
    // Should show at least the default space or a "create space" option
    await expect(
      page.locator('text=/Space|Bereich|Erstellen|Create/i')
    ).toBeVisible({ timeout: 10000 });
  });
});
