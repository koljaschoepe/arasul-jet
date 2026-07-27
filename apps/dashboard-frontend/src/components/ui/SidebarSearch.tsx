import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { cn } from '@/lib/utils';

/**
 * Einheitliche Sidebar-Suchleiste — dieselbe Optik in allen Ansichten
 * (Dateien · Modelle · Erweiterungen · Flows). Icon links, Leeren-Knopf rechts.
 * Bewusst als eine Komponente, damit die Suche überall gleich aussieht und sich
 * gleich anfühlt (Nutzerwunsch B2).
 */
export function SidebarSearch({
  value,
  onChange,
  placeholder = 'Suchen…',
  ariaLabel = 'Durchsuchen',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-9 pl-8 pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Suche leeren"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export default SidebarSearch;
