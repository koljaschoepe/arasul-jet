"""
Embedding service client for Document Indexer.

Handles communication with the embedding HTTP service (BGE-M3)
for generating dense vector representations of text.
"""

import logging
import time
from typing import List, Optional

import requests

from config import EMBEDDING_HOST, EMBEDDING_PORT

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2  # seconds


class EmbeddingClient:
    """Client for the embedding HTTP service."""

    def __init__(self, host: str = None, port: int = None):
        self.host = host or EMBEDDING_HOST
        self.port = port or EMBEDDING_PORT
        self.base_url = f"http://{self.host}:{self.port}"

    def _request_with_retry(self, method: str, url: str, **kwargs):
        """Make HTTP request with exponential backoff on transient failures."""
        last_exc = None
        for attempt in range(MAX_RETRIES):
            try:
                response = requests.request(method, url, **kwargs)
                if response.status_code == 503 and attempt < MAX_RETRIES - 1:
                    delay = RETRY_BACKOFF_BASE ** attempt
                    logger.warning(
                        f"Embedding service returned 503, retrying in {delay}s "
                        f"(attempt {attempt + 1}/{MAX_RETRIES})"
                    )
                    time.sleep(delay)
                    continue
                response.raise_for_status()
                return response
            except (requests.ConnectionError, requests.Timeout) as e:
                last_exc = e
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_BACKOFF_BASE ** attempt
                    logger.warning(
                        f"Embedding request failed ({type(e).__name__}), "
                        f"retrying in {delay}s (attempt {attempt + 1}/{MAX_RETRIES})"
                    )
                    time.sleep(delay)
                else:
                    raise
        raise last_exc

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
            response = self._request_with_retry(
                "POST",
                f"{self.base_url}/embed",
                json={"texts": [text]},
                timeout=30
            )
            result = response.json()
            return result.get('vectors', [])[0] if result.get('vectors') else None
        except Exception as e:
            logger.error(f"Embedding error: {e}")
            return None

    def get_batch_embeddings(self, texts: List[str]) -> List[Optional[List[float]]]:
        """Get embeddings for multiple texts efficiently."""
        try:
            response = self._request_with_retry(
                "POST",
                f"{self.base_url}/embed",
                json={"texts": texts},
                timeout=60
            )
            result = response.json()
            return result.get('vectors', [])
        except Exception as e:
            logger.error(f"Batch embedding error: {e}")
            return [None] * len(texts)
