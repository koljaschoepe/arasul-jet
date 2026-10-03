/**
 * `React.lazy` mit einem zweiten und dritten Versuch (Phase D6, 28.08.2026).
 *
 * Ein `import()` ist eine Netzanfrage, und eine Netzanfrage kann danebengehen.
 * Geht sie daneben, wirft `React.lazy` in den Render, die naechste
 * Fehlergrenze faengt es, und der Mensch steht vor einer Fehlerseite, obwohl
 * an seinem Geraet nichts kaputt ist -- ein Paket ist unterwegs verloren
 * gegangen. Die Shell haengt an genau so einem Buendel: sie wird erst geladen,
 * wenn die Anmeldung durch ist.
 *
 * Zwei Faelle kommen am Geraet wirklich vor:
 *
 *   1. Ein Aussetzer auf dem Weg (WLAN, Tunnel, ein Proxy, der gerade neu
 *      startet). Ein zweiter Versuch nach einer halben Sekunde bringt das
 *      Buendel.
 *   2. Ein Deploy hat die Buendel unter der offenen Seite ausgetauscht. Dann
 *      gibt es die alte Datei nicht mehr, und KEIN Versuch bringt sie zurueck
 *      -- hier hilft nur ein Neuladen der Seite, und das sagt die Oberflaeche
 *      dem Menschen bereits selbst (`updateAvailable` in `App.tsx`).
 *
 * Deshalb: dreimal versuchen, dann durchlassen. Die Fehlergrenze bleibt die
 * Antwort auf Fall 2; sie soll nur nicht mehr die Antwort auf Fall 1 sein.
 */
import { createElement, lazy, useState, type ComponentType, type LazyExoticComponent } from 'react';

/** Wie oft insgesamt versucht wird, und wie lange dazwischen gewartet wird. */
const VERSUCHE = 3;
const PAUSE_MS = 500;

export function lazyNachladen<P extends object>(
  laden: () => Promise<{ default: ComponentType<P> }>
): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => {
    let letzter: unknown;
    for (let versuch = 1; versuch <= VERSUCHE; versuch += 1) {
      try {
        return await laden();
      } catch (fehler) {
        letzter = fehler;
        if (versuch < VERSUCHE) {
          await new Promise(weiter => setTimeout(weiter, PAUSE_MS * versuch));
        }
      }
    }
    throw letzter;
  });
}

/**
 * Wie `lazyNachladen`, dazu `vorladen()` für den Leerlauf (M5).
 *
 * Gemessen am Orin am 03.10.2026: das erste Öffnen von Einstellungen,
 * Verwaltung und Modellen dauerte 330 ms, jedes weitere unter 30. Der Brocken
 * war es kaum — React 19 zeigt für eine frisch suspendierende Komponente erst
 * die Ladefläche und enthüllt den Inhalt gedrosselt (rund 300 ms). Ein
 * Vorladen des Moduls allein hülfe deshalb nicht: `lazy` suspendiert beim
 * ersten Rendern trotzdem. Ist das Modul vorgeladen, rendert diese Hülle die
 * Komponente direkt.
 *
 * Welche der beiden Formen eine Instanz nimmt, steht bei ihrem ersten Rendern
 * fest: ein Wechsel mittendrin wäre ein anderer Elementtyp und damit ein
 * Neuaufbau, der Eingaben verlöre.
 */
export function lazyMitVorladen<P extends object>(
  laden: () => Promise<{ default: ComponentType<P> }>
): ComponentType<P> & { vorladen: () => Promise<void> } {
  let fertig: ComponentType<P> | null = null;
  const merken = () =>
    laden().then(modul => {
      fertig = modul.default;
      return modul;
    });
  const Faul = lazyNachladen(merken);
  function Vorladbar(props: P) {
    const [Form] = useState<ComponentType<P>>(() => fertig ?? Faul);
    return createElement(Form, props);
  }
  return Object.assign(Vorladbar, {
    vorladen: () =>
      merken().then(
        () => undefined,
        () => undefined
      ),
  });
}
