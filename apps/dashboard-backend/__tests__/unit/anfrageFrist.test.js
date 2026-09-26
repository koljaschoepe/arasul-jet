/**
 * TIMEOUT-001 haelt die Versprechen der aeusseren Wege (J35, 26.09.2026).
 *
 * Bis hierher schnitt das Netz jede Anfrage an `/api/v1/external/` nach 60 s
 * ab, auch `document/extract-structured`, das bis 600 s zu warten verspricht.
 */
const {
  fristFuer,
  REGULAER_MS,
  STROM_MS,
  AUSSEN_MS,
  AUSSEN_WARTEN_MS,
} = require('../../src/utils/anfrageFrist');

test('die aeusseren Wege bekommen mehr als ihr laengstes Warten', () => {
  for (const pfad of [
    '/api/v1/external/document/extract-structured',
    '/api/v1/external/llm/chat',
    '/api/v1/external/flows/bescheid/run',
    '/v1/chat/completions',
  ]) {
    expect(fristFuer(pfad)).toBe(AUSSEN_MS);
  }
  // Das laengste Warten: flows/:name/run mit 1800 s. Die Route muss VOR dem
  // Netz antworten koennen.
  expect(AUSSEN_WARTEN_MS).toBe(1800 * 1000);
  expect(AUSSEN_MS).toBeGreaterThan(AUSSEN_WARTEN_MS);
});

test('alles andere bleibt, wie es war', () => {
  expect(fristFuer('/api/auth/session')).toBe(REGULAER_MS);
  expect(fristFuer('/api/apps')).toBe(REGULAER_MS);
  expect(fristFuer('/api/llm/chat')).toBe(STROM_MS);
  expect(fristFuer('/api/rag/query')).toBe(STROM_MS);
  // Kein Praefix-Irrtum: `/v1external` ist kein Weg der Schnittstelle.
  expect(fristFuer('/api/v1/externalx')).toBe(REGULAER_MS);
});
