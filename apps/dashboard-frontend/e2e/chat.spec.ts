import { test, expect } from '@playwright/test';

/**
 * Chat E2E Tests
 * Tests creating chats, sending messages, and receiving responses.
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin';

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/');
    await page.fill('input[name="username"], input[type="text"]', ADMIN_USER);
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });

  test('navigates to chat page', async ({ page }) => {
    await page.goto('/chat');
    // Should show chat interface
    await expect(page.locator('textarea, [contenteditable], input[placeholder*="Nachricht"]')).toBeVisible({
      timeout: 10000,
    });
  });

  test('sends a message and receives response', async ({ page }) => {
    await page.goto('/chat');

    // Find and fill the message input
    const input = page.locator('textarea, [contenteditable], input[placeholder*="Nachricht"]');
    await input.fill('Hallo, wie geht es dir?');

    // Submit the message
    await page.keyboard.press('Enter');

    // Wait for response (LLM may take a while)
    await expect(page.locator('.chat-message, [data-role="assistant"]')).toBeVisible({
      timeout: 60000, // LLM responses can take up to 60s
    });
  });

  test('chat history persists after navigation', async ({ page }) => {
    await page.goto('/chat');

    const input = page.locator('textarea, [contenteditable], input[placeholder*="Nachricht"]');
    await input.fill('Test-Nachricht für Persistenz');
    await page.keyboard.press('Enter');

    // Wait for the message to appear
    await expect(page.locator('text=Test-Nachricht für Persistenz')).toBeVisible({ timeout: 10000 });

    // Navigate away and back
    await page.goto('/settings');
    await page.goto('/chat');

    // Previous chat should still be accessible in sidebar
    await expect(page.locator('text=Test-Nachricht')).toBeVisible({ timeout: 10000 });
  });
});
