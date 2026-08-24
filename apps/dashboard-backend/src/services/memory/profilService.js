/**
 * Firmenprofil für den System-Prompt.
 *
 * Herkunft: bis zum 24.08.2026 steckte das hier in `memoryService.js`, zusammen
 * mit dem KI-Gedächtnis. Das Gedächtnis lag in Qdrant, Qdrant ist mit Plan 021
 * Schritt 8 aus dem Produkt geflogen (agentisches RAG statt Vektorsuche), und
 * damit fiel es still aus: `ai_memories` hatte am Tag der Streichung 0 Einträge
 * über die gesamte Laufzeit des Geräts.
 *
 * Das Profil hat damit nie etwas zu tun gehabt. Es liegt als YAML in MinIO, mit
 * der Spalte `system_settings.ai_profile_yaml` als Rückfallebene, und wird von
 * genau zwei Stellen gebraucht: dem Einrichtungsassistenten und
 * `systemPromptBuilder`, der es in jeden System-Prompt einsetzt. Deshalb ist es
 * beim Ausbau nicht mitgegangen, sondern hierher gezogen.
 *
 * Kein Qdrant, kein Embedding, keine Vektorsuche.
 */

const Minio = require('minio');
const { ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const database = require('../../database');
const services = require('../../config/services');

// Ein Profil, das in jeden System-Prompt fließt, darf den Kontext nicht
// auffressen. Zweitausend Bytes sind reichlich für Firma, Branche und ein paar
// Präferenzen.
const MAX_PROFILE_BYTES = parseInt(process.env.MEMORY_MAX_PROFILE_BYTES || '2048');
const PROFIL_BUCKET = 'memory';
const PROFIL_PFAD = 'profiles/default.yaml';

// MinIO-Klient, erst beim ersten Gebrauch
let minioClient = null;

function getMinioClient() {
  if (!minioClient) {
    minioClient = new Minio.Client({
      endPoint: services.minio.host,
      port: services.minio.port,
      useSSL: false,
      accessKey: process.env.MINIO_ROOT_USER,
      secretKey: process.env.MINIO_ROOT_PASSWORD,
    });
  }
  return minioClient;
}

/** Den Eimer anlegen, falls es ihn noch nicht gibt. */
async function ensureBucket() {
  try {
    const client = getMinioClient();
    const exists = await client.bucketExists(PROFIL_BUCKET);
    if (!exists) {
      await client.makeBucket(PROFIL_BUCKET);
      logger.info(`[Profil] MinIO-Eimer '${PROFIL_BUCKET}' angelegt`);
    }
  } catch (err) {
    logger.warn(`[Profil] Eimer nicht sicherstellbar: ${err.message}`);
  }
}

/**
 * Eine Datei aus MinIO lesen.
 * @param {string} path - Objektpfad innerhalb des Profil-Eimers
 * @returns {Promise<string|null>}
 */
async function readFile(path) {
  try {
    const client = getMinioClient();
    const stream = await client.getObject(PROFIL_BUCKET, path);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  } catch (err) {
    if (err.code === 'NoSuchKey' || err.code === 'NotFound') {
      return null;
    }
    logger.debug(`[Profil] readFile(${path}) fehlgeschlagen: ${err.message}`);
    return null;
  }
}

/**
 * Eine Datei nach MinIO schreiben.
 * @param {string} path - Objektpfad innerhalb des Profil-Eimers
 * @param {string} content - Inhalt
 */
async function writeFile(path, content) {
  await ensureBucket();
  const client = getMinioClient();
  await client.putObject(PROFIL_BUCKET, path, Buffer.from(content, 'utf-8'));
}

/**
 * Das Firmenprofil holen.
 * Reihenfolge: MinIO, dann die Spalte in `system_settings`, dann null.
 * @returns {Promise<string|null>}
 */
async function getProfile() {
  const yaml = await readFile(PROFIL_PFAD);
  if (yaml) {
    return yaml;
  }

  try {
    const result = await database.query(`SELECT ai_profile_yaml FROM system_settings WHERE id = 1`);
    if (result.rows.length > 0 && result.rows[0].ai_profile_yaml) {
      return result.rows[0].ai_profile_yaml;
    }
  } catch {
    // Noch kein Profil hinterlegt.
  }
  return null;
}

/**
 * Das Firmenprofil schreiben.
 * @param {string} yamlContent
 */
async function updateProfile(yamlContent) {
  if (Buffer.byteLength(yamlContent, 'utf-8') > MAX_PROFILE_BYTES) {
    throw new ValidationError(
      `Das Profil ist zu groß: höchstens ${MAX_PROFILE_BYTES} Bytes erlaubt.`
    );
  }

  await writeFile(PROFIL_PFAD, yamlContent);

  // Zusätzlich in die Datenbank, als Rückfallebene für den Fall, dass MinIO
  // beim Lesen nicht da ist.
  try {
    await database.query(
      `UPDATE system_settings SET ai_profile_yaml = $1, ai_profile_updated_at = NOW() WHERE id = 1`,
      [yamlContent]
    );
  } catch (err) {
    logger.debug(`[Profil] Konnte Profil nicht in die Datenbank schreiben: ${err.message}`);
  }
}

/**
 * Aus den Angaben des Einrichtungsassistenten ein YAML-Profil bauen.
 * @param {Object} data
 * @returns {string}
 */
function generateProfileYaml({ firma, branche, teamgroesse, produkte, praeferenzen }) {
  const lines = [];
  if (firma) {
    lines.push(`firma: "${firma}"`);
  }
  if (branche) {
    lines.push(`branche: "${branche}"`);
  }
  lines.push(`sprache: "de"`);
  if (teamgroesse) {
    lines.push(`mitarbeiter: ${teamgroesse}`);
  }
  if (produkte && produkte.length > 0) {
    lines.push('produkte:');
    for (const p of produkte) {
      lines.push(`  - ${p}`);
    }
  }
  if (praeferenzen) {
    lines.push('praeferenzen:');
    if (praeferenzen.antwortlaenge) {
      lines.push(`  antwortlaenge: "${praeferenzen.antwortlaenge}"`);
    }
    if (praeferenzen.formalitaet) {
      lines.push(`  formalitaet: "${praeferenzen.formalitaet}"`);
    }
  }
  return lines.join('\n') + '\n';
}

module.exports = {
  getProfile,
  updateProfile,
  generateProfileYaml,
  // für Tests
  readFile,
  writeFile,
  ensureBucket,
};
