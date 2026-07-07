/**
 * Tailscale Service
 * Runs all Tailscale CLI commands on the HOST via temporary Docker containers.
 * The backend itself runs inside a minimal Alpine container without bash/curl/tailscale,
 * so we use Dockerode to create short-lived containers with host access.
 */

const { docker } = require('../core/docker');
const logger = require('../../utils/logger');
const { ServiceUnavailableError } = require('../../utils/errors');

const HOST_IMAGE = 'alpine:latest';

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
        timer = setTimeout(() => reject(new Error('Zeitlimit überschritten')), timeoutMs);
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
      `isInstalled host probe failed — reporting detection error (NOT installed:false): ${err.message}`
    );
    throw new ServiceUnavailableError(
      'Tailscale-Status konnte nicht geprüft werden (Host-Prüfung fehlgeschlagen)'
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
    certDomains: [],
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
      `getStatus host probe failed — reporting detectionError (NOT installed:false): ${err.message}`
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
  // Domains this node can obtain TLS certs for — populated by tailscaled only
  // when MagicDNS + HTTPS certs are enabled for the tailnet. Read-only signal
  // for `serveStatus().httpsAvailable` (no cert is fetched/written to probe it).
  const certDomains = Array.isArray(statusData.CertDomains) ? statusData.CertDomains : [];

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
    certDomains,
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
    throw new Error(
      'curl ist auf dem Host nicht verfügbar. ' +
        'Bitte manuell installieren: sudo apt-get install -y curl'
    );
  }

  logger.info('Starting Tailscale installation on host via Docker...');

  const { exitCode, output } = await runOnHost(
    'curl -fsSL https://tailscale.com/install.sh | sh 2>&1',
    180000 // 3 minutes
  );

  if (exitCode !== 0) {
    logger.error(`Tailscale install failed (exit ${exitCode}): ${output}`);
    throw new Error(
      `Installation fehlgeschlagen (Exit-Code ${exitCode}). ` +
        (output.slice(-200) || 'Keine weitere Ausgabe')
    );
  }

  // Verify
  const installed = await isInstalled();
  if (!installed) {
    throw new Error(
      'Installation scheinbar abgeschlossen, aber tailscale Binary nicht auf dem Host gefunden'
    );
  }

  // Enable and start the daemon
  try {
    await runOnHost('systemctl enable --now tailscaled 2>&1', 15000);
  } catch {
    logger.warn('Could not enable tailscaled service — may need manual start');
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
    throw new Error('Tailscale ist nicht installiert');
  }

  // Strict validation — only safe characters allowed (prevents shell injection)
  if (!authKey || !/^tskey-[a-zA-Z0-9_-]+$/.test(authKey)) {
    throw new Error('Ungültiger Auth-Key (muss mit tskey- beginnen, nur alphanumerische Zeichen)');
  }

  let hostnameArg = '';
  if (hostname) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(hostname)) {
      throw new Error(
        'Ungültiger Hostname (nur Buchstaben, Zahlen und Bindestriche, max 63 Zeichen)'
      );
    }
    hostnameArg = ` --hostname '${hostname}'`;
  }

  const cmd = `tailscale up --authkey '${authKey}' --ssh --accept-routes${hostnameArg} 2>&1`;

  const { exitCode, output } = await runOnHost(cmd, 30000);

  if (exitCode !== 0) {
    logger.error(`Tailscale connect failed: ${output}`);
    throw new Error('Verbindung fehlgeschlagen: ' + (output.slice(-200) || 'Unbekannter Fehler'));
  }

  cacheInvalidate(); // clear caches after connect
  logger.info('Tailscale connected successfully');

  // Wait briefly for connection to establish
  await new Promise(resolve => {
    setTimeout(resolve, 2000);
  });

  // Best-effort: turn on `serve` so remote HTTPS gets a browser-trusted cert
  // right away. Non-fatal — if it fails (e.g. MagicDNS HTTPS not yet enabled in
  // the admin console), remote access still works via the raw Tailscale IP.
  try {
    await enableServe();
  } catch (err) {
    logger.warn(`Auto-enable of tailscale serve failed (non-fatal): ${err.message}`);
  }

  return await getStatus();
}

/**
 * Disconnect from Tailscale
 */
async function disconnect() {
  const installed = await isInstalled();
  if (!installed) {
    throw new Error('Tailscale ist nicht installiert');
  }

  const { exitCode, output } = await runOnHost('tailscale down 2>&1', 10000);

  if (exitCode !== 0) {
    logger.error(`Tailscale disconnect failed: ${output}`);
    throw new Error('Trennung fehlgeschlagen: ' + (output || 'Unbekannter Fehler'));
  }

  cacheInvalidate(); // clear caches after disconnect
  logger.info('Tailscale disconnected');
  return { success: true };
}

/**
 * Report `tailscale serve` state for browser-trusted remote HTTPS.
 *
 * `serve` is what makes `https://<device>.<tailnet>.ts.net` load with a real,
 * browser-trusted certificate (no cert warning) by proxying the tailnet HTTPS
 * endpoint to Traefik on 443. We also surface whether MagicDNS+HTTPS certs are
 * available in the tailnet — that is a one-time admin-console toggle, and
 * without it `serve --https` cannot obtain a cert.
 *
 * Both signals are READ-ONLY: `serve status` prints config, and cert
 * availability is read from the `CertDomains` field of `tailscale status`
 * (populated by tailscaled when HTTPS is enabled). We deliberately do NOT run
 * `tailscale cert`, which would fetch and write a real cert + private key.
 *
 * @returns {Promise<{installed:boolean, enabled:boolean, httpsAvailable:boolean, dnsName:string|null}>}
 */
async function serveStatus() {
  const status = await getStatus();
  if (!status.installed) {
    return { installed: false, enabled: false, httpsAvailable: false, dnsName: null };
  }

  let enabled = false;

  try {
    const { exitCode, output } = await runOnHost('tailscale serve status 2>&1', 10000);
    // "No serve config" (any casing) means serve is off; anything referencing
    // https:// / 443 / a proxy target means it is on.
    if (exitCode === 0 && output && !/no serve config/i.test(output)) {
      enabled = /https|:443|proxy|127\.0\.0\.1/i.test(output);
    }
  } catch (err) {
    logger.debug(`serveStatus: serve status probe failed: ${err.message}`);
  }

  // HTTPS cert availability: read-only from the status JSON's CertDomains.
  // Non-empty ⇒ tailnet has MagicDNS+HTTPS certs enabled, so `serve --https`
  // can obtain a browser-trusted cert. No cert is fetched or written to check.
  const httpsAvailable = Array.isArray(status.certDomains) && status.certDomains.length > 0;

  return { installed: true, enabled, httpsAvailable, dnsName: status.dnsName };
}

/**
 * Enable `tailscale serve` pointing at Traefik on 443.
 *
 * Points at 443 (NOT 80 — port 80 would 301-redirect and loop). `https+insecure`
 * because Traefik terminates with a self-signed backend cert; Tailscale is the
 * outward TLS terminator with the trusted MagicDNS cert. Idempotent: re-running
 * just re-asserts the same config.
 */
async function enableServe() {
  const installed = await isInstalled();
  if (!installed) {
    throw new Error('Tailscale ist nicht installiert');
  }

  const cmd = 'tailscale serve --bg --https=443 https+insecure://127.0.0.1:443 2>&1';
  const { exitCode, output } = await runOnHost(cmd, 20000);

  if (exitCode !== 0) {
    logger.error(`Tailscale serve enable failed: ${output}`);
    throw new Error(
      'Aktivierung von tailscale serve fehlgeschlagen: ' +
        (output.slice(-200) || 'Unbekannter Fehler')
    );
  }

  cacheInvalidate();
  logger.info('Tailscale serve enabled (https=443 → 127.0.0.1:443)');
  return await serveStatus();
}

/**
 * Disable `tailscale serve` (falls back to raw Tailscale-IP access).
 */
async function disableServe() {
  const installed = await isInstalled();
  if (!installed) {
    throw new Error('Tailscale ist nicht installiert');
  }

  const { exitCode, output } = await runOnHost('tailscale serve reset 2>&1', 10000);

  if (exitCode !== 0) {
    logger.error(`Tailscale serve disable failed: ${output}`);
    throw new Error(
      'Deaktivierung von tailscale serve fehlgeschlagen: ' + (output || 'Unbekannter Fehler')
    );
  }

  cacheInvalidate();
  logger.info('Tailscale serve disabled');
  return { success: true };
}

module.exports = {
  isInstalled,
  getStatus,
  getPeers,
  connect,
  disconnect,
  install,
  serveStatus,
  enableServe,
  disableServe,
};
