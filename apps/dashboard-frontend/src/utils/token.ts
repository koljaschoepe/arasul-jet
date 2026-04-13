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
  if (parts.length !== 3) {
    console.warn('Invalid token format detected, removing');
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }

  // Check if token is expired
  try {
    // Decode the payload (second part of JWT)
    const payload: JwtPayload = JSON.parse(atob(parts[1]));

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
 * Set the authentication token
 *
 * @param token - The JWT token to store
 */
export const setToken = (token: string): void => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
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
    if (parts.length !== 3) {
      return null;
    }

    const payload: JwtPayload = JSON.parse(atob(parts[1]));
    if (payload.exp) {
      return new Date(payload.exp * 1000);
    }

    return null;
  } catch {
    return null;
  }
};
