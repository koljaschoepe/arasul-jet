/**
 * Shared Formatting Utilities
 * Used by both Frontend and Backend for consistent output.
 */

/**
 * Format bytes to human-readable size (e.g., "1.5 MB", "3.2 GB").
 * @param {number} bytes
 * @param {number} [decimals=1]
 * @returns {string}
 */
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format model size in bytes to GB/MB (e.g., "3.5 GB", "512 MB").
 * Returns 'N/A' for falsy values.
 * @param {number} bytes
 * @returns {string}
 */
function formatModelSize(bytes) {
  if (!bytes) return 'N/A';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(gb * 1024).toFixed(0)} MB`;
}

/**
 * Format a date to German locale (DD.MM.YYYY, HH:mm).
 * @param {string|Date} dateString
 * @returns {string}
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

module.exports = {
  formatBytes,
  formatModelSize,
  formatDate,
};
