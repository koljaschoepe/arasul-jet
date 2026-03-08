import * as React from 'react';
import { XIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/shadcn/dialog';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';

const sizeClasses: Record<string, string> = {
  small: 'sm:max-w-[400px]',
  medium: 'sm:max-w-[560px]',
  large: 'sm:max-w-[800px]',
  fullscreen: 'sm:max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]',
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  footer?: React.ReactNode;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  footer,
  className = '',
}: ModalProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={cn(
          'modal flex flex-col bg-card p-0 gap-0 max-h-[calc(100vh-2rem)]',
          sizeClasses[size],
          className
        )}
        showCloseButton={false}
        onInteractOutside={closeOnOverlayClick ? undefined : e => e.preventDefault()}
        onEscapeKeyDown={closeOnEscape ? undefined : e => e.preventDefault()}
      >
        {title && (
          <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-border space-y-0 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              {title}
            </DialogTitle>
            <DialogClose
              className="flex items-center justify-center size-8 rounded-md bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Dialog schließen"
            >
              <XIcon className="size-4" />
            </DialogClose>
          </DialogHeader>
        )}
        <div className="modal-body flex-1 px-5 py-4 overflow-y-auto text-card-foreground">
          {children}
        </div>
        {footer && (
          <DialogFooter className="modal-footer px-5 py-4 border-t border-border shrink-0">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  title?: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'danger';
  isLoading?: boolean;
}

export const ConfirmModal = function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Bestätigung',
  message,
  confirmText = 'Bestätigen',
  cancelText = 'Abbrechen',
  confirmVariant = 'primary',
  isLoading = false,
}: ConfirmModalProps) {
  const handleConfirm = async () => {
    if (onConfirm) await onConfirm();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="small"
      footer={
        <div className="flex gap-3 w-full justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={confirmVariant === 'danger' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Lädt...' : confirmText}
          </Button>
        </div>
      }
    >
      <p className="modal-message text-muted-foreground">{message}</p>
    </Modal>
  );
};

export default Modal;
