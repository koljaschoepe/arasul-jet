import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Crumb {
  /** Display label. */
  label: string;
  /** Link target; omit for the current (last) crumb. */
  to?: string;
  /** Optional icon to render before the label. */
  icon?: React.ReactNode;
}

interface BreadcrumbsProps {
  /**
   * Trail of breadcrumbs from root to current. The last item is rendered
   * as plain text (current page); earlier items as links if `to` is set.
   */
  items: Crumb[];
  /** Render a Home icon as the implicit first crumb. */
  showHome?: boolean;
  /** Where the home link points. */
  homeTo?: string;
  className?: string;
}

/**
 * Breadcrumbs — Navigation trail. Standard ARIA semantics
 * (`<nav aria-label="Breadcrumb">` + `<ol>` with `aria-current="page"`
 * on the current item).
 *
 * Usage:
 *   <Breadcrumbs items={[
 *     { label: 'Daten', to: '/data' },
 *     { label: 'Tabellen', to: '/database' },
 *     { label: tableName }, // current page — no `to`
 *   ]} />
 */
export default function Breadcrumbs({
  items,
  showHome = true,
  homeTo = '/',
  className,
}: BreadcrumbsProps) {
  const allItems: Crumb[] = showHome
    ? [{ label: 'Dashboard', to: homeTo, icon: <Home className="size-3.5" /> }, ...items]
    : items;

  return (
    <nav aria-label="Breadcrumb" className={cn('text-sm', className)}>
      <ol className="flex items-center gap-1 flex-wrap">
        {allItems.map((crumb, idx) => {
          const isLast = idx === allItems.length - 1;
          const content = (
            <span className="inline-flex items-center gap-1">
              {crumb.icon}
              {crumb.label}
            </span>
          );
          return (
            <li key={`${crumb.label}-${idx}`} className="inline-flex items-center gap-1">
              {idx > 0 && (
                <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
              )}
              {isLast || !crumb.to ? (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1 px-1 py-0.5 rounded',
                    isLast ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}
                >
                  {content}
                </span>
              ) : (
                <Link
                  to={crumb.to}
                  className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
