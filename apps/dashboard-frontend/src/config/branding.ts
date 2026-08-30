/**
 * Branding Configuration
 * Central configuration for white-label branding via environment variables.
 *
 * Override defaults by setting VITE_PLATFORM_NAME, VITE_PLATFORM_WEBSITE,
 * or VITE_SUPPORT_EMAIL in .env or at build time.
 *
 * KEIN SLOGAN MEHR (Auftrag anmeldung-ohne-slogan, 30.08.2026). Bis dahin
 * stand hier `PLATFORM_DESCRIPTION` („Eure Apps, auf eurem Geraet"), der Satz
 * unter dem Namen auf der Anmeldeseite. Ein Mitarbeiter, der das liest, haelt
 * die Software fuer ein Bastelprodukt. Die Anmeldeseite zeigt jetzt das
 * Maskottchen und den Namen des Unternehmens aus den Einstellungen
 * (`GET /api/auth/needs-setup`, Fallback: `PLATFORM_NAME`), und darunter
 * klein „Betrieben mit Arasul". Ein Beschreibungssatz gehoert dort nicht hin.
 */

export const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || 'Arasul';
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'info@arasul.de';
/** Öffentliche Website — u. a. für „Passwort vergessen"-Hilfe verlinkt. */
export const PLATFORM_WEBSITE = import.meta.env.VITE_PLATFORM_WEBSITE || 'https://arasul.de';
