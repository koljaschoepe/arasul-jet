"""
Sparse vector encoder for Qdrant-native BM25 hybrid search.

Generates sparse vectors from text using:
- German stemming (PyStemmer)
- CRC32 hash-based token → integer ID mapping
- Term frequency normalization

These sparse vectors are stored in Qdrant alongside dense embeddings,
enabling server-side RRF (Reciprocal Rank Fusion) hybrid search.
"""

import re
import zlib
import logging
from typing import List, Tuple, Optional

logger = logging.getLogger(__name__)

# Hash space for token IDs (~1M to minimize collisions)
HASH_SPACE = 2**20

try:
    import Stemmer
    _stemmer = Stemmer.Stemmer('german')
    STEMMER_AVAILABLE = True
except ImportError:
    _stemmer = None
    STEMMER_AVAILABLE = False
    logger.warning("PyStemmer not available - sparse vectors without stemming")


def tokenize(text: str) -> List[str]:
    """Tokenize text into lowercase word tokens."""
    return re.findall(r'\b\w+\b', text.lower())


def stem_tokens(tokens: List[str]) -> List[str]:
    """Apply German stemming to tokens."""
    if not _stemmer or not tokens:
        return tokens
    return [_stemmer.stemWord(t) for t in tokens if t.strip()]


def compute_sparse_vector(text: str) -> Tuple[List[int], List[float]]:
    """
    Compute a sparse vector from text for Qdrant BM25 search.

    Uses CRC32 hashing to map stemmed tokens to integer indices.
    Qdrant applies IDF weighting at search time (Modifier.IDF).

    Args:
        text: Input text to encode

    Returns:
        Tuple of (indices, values) for SparseVector.
        Empty lists if text is empty.
    """
    if not text or not text.strip():
        return [], []

    tokens = tokenize(text)
    if not tokens:
        return [], []

    stemmed = stem_tokens(tokens)
    if not stemmed:
        return [], []

    # Count term frequencies with hash-based IDs
    tf = {}
    for token in stemmed:
        token_id = zlib.crc32(token.encode('utf-8')) % HASH_SPACE
        tf[token_id] = tf.get(token_id, 0) + 1

    # Sort by index for consistent ordering
    indices = sorted(tf.keys())
    # Raw term frequencies - Qdrant's IDF modifier handles the rest
    values = [float(tf[idx]) for idx in indices]

    return indices, values
