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

    # Candidate GPU load paths (Orin, Thor, generic)
    GPU_LOAD_CANDIDATES = [
        'devices/platform/gpu.0/load',
        'devices/platform/gpu/load',
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
                    return full_path

        self._cached_gpu_load_path = ''  # Mark as searched but not found
        return None

    def _find_gpu_thermal_path(self) -> Optional[str]:
        """Discover GPU thermal zone by checking type instead of hardcoding zone number (cached)"""
        if self._cached_gpu_thermal_path is not None:
            return self._cached_gpu_thermal_path if self._cached_gpu_thermal_path else None

        gpu_therm_names = ['gpu-therm', 'GPU-therm', 'gpu_therm', 'Tdiode_GPU', 'GPU']

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
                                if zone_type in gpu_therm_names:
                                    temp_path = os.path.join(zone_dir, 'temp')
                                    if os.path.exists(temp_path):
                                        self._cached_gpu_thermal_path = temp_path
                                        logger.info(f"GPU thermal zone: {zone_type} -> {temp_path}")
                                        return temp_path
                    except Exception as e:
                        logger.debug(f"Non-critical error reading thermal zone type: {e}")
                        continue
            except Exception as e:
                logger.debug(f"Non-critical error scanning thermal zones: {e}")

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
            # Try smartctl first (most reliable)
            result = subprocess.run(
                ['smartctl', '-A', '/dev/nvme0n1', '--json'],
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

    def collect_all(self) -> Dict:
        """Collect all metrics"""
        return {
            'cpu': self.get_cpu_percent(),
            'ram': self.get_ram_percent(),
            'gpu': self.get_gpu_percent(),
            'temperature': self.get_temperature(),
            'disk': self.get_disk_usage(),
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
