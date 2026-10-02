/**
 * Das Netz der Apps (J38).
 *
 * Gemessen wird, was dieser Code entscheidet: in welches Netz ein Container
 * kommt, dass der Umzug alles mitnimmt, was die App hatte (Umgebung, Etiketten,
 * Grenzen), dass er bei einem Fehlschlag zurueckgeht, und dass das neue Feld
 * `verbindungen` im Manifest nur Hostnamen nimmt. Ob Postgres die Rolle einer
 * App wirklich abweist, misst `scripts/test/app-netz-abnahme.sh` am Geraet.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/core/docker', () => ({
  docker: { listContainers: jest.fn(), getContainer: jest.fn(), createContainer: jest.fn() },
}));

const { docker } = require('../../src/services/core/docker');
const appContainer = require('../../src/services/app/appContainer');
const ausgang = require('../../src/services/app/ausgangsProxy');
const { AppManifest } = require('../../src/schemas/apps');

const NEU = 'arasul-platform_arasul-apps';
const ALT = 'arasul-platform_arasul-backend';

function manifest(extra = {}) {
  return {
    schema: 1,
    id: 'urlaub',
    name: 'Urlaub',
    version: '1.0.0',
    backend: { image: 'arasul-urlaub:1.0.0' },
    ports: { backend: 3000 },
    ...extra,
  };
}

describe('Wohin ein App-Container kommt', () => {
  it('ins Netz arasul-apps, in dem es kein Internet gibt', () => {
    expect(appContainer.NETZ).toBe(NEU);
    const b = appContainer.containerBeschreibung(AppManifest.parse(manifest()), 'live');
    expect(b.HostConfig.NetworkMode).toBe(NEU);
    expect(b.Labels['traefik.docker.network']).toBe(NEU);
  });

  it('ohne veroeffentlichten Port und ohne zusaetzliche Rechte', () => {
    const b = appContainer.containerBeschreibung(AppManifest.parse(manifest()), 'live');
    expect(b.HostConfig.PortBindings).toBeUndefined();
    expect(b.HostConfig.CapDrop).toEqual(['ALL']);
  });

  it('mit dem Zugang zum Ausgangs-Proxy, den das Manifest nicht ueberschreiben kann', () => {
    const m = AppManifest.parse(
      manifest({ backend: { image: 'x:1', umgebung: { HTTPS_PROXY: 'http://boese:80' } } })
    );
    const env = appContainer.containerBeschreibung(m, 'live').Env;
    expect(env.filter(e => e.startsWith('HTTPS_PROXY='))).toEqual([
      `HTTPS_PROXY=${ausgang.umgebung('arasul-app-urlaub-live').HTTPS_PROXY}`,
    ]);
    expect(env.some(e => e.startsWith('http_proxy='))).toBe(false);
    expect(env).toContain(
      'NO_PROXY=localhost,127.0.0.1,postgres-db,dashboard-backend,reverse-proxy'
    );
  });
});

describe('Der Umzug bestehender Apps', () => {
  /** Ein Container, der sich merkt, was mit ihm geschieht. */
  function container(name, { netz, laeuft = true, hoch = true }) {
    const c = {
      name,
      netz,
      mitZugang: false,
      laeuft,
      aufrufe: [],
      inspect: jest.fn(async () => ({
        Name: `/${c.name}`,
        State: { Running: c.laeuft, Status: c.laeuft ? 'running' : 'exited' },
        NetworkSettings: { Networks: { [c.netz]: {} } },
        Config: {
          Image: 'arasul-urlaub:1.0.0',
          Hostname: name,
          Env: [
            'ARASUL_DB_URL=postgresql://x:y@postgres-db:5432/x',
            'ARASUL_API_KEY=geheim',
            ...(c.mitZugang
              ? [`HTTPS_PROXY=${ausgang.umgebung('arasul-app-urlaub-live').HTTPS_PROXY}`]
              : []),
          ],
          Labels: { 'arasul.app': 'urlaub', 'traefik.docker.network': ALT },
          ExposedPorts: { '3000/tcp': {} },
        },
        HostConfig: {
          NetworkMode: ALT,
          Memory: 536870912,
          RestartPolicy: { Name: 'unless-stopped' },
        },
      })),
      stop: jest.fn(async () => {
        c.laeuft = false;
      }),
      start: jest.fn(async () => {
        c.laeuft = hoch;
      }),
      rename: jest.fn(async ({ name: neu }) => {
        c.name = neu;
      }),
      remove: jest.fn(async () => {}),
    };
    return c;
  }

  let alt;
  let neu;
  beforeEach(() => {
    docker.listContainers.mockReset();
    docker.getContainer.mockReset();
    docker.createContainer.mockReset();
    alt = container('arasul-app-urlaub-live', { netz: ALT });
    neu = container('arasul-app-urlaub-live-neu', { netz: NEU });
    docker.listContainers.mockResolvedValue([{ Id: 'a1' }]);
    docker.getContainer.mockImplementation(id => (id === 'a1' ? alt : neu));
    docker.createContainer.mockResolvedValue(neu);
  });

  it('ersetzt den Container mit derselben Umgebung und neuem Netz', async () => {
    const r = await appContainer.zieheUm(50);

    expect(r).toEqual({ umgezogen: ['arasul-app-urlaub-live'], gescheitert: [] });
    const beschreibung = docker.createContainer.mock.calls[0][0];
    expect(beschreibung.name).toBe('arasul-app-urlaub-live-neu');
    expect(beschreibung.HostConfig.NetworkMode).toBe(NEU);
    expect(beschreibung.HostConfig.Memory).toBe(536870912);
    expect(beschreibung.Labels['traefik.docker.network']).toBe(NEU);
    expect(beschreibung.Labels['arasul.app']).toBe('urlaub');
    // Nichts wird neu gewuerfelt: Schluessel und Datenbankadresse bleiben.
    expect(beschreibung.Env).toEqual(
      expect.arrayContaining([
        'ARASUL_DB_URL=postgresql://x:y@postgres-db:5432/x',
        'ARASUL_API_KEY=geheim',
      ])
    );
    expect(alt.remove).toHaveBeenCalled();
    expect(neu.rename).toHaveBeenCalledWith({ name: 'arasul-app-urlaub-live' });
  });

  it('gibt dem umgezogenen Container den Zugang zum Ausgangs-Proxy mit', async () => {
    await appContainer.zieheUm(50);
    const env = docker.createContainer.mock.calls[0][0].Env;
    expect(env).toContain(`HTTPS_PROXY=${ausgang.umgebung('arasul-app-urlaub-live').HTTPS_PROXY}`);
  });

  it('zieht eine App um, die im richtigen Netz haengt, aber ohne Zugang zum Proxy laeuft', async () => {
    alt.netz = NEU;
    const r = await appContainer.zieheUm(50);
    expect(r.umgezogen).toEqual(['arasul-app-urlaub-live']);
    expect(docker.createContainer.mock.calls[0][0].Env.join('\n')).toContain('HTTPS_PROXY=');
  });

  it('laesst eine App, die schon im richtigen Netz haengt, in Ruhe', async () => {
    alt.netz = NEU;
    alt.mitZugang = true;
    const r = await appContainer.zieheUm(50);
    expect(r.umgezogen).toEqual([]);
    expect(docker.createContainer).not.toHaveBeenCalled();
    expect(alt.stop).not.toHaveBeenCalled();
  });

  it('geht zurueck, wenn der neue Container nicht hochkommt', async () => {
    neu = container('arasul-app-urlaub-live-neu', { netz: NEU, hoch: false });
    docker.createContainer.mockResolvedValue(neu);

    const r = await appContainer.zieheUm(50);

    expect(r).toEqual({ umgezogen: [], gescheitert: ['arasul-app-urlaub-live'] });
    expect(neu.remove).toHaveBeenCalled();
    expect(alt.remove).not.toHaveBeenCalled();
    expect(alt.rename).toHaveBeenLastCalledWith({ name: 'arasul-app-urlaub-live' });
    expect(alt.laeuft).toBe(true);
  });

  it('startet den alten wieder, wenn schon das Anlegen scheitert', async () => {
    docker.createContainer.mockRejectedValue(new Error('kein Platz'));
    const r = await appContainer.zieheUm(50);
    expect(r.gescheitert).toEqual(['arasul-app-urlaub-live']);
    expect(alt.stop).not.toHaveBeenCalled();
    expect(alt.laeuft).toBe(true);
  });

  it('haelt einen angehaltenen Container angehalten', async () => {
    alt.laeuft = false;
    const r = await appContainer.zieheUm(50);
    expect(r.umgezogen).toEqual(['arasul-app-urlaub-live']);
    expect(neu.start).not.toHaveBeenCalled();
  });

  it('fasst Reste eines abgebrochenen Umzugs nicht an', async () => {
    alt.name = 'arasul-app-urlaub-live-alt';
    const r = await appContainer.zieheUm(50);
    expect(r).toEqual({ umgezogen: [], gescheitert: [] });
    expect(docker.createContainer).not.toHaveBeenCalled();
  });

  it('wirft nicht, wenn Docker keine Liste gibt', async () => {
    docker.listContainers.mockRejectedValue(new Error('weg'));
    await expect(appContainer.zieheUm(50)).resolves.toEqual({ umgezogen: [], gescheitert: [] });
  });
});

describe('Das Feld verbindungen im Manifest', () => {
  const nimm = verbindungen => AppManifest.safeParse(manifest({ verbindungen }));

  it('ist freiwillig', () => {
    expect(AppManifest.safeParse(manifest()).success).toBe(true);
  });

  it('nimmt Hostnamen und schreibt sie klein', () => {
    const r = nimm(['API.Example.com', 'fonts.gstatic.com']);
    expect(r.success).toBe(true);
    expect(r.data.verbindungen).toEqual(['api.example.com', 'fonts.gstatic.com']);
  });

  it.each([
    ['https://api.example.com'],
    ['api.example.com:443'],
    ['api.example.com/pfad'],
    ['*.example.com'],
    ['10.0.0.5'],
    ['localhost'],
    [''],
  ])('weist %p ab', eintrag => {
    expect(nimm([eintrag]).success).toBe(false);
  });

  it('weist doppelte Namen und zu lange Listen ab', () => {
    expect(nimm(['a.example.com', 'A.example.com']).success).toBe(false);
    const viele = Array.from({ length: 21 }, (_, i) => `h${i}.example.com`);
    expect(nimm(viele).success).toBe(false);
  });
});
