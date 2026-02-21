"""
Document parsers for different file formats
Supports PDF, DOCX, TXT, Markdown, and YAML tables

MEDIUM-PRIORITY-FIX 3.3: Added streaming PDF parser for memory-efficient processing
OCR-INTEGRATION: Added automatic OCR fallback for scanned PDFs
PDF-UPGRADE: Replaced PyPDF2 with PyMuPDF (fitz) for better text extraction
              and pdfplumber for table extraction
"""

import gc
import logging
from io import BytesIO
from typing import IO, Generator, Optional, Tuple

import fitz  # PyMuPDF - superior text extraction with layout preservation
import pdfplumber  # table extraction from PDFs
from docx import Document
import markdown
import yaml

# OCR service for scanned document support
try:
    from ocr_service import (
        get_available_ocr_engine,
        parse_pdf_with_ocr_fallback,
        is_pdf_searchable,
        OCRResult
    )
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

logger = logging.getLogger(__name__)


def _extract_tables_from_page(pdf_path_or_bytes, page_num: int) -> str:
    """
    Extract tables from a specific PDF page using pdfplumber.

    Args:
        pdf_path_or_bytes: PDF file bytes for pdfplumber
        page_num: Zero-based page index

    Returns:
        Pipe-delimited text representation of all tables found on the page,
        or empty string if no tables found
    """
    try:
        with pdfplumber.open(BytesIO(pdf_path_or_bytes)) as pdf:
            if page_num >= len(pdf.pages):
                return ""

            page = pdf.pages[page_num]
            tables = page.extract_tables()

            if not tables:
                return ""

            table_texts = []
            for table_idx, table in enumerate(tables):
                if not table:
                    continue

                rows_text = []
                for row in table:
                    # Replace None values with empty string
                    cleaned_row = [
                        str(cell).strip() if cell is not None else ""
                        for cell in row
                    ]
                    rows_text.append(" | ".join(cleaned_row))

                if rows_text:
                    table_texts.append("\n".join(rows_text))

            return "\n\n".join(table_texts)

    except Exception as e:
        logger.debug(f"Table extraction failed for page {page_num}: {e}")
        return ""


def parse_pdf(file_obj: IO[bytes], use_ocr: bool = True) -> str:
    """
    Parse PDF file and extract text using PyMuPDF (fitz) for high-quality
    text extraction with layout preservation, plus pdfplumber for table extraction.
    Automatically falls back to OCR for scanned documents if OCR is available.

    Args:
        file_obj: File object containing PDF data
        use_ocr: Whether to attempt OCR for scanned PDFs (default: True)

    Returns:
        Extracted text from PDF
    """
    try:
        # Try OCR-enabled parsing if available and enabled
        if use_ocr and OCR_AVAILABLE:
            text, used_ocr = parse_pdf_with_ocr_fallback(file_obj)
            if used_ocr:
                logger.info("PDF parsed using OCR")
            return text

        # Standard extraction using PyMuPDF + pdfplumber
        file_obj.seek(0)
        pdf_bytes = file_obj.read()

        # Open with fitz for text extraction
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text_parts = []

        for page_num in range(len(doc)):
            page = doc[page_num]

            # Extract text with layout preservation
            # Using "text" sort mode for natural reading order
            text = page.get_text("text")

            page_content = ""
            if text and text.strip():
                page_content = text.strip()

            # Extract tables using pdfplumber and append to page text
            table_text = _extract_tables_from_page(pdf_bytes, page_num)
            if table_text:
                if page_content:
                    page_content += "\n\n[Table]\n" + table_text
                else:
                    page_content = "[Table]\n" + table_text

            if page_content:
                text_parts.append(page_content)

        doc.close()

        full_text = "\n\n".join(text_parts)
        return full_text.strip()

    except Exception as e:
        logger.error(f"Error parsing PDF: {e}")
        raise


def parse_image(file_obj: IO[bytes]) -> str:
    """
    Parse image file using OCR to extract text.

    Args:
        file_obj: File object containing image data (PNG, JPEG, etc.)

    Returns:
        Extracted text from image, or empty string if OCR not available
    """
    if not OCR_AVAILABLE:
        logger.warning("OCR not available, cannot extract text from image")
        return ""

    try:
        from ocr_service import ocr_image

        file_obj.seek(0)
        image_data = file_obj.read()

        result = ocr_image(image_data)

        if result.success:
            logger.info(f"Image OCR successful: {len(result.text)} chars extracted")
            return result.text
        else:
            logger.warning(f"Image OCR failed: {result.error}")
            return ""

    except Exception as e:
        logger.error(f"Error parsing image with OCR: {e}")
        return ""


def parse_pdf_streaming(file_obj: IO[bytes], gc_interval: int = 10) -> Generator[str, None, None]:
    """
    MEDIUM-PRIORITY-FIX 3.3: Memory-efficient streaming PDF parser

    Parse PDF file page by page using a generator to reduce memory usage.
    Uses PyMuPDF (fitz) for high-quality text extraction and pdfplumber
    for table extraction.
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
        file_obj.seek(0)
        pdf_bytes = file_obj.read()

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
        logger.info(f"Starting streaming PDF parse: {total_pages} pages")

        for page_num in range(total_pages):
            try:
                page = doc[page_num]
                text = page.get_text("text")

                page_content = ""
                if text and text.strip():
                    page_content = text.strip()

                # Extract tables using pdfplumber
                table_text = _extract_tables_from_page(pdf_bytes, page_num)
                if table_text:
                    if page_content:
                        page_content += "\n\n[Table]\n" + table_text
                    else:
                        page_content = "[Table]\n" + table_text

                if page_content:
                    yield page_content

                # Periodic garbage collection for very large PDFs
                if gc_interval > 0 and (page_num + 1) % gc_interval == 0:
                    gc.collect()
                    logger.debug(f"Processed {page_num + 1}/{total_pages} pages (GC triggered)")

            except Exception as page_error:
                logger.warning(f"Error extracting text from page {page_num + 1}: {page_error}")
                # Continue with next page instead of failing entire document
                continue

        doc.close()
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
        pdf_bytes = file_obj.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        count = len(doc)
        doc.close()
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


def parse_yaml_table(file_obj: IO[bytes]) -> str:
    """
    Parse YAML table file and convert to searchable text for RAG.
    Extracts table metadata, column names, and all row data.

    Args:
        file_obj: File object containing YAML table data

    Returns:
        Formatted text representation of the table for indexing

    YAML Table Format:
        _meta:
            name: "Table Name"
            description: "Description"
        columns:
            - slug: "col1"
              name: "Column 1"
              type: "text"
        rows:
            - col1: "value1"
              col2: "value2"
    """
    try:
        # Read YAML content
        content = parse_txt(file_obj)
        data = yaml.safe_load(content)

        if not data:
            return ""

        text_parts = []

        # Extract metadata
        meta = data.get('_meta', {})
        if meta.get('name'):
            text_parts.append(f"Tabelle: {meta['name']}")
        if meta.get('description'):
            text_parts.append(f"Beschreibung: {meta['description']}")

        # Extract column information
        columns = data.get('columns', [])
        if columns:
            col_names = [c.get('name', c.get('slug', '')) for c in columns]
            text_parts.append(f"Spalten: {', '.join(col_names)}")

            # Create a mapping of slug to name for row formatting
            slug_to_name = {c.get('slug', ''): c.get('name', c.get('slug', '')) for c in columns}

        # Extract row data
        rows = data.get('rows', [])
        if rows:
            text_parts.append(f"\nDaten ({len(rows)} Einträge):\n")

            for i, row in enumerate(rows):
                # Skip internal fields
                row_values = []
                for key, value in row.items():
                    if key.startswith('_'):
                        continue
                    if value is not None and value != '':
                        # Use column name if available, otherwise use key
                        col_name = slug_to_name.get(key, key) if columns else key
                        row_values.append(f"{col_name}: {value}")

                if row_values:
                    text_parts.append(' | '.join(row_values))

                # Limit to first 500 rows for very large tables
                if i >= 499:
                    text_parts.append(f"... und {len(rows) - 500} weitere Einträge")
                    break

        return '\n'.join(text_parts)

    except yaml.YAMLError as e:
        logger.error(f"Error parsing YAML: {e}")
        # Return raw content if YAML parsing fails
        return parse_txt(file_obj)
    except Exception as e:
        logger.error(f"Error parsing YAML table: {e}")
        raise
