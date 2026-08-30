/**
 * Sidebar-Ansicht »Apps« — die linke Spalte des Zielbilds (Phase D1).
 *
 * Seit Phase B2 stand hier „Noch nichts hier": der Datei-Explorer, der die
 * Spalte füllte, ist mit dem Editor gefallen. Das Zielbild aus Beschluss 10
 * vom 26.08.2026 sagt, was stattdessen hingehört — die Apps, die dem
 * Angemeldeten freigegeben sind.
 *
 * Die Liste kommt aus `GET /api/apps/meine` und siebt über `app_members`
 * (Phase C2). Sie ist damit für Administrator und Mitarbeiter dieselbe Abfrage
 * mit demselben Ergebnisumfang; hier wird nichts nach Rolle ausgeblendet, weil
 * hier nichts nach Rolle verschieden ist.
 *
 * Ganz oben die **Übersicht**: ohne sie gäbe es keinen Weg zurück aus einer
 * App, wenn jemand den Tab der Mitte geschlossen hat.
 *
 * SEIT H5 AUS DER BIBLIOTHEK. Diese Spalte und das Hamburger-Menü aus D7
 * zeigen dieselbe Liste, und sie waren zweimal geschrieben: hier von Hand
 * (`px-3 py-2 hover:bg-accent/50`, aktiv `bg-accent/60`), dort mit `Liste`
 * aus `@marken`. Zwei Formen für eine Sache laufen auseinander, sobald eine
 * von beiden angefasst wird — genau die Doppelung, gegen die dieses
 * Designsystem gebaut ist. Was der Bibliothek dafür gefehlt hat, war die
 * dichte Zeile (`dicht`): fingerbreit ist richtig für ein Telefon und zu
 * groß für eine Seitenspalte.
 */
import { AppWindow, LayoutDashboard } from 'lucide-react';
import { Liste, ListenEintrag } from '@marken';
import { useWorkspaceStore, tabId } from '@/stores/workspaceStore';
import { useMeineApps, zuEintraegen } from '@/features/apps/meineApps';
import { TeststandMarke } from '@/features/apps/TeststandMarke';
import { SkeletonText } from '@/components/ui/Skeleton';
import { SidebarView } from './SidebarView';

export function AppsPanel() {
  const openTab = useWorkspaceStore(s => s.openTab);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const { data: apps, isLoading, isError } = useMeineApps();

  const eintraege = zuEintraegen(apps ?? []);

  return (
    <SidebarView title="Apps">
      <div className="py-1">
        <Liste dicht>
          <ListenEintrag
            titel="Übersicht"
            symbol={<LayoutDashboard />}
            aktiv={activeTabId === 'dashboard'}
            kennzeichen="apps-open-uebersicht"
            onKlick={() => openTab({ type: 'dashboard' })}
          />

          {eintraege.map(e => {
            const id = tabId({ type: 'app', appId: e.id, stand: e.stand });
            return (
              <ListenEintrag
                key={id}
                titel={e.name}
                symbol={<AppWindow />}
                erklaerung={e.beschreibung || e.name}
                aktiv={activeTabId === id}
                kennzeichen={`apps-open-${e.id}-${e.stand}`}
                hinweis={e.stand === 'test' ? <TeststandMarke /> : undefined}
                onKlick={() => openTab({ type: 'app', appId: e.id, stand: e.stand, title: e.name })}
              />
            );
          })}
        </Liste>

        {isLoading && (
          <div className="px-3 py-2">
            <SkeletonText lines={2} />
          </div>
        )}

        {/* Ein Fehler ist kein Leerzustand. „Keine Apps" und „ich konnte nicht
            fragen" sehen sonst gleich aus, und der zweite Fall schickt jemanden
            zum Administrator, der nichts falsch gemacht hat. */}
        {isError && (
          <p className="px-3 py-2 text-sm text-muted-foreground" data-testid="apps-fehler">
            Die App-Liste ließ sich nicht laden.
          </p>
        )}

        {!isLoading && !isError && eintraege.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground" data-testid="apps-leer">
            Noch keine App für Sie freigegeben.
          </p>
        )}
      </div>
    </SidebarView>
  );
}
