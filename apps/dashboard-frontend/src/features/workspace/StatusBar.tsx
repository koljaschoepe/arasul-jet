import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

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

/**
 * Die Statusleiste am unteren Rand (M5, `frontend.md`, Abschnitt Rahmen): dauerhaft
 * Name, Datum und Uhrzeit, für jeden gleich — nie Modell, Speicher, Verbindung
 * oder Fassung. Ein Mitarbeiter sieht keine Technik, und der Administrator
 * liest sie in der Verwaltung (System, Modelle) statt hier. Die Zahl der
 * Freigaben trägt das Haus der Aktivitätsleiste; der Modell-Umschalter ist
 * gefallen, Modelle stehen in der Verwaltung.
 *
 * Unter 900 px bleibt es eine Zeile: der Name kürzt, Datum und Uhrzeit stehen
 * fest.
 */
export function StatusBar() {
  const { user } = useAuth();
  const jetzt = useJetzt();
  const name = user?.anzeigeName || user?.username || '';

  return (
    <footer
      className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-background px-3 text-xs text-muted-foreground"
      data-testid="statusbar"
    >
      <span className="min-w-0 truncate" data-testid="statusbar-name">
        {name}
      </span>
      <div className="flex-1" />
      <time className="shrink-0" dateTime={jetzt.toISOString()} data-testid="statusbar-zeit">
        {DATUM.format(jetzt)} · {UHRZEIT.format(jetzt)}
      </time>
    </footer>
  );
}
