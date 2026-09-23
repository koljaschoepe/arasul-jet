#!/usr/bin/env node
/**
 * Signiert eine Lizenz fuer ein Arasul-Geraet (Auftrag J32, 23.09.2026).
 *
 * Das Gegenstueck zur Pruefseite in
 * `apps/dashboard-backend/src/services/app/licenseService.js`: dieselbe Form
 * (`base64(JSON-Nutzlast).base64(Signatur)`), dasselbe Verfahren (RSA-PSS
 * ueber sha256). Ohne Stripe, ohne Kauf, ohne Netz -- eine Lizenz ist eine
 * unterschriebene Zeile, und wer den privaten Schluessel hat, stellt sie aus.
 *
 * DER PRIVATE SCHLUESSEL BERUEHRT NIE DIE PLATTE. Er liegt im macOS-
 * Schluesselbund (Konto `arasul`, Dienst `Arasul Lizenz privat`, eine Zeile
 * base64 der PEM-Datei); dieses Werkzeug liest ihn von dort in den Speicher
 * und gibt ihn nirgends aus. Wer nicht auf dem Mac sitzt, reicht ihn ueber
 * STDIN herein (`--schluessel-stdin`, PEM oder base64 der PEM) -- nie als
 * Argument, denn Argumente stehen in `ps` und in der Shell-Historie.
 *
 * GEPRUEFT WIRD, BEVOR AUSGEGEBEN WIRD: die fertige Lizenz muss gegen
 * `config/public_license_key.pem` bestehen, den Schluessel, den jedes Geraet
 * traegt. Ein falscher privater Schluessel ergaebe sonst eine Zeile, die erst
 * beim Kunden mit "Signatur ungueltig" zurueckkommt.
 *
 * Aufruf:
 *   node scripts/util/lizenz-signieren.js --kunde "Muster GmbH" \
 *     --stufe professional --max-apps 5 --tage 365 \
 *     [--geraet <hardwareFingerprint>] [--aus lizenz.key]
 *
 * Ohne `--aus` steht die Lizenz auf STDOUT (eine Zeile), alles andere auf
 * STDERR -- so laesst sie sich direkt in eine Variable lesen.
 * `--geraet` bindet die Lizenz an ein Geraet (`GET /api/license/fingerprint`);
 * ohne gilt sie auf jedem Geraet dieses Produkts.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.resolve(__dirname, '..', '..');
// Dieselbe Variable wie im Dienst: der Test misst das Werkzeug mit einem
// Wegwerf-Paar (`scripts/test/lizenz-signatur.js`, Abschnitt 6).
const OEFFENTLICH =
  process.env.LICENSE_PUBLIC_KEY_PATH || path.join(WURZEL, 'config/public_license_key.pem');
const STUFEN = ['professional', 'enterprise'];
const SCHLUESSELBUND = { dienst: 'Arasul Lizenz privat', konto: 'arasul' };

function abbruch(meldung) {
  process.stderr.write(`lizenz-signieren: ${meldung}\n`);
  process.exit(2);
}

function argumente(argv) {
  const a = { stufe: 'professional', tage: 365, schluesselStdin: false };
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i];
    const wert = () => {
      if (i + 1 >= argv.length) {
        abbruch(`${name} braucht einen Wert`);
      }
      i += 1;
      return argv[i];
    };
    switch (name) {
      case '--kunde':
        a.kunde = wert();
        break;
      case '--stufe':
        a.stufe = wert();
        break;
      case '--max-apps':
        a.maxApps = wert();
        break;
      case '--tage':
        a.tage = wert();
        break;
      case '--geraet':
        a.geraet = wert();
        break;
      case '--aus':
        a.aus = wert();
        break;
      case '--schluessel-stdin':
        a.schluesselStdin = true;
        break;
      case '-h':
      case '--hilfe':
        process.stderr.write(
          fs
            .readFileSync(__filename, 'utf8')
            .split('*/')[0]
            .replace(/^\/\*\*|^ \* ?/gm, '')
        );
        process.exit(0);
        break;
      default:
        abbruch(`unbekanntes Argument ${name} (--hilfe)`);
    }
  }
  if (!a.kunde) {
    abbruch('--kunde fehlt: eine Lizenz nennt, fuer wen sie gilt');
  }
  if (!STUFEN.includes(a.stufe)) {
    abbruch(`--stufe ${a.stufe} gibt es nicht (${STUFEN.join(', ')})`);
  }
  if (a.maxApps !== undefined) {
    const zahl = Number(a.maxApps);
    if (!Number.isInteger(zahl) || (zahl < 1 && zahl !== -1)) {
      abbruch(`--max-apps ${a.maxApps}: eine ganze Zahl ab 1, oder -1 fuer unbegrenzt`);
    }
    a.maxApps = zahl;
  }
  const tage = Number(a.tage);
  if (!Number.isInteger(tage) || tage < 1) {
    abbruch(`--tage ${a.tage}: eine ganze Zahl ab 1`);
  }
  a.tage = tage;
  if (a.geraet !== undefined && !/^[0-9a-f]{32}$/.test(a.geraet)) {
    abbruch('--geraet: 32 Hexzeichen, wie GET /api/license/fingerprint sie nennt');
  }
  return a;
}

// PEM oder eine Zeile base64 der PEM -- so liegt er im Schluesselbund.
function alsPem(roh) {
  const text = roh.trim();
  if (text.includes('-----BEGIN')) {
    return text;
  }
  const entpackt = Buffer.from(text, 'base64').toString('utf8');
  if (!entpackt.includes('-----BEGIN')) {
    abbruch('der private Schluessel ist weder PEM noch base64 einer PEM-Datei');
  }
  return entpackt;
}

function privaterSchluessel(ausStdin) {
  let roh;
  if (ausStdin) {
    roh = fs.readFileSync(0, 'utf8');
  } else {
    if (process.platform !== 'darwin') {
      abbruch('kein macOS-Schluesselbund hier; den Schluessel ueber --schluessel-stdin reichen');
    }
    try {
      roh = execFileSync(
        'security',
        ['find-generic-password', '-s', SCHLUESSELBUND.dienst, '-a', SCHLUESSELBUND.konto, '-w'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
    } catch {
      abbruch(
        `im Schluesselbund steht kein Eintrag "${SCHLUESSELBUND.dienst}" (Konto ${SCHLUESSELBUND.konto})`
      );
    }
  }
  try {
    return crypto.createPrivateKey(alsPem(roh));
  } catch (e) {
    // Die Meldung von OpenSSL nennt den Schluessel nicht; sie darf durch.
    return abbruch(`der private Schluessel laedt nicht: ${e.message}`);
  }
}

function signiere(privat, nutzlast) {
  const buf = Buffer.from(JSON.stringify(nutzlast), 'utf8');
  const sig = crypto.sign('sha256', buf, {
    key: privat,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
  });
  return { lizenz: `${buf.toString('base64')}.${sig.toString('base64')}`, buf, sig };
}

function main() {
  const a = argumente(process.argv.slice(2));
  const jetzt = new Date();
  const nutzlast = {
    customer: a.kunde,
    tier: a.stufe,
    issued_at: jetzt.toISOString(),
    expires_at: new Date(jetzt.getTime() + a.tage * 86400_000).toISOString(),
  };
  if (a.maxApps !== undefined) {
    nutzlast.maxApps = a.maxApps;
  }
  if (a.geraet) {
    nutzlast.hardware_id = a.geraet;
  }

  const { lizenz, buf, sig } = signiere(privaterSchluessel(a.schluesselStdin), nutzlast);

  const besteht = crypto.verify(
    'sha256',
    buf,
    { key: fs.readFileSync(OEFFENTLICH, 'utf8'), padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
    sig
  );
  if (!besteht) {
    abbruch(
      `die Lizenz besteht nicht gegen ${OEFFENTLICH} -- der private ` +
        'Schluessel gehoert nicht zu diesem Produkt. Nichts ausgegeben.'
    );
  }

  if (a.aus) {
    fs.writeFileSync(a.aus, `${lizenz}\n`, { mode: 0o600 });
  } else {
    process.stdout.write(`${lizenz}\n`);
  }
  process.stderr.write(
    `lizenz-signieren: ${nutzlast.tier}, maxApps ${a.maxApps ?? '(Vorgabe der Stufe)'}, ` +
      `fuer "${nutzlast.customer}", bis ${nutzlast.expires_at.slice(0, 10)}` +
      `${a.geraet ? `, gebunden an ${a.geraet}` : ', an kein Geraet gebunden'}` +
      `${a.aus ? ` -> ${a.aus}` : ''}\n`
  );
}

main();
