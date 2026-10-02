const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const net = require('net');
const { erzeugeProxy, tokenFuer, leseZugang, istPrivat, leseZiel } = require('../proxy');

const GEHEIM = 'x'.repeat(40);
const zugang = name =>
  `Basic ${Buffer.from(`${name}:${tokenFuer(GEHEIM, name)}`).toString('base64')}`;

async function starte({ regeln, privateErlauben = true } = {}) {
  const gesendet = [];
  const proxy = erzeugeProxy({
    geheimnis: GEHEIM,
    holeRegeln: async () => regeln,
    sende: async e => gesendet.push(...e),
    privateErlauben,
  });
  await proxy.ladeRegeln();
  await new Promise(r => proxy.server.listen(0, '127.0.0.1', r));
  return { proxy, gesendet, port: proxy.server.address().port };
}

function connect(port, ziel, kopf) {
  return new Promise((ok, fehler) => {
    const s = net.connect(port, '127.0.0.1', () => {
      s.write(
        `CONNECT ${ziel} HTTP/1.1\r\nHost: ${ziel}\r\n${kopf ? `Proxy-Authorization: ${kopf}\r\n` : ''}\r\n`
      );
    });
    s.once('data', d => ok({ status: Number(d.toString().split(' ')[1]), sock: s }));
    s.on('error', fehler);
  });
}

test('Token und Zugang', () => {
  assert.deepStrictEqual(leseZugang(zugang('arasul-app-belege-live'), GEHEIM), {
    appId: 'belege',
    stand: 'live',
  });
  assert.strictEqual(leseZugang(zugang('arasul-app-belege-live'), 'anderes'.repeat(6)), null);
  assert.strictEqual(leseZugang(undefined, GEHEIM), null);
  const falsch = `Basic ${Buffer.from('arasul-app-a-live:abc').toString('base64')}`;
  assert.strictEqual(leseZugang(falsch, GEHEIM), null);
  assert.strictEqual(leseZugang(zugang('irgendwas'), GEHEIM), null);
});

test('private Adressen und Ziele', () => {
  for (const a of [
    '10.1.2.3',
    '127.0.0.1',
    '192.168.0.5',
    '172.20.1.1',
    '169.254.1.1',
    '::1',
    'fd00::1',
    '::ffff:10.0.0.1',
  ]) {
    assert.ok(istPrivat(a), a);
  }
  for (const a of ['93.184.216.34', '1.1.1.1', '2606:2800:220:1::1']) {
    assert.ok(!istPrivat(a), a);
  }
  assert.deepStrictEqual(leseZiel('Example.org:443'), { host: 'example.org', port: 443 });
  assert.strictEqual(leseZiel('ohne-port'), null);
});

test('CONNECT: freigegebenes Ziel geht durch, anderes wird abgewiesen und gezaehlt', async () => {
  const ziel = net.createServer(s => s.end('hallo'));
  await new Promise(r => ziel.listen(0, r));
  const { proxy, gesendet, port } = await starte({ regeln: { 'belege:live': ['localhost'] } });

  const gut = await connect(
    port,
    `localhost:${ziel.address().port}`,
    zugang('arasul-app-belege-live')
  );
  assert.strictEqual(gut.status, 200);
  gut.sock.destroy();

  const nein = await connect(port, 'example.org:443', zugang('arasul-app-belege-live'));
  assert.strictEqual(nein.status, 403);

  // gleiche Adresse, anderer Stand: nicht eingetragen
  const test_ = await connect(
    port,
    `localhost:${ziel.address().port}`,
    zugang('arasul-app-belege-test')
  );
  assert.strictEqual(test_.status, 403);

  const ohne = await connect(port, 'localhost:1', null);
  assert.strictEqual(ohne.status, 407);

  await proxy.sendeZaehler();
  const s = (h, e, a) => gesendet.find(x => x.host === h && x.ergebnis === e && x.stand === a);
  assert.strictEqual(s('localhost', 'erlaubt', 'live').anzahl, 1);
  assert.strictEqual(s('example.org', 'abgewiesen', 'live').anzahl, 1);
  assert.strictEqual(s('localhost', 'abgewiesen', 'test').anzahl, 1);
  assert.strictEqual(gesendet.length, 3); // der Aufruf ohne Zugang zaehlt nicht

  proxy.server.closeAllConnections();
  proxy.server.close();
  ziel.closeAllConnections?.();
  ziel.close();
});

test('Ohne Regeln ist alles zu; private Adresse wird auch bei Freigabe abgewiesen', async () => {
  const { proxy, port } = await starte({
    regeln: { 'a:live': ['localhost'] },
    privateErlauben: false,
  });
  const r = await connect(port, 'localhost:80', zugang('arasul-app-a-live'));
  assert.strictEqual(r.status, 403);
  proxy.server.closeAllConnections();
  proxy.server.close();

  const leer = erzeugeProxy({
    geheimnis: GEHEIM,
    holeRegeln: async () => {
      throw new Error('aus');
    },
    sende: async () => {},
  });
  await leer.ladeRegeln();
  await new Promise(ok => leer.server.listen(0, '127.0.0.1', ok));
  const r2 = await connect(leer.server.address().port, 'localhost:80', zugang('arasul-app-a-live'));
  assert.strictEqual(r2.status, 403);
  leer.server.closeAllConnections();
  leer.server.close();
});

test('Fehlgeschlagenes Senden behaelt die Zahlen', async () => {
  let ankommen = false;
  const proxy = erzeugeProxy({
    geheimnis: GEHEIM,
    holeRegeln: async () => ({}),
    sende: async () => {
      if (!ankommen) throw new Error('aus');
    },
  });
  proxy.zaehle('a', 'live', 'x.org', 'abgewiesen');
  await proxy.sendeZaehler();
  assert.strictEqual(proxy.zaehler.size, 1);
  ankommen = true;
  await proxy.sendeZaehler();
  assert.strictEqual(proxy.zaehler.size, 0);
});

test('HTTP mit absoluter URL und /health', async () => {
  const ziel = http.createServer((q, a) => a.end('antwort'));
  await new Promise(r => ziel.listen(0, r));
  const { proxy, port } = await starte({ regeln: { 'a:live': ['localhost'] } });
  const hole = (pfad, kopf = {}) =>
    new Promise(ok => {
      http.get({ host: '127.0.0.1', port, path: pfad, headers: kopf }, r => {
        let t = '';
        r.on('data', d => (t += d));
        r.on('end', () => ok({ status: r.statusCode, t }));
      });
    });
  const gut = await hole(`http://localhost:${ziel.address().port}/x`, {
    'proxy-authorization': zugang('arasul-app-a-live'),
  });
  assert.deepStrictEqual([gut.status, gut.t], [200, 'antwort']);
  const nein = await hole('http://example.org/', {
    'proxy-authorization': zugang('arasul-app-a-live'),
  });
  assert.strictEqual(nein.status, 403);
  assert.strictEqual((await hole('/health')).status, 200);
  proxy.server.closeAllConnections();
  proxy.server.close();
  ziel.closeAllConnections?.();
  ziel.close();
});
