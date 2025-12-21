"""
Text chunking utilities for splitting documents into smaller pieces
for vector embedding and retrieval
"""

import logging
from typing import List
import re

logger = logging.getLogger(__name__)


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """
    Split text into overlapping chunks based on word count

    Args:
        text: Input text to chunk
        chunk_size: Maximum number of words per chunk
        overlap: Number of words to overlap between chunks

    Returns:
        List of text chunks
    """
    if not text or not text.strip():
        return []

    # Split into sentences (rough approximation)
    # This regex splits on periods, exclamation marks, and question marks
    # followed by whitespace and a capital letter
    sentence_pattern = r'(?<=[.!?])\s+(?=[A-Z])'
    sentences = re.split(sentence_pattern, text)

    chunks = []
    current_chunk = []
    current_word_count = 0

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        words = sentence.split()
        word_count = len(words)

        # If adding this sentence would exceed chunk_size, save current chunk
        if current_word_count + word_count > chunk_size and current_chunk:
            chunks.append(" ".join(current_chunk))

            # Start new chunk with overlap
            if overlap > 0 and len(current_chunk) > 0:
                # Take last 'overlap' words from current chunk
                overlap_words = " ".join(current_chunk).split()[-overlap:]
                current_chunk = overlap_words
                current_word_count = len(overlap_words)
            else:
                current_chunk = []
                current_word_count = 0

        current_chunk.append(sentence)
        current_word_count += word_count

    # Add remaining chunk
    if current_chunk:
        chunks.append(" ".join(current_chunk))

    logger.debug(f"Split text into {len(chunks)} chunks (chunk_size={chunk_size}, overlap={overlap})")

    return chunks


def chunk_text_by_tokens(text: str, max_tokens: int = 500, overlap_tokens: int = 50) -> List[str]:
    """
    Split text into overlapping chunks based on approximate token count
    This is a simple approximation: 1 token ≈ 0.75 words

    Args:
        text: Input text to chunk
        max_tokens: Maximum number of tokens per chunk
        overlap_tokens: Number of tokens to overlap between chunks

    Returns:
        List of text chunks
    """
    # Convert tokens to words (rough approximation)
    max_words = int(max_tokens * 0.75)
    overlap_words = int(overlap_tokens * 0.75)

    return chunk_text(text, chunk_size=max_words, overlap=overlap_words)
