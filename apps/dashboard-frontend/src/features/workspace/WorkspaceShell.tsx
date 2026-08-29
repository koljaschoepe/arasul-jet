import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import {
  useWorkspaceStore,
  pathToTabSpec,
  tabToPath,
  tabId,
  nurFuerAdmin,
} from '@/stores/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSchmalesFenster } from '@/hooks/useSchmalesFenster';
import { WorkspaceMenuBar } from './WorkspaceMenuBar';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { TabContent } from './TabContent';
import type { ShellHandgriffe } from './TabContent';
import { ActivityBar } from './ActivityBar';
import { SidebarHost } from './SidebarHost';
import { RightPanel } from './RightPanel';
import { SchmalMenue } from './SchmalMenue';

/**
 * Das Dreispalten-Raster der Shell:
 *
 *   MenuBar (oben, mit Layout-Toggles rechts)
 *   ActivityBar · Sidebar · Mitte (TabBar + Inhalt) · rechte Spalte
 *   StatusBar (unten)
 *
 * Der aktive Tab wird in der URL gespiegelt (/workspace/...), offene Tabs und
 * Panel-Layout persistieren in localStorage.
 *
 * Phase D1 (27.08.2026) füllt das Raster nach dem Zielbild aus Beschluss 10:
 * links die Apps, in der Mitte das Dashboard oder eine App, rechts die
 * Notizen. Zwischen B2 und D1 standen beide Seitenspalten leer, weil
 * Datei-Explorer, Agent-Chat und Terminal aus der Oberfläche gefallen sind;
 * das Raster ist dieselbe Sache geblieben.
 *
 * Keep-alive: Sidebar und rechte Spalte werden beim Ausblenden NICHT
 * unmounted, sondern nur per CSS versteckt (Regel in index.css:
 * `[data-panel][data-shell-hidden='true'] { display:none }`). react-
 * resizable-panels setzt display:flex inline auf Panel-Wurzeln, daher läuft das
 * über ein Datenattribut + !important statt über das hidden-Attribut.
 *
 * Phase D7 (28.08.2026) gibt dem schmalen Fenster einen EIGENEN Aufbau statt
 * eines geschrumpften Desktops: keine Aktivitätsleiste, keine Sidebar, keine
 * Tab-Leiste — ein Hamburger-Menü in der Kopfleiste, eine Spalte darunter,
 * und die Notizen sind dort eine eigene ANSICHT. Nichts liegt mehr
 * übereinander: entweder steht die Mitte da oder der Zettel.
 *
 * Das ist der Nachfolger des Blatts aus D6 (`data-shell-blatt`, gefallen).
 * Ein Blatt über der Mitte war die halbe Antwort: es nahm der Mitte ihre
 * Pixel nicht mehr weg, verdeckte sie aber weiter — die zweite Messung am
 * Orin zeigte die App abgedunkelt hinter dem Blatt, und was darunter lag, war
 * für niemanden mehr anklickbar, weder für Playwright noch für einen
 * Menschen.
 *
 * WICHTIG — `data-shell-hidden` statt `aria-hidden` als CSS-Anker: Die
 * Sichtbarkeit MUSS an einem Attribut hängen, das ausschließlich diese Shell
 * setzt. `aria-hidden` erfüllt das nicht — Radix-Dialoge/-Overlays rufen beim
 * Öffnen `hideOthers()` (aria-hidden-Paket) auf und setzen `aria-hidden='true'`
 * auf fremde Geschwister-Elemente, um sie vor Screenreadern zu verbergen. Hing
 * die Versteck-Regel an `aria-hidden`, kollabierten Panels, sobald ein Dialog
 * ein Panel als Nachbarn markierte. `aria-hidden` wird für die A11y weiter
 * gespiegelt, steuert aber die Darstellung nicht mehr.
 */
export default function WorkspaceShell(props: ShellHandgriffe) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';

  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const openTab = useWorkspaceStore(s => s.openTab);
  const sidebarVisible = useWorkspaceStore(s => s.sidebarVisible);
  const rightPanelVisible = useWorkspaceStore(s => s.rightPanelVisible);
  const notizenAnsichtOffen = useWorkspaceStore(s => s.notizenAnsichtOffen);
  const activeView = useWorkspaceStore(s => s.activeView);

  // URL → Store: Deep-Links und Browser-Zurück aktivieren/öffnen den Tab.
  //
  // Seit D1 gibt es einen Standard-Tab: `/workspace` ohne weiteren Pfad landet
  // auf der Übersicht. Vorher stand dort „Kein Tab geöffnet", weil es keinen
  // gab, der immer passt; jetzt gibt es ihn, und die erste Ansicht nach der
  // Anmeldung soll die eigenen Apps zeigen und keinen Leerzustand.
  //
  // Eine Admin-Adresse, die ein Mitarbeiter tippt, landet ebenfalls auf der
  // Übersicht. Das ist Ausblenden und keine Berechtigung — `requireRole` im
  // Backend antwortet ihm auf jeden Weg dahinter mit 403.
  useEffect(() => {
    const subPath = location.pathname.replace(/^\/workspace/, '');
    const gewuenscht = pathToTabSpec(subPath);
    const spec =
      gewuenscht && (istAdmin || !nurFuerAdmin(gewuenscht.type))
        ? gewuenscht
        : ({ type: 'dashboard' } as const);

    const id = tabId(spec);
    if (id !== activeTabId) {
      openTab(spec);
    }
  }, [location.pathname, istAdmin]);

  // Store → URL: aktiver Tab spiegelt sich im Pfad
  useEffect(() => {
    // Frischen Stand lesen (nicht den Render-Snapshot): der URL→Store-Effekt
    // läuft im selben Commit direkt davor und kann bereits einen Tab geöffnet
    // haben — mit dem stale Snapshot würde ein Deep-Link auf leeren Store
    // sonst sofort überschrieben.
    const state = useWorkspaceStore.getState();
    const active = state.tabs.find(t => t.id === state.activeTabId);
    if (!active) {
      // Kein aktiver Tab → Leerzustand; die URL bleibt unverändert stehen.
      return;
    }
    const path = tabToPath(active);
    if (location.pathname !== path) {
      navigate(path);
    }
  }, [activeTabId, tabs]);

  // ⌘B / Ctrl+B toggelt die Sidebar (wie in VS Code/Cursor)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        useWorkspaceStore.getState().toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /**
   * Plan 023 F5: bei einem schmalen Fenster gibt es keine drei Spalten.
   *
   * Am 22.08.2026 gemessen: die Mindestbreiten der drei Panels ergeben zusammen
   * über 500 px; bei 400 px Fenster kann die Aufteilung sie gar nicht einhalten
   * und verteilt Reste. Darunter fällt die Sidebar weg (die Aktivitätsleiste
   * bleibt, sie ist einen Klick entfernt), die Mitte darf auf null schrumpfen,
   * und die rechte Spalte darf die ganze Breite nehmen.
   */
  const schmal = useSchmalesFenster();
  const sidebarZeigen = sidebarVisible && !schmal;

  /**
   * Die Notizen unter 900 px: eine eigene ANSICHT, nie eine zweite Flaeche.
   *
   * Der Weg dahin steht in zwei Messungen am Orin (beide 28.08.2026). Die
   * erste: bei 390 px bekam die Mitte NULL Pixel -- 48 fuer die
   * Aktivitaetsleiste, 160 fuer die Sidebar und 220 fuer die Notizen sind mehr
   * als 390, und uebrig blieb nichts; alle sieben Verwaltungsansichten zeigten
   * „NOTIZEN, noch nichts notiert". D6 legte die Notizen daraufhin als Blatt
   * DARUEBER. Die zweite Messung zeigte, dass das die halbe Antwort war: die
   * App stand abgedunkelt hinter dem Blatt.
   *
   * Die ganze Antwort ist eine Spalte mit zwei Aufenthaltsorten. Entweder
   * steht die Mitte da oder der Zettel; das Panel bleibt an seiner Stelle im
   * Baum (die Notizen schreiben nach einer Sekunde Ruhe und duerfen nicht
   * unmounten), und was sich aendert, ist allein, welches der beiden
   * `data-shell-hidden` traegt.
   */
  const notizenZeigen = schmal ? notizenAnsichtOffen : rightPanelVisible;
  const mitteZeigen = !schmal || !notizenAnsichtOffen;

  // Eine Ansicht kommt, der Zettel und das Menue gehen. `notizenAnsichtOffen`
  // steht ABSICHTLICH nicht in den Abhaengigkeiten: sonst schloesse dieser
  // Effekt sofort wieder, was jemand gerade aufgeschlagen hat.
  //
  // Auch beim Wechsel INS breite Fenster, obwohl es dort weder Zettel-Ansicht
  // noch Menue gibt: sonst bliebe der Aufenthaltsort von vorhin stehen, und
  // wer das Fenster wieder schmal zieht, faende die Notizen offen vor statt
  // seiner Arbeit.
  useEffect(() => {
    useWorkspaceStore.getState().schliesseNotizenAnsicht();
    useWorkspaceStore.getState().schliesseMenue();
  }, [schmal, activeTabId, activeView]);

  // Panel-Layout (Breiten) in localStorage persistieren. Die Panel-Ids sind
  // stabil (Panels bleiben wegen Keep-alive immer gemountet).
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'arasul-workspace-panels',
    panelIds: ['sidebar', 'main', 'right'],
  });

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
      data-testid="workspace-shell"
      data-shell-aufbau={schmal ? 'schmal' : 'drei-spalten'}
    >
      <WorkspaceMenuBar onLogout={props.onLogout} />
      {/* Was unter 900 px an die Stelle von Aktivitätsleiste und Sidebar
          tritt: ein Menü über der Seite, das jede Ansicht wieder zumacht. */}
      {schmal && <SchmalMenue />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Die Activity-Bar links, außerhalb des einklappbaren Panels — so
            bleibt jede Ansicht erreichbar, auch wenn die Sidebar zu ist
            (Plan 012 Phase B, Schritt 5). Unter 900 px gibt es sie nicht: 48
            Pixel Streifen neben einer Spalte von 342 sind ein geschrumpfter
            Desktop, und ihre Einträge stehen dort im Menü. */}
        {!schmal && <ActivityBar />}
        <Group
          orientation="horizontal"
          className="flex-1"
          defaultLayout={defaultLayout}
          {...(schmal ? {} : { onLayoutChanged })}
        >
          <Panel
            id="sidebar"
            defaultSize="18%"
            minSize="160px"
            maxSize="35%"
            aria-hidden={!sidebarZeigen}
            data-shell-hidden={sidebarZeigen ? 'false' : 'true'}
          >
            <SidebarHost />
          </Panel>
          <Separator
            aria-hidden={!sidebarZeigen}
            data-shell-hidden={sidebarZeigen ? 'false' : 'true'}
            className="w-px bg-border transition-colors hover:bg-primary/50"
          />
          {/*
            Eine MINDESTBREITE in Pixeln und nicht in Prozent (Phase D4).

            `30%` heisst bei 1440 px 432 px und bei 3440 px 1032 px -- die
            Grenze waechst mit dem Fenster, obwohl das, was sie schuetzen soll,
            gleich bleibt: eine Tabelle mit sechs Spalten braucht ihre Breite
            unabhaengig davon, wie gross der Bildschirm ist. Umgekehrt wird sie
            auf einem kleinen Fenster zu schwach.

            420 px passen unter die Schwelle, ab der die Shell dreispaltig ist
            (900 px, `useSchmalesFenster`): 48 fuer die Aktivitaetsleiste, 160
            fuer die Sidebar, 220 fuer die Notizen und 420 hier sind 848. Wer
            die Notizen breiter zieht, nimmt sie also nicht mehr der Mitte weg,
            sondern stoesst an.
          */}
          <Panel
            id="main"
            minSize={schmal ? '0px' : '420px'}
            aria-hidden={!mitteZeigen}
            data-shell-hidden={mitteZeigen ? 'false' : 'true'}
            data-shell-voll={schmal ? 'true' : 'false'}
          >
            <div className="flex h-full min-w-0 flex-col">
              {/* Keine Tab-Leiste unter 900 px: zwei Tabs nebeneinander sind
                  dort zwei halbe Wörter, und der Weg zwischen den Ansichten
                  ist das Menü. Die Tabs selbst bleiben — wer das Fenster
                  wieder aufzieht, findet sie unverändert vor. */}
              {!schmal && <TabBar />}
              <div className="min-h-0 flex-1 overflow-hidden rounded-tl-md bg-background">
                <TabContent handgriffe={props} />
              </div>
            </div>
          </Panel>
          <Separator
            aria-hidden={!notizenZeigen || schmal}
            data-shell-hidden={notizenZeigen && !schmal ? 'false' : 'true'}
            className="w-px bg-border transition-colors hover:bg-primary/50"
          />
          {/* Das Panel bleibt IMMER an dieser Stelle des Baums, auch wenn es
              unter 900 px die ganze Spalte fuellt: die Notizen schreiben nach
              einer Sekunde Ruhe, und ein Umhaengen waere ein Unmount mitten in
              der Pause. Was sich aendert, ist allein, WELCHES der beiden
              Panels gerade versteckt ist. */}
          <Panel
            id="right"
            defaultSize="26%"
            minSize={schmal ? '0px' : '220px'}
            maxSize={schmal ? '100%' : '45%'}
            aria-hidden={!notizenZeigen}
            data-shell-hidden={notizenZeigen ? 'false' : 'true'}
            data-shell-voll={schmal ? 'true' : 'false'}
          >
            <RightPanel />
          </Panel>
        </Group>
      </div>
      <StatusBar />
    </div>
  );
}
