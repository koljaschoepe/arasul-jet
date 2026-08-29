import { useState, useCallback, useRef, type ReactNode } from 'react';
import { Bestaetigung } from '@marken';

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
  confirmVariant: 'primary' | 'danger' | 'warning';
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

  // `warning` und `primary` waren bis H5 zwei Wege zu demselben Knopf: nur
  // `danger` faerbte ihn. Die Bibliothek kennt deshalb zwei Arten statt drei.
  const ConfirmDialog = state ? (
    <Bestaetigung
      offen={true}
      beiSchliessen={handleClose}
      beiBestaetigen={handleConfirm}
      titel={state.title}
      frage={state.message}
      jaText={state.confirmText}
      neinText={state.cancelText}
      art={state.confirmVariant === 'danger' ? 'gefahr' : 'normal'}
    />
  ) : null;

  return { confirm, ConfirmDialog };
}
