/**
 * Startet den Ausgangs-Proxy (J38). Die Entscheidungen stehen in `proxy.js`.
 *
 * Regeln holt der Proxy vom Backend (`GET /api/ausgang/regeln`), gezaehlte
 * Entscheidungen schickt er dorthin (`POST /api/ausgang/ereignisse`); beide
 * Wege tragen einen Token aus dem Geheimnis des Geraets. Das Backend haelt die
 * Zahlen in Postgres, der Proxy selbst speichert nichts: ein Neustart des
 * Proxys verliert hoechstens die letzten fuenf Sekunden.
 */
const fs = require('fs');
const { erzeugeProxy, tokenFuer } = require('./proxy');

const PORT = Number(process.env.PORT || 3128);
const BACKEND = process.env.BACKEND_URL || 'http://dashboard-backend:3001';
const REGEL_MS = Number(process.env.REGEL_INTERVALL_MS || 10000);
const SENDE_MS = Number(process.env.SENDE_INTERVALL_MS || 5000);

const geheimnis = (
  process.env.JWT_SECRET || fs.readFileSync(process.env.JWT_SECRET_FILE, 'utf8')
).trim();
const token = tokenFuer(geheimnis, 'dienst');
const log = msg => console.log(`${new Date().toISOString()} ${msg}`);

async function backend(pfad, optionen = {}) {
  const antwort = await fetch(`${BACKEND}/api/ausgang/${pfad}`, {
    ...optionen,
    headers: { 'content-type': 'application/json', 'x-egress-token': token },
    signal: AbortSignal.timeout(8000),
  });
  if (!antwort.ok) {
    throw new Error(`Backend antwortet ${antwort.status}`);
  }
  return antwort.json();
}

const proxy = erzeugeProxy({
  geheimnis,
  log,
  holeRegeln: async () => (await backend('regeln')).regeln,
  sende: ereignisse =>
    backend('ereignisse', { method: 'POST', body: JSON.stringify({ ereignisse }) }),
});

proxy.ladeRegeln();
setInterval(() => proxy.ladeRegeln(), REGEL_MS).unref();
setInterval(() => proxy.sendeZaehler(), SENDE_MS).unref();
proxy.server.listen(PORT, '0.0.0.0', () => log(`Ausgangs-Proxy auf ${PORT}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    await proxy.sendeZaehler();
    process.exit(0);
  });
}
