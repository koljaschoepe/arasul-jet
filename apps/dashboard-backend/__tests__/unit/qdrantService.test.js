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

/**
 * Plan 023 G4: ein abgeschalteter Qdrant kostet keine Wartezeit mehr.
 *
 * Seit Plan 021, Schritt 8 liegt Qdrant im Compose-Profil `classic-rag` und
 * startet nicht mit. Der Name loest dann gar nicht erst auf. Jeder Aufruf lief
 * trotzdem in drei Versuche mit Wartezeit dazwischen.
 *
 * Am 22.08.2026 auf dem Orin gemessen, beim Loeschen eines Ordners mit hundert
 * Dateien:
 *
 *   18:26:45  Failed to delete from Qdrant after retries … getaddrinfo EAI_AGAIN
 *   18:26:50  Failed to delete from Qdrant after retries … getaddrinfo EAI_AGAIN
 *
 * Fuenf Sekunden je Dokument, ueber acht Minuten fuer den Ordner. In dieser
 * Zeit tat der Ordner-Abgleich nichts anderes, und neu geschriebene Dateien
 * bekamen keine Zeile und waren nicht auffindbar.
 */
const qdrant = require('../../src/services/documents/qdrantService');

/** Ein Fehler, wie ihn ein nicht auflösbarer Hostname erzeugt. */
function namenlos() {
  const e = new Error('getaddrinfo EAI_AGAIN qdrant');
  e.code = 'EAI_AGAIN';
  return e;
}

describe('abgeschalteter Qdrant (Plan 023 G4)', () => {
  beforeEach(() => {
    axios.post.mockReset();
    qdrant._pauseZuruecksetzen();
  });

  afterEach(() => qdrant._pauseZuruecksetzen());

  test('der erste Fehlschlag wiederholt nicht und schaltet stumm', async () => {
    axios.post.mockRejectedValue(namenlos());

    await expect(qdrant.deleteDocumentVectors('d1')).resolves.toBe(false);

    // EIN Versuch, nicht drei: ein nicht aufloesbarer Name wird beim zweiten
    // Mal nicht besser.
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(qdrant.istAbgeschaltet()).toBe(true);
  });

  test('danach geht gar kein Aufruf mehr hinaus', async () => {
    axios.post.mockRejectedValue(namenlos());
    await qdrant.deleteDocumentVectors('d1');
    axios.post.mockClear();

    await expect(qdrant.deleteDocumentVectors('d2')).resolves.toBe(false);
    await expect(qdrant.deleteDocumentVectorsSimple('d3')).resolves.toBe(false);
    await expect(qdrant.updateDocumentSpacePayload('d4', null, '', '')).resolves.toBe(false);

    expect(axios.post).not.toHaveBeenCalled();
  });

  test('ein echter Fehler schaltet NICHT stumm', async () => {
    // Eine abgerissene Verbindung heisst: Qdrant ist da und hat ein Problem.
    // Da lohnt der zweite Versuch, und die naechste Loeschung muss es wieder
    // probieren, statt eine Minute lang gar nichts zu tun.
    const fehler = new Error('socket hang up');
    fehler.code = 'ECONNRESET';
    axios.post.mockRejectedValue(fehler);

    await expect(qdrant.deleteDocumentVectors('d1')).resolves.toBe(false);

    expect(axios.post).toHaveBeenCalledTimes(3);
    expect(qdrant.istAbgeschaltet()).toBe(false);
  });

  test('ein geglueckter Aufruf hebt die Pause sofort auf', async () => {
    axios.post.mockRejectedValueOnce(namenlos());
    await qdrant.deleteDocumentVectors('d1');
    expect(qdrant.istAbgeschaltet()).toBe(true);

    // Qdrant kommt zurueck. Die Pause darf nicht bis zum Ablauf stehen bleiben.
    qdrant._pauseZuruecksetzen();
    axios.post.mockResolvedValue({ data: {} });
    await expect(qdrant.deleteDocumentVectors('d2')).resolves.toBe(true);
    expect(qdrant.istAbgeschaltet()).toBe(false);
  });
});
