const { z } = require('zod');

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

const Backend = z
  .object({
    // Ein Image, kein Dockerfile: gebaut wird im Kit oder in C5, hier laeuft
    // nur, was schon ein Image ist.
    image: z.string().trim().min(1, 'Image fehlt').max(200),
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
    // Welche Flows die App mitbringt. Ausgeliefert werden sie mit dem Paket
    // (C5); hier stehen ihre Namen, damit das Geraet sagen kann, welcher fehlt.
    flows: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
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

const LogsQuery = z
  .object({
    stand: Stand.default('live'),
    zeilen: z.coerce.number().int().min(1).max(2000).default(200),
  })
  .strict();

module.exports = {
  AppId,
  Stand,
  Version,
  AppManifest,
  AppParams,
  EinspielenBody,
  LogsQuery,
};
