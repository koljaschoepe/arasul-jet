"""
Text chunking utilities for splitting documents into smaller pieces
for vector embedding and retrieval.

Supports hierarchical chunking (Parent-Document Retriever pattern):
- Parent chunks (2000 words) for rich LLM context
- Child chunks (150 words) for precise vector retrieval
- Markdown-aware section splitting preserves header context
- German-aware separators for legal/business documents
"""

import logging
import re
from dataclasses import dataclass, field
from typing import List, Optional

logger = logging.getLogger(__name__)

# Minimum word count for child chunks — filters noise (headers, page numbers)
MIN_CHILD_WORDS = 15


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
    section_header: str = ''

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

# Regex to detect Markdown section headers (## or ###)
_MD_SECTION_RE = re.compile(r'^(#{1,4})\s+(.+)$', re.MULTILINE)


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


def _split_markdown_sections(text: str) -> List[dict]:
    """
    Split Markdown text by ## / ### headers into sections.
    Each section keeps its header as metadata.

    Returns list of dicts: {'header': str, 'text': str}
    """
    lines = text.split('\n')
    sections = []
    current_header = ''
    current_lines = []

    for line in lines:
        match = _MD_SECTION_RE.match(line)
        if match:
            # Save previous section
            if current_lines:
                section_text = '\n'.join(current_lines).strip()
                if section_text:
                    sections.append({
                        'header': current_header,
                        'text': section_text,
                    })
            current_header = match.group(2).strip()
            current_lines = [line]  # Include the header line in the section text
        else:
            current_lines.append(line)

    # Last section
    if current_lines:
        section_text = '\n'.join(current_lines).strip()
        if section_text:
            sections.append({
                'header': current_header,
                'text': section_text,
            })

    return sections


def _is_markdown(text: str) -> bool:
    """Detect if text is Markdown by checking for common Markdown patterns."""
    md_indicators = 0
    if _MD_SECTION_RE.search(text):
        md_indicators += 2
    if re.search(r'^\s*[-*]\s', text, re.MULTILINE):
        md_indicators += 1
    if re.search(r'\*\*[^*]+\*\*', text):
        md_indicators += 1
    if re.search(r'\|.*\|.*\|', text):
        md_indicators += 1
    return md_indicators >= 2


def chunk_text_hierarchical(
    text: str,
    parent_size: int = 2000,
    child_size: int = 150,
    child_overlap: int = 30
) -> List[ParentChunk]:
    """
    Create hierarchical chunks: large parent chunks for LLM context,
    small child chunks for precise vector retrieval.

    For Markdown documents, splits by section headers first to preserve
    header context in each child chunk.

    Args:
        text: Full document text
        parent_size: Max words per parent chunk (default 2000 ~ 2660 tokens)
        child_size: Max words per child chunk (default 150 ~ 200 tokens)
        child_overlap: Word overlap between child chunks (default 30)

    Returns:
        List of ParentChunk objects, each containing ChildChunk objects
    """
    if not text or not text.strip():
        return []

    text = text.strip()
    is_md = _is_markdown(text)

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

        # Create child chunks — use section-aware splitting for Markdown
        if is_md:
            child_texts, child_headers = _split_markdown_into_child_chunks(
                parent_text, child_size
            )
        else:
            child_texts = _recursive_split(parent_text, child_size, GERMAN_SEPARATORS)
            child_headers = [''] * len(child_texts)

        # Apply overlap: prepend last N words from previous chunk to each subsequent chunk
        if child_overlap > 0 and len(child_texts) > 1:
            overlapped = [child_texts[0]]
            for i in range(1, len(child_texts)):
                prev_words = child_texts[i - 1].split()
                overlap_words = prev_words[-child_overlap:] if len(prev_words) > child_overlap else prev_words
                overlap_prefix = ' '.join(overlap_words)
                overlapped.append(overlap_prefix + ' ' + child_texts[i])
            child_texts = overlapped

        children = []
        child_char_offset = parent_start

        for child_idx, child_text in enumerate(child_texts):
            child_start = text.find(child_text, child_char_offset)
            if child_start == -1:
                child_start = child_char_offset
            child_end = child_start + len(child_text)

            header = child_headers[child_idx] if child_idx < len(child_headers) else ''
            child = ChildChunk(
                text=child_text,
                parent_index=parent_idx,
                child_index=child_idx,
                global_index=global_child_index,
                char_start=child_start,
                char_end=child_end,
                section_header=header,
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
        f"{total_children} children (parent_size={parent_size}, child_size={child_size}"
        f", markdown={is_md})"
    )

    return parent_chunks


def _split_markdown_into_child_chunks(
    parent_text: str, child_size: int
) -> tuple:
    """
    Split a parent chunk's Markdown text by section headers, then sub-split
    large sections. Each chunk gets its nearest section header prepended
    if it was split away from it.

    Returns:
        (child_texts, child_headers) — parallel lists
    """
    sections = _split_markdown_sections(parent_text)

    if not sections or len(sections) <= 1:
        # No meaningful sections — fall back to standard recursive split
        texts = _recursive_split(parent_text, child_size, GERMAN_SEPARATORS)
        return texts, [''] * len(texts)

    child_texts = []
    child_headers = []

    for section in sections:
        header = section['header']
        section_text = section['text']
        word_count = len(section_text.split())

        if word_count <= child_size:
            # Section fits in one chunk — keep it intact
            child_texts.append(section_text)
            child_headers.append(header)
        else:
            # Section too large — sub-split, prepend header to each sub-chunk
            sub_chunks = _recursive_split(section_text, child_size, GERMAN_SEPARATORS)
            for i, sub in enumerate(sub_chunks):
                if i > 0 and header:
                    # Prepend section header so each sub-chunk knows its context
                    sub = f"## {header}\n{sub}"
                child_texts.append(sub)
                child_headers.append(header)

    return child_texts, child_headers


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


