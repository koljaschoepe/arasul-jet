/**
 * Hardware Detection Utility
 * Detects Jetson device type, GPU availability, and LLM RAM allocation
 */

const os = require('os');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Cache detection results (hardware doesn't change at runtime)
let cachedDeviceInfo = null;
let cachedGpuInfo = null;
let gpuInfoExpiresAt = 0;
const GPU_CACHE_TTL = 30_000; // 30s - GPU memory changes as models load/unload

/**
 * Ist das ein NVIDIA DGX Spark (GB10, DGX OS)? (J4, 01.10.2026)
 *
 * Ein Spark hat 20 Kerne und 128 GB, also genau die Zahlen, an denen der
 * Rueckfall unten einen Thor erkennt -- ohne diese Frage hielt das Backend
 * ihn dafuer, rechnete die GPU aus dem Arbeitsspeicher und nannte sie
 * "NVIDIA Thor 128GB". Zwei Belege, jeder fuer sich genuegt:
 *   - `JETSON_PROFILE=dgx_spark`, geschrieben von detect-platform.sh;
 *   - die Kerne: GB10 traegt Cortex-X925 und Cortex-A725 (CPU part 0xd85
 *     und 0xd87), kein Jetson tut das (Orin: A78AE 0xd42, Thor: Neoverse
 *     V3AE 0xd83). /proc/cpuinfo zeigt auch im Container die Kerne des Hosts.
 * Ein Geraet mit Tegra-Marker ist nie ein Spark; das fragt der Aufrufer vorher.
 */
async function istDgxSpark() {
  if (process.env.JETSON_PROFILE === 'dgx_spark') {
    return true;
  }
  if (os.arch() !== 'arm64') {
    return false;
  }
  // fire-and-forget: ohne lesbare cpuinfo ist es kein Beleg
  const cpuinfo = await fs.readFile('/proc/cpuinfo', 'utf8').catch(() => '');
  return /^CPU part\s*:\s*0xd8[57]\b/im.test(cpuinfo);
}

/**
 * Detect Jetson device type from device-tree
 * @returns {Promise<{type: string, name: string, cpuCores: number, totalMemoryGB: number}>}
 */
async function detectDevice() {
  if (cachedDeviceInfo) {
    return cachedDeviceInfo;
  }

  const cpuCores = os.cpus().length;
  const totalMemoryGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  let deviceType = 'generic';
  let deviceName = 'Generic Linux';

  try {
    // Try device-tree first (available on host, may not be in container)
    // fire-and-forget: files may not exist on non-Jetson devices; empty string = not found
    const modelInfo = await fs.readFile('/proc/device-tree/model', 'utf8').catch(() => '');
    const tegrastats = await fs.readFile('/etc/nv_tegra_release', 'utf8').catch(() => '');
    const tegra = tegrastats.includes('TEGRA');
    const isJetson = tegra || modelInfo.includes('Jetson') || modelInfo.includes('NVIDIA');

    if (!tegra && (await istDgxSpark())) {
      deviceType = 'dgx_spark';
      deviceName = 'NVIDIA DGX Spark';
    } else if (isJetson) {
      if (totalMemoryGB >= 120) {
        deviceType = 'thor_128gb';
        deviceName = 'NVIDIA Thor 128GB';
      } else if (modelInfo.includes('AGX Orin') && totalMemoryGB >= 56) {
        deviceType = 'jetson_agx_orin_64gb';
        deviceName = 'NVIDIA Jetson AGX Orin 64GB';
      } else if (modelInfo.includes('AGX Orin')) {
        deviceType = 'jetson_agx_orin_32gb';
        deviceName = 'NVIDIA Jetson AGX Orin 32GB';
      } else if (modelInfo.includes('Orin NX')) {
        deviceType = 'jetson_orin_nx';
        deviceName = 'NVIDIA Jetson Orin NX';
      } else if (modelInfo.includes('Orin Nano')) {
        deviceType = 'jetson_orin_nano';
        deviceName = 'NVIDIA Jetson Orin Nano';
      } else {
        deviceType = 'jetson_generic';
        deviceName = 'NVIDIA Jetson Device';
      }
    } else if (cpuCores === 12 && totalMemoryGB >= 56 && totalMemoryGB <= 64) {
      // Fallback: ARM64 12-core + 64GB = likely Jetson AGX Orin (inside Docker)
      deviceType = 'jetson_agx_orin_64gb';
      deviceName = 'NVIDIA Jetson AGX Orin 64GB (detected by RAM/CPU)';
    } else if (cpuCores === 12 && totalMemoryGB >= 28 && totalMemoryGB <= 35) {
      deviceType = 'jetson_agx_orin_32gb';
      deviceName = 'NVIDIA Jetson AGX Orin 32GB (detected by RAM/CPU)';
    } else if (cpuCores >= 20 && totalMemoryGB >= 120) {
      deviceType = 'thor_128gb';
      deviceName = 'NVIDIA Thor 128GB (detected by RAM/CPU)';
    }
  } catch {
    // Not a Jetson device
  }

  cachedDeviceInfo = { type: deviceType, name: deviceName, cpuCores, totalMemoryGB };
  return cachedDeviceInfo;
}

/**
 * Get GPU info (availability, memory, CUDA version)
 * @returns {Promise<{available: boolean, name?: string, cudaVersion?: string, memoryTotalMB?: number, memoryFreeMB?: number}>}
 */
async function getGpuInfo() {
  if (cachedGpuInfo && Date.now() < gpuInfoExpiresAt) {
    return cachedGpuInfo;
  }

  try {
    const device = await detectDevice();

    // DGX Spark: die GPU nennt nvidia-smi (J4). Danach kein Jetson-Zweig,
    // auch wenn es nichts zu lesen gab -- sonst stuende dort wieder der
    // Arbeitsspeicher als GPU eines Thor.
    if (device.type === 'dgx_spark') {
      cachedGpuInfo = await sparkGpuInfo(device);
      gpuInfoExpiresAt = Date.now() + GPU_CACHE_TTL;
      return cachedGpuInfo;
    }

    // Jetson detection: try tegra file first, then fall back to device profile.
    // Containers often don't mount /etc/nv_tegra_release; detectDevice() uses RAM/CPU heuristics.
    const tegraFile = await fs.readFile('/etc/nv_tegra_release', 'utf8').catch(() => null);
    const isJetson =
      !!tegraFile || device.type.startsWith('jetson_') || device.type === 'thor_128gb';

    if (isJetson) {
      const totalMemoryMB = Math.round(os.totalmem() / (1024 * 1024));
      const freeMemoryMB = Math.round(os.freemem() / (1024 * 1024));

      let cudaVersion = 'unknown';
      try {
        const versionFile = await fs.readFile('/usr/local/cuda/version.json', 'utf8');
        const parsed = JSON.parse(versionFile);
        cudaVersion = parsed.cuda?.version || 'unknown';
      } catch {
        try {
          const versionTxt = await fs.readFile('/usr/local/cuda/version.txt', 'utf8');
          const match = versionTxt.match(/CUDA Version (\d+\.\d+)/);
          if (match) {
            cudaVersion = match[1];
          }
        } catch {
          // CUDA version not available
        }
      }

      cachedGpuInfo = {
        available: true,
        name: `NVIDIA ${device.name.replace(/^NVIDIA /, '')} (Unified Memory)`,
        cudaVersion,
        memoryTotalMB: totalMemoryMB,
        memoryFreeMB: freeMemoryMB,
        unified: true,
      };
      gpuInfoExpiresAt = Date.now() + GPU_CACHE_TTL;
      return cachedGpuInfo;
    }

    // Fallback: nvidia-smi for discrete GPUs
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,memory.total,memory.free,driver_version',
      '--format=csv,noheader,nounits',
    ]);
    const parts = stdout
      .trim()
      .split(',')
      .map(s => s.trim());
    if (parts.length >= 4) {
      cachedGpuInfo = {
        available: true,
        name: parts[0],
        memoryTotalMB: parseInt(parts[1]),
        memoryFreeMB: parseInt(parts[2]),
        driverVersion: parts[3],
        unified: false,
      };
      gpuInfoExpiresAt = Date.now() + GPU_CACHE_TTL;
      return cachedGpuInfo;
    }
  } catch {
    // No GPU available
  }

  cachedGpuInfo = { available: false };
  gpuInfoExpiresAt = Date.now() + GPU_CACHE_TTL;
  return cachedGpuInfo;
}

// `81920` -> 81920, `[N/A]` oder leer -> null
function zahl(wert) {
  const n = parseInt(String(wert ?? '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * nvidia-smi am DGX Spark lesen: im eigenen Container, wenn es dort eines gibt,
 * sonst beim llm-service (`GET /api/gpu`), der mit der GPU-Laufzeit laeuft.
 * Nennt nvidia-smi keinen Speicher (`[N/A]`, bei geteiltem Speicher moeglich),
 * gilt der Arbeitsspeicher -- GB10 hat ohnehin nur einen.
 */
async function nvidiaSmiLesen() {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=name,memory.total,memory.free,driver_version', '--format=csv,noheader,nounits'],
      { timeout: 2000 }
    );
    const teile = stdout
      .trim()
      .split('\n')[0]
      .split(',')
      .map(t => t.trim());
    if (teile.length >= 4 && teile[0]) {
      return {
        name: teile[0],
        totalMB: zahl(teile[1]),
        freeMB: zahl(teile[2]),
        driverVersion: teile[3],
      };
    }
  } catch {
    // kein nvidia-smi in diesem Container -- dann fragt der llm-service
  }
  try {
    const services = require('../config/services');
    const antwort = await fetch(`${services.llm.managementUrl}/api/gpu`, {
      signal: AbortSignal.timeout(2000),
    });
    const daten = await antwort.json();
    if (daten && daten.available && daten.name) {
      return {
        name: daten.name,
        totalMB: zahl(daten.memory_total_mb),
        freeMB: zahl(daten.memory_free_mb),
        driverVersion: daten.driver_version,
      };
    }
  } catch {
    // llm-service nicht erreichbar
  }
  return null;
}

async function sparkGpuInfo(device) {
  const gelesen = await nvidiaSmiLesen();
  if (!gelesen) {
    return { available: false };
  }
  const mitSpeicher = gelesen.totalMB !== null && gelesen.freeMB !== null;
  return {
    available: true,
    name: gelesen.name || device.name,
    driverVersion: gelesen.driverVersion,
    memoryTotalMB: mitSpeicher ? gelesen.totalMB : Math.round(os.totalmem() / (1024 * 1024)),
    memoryFreeMB: mitSpeicher ? gelesen.freeMB : Math.round(os.freemem() / (1024 * 1024)),
    memorySource: mitSpeicher ? 'nvidia-smi' : 'arbeitsspeicher',
    unified: true,
  };
}

/**
 * Get effective LLM RAM limit in GB
 * Priority: RAM_LIMIT_LLM env var → 60% of system RAM → 32GB fallback
 * @returns {number}
 */
function getLlmRamGB() {
  const envLimit = process.env.RAM_LIMIT_LLM;
  if (envLimit) {
    const num = parseInt(envLimit, 10);
    if (!isNaN(num) && num > 0) {
      return num;
    }
  }
  const totalGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  return Math.max(4, Math.floor(totalGB * 0.6));
}

/**
 * Get recommended default model based on device profile.
 * Uses JETSON_PROFILE env var (set by detect-jetson.sh) with fallback to detectDevice().
 *
 * Returns four model slots:
 *   - model            primary chat-quality default for the detected hardware
 *   - fast_model       small companion for short steps where speed beats depth
 *   - vision_model     Bilder und eingescannter Text -- seit 26.09.2026 (J35,
 *                      Migration 188) das kleine schnelle Modell: `gemma4:e4b`
 *                      las am Orin fuenf erfundene Belegfotos fehlerfrei,
 *                      `llava-phi3` fast nichts. Fehlt es im Katalog, faellt
 *                      die Rolle auf das Modell der Aufgabe `vision` zurueck.
 *   - embedding_model  Einbettungen (/v1/embeddings)
 *
 * SEIT PHASE C8 IST DIE LISTE UEBERALL DIESELBE. Vorher trug diese Karte
 * siebzehn Kennungen fuer elf Profile, und acht davon standen in keinem
 * Katalog -- auf einem Xavier NX empfahl sie `phi3:mini`, ein Modell, das
 * niemand laden kann (Plan 023 D5, deshalb `gegenKatalogPruefen`). Die
 * Kurzliste macht die Fallunterscheidung gegenstandslos: es gibt vier Modelle,
 * und die Frage ist nicht mehr "welches", sondern "passt der Standard noch in
 * dieses Geraet". Genau das steht jetzt hier -- ein Profil kippt den Standard
 * auf das kleine schnelle Modell, sobald der Speicher fuer die 24 GB des
 * Standardmodells nicht reicht (seit 25.09.2026, J35, `qwen3.8:27b-q4_K_M` aus
 * der Ollama-Bibliothek statt der 22 GB der Hugging-Face-Datei). Die
 * Kurzliste selbst kommt aus `config/modelle/kurzliste.json`;
 * `scripts/test/kurzliste.py` haelt sie fest.
 *
 * @returns {Promise<{model: string, fast_model: string, vision_model: string|null, embedding_model: string, profile: string, models: string[]}>}
 */
async function getRecommendedModel() {
  // Die vier Modelle der Kurzliste (config/modelle/kurzliste.json).
  const STANDARD = 'qwen3.8:27b-q4_K_M';
  const SCHNELL = 'gemma4:e4b';
  const SEHEN = 'llava-phi3';
  const EINBETTUNG = 'nomic-embed-text';

  // Ein Profil sagt nur noch, ob das Standardmodell hineinpasst. Es braucht
  // 24 GB; wo weniger fuer die Modelle uebrig ist, fuehrt das kleine schnelle.
  const GROSS = {
    model: STANDARD,
    fast_model: SCHNELL,
    vision_model: SCHNELL,
    embedding_model: EINBETTUNG,
    models: [STANDARD, SCHNELL, SEHEN, EINBETTUNG],
  };
  const KLEIN = {
    model: SCHNELL,
    fast_model: SCHNELL,
    vision_model: SCHNELL,
    embedding_model: EINBETTUNG,
    models: [SCHNELL, SEHEN, EINBETTUNG],
  };

  const PROFILE_MODELS = {
    thor_128gb: GROSS,
    thor_64gb: GROSS,
    dgx_spark: GROSS,
    agx_orin_64gb: GROSS,
    // Ab hier reicht der Speicher fuer die 24 GB des Standardmodells nicht.
    agx_orin_32gb: KLEIN,
    orin_nx_16gb: KLEIN,
    xavier_agx: KLEIN,
    xavier_nx_8gb: KLEIN,
    orin_8gb: KLEIN,
    minimal_4gb: KLEIN,
    nano_4gb: KLEIN,
    nano_2gb: KLEIN,
    generic: KLEIN,
  };

  // 1. Try JETSON_PROFILE env var (set by setup scripts)
  let profile = process.env.JETSON_PROFILE;

  // 2. Fallback: detect from hardware
  if (!profile) {
    const device = await detectDevice();
    // Map hardware.js device types to profile names
    const DEVICE_TYPE_MAP = {
      thor_128gb: 'thor_128gb',
      dgx_spark: 'dgx_spark',
      jetson_agx_orin_64gb: 'agx_orin_64gb',
      jetson_agx_orin_32gb: 'agx_orin_32gb',
      jetson_orin_nx: 'orin_nx_16gb',
      jetson_orin_nano: 'orin_8gb',
    };
    profile = DEVICE_TYPE_MAP[device.type] || 'generic';
  }

  const recommendation = PROFILE_MODELS[profile] || PROFILE_MODELS.generic;
  return { ...(await gegenKatalogPruefen(recommendation)), profile };
}

/**
 * Die Empfehlung gegen den Katalog pruefen (Plan 023 D5).
 *
 * Die Karte oben sagt, welche GROESSENKLASSE auf welches Geraet passt. Das ist
 * Hardwarewissen und gehoert hierher. Welches Modell diese Klasse fuellt, sagt
 * der Katalog, und bis zum 21.08.2026 stimmten die beiden nicht ueberein: ACHT
 * der siebzehn Kennungen in der Karte gab es im Katalog nicht, unter anderem
 * das Modell, das der Einrichtungsassistent auf einem Xavier NX empfahl.
 *
 * Seit Phase C8 ist die Karte die Kurzliste, und damit dieselbe Liste, die auch
 * Migration 175 in den Katalog schreibt. Diese Pruefung bleibt trotzdem, und
 * zwar aus einem anderen Grund als damals: sie fasst den Fall ab, in dem die
 * beiden AUSEINANDERLAUFEN -- ein Geraet, dessen Migration nicht durchgelaufen
 * ist, oder ein Katalog, der eine spaetere Kurzliste traegt als dieser Code.
 *
 * Eine Kennung, die der Katalog nicht kennt, faellt auf den Standard ihrer
 * Aufgabe zurueck (`is_task_default`, seit Migration 151 hoechstens einer je
 * Aufgabe). Eine Empfehlung zeigt damit nie auf etwas, das es nicht gibt, und
 * wer die Karte aendert, ohne die Migration nachzuziehen, bekommt eine Warnung
 * statt eines stillen Fehlgriffs.
 */
const ROLLE_ZU_AUFGABE = {
  model: 'text',
  fast_model: 'text',
  vision_model: 'vision',
  embedding_model: 'embedding',
};

async function gegenKatalogPruefen(empfehlung) {
  let database;
  let logger;
  try {
    database = require('../database');
    logger = require('./logger');
  } catch {
    return empfehlung; // ohne Datenbank bleibt es bei der Karte
  }

  let vorhanden = new Set();
  const standard = {};
  try {
    const { rows } = await database.query(
      'SELECT id, task, is_task_default FROM llm_model_catalog'
    );
    vorhanden = new Set(rows.map(r => r.id));
    for (const r of rows) {
      if (r.is_task_default && r.task) {
        standard[r.task] = r.id;
      }
    }
  } catch (fehler) {
    logger.debug(`[hardware] Katalog nicht lesbar, Empfehlung ungeprueft: ${fehler.message}`);
    return empfehlung;
  }
  if (vorhanden.size === 0) {
    return empfehlung;
  }

  const geprueft = { ...empfehlung };
  for (const [rolle, aufgabe] of Object.entries(ROLLE_ZU_AUFGABE)) {
    const kennung = empfehlung[rolle];
    if (!kennung || vorhanden.has(kennung)) {
      continue;
    }
    const ersatz = standard[aufgabe] || null;
    logger.warn(
      `[hardware] Empfohlenes Modell "${kennung}" (${rolle}) steht nicht im Katalog. ` +
        (ersatz
          ? `Es gilt der Standard der Aufgabe ${aufgabe}: ${ersatz}.`
          : `Kein Ersatz fuer die Aufgabe ${aufgabe}.`)
    );
    geprueft[rolle] = ersatz;
  }

  // Die Liste `models` ist der Vorschlag fuer den Einrichtungsassistenten.
  // Was es nicht gibt, gehoert nicht hinein.
  if (Array.isArray(empfehlung.models)) {
    const uebrig = empfehlung.models.filter(id => vorhanden.has(id));
    const fehlend = empfehlung.models.filter(id => !vorhanden.has(id));
    if (fehlend.length > 0) {
      logger.warn(
        `[hardware] Nicht im Katalog und deshalb nicht vorgeschlagen: ${fehlend.join(', ')}`
      );
    }
    geprueft.models = uebrig.length > 0 ? uebrig : [geprueft.model].filter(Boolean);
    // Die Hauptempfehlung gehoert in ihre eigene Alternativliste. Wurde sie
    // gerade ersetzt, steht sie sonst nicht darin, und der Assistent schluege
    // alles vor ausser dem, was er empfiehlt.
    if (geprueft.model && !geprueft.models.includes(geprueft.model)) {
      geprueft.models.unshift(geprueft.model);
    }
  }

  return geprueft;
}

module.exports = {
  detectDevice,
  istDgxSpark,
  getGpuInfo,
  getLlmRamGB,
  getRecommendedModel,
};
