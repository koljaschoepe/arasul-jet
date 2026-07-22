/**
 * Änderungs-Verfolgung für Skill-Läufe (Plan 011, Schritt 16).
 *
 * Skills schreiben und löschen Dateien OHNE Rückfrage — Schreib-Werkzeug UND
 * Terminal. Die Gegenleistung dafür ist Nachvollziehbarkeit: Am Ende eines Laufs
 * muss lückenlos sichtbar sein, was sich geändert hat (neu, geändert, gelöscht),
 * mit Vorher/Nachher.
 *
 * Der Weg dorthin ist bewusst EIN Mechanismus statt eines Hakens je Werkzeug:
 * Der Runner macht vor dem Lauf einen Abzug (Snapshot) der erlaubten Ordner und
 * nach dem Lauf einen zweiten; die Differenz IST die Übersicht. Warum so und
 * nicht ein `onChange` je Schreibvorgang:
 *
 *   - Das Terminal-Werkzeug weiß NICHT, welche Dateien ein Befehl verändert
 *     hat (es führt eine beliebige Shell aus). Nur der Ordner-Abzug sieht es.
 *   - Löschungen entstehen nur im Terminal und lassen sich per Haken gar nicht
 *     melden — im Abzug-Vergleich fallen sie von selbst heraus.
 *   - Die Übersicht ist ohnehin NETTO gemeint („was steht am Ende anders da"),
 *     und genau das liefert der Vergleich von Anfang und Ende.
 *
 * Alles ist gedeckelt (Dateizahl, Dateigröße, gespeicherte Vorschau-Länge): Ein
 * großer Quell-Ordner soll den Lauf nicht ausbremsen und die Lauf-Zeile in der
 * DB nicht sprengen. Was der Deckel auslässt, wird ehrlich benannt statt still
 * verschluckt.
 */

const fsp = require('fs').promises;
const path = require('path');

// So viele Dateien werden über ALLE erlaubten Ordner hinweg höchstens erfasst.
// Ein Deckel gegen einen versehentlich riesigen Quell-Ordner — er bremst den
// Abzug, nicht den eigentlichen Lauf.
const SNAPSHOT_MAX_FILES = 2000;
// Bis zu dieser Größe wird der Dateiinhalt für den Vergleich in den Speicher
// gelesen. Größere Dateien werden über Größe + Änderungszeit verglichen (das
// Terminal aktualisiert die mtime bei jeder Änderung) — inhaltlich, aber ohne
// den ganzen Inhalt zu halten.
const CONTENT_MAX_BYTES = 128 * 1024; // 128 KB
// Gesamt-Budget für gehaltene Inhalte über den ganzen Abzug. Danach wird nur
// noch Größe/mtime gemerkt, damit ein Ordner voller mittelgroßer Dateien den
// Speicher nicht flutet.
const SNAPSHOT_TOTAL_CONTENT_BYTES = 24 * 1024 * 1024; // 24 MB
// So lang darf die in der DB gespeicherte Vorher-/Nachher-Vorschau je Datei
// sein. Kürzt lange Dateien — die volle Datei liegt ohnehin auf der Platte.
const STORE_MAX_BYTES = 32 * 1024; // 32 KB
// Höchstzahl der in der Übersicht geführten Einträge. Ein Lauf, der Tausende
// Dateien anfasst (z. B. `npm install`), soll die Zeile nicht sprengen.
const MAX_CHANGES = 300;

/** Deutet einen NUL im Anfang als Binärdatei — dann ist Text-Vorschau sinnlos. */
function istBinaer(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Liest EINE Datei in einen Abzug-Eintrag. Wirft nie — eine einzelne
 * unlesbare Datei (Rechte, Wettlauf) darf den ganzen Abzug nicht kippen.
 *
 * @returns {Promise<object|null>} Eintrag oder null (überspringen).
 */
async function leseEintrag(abs, root, budget, deps) {
  const { fs = fsp } = deps;
  let stat;
  try {
    stat = await fs.lstat(abs);
  } catch {
    return null;
  }
  // Symlinks bewusst NICHT verfolgen: Der Abzug soll den echten Ordner-Inhalt
  // abbilden, nicht über einen Link nach außen greifen (dieselbe Linie wie die
  // Pfad-Sperre der Datei-Werkzeuge).
  if (!stat.isFile()) {
    return null;
  }

  const groesse = stat.size;
  const mtimeMs = stat.mtimeMs;
  let inhalt = null;
  let binaer = false;
  let zuGross = groesse > CONTENT_MAX_BYTES;

  if (!zuGross && budget.rest > 0) {
    try {
      const buf = await fs.readFile(abs);
      if (istBinaer(buf)) {
        binaer = true;
      } else {
        inhalt = buf.toString('utf8');
        budget.rest -= buf.length;
      }
    } catch {
      // Nicht lesbar → wie „zu groß" behandeln: über Größe/mtime vergleichen.
      zuGross = true;
    }
  } else if (!zuGross) {
    // Budget erschöpft: Inhalt nicht mehr halten, aber die Datei zählt weiter.
    zuGross = true;
  }

  return { root, groesse, mtimeMs, inhalt, binaer, zuGross };
}

/**
 * Erstellt einen Abzug aller erlaubten Ordner: absoluter Pfad → Eintrag.
 *
 * Läuft rekursiv, überspringt Symlinks und deckelt bei SNAPSHOT_MAX_FILES.
 * Fehlende Ordner (der Arbeitsordner entsteht evtl. erst beim ersten Schreiben)
 * werden übersprungen, nicht als Fehler behandelt.
 *
 * @param {string[]} roots - erlaubte Ordner (roots[0] = Arbeitsordner).
 * @param {object} [deps] - { fs } für Tests.
 * @returns {Promise<Map<string, object>>}
 */
async function snapshot(roots = [], deps = {}) {
  const { fs = fsp } = deps;
  const map = new Map();
  const budget = { rest: SNAPSHOT_TOTAL_CONTENT_BYTES };
  if (!Array.isArray(roots) || roots.length === 0) {
    return map;
  }

  for (const root of roots) {
    if (!root) {
      continue;
    }
    const stapel = [root];
    while (stapel.length > 0) {
      if (map.size >= SNAPSHOT_MAX_FILES) {
        return map;
      }
      const dir = stapel.pop();
      let eintraege;
      try {
        eintraege = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        // Ordner existiert (noch) nicht oder ist nicht lesbar → überspringen.
        continue;
      }
      for (const e of eintraege) {
        if (map.size >= SNAPSHOT_MAX_FILES) {
          return map;
        }
        // Symlinks (auch auf Verzeichnisse) nicht verfolgen.
        if (e.isSymbolicLink()) {
          continue;
        }
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
          stapel.push(abs);
        } else if (e.isFile()) {
          const eintrag = await leseEintrag(abs, root, budget, { fs });
          if (eintrag) {
            map.set(abs, eintrag);
          }
        }
      }
    }
  }
  return map;
}

/** Anzeigepfad einer Datei relativ zu ihrem Ordner; Zweitordner werden benannt. */
function anzeigePfad(abs, root, roots) {
  const rel = path.relative(root, abs) || path.basename(abs);
  // Bei mehreren Ordnern den Ordnernamen voranstellen, außer beim Arbeitsordner
  // (roots[0]) — dort ist der bloße relative Pfad am lesbarsten.
  if (roots.length > 1 && root !== roots[0]) {
    return `${path.basename(root)}/${rel}`;
  }
  return rel;
}

/** Kürzt eine Text-Vorschau auf STORE_MAX_BYTES (byte-genau, kein halbes Zeichen). */
function kuerze(text) {
  if (text == null) {
    return { text: null, gekuerzt: false };
  }
  const buf = Buffer.from(text, 'utf8');
  if (buf.byteLength <= STORE_MAX_BYTES) {
    return { text, gekuerzt: false };
  }
  const schnitt = buf.subarray(0, STORE_MAX_BYTES).toString('utf8').replace(/�+$/, '');
  return { text: schnitt, gekuerzt: true };
}

/** Baut die Vorher-/Nachher-Vorschau eines Eintrags samt Hinweis. */
function vorschau(eintrag) {
  if (!eintrag) {
    return { text: null, gekuerzt: false, hinweis: null };
  }
  if (eintrag.binaer) {
    return { text: null, gekuerzt: false, hinweis: 'Binärdatei' };
  }
  if (eintrag.inhalt == null) {
    return { text: null, gekuerzt: false, hinweis: 'zu groß für Vorschau' };
  }
  const { text, gekuerzt } = kuerze(eintrag.inhalt);
  return { text, gekuerzt, hinweis: null };
}

/** Hat sich ein in BEIDEN Abzügen vorhandener Eintrag geändert? */
function hatSichGeaendert(v, n) {
  // Beide mit Inhalt → inhaltlich vergleichen (exakt).
  if (v.inhalt != null && n.inhalt != null) {
    return v.inhalt !== n.inhalt;
  }
  // Sonst über Größe/Änderungszeit — das Terminal fasst die mtime bei jeder
  // Änderung an, auch wenn die Größe zufällig gleich bleibt.
  return v.groesse !== n.groesse || v.mtimeMs !== n.mtimeMs;
}

/** Reihenfolge in der Übersicht: neu, dann geändert, dann gelöscht. */
const ART_RANG = { neu: 0, geaendert: 1, geloescht: 2 };

/**
 * Vergleicht zwei Abzüge und liefert die Änderungs-Übersicht.
 *
 * @param {Map<string,object>} vorher
 * @param {Map<string,object>} nachher
 * @param {string[]} roots
 * @returns {{aenderungen: object[], abgeschnitten: boolean}}
 *   `aenderungen`: [{ pfad, art, vorher, nachher, gekuerzt, hinweis }]
 *   `abgeschnitten`: true, wenn mehr als MAX_CHANGES Änderungen anfielen.
 */
function berechneAenderungen(vorher, nachher, roots = []) {
  const alle = new Set([...vorher.keys(), ...nachher.keys()]);
  const roh = [];

  for (const abs of alle) {
    const v = vorher.get(abs);
    const n = nachher.get(abs);
    let art;
    if (v && !n) {
      art = 'geloescht';
    } else if (!v && n) {
      art = 'neu';
    } else if (v && n && hatSichGeaendert(v, n)) {
      art = 'geaendert';
    } else {
      continue;
    } // unverändert

    const root = (n || v).root;
    const vv = vorschau(art === 'neu' ? null : v);
    const nn = vorschau(art === 'geloescht' ? null : n);
    // Der Hinweis (Binär/zu groß) NUR setzen, wenn es wirklich NICHTS zu zeigen
    // gibt. Sonst verdeckte er eine vorhandene Vorschau: eine Datei, die vorher
    // zu groß war und jetzt klein/Text ist, hätte einen lesbaren Nachher-Inhalt
    // UND „zu groß"-Hinweis getragen — und die Anzeige zeigt bei Hinweis nur ihn.
    const hatVorschau = vv.text != null || nn.text != null;
    roh.push({
      pfad: anzeigePfad(abs, root, roots),
      art,
      vorher: vv.text,
      nachher: nn.text,
      hinweis: hatVorschau ? null : nn.hinweis || vv.hinweis,
      gekuerzt: Boolean(vv.gekuerzt || nn.gekuerzt),
    });
  }

  roh.sort((a, b) => ART_RANG[a.art] - ART_RANG[b.art] || a.pfad.localeCompare(b.pfad));
  const abgeschnitten = roh.length > MAX_CHANGES;
  return { aenderungen: abgeschnitten ? roh.slice(0, MAX_CHANGES) : roh, abgeschnitten };
}

module.exports = {
  snapshot,
  berechneAenderungen,
  // Für Tests einsehbar.
  SNAPSHOT_MAX_FILES,
  CONTENT_MAX_BYTES,
  STORE_MAX_BYTES,
  MAX_CHANGES,
};
