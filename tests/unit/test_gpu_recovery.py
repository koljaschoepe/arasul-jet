"""
Unit Tests für GPU Recovery Module
Testet Error Detection, Recovery Recommendation und Action Execution

Ziel: 80%+ Code Coverage für gpu_recovery.py (408 LOC)
"""

import pytest
import sys
import os
from unittest.mock import Mock, patch, MagicMock, call
from datetime import datetime
import json

# Add service directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__),
                                '../../services/self-healing-agent'))

# Import after path setup
from gpu_recovery import GPURecovery, GPURecoveryAction


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_docker_client():
    """Mock Docker client"""
    client = Mock()
    client.containers = Mock()
    return client


@pytest.fixture
def gpu_recovery(mock_docker_client):
    """GPURecovery instance with mocked dependencies"""
    recovery = GPURecovery(docker_client=mock_docker_client)
    return recovery


@pytest.fixture
def healthy_gpu_stats():
    """Healthy GPU stats"""
    return {
        'available': True,
        'gpu': {
            'utilization': 50.0,
            'memory': {
                'used_mb': 20000,  # 20GB
                'total_mb': 40960,
                'free_mb': 20960
            },
            'temperature': 70.0,
            'health': 'healthy',
            'error': 'none',
            'error_message': None
        }
    }


@pytest.fixture
def oom_gpu_stats():
    """GPU stats indicating out of memory"""
    return {
        'available': True,
        'gpu': {
            'utilization': 95.0,
            'memory': {
                'used_mb': 39000,  # 39GB (critical)
                'total_mb': 40960,
                'free_mb': 1960
            },
            'temperature': 75.0,
            'health': 'critical',
            'error': 'out_of_memory',
            'error_message': 'GPU memory exceeded 38GB critical threshold'
        }
    }


@pytest.fixture
def thermal_gpu_stats():
    """GPU stats indicating thermal throttling"""
    return {
        'available': True,
        'gpu': {
            'utilization': 85.0,
            'memory': {
                'used_mb': 25000,
                'total_mb': 40960,
                'free_mb': 15960
            },
            'temperature': 86.0,  # Critical temp
            'health': 'critical',
            'error': 'thermal_throttling',
            'error_message': 'GPU temperature 86°C exceeds critical threshold'
        }
    }


@pytest.fixture
def gpu_hang_stats():
    """GPU stats indicating GPU hang"""
    return {
        'available': True,
        'gpu': {
            'utilization': 99.0,
            'memory': {
                'used_mb': 30000,
                'total_mb': 40960,
                'free_mb': 10960
            },
            'temperature': 80.0,
            'health': 'warning',
            'error': 'gpu_hang',
            'error_message': 'GPU utilization stuck at 99% for 30+ seconds'
        }
    }


# ============================================================================
# GPU STATS RETRIEVAL
# ============================================================================

class TestGPUStatsRetrieval:
    """Tests für GPU Stats Retrieval"""

    @patch('gpu_recovery.requests.get')
    def test_get_gpu_stats_success(self, mock_get, gpu_recovery, healthy_gpu_stats):
        """Test: get_gpu_stats() erfolgreich"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = healthy_gpu_stats
        mock_get.return_value = mock_response

        result = gpu_recovery.get_gpu_stats()

        assert result is not None
        assert result['utilization'] == 50.0
        assert result['temperature'] == 70.0
        mock_get.assert_called_once()

    @patch('gpu_recovery.requests.get')
    def test_get_gpu_stats_unavailable(self, mock_get, gpu_recovery):
        """Test: get_gpu_stats() gibt None bei unavailable GPU"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {'available': False}
        mock_get.return_value = mock_response

        result = gpu_recovery.get_gpu_stats()

        assert result is None

    @patch('gpu_recovery.requests.get')
    def test_get_gpu_stats_network_error(self, mock_get, gpu_recovery):
        """Test: get_gpu_stats() behandelt Network Errors"""
        mock_get.side_effect = Exception("Connection refused")

        result = gpu_recovery.get_gpu_stats()

        assert result is None

    @patch('gpu_recovery.requests.get')
    def test_get_gpu_stats_caches_last_stats(self, mock_get, gpu_recovery, healthy_gpu_stats):
        """Test: get_gpu_stats() cached letzten erfolgreichen Stats"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = healthy_gpu_stats
        mock_get.return_value = mock_response

        result = gpu_recovery.get_gpu_stats()

        assert gpu_recovery.last_gpu_stats == result
        assert gpu_recovery.last_gpu_stats['utilization'] == 50.0


# ============================================================================
# ERROR DETECTION
# ============================================================================

class TestErrorDetection:
    """Tests für GPU Error Detection"""

    def test_detect_gpu_error_no_error(self, gpu_recovery, healthy_gpu_stats):
        """Test: detect_gpu_error() erkennt keine Errors bei healthy GPU"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=healthy_gpu_stats['gpu']):
            has_error, error_type, error_message = gpu_recovery.detect_gpu_error()

            assert has_error is False
            assert error_type is None

    def test_detect_gpu_error_oom(self, gpu_recovery, oom_gpu_stats):
        """Test: detect_gpu_error() erkennt OOM Error"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=oom_gpu_stats['gpu']):
            has_error, error_type, error_message = gpu_recovery.detect_gpu_error()

            assert has_error is True
            assert error_type == 'out_of_memory'
            assert 'memory' in error_message.lower()

    def test_detect_gpu_error_thermal(self, gpu_recovery, thermal_gpu_stats):
        """Test: detect_gpu_error() erkennt Thermal Error"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=thermal_gpu_stats['gpu']):
            has_error, error_type, error_message = gpu_recovery.detect_gpu_error()

            assert has_error is True
            assert error_type == 'thermal_throttling'
            assert 'temperature' in error_message.lower()

    def test_detect_gpu_error_hang(self, gpu_recovery, gpu_hang_stats):
        """Test: detect_gpu_error() erkennt GPU Hang"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=gpu_hang_stats['gpu']):
            has_error, error_type, error_message = gpu_recovery.detect_gpu_error()

            assert has_error is True
            assert error_type == 'gpu_hang'

    def test_detect_gpu_error_critical_health(self, gpu_recovery):
        """Test: detect_gpu_error() erkennt critical health status"""
        critical_stats = {
            'health': 'critical',
            'error': 'none',
            'utilization': 80.0
        }

        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=critical_stats):
            has_error, error_type, error_message = gpu_recovery.detect_gpu_error()

            assert has_error is True
            assert error_type == 'critical_health'

    def test_detect_gpu_error_stats_unavailable(self, gpu_recovery):
        """Test: detect_gpu_error() behandelt unavailable stats"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=None):
            has_error, error_type, error_message = gpu_recovery.detect_gpu_error()

            assert has_error is False
            assert error_type is None
            assert 'unavailable' in error_message.lower()


# ============================================================================
# MEMORY LIMIT CHECKS
# ============================================================================

class TestMemoryLimitChecks:
    """Tests für GPU Memory Limit Checks"""

    def test_check_memory_limit_normal(self, gpu_recovery):
        """Test: check_memory_limit() bei normaler Memory Usage"""
        stats = {
            'memory': {'used_mb': 20000}  # 20GB
        }

        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=stats):
            exceeded, memory_used = gpu_recovery.check_memory_limit()

            assert exceeded is False
            assert memory_used == 20000

    def test_check_memory_limit_warning(self, gpu_recovery):
        """Test: check_memory_limit() bei Warning Threshold (36GB)"""
        stats = {
            'memory': {'used_mb': 37000}  # 37GB (warning)
        }

        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=stats):
            exceeded, memory_used = gpu_recovery.check_memory_limit()

            # Warning wird geloggt, aber exceeded ist False bis critical
            assert memory_used == 37000

    def test_check_memory_limit_critical(self, gpu_recovery):
        """Test: check_memory_limit() bei Critical Threshold (38GB)"""
        stats = {
            'memory': {'used_mb': 39000}  # 39GB (critical)
        }

        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=stats):
            exceeded, memory_used = gpu_recovery.check_memory_limit()

            assert exceeded is True
            assert memory_used == 39000

    def test_check_memory_limit_max(self, gpu_recovery):
        """Test: check_memory_limit() bei Max Threshold (40GB)"""
        stats = {
            'memory': {'used_mb': 41000}  # 41GB (max exceeded)
        }

        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=stats):
            exceeded, memory_used = gpu_recovery.check_memory_limit()

            assert exceeded is True
            assert memory_used == 41000

    def test_check_memory_limit_no_stats(self, gpu_recovery):
        """Test: check_memory_limit() behandelt fehlende Stats"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=None):
            exceeded, memory_used = gpu_recovery.check_memory_limit()

            assert exceeded is False
            assert memory_used == 0.0


# ============================================================================
# TEMPERATURE CHECKS
# ============================================================================

class TestTemperatureChecks:
    """Tests für GPU Temperature Checks"""

    def test_check_temperature_normal(self, gpu_recovery):
        """Test: check_temperature() bei normaler Temperatur"""
        stats = {'temperature': 70.0}

        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=stats):
            needs_action, temp, severity = gpu_recovery.check_temperature()

            assert needs_action is False
            assert temp == 70.0
            assert severity == "normal"

    def test_check_temperature_warning(self, gpu_recovery):
        """Test: check_temperature() bei Warning (83°C)"""
        stats = {'temperature': 84.0}

        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=stats):
            needs_action, temp, severity = gpu_recovery.check_temperature()

            assert needs_action is True
            assert temp == 84.0
            assert severity == "warning"

    def test_check_temperature_critical(self, gpu_recovery):
        """Test: check_temperature() bei Critical (85°C)"""
        stats = {'temperature': 86.0}

        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=stats):
            needs_action, temp, severity = gpu_recovery.check_temperature()

            assert needs_action is True
            assert temp == 86.0
            assert severity == "critical"

    def test_check_temperature_shutdown(self, gpu_recovery):
        """Test: check_temperature() bei Shutdown (90°C)"""
        stats = {'temperature': 91.0}

        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=stats):
            needs_action, temp, severity = gpu_recovery.check_temperature()

            assert needs_action is True
            assert temp == 91.0
            assert severity == "shutdown"

    def test_check_temperature_no_stats(self, gpu_recovery):
        """Test: check_temperature() behandelt fehlende Stats"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=None):
            needs_action, temp, severity = gpu_recovery.check_temperature()

            assert needs_action is False
            assert temp == 0.0
            assert severity == "unknown"


# ============================================================================
# RECOVERY RECOMMENDATIONS
# ============================================================================

class TestRecoveryRecommendations:
    """Tests für Recovery Action Recommendations"""

    def test_recommend_recovery_action_oom(self, gpu_recovery):
        """Test: OOM Error → Empfehle RESTART_LLM"""
        action = gpu_recovery.recommend_recovery_action('out_of_memory')

        assert action == GPURecoveryAction.RESTART_LLM

    def test_recommend_recovery_action_hang(self, gpu_recovery):
        """Test: GPU Hang → Empfehle RESET_GPU"""
        action = gpu_recovery.recommend_recovery_action('gpu_hang')

        assert action == GPURecoveryAction.RESET_GPU

    def test_recommend_recovery_action_thermal(self, gpu_recovery):
        """Test: Thermal Throttling → Empfehle THROTTLE"""
        action = gpu_recovery.recommend_recovery_action('thermal_throttling')

        assert action == GPURecoveryAction.THROTTLE

    def test_recommend_recovery_action_critical_health(self, gpu_recovery):
        """Test: Critical Health → Empfehle RESTART_LLM"""
        action = gpu_recovery.recommend_recovery_action('critical_health')

        assert action == GPURecoveryAction.RESTART_LLM

    def test_recommend_recovery_action_unknown(self, gpu_recovery):
        """Test: Unknown Error → Empfehle CLEAR_CACHE"""
        action = gpu_recovery.recommend_recovery_action('unknown_error')

        assert action == GPURecoveryAction.CLEAR_CACHE

    def test_recommend_recovery_action_none(self, gpu_recovery):
        """Test: Kein Error → NONE"""
        action = gpu_recovery.recommend_recovery_action(None)

        assert action == GPURecoveryAction.NONE


# ============================================================================
# CACHE CLEAR
# ============================================================================

class TestCacheClear:
    """Tests für LLM Cache Clear"""

    @patch('gpu_recovery.requests.get')
    @patch('gpu_recovery.requests.post')
    def test_clear_llm_cache_success(self, mock_post, mock_get, gpu_recovery):
        """Test: clear_llm_cache() erfolgreich"""
        # Mock get models response
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            'models': [
                {'name': 'qwen2.5:0.5b'},
                {'name': 'llama3:8b'}
            ]
        }

        # Mock unload response
        mock_post.return_value.status_code = 200

        result = gpu_recovery.clear_llm_cache()

        assert result is True
        assert mock_get.call_count == 1
        assert mock_post.call_count == 2  # 2 models unloaded

    @patch('gpu_recovery.requests.get')
    def test_clear_llm_cache_no_models(self, mock_get, gpu_recovery):
        """Test: clear_llm_cache() mit keinen Models"""
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {'models': []}

        result = gpu_recovery.clear_llm_cache()

        assert result is True

    @patch('gpu_recovery.requests.get')
    def test_clear_llm_cache_api_error(self, mock_get, gpu_recovery):
        """Test: clear_llm_cache() behandelt API Error"""
        mock_get.return_value.status_code = 500

        result = gpu_recovery.clear_llm_cache()

        assert result is False


# ============================================================================
# GPU SESSION RESET
# ============================================================================

class TestGPUSessionReset:
    """Tests für GPU Session Reset"""

    @patch('gpu_recovery.subprocess.run')
    def test_reset_gpu_session_success(self, mock_subprocess, gpu_recovery):
        """Test: reset_gpu_session() erfolgreich (CUDA reset)"""
        mock_subprocess.return_value.returncode = 0

        result = gpu_recovery.reset_gpu_session()

        assert result is True
        mock_subprocess.assert_called_once()

    @patch('gpu_recovery.subprocess.run')
    def test_reset_gpu_session_failure(self, mock_subprocess, gpu_recovery):
        """Test: reset_gpu_session() behandelt Fehler"""
        mock_subprocess.return_value.returncode = 1

        result = gpu_recovery.reset_gpu_session()

        assert result is False


# ============================================================================
# GPU THROTTLING
# ============================================================================

class TestGPUThrottling:
    """Tests für GPU Throttling"""

    @patch('gpu_recovery.subprocess.run')
    def test_throttle_gpu_success(self, mock_subprocess, gpu_recovery):
        """Test: throttle_gpu() erfolgreich"""
        mock_subprocess.return_value.returncode = 0

        result = gpu_recovery.throttle_gpu()

        assert result is True
        mock_subprocess.assert_called()
        call_args = str(mock_subprocess.call_args)
        assert 'nvidia-smi' in call_args

    @patch('gpu_recovery.subprocess.run')
    def test_throttle_gpu_failure(self, mock_subprocess, gpu_recovery):
        """Test: throttle_gpu() behandelt Fehler"""
        mock_subprocess.return_value.returncode = 1

        result = gpu_recovery.throttle_gpu()

        assert result is False

    @patch('gpu_recovery.subprocess.run')
    def test_throttle_gpu_jetson_fallback(self, mock_subprocess, gpu_recovery):
        """Test: throttle_gpu() versucht Jetson-spezifisches Throttling"""
        # Simuliere nvidia-smi Fehler
        mock_subprocess.side_effect = [
            Mock(returncode=1),  # nvidia-smi fails
            Mock(returncode=0)   # jetson fallback succeeds
        ]

        result = gpu_recovery.throttle_gpu()

        assert result is True
        assert mock_subprocess.call_count == 2


# ============================================================================
# GPU RESET
# ============================================================================

class TestGPUReset:
    """Tests für GPU Reset"""

    @patch('gpu_recovery.subprocess.run')
    def test_reset_gpu_success(self, mock_subprocess, gpu_recovery):
        """Test: reset_gpu() erfolgreich"""
        mock_subprocess.return_value.returncode = 0

        result = gpu_recovery.reset_gpu()

        assert result is True
        call_args = str(mock_subprocess.call_args)
        assert 'nvidia-smi' in call_args
        assert '--gpu-reset' in call_args

    @patch('gpu_recovery.subprocess.run')
    def test_reset_gpu_failure(self, mock_subprocess, gpu_recovery):
        """Test: reset_gpu() behandelt Fehler"""
        mock_subprocess.return_value.returncode = 1

        result = gpu_recovery.reset_gpu()

        assert result is False


# ============================================================================
# LLM SERVICE OPERATIONS
# ============================================================================

class TestLLMServiceOperations:
    """Tests für LLM Service Restart/Stop"""

    def test_restart_llm_service_success(self, gpu_recovery, mock_docker_client):
        """Test: restart_llm_service() erfolgreich"""
        mock_container = Mock()
        mock_docker_client.containers.get.return_value = mock_container

        result = gpu_recovery.restart_llm_service()

        assert result is True
        mock_docker_client.containers.get.assert_called_with('llm-service')
        mock_container.restart.assert_called_once()

    def test_restart_llm_service_no_docker(self, gpu_recovery):
        """Test: restart_llm_service() ohne Docker Client"""
        gpu_recovery.docker_client = None

        result = gpu_recovery.restart_llm_service()

        assert result is False

    def test_restart_llm_service_error(self, gpu_recovery, mock_docker_client):
        """Test: restart_llm_service() behandelt Docker Fehler"""
        mock_docker_client.containers.get.side_effect = Exception("Container not found")

        result = gpu_recovery.restart_llm_service()

        assert result is False

    def test_stop_llm_service_success(self, gpu_recovery, mock_docker_client):
        """Test: stop_llm_service() erfolgreich"""
        mock_container = Mock()
        mock_docker_client.containers.get.return_value = mock_container

        result = gpu_recovery.stop_llm_service()

        assert result is True
        mock_container.stop.assert_called_once()

    def test_stop_llm_service_no_docker(self, gpu_recovery):
        """Test: stop_llm_service() ohne Docker Client"""
        gpu_recovery.docker_client = None

        result = gpu_recovery.stop_llm_service()

        assert result is False


# ============================================================================
# RECOVERY EXECUTION
# ============================================================================

class TestRecoveryExecution:
    """Tests für Recovery Action Execution"""

    def test_execute_recovery_clear_cache(self, gpu_recovery):
        """Test: execute_recovery() führt CLEAR_CACHE aus"""
        with patch.object(gpu_recovery, 'clear_llm_cache', return_value=True) as mock_clear:
            result = gpu_recovery.execute_recovery(GPURecoveryAction.CLEAR_CACHE)

            assert result is True
            mock_clear.assert_called_once()

    def test_execute_recovery_reset_session(self, gpu_recovery):
        """Test: execute_recovery() führt RESET_SESSION aus"""
        with patch.object(gpu_recovery, 'reset_gpu_session', return_value=True) as mock_reset:
            result = gpu_recovery.execute_recovery(GPURecoveryAction.RESET_SESSION)

            assert result is True
            mock_reset.assert_called_once()

    def test_execute_recovery_throttle(self, gpu_recovery):
        """Test: execute_recovery() führt THROTTLE aus"""
        with patch.object(gpu_recovery, 'throttle_gpu', return_value=True) as mock_throttle:
            result = gpu_recovery.execute_recovery(GPURecoveryAction.THROTTLE)

            assert result is True
            mock_throttle.assert_called_once()

    def test_execute_recovery_reset_gpu(self, gpu_recovery):
        """Test: execute_recovery() führt RESET_GPU aus"""
        with patch.object(gpu_recovery, 'reset_gpu', return_value=True) as mock_reset:
            result = gpu_recovery.execute_recovery(GPURecoveryAction.RESET_GPU)

            assert result is True
            mock_reset.assert_called_once()

    def test_execute_recovery_restart_llm(self, gpu_recovery):
        """Test: execute_recovery() führt RESTART_LLM aus"""
        with patch.object(gpu_recovery, 'restart_llm_service', return_value=True) as mock_restart:
            result = gpu_recovery.execute_recovery(GPURecoveryAction.RESTART_LLM)

            assert result is True
            mock_restart.assert_called_once()

    def test_execute_recovery_stop_llm(self, gpu_recovery):
        """Test: execute_recovery() führt STOP_LLM aus"""
        with patch.object(gpu_recovery, 'stop_llm_service', return_value=True) as mock_stop:
            result = gpu_recovery.execute_recovery(GPURecoveryAction.STOP_LLM)

            assert result is True
            mock_stop.assert_called_once()

    def test_execute_recovery_none(self, gpu_recovery):
        """Test: execute_recovery() macht nichts bei NONE"""
        result = gpu_recovery.execute_recovery(GPURecoveryAction.NONE)

        assert result is True


# ============================================================================
# GPU HEALTH SUMMARY
# ============================================================================

class TestGPUHealthSummary:
    """Tests für GPU Health Summary"""

    def test_get_gpu_health_summary_healthy(self, gpu_recovery, healthy_gpu_stats):
        """Test: get_gpu_health_summary() bei healthy GPU"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=healthy_gpu_stats['gpu']):
            with patch.object(gpu_recovery, 'detect_gpu_error', return_value=(False, None, None)):
                summary = gpu_recovery.get_gpu_health_summary()

                assert summary['status'] == 'healthy'
                assert summary['has_error'] is False
                assert summary['needs_recovery'] is False

    def test_get_gpu_health_summary_error(self, gpu_recovery, oom_gpu_stats):
        """Test: get_gpu_health_summary() bei GPU Error"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=oom_gpu_stats['gpu']):
            with patch.object(gpu_recovery, 'detect_gpu_error', return_value=(True, 'out_of_memory', 'OOM detected')):
                summary = gpu_recovery.get_gpu_health_summary()

                assert summary['status'] != 'healthy'
                assert summary['has_error'] is True
                assert summary['error_type'] == 'out_of_memory'
                assert summary['needs_recovery'] is True

    def test_get_gpu_health_summary_unavailable(self, gpu_recovery):
        """Test: get_gpu_health_summary() bei unavailable GPU"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=None):
            summary = gpu_recovery.get_gpu_health_summary()

            assert summary['status'] == 'unavailable'
            assert summary['stats'] is None


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

class TestIntegration:
    """Integration Tests für komplexe Flows"""

    def test_full_recovery_flow_oom(self, gpu_recovery, oom_gpu_stats):
        """Test: Vollständiger Recovery Flow bei OOM"""
        # Setup
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=oom_gpu_stats['gpu']):
            with patch.object(gpu_recovery, 'restart_llm_service', return_value=True) as mock_restart:
                # 1. Detect Error
                has_error, error_type, error_message = gpu_recovery.detect_gpu_error()
                assert has_error is True
                assert error_type == 'out_of_memory'

                # 2. Recommend Action
                action = gpu_recovery.recommend_recovery_action(error_type)
                assert action == GPURecoveryAction.RESTART_LLM

                # 3. Execute Recovery
                result = gpu_recovery.execute_recovery(action)
                assert result is True
                mock_restart.assert_called_once()

    def test_full_recovery_flow_thermal(self, gpu_recovery, thermal_gpu_stats):
        """Test: Vollständiger Recovery Flow bei Thermal"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=thermal_gpu_stats['gpu']):
            with patch.object(gpu_recovery, 'throttle_gpu', return_value=True) as mock_throttle:
                # Detect → Recommend → Execute
                has_error, error_type, _ = gpu_recovery.detect_gpu_error()
                action = gpu_recovery.recommend_recovery_action(error_type)
                result = gpu_recovery.execute_recovery(action)

                assert has_error is True
                assert action == GPURecoveryAction.THROTTLE
                assert result is True
                mock_throttle.assert_called_once()

    def test_health_summary_includes_recommended_action(self, gpu_recovery, gpu_hang_stats):
        """Test: Health Summary enthält recommended action"""
        with patch.object(gpu_recovery, 'get_gpu_stats', return_value=gpu_hang_stats['gpu']):
            with patch.object(gpu_recovery, 'detect_gpu_error', return_value=(True, 'gpu_hang', 'Hang detected')):
                summary = gpu_recovery.get_gpu_health_summary()

                assert summary['needs_recovery'] is True
                assert summary['recommended_action'] == 'reset_gpu'


# ============================================================================
# TEST RUNNER
# ============================================================================

if __name__ == "__main__":
    # Run tests with coverage
    pytest.main([
        __file__,
        "-v",
        "--cov=gpu_recovery",
        "--cov-report=term-missing",
        "--cov-report=html",
        "-W", "ignore::DeprecationWarning"
    ])
