"""
Embedding service client for Document Indexer.

Handles communication with the embedding HTTP service (BGE-M3)
for generating dense vector representations of text.
"""

import logging
from typing import List, Optional

import requests

from config import EMBEDDING_HOST, EMBEDDING_PORT

logger = logging.getLogger(__name__)


class EmbeddingClient:
    """Client for the embedding HTTP service."""

    def __init__(self, host: str = None, port: int = None):
        self.host = host or EMBEDDING_HOST
        self.port = port or EMBEDDING_PORT
        self.base_url = f"http://{self.host}:{self.port}"

    def check_health(self) -> bool:
        """Verify embedding service is reachable."""
        try:
            resp = requests.get(f"{self.base_url}/health", timeout=5)
            return resp.status_code == 200
        except Exception:
            return False

    def get_embedding(self, text: str) -> Optional[List[float]]:
        """Get embedding vector for a single text."""
        try:
            response = requests.post(
                f"{self.base_url}/embed",
                json={"texts": [text]},
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            return result.get('vectors', [])[0] if result.get('vectors') else None
        except Exception as e:
            logger.error(f"Embedding error: {e}")
            return None

    def get_batch_embeddings(self, texts: List[str]) -> List[Optional[List[float]]]:
        """Get embeddings for multiple texts efficiently."""
        try:
            response = requests.post(
                f"{self.base_url}/embed",
                json={"texts": texts},
                timeout=60
            )
            response.raise_for_status()
            result = response.json()
            return result.get('vectors', [])
        except Exception as e:
            logger.error(f"Batch embedding error: {e}")
            return [None] * len(texts)
