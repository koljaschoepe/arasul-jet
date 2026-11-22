/**
 * Der App-Standard ist Pflicht (J45, M7, 20.11.2026).
 *
 * Bis zum 19.11.2026 warnte das Geraet nur: eine App ohne Bibliothek, ohne
 * Tests oder ohne den Ablauf des Kits lief trotzdem, und die Verwaltung zeigte
 * ein graues Dreieck. Seit J45 nimmt `POST /api/v1/external/apps` nur an, was
 *
 *   (a) auf der Bibliothek steht, in einer Hauptzahl, die das Geraet traegt,
 *   (b) Tests mitbringt, die gegen diesen Stand gruen liefen, und
 *   (c) den Nachweis des Kit-Ablaufs traegt (`nachweis.json`, Kit-PR 119).
 *
 * (b) steht im Nachweis selbst (`tests`), also sind es zwei Pruefungen: die
 * Bibliothek gegen das Manifest und das Geraet, der Nachweis gegen das Paket.
 *
 * DER NACHWEIS WIRD GENAU NACH DEM FORMATBLATT DES KITS GEPRUEFT
 * (`.ara/knowledge/nachweis.de.md`, Schema 1), in dessen Reihenfolge und mit
 * dessen Codes. Das Kit prueft dasselbe vor jedem `--deploy`
 * (`.ara/tools/lib/nachweis.mjs`, `verify` mit `ort: "paket"`); eine
 * zweite, abweichende Meinung am Geraet hiesse, dass ein Paket am Rechner
 * besteht und am Geraet scheitert, oder umgekehrt. Die Saetze sind dieselben.
 *
 * ER IST KEIN SCHUTZ GEGEN FAELSCHUNG (Entscheidung 20.11.2026). Wer das Blatt
 * kennt, kann die Pruefsummen selbst bilden. Er faengt Versehen ab: eine nach
 * dem Bau geaenderte Datei, eine kopierte App, vergessene Tests. Darum steckt
 * hier kein Schluessel und keine Signatur.
 *
 * AUSNAHMEN: genau eine, die mitgelieferte App (die Werkstatt, bis J52
 * Entwickler-Cockpit). Sie
 * kommt mit dem Geraet und nicht ueber das Kit. Einen Schalter, der die
 * Pruefung umgeht, gibt es nicht. Ein fremder Container (kein Frontend, ein
 * fertiges Image) traegt laut Blatt keinen Nachweis; das Geraet weist ihn ab,
 * bis eine eigene Entscheidung zu fremden Projekten faellt.
 *
 * DAS SYMBOL IST PFLICHT (J51, M7, 21.11.2026, `gestaltung.md`: „jede App
 * setzt `symbol` in `app.json`, das ist Teil des Standards"). Ohne Symbol
 * zeichnete die Leiste fast jede App mit demselben Fenster, und niemand fand
 * seine App. Geprueft wird es NUR beim Ausrollen (`verlange`), nicht im
 * `befund` fuer laufende Staende: eine App, die schon laeuft, bleibt
 * unberuehrt, und der Administrator kann ihr in der Verwaltung ein Symbol
 * geben, das gilt, bis sie eines mitbringt (`apps.symbol_ersatz`).
 *
 * NICHT RUECKWIRKEND. Die Pruefung greift beim Ausrollen. Fuer Staende, die
 * schon laufen, rechnet `befund` dasselbe Urteil fuer die Verwaltung aus
 * (Einstellungen > Apps), ohne dass ein Stand deshalb stehen bleibt.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const logger = require('../../utils/logger');
const { ValidationError } = require('../../utils/errors');
const { MITGELIEFERTE_APPS } = require('../../schemas/apps');

const NACHWEIS_DATEI = 'nachweis.json';
const NACHWEIS_SCHEMA = 1;
const SCHRITTE = Object.freeze(['interview', 'bau', 'test']);

/**
 * Alle Codes, in der Reihenfolge, in der die Pruefung sie findet. Die des
 * Nachweises sind die des Formatblatts; davor stehen die zwei des Geraets zur
 * Bibliothek und der fremde Container. Der Kontrakt nennt sie (`paket.nachweis`).
 */
const CODES = Object.freeze([
  'fremder-container',
  'symbol-fehlt',
  'bibliothek-fehlt',
  'bibliothek-alt',
  'unlesbar',
  'fehlt',
  'schema',
  'siegel',
  'kennung',
  'version',
  'paket-fehlt',
  'paket-geaendert',
  'schritt-fehlt',
  'reihenfolge',
  'tests-fehlen',
  'tests-rot',
  'tests-veraltet',
  'bau-veraltet',
  'bibliothek',
]);

// --- Die Fassung der Bibliothek, die dieses Geraet traegt -----------------------

/**
 * Die Fassung steht an genau einer Stelle, `packages/marken/src/fassung.ts`.
 * Die Shell uebersetzt sie mit, das Frontend legt sie als `/marken/marken.json`
 * aus. Das Backend liest dieselbe Datei (das Image traegt sie, siehe
 * Dockerfile), statt eine zweite Zahl zu fuehren, die beim naechsten Sprung
 * der Bibliothek stehen bliebe.
 */
const FASSUNG_DATEI = path.resolve(__dirname, '../../../../../packages/marken/src/fassung.ts');

let geraetFassungCache;

function geraetFassung() {
  if (geraetFassungCache === undefined) {
    geraetFassungCache = null;
    try {
      const text = require('fs').readFileSync(FASSUNG_DATEI, 'utf8');
      const treffer = /export const FASSUNG = '(\d+\.\d+\.\d+)'/.exec(text);
      geraetFassungCache = treffer ? treffer[1] : null;
    } catch (err) {
      logger.warn(`Fassung der Bibliothek nicht lesbar (${FASSUNG_DATEI}): ${err.message}`);
    }
  }
  return geraetFassungCache;
}

function haupt(fassung) {
  return String(fassung).split('.')[0];
}

// --- Pruefsummen, wie das Blatt sie beschreibt ---------------------------------

const sha = daten => crypto.createHash('sha256').update(daten).digest('hex');
const muell = name => name.startsWith('._') || name === '.DS_Store';

/** Jede regulaere Datei des Pakets ausser `nachweis.json` in der Wurzel und `node_modules`. */
async function paketDateien(wurzel) {
  const liste = [];
  const gehe = async (ordner, tiefe) => {
    const eintraege = await fs.readdir(ordner, { withFileTypes: true });
    for (const eintrag of eintraege) {
      if (muell(eintrag.name)) {
        continue;
      }
      if (tiefe === 0 && eintrag.isFile() && eintrag.name === NACHWEIS_DATEI) {
        continue;
      }
      if (eintrag.name === 'node_modules') {
        continue;
      }
      const voll = path.join(ordner, eintrag.name);
      if (eintrag.isDirectory()) {
        await gehe(voll, tiefe + 1);
      } else if (eintrag.isFile()) {
        liste.push(path.relative(wurzel, voll).split(path.sep).join('/'));
      }
    }
  };
  await gehe(wurzel, 0);
  // Nach Code-Einheiten, nicht nach Sprache: genau wie das Kit.
  return liste.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** `inhalt.paket`: Pfad, NUL, SHA-256 der Bytes, Zeilenvorschub; das Ganze noch einmal gehasht. */
async function paketPruefsumme(wurzel) {
  const hash = crypto.createHash('sha256');
  for (const datei of await paketDateien(wurzel)) {
    hash.update(`${datei}\0${sha(await fs.readFile(path.join(wurzel, datei)))}\n`);
  }
  return `sha256:${hash.digest('hex')}`;
}

/** Kanonisches JSON: Schluessel sortiert, keine Leerzeichen, Werte wie `JSON.stringify`. */
function kanonisch(wert) {
  if (Array.isArray(wert)) {
    return `[${wert.map(kanonisch).join(',')}]`;
  }
  if (wert && typeof wert === 'object') {
    return `{${Object.keys(wert)
      .sort()
      .map(schluessel => `${JSON.stringify(schluessel)}:${kanonisch(wert[schluessel])}`)
      .join(',')}}`;
  }
  return JSON.stringify(wert);
}

function siegel(dokument) {
  const { siegel: _weg, ...rest } = dokument;
  return `sha256:${sha(kanonisch(rest))}`;
}

// --- Die Pruefungen --------------------------------------------------------------

/**
 * Ist das ein fremder Container? Kein Frontend, ein fertiges Image statt
 * eines eigenen Baus (so beschreibt es das Blatt).
 */
function istFremderContainer(manifest) {
  return !manifest.frontend && Boolean(manifest.backend) && !manifest.backend.bauen;
}

/**
 * (a) Die Bibliothek. Eine App mit Oberflaeche nennt in `marken` ihre
 * Fassung, und deren Hauptzahl ist die des Geraets: nur unter dieser Adresse
 * liefert das Geraet aus (`/marken/<haupt>/`), und nur innerhalb einer
 * Hauptzahl faellt kein Name weg. Eine aeltere Kopie derselben Hauptzahl
 * bleibt erlaubt; die Seite der App meldet sie wie bisher.
 */
function pruefeBibliothek(manifest) {
  if (!manifest.frontend) {
    return [];
  }
  if (!manifest.marken) {
    return [
      {
        code: 'bibliothek-fehlt',
        text: 'Die App nennt in app.json unter `marken` keine Fassung der Bibliothek: sie steht nicht auf den Bausteinen des Geräts.',
      },
    ];
  }
  const geraet = geraetFassung();
  if (geraet && haupt(manifest.marken) !== haupt(geraet)) {
    return [
      {
        code: 'bibliothek-alt',
        text: `Die App steht auf der Bibliothek ${manifest.marken}, das Gerät trägt die Hauptzahl ${haupt(geraet)} (Fassung ${geraet}). Mit dem Kit auf ${haupt(geraet)} heben und neu bauen.`,
      },
    ];
  }
  return [];
}

async function leseNachweis(ordner) {
  let roh;
  try {
    roh = await fs.readFile(path.join(ordner, NACHWEIS_DATEI), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
      return { dokument: null, problem: null };
    }
    throw err;
  }
  try {
    const dokument = JSON.parse(roh);
    if (!dokument || typeof dokument !== 'object' || Array.isArray(dokument)) {
      return { dokument: null, problem: 'kein JSON-Objekt' };
    }
    return { dokument, problem: null };
  } catch (err) {
    return { dokument: null, problem: err.message };
  }
}

/**
 * (b) und (c): der Nachweis, Schema 1, in der Reihenfolge des Blatts.
 * Spiegel von `verify(dir, { ort: "paket" })` im Kit.
 */
async function pruefeNachweis(ordner, manifest) {
  const funde = [];
  const fund = (code, text) => funde.push({ code, text });
  const { dokument, problem } = await leseNachweis(ordner);

  if (problem) {
    fund('unlesbar', `\`${NACHWEIS_DATEI}\` ist kein lesbares JSON: ${problem}.`);
    return funde;
  }
  if (!dokument) {
    fund(
      'fehlt',
      `Es gibt keine \`${NACHWEIS_DATEI}\`: die App ist nicht über den Ablauf des Kits gebaut.`
    );
    return funde;
  }
  if (dokument.schema !== NACHWEIS_SCHEMA) {
    fund(
      'schema',
      `Das Schema ${JSON.stringify(dokument.schema)} des Nachweises kennt dieses Gerät nicht, erwartet wird ${NACHWEIS_SCHEMA}.`
    );
    return funde;
  }
  if (dokument.siegel !== siegel(dokument)) {
    fund('siegel', 'Das Siegel des Nachweises stimmt nicht: die Datei wurde von Hand verändert.');
  }
  if (dokument.app !== manifest.id) {
    fund('kennung', `Der Nachweis gehört zu "${dokument.app}", die App heißt "${manifest.id}".`);
  }
  if (dokument.version !== manifest.version) {
    fund(
      'version',
      `Der Nachweis stammt von Fassung ${dokument.version}, die App steht auf ${manifest.version}. Neu bauen.`
    );
  }

  const inhalt = dokument.inhalt && typeof dokument.inhalt === 'object' ? dokument.inhalt : null;
  if (!inhalt?.paket) {
    fund(
      'paket-fehlt',
      'Der Nachweis nennt keine Prüfsumme des Pakets: er stammt nicht aus einem Bau.'
    );
  } else if (inhalt.paket !== (await paketPruefsumme(ordner))) {
    fund(
      'paket-geaendert',
      'Das Paket ist nach dem Bau verändert worden: seine Prüfsumme stimmt nicht mit dem Nachweis überein.'
    );
  }

  const schritte = Array.isArray(dokument.schritte) ? dokument.schritte : [];
  const namen = schritte.map(schritt => schritt?.name);
  const fehlend = SCHRITTE.filter(name => !namen.includes(name));
  if (fehlend.length) {
    fund('schritt-fehlt', `Im Ablauf fehlt: ${fehlend.join(', ')}.`);
  } else {
    const folge = SCHRITTE.map(name => schritte.find(schritt => schritt?.name === name));
    if (folge.some((s, i) => i > 0 && !(Date.parse(s.zeit) >= Date.parse(folge[i - 1].zeit)))) {
      fund(
        'reihenfolge',
        'Die Schritte des Ablaufs stehen nicht in der Reihenfolge Interview, Bau, Test.'
      );
    }
  }

  const tests = dokument.tests;
  if (!tests?.vorhanden || !(tests.faelle > 0)) {
    fund('tests-fehlen', 'Die App bringt keine Tests mit.');
  } else if (!tests.lauf?.gruen) {
    fund('tests-rot', 'Der letzte Testlauf war nicht grün.');
  } else if (tests.lauf.quelle !== inhalt?.quelle) {
    fund('tests-veraltet', 'Die Tests sind nicht gegen diesen Stand gelaufen. Noch einmal testen.');
  }

  const bau = schritte.find(schritt => schritt?.name === 'bau');
  if (bau && inhalt?.quelle && bau.quelle !== inhalt.quelle) {
    fund('bau-veraltet', 'Der Bau stammt von einem anderen Stand des Quelltexts als der Nachweis.');
  }

  const bibliothek = dokument.bibliothek;
  if (!bibliothek || (manifest.marken && bibliothek.marken !== manifest.marken)) {
    fund(
      'bibliothek',
      `Die Fassung der Bibliothek im Nachweis (${bibliothek?.marken ?? 'keine'}) ist nicht die im Manifest (${manifest.marken ?? 'keine'}).`
    );
  }
  return funde;
}

/**
 * Das Urteil ueber einen ausgepackten Ordner (Paket im Eingang oder ein
 * Versionsordner am Geraet).
 *
 * @returns {Promise<{erfuellt: boolean, ausgenommen: boolean, funde: {code: string, text: string}[]}>}
 */
/**
 * Das Symbol der Leiste. Die Form prueft schon das Manifest (`AppSymbol`),
 * hier geht es nur darum, ob es da ist. Ein Satz, der sagt, was fehlt und
 * wie es aussieht.
 */
function pruefeSymbol(manifest) {
  if (typeof manifest.symbol === 'string' && manifest.symbol.trim()) {
    return [];
  }
  return [
    {
      code: 'symbol-fehlt',
      text: 'Die App nennt in app.json kein `symbol`, das Bild in der Leiste: einen Lucide-Namen wie `file-text` oder ein Kürzel wie `BE`.',
    },
  ];
}

/**
 * @param {object} [optionen]
 * @param {boolean} [optionen.ausrollen] auch pruefen, was erst beim Ausrollen
 *   Pflicht ist und laufende Staende nicht trifft (das Symbol).
 */
async function pruefe(ordner, manifest, { ausrollen = false } = {}) {
  if (MITGELIEFERTE_APPS.includes(manifest.id)) {
    return { erfuellt: true, ausgenommen: true, funde: [] };
  }
  if (istFremderContainer(manifest)) {
    return {
      erfuellt: false,
      ausgenommen: false,
      funde: [
        {
          code: 'fremder-container',
          text: 'Ein fremder Container ohne Oberfläche und mit fertigem Image bringt keinen Nachweis mit. Das Gerät nimmt ihn nicht an, bis entschieden ist, wie fremde Projekte als App kommen.',
        },
      ],
    };
  }
  const funde = [
    ...(ausrollen ? pruefeSymbol(manifest) : []),
    ...pruefeBibliothek(manifest),
    ...(await pruefeNachweis(ordner, manifest)),
  ];
  return { erfuellt: funde.length === 0, ausgenommen: false, funde };
}

/**
 * Beim Ausrollen: abweisen, mit einem Satz je Grund. Die Saetze stehen in der
 * Meldung, weil das Kit genau die einem Menschen zeigt; die Codes stehen
 * daneben in `details.standard`, damit ein Programm nicht Saetze lesen muss.
 */
async function verlange(ordner, manifest) {
  const urteil = await pruefe(ordner, manifest, { ausrollen: true });
  if (urteil.erfuellt) {
    return urteil;
  }
  throw new ValidationError(
    `${manifest.id} ${manifest.version} erfüllt den App-Standard nicht, das Gerät nimmt das Paket nicht an:\n` +
      urteil.funde.map(f => `- ${f.text}`).join('\n'),
    {
      standard: urteil.funde.map(f => f.code),
      hilfe:
        'Mit dem Kit bauen: Plan aktiv setzen, `--build` (lässt die Tests laufen und schreibt den Nachweis), dann `--deploy`. Wo die App steht, sagt `node .ara/tools/app.mjs --app <name> --nachweis`.',
    }
  );
}

/**
 * Fuer die Verwaltung: das Urteil ueber einen Stand, der schon am Geraet liegt.
 * Die Pruefsumme des Pakets kostet einen Durchgang ueber alle Dateien; ein
 * Versionsordner aendert sich nach dem Einspielen nicht mehr, bis dieselbe
 * Version noch einmal kommt (`vergiss`). Darum wird je Ordner gemerkt.
 */
const befunde = new Map();

async function befund(ordner, manifest) {
  if (!befunde.has(ordner)) {
    befunde.set(
      ordner,
      pruefe(ordner, manifest).catch(err => {
        befunde.delete(ordner);
        logger.warn(`App-Standard für ${ordner} nicht prüfbar: ${err.message}`);
        return {
          erfuellt: false,
          ausgenommen: false,
          funde: [{ code: 'nicht-pruefbar', text: `Nicht prüfbar: ${err.message}` }],
        };
      })
    );
  }
  return befunde.get(ordner);
}

/** Nach einem neuen Einspielen derselben Version: das gemerkte Urteil gilt nicht mehr. */
function vergiss(ordner) {
  befunde.delete(ordner);
}

module.exports = {
  NACHWEIS_DATEI,
  CODES,
  pruefe,
  verlange,
  befund,
  vergiss,
  geraetFassung,
  // Fuer Tests: dieselben Bausteine, mit denen ein Test einen Nachweis baut.
  _paketPruefsumme: paketPruefsumme,
  _siegel: siegel,
  _setzeGeraetFassung: f => {
    geraetFassungCache = f;
  },
};
