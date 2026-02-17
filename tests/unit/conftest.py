"""
Conftest for unit tests.

Pre-populates sys.modules with mock modules for dependencies that are only
available inside Docker containers (PyPDF2, psutil, psycopg2, docker,
sentence_transformers, torch, numpy, qdrant_client, minio, etc.).

This allows unit tests to run on the host machine without installing
all service-specific dependencies.
"""

import sys
from types import ModuleType
from unittest.mock import MagicMock


def _create_mock_module(name, attrs=None):
    """Create a mock module and register it in sys.modules."""
    mod = ModuleType(name)
    mod.__dict__.update(attrs or {})
    # Make attribute access return MagicMock for unknown attrs
    mod.__class__ = type(name, (ModuleType,), {
        '__getattr__': lambda self, attr: MagicMock()
    })
    sys.modules[name] = mod
    return mod


# Only mock modules that aren't already installed
_MODULES_TO_MOCK = [
    # Document indexer dependencies
    'PyPDF2',
    'docx',
    'docx.document',
    'docx.table',
    'yaml',
    'magic',
    'pdf2image',
    'PIL',
    'PIL.Image',
    'markdown',
    # Qdrant / Minio
    'qdrant_client',
    'qdrant_client.models',
    'qdrant_client.http',
    'qdrant_client.http.models',
    'minio',
    'minio.error',
    # Self-healing dependencies
    'psycopg2',
    'psycopg2.pool',
    'psycopg2.extras',
    'docker',
    'docker.errors',
    'docker.types',
    'psutil',
    'pynvml',
    # Embedding service dependencies
    'sentence_transformers',
    'torch',
    'torch.cuda',
    'numpy',
    'transformers',
    'einops',
    # Flask (may or may not be installed)
    'flask_cors',
]


for mod_name in _MODULES_TO_MOCK:
    if mod_name not in sys.modules:
        _create_mock_module(mod_name)

# Special setup for psycopg2.pool - needs pool class
if hasattr(sys.modules.get('psycopg2', None), 'pool'):
    pool_mod = sys.modules.get('psycopg2.pool')
    if pool_mod:
        pool_mod.SimpleConnectionPool = MagicMock
        pool_mod.ThreadedConnectionPool = MagicMock

# Special setup for qdrant_client.models - needs model classes
qdrant_models = sys.modules.get('qdrant_client.models')
if qdrant_models:
    qdrant_models.VectorParams = MagicMock
    qdrant_models.Distance = MagicMock()
    qdrant_models.Distance.COSINE = 'Cosine'
    qdrant_models.PointStruct = MagicMock
    qdrant_models.Filter = MagicMock
    qdrant_models.FieldCondition = MagicMock
    qdrant_models.MatchValue = MagicMock

# Special setup for sentence_transformers
st_mod = sys.modules.get('sentence_transformers')
if st_mod:
    mock_model = MagicMock()
    mock_model.encode.return_value = [[0.1] * 768]
    st_mod.SentenceTransformer = MagicMock(return_value=mock_model)

# Special setup for torch
torch_mod = sys.modules.get('torch')
if torch_mod:
    torch_mod.cuda = sys.modules.get('torch.cuda', MagicMock())
    torch_mod.cuda.is_available = MagicMock(return_value=False)
    torch_mod.device = MagicMock

# Special setup for numpy
np_mod = sys.modules.get('numpy')
if np_mod:
    np_mod.array = MagicMock
    np_mod.float32 = 'float32'
