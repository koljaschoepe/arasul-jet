import React, { memo } from 'react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  message?: string | null;
  fullscreen?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const sizeConfig = {
  small: { container: 'w-8 h-8', border: 'border-2' },
  medium: { container: 'w-16 h-16', border: 'border-3' },
  large: { container: 'w-20 h-20', border: 'border-4' },
};

const ringColors = [
  'border-t-[var(--primary-color)]',
  'border-t-[var(--primary-hover)]',
  'border-t-[var(--primary-active)]',
  'border-t-[var(--primary-color)]/50',
];

const ringDelays = ['0ms', '-150ms', '-300ms', '-450ms'];

const LoadingSpinner = memo(function LoadingSpinner({
  message = 'Laden...',
  fullscreen = false,
  size = 'large',
  className = '',
}: LoadingSpinnerProps) {
  const config = sizeConfig[size];

  return (
    <div
      className={cn(
        'loading-spinner flex flex-col items-center justify-center',
        fullscreen
          ? 'loading-spinner-fullscreen min-h-screen bg-[var(--bg-dark)]'
          : 'loading-spinner-inline p-12',
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={cn('spinner-animation relative', config.container)} aria-hidden="true">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={cn(
              'spinner-ring absolute inset-0 rounded-full border-transparent animate-[spinner-rotate_1.2s_cubic-bezier(0.4,0,0.2,1)_infinite]',
              config.border,
              ringColors[i]
            )}
            style={{ animationDelay: ringDelays[i] }}
          />
        ))}
      </div>
      {message && (
        <p className="spinner-message mt-6 text-muted-foreground text-base font-medium animate-[message-pulse_2s_ease-in-out_infinite]">
          {message}
        </p>
      )}
      {!message && <span className="sr-only">Wird geladen...</span>}
    </div>
  );
});

export default LoadingSpinner;
