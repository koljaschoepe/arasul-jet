"""
Unit tests for metrics collector
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from collector import MetricsCollector, DatabaseWriter


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
        assert disk['used'] + disk['free'] == disk['total']
        assert 0 <= disk['percent'] <= 100

    @patch('collector.psutil.sensors_temperatures')
    def test_get_temperature(self, mock_temps, collector):
        mock_temps.return_value = {
            'thermal-fan-est': [MagicMock(current=65.0)]
        }
        temp = collector.get_temperature()
        assert temp == 65.0

    @patch('collector.psutil.sensors_temperatures')
    def test_get_temperature_fallback(self, mock_temps, collector):
        mock_temps.return_value = {}
        temp = collector.get_temperature()
        assert temp == 0.0


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
        assert mock_cursor.execute.call_count == 5
        assert db_writer.release_connection.called

    def test_get_pool_stats(self, db_writer):
        stats = db_writer.get_pool_stats()

        assert 'total_queries' in stats
        assert 'total_errors' in stats
        assert 'slow_queries' in stats
        assert 'queries_per_second' in stats
        assert 'error_rate' in stats
