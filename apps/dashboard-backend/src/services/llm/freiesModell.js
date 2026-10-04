/**
 * Jedes offene Modell laden (Auftrag modelle-frei-herunterladbar, J4).
 *
 * Seit Phase C8 (27.08.2026) nahm `POST /api/models/download` nur die vier
 * Kennungen der Kurzliste. Kunden und Partner wollen waehlen, und Kolja hat am
 * 26.09.2026 entschieden: komplett offen. Die Umkehr gilt fuer den KATALOG,
 * nicht fuer die Vorgabe -- der Standard bleibt ein gemessenes Modell, und
 * alles, was nicht in `config/modelle/kurzliste.json` steht, traegt die
 * Kennzeichnung "ungemessen" (`jetson_tested = false`).
 *
 * Was dieser Dienst tut, in der Reihenfolge, in der es geschieht:
 *
 *   1. Kennung lesen: Ollama-Bibliothek (`name:tag`, `nutzer/name:tag`) oder
 *      Hugging Face (`hf.co/nutzer/repo:quant`). Anderes gibt es nicht.
 *   2. Bekannt? Dann ist es ein Katalogeintrag und geht den alten Weg.
 *   3. Unbekannt: das Manifest bei der Registry holen und die Groesse aus den
 *      Schichten rechnen. Ohne Groesse kein Laden -- ein Modell, dessen
 *      Gewicht niemand kennt, laesst sich nicht gegen das Budget pruefen, und
 *      "gibt es nicht" ist eine bessere Antwort als ein Pull, der nach zehn
 *      Minuten mit EOF endet.
 *   4. Gegen das Speicherbudget des Geraets halten (`RAM_LIMIT_LLM`, in den
 *      Plattformprofilen `memory_budget_gb`) und MIT GRUND abweisen.
 *   5. Erst dann die Zeile im Katalog anlegen (`frei_geladen`, Migration 190).
 *
 * DIGEST. Die Kurzliste traegt je Modell den Digest, und die Installation
 * prueft ihn nach dem Holen (J35, `scripts/util/modell-holen.sh`). Fuer ein
 * frei gewaehltes Modell gibt es keinen Sollwert, den ein Mensch vorab
 * festgelegt haette. Der Dienst schaltet die Pruefung deshalb nicht still ab,
 * sondern sagt es: die Antwort nennt `digest_vorab: false`, und der Digest,
 * den die Registry im Manifest meldet, steht im Protokoll. Was ein Modell
 * nach dem Laden wirklich ist, steht in `/api/tags`.
 *
 * ENGINE. Auf dem Spark laeuft vllm, dessen Kennungen nicht die von Ollama
 * sind. Hier wird nichts dafuer verbaut: die Kennung ist eine Ollama-Kennung,
 * und der Weg dahinter (`modelService.downloadModel`) ist der einzige Ort, der
 * die Engine kennt.
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const database = require('../../database');
const { getLlmRamGB } = require('../../utils/hardware');
const { tagVarianten } = require('./modelSyncHelpers');
const { ValidationError, NotFoundError, ServiceUnavailableError } = require('../../utils/errors');

const MANIFEST_ACCEPT = [
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
].join(', ');
const MANIFEST_FRIST_MS = 15000;
const GB = 1000 * 1000 * 1000;

// Ein Modell braucht im Speicher mehr als seine Gewichte: Kontext (KV-Cache)
// und Rechenpuffer. 15 % ist die Faustzahl, die auch die Kurzliste traegt
// (Standardmodell: 15,7 GB Gewichte, 22 GB im Speicher steht dort vorsichtiger;
// hier wird nicht dramatischer gerechnet als noetig, weil ein zu strenges Nein
// genau der Absage gleicht, die diese Karte abschafft).
const SPEICHER_AUFSCHLAG = 1.15;

/**
 * Wo liegt die Kennung, und unter welcher Adresse steht ihr Manifest?
 * @param {string} kennung
 * @returns {{quelle: 'ollama'|'huggingface', manifestUrl: string, anzeige: string}}
 */
function kennungLesen(kennung) {
  const hf = kennung.match(/^(?:hf\.co|huggingface\.co)\/([^/:]+)\/([^/:]+)(?::([^/:]+))?$/i);
  if (hf) {
    const [, nutzer, repo, quant] = hf;
    return {
      quelle: 'huggingface',
      manifestUrl: `https://hf.co/v2/${nutzer}/${repo}/manifests/${quant || 'latest'}`,
      anzeige: repo,
    };
  }
  if (/^(?:hf\.co|huggingface\.co)\//i.test(kennung)) {
    throw new ValidationError(
      'Hugging-Face-Kennungen haben die Form hf.co/<Nutzer>/<Repository>[:<Quantisierung>].'
    );
  }

  const ollama = kennung.match(
    /^(?:([a-z0-9][a-z0-9._-]*)\/)?([a-z0-9][a-z0-9._-]*)(?::([\w.-]+))?$/i
  );
  if (!ollama) {
    throw new ValidationError(
      'Die Kennung passt weder zur Ollama-Bibliothek (name:tag) noch zu Hugging Face (hf.co/nutzer/repo:quant).'
    );
  }
  const [, nutzer, name, tag] = ollama;
  return {
    quelle: 'ollama',
    manifestUrl: `https://registry.ollama.ai/v2/${nutzer || 'library'}/${name}/manifests/${tag || 'latest'}`,
    anzeige: name,
  };
}

/**
 * Die Groesse aus dem Manifest der Registry: Summe aus Konfiguration und
 * Schichten. Fragt nichts ab, was nicht zum Laden gehoert.
 * @returns {Promise<{bytes: number, digest: string|null}>}
 */
async function manifestLesen(kennung, lesen) {
  let antwort;
  try {
    antwort = await axios.get(lesen.manifestUrl, {
      headers: { Accept: MANIFEST_ACCEPT },
      timeout: MANIFEST_FRIST_MS,
      maxRedirects: 5,
    });
  } catch (err) {
    if (err.response?.status === 404) {
      throw new NotFoundError(
        `Das Modell "${kennung}" gibt es in ${lesen.quelle === 'ollama' ? 'der Ollama-Bibliothek' : 'Hugging Face'} nicht. Bitte Name und Tag prüfen.`
      );
    }
    logger.warn(`[ModellFrei] Manifest für ${kennung} nicht lesbar: ${err.message}`);
    throw new ServiceUnavailableError(
      `Die Größe von "${kennung}" ließ sich nicht ermitteln, weil die Registry nicht antwortet. Bitte die Internetverbindung des Geräts prüfen und es noch einmal versuchen.`
    );
  }

  const manifest = antwort.data;
  const schichten = Array.isArray(manifest?.layers) ? manifest.layers : [];
  const bytes =
    (Number(manifest?.config?.size) || 0) +
    schichten.reduce((summe, s) => summe + (Number(s.size) || 0), 0);
  if (!bytes) {
    throw new NotFoundError(
      `Zu "${kennung}" nennt die Registry keine Gewichte. Das ist kein ladbares Modell.`
    );
  }
  return { bytes, digest: antwort.headers?.['docker-content-digest'] || null };
}

/**
 * Passt das Modell in das Speicherbudget dieses Geraets? Wirft mit Grund.
 *
 * Das Budget ist `RAM_LIMIT_LLM` (gesetzt aus `memory_budget_gb` des
 * Plattformprofils), abzueglich des Sicherheitspuffers, den auch
 * `GET /api/models/memory-budget` abzieht.
 */
function budgetPruefen(kennung, bytes) {
  const budgetGb = getLlmRamGB();
  const pufferGb = parseInt(process.env.MODEL_MEMORY_SAFETY_BUFFER_MB || '2048', 10) / 1024;
  const nutzbarGb = Math.max(0, budgetGb - pufferGb);
  const gewichteGb = bytes / GB;
  const benoetigtGb = gewichteGb * SPEICHER_AUFSCHLAG;

  if (benoetigtGb > nutzbarGb) {
    throw new ValidationError(
      `„${kennung}" ist zu groß für dieses Gerät: es braucht im Speicher rund ${benoetigtGb.toFixed(1)} GB, für KI sind ${nutzbarGb.toFixed(1)} GB nutzbar. Bitte ein kleineres Modell oder eine stärkere Quantisierung (zum Beispiel q4) wählen.`,
      {
        grund: 'ZU_GROSS',
        kennung,
        groesse_gb: Number(gewichteGb.toFixed(1)),
        benoetigt_gb: Number(benoetigtGb.toFixed(1)),
        memory_budget_gb: budgetGb,
        verfuegbar_gb: Number(nutzbarGb.toFixed(1)),
      }
    );
  }
  return { benoetigtGb, budgetGb };
}

// Dieselbe Reserve wie `modelDownloadHelpers.validateDiskSpace`: was die
// Vorpruefung durchlaesst, darf der Download nicht danach ablehnen.
const PLATTE_AUFSCHLAG = 1.5;

/**
 * Reicht die Platte? Wirft mit Grund, in zwei Saetzen.
 */
async function plattePruefen(kennung, bytes) {
  const { free } = await require('./modelService').getDiskSpace();
  const benoetigt = Math.floor(bytes * PLATTE_AUFSCHLAG);
  if (free < benoetigt) {
    throw new ValidationError(
      `„${kennung}" braucht beim Laden rund ${(benoetigt / GB).toFixed(1)} GB Platz, auf der Platte des Geräts sind ${(free / GB).toFixed(1)} GB frei. Bitte erst Platz schaffen, zum Beispiel ein nicht benutztes Modell entfernen.`,
      {
        grund: 'PLATTE_VOLL',
        kennung,
        benoetigt_gb: Number((benoetigt / GB).toFixed(1)),
        frei_gb: Number((free / GB).toFixed(1)),
      }
    );
  }
}

/**
 * Nur aus dem Namen ist wenig zu lesen, und was gelesen wird, steht als
 * Vermutung im Katalog, nicht als Fakt: `ungemessen` heisst genau das. Zwei
 * Aufgaben lassen sich vom Namen sicher ablesen, und beide entscheiden, ob das
 * Modell als Standard der Flows taugt (nein) -- eine falsch geratene "text"
 * waere der schlimmere Fehler.
 */
function aufgabeAusName(kennung) {
  const k = kennung.toLowerCase();
  if (/embed|bge-|minilm|e5-|gte-/.test(k)) {
    return 'embedding';
  }
  if (/llava|moondream|minicpm-v|-vl\b|-vl:|vision/.test(k)) {
    return 'vision';
  }
  return 'text';
}

function kategorie(gb) {
  if (gb < 4) {
    return 'small';
  }
  if (gb < 12) {
    return 'medium';
  }
  if (gb < 40) {
    return 'large';
  }
  return 'xlarge';
}

/** Der Anzeigename: Name ohne Tag, ohne Namensraum, lesbar. */
function anzeigeName(kennung, lesen) {
  const tag = kennung.includes(':') ? kennung.split(':').pop() : null;
  const name = lesen.anzeige.replace(/[-_]/g, ' ');
  return tag && tag !== 'latest' ? `${name} (${tag})` : name;
}

/**
 * Die Katalogzeile zu einer Kennung, wenn es sie schon gibt. Ollama behandelt
 * `name` und `name:latest` als dasselbe; ohne diese Sicht entstuende neben
 * `llava-phi3` eine zweite Zeile fuer `llava-phi3:latest` (Migration 141 hat
 * aus genau diesem Grund aufgeraeumt).
 */
async function imKatalog(kennung) {
  const varianten = tagVarianten(kennung);
  const { rows } = await database.query(
    `SELECT id FROM llm_model_catalog
      WHERE id = ANY($1) OR COALESCE(ollama_name, id) = ANY($1)
      ORDER BY (id = $2) DESC
      LIMIT 1`,
    [varianten, kennung]
  );
  return rows[0]?.id ?? null;
}

/**
 * Passt das Modell auf dieses Geraet? Legt nichts an und laedt nichts; die
 * Antwort ist ein Ergebnis, keine Ausnahme, damit die Oberflaeche es neben
 * dem Modell zeigen kann. Eine Kennung, die es nicht gibt, oder eine Registry,
 * die nicht antwortet, wirft wie bei `vorbereiten`.
 *
 * @returns {Promise<{passt: boolean, grund: string|null, groesse_bytes: number, details?: object}>}
 */
async function pruefe(kennung) {
  const bekannt = await imKatalog(kennung);
  let bytes;
  if (bekannt) {
    const { rows } = await database.query(
      'SELECT size_bytes FROM llm_model_catalog WHERE id = $1',
      [bekannt]
    );
    bytes = Number(rows[0]?.size_bytes) || 0;
  } else {
    ({ bytes } = await manifestLesen(kennung, kennungLesen(kennung)));
  }
  if (!bytes) {
    return { passt: true, grund: null, groesse_bytes: 0 };
  }
  try {
    budgetPruefen(kennung, bytes);
    await plattePruefen(kennung, bytes);
  } catch (err) {
    if (err instanceof ValidationError) {
      return { passt: false, grund: err.message, groesse_bytes: bytes, details: err.details };
    }
    throw err;
  }
  return { passt: true, grund: null, groesse_bytes: bytes };
}

/**
 * Macht eine Kennung ladbar: gibt die Katalog-Kennung zurueck, unter der
 * `modelService.downloadModel` sie laden kann. Fuer eine bekannte Kennung ist
 * das sie selbst, ohne Netz und ohne Pruefung -- die Kurzliste ist gemessen.
 *
 * @param {string} kennung
 * @returns {Promise<{modelId: string, neu: boolean, gemessen: boolean, groesseBytes?: number, digestVorab: boolean}>}
 */
async function vorbereiten(kennung) {
  const bekannt = await imKatalog(kennung);
  if (bekannt) {
    const { rows } = await database.query(
      `SELECT c.jetson_tested, c.frei_geladen, c.size_bytes, c.ram_required_gb,
              COALESCE(i.status, '') AS status
         FROM llm_model_catalog c
         LEFT JOIN llm_installed_models i ON i.id = c.id
        WHERE c.id = $1`,
      [bekannt]
    );
    // Ein Modell, das noch nicht am Geraet liegt, wird vor dem Laden gegen
    // Speicher und Platte gehalten, auch eines der geprueften Liste: gemessen
    // heisst nicht, dass es auf DIESES Geraet passt.
    if (rows[0].status !== 'available' && Number(rows[0].size_bytes) > 0) {
      budgetPruefen(bekannt, Number(rows[0].size_bytes));
      await plattePruefen(bekannt, Number(rows[0].size_bytes));
    }
    return {
      modelId: bekannt,
      neu: false,
      gemessen: rows[0].jetson_tested === true && rows[0].frei_geladen !== true,
      // Nur die Kurzliste hat einen Sollwert (`kurzliste.json`).
      digestVorab: rows[0].frei_geladen !== true,
    };
  }

  const lesen = kennungLesen(kennung);
  const { bytes, digest } = await manifestLesen(kennung, lesen);
  const { benoetigtGb } = budgetPruefen(kennung, bytes);
  await plattePruefen(kennung, bytes);

  const aufgabe = aufgabeAusName(kennung);
  const name = anzeigeName(kennung, lesen);
  await database.query(
    `INSERT INTO llm_model_catalog (
        id, name, description, ollama_name, size_bytes, ram_required_gb,
        category, capabilities, recommended_for, model_type, task,
        is_task_default, speed_tier, supports_thinking, supports_vision_input,
        jetson_tested, performance_tier, ollama_library_url, frei_geladen
     ) VALUES (
        $1, $2, $3, $1, $4, $5, $6, $7::jsonb, '[]'::jsonb, $8, $9,
        false, $10, false, $11, false, 2, $12, true
     )
     ON CONFLICT (id) DO NOTHING`,
    [
      kennung,
      name,
      'Frei geladenes Modell, auf diesem Gerät ungemessen. Es läuft, aber niemand hat geprüft, wie gut und wie schnell.',
      bytes,
      Math.max(1, Math.ceil(benoetigtGb)),
      kategorie(bytes / GB),
      JSON.stringify(aufgabe === 'embedding' ? ['embedding'] : []),
      aufgabe === 'embedding' ? 'embedding' : aufgabe === 'vision' ? 'vision' : 'llm',
      aufgabe,
      aufgabe === 'embedding' ? 'embed' : aufgabe === 'vision' ? 'vision' : 'balanced',
      aufgabe === 'vision',
      lesen.quelle === 'huggingface'
        ? `https://huggingface.co/${kennung.replace(/^(?:hf\.co|huggingface\.co)\//i, '').split(':')[0]}`
        : `https://ollama.com/library/${lesen.anzeige}`,
    ]
  );
  logger.info(
    `[ModellFrei] ${kennung} in den Katalog aufgenommen (ungemessen, ${(bytes / GB).toFixed(1)} GB, Manifest-Digest ${digest || 'unbekannt'})`
  );

  return { modelId: kennung, neu: true, gemessen: false, groesseBytes: bytes, digestVorab: false };
}

/**
 * Nach dem Entfernen: eine frei geladene Zeile geht mit. Die vier der
 * Kurzliste bleiben im Katalog, auch ohne Gewicht.
 */
async function nachEntfernen(modelId) {
  const { rowCount } = await database.query(
    'DELETE FROM llm_model_catalog WHERE id = $1 AND frei_geladen = true',
    [modelId]
  );
  return rowCount > 0;
}

/**
 * Nach einem Fehlschlag: war die Zeile erst fuer diesen Versuch entstanden,
 * geht sie samt der Fehlerzeile in `llm_installed_models` wieder weg, damit
 * ein Tippfehler in der Kennung nicht im Katalog stehen bleibt.
 */
async function nachFehlschlag(modelId) {
  await database.query(
    `DELETE FROM llm_installed_models
      WHERE id = $1 AND status <> 'available'
        AND EXISTS (SELECT 1 FROM llm_model_catalog WHERE id = $1 AND frei_geladen = true)`,
    [modelId]
  );
  await database.query(
    `DELETE FROM llm_model_catalog
      WHERE id = $1 AND frei_geladen = true
        AND NOT EXISTS (SELECT 1 FROM llm_installed_models WHERE id = $1)`,
    [modelId]
  );
}

module.exports = {
  vorbereiten,
  pruefe,
  nachEntfernen,
  nachFehlschlag,
  kennungLesen,
  budgetPruefen,
  plattePruefen,
  aufgabeAusName,
  SPEICHER_AUFSCHLAG,
};
