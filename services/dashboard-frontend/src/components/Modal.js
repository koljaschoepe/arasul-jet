/**
 * Modal - Accessible Modal Dialog Component
 *
 * PHASE 5: Provides an accessible modal with:
 * - Focus trap (Tab cycles within modal)
 * - Escape key closes modal
 * - Focus restoration on close
 * - ARIA attributes for screen readers
 * - Click outside to close (optional)
 */

import React, { memo, useEffect, useRef, useCallback } from 'react';
import { FiX } from 'react-icons/fi';
import './Modal.css';

/**
 * Get all focusable elements within a container
 */
function getFocusableElements(container) {
  const focusableSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  return container.querySelectorAll(focusableSelectors);
}

/**
 * Modal Component
 */
const Modal = memo(function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium', // small, medium, large, fullscreen
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  footer,
  className = '',
  initialFocusRef = null, // Ref to element that should receive initial focus
  returnFocusRef = null, // Ref to element that should receive focus on close
}) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useRef(`modal-title-${Date.now()}`);

  // Store the previously focused element and focus the modal
  useEffect(() => {
    if (isOpen) {
      // Store current focus
      previousFocusRef.current = document.activeElement;

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Focus initial element or modal itself
      requestAnimationFrame(() => {
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else if (modalRef.current) {
          // Focus first focusable element or the modal
          const focusable = getFocusableElements(modalRef.current);
          if (focusable.length > 0) {
            focusable[0].focus();
          } else {
            modalRef.current.focus();
          }
        }
      });
    } else {
      // Restore body scroll
      document.body.style.overflow = '';

      // Restore focus
      const elementToFocus = returnFocusRef?.current || previousFocusRef.current;
      if (elementToFocus && typeof elementToFocus.focus === 'function') {
        elementToFocus.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, initialFocusRef, returnFocusRef]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return;

    // Escape key closes modal
    if (e.key === 'Escape' && closeOnEscape) {
      e.preventDefault();
      onClose();
      return;
    }

    // Tab key traps focus within modal
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = getFocusableElements(modalRef.current);
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: If on first element, move to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: If on last element, move to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  }, [isOpen, closeOnEscape, onClose]);

  // Add global keyboard listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle overlay click
  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId.current : undefined}
        className={`modal modal-${size} ${className}`}
        tabIndex={-1}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="modal-header">
            {title && (
              <h2 id={titleId.current} className="modal-title">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="modal-close-btn"
                aria-label="Dialog schließen"
              >
                <FiX aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="modal-body">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Confirmation Modal - Pre-configured for confirm/cancel actions
 */
export const ConfirmModal = memo(function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Bestätigung',
  message,
  confirmText = 'Bestätigen',
  cancelText = 'Abbrechen',
  confirmVariant = 'primary', // primary, danger
  isLoading = false,
}) {
  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="small"
      footer={
        <div className="modal-actions">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`btn btn-${confirmVariant}`}
            disabled={isLoading}
          >
            {isLoading ? 'Lädt...' : confirmText}
          </button>
        </div>
      }
    >
      <p className="modal-message">{message}</p>
    </Modal>
  );
});

/**
 * Alert Modal - For displaying messages
 */
export const AlertModal = memo(function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  type = 'info', // info, success, warning, error
  buttonText = 'OK',
}) {
  const icons = {
    info: '💬',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="small"
      footer={
        <div className="modal-actions">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary"
          >
            {buttonText}
          </button>
        </div>
      }
    >
      <div className={`alert-modal-content alert-${type}`}>
        <span className="alert-modal-icon" aria-hidden="true">
          {icons[type]}
        </span>
        <p className="modal-message">{message}</p>
      </div>
    </Modal>
  );
});

export default Modal;
