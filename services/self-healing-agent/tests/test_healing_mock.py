import unittest
from unittest.mock import MagicMock, patch, call
import sys
import os
import time

# Mock dependencies BEFORE importing any modules
mock_docker = MagicMock()
mock_psycopg2 = MagicMock()
mock_psycopg2_pool = MagicMock()
mock_requests = MagicMock()
mock_psutil = MagicMock()

sys.modules['psycopg2'] = mock_psycopg2
sys.modules['psycopg2.pool'] = mock_psycopg2_pool
sys.modules['docker'] = mock_docker
sys.modules['requests'] = mock_requests
sys.modules['psutil'] = mock_psutil

# structured_logging is used by config.py
mock_logging = MagicMock()
mock_logger = MagicMock()
mock_logging.setup_logging.return_value = mock_logger
sys.modules['structured_logging'] = mock_logging

# gpu_recovery is optional
sys.modules['gpu_recovery'] = MagicMock()

# Add parent directory to path to import healing_engine
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from healing_engine import SelfHealingEngine


class TestSelfHealingEngine(unittest.TestCase):

    def setUp(self):
        # Mock environment variables
        os.environ['SELF_HEALING_ENABLED'] = 'true'

        # Configure Docker mock
        self.mock_client = MagicMock()
        mock_docker.from_env.return_value = self.mock_client

        # Configure DB Pool mock — db.py uses `from psycopg2 import pool`,
        # which resolves to mock_psycopg2.pool (auto-attribute), not the
        # separate mock_psycopg2_pool object.
        self.mock_db_pool = MagicMock()
        mock_psycopg2.pool.ThreadedConnectionPool.return_value = self.mock_db_pool
        self.mock_conn = MagicMock()
        self.mock_db_pool.getconn.return_value = self.mock_conn
        self.mock_cursor = MagicMock()
        self.mock_conn.cursor.return_value = self.mock_cursor

        # Initialize engine
        self.engine = SelfHealingEngine()

    def test_initialization(self):
        """Test that the engine initializes correctly"""
        self.assertIsNotNone(self.engine.docker_client)
        self.assertIsNotNone(self.engine.connection_pool)

    def test_get_metrics_success(self):
        """Test successful metrics retrieval"""
        mock_response = MagicMock()
        mock_response.json.return_value = {'cpu': 50, 'ram': 60}
        mock_requests.get.return_value = mock_response

        metrics = self.engine.get_metrics()
        self.assertEqual(metrics, {'cpu': 50, 'ram': 60})

    def test_get_metrics_failure(self):
        """Test metrics retrieval failure"""
        mock_requests.get.side_effect = Exception("Connection failed")

        metrics = self.engine.get_metrics()
        self.assertIsNone(metrics)

        # Reset side_effect for other tests
        mock_requests.get.side_effect = None

    def test_check_service_health(self):
        """Test service health checking"""
        container1 = MagicMock()
        container1.name = 'service1'
        container1.status = 'running'
        container1.attrs = {'State': {'Health': {'Status': 'healthy'}}}

        container2 = MagicMock()
        container2.name = 'service2'
        container2.status = 'exited'

        self.mock_client.containers.list.return_value = [container1, container2]

        status = self.engine.check_service_health()

        self.assertEqual(status['service1']['status'], 'running')
        self.assertEqual(status['service1']['health'], 'healthy')
        self.assertEqual(status['service2']['status'], 'exited')
        self.assertEqual(status['service2']['health'], 'unknown')

    def test_handle_category_a_restart(self):
        """Test Category A recovery: Simple restart"""
        container = MagicMock()

        with patch.object(self.engine, 'record_failure'), \
             patch.object(self.engine, 'is_in_cooldown', return_value=False), \
             patch.object(self.engine, 'get_failure_count', return_value=1), \
             patch.object(self.engine, 'log_event'), \
             patch.object(self.engine, 'record_recovery_action'):
            self.engine.handle_category_a_service_down('test-service', container)

        container.restart.assert_called_once()
        container.stop.assert_not_called()

    def test_handle_category_a_stop_start(self):
        """Test Category A recovery: Stop and Start"""
        container = MagicMock()

        with patch.object(self.engine, 'record_failure'), \
             patch.object(self.engine, 'is_in_cooldown', return_value=False), \
             patch.object(self.engine, 'get_failure_count', return_value=2), \
             patch.object(self.engine, 'log_event'), \
             patch.object(self.engine, 'record_recovery_action'):
            self.engine.handle_category_a_service_down('test-service', container)

        container.stop.assert_called_once()
        container.start.assert_called_once()

    def test_handle_category_a_escalation(self):
        """Test Category A escalation to Category C"""
        container = MagicMock()

        with patch.object(self.engine, 'record_failure'), \
             patch.object(self.engine, 'is_in_cooldown', return_value=False), \
             patch.object(self.engine, 'get_failure_count', return_value=3), \
             patch.object(self.engine, 'log_event'), \
             patch.object(self.engine, 'record_recovery_action'), \
             patch.object(self.engine, 'handle_category_c_critical') as mock_cat_c:
            self.engine.handle_category_a_service_down('test-service', container)

        mock_cat_c.assert_called_once()

    def test_handle_category_b_cpu_overload(self):
        """Test Category B: CPU Overload"""
        metrics = {'cpu': 95, 'ram': 50, 'gpu': 0, 'temperature': 60}

        with patch.object(self.engine, 'clear_llm_cache') as mock_clear:
            self.engine.handle_category_b_overload(metrics)
            mock_clear.assert_called_once()

    def test_handle_category_b_ram_overload(self):
        """Test Category B: RAM Overload"""
        metrics = {'cpu': 50, 'ram': 95, 'gpu': 0, 'temperature': 60}

        with patch.object(self.engine, 'pause_n8n_workflows') as mock_pause:
            self.engine.handle_category_b_overload(metrics)
            mock_pause.assert_called_once()

    def test_handle_category_b_gpu_overload(self):
        """Test Category B: GPU Overload"""
        metrics = {'cpu': 50, 'ram': 50, 'gpu': 99, 'temperature': 60}

        with patch.object(self.engine, 'reset_gpu_session') as mock_reset:
            self.engine.handle_category_b_overload(metrics)
            mock_reset.assert_called_once()

    def test_handle_category_b_thermal_critical(self):
        """Test Category B: Thermal Critical"""
        metrics = {'cpu': 50, 'ram': 50, 'gpu': 0, 'temperature': 90}

        container = MagicMock()
        self.mock_client.containers.get.return_value = container

        self.engine.handle_category_b_overload(metrics)

        self.mock_client.containers.get.assert_called_with('llm-service')
        container.restart.assert_called_once()

    def test_handle_category_c_cooldown(self):
        """Test Category C cooldown logic"""
        self.engine.last_critical_action_time = time.time()

        with patch.object(self.engine, 'hard_restart_application_services') as mock_restart:
            self.engine.handle_category_c_critical("Test reason")
            mock_restart.assert_not_called()

if __name__ == '__main__':
    unittest.main()
