import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useWorkspaceStore,
  pfadZuAnsicht,
  ansichtZuPfad,
  ansichtTitel,
  nurFuerAdmin,
  type Ansicht,
} from '@/stores/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import { resolveSystemSub, resolveTab } from '@/features/settings/sections';
import { StatusBar } from './StatusBar';
import { AnsichtInhalt } from './AnsichtInhalt';
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
 * Verwaltung waren. Beide landen auf dem Bereich, der Unterbereich des Systems
 * (`?tab=sicherung`) aufgeklappt.
 */
function ausDerAdresse(pathname: string, search: string): Ansicht | null {
  const ansicht = pfadZuAnsicht(pathname.replace(/^\/workspace/, ''));
  const tab = new URLSearchParams(search).get('tab');
  const alterBereich =
    tab && (ansicht?.type === 'settings' || (ansicht?.type === 'verwaltung' && !ansicht.bereich));
  if (!alterBereich) return ansicht;
  const bereich = resolveTab(tab);
  const abschnitt = bereich === 'system' ? resolveSystemSub(tab) : undefined;
  return { type: 'verwaltung', bereich, ...(abschnitt ? { abschnitt } : {}) };
}

/**
 * Der Rahmen (M5, Karte rahmen-aktivitaetsleiste, 03.10.2026):
 *
 *   Aktivitätsleiste · genau eine Ansicht
 *   Statusleiste (unten)
 *
 * Es gibt keine Kopfleiste, keine Tab-Leiste, keine rechte Spalte und keine
 * zweite Seitenleiste mehr (`frontend.md`, Abschnitt Rahmen). Bis dahin stand
 * hier ein Dreispalten-Raster aus react-resizable-panels mit Sidebar, Mitte
 * samt Tab-Leiste und den Notizen rechts, darüber eine Menüleiste, und unter
 * 900 px ein eigener Aufbau mit Hamburger-Menü. Jede Funktion steht jetzt an
 * genau einer Stelle: in der Leiste.
 *
 * Unter 900 px bleibt es bei derselben Leiste, bis die Karte
 * handy-und-notizen-weg sie zur Leiste unten macht.
 *
 * Die Ansicht wird in der URL gespiegelt (/workspace/...), in beide
 * Richtungen; gespeichert wird sonst nichts.
 */
export default function WorkspaceShell({ onLogout }: ShellHandgriffe) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);

  // Der Titel des Browser-Tabs sagt, was vorn steht (J35, 26.09.2026).
  const titel = ansichtTitel(ansicht);
  useEffect(() => {
    document.title = `${titel} – Arasul`;
  }, [titel]);

  // URL → Store: Deep-Links und Browser-Zurück öffnen die Ansicht.
  // `/workspace` ohne weiteren Pfad landet auf der Startseite, ebenso eine
  // Admin-Adresse, die ein Mitarbeiter tippt. Das ist Ausblenden und keine
  // Berechtigung — `requireRole` im Backend antwortet ihm mit 403.
  useEffect(() => {
    const gewuenscht = ausDerAdresse(location.pathname, location.search);
    oeffne(
      gewuenscht && (istAdmin || !nurFuerAdmin(gewuenscht.type))
        ? gewuenscht
        : { type: 'dashboard' }
    );
  }, [location.pathname, location.search, istAdmin]);

  // Store → URL. Den frischen Stand lesen, nicht den Render-Schnappschuss: der
  // Effekt davor läuft im selben Commit und kann die Ansicht gerade geöffnet
  // haben — ein Deep-Link würde sonst sofort überschrieben.
  useEffect(() => {
    const pfad = ansichtZuPfad(useWorkspaceStore.getState().ansicht);
    if (location.pathname !== pfad) navigate(pfad);
  }, [ansicht]);

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
      data-testid="workspace-shell"
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityBar onLogout={onLogout} />
        <main className="min-h-0 min-w-0 flex-1 bg-background" data-testid="workspace-ansicht">
          <AnsichtInhalt />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
