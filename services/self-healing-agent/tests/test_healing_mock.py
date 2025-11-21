import unittest
from unittest.mock import MagicMock, patch, call
import sys
import os
import time

# Mock dependencies BEFORE importing healing_engine
sys.modules['psycopg2'] = MagicMock()
sys.modules['psycopg2.pool'] = MagicMock()
sys.modules['docker'] = MagicMock()
sys.modules['requests'] = MagicMock()
sys.modules['psutil'] = MagicMock()

# Add parent directory to path to import healing_engine
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from healing_engine import SelfHealingEngine

class TestSelfHealingEngine(unittest.TestCase):

    @patch('healing_engine.docker.from_env')
    @patch('healing_engine.pool.ThreadedConnectionPool')
    def setUp(self, mock_pool, mock_docker):
        # Mock environment variables
        os.environ['SELF_HEALING_ENABLED'] = 'true'
        
        # Mock Docker client
        self.mock_docker = mock_docker
        self.mock_client = MagicMock()
        self.mock_docker.return_value = self.mock_client
        
        # Mock DB Pool
        self.mock_pool = mock_pool
        self.mock_db_pool = MagicMock()
        self.mock_pool.return_value = self.mock_db_pool
        self.mock_conn = MagicMock()
        self.mock_db_pool.getconn.return_value = self.mock_conn
        self.mock_cursor = MagicMock()
        self.mock_conn.cursor.return_value = self.mock_cursor
        
        # Initialize engine
        self.engine = SelfHealingEngine()
        
        # Silence logger
        self.engine.logger = MagicMock()

    def test_initialization(self):
        """Test that the engine initializes correctly"""
        self.assertIsNotNone(self.engine.docker_client)
        self.assertIsNotNone(self.engine.connection_pool)

    @patch('healing_engine.requests.get')
    def test_get_metrics_success(self, mock_get):
        """Test successful metrics retrieval"""
        mock_response = MagicMock()
        mock_response.json.return_value = {'cpu': 50, 'ram': 60}
        mock_get.return_value = mock_response
        
        metrics = self.engine.get_metrics()
        self.assertEqual(metrics, {'cpu': 50, 'ram': 60})

    @patch('healing_engine.requests.get')
    def test_get_metrics_failure(self, mock_get):
        """Test metrics retrieval failure"""
        mock_get.side_effect = Exception("Connection failed")
        
        metrics = self.engine.get_metrics()
        self.assertIsNone(metrics)

    def test_check_service_health(self):
        """Test service health checking"""
        # Mock containers
        container1 = MagicMock()
        container1.name = 'service1'
        container1.status = 'running'
        container1.attrs = {'State': {'Health': {'Status': 'healthy'}}}
        
        container2 = MagicMock()
        container2.name = 'service2'
        container2.status = 'exited'
        # No health info
        
        self.mock_client.containers.list.return_value = [container1, container2]
        
        status = self.engine.check_service_health()
        
        self.assertEqual(status['service1']['status'], 'running')
        self.assertEqual(status['service1']['health'], 'healthy')
        self.assertEqual(status['service2']['status'], 'exited')
        self.assertEqual(status['service2']['health'], 'unknown')

    def test_handle_category_a_restart(self):
        """Test Category A recovery: Simple restart"""
        # Mock failure count = 1
        # First call: record_failure -> None
        # Second call: is_in_cooldown -> False
        # Third call: get_failure_count -> 1
        self.mock_cursor.fetchone.side_effect = [None, [False], [1]]
        
        container = MagicMock()
        
        self.engine.handle_category_a_service_down('test-service', container)
        
        # Should call container.restart()
        container.restart.assert_called_once()
        # Should not call stop/start
        container.stop.assert_not_called()

    def test_handle_category_a_stop_start(self):
        """Test Category A recovery: Stop and Start"""
        # Mock failure count = 2
        # First call: record_failure -> None
        # Second call: is_in_cooldown -> False
        # Third call: get_failure_count -> 2
        self.mock_cursor.fetchone.side_effect = [None, [False], [2]]
        
        container = MagicMock()
        
        self.engine.handle_category_a_service_down('test-service', container)
        
        # Should call stop and start
        container.stop.assert_called_once()
        container.start.assert_called_once()

    @patch('healing_engine.SelfHealingEngine.handle_category_c_critical')
    def test_handle_category_a_escalation(self, mock_cat_c):
        """Test Category A escalation to Category C"""
        # Mock failure count = 3 (MAX_FAILURES_IN_WINDOW)
        # First call: record_failure -> None
        # Second call: is_in_cooldown -> False
        # Third call: get_failure_count -> 3
        self.mock_cursor.fetchone.side_effect = [None, [False], [3]]
        
        container = MagicMock()
        
        self.engine.handle_category_a_service_down('test-service', container)
        
        # Should escalate
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
        metrics = {'cpu': 50, 'ram': 50, 'gpu': 0, 'temperature': 90} # > 85
        
        container = MagicMock()
        self.mock_client.containers.get.return_value = container
        
        self.engine.handle_category_b_overload(metrics)
        
        # Should restart LLM service
        self.mock_client.containers.get.assert_called_with('llm-service')
        container.restart.assert_called_once()

    def test_handle_category_c_cooldown(self):
        """Test Category C cooldown logic"""
        # Set last action time to now
        self.engine.last_critical_action_time = time.time()
        
        with patch.object(self.engine, 'hard_restart_application_services') as mock_restart:
            self.engine.handle_category_c_critical("Test reason")
            # Should return early due to cooldown
            mock_restart.assert_not_called()

if __name__ == '__main__':
    unittest.main()
