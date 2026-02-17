/**
 * Sanitize URLs to prevent javascript: and other dangerous protocol XSS vectors.
 * Use for any href or src attribute that receives data from API responses.
 */

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';

  const trimmed = url.trim();
  if (!trimmed) return '#';

  try {
    const parsed = new URL(trimmed);
    if (SAFE_PROTOCOLS.includes(parsed.protocol)) {
      return trimmed;
    }
    return '#';
  } catch {
    // Relative URLs are safe (no protocol to exploit)
    if (trimmed.startsWith('/') || trimmed.startsWith('.')) {
      return trimmed;
    }
    return '#';
  }
}
