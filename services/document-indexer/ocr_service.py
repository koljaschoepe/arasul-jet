"""
OCR fuer den Document Indexer: lokales Tesseract im Image.

Seit Phase B4 (26.08.2026) gibt es nur noch diese eine Engine. Die HTTP-
Sidecars (PaddleOCR, Tesseract-Container) waren seit Plan 019 ein Rueckfall,
den niemand mehr betrieb; mit ihnen ist auch `requests` gefallen.
"""

import io
import logging
import os
from typing import IO, Optional, Tuple
from dataclasses import dataclass

from PIL import Image

logger = logging.getLogger(__name__)

try:
    import pytesseract

    _HAS_PYTESSERACT = True
except ImportError:  # pragma: no cover - nur ohne installiertes pytesseract
    pytesseract = None
    _HAS_PYTESSERACT = False

# Sprachen fuer die lokale OCR (Debian-Pakete tesseract-ocr-deu/-eng).
OCR_LANGS = os.getenv('OCR_LANGS', 'deu+eng')

# Ab dieser Textlaenge gilt ein PDF als durchsuchbar (kein OCR noetig).
MIN_TEXT_LENGTH = 50


@dataclass
class OCRResult:
    """Ergebnis eines OCR-Laufs."""
    text: str
    engine: str
    confidence: float = 0.0
    success: bool = True
    error: Optional[str] = None


def get_available_ocr_engine() -> Optional[str]:
    """
    'local', wenn pytesseract importierbar UND das tesseract-Binary da ist,
    sonst None.

    Bei JEDEM Aufruf frisch geprueft, nicht gecacht: so erholt sich der Dienst,
    falls das Binary beim allerersten Aufruf noch nicht bereit war. Die
    Pruefung ist billig und OCR ist kein Hot-Path.
    """
    if not _HAS_PYTESSERACT:
        return None
    try:
        pytesseract.get_tesseract_version()
        return 'local'
    except Exception:  # pragma: no cover - Binary fehlt/kaputt
        return None


def ocr_image(image_data: bytes) -> OCRResult:
    """OCR auf einem Bild (PNG, JPEG, ...)."""
    if get_available_ocr_engine() is None:
        return OCRResult(text="", engine="none", success=False,
                         error="No OCR engine available")
    try:
        img = Image.open(io.BytesIO(image_data))
        text = pytesseract.image_to_string(img, lang=OCR_LANGS)
        logger.debug(f"OCR (local tesseract) ok: {len(text)} chars")
        return OCRResult(text=text, engine='local', confidence=0.0, success=True)
    except Exception as e:  # noqa: BLE001 - Fehler sichtbar zurueckgeben, nicht schlucken
        error_msg = f"local tesseract error: {e}"
        logger.error(error_msg)
        return OCRResult(text="", engine='local', success=False, error=error_msg)


def ocr_pdf_page(pdf_bytes: bytes, page_num: int, dpi: int = 150) -> OCRResult:
    """OCR auf einer einzelnen PDF-Seite (0-basiert), gerastert ueber pdf2image/poppler."""
    try:
        from pdf2image import convert_from_bytes

        images = convert_from_bytes(
            pdf_bytes,
            first_page=page_num + 1,  # pdf2image zaehlt ab 1
            last_page=page_num + 1,
            dpi=dpi
        )
        if not images:
            return OCRResult(text="", engine="none", success=False,
                             error="Failed to convert PDF page to image")

        img_buffer = io.BytesIO()
        images[0].save(img_buffer, format='PNG')
        return ocr_image(img_buffer.getvalue())

    except ImportError:
        return OCRResult(text="", engine="none", success=False,
                         error="pdf2image not installed")
    except Exception as e:  # noqa: BLE001
        return OCRResult(text="", engine="none", success=False, error=str(e))


def ocr_pdf_full(pdf_bytes: bytes, max_pages: int = 100) -> OCRResult:
    """OCR ueber ein ganzes PDF, hoechstens `max_pages` Seiten."""
    engine = get_available_ocr_engine()
    if engine is None:
        return OCRResult(text="", engine="none", success=False,
                         error="No OCR engine available")

    try:
        import fitz  # PyMuPDF

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = min(len(doc), max_pages)
        doc.close()

        logger.info(f"Starting OCR for PDF with {total_pages} pages using {engine}")

        all_text = []
        successful_pages = 0

        for page_num in range(total_pages):
            result = ocr_pdf_page(pdf_bytes, page_num)
            if result.success and result.text:
                all_text.append(f"--- Page {page_num + 1} ---\n{result.text}")
                successful_pages += 1

            if (page_num + 1) % 10 == 0:
                logger.debug(f"OCR progress: {page_num + 1}/{total_pages} pages")

        combined_text = "\n\n".join(all_text)
        logger.info(
            f"OCR completed: {successful_pages}/{total_pages} pages extracted, {len(combined_text)} chars"
        )
        return OCRResult(
            text=combined_text,
            engine=engine,
            success=True,
            confidence=successful_pages / total_pages if total_pages > 0 else 0
        )

    except Exception as e:  # noqa: BLE001
        logger.error(f"OCR PDF error: {e}")
        return OCRResult(text="", engine=engine, success=False, error=str(e))


def is_pdf_searchable(text: str) -> bool:
    """True, wenn der per Textlayer extrahierte Text nach echtem Inhalt aussieht."""
    if not text:
        return False

    clean_text = text.strip()
    if len(clean_text) < MIN_TEXT_LENGTH:
        return False

    # Nicht nur Zahlen und Symbole
    alpha_chars = sum(1 for c in clean_text if c.isalpha())
    if alpha_chars < MIN_TEXT_LENGTH // 2:
        return False

    return True


def parse_pdf_with_ocr_fallback(file_obj: IO[bytes]) -> Tuple[str, bool]:
    """
    PDF parsen; ist kein Textlayer da, OCR versuchen.

    Rueckgabe: (Text, ocr_verwendet)
    """
    import fitz  # PyMuPDF

    file_obj.seek(0)
    pdf_bytes = file_obj.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text_parts = []

    for page in doc:
        text = page.get_text("text")
        if text and text.strip():
            text_parts.append(text.strip())

    doc.close()
    standard_text = "\n\n".join(text_parts).strip()

    if is_pdf_searchable(standard_text):
        logger.debug("PDF has extractable text, skipping OCR")
        return standard_text, False

    engine = get_available_ocr_engine()
    if engine is None:
        # Sichtbar melden: eine Bild-PDF ohne OCR-Engine wuerde sonst still
        # als leer durchgehen.
        logger.warning(
            "PDF ist bildbasiert (kein durchsuchbarer Text) und es ist KEINE "
            "OCR-Engine verfuegbar; Inhalt bleibt leer."
        )
        return standard_text, False

    logger.info("PDF appears to be scanned, attempting OCR...")
    ocr_result = ocr_pdf_full(pdf_bytes)

    if ocr_result.success and ocr_result.text.strip():
        logger.info(f"OCR successful ({ocr_result.engine}): {len(ocr_result.text)} chars extracted")
        return ocr_result.text, True

    # Nicht still verschlucken: eine Bild-PDF, deren OCR nichts liefert, ist
    # ein echter Fehlerfall und gehoert ins Log.
    logger.error(
        "OCR einer bildbasierten PDF lieferte keinen Text "
        f"(engine={ocr_result.engine}, error={ocr_result.error})"
    )
    return standard_text, False
