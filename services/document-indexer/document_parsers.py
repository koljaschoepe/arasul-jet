"""
Document parsers for different file formats
Supports PDF, DOCX, TXT, and Markdown

MEDIUM-PRIORITY-FIX 3.3: Added streaming PDF parser for memory-efficient processing
"""

import gc
import logging
from io import BytesIO
from typing import IO, Generator, Optional

import PyPDF2
from docx import Document
import markdown

logger = logging.getLogger(__name__)


def parse_pdf(file_obj: IO[bytes]) -> str:
    """
    Parse PDF file and extract text

    Args:
        file_obj: File object containing PDF data

    Returns:
        Extracted text from PDF
    """
    try:
        pdf_reader = PyPDF2.PdfReader(file_obj)
        text_parts = []

        for page_num in range(len(pdf_reader.pages)):
            page = pdf_reader.pages[page_num]
            text = page.extract_text()
            if text:
                text_parts.append(text)

        full_text = "\n\n".join(text_parts)
        return full_text.strip()

    except Exception as e:
        logger.error(f"Error parsing PDF: {e}")
        raise


def parse_pdf_streaming(file_obj: IO[bytes], gc_interval: int = 10) -> Generator[str, None, None]:
    """
    MEDIUM-PRIORITY-FIX 3.3: Memory-efficient streaming PDF parser

    Parse PDF file page by page using a generator to reduce memory usage.
    Useful for large PDFs (100+ pages) where loading all text at once
    would cause memory spikes.

    Args:
        file_obj: File object containing PDF data
        gc_interval: Run garbage collection every N pages (default: 10)

    Yields:
        Text content from each page

    Example:
        for page_text in parse_pdf_streaming(file_obj):
            # Process page_text chunk by chunk
            chunks = chunk_text(page_text)
            for chunk in chunks:
                process_chunk(chunk)
    """
    try:
        pdf_reader = PyPDF2.PdfReader(file_obj)
        total_pages = len(pdf_reader.pages)
        logger.info(f"Starting streaming PDF parse: {total_pages} pages")

        for page_num in range(total_pages):
            try:
                page = pdf_reader.pages[page_num]
                text = page.extract_text()

                if text and text.strip():
                    yield text.strip()

                # Explicit cleanup to free page memory
                del page

                # Periodic garbage collection for very large PDFs
                if gc_interval > 0 and (page_num + 1) % gc_interval == 0:
                    gc.collect()
                    logger.debug(f"Processed {page_num + 1}/{total_pages} pages (GC triggered)")

            except Exception as page_error:
                logger.warning(f"Error extracting text from page {page_num + 1}: {page_error}")
                # Continue with next page instead of failing entire document
                continue

        logger.info(f"Completed streaming PDF parse: {total_pages} pages processed")

    except Exception as e:
        logger.error(f"Error in streaming PDF parse: {e}")
        raise


def get_pdf_page_count(file_obj: IO[bytes]) -> int:
    """
    Get the number of pages in a PDF without extracting text.
    Useful for progress tracking and deciding whether to use streaming parser.

    Args:
        file_obj: File object containing PDF data

    Returns:
        Number of pages in the PDF
    """
    try:
        file_obj.seek(0)
        pdf_reader = PyPDF2.PdfReader(file_obj)
        count = len(pdf_reader.pages)
        file_obj.seek(0)  # Reset for subsequent reads
        return count
    except Exception as e:
        logger.error(f"Error getting PDF page count: {e}")
        return 0


def parse_docx(file_obj: IO[bytes]) -> str:
    """
    Parse DOCX file and extract text

    Args:
        file_obj: File object containing DOCX data

    Returns:
        Extracted text from DOCX
    """
    try:
        doc = Document(file_obj)
        text_parts = []

        # Extract paragraphs
        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                text_parts.append(paragraph.text)

        # Extract tables
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells)
                if row_text.strip():
                    text_parts.append(row_text)

        full_text = "\n\n".join(text_parts)
        return full_text.strip()

    except Exception as e:
        logger.error(f"Error parsing DOCX: {e}")
        raise


def parse_txt(file_obj: IO[bytes]) -> str:
    """
    Parse plain text file

    Args:
        file_obj: File object containing text data

    Returns:
        Text content
    """
    try:
        # Try different encodings
        encodings = ['utf-8', 'latin-1', 'cp1252']

        for encoding in encodings:
            try:
                file_obj.seek(0)
                text = file_obj.read().decode(encoding)
                return text.strip()
            except UnicodeDecodeError:
                continue

        # If all encodings fail, use utf-8 with errors='ignore'
        file_obj.seek(0)
        text = file_obj.read().decode('utf-8', errors='ignore')
        return text.strip()

    except Exception as e:
        logger.error(f"Error parsing TXT: {e}")
        raise


def parse_markdown(file_obj: IO[bytes]) -> str:
    """
    Parse Markdown file and extract text
    Converts markdown to plain text by rendering and stripping HTML

    Args:
        file_obj: File object containing markdown data

    Returns:
        Plain text extracted from markdown
    """
    try:
        # Read markdown content
        md_text = parse_txt(file_obj)

        # For RAG purposes, we keep the markdown formatting
        # as it preserves structure (headers, lists, etc.)
        # which can be useful for context
        return md_text

    except Exception as e:
        logger.error(f"Error parsing Markdown: {e}")
        raise
