/**
 * qdrantService.deleteAllVectors (Plan 023 B5).
 *
 * Der Unterschied, auf den es hier ankommt: eine Sammlung, die es nie gab, ist
 * kein Fehlschlag, ein nicht erreichbarer Qdrant schon. In der Live-Abnahme vom
 * 19.08.2026 stand fuer den ersten Fall ein rotes "getaddrinfo EAI_AGAIN" im
 * Bericht, das nichts bedeutete. Ein roter Punkt, der nichts bedeutet, macht
 * die echten unglaubwuerdig.
 */

jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const axios = require('axios');
const { deleteAllVectors } = require('../../src/services/documents/qdrantService');

beforeEach(() => axios.post.mockReset());

test('leert die Sammlung mit einem leeren Filter', async () => {
  axios.post.mockResolvedValue({ data: {} });

  await expect(deleteAllVectors()).resolves.toEqual({ entfernt: 'alle' });

  const [pfad, rumpf] = axios.post.mock.calls[0];
  expect(pfad).toMatch(/\/points\/delete$/);
  expect(rumpf).toEqual({ filter: {} });
});

test('eine nie angelegte Sammlung ist kein Fehlschlag', async () => {
  const fehler = new Error('Request failed with status code 404');
  fehler.response = { status: 404 };
  axios.post.mockRejectedValue(fehler);

  await expect(deleteAllVectors()).resolves.toEqual({
    uebersprungen: 'Sammlung nicht vorhanden',
  });
});

test('ein nicht erreichbarer Qdrant bleibt ein Fehlschlag', async () => {
  axios.post.mockRejectedValue(new Error('getaddrinfo EAI_AGAIN qdrant'));

  await expect(deleteAllVectors()).rejects.toThrow(/EAI_AGAIN/);
});
