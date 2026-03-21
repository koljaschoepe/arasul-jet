import { test, expect } from '@playwright/test';

/**
 * Authentication E2E Tests
 * Tests login, protected routes, and logout flow.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

test.describe('Authentication', () => {
  test('shows login page when not authenticated', async ({ page }) => {
    await page.goto('/');
    // Should redirect to login or show login form
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10000 });
  });

  test('login with valid credentials', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[name="username"], input[type="text"]', ADMIN_USER);
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');

    // Should redirect to dashboard after login
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[name="username"], input[type="text"]', 'wrong');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('text=/fehler|ungültig|invalid|error/i')).toBeVisible({
      timeout: 5000,
    });
  });

  test('protected route redirects to login', async ({ page }) => {
    // Clear any existing auth
    await page.context().clearCookies();
    await page.goto('/settings');

    // Should be on login page
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10000 });
  });

  test('logout clears session', async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.fill('input[name="username"], input[type="text"]', ADMIN_USER);
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });

    // Find and click logout
    await page.click('[data-testid="logout"], button:has-text("Abmelden"), a:has-text("Abmelden")');

    // Should be back on login
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10000 });
  });
});
