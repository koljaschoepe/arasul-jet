/**
 * Provider-Keys-Service (Plan 010, Schritt 1)
 *
 * Verwaltet die Admin-global hinterlegten API-Keys externer Modell-Provider
 * (openai, anthropic) VERSCHLÜSSELT in der DB (Tabelle flow_provider_keys,
 * Migration 110). Gleiches AES-256-GCM-Muster wie externalCredentialsService
 * (Plan 008): der Blob (IV || AuthTag || Ciphertext) landet als BYTEA, der
 * Schlüssel wird aus JWT_SECRET abgeleitet (utils/tokenCrypto.js).
 *
 * Sicherheit: Der entschlüsselte Key wird NIE geloggt und verlässt den Service
 * nur über getDecryptedKey() an einen vertrauenswürdigen Aufrufer (die
 * Provider-Registry). Die öffentliche Listen-Ansicht (listProviders) gibt
 * ausschließlich Metadaten zurück — nie den Key selbst.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { encryptToken, decryptToken } = require('../../utils/tokenCrypto');
const { ValidationError, ServiceUnavailableError } = require('../../utils/errors');

// Provider, die überhaupt einen Key brauchen (ollama = lokal, braucht keinen).
const KEYED_PROVIDERS = Object.freeze(['openai', 'anthropic']);

function assertKeyedProvider(provider) {
  if (!KEYED_PROVIDERS.includes(provider)) {
    throw new ValidationError(
      `Provider "${provider}" kennt keine API-Keys (erlaubt: ${KEYED_PROVIDERS.join(', ')})`
    );
  }
}

/**
 * Alle konfigurierten Provider auflisten — nur Metadaten, nie der Key.
 * @returns {Promise<Array<{provider, baseUrl, createdAt, updatedAt}>>}
 */
async function listProviders() {
  const result = await db.query(
    `SELECT provider, base_url, created_at, updated_at
       FROM flow_provider_keys
      ORDER BY provider ASC`
  );
  return result.rows.map(r => ({
    provider: r.provider,
    baseUrl: r.base_url || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Ist für den Provider ein Key hinterlegt?
 * @param {string} provider
 * @returns {Promise<boolean>}
 */
async function hasKey(provider) {
  if (!provider) {
    return false;
  }
  const result = await db.query(`SELECT 1 FROM flow_provider_keys WHERE provider = $1 LIMIT 1`, [
    provider,
  ]);
  return result.rows.length > 0;
}

/**
 * API-Key eines Providers anlegen/rotieren (Upsert). Nur Admin (Route-Guard).
 * @param {string} provider
 * @param {{apiKey:string, baseUrl?:string}} params
 * @param {number|null} createdBy - admin_users.id des Ausführenden
 * @returns {Promise<{provider, baseUrl, updatedAt}>}
 */
async function saveKey(provider, params, createdBy = null) {
  assertKeyedProvider(provider);
  const apiKey = params && typeof params.apiKey === 'string' ? params.apiKey.trim() : '';
  if (!apiKey) {
    throw new ValidationError('apiKey ist erforderlich');
  }
  const baseUrl = params.baseUrl ? String(params.baseUrl).trim() : null;
  const encrypted = encryptToken(apiKey);

  const result = await db.query(
    `INSERT INTO flow_provider_keys (provider, base_url, encrypted_key, created_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (provider)
     DO UPDATE SET base_url = EXCLUDED.base_url,
                   encrypted_key = EXCLUDED.encrypted_key,
                   updated_at = NOW()
     RETURNING provider, base_url, updated_at`,
    [provider, baseUrl, encrypted, createdBy]
  );
  return {
    provider: result.rows[0].provider,
    baseUrl: result.rows[0].base_url || null,
    updatedAt: result.rows[0].updated_at,
  };
}

/**
 * Entschlüsselten Key + Basis-URL für die Provider-Registry laden.
 * NUR für vertrauenswürdige Backend-Aufrufer (Runner/Engine) — nie an Clients.
 * @param {string} provider
 * @returns {Promise<{apiKey:string, baseUrl:string|null}|null>}
 */
async function getDecryptedKey(provider) {
  if (!provider) {
    return null;
  }
  const result = await db.query(
    `SELECT base_url, encrypted_key FROM flow_provider_keys WHERE provider = $1 LIMIT 1`,
    [provider]
  );
  const row = result.rows[0];
  if (!row || !row.encrypted_key) {
    return null;
  }
  const buf = Buffer.isBuffer(row.encrypted_key)
    ? row.encrypted_key
    : Buffer.from(row.encrypted_key);
  // Ein Entschlüsselungs-Fehler (z. B. GCM-Auth-Tag nach JWT_SECRET-Rotation)
  // wirft aus tokenCrypto einen nackten Error — auf eine klare Domänen-Meldung
  // abbilden, statt in den generischen 500-Handler zu fallen. Der Klartext-Key
  // wird dabei nie geloggt.
  let apiKey;
  try {
    apiKey = decryptToken(buf);
  } catch (err) {
    logger.error(`Provider-Key für "${provider}" nicht entschlüsselbar: ${err.message}`);
    throw new ServiceUnavailableError(
      `Hinterlegter API-Key für "${provider}" ist nicht entschlüsselbar (evtl. nach JWT_SECRET-Wechsel). Bitte Key neu hinterlegen.`
    );
  }
  if (apiKey == null) {
    return null;
  }
  return { apiKey, baseUrl: row.base_url || null };
}

/**
 * Key eines Providers löschen.
 * @param {string} provider
 * @returns {Promise<boolean>} true, wenn eine Zeile entfernt wurde.
 */
async function deleteKey(provider) {
  if (!provider) {
    return false;
  }
  const result = await db.query(`DELETE FROM flow_provider_keys WHERE provider = $1`, [provider]);
  return result.rowCount > 0;
}

module.exports = {
  listProviders,
  hasKey,
  saveKey,
  getDecryptedKey,
  deleteKey,
  KEYED_PROVIDERS,
};
