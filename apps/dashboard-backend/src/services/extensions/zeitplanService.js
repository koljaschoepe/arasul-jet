/**
 * Zeitgesteuerte Ausführung für Erweiterungen (Plan 023 H1).
 *
 * Eine Erweiterung darf einen Flow zu einer festen Uhrzeit laufen lassen. Das
 * ist der Fall aus dem Plan: nächtliche Abgleiche.
 *
 * WAS LÄUFT, IST EIN FLOW. Nicht Code der Erweiterung: die läuft im Browser,
 * in einem iframe, und nachts ist kein Browser offen. Ein Flow ist Arasuls
 * eigene, prüfbare Ausführungsebene mit einem Werkzeugsatz, der schon
 * abgesichert ist. Eine zweite Ausführungsumgebung für Erweiterungen wäre eine
 * zweite Angriffsfläche für denselben Zweck.
 *
 * KEIN CRON-AUSDRUCK. „HH:MM" in Gerätezeit. Der frühere Cron-Parser für
 * Flow-Zeitpläne ist am 28.07.2026 ersatzlos entfernt worden; ihn für „einmal
 * nachts" zurückzuholen hieße, eine Fehlerquelle für einen Nutzen einzukaufen,
 * den niemand belegt hat. Wer mehr braucht, baut eine Flow-Erweiterung: die
 * wird als n8n-Workflow ausgerollt und aktiviert, und n8ns Schedule-Trigger
 * kann jeden Takt (`flowDeployService.liveSchalten`).
 *
 * WARUM DIESER TAKT KEIN CRON IST: der Prozess prüft jede Minute, welche
 * Zeitpläne fällig sind, und merkt sich den letzten Lauf je Zeitplan in der
 * Datenbank. Ein Neustart um 03:00:30 verpasst deshalb nichts, was um 03:00
 * fällig war, und ein Neustart um 03:05 löst denselben Zeitplan nicht ein
 * zweites Mal aus.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../utils/errors');

/** Höchstzahl Zeitpläne je Erweiterung. */
const MAX_ZEITPLAENE = 10;
/** Wie oft nachgesehen wird, ob etwas fällig ist. */
const TAKT_MS = parseInt(process.env.EXTENSIONS_ZEITPLAN_TAKT_MS || '60000', 10);
/** Wie weit ein verpasster Lauf noch nachgeholt wird. */
const NACHHOLFENSTER_MIN = parseInt(process.env.EXTENSIONS_ZEITPLAN_NACHHOLEN_MIN || '10', 10);

const UHRZEIT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

let takt = null;

/** "HH:MM" prüfen und normalisiert zurückgeben. */
function pruefeUhrzeit(roh) {
  const wert = String(roh || '').trim();
  if (!UHRZEIT_RE.test(wert)) {
    throw new ValidationError(
      `Ungültige Uhrzeit: "${wert}". Erwartet wird "HH:MM" in Gerätezeit, etwa "03:00".`
    );
  }
  return wert;
}

/** Minuten seit Mitternacht aus einem Datum, in Gerätezeit. */
function minutenDesTages(jetzt) {
  return jetzt.getHours() * 60 + jetzt.getMinutes();
}

/** Minuten seit Mitternacht aus "HH:MM". */
function minutenAusUhrzeit(hhmm) {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Ist dieser Zeitplan jetzt fällig?
 *
 * Fällig heißt: die Uhrzeit ist erreicht oder liegt höchstens
 * `NACHHOLFENSTER_MIN` Minuten zurück, UND heute lief er noch nicht.
 *
 * Das Nachholfenster ist der Grund, warum ein Neustart nichts verschluckt: der
 * Takt prüft jede Minute, aber ein Gerät, das um 03:00 gerade neu startet,
 * hätte ohne Fenster genau diesen einen Lauf verloren.
 *
 * @param {{uhrzeit: string, zuletzt_am: Date|string|null}} plan
 * @param {Date} jetzt
 */
function istFaellig(plan, jetzt) {
  const ziel = minutenAusUhrzeit(plan.uhrzeit);
  const jetztMin = minutenDesTages(jetzt);
  const verspaetung = jetztMin - ziel;
  if (verspaetung < 0 || verspaetung > NACHHOLFENSTER_MIN) {
    return false;
  }
  if (!plan.zuletzt_am) {
    return true;
  }
  const zuletzt = new Date(plan.zuletzt_am);
  // Schon heute gelaufen? Dann nicht noch einmal.
  return (
    zuletzt.getFullYear() !== jetzt.getFullYear() ||
    zuletzt.getMonth() !== jetzt.getMonth() ||
    zuletzt.getDate() !== jetzt.getDate()
  );
}

/** Alle Zeitpläne einer Erweiterung. */
async function liste(extensionId, deps = {}) {
  const d = deps.db || db;
  const { rows } = await d.query(
    `SELECT id, flow, uhrzeit, args, aktiv, zuletzt_am, zuletzt_lauf, letzter_fehler
     FROM public.extension_zeitplaene WHERE extension_id = $1 ORDER BY uhrzeit, flow`,
    [extensionId]
  );
  return { zeitplaene: rows };
}

/** Einen Zeitplan anlegen oder seine Argumente überschreiben. */
async function anlegen(extensionId, { flow, uhrzeit, args, userId }, deps = {}) {
  const d = deps.db || db;
  const name = String(flow || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
    throw new ValidationError(`Ungültiger Flow-Name: "${name}"`);
  }
  const zeit = pruefeUhrzeit(uhrzeit);

  const { rows: vorhanden } = await d.query(
    'SELECT COUNT(*)::int AS anzahl FROM public.extension_zeitplaene WHERE extension_id = $1',
    [extensionId]
  );
  if ((vorhanden[0]?.anzahl ?? 0) >= MAX_ZEITPLAENE) {
    throw new ForbiddenError(`Höchstens ${MAX_ZEITPLAENE} Zeitpläne je Erweiterung`);
  }

  // `erstellt_von` ist der Nutzer, unter dem der naechtliche Lauf startet.
  // Ohne ihn scheitert er an `flow_runs.user_id NOT NULL` — siehe Migration 158.
  const { rows } = await d.query(
    `INSERT INTO public.extension_zeitplaene (extension_id, flow, uhrzeit, args, erstellt_von)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (extension_id, flow, uhrzeit)
       DO UPDATE SET args = EXCLUDED.args, aktiv = TRUE,
                     erstellt_von = COALESCE(EXCLUDED.erstellt_von, public.extension_zeitplaene.erstellt_von)
     RETURNING id, flow, uhrzeit, args, aktiv`,
    [extensionId, name, zeit, JSON.stringify(args || {}), userId ?? null]
  );
  logger.info(`Zeitplan gesetzt: ${extensionId} -> ${name} um ${zeit}`);
  return rows[0];
}

/** Einen Zeitplan entfernen. */
async function entfernen(extensionId, { id }, deps = {}) {
  const d = deps.db || db;
  const { rowCount } = await d.query(
    'DELETE FROM public.extension_zeitplaene WHERE extension_id = $1 AND id = $2',
    [extensionId, id]
  );
  if (rowCount === 0) {
    throw new NotFoundError(`Zeitplan ${id} gibt es für diese Erweiterung nicht`);
  }
  return { entfernt: true };
}

/**
 * Einmal nachsehen, was fällig ist, und es starten.
 *
 * Der Lauf wird VOR dem Start vermerkt (`zuletzt_am`), nicht danach. Sonst
 * würde ein Flow, der eine Minute läuft, im nächsten Takt ein zweites Mal
 * gestartet.
 *
 * @returns {Promise<number>} Anzahl gestarteter Läufe
 */
async function taktLauf(deps = {}) {
  const d = deps.db || db;
  const jetzt = deps.jetzt || new Date();
  const starte = deps.flowStarten || (async o => require('./brueckeService').flowStarten(o));

  const { rows } = await d.query(
    `SELECT z.id, z.extension_id, z.flow, z.uhrzeit, z.args, z.zuletzt_am, z.erstellt_von
     FROM public.extension_zeitplaene z
     JOIN arasul.extensions e ON e.id = z.extension_id
     WHERE z.aktiv = TRUE AND e.enabled = TRUE`
  );

  let gestartet = 0;
  for (const plan of rows) {
    if (!istFaellig(plan, jetzt)) {
      continue;
    }
    // Erst vermerken, dann starten.
    await d.query('UPDATE public.extension_zeitplaene SET zuletzt_am = NOW() WHERE id = $1', [
      plan.id,
    ]);
    try {
      const userId = plan.erstellt_von ?? (await rueckfallNutzer(d));
      const lauf = await starte({ name: plan.flow, args: plan.args || {}, userId });
      await d.query(
        'UPDATE public.extension_zeitplaene SET zuletzt_lauf = $2, letzter_fehler = NULL WHERE id = $1',
        [plan.id, lauf?.runId ?? null]
      );
      gestartet += 1;
      logger.info(`Zeitplan gestartet: ${plan.extension_id} -> ${plan.flow} (Lauf ${lauf?.runId})`);
    } catch (err) {
      await d.query('UPDATE public.extension_zeitplaene SET letzter_fehler = $2 WHERE id = $1', [
        plan.id,
        String(err.message || err).slice(0, 500),
      ]);
      logger.warn(`Zeitplan ${plan.extension_id}/${plan.flow} fehlgeschlagen: ${err.message}`);
    }
  }
  return gestartet;
}

/**
 * Wer laeuft, wenn in der Zeile kein Nutzer steht?
 *
 * Zeilen aus der Zeit vor Migration 158 haben keinen. Ohne Rueckfall liefen
 * sie nie wieder, und zwar still. Der aelteste Administrator ist die
 * naheliegende Wahl: nach Entscheidung E1 teilen sich ohnehin alle Nutzer
 * einen Zugang.
 */
async function rueckfallNutzer(d) {
  const { rows } = await d.query(
    "SELECT id FROM public.admin_users WHERE role = 'admin' ORDER BY id LIMIT 1"
  );
  if (!rows[0]) {
    throw new Error('Kein Administrator vorhanden. Ein Zeitplan ohne Nutzer kann nicht starten');
  }
  return rows[0].id;
}

/** Den Takt starten. Idempotent. */
function starte(deps = {}) {
  if (takt) {
    return;
  }
  takt = setInterval(() => {
    taktLauf(deps).catch(err => logger.warn(`Zeitplan-Takt: ${err.message}`));
  }, TAKT_MS);
  takt.unref?.();
  logger.info(`Erweiterungs-Zeitpläne gestartet (Takt: ${TAKT_MS} ms)`);
}

/** Nur für Tests/Shutdown. */
function stoppe() {
  if (takt) {
    clearInterval(takt);
    takt = null;
  }
}

module.exports = {
  liste,
  anlegen,
  entfernen,
  taktLauf,
  starte,
  stoppe,
  istFaellig,
  pruefeUhrzeit,
  MAX_ZEITPLAENE,
  NACHHOLFENSTER_MIN,
};
