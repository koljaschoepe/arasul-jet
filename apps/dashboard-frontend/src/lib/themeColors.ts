/**
 * Centralized theme color constants for places where a literal hex is needed
 * (e.g. defaults persisted to the backend, fallbacks for getCssVar). Anywhere
 * possible, use Tailwind utilities (`bg-primary`) or `var(--primary)` instead
 * of importing from here — this file exists to avoid drift in the few sites
 * that genuinely cannot read CSS variables (initial form state, defaults
 * posted to the API, etc.).
 *
 * Brand-blue stays in sync with `--primary` in `index.css`.
 */
export const DEFAULT_PROJECT_COLOR = '#45ADFF';
