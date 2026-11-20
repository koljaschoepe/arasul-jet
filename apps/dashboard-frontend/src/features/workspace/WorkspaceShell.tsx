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
import { cn, useSchmalesFenster } from '@marken';
import { ActivityBar } from './ActivityBar';

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
 * Der Rahmen (Karte glas-rahmen-und-leiste, 20.11.2026, `gestaltung.md`,
 * Rahmen):
 *
 *   Verlauf des Rahmens (`--verlauf-rahmen`), darauf mit 8 px Abstand
 *   Leiste aus Glas · Fläche der Ansicht (deckend, Radius 14 px)
 *
 * Es gibt keine Kopfleiste, keine Tab-Leiste, keine rechte Spalte, keine
 * zweite Seitenleiste und seit dieser Karte auch keine Statuszeile mehr: das
 * Konto steht unten in der Leiste, Datum und Uhrzeit zeigt Arasul nicht, eine
 * Störung erscheint als Meldung. Über einer App schwebt oben rechts die
 * Kapsel (`features/apps/Kapsel.tsx`).
 *
 * Unter 900 px schwebt dieselbe Leiste unten (`LeisteUnten`), die Fläche
 * darüber; „Abmelden" steht dort unter „Mehr".
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
  const schmal = useSchmalesFenster();
  // Die Testfassung einer App trägt einen blauen Rand und oben in der Mitte,
  // innen an der Kante, das Wort Test (`gestaltung.md`, Kapsel).
  const testfassung = ansicht.type === 'app' && ansicht.stand === 'test';

  // Der Pfad, auf dem Adresse und Store zuletzt übereinstimmten. Store → URL
  // vergleicht hiergegen und nicht gegen `location`, deren Schnappschuss im
  // selben Commit noch die alte Adresse trägt.
  const abgeglichen = useRef<string | null>(null);

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

  // Am Handy schwebt die Leiste ÜBER der Fläche (J50): Inhalt rollt unter das
  // Glas, und was unten steht, hält ihren Platz frei. Die Shell nennt ihn
  // als `--ara-leiste-platz` (Leiste 56 px, 8 px Luft, dazu der sichere Rand
  // unten); Bereichsrahmen, Startseite und der Rahmen einer App lesen ihn.
  return (
    <div
      className={cn(
        'relative flex h-dvh w-screen gap-[8px] overflow-hidden bg-background bg-[image:var(--verlauf-rahmen)] p-[8px] text-foreground',
        schmal &&
          'pb-[max(8px,env(safe-area-inset-bottom))] [--ara-leiste-platz:calc(64px+env(safe-area-inset-bottom))]'
      )}
      data-testid="workspace-shell"
    >
      {schmal ? (
        <div className="absolute inset-x-[8px] bottom-[max(8px,env(safe-area-inset-bottom))] z-40">
          <ActivityBar onLogout={onLogout} />
        </div>
      ) : (
        <ActivityBar onLogout={onLogout} />
      )}
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <main
          className={cn(
            'relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[14px] border bg-background shadow-[var(--schatten-flaeche)]',
            testfassung ? 'border-2 border-primary' : 'border-border'
          )}
          data-testid="workspace-ansicht"
          data-testfassung={testfassung || undefined}
        >
          <AnsichtInhalt />
        </main>
        {testfassung && (
          <span
            className="pointer-events-none absolute top-[6px] left-1/2 z-30 h-[18px] -translate-x-1/2 rounded-full bg-primary px-[10px] text-xs leading-[18px] font-medium text-primary-foreground shadow-sm"
            data-testid="ansicht-test-wort"
          >
            Test
          </span>
        )}
      </div>
    </div>
  );
}
