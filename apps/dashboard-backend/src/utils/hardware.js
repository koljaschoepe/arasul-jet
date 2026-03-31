/**
 * Hardware Detection Utility
 * Detects Jetson device type, GPU availability, and LLM RAM allocation
 */

const os = require('os');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');

const execFileAsync = promisify(execFile);

// Cache detection results (hardware doesn't change at runtime)
let cachedDeviceInfo = null;
let cachedGpuInfo = null;
let gpuInfoExpiresAt = 0;
const GPU_CACHE_TTL = 30_000; // 30s - GPU memory changes as models load/unload

/**
 * Detect Jetson device type from device-tree
 * @returns {Promise<{type: string, name: string, cpuCores: number, totalMemoryGB: number}>}
 */
async function detectDevice() {
  if (cachedDeviceInfo) {return cachedDeviceInfo;}

  const cpuCores = os.cpus().length;
  const totalMemoryGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  let deviceType = 'generic';
  let deviceName = 'Generic Linux';

  try {
    // Try device-tree first (available on host, may not be in container)
    // fire-and-forget: files may not exist on non-Jetson devices; empty string = not found
    const modelInfo = await fs.readFile('/proc/device-tree/model', 'utf8').catch(() => '');
    const tegrastats = await fs.readFile('/etc/nv_tegra_release', 'utf8').catch(() => '');
    const isJetson =
      tegrastats.includes('TEGRA') || modelInfo.includes('Jetson') || modelInfo.includes('NVIDIA');

    if (isJetson) {
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
  if (cachedGpuInfo && Date.now() < gpuInfoExpiresAt) {return cachedGpuInfo;}

  try {
    // Try tegrastats-style detection first (Jetson unified memory)
    // fire-and-forget: file may not exist on non-Jetson devices; null = not found
    const tegraFile = await fs.readFile('/etc/nv_tegra_release', 'utf8').catch(() => null);
    if (tegraFile) {
      // On Jetson, GPU shares system RAM - report unified memory
      const totalMemoryMB = Math.round(os.totalmem() / (1024 * 1024));
      const freeMemoryMB = Math.round(os.freemem() / (1024 * 1024));

      // Get CUDA version
      let cudaVersion = 'unknown';
      try {
        const versionFile = await fs.readFile('/usr/local/cuda/version.json', 'utf8');
        const parsed = JSON.parse(versionFile);
        cudaVersion = parsed.cuda?.version || 'unknown';
      } catch {
        try {
          const versionTxt = await fs.readFile('/usr/local/cuda/version.txt', 'utf8');
          const match = versionTxt.match(/CUDA Version (\d+\.\d+)/);
          if (match) {cudaVersion = match[1];}
        } catch {
          // CUDA version not available
        }
      }

      cachedGpuInfo = {
        available: true,
        name: 'NVIDIA Tegra (Unified Memory)',
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

/**
 * Get effective LLM RAM limit in GB
 * Priority: RAM_LIMIT_LLM env var → 60% of system RAM → 32GB fallback
 * @returns {number}
 */
function getLlmRamGB() {
  const envLimit = process.env.RAM_LIMIT_LLM;
  if (envLimit) {
    const num = parseInt(envLimit, 10);
    if (!isNaN(num) && num > 0) {return num;}
  }
  const totalGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  return Math.max(4, Math.floor(totalGB * 0.6));
}

module.exports = {
  detectDevice,
  getGpuInfo,
  getLlmRamGB,
};
