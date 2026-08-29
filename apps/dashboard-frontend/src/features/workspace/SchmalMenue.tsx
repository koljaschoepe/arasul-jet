/**
 * Das Menue hinter dem Hamburger-Knopf (Phase D7, 28.08.2026).
 *
 * Unter 900 px gibt es keine Aktivitaetsleiste und keine Sidebar -- was dort
 * links stand, steht hier. Und nicht als geschrumpfte Kopie davon: die
 * Leiste hatte zwei Stufen (erst die Ansicht waehlen, dann darin klicken),
 * hier ist jeder Eintrag ein Ziel. Ein Tipp, ein Ort.
 *
 * Was drinsteht, in dieser Reihenfolge:
 *
 *   Uebersicht      der Weg zurueck, immer der erste
 *   die eigenen Apps  dieselbe Liste wie die Sidebar (`GET /api/apps/meine`)
 *   Notizen         der Zettel, unter 900 px eine eigene Ansicht
 *   Modelle, Einstellungen   nur fuer den Administrator
 *
 * Die Rolle blendet aus, das Backend entscheidet: `requireRole` antwortet
 * einem Mitarbeiter auf jeden Weg hinter den letzten beiden mit 403, ob dieser
 * Knopf nun da ist oder nicht.
 *
 * DIESER ORDNER DARF QUER LESEN. `features/workspace/` ist die eine Stelle,
 * die zusammensetzt (Regel in `apps/dashboard-frontend/CLAUDE.md`); die
 * App-Liste kommt deshalb aus `features/apps/` und nicht aus einer zweiten
 * Abfrage hier. React Query dedupliziert ueber den gemeinsamen Schluessel.
 */
import { AppWindow, Cpu, LayoutDashboard, NotepadText, Settings } from 'lucide-react';
import { Liste, ListenEintrag, Menue } from '@marken';
import { useWorkspaceStore, tabId } from '@/stores/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import { useMeineApps, zuEintraegen } from '@/features/apps/meineApps';
import { TeststandMarke } from '@/features/apps/TeststandMarke';

export function SchmalMenue() {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const menueOffen = useWorkspaceStore(s => s.menueOffen);
  const schliesseMenue = useWorkspaceStore(s => s.schliesseMenue);
  const openTab = useWorkspaceStore(s => s.openTab);
  const selectView = useWorkspaceStore(s => s.selectView);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const notizenAnsichtOffen = useWorkspaceStore(s => s.notizenAnsichtOffen);
  const toggleNotizenAnsicht = useWorkspaceStore(s => s.toggleNotizenAnsicht);
  const schliesseNotizenAnsicht = useWorkspaceStore(s => s.schliesseNotizenAnsicht);

  // Die Liste wird nur geholt, wenn das Menue offen ist -- `useMeineApps`
  // laeuft ohnehin schon fuer die Uebersicht, der Schluessel ist derselbe.
  const { data: apps } = useMeineApps();
  const eintraege = zuEintraegen(apps ?? []);

  /**
   * Eine Ansicht oeffnen: Zettel zu, Menue zu, Tab auf.
   *
   * Die Reihenfolge ist gleichgueltig, das Zumachen aber nicht: die Shell
   * schliesst zwar auch selbst, sobald sich der aktive Tab aendert -- wer
   * aber die Uebersicht waehlt, waehrend sie schon der aktive Tab ist,
   * aendert nichts, und ohne diese Zeile bliebe das Menue offen stehen.
   */
  const gehZu = (tun: () => void) => {
    schliesseNotizenAnsicht();
    schliesseMenue();
    tun();
  };

  return (
    <Menue
      offen={menueOffen}
      onSchliessen={schliesseMenue}
      titel="Menü"
      kennzeichen="workspace-schmal-menue"
    >
      <Liste beschriftung="Arbeit">
        <ListenEintrag
          titel="Übersicht"
          symbol={<LayoutDashboard />}
          aktiv={activeTabId === 'dashboard' && !notizenAnsichtOffen}
          kennzeichen="menue-uebersicht"
          onKlick={() => gehZu(() => openTab({ type: 'dashboard' }))}
        />
        {eintraege.map(e => {
          const id = tabId({ type: 'app', appId: e.id, stand: e.stand });
          return (
            <ListenEintrag
              key={id}
              titel={e.name}
              symbol={<AppWindow />}
              hinweis={e.stand === 'test' ? <TeststandMarke /> : undefined}
              aktiv={activeTabId === id && !notizenAnsichtOffen}
              kennzeichen={`menue-app-${e.id}-${e.stand}`}
              onKlick={() =>
                gehZu(() => openTab({ type: 'app', appId: e.id, stand: e.stand, title: e.name }))
              }
            />
          );
        })}
        <ListenEintrag
          titel="Notizen"
          symbol={<NotepadText />}
          aktiv={notizenAnsichtOffen}
          kennzeichen="menue-notizen"
          onKlick={() => {
            // Kein `gehZu`: der Zettel IST hier das Ziel.
            schliesseMenue();
            if (!notizenAnsichtOffen) toggleNotizenAnsicht();
          }}
        />
      </Liste>

      {istAdmin && (
        <Liste beschriftung="Verwaltung">
          <ListenEintrag
            titel="Modelle"
            symbol={<Cpu />}
            aktiv={activeTabId === 'modelle' && !notizenAnsichtOffen}
            kennzeichen="menue-modelle"
            onKlick={() =>
              gehZu(() => {
                selectView('models');
                openTab({ type: 'modelle' });
              })
            }
          />
          <ListenEintrag
            titel="Einstellungen"
            symbol={<Settings />}
            aktiv={activeTabId === 'settings' && !notizenAnsichtOffen}
            kennzeichen="menue-einstellungen"
            onKlick={() =>
              gehZu(() => {
                selectView('settings');
                openTab({ type: 'settings' });
              })
            }
          />
        </Liste>
      )}
    </Menue>
  );
}
