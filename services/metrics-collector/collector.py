#!/usr/bin/env python3
"""
ARASUL PLATFORM - Metrics Collector
Collects system metrics and stores them in PostgreSQL
"""

import os
import time
import psutil
import logging
import asyncio
import psycopg2
import glob as glob_module
from psycopg2 import pool
from datetime import datetime
from aiohttp import web
from typing import Dict, Optional
import json

# Structured JSON logging (must be before any logger usage)
from structured_logging import setup_logging
logger = setup_logging("metrics-collector")

# Import GPU Monitor
try:
    from gpu_monitor import GPUMonitor, GPUHealth, GPUError
    GPU_MONITOR_AVAILABLE = True
except ImportError:
    GPU_MONITOR_AVAILABLE = False
    logger.warning("GPU Monitor module not available")


# Resolve Docker secrets (_FILE env vars → regular env vars)
def _resolve_secrets(*var_names):
    for var in var_names:
        file_path = os.environ.get(f'{var}_FILE')
        if file_path and os.path.isfile(file_path):
            with open(file_path) as f:
                os.environ[var] = f.read().strip()

_resolve_secrets('POSTGRES_PASSWORD')


# Configuration
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'postgres-db')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_USER = os.getenv('POSTGRES_USER', 'arasul')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'arasul')
POSTGRES_DB = os.getenv('POSTGRES_DB', 'arasul_db')

METRICS_INTERVAL_LIVE = int(os.getenv('METRICS_INTERVAL_LIVE', '5'))
METRICS_INTERVAL_PERSIST = int(os.getenv('METRICS_INTERVAL_PERSIST', '30'))

# Global state
current_metrics = {
    'cpu': 0.0,
    'ram': 0.0,
    'swap': 0.0,
    'gpu': 0.0,
    'temperature': 0.0,
    'disk': {
        'used': 0,
        'free': 0,
        'total': 0,
        'percent': 0.0
    },
    'timestamp': datetime.utcnow().isoformat()
}

# GPU detailed stats (global)
current_gpu_stats = None

metrics_buffer = []


class MetricsCollector:
    """Collects system metrics from various sources"""

    # Candidate GPU load paths (Orin JetPack 6+, Xavier legacy, generic)
    GPU_LOAD_CANDIDATES = [
        'devices/platform/bus@0/17000000.gpu/load',  # AGX Orin, JetPack 6+ (L4T R36+)
        'devices/platform/gpu.0/load',               # Xavier legacy
        'devices/platform/gpu/load',                 # Generic fallback
    ]

    # Glob patterns for future-proofing (Thor / other Tegra SoCs)
    GPU_LOAD_GLOBS = [
        'devices/platform/bus@*/[0-9a-f]*.gpu/load',
    ]

    SYSFS_PREFIXES = ['/host/sys', '/sys']

    def __init__(self):
        self.nvml_available = False
        self.gpu_monitor = None
        self._cached_gpu_load_path = None  # Discovered GPU load sysfs path
        self._cached_gpu_thermal_path = None  # Discovered GPU thermal sysfs path
        self._init_nvml()
        self._init_gpu_monitor()
        # Initialize CPU percent with blocking call once (for accurate subsequent readings)
        psutil.cpu_percent(interval=0.1)

    def _init_nvml(self):
        """Initialize NVIDIA Management Library"""
        try:
            import pynvml
            pynvml.nvmlInit()
            self.nvml_available = True
            self.pynvml = pynvml
            logger.info("NVML initialized successfully")
        except Exception as e:
            self.nvml_available = False
            # On Jetson, NVML is expected to be unavailable - use sysfs instead
            if self._find_gpu_load_path():
                logger.info(f"NVML not available ({e}) - using Jetson sysfs for GPU metrics")
            else:
                logger.warning(f"NVML not available: {e}")

    def _init_gpu_monitor(self):
        """Initialize advanced GPU monitor"""
        if GPU_MONITOR_AVAILABLE:
            try:
                self.gpu_monitor = GPUMonitor()
                logger.info("GPU Monitor initialized successfully")
            except Exception as e:
                logger.warning(f"GPU Monitor initialization failed: {e}")
                self.gpu_monitor = None
        else:
            logger.info("GPU Monitor not available")

    def _find_gpu_load_path(self) -> Optional[str]:
        """Discover GPU load sysfs path dynamically (cached after first call)"""
        if self._cached_gpu_load_path is not None:
            return self._cached_gpu_load_path if self._cached_gpu_load_path else None

        for prefix in self.SYSFS_PREFIXES:
            for candidate in self.GPU_LOAD_CANDIDATES:
                full_path = os.path.join(prefix, candidate)
                if os.path.exists(full_path):
                    self._cached_gpu_load_path = full_path
                    logger.info(f"GPU load sysfs path: {full_path}")
                    return full_path

        # Glob-based discovery for future Tegra SoCs (Thor etc.)
        for prefix in self.SYSFS_PREFIXES:
            for glob_pat in self.GPU_LOAD_GLOBS:
                matches = glob_module.glob(os.path.join(prefix, glob_pat))
                if matches:
                    self._cached_gpu_load_path = matches[0]
                    logger.info(f"GPU load sysfs path (glob): {matches[0]}")
                    return matches[0]

        self._cached_gpu_load_path = ''  # Mark as searched but not found
        return None

    def _find_gpu_thermal_path(self) -> Optional[str]:
        """Discover thermal zone — prefers Tj (junction) for throttle-relevant temp.

        Priority: tj-thermal (max across all zones, NVIDIA's throttle indicator)
        → gpu-thermal → legacy Jetpack <=5 names.
        """
        if self._cached_gpu_thermal_path is not None:
            return self._cached_gpu_thermal_path if self._cached_gpu_thermal_path else None

        # Ordered preference: Tj first (junction = max, throttle-relevant), then GPU-specific
        preferred_names = [
            'tj-thermal',       # L4T R36+ junction temp (max of all zones)
            'gpu-thermal',      # L4T R36+ GPU zone
            'gpu-therm', 'GPU-therm', 'gpu_therm',  # Legacy JetPack ≤5
            'Tdiode_GPU', 'GPU',
        ]

        discovered: Dict[str, str] = {}
        for prefix in self.SYSFS_PREFIXES:
            thermal_base = os.path.join(prefix, 'class/thermal')
            if not os.path.isdir(thermal_base):
                continue

            try:
                zones = sorted(glob_module.glob(os.path.join(thermal_base, 'thermal_zone*')))
                for zone_dir in zones:
                    type_file = os.path.join(zone_dir, 'type')
                    try:
                        if os.path.exists(type_file):
                            with open(type_file, 'r') as f:
                                zone_type = f.read().strip()
                                if zone_type in preferred_names and zone_type not in discovered:
                                    temp_path = os.path.join(zone_dir, 'temp')
                                    if os.path.exists(temp_path):
                                        discovered[zone_type] = temp_path
                    except Exception as e:
                        logger.debug(f"Non-critical error reading thermal zone type: {e}")
                        continue
            except Exception as e:
                logger.debug(f"Non-critical error scanning thermal zones: {e}")

            # Pick in preference order from what we discovered under this prefix
            for name in preferred_names:
                if name in discovered:
                    temp_path = discovered[name]
                    self._cached_gpu_thermal_path = temp_path
                    logger.info(f"System temperature zone: {name} -> {temp_path}")
                    return temp_path

        # Fallback: try common zone paths
        fallback_paths = [
            '/host/sys/class/thermal/thermal_zone1/temp',
            '/host/sys/class/thermal/thermal_zone0/temp',
            '/sys/class/thermal/thermal_zone0/temp',
        ]
        for path in fallback_paths:
            if os.path.exists(path):
                self._cached_gpu_thermal_path = path
                return path

        self._cached_gpu_thermal_path = ''  # Mark as searched but not found
        return None

    def get_cpu_percent(self) -> float:
        """Get CPU utilization percentage (non-blocking)"""
        try:
            # Use interval=None for non-blocking call (returns instant value)
            # First call returns 0.0, subsequent calls return actual CPU usage
            return psutil.cpu_percent(interval=None)
        except Exception as e:
            logger.error(f"Error reading CPU: {e}")
            return 0.0

    def get_ram_percent(self) -> float:
        """Get RAM utilization percentage"""
        try:
            return psutil.virtual_memory().percent
        except Exception as e:
            logger.error(f"Error reading RAM: {e}")
            return 0.0

    def get_swap_percent(self) -> float:
        """Get swap utilization percentage (aggregates zram + NVMe swapfile on Jetson)"""
        try:
            return psutil.swap_memory().percent
        except Exception as e:
            logger.error(f"Error reading swap: {e}")
            return 0.0

    def get_gpu_percent(self) -> float:
        """Get GPU utilization percentage"""
        if self.nvml_available:
            try:
                handle = self.pynvml.nvmlDeviceGetHandleByIndex(0)
                utilization = self.pynvml.nvmlDeviceGetUtilizationRates(handle)
                return float(utilization.gpu)
            except Exception as e:
                logger.error(f"Error reading GPU via NVML: {e}")

        # Jetson fallback: read GPU load from sysfs (0-1000 scale)
        gpu_load_path = self._find_gpu_load_path()
        if gpu_load_path:
            try:
                with open(gpu_load_path, 'r') as f:
                    return int(f.read().strip()) / 10.0
            except Exception as e:
                logger.debug(f"Non-critical error reading GPU load from sysfs: {e}")

        return 0.0

    def get_temperature(self) -> float:
        """Get system temperature in Celsius"""
        try:
            # Try to find GPU thermal zone dynamically
            thermal_path = self._find_gpu_thermal_path()
            if thermal_path:
                with open(thermal_path, 'r') as f:
                    temp = int(f.read().strip()) / 1000.0
                    return temp

            # Fallback: try GPU temperature via NVML if available
            if self.nvml_available:
                handle = self.pynvml.nvmlDeviceGetHandleByIndex(0)
                temp = self.pynvml.nvmlDeviceGetTemperature(
                    handle,
                    self.pynvml.NVML_TEMPERATURE_GPU
                )
                return float(temp)

            logger.warning("No temperature sensors available")
            return 0.0

        except Exception as e:
            logger.error(f"Error reading temperature: {e}")
            return 0.0

    def get_disk_usage(self) -> Dict:
        """Get disk usage statistics including NVMe/SSD health"""
        try:
            disk = psutil.disk_usage('/')
            result = {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': disk.percent
            }
            # NVMe/SSD health via sysfs (no smartctl dependency needed)
            health = self._get_nvme_health()
            if health:
                result['nvme_health'] = health
            return result
        except Exception as e:
            logger.error(f"Error reading disk: {e}")
            return {'total': 0, 'used': 0, 'free': 0, 'percent': 0.0}

    def _get_nvme_health(self) -> Optional[Dict]:
        """Read NVMe health from sysfs (works without smartctl/root)"""
        try:
            import subprocess
            # Try smartctl first (most reliable) — use host-mounted path in container
            dev_path = '/host/dev/nvme0n1' if os.path.exists('/host/dev/nvme0n1') else '/dev/nvme0n1'
            result = subprocess.run(
                ['smartctl', '-A', dev_path, '--json'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                attrs = data.get('nvme_smart_health_information_log', {})
                health = {
                    'percentage_used': attrs.get('percentage_used', -1),
                    'available_spare': attrs.get('available_spare', -1),
                    'temperature': attrs.get('temperature', -1),
                    'media_errors': attrs.get('media_errors', 0),
                    'power_on_hours': attrs.get('power_on_hours', 0),
                    'critical_warning': attrs.get('critical_warning', 0),
                }
                # Alert thresholds
                if health['available_spare'] != -1 and health['available_spare'] < 10:
                    logger.warning(f"NVMe available spare LOW: {health['available_spare']}%")
                if health['percentage_used'] != -1 and health['percentage_used'] > 80:
                    logger.warning(f"NVMe wear HIGH: {health['percentage_used']}% used")
                if health['critical_warning'] != 0:
                    logger.error(f"NVMe CRITICAL WARNING: {health['critical_warning']}")
                return health
        except FileNotFoundError:
            pass  # smartctl not installed
        except Exception as e:
            logger.debug(f"smartctl failed: {e}")

        # Fallback: read from sysfs (limited info, no root needed)
        try:
            for prefix in self.SYSFS_PREFIXES:
                nvme_path = os.path.join(prefix, 'class/nvme/nvme0')
                if os.path.isdir(nvme_path):
                    model = ''
                    model_file = os.path.join(nvme_path, 'model')
                    if os.path.exists(model_file):
                        with open(model_file) as f:
                            model = f.read().strip()
                    return {'model': model, 'source': 'sysfs'}
        except Exception:
            pass

        return None

    def collect_qdrant_stats(self) -> Optional[list]:
        """Query Qdrant collections endpoint; returns list of (name, dict) or None on failure."""
        import urllib.request
        try:
            host = os.getenv('QDRANT_HOST', 'qdrant')
            port = os.getenv('QDRANT_PORT', '6333')
            url = f"http://{host}:{port}/collections"
            with urllib.request.urlopen(url, timeout=5) as resp:
                data = json.loads(resp.read().decode())
            collections = data.get('result', {}).get('collections', [])
            out = []
            for c in collections:
                name = c.get('name')
                if not name:
                    continue
                try:
                    with urllib.request.urlopen(f"{url}/{name}", timeout=5) as resp:
                        detail = json.loads(resp.read().decode()).get('result', {})
                    out.append((name, {
                        'vectors_count': detail.get('vectors_count'),
                        'indexed_vectors_count': detail.get('indexed_vectors_count'),
                        'points_count': detail.get('points_count'),
                        'segments_count': detail.get('segments_count'),
                        'status': detail.get('status'),
                    }))
                except Exception as e:
                    logger.debug(f"qdrant detail fetch failed for {name}: {e}")
            return out
        except Exception as e:
            logger.debug(f"qdrant collections fetch failed: {e}")
            return None

    def collect_minio_stats(self) -> Optional[list]:
        """Approximate bucket usage via psutil disk usage of the minio data volume,
        if mounted into this container. Returns list of (bucket_name, dict) or None.
        MinIO does not expose size-per-bucket without mc/admin keys we don't carry
        here, so this is best-effort.
        """
        # Only run if /minio-data is mounted (opt-in via compose)
        minio_root = os.getenv('MINIO_DATA_PATH', '/minio-data')
        if not os.path.isdir(minio_root):
            return None
        try:
            out = []
            for entry in os.listdir(minio_root):
                path = os.path.join(minio_root, entry)
                if not os.path.isdir(path):
                    continue
                if entry.startswith('.'):
                    continue
                total_size = 0
                file_count = 0
                for root, _dirs, files in os.walk(path):
                    for f in files:
                        try:
                            total_size += os.path.getsize(os.path.join(root, f))
                            file_count += 1
                        except OSError:
                            pass
                out.append((entry, {
                    'bucket_size_bytes': total_size,
                    'object_count': file_count,
                }))
            return out
        except Exception as e:
            logger.debug(f"minio stats failed: {e}")
            return None

    def check_self_healing_health(self) -> Optional[Dict]:
        """Check self-healing agent heartbeat via HTTP endpoint"""
        import urllib.request
        try:
            url = f"http://{os.getenv('SELF_HEALING_HOST', 'self-healing-agent')}:9200/health"
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode())
                age = data.get('seconds_since_heartbeat', 0)
                if age and age > 60:
                    logger.warning(f"Self-healing agent heartbeat stale: {age:.0f}s old")
                return {
                    'healthy': data.get('healthy', False),
                    'seconds_since_heartbeat': age,
                    'status': data.get('status', 'unknown'),
                }
        except Exception:
            return {'healthy': False, 'seconds_since_heartbeat': -1, 'status': 'unreachable'}

    def check_network_connectivity(self) -> Dict:
        """Check internet connectivity via DNS lookup"""
        import socket
        try:
            socket.setdefaulttimeout(3)
            socket.getaddrinfo('dns.google', 443)
            return {'online': True}
        except (socket.gaierror, socket.timeout, OSError):
            try:
                # Fallback: try Cloudflare DNS
                socket.getaddrinfo('one.one.one.one', 443)
                return {'online': True}
            except (socket.gaierror, socket.timeout, OSError):
                return {'online': False}

    _tailscale_cache: Optional[Dict] = None
    _tailscale_cache_time: float = 0
    _TAILSCALE_CACHE_TTL: int = 60  # seconds — Tailscale status changes rarely

    def check_tailscale_status(self) -> Optional[Dict]:
        """Check Tailscale VPN connection status (host-level service).
        Cached for 60s to avoid hitting the backend rate limiter (5 req/min).
        """
        import urllib.request
        now = time.time()
        if now - self._tailscale_cache_time < self._TAILSCALE_CACHE_TTL:
            return self._tailscale_cache
        try:
            # Tailscale status is exposed via the dashboard-backend API
            url = f"http://{os.getenv('DASHBOARD_BACKEND_HOST', 'dashboard-backend')}:3001/api/tailscale/status"
            req = urllib.request.Request(url, method='GET')
            req.add_header('Content-Type', 'application/json')
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode())
                self._tailscale_cache = {
                    'installed': data.get('installed', False),
                    'connected': data.get('connected', False),
                    'ip': data.get('ip'),
                    'peers_online': len([p for p in data.get('peers', []) if p.get('online')]),
                }
                self._tailscale_cache_time = now
                return self._tailscale_cache
        except Exception:
            self._tailscale_cache_time = now  # Cache the failure too to avoid hammering
            self._tailscale_cache = None
            return None  # Tailscale check is optional, don't fail on error

    # Storage wear monitoring — cached for 24h (SMART data changes slowly)
    _storage_wear_cache: Optional[Dict] = None
    _storage_wear_cache_time: float = 0
    _STORAGE_WEAR_CACHE_TTL: int = 86400  # 24 hours

    def check_storage_wear(self) -> Optional[Dict]:
        """Check NVMe/SSD health via smartctl or nvme-cli.
        Returns wear info or None if not available.
        Cached for 24h — SMART data changes very slowly.
        """
        import subprocess as sp
        now = time.time()
        if now - self._storage_wear_cache_time < self._STORAGE_WEAR_CACHE_TTL:
            return self._storage_wear_cache

        result = None
        try:
            # Try smartctl first (works for both NVMe and SATA)
            # Find the root disk device — prefer /host/dev/ mount (container), fall back to /dev/
            disk_dev = None
            smartctl_dev = None
            for candidate in ['/dev/nvme0n1', '/dev/sda', '/dev/mmcblk0']:
                host_dev = candidate.replace('/dev/', '/host/dev/')
                if os.path.exists(host_dev):
                    disk_dev = candidate
                    smartctl_dev = host_dev  # Use host-mounted path for smartctl/nvme-cli
                    break
                elif os.path.exists(candidate):
                    disk_dev = candidate
                    smartctl_dev = candidate
                    break

            if not disk_dev:
                self._storage_wear_cache_time = now
                self._storage_wear_cache = None
                return None

            # Try smartctl
            try:
                proc = sp.run(
                    ['smartctl', '-A', '-j', smartctl_dev],
                    capture_output=True, text=True, timeout=10
                )
                if proc.returncode in (0, 4):  # 4 = some SMART attributes have problems
                    data = json.loads(proc.stdout)
                    attrs = data.get('ata_smart_attributes', {}).get('table', [])
                    nvme_health = data.get('nvme_smart_health_information_log', {})

                    if nvme_health:
                        # NVMe drive
                        pct_used = nvme_health.get('percentage_used', 0)
                        spare = 100 - pct_used
                        result = {
                            'type': 'nvme',
                            'device': disk_dev,
                            'percentage_used': pct_used,
                            'spare_pct': spare,
                            'temperature_c': nvme_health.get('temperature', 0),
                            'power_on_hours': nvme_health.get('power_on_hours', 0),
                            'data_written_tb': round(
                                nvme_health.get('data_units_written', 0) * 512000 / 1e12, 2
                            ),
                            'health': 'critical' if spare < 10 else ('warning' if spare < 20 else 'ok'),
                        }
                    elif attrs:
                        # SATA SSD — look for key attributes
                        wear_attr = next(
                            (a for a in attrs if a.get('id') in (177, 231, 233)),
                            None
                        )
                        result = {
                            'type': 'sata_ssd',
                            'device': disk_dev,
                            'spare_pct': wear_attr.get('value', 100) if wear_attr else None,
                            'health': 'ok',
                        }
                        if result['spare_pct'] is not None and result['spare_pct'] < 10:
                            result['health'] = 'critical'
                        elif result['spare_pct'] is not None and result['spare_pct'] < 20:
                            result['health'] = 'warning'
            except FileNotFoundError:
                pass  # smartctl not installed

            # Fallback: try nvme-cli for NVMe drives
            if result is None and disk_dev and 'nvme' in disk_dev:
                try:
                    proc = sp.run(
                        ['nvme', 'smart-log', smartctl_dev, '-o', 'json'],
                        capture_output=True, text=True, timeout=10
                    )
                    if proc.returncode == 0:
                        data = json.loads(proc.stdout)
                        pct_used = data.get('percent_used', 0)
                        spare = 100 - pct_used
                        result = {
                            'type': 'nvme',
                            'device': disk_dev,
                            'percentage_used': pct_used,
                            'spare_pct': spare,
                            'temperature_c': data.get('temperature', 0),
                            'power_on_hours': data.get('power_on_hours', 0),
                            'health': 'critical' if spare < 10 else ('warning' if spare < 20 else 'ok'),
                        }
                except FileNotFoundError:
                    pass  # nvme-cli not installed

            # Log warnings for critical/warning states
            if result:
                if result['health'] == 'critical':
                    logger.error(
                        f"STORAGE CRITICAL: {result['device']} spare at {result.get('spare_pct', '?')}% — "
                        f"replacement needed soon"
                    )
                elif result['health'] == 'warning':
                    logger.warning(
                        f"Storage wear warning: {result['device']} spare at {result.get('spare_pct', '?')}%"
                    )

        except Exception as e:
            logger.debug(f"Storage wear check failed: {e}")

        self._storage_wear_cache = result
        self._storage_wear_cache_time = now
        return result

    def collect_all(self) -> Dict:
        """Collect all metrics"""
        return {
            'cpu': self.get_cpu_percent(),
            'ram': self.get_ram_percent(),
            'swap': self.get_swap_percent(),
            'gpu': self.get_gpu_percent(),
            'temperature': self.get_temperature(),
            'disk': self.get_disk_usage(),
            'storage_wear': self._storage_wear_cache,
            'self_healing': self.check_self_healing_health(),
            'network': self.check_network_connectivity(),
            'tailscale': self.check_tailscale_status(),
            'timestamp': datetime.utcnow().isoformat()
        }

    def collect_gpu_detailed(self) -> Optional[Dict]:
        """Collect detailed GPU statistics with error recovery"""
        global current_gpu_stats

        if not self.gpu_monitor:
            return None

        try:
            stats = self.gpu_monitor.get_gpu_stats(0)
            if not stats:
                return None

            gpu_dict = {
                'index': stats.index,
                'name': stats.name,
                'temperature': stats.temperature,
                'utilization': stats.utilization,
                'memory': {
                    'used_mb': stats.memory_used,
                    'total_mb': stats.memory_total,
                    'percent': stats.memory_percent
                },
                'power': {
                    'draw_w': stats.power_draw,
                    'limit_w': stats.power_limit
                },
                'clocks': {
                    'graphics_mhz': stats.clock_graphics,
                    'memory_mhz': stats.clock_memory
                },
                'fan_speed': stats.fan_speed,
                'health': stats.health.value,
                'error': stats.error.value,
                'error_message': stats.error_message,
                'timestamp': datetime.utcnow().isoformat()
            }

            current_gpu_stats = gpu_dict

            # Check for GPU errors and attempt recovery
            if stats.error != GPUError.NONE:
                self._handle_gpu_error(stats)

            return gpu_dict

        except Exception as e:
            logger.error(f"Error collecting detailed GPU stats: {e}")

            # Attempt to recover from NVML errors
            self._recover_from_nvml_error(e)

            return None

    def _handle_gpu_error(self, stats):
        """Handle GPU errors detected during monitoring"""
        error_type = stats.error
        error_msg = stats.error_message

        logger.warning(f"GPU Error detected: {error_type.value} - {error_msg}")

        if error_type == GPUError.OOM:
            logger.critical("CUDA Out of Memory detected - requires external intervention")
            # Self-Healing Agent will handle this via GPU recovery module

        elif error_type == GPUError.HANG:
            logger.critical("GPU Hang detected - requires reset")
            # Self-Healing Agent will handle GPU reset

        elif error_type == GPUError.THERMAL:
            logger.warning("GPU thermal throttling detected")
            # Self-Healing Agent will handle throttling

        elif error_type == GPUError.UNKNOWN:
            logger.error("GPU Error - attempting recovery")
            self._recover_nvml()

    def _recover_from_nvml_error(self, error: Exception):
        """Attempt to recover from NVML errors"""
        error_str = str(error).lower()

        # Check if it's a recoverable NVML error
        if 'nvml' in error_str or 'gpu' in error_str:
            logger.warning("NVML error detected, attempting recovery...")

            # Try to reinitialize NVML
            if self._recover_nvml():
                logger.info("NVML recovery successful")
            else:
                logger.error("NVML recovery failed")

    def _recover_nvml(self) -> bool:
        """Reinitialize NVML after error"""
        try:
            # Shutdown existing NVML instance
            if self.nvml_available:
                try:
                    self.pynvml.nvmlShutdown()
                except Exception as e:
                    logger.debug(f"Non-critical error shutting down NVML: {e}")

            # Wait a moment
            time.sleep(2)

            # Reinitialize
            self._init_nvml()

            # Test if it works
            if self.nvml_available:
                handle = self.pynvml.nvmlDeviceGetHandleByIndex(0)
                _ = self.pynvml.nvmlDeviceGetUtilizationRates(handle)
                logger.info("NVML reinitialized successfully")
                return True

            return False

        except Exception as e:
            logger.error(f"NVML recovery failed: {e}")
            self.nvml_available = False
            return False


class DatabaseWriter:
    """Writes metrics to PostgreSQL with connection pooling"""

    def __init__(self):
        self.connection_pool = None
        self.pool_stats = {
            'total_queries': 0,
            'total_errors': 0,
            'slow_queries': 0,
            'start_time': time.time()
        }
        self.connect()

    def connect(self):
        """Initialize connection pool"""
        max_retries = 10
        retry_delay = 5

        # Pool configuration
        min_connections = int(os.getenv('POSTGRES_POOL_MIN', '1'))
        max_connections = int(os.getenv('POSTGRES_POOL_MAX', '5'))

        for attempt in range(max_retries):
            try:
                self.connection_pool = pool.ThreadedConnectionPool(
                    minconn=min_connections,
                    maxconn=max_connections,
                    host=POSTGRES_HOST,
                    port=POSTGRES_PORT,
                    user=POSTGRES_USER,
                    password=POSTGRES_PASSWORD,
                    database=POSTGRES_DB,
                    connect_timeout=10,
                    application_name='arasul-metrics-collector',
                    options='-c statement_timeout=30000'  # 30 second statement timeout
                )
                logger.info(f"Connection pool initialized: {POSTGRES_HOST}:{POSTGRES_PORT} (min={min_connections}, max={max_connections})")
                return
            except Exception as e:
                logger.error(f"Connection pool initialization attempt {attempt + 1}/{max_retries} failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)

        raise Exception("Failed to initialize connection pool after maximum retries")

    def get_connection(self):
        """Get a connection from the pool"""
        if not self.connection_pool:
            raise Exception("Connection pool not initialized")
        return self.connection_pool.getconn()

    def release_connection(self, conn):
        """Return connection to the pool"""
        if self.connection_pool and conn:
            self.connection_pool.putconn(conn)

    def write_metrics(self, metrics: Dict):
        """Write metrics to database using connection pool"""
        conn = None
        start_time = time.time()

        try:
            self.pool_stats['total_queries'] += 1
            conn = self.get_connection()
            cursor = conn.cursor()
            timestamp = datetime.fromisoformat(metrics['timestamp'].replace('Z', '+00:00'))

            # Insert CPU
            cursor.execute(
                "INSERT INTO metrics_cpu (timestamp, value) VALUES (%s, %s) ON CONFLICT (timestamp) DO NOTHING",
                (timestamp, metrics['cpu'])
            )

            # Insert RAM
            cursor.execute(
                "INSERT INTO metrics_ram (timestamp, value) VALUES (%s, %s) ON CONFLICT (timestamp) DO NOTHING",
                (timestamp, metrics['ram'])
            )

            # Insert Swap
            cursor.execute(
                "INSERT INTO metrics_swap (timestamp, value) VALUES (%s, %s) ON CONFLICT (timestamp) DO NOTHING",
                (timestamp, metrics.get('swap', 0))
            )

            # Insert GPU
            cursor.execute(
                "INSERT INTO metrics_gpu (timestamp, value) VALUES (%s, %s) ON CONFLICT (timestamp) DO NOTHING",
                (timestamp, metrics['gpu'])
            )

            # Insert Temperature
            cursor.execute(
                "INSERT INTO metrics_temperature (timestamp, value) VALUES (%s, %s) ON CONFLICT (timestamp) DO NOTHING",
                (timestamp, metrics['temperature'])
            )

            # Insert Disk
            cursor.execute(
                "INSERT INTO metrics_disk (timestamp, used, free, percent) VALUES (%s, %s, %s, %s) ON CONFLICT (timestamp) DO NOTHING",
                (timestamp, metrics['disk']['used'], metrics['disk']['free'], metrics['disk']['percent'])
            )

            conn.commit()
            cursor.close()

            # Track slow queries (>500ms for metrics insert)
            duration = (time.time() - start_time) * 1000
            if duration > 500:
                self.pool_stats['slow_queries'] += 1
                logger.warning(f"Slow metrics write: {duration:.0f}ms")
            else:
                logger.debug(f"Metrics written to database: CPU={metrics['cpu']:.1f}%, RAM={metrics['ram']:.1f}%, GPU={metrics['gpu']:.1f}%")

        except Exception as e:
            self.pool_stats['total_errors'] += 1
            logger.error(f"Error writing metrics to database: {e}")
            if conn:
                try:
                    conn.rollback()
                except Exception as e:
                    logger.debug(f"Non-critical error during rollback: {e}")
        finally:
            if conn:
                self.release_connection(conn)

    def cleanup_old_metrics(self):
        """Run cleanup function to remove old metrics"""
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT cleanup_old_metrics()")
            conn.commit()
            cursor.close()
            logger.info("Old metrics cleaned up successfully")
        except Exception as e:
            logger.error(f"Error cleaning up old metrics: {e}")
            if conn:
                try:
                    conn.rollback()
                except Exception as e:
                    logger.debug(f"Non-critical error during rollback: {e}")
        finally:
            if conn:
                self.release_connection(conn)

    def write_infra_metric(self, source_type: str, source_name: str, payload: Dict):
        """Generic sink for infrastructure metrics (Phase 5.6).

        Writes one row to metrics_infra. Silent on failure — infra probes
        should never block the main loop.
        """
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO metrics_infra (source_type, source_name, payload) "
                "VALUES (%s, %s, %s::jsonb)",
                (source_type, source_name, json.dumps(payload))
            )
            conn.commit()
            cursor.close()
        except Exception as e:
            logger.debug(f"infra metric write failed ({source_type}/{source_name}): {e}")
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
        finally:
            if conn:
                self.release_connection(conn)

    def collect_pg_stats(self):
        """Snapshot top pg_stat_user_tables entries by dead-tuple count."""
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT relname,
                       COALESCE(n_live_tup, 0)::bigint AS live,
                       COALESCE(n_dead_tup, 0)::bigint AS dead,
                       last_autovacuum,
                       last_autoanalyze
                  FROM pg_stat_user_tables
                 WHERE n_live_tup + n_dead_tup > 0
                 ORDER BY n_dead_tup DESC NULLS LAST
                 LIMIT 25
            """)
            rows = cursor.fetchall()
            cursor.close()
            for relname, live, dead, last_vac, last_ana in rows:
                self.write_infra_metric('pg_table', relname, {
                    'n_live_tup': int(live),
                    'n_dead_tup': int(dead),
                    'last_autovacuum': last_vac.isoformat() if last_vac else None,
                    'last_autoanalyze': last_ana.isoformat() if last_ana else None,
                })
            return len(rows)
        except Exception as e:
            logger.warning(f"pg_stats collection failed: {e}")
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
            return 0
        finally:
            if conn:
                self.release_connection(conn)

    def get_pool_stats(self):
        """Get connection pool statistics"""
        uptime = time.time() - self.pool_stats['start_time']
        queries_per_second = self.pool_stats['total_queries'] / uptime if uptime > 0 else 0

        return {
            'total_queries': self.pool_stats['total_queries'],
            'total_errors': self.pool_stats['total_errors'],
            'slow_queries': self.pool_stats['slow_queries'],
            'queries_per_second': round(queries_per_second, 2),
            'error_rate': f"{(self.pool_stats['total_errors'] / max(self.pool_stats['total_queries'], 1)) * 100:.2f}%",
            'uptime_seconds': int(uptime)
        }

    def close(self):
        """Close all connections in the pool"""
        if self.connection_pool:
            try:
                self.connection_pool.closeall()
                logger.info("Connection pool closed")
            except Exception as e:
                logger.error(f"Error closing connection pool: {e}")


# HTTP Server for health checks and live metrics
async def health_check(request):
    """Health check endpoint"""
    return web.json_response({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat()
    })


async def get_live_metrics(request):
    """Get current metrics"""
    global current_metrics
    return web.json_response(current_metrics)


async def metrics_ping(request):
    """Simple ping endpoint for health monitoring"""
    return web.json_response({'status': 'ok'})


async def get_gpu_stats(request):
    """Get detailed GPU statistics"""
    global current_gpu_stats

    if current_gpu_stats is None:
        return web.json_response({
            'error': 'GPU stats not available',
            'available': False
        }, status=503)

    return web.json_response({
        'available': True,
        'gpu': current_gpu_stats
    })


async def start_http_server():
    """Start HTTP server for API endpoints"""
    app = web.Application()
    app.router.add_get('/health', health_check)
    app.router.add_get('/metrics', get_live_metrics)
    app.router.add_get('/api/metrics/ping', metrics_ping)
    app.router.add_get('/api/gpu', get_gpu_stats)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 9100)
    await site.start()
    logger.info("HTTP server started on port 9100")


_db_writer_instance = None

async def collect_metrics_loop():
    """Main metrics collection loop"""
    global current_metrics, metrics_buffer, _db_writer_instance

    collector = MetricsCollector()
    db_writer = DatabaseWriter()
    _db_writer_instance = db_writer

    persist_counter = 0
    cleanup_counter = 0
    gpu_counter = 0
    storage_wear_counter = 0
    infra_counter = 0
    # Infra probes (pg_stat / qdrant / minio) are expensive enough to run
    # every 5 minutes, not every 5 seconds like live metrics.
    INFRA_INTERVAL_SECONDS = int(os.getenv('INFRA_METRICS_INTERVAL', '300'))

    # Initial storage wear check on startup
    collector.check_storage_wear()

    while True:
        try:
            # Collect basic metrics
            metrics = collector.collect_all()
            current_metrics = metrics

            # Add to buffer
            metrics_buffer.append(metrics)

            # Collect detailed GPU stats (less frequently - every 10s)
            gpu_counter += METRICS_INTERVAL_LIVE
            if gpu_counter >= 10:
                collector.collect_gpu_detailed()
                gpu_counter = 0

            # Storage wear check (every 24h = 86400s)
            storage_wear_counter += METRICS_INTERVAL_LIVE
            if storage_wear_counter >= 86400:
                collector.check_storage_wear()
                storage_wear_counter = 0

            # Persist to database every METRICS_INTERVAL_PERSIST seconds
            persist_counter += METRICS_INTERVAL_LIVE
            if persist_counter >= METRICS_INTERVAL_PERSIST:
                # Only persist the most recent metrics (buffer is for in-memory live access)
                # Database retention is separate from live metrics
                db_writer.write_metrics(metrics)
                # Buffer is not cleared - keeps last N metrics for live API
                if len(metrics_buffer) > 60:  # Keep last 5 minutes (60 * 5s)
                    metrics_buffer.pop(0)
                persist_counter = 0

            # Cleanup old metrics every hour
            cleanup_counter += METRICS_INTERVAL_LIVE
            if cleanup_counter >= 3600:
                db_writer.cleanup_old_metrics()
                cleanup_counter = 0

            # Infrastructure metrics (pg_stat, Qdrant, MinIO) — expensive, so
            # run on a long interval. Each probe is best-effort; failures
            # never block the main loop.
            infra_counter += METRICS_INTERVAL_LIVE
            if infra_counter >= INFRA_INTERVAL_SECONDS:
                infra_counter = 0
                try:
                    n_tables = db_writer.collect_pg_stats()
                    logger.debug(f"pg_stat snapshot: {n_tables} rows")
                except Exception as e:
                    logger.debug(f"pg_stat probe errored: {e}")
                try:
                    qd = collector.collect_qdrant_stats()
                    if qd:
                        for name, payload in qd:
                            db_writer.write_infra_metric('qdrant_collection', name, payload)
                except Exception as e:
                    logger.debug(f"qdrant probe errored: {e}")
                try:
                    mn = collector.collect_minio_stats()
                    if mn:
                        for name, payload in mn:
                            db_writer.write_infra_metric('minio_bucket', name, payload)
                except Exception as e:
                    logger.debug(f"minio probe errored: {e}")

            await asyncio.sleep(METRICS_INTERVAL_LIVE)

        except Exception as e:
            logger.error(f"Error in metrics collection loop: {e}")
            await asyncio.sleep(METRICS_INTERVAL_LIVE)


async def main():
    """Main application entry point"""
    logger.info("Starting Arasul Metrics Collector")
    logger.info(f"Live interval: {METRICS_INTERVAL_LIVE}s, Persist interval: {METRICS_INTERVAL_PERSIST}s")

    loop = asyncio.get_event_loop()
    shutdown_event = asyncio.Event()

    def _signal_handler():
        logger.info("Shutdown signal received - stopping metrics collector...")
        shutdown_event.set()

    for sig in (asyncio.unix_events.signal.SIGTERM, asyncio.unix_events.signal.SIGINT):
        loop.add_signal_handler(sig, _signal_handler)

    # Start HTTP server and metrics collection concurrently
    tasks = asyncio.gather(
        start_http_server(),
        collect_metrics_loop()
    )

    # Wait until shutdown signal
    await shutdown_event.wait()
    tasks.cancel()

    # Ensure connection pool is closed on shutdown
    if _db_writer_instance is not None:
        _db_writer_instance.close()

    logger.info("Metrics Collector shutdown complete")


if __name__ == '__main__':
    asyncio.run(main())
