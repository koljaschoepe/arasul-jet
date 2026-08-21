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
 * Wie lange ein Eintrag hoechstens liegen bleibt.
 *
 * Diese Zahl ist BEWUSST an nichts gekoppelt, insbesondere nicht an
 * `MODEL_IDLE_KEEP_ALIVE_MINUTES`. Anfangs war sie es gedanklich, und genau
 * daraus entstand ein Fehler: ein Eintrag, der zwei Minuten liegen bleibt,
 * konnte ein spaeteres, echtes Auslaufen desselben Modells verschlucken.
 *
 * Die Richtigkeit haengt seither nicht mehr an einer Frist, sondern an zwei
 * Ereignissen: ein Eintrag wird beim ersten Treffer verbraucht
 * (`warUnsereEntladung`) und verworfen, sobald das Modell wieder geladen zu
 * sehen ist (`vergissEntladung`). Was danach noch uebrig bleibt, ist ein
 * Eintrag, den nie jemand abholt, zum Beispiel weil `/deactivate` mit einer
 * erfundenen Kennung aufgerufen wurde. Fuer den ist diese Frist da, und fuer
 * nichts sonst: sie haelt die Ablage klein, sie entscheidet nichts.
 *
 * Wer `MODEL_IDLE_KEEP_ALIVE_MINUTES` hochsetzt, muss hier deshalb nichts
 * nachziehen. Die beiden Zahlen duerfen auseinanderlaufen.
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
 * Ein Treffer wird VERBRAUCHT. Jede eigene Entladung laesst genau ein
 * Verschwinden erwarten, also passt genau ein Treffer dazu. Ohne Verbrauch
 * koennte derselbe Eintrag zweimal greifen: ein Modell von Hand entladen, fuer
 * die naechste Anfrage neu geladen und dann von Ollama wegen Ruhe wieder
 * entladen. Die zweite, echte Entladung fiele stillschweigend unter den Tisch,
 * und der Nutzer saehe ein Modell verschwinden, ohne dass jemand sagt warum.
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
