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
from psycopg2 import pool
from datetime import datetime
from aiohttp import web
from typing import Dict, Optional
import json

# Import GPU Monitor
try:
    from gpu_monitor import GPUMonitor, GPUHealth, GPUError
    GPU_MONITOR_AVAILABLE = True
except ImportError:
    GPU_MONITOR_AVAILABLE = False
    logger = logging.getLogger('metrics-collector')
    logger.warning("GPU Monitor module not available")

# Configure logging
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('metrics-collector')

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

    def __init__(self):
        self.nvml_available = False
        self.gpu_monitor = None
        self._init_nvml()
        self._init_gpu_monitor()

    def _init_nvml(self):
        """Initialize NVIDIA Management Library"""
        try:
            import pynvml
            pynvml.nvmlInit()
            self.nvml_available = True
            self.pynvml = pynvml
            logger.info("NVML initialized successfully")
        except Exception as e:
            logger.warning(f"NVML not available: {e}")
            self.nvml_available = False

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

    def get_cpu_percent(self) -> float:
        """Get CPU utilization percentage"""
        try:
            return psutil.cpu_percent(interval=1)
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
        if not self.nvml_available:
            return 0.0

        try:
            handle = self.pynvml.nvmlDeviceGetHandleByIndex(0)
            utilization = self.pynvml.nvmlDeviceGetUtilizationRates(handle)
            return float(utilization.gpu)
        except Exception as e:
            logger.error(f"Error reading GPU: {e}")
            return 0.0

    def get_temperature(self) -> float:
        """Get system temperature in Celsius"""
        try:
            # Try to read from thermal zone (Jetson AGX Orin)
            thermal_zones = [
                '/host/sys/class/thermal/thermal_zone0/temp',
                '/host/sys/class/thermal/thermal_zone1/temp',
                '/sys/class/thermal/thermal_zone0/temp'
            ]

            for zone_file in thermal_zones:
                if os.path.exists(zone_file):
                    with open(zone_file, 'r') as f:
                        temp = int(f.read().strip()) / 1000.0
                        return temp

            # Fallback: try GPU temperature if available
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
        """Get disk usage statistics"""
        try:
            disk = psutil.disk_usage('/')
            return {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': disk.percent
            }
        except Exception as e:
            logger.error(f"Error reading disk: {e}")
            return {'total': 0, 'used': 0, 'free': 0, 'percent': 0.0}

    def collect_all(self) -> Dict:
        """Collect all metrics"""
        return {
            'cpu': self.get_cpu_percent(),
            'ram': self.get_ram_percent(),
            'gpu': self.get_gpu_percent(),
            'temperature': self.get_temperature(),
            'disk': self.get_disk_usage(),
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

        if error_type == GPUError.CUDA_OOM:
            logger.critical("CUDA Out of Memory detected - requires external intervention")
            # Self-Healing Agent will handle this via GPU recovery module

        elif error_type == GPUError.GPU_HANG:
            logger.critical("GPU Hang detected - requires reset")
            # Self-Healing Agent will handle GPU reset

        elif error_type == GPUError.THERMAL_THROTTLE:
            logger.warning("GPU thermal throttling detected")
            # Self-Healing Agent will handle throttling

        elif error_type == GPUError.NVML_ERROR:
            logger.error("NVML Error - attempting recovery")
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
                except:
                    pass

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
                except:
                    pass
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
                except:
                    pass
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


async def collect_metrics_loop():
    """Main metrics collection loop"""
    global current_metrics, metrics_buffer

    collector = MetricsCollector()
    db_writer = DatabaseWriter()

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
                if metrics_buffer:
                    # Write the most recent metrics
                    db_writer.write_metrics(metrics_buffer[-1])
                    metrics_buffer.clear()
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

    # Start HTTP server and metrics collection concurrently
    await asyncio.gather(
        start_http_server(),
        collect_metrics_loop()
    )


if __name__ == '__main__':
    asyncio.run(main())
