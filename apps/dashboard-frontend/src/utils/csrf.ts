/**
 * CSRF Token Utility
 * Reads the CSRF token from the arasul_csrf cookie set by the backend on login.
 * The token is sent as X-CSRF-Token header on state-changing requests.
 */

const CSRF_COOKIE = 'arasul_csrf';

/**
 * Read the CSRF token from the cookie
 * @returns The CSRF token string, or null if not set
 */
export function getCsrfToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
