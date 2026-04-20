import React, { memo, useState, useRef, useEffect, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/shadcn/button';

interface ConfirmIconButtonProps {
  icon: ReactNode;
  label: string;
  confirmText: string;
  onConfirm: () => void;
  variant?: 'danger' | 'warning' | 'primary';
  disabled?: boolean;
  loading?: boolean;
}

const variantStyles = {
  danger: {
    trigger: 'hover:bg-destructive/10 hover:text-destructive',
    popup: 'border-destructive/30 bg-destructive/10',
    confirm: 'hover:bg-destructive/20 text-destructive',
  },
  warning: {
    trigger: 'hover:bg-muted-foreground/10 hover:text-muted-foreground',
    popup: 'border-muted-foreground/30 bg-muted-foreground/10',
    confirm: 'hover:bg-muted-foreground/20 text-muted-foreground',
  },
  primary: {
    trigger: 'hover:bg-primary/10 hover:text-primary',
    popup: 'border-primary/30 bg-primary/10',
    confirm: 'hover:bg-primary/20 text-primary',
  },
};

const ConfirmIconButton = memo(function ConfirmIconButton({
  icon,
  label,
  confirmText,
  onConfirm,
  variant = 'danger',
  disabled = false,
  loading = false,
}: ConfirmIconButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const styles = variantStyles[variant];

  useEffect(() => {
    if (!showConfirm) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowConfirm(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowConfirm(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    // Focus confirm button when popup opens
    requestAnimationFrame(() => confirmBtnRef.current?.focus());

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showConfirm]);

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(false);
    onConfirm();
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(false);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && !loading) {
      setShowConfirm(true);
    }
  };

  return (
    <div className="confirm-btn-wrapper relative inline-flex" ref={wrapperRef}>
      {!showConfirm ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(
            `btn-icon-${variant}`,
            'text-muted-foreground',
            styles.trigger,
            (disabled || loading) && 'opacity-50 cursor-not-allowed'
          )}
          onClick={handleButtonClick}
          disabled={disabled || loading}
          title={label}
          aria-label={label}
        >
          {icon}
        </Button>
      ) : (
        <div
          className={cn(
            'confirm-popup flex items-center gap-2 px-3 py-1.5 rounded-md border',
            `confirm-popup-${variant}`,
            styles.popup
          )}
        >
          <span className="confirm-text text-sm font-medium whitespace-nowrap">{confirmText}</span>
          <Button
            ref={confirmBtnRef}
            variant="ghost"
            size="icon-xs"
            className={cn('confirm-yes', styles.confirm)}
            onClick={handleConfirm}
            title="Bestätigen"
            aria-label="Bestätigen"
          >
            <Check className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="confirm-no text-muted-foreground"
            onClick={handleCancel}
            title="Abbrechen"
            aria-label="Abbrechen"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
});

export default ConfirmIconButton;
