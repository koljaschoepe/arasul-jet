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
 * Aufruf: node scripts/test/lizenz-signatur.js   (braucht node_modules des
 * Backends fuer winston; laeuft im CI-Job "Backend" und in run-tests.sh)
 * Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WURZEL = path.resolve(__dirname, '..', '..');
const DIENST = path.join(WURZEL, 'apps/dashboard-backend/src/services/app/licenseService.js');
const SCHLUESSEL_IM_REPO = path.join(WURZEL, 'config/public_license_key.pem');
const COMPOSE = path.join(WURZEL, 'compose/compose.app.yaml');
const PFAD_IM_CONTAINER = '/arasul/config/public_license_key.pem';

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
