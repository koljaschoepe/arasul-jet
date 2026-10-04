import { TriangleAlert } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useAdminHinweise } from './useAdminHinweise';

/**
 * Beim Administrator auf der Startseite: nur, was Aufmerksamkeit braucht
 * (M5). Ist alles gut, steht dort nichts — kein Block, keine Überschrift,
 * keine grüne Meldung. Ein Klick führt in den Bereich der Verwaltung.
 */
export function AdminHinweise() {
  const hinweise = useAdminHinweise();
  const oeffne = useWorkspaceStore(s => s.oeffne);
  if (hinweise.length === 0) return null;
  return (
    <section className="mb-6" data-testid="admin-hinweise">
      <h2 className="mb-2 text-sm font-semibold text-foreground">Braucht Ihre Aufmerksamkeit</h2>
      <ul className="flex flex-col rounded-md border border-border">
        {hinweise.map(h => (
          <li key={`${h.art}:${h.text}`} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => oeffne({ type: 'verwaltung', ...h.ziel })}
              className="flex w-full items-center gap-2 p-ui-3 text-left text-ui-sm text-foreground transition-colors duration-[120ms] hover:bg-primary/12 motion-reduce:transition-none"
              data-testid={`admin-hinweis-${h.art}`}
            >
              <TriangleAlert className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
