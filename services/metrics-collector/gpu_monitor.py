#!/usr/bin/env python3
"""
ARASUL PLATFORM - GPU Monitoring & Error Detection
Monitors GPU health, detects errors, and provides recovery recommendations
"""

import os
import sys
import time
import logging
import json
import subprocess
import glob as glob_module
from typing import Dict, Optional, Tuple, List
from dataclasses import dataclass
from enum import Enum

# Try to import pynvml (NVIDIA Management Library)
try:
    import pynvml
    NVML_AVAILABLE = True
except ImportError:
    NVML_AVAILABLE = False
    print("WARNING: pynvml not available. GPU monitoring will be limited.", file=sys.stderr)

logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('gpu-monitor')


class GPUHealth(Enum):
    """GPU Health States"""
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    ERROR = "error"
    UNAVAILABLE = "unavailable"


class GPUError(Enum):
    """GPU Error Types"""
    NONE = "none"
    OOM = "out_of_memory"
    HANG = "gpu_hang"
    THERMAL = "thermal_throttling"
    POWER = "power_limit"
    ECC = "ecc_error"
    NVLINK = "nvlink_error"
    UNKNOWN = "unknown_error"


@dataclass
class GPUStats:
    """GPU Statistics"""
    index: int
    name: str
    temperature: float
    utilization: float
    memory_used: int
    memory_total: int
    memory_percent: float
    power_draw: float
    power_limit: float
    fan_speed: Optional[int]
    clock_graphics: int
    clock_memory: int
    health: GPUHealth
    error: GPUError
    error_message: Optional[str] = None


class GPUMonitor:
    """
    GPU Monitoring and Error Detection

    Monitors GPU health using NVML and provides error detection
    for CUDA OOM, GPU hangs, thermal issues, etc.

    On NVIDIA Jetson (AGX Orin/Thor), reads GPU metrics from sysfs
    since NVML and nvidia-smi are not fully supported on integrated GPUs.
    """

    # Jetson sysfs prefixes (mounted as /host/sys in container)
    JETSON_SYSFS_PREFIXES = ['/host/sys', '/sys']

    # Candidate GPU load paths (Orin JetPack 6+, Xavier legacy, generic)
    GPU_LOAD_CANDIDATES = [
        'devices/platform/bus@0/17000000.gpu/load',  # AGX Orin, JetPack 6+ (L4T R36+)
        'devices/platform/gpu.0/load',               # Xavier legacy
        'devices/platform/gpu/load',                 # Generic fallback
    ]

    # Glob patterns for future-proofing (Thor / other Tegra SoCs)
    GPU_LOAD_GLOB_PATTERNS = [
        'devices/platform/bus@*/[0-9a-f]*.gpu/load',
    ]

    # Candidate GPU devfreq paths (glob patterns for dynamic discovery)
    GPU_FREQ_GLOB_PATTERNS = [
        'devices/platform/bus@0/*/devfreq/*/cur_freq',
        'devices/platform/*/gpu/devfreq/*/cur_freq',
        'devices/platform/gpu.0/devfreq/*/cur_freq',
        'devices/platform/gpu/devfreq/*/cur_freq',
    ]

    GPU_MAX_FREQ_GLOB_PATTERNS = [
        'devices/platform/bus@0/*/devfreq/*/max_freq',
        'devices/platform/*/gpu/devfreq/*/max_freq',
        'devices/platform/gpu.0/devfreq/*/max_freq',
        'devices/platform/gpu/devfreq/*/max_freq',
    ]

    # GPU thermal zone is discovered dynamically by checking zone type

    def __init__(self):
        self.nvml_initialized = False
        self.gpu_count = 0
        self.last_stats = {}
        self.error_counts = {}
        self.is_jetson = False
        self._sysfs_prefix = '/host/sys'

        # Discovered sysfs paths (set by _detect_jetson)
        self._gpu_load_path = None
        self._gpu_freq_path = None
        self._gpu_max_freq_path = None
        self._gpu_thermal_path = None

        # Thresholds - temperature
        self.TEMP_WARNING = 83.0  # °C
        self.TEMP_CRITICAL = 85.0  # °C
        self.TEMP_SHUTDOWN = 90.0  # °C

        # Thresholds - memory (percentage-based, device-agnostic)
        self.MEMORY_WARNING_PERCENT = float(os.getenv('GPU_MEMORY_WARNING_PERCENT', '85'))
        self.MEMORY_CRITICAL_PERCENT = float(os.getenv('GPU_MEMORY_CRITICAL_PERCENT', '92'))
        self.MEMORY_MAX_PERCENT = float(os.getenv('GPU_MEMORY_MAX_PERCENT', '97'))

        self.UTILIZATION_HANG_THRESHOLD = 99.0
        self.HANG_DURATION_SEC = 30

        self._detect_jetson()
        self.initialize_nvml()

    def _discover_sysfs_path(self, prefix: str, candidates: List[str]) -> Optional[str]:
        """Try multiple candidate paths and return the first that exists"""
        for candidate in candidates:
            full_path = os.path.join(prefix, candidate)
            if os.path.exists(full_path):
                return candidate
        return None

    def _discover_sysfs_glob(self, prefix: str, patterns: List[str]) -> Optional[str]:
        """Try multiple glob patterns and return the first match as a relative path"""
        for pattern in patterns:
            full_pattern = os.path.join(prefix, pattern)
            matches = glob_module.glob(full_pattern)
            if matches:
                # Return relative path (strip prefix)
                rel = os.path.relpath(matches[0], prefix)
                return rel
        return None

    def _discover_gpu_thermal_zone(self, prefix: str) -> Optional[str]:
        """Find thermal zone — prefers Tj (junction) for throttle-relevant temp.

        Priority: tj-thermal (max of all zones, NVIDIA throttle indicator)
        → gpu-thermal → legacy JetPack ≤5 names.
        """
        thermal_base = os.path.join(prefix, 'class/thermal')
        if not os.path.isdir(thermal_base):
            return None

        # Ordered preference: Tj first, then GPU-specific, then legacy
        preferred_names = [
            'tj-thermal',       # L4T R36+ junction temp (max of all zones)
            'gpu-thermal',      # L4T R36+ GPU zone
            'gpu-therm', 'GPU-therm', 'gpu_therm',  # Legacy JetPack ≤5
            'Tdiode_GPU', 'GPU',
        ]

        discovered = {}
        try:
            zones = sorted(glob_module.glob(os.path.join(thermal_base, 'thermal_zone*')))
            for zone_dir in zones:
                type_file = os.path.join(zone_dir, 'type')
                try:
                    if os.path.exists(type_file):
                        with open(type_file, 'r') as f:
                            zone_type = f.read().strip()
                            if zone_type in preferred_names and zone_type not in discovered:
                                zone_name = os.path.basename(zone_dir)
                                discovered[zone_type] = f'class/thermal/{zone_name}/temp'
                except Exception:
                    continue
        except Exception:
            pass

        for name in preferred_names:
            if name in discovered:
                logger.info(f"System thermal zone: {name} -> {discovered[name]}")
                return discovered[name]

        # Fallback: try common zone numbers (zone1 on Orin, zone0 as last resort)
        for zone_num in [1, 0, 2]:
            fallback = f'class/thermal/thermal_zone{zone_num}/temp'
            if os.path.exists(os.path.join(prefix, fallback)):
                logger.info(f"Thermal zone fallback: thermal_zone{zone_num}")
                return fallback

        return None

    def _detect_jetson(self):
        """Detect if running on NVIDIA Jetson (AGX Orin, Thor, etc.) and discover sysfs paths"""
        for prefix in self.JETSON_SYSFS_PREFIXES:
            # Try to find GPU load path — fixed candidates first, then glob fallback (future SoCs)
            gpu_load = self._discover_sysfs_path(prefix, self.GPU_LOAD_CANDIDATES)
            if not gpu_load:
                gpu_load = self._discover_sysfs_glob(prefix, self.GPU_LOAD_GLOB_PATTERNS)
            if gpu_load:
                self._sysfs_prefix = prefix
                self._gpu_load_path = gpu_load
                self.is_jetson = True
                logger.info(f"Jetson GPU detected via sysfs ({prefix}), load path: {gpu_load}")

                # Discover other paths
                self._gpu_freq_path = self._discover_sysfs_glob(prefix, self.GPU_FREQ_GLOB_PATTERNS)
                self._gpu_max_freq_path = self._discover_sysfs_glob(prefix, self.GPU_MAX_FREQ_GLOB_PATTERNS)
                self._gpu_thermal_path = self._discover_gpu_thermal_zone(prefix)

                if self._gpu_freq_path:
                    logger.info(f"GPU freq path: {self._gpu_freq_path}")
                else:
                    logger.warning("GPU frequency sysfs path not found")
                if self._gpu_thermal_path:
                    logger.info(f"GPU thermal path: {self._gpu_thermal_path}")
                else:
                    logger.warning("GPU thermal zone not found")
                return

        # Also check device-tree model for Jetson identification
        for prefix in self.JETSON_SYSFS_PREFIXES:
            model_path = os.path.join(prefix, 'firmware/devicetree/base/model')
            try:
                if os.path.exists(model_path):
                    with open(model_path, 'r') as f:
                        model = f.read().strip().rstrip('\x00')
                        if 'jetson' in model.lower() or 'orin' in model.lower() or 'thor' in model.lower():
                            self._sysfs_prefix = prefix
                            self.is_jetson = True
                            logger.info(f"Jetson detected via device-tree: {model}")

                            # Try to discover paths even without gpu.0/load
                            self._gpu_load_path = self._discover_sysfs_path(prefix, self.GPU_LOAD_CANDIDATES)
                            self._gpu_freq_path = self._discover_sysfs_glob(prefix, self.GPU_FREQ_GLOB_PATTERNS)
                            self._gpu_max_freq_path = self._discover_sysfs_glob(prefix, self.GPU_MAX_FREQ_GLOB_PATTERNS)
                            self._gpu_thermal_path = self._discover_gpu_thermal_zone(prefix)
                            return
            except Exception:
                pass

        logger.debug("Not a Jetson platform")

    def _read_sysfs(self, relative_path: str) -> Optional[str]:
        """Read a value from sysfs"""
        path = os.path.join(self._sysfs_prefix, relative_path)
        try:
            with open(path, 'r') as f:
                return f.read().strip()
        except Exception:
            return None

    def initialize_nvml(self) -> bool:
        """Initialize NVML library"""
        if not NVML_AVAILABLE:
            if self.is_jetson:
                logger.info("NVML not available - using Jetson sysfs for GPU monitoring")
            else:
                logger.warning("NVML library not available")
            return False

        try:
            pynvml.nvmlInit()
            self.nvml_initialized = True
            self.gpu_count = pynvml.nvmlDeviceGetCount()
            logger.info(f"NVML initialized successfully. Found {self.gpu_count} GPU(s)")
            return True
        except Exception as e:
            if self.is_jetson:
                logger.info(f"NVML not usable on Jetson ({e}) - using sysfs for GPU monitoring")
            else:
                logger.error(f"Failed to initialize NVML: {e}")
            self.nvml_initialized = False
            return False

    def get_gpu_stats(self, gpu_index: int = 0) -> Optional[GPUStats]:
        """Get current GPU statistics"""
        if not self.nvml_initialized:
            return self._get_fallback_stats(gpu_index)

        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(gpu_index)

            # Basic info
            name = pynvml.nvmlDeviceGetName(handle)
            if isinstance(name, bytes):
                name = name.decode('utf-8')

            # PHASE1-FIX (HIGH-P03): Replace bare except with explicit Exception type
            # These catches handle NVML-specific errors when certain metrics are unavailable

            # Temperature
            try:
                temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            except Exception:
                temp = 0.0

            # Utilization
            try:
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                gpu_util = util.gpu
            except Exception:
                gpu_util = 0.0

            # Memory
            try:
                mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                mem_used = mem_info.used // (1024 * 1024)  # Convert to MB
                mem_total = mem_info.total // (1024 * 1024)
                mem_percent = (mem_info.used / mem_info.total) * 100
            except Exception:
                mem_used = 0
                mem_total = 1
                mem_percent = 0.0

            # Power
            try:
                power_draw = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0  # Convert to W
            except Exception:
                power_draw = 0.0

            try:
                power_limit = pynvml.nvmlDeviceGetPowerManagementLimit(handle) / 1000.0
            except Exception:
                power_limit = 0.0

            # Fan (may not be available on all GPUs)
            try:
                fan_speed = pynvml.nvmlDeviceGetFanSpeed(handle)
            except Exception:
                fan_speed = None

            # Clocks
            try:
                clock_graphics = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_GRAPHICS)
            except Exception:
                clock_graphics = 0

            try:
                clock_memory = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_MEM)
            except Exception:
                clock_memory = 0

            # Detect health and errors
            health, error, error_msg = self._analyze_health(
                temp, gpu_util, mem_used, mem_total, power_draw, gpu_index
            )

            stats = GPUStats(
                index=gpu_index,
                name=name,
                temperature=temp,
                utilization=gpu_util,
                memory_used=mem_used,
                memory_total=mem_total,
                memory_percent=mem_percent,
                power_draw=power_draw,
                power_limit=power_limit,
                fan_speed=fan_speed,
                clock_graphics=clock_graphics,
                clock_memory=clock_memory,
                health=health,
                error=error,
                error_message=error_msg
            )

            # Store for hang detection
            self.last_stats[gpu_index] = {
                'timestamp': time.time(),
                'utilization': gpu_util,
                'stats': stats
            }

            return stats

        except Exception as e:
            logger.error(f"Failed to get GPU stats: {e}")
            return None

    def _analyze_health(self, temp: float, util: float, mem_used: int,
                       mem_total: int, power: float, gpu_index: int) -> Tuple[GPUHealth, GPUError, Optional[str]]:
        """Analyze GPU health and detect errors"""

        # Check temperature
        if temp >= self.TEMP_SHUTDOWN:
            return GPUHealth.CRITICAL, GPUError.THERMAL, f"Temperature critical: {temp}°C (>= {self.TEMP_SHUTDOWN}°C)"
        elif temp >= self.TEMP_CRITICAL:
            return GPUHealth.CRITICAL, GPUError.THERMAL, f"Temperature critical: {temp}°C (>= {self.TEMP_CRITICAL}°C)"
        elif temp >= self.TEMP_WARNING:
            return GPUHealth.WARNING, GPUError.THERMAL, f"Temperature warning: {temp}°C (>= {self.TEMP_WARNING}°C)"

        # Check memory (percentage-based, works across Orin 32/64GB and Thor 64/128GB)
        mem_percent = (mem_used / mem_total * 100) if mem_total > 0 else 0.0
        if mem_percent >= self.MEMORY_MAX_PERCENT:
            return GPUHealth.CRITICAL, GPUError.OOM, f"Memory exceeded limit: {mem_percent:.1f}% ({mem_used}MB/{mem_total}MB)"
        elif mem_percent >= self.MEMORY_CRITICAL_PERCENT:
            return GPUHealth.CRITICAL, GPUError.OOM, f"Memory critical: {mem_percent:.1f}% ({mem_used}MB/{mem_total}MB)"
        elif mem_percent >= self.MEMORY_WARNING_PERCENT:
            return GPUHealth.WARNING, GPUError.OOM, f"Memory warning: {mem_percent:.1f}% ({mem_used}MB/{mem_total}MB)"

        # Check for GPU hang (high utilization for extended period)
        if self._detect_gpu_hang(gpu_index, util):
            return GPUHealth.CRITICAL, GPUError.HANG, f"GPU hang detected: {util}% utilization for >{self.HANG_DURATION_SEC}s"

        # All good
        return GPUHealth.HEALTHY, GPUError.NONE, None

    def _detect_gpu_hang(self, gpu_index: int, current_util: float) -> bool:
        """Detect GPU hang by monitoring sustained high utilization"""
        if current_util < self.UTILIZATION_HANG_THRESHOLD:
            # Reset counter
            self.error_counts[f'hang_{gpu_index}'] = 0
            return False

        # Check if we have previous data
        if gpu_index not in self.last_stats:
            return False

        last_data = self.last_stats[gpu_index]
        time_diff = time.time() - last_data['timestamp']

        # If utilization has been > threshold for more than HANG_DURATION_SEC
        if last_data['utilization'] >= self.UTILIZATION_HANG_THRESHOLD:
            hang_key = f'hang_{gpu_index}'
            self.error_counts[hang_key] = self.error_counts.get(hang_key, 0) + 1

            # Count checks (each check is ~1s, so 30 checks = 30s)
            if self.error_counts[hang_key] >= self.HANG_DURATION_SEC:
                return True
        else:
            self.error_counts[f'hang_{gpu_index}'] = 0

        return False

    def _get_fallback_stats(self, gpu_index: int = 0) -> Optional[GPUStats]:
        """Fallback GPU stats via Jetson sysfs or nvidia-smi"""
        if self.is_jetson:
            return self._get_jetson_stats(gpu_index)

        # Non-Jetson: try nvidia-smi
        try:
            result = subprocess.run(
                [
                    'nvidia-smi',
                    '--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw',
                    '--format=csv,noheader,nounits',
                    f'--id={gpu_index}'
                ],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode != 0:
                return None

            parts = result.stdout.strip().split(', ')
            if len(parts) < 6:
                return None

            name = parts[0]
            temp = float(parts[1])
            util = float(parts[2])
            mem_used = int(parts[3])
            mem_total = int(parts[4])
            power = float(parts[5])

            mem_percent = (mem_used / mem_total) * 100 if mem_total > 0 else 0

            health, error, error_msg = self._analyze_health(temp, util, mem_used, mem_total, power, gpu_index)

            return GPUStats(
                index=gpu_index,
                name=name,
                temperature=temp,
                utilization=util,
                memory_used=mem_used,
                memory_total=mem_total,
                memory_percent=mem_percent,
                power_draw=power,
                power_limit=0.0,
                fan_speed=None,
                clock_graphics=0,
                clock_memory=0,
                health=health,
                error=error,
                error_message=error_msg
            )

        except FileNotFoundError:
            logger.warning("nvidia-smi not found and not a Jetson platform - GPU monitoring unavailable")
            return None
        except Exception as e:
            logger.error(f"Fallback GPU stats failed: {e}")
            return None

    def _get_jetson_stats(self, gpu_index: int = 0) -> Optional[GPUStats]:
        """Read GPU stats from Jetson sysfs (AGX Orin, Thor) using dynamically discovered paths"""
        try:
            # GPU load: 0-1000 scale (divide by 10 for percentage)
            load_raw = self._read_sysfs(self._gpu_load_path) if self._gpu_load_path else None
            utilization = int(load_raw) / 10.0 if load_raw is not None else 0.0

            # GPU temperature from dynamically discovered thermal zone (millidegrees)
            temp_raw = self._read_sysfs(self._gpu_thermal_path) if self._gpu_thermal_path else None
            temperature = int(temp_raw) / 1000.0 if temp_raw is not None else 0.0

            # GPU clock frequency (Hz -> MHz)
            freq_raw = self._read_sysfs(self._gpu_freq_path) if self._gpu_freq_path else None
            clock_graphics = int(int(freq_raw) / 1_000_000) if freq_raw is not None else 0

            max_freq_raw = self._read_sysfs(self._gpu_max_freq_path) if self._gpu_max_freq_path else None
            max_freq_mhz = int(int(max_freq_raw) / 1_000_000) if max_freq_raw is not None else 0

            # Jetson uses unified memory (shared CPU/GPU) - report system memory
            import psutil
            mem = psutil.virtual_memory()
            mem_total = int(mem.total / (1024 * 1024))  # MB
            mem_used = int(mem.used / (1024 * 1024))  # MB
            mem_percent = mem.percent

            # Detect Jetson model name
            model_raw = self._read_sysfs('firmware/devicetree/base/model')
            name = model_raw.rstrip('\x00') if model_raw else 'Jetson GPU'

            health, error, error_msg = self._analyze_health(
                temperature, utilization, mem_used, mem_total, 0.0, gpu_index
            )

            return GPUStats(
                index=gpu_index,
                name=name,
                temperature=temperature,
                utilization=utilization,
                memory_used=mem_used,
                memory_total=mem_total,
                memory_percent=mem_percent,
                power_draw=0.0,
                power_limit=0.0,
                fan_speed=None,
                clock_graphics=clock_graphics,
                clock_memory=max_freq_mhz,  # Report max freq as reference
                health=health,
                error=error,
                error_message=error_msg
            )

        except Exception as e:
            logger.error(f"Jetson GPU stats failed: {e}")
            return None

    def get_all_gpus_stats(self) -> Dict[int, GPUStats]:
        """Get stats for all GPUs"""
        stats = {}
        gpu_count = self.gpu_count if self.nvml_initialized else 1

        for i in range(gpu_count):
            gpu_stats = self.get_gpu_stats(i)
            if gpu_stats:
                stats[i] = gpu_stats

        return stats

    def check_gpu_health(self, gpu_index: int = 0) -> Tuple[bool, str]:
        """
        Check GPU health and return status

        Returns:
            Tuple of (is_healthy, message)
        """
        stats = self.get_gpu_stats(gpu_index)

        if not stats:
            return False, "GPU stats unavailable"

        if stats.health == GPUHealth.CRITICAL:
            return False, f"GPU {gpu_index} CRITICAL: {stats.error_message}"
        elif stats.health == GPUHealth.WARNING:
            return True, f"GPU {gpu_index} WARNING: {stats.error_message}"
        elif stats.health == GPUHealth.HEALTHY:
            return True, f"GPU {gpu_index} healthy"
        else:
            return False, f"GPU {gpu_index} status unknown"

    def get_recovery_recommendation(self, gpu_index: int = 0) -> Optional[str]:
        """Get recovery recommendation based on GPU error"""
        stats = self.get_gpu_stats(gpu_index)

        if not stats or stats.error == GPUError.NONE:
            return None

        recommendations = {
            GPUError.OOM: "restart_llm_service",  # Restart to clear memory
            GPUError.HANG: "reset_gpu",  # GPU reset needed
            GPUError.THERMAL: "throttle_gpu" if stats.temperature < self.TEMP_SHUTDOWN else "stop_llm_service",
            GPUError.POWER: "reduce_gpu_clock",
            GPUError.ECC: "reset_gpu",
            GPUError.NVLINK: "reset_gpu",
            GPUError.UNKNOWN: "restart_llm_service"
        }

        return recommendations.get(stats.error, "restart_llm_service")

    def to_json(self, gpu_index: int = 0) -> str:
        """Export GPU stats as JSON"""
        stats = self.get_gpu_stats(gpu_index)

        if not stats:
            return json.dumps({"error": "GPU stats unavailable"})

        return json.dumps({
            "index": stats.index,
            "name": stats.name,
            "temperature": stats.temperature,
            "utilization": stats.utilization,
            "memory": {
                "used_mb": stats.memory_used,
                "total_mb": stats.memory_total,
                "percent": stats.memory_percent
            },
            "power": {
                "draw_w": stats.power_draw,
                "limit_w": stats.power_limit
            },
            "clocks": {
                "graphics_mhz": stats.clock_graphics,
                "memory_mhz": stats.clock_memory
            },
            "fan_speed": stats.fan_speed,
            "health": stats.health.value,
            "error": stats.error.value,
            "error_message": stats.error_message
        }, indent=2)

    def cleanup(self):
        """Cleanup NVML resources"""
        if self.nvml_initialized:
            try:
                pynvml.nvmlShutdown()
                logger.info("NVML shut down successfully")
            except Exception:
                pass  # PHASE1-FIX (HIGH-P03): Explicit Exception type


def main():
    """Main entry point for testing"""
    monitor = GPUMonitor()

    print("=" * 70)
    print("GPU MONITOR - Health Check")
    print("=" * 70)

    try:
        # Get stats for all GPUs
        all_stats = monitor.get_all_gpus_stats()

        for gpu_idx, stats in all_stats.items():
            print(f"\nGPU {gpu_idx}: {stats.name}")
            print(f"  Temperature: {stats.temperature}°C")
            print(f"  Utilization: {stats.utilization}%")
            print(f"  Memory: {stats.memory_used}/{stats.memory_total} MB ({stats.memory_percent:.1f}%)")
            print(f"  Power: {stats.power_draw:.1f}W / {stats.power_limit:.1f}W")
            print(f"  Health: {stats.health.value}")

            if stats.error != GPUError.NONE:
                print(f"  ⚠️  Error: {stats.error.value}")
                print(f"  Message: {stats.error_message}")
                recommendation = monitor.get_recovery_recommendation(gpu_idx)
                print(f"  Recommendation: {recommendation}")

        print("\nJSON Output:")
        print(monitor.to_json(0))

    finally:
        monitor.cleanup()


if __name__ == '__main__':
    main()
