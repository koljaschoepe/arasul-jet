"""
BM25 Index with German stemming for keyword search.
Replaces PostgreSQL full-text search for better German language support.

Uses bm25s library with PyStemmer for German stemming.
Persists index to disk for fast startup.
"""

import os
import logging
import json
import threading
from typing import List, Dict, Tuple, Optional

logger = logging.getLogger(__name__)

BM25_INDEX_PATH = os.getenv('BM25_INDEX_PATH', '/data/bm25_index')

try:
    import bm25s
    import Stemmer
    BM25S_AVAILABLE = True
    logger.info("bm25s loaded for BM25 search")
except ImportError:
    BM25S_AVAILABLE = False
    logger.warning("bm25s not available - BM25 search disabled")


class BM25Index:
    """BM25 index with German stemming and disk persistence"""

    def __init__(self, index_path: str = BM25_INDEX_PATH):
        self.index_path = index_path
        self._index = None
        self._chunk_ids = []  # Maps internal index -> chunk_id
        self._lock = threading.Lock()

        if BM25S_AVAILABLE:
            self._stemmer = Stemmer.Stemmer('german')
        else:
            self._stemmer = None

        # Try to load existing index from disk
        self._load_from_disk()

    def _stem_tokens(self, tokens_list: List[List[str]]) -> List[List[str]]:
        """Apply German stemming to tokenized text"""
        if not self._stemmer:
            return tokens_list
        result = []
        for tokens in tokens_list:
            stemmed = [self._stemmer.stemWord(t.lower()) for t in tokens if t.strip()]
            result.append(stemmed)
        return result

    def _tokenize(self, texts: List[str]) -> List[List[str]]:
        """Tokenize texts into word lists"""
        import re
        result = []
        for text in texts:
            # Simple whitespace + punctuation tokenization
            tokens = re.findall(r'\b\w+\b', text.lower())
            result.append(tokens)
        return result

    def build_full_index(self, chunks: List[Dict]) -> int:
        """
        Build complete BM25 index from all chunks.

        Args:
            chunks: List of dicts with 'id' and 'text' keys

        Returns:
            Number of indexed chunks
        """
        if not BM25S_AVAILABLE:
            logger.warning("bm25s not available, cannot build index")
            return 0

        with self._lock:
            texts = [c.get('text', '') for c in chunks]
            self._chunk_ids = [c.get('id', '') for c in chunks]

            # Tokenize and stem
            tokens = self._tokenize(texts)
            stemmed = self._stem_tokens(tokens)

            # Build index
            self._index = bm25s.BM25()
            self._index.index(stemmed)

            # Save to disk
            self._save_to_disk()

            logger.info(f"BM25 index built with {len(chunks)} chunks")
            return len(chunks)

    def add_document_chunks(self, chunks: List[Dict]) -> int:
        """
        Add new chunks to the index incrementally.
        For now, triggers a full rebuild (bm25s doesn't support incremental).

        In production, you'd want to batch these and rebuild periodically.
        """
        if not BM25S_AVAILABLE or not chunks:
            return 0

        with self._lock:
            # Append new chunk IDs and texts
            new_ids = [c.get('id', '') for c in chunks]
            new_texts = [c.get('text', '') for c in chunks]

            # Add to existing data
            existing_texts = []
            if self._index is not None and self._chunk_ids:
                # We need to rebuild - get existing data from metadata
                meta_path = os.path.join(self.index_path, 'chunk_ids.json')
                if os.path.exists(meta_path):
                    # We don't store original texts, so we need a full rebuild
                    # This is called from enhanced_indexer which should call rebuild periodically
                    pass

            self._chunk_ids.extend(new_ids)

            # For incremental updates, just save the mapping
            # The actual index rebuild happens via /bm25/rebuild endpoint
            self._save_chunk_ids()

            logger.info(f"Added {len(chunks)} chunks to BM25 mapping (rebuild needed for search)")
            return len(chunks)

    def search(self, query: str, top_k: int = 20) -> List[Tuple[str, float]]:
        """
        Search the BM25 index.

        Args:
            query: Search query text
            top_k: Number of results to return

        Returns:
            List of (chunk_id, bm25_score) tuples
        """
        if not BM25S_AVAILABLE or self._index is None:
            return []

        with self._lock:
            try:
                # Tokenize and stem query
                query_tokens = self._tokenize([query])
                query_stemmed = self._stem_tokens(query_tokens)

                # Search
                results, scores = self._index.retrieve(query_stemmed, k=min(top_k, len(self._chunk_ids)))

                # Map back to chunk IDs
                output = []
                for i in range(len(results[0])):
                    idx = int(results[0][i])
                    score = float(scores[0][i])
                    if 0 <= idx < len(self._chunk_ids) and score > 0:
                        output.append((self._chunk_ids[idx], score))

                return output
            except Exception as e:
                logger.error(f"BM25 search error: {e}")
                return []

    def _save_to_disk(self):
        """Save index and metadata to disk"""
        try:
            os.makedirs(self.index_path, exist_ok=True)

            # Save bm25s index
            if self._index is not None:
                self._index.save(self.index_path)

            # Save chunk ID mapping
            self._save_chunk_ids()

            logger.debug(f"BM25 index saved to {self.index_path}")
        except Exception as e:
            logger.error(f"Failed to save BM25 index: {e}")

    def _save_chunk_ids(self):
        """Save chunk ID mapping separately"""
        try:
            os.makedirs(self.index_path, exist_ok=True)
            meta_path = os.path.join(self.index_path, 'chunk_ids.json')
            with open(meta_path, 'w') as f:
                json.dump(self._chunk_ids, f)
        except Exception as e:
            logger.error(f"Failed to save chunk IDs: {e}")

    def _load_from_disk(self):
        """Load index from disk if available"""
        if not BM25S_AVAILABLE:
            return

        try:
            meta_path = os.path.join(self.index_path, 'chunk_ids.json')
            index_file = os.path.join(self.index_path, 'params.index.json')

            if os.path.exists(meta_path) and os.path.exists(index_file):
                self._index = bm25s.BM25.load(self.index_path)
                with open(meta_path, 'r') as f:
                    self._chunk_ids = json.load(f)
                logger.info(f"BM25 index loaded from disk: {len(self._chunk_ids)} chunks")
            else:
                logger.info("No existing BM25 index found on disk")
        except Exception as e:
            logger.warning(f"Failed to load BM25 index from disk: {e}")
            self._index = None
            self._chunk_ids = []

    @property
    def is_ready(self) -> bool:
        """Check if index is ready for search"""
        return BM25S_AVAILABLE and self._index is not None and len(self._chunk_ids) > 0

    @property
    def size(self) -> int:
        """Number of chunks in the index"""
        return len(self._chunk_ids)


# Singleton instance
_bm25_instance: Optional[BM25Index] = None


def get_bm25_index() -> BM25Index:
    """Get or create BM25 index singleton"""
    global _bm25_instance
    if _bm25_instance is None:
        _bm25_instance = BM25Index()
    return _bm25_instance
