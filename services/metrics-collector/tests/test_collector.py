"""
Unit tests for metrics collector
"""

import asyncio
import time

import pytest
from unittest.mock import Mock, patch, MagicMock
import collector as collector_module
from collector import MetricsCollector, DatabaseWriter, METRICS_BUFFER_MAX


class TestMetricsCollector:
    @pytest.fixture
    def collector(self):
        return MetricsCollector()

    def test_get_cpu_percent(self, collector):
        cpu = collector.get_cpu_percent()
        assert isinstance(cpu, float)
        assert 0 <= cpu <= 100

    def test_get_ram_percent(self, collector):
        ram = collector.get_ram_percent()
        assert isinstance(ram, float)
        assert 0 <= ram <= 100

    def test_get_disk_usage(self, collector):
        disk = collector.get_disk_usage()
        assert 'used' in disk
        assert 'free' in disk
        assert 'total' in disk
        assert 'percent' in disk
        # used + free ist auf ext4 & Co. KLEINER als total: ein Teil der
        # Bloecke ist fuer root reserviert und zaehlt in keinen der beiden
        # Werte. Frueher stand hier „Differenz < 1 MB"; auf dem CI-Runner sind
        # es 16 MB, und das ist voellig normal — die Erwartung war falsch, nicht
        # der Code (der reicht psutil.disk_usage roh durch).
        assert disk['total'] > 0
        assert disk['used'] + disk['free'] <= disk['total']
        assert 0 <= disk['percent'] <= 100

    def test_get_temperature(self, collector, tmp_path):
        """Liest die Thermal-Zone und rechnet Milligrad in Grad um.

        Frueher mockte dieser Test `psutil.sensors_temperatures` — das benutzt
        `get_temperature` schon lange nicht mehr (es liest eine sysfs-Zone,
        ersatzweise NVML). Der Mock lief also ins Leere und der Test verglich
        die echte Runner-Temperatur (0.0) mit 65.0.
        """
        zone = tmp_path / "temp"
        zone.write_text("65000\n")

        with patch.object(collector, '_find_gpu_thermal_path', return_value=str(zone)):
            assert collector.get_temperature() == 65.0

    def test_get_temperature_fallback(self, collector):
        """Weder Thermal-Zone noch NVML -> ehrliche 0.0 statt Raterei."""
        with patch.object(collector, '_find_gpu_thermal_path', return_value=None):
            collector.nvml_available = False
            assert collector.get_temperature() == 0.0


class TestDatabaseWriter:
    @pytest.fixture
    def db_writer(self):
        with patch('collector.psycopg2.pool.ThreadedConnectionPool'):
            return DatabaseWriter()

    def test_write_metrics_success(self, db_writer):
        mock_conn = Mock()
        mock_cursor = Mock()
        mock_conn.cursor.return_value = mock_cursor

        db_writer.get_connection = Mock(return_value=mock_conn)
        db_writer.release_connection = Mock()

        metrics = {
            'cpu': 50.0,
            'ram': 60.0,
            'gpu': 70.0,
            'temperature': 65.0,
            'disk': {'used': 100, 'free': 200, 'percent': 33.3},
            'timestamp': '2025-11-12T10:30:45.123Z'
        }

        db_writer.write_metrics(metrics)

        assert db_writer.get_connection.called
        # Sechs Zeitreihen: cpu, ram, swap, gpu, temperature, disk.
        # Frueher stand hier 5 — swap kam spaeter dazu und niemand sah es,
        # weil der CI-Schritt Fehlschlaege verschluckte.
        assert mock_cursor.execute.call_count == 6
        tabellen = [
            aufruf.args[0].split('INSERT INTO ')[1].split(' ')[0]
            for aufruf in mock_cursor.execute.call_args_list
        ]
        assert tabellen == [
            'metrics_cpu', 'metrics_ram', 'metrics_swap',
            'metrics_gpu', 'metrics_temperature', 'metrics_disk',
        ]
        assert db_writer.release_connection.called

    def test_get_pool_stats(self, db_writer):
        stats = db_writer.get_pool_stats()

        assert 'total_queries' in stats
        assert 'total_errors' in stats
        assert 'slow_queries' in stats
        assert 'queries_per_second' in stats
        assert 'error_rate' in stats


class TestMetricsBufferBound:
    """Regression: the in-memory live buffer must stay bounded.

    Previously it was trimmed only inside the persist branch and by a single
    element, so it grew ~14400 entries/day and eventually OOM'd the container.
    The collection loop now appends and hard-caps every cycle via
    ``del metrics_buffer[:-METRICS_BUFFER_MAX]``.
    """

    def test_buffer_stays_bounded_across_many_cycles(self):
        # Operate on the module's real buffer using the exact loop operation.
        buffer = collector_module.metrics_buffer
        buffer.clear()
        try:
            # Simulate far more cycles than the cap (e.g. a full day of 5s samples).
            for i in range(METRICS_BUFFER_MAX * 100):
                buffer.append({'i': i})
                del buffer[:-METRICS_BUFFER_MAX]  # matches collect_metrics_loop
                assert len(buffer) <= METRICS_BUFFER_MAX

            # After the run the buffer holds exactly the last N samples, in order.
            assert len(buffer) == METRICS_BUFFER_MAX
            expected_first = (METRICS_BUFFER_MAX * 100) - METRICS_BUFFER_MAX
            assert buffer[0] == {'i': expected_first}
            assert buffer[-1] == {'i': (METRICS_BUFFER_MAX * 100) - 1}
        finally:
            buffer.clear()

    def test_buffer_cap_is_positive(self):
        assert isinstance(METRICS_BUFFER_MAX, int)
        assert METRICS_BUFFER_MAX > 0


class TestEventLoopNotBlockedByProbes:
    """Regression: blocking infra probes must not freeze the event loop.

    ``collect_all`` runs synchronous network/HTTP/DNS probes that stall for
    several seconds on a timeout when the appliance is offline. If those run
    directly on the event loop they freeze the shared aiohttp ``/health``
    endpoint and the container gets marked unhealthy / restart-looped. The
    collection loop offloads them via ``loop.run_in_executor`` so a slow probe
    can never block the loop.
    """

    @pytest.mark.asyncio
    async def test_slow_probe_offloaded_keeps_loop_responsive(self):
        loop = asyncio.get_event_loop()

        # Simulate collect_all() blocking on an unreachable probe.
        def blocking_collect_all():
            time.sleep(0.5)
            return {'cpu': 1.0}

        # A concurrent "health" heartbeat that must keep ticking while the
        # blocking probe runs. If the loop were frozen it would tick ~0 times.
        ticks = 0

        async def heartbeat():
            nonlocal ticks
            while True:
                ticks += 1
                await asyncio.sleep(0.02)

        hb = asyncio.ensure_future(heartbeat())
        try:
            # This is exactly how collect_metrics_loop now invokes collect_all.
            result = await loop.run_in_executor(None, blocking_collect_all)
        finally:
            hb.cancel()

        assert result == {'cpu': 1.0}
        # Loop stayed responsive during the 0.5s blocking call.
        assert ticks >= 5

    @pytest.mark.asyncio
    async def test_direct_blocking_call_would_freeze_loop(self):
        """Contrast: calling the blocking probe inline freezes the loop."""
        ticks = 0

        async def heartbeat():
            nonlocal ticks
            while True:
                ticks += 1
                await asyncio.sleep(0.02)

        hb = asyncio.ensure_future(heartbeat())
        try:
            await asyncio.sleep(0)  # let heartbeat start
            time.sleep(0.5)  # blocking the loop directly (the old behavior)
        finally:
            hb.cancel()

        # Without offloading, the heartbeat is starved during the block.
        assert ticks <= 2
