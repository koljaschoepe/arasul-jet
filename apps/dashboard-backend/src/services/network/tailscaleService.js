/**
 * Tailscale Service
 * Runs all Tailscale CLI commands on the HOST via temporary Docker containers.
 * The backend itself runs inside a minimal Alpine container without bash/curl/tailscale,
 * so we use Dockerode to create short-lived containers with host access.
 */

const { docker } = require('../core/docker');
const logger = require('../../utils/logger');

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

/**
 * Run a command on the host system via a temporary Docker container.
 * Uses bind-mount of host root + chroot to execute commands as if on the host.
 */
async function runOnHost(cmd, timeoutMs = 10000) {
  let container;
  try {
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
    logger.debug(`isInstalled check failed: ${err.message}`);
    return false;
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
    logger.debug(`getStatus combined command failed: ${err.message}`);
    return emptyStatus;
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

module.exports = {
  isInstalled,
  getStatus,
  getPeers,
  connect,
  disconnect,
  install,
};
