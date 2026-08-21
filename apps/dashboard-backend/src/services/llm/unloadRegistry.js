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

/**
 * Eine eigene Entladung merken. Kennung ist der Name, den Ollama kennt.
 *
 * Beim Eintragen wird aufgeraeumt, nicht nur beim Nachsehen. `/unload` und
 * `/deactivate` nehmen eine beliebige Kennung aus dem Pfad, und was nicht im
 * Katalog steht, geht roh an Ollama. Wer die Route oft genug mit erfundenen
 * Kennungen aufruft, liesse die Ablage sonst wachsen, denn das Nachsehen
 * greift nur bei Modellen, die wirklich verschwinden. Bei einem Geraet, das
 * fuenf Jahre ohne Betreuung laufen soll, ist das kein Randfall.
 */
function merkeEntladung(kennung) {
  if (!kennung) {
    return;
  }
  const jetzt = Date.now();
  for (const [name, zeit] of gemerkt) {
    if (jetzt - zeit > KARENZ_MS) {
      gemerkt.delete(name);
    }
  }
  gemerkt.set(kennung, jetzt);
}

/**
 * War das eine eigene Entladung?
 *
 * Ein Treffer wird VERBRAUCHT. Das ist nicht Sparsamkeit, sondern noetig: die
 * Frist von zwei Minuten ist ungefaehr so lang wie die kuerzeste Haltezeit
 * (`MODEL_IDLE_KEEP_ALIVE_MINUTES`, Vorgabe 2). Ohne Verbrauch koennte
 * derselbe Eintrag zweimal greifen, naemlich wenn ein Modell von Hand entladen,
 * fuer die naechste Anfrage neu geladen und dann innerhalb derselben zwei
 * Minuten von Ollama wegen Ruhe wieder entladen wird. Die zweite, echte
 * Entladung fiele stillschweigend unter den Tisch, und der Nutzer saehe wieder
 * ein Modell verschwinden, ohne dass jemand sagt warum.
 *
 * Jede eigene Entladung laesst genau ein Verschwinden erwarten, also passt
 * genau ein Treffer dazu.
 *
 * Abgelaufene Eintraege werden dabei entfernt, damit die Ablage nicht waechst.
 */
function warUnsereEntladung(kennung, jetzt = Date.now()) {
  for (const [name, zeit] of gemerkt) {
    if (jetzt - zeit > KARENZ_MS) {
      gemerkt.delete(name);
    }
  }
  return gemerkt.delete(kennung);
}

/**
 * Einen Eintrag verwerfen, weil das Modell wieder geladen ist.
 *
 * Ein gemerkter Eintrag sagt: "gleich verschwindet etwas, das waren wir". Ist
 * das Modell beim naechsten Blick wieder da, ist das Verschwinden entweder
 * gar nicht aufgefallen oder schon vorbei. Der Eintrag erklaert dann nichts
 * mehr, und liegen zu bleiben ist nicht harmlos:
 *
 * Die Automatik entlaedt um 0 Uhr und hinterlaesst einen Eintrag. Das Modell
 * wird um 0:30 fuer eine Anfrage neu geladen. Um 1:30 laeuft es bei Ollama
 * wegen Ruhe aus, ein echtes, erklaerungsbeduerftiges Ereignis. Ohne dieses
 * Verwerfen faende der Vergleich den alten Eintrag, verbrauchte ihn und
 * schwiege. Genau der Fall, den D3 beenden sollte, durch eine engere Tuer
 * wieder hereingekommen. Und weil die Frist von zwei Minuten so lang ist wie
 * die kuerzeste Haltezeit, ist das auf einem ruhigen Geraet der Normalfall.
 */
function vergissEntladung(kennung) {
  gemerkt.delete(kennung);
}

/** Nur fuer Tests. */
function zuruecksetzen() {
  gemerkt.clear();
}

module.exports = {
  merkeEntladung,
  warUnsereEntladung,
  vergissEntladung,
  zuruecksetzen,
  KARENZ_MS,
};
