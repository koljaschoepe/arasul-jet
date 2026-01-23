/**
 * Token Utility Functions
 *
 * LOW-PRIORITY-FIX 4.5: Token validation and management utilities
 * Provides consistent token handling across the application
 */

const TOKEN_KEY = 'arasul_token';

/**
 * Get the authentication token from localStorage with validation
 *
 * @returns {string|null} Valid token or null if invalid/expired
 */
export const getValidToken = () => {
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
    const payload = JSON.parse(atob(parts[1]));

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
  } catch (e) {
    // If parsing fails, let the server validate
    // This handles cases where the token uses a non-standard format
    console.debug('Could not parse token payload, server will validate');
    return token;
  }
};

/**
 * Set the authentication token
 *
 * @param {string} token - The JWT token to store
 */
export const setToken = (token) => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
};

/**
 * Remove the authentication token
 */
export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

/**
 * Check if a valid token exists
 *
 * @returns {boolean} True if a valid token exists
 */
export const hasValidToken = () => {
  return getValidToken() !== null;
};

/**
 * Get token expiration time
 *
 * @returns {Date|null} Expiration date or null if not available
 */
export const getTokenExpiration = () => {
  const token = localStorage.getItem(TOKEN_KEY);

  if (!token) {
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp) {
      return new Date(payload.exp * 1000);
    }

    return null;
  } catch (e) {
    return null;
  }
};

// Export token key for consistency
export const TOKEN_STORAGE_KEY = TOKEN_KEY;
