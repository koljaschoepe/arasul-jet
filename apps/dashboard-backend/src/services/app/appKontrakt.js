/**
 * Der Kontrakt zwischen Geraet und Ara-Kit (Phase C5 des Umbaus vom
 * 26.08.2026, Zeile 29 vom 27.08.2026).
 *
 * Das Ara-Kit ist ein eigenes Repository und lebt sein eigenes Leben: es baut
 * Apps, prueft deren Vorlage und rollt sie auf ein Geraet, das ein anderer
 * Mensch zu einem anderen Zeitpunkt aktualisiert hat. Zwischen beiden liegt
 * genau eine Schnittstelle, und bis hierher lag sie in zwei Repositories
 * gleichzeitig -- als Schema hier und als Nachbau dort. Zwei Nachbauten
 * desselben Vertrags laufen auseinander; die Frage ist nur, wann jemand es
 * merkt.
 *
 * DIESER ENDPUNKT IST DIE EINE QUELLE. Das Kit prueft seine Vorlage gegen das,
 * was das Geraet hier ausgibt, und merkt an der Kontraktversion, dass es zu
 * einem Geraet nicht passt -- bevor es ein Paket schickt, das dort abgewiesen
 * wird.
 *
 * WAS JSON-SCHEMA NICHT KANN, STEHT ALS SATZ DANEBEN. `z.toJSONSchema` uebergeht
 * jede `.refine`-Regel still, und im Manifest sind das gerade die
 * interessanten: „mindestens eines von Frontend und Backend", „mit Backend
 * braucht es einen Port", „die Kennung `test` ist vergeben". Ein Kit, das nur
 * das Schema prueft, haelte ein Manifest fuer gueltig, das das Geraet
 * abweist. Deshalb `regeln`.
 */

const { z } = require('zod');
const { versionFuerAnzeige } = require('../../utils/version');
const { AppManifest } = require('../../schemas/apps');
const { FlowDefinition } = require('../../schemas/flows');
const { VORGABE_ENDPUNKTE, ALLE_ENDPUNKTE } = require('../../config/apiBereiche');
const { KOPF_BENUTZER, KOPF_ROLLE } = require('./appZugang');
const appPaket = require('./appPaket');
const appFlows = require('./appFlows');

/**
 * Die Kontraktversion.
 *
 * Sie zaehlt hoch, wenn sich etwas aendert, worauf ein Kit sich verlassen hat:
 * ein Pflichtfeld im Manifest, ein Kopfzeilenname, ein Endpunkt, eine der
 * Regeln. Sie zaehlt NICHT hoch, wenn eine Beschreibung praeziser wird.
 *
 * Von Hand, nicht aus der Systemversion abgeleitet: das Geraet bekommt
 * Aktualisierungen, die den Vertrag nicht anfassen, und ein Kit, das nach jeder
 * davon behauptet, es passe nicht mehr, waere schlimmer als keine Pruefung --
 * beim dritten falschen Alarm liest niemand mehr hin.
 *
 * `__tests__/unit/appKontrakt.test.js` haelt einen Fingerabdruck des
 * Kontraktes fest und faellt um, wenn sich etwas aendert, ohne dass diese Zahl
 * mitgeht. Das ist die einzige Stelle, an der diese Zahl ueberhaupt eine
 * Bedeutung bekommt.
 */
const KONTRAKT_VERSION = 2;

/*
 * Fassung 2 (Phase C6, 27.08.2026): `flows` im Manifest ist keine Liste von
 * Namen mehr, sondern ein Verzeichnis -- aus einer Forderung ist eine
 * Lieferung geworden. Ein Kit, das noch `"flows": ["a","b"]` schreibt, wird
 * vom Geraet abgewiesen (`.strict()` plus Typpruefung), und genau dafuer ist
 * diese Zahl da: es merkt es, bevor es ein Paket schickt.
 */

/**
 * Die Regeln des Manifests, die kein JSON-Schema traegt.
 *
 * Sie stehen als Text und nicht als Ausdruck, weil sie kein Programm sein
 * sollen: das Kit soll sie einem Menschen zeigen koennen, wenn sein Manifest
 * abgewiesen wird. Durchgesetzt werden sie ohnehin am Geraet
 * (`schemas/apps.js`) -- hier stehen sie, damit das Kit sie VORHER kennt.
 */
const MANIFEST_REGELN = Object.freeze([
  'Mindestens eines von `frontend` und `backend`. Eine App ohne beides ist nichts.',
  'Mit `backend` braucht es `ports.backend`, sonst weiss Traefik nicht, wohin.',
  '`ports` ohne `backend` ist ein Port, auf dem nichts lauscht.',
  'Die Kennung `test` ist vergeben: `/apps/<id>/test/` ist der Teststand jeder App.',
  '`id` und `version` muessen zum Ordner passen, in dem das Manifest liegt.',
  'Unbekannte Felder werden abgewiesen, nicht ignoriert.',
  '`modelle` ist eine Forderung, keine Lieferung: das Geraet installiert kein Modell nach, es sagt beim Einspielen, welches fehlt.',
  '`flows` ist umgekehrt eine LIEFERUNG (seit Kontrakt 2): das Paket bringt die Dateien mit, das Geraet registriert sie je App und Stand.',
]);

/** Die Namen, die unter `/apps/<id>/` der Plattform gehoeren. */
const VERGEBENE_PFADE = Object.freeze([
  { pfad: 'test', wem: 'Der Teststand der App: /apps/<id>/test/' },
  { pfad: 'api', wem: 'Das Backend der App, ueber Traefik' },
  { pfad: 'api/me', wem: 'Arasul selbst: Benutzer und Rolle als JSON, auch ohne App-Backend' },
]);

/**
 * Was ein Kit am Geraet aufrufen kann.
 *
 * Der Bereich (`bereich`) ist der Wert, der in `allowed_endpoints` eines
 * Schluessels stehen muss. Ein Kit sieht damit auf einen Blick, welchen
 * Schluessel es braucht -- und ein Geraet, das einen Bereich noch nicht kennt,
 * nennt ihn hier auch nicht.
 */
const ENDPUNKTE = Object.freeze([
  { verb: 'GET', pfad: '/api/v1/external/contract', bereich: null, was: 'Dieser Kontrakt' },
  {
    verb: 'POST',
    pfad: '/api/v1/external/apps',
    bereich: 'app:deploy',
    was: 'Ein Paket einspielen; rollt IMMER in den Teststand',
  },
  {
    verb: 'POST',
    pfad: '/api/v1/external/apps/:id/schalten',
    bereich: 'app:deploy',
    was: 'Livestand schalten: `{"ziel":"live"}` oder `{"ziel":"zurueck"}`',
  },
  {
    verb: 'GET',
    pfad: '/api/v1/external/apps/:id',
    bereich: 'app:deploy',
    was: 'Was das Geraet ueber diese App weiss, beide Staende',
  },
  {
    verb: 'DELETE',
    pfad: '/api/v1/external/apps/:id?bestaetigung=<id>&dateien=<true|false>',
    bereich: 'app:deploy',
    was: 'App weg: beide Container samt Volumes, beide Staende, alle Freigaben',
  },
  {
    verb: 'POST',
    pfad: '/api/v1/external/llm/chat',
    bereich: 'llm:chat',
    was: 'Sprachmodell fragen',
  },
  {
    verb: 'GET',
    pfad: '/api/v1/external/llm/job/:jobId',
    bereich: 'llm:status',
    was: 'Stand eines Auftrags',
  },
  {
    verb: 'GET',
    pfad: '/api/v1/external/llm/queue',
    bereich: 'llm:status',
    was: 'Die Warteschlange',
  },
  {
    verb: 'GET',
    pfad: '/api/v1/external/models',
    bereich: 'llm:status',
    was: 'Welche Modelle am Geraet sind',
  },
  {
    verb: 'POST',
    pfad: '/api/v1/external/document/extract',
    bereich: 'document:extract',
    was: 'Text aus einer Datei holen',
  },
  {
    verb: 'POST',
    pfad: '/api/v1/external/document/extract-structured',
    bereich: 'document:extract',
    was: 'Text mit Struktur (Seiten, Abschnitte)',
  },
  {
    verb: 'POST',
    pfad: '/api/v1/external/document/analyze',
    bereich: 'document:analyze',
    was: 'Datei holen und vom Modell auswerten lassen',
  },
  {
    verb: 'GET',
    pfad: '/api/v1/external/flows',
    bereich: 'flow:run',
    was: 'Welche Flows dieser Schluessel starten darf. Mit dem Schluessel einer App: NUR ihre eigenen, im Stand ihres Containers',
  },
  {
    verb: 'POST',
    pfad: '/api/v1/external/flows/:name/run',
    bereich: 'flow:run',
    was: 'Einen Flow anstossen. Gesucht wird im Namensraum des Schluessels',
  },
  {
    verb: 'GET',
    pfad: '/api/v1/external/flows/runs/:id',
    bereich: 'flow:run',
    was: 'Der Lauf eines Flows, mit seinen Schritten',
  },
]);

/**
 * Ein Zod-Schema als JSON-Schema, aus Sicht dessen, der es SCHREIBT.
 *
 * `io: 'input'` und nicht `'output'`: das Kit prueft, was ein Mensch in
 * `app.json` tippt, und dort sind Felder mit Vorgabewert optional. Aus der
 * Ausgabesicht waeren sie Pflicht -- ein Kit, das danach prueft, verlangte
 * `ressourcen` in jedem Manifest.
 */
function alsJsonSchema(schema) {
  return z.toJSONSchema(schema, { io: 'input' });
}

/**
 * Der Kontrakt, wie ihn `GET /api/v1/external/contract` ausgibt.
 *
 * Ohne Zeitstempel und ohne Zufall: der Aufrufer soll zwei Antworten
 * vergleichen koennen, und die Pruefung in `__tests__` bildet einen
 * Fingerabdruck daraus. Der Umschlag mit `timestamp` kommt aus der Route,
 * so wie ueberall.
 */
function kontrakt() {
  return {
    kontrakt: KONTRAKT_VERSION,
    arasul: versionFuerAnzeige(),
    app_json: {
      schema: alsJsonSchema(AppManifest),
      regeln: MANIFEST_REGELN,
    },
    flow_frontmatter: {
      // Der YAML-Kopf einer Flow-Datei. `systemPrompt` steht darin NICHT --
      // das ist der Markdown-Rumpf unter dem Kopf, und der Parser setzt ihn
      // ein, bevor er gegen dieses Schema prueft (`services/flows/flowFile.js`).
      schema: alsJsonSchema(FlowDefinition),
      rumpf: 'systemPrompt ist der Markdown-Rumpf unter dem YAML-Kopf, kein Feld im Kopf.',
      // Was fuer einen Flow AUS EINEM PAKET zusaetzlich gilt (C6). Wie die
      // Manifest-Regeln steht es als Satz und nicht als Ausdruck: das Kit soll
      // es einem Menschen zeigen koennen.
      regeln: [
        'Eine Datei je Flow unter `flows.verzeichnis`, Endung `.md`. Der Dateiname IST der Name.',
        'Steht im Kopf ein `name:`, muss er derselbe sein wie der Dateiname.',
        'Das Standardmodell steht im Kopf (`modell:`). Der Administrator am Geraet darf es je Flow ueberschreiben; seine Ueberschreibung liegt in der Datenbank und ueberlebt ein App-Update.',
        '`ordner` ist fuer einen Flow aus einem Paket nicht erlaubt: die Datei-Werkzeuge brauchen einen abgeschirmten Datenordner je App, und den gibt es noch nicht.',
        `Hoechstens ${appFlows.MAX_FLOWS} Flows je Paket.`,
        'Der Namensraum ist die App: zwei Apps duerfen denselben Flow-Namen tragen.',
      ],
    },
    koepfe: {
      benutzer: KOPF_BENUTZER,
      rolle: KOPF_ROLLE,
      rollen: ['admin', 'mitarbeiter'],
      hinweis:
        'Traefik loescht beide aus der eingehenden Anfrage und setzt sie aus der Antwort der ' +
        'Anmeldung neu; sie sind nicht faelschbar. Der Wert steht als UTF-8 in der Kopfzeile: ' +
        "Buffer.from(kopf, 'latin1').toString('utf8').",
    },
    umgebung: {
      ARASUL_API_URL: 'Die externe Schnittstelle im Docker-Netz, ohne Umweg ueber Traefik',
      ARASUL_API_SCHLUESSEL:
        'Der Schluessel dieser App und dieses Standes, bei jedem Einspielen neu',
      hinweis: 'Beides setzt das Geraet in den Container, zusaetzlich zu `backend.umgebung`.',
    },
    paket: {
      format: 'tar.gz',
      packen: 'tar czf paket.tgz -C <ordner> .',
      wurzel: [
        'app.json',
        '<frontend.verzeichnis>/',
        '<backend.bauen.verzeichnis>/',
        '<flows.verzeichnis>/',
      ],
      max_archiv_bytes: appPaket.MAX_ARCHIV_BYTES,
      max_entpackt_bytes: appPaket.MAX_ENTPACKT_BYTES,
      max_eintraege: appPaket.MAX_EINTRAEGE,
      regeln: [
        'app.json liegt im Wurzelverzeichnis des Archivs, nicht in einem Ordner darueber.',
        'Nur Dateien und Ordner. Symlinks, Hardlinks und Geraetedateien weisen das Paket ab.',
        'Mit `backend` braucht das Paket `backend.bauen`: gebaut wird am Geraet, fertige Images nimmt dieser Weg nicht.',
        'Das Frontend ist fertig gebaut. Das Geraet liefert aus, es baut keine Seite.',
        'Ein Deploy rollt immer in den Teststand. Live schaltet ein Mensch.',
        'Eine Version, die gerade live ist, wird nicht ueberschrieben: neue Fassung, neue Nummer.',
        'Mit `flows` im Manifest muss der Ordner da sein und wenigstens eine .md enthalten.',
      ],
    },
    apps: {
      basis: '/apps/<id>/',
      teststand: '/apps/<id>/test/',
      api: '/apps/<id>/api/',
      vergeben: VERGEBENE_PFADE,
      hinweis:
        'Ein Frontend ruft seine Schnittstelle RELATIV auf (fetch("api/hallo")). Ein absoluter ' +
        'Pfad zeigt im Teststand auf den Livestand.',
    },
    schluessel: {
      kopf: 'X-API-Key',
      praefix: 'aras_',
      bereiche: ALLE_ENDPUNKTE,
      vorgabe: VORGABE_ENDPUNKTE,
      hinweis:
        'Der Schluessel des Kits traegt `app:deploy` und wird am Geraet angelegt ' +
        '(scripts/util/kit-schluessel.sh); ein Administrator kann ihn widerrufen.',
    },
    endpunkte: ENDPUNKTE,
  };
}

module.exports = {
  KONTRAKT_VERSION,
  MANIFEST_REGELN,
  ENDPUNKTE,
  VERGEBENE_PFADE,
  kontrakt,
};
