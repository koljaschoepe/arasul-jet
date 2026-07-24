import type { FacetOption } from './storeModelFilters';
import { Checkbox } from '@/components/ui/Checkbox';

/**
 * Eine Facetten-Gruppe (Checkboxen + Zähler) für die Store-Filter in der
 * Sidebar. Aus dem StoreModelsGrid herausgelöst (Plan 012 Phase C), damit sie
 * sowohl der Modell- als auch der Erweiterungs-Filter nutzen kann.
 */
export function FacetGroup<T extends string>({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FacetOption<T>[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h4 className="px-1 text-ui-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {options.map(opt => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-ui-sm text-foreground transition-colors hover:bg-accent"
        >
          <Checkbox
            checked={selected.includes(opt.value)}
            onCheckedChange={() => onToggle(opt.value)}
          />
          <span className="min-w-0 flex-1 truncate">{opt.label}</span>
          <span className="shrink-0 text-ui-xs tabular-nums text-muted-foreground">
            {opt.count}
          </span>
        </label>
      ))}
    </div>
  );
}

export default FacetGroup;
