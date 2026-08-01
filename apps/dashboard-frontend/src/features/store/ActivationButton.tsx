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

  // Das Backend streamt beim Laden ehrliche Indeterminate-Updates
  // (progress: -1) statt erfundener Prozente — dann Spinner + Text zeigen,
  // nie „-1%".
  const hasPercent = activatingPercent > 0;

  return (
    <Button
      size={size}
      className={cn('flex-1', className)}
      onClick={onActivate}
      disabled={isActivating}
      style={
        isActivating && hasPercent
          ? {
              background: `linear-gradient(90deg, var(--success) ${activatingPercent}%, var(--card) ${activatingPercent}%)`,
              borderColor: 'var(--success)',
              color: activatingPercent > 50 ? 'white' : undefined,
            }
          : {}
      }
    >
      {isActivating ? (
        <>
          <RefreshCw className="size-4 animate-spin" />
          {hasPercent ? `${activatingPercent}%` : 'Lädt in RAM …'}
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
