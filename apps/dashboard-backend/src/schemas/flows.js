/**
 * Zod-Schemas für Flows (Plan 011).
 *
 * Ein Flow ist eine Markdown-Datei mit YAML-Kopfdaten unter `data/flows/`.
 * Dieses Schema ist die EINZIGE Wahrheit darüber, was ein gültiger Flow ist —
 * es greift an beiden Enden: beim Schreiben über die API (ein kaputter Flow
 * kann gar nicht erst gespeichert werden) und beim Laden von der Platte (eine
 * von Hand editierte Datei kann den Runner nicht in undefiniertes Verhalten
 * schicken). Genau deshalb liegt es hier und nicht im Parser.
 */

const { z } = require('zod');

// Werkzeuge, die ein Flow deklarieren darf. Muss zu services/flows/tools/*
// passen — ein Name, den die Registry nicht kennt, ist ein Schreibfehler und
// wird abgewiesen, statt zur Laufzeit still zu fehlen.
const VALID_TOOLS = [
  'dateien_lesen',
  'dateien_schreiben',
  'dateien_bearbeiten',
  'dateien_anhaengen',
  'dateien_suchen',
  'rag_suche',
  'web_suche',
  'web_lesen',
  'terminal',
  'subagent',
];

// Argumenttypen. Jeder Typ entspricht einer eigenen Eingabehilfe im Chat und —
// wichtiger — einer anderen Art, Kontext zu beschaffen: `datei` lädt genau eine
// Datei, `wissensbasis` scopet die RAG-Suche auf genau eine Sammlung. Das ist
// der Hebel für Kontext-Sparsamkeit (§3 des Plans).
const ARG_TYPES = ['freitext', 'datei', 'auswahl', 'wissensbasis'];

// Flow- und Argumentnamen sind bewusst eng: Kleinbuchstaben, Ziffern, Bindestrich.
// Der Flow-Name wird zum Dateinamen UND zum Slash-Befehl — alles andere wäre
// entweder ein Pfad-Risiko oder im Chat nicht tippbar.
const FLOW_NAME_RE = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$|^[a-z0-9]$/;
const ARG_NAME_RE = /^[a-z][a-z0-9_]{0,30}$/;

const FlowName = z
  .string()
  .trim()
  .regex(
    FLOW_NAME_RE,
    'Flow-Name darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten, ' +
      'muss mit Buchstabe oder Ziffer beginnen und enden (1–50 Zeichen)'
  );

const FlowArgument = z
  .object({
    name: z
      .string()
      .trim()
      .regex(ARG_NAME_RE, 'Argumentname: Kleinbuchstaben, Ziffern, Unterstrich'),
    typ: z.enum(ARG_TYPES),
    beschreibung: z.string().trim().max(200).default(''),
    pflicht: z.coerce.boolean().default(false),
    // Nur für typ=auswahl: die erlaubten Werte.
    optionen: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    standard: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((arg, ctx) => {
    if (arg.typ === 'auswahl') {
      if (!arg.optionen || arg.optionen.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['optionen'],
          message: `Argument "${arg.name}": typ=auswahl braucht eine nicht-leere Liste "optionen"`,
        });
      } else if (arg.standard != null && !arg.optionen.includes(arg.standard)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['standard'],
          message: `Argument "${arg.name}": "standard" muss einer der Werte aus "optionen" sein`,
        });
      }
    } else if (arg.optionen != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['optionen'],
        message: `Argument "${arg.name}": "optionen" ist nur bei typ=auswahl erlaubt`,
      });
    }
    // Ein Pflichtargument mit Standardwert ist ein Widerspruch: der Standard
    // würde die Pflicht stillschweigend erfüllen.
    if (arg.pflicht && arg.standard != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['standard'],
        message: `Argument "${arg.name}": pflicht=true und "standard" schließen sich aus`,
      });
    }
  });

/**
 * Der Ergebnis-Vertrag einer Subagent-Rolle — das Herzstück der
 * Kontext-Sparsamkeit (§3). Die Rolle MUSS genau diese Felder liefern, und die
 * Antwort wird hart auf `max_zeichen` gekappt, bevor sie den Orchestrator
 * erreicht. Rohdaten (Seiteninhalte, Dateitexte) landen nur im Lauf-Protokoll.
 */
const ResultContract = z
  .object({
    felder: z
      .array(
        z.string().trim().regex(ARG_NAME_RE, 'Feldname: Kleinbuchstaben, Ziffern, Unterstrich')
      )
      .min(1, 'Ein Ergebnis-Vertrag braucht mindestens ein Feld')
      .max(10),
    max_zeichen: z.coerce.number().int().min(100).max(20000).default(2000),
  })
  .strict();

const SubagentRole = z
  .object({
    name: z.string().trim().regex(ARG_NAME_RE, 'Rollenname: Kleinbuchstaben, Ziffern, Unterstrich'),
    beschreibung: z.string().trim().max(300).default(''),
    // Ohne eigenes Modell erbt die Rolle das Modell des Flows.
    modell: z.string().trim().max(100).optional(),
    werkzeuge: z.array(z.enum(VALID_TOOLS)).max(VALID_TOOLS.length).default([]),
    ergebnis: ResultContract,
    prompt: z.string().trim().min(1, 'Eine Rolle braucht einen Prompt').max(20000),
  })
  .strict();

/**
 * Ein deklarativer Schritt (Plan 013, B7). Macht die Orchestrierung
 * DETERMINISTISCH: statt dass das Orchestrator-Modell entscheidet, wann es an
 * welche Rolle delegiert, gibt der Flow die Reihenfolge fest vor. Zwei Arten:
 *
 *   - `subagent`: delegiert an eine deklarierte `rolle` mit einem `auftrag`
 *     (Vorlage mit {{argument}} UND {{schrittname}} für die Ausgaben früherer
 *     Schritte). Innerhalb des Schritts darf das Rollen-Modell iterieren.
 *   - `werkzeug`: ruft EIN Werkzeug direkt mit `parameter` auf (kein Modell) —
 *     für rein mechanische Schritte.
 *
 * `iterationen` wiederholt den Schritt bis zu N-mal und reicht die vorige
 * Ausgabe als {{vorher}} hinein (bewusst ein Zähler, nicht ein Modell-Urteil:
 * minimalistisch und vorhersagbar). Voreinstellung 1.
 *
 * `wiederhole_ueber` (Harness v2, 2026-07-30) macht den Schritt zur Schleife
 * ÜBER EINE LISTE: der genannte Platzhalter (Argument oder Ausgabe eines
 * früheren Schritts) wird als Liste gelesen (JSON-Array oder eine Zeile je
 * Eintrag), und der Schritt läuft einmal je Element — mit {{element}},
 * {{index}} und {{anzahl}} im Scope. DAS ist der Baustein für
 * Langdokument-Pipelines: Schritt 1 erzeugt die Gliederung, Schritt 2 läuft
 * über jede Sektion und hängt sie per dateien_anhaengen an. Schließt
 * `iterationen` > 1 aus.
 *
 * `modell` überschreibt für DIESEN Schritt das Flow-Modell (z. B. das
 * Qualitätsmodell nur für den Architektur-Schritt).
 */
const FlowStep = z
  .object({
    name: z
      .string()
      .trim()
      .regex(ARG_NAME_RE, 'Schrittname: Kleinbuchstaben, Ziffern, Unterstrich, max. 31 Zeichen'),
    typ: z.enum(['subagent', 'werkzeug']),
    // subagent-Schritt:
    rolle: z.string().trim().max(60).optional(),
    auftrag: z.string().trim().max(4000).optional(),
    // werkzeug-Schritt:
    werkzeug: z.enum(VALID_TOOLS).optional(),
    parameter: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .default({})
      .optional(),
    iterationen: z.coerce.number().int().min(1).max(10).default(1),
    wiederhole_ueber: z
      .string()
      .trim()
      .regex(ARG_NAME_RE, 'wiederhole_ueber: Name eines Arguments oder früheren Schritts')
      .optional(),
    modell: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .superRefine((step, ctx) => {
    if (step.typ === 'subagent') {
      if (!step.rolle) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rolle'],
          message: `Schritt "${step.name}" (subagent) braucht eine "rolle"`,
        });
      }
      if (!step.auftrag) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['auftrag'],
          message: `Schritt "${step.name}" (subagent) braucht einen "auftrag"`,
        });
      }
    } else if (step.typ === 'werkzeug') {
      if (!step.werkzeug) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['werkzeug'],
          message: `Schritt "${step.name}" (werkzeug) braucht ein "werkzeug"`,
        });
      }
      if (step.werkzeug === 'subagent') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['werkzeug'],
          message: `Schritt "${step.name}": "subagent" ist kein direktes Werkzeug — nutze typ "subagent" mit einer Rolle`,
        });
      }
    }
    if (step.wiederhole_ueber && step.iterationen > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['iterationen'],
        message: `Schritt "${step.name}": "wiederhole_ueber" und "iterationen" > 1 schließen sich aus`,
      });
    }
  });

/**
 * Notbremsen (§7). Die Voreinstellungen sind bewusst konservativ: eine
 * sequenzielle GPU macht aus 20 Modell-Aufrufen schon Minuten. Je Flow
 * hochsetzbar, wenn man es bewusst will.
 */
const FlowLimitsShape = z
  .object({
    // Gesamtzahl der Subagent-Aufrufe ÜBER ALLE EBENEN — nicht pro Ebene.
    // Bei zwei erlaubten Ebenen wäre ein Pro-Ebene-Zähler multiplikativ.
    max_aufrufe: z.coerce.number().int().min(1).max(200).default(20),
    zeitlimit_s: z.coerce.number().int().min(10).max(7200).default(900),
    werkzeug_runden: z.coerce.number().int().min(1).max(50).default(10),
    // Wie tief Subagent-Rollen sich gegenseitig aufrufen dürfen (Orchestrator =
    // Ebene 0). Früher hart auf 2 im Runner verdrahtet — jetzt pro Flow
    // einstellbar, damit komplexe Flows tiefer verschachteln können. Obergrenze
    // bewusst niedrig: die GPU arbeitet sequenziell, jede Ebene multipliziert die
    // Laufzeit.
    max_tiefe: z.coerce.number().int().min(1).max(5).default(2),
  })
  .strict();

// Fuer die Flow-Definition: fehlende Grenzen fallen auf die Voreinstellungen.
// `.prefault` statt `.default`: in Zod 4 reicht `.default({})` das leere Objekt
// UNVERÄNDERT durch, die Feld-Voreinstellungen blieben also aus und die
// Notbremsen wären zur Laufzeit `undefined`. `.prefault` parst den Vorgabewert
// durch das Schema und setzt damit die Voreinstellungen.
//
// In den API-Bodies wird BEWUSST `FlowLimitsShape` (ohne prefault) verwendet:
// dort muss "nicht mitgeschickt" auch wirklich "nicht gesetzt" bedeuten, sonst
// ueberschreibt ein PUT ohne `grenzen` die gespeicherten Werte mit den
// Voreinstellungen.
const FlowLimits = FlowLimitsShape.prefault({});

/**
 * Der vollständige, normalisierte Flow. `systemPrompt` kommt aus dem
 * Markdown-Rumpf, nicht aus den Kopfdaten.
 */
const FlowDefinition = z
  .object({
    name: FlowName,
    beschreibung: z.string().trim().max(300).default(''),
    modell: z.string().trim().max(100).optional(),
    argumente: z.array(FlowArgument).max(10).default([]),
    // Erlaubte Ordner. Der ERSTE ist das Arbeitsverzeichnis (§8).
    ordner: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
    werkzeuge: z.array(z.enum(VALID_TOOLS)).max(VALID_TOOLS.length).default([]),
    rollen: z.array(SubagentRole).max(10).default([]),
    // B7: optionale deterministische Schritt-Kette. Leer → der Flow läuft
    // modellgetrieben wie bisher (voll rückwärtskompatibel). Gefüllt → der
    // Executor führt die Schritte in fester Reihenfolge aus, dann synthetisiert
    // der Rumpf-Prompt die Antwort aus ihren Ausgaben.
    schritte: z.array(FlowStep).max(20).default([]),
    grenzen: FlowLimits,
    systemPrompt: z.string().trim().min(1, 'Ein Flow braucht einen Prompt (Markdown-Rumpf)'),
  })
  .strict()
  .superRefine((flow, ctx) => {
    // Doppelte Argumentnamen — sonst überschreibt die Platzhalter-Ersetzung
    // still den einen mit dem anderen.
    const argNames = flow.argumente.map(a => a.name);
    const dupArg = argNames.find((n, i) => argNames.indexOf(n) !== i);
    if (dupArg) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['argumente'],
        message: `Argument "${dupArg}" ist doppelt vergeben`,
      });
    }

    const roleNames = flow.rollen.map(r => r.name);
    const dupRole = roleNames.find((n, i) => roleNames.indexOf(n) !== i);
    if (dupRole) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rollen'],
        message: `Rolle "${dupRole}" ist doppelt vergeben`,
      });
    }

    // Rollen ohne das subagent-Werkzeug sind unerreichbar — das ist fast immer
    // ein Versehen und würde sonst erst zur Laufzeit als "passiert nichts" auffallen.
    if (flow.rollen.length > 0 && !flow.werkzeuge.includes('subagent')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['werkzeuge'],
        message:
          'Der Flow deklariert Rollen, aber nicht das Werkzeug "subagent" — die Rollen wären nicht aufrufbar',
      });
    }

    // Umgekehrt: subagent ohne Rollen ist ein Werkzeug ins Leere.
    if (flow.werkzeuge.includes('subagent') && flow.rollen.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rollen'],
        message: 'Der Flow hat das Werkzeug "subagent", aber keine Rollen definiert',
      });
    }

    // Eine Rolle darf nicht mehr dürfen als der Flow selbst — sonst wäre die
    // Werkzeug-Freigabe des Flows umgehbar, indem man sie an eine Rolle delegiert.
    for (const role of flow.rollen) {
      for (const tool of role.werkzeuge) {
        if (!flow.werkzeuge.includes(tool)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rollen'],
            message: `Rolle "${role.name}" verlangt das Werkzeug "${tool}", das der Flow selbst nicht hat`,
          });
        }
      }
    }

    // Dateizugriff ohne erlaubten Ordner ist wirkungslos — lieber beim Speichern
    // sagen als den Nutzer rätseln lassen, warum der Flow nichts findet.
    const needsFolder = [
      'dateien_lesen',
      'dateien_schreiben',
      'dateien_bearbeiten',
      'dateien_anhaengen',
      'dateien_suchen',
      'terminal',
    ];
    const usesFiles = flow.werkzeuge.some(t => needsFolder.includes(t));
    if (usesFiles && flow.ordner.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ordner'],
        message:
          'Der Flow nutzt Datei- oder Terminal-Werkzeuge, hat aber keinen erlaubten Ordner ("ordner")',
      });
    }

    // B7: Schritt-Kette gegen den Rest des Flows prüfen.
    const stepNames = flow.schritte.map(s => s.name);
    const dupStep = stepNames.find((n, i) => stepNames.indexOf(n) !== i);
    if (dupStep) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schritte'],
        message: `Schritt "${dupStep}" ist doppelt vergeben`,
      });
    }
    for (const [stepIndex, step] of flow.schritte.entries()) {
      if (step.wiederhole_ueber) {
        // Die Listen-Quelle muss zur Laufzeit existieren: ein Argument oder die
        // Ausgabe eines FRÜHEREN Schritts. Ein Tippfehler fällt sonst erst im
        // Lauf als leere Liste auf.
        const argNames = flow.argumente.map(a => a.name);
        const fruehere = flow.schritte.slice(0, stepIndex).map(s => s.name);
        if (
          !argNames.includes(step.wiederhole_ueber) &&
          !fruehere.includes(step.wiederhole_ueber)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['schritte'],
            message: `Schritt "${step.name}": "wiederhole_ueber" nennt "${step.wiederhole_ueber}" — weder ein Argument noch ein früherer Schritt`,
          });
        }
      }
      if (step.typ === 'subagent') {
        // Ein subagent-Schritt braucht das Werkzeug UND die Rolle.
        if (!flow.werkzeuge.includes('subagent')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['werkzeuge'],
            message: `Schritt "${step.name}" delegiert an eine Rolle, aber der Flow hat das Werkzeug "subagent" nicht`,
          });
        }
        if (step.rolle && !roleNames.includes(step.rolle)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['schritte'],
            message: `Schritt "${step.name}" nennt die Rolle "${step.rolle}", die nicht deklariert ist`,
          });
        }
      } else if (step.typ === 'werkzeug') {
        // Ein direkter Werkzeug-Schritt darf nur ein vom Flow freigegebenes
        // Werkzeug nutzen — dieselbe Freigabe-Grenze wie bei den Rollen.
        if (step.werkzeug && !flow.werkzeuge.includes(step.werkzeug)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['schritte'],
            message: `Schritt "${step.name}" nutzt das Werkzeug "${step.werkzeug}", das der Flow selbst nicht hat`,
          });
        }
      }
    }
  });

/** Body zum Anlegen/Ändern eines Flows über die API (ohne den Namen aus der URL). */
const SaveFlowBody = z
  .object({
    beschreibung: z.string().trim().max(300).optional(),
    modell: z.string().trim().max(100).optional(),
    argumente: z.array(FlowArgument).max(10).optional(),
    ordner: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
    werkzeuge: z.array(z.enum(VALID_TOOLS)).max(VALID_TOOLS.length).optional(),
    rollen: z.array(SubagentRole).max(10).optional(),
    schritte: z.array(FlowStep).max(20).optional(),
    grenzen: FlowLimitsShape.optional(),
    prompt: z.string().trim().min(1).max(50000),
  })
  .strict();

/** Beim Anlegen kommt der Name im Body dazu. */
const CreateFlowBody = SaveFlowBody.extend({ name: FlowName });

/**
 * Body der Laufzeit-Vorschau (Plan 012, Schritt 11): derselbe Flow-Body wie
 * beim Anlegen, plus optionale Beispiel-Argumente. Fehlen sie, füllt der Runner
 * sichtbare Platzhalter ein — die Vorschau soll auch ohne Angaben etwas zeigen.
 */
const RuntimePreviewBody = CreateFlowBody.extend({
  args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

/** `:name` in der URL. */
const FlowNameParams = z.object({ name: FlowName }).strict();

/** `:id` eines Laufs in der URL (Plan 011, Schritt 9). */
const RunIdParams = z.object({ id: z.coerce.number().int().positive() }).strict();

/**
 * Body von POST /flows/laeufe/:id/wiederholen („Ab Fehler wiederholen",
 * 2026-07-29). Bewusst leer und `.strict()`: Der Lauf bestimmt Flow und
 * Argumente selbst — ein Body-Feld hier wäre ein Missverständnis des Aufrufers
 * und soll als 400 auffallen, nicht still ignoriert werden.
 */
const WiederholenBody = z.object({}).strict();

/**
 * Ziel-Ordner eines Laufs (Ziel-Ordner-Konzept, 2026-07-28). Erlaubt sind NUR
 * `projekt://`-Formen — `projekt://aktiv[/unter/ordner]` oder
 * `projekt://<uuid>[/unter/ordner]` — damit ein Aufrufer (insbesondere per
 * API-Key von außen) keine beliebigen Gerätepfade als Arbeitsverzeichnis
 * öffnen kann. Die Auflösung in echte Pfade macht runFlow.resolveOrdnerListe.
 */
const ProjektOrdnerZiel = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    v =>
      v.startsWith('projekt://') &&
      !v.slice('projekt://'.length).split('/').includes('..') &&
      !v.slice('projekt://'.length).startsWith('/'),
    {
      message:
        'Ziel-Ordner muss die Form projekt://aktiv[/pfad] oder projekt://<uuid>[/pfad] haben',
    }
  );

/** Einen Lauf starten (Plan 011, Schritt 12). */
const StartRunBody = z
  .object({
    flow: FlowName,
    // Argumentwerte als name→Wert. Werte kommen als Strings aus dem Chat; der
    // Runner prüft sie gegen die Deklaration des Flows.
    args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
    conversation_id: z.coerce.number().int().positive().nullish(),
    // Ziel-Ordner des Laufs: wird zum Arbeitsverzeichnis (Enddateien landen
    // dort). NUR projekt://-Formen — nie rohe Gerätepfade von außen.
    ordner_ziel: ProjektOrdnerZiel.optional(),
  })
  .strict();

/** Query der Lauf-Liste. */
const ListRunsQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    conversation_id: z.coerce.number().int().positive().optional(),
    // Optionaler Status-Filter, z. B. `?status=laeuft` für die „laufende Flows"-
    // Anzeige im Chat (Plan 013, B8).
    status: z.enum(['laeuft', 'fertig', 'fehler', 'abgebrochen']).optional(),
    // Optionaler Flow-Filter — die Flow-Zentrale zeigt „Letzte Läufe" EINES
    // Flows, statt client-seitig aus der Gesamtliste zu sieben.
    flow: FlowName.optional(),
  })
  .strict();

module.exports = {
  FlowDefinition,
  FlowArgument,
  FlowName,
  FlowStep,
  SubagentRole,
  ResultContract,
  FlowLimits,
  FlowLimitsShape,
  SaveFlowBody,
  CreateFlowBody,
  RuntimePreviewBody,
  FlowNameParams,
  RunIdParams,
  WiederholenBody,
  ListRunsQuery,
  StartRunBody,
  ProjektOrdnerZiel,
  VALID_TOOLS,
  ARG_TYPES,
  FLOW_NAME_RE,
};
