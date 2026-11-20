#!/usr/bin/env node
/**
 * Die Sicherung weg vom Gerät: jede Nacht die Stände des Orin auf den Mac.
 *
 *   node scripts/ops/sicherung-am-mac.mjs --einrichten [--host <adresse>]   Dienst am Mac anlegen und laden
 *   node scripts/ops/sicherung-am-mac.mjs --ziehen [--jetzt]               einen Lauf, ohne --jetzt nur wenn er fällig ist
 *   node scripts/ops/sicherung-am-mac.mjs --status                         letzter Lauf, neuester Stand, Ausfall
 *   node scripts/ops/sicherung-am-mac.mjs --wiederherstellen [--db <name>] [--stand <id>]
 *   node scripts/ops/sicherung-am-mac.mjs --schluessel-holen               Sicherungsschlüssel des Geräts in den Schlüsselbund
 *   node scripts/ops/sicherung-am-mac.mjs --ausfall-probe                  die Meldung einmal auslösen
 *   node scripts/ops/sicherung-am-mac.mjs --entfernen                      Dienst abbauen (die Sicherungen bleiben)
 *
 * WAS GEZOGEN WIRD. Seit M5 (03.10.2026) legt der backup-service jede Nacht
 * einen STAND an: ein restic-Repo je Sicherungsschlüssel unter
 * `data/backups/staende-<abdruck>` am Gerät, darin die Datenbank, jede
 * App-Datenbank, die App-Pakete, Flows, Firmenordner, Konfiguration und WAL.
 * Der Mac bekommt dieses Repo so, wie es am Gerät liegt, verschlüsselt, per
 * rsync. Die Dateien eines restic-Repos ändern sich nie, sie kommen nur dazu
 * oder fallen weg; nach dem ersten Zug überträgt rsync nur die neuen Packs der
 * Nacht (am Orin gemessen etwa 35 MB). Bis zum 04.10.2026 zog dieses Werkzeug
 * einzelne Abzüge aus `postgres/apps/`, die es seitdem nicht mehr gibt; die
 * alten Kopien bleiben unangetastet liegen.
 *
 * WAS WEGFÄLLT, IST NICHT SOFORT WEG. Was am Gerät verschwindet (die
 * Aufbewahrung 7/12/60 und `prune`), verschiebt rsync am Mac in den
 * Papierkorb `papierkorb/<repo>/<zeit>/` statt es zu löschen, und der hält 30
 * Tage. Ein Gerät, dessen Repo auf einmal fehlt, keinen Stand mehr hat oder
 * weniger als die Hälfte seiner Dateien, wird gar nicht gespiegelt: das ist
 * ein Ausfall, kein neuer Stand. Ein Repo mit anderem Abdruck (das Gerät hat
 * einen neuen Schlüssel) entsteht am Mac daneben, das alte bleibt.
 *
 * GEPRÜFT WIRD AM MAC, NICHT AM GERÄT. Nach jedem Zug läuft `restic check` auf
 * der Kopie, mit einem Zwanzigstel der Daten ganz gelesen, und der neueste
 * Stand darin muss jünger als 26 Stunden sein. Dafür braucht der Mac den
 * Schlüssel: er ist der Wiederherstellungscode des Geräts und liegt im
 * Schlüsselbund (Dienst `ara-kit`, Konto `ARASUL_BACKUP_KEY_ORIN_<abdruck>`
 * oder ohne Abdruck). restic holt ihn selbst über `security`; er steht in
 * keiner Datei und in keinem Protokoll.
 *
 * WIE ES DAS GERÄT ERREICHT. SSH mit dem Schlüssel aus der Einrichtung, ohne
 * Rückfrage (BatchMode). Ist das Gerät nicht da, versucht der Dienst es in der
 * nächsten Stunde wieder; die Leitung am Orin ist WLAN, ein abgebrochener Zug
 * setzt mit `--partial` dort fort, wo er stand.
 *
 * WANN GEMELDET WIRD. Sofort, wenn die Kopie nicht stimmt (`restic check`
 * findet einen Fehler, der Schlüssel öffnet sie nicht, das Repo am Gerät ist
 * geschrumpft). Sonst, wenn seit 27 Stunden kein Lauf gelungen ist. Die
 * Meldung ist eine Mitteilung am Mac, die Datei AUSFALL.txt neben den
 * Sicherungen und eine Zeile im Protokoll.
 *
 * DIE WIEDERHERSTELLUNG läuft ganz am Mac: der Abzug einer App-Datenbank aus
 * dem gewählten Stand (`restic dump`) geht im Strom in ein Wegwerf-Postgres in
 * einem eigenen Ordner unter $TMPDIR, eine Transaktion, danach wird gezählt und
 * alles wieder abgebaut. Das Gerät wird dafür nicht gefragt.
 *
 * Reine Standardbibliothek: die Datei wird beim Einrichten nach
 * ~/Library/Application Support/de.arasul.sicherung/sicherung.mjs kopiert und
 * läuft von dort, unabhängig davon, wo der Klon gerade steht. Die Quelle lebt
 * seit dem 20.11.2026 in arasul-jet (vorher arasul-werkstatt, archiviert),
 * neben dem backup-service, dessen Format sie liest.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = homedir();
const NAME = process.env.ARASUL_SICHERUNG_NAME || 'de.arasul.sicherung';
const SUPPORT =
  process.env.ARASUL_SICHERUNG_SUPPORT || join(HOME, 'Library', 'Application Support', NAME);
const PLIST = join(HOME, 'Library', 'LaunchAgents', `${NAME}.plist`);
const LOGDATEI =
  process.env.ARASUL_SICHERUNG_LOG || join(HOME, 'Library', 'Logs', 'arasul-sicherung.log');
const SCHLUESSELBUND = 'ara-kit'; // derselbe Dienstname wie im Kit

const FALLBACK = {
  geraet: 'orin',
  host: '100.121.244.80',
  sshUser: 'arasul',
  sshPort: 22,
  sshKey: 'id_ed25519',
  schluessel: 'ARASUL_BACKUP_KEY_ORIN',
  daten: join(HOME, 'Sicherungen', 'arasul-orin'),
  faelligAb: '05:00', // Ortszeit; das Gerät sichert um 02:00 UTC
  ausfallNachStunden: 27,
  standHoechstensStunden: 26,
  papierkorbTage: 30,
  pruefAnteil: '5%', // so viel der Packs liest `restic check` je Lauf ganz
  // Nur für Proben ohne Gerät: ein lokaler Ordner statt `<host>:<backups>`,
  // und ein Befehl, der den Schlüssel ausgibt, statt des Schlüsselbunds.
  quelle: null,
  passwortBefehl: null,
  // Wo backup.sh die App-Datenbanken in den Stand legt (STAND_DB_QUELLE/apps).
  dbPfad: '/arasul/datenbank/apps',
};

const arg = Object.fromEntries(
  process.argv
    .slice(2)
    .flatMap((wort, i, alle) =>
      wort.startsWith('--')
        ? [
            [
              wort.slice(2),
              alle[i + 1] === undefined || alle[i + 1].startsWith('--') ? true : alle[i + 1],
            ],
          ]
        : []
    )
);

// --- Kleinigkeiten ---------------------------------------------------------------

class Fehler extends Error {
  constructor(art, satz) {
    super(satz);
    this.art = art;
  }
}

const zeit = d =>
  d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' }) : 'nie';
const stunden = d => (d ? (Date.now() - new Date(d).getTime()) / 3600_000 : Infinity);
const vor = d => {
  const h = stunden(d);
  if (h === Infinity) return 'nie';
  if (h < 1.5) return `vor ${Math.round(h * 60)} Minuten`;
  return h < 48 ? `vor ${h.toFixed(1)} Stunden` : `vor ${(h / 24).toFixed(1)} Tagen`;
};
const mb = bytes => `${(bytes / 1e6).toFixed(1)} MB`;

// Unter launchd geht die Standardausgabe schon in das Protokoll (siehe die Plist); dann nicht zweimal.
const VON_LAUNCHD = process.env.XPC_SERVICE_NAME === NAME;

function protokoll(zeile) {
  const text = `${new Date().toISOString()} ${zeile}\n`;
  if (!VON_LAUNCHD) {
    try {
      mkdirSync(dirname(LOGDATEI), { recursive: true });
      appendFileSync(LOGDATEI, text);
    } catch {
      /* ohne Protokoll weiter */
    }
  }
  process.stdout.write(text);
}

const lies = (pfad, standard) => {
  try {
    return JSON.parse(readFileSync(pfad, 'utf8'));
  } catch {
    return standard;
  }
};
const schreibe = (pfad, wert) => {
  mkdirSync(dirname(pfad), { recursive: true });
  const teil = `${pfad}.teil`;
  writeFileSync(teil, JSON.stringify(wert, null, 2) + '\n');
  renameSync(teil, pfad);
};

function konfiguration() {
  const datei = join(SUPPORT, 'config.json');
  if (!existsSync(datei)) {
    throw new Fehler(
      'einrichtung',
      `Es gibt keine Einrichtung (${datei}). Erst: node sicherung.mjs --einrichten`
    );
  }
  const cfg = { ...FALLBACK, ...lies(datei, {}) };
  cfg.dbPfad = posix.normalize(cfg.dbPfad).replace(/\/$/, '');
  if (typeof arg.host === 'string') cfg.host = arg.host; // zum Ausprobieren des Ausfalls: eine Adresse, die nicht antwortet
  return cfg;
}

const zustandsdatei = cfg => join(cfg.daten, 'zustand.json');
const staendeOrdner = cfg => join(cfg.daten, 'staende');

/** Ein Programm laufen lassen, Ausgabe gesammelt; nie mit Shell. */
function laufe(befehl, argumente, { env, eingabe, frist = 0, senke } = {}) {
  return new Promise(ok => {
    const kind = spawn(befehl, argumente, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    const aus = [];
    let err = '';
    let uhr;
    if (frist) uhr = setTimeout(() => kind.kill('SIGKILL'), frist);
    kind.stdout.on('data', s => (senke ? senke(s) : aus.push(s)));
    kind.stderr.on('data', s => (err += s.toString()));
    kind.on('error', e => ok({ code: 127, stdout: '', stderr: e.message }));
    kind.on('close', (code, signal) => {
      clearTimeout(uhr);
      ok({ code: code ?? 128, signal, stdout: Buffer.concat(aus).toString('utf8'), stderr: err });
    });
    kind.stdin.on('error', () => {});
    if (eingabe && typeof eingabe.pipe === 'function') eingabe.pipe(kind.stdin);
    else kind.stdin.end(eingabe ?? '');
  });
}

const letzteZeile = text => text.trim().split('\n').filter(Boolean).pop() || '';

// --- Schlüssel ---------------------------------------------------------------------

function schluesselLesen(name) {
  const lauf = spawnSync(
    'security',
    ['find-generic-password', '-a', name, '-s', SCHLUESSELBUND, '-w'],
    { encoding: 'utf8' }
  );
  return lauf.status === 0 ? lauf.stdout.replace(/\r?\n$/, '') : null;
}

/** Derselbe Abdruck wie `stand_abdruck` in services/backup-service/staende.sh. */
const repoAbdruck = wert =>
  createHash('sha256').update(`arasul-sicherung:${wert}`).digest('hex').slice(0, 16);

/**
 * Wie restic an den Schlüssel zu einem Repo kommt: der Name eines Eintrags im
 * Schlüsselbund, dessen Abdruck zum Repo passt. Zurück kommt nur ein Befehl für
 * RESTIC_PASSWORD_COMMAND, nie der Wert.
 */
const pwCache = new Map();
function passwortBefehl(cfg, abdruck) {
  if (cfg.passwortBefehl) return cfg.passwortBefehl;
  if (pwCache.has(abdruck)) return pwCache.get(abdruck);
  const passt = name => {
    const wert = schluesselLesen(name);
    return Boolean(wert) && repoAbdruck(wert) === abdruck;
  };
  let name = [`${cfg.schluessel}_${abdruck}`, cfg.schluessel].find(passt);
  if (!name) {
    // Einträge mit dem kurzen Abdruck des alten Pullers (12 Zeichen, ohne Salz) zählen auch.
    const liste = spawnSync('security', ['dump-keychain'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const namen = [...(liste.stdout || '').matchAll(/"acct"<blob>="([^"]+)"/g)].map(m => m[1]);
    name = [...new Set(namen)].filter(n => n.startsWith(`${cfg.schluessel}_`)).find(passt);
  }
  const befehl = name ? `security find-generic-password -a ${name} -s ${SCHLUESSELBUND} -w` : null;
  pwCache.set(abdruck, befehl);
  return befehl;
}

// --- Gerät -----------------------------------------------------------------------------

function sshArgs(cfg) {
  const key = cfg.sshKey.startsWith('/') ? cfg.sshKey : join(HOME, '.ssh', cfg.sshKey);
  return [
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=15',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=8',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-i',
    key,
    '-p',
    String(cfg.sshPort || 22),
  ];
}

/** Warum eine SSH-Verbindung nicht ging, in einem Wort und einem Satz. */
function sshGrund(stderr) {
  if (/additional check|login\.tailscale\.com/i.test(stderr)) {
    return new Fehler(
      'tailscale',
      'Tailscale-SSH verlangt eine Freigabe im Browser (Richtlinie check). Ohne Browser kommt der Lauf nicht durch.'
    );
  }
  if (
    /timed out|refused|No route|Could not resolve|unreachable|closed by remote|Connection reset/i.test(
      stderr
    )
  ) {
    return new Fehler('erreichbarkeit', `Das Gerät ist nicht erreichbar: ${letzteZeile(stderr)}`);
  }
  return new Fehler('ssh', `SSH: ${letzteZeile(stderr) || 'ohne Meldung beendet'}`);
}

/**
 * Was am Gerät liegt: der Ordner, den der backup-service als /backups
 * einhängt (aus dem Mount, nicht aus einer Versionsnummer im Pfad), und je
 * Repo `staende-*` die Zahl der Dateien, ob `config` da ist, wie viele Stände.
 */
async function geraetLesen(cfg) {
  const skript = `
set -e
if [ -n "$QUELLE" ]; then Q="$QUELLE"; else
  Q=$(docker inspect backup-service --format '{{range .Mounts}}{{if eq .Destination "/backups"}}{{.Source}}{{end}}{{end}}')
fi
[ -n "$Q" ] || { echo "backup-service hat keinen Mount /backups"; exit 3; }
echo "ORDNER $Q"
echo "ZEIT $(date -u +%Y-%m-%dT%H:%M:%SZ)"
for r in "$Q"/staende-*; do
  [ -d "$r" ] || continue
  n=$(find "$r" -type f -not -path "$r/locks/*" | wc -l)
  s=$(find "$r/snapshots" -type f 2>/dev/null | wc -l)
  c=0; [ -f "$r/config" ] && c=1
  b=$(du -sk "$r" | cut -f1)
  echo "REPO $(basename "$r") $n $s $c $b"
done
`;
  const r = cfg.quelle
    ? await laufe('sh', ['-s'], { eingabe: skript, env: { QUELLE: cfg.quelle }, frist: 60_000 })
    : await laufe('ssh', [...sshArgs(cfg), `${cfg.sshUser}@${cfg.host}`, 'sh -s'], {
        eingabe: skript,
        frist: 90_000,
      });
  if (r.code !== 0) {
    if (cfg.quelle)
      throw new Fehler('geraet', `Die Quelle antwortet nicht: ${letzteZeile(r.stderr + r.stdout)}`);
    if (r.signal === 'SIGKILL')
      throw new Fehler('erreichbarkeit', 'Keine Antwort vom Gerät innerhalb von 90 Sekunden.');
    if (r.code === 255) throw sshGrund(r.stderr);
    throw new Fehler(
      'geraet',
      `Das Gerät hat nicht geantwortet wie erwartet: ${letzteZeile(r.stdout + r.stderr)}`
    );
  }
  const lage = { ordner: null, zeit: null, repos: [] };
  for (const zeile of r.stdout.split('\n')) {
    const [wort, ...rest] = zeile.trim().split(/\s+/);
    if (wort === 'ORDNER') lage.ordner = zeile.trim().slice(7);
    if (wort === 'ZEIT') lage.zeit = rest[0];
    if (wort === 'REPO' && /^staende-[0-9a-f]{16}$/.test(rest[0])) {
      lage.repos.push({
        name: rest[0],
        dateien: Number(rest[1]),
        staende: Number(rest[2]),
        config: rest[3] === '1',
        kb: Number(rest[4]),
      });
    }
  }
  if (!lage.ordner)
    throw new Fehler(
      'geraet',
      `Das Gerät hat nicht geantwortet wie erwartet: ${r.stdout.trim().slice(0, 200)}`
    );
  return lage;
}

/** Wie viele Dateien das Repo am Mac hat, ohne locks. */
function dateienAmMac(ordner) {
  let n = 0;
  const geh = p => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!(p === ordner && e.name === 'locks')) geh(join(p, e.name));
      } else if (e.isFile()) n += 1;
    }
  };
  if (existsSync(ordner)) geh(ordner);
  return n;
}

/**
 * Ein Repo vom Gerät spiegeln. Zwei Durchgänge: erst nur `data/` (neue Packs,
 * nichts löschen), dann alles mit Löschen nach dem Übertragen. So steht kein
 * Index am Mac, dessen Packs noch fehlen, und was am Gerät wegfiel, landet im
 * Papierkorb statt im Nichts.
 */
async function spiegeln(cfg, repo, stempel) {
  const ziel = join(staendeOrdner(cfg), repo.name);
  const teil = join(cfg.daten, '.rsync-teil', repo.name);
  const korb = join(cfg.daten, 'papierkorb', repo.name, stempel);
  mkdirSync(ziel, { recursive: true });
  mkdirSync(teil, { recursive: true });
  const quelle = cfg.quelle
    ? `${cfg.quelle}/${repo.name}/`
    : `${cfg.sshUser}@${cfg.host}:${cfg.ordner}/${repo.name}/`;
  const gemeinsam = [
    '-rt',
    '--partial',
    `--partial-dir=${teil}`,
    '--timeout=300',
    '--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=',
    '--stats',
    ...(cfg.quelle
      ? []
      : ['-e', ['ssh', ...sshArgs(cfg)].map(a => (/\s/.test(a) ? `'${a}'` : a)).join(' ')]),
  ];
  let bytes = 0;
  const durchgaenge = [
    ['data', [...gemeinsam, `${quelle}data/`, `${ziel}/data/`]],
    [
      'alles',
      [
        ...gemeinsam,
        '--delete-after',
        '--backup',
        `--backup-dir=${korb}`,
        '--exclude=/locks/***',
        quelle,
        `${ziel}/`,
      ],
    ],
  ];
  for (const [name, argumente] of durchgaenge) {
    const r = await laufe('rsync', argumente);
    if (r.code !== 0) {
      if (/ssh|connection|timeout|timed out|Broken pipe/i.test(r.stderr) && !cfg.quelle) {
        throw new Fehler(
          'erreichbarkeit',
          `rsync (${name}) brach ab, Code ${r.code}: ${letzteZeile(r.stderr)}. Der nächste Lauf setzt fort.`
        );
      }
      throw new Fehler(
        'rsync',
        `rsync (${name}) brach ab, Code ${r.code}: ${letzteZeile(r.stderr)}`
      );
    }
    const m = r.stdout.match(/Total transferred file size: ([\d,.]+)/);
    if (m) bytes += Number(m[1].replace(/[,.]/g, ''));
  }
  mkdirSync(join(ziel, 'locks'), { recursive: true });
  const weg = existsSync(korb) ? dateienAmMac(korb) : 0;
  return { ziel, bytes, weg };
}

// --- restic am Mac ------------------------------------------------------------------

async function restic(cfg, repoPfad, befehl, argumente, optionen = {}) {
  const abdruck = basename(repoPfad).replace(/^staende-/, '');
  const pw = passwortBefehl(cfg, abdruck);
  if (!pw) {
    throw new Fehler(
      'schluessel',
      `Im Schlüsselbund liegt kein Schlüssel mit dem Abdruck ${abdruck}: ohne ihn lässt sich die Kopie weder prüfen noch öffnen. Den Wiederherstellungscode des Geräts unter ${SCHLUESSELBUND}/${cfg.schluessel}_${abdruck} ablegen oder: node sicherung.mjs --schluessel-holen`
    );
  }
  return laufe('restic', [befehl, ...argumente], {
    ...optionen,
    env: {
      RESTIC_REPOSITORY: repoPfad,
      RESTIC_PASSWORD_COMMAND: pw,
      RESTIC_PROGRESS_FPS: '0',
      RESTIC_CACHE_DIR: join(cfg.daten, '.restic-cache'),
    },
  });
}

async function staendeAmMac(cfg, repoPfad) {
  const r = await restic(cfg, repoPfad, 'snapshots', ['--json', '--tag', 'arasul', '--no-lock']);
  if (r.code !== 0)
    throw new Fehler('entschluesselung', `restic snapshots: ${letzteZeile(r.stderr)}`);
  return JSON.parse(r.stdout || '[]').sort((a, b) => a.time.localeCompare(b.time));
}

/** Die App-Datenbanken in einem Stand: Abzüge unter cfg.dbPfad (backup.sh). */
async function appDatenbanken(cfg, repoPfad, stand) {
  const r = await restic(cfg, repoPfad, 'ls', ['--json', '--no-lock', stand, cfg.dbPfad]);
  if (r.code !== 0) throw new Fehler('entschluesselung', `restic ls: ${letzteZeile(r.stderr)}`);
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map(z => JSON.parse(z))
    .filter(
      n =>
        n.struct_type === 'node' &&
        n.type === 'file' &&
        n.path === `${cfg.dbPfad}/${n.name}` &&
        n.name.endsWith('.sql')
    )
    .map(n => ({ db: n.name.replace(/\.sql$/, ''), bytes: n.size }))
    .sort((a, b) => a.db.localeCompare(b.db));
}

// --- Ein Lauf ---------------------------------------------------------------------------

function papierkorbLeeren(cfg) {
  const wurzel = join(cfg.daten, 'papierkorb');
  if (!existsSync(wurzel)) return 0;
  let weg = 0;
  for (const repo of readdirSync(wurzel)) {
    for (const stempel of readdirSync(join(wurzel, repo))) {
      const pfad = join(wurzel, repo, stempel);
      if ((Date.now() - statSync(pfad).mtimeMs) / 86400_000 > cfg.papierkorbTage) {
        rmSync(pfad, { recursive: true, force: true });
        weg += 1;
      }
    }
  }
  return weg;
}

async function lauf(cfg, zustand) {
  const lage = await geraetLesen(cfg);
  cfg.ordner = lage.ordner;
  if (!lage.repos.length)
    throw new Fehler(
      'geraet',
      `Am Gerät liegt unter ${lage.ordner} kein Repo staende-*: der backup-service legt keine Stände an.`
    );
  const stempel = new Date().toISOString().replace(/[:.]/g, '-');
  const ergebnis = [];
  for (const repo of lage.repos) {
    const amMac = dateienAmMac(join(staendeOrdner(cfg), repo.name));
    // Ein Repo, das am Gerät leer, kaputt oder stark geschrumpft ist, wird nicht gespiegelt.
    if (!repo.config || repo.staende < 1) {
      throw new Fehler(
        'geschrumpft',
        `${repo.name} am Gerät hat ${repo.config ? 'keinen Stand' : 'keine config'}: nicht gespiegelt, die Kopie am Mac bleibt, wie sie ist.`
      );
    }
    if (amMac > 20 && repo.dateien < amMac / 2) {
      throw new Fehler(
        'geschrumpft',
        `${repo.name} am Gerät hat ${repo.dateien} Dateien, die Kopie am Mac ${amMac}: mehr als die Hälfte wäre weg. Nicht gespiegelt, bitte am Gerät nachsehen.`
      );
    }
    const { ziel, bytes, weg } = await spiegeln(cfg, repo, stempel);
    protokoll(
      `${repo.name}: ${mb(bytes)} übertragen, ${weg} Datei(en) in den Papierkorb, am Gerät ${repo.staende} Stände, ${mb(repo.kb * 1024)}`
    );

    const pruef = await restic(
      cfg,
      ziel,
      'check',
      ['--no-lock', `--read-data-subset=${cfg.pruefAnteil}`],
      { frist: 3 * 3600_000 }
    );
    if (pruef.code !== 0) {
      throw new Fehler(
        'check',
        `restic check auf der Kopie ${repo.name} meldet Fehler: ${letzteZeile(pruef.stderr || pruef.stdout)}`
      );
    }
    const staende = await staendeAmMac(cfg, ziel);
    const neuester = staende.at(-1);
    if (!neuester)
      throw new Fehler('geschrumpft', `${repo.name} am Mac enthält nach dem Zug keinen Stand.`);
    const dbs = await appDatenbanken(cfg, ziel, neuester.id);
    ergebnis.push({
      repo: repo.name,
      staende: staende.length,
      neuester: { id: neuester.short_id, zeit: neuester.time },
      appDatenbanken: dbs,
      uebertragenBytes: bytes,
      papierkorb: weg,
      check: `ohne Fehler, ${cfg.pruefAnteil} der Daten gelesen`,
    });
    protokoll(
      `${repo.name}: restic check ohne Fehler (${cfg.pruefAnteil} der Daten gelesen), ${staende.length} Stände, neuester ${neuester.short_id} von ${zeit(neuester.time)}, App-Datenbanken: ${dbs.map(d => d.db).join(', ') || 'keine'}`
    );
  }

  // Das Repo des Schlüssels, mit dem das Gerät heute sichert, ist das jüngste.
  const aktuell = ergebnis
    .slice()
    .sort((a, b) => b.neuester.zeit.localeCompare(a.neuester.zeit))[0];
  const bekannt = zustand.appDatenbanken || [];
  const jetzt = aktuell.appDatenbanken.map(d => d.db);
  zustand.appDatenbanken = [...new Set([...bekannt, ...jetzt])].sort();
  const fehlend = bekannt.filter(db => !jetzt.includes(db));
  schreibe(join(cfg.daten, 'STAENDE.json'), {
    gezogen: new Date().toISOString(),
    geraet: cfg.geraet,
    ordnerAmGeraet: lage.ordner,
    repos: ergebnis,
  });
  const geleert = papierkorbLeeren(cfg);
  if (geleert)
    protokoll(`${geleert} Papierkorb-Ordner älter als ${cfg.papierkorbTage} Tage entfernt`);

  if (stunden(aktuell.neuester.zeit) > cfg.standHoechstensStunden) {
    throw new Fehler(
      'veraltet',
      `Der neueste Stand (${aktuell.neuester.id}) ist von ${zeit(aktuell.neuester.zeit)}, älter als ${cfg.standHoechstensStunden} Stunden: der backup-service hat die letzte Nacht nicht gesichert.`
    );
  }
  if (fehlend.length) {
    throw new Fehler(
      'keine-datei',
      `Im neuesten Stand fehlt der Abzug von ${fehlend.join(', ')}, die einmal gesichert wurde(n).`
    );
  }
  return { ergebnis, aktuell };
}

// --- Melden ---------------------------------------------------------------------------

function mitteilung(titel, text) {
  if (process.platform !== 'darwin') return;
  spawnSync('osascript', [
    '-e',
    'on run argv',
    '-e',
    'display notification (item 1 of argv) with title (item 2 of argv) sound name "Basso"',
    '-e',
    'end run',
    '--',
    text,
    titel,
  ]);
}

const SOFORT = new Set(['check', 'entschluesselung', 'schluessel', 'einrichtung', 'geschrumpft']);

function ausfallPruefen(cfg, zustand) {
  const marke = join(cfg.daten, 'AUSFALL.txt');
  const seit = zustand.erfolg?.zeit;
  const ausfall =
    (zustand.fehler && SOFORT.has(zustand.fehler.art)) || stunden(seit) > cfg.ausfallNachStunden;
  if (!ausfall) {
    if (existsSync(marke)) {
      rmSync(marke, { force: true });
      protokoll('Ausfall behoben, Marke entfernt');
      mitteilung(
        'Sicherung Orin',
        'Wieder in Ordnung: die Stände vom Orin sind auf dem Mac und geprüft.'
      );
    }
    return false;
  }
  const grund = zustand.fehler
    ? `${zustand.fehler.art}: ${zustand.fehler.text}`
    : `Kein Lauf gelungen seit ${zeit(seit)}.`;
  writeFileSync(
    marke,
    `AUSFALL der Sicherung vom Orin\nseit: ${zeit(zustand.fehler?.seit || seit)}\nletzter Erfolg: ${zeit(seit)}\ngrund: ${grund}\n\n` +
      `Prüfen: node "${join(SUPPORT, 'sicherung.mjs')}" --ziehen --jetzt\nProtokoll: ${LOGDATEI}\nDiese Datei verschwindet mit dem nächsten gelungenen Lauf.\n`
  );
  protokoll(`AUSFALL ${grund}`);
  // Nicht jede Stunde dieselbe Mitteilung: höchstens alle sechs Stunden.
  if (stunden(zustand.meldung) > 6) {
    mitteilung('Sicherung Orin: AUSFALL', grund.slice(0, 220));
    zustand.meldung = new Date().toISOString();
  }
  return true;
}

// --- Befehle ---------------------------------------------------------------------------

function faellig(cfg, zustand) {
  const [h, m] = cfg.faelligAb.split(':').map(Number);
  const heute = new Date();
  heute.setHours(h, m, 0, 0);
  if (!zustand.erfolg) return true;
  return Date.now() >= heute.getTime() && new Date(zustand.erfolg.zeit) < heute;
}

async function ziehen() {
  const cfg = konfiguration();
  mkdirSync(cfg.daten, { recursive: true });
  const zustand = lies(zustandsdatei(cfg), {});
  if (arg.jetzt || faellig(cfg, zustand)) {
    zustand.versuch = new Date().toISOString();
    try {
      const { ergebnis, aktuell } = await lauf(cfg, zustand);
      zustand.erfolg = {
        zeit: new Date().toISOString(),
        repo: aktuell.repo,
        stand: aktuell.neuester,
        staende: aktuell.staende,
        uebertragenBytes: ergebnis.reduce((s, e) => s + e.uebertragenBytes, 0),
      };
      zustand.erfolge = [...(zustand.erfolge || []), zustand.erfolg.zeit].slice(-14);
      zustand.fehler = null;
      protokoll(
        `Lauf gelungen: ${ergebnis.length} Repo(s) gespiegelt und mit restic check geprüft, neuester Stand ${aktuell.neuester.id} von ${zeit(aktuell.neuester.zeit)}`
      );
    } catch (e) {
      const art = e.art || 'unbekannt';
      zustand.fehler = {
        art,
        text: e.message,
        seit: zustand.fehler?.seit || new Date().toISOString(),
        zeit: new Date().toISOString(),
      };
      protokoll(`Lauf fehlgeschlagen (${art}): ${e.message}`);
    }
  }
  const aus = ausfallPruefen(cfg, zustand);
  schreibe(zustandsdatei(cfg), zustand);
  process.exit(aus ? 1 : 0);
}

async function status() {
  const cfg = konfiguration();
  const zustand = lies(zustandsdatei(cfg), {});
  const st = lies(join(cfg.daten, 'STAENDE.json'), null);
  console.log(
    `Letzter Lauf, der gelungen ist: ${zeit(zustand.erfolg?.zeit)} (${vor(zustand.erfolg?.zeit)})`
  );
  console.log(
    `Gelungene Läufe zuletzt: ${(zustand.erfolge || []).map(zeit).join('; ') || 'keine'}`
  );
  console.log(`Letzter Versuch: ${zeit(zustand.versuch)}`);
  console.log(
    zustand.fehler
      ? `Fehler im letzten Versuch: ${zustand.fehler.art}: ${zustand.fehler.text}`
      : 'Fehler im letzten Versuch: keiner'
  );
  console.log(
    existsSync(join(cfg.daten, 'AUSFALL.txt'))
      ? `AUSFALL steht: ${join(cfg.daten, 'AUSFALL.txt')}`
      : 'Ausfall: keiner'
  );
  console.log(`Ablage: ${staendeOrdner(cfg)}`);
  for (const r of st?.repos || []) {
    console.log(
      `\n${r.repo}\n  Stände        ${r.staende}\n  neuester      ${r.neuester.id} von ${zeit(r.neuester.zeit)} (${vor(r.neuester.zeit)})\n  restic check  ${r.check}\n  App-Datenbanken ${r.appDatenbanken.map(d => `${d.db} (${d.bytes} Bytes)`).join(', ') || 'keine'}`
    );
  }
  if (!st) console.log('\nNoch kein Stand gezogen.');
  process.exit(!zustand.erfolg || zustand.fehler ? 1 : 0);
}

async function schluesselHolen() {
  const cfg = konfiguration();
  const r = await laufe(
    'ssh',
    [
      ...sshArgs(cfg),
      `${cfg.sshUser}@${cfg.host}`,
      'docker exec backup-service cat /run/secrets/backup_encryption_key',
    ],
    { frist: 60_000 }
  );
  if (r.code !== 0) throw sshGrund(r.stderr);
  const wert = r.stdout.replace(/\r?\n$/, '');
  if (!/^\S{16,}$/.test(wert))
    throw new Fehler('schluessel', 'Der Schlüssel am Gerät sieht nicht aus wie einer.');
  const name = `${cfg.schluessel}_${repoAbdruck(wert)}`;
  // Der Wert geht über die Standardeingabe, nie über die Kommandozeile.
  const lauf = spawnSync(
    'security',
    ['add-generic-password', '-U', '-a', name, '-s', SCHLUESSELBUND, '-w'],
    { input: `${wert}\n${wert}\n`, encoding: 'utf8' }
  );
  if (lauf.status !== 0 || schluesselLesen(name) !== wert)
    throw new Fehler('schluessel', `Der Schlüsselbund nimmt ${name} nicht an.`);
  console.log(
    `Sicherungsschlüssel im Schlüsselbund: ${SCHLUESSELBUND}/${name}. Der Wert wurde nicht angezeigt.`
  );
}

// --- Wiederherstellung in ein Wegwerf-Postgres ---------------------------------------------

function pgWerkzeuge() {
  const orte = [
    typeof arg['pg-bin'] === 'string' ? arg['pg-bin'] : null,
    process.env.ARASUL_PG_BIN,
    '/opt/homebrew/opt/postgresql@16/bin',
    '/opt/homebrew/opt/postgresql@17/bin',
    '/usr/local/opt/postgresql@16/bin',
    '/usr/lib/postgresql/16/bin',
    join(tmpdir(), 'pgtest', 'node_modules', '@embedded-postgres', 'darwin-arm64', 'native', 'bin'),
    ...(process.env.PATH || '').split(':'),
  ].filter(Boolean);
  const server = orte.find(
    o =>
      existsSync(join(o, 'postgres')) &&
      existsSync(join(o, 'initdb')) &&
      existsSync(join(o, 'pg_ctl'))
  );
  const psqlOrt = [server, '/opt/homebrew/opt/libpq/bin', ...orte]
    .filter(Boolean)
    .find(o => existsSync(join(o, 'psql')));
  if (!server || !psqlOrt) {
    throw new Fehler(
      'einrichtung',
      'Kein Postgres am Mac gefunden (postgres, initdb, pg_ctl und psql). Mit --pg-bin <ordner> nennen oder: brew install postgresql@16'
    );
  }
  return { bin: server, psql: join(psqlOrt, 'psql') };
}

function freierPort() {
  return new Promise(ok => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

async function wiederherstellen() {
  const cfg = konfiguration();
  const st = lies(join(cfg.daten, 'STAENDE.json'), null);
  const repoName =
    typeof arg.repo === 'string'
      ? arg.repo
      : st?.repos?.slice().sort((a, b) => b.neuester.zeit.localeCompare(a.neuester.zeit))[0]?.repo;
  if (!repoName)
    throw new Fehler(
      'einrichtung',
      'Es gibt noch keinen Stand am Mac, der sich zurückspielen ließe.'
    );
  const repoPfad = join(staendeOrdner(cfg), repoName);
  const staende = await staendeAmMac(cfg, repoPfad);
  const stand =
    typeof arg.stand === 'string' ? staende.find(s => s.id.startsWith(arg.stand)) : staende.at(-1);
  if (!stand)
    throw new Fehler('einrichtung', `Den Stand ${arg.stand} gibt es in ${repoName} nicht.`);
  const dbs = await appDatenbanken(cfg, repoPfad, stand.id);
  const db =
    typeof arg.db === 'string'
      ? arg.db
      : dbs.find(d => d.db === 'arasul_app_belege_live')?.db || dbs[0]?.db;
  if (!db || !dbs.some(d => d.db === db))
    throw new Fehler(
      'einrichtung',
      `Im Stand ${stand.short_id} gibt es keinen Abzug ${db || 'einer App-Datenbank'}. Da sind: ${dbs.map(d => d.db).join(', ') || 'keine'}.`
    );
  if (!/^[a-z0-9_]+$/.test(db)) throw new Fehler('einrichtung', 'Das ist kein Datenbankname.');

  const bericht = [];
  const sag = s => {
    bericht.push(s);
    console.log(s);
  };
  const start = Date.now();
  const { bin, psql } = pgWerkzeuge();
  const ordner = mkdtempSync(join(tmpdir(), 'arasul-wegwerf-pg-'));
  const port = await freierPort();
  const pgEnv = { PGHOST: ordner, PGPORT: String(port), PGUSER: 'postgres' };
  const sql = (datenbank, text) =>
    laufe(psql, ['-d', datenbank, '-X', '-At', '-v', 'ON_ERROR_STOP=1'], {
      eingabe: text,
      env: pgEnv,
      frist: 120_000,
    });
  let gestartet = false;
  try {
    sag(`# Wiederherstellung in ein Wegwerf-Postgres`);
    sag(
      `\nGestartet ${zeit(new Date())}. Quelle ist ausschließlich die Kopie am Mac, das Gerät wird nicht gefragt.\n`
    );
    sag(
      `1. Repo ${repoName}, Stand ${stand.short_id} von ${zeit(stand.time)}, Abzug ${db} (${dbs.find(d => d.db === db).bytes} Bytes).`
    );

    const init = await laufe(
      join(bin, 'initdb'),
      ['-D', join(ordner, 'daten'), '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale'],
      { frist: 120_000 }
    );
    if (init.code !== 0) throw new Fehler('probe', `initdb: ${letzteZeile(init.stderr)}`);
    const an = await laufe(
      join(bin, 'pg_ctl'),
      [
        '-D',
        join(ordner, 'daten'),
        '-l',
        join(ordner, 'pg.log'),
        '-w',
        '-o',
        `-p ${port} -k ${ordner} -c listen_addresses=''`,
        'start',
      ],
      { frist: 120_000 }
    );
    if (an.code !== 0)
      throw new Fehler('probe', `pg_ctl start: ${letzteZeile(an.stderr + an.stdout)}`);
    gestartet = true;
    const version = (await sql('postgres', 'show server_version;')).stdout.trim();
    const anlegen = await sql('postgres', `create database ${db};`);
    if (anlegen.code !== 0)
      throw new Fehler('probe', `create database: ${letzteZeile(anlegen.stderr)}`);
    const leer = (
      await sql(
        db,
        "select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema');"
      )
    ).stdout.trim();
    sag(
      `2. Leeres Postgres ${version} in ${ordner}, nur über einen Unix-Socket erreichbar. Tabellen darin: ${leer}.`
    );
    if (leer !== '0') throw new Fehler('probe', 'Das Wegwerf-Postgres ist nicht leer.');

    // 3. Einspielen: restic dump im Strom in psql, eine Transaktion.
    const dump = spawn('restic', ['dump', '--no-lock', stand.id, `${cfg.dbPfad}/${db}.sql`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        RESTIC_REPOSITORY: repoPfad,
        RESTIC_PASSWORD_COMMAND: passwortBefehl(cfg, repoName.replace(/^staende-/, '')),
        RESTIC_CACHE_DIR: join(cfg.daten, '.restic-cache'),
      },
    });
    let dumpFehler = '';
    dump.stderr.on('data', s => (dumpFehler += s));
    const dumpEnde = new Promise(ok => dump.on('close', c => ok(c)));
    const ein = await laufe(
      psql,
      ['-d', db, '-X', '-q', '-o', '/dev/null', '-v', 'ON_ERROR_STOP=1', '-1'],
      { eingabe: dump.stdout, env: pgEnv, frist: 600_000 }
    );
    const dumpCode = await dumpEnde;
    if (dumpCode !== 0)
      throw new Fehler('entschluesselung', `restic dump ${dumpCode}: ${letzteZeile(dumpFehler)}`);
    if (ein.code !== 0)
      throw new Fehler('abweichung', `Einspielen schlug fehl: ${letzteZeile(ein.stderr)}`);
    sag(
      `3. Eingespielt in einer Transaktion (ON_ERROR_STOP). Meldungen von psql: ${letzteZeile(ein.stderr) || 'keine, kein Fehler'}.`
    );

    // 4. Zählen: Tabellen, Zeilen je Tabelle, Trigger.
    const tabellen = (
      await sql(db, "select schemaname||'.'||relname from pg_stat_user_tables order by 1;")
    ).stdout
      .trim()
      .split('\n')
      .filter(Boolean);
    const zaehl = tabellen.length
      ? (
          await sql(
            db,
            tabellen.map(t => `select '${t}', count(*) from ${t}`).join(' union all ') + ';'
          )
        ).stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(z => z.split('|'))
      : [];
    const trigger = (
      await sql(db, 'select count(*) from pg_trigger where not tgisinternal;')
    ).stdout.trim();
    sag(
      `4. ${tabellen.length} Tabellen, ${trigger} Trigger.\n\n| Tabelle | Zeilen |\n| --- | --- |\n${zaehl.map(([t, n]) => `| ${t} | ${n} |`).join('\n')}`
    );
    if (!tabellen.length)
      throw new Fehler('abweichung', 'Nach dem Einspielen gibt es keine Tabelle.');

    // 5. Die Belege-App: Originaldateien gegen ihren Abdruck, die Sperre gegen Ändern.
    if (tabellen.some(t => t.endsWith('.beleg'))) {
      const b = (
        await sql(
          db,
          "select count(*), count(*) filter (where sha256 = encode(sha256(datei), 'hex')), count(*) filter (where groesse_bytes <> octet_length(datei)) from beleg;"
        )
      ).stdout
        .trim()
        .split('|');
      sag(
        `\n5. Belege: ${b[0]}. SHA-256 der Bytes gegen den beim Eingang notierten: ${b[1]} von ${b[0]} gleich. Größe gegen groesse_bytes: ${b[2]} Abweichungen.`
      );
      if (b[0] !== b[1] || b[2] !== '0')
        throw new Fehler('abweichung', 'Originaldateien weichen von ihrem notierten Abdruck ab.');
      if (b[0] === '0') {
        sag(
          `   Ohne Belege lässt sich die Sperre gegen Ändern nicht an einer Zeile zeigen; ${trigger} Trigger sind mitgekommen.`
        );
      } else {
        const versuch = await laufe(psql, ['-d', db, '-X', '-At'], {
          eingabe: "begin; update beleg set dateiname = dateiname || 'x'; rollback;",
          env: pgEnv,
        });
        const gesperrt = /ERROR/.test(versuch.stderr);
        sag(
          `   Sperre gegen Ändern: ${trigger} Trigger da, ein UPDATE auf beleg wird ${gesperrt ? 'abgewiesen' : 'NICHT abgewiesen'}.`
        );
        if (!gesperrt)
          throw new Fehler('abweichung', 'Die Sperre gegen Ändern kam nicht mit zurück.');
      }
    }
    sag(
      `\nErgebnis: die Wiederherstellung ist gelungen. Dauer ${((Date.now() - start) / 1000).toFixed(0)} Sekunden.`
    );
  } finally {
    if (gestartet)
      await laufe(join(bin, 'pg_ctl'), ['-D', join(ordner, 'daten'), '-m', 'fast', '-w', 'stop'], {
        frist: 60_000,
      });
    rmSync(ordner, { recursive: true, force: true });
    const text = `Das Wegwerf-Postgres ist abgebaut (Ordner ${ordner} vorhanden: ${existsSync(ordner) ? 'ja' : 'nein'}).`;
    console.log(text);
    bericht.push(text);
    mkdirSync(join(cfg.daten, 'wiederherstellungen'), { recursive: true });
    writeFileSync(
      join(
        cfg.daten,
        'wiederherstellungen',
        `${new Date().toISOString().replace(/[:.]/g, '-')}.md`
      ),
      bericht.join('\n') + '\n'
    );
  }
}

// --- Einrichten -------------------------------------------------------------------------

function einrichten() {
  mkdirSync(SUPPORT, { recursive: true });
  const alt = lies(join(SUPPORT, 'config.json'), {});
  const cfg = {
    ...alt,
    geraet: alt.geraet || FALLBACK.geraet,
    host: typeof arg.host === 'string' ? arg.host : alt.host || FALLBACK.host,
    sshUser: typeof arg.user === 'string' ? arg.user : alt.sshUser || FALLBACK.sshUser,
    sshPort: Number(arg.port || alt.sshPort || FALLBACK.sshPort),
    sshKey: typeof arg.key === 'string' ? arg.key : alt.sshKey || FALLBACK.sshKey,
  };
  schreibe(join(SUPPORT, 'config.json'), cfg);
  const ziel = join(SUPPORT, 'sicherung.mjs');
  if (resolve(fileURLToPath(import.meta.url)) !== ziel)
    copyFileSync(fileURLToPath(import.meta.url), ziel);
  const c = { ...FALLBACK, ...cfg };
  mkdirSync(c.daten, { recursive: true });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${ziel}</string>
    <string>--ziehen</string>
  </array>
  <key>WorkingDirectory</key><string>${SUPPORT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>${HOME}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>${LOGDATEI}</string>
  <key>StandardErrorPath</key><string>${LOGDATEI}</string>
</dict>
</plist>
`;
  writeFileSync(PLIST, plist);
  const uid = process.getuid();
  spawnSync('launchctl', ['bootout', `gui/${uid}/${NAME}`], { encoding: 'utf8' });
  const geladen = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, PLIST], { encoding: 'utf8' });
  if (geladen.status !== 0)
    throw new Fehler('einrichtung', `launchctl bootstrap: ${geladen.stderr.trim()}`);
  console.log(
    `Eingerichtet.\n  Skript      ${ziel}\n  Einrichtung ${join(SUPPORT, 'config.json')}\n  Dienst      ${PLIST}\n  Ablage      ${staendeOrdner(c)}\n  Protokoll   ${LOGDATEI}\nDer Dienst läuft stündlich und zieht, sobald ${c.faelligAb} Uhr vorbei ist und heute noch kein Lauf gelang.`
  );
}

function entfernen() {
  spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${NAME}`]);
  rmSync(PLIST, { force: true });
  console.log(
    `Dienst abgebaut. Die Sicherungen bleiben. Skript und Einrichtung liegen noch unter ${SUPPORT}.`
  );
}

function ausfallProbe() {
  const cfg = konfiguration();
  const text = 'Das ist eine Probe: so meldet sich die Sicherung, wenn ein Lauf ausfällt.';
  mitteilung('Sicherung Orin: PROBE', text);
  protokoll(`AUSFALL-PROBE ${text}`);
  console.log(
    `Mitteilung geschickt, Zeile im Protokoll ${LOGDATEI}. Die Marke AUSFALL.txt legt nur ein echter Ausfall an (${join(cfg.daten, 'AUSFALL.txt')}).`
  );
}

// --- Aufruf ---------------------------------------------------------------------------------

const befehle = {
  einrichten,
  entfernen,
  ziehen,
  status,
  'schluessel-holen': schluesselHolen,
  wiederherstellen,
  'ausfall-probe': ausfallProbe,
};
const gewaehlt = Object.keys(befehle).find(n => arg[n]);
if (!gewaehlt) {
  console.log(
    readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('*/')[0]
      .replace(/^#!.*\n\/\*\*\n/, '')
      .replace(/^ \* ?/gm, '')
  );
  process.exit(0);
}
try {
  await befehle[gewaehlt]();
} catch (e) {
  protokoll(`Abbruch (${e.art || 'unbekannt'}): ${e.message}`);
  process.exit(1);
}
