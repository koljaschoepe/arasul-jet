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
    Split text into overlapping chunks based on approximate token count.

    Token estimation (for nomic-embed-text and similar models):
    - Average: 1 token ≈ 4 characters or ~1.3 tokens per word
    - This means: 1 word ≈ 0.75 tokens (so max_words = max_tokens * 0.75)

    Args:
        text: Input text to chunk
        max_tokens: Maximum number of tokens per chunk (default 500)
        overlap_tokens: Number of tokens to overlap between chunks (default 50)

    Returns:
        List of text chunks
    """
    # Convert tokens to words
    # Standard approximation: 1 word ≈ 1.33 tokens, so words = tokens * 0.75
    max_words = int(max_tokens * 0.75)
    overlap_words = int(overlap_tokens * 0.75)

    return chunk_text(text, chunk_size=max_words, overlap=overlap_words)


def chunk_text_by_chars(text: str, max_chars: int = 2000, overlap_chars: int = 200) -> List[str]:
    """
    Split text into overlapping chunks based on character count.
    More precise than word-based chunking for token estimation.

    Token estimation: 1 token ≈ 4 characters
    Default 2000 chars ≈ 500 tokens (safe for 4096 token limit)

    Args:
        text: Input text to chunk
        max_chars: Maximum characters per chunk (default 2000)
        overlap_chars: Characters to overlap between chunks (default 200)

    Returns:
        List of text chunks
    """
    if not text or not text.strip():
        return []

    text = text.strip()
    chunks = []
    start = 0

    while start < len(text):
        end = min(start + max_chars, len(text))

        # Try to break at sentence boundary
        if end < len(text):
            # Look for sentence end within last 20% of chunk
            search_start = end - int(max_chars * 0.2)
            search_text = text[search_start:end]

            # Find last sentence boundary
            for delimiter in ['. ', '! ', '? ', '\n\n', '\n']:
                last_pos = search_text.rfind(delimiter)
                if last_pos != -1:
                    end = search_start + last_pos + len(delimiter)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Move start with overlap
        start = end - overlap_chars
        if start < 0:
            start = 0
        # PHASE1-FIX: Ensure progress - compare positions, not string with int
        # If new start position hasn't advanced past the previous end, force progress
        if start <= (end - len(chunk)) if chunk else 0:
            start = end

    logger.debug(f"Split text into {len(chunks)} chunks (max_chars={max_chars}, overlap={overlap_chars})")

    return chunks
