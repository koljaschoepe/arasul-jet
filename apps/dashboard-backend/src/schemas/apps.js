const { z } = require('zod');
const { FLOW_NAME_RE } = require('./flows');

/**
 * Das Manifest `app.json`, Fassung 1 (Phase C3 des Umbaus vom 26.08.2026).
 *
 * Eine App ist das, was ein Partner mit dem Ara-Kit baut und auf das Geraet
 * rollt: ein statisches Frontend, das Arasul unter `/apps/<id>/` ausliefert,
 * und ein Backend-Container, den Traefik unter `/apps/<id>/api/` erreicht.
 * `app.json` ist die einzige Beschreibung davon. Es gibt keinen zweiten Ort,
 * an dem steht, wie eine App heisst, welchen Port sie hoert oder wie viel
 * Speicher sie bekommt.
 *
 * Diese Datei ist die Durchsetzung, `docs/features/APPS.md` die Erklaerung.
 * Wer eines von beiden aendert, aendert beides.
 */

/**
 * Die Kennung einer App. Sie steht an vier Stellen, und jede hat ihre eigenen
 * Regeln: im Pfad (`/apps/<id>/`), im Containernamen (`arasul-app-<id>-live`),
 * im Namen des Traefik-Routers (`app-<id>-live`) und im Fremdschluessel der
 * Freigaben. Erlaubt ist deshalb nur, was an ALLEN vier Stellen geht:
 * Kleinbuchstaben, Ziffern, Bindestrich.
 *
 * Bis C3 waren auch Punkt und Unterstrich erlaubt (`schemas/freigaben.js`, C2).
 * Ein Punkt im Namen eines Traefik-Routers trennt dort die Schluesselteile
 * (`traefik.http.routers.<name>.rule`), die Kennung `a.b` haette also einen
 * Router `a` mit einem Feld `b` erzeugt. Ihn beim Bauen des Namens zu ersetzen
 * waere der naheliegende Ausweg und der falsche: `a.b` und `a-b` faenden sich
 * danach unter demselben Router wieder.
 *
 * `test` ist keine gueltige Kennung: der Teststand einer App liegt unter
 * `/apps/<id>/test/`, und eine App namens `test` haette einen Pfad, der zweimal
 * etwas anderes bedeutet.
 */
const AppId = z
  .string({ error: 'App-Kennung fehlt' })
  .trim()
  .min(1, 'App-Kennung fehlt')
  .max(64, 'App-Kennung ist zu lang')
  .regex(
    /^[a-z0-9][a-z0-9-]*$/,
    'App-Kennung: Kleinbuchstaben, Ziffern und Bindestrich; beginnt mit Buchstabe oder Ziffer'
  )
  .refine(v => v !== 'test', 'App-Kennung „test" ist vergeben: /apps/<id>/test/ ist der Teststand');

/** Der Stand, in dem eine Version laeuft. Genau zwei, wie in `app_staende`. */
const Stand = z.enum(['test', 'live'], { error: 'Stand ist „test" oder „live"' });

/**
 * Die Version. Drei Zahlen mit Punkten, optional ein Zusatz. Sie steht im
 * Ordnernamen am Geraet (`/arasul/apps/<id>/<version>/`), also gilt fuer sie
 * dieselbe Vorsicht wie fuer die Kennung: kein Schraegstrich, kein Punkt
 * allein, nichts, was aus dem Ordner herausfuehrt.
 */
const Version = z
  .string({ error: 'Version fehlt' })
  .trim()
  .max(64, 'Version ist zu lang')
  .regex(
    /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/,
    'Version: drei Zahlen mit Punkten, z. B. 1.0.0 oder 1.0.0-rc1'
  );

/** Eine Speichergrenze, wie Docker sie versteht: `512m`, `2g`. */
const Speicher = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?[kmg]$/i, 'Speicher: Zahl mit Einheit k, m oder g, z. B. 512m');

/** Ein Pfad im Paket, relativ und ohne Ausbruch. */
const PaketPfad = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/, 'Pfad: relativ, ohne „..", ohne fuehrenden /')
  .refine(v => !v.split('/').includes('..'), 'Pfad darf nicht aus dem Paket herausfuehren');

const Frontend = z
  .object({
    // Wo im Paket die fertigen Dateien liegen. Ein Build passiert am Geraet
    // nicht: das Kit baut, das Geraet liefert aus.
    verzeichnis: PaketPfad.default('frontend'),
  })
  .strict();

/**
 * Wo im Paket das Dockerfile liegt, aus dem das Geraet baut (Phase C5).
 *
 * Bis C4 musste das Image fertig am Geraet liegen; das Kit baute es dort ueber
 * SSH und `app.json` nannte nur seinen Namen. Der Deploy-Endpunkt nimmt statt
 * dessen ein Paket mit dem Quelltext, und das Geraet baut selbst -- „Paket nur
 * mit Dockerfile, Bau am Geraet, keine Image-Tars" (Entscheidung Kolja vom
 * 27.08.2026).
 *
 * Der Grund ist nicht Bequemlichkeit: ein Image-Tar ist ein fertiges
 * Dateisystem, das niemand mehr liest, bevor es laeuft. Ein Dockerfile mit
 * seinem Kontext ist ein Bauplan, und was daraus wird, entsteht auf dem
 * Geraet, fuer dessen Architektur es gedacht ist -- ein Partner mit einem
 * x86-Laptop kann fuer einen ARM64-Jetson gar kein brauchbares Tar bauen,
 * ohne es zu merken.
 */
const Bauen = z
  .object({
    // Der Ordner im Paket, der als Bau-Kontext an Docker geht.
    verzeichnis: PaketPfad.default('backend'),
    // Das Dockerfile IN diesem Ordner. Relativ dazu, nicht zum Paket: Docker
    // versteht es genauso, und ein Pfad, der aus dem Kontext herausfuehrt,
    // waere ohnehin keiner.
    dockerfile: PaketPfad.default('Dockerfile'),
  })
  .strict();

const Backend = z
  .object({
    // Der Name des Images. Mit `bauen` ist er der Name, unter dem das Geraet
    // das Ergebnis ablegt; ohne `bauen` der Name eines Images, das schon da
    // ist (oder geholt wird). In beiden Faellen steht genau dieser Name im
    // Container -- eine App hat einen Image-Namen, nicht zwei.
    image: z.string().trim().min(1, 'Image fehlt').max(200),
    // Woraus das Geraet dieses Image baut (C5). Ohne die Angabe baut es
    // nichts und erwartet das Image vor.
    bauen: Bauen.optional(),
    // Ein Pfad IM Backend, den der Gesundheitscheck aufruft. Ohne Angabe gilt
    // ein Container als gesund, sobald er laeuft -- das ist Dockers Antwort,
    // nicht unsere.
    gesundheit: z.string().trim().max(200).regex(/^\//, 'Gesundheitspfad beginnt mit /').optional(),
    // Umgebungsvariablen der App. Geheimnisse gehoeren NICHT hierher: das
    // Manifest liegt im Paket und im Kit-Repository des Partners. Den
    // API-Schluessel je App setzt das Geraet beim Deploy (C4).
    umgebung: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string().max(1024)).optional(),
  })
  .strict();

/**
 * Wo im Paket die Flows liegen (Phase C6).
 *
 * Bis C5 war `flows` eine Liste von NAMEN und damit eine Forderung: "diese
 * Flows muessen am Geraet liegen". Das Paket brachte keine mit, und wer eine
 * App ausrollte, baute sie getrennt davon von Hand nach.
 *
 * Jetzt ist es ein Verzeichnis, genau wie `frontend` -- eine Lieferung. Die
 * Dateien darin sind Markdown mit YAML-Kopf (`services/flows/flowFile.js`),
 * eine je Flow, der Dateiname ist der Name. Das Geraet registriert sie beim
 * Einspielen je App und Stand; der Namensraum ist die App.
 *
 * Das Standardmodell steht im Kopf jeder Flow-Datei (`modell:`). Der
 * Administrator am Geraet darf es ueberschreiben, und seine Ueberschreibung
 * liegt in `flow_settings` und NICHT in der Datei -- sonst waere sie beim
 * naechsten Update weg (Entscheidung Kolja vom 27.08.2026).
 */
const Flows = z
  .object({
    verzeichnis: PaketPfad.default('flows'),
  })
  .strict();

const Ressourcen = z
  .object({
    speicher: Speicher.default('512m'),
    cpus: z.coerce.number().positive().max(64).default(1),
  })
  .strict();

/**
 * Das Manifest selbst.
 *
 * `.strict()`: ein unbekanntes Feld ist ein Tippfehler oder eine Erwartung an
 * eine Fassung, die es noch nicht gibt. Beides still zu schlucken hiesse, dem
 * Partner zu bestaetigen, dass etwas wirkt, das nichts tut.
 */
const AppManifest = z
  .object({
    schema: z.literal(1, { error: 'Nur `"schema": 1` wird verstanden' }),
    id: AppId,
    name: z.string({ error: 'Name fehlt' }).trim().min(1, 'Name fehlt').max(120),
    version: Version,
    beschreibung: z.string().trim().max(500).optional(),
    frontend: Frontend.optional(),
    backend: Backend.optional(),
    // Der Port, auf dem das App-Backend IM Container lauscht. Nach aussen gibt
    // es ihn nicht: erreichbar ist die App unter `/apps/<id>/api/`, sonst
    // nirgends. Ein Port am Host waere eine zweite Tuer neben Traefik.
    ports: z
      .object({ backend: z.coerce.number().int().min(1).max(65535) })
      .strict()
      .optional(),
    // `prefault` statt `default`: `default` legt den Wert UNGEPRUEFT ab, das
    // leere Objekt bliebe also leer und die Grenzen fehlten. `prefault`
    // schickt es durch `Ressourcen` und damit durch dessen Vorgaben.
    ressourcen: Ressourcen.prefault({}),
    // Welche Sprachmodelle die App braucht. Das Geraet installiert sie nicht
    // nach; es sagt beim Einspielen, welches fehlt.
    modelle: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
    // Die Flows, die die App MITBRINGT (C6). Anders als `modelle` ist das
    // eine Lieferung: die Dateien liegen im Paket und werden beim Einspielen
    // je App und Stand registriert (`services/app/appFlows.js`).
    flows: Flows.optional(),
  })
  .strict()
  .refine(m => m.frontend || m.backend, {
    message: 'Eine App ohne Frontend und ohne Backend ist nichts: mindestens eines von beiden',
    path: ['frontend'],
  })
  .refine(m => !m.backend || m.ports?.backend, {
    message: 'Mit `backend` braucht es `ports.backend`: sonst weiss Traefik nicht, wohin',
    path: ['ports'],
  })
  .refine(m => !m.ports || m.backend, {
    message: '`ports` ohne `backend`: es gibt nichts, was auf diesem Port lauscht',
    path: ['ports'],
  });

// --- Routen -----------------------------------------------------------------

const AppParams = z.object({ id: AppId });

const EinspielenBody = z
  .object({
    version: Version,
    stand: Stand.default('test'),
  })
  .strict();

/**
 * Wohin der Schalter zeigt (Phase C5).
 *
 * `live` nimmt die Version aus dem Teststand und macht sie zur Livestand-
 * Version. `zurueck` holt die Version, die vorher live war
 * (`app_staende.vorige_version`, Migration 172).
 *
 * Beides ist derselbe Vorgang -- „welche Version ist ab jetzt live" -- und
 * deshalb ein Endpunkt und nicht zwei. Zwei waeren zwei Stellen, an denen die
 * Buchfuehrung ueber die vorige Version steht, und die eine wuerde die andere
 * eines Tages vergessen.
 */
const SchaltenBody = z
  .object({ ziel: z.enum(['live', 'zurueck'], { error: 'Ziel ist „live" oder „zurueck"' }) })
  .strict();

/**
 * Die Rueckfrage vor dem Entfernen (Phase C5).
 *
 * Ein `DELETE`, das ein `curl` aus Versehen ausloest, nimmt beide Container
 * mitsamt ihren Volumes -- also alles, was die App je gespeichert hat. Die
 * Rueckfrage einer Schnittstelle ist kein Dialog, sondern ein Wort, das der
 * Aufrufer abtippen muss: die Kennung der App selbst. Wer sie hinschreibt, hat
 * gelesen, was er loescht.
 *
 * `dateien` nimmt zusaetzlich die Ordner unter `/arasul/apps/<id>/`. Ohne die
 * Angabe bleiben sie liegen, so wie es C3 fuer die Sitzungsroute entschieden
 * hat; der Deploy-Endpunkt hat sie aber selbst dorthin gelegt, und ein Kit,
 * das aus der Ferne einspielen kann, muss auch aus der Ferne aufraeumen
 * koennen.
 */
const EntfernenQuery = z
  .object({
    bestaetigung: z.string().trim().min(1, 'Rueckfrage: die Kennung der App als `bestaetigung`'),
    dateien: z
      .enum(['true', 'false'])
      .default('false')
      .transform(v => v === 'true'),
  })
  .strict();

/**
 * Ein Flow einer App: Kennung plus Flow-Name (Phase C6).
 *
 * Der Name gehorcht derselben Regel wie jeder Flow-Name am Geraet
 * (`schemas/flows.js`, `FLOW_NAME_RE`) -- er ist im Paket ein Dateiname
 * gewesen und hier ein Pfadstueck.
 */
const AppFlowParams = z.object({
  id: AppId,
  name: z
    .string()
    .trim()
    .regex(FLOW_NAME_RE, 'Flow-Name: Kleinbuchstaben, Ziffern und Bindestriche'),
});

/**
 * Das Modell, mit dem ein Flow auf DIESEM Geraet laufen soll (Phase C6, um
 * das externe Modell erweitert in D4).
 *
 * ZWEI ARME, EINE ENTSCHEIDUNG. Die Frage lautet "welches Modell treibt diesen
 * Flow", und sie hat drei Antworten:
 *
 *   {"modell": "gemma4:e4b"}   eines vom Geraet, aus der Kurzliste (C8)
 *   {"modell": null}           keines -- es gilt wieder das Paket
 *   {"extern": {...}}          eines bei einem Anbieter draussen
 *
 * Ein Weg und nicht zwei, weil die drei einander ausschliessen: ein Flow
 * laeuft auf EINEM Modell. Zwei Endpunkte nebeneinander liessen offen, was
 * gilt, wenn beide beschickt wurden, und die Antwort darauf stuende dann im
 * Service statt im Vertrag.
 *
 * `null` und nicht `.optional()`: „das Feld fehlt" und „setz es auf nichts"
 * muessen sich unterscheiden lassen, sonst gaebe es keinen Weg zurueck.
 */
const ExternesModell = z
  .object({
    /** Der Name des Anbieters, wie ihn ein Mensch liest ("OpenAI", "Azure"). */
    anbieter: z.string().trim().min(1, 'Anbieter fehlt').max(60),
    /** Der Name des Modells BEIM ANBIETER, nicht am Geraet. */
    modell: z.string().trim().min(1, 'Modellname fehlt').max(120),
    /**
     * Die OpenAI-kompatible Basis-Adresse OHNE `/chat/completions`, z. B.
     * `https://api.openai.com/v1`. Keine Anbieter-Liste im Code: ein Kunde
     * waehlt sein eigenes Gateway an, und eine gepflegte Liste waere am Tag
     * ihres Schreibens veraltet (dieselbe Regel wie in
     * `services/llm/extern/providerRegistry.js`).
     */
    basis_url: z
      .string()
      .trim()
      .min(1, 'Basis-Adresse fehlt')
      .max(300)
      .regex(/^https?:\/\//i, 'Die Basis-Adresse beginnt mit http:// oder https://'),
    /**
     * Der Schluessel im Klartext -- einmal, auf dem Weg hinein. Er wird
     * verschluesselt abgelegt und kommt nie wieder heraus (`flow_settings`).
     * FEHLT ER, bleibt ein hinterlegter stehen: wer nur den Modellnamen
     * aendert, soll ihn nicht erneut abtippen muessen, und er kann es auch
     * nicht -- er sieht ihn nirgends.
     */
    schluessel: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

const FlowModellBody = z.union(
  [
    z.object({ modell: z.string().trim().max(100).nullable() }).strict(),
    z.object({ extern: ExternesModell }).strict(),
  ],
  {
    // Zod meldet fuer eine Vereinigung nur „Invalid input" und haengt die
    // Fehler beider Arme daran. Der Fehlerbehandler nimmt den ERSTEN Befund
    // (`middleware/validate.js`, `summarizeIssues`), und der lautete damit
    // „expected string, received undefined" -- eine Auskunft ueber den einen
    // Arm, nicht ueber die Frage. Hier steht sie ganz.
    error:
      'Erwartet wird {"modell": "<name>"}, {"modell": null} (zurueck zum Paket) ' +
      'oder {"extern": {anbieter, modell, basis_url, schluessel?}}. Beides zugleich gibt es nicht.',
  }
);

/**
 * Die Laeufe einer App: welcher Stand, welcher Flow, wie viele (Phase D4).
 *
 * OHNE Vorgabe fuer `stand`, im Unterschied zu `LogsQuery`. Ein Container hat
 * je Stand einen eigenen Logstrom, ein Lauf dagegen ist Geschichte: die Frage
 * "was hat diese App getan" meint zuerst beide Staende, und wer nur den einen
 * sucht, sagt es.
 */
const LaeufeQuery = z
  .object({
    stand: Stand.optional(),
    flow: z
      .string()
      .trim()
      .regex(FLOW_NAME_RE, 'Flow-Name: Kleinbuchstaben, Ziffern und Bindestriche')
      .optional(),
    status: z
      .enum(['laeuft', 'wartend', 'fertig', 'fehler', 'abgebrochen', 'abgelaufen'])
      .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

/** Ein Lauf einer App. Die Nummer kommt aus der Adresse, also als Text. */
const AppLaufParams = z.object({
  id: AppId,
  runId: z.coerce.number().int().positive('Lauf-Nummer ist eine positive Zahl'),
});

/**
 * Die Rohdaten der Schritte mitliefern? (Phase D4, wie `?raw=1` bei den Laeufen
 * der Plattform.) Sie koennen je Subagent einige Dutzend Kilobyte sein.
 */
const LaufQuery = z
  .object({
    raw: z
      .enum(['0', '1', 'true', 'false'])
      .default('0')
      .transform(v => v === '1' || v === 'true'),
  })
  .strict();

/**
 * Welche Fassung eines Flows gelesen werden soll (Phase D4).
 *
 * Vorgabe `live`, wie bei den Logs: der Livestand ist die Fassung, die gilt.
 * Wer den Teststand meint, sagt es -- er ist die Ausnahme, nicht der Normalfall.
 */
const FlowQuery = z.object({ stand: Stand.default('live') }).strict();

const LogsQuery = z
  .object({
    stand: Stand.default('live'),
    zeilen: z.coerce.number().int().min(1).max(2000).default(200),
  })
  .strict();

/**
 * Der Stand, fuer den die Forward-Auth fragt (Phase C4).
 *
 * Ohne Angabe der Livestand. Die Frage stellt Traefik, und zwar aus dem
 * Etikett des Containers heraus (`services/app/appContainer.js`), also mit
 * einem festen `?stand=`; die Vorgabe deckt den Aufruf von Hand ab.
 *
 * OHNE `.strict()`, als einziges Schema in dieser Datei. Das Manifest weist
 * ein unbekanntes Feld ab, weil dahinter ein Mensch mit einem Tippfehler
 * steht. Hier steht ein Proxy: sollte Traefik eines Tages die Suchparameter
 * der urspruenglichen Anfrage anhaengen (heute tut es das nicht, sie stehen
 * in `X-Forwarded-Uri`), waere ein 400 die Antwort auf JEDEN Aufruf an JEDE
 * App, die ihre Schnittstelle mit einem Parameter aufruft. Zod verwirft
 * Unbekanntes hier still; der Wert von `stand` wird geprueft wie ueberall.
 */
const ZugangQuery = z.object({ stand: Stand.default('live') });

module.exports = {
  AppId,
  Stand,
  Version,
  AppManifest,
  AppParams,
  AppFlowParams,
  AppLaufParams,
  FlowModellBody,
  FlowQuery,
  LaeufeQuery,
  LaufQuery,
  EinspielenBody,
  SchaltenBody,
  EntfernenQuery,
  LogsQuery,
  ZugangQuery,
};
