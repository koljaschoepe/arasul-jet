/**
 * Checkbox — eine schlanke, theme-treue Checkbox als App-Primitive.
 *
 * Bewusst KEINE native `<input type="checkbox">`-Optik: die rendert je nach
 * Browser/Theme einen großen weißen Kasten, der im dunklen Dashboard fremd
 * wirkt. Stattdessen ein `appearance-none`-Input (voll bedienbar, fokussierbar,
 * a11y-korrekt) mit einer gezeichneten Box darüber — leer = Rahmen in
 * `--border`, gewählt = Fläche in `--primary` mit weißem Haken.
 *
 * Kein Radix/shadcn-Paket nötig; nur Tailwind-Utilities auf Theme-Tokens.
 */
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Für Screenreader, wenn kein umgebendes <label> den Namen liefert. */
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}: CheckboxProps) {
  return (
    <span
      className={cn('relative inline-flex size-4 shrink-0 items-center justify-center', className)}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={e => onCheckedChange(e.target.checked)}
        className={cn(
          'peer size-4 cursor-pointer appearance-none rounded-[5px] border border-border bg-background',
          'transition-colors checked:border-primary checked:bg-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      />
      <Check
        className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
        strokeWidth={3}
        aria-hidden="true"
      />
    </span>
  );
}

export default Checkbox;
