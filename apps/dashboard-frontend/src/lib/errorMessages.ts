/**
 * Error-Localization Layer
 *
 * Backend errors travel as { error: { code, message, details? } } where `code`
 * is a stable, machine-readable identifier (see apps/dashboard-backend/src/utils/errors.js).
 * The English `message` is a fallback for unknown locales / older codes — for
 * end-user display we prefer a German translation keyed by `code`.
 *
 * If the code is unknown (or absent), we fall back to the server-supplied
 * message so the user never sees an empty toast.
 */

const TRANSLATIONS_DE: Record<string, string> = {
  // Auth & permissions
  UNAUTHORIZED: 'Anmeldung erforderlich',
  TOKEN_EXPIRED: 'Sitzung abgelaufen, bitte erneut anmelden',
  TOKEN_REVOKED: 'Sitzung wurde widerrufen, bitte erneut anmelden',
  INVALID_TOKEN: 'Ungültiges Auth-Token',
  FORBIDDEN: 'Kein Zugriff auf diese Aktion',

  // Validation & client errors
  VALIDATION_ERROR: 'Eingabe ungültig',
  NOT_FOUND: 'Eintrag nicht gefunden',
  CONFLICT: 'Konflikt: Eintrag existiert bereits oder wurde bereits geändert',
  RATE_LIMITED: 'Zu viele Anfragen — bitte kurz warten',
  REQUEST_TIMEOUT: 'Anfrage hat zu lange gedauert',

  // Service availability
  SERVICE_UNAVAILABLE: 'Dienst aktuell nicht verfügbar',
  OLLAMA_UNAVAILABLE: 'LLM-Service nicht erreichbar — bitte Modell-Status prüfen',
  EMBEDDING_DOWN: 'Embedding-Service nicht verfügbar — RAG-Antworten sind eingeschränkt',
  QDRANT_UNAVAILABLE: 'Vektor-Datenbank nicht erreichbar — RAG ist eingeschränkt',
  INDEXER_UNAVAILABLE: 'Document-Indexer nicht erreichbar',
  DATA_DB_NOT_INITIALIZED: 'Datentabellen-Datenbank ist nicht initialisiert',

  // Model lifecycle
  MODEL_INSTALLED: 'Modell ist bereits installiert',
  DOWNLOAD_ACTIVE: 'Download läuft bereits',
  THINKING_NOT_SUPPORTED: 'Dieses Modell unterstützt den Thinking-Modus nicht',
  VISION_NOT_SUPPORTED: 'Dieses Modell unterstützt keine Bild-Eingabe',

  // Generic
  NOT_IMPLEMENTED: 'Funktion noch nicht implementiert',
  INTERNAL_ERROR: 'Interner Serverfehler',
};

/**
 * Translate a backend error code into a user-facing German string.
 *
 * @param code     stable error code from the backend (e.g. 'OLLAMA_UNAVAILABLE')
 * @param fallback original message from the backend, used if the code is unknown
 * @returns        German translation if known, otherwise the fallback or a generic message
 */
export function translateError(code: string | undefined, fallback?: string): string {
  if (code && TRANSLATIONS_DE[code]) {
    return TRANSLATIONS_DE[code];
  }
  if (fallback && fallback.trim().length > 0) {
    return fallback;
  }
  return 'Unbekannter Fehler';
}

/**
 * Internal: expose the dictionary for tests. Not part of the public API.
 */
export const __TRANSLATIONS_DE = TRANSLATIONS_DE;
