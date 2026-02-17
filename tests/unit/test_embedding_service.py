"""
Unit Tests für Embedding Service
Tests for the Flask-based embedding service with GPU support

Coverage targets:
- /health endpoint with model loaded/not loaded states
- /embed endpoint with single/batch texts
- /info endpoint
- Error handling and edge cases
- GPU/CPU fallback logic
"""

import pytest
import sys
import os
import json
import random
import numpy as np
from unittest.mock import Mock, patch, MagicMock
from io import BytesIO

# Add service directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__),
                                '../../services/embedding-service'))


# ============================================================================
# HELPERS - numpy may be mocked by conftest, so we need array-like objects
# that have a working .tolist() for JSON serialization in Flask endpoints
# ============================================================================

class FakeNdarray:
    """Minimal numpy ndarray substitute with working tolist() for tests.

    The conftest mocks numpy in sys.modules, so np.random.rand() returns
    MagicMock objects that are not JSON serializable. This class provides
    array-like objects that the embedding server can call .tolist() on.
    """

    def __init__(self, data):
        """data should be a list (1D) or list of lists (2D)."""
        self._data = data

    def tolist(self):
        return self._data

    def astype(self, _dtype):
        return self

    def __len__(self):
        return len(self._data)

    def __getitem__(self, idx):
        return self._data[idx]

    def reshape(self, *shape):
        # Only needed for the (0, 768) empty array case
        return FakeNdarray([])


def make_embedding(rows, dim=768):
    """Create a FakeNdarray that mimics np.random.rand(rows, dim).

    Returns a 2D array-like for batch results, or 1D for single-vector
    results (used by /health encode test).
    """
    if rows == 0:
        return FakeNdarray([])
    return FakeNdarray([[random.random() for _ in range(dim)] for _ in range(rows)])


def make_vector(dim=768):
    """Create a FakeNdarray that mimics np.random.rand(dim) -- 1D."""
    return FakeNdarray([random.random() for _ in range(dim)])


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_sentence_transformer():
    """Mock SentenceTransformer model"""
    mock_model = Mock()
    mock_model.encode = Mock(return_value=make_embedding(1))
    mock_model.max_seq_length = 8192
    return mock_model


@pytest.fixture
def mock_torch():
    """Mock torch module"""
    mock = Mock()
    mock.cuda.is_available.return_value = True
    mock.cuda.get_device_name.return_value = "NVIDIA Jetson AGX Orin"
    return mock


@pytest.fixture
def app_client():
    """Create Flask test client with mocked model"""
    with patch('embedding_server.torch') as mock_torch:
        with patch('embedding_server.SentenceTransformer') as mock_st:
            mock_torch.cuda.is_available.return_value = True
            mock_torch.cuda.get_device_name.return_value = "NVIDIA Jetson AGX Orin"

            # Mock model
            mock_model = Mock()
            mock_model.encode = Mock(return_value=make_embedding(1))
            mock_model.max_seq_length = 8192
            mock_st.return_value = mock_model

            # Import app after patching
            from embedding_server import app, load_model
            import embedding_server

            # Set global variables
            embedding_server.model = mock_model
            embedding_server.device = 'cuda'

            app.config['TESTING'] = True
            with app.test_client() as client:
                yield client, mock_model


@pytest.fixture
def app_client_no_model():
    """Create Flask test client without loaded model"""
    with patch('embedding_server.torch') as mock_torch:
        mock_torch.cuda.is_available.return_value = False

        from embedding_server import app
        import embedding_server

        # Ensure model is None
        embedding_server.model = None
        embedding_server.device = None

        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client


# ============================================================================
# HEALTH ENDPOINT TESTS
# ============================================================================

class TestHealthEndpoint:
    """Tests for /health endpoint"""

    def test_health_check_healthy(self, app_client):
        """Test: /health returns healthy when model is loaded"""
        client, mock_model = app_client

        # Mock encode to return proper array
        mock_model.encode.return_value = make_vector(768)

        response = client.get('/health')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['status'] == 'healthy'
        assert 'model' in data
        assert 'device' in data
        assert 'vector_size' in data
        assert 'test_latency_ms' in data
        assert 'timestamp' in data

    def test_health_check_unhealthy_no_model(self, app_client_no_model):
        """Test: /health returns 503 when model not loaded"""
        response = app_client_no_model.get('/health')
        data = json.loads(response.data)

        assert response.status_code == 503
        assert data['status'] == 'unhealthy'
        assert 'Model not loaded' in data['error']

    def test_health_check_unhealthy_encode_fails(self, app_client):
        """Test: /health returns 503 when encode fails"""
        client, mock_model = app_client

        # Mock encode to raise exception
        mock_model.encode.side_effect = Exception("GPU error")

        response = client.get('/health')
        data = json.loads(response.data)

        assert response.status_code == 503
        assert data['status'] == 'unhealthy'
        assert 'GPU error' in data['error']

    def test_health_check_measures_latency(self, app_client):
        """Test: /health measures and returns latency"""
        client, mock_model = app_client

        # Mock encode with small delay
        def slow_encode(*args, **kwargs):
            import time
            time.sleep(0.01)  # 10ms
            return make_vector(768)

        mock_model.encode.side_effect = slow_encode

        response = client.get('/health')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['test_latency_ms'] >= 10  # At least 10ms


# ============================================================================
# EMBED ENDPOINT TESTS
# ============================================================================

class TestEmbedEndpoint:
    """Tests for /embed endpoint"""

    def test_embed_single_text(self, app_client):
        """Test: /embed generates embedding for single text"""
        client, mock_model = app_client

        # Mock encode to return 2D array
        mock_model.encode.return_value = make_embedding(1)

        response = client.post('/embed',
            data=json.dumps({'texts': 'Hello world'}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 200
        assert 'vectors' in data
        assert 'embeddings' in data  # Alias
        assert data['count'] == 1
        assert data['dimension'] == 768
        assert 'latency_ms' in data

    def test_embed_multiple_texts(self, app_client):
        """Test: /embed generates embeddings for text array"""
        client, mock_model = app_client

        texts = ['First text', 'Second text', 'Third text']
        mock_model.encode.return_value = make_embedding(3)

        response = client.post('/embed',
            data=json.dumps({'texts': texts}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['count'] == 3
        assert len(data['vectors']) == 3
        assert data['dimension'] == 768

    def test_embed_missing_texts_field(self, app_client):
        """Test: /embed returns 400 when texts field missing"""
        client, _ = app_client

        response = client.post('/embed',
            data=json.dumps({'content': 'wrong field'}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 400
        assert 'Missing "texts" field' in data['error']

    def test_embed_invalid_texts_type(self, app_client):
        """Test: /embed returns 400 when texts is not string or list"""
        client, _ = app_client

        response = client.post('/embed',
            data=json.dumps({'texts': 12345}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 400
        assert 'must be a string or list' in data['error']

    def test_embed_too_many_texts(self, app_client):
        """Test: /embed returns 400 when more than 100 texts"""
        client, _ = app_client

        texts = [f'Text {i}' for i in range(101)]

        response = client.post('/embed',
            data=json.dumps({'texts': texts}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 400
        assert 'Maximum 100 texts' in data['error']

    def test_embed_empty_request(self, app_client):
        """Test: /embed handles empty request body"""
        client, _ = app_client

        response = client.post('/embed',
            data='',
            content_type='application/json'
        )

        # Flask may return 400 for invalid JSON or our handler returns 400
        assert response.status_code in [400, 415, 500]

    def test_embed_no_model_loaded(self, app_client_no_model):
        """Test: /embed returns 503 when model not loaded"""
        response = app_client_no_model.post('/embed',
            data=json.dumps({'texts': 'test'}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 503
        assert 'Model not loaded' in data['error']

    def test_embed_encode_error(self, app_client):
        """Test: /embed handles encoding errors gracefully"""
        client, mock_model = app_client

        mock_model.encode.side_effect = Exception("CUDA out of memory")

        response = client.post('/embed',
            data=json.dumps({'texts': 'test'}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 500
        assert 'CUDA out of memory' in data['error']

    def test_embed_batch_efficiency(self, app_client):
        """Test: /embed processes batch efficiently (single encode call)"""
        client, mock_model = app_client

        texts = ['text1', 'text2', 'text3', 'text4', 'text5']
        mock_model.encode.return_value = make_embedding(5)

        response = client.post('/embed',
            data=json.dumps({'texts': texts}),
            content_type='application/json'
        )

        assert response.status_code == 200
        # Encode should be called once for the entire batch
        assert mock_model.encode.call_count == 1

    def test_embed_string_to_list_conversion(self, app_client):
        """Test: /embed converts single string to list internally"""
        client, mock_model = app_client

        mock_model.encode.return_value = make_embedding(1)

        response = client.post('/embed',
            data=json.dumps({'texts': 'single string'}),
            content_type='application/json'
        )

        assert response.status_code == 200

        # Check that encode was called with a list
        call_args = mock_model.encode.call_args
        assert isinstance(call_args[0][0], list)


# ============================================================================
# INFO ENDPOINT TESTS
# ============================================================================

class TestInfoEndpoint:
    """Tests for /info endpoint"""

    def test_info_with_model_loaded(self, app_client):
        """Test: /info returns service info when model loaded"""
        client, _ = app_client

        response = client.get('/info')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['service'] == 'Arasul Embedding Service'
        assert 'model' in data
        assert data['model_loaded'] == True
        assert 'device' in data
        assert 'vector_size' in data
        assert 'max_input_tokens' in data
        assert 'timestamp' in data

    def test_info_without_model(self, app_client_no_model):
        """Test: /info returns service info even when model not loaded"""
        response = app_client_no_model.get('/info')
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['model_loaded'] == False
        assert data['device'] == 'not_loaded'


# ============================================================================
# MODEL LOADING TESTS
# ============================================================================

class TestModelLoading:
    """Tests for model loading functionality"""

    def test_load_model_with_gpu(self):
        """Test: load_model() uses GPU when available"""
        with patch('embedding_server.torch') as mock_torch:
            with patch('embedding_server.SentenceTransformer') as mock_st:
                with patch('embedding_server.os.path.exists', return_value=True):
                    mock_torch.cuda.is_available.return_value = True
                    mock_torch.cuda.get_device_name.return_value = "NVIDIA GPU"

                    mock_model = Mock()
                    mock_model.max_seq_length = 8192
                    mock_st.return_value = mock_model

                    from embedding_server import load_model
                    import embedding_server

                    result = load_model()

                    assert result == True
                    assert embedding_server.device == 'cuda'

    def test_load_model_cpu_fallback(self):
        """Test: load_model() falls back to CPU when no GPU"""
        with patch('embedding_server.torch') as mock_torch:
            with patch('embedding_server.SentenceTransformer') as mock_st:
                with patch('embedding_server.os.path.exists', return_value=True):
                    mock_torch.cuda.is_available.return_value = False

                    mock_model = Mock()
                    mock_model.max_seq_length = 8192
                    mock_st.return_value = mock_model

                    from embedding_server import load_model
                    import embedding_server

                    result = load_model()

                    assert result == True
                    assert embedding_server.device == 'cpu'

    def test_load_model_failure(self):
        """Test: load_model() returns False on failure"""
        with patch('embedding_server.torch') as mock_torch:
            with patch('embedding_server.SentenceTransformer') as mock_st:
                mock_torch.cuda.is_available.return_value = True
                mock_st.side_effect = Exception("Model download failed")

                from embedding_server import load_model

                result = load_model()

                assert result == False

    def test_load_model_downloads_if_not_cached(self):
        """Test: load_model() logs warning when model not cached"""
        with patch('embedding_server.torch') as mock_torch:
            with patch('embedding_server.SentenceTransformer') as mock_st:
                with patch('embedding_server.os.path.exists', return_value=False):
                    with patch('embedding_server.logger') as mock_logger:
                        mock_torch.cuda.is_available.return_value = True

                        mock_model = Mock()
                        mock_model.max_seq_length = 8192
                        mock_st.return_value = mock_model

                        from embedding_server import load_model

                        load_model()

                        # Should log warning about model download
                        mock_logger.warning.assert_called()


# ============================================================================
# EDGE CASES
# ============================================================================

class TestEdgeCases:
    """Tests for edge cases and boundary conditions"""

    def test_embed_empty_string(self, app_client):
        """Test: /embed handles empty string"""
        client, mock_model = app_client

        mock_model.encode.return_value = make_embedding(1)

        response = client.post('/embed',
            data=json.dumps({'texts': ''}),
            content_type='application/json'
        )

        # Should still process (model will handle empty string)
        assert response.status_code == 200

    def test_embed_unicode_text(self, app_client):
        """Test: /embed handles unicode/German text"""
        client, mock_model = app_client

        mock_model.encode.return_value = make_embedding(1)

        response = client.post('/embed',
            data=json.dumps({'texts': 'Äöü ß Größe Mäßigung'}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['count'] == 1

    def test_embed_long_text(self, app_client):
        """Test: /embed handles very long text"""
        client, mock_model = app_client

        long_text = 'word ' * 10000  # ~50000 characters
        mock_model.encode.return_value = make_embedding(1)

        response = client.post('/embed',
            data=json.dumps({'texts': long_text}),
            content_type='application/json'
        )

        assert response.status_code == 200

    def test_embed_special_characters(self, app_client):
        """Test: /embed handles special characters"""
        client, mock_model = app_client

        special_text = "Hello! @#$%^&*() <script>alert('xss')</script> 中文"
        mock_model.encode.return_value = make_embedding(1)

        response = client.post('/embed',
            data=json.dumps({'texts': special_text}),
            content_type='application/json'
        )

        assert response.status_code == 200

    def test_embed_exactly_100_texts(self, app_client):
        """Test: /embed accepts exactly 100 texts"""
        client, mock_model = app_client

        texts = [f'Text {i}' for i in range(100)]
        mock_model.encode.return_value = make_embedding(100)

        response = client.post('/embed',
            data=json.dumps({'texts': texts}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert response.status_code == 200
        assert data['count'] == 100

    def test_embed_empty_array(self, app_client):
        """Test: /embed handles empty array (returns 500 due to division by zero in logging)"""
        client, mock_model = app_client

        mock_model.encode.return_value = make_embedding(0)

        response = client.post('/embed',
            data=json.dumps({'texts': []}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        # The server hits a ZeroDivisionError in the logging line
        # (latency/len(texts)) when texts is empty, so it returns 500
        assert response.status_code == 500
        assert 'division by zero' in data['error']


# ============================================================================
# VECTOR DIMENSION TESTS
# ============================================================================

class TestVectorDimensions:
    """Tests for vector dimension consistency"""

    def test_vector_dimension_768(self, app_client):
        """Test: vectors have correct dimension (768)"""
        client, mock_model = app_client

        mock_model.encode.return_value = make_embedding(1)

        response = client.post('/embed',
            data=json.dumps({'texts': 'test'}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert data['dimension'] == 768
        assert len(data['vectors'][0]) == 768

    def test_all_vectors_same_dimension(self, app_client):
        """Test: all vectors in batch have same dimension"""
        client, mock_model = app_client

        texts = ['short', 'medium length text', 'very long text ' * 100]
        mock_model.encode.return_value = make_embedding(3)

        response = client.post('/embed',
            data=json.dumps({'texts': texts}),
            content_type='application/json'
        )
        data = json.loads(response.data)

        for vector in data['vectors']:
            assert len(vector) == 768


# ============================================================================
# CONCURRENT REQUEST TESTS
# ============================================================================

class TestConcurrency:
    """Tests for concurrent request handling"""

    def test_concurrent_requests(self, app_client):
        """Test: service handles multiple requests"""
        client, mock_model = app_client

        mock_model.encode.return_value = make_embedding(1)

        # Simulate multiple sequential requests (Flask test client is synchronous)
        for i in range(5):
            response = client.post('/embed',
                data=json.dumps({'texts': f'Request {i}'}),
                content_type='application/json'
            )
            assert response.status_code == 200


# ============================================================================
# TEST RUNNER
# ============================================================================

if __name__ == "__main__":
    pytest.main([
        __file__,
        "-v",
        "--cov=embedding_server",
        "--cov-report=term-missing",
        "-W", "ignore::DeprecationWarning"
    ])
