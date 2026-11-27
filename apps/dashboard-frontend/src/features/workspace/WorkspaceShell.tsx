import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useWorkspaceStore,
  pfadZuAnsicht,
  ansichtZuPfad,
  ansichtTitel,
  nurFuerAdmin,
  nurFuerEntwickler,
  type Ansicht,
} from '@/stores/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import { bereichAusAdresse } from '@/features/settings/sections';
import { AnsichtInhalt } from './AnsichtInhalt';
import { SchalenKopf } from './SchalenKopf';
import { SchalenDock } from './SchalenDock';
import { Suche } from './Suche';
import { useWeicherWechsel } from '@/hooks/useWeicherWechsel';

/** Was die Shell von außen braucht: das Abmelden, und sonst nichts. */
export interface ShellHandgriffe {
  onLogout: () => Promise<void>;
}

/**
 * Die gewünschte Ansicht aus der Adresse.
 *
 * Alte Lesezeichen tragen den Bereich der Verwaltung noch als `?tab=` —
 * `/settings?tab=remote-access` (über `InDenArbeitsbereich`) und
 * `/workspace/settings?tab=apps` aus der Zeit, als die Einstellungen die
 * Verwaltung waren. Beide landen auf dem Bereich, wo die Funktion heute steht
 * (`?tab=updates` und `?tab=lizenz` im Gerät beim Abschnitt,
 * `?tab=selfhealing` im System aufgeklappt); `?tab=sicherung`, `?tab=privacy`
 * und `?tab=werksreset` landen im Bereich Daten.
 */
function ausDerAdresse(pathname: string, search: string): Ansicht | null {
  const ansicht = pfadZuAnsicht(pathname.replace(/^\/workspace/, ''), search);
  const tab = new URLSearchParams(search).get('tab');
  const alterBereich =
    tab && (ansicht?.type === 'settings' || ansicht?.type === 'verwaltung') && !ansicht.bereich;
  if (!alterBereich) {
    // Eine Adresse, die auf eine gestrichene Stelle zeigt (`verwaltung/privacy`,
    // `verwaltung/system/sicherung`), landet im Bereich Daten.
    if (ansicht?.type === 'verwaltung' && ansicht.bereich) {
      const ziel = bereichAusAdresse(ansicht.bereich, ansicht.abschnitt);
      if (ziel.bereich !== ansicht.bereich || ziel.abschnitt !== ansicht.abschnitt) {
        return {
          type: 'verwaltung',
          bereich: ziel.bereich,
          ...(ziel.abschnitt ? { abschnitt: ziel.abschnitt } : {}),
        };
      }
    }
    return ansicht;
  }
  const { bereich, abschnitt } = bereichAusAdresse(tab, null);
  return { type: 'verwaltung', bereich, ...(abschnitt ? { abschnitt } : {}) };
}

/**
 * Die Schale (J60, `gestaltung.md`, Fassung vom 27.11.2026): oben die
 * durchgehende Glasleiste (`SchalenKopf`), darunter die Fläche der Ansicht,
 * unten mittig das schwebende Dock (`SchalenDock`), und über allem die
 * Popup-Suche (`Suche`). Keine Aktivitätsleiste, keine Tab-Leiste, keine
 * Spalten, keine Statuszeile. Hell ist der Standard (`useTheme`).
 *
 * Die Ansicht wird in der URL gespiegelt (/workspace/...), in beide
 * Richtungen; gespeichert wird sonst nichts.
 */
export default function WorkspaceShell({ onLogout }: ShellHandgriffe) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const istEntwickler = user?.entwickler === true;
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  // Die Testfassung einer App trägt den blauen Streifen der Glasleiste.
  const testfassung = ansicht.type === 'app' && ansicht.stand === 'test';

  // Der Pfad, auf dem Adresse und Store zuletzt übereinstimmten. Store → URL
  // vergleicht hiergegen und nicht gegen `location`, deren Schnappschuss im
  // selben Commit noch die alte Adresse trägt.
  const abgeglichen = useRef<string | null>(null);

  // Wechselt die Ansicht der Leiste (Start, eine App, Verwaltung,
  // Einstellungen), blendet die Fläche weich ein. Live und Test derselben App
  // oder ein Bereich der Verwaltung bewegen hier nichts; den Bereich bewegt
  // der `Bereichsrahmen` selbst, ohne seine Leiste.
  const wechsel = useWeicherWechsel<HTMLDivElement>(
    ansicht.type === 'app' ? `app:${ansicht.appId}` : ansicht.type
  );

  // Der Titel des Browser-Tabs sagt, was vorn steht (J35, 26.09.2026).
  const titel = ansichtTitel(ansicht);
  useEffect(() => {
    document.title = `${titel} – Arasul`;
  }, [titel]);

  // URL → Store: Deep-Links und Browser-Zurück öffnen die Ansicht.
  // `/workspace` ohne weiteren Pfad landet auf der Startseite, ebenso eine
  // Admin-Adresse, die ein Mitarbeiter tippt. Das ist Ausblenden und keine
  // Berechtigung — `requireRole` im Backend antwortet ihm mit 403.
  //
  // Weicht die Adresse von der Ansicht ab (ein altes Lesezeichen, eine
  // Admin-Adresse, ein unbekannter Pfad), wird sie ERSETZT, nicht ergänzt:
  // sonst führte „Zurück" auf eine Adresse, die dieselbe Ansicht meint, und es
  // bräuchte zwei Klicks.
  useEffect(() => {
    const gewuenscht = ausDerAdresse(location.pathname, location.search);
    oeffne(
      gewuenscht &&
        (istAdmin || !nurFuerAdmin(gewuenscht.type)) &&
        (istEntwickler || !nurFuerEntwickler(gewuenscht.type))
        ? gewuenscht
        : { type: 'dashboard' }
    );
    const pfad = ansichtZuPfad(useWorkspaceStore.getState().ansicht);
    abgeglichen.current = pfad;
    // Die Abfrage gehört zur Adresse der App (`?freigabe=`); die alten `?tab=` der
    // Verwaltung stehen nicht im Pfad und werden hier mit ersetzt.
    if (location.pathname + location.search !== pfad) navigate(pfad, { replace: true });
  }, [location.pathname, location.search, istAdmin, istEntwickler]);

  // Store → URL: ein Klick in der Leiste ist ein Schritt im Verlauf. Den
  // frischen Stand lesen, nicht den Render-Schnappschuss: beim ersten Lauf hat
  // der Effekt davor die Ansicht im selben Commit gerade geöffnet.
  useEffect(() => {
    const pfad = ansichtZuPfad(useWorkspaceStore.getState().ansicht);
    if (abgeglichen.current === pfad) return;
    abgeglichen.current = pfad;
    navigate(pfad);
  }, [ansicht]);

  // Das Dock schwebt ÜBER der Fläche: was unten steht, hält seinen Platz frei.
  // Die Shell nennt ihn als `--ara-leiste-platz` (Dock 56 px, Luft, sicherer
  // Rand); Startseite, Store, Bereichsrahmen und der Rahmen einer App lesen ihn.
  return (
    <div
      className="relative flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground [--ara-leiste-platz:calc(88px+env(safe-area-inset-bottom))]"
      data-testid="workspace-shell"
    >
      <SchalenKopf />
      <main
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
        data-testid="workspace-ansicht"
        data-testfassung={testfassung || undefined}
      >
        <div ref={wechsel} className="h-full w-full">
          <AnsichtInhalt />
        </div>
      </main>
      <SchalenDock />
      <Suche onLogout={onLogout} />
    </div>
  );
}
