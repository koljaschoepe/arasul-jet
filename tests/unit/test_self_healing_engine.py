"""
Unit Tests für Self-Healing Engine
Testet alle 4 Kategorien: A (Service Down), B (Overload), C (Critical), D (Reboot)

Ziel: 80%+ Code Coverage für healing_engine.py (1,228 LOC)
"""

import pytest
import sys
import os
import time
from unittest.mock import Mock, patch, MagicMock, call
from datetime import datetime, timedelta
import json

# Add service directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__),
                                '../../services/self-healing-agent'))


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_db_connection():
    """Mock PostgreSQL connection with cursor"""
    conn = Mock()
    cursor = Mock()
    cursor.__enter__ = Mock(return_value=cursor)
    cursor.__exit__ = Mock(return_value=None)
    conn.cursor.return_value = cursor
    conn.commit = Mock()
    conn.rollback = Mock()
    return conn, cursor


@pytest.fixture
def mock_docker_client():
    """Mock Docker client with containers"""
    client = Mock()
    client.containers = Mock()
    return client


@pytest.fixture
def mock_container():
    """Mock Docker container"""
    container = Mock()
    container.name = "test-service"
    container.status = "running"
    container.attrs = {
        "State": {
            "Health": {"Status": "healthy"},
            "Running": True,
            "ExitCode": 0
        }
    }
    container.restart = Mock()
    container.stop = Mock()
    container.start = Mock()
    return container


@pytest.fixture
def mock_engine(mock_db_connection):
    """Mock SelfHealingEngine instance"""
    with patch('healing_engine.docker.from_env'):
        with patch('healing_engine.psycopg2.pool.ThreadedConnectionPool'):
            # Import after patching to avoid real connections
            from healing_engine import SelfHealingEngine

            engine = SelfHealingEngine()
            engine.connection_pool = Mock()
            engine.docker_client = Mock()

            # Mock database methods
            conn, cursor = mock_db_connection
            engine.get_connection = Mock(return_value=conn)
            engine.release_connection = Mock()

            return engine


# ============================================================================
# CATEGORY A: SERVICE DOWN RECOVERY
# ============================================================================

class TestCategoryA_ServiceDown:
    """Tests für Kategorie A - Service Down Recovery"""

    def test_check_service_health_all_healthy(self, mock_engine):
        """Test: check_service_health() erkennt alle Services als healthy"""

        # Mock Docker containers
        mock_containers = []
        for service in ['llm-service', 'n8n', 'dashboard-backend']:
            container = Mock()
            container.name = service
            container.status = "running"
            container.attrs = {
                "State": {
                    "Health": {"Status": "healthy"},
                    "Running": True
                }
            }
            mock_containers.append(container)

        mock_engine.docker_client.containers.list.return_value = mock_containers

        # Execute
        result = mock_engine.check_service_health()

        # Assert
        assert len(result) >= 3
        for service in result.values():
            assert service['healthy'] is True

    def test_check_service_health_detects_unhealthy(self, mock_engine):
        """Test: check_service_health() erkennt unhealthy Services"""

        # Mock unhealthy container
        container = Mock()
        container.name = "llm-service"
        container.status = "running"
        container.attrs = {
            "State": {
                "Health": {"Status": "unhealthy"},
                "Running": True
            }
        }

        mock_engine.docker_client.containers.list.return_value = [container]

        # Execute
        result = mock_engine.check_service_health()

        # Assert
        assert 'llm-service' in result
        assert result['llm-service']['healthy'] is False

    def test_check_service_health_detects_stopped(self, mock_engine):
        """Test: check_service_health() erkennt gestoppte Services"""

        container = Mock()
        container.name = "n8n"
        container.status = "exited"
        container.attrs = {
            "State": {
                "Running": False,
                "ExitCode": 1
            }
        }

        mock_engine.docker_client.containers.list.return_value = [container]

        # Execute
        result = mock_engine.check_service_health()

        # Assert
        assert 'n8n' in result
        assert result['n8n']['healthy'] is False
        assert result['n8n']['status'] == 'exited'

    def test_handle_category_a_first_attempt_restart(self, mock_engine, mock_container):
        """Test: Erster Versuch → container.restart()"""

        mock_container.status = "exited"

        # Mock failure count = 1 (erster Versuch)
        mock_engine.get_failure_count = Mock(return_value=1)
        mock_engine.record_failure = Mock()
        mock_engine.log_event = Mock()
        mock_engine.record_recovery_action = Mock()

        # Execute
        mock_engine.handle_category_a_service_down("test-service", mock_container)

        # Assert
        mock_container.restart.assert_called_once()
        mock_engine.record_recovery_action.assert_called()

        # Verify action type is 'service_restart'
        call_args = mock_engine.record_recovery_action.call_args[0]
        assert call_args[0] == 'service_restart'

    def test_handle_category_a_second_attempt_stop_start(self, mock_engine, mock_container):
        """Test: Zweiter Versuch → stop() + start()"""

        mock_container.status = "exited"

        # Mock failure count = 2 (zweiter Versuch)
        mock_engine.get_failure_count = Mock(return_value=2)
        mock_engine.record_failure = Mock()
        mock_engine.log_event = Mock()
        mock_engine.record_recovery_action = Mock()

        # Execute
        mock_engine.handle_category_a_service_down("test-service", mock_container)

        # Assert
        mock_container.stop.assert_called()
        mock_container.start.assert_called()

    def test_handle_category_a_third_attempt_escalates(self, mock_engine, mock_container):
        """Test: Dritter+ Versuch → Eskalation zu Category C"""

        mock_container.status = "exited"

        # Mock failure count = 3 (dritter Versuch)
        mock_engine.get_failure_count = Mock(return_value=3)
        mock_engine.record_failure = Mock()
        mock_engine.log_event = Mock()
        mock_engine.handle_category_c_critical = Mock()

        # Execute
        mock_engine.handle_category_a_service_down("test-service", mock_container)

        # Assert: Category C sollte aufgerufen werden
        mock_engine.handle_category_c_critical.assert_called_once()
        call_args = mock_engine.handle_category_c_critical.call_args[0]
        assert 'test-service' in call_args[0]
        assert 'failed 3 times' in call_args[0].lower()

    def test_record_failure_stores_in_database(self, mock_engine):
        """Test: record_failure() speichert Failure in DB"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()

        # Execute
        mock_engine.record_failure("test-service", "unhealthy", "Health check failed")

        # Assert
        mock_cursor.execute.assert_called()
        call_args = str(mock_cursor.execute.call_args)
        assert 'service_failures' in call_args.lower()

    def test_get_failure_count_queries_database(self, mock_engine):
        """Test: get_failure_count() zählt Failures im Zeitfenster"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)
        mock_cursor.fetchone.return_value = (3,)  # 3 failures
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()

        # Execute
        result = mock_engine.get_failure_count("test-service", minutes=10)

        # Assert
        assert result == 3
        mock_cursor.execute.assert_called()


# ============================================================================
# CATEGORY B: OVERLOAD RECOVERY
# ============================================================================

class TestCategoryB_Overload:
    """Tests für Kategorie B - Resource Overload Recovery"""

    @patch('healing_engine.requests.post')
    def test_clear_llm_cache_success(self, mock_post, mock_engine):
        """Test: clear_llm_cache() ruft LLM API erfolgreich auf"""

        # Mock successful API response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "success"}
        mock_post.return_value = mock_response

        # Execute
        result = mock_engine.clear_llm_cache()

        # Assert
        assert result is True
        mock_post.assert_called_once()
        call_args = mock_post.call_args[0][0]
        assert '/api/cache/clear' in call_args

    @patch('healing_engine.requests.post')
    def test_clear_llm_cache_fallback_restart(self, mock_post, mock_engine):
        """Test: clear_llm_cache() fällt zurück auf Restart bei API Fehler"""

        # Mock API failure
        mock_post.side_effect = Exception("Connection refused")

        # Mock Docker container
        mock_container = Mock()
        mock_engine.docker_client.containers.get.return_value = mock_container

        # Execute
        result = mock_engine.clear_llm_cache()

        # Assert
        assert result is True
        mock_container.restart.assert_called_once()

    @patch('healing_engine.requests.post')
    def test_reset_gpu_session_success(self, mock_post, mock_engine):
        """Test: reset_gpu_session() ruft Session Reset API auf"""

        mock_response = Mock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        # Execute
        result = mock_engine.reset_gpu_session()

        # Assert
        assert result is True
        mock_post.assert_called_once()
        call_args = mock_post.call_args[0][0]
        assert '/api/session/reset' in call_args

    @patch('healing_engine.subprocess.run')
    def test_throttle_gpu_success(self, mock_subprocess, mock_engine):
        """Test: throttle_gpu() setzt GPU Clock Limit"""

        mock_subprocess.return_value.returncode = 0

        # Execute
        result = mock_engine.throttle_gpu()

        # Assert
        assert result is True
        mock_subprocess.assert_called()
        call_args = str(mock_subprocess.call_args)
        assert 'nvidia-smi' in call_args

    @patch('healing_engine.requests.get')
    def test_pause_n8n_workflows_success(self, mock_get, mock_engine):
        """Test: pause_n8n_workflows() pausiert aktive Workflows"""

        # Mock n8n API response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {"id": "1", "active": True},
                {"id": "2", "active": True}
            ]
        }
        mock_get.return_value = mock_response

        with patch('healing_engine.requests.patch') as mock_patch:
            mock_patch.return_value.status_code = 200

            # Execute
            result = mock_engine.pause_n8n_workflows()

            # Assert
            assert result is True
            assert mock_patch.call_count == 2  # 2 workflows pausiert

    @patch('healing_engine.requests.get')
    def test_get_metrics_retrieves_system_metrics(self, mock_get, mock_engine):
        """Test: get_metrics() holt CPU/RAM/GPU/Temp Metrics"""

        # Mock metrics response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "cpu": 75.5,
            "ram": 60.2,
            "gpu": 85.0,
            "temperature": 72.0
        }
        mock_get.return_value = mock_response

        # Execute
        result = mock_engine.get_metrics()

        # Assert
        assert result['cpu'] == 75.5
        assert result['ram'] == 60.2
        assert result['gpu'] == 85.0
        assert result['temperature'] == 72.0

    def test_handle_category_b_cpu_overload(self, mock_engine):
        """Test: CPU > 90% → Cache Clear"""

        metrics = {
            "cpu": 92.0,
            "ram": 50.0,
            "gpu": 50.0,
            "temperature": 70.0
        }

        mock_engine.clear_llm_cache = Mock(return_value=True)
        mock_engine.log_event = Mock()
        mock_engine.record_recovery_action = Mock()
        mock_engine.is_in_cooldown = Mock(return_value=False)

        # Execute
        mock_engine.handle_category_b_overload(metrics)

        # Assert
        mock_engine.clear_llm_cache.assert_called_once()

    def test_handle_category_b_ram_overload(self, mock_engine):
        """Test: RAM > 90% → n8n Restart"""

        metrics = {
            "cpu": 50.0,
            "ram": 93.0,
            "gpu": 50.0,
            "temperature": 70.0
        }

        mock_container = Mock()
        mock_engine.docker_client.containers.get.return_value = mock_container
        mock_engine.log_event = Mock()
        mock_engine.record_recovery_action = Mock()
        mock_engine.is_in_cooldown = Mock(return_value=False)

        # Execute
        mock_engine.handle_category_b_overload(metrics)

        # Assert
        mock_container.restart.assert_called()

    def test_handle_category_b_gpu_overload(self, mock_engine):
        """Test: GPU > 95% → GPU Session Reset"""

        metrics = {
            "cpu": 50.0,
            "ram": 50.0,
            "gpu": 97.0,
            "temperature": 70.0
        }

        mock_engine.reset_gpu_session = Mock(return_value=True)
        mock_engine.log_event = Mock()
        mock_engine.record_recovery_action = Mock()
        mock_engine.is_in_cooldown = Mock(return_value=False)

        # Execute
        mock_engine.handle_category_b_overload(metrics)

        # Assert
        mock_engine.reset_gpu_session.assert_called_once()

    def test_handle_category_b_temperature_overload(self, mock_engine):
        """Test: Temp > 83°C → GPU Throttling"""

        metrics = {
            "cpu": 50.0,
            "ram": 50.0,
            "gpu": 50.0,
            "temperature": 84.0
        }

        mock_engine.throttle_gpu = Mock(return_value=True)
        mock_engine.log_event = Mock()
        mock_engine.record_recovery_action = Mock()
        mock_engine.is_in_cooldown = Mock(return_value=False)

        # Execute
        mock_engine.handle_category_b_overload(metrics)

        # Assert
        mock_engine.throttle_gpu.assert_called_once()

    def test_is_in_cooldown_prevents_action_spam(self, mock_engine):
        """Test: Cooldown verhindert zu häufige Actions (5min)"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)

        # Simuliere recent action (vor 2 Minuten)
        recent_time = datetime.now() - timedelta(minutes=2)
        mock_cursor.fetchone.return_value = (recent_time,)
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()

        # Execute
        result = mock_engine.is_in_cooldown("test-service", minutes=5)

        # Assert
        assert result is True  # Noch in Cooldown

    def test_cooldown_expired_allows_action(self, mock_engine):
        """Test: Abgelaufener Cooldown erlaubt neue Action"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)

        # Simuliere alte action (vor 10 Minuten)
        old_time = datetime.now() - timedelta(minutes=10)
        mock_cursor.fetchone.return_value = (old_time,)
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()

        # Execute
        result = mock_engine.is_in_cooldown("test-service", minutes=5)

        # Assert
        assert result is False  # Cooldown abgelaufen


# ============================================================================
# CATEGORY C: CRITICAL RECOVERY
# ============================================================================

class TestCategoryC_Critical:
    """Tests für Kategorie C - Critical Recovery"""

    def test_hard_restart_application_services(self, mock_engine):
        """Test: hard_restart stoppt und startet alle Application Services"""

        # Mock containers
        mock_containers = []
        for service in ['llm-service', 'n8n', 'dashboard-backend']:
            container = Mock()
            container.name = service
            mock_containers.append(container)

        mock_engine.docker_client.containers.list.return_value = mock_containers
        mock_engine.log_event = Mock()

        # Execute
        result = mock_engine.hard_restart_application_services()

        # Assert
        assert result is True
        for container in mock_containers:
            container.stop.assert_called_once()
            container.start.assert_called_once()

    @patch('healing_engine.subprocess.run')
    def test_perform_disk_cleanup_success(self, mock_subprocess, mock_engine):
        """Test: perform_disk_cleanup() führt Docker cleanup durch"""

        mock_subprocess.return_value.returncode = 0
        mock_subprocess.return_value.stdout = "Total reclaimed space: 5GB"
        mock_engine.log_event = Mock()

        # Execute
        result = mock_engine.perform_disk_cleanup()

        # Assert
        assert result is True
        mock_subprocess.assert_called()
        call_args = str(mock_subprocess.call_args)
        assert 'docker system prune' in call_args

    def test_perform_db_vacuum_success(self, mock_engine):
        """Test: perform_db_vacuum() führt VACUUM auf DB durch"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)
        mock_conn.cursor.return_value = mock_cursor
        mock_conn.autocommit = False

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()
        mock_engine.log_event = Mock()

        # Execute
        result = mock_engine.perform_db_vacuum()

        # Assert
        assert result is True
        mock_cursor.execute.assert_called()
        call_args = str(mock_cursor.execute.call_args)
        assert 'VACUUM' in call_args

    @patch('healing_engine.subprocess.run')
    def test_perform_gpu_reset_success(self, mock_subprocess, mock_engine):
        """Test: perform_gpu_reset() führt GPU Reset durch"""

        mock_subprocess.return_value.returncode = 0
        mock_engine.log_event = Mock()

        # Execute
        result = mock_engine.perform_gpu_reset()

        # Assert
        assert result is True
        mock_subprocess.assert_called()
        call_args = str(mock_subprocess.call_args)
        assert 'nvidia-smi' in call_args
        assert '--gpu-reset' in call_args

    def test_handle_category_c_executes_all_actions(self, mock_engine):
        """Test: handle_category_c führt alle Critical Actions aus"""

        mock_engine.hard_restart_application_services = Mock(return_value=True)
        mock_engine.perform_disk_cleanup = Mock(return_value=True)
        mock_engine.perform_db_vacuum = Mock(return_value=True)
        mock_engine.perform_gpu_reset = Mock(return_value=True)
        mock_engine.log_event = Mock()
        mock_engine.record_recovery_action = Mock()

        # Execute
        mock_engine.handle_category_c_critical("Test critical event")

        # Assert: Alle Actions sollten ausgeführt werden
        mock_engine.hard_restart_application_services.assert_called_once()
        mock_engine.perform_disk_cleanup.assert_called_once()
        mock_engine.perform_db_vacuum.assert_called_once()
        mock_engine.perform_gpu_reset.assert_called_once()

    def test_get_critical_events_count(self, mock_engine):
        """Test: get_critical_events_count() zählt CRITICAL/EMERGENCY Events"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)
        mock_cursor.fetchone.return_value = (5,)  # 5 critical events
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()

        # Execute
        result = mock_engine.get_critical_events_count(minutes=30)

        # Assert
        assert result == 5


# ============================================================================
# CATEGORY D: REBOOT
# ============================================================================

class TestCategoryD_Reboot:
    """Tests für Kategorie D - System Reboot"""

    def test_perform_reboot_safety_checks_recent_reboots(self, mock_engine):
        """Test: Safety Check verhindert Reboot Loop (<3 in 1h)"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)

        # Simuliere 3 recent reboots
        mock_cursor.fetchone.return_value = (3,)
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()
        mock_engine.log_event = Mock()

        # Execute
        result = mock_engine.perform_reboot_safety_checks("test reason")

        # Assert
        assert result is False  # Zu viele Reboots

    def test_perform_reboot_safety_checks_disk_usage_ok(self, mock_engine):
        """Test: Safety Check erlaubt Reboot bei normalem Disk Usage"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)

        # Simuliere 0 recent reboots
        mock_cursor.fetchone.return_value = (0,)
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()
        mock_engine.log_event = Mock()

        # Mock disk usage < 97%
        with patch('healing_engine.psutil.disk_usage') as mock_disk:
            mock_disk.return_value.percent = 85.0

            # Execute
            result = mock_engine.perform_reboot_safety_checks("test reason")

            # Assert
            assert result is True

    def test_perform_reboot_safety_checks_disk_critical_allows(self, mock_engine):
        """Test: Safety Check erlaubt Reboot bei kritischem Disk (>97%)"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)
        mock_cursor.fetchone.return_value = (0,)
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()
        mock_engine.log_event = Mock()

        # Mock disk usage > 97%
        with patch('healing_engine.psutil.disk_usage') as mock_disk:
            mock_disk.return_value.percent = 98.0

            # Execute
            result = mock_engine.perform_reboot_safety_checks("Disk full")

            # Assert: Erlaubt Reboot wegen critical disk
            assert result is True

    def test_save_reboot_state_stores_system_state(self, mock_engine):
        """Test: save_reboot_state() speichert Pre-Reboot State"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)
        mock_cursor.fetchone.return_value = (123,)  # reboot_event_id
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()
        mock_engine.check_service_health = Mock(return_value={"llm-service": {"healthy": True}})

        with patch('healing_engine.psutil.cpu_percent', return_value=50.0):
            with patch('healing_engine.psutil.virtual_memory') as mock_mem:
                mock_mem.return_value.percent = 60.0

                # Execute
                result = mock_engine.save_reboot_state("test reboot")

                # Assert
                assert result == 123
                mock_cursor.execute.assert_called()
                call_args = str(mock_cursor.execute.call_args)
                assert 'reboot_events' in call_args.lower()

    @patch.dict(os.environ, {"SELF_HEALING_REBOOT_ENABLED": "false"})
    def test_handle_category_d_reboot_disabled_by_default(self, mock_engine):
        """Test: Reboot ist standardmäßig disabled"""

        mock_engine.log_event = Mock()

        # Execute
        mock_engine.handle_category_d_reboot("test reason")

        # Assert: Log event sollte "disabled" erwähnen
        call_args = str(mock_engine.log_event.call_args)
        assert 'disabled' in call_args.lower()

    @patch.dict(os.environ, {"SELF_HEALING_REBOOT_ENABLED": "true"})
    @patch('healing_engine.subprocess.run')
    def test_handle_category_d_reboot_enabled(self, mock_subprocess, mock_engine):
        """Test: Reboot wird ausgeführt wenn enabled"""

        mock_subprocess.return_value.returncode = 0

        mock_engine.perform_reboot_safety_checks = Mock(return_value=True)
        mock_engine.save_reboot_state = Mock(return_value=123)
        mock_engine.log_event = Mock()

        # Execute
        mock_engine.handle_category_d_reboot("test reason")

        # Assert
        mock_subprocess.assert_called()
        call_args = str(mock_subprocess.call_args)
        assert 'reboot' in call_args.lower()


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

class TestUtilityFunctions:
    """Tests für Utility Functions"""

    def test_log_event_stores_event(self, mock_engine):
        """Test: log_event() speichert Event in DB"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()

        # Execute
        mock_engine.log_event(
            event_type="test_event",
            severity="INFO",
            description="Test description",
            action_taken="Test action",
            service_name="test-service",
            success=True
        )

        # Assert
        mock_cursor.execute.assert_called()
        call_args = str(mock_cursor.execute.call_args)
        assert 'self_healing_events' in call_args.lower()

    def test_record_recovery_action_stores_action(self, mock_engine):
        """Test: record_recovery_action() speichert Action in DB"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()

        # Execute
        mock_engine.record_recovery_action(
            action_type="service_restart",
            service_name="test-service",
            reason="Test reason",
            success=True,
            duration_ms=1500
        )

        # Assert
        mock_cursor.execute.assert_called()
        call_args = str(mock_cursor.execute.call_args)
        assert 'recovery_actions' in call_args.lower()

    @patch('healing_engine.psutil.disk_usage')
    def test_check_disk_usage_returns_metrics(self, mock_disk, mock_engine):
        """Test: check_disk_usage() gibt korrekte Disk Metrics zurück"""

        mock_disk.return_value.total = 1000000000000  # 1TB
        mock_disk.return_value.used = 850000000000   # 850GB
        mock_disk.return_value.free = 150000000000   # 150GB
        mock_disk.return_value.percent = 85.0

        mock_engine.log_event = Mock()

        # Execute
        result = mock_engine.check_disk_usage()

        # Assert
        assert result['percent'] == 85.0
        assert result['used_gb'] > 0
        assert result['free_gb'] > 0

    @patch('healing_engine.psutil.disk_usage')
    def test_check_disk_usage_logs_warning_at_80(self, mock_disk, mock_engine):
        """Test: check_disk_usage() loggt WARNING bei 80%"""

        mock_disk.return_value.percent = 82.0
        mock_disk.return_value.total = 1000000000000
        mock_disk.return_value.used = 820000000000
        mock_disk.return_value.free = 180000000000

        mock_engine.log_event = Mock()

        # Execute
        mock_engine.check_disk_usage()

        # Assert
        mock_engine.log_event.assert_called()
        call_args = mock_engine.log_event.call_args
        assert call_args[0][1] == 'WARNING'  # severity

    def test_update_heartbeat(self, mock_engine):
        """Test: update_heartbeat() aktualisiert Timestamp"""

        mock_conn = Mock()
        mock_cursor = Mock()
        mock_cursor.__enter__ = Mock(return_value=mock_cursor)
        mock_cursor.__exit__ = Mock(return_value=None)
        mock_conn.cursor.return_value = mock_cursor

        mock_engine.get_connection = Mock(return_value=mock_conn)
        mock_engine.release_connection = Mock()

        # Execute
        mock_engine.update_heartbeat()

        # Assert
        mock_cursor.execute.assert_called()

    def test_get_pool_stats_returns_stats(self, mock_engine):
        """Test: get_pool_stats() gibt Connection Pool Stats zurück"""

        mock_engine.pool_stats = {
            'total_queries': 1000,
            'total_errors': 5,
            'start_time': time.time() - 3600
        }

        # Execute
        result = mock_engine.get_pool_stats()

        # Assert
        assert 'total_queries' in result
        assert 'total_errors' in result
        assert 'uptime_seconds' in result
        assert result['total_queries'] == 1000


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

class TestIntegration:
    """Integration Tests für komplexe Flows"""

    def test_run_healing_cycle_executes_all_checks(self, mock_engine):
        """Test: run_healing_cycle() führt alle Checks aus"""

        # Mock all subsystems
        mock_engine.check_service_health = Mock(return_value={})
        mock_engine.get_metrics = Mock(return_value={
            "cpu": 50.0, "ram": 50.0, "gpu": 50.0, "temperature": 70.0
        })
        mock_engine.handle_category_b_overload = Mock()
        mock_engine.check_disk_usage = Mock(return_value={"percent": 75.0})
        mock_engine.update_heartbeat = Mock()
        mock_engine.handle_gpu_errors = Mock()

        # Execute
        mock_engine.run_healing_cycle()

        # Assert
        mock_engine.check_service_health.assert_called_once()
        mock_engine.get_metrics.assert_called_once()
        mock_engine.check_disk_usage.assert_called_once()
        mock_engine.update_heartbeat.assert_called_once()

    def test_healing_cycle_handles_exception_gracefully(self, mock_engine):
        """Test: run_healing_cycle() fängt Exceptions ab"""

        # Mock exception in check_service_health
        mock_engine.check_service_health = Mock(side_effect=Exception("Test error"))
        mock_engine.get_metrics = Mock(return_value={
            "cpu": 50.0, "ram": 50.0, "gpu": 50.0, "temperature": 70.0
        })
        mock_engine.handle_category_b_overload = Mock()
        mock_engine.check_disk_usage = Mock(return_value={"percent": 75.0})
        mock_engine.update_heartbeat = Mock()

        # Execute - sollte nicht crashen
        try:
            mock_engine.run_healing_cycle()
        except Exception:
            pytest.fail("run_healing_cycle should handle exceptions gracefully")

        # Assert: Andere Checks sollten trotzdem laufen
        mock_engine.get_metrics.assert_called_once()


# ============================================================================
# TEST RUNNER
# ============================================================================

if __name__ == "__main__":
    import time

    # Run tests with coverage
    pytest.main([
        __file__,
        "-v",
        "--cov=healing_engine",
        "--cov-report=term-missing",
        "--cov-report=html",
        "-W", "ignore::DeprecationWarning"
    ])
