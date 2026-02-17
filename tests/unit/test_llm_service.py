"""
Unit Tests für LLM Service Management API
Tests for the Flask-based LLM management API with GPU support

Coverage targets:
- /health endpoint with various Ollama states
- /api/models endpoint with caching
- /api/models/pull endpoint with validation
- /api/models/delete endpoint
- /api/cache/clear endpoint for self-healing
- /api/session/reset endpoint for self-healing
- /api/stats endpoint with Jetson handling
- /api/models/loaded endpoint
- /api/info endpoint
"""

import pytest
import sys
import os
import json
import time
from unittest.mock import Mock, patch, MagicMock
from io import BytesIO

# Add service directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__),
                                '../../services/llm-service'))


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_ollama_healthy():
    """Mock healthy Ollama API responses"""
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "models": [
            {"name": "llama3.1:8b", "size": 4700000000, "modified_at": "2024-01-24"},
            {"name": "mistral:7b", "size": 4100000000, "modified_at": "2024-01-23"}
        ]
    }
    return mock_response


@pytest.fixture
def mock_ollama_ps():
    """Mock Ollama /api/ps response"""
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "models": [
            {"name": "llama3.1:8b", "size_vram": 5000000000, "expires_at": "2024-01-24T12:00:00Z"}
        ]
    }
    return mock_response


@pytest.fixture
def app_client():
    """Create Flask test client with mocked dependencies"""
    import requests as real_requests
    import subprocess as real_subprocess
    with patch('api_server.requests') as mock_requests:
        with patch('api_server.subprocess') as mock_subprocess:
            with patch('api_server.psutil') as mock_psutil:
                # Mock CPU thread
                with patch('api_server._cpu_percent', 25.5):
                    # Preserve real exception classes so except clauses work
                    mock_requests.exceptions = real_requests.exceptions
                    mock_subprocess.CalledProcessError = real_subprocess.CalledProcessError
                    mock_subprocess.TimeoutExpired = real_subprocess.TimeoutExpired

                    # Mock Ollama tags endpoint
                    mock_tags_response = Mock()
                    mock_tags_response.status_code = 200
                    mock_tags_response.json.return_value = {"models": []}

                    mock_requests.get.return_value = mock_tags_response

                    from api_server import app
                    import api_server

                    # Reset model cache
                    api_server._model_cache = None
                    api_server._model_cache_time = 0

                    app.config['TESTING'] = True
                    with app.test_client() as client:
                        yield client, mock_requests, mock_subprocess, mock_psutil


# ============================================================================
# HEALTH ENDPOINT TESTS
# ============================================================================

class TestHealthEndpoint:
    """Tests for /health endpoint"""

    def test_health_check_healthy(self, app_client):
        """Test: /health returns healthy when Ollama responds"""
        client, mock_requests, _, _ = app_client

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "models": [{"name": "llama3.1:8b"}]
        }
        mock_requests.get.return_value = mock_response

        response = client.get('/health')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['status'] == 'healthy'
        assert 'models_count' in data
        assert data['models_count'] == 1

    def test_health_check_unhealthy_ollama_down(self, app_client):
        """Test: /health returns 503 when Ollama not responding"""
        client, mock_requests, _, _ = app_client

        mock_requests.get.side_effect = Exception("Connection refused")

        response = client.get('/health')
        data = json.loads(response.data)

        assert response.status_code == 503
        assert data['status'] == 'unhealthy'
        assert 'Connection refused' in data['reason']

    def test_health_check_unhealthy_bad_status(self, app_client):
        """Test: /health returns 503 when Ollama returns error"""
        client, mock_requests, _, _ = app_client

        mock_response = Mock()
        mock_response.status_code = 500
        mock_requests.get.return_value = mock_response

        response = client.get('/health')
        data = json.loads(response.data)

        assert response.status_code == 503
        assert data['status'] == 'unhealthy'

    def test_health_returns_model_list(self, app_client):
        """Test: /health includes list of available models"""
        client, mock_requests, _, _ = app_client

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "models": [
                {"name": "llama3.1:8b"},
                {"name": "mistral:7b"}
            ]
        }
        mock_requests.get.return_value = mock_response

        response = client.get('/health')
        data = json.loads(response.data)

        assert 'models' in data
        assert 'llama3.1:8b' in data['models']
        assert 'mistral:7b' in data['models']


# ============================================================================
# LIST MODELS ENDPOINT TESTS
# ============================================================================

class TestListModelsEndpoint:
    """Tests for /api/models endpoint"""

    def test_list_models_success(self, app_client):
        """Test: /api/models returns model list"""
        client, mock_requests, _, _ = app_client

        # Need to patch _http_session.get directly
        with patch('api_server._http_session') as mock_session:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "models": [
                    {"name": "llama3.1:8b", "size": 4700000000, "modified_at": "2024-01-24", "digest": "abc123"}
                ]
            }
            mock_session.get.return_value = mock_response

            response = client.get('/api/models')
            data = json.loads(response.data)

            assert response.status_code == 200
            assert 'models' in data
            assert data['count'] == 1
            assert data['models'][0]['name'] == 'llama3.1:8b'

    def test_list_models_caching(self, app_client):
        """Test: /api/models uses cache on repeated calls"""
        client, mock_requests, _, _ = app_client

        import api_server

        with patch('api_server._http_session') as mock_session:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"models": [{"name": "test:1b"}]}
            mock_session.get.return_value = mock_response

            # First call - should fetch
            client.get('/api/models')

            # Second call - should use cache
            response = client.get('/api/models')

            # Should only have called once (cache hit on second)
            assert mock_session.get.call_count == 1

    def test_list_models_empty(self, app_client):
        """Test: /api/models handles no models"""
        client, mock_requests, _, _ = app_client

        with patch('api_server._http_session') as mock_session:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"models": []}
            mock_session.get.return_value = mock_response

            response = client.get('/api/models')
            data = json.loads(response.data)

            assert response.status_code == 200
            assert data['count'] == 0
            assert data['models'] == []

    def test_list_models_error(self, app_client):
        """Test: /api/models handles Ollama error"""
        client, mock_requests, _, _ = app_client

        with patch('api_server._http_session') as mock_session:
            mock_session.get.side_effect = Exception("Connection refused")

            response = client.get('/api/models')
            data = json.loads(response.data)

            assert response.status_code == 500
            assert 'error' in data


# ============================================================================
# PULL MODEL ENDPOINT TESTS
# ============================================================================

class TestPullModelEndpoint:
    """Tests for /api/models/pull endpoint"""

    def test_pull_model_success(self, app_client):
        """Test: /api/models/pull downloads model"""
        client, mock_requests, _, _ = app_client

        with patch('api_server._http_session') as mock_session:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_session.post.return_value = mock_response

            response = client.post('/api/models/pull',
                data=json.dumps({'model': 'llama3.1:8b'}),
                content_type='application/json'
            )
            data = json.loads(response.data)

            assert response.status_code == 200
            assert data['status'] == 'success'

    def test_pull_model_missing_name(self, app_client):
        """Test: /api/models/pull returns 400 when model name missing"""
        client, _, _, _ = app_client

        response = client.post('/api/models/pull',
            data=json.dumps({}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 400
        assert 'model parameter required' in data['error']

    def test_pull_model_name_too_long(self, app_client):
        """Test: /api/models/pull rejects name > 255 chars"""
        client, _, _, _ = app_client

        long_name = 'a' * 300
        response = client.post('/api/models/pull',
            data=json.dumps({'model': long_name}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 400
        assert 'too long' in data['error']

    def test_pull_model_invalid_format(self, app_client):
        """Test: /api/models/pull rejects invalid model name format"""
        client, _, _, _ = app_client

        response = client.post('/api/models/pull',
            data=json.dumps({'model': 'model; rm -rf /'}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 400
        assert 'Invalid model name format' in data['error']

    def test_pull_model_ollama_error(self, app_client):
        """Test: /api/models/pull handles Ollama error"""
        client, mock_requests, _, _ = app_client

        with patch('api_server._http_session') as mock_session:
            mock_response = Mock()
            mock_response.status_code = 500
            mock_response.text = "Model not found"
            mock_session.post.return_value = mock_response

            response = client.post('/api/models/pull',
                data=json.dumps({'model': 'invalid:model'}),
                content_type='application/json'
            )
            data = json.loads(response.data)

            assert response.status_code == 500
            assert data['status'] == 'error'


# ============================================================================
# DELETE MODEL ENDPOINT TESTS
# ============================================================================

class TestDeleteModelEndpoint:
    """Tests for /api/models/delete endpoint"""

    def test_delete_model_success(self, app_client):
        """Test: /api/models/delete removes model"""
        client, mock_requests, _, _ = app_client

        mock_response = Mock()
        mock_response.status_code = 200
        mock_requests.delete.return_value = mock_response

        response = client.delete('/api/models/delete',
            data=json.dumps({'model': 'llama3.1:8b'}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['status'] == 'success'

    def test_delete_model_missing_name(self, app_client):
        """Test: /api/models/delete returns 400 when model name missing"""
        client, _, _, _ = app_client

        response = client.delete('/api/models/delete',
            data=json.dumps({}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 400
        assert 'model parameter required' in data['error']

    def test_delete_model_not_found(self, app_client):
        """Test: /api/models/delete handles non-existent model"""
        client, mock_requests, _, _ = app_client

        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.text = "Model not found"
        mock_requests.delete.return_value = mock_response

        response = client.delete('/api/models/delete',
            data=json.dumps({'model': 'nonexistent:model'}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 500
        assert data['status'] == 'error'


# ============================================================================
# CACHE CLEAR ENDPOINT TESTS
# ============================================================================

class TestCacheClearEndpoint:
    """Tests for /api/cache/clear endpoint"""

    def test_cache_clear_success(self, app_client):
        """Test: /api/cache/clear unloads models"""
        client, mock_requests, _, _ = app_client

        # Mock /api/ps response with loaded models
        mock_ps_response = Mock()
        mock_ps_response.status_code = 200
        mock_ps_response.json.return_value = {
            "models": [{"name": "llama3.1:8b"}]
        }

        # Mock generate response for unloading
        mock_generate_response = Mock()
        mock_generate_response.status_code = 200

        mock_requests.get.return_value = mock_ps_response
        mock_requests.post.return_value = mock_generate_response

        response = client.post('/api/cache/clear')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['status'] == 'success'
        assert 'unloaded_models' in data

    def test_cache_clear_no_models_loaded(self, app_client):
        """Test: /api/cache/clear handles no loaded models"""
        client, mock_requests, _, _ = app_client

        mock_ps_response = Mock()
        mock_ps_response.status_code = 200
        mock_ps_response.json.return_value = {"models": []}

        mock_requests.get.return_value = mock_ps_response

        response = client.post('/api/cache/clear')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert 'already clear' in data['message']

    def test_cache_clear_partial_failure(self, app_client):
        """Test: /api/cache/clear continues on individual model failure"""
        client, mock_requests, _, _ = app_client

        mock_ps_response = Mock()
        mock_ps_response.status_code = 200
        mock_ps_response.json.return_value = {
            "models": [
                {"name": "model1"},
                {"name": "model2"}
            ]
        }
        mock_requests.get.return_value = mock_ps_response

        # First unload fails, second succeeds
        call_count = [0]
        def post_side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise Exception("First model error")
            mock_response = Mock()
            mock_response.status_code = 200
            return mock_response

        mock_requests.post.side_effect = post_side_effect

        response = client.post('/api/cache/clear')
        data = json.loads(response.data)

        # Should still succeed with partial unload
        assert response.status_code == 200


# ============================================================================
# SESSION RESET ENDPOINT TESTS
# ============================================================================

class TestSessionResetEndpoint:
    """Tests for /api/session/reset endpoint"""

    def test_session_reset_success(self, app_client):
        """Test: /api/session/reset reloads default model"""
        client, mock_requests, _, _ = app_client

        mock_ps_response = Mock()
        mock_ps_response.status_code = 200
        mock_ps_response.json.return_value = {"models": []}
        mock_requests.get.return_value = mock_ps_response

        mock_generate_response = Mock()
        mock_generate_response.status_code = 200
        mock_requests.post.return_value = mock_generate_response

        response = client.post('/api/session/reset')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['status'] == 'success'

    def test_session_reset_reload_fails(self, app_client):
        """Test: /api/session/reset handles reload failure"""
        client, mock_requests, _, _ = app_client

        mock_ps_response = Mock()
        mock_ps_response.status_code = 200
        mock_ps_response.json.return_value = {"models": []}
        mock_requests.get.return_value = mock_ps_response

        mock_generate_response = Mock()
        mock_generate_response.status_code = 500
        mock_generate_response.text = "Model load failed"
        mock_requests.post.return_value = mock_generate_response

        response = client.post('/api/session/reset')
        data = json.loads(response.data)

        assert response.status_code == 500
        assert data['status'] == 'error'


# ============================================================================
# STATS ENDPOINT TESTS
# ============================================================================

class TestStatsEndpoint:
    """Tests for /api/stats endpoint"""

    def test_stats_success(self, app_client):
        """Test: /api/stats returns system stats"""
        client, mock_requests, mock_subprocess, mock_psutil = app_client

        # Mock nvidia-smi output
        mock_result = Mock()
        mock_result.stdout = "50, 4000, 8000, 65"
        mock_result.returncode = 0
        mock_subprocess.run.return_value = mock_result

        # Mock psutil
        mock_process = Mock()
        mock_mem_info = Mock()
        mock_mem_info.rss = 500 * 1024 * 1024  # 500MB
        mock_process.memory_info.return_value = mock_mem_info
        mock_psutil.Process.return_value = mock_process

        response = client.get('/api/stats')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert 'gpu_utilization' in data
        assert 'gpu_memory' in data
        assert 'cpu_percent' in data
        assert 'process_memory_mb' in data
        assert 'timestamp' in data

    def test_stats_jetson_gpu(self, app_client):
        """Test: /api/stats handles Jetson [N/A] values"""
        client, mock_requests, mock_subprocess, mock_psutil = app_client

        # Mock Jetson nvidia-smi output with [N/A] values
        mock_result = Mock()
        mock_result.stdout = "[N/A], [N/A], [N/A], [N/A]"
        mock_result.returncode = 0
        mock_subprocess.run.return_value = mock_result

        mock_process = Mock()
        mock_mem_info = Mock()
        mock_mem_info.rss = 500 * 1024 * 1024
        mock_process.memory_info.return_value = mock_mem_info
        mock_psutil.Process.return_value = mock_process

        response = client.get('/api/stats')
        data = json.loads(response.data)

        assert response.status_code == 200
        # Should show Jetson-specific values
        assert 'Integrated' in data['gpu_utilization'] or 'Jetson' in str(data)

    def test_stats_nvidia_smi_failure(self, app_client):
        """Test: /api/stats handles nvidia-smi failure"""
        client, mock_requests, mock_subprocess, mock_psutil = app_client

        import subprocess
        mock_subprocess.run.side_effect = subprocess.CalledProcessError(1, "nvidia-smi")

        mock_process = Mock()
        mock_mem_info = Mock()
        mock_mem_info.rss = 500 * 1024 * 1024
        mock_process.memory_info.return_value = mock_mem_info
        mock_psutil.Process.return_value = mock_process

        response = client.get('/api/stats')
        data = json.loads(response.data)

        # Should still return stats with N/A for GPU
        assert response.status_code == 200
        assert data['gpu_utilization'] == 'N/A'


# ============================================================================
# LOADED MODELS ENDPOINT TESTS
# ============================================================================

class TestLoadedModelsEndpoint:
    """Tests for /api/models/loaded endpoint"""

    def test_loaded_models_success(self, app_client):
        """Test: /api/models/loaded returns loaded models"""
        client, mock_requests, _, _ = app_client

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "models": [
                {"name": "llama3.1:8b", "size_vram": 5000000000, "expires_at": "2024-01-24T12:00:00Z"}
            ]
        }
        mock_requests.get.return_value = mock_response

        response = client.get('/api/models/loaded')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['count'] == 1
        assert data['loaded_models'][0]['name'] == 'llama3.1:8b'

    def test_loaded_models_empty(self, app_client):
        """Test: /api/models/loaded handles no loaded models"""
        client, mock_requests, _, _ = app_client

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"models": []}
        mock_requests.get.return_value = mock_response

        response = client.get('/api/models/loaded')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['count'] == 0

    def test_loaded_models_timeout(self, app_client):
        """Test: /api/models/loaded handles timeout"""
        client, mock_requests, _, _ = app_client

        import requests
        mock_requests.get.side_effect = requests.exceptions.Timeout("Timeout")

        response = client.get('/api/models/loaded')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['count'] == 0
        assert 'Timeout' in data.get('error', '')


# ============================================================================
# INFO ENDPOINT TESTS
# ============================================================================

class TestInfoEndpoint:
    """Tests for /api/info endpoint"""

    def test_info_returns_metadata(self, app_client):
        """Test: /api/info returns service metadata"""
        client, _, _, _ = app_client

        response = client.get('/api/info')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['service'] == 'llm-service'
        assert 'version' in data
        assert data['api_port'] == 11436


# ============================================================================
# RETRY SESSION TESTS
# ============================================================================

class TestRetrySession:
    """Tests for HTTP retry logic"""

    def test_create_retry_session(self):
        """Test: create_retry_session creates session with retry adapter"""
        from api_server import create_retry_session

        session = create_retry_session(retries=5, backoff_factor=1.0)

        assert session is not None
        # Session should have mounted adapters
        assert 'http://' in session.adapters
        assert 'https://' in session.adapters


# ============================================================================
# EDGE CASES
# ============================================================================

class TestEdgeCases:
    """Tests for edge cases and boundary conditions"""

    def test_pull_model_valid_formats(self, app_client):
        """Test: /api/models/pull accepts valid model name formats"""
        client, _, _, _ = app_client

        valid_names = [
            'llama3.1:8b',
            'mistral:7b-instruct',
            'codellama:34b-python',
            'qwen:0.5b',
            'namespace/model:tag'
        ]

        for name in valid_names:
            with patch('api_server._http_session') as mock_session:
                mock_response = Mock()
                mock_response.status_code = 200
                mock_session.post.return_value = mock_response

                response = client.post('/api/models/pull',
                    data=json.dumps({'model': name}),
                    content_type='application/json'
                )

                assert response.status_code == 200, f"Failed for model name: {name}"

    def test_empty_request_body(self, app_client):
        """Test: endpoints handle empty request body"""
        client, _, _, _ = app_client

        response = client.post('/api/models/pull',
            data='',
            content_type='application/json'
        )

        # Should return 400 or 500, not crash
        assert response.status_code in [400, 415, 500]


# ============================================================================
# TEST RUNNER
# ============================================================================

if __name__ == "__main__":
    pytest.main([
        __file__,
        "-v",
        "--cov=api_server",
        "--cov-report=term-missing",
        "-W", "ignore::DeprecationWarning"
    ])
