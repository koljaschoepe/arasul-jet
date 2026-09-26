const { z } = require('zod');
const { ALLE_ENDPUNKTE } = require('../config/apiBereiche');

/**
 * Ein Bild fuer ein Bildmodell (J35, 26.09.2026).
 *
 * Base64 wie Ollama es nimmt, wahlweise mit dem Vorsatz einer data:-URL, den
 * das Geraet abschneidet -- ein Browser liefert ihn aus `FileReader` gleich
 * mit, und ihn abzuweisen hiesse, jede App dieselbe Zeile schreiben zu lassen.
 * Nur PNG und JPEG: das sind die Formate, die der Modelldienst am Orin
 * nachweislich liest. Geprueft wird am Anfang der Daten und nicht am Namen --
 * ein Bild hat hier keinen. Die Groesse haengt an der Grenze des Koerpers
 * (`express.json`, 10 MB): mehr als 9 Mio. Zeichen kaemen gar nicht an.
 */
const BILD_MAX_ANZAHL = 4;
const BILD_MAX_ZEICHEN = 9_000_000;
const DATA_URL_VORSATZ = /^data:image\/(png|jpeg|jpg);base64,/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function bildformat(base64) {
  if (base64.startsWith('iVBORw0KGgo')) {
    return 'png';
  }
  if (base64.startsWith('/9j/')) {
    return 'jpeg';
  }
  return null;
}

const Bild = z
  .string()
  .max(BILD_MAX_ZEICHEN, `Ein Bild hat hoechstens ${BILD_MAX_ZEICHEN} Zeichen Base64`)
  .transform(wert => wert.replace(DATA_URL_VORSATZ, '').replace(/\s+/g, ''))
  .refine(wert => wert.length > 0 && BASE64.test(wert), 'Ein Bild ist Base64 (ohne Zeilen)')
  .refine(wert => bildformat(wert) !== null, 'Ein Bild ist PNG oder JPEG');

// POST /llm/chat
const ExternalLlmChatBody = z
  .object({
    prompt: z
      .string({ error: 'prompt is required and must be a string' })
      .min(1, 'prompt is required and must be a string')
      .max(100000),
    model: z.string().max(200).optional().nullable(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().max(32768).optional(),
    thinking: z.boolean().optional(),
    wait_for_result: z.boolean().optional(),
    timeout_seconds: z.number().int().positive().max(600).optional(),
    // Fuer wen die App fragt (J35): der Benutzername aus `X-Arasul-User`. Er
    // steht im Protokoll der Modellaufrufe; die Kopfzeile selbst tut es auch.
    einreicher: z.string().trim().min(1).max(100).optional(),
    // Bilder fuer ein Bildmodell (J35). Mit `images` waehlt das Geraet ein
    // Bildmodell, wenn `model` fehlt, und weist ein Textmodell ab
    // (`services/llm/bildmodell.js`) -- statt das Bild still fallen zu lassen.
    images: z
      .array(Bild)
      .min(1)
      .max(BILD_MAX_ANZAHL, `Hoechstens ${BILD_MAX_ANZAHL} Bilder je Aufruf`)
      .optional(),
  })
  .strict();

// POST /flows/:name/run — einen Flow extern auslösen (Plan 013, B8).
// Argumentwerte kommen als name→Wert (Strings/Zahlen/Booleans, wie im Chat);
// der Runner prüft sie gegen die Deklaration des Flows.
/**
 * Wer die Freigaben eines Laufs entscheiden darf (J35). Steht als eigenes
 * Schema da, weil der Kontrakt es dem Kit zeigt (`kontrakt().freigaben`).
 * `entscheider` nennt entweder `rolle` oder `konten`; dass es genau eines ist
 * und dass es die Konten gibt, prueft der Dienst (`pruefeRegel`).
 */
const FreigabeRegel = z
  .object({
    ohne_einreicher: z.boolean().optional(),
    entscheider: z
      .object({
        rolle: z.enum(['admin']).optional(),
        konten: z.array(z.string().trim().min(1).max(100)).min(1).max(50).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const ExternalFlowRunBody = z
  .object({
    args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    wait_for_result: z.boolean().optional(),
    timeout_seconds: z.number().int().positive().max(1800).optional(),
    // Wer den Lauf ausgeloest hat, und wer seine Freigaben entscheiden darf
    // (J35). Beides setzt die APP, die den Menschen aus `X-Arasul-User` kennt;
    // gegen die Konten am Geraet geprueft wird im Dienst
    // (`freigabeAnfragen.pruefeRegel`), hier nur die Form.
    einreicher: z.string().trim().min(1).max(100).optional(),
    freigabe: FreigabeRegel.optional(),
  })
  .strict();

// POST /api-keys
const CreateApiKeyBody = z
  .object({
    name: z.string({ error: 'name is required' }).trim().min(1, 'name is required').max(200),
    description: z.string().max(2000).optional().nullable(),
    rate_limit_per_minute: z.number().int().positive().max(100000).optional(),
    // Nur Bereiche, die es gibt. Bis Phase C5 stand hier ein freier Text: ein
    // Tippfehler ergab einen Schluessel, der still nichts durfte, und der
    // Administrator suchte den Fehler beim Aufrufer. Seit es mit `app:deploy`
    // einen Bereich gibt, der wirklich etwas kostet, ist Raten hier nicht mehr
    // vertretbar.
    allowed_endpoints: z
      .array(
        z.enum(ALLE_ENDPUNKTE, {
          error: `Unbekannter Bereich. Erlaubt: ${ALLE_ENDPUNKTE.join(', ')}`,
        })
      )
      .max(ALLE_ENDPUNKTE.length)
      .optional(),
    expires_at: z.string().max(50).optional().nullable(),
  })
  .strict();

/**
 * `POST /document/extract-structured` (J35, 26.09.2026): die Felder der
 * Anfrage und die Form der Antwort.
 *
 * Beide stehen hier, weil der Kontrakt sie dem Kit zeigt
 * (`kontrakt().auslesen`) und eine App sonst raten muss, was zurueckkommt --
 * das Kit hat genau das am 25.09.2026 als offene Stelle gemeldet (K21). Die
 * Antwort ist `.strict()`: `externalApi.test.js` prueft die echte Antwort der
 * Route dagegen, und ein Feld, das die Route dazubekommt, faellt dort auf
 * statt im Kontrakt zu fehlen.
 *
 * Die Felder kommen als multipart/form-data, also als Zeichenketten; die Datei
 * steht unter `file` und nicht in diesem Schema.
 */
const ExtractStructuredFelder = z.object({
  schema: z
    .string({ error: 'schema is required, JSON schema describing desired output' })
    .min(1, 'schema is required, JSON schema describing desired output')
    .describe('JSON-Schema der gewuenschten Felder, als JSON-Text'),
  instructions: z.string().optional().describe('Zusaetzliche Anweisung an das Modell'),
  model: z.string().max(200).optional().describe('Modell; ohne Angabe das Standardmodell'),
  timeout_seconds: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .describe('Wartezeit in Sekunden, Vorgabe 300, hoechstens 600'),
  einreicher: z
    .string()
    .max(100)
    .optional()
    .describe('Fuer wen die App fragt; sonst die Kopfzeile X-Arasul-User'),
});

const ExtractStructuredAntwort = z
  .object({
    success: z.literal(true),
    data: z
      .record(z.string(), z.unknown())
      .nullable()
      .describe(
        'Die Felder, die das Modell gefunden hat, als Objekt. NICHT gegen `schema` geprueft; ' +
          'null, wenn die Antwort des Modells kein JSON-Objekt war (dann steht sie in raw_response)'
      ),
    raw_response: z.string().describe('Die Antwort des Modells, wie sie kam'),
    extracted_text: z.string().describe('Der Text, den die Texterkennung gelesen hat'),
    filename: z.string(),
    char_count: z.number().int().describe('Laenge von extracted_text'),
    metadata: z
      .record(z.string(), z.unknown())
      .describe('Was die Texterkennung ueber die Datei weiss, z. B. ocr_used'),
    model: z.string().describe('Das Modell, das geantwortet hat'),
    job_id: z.string().describe('Der Auftrag; derselbe Wert steht im Protokoll des Geraets'),
    processing_time_ms: z.number().int(),
    timestamp: z.string(),
  })
  .strict();

/** Wenn das Modell scheitert: HTTP 500 mit dieser Form (kein Fehler-Umschlag). */
const ExtractStructuredFehlschlag = z
  .object({
    success: z.literal(false),
    error: z.string(),
    job_id: z.string(),
    processing_time_ms: z.number().int(),
    timestamp: z.string(),
  })
  .strict();

module.exports = {
  BILD_MAX_ANZAHL,
  BILD_MAX_ZEICHEN,
  ExternalLlmChatBody,
  ExtractStructuredFelder,
  ExtractStructuredAntwort,
  ExtractStructuredFehlschlag,
  ExternalFlowRunBody,
  FreigabeRegel,
  CreateApiKeyBody,
};
