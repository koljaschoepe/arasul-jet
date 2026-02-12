/**
 * useConfirm - Promise-based confirmation dialog hook
 *
 * Wraps ConfirmModal with async API for easy window.confirm replacement.
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   const ok = await confirm({ message: 'Wirklich löschen?' });
 *   if (!ok) return;
 *   // ... in JSX: <ConfirmDialog />
 */

import { useState, useCallback, useRef } from 'react';
import { ConfirmModal } from '../components/Modal';

export default function useConfirm() {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback(
    ({
      title = 'Bestätigung',
      message,
      confirmText = 'Löschen',
      cancelText = 'Abbrechen',
      confirmVariant = 'danger',
    } = {}) => {
      return new Promise(resolve => {
        resolveRef.current = resolve;
        setState({ title, message, confirmText, cancelText, confirmVariant });
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState(null);
  }, []);

  const handleClose = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState(null);
  }, []);

  const ConfirmDialog = state ? (
    <ConfirmModal
      isOpen={true}
      onClose={handleClose}
      onConfirm={handleConfirm}
      title={state.title}
      message={state.message}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      confirmVariant={state.confirmVariant}
    />
  ) : null;

  return { confirm, ConfirmDialog };
}
