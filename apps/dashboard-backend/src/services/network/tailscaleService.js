/**
 * Tailscale Service
 * Runs all Tailscale CLI commands on the HOST via temporary Docker containers.
 * The backend itself runs inside a minimal Alpine container without bash/curl/tailscale,
 * so we use Dockerode to create short-lived containers with host access.
 */

const { docker } = require('../core/docker');
const logger = require('../../utils/logger');
const {
  ServiceUnavailableError,
  ValidationError,
  ConflictError,
  UpstreamError,
} = require('../../utils/errors');

const HOST_IMAGE = 'alpine:latest';

// ── Fehler fuer den Administrator ───────────────────────────────────
//
// Jeder Fehler hier erreicht den Administrator in zwei Saetzen: was ist
// passiert, was kann er tun (M5, Auftrag jet-fehlerklassen). Bis dahin flog
// ein schlichtes `Error` mit den letzten 200 Zeichen der tailscale-Ausgabe,
// und der Fehlerbehandler machte daraus 500 „Internal server error". Die
// Ausgabe steht jetzt im Log (`roh`), nie in der Antwort.

/** Die Meldungen, an denen tailscale sagt, dass sein Dienst nicht laeuft. */
const DIENST_AUS =
  /failed to connect to local tailscaled|tailscaled\.sock|is tailscaled running|tailscaled (is not|isn't|doesn't appear to be) running/i;

/** Die Meldungen, an denen tailscale einen Auth-Key abweist. */
const SCHLUESSEL_UNGUELTIG =
  /invalid key|unable to validate api key|auth ?key[^\n]*(invalid|expired|revoked|not valid)|key (has )?expired/i;

const SATZ_DIENST_AUS =
  'Der Tailscale-Dienst auf dem Gerät läuft nicht. ' +
  'Starten Sie das Gerät neu; hilft das nicht, wenden Sie sich an Ihren Betreuer.';

const NICHT_INSTALLIERT =
  'Tailscale ist auf diesem Gerät nicht installiert. ' +
  'Installieren Sie es zuerst hier unter Fernzugriff.';

function dienstAus(roh) {
  return new UpstreamError(SATZ_DIENST_AUS, {
    statusCode: 503,
    code: 'TAILSCALE_DIENST_AUS',
    roh,
  });
}

/**
 * `runOnHost` mit einem Satz statt einer Ausnahme aus Docker. Wirft
 * `runOnHost` selbst (Hilfs-Image fehlt, Docker-Proxy weg, Zeitlimit), lief
 * der Befehl gar nicht: 503, und der Grund steht im Log.
 */
async function aufDemHost(cmd, timeoutMs, wofuer) {
  try {
    return await runOnHost(cmd, timeoutMs);
  } catch (err) {
    logger.error(`Tailscale: ${wofuer} -- Befehl auf dem Host lief nicht: ${err.message}`);
    if (err.code === 'ZEITLIMIT') {
      throw new ServiceUnavailableError(
        'Tailscale hat nicht rechtzeitig geantwortet. ' +
          'Prüfen Sie die Internetverbindung des Geräts und versuchen Sie es noch einmal.',
        { code: 'TAILSCALE_ZEITLIMIT' }
      );
    }
    throw new ServiceUnavailableError(
      'Das Gerät konnte den Befehl für Tailscale gerade nicht ausführen. ' +
        'Versuchen Sie es in einer Minute noch einmal.',
      { code: 'TAILSCALE_HOST_NICHT_ERREICHBAR' }
    );
  }
}

// ── In-memory caches ────────────────────────────────────────────────
const cache = {
  status: { data: null, ts: 0 },
  installed: { data: null, ts: 0 },
};
const STATUS_TTL = 10_000; // 10 s
const INSTALLED_TTL = 60_000; // 60 s

function cacheGet(key, ttl) {
  const entry = cache[key];
  if (entry.data !== null && Date.now() - entry.ts < ttl) {
    return entry.data;
  }
  return null;
}

function cacheSet(key, data) {
  cache[key] = { data, ts: Date.now() };
}

function cacheInvalidate(key) {
  if (key) {
    cache[key] = { data: null, ts: 0 };
  } else {
    Object.keys(cache).forEach(k => {
      cache[k] = { data: null, ts: 0 };
    });
  }
}

// Whether the host helper image is known to be present on the local daemon.
// dockerode's createContainer does NOT auto-pull, so a missing `alpine:latest`
// would make createContainer throw 404 "No such image" — which used to be
// swallowed into `installed:false`. We pull it lazily once per process.
let hostImageReady = false;
// De-dupe concurrent pulls: the first caller starts the pull, everyone else
// awaits the same in-flight promise instead of kicking off a parallel pull.
let hostImagePull = null;

/**
 * Ensure the host helper image (`alpine:latest`) is present on the local Docker
 * daemon before we try to `createContainer` from it. Cached via `hostImageReady`
 * so we don't hit the daemon on every call; concurrent first-callers share one
 * in-flight pull.
 *
 * Throws if the image is neither present nor pullable (no cache + no network) —
 * callers MUST treat that as an infrastructure/detection failure, NOT as
 * "Tailscale is not installed".
 */
async function ensureHostImage() {
  if (hostImageReady) {
    return;
  }
  if (hostImagePull) {
    // A pull is already in flight — await it instead of starting another.
    return hostImagePull;
  }

  hostImagePull = (async () => {
    // Fast path: image already cached locally → no pull needed.
    try {
      await docker.getImage(HOST_IMAGE).inspect();
      hostImageReady = true;
      return;
    } catch {
      // Not present locally — fall through to pull.
    }

    logger.info(
      `Pulling host helper image ${HOST_IMAGE} (required to run Tailscale host commands)…`
    );

    await new Promise((resolve, reject) => {
      docker.pull(HOST_IMAGE, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        docker.modem.followProgress(
          stream,
          (pullErr, output) => {
            if (pullErr) {
              reject(pullErr);
              return;
            }
            logger.info(`Host helper image ${HOST_IMAGE} pulled successfully`);
            resolve(output);
          },
          event => {
            if (event.status) {
              logger.debug(`Pull ${HOST_IMAGE}: ${event.status}`);
            }
          }
        );
      });
    });

    hostImageReady = true;
  })();

  try {
    await hostImagePull;
  } finally {
    // Clear the in-flight handle so a failed pull can be retried next time.
    hostImagePull = null;
  }
}

/**
 * Run a command on the host system via a temporary Docker container.
 * Uses bind-mount of host root + chroot to execute commands as if on the host.
 */
async function runOnHost(cmd, timeoutMs = 10000) {
  let container;
  try {
    // dockerode createContainer does not auto-pull — make sure the image exists
    // first, otherwise it throws 404 "No such image".
    await ensureHostImage();

    container = await docker.createContainer({
      Image: HOST_IMAGE,
      Cmd: ['chroot', '/host', 'sh', '-c', cmd],
      HostConfig: {
        Binds: ['/:/host'],
        NetworkMode: 'host',
        PidMode: 'host',
      },
      Labels: { 'arasul.service': 'tailscale', 'arasul.ephemeral': 'true' },
      Tty: true,
    });

    await container.start();

    let timer;
    const result = await Promise.race([
      container.wait(),
      new Promise((_, reject) => {
        // Mit Kennung: `aufDemHost` unterscheidet daran das Zeitlimit, nicht am Text.
        timer = setTimeout(
          () => reject(Object.assign(new Error('Zeitlimit überschritten'), { code: 'ZEITLIMIT' })),
          timeoutMs
        );
      }),
    ]);
    clearTimeout(timer);

    const logBuffer = await container.logs({ stdout: true, stderr: true, follow: false });
    // TTY mode produces \r\n — normalize to \n
    const output = logBuffer.toString('utf8').replace(/\r\n/g, '\n').trim();

    return { exitCode: result.StatusCode, output };
  } finally {
    if (container) {
      try {
        await container.remove({ force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

/**
 * Check if tailscale binary is available on the host (cached 60s)
 */
async function isInstalled() {
  const cached = cacheGet('installed', INSTALLED_TTL);
  if (cached !== null) {
    return cached;
  }

  try {
    const { exitCode } = await runOnHost('which tailscale', 5000);
    const result = exitCode === 0;
    cacheSet('installed', result);
    return result;
  } catch (err) {
    // A THROW from runOnHost means we couldn't even run the probe (missing
    // helper image, docker-proxy down, timeout) — that is an infrastructure /
    // detection failure, NOT a definitive "tailscale is not installed". Surface
    // it as a distinct 503 so callers (connect/disconnect/serve) don't mislead
    // the user with "nicht installiert"; do NOT cache a negative result.
    logger.error(
      `isInstalled host probe failed, reporting detection error (NOT installed:false): ${err.message}`
    );
    throw new ServiceUnavailableError(
      'Ob Tailscale auf dem Gerät installiert ist, ließ sich gerade nicht prüfen. ' +
        'Versuchen Sie es in einer Minute noch einmal.'
    );
  }
}

/**
 * Get full Tailscale status as structured object.
 * Uses a single Docker container for all checks + 10s in-memory cache.
 */
async function getStatus() {
  const cached = cacheGet('status', STATUS_TTL);
  if (cached) {
    return cached;
  }

  const emptyStatus = {
    installed: false,
    running: false,
    connected: false,
    ip: null,
    hostname: null,
    dnsName: null,
    tailnet: null,
    version: null,
    peers: [],
  };

  // Single combined command: check installed, get version + JSON status
  // Output delimited by markers so we can parse each section
  const combinedCmd = [
    'echo "---INSTALLED_CHECK---"',
    'which tailscale 2>/dev/null && echo "YES" || echo "NO"',
    'echo "---VERSION---"',
    'tailscale version 2>/dev/null | head -1 || echo ""',
    'echo "---STATUS_JSON---"',
    'tailscale status --json 2>/dev/null || echo "{}"',
  ].join(' ; ');

  let output;
  try {
    const res = await runOnHost(combinedCmd, 10000);
    output = res.output;
  } catch (err) {
    // Infrastructure/detection failure (image not pullable, docker-proxy
    // unreachable, exec error, timeout). This is NOT the same as "Tailscale is
    // not installed" — we simply could not run the check. Surface it as a
    // DISTINCT condition (`detectionError: true`) so the route/UI can keep the
    // last-known state instead of collapsing to the not-installed step 1.
    // Deliberately NOT cached, so the next poll retries the probe.
    logger.error(
      `getStatus host probe failed, reporting detectionError (NOT installed:false): ${err.message}`
    );
    return { ...emptyStatus, detectionError: true };
  }

  // Parse sections by markers
  const sections = {};
  const markers = ['INSTALLED_CHECK', 'VERSION', 'STATUS_JSON'];
  for (const marker of markers) {
    const re = new RegExp(`---${marker}---\\n([\\s\\S]*?)(?=---[A-Z_]+---|$)`);
    const match = output.match(re);
    sections[marker] = match ? match[1].trim() : '';
  }

  const installed = sections.INSTALLED_CHECK.includes('YES');
  if (!installed) {
    cacheSet('installed', false);
    cacheSet('status', emptyStatus);
    return emptyStatus;
  }

  cacheSet('installed', true);

  const version = sections.VERSION.split('\n')[0] || null;

  let statusData;
  try {
    statusData = JSON.parse(sections.STATUS_JSON);
  } catch {
    const result = { ...emptyStatus, installed: true, version };
    cacheSet('status', result);
    return result;
  }

  // Empty JSON means tailscale status failed
  if (!statusData || !statusData.Self) {
    const result = { ...emptyStatus, installed: true, version };
    cacheSet('status', result);
    return result;
  }

  const self = statusData.Self;
  const connected = self.Online === true;
  const ip = (self.TailscaleIPs || [])[0] || null;
  const dnsName = (self.DNSName || '').replace(/\.$/, '');
  const hostname = self.HostName || null;
  const tailnet = statusData.MagicDNSSuffix || null;
  const peers = [];
  const peerMap = statusData.Peer || {};
  for (const [, peer] of Object.entries(peerMap)) {
    peers.push({
      id: peer.ID || null,
      hostname: peer.HostName || '',
      dnsName: (peer.DNSName || '').replace(/\.$/, ''),
      ip: (peer.TailscaleIPs || [])[0] || null,
      os: peer.OS || '',
      online: peer.Online === true,
      lastSeen: peer.LastSeen || null,
    });
  }

  const result = {
    installed: true,
    running: true,
    connected,
    ip,
    hostname,
    dnsName,
    tailnet,
    version,
    peers,
  };

  cacheSet('status', result);
  return result;
}

/**
 * Get only peer list
 */
async function getPeers() {
  const status = await getStatus();
  return status.peers;
}

/**
 * Install Tailscale on the host system
 */
async function install() {
  const alreadyInstalled = await isInstalled();
  if (alreadyInstalled) {
    return { success: true, alreadyInstalled: true, message: 'Tailscale ist bereits installiert' };
  }

  // Verify host has curl
  let hasCurl = false;
  try {
    const res = await runOnHost('which curl', 5000);
    hasCurl = res.exitCode === 0;
  } catch {
    // ignore
  }

  if (!hasCurl) {
    // 409: am Zustand des Geraets liegt es, ein zweiter Versuch endet gleich.
    throw new UpstreamError(
      'Auf dem Gerät fehlt das Programm curl, das die Installation von Tailscale braucht. ' +
        'Ihr Betreuer kann es nachinstallieren.',
      { statusCode: 409, code: 'TAILSCALE_CURL_FEHLT', roh: 'which curl: nicht gefunden' }
    );
  }

  logger.info('Starting Tailscale installation on host via Docker...');

  const { exitCode, output } = await aufDemHost(
    'curl -fsSL https://tailscale.com/install.sh | sh 2>&1',
    180000, // 3 minutes
    'Installation'
  );

  if (exitCode !== 0) {
    logger.error(`Tailscale install failed (exit ${exitCode}): ${output}`);
    throw new UpstreamError(
      'Die Installation von Tailscale ist fehlgeschlagen. ' +
        'Prüfen Sie die Internetverbindung des Geräts und versuchen Sie es noch einmal.',
      { code: 'TAILSCALE_INSTALLATION_FEHLGESCHLAGEN', roh: `Exit ${exitCode}: ${output}` }
    );
  }

  // Verify
  const installed = await isInstalled();
  if (!installed) {
    logger.error('Tailscale install: Installer ohne Fehler beendet, Programm fehlt trotzdem');
    throw new UpstreamError(
      'Die Installation lief durch, aber Tailscale ist danach auf dem Gerät nicht zu finden. ' +
        'Versuchen Sie es noch einmal; hilft das nicht, wenden Sie sich an Ihren Betreuer.',
      { code: 'TAILSCALE_INSTALLATION_FEHLGESCHLAGEN', roh: `Installer-Ausgabe: ${output}` }
    );
  }

  // Enable and start the daemon
  try {
    await runOnHost('systemctl enable --now tailscaled 2>&1', 15000);
  } catch {
    logger.warn('Could not enable tailscaled service, may need manual start');
  }

  cacheInvalidate(); // clear all caches after install

  logger.info('Tailscale installation completed successfully');
  return { success: true, alreadyInstalled: false, message: 'Tailscale erfolgreich installiert' };
}

/**
 * Connect to Tailscale with auth key
 */
async function connect(authKey, hostname) {
  const installed = await isInstalled();
  if (!installed) {
    throw new ConflictError(NICHT_INSTALLIERT);
  }

  // Strict validation — only safe characters allowed (prevents shell injection)
  if (!authKey || !/^tskey-[a-zA-Z0-9_-]+$/.test(authKey)) {
    throw new ValidationError(
      'Der Auth-Key hat nicht die erwartete Form: er beginnt mit tskey- und enthält nur Buchstaben, Ziffern und Bindestriche. ' +
        'Kopieren Sie ihn noch einmal vollständig aus der Tailscale-Verwaltung.'
    );
  }

  let hostnameArg = '';
  if (hostname) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(hostname)) {
      throw new ValidationError(
        'Der Gerätename passt nicht: erlaubt sind Buchstaben, Ziffern und Bindestriche, höchstens 63 Zeichen. ' +
          'Wählen Sie einen kürzeren Namen ohne Leer- und Sonderzeichen.'
      );
    }
    hostnameArg = ` --hostname '${hostname}'`;
  }

  const cmd = `tailscale up --authkey '${authKey}' --ssh --accept-routes${hostnameArg} 2>&1`;

  const { exitCode, output } = await aufDemHost(cmd, 30000, 'Verbinden');

  if (exitCode !== 0) {
    logger.error(`Tailscale connect failed: ${output}`);
    if (DIENST_AUS.test(output)) {
      throw dienstAus(output);
    }
    if (SCHLUESSEL_UNGUELTIG.test(output)) {
      throw new UpstreamError(
        'Tailscale hat den Auth-Key abgelehnt, er ist ungültig, abgelaufen oder schon verbraucht. ' +
          'Erzeugen Sie in der Tailscale-Verwaltung einen neuen Auth-Key und versuchen Sie es damit.',
        { statusCode: 400, code: 'TAILSCALE_KEY_UNGUELTIG', roh: output }
      );
    }
    throw new UpstreamError(
      'Die Verbindung zu Tailscale kam nicht zustande. ' +
        'Prüfen Sie die Internetverbindung des Geräts und versuchen Sie es noch einmal.',
      { code: 'TAILSCALE_VERBINDEN_FEHLGESCHLAGEN', roh: output }
    );
  }

  cacheInvalidate(); // clear caches after connect
  logger.info('Tailscale connected successfully');

  // Wait briefly for connection to establish
  await new Promise(resolve => {
    setTimeout(resolve, 2000);
  });

  // KEIN `tailscale serve`. Bis zum 28.08.2026 schaltete das Verbinden es
  // automatisch ein, damit der MagicDNS-Name ein von Tailscale ausgestelltes
  // Zertifikat bekommt. Am Orin gemessen: mit aktivem `serve` bindet
  // tailscaled `100.x.y.z:443`, und danach bekommt Traefik `0.0.0.0:443` nicht
  // mehr -- der reverse-proxy startete nicht, und das Geraet war im EIGENEN
  // Firmennetz nicht mehr erreichbar. Ein Fernzugriff, der den Nahzugriff
  // abschaltet, ist keiner.
  //
  // Ohne `serve` antwortet Traefik auf allen Adressen des Geraets, auch im
  // Tailnet, mit dem Zertifikat der Geraete-CA. Es gibt seit Phase C10 genau
  // einen Weg zum vertrauten Schloss, und er gilt fuer beide Netze: die CA
  // einmal verteilen (docs/ops/NETZNAME_UND_ZERTIFIKAT.md).
  //
  // Ein `serve` aus einer frueheren Einrichtung wird aktiv zurueckgenommen --
  // dasselbe tut `scripts/setup/setup-tailscale.sh`. Ohne das bliebe der Port
  // auf jedem Geraet belegt, das schon einmal verbunden war.
  try {
    await runOnHost('tailscale serve reset 2>&1', 10000);
  } catch (err) {
    logger.warn(`tailscale serve ließ sich nicht zurücknehmen: ${err.message}`);
  }

  return await getStatus();
}

/**
 * Disconnect from Tailscale
 */
async function disconnect() {
  const installed = await isInstalled();
  if (!installed) {
    throw new ConflictError(NICHT_INSTALLIERT);
  }

  const { exitCode, output } = await aufDemHost('tailscale down 2>&1', 10000, 'Trennen');

  if (exitCode !== 0) {
    logger.error(`Tailscale disconnect failed: ${output}`);
    if (DIENST_AUS.test(output)) {
      throw dienstAus(output);
    }
    throw new UpstreamError(
      'Der Fernzugriff ließ sich nicht ausschalten. ' +
        'Versuchen Sie es noch einmal; hilft das nicht, starten Sie das Gerät neu.',
      { code: 'TAILSCALE_TRENNEN_FEHLGESCHLAGEN', roh: output }
    );
  }

  cacheInvalidate(); // clear caches after disconnect
  logger.info('Tailscale disconnected');
  return { success: true };
}

module.exports = {
  isInstalled,
  getStatus,
  getPeers,
  connect,
  disconnect,
  install,
};
