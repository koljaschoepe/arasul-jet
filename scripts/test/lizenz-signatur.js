#!/usr/bin/env node
/**
 * Ohne gueltige Signatur bleibt jedes Geraet community (Auftrag J32, 17.09.2026)
 *
 * Gemessen wird `services/app/licenseService.js` selbst, ohne Server und ohne
 * Datenbank, in einem Wegwerfordner: `LICENSE_FILE` und
 * `LICENSE_PUBLIC_KEY_PATH` zeigen dorthin, und jeder Fall bekommt eine
 * frische Instanz, damit der Fuenf-Minuten-Cache des Dienstes nicht einen Fall
 * mit dem Ergebnis des vorigen beantwortet.
 *
 * Die drei Faelle aus der Abnahme, dazu zwei, die die Ablage halten:
 *
 *   1. Der oeffentliche Schluessel FEHLT. Bis J32 griff hier der Grace-Mode
 *      und vergab `professional` an jede Zeichenkette mit einem Punkt. Jetzt:
 *      Ablehnung mit Grund, keine Datei auf der Platte, community, maxApps 3.
 *      Auch eine Lizenzdatei, die schon liegt (aus der Zeit davor), zaehlt
 *      ohne Schluessel nichts mehr.
 *   2. Die Signatur ist FALSCH (ein anderer Schluessel hat unterschrieben, oder
 *      es war gar keine Lizenz, sondern eine erratene Zeichenkette): dito.
 *   3. Die Signatur ist RICHTIG: professional, maxApps -1, die Datei liegt,
 *      und eine frische Instanz liest sie wieder als gueltig.
 *   4. Der Schluessel im Repo (`config/public_license_key.pem`) ist ein
 *      RSA-Schluessel mit mindestens 4096 Bit, und eine Lizenz aus einem
 *      Wegwerf-Paar besteht gegen ihn NICHT -- sonst haette jeder den
 *      privaten Schluessel.
 *   5. Compose reicht genau diese Datei an den Pfad, den der Dienst liest.
 *      Ein Schluessel, der im Repo liegt und im Container fehlt, waere Fall 1
 *      auf jedem Geraet, und nichts hier wuerde rot.
 *
 *   6. Das Signierwerkzeug (`scripts/util/lizenz-signieren.js`, 23.09.2026)
 *      gibt eine Lizenz aus, die besteht, und `maxApps` aus der Nutzlast
 *      ersetzt die Zahl der Stufe; eine unzulaessige Zahl oder eine
 *      unbekannte Stufe wird abgelehnt.
 *   7. `deactivateLicense` nimmt die Datei weg und meldet sofort community,
 *      und die Datei liegt in einem Mount statt im Container.
 *   8. Der Fingerabdruck haengt an der machine-id des Hosts und nicht an der
 *      MAC des Containers -- sonst stirbt jede gebundene Lizenz beim Deploy.
 *   9. Die Stufen aus dem Beschluss vom 25.09.2026 (J35): community drei
 *      Konten und drei Apps, professional ohne Grenzen, enterprise wie
 *      professional; `maxUsers` aus der Nutzlast ersetzt die Zahl der Stufe;
 *      und der Cache folgt der DATEI -- was ein zweiter Prozess einspielt
 *      (`lizenz-geraet.sh`), sieht das laufende Backend sofort.
 *  10. Der Einstieg hinter `lizenz-geraet.sh` (`src/cli/lizenz.js`) kennt
 *      seit dem 25.09.2026 auch `entfernen`: genau eine Zeile JSON, die
 *      Datei ist weg, danach community -- und ein zweites Mal ist kein
 *      Fehler. Gemessen als eigener Prozess, wie ihn `docker exec` startet.
 *
 * Aufruf: node scripts/test/lizenz-signatur.js   (braucht node_modules des
 * Backends fuer winston; laeuft im CI-Job "Backend" und in run-tests.sh)
 * Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
 */
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WURZEL = path.resolve(__dirname, '..', '..');
const DIENST = path.join(WURZEL, 'apps/dashboard-backend/src/services/app/licenseService.js');
const SCHLUESSEL_IM_REPO = path.join(WURZEL, 'config/public_license_key.pem');
const COMPOSE = path.join(WURZEL, 'compose/compose.app.yaml');
const PFAD_IM_CONTAINER = '/arasul/config/public_license_key.pem';
const LIZENZ_IM_CONTAINER = '/arasul/lizenz/license.key';
const WERKZEUG = path.join(WURZEL, 'scripts/util/lizenz-signieren.js');
const EINSTIEG = path.join(WURZEL, 'apps/dashboard-backend/src/cli/lizenz.js');

process.env.LOG_LEVEL = 'error';
const ARBEIT = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-lizenz-'));
const LIZENZ = path.join(ARBEIT, 'license.key');
const SCHLUESSEL = path.join(ARBEIT, 'public_license_key.pem');
process.env.LICENSE_FILE = LIZENZ;
process.env.LICENSE_PUBLIC_KEY_PATH = SCHLUESSEL;

let gruen = 0;
let rot = 0;
function pruefe(was, ok, detail = '') {
  if (ok) {
    gruen += 1;
    console.log(`gruen  ${was}${detail ? `  (${detail})` : ''}`);
  } else {
    rot += 1;
    console.log(`ROT    ${was}${detail ? `  (${detail})` : ''}`);
  }
}

// Eine frische Instanz je Fall: das Modul haelt seinen Cache im Singleton.
function frisch() {
  delete require.cache[require.resolve(DIENST)];
  return require(DIENST);
}

function paar() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

// Dasselbe Verfahren, das der Dienst prueft: RSA-PSS ueber sha256, die
// Nutzlast als base64(JSON), dahinter ein Punkt und base64(Signatur).
function signiere(privat, nutzlast) {
  const buf = Buffer.from(JSON.stringify(nutzlast));
  const sig = crypto.sign('sha256', buf, {
    key: privat,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
  });
  return `${buf.toString('base64')}.${sig.toString('base64')}`;
}

const inEinemJahr = new Date(Date.now() + 365 * 86400_000).toISOString();
const NUTZLAST = {
  customer: 'Probe GmbH',
  tier: 'professional',
  issued_at: new Date().toISOString(),
  expires_at: inEinemJahr,
};

function aufraeumen() {
  fs.rmSync(LIZENZ, { force: true });
  fs.rmSync(SCHLUESSEL, { force: true });
}

async function main() {
  const A = paar();
  const B = paar();
  const lizenzVonA = signiere(A.privateKey, NUTZLAST);
  const lizenzVonB = signiere(B.privateKey, NUTZLAST);
  const geraten = 'irgendeine-zeichenkette.mit-einem-punkt';

  // --- 1. Der Schluessel fehlt --------------------------------------------
  console.log('\n--- 1. Der oeffentliche Schluessel fehlt');
  aufraeumen();
  let dienst = frisch();
  let ergebnis = await dienst.activateLicense(lizenzVonA);
  pruefe('Aktivieren wird abgelehnt', ergebnis.success === false);
  pruefe(
    'und die Meldung nennt den Grund: der Schluessel fehlt',
    /Lizenzschluessel fehlt/.test(ergebnis.error || '') && /community/.test(ergebnis.error || ''),
    ergebnis.error
  );
  pruefe('Es liegt danach keine Lizenzdatei', !fs.existsSync(LIZENZ));
  let info = await dienst.getLicenseInfo();
  pruefe(
    'GET /api/license/info bleibt community mit maxApps 3',
    info.tier === 'community' && info.features.maxApps === 3 && info.valid === false,
    `tier=${info.tier}, maxApps=${info.features.maxApps}`
  );

  // Eine Datei, die schon liegt (aus der Zeit vor J32): der alte Grace-Mode.
  fs.writeFileSync(LIZENZ, lizenzVonA);
  dienst = frisch();
  ergebnis = await dienst.validateLicense();
  pruefe(
    'Eine liegende Lizenzdatei ohne Schluessel zaehlt nichts (kein Grace-Mode)',
    ergebnis.valid === false && ergebnis.tier === 'community' && !ergebnis.graceMode,
    `tier=${ergebnis.tier}`
  );
  aufraeumen();

  // --- 2. Die Signatur ist falsch -----------------------------------------
  console.log('\n--- 2. Die Signatur ist falsch');
  fs.writeFileSync(SCHLUESSEL, A.publicKey);
  dienst = frisch();
  ergebnis = await dienst.activateLicense(lizenzVonB);
  pruefe('Eine Lizenz aus einem fremden Schluessel wird abgelehnt', ergebnis.success === false);
  pruefe(
    'und die Meldung nennt den Grund: die Signatur',
    /Signatur/.test(ergebnis.error || '') && /community/.test(ergebnis.error || ''),
    ergebnis.error
  );
  pruefe('Es liegt danach keine Lizenzdatei', !fs.existsSync(LIZENZ));
  ergebnis = await dienst.activateLicense(geraten);
  pruefe(
    'Eine erratene Zeichenkette mit Punkt wird abgelehnt',
    ergebnis.success === false && /Signatur/.test(ergebnis.error || ''),
    ergebnis.error
  );
  pruefe('Es liegt auch danach keine Lizenzdatei', !fs.existsSync(LIZENZ));
  info = await frisch().getLicenseInfo();
  pruefe(
    'GET /api/license/info bleibt community mit maxApps 3',
    info.tier === 'community' && info.features.maxApps === 3,
    `tier=${info.tier}, maxApps=${info.features.maxApps}`
  );

  // --- 3. Die Signatur ist richtig ----------------------------------------
  console.log('\n--- 3. Die Signatur ist richtig');
  dienst = frisch();
  ergebnis = await dienst.activateLicense(lizenzVonA);
  pruefe('Aktivieren gelingt', ergebnis.success === true, ergebnis.error);
  pruefe(
    'und die Stufe ist professional mit maxApps -1',
    ergebnis.license?.tier === 'professional' && ergebnis.license?.features?.maxApps === -1,
    `tier=${ergebnis.license?.tier}, maxApps=${ergebnis.license?.features?.maxApps}`
  );
  pruefe('Die Lizenzdatei liegt jetzt', fs.existsSync(LIZENZ));
  info = await frisch().getLicenseInfo();
  pruefe(
    'Eine frische Instanz liest sie wieder als gueltig',
    info.valid === true && info.tier === 'professional' && info.customer === 'Probe GmbH',
    `tier=${info.tier}, customer=${info.customer}`
  );
  // Und eine Ablehnung DANACH laesst die gueltige Lizenz liegen.
  ergebnis = await frisch().activateLicense(geraten);
  pruefe(
    'Eine abgelehnte Lizenz ueberschreibt die gueltige nicht',
    ergebnis.success === false && fs.readFileSync(LIZENZ, 'utf8') === lizenzVonA
  );
  aufraeumen();

  // --- 4. Der Schluessel im Repo ------------------------------------------
  console.log('\n--- 4. Der oeffentliche Schluessel im Repo');
  pruefe('config/public_license_key.pem liegt im Repo', fs.existsSync(SCHLUESSEL_IM_REPO));
  let bits = 0;
  let art = '';
  try {
    const k = crypto.createPublicKey(fs.readFileSync(SCHLUESSEL_IM_REPO, 'utf8'));
    art = k.asymmetricKeyType;
    bits = k.asymmetricKeyDetails?.modulusLength || 0;
  } catch (e) {
    art = `laedt nicht: ${e.message}`;
  }
  pruefe(
    'und ist ein RSA-Schluessel mit mindestens 4096 Bit',
    art === 'rsa' && bits >= 4096,
    `${art} ${bits}`
  );
  pruefe(
    'und nichts darin ist ein privater Schluessel',
    !/PRIVATE KEY/.test(fs.readFileSync(SCHLUESSEL_IM_REPO, 'utf8'))
  );
  fs.copyFileSync(SCHLUESSEL_IM_REPO, SCHLUESSEL);
  ergebnis = await frisch().activateLicense(lizenzVonA);
  pruefe(
    'Eine Lizenz aus einem Wegwerf-Paar besteht gegen ihn nicht',
    ergebnis.success === false && /Signatur/.test(ergebnis.error || ''),
    ergebnis.error
  );
  aufraeumen();

  // --- 5. Die Ablage ------------------------------------------------------
  console.log('\n--- 5. Compose reicht den Schluessel an den Pfad, den der Dienst liest');
  const compose = fs.readFileSync(COMPOSE, 'utf8');
  const dienstText = fs.readFileSync(DIENST, 'utf8');
  pruefe(
    `compose.app.yaml haengt config/public_license_key.pem nur lesbar nach ${PFAD_IM_CONTAINER}`,
    compose.includes(`../config/public_license_key.pem:${PFAD_IM_CONTAINER}:ro`)
  );
  pruefe(
    'und licenseService.js liest genau diesen Pfad als Vorgabe',
    dienstText.includes(`'${PFAD_IM_CONTAINER}'`)
  );
  pruefe(
    'licenseService.js kennt keinen Grace-Mode ohne Schluessel mehr',
    !/running in grace mode/.test(dienstText) && !/grace period active/.test(dienstText)
  );

  // --- 6. Das Signierwerkzeug und maxApps aus der Nutzlast (23.09.2026) ----
  // Das Werkzeug wird mit einem Wegwerf-Paar gemessen: der private Schluessel
  // kommt ueber STDIN (so wie er im Schluesselbund liegt: base64 der PEM),
  // der oeffentliche ueber dieselbe Variable wie im Dienst.
  console.log('\n--- 6. Das Signierwerkzeug, maxApps aus der Nutzlast');
  fs.writeFileSync(SCHLUESSEL, A.publicKey);
  const werkzeug = (args, schluessel = A.privateKey) =>
    spawnSync(process.execPath, [WERKZEUG, '--schluessel-stdin', ...args], {
      input: Buffer.from(schluessel).toString('base64'),
      encoding: 'utf8',
      env: { ...process.env, LICENSE_PUBLIC_KEY_PATH: SCHLUESSEL },
    });
  let lauf = werkzeug(['--kunde', 'Testlizenz', '--max-apps', '5', '--tage', '1']);
  const ausWerkzeug = lauf.stdout.trim();
  pruefe(
    'Das Werkzeug gibt eine Zeile <Nutzlast>.<Signatur> aus',
    lauf.status === 0 && /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(ausWerkzeug),
    lauf.stderr.trim()
  );
  pruefe(
    'und der private Schluessel steht in keiner seiner Ausgaben',
    !/PRIVATE KEY/.test(lauf.stdout + lauf.stderr) &&
      !(lauf.stdout + lauf.stderr).includes(
        Buffer.from(A.privateKey).toString('base64').slice(40, 120)
      )
  );
  ergebnis = await frisch().activateLicense(ausWerkzeug);
  pruefe(
    'Die Lizenz aus dem Werkzeug besteht, und maxApps kommt aus der Nutzlast',
    ergebnis.success === true && ergebnis.license?.features?.maxApps === 5,
    `tier=${ergebnis.license?.tier}, maxApps=${ergebnis.license?.features?.maxApps}`
  );
  const grenze = await frisch().checkLimit('maxApps', 5);
  pruefe(
    'und die Grenze greift bei genau dieser Zahl (5 belegt: keine sechste)',
    grenze.allowed === false && grenze.limit === 5,
    JSON.stringify(grenze)
  );
  pruefe(
    'die uebrigen Werte der Stufe bleiben, wie sie sind',
    ergebnis.license?.features?.maxUsers === -1 && ergebnis.license?.features?.externalApi === true
  );
  aufraeumen();

  fs.writeFileSync(SCHLUESSEL, A.publicKey);
  lauf = werkzeug(['--kunde', 'Testlizenz'], B.privateKey);
  pruefe(
    'Mit einem fremden privaten Schluessel gibt das Werkzeug nichts aus',
    lauf.status !== 0 && lauf.stdout.trim() === '' && /besteht nicht/.test(lauf.stderr),
    lauf.stderr.trim()
  );
  lauf = werkzeug(['--kunde', 'Testlizenz', '--max-apps', '0']);
  pruefe('--max-apps 0 lehnt das Werkzeug ab', lauf.status !== 0 && lauf.stdout.trim() === '');

  for (const [zahl, was] of [
    [0, 'maxApps 0'],
    [-2, 'maxApps -2'],
    [2.5, 'maxApps 2.5'],
    ['4', 'maxApps als Zeichenkette'],
  ]) {
    ergebnis = await frisch().activateLicense(
      signiere(A.privateKey, { ...NUTZLAST, maxApps: zahl })
    );
    pruefe(
      `Eine signierte Lizenz mit ${was} wird abgelehnt, mit Grund`,
      ergebnis.success === false && /maxApps/.test(ergebnis.error || ''),
      ergebnis.error
    );
  }
  pruefe('Es liegt danach keine Lizenzdatei', !fs.existsSync(LIZENZ));
  ergebnis = await frisch().activateLicense(
    signiere(A.privateKey, { ...NUTZLAST, tier: 'platin' })
  );
  pruefe(
    'Eine unbekannte Stufe faellt nicht mehr still auf professional',
    ergebnis.success === false && /platin/.test(ergebnis.error || ''),
    ergebnis.error
  );
  ergebnis = await frisch().activateLicense(signiere(A.privateKey, { ...NUTZLAST, maxApps: -1 }));
  pruefe(
    'maxApps -1 heisst unbegrenzt',
    ergebnis.success === true && ergebnis.license?.features?.maxApps === -1
  );

  // --- 7. Entfernen und die Ablage der Lizenzdatei -------------------------
  console.log('\n--- 7. Entfernen, und die Lizenzdatei liegt in einem Mount');
  dienst = frisch();
  await dienst.activateLicense(signiere(A.privateKey, { ...NUTZLAST, maxApps: 4 }));
  pruefe('Vor dem Entfernen: maxApps 4', (await dienst.getLicenseInfo()).features.maxApps === 4);
  const weg = await dienst.deactivateLicense();
  info = await dienst.getLicenseInfo();
  pruefe(
    'Entfernen nimmt die Datei weg, und DIESELBE Instanz meldet sofort community',
    weg.entfernt === true &&
      !fs.existsSync(LIZENZ) &&
      info.tier === 'community' &&
      info.features.maxApps === 3,
    `tier=${info.tier}, maxApps=${info.features.maxApps}`
  );
  const nochmal = await dienst.deactivateLicense();
  pruefe('Entfernen ohne Datei ist kein Fehler', nochmal.entfernt === false);
  pruefe(
    `licenseService.js legt die Lizenz unter ${LIZENZ_IM_CONTAINER} ab`,
    dienstText.includes(`'${LIZENZ_IM_CONTAINER}'`)
  );
  pruefe(
    'und compose.app.yaml haengt dort data/lizenz ein (sonst ist sie nach dem Deploy weg)',
    compose.includes(`\${DATA_PATH:-../data}/lizenz:${path.dirname(LIZENZ_IM_CONTAINER)}\n`)
  );
  const deploy = fs.readFileSync(path.join(WURZEL, 'scripts/deploy/deploy-local.sh'), 'utf8');
  pruefe(
    'deploy-local.sh legt data/lizenz vorher an (sonst gehoert er root)',
    deploy.includes('"$DEPLOY_DIR/data/lizenz"')
  );
  aufraeumen();

  // --- 8. Der Fingerabdruck ueberlebt einen neuen Container ---------------
  // Am Orin gemessen (23.09.2026): nach dem Deploy war die Testlizenz "bound
  // to a different device". Im Container fehlten alle stabilen Kennungen,
  // und der Rueckfall nahm die MAC des Containers -- die Docker bei jedem
  // neuen Container neu wuerfelt. Hier: dieselbe machine-id, eine andere MAC
  // und ein anderer Hostname, und der Fingerabdruck bleibt.
  console.log('\n--- 8. Der Fingerabdruck haengt an der machine-id des Hosts, nicht am Container');
  const MID = path.join(ARBEIT, 'machine-id');
  fs.writeFileSync(MID, 'abcdef0123456789abcdef0123456789\n');
  process.env.LICENSE_MACHINE_ID_PATH = MID;
  const echtNetz = os.networkInterfaces;
  const echtName = os.hostname;
  const alsContainer = (mac, name) => {
    os.networkInterfaces = () => ({
      eth0: [{ internal: false, mac, address: '172.30.0.9', family: 'IPv4' }],
    });
    os.hostname = () => name;
  };
  let vorher;
  let nachher;
  try {
    alsContainer('02:42:ac:1e:00:09', 'a1b2c3d4e5f6');
    vorher = await frisch().getHardwareFingerprint();
    alsContainer('02:42:ac:1e:00:0a', 'f6e5d4c3b2a1');
    nachher = await frisch().getHardwareFingerprint();
  } finally {
    os.networkInterfaces = echtNetz;
    os.hostname = echtName;
    delete process.env.LICENSE_MACHINE_ID_PATH;
  }
  pruefe(
    'Neue MAC, neuer Hostname, dieselbe machine-id: derselbe Fingerabdruck',
    vorher === nachher && /^[0-9a-f]{32}$/.test(vorher),
    `${vorher} / ${nachher}`
  );
  pruefe(
    'compose.app.yaml reicht die machine-id des Hosts nur lesbar herein',
    compose.includes('${MACHINE_ID_DATEI:-/etc/machine-id}:/arasul/host/machine-id:ro') &&
      dienstText.includes("'/arasul/host/machine-id'")
  );

  // --- 9. Die Stufen und der Cache an der Datei (J35) ---------------------
  console.log(
    '\n--- 9. community 3/3, professional und enterprise ohne Grenzen, Cache an der Datei'
  );
  aufraeumen();
  fs.writeFileSync(SCHLUESSEL, A.publicKey);
  dienst = frisch();
  info = await dienst.getLicenseInfo();
  pruefe(
    'Ohne Lizenz: community mit drei Konten und drei Apps',
    info.tier === 'community' && info.features.maxUsers === 3 && info.features.maxApps === 3,
    `maxUsers=${info.features.maxUsers}, maxApps=${info.features.maxApps}`
  );
  const viertesKonto = await dienst.checkLimit('maxUsers', 3);
  pruefe(
    'und das vierte Konto geht nicht',
    viertesKonto.allowed === false,
    JSON.stringify(viertesKonto)
  );
  for (const tier of ['professional', 'enterprise']) {
    ergebnis = await frisch().activateLicense(signiere(A.privateKey, { ...NUTZLAST, tier }));
    const f = ergebnis.license?.features || {};
    pruefe(
      `${tier}: keine Grenze fuer Konten und Apps`,
      ergebnis.success === true &&
        ergebnis.license.tier === tier &&
        f.maxUsers === -1 &&
        f.maxApps === -1,
      `maxUsers=${f.maxUsers}, maxApps=${f.maxApps}`
    );
  }
  const P = frisch().FEATURE_TIERS;
  pruefe(
    'enterprise hat dieselben Rechte wie professional',
    ['maxUsers', 'maxApps', 'externalApi', 'customModels'].every(
      k => P.enterprise[k] === P.professional[k]
    )
  );
  ergebnis = await frisch().activateLicense(signiere(A.privateKey, { ...NUTZLAST, maxUsers: 7 }));
  pruefe(
    'maxUsers aus der Nutzlast ersetzt die Zahl der Stufe',
    ergebnis.success === true && ergebnis.license?.features?.maxUsers === 7,
    `maxUsers=${ergebnis.license?.features?.maxUsers}`
  );
  ergebnis = await frisch().activateLicense(signiere(A.privateKey, { ...NUTZLAST, maxUsers: 0 }));
  pruefe(
    'maxUsers 0 wird abgelehnt',
    ergebnis.success === false && /maxUsers/.test(ergebnis.error || ''),
    ergebnis.error
  );
  lauf = werkzeug(['--kunde', 'Testlizenz', '--max-konten', '6']);
  ergebnis = await frisch().activateLicense(lauf.stdout.trim());
  pruefe(
    'Das Werkzeug schreibt --max-konten als maxUsers in die Nutzlast',
    lauf.status === 0 && ergebnis.license?.features?.maxUsers === 6,
    lauf.stderr.trim()
  );
  aufraeumen();
  fs.writeFileSync(SCHLUESSEL, A.publicKey);
  const laufend = frisch();
  const vorEinspielen = await laufend.validateLicense();
  // Ein ZWEITER Prozess spielt ein -- hier eine zweite Instanz, die die Datei
  // schreibt; die erste hat ihren Fuenf-Minuten-Cache schon gefuellt.
  delete require.cache[require.resolve(DIENST)];
  await require(DIENST).activateLicense(lizenzVonA);
  const nachEinspielen = await laufend.validateLicense();
  pruefe(
    'Der laufende Dienst sieht eine Lizenz, die ein anderer Prozess eingespielt hat, sofort',
    vorEinspielen.tier === 'community' && nachEinspielen.tier === 'professional',
    `${vorEinspielen.tier} -> ${nachEinspielen.tier}`
  );
  fs.rmSync(LIZENZ);
  pruefe(
    'und ebenso, dass sie wieder weg ist',
    (await laufend.validateLicense()).tier === 'community'
  );
  aufraeumen();

  // --- 10. lizenz-geraet.sh entfernen, ueber den Einstieg im Container ------
  console.log('\n--- 10. Der Einstieg hinter lizenz-geraet.sh: entfernen');
  fs.writeFileSync(SCHLUESSEL, A.publicKey);
  await frisch().activateLicense(lizenzVonA);
  // Die Datenbank ist hier nicht da: das Protokoll (`logSecurityEvent`)
  // schluckt den Fehler, also zeigt der Port ins Leere statt auf ein Geraet.
  const cli = befehl =>
    spawnSync(process.execPath, [EINSTIEG, befehl], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        POSTGRES_PASSWORD: 'unbenutzt',
        POSTGRES_HOST: '127.0.0.1',
        POSTGRES_PORT: '1',
      },
    });
  const zeilenAus = lauf => lauf.stdout.split('\n').filter(Boolean);
  let cliLauf = cli('entfernen');
  let zeilen = zeilenAus(cliLauf);
  let antwort = zeilen.length === 1 ? JSON.parse(zeilen[0]) : null;
  pruefe(
    'entfernen: genau eine Zeile {"ok":true,"entfernt":true,"stufe":"community"}, Datei weg',
    cliLauf.status === 0 &&
      antwort?.ok === true &&
      antwort.entfernt === true &&
      antwort.stufe === 'community' &&
      !fs.existsSync(LIZENZ),
    cliLauf.stdout.trim() || cliLauf.stderr.trim()
  );
  cliLauf = cli('entfernen');
  zeilen = zeilenAus(cliLauf);
  antwort = zeilen.length === 1 ? JSON.parse(zeilen[0]) : null;
  pruefe(
    'entfernen ohne Datei: ok, entfernt false -- kein Fehler',
    cliLauf.status === 0 && antwort?.ok === true && antwort.entfernt === false,
    cliLauf.stdout.trim() || cliLauf.stderr.trim()
  );
  const skript = fs.readFileSync(path.join(WURZEL, 'scripts/util/lizenz-geraet.sh'), 'utf8');
  pruefe(
    'lizenz-geraet.sh laesst entfernen durch und beschreibt es im Vertrag',
    /fingerabdruck \| status \| einspielen \| entfernen\)/.test(skript) &&
      skript.includes('lizenz-geraet.sh entfernen')
  );
  aufraeumen();
}

main()
  .then(() => {
    fs.rmSync(ARBEIT, { recursive: true, force: true });
    console.log('');
    if (rot === 0) {
      console.log(`${gruen} von ${gruen} gruen`);
      process.exit(0);
    }
    console.log(`${gruen} von ${gruen + rot} gruen, ${rot} rot`);
    process.exit(1);
  })
  .catch(e => {
    fs.rmSync(ARBEIT, { recursive: true, force: true });
    console.error(`Abbruch: ${e.stack || e.message}`);
    process.exit(1);
  });
