"""
OCR Service for Document Indexer
Automatically detects and uses available OCR engines (Tesseract, PaddleOCR)
"""

import io
import logging
import os
from typing import IO, Optional, List, Tuple
from dataclasses import dataclass

import requests
from PIL import Image

logger = logging.getLogger(__name__)

# OCR Engine configuration
OCR_ENGINES = {
    'paddleocr': {
        'host': os.getenv('PADDLEOCR_HOST', 'paddleocr'),
        'port': int(os.getenv('PADDLEOCR_PORT', '8086')),
        'priority': 1,  # Higher priority (better quality)
        'endpoint': '/ocr'
    },
    'tesseract': {
        'host': os.getenv('TESSERACT_HOST', 'tesseract'),
        'port': int(os.getenv('TESSERACT_PORT', '8085')),
        'priority': 2,  # Lower priority (fallback)
        'endpoint': '/ocr'
    }
}

# Minimum text length to consider PDF as having extractable text
MIN_TEXT_LENGTH = 50

# Cache for available OCR engine (checked once at startup)
_available_engine: Optional[str] = None
_engine_checked: bool = False


@dataclass
class OCRResult:
    """Result from OCR processing"""
    text: str
    engine: str
    confidence: float = 0.0
    success: bool = True
    error: Optional[str] = None


def check_ocr_engine_available(engine_name: str) -> bool:
    """
    Check if a specific OCR engine is available.

    Args:
        engine_name: Name of the engine ('tesseract' or 'paddleocr')

    Returns:
        True if engine is available and responding
    """
    if engine_name not in OCR_ENGINES:
        return False

    config = OCR_ENGINES[engine_name]
    url = f"http://{config['host']}:{config['port']}/health"

    try:
        response = requests.get(url, timeout=5)
        available = response.status_code == 200
        logger.debug(f"OCR engine '{engine_name}' health check: {'OK' if available else 'FAILED'}")
        return available
    except requests.RequestException as e:
        logger.debug(f"OCR engine '{engine_name}' not available: {e}")
        return False


def get_available_ocr_engine() -> Optional[str]:
    """
    Get the best available OCR engine.
    Checks engines in priority order and returns the first available one.
    Result is cached for performance.

    Returns:
        Name of available engine or None if no engine is available
    """
    global _available_engine, _engine_checked

    # Return cached result if already checked
    if _engine_checked:
        return _available_engine

    # Sort engines by priority
    sorted_engines = sorted(
        OCR_ENGINES.items(),
        key=lambda x: x[1]['priority']
    )

    for engine_name, config in sorted_engines:
        if check_ocr_engine_available(engine_name):
            _available_engine = engine_name
            _engine_checked = True
            logger.info(f"Using OCR engine: {engine_name}")
            return engine_name

    _engine_checked = True
    logger.warning("No OCR engine available")
    return None


def reset_ocr_cache():
    """Reset the OCR engine cache (useful for testing or after container restart)"""
    global _available_engine, _engine_checked
    _available_engine = None
    _engine_checked = False


def ocr_image(image_data: bytes, engine: Optional[str] = None) -> OCRResult:
    """
    Perform OCR on an image using the specified or best available engine.

    Args:
        image_data: Image data as bytes (PNG, JPEG, etc.)
        engine: Specific engine to use, or None for auto-detection

    Returns:
        OCRResult with extracted text
    """
    # Get engine to use
    if engine is None:
        engine = get_available_ocr_engine()

    if engine is None:
        return OCRResult(
            text="",
            engine="none",
            success=False,
            error="No OCR engine available"
        )

    config = OCR_ENGINES[engine]
    url = f"http://{config['host']}:{config['port']}{config['endpoint']}"

    try:
        # Send image to OCR service
        files = {'image': ('image.png', image_data, 'image/png')}
        response = requests.post(url, files=files, timeout=60)

        if response.status_code == 200:
            result = response.json()
            text = result.get('text', '')
            confidence = result.get('confidence', 0.0)

            logger.debug(f"OCR successful with {engine}: {len(text)} chars, confidence: {confidence}")
            return OCRResult(
                text=text,
                engine=engine,
                confidence=confidence,
                success=True
            )
        else:
            error_msg = f"OCR request failed: {response.status_code}"
            logger.warning(error_msg)
            return OCRResult(
                text="",
                engine=engine,
                success=False,
                error=error_msg
            )

    except requests.RequestException as e:
        error_msg = f"OCR request error: {str(e)}"
        logger.error(error_msg)
        return OCRResult(
            text="",
            engine=engine,
            success=False,
            error=error_msg
        )


def pdf_page_to_image(pdf_reader, page_num: int, dpi: int = 150) -> Optional[bytes]:
    """
    Convert a PDF page to an image for OCR.

    Note: This requires pdf2image which uses poppler.
    Falls back to None if conversion fails.

    Args:
        pdf_reader: PyPDF2 reader object
        page_num: Page number (0-indexed)
        dpi: Resolution for rendering

    Returns:
        Image data as bytes, or None if conversion fails
    """
    try:
        # Try using pdf2image if available
        from pdf2image import convert_from_bytes

        # Get the original PDF bytes
        # This is a workaround since PyPDF2 doesn't expose the raw page data easily
        # In production, we'd pass the original file bytes
        logger.debug(f"Converting PDF page {page_num} to image (DPI: {dpi})")

        # For now, return None - this would need the original PDF bytes
        # which should be passed from the caller
        return None

    except ImportError:
        logger.debug("pdf2image not available, OCR for PDFs disabled")
        return None
    except Exception as e:
        logger.warning(f"Failed to convert PDF page to image: {e}")
        return None


def ocr_pdf_page(pdf_bytes: bytes, page_num: int, dpi: int = 150) -> OCRResult:
    """
    Perform OCR on a specific PDF page.

    Args:
        pdf_bytes: Full PDF file as bytes
        page_num: Page number (0-indexed)
        dpi: Resolution for rendering

    Returns:
        OCRResult with extracted text
    """
    try:
        from pdf2image import convert_from_bytes

        # Convert specific page to image
        images = convert_from_bytes(
            pdf_bytes,
            first_page=page_num + 1,  # pdf2image uses 1-indexed pages
            last_page=page_num + 1,
            dpi=dpi
        )

        if not images:
            return OCRResult(
                text="",
                engine="none",
                success=False,
                error="Failed to convert PDF page to image"
            )

        # Convert PIL Image to bytes
        img_buffer = io.BytesIO()
        images[0].save(img_buffer, format='PNG')
        img_bytes = img_buffer.getvalue()

        # Perform OCR
        return ocr_image(img_bytes)

    except ImportError:
        return OCRResult(
            text="",
            engine="none",
            success=False,
            error="pdf2image not installed"
        )
    except Exception as e:
        return OCRResult(
            text="",
            engine="none",
            success=False,
            error=str(e)
        )


def ocr_pdf_full(pdf_bytes: bytes, max_pages: int = 100) -> OCRResult:
    """
    Perform OCR on an entire PDF document.

    Args:
        pdf_bytes: Full PDF file as bytes
        max_pages: Maximum number of pages to process

    Returns:
        OCRResult with combined text from all pages
    """
    engine = get_available_ocr_engine()
    if engine is None:
        return OCRResult(
            text="",
            engine="none",
            success=False,
            error="No OCR engine available"
        )

    try:
        from pdf2image import convert_from_bytes
        import PyPDF2

        # Get page count
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
        total_pages = min(len(pdf_reader.pages), max_pages)

        logger.info(f"Starting OCR for PDF with {total_pages} pages using {engine}")

        all_text = []
        successful_pages = 0

        for page_num in range(total_pages):
            result = ocr_pdf_page(pdf_bytes, page_num)
            if result.success and result.text:
                all_text.append(f"--- Page {page_num + 1} ---\n{result.text}")
                successful_pages += 1

            # Log progress every 10 pages
            if (page_num + 1) % 10 == 0:
                logger.debug(f"OCR progress: {page_num + 1}/{total_pages} pages")

        combined_text = "\n\n".join(all_text)

        logger.info(f"OCR completed: {successful_pages}/{total_pages} pages extracted, {len(combined_text)} chars")

        return OCRResult(
            text=combined_text,
            engine=engine,
            success=True,
            confidence=successful_pages / total_pages if total_pages > 0 else 0
        )

    except ImportError:
        return OCRResult(
            text="",
            engine="none",
            success=False,
            error="pdf2image not installed - install with: pip install pdf2image"
        )
    except Exception as e:
        logger.error(f"OCR PDF error: {e}")
        return OCRResult(
            text="",
            engine=engine or "none",
            success=False,
            error=str(e)
        )


def is_pdf_searchable(text: str) -> bool:
    """
    Check if extracted PDF text indicates the PDF is searchable.

    Args:
        text: Text extracted from PDF using standard methods

    Returns:
        True if PDF appears to have extractable text
    """
    if not text:
        return False

    # Strip whitespace and check length
    clean_text = text.strip()
    if len(clean_text) < MIN_TEXT_LENGTH:
        return False

    # Check if text has meaningful content (not just numbers/symbols)
    alpha_chars = sum(1 for c in clean_text if c.isalpha())
    if alpha_chars < MIN_TEXT_LENGTH // 2:
        return False

    return True


def parse_pdf_with_ocr_fallback(file_obj: IO[bytes]) -> Tuple[str, bool]:
    """
    Parse PDF with automatic OCR fallback for scanned documents.

    Args:
        file_obj: File object containing PDF data

    Returns:
        Tuple of (extracted_text, used_ocr)
    """
    import PyPDF2

    # First, try standard text extraction
    file_obj.seek(0)
    pdf_reader = PyPDF2.PdfReader(file_obj)
    text_parts = []

    for page in pdf_reader.pages:
        text = page.extract_text()
        if text:
            text_parts.append(text)

    standard_text = "\n\n".join(text_parts).strip()

    # Check if we got meaningful text
    if is_pdf_searchable(standard_text):
        logger.debug("PDF has extractable text, skipping OCR")
        return standard_text, False

    # Try OCR if available
    engine = get_available_ocr_engine()
    if engine is None:
        logger.debug("PDF may need OCR but no engine available")
        return standard_text, False

    logger.info("PDF appears to be scanned, attempting OCR...")

    # Read full PDF bytes for OCR
    file_obj.seek(0)
    pdf_bytes = file_obj.read()

    ocr_result = ocr_pdf_full(pdf_bytes)

    if ocr_result.success and ocr_result.text:
        logger.info(f"OCR successful: {len(ocr_result.text)} chars extracted")
        return ocr_result.text, True
    else:
        logger.warning(f"OCR failed: {ocr_result.error}")
        # Return whatever we got from standard extraction
        return standard_text, False
