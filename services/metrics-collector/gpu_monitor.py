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
from typing import Dict, Optional, Tuple
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
    """

    def __init__(self):
        self.nvml_initialized = False
        self.gpu_count = 0
        self.last_stats = {}
        self.error_counts = {}

        # Thresholds
        self.TEMP_WARNING = 83.0  # °C
        self.TEMP_CRITICAL = 85.0  # °C
        self.TEMP_SHUTDOWN = 90.0  # °C
        self.MEMORY_WARNING = 36 * 1024  # 36 GB in MB
        self.MEMORY_CRITICAL = 38 * 1024  # 38 GB in MB
        self.MEMORY_MAX = 40 * 1024  # 40 GB in MB
        self.UTILIZATION_HANG_THRESHOLD = 99.0
        self.HANG_DURATION_SEC = 30

        self.initialize_nvml()

    def initialize_nvml(self) -> bool:
        """Initialize NVML library"""
        if not NVML_AVAILABLE:
            logger.warning("NVML library not available")
            return False

        try:
            pynvml.nvmlInit()
            self.nvml_initialized = True
            self.gpu_count = pynvml.nvmlDeviceGetCount()
            logger.info(f"NVML initialized successfully. Found {self.gpu_count} GPU(s)")
            return True
        except Exception as e:
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

            # Temperature
            try:
                temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            except:
                temp = 0.0

            # Utilization
            try:
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                gpu_util = util.gpu
            except:
                gpu_util = 0.0

            # Memory
            try:
                mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                mem_used = mem_info.used // (1024 * 1024)  # Convert to MB
                mem_total = mem_info.total // (1024 * 1024)
                mem_percent = (mem_info.used / mem_info.total) * 100
            except:
                mem_used = 0
                mem_total = 1
                mem_percent = 0.0

            # Power
            try:
                power_draw = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0  # Convert to W
            except:
                power_draw = 0.0

            try:
                power_limit = pynvml.nvmlDeviceGetPowerManagementLimit(handle) / 1000.0
            except:
                power_limit = 0.0

            # Fan (may not be available on all GPUs)
            try:
                fan_speed = pynvml.nvmlDeviceGetFanSpeed(handle)
            except:
                fan_speed = None

            # Clocks
            try:
                clock_graphics = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_GRAPHICS)
            except:
                clock_graphics = 0

            try:
                clock_memory = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_MEM)
            except:
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

        # Check memory
        if mem_used >= self.MEMORY_MAX:
            return GPUHealth.CRITICAL, GPUError.OOM, f"Memory exceeded limit: {mem_used}MB (>= {self.MEMORY_MAX}MB)"
        elif mem_used >= self.MEMORY_CRITICAL:
            return GPUHealth.CRITICAL, GPUError.OOM, f"Memory critical: {mem_used}MB (>= {self.MEMORY_CRITICAL}MB)"
        elif mem_used >= self.MEMORY_WARNING:
            return GPUHealth.WARNING, GPUError.OOM, f"Memory warning: {mem_used}MB (>= {self.MEMORY_WARNING}MB)"

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
        """Fallback GPU stats using nvidia-smi when NVML not available"""
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

        except Exception as e:
            logger.error(f"Fallback GPU stats failed: {e}")
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
            except:
                pass


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
