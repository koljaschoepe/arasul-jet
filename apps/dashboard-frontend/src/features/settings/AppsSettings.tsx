/**
 * Apps: die Verwaltung des Geräts (Phase D4 des Umbaus vom 26.08.2026).
 *
 * Bis D4 gab es zwei Sichten auf eine App und beide waren unvollständig: die
 * linke Spalte der Shell zeigte einem Menschen, was ihm freigegeben ist (D1),
 * und die Freigabe-Matrix zeigte dem Administrator, wer was darf (D3). Was
 * fehlte, ist die Sicht dessen, der das Gerät betreibt: welche Fassung läuft
 * wo, ist ihr Container gesund, was kann sie, was hat sie getan.
 *
 * WARUM DIE SEITE IN DEN EINSTELLUNGEN LIEGT und nicht als eigener Knopf in
 * der Aktivitätsleiste: dieselbe Begründung wie bei den Mitarbeitern (D3). Die
 * Leiste trägt die Ansichten, mit denen jemand ARBEITET — die Apps dort sind
 * die eigenen, in der Mitte im iframe. Das Zahnrad darunter trägt alles, womit
 * er das GERÄT einrichtet, und „welche Fassung ist live" gehört dorthin. Ein
 * zweiter Apps-Eintrag in der Leiste hieße außerdem: zwei Knöpfe mit
 * demselben Wort und zwei verschiedenen Bedeutungen.
 *
 * Die Rolle blendet aus, das Backend entscheidet: jeder Weg dieser Seite trägt
 * `requireRole('admin')` und antwortet einem Mitarbeiter mit 403, ob die Seite
 * für ihn sichtbar ist oder nicht.
 */
import { useState } from 'react';
import { AppWindow, ChevronRight } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonText } from '@/components/ui/Skeleton';
import { AppAnsicht } from './apps/AppAnsicht';
import { useAlleApps, type AppZeile } from './mitarbeiter/useAppFreigaben';

/** Eine App in der Liste: Name, Kennung, die zwei Fassungen. */
function AppZeileKnopf({ app, onOeffnen }: { app: AppZeile; onOeffnen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOeffnen}
      data-testid={`app-oeffnen-${app.id}`}
      className="flex w-full items-center gap-3 border-b border-border p-ui-3 text-left transition-colors last:border-b-0 hover:bg-accent/40"
    >
      <AppWindow className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{app.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {app.beschreibung || app.id}
        </span>
      </span>
      {/* Beide Fassungen nebeneinander: die Frage vor dem Klick lautet fast
          immer „steht im Test etwas Neues". */}
      <span className="flex shrink-0 items-center gap-1.5 text-ui-xs">
        {app.staende.live ? (
          <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-foreground">
            live {app.staende.live.version}
          </span>
        ) : (
          <span className="text-muted-foreground">nicht live</span>
        )}
        {app.staende.test && (
          <span className="rounded bg-warning/15 px-1.5 py-0.5 font-mono font-medium text-warning">
            test {app.staende.test.version}
          </span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

export function AppsSettings() {
  const { data: apps, isLoading, isError } = useAlleApps();
  const [offen, setOffen] = useState<string | null>(null);

  if (offen) {
    return (
      <div className="animate-in fade-in" data-testid="apps-seite">
        <AppAnsicht appId={offen} onZurueck={() => setOffen(null)} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in" data-testid="apps-seite">
      <PageHeader
        title="Apps"
        icon={<AppWindow />}
        description="Was auf diesem Gerät läuft: Fassungen, Zustand, Flows und Läufe."
      />

      {isLoading ? (
        <SkeletonText lines={4} />
      ) : isError ? (
        // Ein Fehler ist kein Leerzustand — sonst schickt „noch keine App" den
        // Administrator zum Partner, obwohl nur die Abfrage gescheitert ist.
        <p className="text-sm text-muted-foreground" data-testid="apps-fehler">
          Die App-Liste ließ sich nicht laden.
        </p>
      ) : (apps ?? []).length === 0 ? (
        <EmptyState
          icon={<AppWindow />}
          title="Noch keine App am Gerät"
          description="Apps baut ein Partner mit dem Ara-Kit und rollt sie hierher. Sobald eine ankommt, steht sie hier, zuerst im Teststand."
        />
      ) : (
        <ul className="rounded-md border border-border" data-testid="app-liste">
          {(apps ?? []).map(app => (
            <li key={app.id}>
              <AppZeileKnopf app={app} onOeffnen={() => setOffen(app.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
