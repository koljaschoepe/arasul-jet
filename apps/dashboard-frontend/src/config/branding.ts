/**
 * Branding Configuration
 * Central configuration for white-label branding via environment variables.
 *
 * Override defaults by setting VITE_PLATFORM_NAME, VITE_PLATFORM_WEBSITE,
 * VITE_PLATFORM_DESCRIPTION, or VITE_SUPPORT_EMAIL in .env or at build time.
 */

export const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || 'Arasul';
export const PLATFORM_DESCRIPTION =
  import.meta.env.VITE_PLATFORM_DESCRIPTION || 'Edge-KI Verwaltungssystem';
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'info@arasul.de';
/** Öffentliche Website — u. a. für „Passwort vergessen"-Hilfe verlinkt. */
export const PLATFORM_WEBSITE = import.meta.env.VITE_PLATFORM_WEBSITE || 'https://arasul.de';
