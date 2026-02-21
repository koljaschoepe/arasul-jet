"""
Text chunking utilities for splitting documents into smaller pieces
for vector embedding and retrieval.

Supports hierarchical chunking (Parent-Document Retriever pattern):
- Parent chunks (2000 tokens) for rich LLM context
- Child chunks (400 tokens) for precise vector retrieval
- German-aware separators for legal/business documents
"""

import logging
import re
from dataclasses import dataclass, field
from typing import List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ChildChunk:
    """A child chunk used for vector retrieval"""
    text: str
    parent_index: int
    child_index: int
    global_index: int
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    word_count: int = 0

    def __post_init__(self):
        self.word_count = len(self.text.split())


@dataclass
class ParentChunk:
    """A parent chunk providing rich context for LLM"""
    text: str
    parent_index: int
    children: List[ChildChunk] = field(default_factory=list)
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    word_count: int = 0
    token_count: int = 0

    def __post_init__(self):
        self.word_count = len(self.text.split())
        # Approximate token count: 1 word ~ 1.33 tokens for German
        self.token_count = int(self.word_count * 1.33)


# German-aware separators in priority order
# Handles legal documents, contracts, regulations
GERMAN_SEPARATORS = [
    '\n\n\n',       # Triple newline (major section break)
    '\n\n',         # Double newline (paragraph break)
    '\n§ ',         # German legal paragraph marker
    '\nArtikel ',   # Article marker
    '\nAbsatz ',    # Paragraph marker
    '\nAnlage ',    # Appendix marker
    '\nAbschnitt ', # Section marker
    '\n',           # Single newline
    '. ',           # Sentence end
    '! ',           # Exclamation
    '? ',           # Question
    '; ',           # Semicolon
    ', ',           # Comma (last resort)
]


def _recursive_split(text: str, max_size: int, separators: List[str]) -> List[str]:
    """
    Recursively split text using separator hierarchy.
    Tries the largest separator first, falls back to smaller ones.
    """
    if len(text.split()) <= max_size:
        return [text] if text.strip() else []

    if not separators:
        # No separators left - hard split by words
        words = text.split()
        chunks = []
        for i in range(0, len(words), max_size):
            chunk = ' '.join(words[i:i + max_size])
            if chunk.strip():
                chunks.append(chunk)
        return chunks

    separator = separators[0]
    remaining_separators = separators[1:]

    # Split by current separator
    parts = text.split(separator)

    # If split didn't help (only 1 part), try next separator
    if len(parts) <= 1:
        return _recursive_split(text, max_size, remaining_separators)

    # Merge parts back together respecting max_size
    chunks = []
    current = ''

    for part in parts:
        candidate = (current + separator + part) if current else part

        if len(candidate.split()) > max_size and current:
            # Current chunk is full, save it
            if current.strip():
                chunks.append(current.strip())
            # Check if this part alone is too big
            if len(part.split()) > max_size:
                # Recursively split the oversized part
                sub_chunks = _recursive_split(part, max_size, remaining_separators)
                chunks.extend(sub_chunks)
                current = ''
            else:
                current = part
        else:
            current = candidate

    # Don't forget the last piece
    if current.strip():
        if len(current.split()) > max_size:
            sub_chunks = _recursive_split(current, max_size, remaining_separators)
            chunks.extend(sub_chunks)
        else:
            chunks.append(current.strip())

    return chunks


def chunk_text_hierarchical(
    text: str,
    parent_size: int = 2000,
    child_size: int = 400,
    child_overlap: int = 50
) -> List[ParentChunk]:
    """
    Create hierarchical chunks: large parent chunks for LLM context,
    small child chunks for precise vector retrieval.

    Args:
        text: Full document text
        parent_size: Max words per parent chunk (default 2000 ~ 2660 tokens)
        child_size: Max words per child chunk (default 400 ~ 530 tokens)
        child_overlap: Word overlap between child chunks (default 50)

    Returns:
        List of ParentChunk objects, each containing ChildChunk objects
    """
    if not text or not text.strip():
        return []

    text = text.strip()

    # Step 1: Split into parent chunks using German-aware separators
    parent_texts = _recursive_split(text, parent_size, GERMAN_SEPARATORS)

    if not parent_texts:
        return []

    # Step 2: For each parent, create overlapping child chunks
    parent_chunks = []
    global_child_index = 0
    char_offset = 0

    for parent_idx, parent_text in enumerate(parent_texts):
        parent_start = text.find(parent_text, char_offset)
        if parent_start == -1:
            parent_start = char_offset
        parent_end = parent_start + len(parent_text)

        parent = ParentChunk(
            text=parent_text,
            parent_index=parent_idx,
            char_start=parent_start,
            char_end=parent_end,
        )

        # Create child chunks within this parent
        child_texts = _recursive_split(parent_text, child_size, GERMAN_SEPARATORS)

        # Apply overlap between child chunks
        children = []
        child_char_offset = parent_start

        for child_idx, child_text in enumerate(child_texts):
            child_start = text.find(child_text, child_char_offset)
            if child_start == -1:
                child_start = child_char_offset
            child_end = child_start + len(child_text)

            child = ChildChunk(
                text=child_text,
                parent_index=parent_idx,
                child_index=child_idx,
                global_index=global_child_index,
                char_start=child_start,
                char_end=child_end,
            )
            children.append(child)
            global_child_index += 1
            child_char_offset = child_end

        parent.children = children
        parent_chunks.append(parent)
        char_offset = parent_end

    total_children = sum(len(p.children) for p in parent_chunks)
    logger.info(
        f"Hierarchical chunking: {len(parent_chunks)} parents, "
        f"{total_children} children (parent_size={parent_size}, child_size={child_size})"
    )

    return parent_chunks


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """
    Split text into overlapping chunks based on word count.
    Legacy API - delegates to hierarchical function for backward compatibility.

    Args:
        text: Input text to chunk
        chunk_size: Maximum number of words per chunk
        overlap: Number of words to overlap between chunks

    Returns:
        List of text chunks (flat, no parent/child hierarchy)
    """
    if not text or not text.strip():
        return []

    # Use German-aware recursive splitting
    chunks = _recursive_split(text.strip(), chunk_size, GERMAN_SEPARATORS)

    logger.debug(f"Split text into {len(chunks)} chunks (chunk_size={chunk_size}, overlap={overlap})")
    return chunks


def chunk_text_by_tokens(text: str, max_tokens: int = 500, overlap_tokens: int = 50) -> List[str]:
    """
    Split text into overlapping chunks based on approximate token count.
    """
    max_words = int(max_tokens * 0.75)
    overlap_words = int(overlap_tokens * 0.75)
    return chunk_text(text, chunk_size=max_words, overlap=overlap_words)


def chunk_text_by_chars(text: str, max_chars: int = 2000, overlap_chars: int = 200) -> List[str]:
    """
    Split text into overlapping chunks based on character count.
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
            search_start = end - int(max_chars * 0.2)
            search_text = text[search_start:end]

            for delimiter in ['. ', '! ', '? ', '\n\n', '\n']:
                last_pos = search_text.rfind(delimiter)
                if last_pos != -1:
                    end = search_start + last_pos + len(delimiter)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end - overlap_chars
        if start < 0:
            start = 0
        if start <= (end - len(chunk)) if chunk else 0:
            start = end

    logger.debug(f"Split text into {len(chunks)} chunks (max_chars={max_chars}, overlap={overlap_chars})")
    return chunks
