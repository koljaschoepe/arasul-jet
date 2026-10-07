import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { PersonAvatar } from '@/components/PersonAvatar';
import { API_BASE } from '@/config/api';

const DATUM = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const UHRZEIT = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

/**
 * Die Uhr, minutengenau: der nächste Takt fällt auf den Beginn der nächsten
 * Minute, nicht auf „in 60 Sekunden" — sonst hinge die Anzeige bis zu einer
 * Minute hinter der Wanduhr her. Eine Sekundenuhr wäre Unruhe ohne Nutzen.
 */
function useJetzt(): Date {
  const [jetzt, setJetzt] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const takt = () => {
      const t = new Date();
      setJetzt(t);
      timer = window.setTimeout(takt, 60_000 - (t.getSeconds() * 1000 + t.getMilliseconds()) + 50);
    };
    const t = new Date();
    timer = window.setTimeout(takt, 60_000 - (t.getSeconds() * 1000 + t.getMilliseconds()) + 50);
    return () => window.clearTimeout(timer);
  }, []);
  return jetzt;
}

/** Die Rolle in einem Wort, wie die Verwaltung sie nennt. */
function rolleText(rolle: string | undefined): string {
  return rolle === 'admin' ? 'Administrator' : 'Mitarbeiter';
}

/**
 * Die Statusleiste am unteren Rand (M5, `frontend.md`, Abschnitt Rahmen): links
 * Bild, Name und Rolle, rechts Datum und Uhrzeit, für jeden gleich — nie
 * Modell, Speicher, Verbindung oder Fassung.
 *
 * EIN KLICK AUF DIE PERSON ÖFFNET EIN MENÜ MIT NUR „ABMELDEN" (seit
 * 07.10.2026). Bis dahin stand das eigene Bild unten in der Aktivitätsleiste
 * und sah dort aus wie ein dritter Bereich neben Verwaltung und Zahnrad. Ein Mitarbeiter sieht keine Technik, und der Administrator
 * liest sie in der Verwaltung (System, Modelle) statt hier. Die Zahl der
 * Freigaben trägt das Haus der Aktivitätsleiste; der Modell-Umschalter ist
 * gefallen, Modelle stehen in der Verwaltung.
 *
 * Unter 900 px entfällt die Leiste (`WorkspaceShell`); „Abmelden" steht dort
 * als letzter Eintrag der Einstellungen.
 */
export function StatusBar({ onLogout }: { onLogout: () => Promise<void> | void }) {
  const { user } = useAuth();
  const jetzt = useJetzt();
  const name = user?.anzeigeName || user?.username || '';
  const bild = user?.hatBild ? `${API_BASE}/profil/bild` : null;

  return (
    <footer
      className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-background px-1.5 text-xs text-muted-foreground"
      data-testid="statusbar"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Konto: ${name}`}
          data-testid="workspace-benutzermenue"
          className="flex h-6 min-w-0 items-center gap-1.5 rounded-md px-1.5 transition-colors duration-120 ease-out outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <PersonAvatar name={name} bild={bild} className="size-5 shrink-0" />
          <span className="min-w-0 truncate text-foreground" data-testid="statusbar-name">
            {name}
          </span>
          <span className="shrink-0" data-testid="statusbar-rolle">
            {rolleText(user?.role)}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-40">
          <DropdownMenuItem data-testid="workspace-abmelden" onSelect={() => void onLogout()}>
            <LogOut aria-hidden="true" />
            Abmelden
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex-1" />
      <time className="shrink-0" dateTime={jetzt.toISOString()} data-testid="statusbar-zeit">
        {DATUM.format(jetzt)} · {UHRZEIT.format(jetzt)}
      </time>
    </footer>
  );
}
