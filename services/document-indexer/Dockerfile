ARG PYTHON_VERSION=3.11.12
FROM python:${PYTHON_VERSION}-slim

WORKDIR /app

# Systempakete fuer die Textextraktion.
# poppler-utils: pdf2image rasterisiert Bild-PDFs fuer die OCR.
# tesseract-ocr (+ deu/eng): lokale OCR-Engine, kein Sidecar-Container.
# libmupdf-dev: Laufzeitbibliothek fuer PyMuPDF.
# curl: fuer den Healthcheck unten.
# Alle auf arm64 (Jetson) via apt verfuegbar.
RUN apt-get update && apt-get install -y \
    curl \
    libmupdf-dev \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-deu \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Requirements zuerst, damit der pip-Layer im Cache bleibt
COPY services/document-indexer/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Nutzer ohne Root-Rechte
RUN useradd -m -u 1000 -s /bin/bash indexer

# Gemeinsames Logging-Modul
COPY libs/shared-python/structured_logging.py ./

# Anwendungscode
COPY services/document-indexer/*.py ./

RUN chown -R indexer:indexer /app

EXPOSE 9102

USER indexer

# Healthcheck ueber die API
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9102/health || exit 1

CMD ["python3", "-u", "api_server.py"]
