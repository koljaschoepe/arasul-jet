import { useState, useCallback, useRef, type ReactNode } from 'react';
import { ConfirmModal } from '../components/ui/Modal';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
}

interface ConfirmState {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  confirmVariant: string;
}

interface UseConfirmReturn {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  ConfirmDialog: ReactNode;
}

export default function useConfirm(): UseConfirmReturn {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    ({
      title = 'Bestätigung',
      message,
      confirmText = 'Löschen',
      cancelText = 'Abbrechen',
      confirmVariant = 'danger',
    }: ConfirmOptions) => {
      return new Promise<boolean>(resolve => {
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
