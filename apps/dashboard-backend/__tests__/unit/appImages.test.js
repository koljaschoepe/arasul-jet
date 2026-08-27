/**
 * Was beim Entfernen einer App mitgeht (Nachbesserung zur C5-Abnahme,
 * 27.08.2026).
 *
 * `DELETE /api/v1/external/apps/:id` nahm die Zeile, beide Container samt
 * Volumes, die Freigaben und auf Wunsch die Dateien -- und liess die am Geraet
 * gebauten Images liegen. Am Orin waren das je Version 228 MB auf einem
 * Geraet, das fuenf Jahre unbeaufsichtigt laufen soll.
 *
 * Gemessen wird hier vor allem, was NICHT passieren darf: nach einem Muster
 * loeschen. Der Name eines Images steht im Manifest und ist dort freier Text;
 * `arasul-<id>:<version>` ist die Gewohnheit der Beispielapp, keine Regel.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const APPS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-images-'));
process.env.APPS_DIR = APPS_DIR;

// `mock`-Praefix, weil eine `jest.mock`-Fabrik nur so auf eine Variable
// ausserhalb ihres Bereichs zugreifen darf.
const mockDocker = {
  getImage: jest.fn(),
  listImages: jest.fn(),
  getContainer: jest.fn(),
  listContainers: jest.fn(),
};
jest.mock('dockerode', () => jest.fn(() => mockDocker));
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const appContainer = require('../../src/services/app/appContainer');

/** Ein Image-Doppel, das sich merkt, ob es entfernt wurde. */
function imageDoppel(fehler = null) {
  return { remove: jest.fn(() => (fehler ? Promise.reject(fehler) : Promise.resolve())) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDocker.listImages.mockResolvedValue([]);
});
afterAll(() => fs.rmSync(APPS_DIR, { recursive: true, force: true }));

describe('entferneImages', () => {
  it('entfernt die Namen, die der Aufrufer aus den Manifesten kennt', async () => {
    const eins = imageDoppel();
    const zwei = imageDoppel();
    mockDocker.getImage.mockImplementation(n => (n === 'a:1' ? eins : zwei));

    const weg = await appContainer.entferneImages('urlaub', ['a:1', 'b:2']);

    expect(weg.sort()).toEqual(['a:1', 'b:2']);
    expect(eins.remove).toHaveBeenCalled();
    expect(zwei.remove).toHaveBeenCalled();
  });

  it('findet zusaetzlich, was am Etikett `arasul.app` haengt', async () => {
    // Der Weg fuer ein Image, dessen Versionsordner und Stand es nicht mehr
    // gibt -- die Manifeste wissen dann nichts mehr von ihm.
    mockDocker.listImages.mockResolvedValue([{ RepoTags: ['verwaist:9.9.9', '<none>:<none>'] }]);
    const bild = imageDoppel();
    mockDocker.getImage.mockReturnValue(bild);

    const weg = await appContainer.entferneImages('urlaub', []);

    expect(mockDocker.listImages).toHaveBeenCalledWith({
      filters: { label: ['arasul.app=urlaub'] },
    });
    expect(weg).toEqual(['verwaist:9.9.9']);
    // `<none>:<none>` ist kein Name, sondern Dockers Wort fuer „ohne".
    expect(mockDocker.getImage).not.toHaveBeenCalledWith('<none>:<none>');
  });

  it('zaehlt einen Namen nur einmal, auch wenn er aus beiden Quellen kommt', async () => {
    mockDocker.listImages.mockResolvedValue([{ RepoTags: ['a:1'] }]);
    const bild = imageDoppel();
    mockDocker.getImage.mockReturnValue(bild);

    const weg = await appContainer.entferneImages('urlaub', ['a:1']);

    expect(weg).toEqual(['a:1']);
    expect(bild.remove).toHaveBeenCalledTimes(1);
  });

  it('laesst ein Image stehen, das noch ein anderer Container benutzt (409)', async () => {
    const fehler = Object.assign(new Error('conflict'), { statusCode: 409 });
    mockDocker.getImage.mockReturnValue(imageDoppel(fehler));

    await expect(appContainer.entferneImages('urlaub', ['a:1'])).resolves.toEqual([]);
  });

  it('uebergeht ein Image, das es schon nicht mehr gibt (404)', async () => {
    const fehler = Object.assign(new Error('no such image'), { statusCode: 404 });
    mockDocker.getImage.mockReturnValue(imageDoppel(fehler));

    await expect(appContainer.entferneImages('urlaub', ['a:1'])).resolves.toEqual([]);
  });

  it('laesst einen echten Docker-Fehler durch, statt ihn zu verschlucken', async () => {
    const fehler = Object.assign(new Error('kaputt'), { statusCode: 500 });
    mockDocker.getImage.mockReturnValue(imageDoppel(fehler));

    await expect(appContainer.entferneImages('urlaub', ['a:1'])).rejects.toThrow('kaputt');
  });

  it('arbeitet weiter, wenn Docker keine Liste hergibt', async () => {
    // Die Etiketten sind die ZUSAETZLICHE Quelle. Faellt sie aus, sollen die
    // Namen aus den Manifesten trotzdem weggehen.
    mockDocker.listImages.mockRejectedValue(new Error('Proxy weg'));
    mockDocker.getImage.mockReturnValue(imageDoppel());

    await expect(appContainer.entferneImages('urlaub', ['a:1'])).resolves.toEqual(['a:1']);
  });
});

describe('baueImage beschriftet, was es baut', () => {
  it('haengt `arasul.app` und `arasul.version` an das Image', async () => {
    // Ohne das Etikett findet `entferneImages` spaeter nur, was noch in einem
    // Manifest steht -- und genau die Faelle, in denen etwas liegen bleibt,
    // sind die, in denen kein Manifest mehr da ist.
    const kontext = path.join(APPS_DIR, 'bau');
    fs.mkdirSync(kontext, { recursive: true });
    fs.writeFileSync(path.join(kontext, 'Dockerfile'), 'FROM scratch\n');

    const dockerNeu = mockDocker;
    // Den Bau-Kontext AUSLESEN und erst dann antworten. `baueImage` schickt
    // ihn als Tar-Strom, und der liest den Ordner asynchron; wuerde die Fabrik
    // sofort antworten, raeumte `afterAll` den Ordner weg, waehrend tar noch
    // darin liest -- und Node beendet sich danach mit einem unbehandelten
    // 'error'-Ereignis, LANGE nachdem der Test gruen gemeldet hat.
    dockerNeu.buildImage = jest.fn(async kontext => {
      await new Promise((auf, ab) => {
        kontext.on('end', auf);
        kontext.on('error', ab);
        kontext.resume();
      });
      return 'strom';
    });
    dockerNeu.modem = { followProgress: (s, fertig) => fertig(null) };

    await appContainer.baueImage(
      {
        id: 'urlaub',
        version: '1.2.3',
        backend: { image: 'arasul-urlaub:1.2.3', bauen: { dockerfile: 'Dockerfile' } },
      },
      kontext
    );

    expect(dockerNeu.buildImage.mock.calls[0][1].labels).toEqual({
      'arasul.app': 'urlaub',
      'arasul.version': '1.2.3',
    });
  });
});
