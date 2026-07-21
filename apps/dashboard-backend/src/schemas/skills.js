/**
 * Zod-Schemas für Skills (Plan 011).
 *
 * Ein Skill ist eine Markdown-Datei mit YAML-Kopfdaten unter `data/skills/`.
 * Dieses Schema ist die EINZIGE Wahrheit darüber, was ein gültiger Skill ist —
 * es greift an beiden Enden: beim Schreiben über die API (ein kaputter Skill
 * kann gar nicht erst gespeichert werden) und beim Laden von der Platte (eine
 * von Hand editierte Datei kann den Runner nicht in undefiniertes Verhalten
 * schicken). Genau deshalb liegt es hier und nicht im Parser.
 */

const { z } = require('zod');

// Werkzeuge, die ein Skill deklarieren darf. Muss zu services/skills/tools/*
// passen — ein Name, den die Registry nicht kennt, ist ein Schreibfehler und
// wird abgewiesen, statt zur Laufzeit still zu fehlen.
const VALID_TOOLS = [
  'dateien_lesen',
  'dateien_schreiben',
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

// Skill- und Argumentnamen sind bewusst eng: Kleinbuchstaben, Ziffern, Bindestrich.
// Der Skill-Name wird zum Dateinamen UND zum Slash-Befehl — alles andere wäre
// entweder ein Pfad-Risiko oder im Chat nicht tippbar.
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$|^[a-z0-9]$/;
const ARG_NAME_RE = /^[a-z][a-z0-9_]{0,30}$/;

const SkillName = z
  .string()
  .trim()
  .regex(
    SKILL_NAME_RE,
    'Skill-Name darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten, ' +
      'muss mit Buchstabe oder Ziffer beginnen und enden (1–50 Zeichen)'
  );

const SkillArgument = z
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
    // Ohne eigenes Modell erbt die Rolle das Modell des Skills.
    modell: z.string().trim().max(100).optional(),
    werkzeuge: z.array(z.enum(VALID_TOOLS)).max(VALID_TOOLS.length).default([]),
    ergebnis: ResultContract,
    prompt: z.string().trim().min(1, 'Eine Rolle braucht einen Prompt').max(20000),
  })
  .strict();

/**
 * Notbremsen (§7). Die Voreinstellungen sind bewusst konservativ: eine
 * sequenzielle GPU macht aus 20 Modell-Aufrufen schon Minuten. Je Skill
 * hochsetzbar, wenn man es bewusst will.
 */
const SkillLimitsShape = z
  .object({
    // Gesamtzahl der Subagent-Aufrufe ÜBER ALLE EBENEN — nicht pro Ebene.
    // Bei zwei erlaubten Ebenen wäre ein Pro-Ebene-Zähler multiplikativ.
    max_aufrufe: z.coerce.number().int().min(1).max(200).default(20),
    zeitlimit_s: z.coerce.number().int().min(10).max(7200).default(900),
    werkzeug_runden: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

// Fuer die Skill-Definition: fehlende Grenzen fallen auf die Voreinstellungen.
// `.prefault` statt `.default`: in Zod 4 reicht `.default({})` das leere Objekt
// UNVERÄNDERT durch, die Feld-Voreinstellungen blieben also aus und die
// Notbremsen wären zur Laufzeit `undefined`. `.prefault` parst den Vorgabewert
// durch das Schema und setzt damit die Voreinstellungen.
//
// In den API-Bodies wird BEWUSST `SkillLimitsShape` (ohne prefault) verwendet:
// dort muss "nicht mitgeschickt" auch wirklich "nicht gesetzt" bedeuten, sonst
// ueberschreibt ein PUT ohne `grenzen` die gespeicherten Werte mit den
// Voreinstellungen.
const SkillLimits = SkillLimitsShape.prefault({});

/**
 * Der vollständige, normalisierte Skill. `systemPrompt` kommt aus dem
 * Markdown-Rumpf, nicht aus den Kopfdaten.
 */
const SkillDefinition = z
  .object({
    name: SkillName,
    beschreibung: z.string().trim().max(300).default(''),
    modell: z.string().trim().max(100).optional(),
    argumente: z.array(SkillArgument).max(10).default([]),
    // Erlaubte Ordner. Der ERSTE ist das Arbeitsverzeichnis (§8).
    ordner: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
    werkzeuge: z.array(z.enum(VALID_TOOLS)).max(VALID_TOOLS.length).default([]),
    rollen: z.array(SubagentRole).max(10).default([]),
    grenzen: SkillLimits,
    systemPrompt: z.string().trim().min(1, 'Ein Skill braucht einen Prompt (Markdown-Rumpf)'),
  })
  .strict()
  .superRefine((skill, ctx) => {
    // Doppelte Argumentnamen — sonst überschreibt die Platzhalter-Ersetzung
    // still den einen mit dem anderen.
    const argNames = skill.argumente.map(a => a.name);
    const dupArg = argNames.find((n, i) => argNames.indexOf(n) !== i);
    if (dupArg) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['argumente'],
        message: `Argument "${dupArg}" ist doppelt vergeben`,
      });
    }

    const roleNames = skill.rollen.map(r => r.name);
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
    if (skill.rollen.length > 0 && !skill.werkzeuge.includes('subagent')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['werkzeuge'],
        message:
          'Der Skill deklariert Rollen, aber nicht das Werkzeug "subagent" — die Rollen wären nicht aufrufbar',
      });
    }

    // Umgekehrt: subagent ohne Rollen ist ein Werkzeug ins Leere.
    if (skill.werkzeuge.includes('subagent') && skill.rollen.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rollen'],
        message: 'Der Skill hat das Werkzeug "subagent", aber keine Rollen definiert',
      });
    }

    // Eine Rolle darf nicht mehr dürfen als der Skill selbst — sonst wäre die
    // Werkzeug-Freigabe des Skills umgehbar, indem man sie an eine Rolle delegiert.
    for (const role of skill.rollen) {
      for (const tool of role.werkzeuge) {
        if (!skill.werkzeuge.includes(tool)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rollen'],
            message: `Rolle "${role.name}" verlangt das Werkzeug "${tool}", das der Skill selbst nicht hat`,
          });
        }
      }
    }

    // Dateizugriff ohne erlaubten Ordner ist wirkungslos — lieber beim Speichern
    // sagen als den Nutzer rätseln lassen, warum der Skill nichts findet.
    const needsFolder = ['dateien_lesen', 'dateien_schreiben', 'terminal'];
    const usesFiles = skill.werkzeuge.some(t => needsFolder.includes(t));
    if (usesFiles && skill.ordner.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ordner'],
        message:
          'Der Skill nutzt Datei- oder Terminal-Werkzeuge, hat aber keinen erlaubten Ordner ("ordner")',
      });
    }
  });

/** Body zum Anlegen/Ändern eines Skills über die API (ohne den Namen aus der URL). */
const SaveSkillBody = z
  .object({
    beschreibung: z.string().trim().max(300).optional(),
    modell: z.string().trim().max(100).optional(),
    argumente: z.array(SkillArgument).max(10).optional(),
    ordner: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
    werkzeuge: z.array(z.enum(VALID_TOOLS)).max(VALID_TOOLS.length).optional(),
    rollen: z.array(SubagentRole).max(10).optional(),
    grenzen: SkillLimitsShape.optional(),
    prompt: z.string().trim().min(1).max(50000),
  })
  .strict();

/** Beim Anlegen kommt der Name im Body dazu. */
const CreateSkillBody = SaveSkillBody.extend({ name: SkillName });

/** `:name` in der URL. */
const SkillNameParams = z.object({ name: SkillName }).strict();

module.exports = {
  SkillDefinition,
  SkillArgument,
  SubagentRole,
  ResultContract,
  SkillLimits,
  SkillLimitsShape,
  SaveSkillBody,
  CreateSkillBody,
  SkillNameParams,
  VALID_TOOLS,
  ARG_TYPES,
  SKILL_NAME_RE,
};
