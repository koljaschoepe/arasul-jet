/**
 * Angaben ueber das Geraet fuer `routes/system/system.js`: JetPack-Fassung,
 * Internet, Jetson-Modell, Plattenbelegung, CA-Zertifikat.
 *
 * Aus der Route hierher gezogen (M5, Auftrag jet-fehlerklassen): Routen
 * fangen keine Fehler. Alles ausser dem Zertifikat ist Best-Effort -- eine
 * Angabe, die sich nicht lesen laesst, steht mit ihrem Leerwert da.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const { NotFoundError } = require('../../utils/errors');

const execFileAsync = promisify(execFile);

/** Die JetPack- bzw. L4T-Fassung, sonst `'unknown'`. */
async function jetpackVersion() {
  try {
    // SECURITY: Use execFile with array args to prevent shell injection
    const { stdout } = await execFileAsync('dpkg-query', [
      '-W',
      '-f',
      // eslint-disable-next-line no-template-curly-in-string
      '${Version}',
      'nvidia-jetpack',
    ]);
    if (stdout && stdout.trim()) {
      return stdout.trim();
    }
    return 'unknown';
  } catch {
    // dpkg-query queries a HOST package and always fails inside the container.
    // Fall back to the L4T release file, which compose mounts read-only.
    try {
      const rel = await fs.readFile('/etc/nv_tegra_release', 'utf8');
      // Example: "# R36 (release), REVISION: 4.7, GCID: 42132812, BOARD: ..."
      const m = rel.match(/R(\d+).*?REVISION:\s*([\d.]+)/);
      return m ? `L4T ${m[1]}.${m[2]}` : 'unknown';
    } catch {
      // Neither source available (non-Jetson host), stays "unknown"
      return 'unknown';
    }
  }
}

/** Antwortet 8.8.8.8 auf einen Ping? */
async function internetErreichbar() {
  try {
    // SECURITY: Use execFile with array args to prevent shell injection
    await execFileAsync('ping', ['-c', '1', '-W', '2', '8.8.8.8']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Welches Jetson-Modell? `null`, wenn es keines ist oder sich nicht erkennen
 * laesst.
 *
 * @returns {Promise<{deviceType: string, deviceName: string}|null>}
 */
async function jetsonModell() {
  try {
    return await jetsonModellLesen();
  } catch {
    // Not a Jetson device or could not detect
    return null;
  }
}

async function jetsonModellLesen() {
  // SECURITY: Use fs.readFile instead of exec('cat ...') to prevent shell injection
  // fire-and-forget: files may not exist on non-Jetson devices; empty string = not found
  const tegrastats = await fs.readFile('/etc/nv_tegra_release', 'utf8').catch(() => '');
  if (!tegrastats.includes('TEGRA')) {
    return null;
  }
  const modelInfo = await fs.readFile('/proc/device-tree/model', 'utf8').catch(() => '');
  if (modelInfo.includes('AGX Orin')) {
    return { deviceType: 'jetson_agx_orin', deviceName: 'NVIDIA Jetson AGX Orin' };
  }
  if (modelInfo.includes('Orin Nano')) {
    return { deviceType: 'jetson_orin_nano', deviceName: 'NVIDIA Jetson Orin Nano' };
  }
  if (modelInfo.includes('Orin NX')) {
    return { deviceType: 'jetson_orin_nx', deviceName: 'NVIDIA Jetson Orin NX' };
  }
  if (modelInfo.includes('Xavier')) {
    return { deviceType: 'jetson_xavier', deviceName: 'NVIDIA Jetson Xavier' };
  }
  if (modelInfo.includes('Nano')) {
    return { deviceType: 'jetson_nano', deviceName: 'NVIDIA Jetson Nano' };
  }
  return { deviceType: 'jetson_generic', deviceName: 'NVIDIA Jetson Device' };
}

/** Belegung der Wurzel laut `df -h /`, sonst `{}`. */
async function plattenBelegung() {
  try {
    const { stdout } = await execFileAsync('df', ['-h', '/']);
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      return { total: parts[1], used: parts[2], available: parts[3], percent: parts[4] };
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Das CA-Zertifikat als PEM. 404 mit Satz, wenn es fehlt oder beschaedigt
 * ist; der Befehl dazu (`./arasul zertifikat`) steht im Handbuch, nicht hier
 * (J35).
 */
async function caZertifikatLesen(pfad) {
  let pem;
  try {
    pem = await fs.readFile(pfad, 'utf8');
  } catch {
    throw new NotFoundError('Dieses Gerät hat noch kein Zertifikat. Ihr Betreuer stellt es aus.');
  }
  if (!pem.includes('BEGIN CERTIFICATE')) {
    throw new NotFoundError(
      'Das Zertifikat dieses Geräts ist beschädigt. Ihr Betreuer stellt es neu aus.'
    );
  }
  return pem;
}

module.exports = {
  jetpackVersion,
  internetErreichbar,
  jetsonModell,
  plattenBelegung,
  caZertifikatLesen,
};
