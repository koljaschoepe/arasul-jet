/**
 * Wer hat entladen (Plan 023 D3, Nachtrag zum Nachtrag).
 *
 * `checkSmartUnload` vergleicht zwei Durchgaenge und bucht als
 * `auto_unload_ollama_keepalive`, was zwischendurch aus dem Speicher
 * verschwunden ist. Diese Schlussfolgerung ist nur richtig, wenn Arasul es
 * nicht selbst getan hat, und es gibt vier Wege, auf denen es das tut:
 *
 *   1. die Automatik nach Ruhezeit (`unloadModelWithTracking`),
 *   2. der Knopf im Dashboard (`POST /models/:id/unload`),
 *   3. das Loeschen eines Modells (`deleteModel` entlaedt vorher),
 *   4. das Verdraengen, um Platz fuer ein anderes zu schaffen
 *      (`_checkMemoryRequirements`).
 *
 * Nur der erste Weg war dem Vergleich bekannt. Die anderen drei waeren binnen
 * dreissig Sekunden als "automatisch wegen Ruhe entladen" im Protokoll
 * gelandet, und der Nutzer haette gelesen, sein Modell sei ungenutzt gewesen,
 * waehrend er selbst auf Entladen geklickt hat. Das ist genau die falsche
 * Herkunftsangabe, die D3 beseitigen sollte, nur an einer anderen Stelle.
 *
 * Alle vier laufen durch `modelService.unloadModel`. Dort wird gemerkt, hier
 * wird nachgesehen.
 */

/**
 * Wie lange eine eigene Entladung den Vergleich stumm schaltet.
 *
 * Der Vergleich laeuft alle 30 Sekunden. Zwei Minuten decken den Fall ab, dass
 * eine Entladung kurz nach einem Durchgang passiert und erst beim
 * uebernaechsten auffaellt, und sind kurz genug, dass ein spaeteres, echtes
 * Auslaufen derselben Kennung nicht mit verschluckt wird.
 */
const KARENZ_MS = 120000;

/** Kennung (so wie sie beim Entladen benutzt wurde) -> Zeitpunkt. */
const gemerkt = new Map();

/** Eine eigene Entladung merken. Kennung ist der Name, den Ollama kennt. */
function merkeEntladung(kennung) {
  if (!kennung) {
    return;
  }
  gemerkt.set(kennung, Date.now());
}

/**
 * War das eine eigene Entladung? Abgelaufene Eintraege werden dabei entfernt,
 * damit die Ablage nicht waechst.
 */
function warUnsereEntladung(kennung, jetzt = Date.now()) {
  for (const [name, zeit] of gemerkt) {
    if (jetzt - zeit > KARENZ_MS) {
      gemerkt.delete(name);
    }
  }
  return gemerkt.has(kennung);
}

/** Nur fuer Tests. */
function zuruecksetzen() {
  gemerkt.clear();
}

module.exports = { merkeEntladung, warUnsereEntladung, zuruecksetzen, KARENZ_MS };
