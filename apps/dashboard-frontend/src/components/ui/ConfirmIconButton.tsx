import React, { memo, useState, useRef, useEffect, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    button: 'hover:bg-red-500/20 hover:text-red-400',
    popup: 'border-red-500/30 bg-red-500/10',
    confirm: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
  },
  warning: {
    button: 'hover:bg-yellow-500/20 hover:text-yellow-400',
    popup: 'border-yellow-500/30 bg-yellow-500/10',
    confirm: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  },
  primary: {
    button: 'hover:bg-primary/20 hover:text-primary',
    popup: 'border-primary/30 bg-primary/10',
    confirm: 'bg-primary/20 text-primary hover:bg-primary/30',
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
        <button
          type="button"
          className={cn(
            'btn-icon-square flex items-center justify-center size-8 rounded-md bg-transparent text-muted-foreground transition-colors',
            `btn-icon-${variant}`,
            styles.button,
            (disabled || loading) && 'opacity-50 cursor-not-allowed'
          )}
          onClick={handleButtonClick}
          disabled={disabled || loading}
          title={label}
          aria-label={label}
        >
          {icon}
        </button>
      ) : (
        <div
          className={cn(
            'confirm-popup flex items-center gap-2 px-3 py-1.5 rounded-md border',
            `confirm-popup-${variant}`,
            styles.popup
          )}
        >
          <span className="confirm-text text-sm font-medium whitespace-nowrap">{confirmText}</span>
          <button
            type="button"
            className={cn(
              'confirm-yes flex items-center justify-center size-7 rounded transition-colors',
              styles.confirm
            )}
            onClick={handleConfirm}
            title="Bestätigen"
            aria-label="Bestätigen"
          >
            <Check className="size-4" />
          </button>
          <button
            type="button"
            className="confirm-no flex items-center justify-center size-7 rounded bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
            onClick={handleCancel}
            title="Abbrechen"
            aria-label="Abbrechen"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
});

export default ConfirmIconButton;
