/**
 * Token Utility Functions
 *
 * LOW-PRIORITY-FIX 4.5: Token validation and management utilities
 * Provides consistent token handling across the application
 */

const TOKEN_KEY = 'arasul_token';

interface JwtPayload {
  exp?: number;
  [key: string]: unknown;
}

/**
 * Decode a JWT base64url payload. JWT uses base64url (`-`/`_`/no padding),
 * `atob` only accepts standard base64 (`+`/`/`/with padding). The conversion
 * here is what RFC 7519 §5.1 specifies. Without it, payloads containing the
 * URL-safe characters throw `InvalidCharacterError` in some browsers, the
 * caller falls into the catch, and an unparseable (potentially expired)
 * token is returned unchecked.
 */
function decodeBase64UrlJson(segment: string): JwtPayload {
  const padded = segment
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(segment.length + ((4 - (segment.length % 4)) % 4), '=');
  return JSON.parse(atob(padded));
}

/**
 * Get the authentication token from localStorage with validation
 *
 * @returns Valid token or null if invalid/expired
 */
export const getValidToken = (): string | null => {
  const token = localStorage.getItem(TOKEN_KEY);

  if (!token) {
    return null;
  }

  // Basic JWT format check (3 parts separated by dots)
  const parts = token.split('.');
  const payloadPart = parts[1];
  if (parts.length !== 3 || payloadPart === undefined) {
    console.warn('Invalid token format detected, removing');
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }

  // Check if token is expired
  try {
    // Decode the payload (second part of JWT) — base64url, not standard base64.
    const payload: JwtPayload = decodeBase64UrlJson(payloadPart);

    // Check expiration if present
    if (payload.exp) {
      const expirationTime = payload.exp * 1000; // Convert to milliseconds
      const now = Date.now();

      if (now >= expirationTime) {
        console.warn('Token has expired, removing');
        localStorage.removeItem(TOKEN_KEY);
        return null;
      }

      // Warn if token expires soon (within 5 minutes)
      const fiveMinutes = 5 * 60 * 1000;
      if (expirationTime - now < fiveMinutes) {
        console.warn('Token expires soon');
      }
    }

    return token;
  } catch {
    // If parsing fails, let the server validate
    // This handles cases where the token uses a non-standard format
    console.debug('Could not parse token payload, server will validate');
    return token;
  }
};

/**
 * Get token expiration time
 *
 * @returns Expiration date or null if not available
 */
export const getTokenExpiration = (): Date | null => {
  const token = localStorage.getItem(TOKEN_KEY);

  if (!token) {
    return null;
  }

  try {
    const parts = token.split('.');
    const payloadPart = parts[1];
    if (parts.length !== 3 || payloadPart === undefined) {
      return null;
    }

    const payload: JwtPayload = decodeBase64UrlJson(payloadPart);
    if (payload.exp) {
      return new Date(payload.exp * 1000);
    }

    return null;
  } catch {
    return null;
  }
};
