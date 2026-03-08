/**
 * Slug Generator Utility
 * Generates URL-safe slugs from names with German umlaut support
 */

/**
 * Generate a URL-safe slug from a name
 * @param {string} name - The name to convert to a slug
 * @returns {string} URL-safe slug
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

module.exports = { generateSlug };
