import { useCallback, useEffect, useRef } from 'react';
import { useApi } from './useApi';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Zwei Themes: Hell (Vorgabe) und Dunkel — und sie gehoeren dem MENSCHEN.
 *
 * Bis Phase H1 lagen drei Themes im `localStorage` des Browsers. Beides ist
 * hier gefallen:
 *
 *  - »Schwarz« faellt. Es unterschied sich von »Dunkel« um zwei
 *    Hintergrundstufen, und jede Farbentscheidung, jede Abnahmetabelle und
 *    jedes Bild gab es dreimal statt zweimal.
 *  - Der `localStorage` faellt als QUELLE. Auf einer Standardsoftware, an der
 *    sich Menschen anmelden, gehoert eine Einstellung zu dem, der sie gemacht
 *    hat, und nicht zu dem Rechner, vor dem er zufaellig sass. Der Wert steht
 *    in `admin_users.theme` (Migration 180) und faehrt mit der Sitzung mit.
 *
 * DOM-Vertrag auf `<html>`, unveraendert:
 *   - `data-theme="dark"` → schaltet den Block `[data-theme='dark']` in
 *     `index.css`. Hell braucht kein Attribut: Hell IST `:root`.
 *   - Klasse `dark` → haelt die Tailwind-Utilities `dark:` am Leben.
 *
 * KEIN `toggleTheme` MEHR. Bei drei Werten war ein Durchschalten ein Weg; bei
 * zwei Optionen in den Einstellungen waere es ein zweiter Weg in denselben
 * Zustand, und einen Knopf dafuer gab es zuletzt ohnehin nirgends.
 */
export type Theme = 'light' | 'dark';

/** Ohne Sitzung und ohne gesetzten Wert: hell (Spaltenvorgabe, Migration 180). */
const THEME_VORGABE: Theme = 'light';

/**
 * Der alte Schluessel — nur noch, um ihn EINMAL zu uebernehmen und dann zu
 * loeschen. Er stand nur dann im Speicher, wenn jemand das Theme aktiv
 * umgestellt hat (die alte Vorgabe »Schwarz« wurde nie geschrieben), also ist
 * seine Anwesenheit eine Entscheidung und keine Vermutung. `black` und `dark`
 * werden beide zu `dark`.
 */
const ALTER_SCHLUESSEL = 'arasul_theme';

function altenWertLesen(): Theme | null {
  let alt: string | null = null;
  try {
    alt = localStorage.getItem(ALTER_SCHLUESSEL);
  } catch {
    // Ein Browser ohne Speicher hat auch nichts zu uebernehmen.
    return null;
  }
  if (alt === 'black' || alt === 'dark') return 'dark';
  if (alt === 'light') return 'light';
  return null;
}

function altenWertVergessen(): void {
  try {
    localStorage.removeItem(ALTER_SCHLUESSEL);
  } catch {
    /* s. o. */
  }
}

function amDokumentAnwenden(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}

/**
 * Das Theme des Angemeldeten, lesen und setzen.
 *
 * Es gibt keinen eigenen Zustand daneben: die Quelle ist der Benutzer aus dem
 * `AuthContext`, und der kommt aus derselben Antwort, die auch sagt, ob eine
 * Sitzung besteht. Wer nicht angemeldet ist (Anmeldung, Passwortwechsel),
 * sieht die Vorgabe.
 */
export function useTheme() {
  const { user, isAuthenticated, benutzerAktualisieren } = useAuth();
  const api = useApi();

  const theme: Theme = user?.theme === 'dark' ? 'dark' : THEME_VORGABE;

  const setTheme = useCallback(
    async (neu: Theme) => {
      // Erst schreiben, dann anzeigen: die Oberflaeche zeigt das, was das
      // Geraet bestaetigt hat. Ein Fehler meldet sich ueber `useApi` selbst,
      // und der Bildschirm bleibt, wie er war -- das ist die ehrlichere
      // Auskunft als ein Umschalten, das den naechsten Seitenaufbau nicht
      // ueberlebt.
      const antwort = await api.put<{ data: { theme: Theme } }>('/darstellung', { theme: neu });
      benutzerAktualisieren({ theme: antwort?.data?.theme ?? neu });
    },
    [api, benutzerAktualisieren]
  );

  // Einmalige Uebernahme des alten Browser-Werts (Phase H1). Sie laeuft nur
  // fuer einen Angemeldeten -- ohne Sitzung gibt es niemanden, dem der Wert
  // gehoeren koennte -- und genau einmal je Browser, weil der Schluessel
  // danach weg ist. `uebernommen` haelt sie zusaetzlich innerhalb einer
  // Sitzung fest, damit der StrictMode-Doppelaufruf nicht zweimal schreibt.
  //
  // Der Merker gehoert dem einzelnen Hook und nicht dem Modul. Beim Laden
  // haelt `useTheme()` nur `App.tsx`; `GeneralSettings` kommt erst, wenn
  // jemand die Einstellungen oeffnet, und da ist der Schluessel laengst weg.
  // Waeren doch zwei zugleich gemountet, schickten sie zweimal DIESELBE
  // Anfrage und raeumten zweimal denselben Schluessel weg -- ein Merker am
  // Modul brauchte dafuer eine Naht, die nur die Tests zuruecksetzen.
  const uebernommen = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || uebernommen.current) return;
    const alt = altenWertLesen();
    if (!alt) return;
    uebernommen.current = true;
    if (alt === theme) {
      // Nichts zu schreiben, nur aufzuraeumen.
      altenWertVergessen();
      return;
    }
    setTheme(alt)
      .then(altenWertVergessen)
      .catch(() => {
        // Der Schluessel bleibt liegen, der naechste Seitenaufbau versucht es
        // wieder. Etwas zu loeschen, dessen Uebernahme misslungen ist, waere
        // der einzige Weg, den Wert endgueltig zu verlieren.
        uebernommen.current = false;
      });
  }, [isAuthenticated, theme, setTheme]);

  // Das Attribut am Dokument folgt dem Wert. Ein Effekt, eine Stelle -- auch
  // wenn mehrere Komponenten den Hook halten, schreiben sie denselben Wert.
  useEffect(() => {
    amDokumentAnwenden(theme);
  }, [theme]);

  return { theme, setTheme } as const;
}
