import { describe, it, expect } from 'vitest';
import { translateError, __TRANSLATIONS_DE } from '../../lib/errorMessages';

describe('translateError', () => {
  it('translates a known backend code into German', () => {
    expect(translateError('OLLAMA_UNAVAILABLE')).toBe(
      'LLM-Service nicht erreichbar — bitte Modell-Status prüfen'
    );
    expect(translateError('EMBEDDING_DOWN')).toBe(
      'Embedding-Service nicht verfügbar — RAG-Antworten sind eingeschränkt'
    );
    expect(translateError('VALIDATION_ERROR')).toBe('Eingabe ungültig');
  });

  it('falls back to the supplied message when code is unknown', () => {
    expect(translateError('SOMETHING_NEW', 'Brand-new error')).toBe('Brand-new error');
  });

  it('falls back to the supplied message when code is undefined', () => {
    expect(translateError(undefined, 'Server-supplied text')).toBe('Server-supplied text');
  });

  it('falls back to the generic message when code is unknown and no fallback given', () => {
    expect(translateError(undefined)).toBe('Unbekannter Fehler');
    expect(translateError('UNKNOWN_CODE')).toBe('Unbekannter Fehler');
    expect(translateError(undefined, '')).toBe('Unbekannter Fehler');
    expect(translateError(undefined, '   ')).toBe('Unbekannter Fehler');
  });

  it('prefers translation over fallback when both are present', () => {
    expect(translateError('UNAUTHORIZED', 'Authentication required')).toBe(
      'Anmeldung erforderlich'
    );
  });

  it('covers every backend ApiError code we know about', () => {
    // Backend → frontend coupling check. If a new backend code is added,
    // the entry needs to land in TRANSLATIONS_DE too — this list mirrors
    // apps/dashboard-backend/src/utils/errors.js + ad-hoc codes used in
    // routes (see grep for `code: '` in the backend tree).
    const expected = [
      'UNAUTHORIZED',
      'TOKEN_EXPIRED',
      'TOKEN_REVOKED',
      'INVALID_TOKEN',
      'FORBIDDEN',
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'CONFLICT',
      'RATE_LIMITED',
      'REQUEST_TIMEOUT',
      'SERVICE_UNAVAILABLE',
      'OLLAMA_UNAVAILABLE',
      'EMBEDDING_DOWN',
      'QDRANT_UNAVAILABLE',
      'INDEXER_UNAVAILABLE',
      'DATA_DB_NOT_INITIALIZED',
      'MODEL_INSTALLED',
      'DOWNLOAD_ACTIVE',
      'THINKING_NOT_SUPPORTED',
      'VISION_NOT_SUPPORTED',
      'NOT_IMPLEMENTED',
      'INTERNAL_ERROR',
    ];
    for (const code of expected) {
      expect(__TRANSLATIONS_DE[code]).toBeDefined();
    }
  });
});
