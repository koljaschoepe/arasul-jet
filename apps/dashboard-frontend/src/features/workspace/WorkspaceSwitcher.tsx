import { useQuery } from '@tanstack/react-query';
import { Boxes, Check, ChevronDown, CircleSlash } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { useApi } from '@/hooks/useApi';
import { useActiveWorkspace } from './useWorkspaceContext';

/**
 * Workspace-Switcher (Plan 012 Phase A, Schritt 2) — prominenter Umschalter
 * oben in der Shell (Muster: Projekt-/Repo-Switcher). Listet die Top-Level-
 * Ordner und setzt den global aktiven Ordner-Kontext, an den Chat + Suche
 * gebunden sind.
 */

interface TreeSpace {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
}

interface TreeResponse {
  spaces: TreeSpace[];
}

export function WorkspaceSwitcher() {
  const api = useApi();
  const { active, setActive } = useActiveWorkspace();

  // Top-Level-Ordner aus dem Explorer-Baum (Backend blendet is_workspace aus).
  const { data } = useQuery({
    queryKey: ['spaces-tree', 'top-level'],
    queryFn: () => api.get<TreeResponse>('/spaces/tree', { showError: false }),
    staleTime: 30_000,
  });
  const topLevel = (data?.spaces ?? []).filter(s => s.parent_id === null);

  const label = active?.name ?? 'Kein Ordner aktiv';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-6 max-w-56 items-center gap-1.5 rounded px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent data-[state=open]:bg-accent"
        aria-label="Aktiven Ordner wechseln"
        title="Aktiven Ordner wechseln"
      >
        <Boxes className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Aktiver Ordner</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {topLevel.length === 0 && (
          <DropdownMenuItem disabled>Keine Ordner vorhanden</DropdownMenuItem>
        )}
        {topLevel.map(space => (
          <DropdownMenuItem
            key={space.id}
            onSelect={() => setActive.mutate(space.id)}
            disabled={setActive.isPending}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: space.color ?? 'var(--muted-foreground)' }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{space.name}</span>
            {active?.id === space.id && (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => setActive.mutate(null)}
          disabled={setActive.isPending || !active}
        >
          <CircleSlash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          Kein Ordner (global)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
