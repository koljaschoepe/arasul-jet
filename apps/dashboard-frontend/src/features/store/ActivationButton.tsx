/**
 * ActivationButton Component
 * Unified activation button with gradient-fill progress
 * Used in StoreHome and StoreModels for consistent activation UX
 */

import { Zap, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';

interface ActivationButtonProps {
  isActivating: boolean;
  isLoaded: boolean;
  activatingPercent?: number;
  onActivate: () => void;
  size?: 'sm' | 'default';
  className?: string;
}

function ActivationButton({
  isActivating,
  isLoaded,
  activatingPercent = 0,
  onActivate,
  size = 'sm',
  className,
}: ActivationButtonProps) {
  if (isLoaded) {
    return (
      <Button size={size} className={cn('flex-1', className)} disabled>
        <Check className="size-4" /> Aktiv
      </Button>
    );
  }

  return (
    <Button
      size={size}
      className={cn('flex-1', className)}
      onClick={onActivate}
      disabled={isActivating}
      style={
        isActivating
          ? {
              background: `linear-gradient(90deg, var(--color-success) ${activatingPercent}%, var(--card) ${activatingPercent}%)`,
              borderColor: 'var(--color-success)',
              color: activatingPercent > 50 ? 'white' : undefined,
            }
          : {}
      }
    >
      {isActivating ? (
        <>
          <RefreshCw className="size-4 animate-spin" /> {activatingPercent}%
        </>
      ) : (
        <>
          <Zap className="size-4" /> Aktivieren
        </>
      )}
    </Button>
  );
}

export default ActivationButton;
