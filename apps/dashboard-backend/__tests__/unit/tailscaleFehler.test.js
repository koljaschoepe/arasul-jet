/**
 * Fehler des Fernzugriffs erreichen den Admin in zwei Sätzen (M5, Auftrag
 * jet-fehlerklassen).
 *
 * Bis dahin flog ein schlichtes `Error` mit den letzten 200 Zeichen der
 * tailscale-Ausgabe, und der Fehlerbehandler machte daraus 500 „Internal
 * server error". Jetzt: ein Status, der zur Lage passt, ein eigener Code, ein
 * Satz für den Menschen -- und die Rohausgabe nur in `roh` (Log).
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Je Befehl auf dem Host: was er ausgibt und mit welchem Code er endet.
let mockAntworten;

jest.mock('../../src/services/core/docker', () => ({
  docker: {
    getImage: () => ({ inspect: async () => ({}) }),
    createContainer: async ({ Cmd }) => {
      const befehl = Cmd[Cmd.length - 1];
      const treffer = mockAntworten.find(a => befehl.startsWith(a.befehl));
      if (!treffer) {
        throw new Error(`unerwarteter Befehl: ${befehl}`);
      }
      if (treffer.wirft) {
        throw new Error(treffer.wirft);
      }
      return {
        start: async () => {},
        wait: async () => ({ StatusCode: treffer.code }),
        logs: async () => Buffer.from(treffer.ausgabe || ''),
        remove: async () => {},
      };
    },
  },
}));

function frischerDienst() {
  let dienst;
  jest.isolateModules(() => {
    dienst = require('../../src/services/network/tailscaleService');
  });
  return dienst;
}

const INSTALLIERT = { befehl: 'which tailscale', code: 0, ausgabe: '/usr/bin/tailscale' };

async function fehlerVon(versprechen) {
  try {
    await versprechen;
  } catch (err) {
    return err;
  }
  throw new Error('kein Fehler geworfen');
}

describe('tailscaleService: Fehler für den Admin', () => {
  it('ein abgelehnter Auth-Key ist 400 mit eigenem Code, ohne Rohtext im Satz', async () => {
    const roh = 'backend error: invalid key: API key kXXXX does not exist';
    mockAntworten = [INSTALLIERT, { befehl: 'tailscale up', code: 1, ausgabe: roh }];
    const err = await fehlerVon(frischerDienst().connect('tskey-auth-abc123', null));
    expect(err.name).toBe('UpstreamError');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('TAILSCALE_KEY_UNGUELTIG');
    expect(err.message).toMatch(/Auth-Key abgelehnt/);
    expect(err.message).not.toMatch(/backend error/);
    expect(err.roh).toBe(roh);
  });

  it('ein nicht laufender tailscaled ist 503', async () => {
    mockAntworten = [
      INSTALLIERT,
      {
        befehl: 'tailscale up',
        code: 1,
        ausgabe:
          'failed to connect to local tailscaled; it doesn’t appear to be running (sudo systemctl start tailscaled ?)',
      },
    ];
    const err = await fehlerVon(frischerDienst().connect('tskey-auth-abc123', null));
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('TAILSCALE_DIENST_AUS');
    expect(err.message).toMatch(/läuft nicht/);
    expect(err.message).not.toMatch(/systemctl/);
  });

  it('jeder andere Fehlschlag beim Verbinden ist 502', async () => {
    mockAntworten = [INSTALLIERT, { befehl: 'tailscale up', code: 1, ausgabe: 'irgendwas kaputt' }];
    const err = await fehlerVon(frischerDienst().connect('tskey-auth-abc123', null));
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('TAILSCALE_VERBINDEN_FEHLGESCHLAGEN');
    expect(err.message).not.toMatch(/irgendwas kaputt/);
    expect(err.roh).toBe('irgendwas kaputt');
  });

  it('ein Trennen, das scheitert, ist 502 mit Satz', async () => {
    mockAntworten = [INSTALLIERT, { befehl: 'tailscale down', code: 1, ausgabe: 'nope' }];
    const err = await fehlerVon(frischerDienst().disconnect());
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('TAILSCALE_TRENNEN_FEHLGESCHLAGEN');
    expect(err.message).toMatch(/ließ sich nicht ausschalten/);
  });

  it('ein Befehl, der auf dem Host gar nicht lief, ist 503', async () => {
    mockAntworten = [INSTALLIERT, { befehl: 'tailscale down', wirft: 'connect ECONNREFUSED' }];
    const err = await fehlerVon(frischerDienst().disconnect());
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('TAILSCALE_HOST_NICHT_ERREICHBAR');
    expect(err.message).not.toMatch(/ECONNREFUSED/);
  });

  it('fehlt curl, ist die Installation 409 statt 500', async () => {
    mockAntworten = [
      { befehl: 'which tailscale', code: 1 },
      { befehl: 'which curl', code: 1 },
    ];
    const err = await fehlerVon(frischerDienst().install());
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('TAILSCALE_CURL_FEHLT');
    expect(err.message).not.toMatch(/apt-get/);
  });

  it('eine gescheiterte Installation ist 502, die Ausgabe nur in roh', async () => {
    mockAntworten = [
      { befehl: 'which tailscale', code: 1 },
      { befehl: 'which curl', code: 0 },
      { befehl: 'curl -fsSL', code: 7, ausgabe: 'curl: (7) Failed to connect' },
    ];
    const err = await fehlerVon(frischerDienst().install());
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('TAILSCALE_INSTALLATION_FEHLGESCHLAGEN');
    expect(err.message).not.toMatch(/curl/);
    expect(err.roh).toMatch(/Failed to connect/);
  });
});
