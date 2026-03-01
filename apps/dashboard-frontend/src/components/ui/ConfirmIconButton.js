import React, { memo, useState, useRef, useEffect } from 'react';
import { FiCheck, FiX } from 'react-icons/fi';

/**
 * ConfirmIconButton - A compact square icon button with inline confirmation
 *
 * Features:
 * - Small square button showing only an icon
 * - Tooltip on hover showing the action name
 * - Click opens a confirmation popup
 * - Confirm/Cancel buttons in the popup
 * - Click outside or Escape key cancels
 *
 * @param {ReactNode} icon - The icon to display in the button
 * @param {string} label - Tooltip text shown on hover
 * @param {string} confirmText - Text shown in confirmation popup (e.g., "Stoppen?")
 * @param {function} onConfirm - Callback when action is confirmed
 * @param {string} variant - Button style variant: 'danger', 'warning', 'primary'
 * @param {boolean} disabled - Whether the button is disabled
 * @param {boolean} loading - Whether to show loading state
 */
const ConfirmIconButton = memo(function ConfirmIconButton({
  icon,
  label,
  confirmText,
  onConfirm,
  variant = 'danger',
  disabled = false,
  loading = false,
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const wrapperRef = useRef(null);

  // Handle click outside to close
  useEffect(() => {
    if (!showConfirm) return;

    const handleClickOutside = e => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowConfirm(false);
      }
    };

    const handleEscape = e => {
      if (e.key === 'Escape') {
        setShowConfirm(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showConfirm]);

  const handleConfirm = e => {
    e.stopPropagation();
    setShowConfirm(false);
    onConfirm();
  };

  const handleCancel = e => {
    e.stopPropagation();
    setShowConfirm(false);
  };

  const handleButtonClick = e => {
    e.stopPropagation();
    if (!disabled && !loading) {
      setShowConfirm(true);
    }
  };

  return (
    <div className="confirm-btn-wrapper" ref={wrapperRef}>
      {!showConfirm ? (
        <button
          type="button"
          className={`btn-icon-square btn-icon-${variant}`}
          onClick={handleButtonClick}
          disabled={disabled || loading}
          title={label}
          aria-label={label}
        >
          {icon}
        </button>
      ) : (
        <div className={`confirm-popup confirm-popup-${variant}`}>
          <span className="confirm-text">{confirmText}</span>
          <button
            type="button"
            className="confirm-yes"
            onClick={handleConfirm}
            title="Bestätigen"
            aria-label="Bestätigen"
          >
            <FiCheck />
          </button>
          <button
            type="button"
            className="confirm-no"
            onClick={handleCancel}
            title="Abbrechen"
            aria-label="Abbrechen"
          >
            <FiX />
          </button>
        </div>
      )}
    </div>
  );
});

export default ConfirmIconButton;
