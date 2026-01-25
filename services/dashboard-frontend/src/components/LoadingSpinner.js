import React, { memo } from 'react';
import './LoadingSpinner.css';

/**
 * LoadingSpinner - Apple iOS-style loading indicator
 *
 * @param {string} message - Loading message to display
 * @param {boolean} fullscreen - Whether to take up full screen
 * @param {string} size - Size variant: 'small' (32px), 'medium' (64px), 'large' (80px)
 * @param {string} className - Additional CSS class name
 */
const LoadingSpinner = memo(function LoadingSpinner({
  message = 'Laden...',
  fullscreen = false,
  size = 'large',
  className = ''
}) {
  const containerClass = fullscreen ? 'loading-spinner-fullscreen' : 'loading-spinner-inline';
  const sizeClass = `spinner-size-${size}`;

  return (
    <div
      className={`${containerClass} ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={`spinner-animation ${sizeClass}`} aria-hidden="true">
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
      </div>
      {message && <p className="spinner-message">{message}</p>}
      {/* Screen reader announcement - only if no visible message */}
      {!message && <span className="sr-only">Wird geladen...</span>}
    </div>
  );
});

export default LoadingSpinner;
