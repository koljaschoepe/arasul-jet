/**
 * Web-Werkzeuge für Skills (Plan 011, Schritt 8).
 *
 * Zwei Dinge stehen hier im Mittelpunkt, und sie sind ungleich wichtig:
 *
 * 1. Die ADRESSPRÜFUNG. Das Backend hängt im internen Netz; ein Werkzeug, das
 *    beliebige Adressen abruft, wäre sonst ein Weg zu Postgres, MinIO und dem
 *    Docker-Proxy. Diese Tests sind der Nachweis, dass der Weg zu ist — auch
 *    über eine Weiterleitung, und auch über die IPv4-in-IPv6-Schreibweise.
 * 2. Die KÜRZUNG. Sie ist der eigentliche Kontext-Schutz; ohne sie sprengt eine
 *    normale Nachrichtenseite den Kontext eines kleinen Modells.
 *
 * axios und DNS sind gemockt — es soll hier nichts ins echte Netz gehen.
 */

jest.mock('axios');
jest.mock('../../src/utils/logger');
jest.mock('dns', () => ({ promises: { lookup: jest.fn() } }));

const axios = require('axios');
const dns = require('dns').promises;
const web = require('../../src/services/skills/tools/web');
const { WebSucheTool, WebLesenTool } = web;

const OEFFENTLICH = [{ address: '93.184.216.34', family: 4 }];

beforeEach(() => {
  jest.clearAllMocks();
  dns.lookup.mockResolvedValue(OEFFENTLICH);
});

describe('istPrivateIp — die Netzgrenze', () => {
  const privat = [
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // Cloud-Metadaten
    '0.0.0.0',
    '100.64.0.1', // Carrier-Grade NAT (Tailscale-Bereich)
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1', // IPv4 in IPv6-Schreibweise — die stille Umgehung
    '::ffff:10.1.2.3',
    // Dieselben Adressen in ANDEREN Schreibweisen. Eine Prüfung, die nur die
    // hübsche Form erkennt, lässt genau diese hier durch — deshalb stehen sie
    // einzeln da und nicht als Kommentar.
    '0:0:0:0:0:ffff:127.0.0.1', // ausgeschrieben
    '0:0:0:0:0:ffff:a00:5', // ausgeschrieben + hexadezimal (= 10.0.0.5)
    '::ffff:7f00:1', // hexadezimal statt gepunktet (= 127.0.0.1)
    '::ffff:c0a8:1', // = 192.168.0.1
    '::127.0.0.1', // IPv4-compatible, ohne ffff
    '::ffff:a9fe:a9fe', // = 169.254.169.254, Cloud-Metadaten
  ];
  const oeffentlich = ['93.184.216.34', '8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111'];

  it.each(privat)('weist %s ab', ip => {
    expect(web.istPrivateIp(ip)).toBe(true);
  });

  it.each(oeffentlich)('lässt %s durch', ip => {
    expect(web.istPrivateIp(ip)).toBe(false);
  });

  it('weist Unsinn ab, statt ihn durchzulassen (fail closed)', () => {
    expect(web.istPrivateIp('keine-ip')).toBe(true);
    expect(web.istPrivateIp('')).toBe(true);
  });
});

describe('pruefeAdresse', () => {
  it('lässt eine normale https-Adresse durch', async () => {
    await expect(web.pruefeAdresse('https://example.org/x')).resolves.toMatchObject({ ok: true });
  });

  it('weist andere Schemata ab', async () => {
    for (const adr of ['file:///etc/passwd', 'ftp://x.org', 'gopher://x.org']) {
      const r = await web.pruefeAdresse(adr);
      expect(r.ok).toBe(false);
      expect(r.grund).toMatch(/http und https/i);
    }
  });

  it('weist eine IP-Adresse im internen Netz direkt ab', async () => {
    const r = await web.pruefeAdresse('http://192.168.0.197/api');
    expect(r.ok).toBe(false);
    expect(r.grund).toMatch(/internes Netz/i);
  });

  it('weist einen NAMEN ab, der auf ein internes Netz zeigt (DNS-Rebinding)', async () => {
    dns.lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    const r = await web.pruefeAdresse('http://sieht-harmlos-aus.de/');
    expect(r.ok).toBe(false);
    expect(r.grund).toMatch(/internes Netz/i);
  });

  it('lehnt ab, sobald EINE der aufgelösten Adressen intern ist', async () => {
    // Sonst entschiede die Sortierung des Resolvers über die Sicherheit.
    dns.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    const r = await web.pruefeAdresse('http://halb-boese.de/');
    expect(r.ok).toBe(false);
  });

  it('gibt die geprüfte IP zurück, damit der Abruf sie festnageln kann', async () => {
    // Ohne die IP im Ergebnis löste Node den Namen beim Verbinden ERNEUT auf —
    // und zwischen Prüfung und Verbindung kann die Antwort wechseln
    // (DNS-Rebinding). Die IP hier ist die Voraussetzung dafür, dass der
    // Abruf genau die geprüfte Adresse verwendet.
    const r = await web.pruefeAdresse('https://example.org/x');
    expect(r).toMatchObject({ ok: true, ip: '93.184.216.34' });
  });

  it('gibt bei einer direkten IP-Adresse diese IP zurück', async () => {
    const r = await web.pruefeAdresse('http://93.184.216.34/x');
    expect(r).toMatchObject({ ok: true, ip: '93.184.216.34' });
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it('weist einen nicht auflösbaren Namen ab', async () => {
    dns.lookup.mockRejectedValue(new Error('ENOTFOUND'));
    const r = await web.pruefeAdresse('http://gibtsnicht.invalid/');
    expect(r.ok).toBe(false);
  });
});

describe('htmlZuText', () => {
  it('wirft Skripte, Stile und Navigation samt Inhalt weg', () => {
    const { text } = web.htmlZuText(`
      <html><head><title>Mein Titel</title><style>.a{color:red}</style></head>
      <body><nav>Startseite Kontakt</nav><script>alert('x')</script>
      <p>Der eigentliche Inhalt.</p><footer>Impressum</footer></body></html>`);
    expect(text).toContain('Der eigentliche Inhalt.');
    expect(text).not.toMatch(/alert|color:red|Startseite|Impressum/);
  });

  it('entfernt Tags, die ein ">" im Attributwert tragen', () => {
    // Auf dem Jetson an einem echten Wikipedia-Artikel gefunden: `data-parsoid`
    // transportiert HTML-Schnipsel in Attributen. Ein Stripper, der am ersten
    // ">" abbricht, hält das Tag dort für beendet und kippt den Rest als Text
    // in die Ausgabe — 34 Fragmente in einem einzigen Artikel.
    const { text } = web.htmlZuText(
      `<p>Vorher</p><span data-parsoid='{"src":"<b>x</b>"}' title="a > b">Inhalt</span><p>Nachher</p>`
    );
    expect(text).not.toMatch(/data-parsoid|<b>|"\}/);
    expect(text).toContain('Inhalt');
    expect(text).toContain('Vorher');
    expect(text).toContain('Nachher');
  });

  it('verwirft ein unabgeschlossenes Tag am Ende, statt Markup durchzulassen', () => {
    expect(web.htmlZuText('<p>Text</p><div class="offen').text).toBe('Text');
  });

  it('liest den Titel aus', () => {
    expect(web.htmlZuText('<title>Mein Titel</title><p>x</p>').titel).toBe('Mein Titel');
  });

  it('macht aus Blöcken Zeilen, statt alles zusammenzukleben', () => {
    const { text } = web.htmlZuText('<p>Eins</p><p>Zwei</p><li>Drei</li>');
    expect(text.split('\n').filter(Boolean)).toEqual(['Eins', 'Zwei', 'Drei']);
  });

  it('löst Entitäten auf — auch deutsche Umlaute und Zahlenformen', () => {
    const { text } = web.htmlZuText('<p>Gr&ouml;&szlig;e &amp; M&auml;ngel &#8211; 5 &lt; 6</p>');
    expect(text).toBe('Größe & Mängel – 5 < 6');
  });

  it('erzeugt beim Auflösen keine NEUEN Entitäten (&amp;lt; bleibt Text)', () => {
    // &amp;lt; muss zu "&lt;" werden, nicht zu "<".
    expect(web.htmlZuText('<p>&amp;lt;</p>').text).toBe('&lt;');
  });
});

describe('WebSucheTool', () => {
  const tool = new WebSucheTool();

  it('weist einen leeren Suchbegriff ab', async () => {
    expect(await tool.execute({ suchbegriff: '  ' })).toMatch(/darf nicht leer sein/i);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('fragt SearXNG im JSON-Format ab', async () => {
    axios.get.mockResolvedValue({ data: { results: [{ title: 'T', url: 'https://a.de', content: 'C' }] } });
    await tool.execute({ suchbegriff: 'Jetson Orin' });
    const [, cfg] = axios.get.mock.calls[0];
    expect(cfg.params).toMatchObject({ q: 'Jetson Orin', format: 'json' });
  });

  it('gibt Titel, Adresse und Auszug zurück', async () => {
    axios.get.mockResolvedValue({
      data: { results: [{ title: 'Titel A', url: 'https://a.de/x', content: 'Ein Auszug.' }] },
    });
    const out = await tool.execute({ suchbegriff: 'x' });
    expect(out).toContain('Titel A');
    expect(out).toContain('https://a.de/x');
    expect(out).toContain('Ein Auszug.');
  });

  it('deckelt die Trefferzahl hart bei 10', async () => {
    const viele = Array.from({ length: 50 }, (_, i) => ({ title: `T${i}`, url: `https://a.de/${i}`, content: '' }));
    axios.get.mockResolvedValue({ data: { results: viele } });
    const out = await tool.execute({ suchbegriff: 'x', anzahl: 999 });
    expect(out).toContain('10. T9');
    expect(out).not.toContain('11. T10');
  });

  it('meldet "keine Treffer", statt zu blockieren', async () => {
    axios.get.mockResolvedValue({ data: { results: [] } });
    expect(await tool.execute({ suchbegriff: 'nichts' })).toMatch(/Keine Treffer/i);
  });

  it('nennt bei 403 die wahrscheinliche Ursache (JSON-Format nicht aktiviert)', async () => {
    const err = new Error('403');
    err.response = { status: 403 };
    axios.get.mockRejectedValue(err);
    expect(await tool.execute({ suchbegriff: 'x' })).toMatch(/search\.formats|JSON/i);
  });

  it('meldet einen nicht erreichbaren Suchdienst verständlich', async () => {
    const err = new Error('connect ECONNREFUSED');
    err.code = 'ECONNREFUSED';
    axios.get.mockRejectedValue(err);
    expect(await tool.execute({ suchbegriff: 'x' })).toMatch(/nicht erreichbar/i);
  });
});

describe('WebLesenTool', () => {
  const tool = new WebLesenTool();
  const html = (inhalt, typ = 'text/html; charset=utf-8') => ({
    status: 200,
    headers: { 'content-type': typ },
    data: inhalt,
  });

  it('weist eine leere Adresse ab', async () => {
    expect(await tool.execute({ adresse: '' })).toMatch(/darf nicht leer sein/i);
  });

  it('holt eine Seite und gibt bereinigten Text mit Quelle zurück', async () => {
    axios.get.mockResolvedValue(html('<title>Doku</title><nav>Menü</nav><p>Inhalt hier.</p>'));
    const out = await tool.execute({ adresse: 'https://example.org/doku' });
    expect(out).toContain('Titel: Doku');
    expect(out).toContain('Quelle: https://example.org/doku');
    expect(out).toContain('Inhalt hier.');
    expect(out).not.toContain('Menü');
  });

  it('kürzt lange Seiten und sagt es dazu', async () => {
    axios.get.mockResolvedValue(html(`<p>${'wort '.repeat(5000)}</p>`));
    const out = await tool.execute({ adresse: 'https://example.org/lang' });
    expect(out).toMatch(/gekuerzt bei 8000 Zeichen/);
    expect(out.length).toBeLessThan(web.MAX_TEXT_ZEICHEN + 500);
  });

  it('ruft eine interne IP-Adresse GAR NICHT erst ab', async () => {
    const out = await tool.execute({ adresse: 'http://10.0.0.5:5432/' });
    expect(out).toMatch(/internes Netz/i);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('ruft einen internen DIENSTNAMEN gar nicht erst ab', async () => {
    // Der reale Fall auf dem Geraet: "postgres-db" loest im Container-Netz auf
    // eine 172.30.x.x auf. Genau so muss der Dienstname scheitern.
    dns.lookup.mockResolvedValue([{ address: '172.30.0.70', family: 4 }]);
    const out = await tool.execute({ adresse: 'http://postgres-db:5432/' });
    expect(out).toMatch(/internes Netz/i);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('weist eine WEITERLEITUNG ins interne Netz ab', async () => {
    // Der eigentliche Punkt: Die erste Adresse ist harmlos, das Ziel nicht.
    axios.get.mockResolvedValueOnce({
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      data: '',
    });
    const out = await tool.execute({ adresse: 'https://example.org/weiter' });
    expect(out).toMatch(/internes Netz/i);
    expect(axios.get).toHaveBeenCalledTimes(1); // die zweite Anfrage kam nie zustande
  });

  it('verbindet über einen Agenten, der auf die geprüfte IP festgenagelt ist', async () => {
    // Der Schutz gegen DNS-Rebinding: Die Verbindung darf nicht noch einmal
    // auflösen. Geprüft wird, dass ein eigener Agent mitgegeben wird und
    // dessen Namensauflösung ausschliesslich die geprüfte IP liefert.
    axios.get.mockResolvedValue(html('<p>ok</p>'));
    await tool.execute({ adresse: 'https://example.org/x' });

    const cfg = axios.get.mock.calls[0][1];
    expect(cfg.httpsAgent).toBeDefined();
    expect(cfg.maxRedirects).toBe(0); // axios darf NICHT selbst folgen

    const aufgeloest = await new Promise(res =>
      cfg.httpsAgent.options.lookup('example.org', {}, (_e, adr, fam) => res({ adr, fam }))
    );
    expect(aufgeloest).toEqual({ adr: '93.184.216.34', fam: 4 });
  });

  it('folgt einer harmlosen Weiterleitung', async () => {
    axios.get
      .mockResolvedValueOnce({ status: 301, headers: { location: 'https://example.org/ziel' }, data: '' })
      .mockResolvedValueOnce(html('<p>Am Ziel.</p>'));
    const out = await tool.execute({ adresse: 'https://example.org/start' });
    expect(out).toContain('Am Ziel.');
    expect(out).toContain('https://example.org/ziel');
  });

  it('bricht bei einer Weiterleitungsschleife ab', async () => {
    axios.get.mockResolvedValue({ status: 302, headers: { location: 'https://example.org/im-kreis' }, data: '' });
    const out = await tool.execute({ adresse: 'https://example.org/start' });
    expect(out).toMatch(/Weiterleitungen/i);
  });

  it('lehnt Nicht-Textinhalte ab, statt Binärmüll zurückzugeben', async () => {
    axios.get.mockResolvedValue(html('%PDF-1.4 ...', 'application/pdf'));
    const out = await tool.execute({ adresse: 'https://example.org/x.pdf' });
    expect(out).toMatch(/nur Textseiten/i);
  });

  it('meldet eine reine JavaScript-Seite als leer, statt Leerraum zu liefern', async () => {
    axios.get.mockResolvedValue(html('<html><body><script>app()</script></body></html>'));
    expect(await tool.execute({ adresse: 'https://example.org/spa' })).toMatch(/keinen lesbaren Text/i);
  });

  it('meldet einen Fehlerstatus verständlich', async () => {
    const err = new Error('404');
    err.response = { status: 404 };
    axios.get.mockRejectedValue(err);
    expect(await tool.execute({ adresse: 'https://example.org/weg' })).toMatch(/Status 404/);
  });
});
