# Document Indexer

Textextraktion auf Anfrage. Der Name ist historisch; heute ist es ein
zustandsloser HTTP-Dienst, dem das Backend eine Datei schickt und der Text
zurückgibt. Nichts wird abgelegt.

| Eigenschaft | Wert                                      |
| ----------- | ----------------------------------------- |
| Port        | 9102 (nur im Docker-Netz)                 |
| Framework   | Flask                                     |
| Laufzeit    | Python 3.11 (Image), Tests ab 3.10        |
| Zustand     | keiner; keine Datenbank, kein Speicher    |
| Aufrufer    | `dashboard-backend` (`extractionService`) |

## Endpunkte

### `GET /health`

Lebenszeichen. Geprüft wird nur, dass der Prozess antwortet und seine Parser
geladen hat. Es gibt keine Abhängigkeit mehr, die den Dienst als
angeschlagen ausweisen könnte. `ocr` sagt, ob das OCR-Modul importierbar
war, nicht, ob das Tesseract-Binary läuft.

```json
{
  "service": "document-indexer",
  "status": "healthy",
  "checks": "process only",
  "ocr": "available",
  "formats": [".bmp", ".csv", ".docx", "..."]
}
```

### `POST /extract-text`

`multipart/form-data`, Feld `file`. Ein JSON-Body wird nicht angenommen.

```bash
curl -F file=@angebot.pdf http://document-indexer:9102/extract-text
```

Antwort:

```json
{
  "text": "...",
  "filename": "angebot.pdf",
  "metadata": {
    "char_count": 12345,
    "word_count": 1890,
    "language": "de",
    "ocr_used": false,
    "pages": 7,
    "title": "Angebot 2026-08"
  }
}
```

`pages` und `title` fehlen, wenn die Metadaten für das Format nichts
hergeben. `ocr_used` ist bei Bilddateien `true`; bei Bild-PDFs, die über
den OCR-Rückfall liefen, steht es auf `false` (der Parser meldet das nur
ins Log).

Fehler kommen als `{ "error": "..." }`:

| Status | Wann                                           |
| ------ | ---------------------------------------------- |
| 400    | kein Feld `file`, oder Dateiendung ohne Parser |
| 413    | Upload größer als `DOCUMENT_MAX_SIZE_MB`       |
| 500    | Parser hat die Datei nicht lesen können        |

Ein leerer Text ist kein Fehler: ein Logo ohne Schrift oder ein Scan, den
die OCR nicht lesen kann, liefert 200 mit `"text": ""`.

## Formate

| Endungen                                                  | Parser                                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `.pdf`                                                    | PyMuPDF (Text) + pdfplumber (Tabellen); ab 51 Seiten seitenweise; OCR-Rückfall bei Bild-PDFs |
| `.docx`                                                   | python-docx, Absätze und Tabellen                                                            |
| `.txt`, `.md`, `.markdown`, `.csv`, `.json`, `.log`       | Klartext (utf-8, latin-1, cp1252)                                                            |
| `.html`, `.htm`, `.xml`                                   | Markup entfernt, `script`/`style` verworfen                                                  |
| `.yaml`, `.yml`                                           | Arasul-Tabellenformat aufbereitet, sonst Rohtext                                             |
| `.png`, `.jpg`, `.jpeg`, `.tiff`, `.tif`, `.bmp`, `.webp` | OCR (Tesseract, `deu+eng`)                                                                   |

NUL-Bytes (0x00), die manche PDFs beim Extrahieren mitliefern, werden
entfernt, bevor der Text den Dienst verlässt.

## Umgebungsvariablen

| Variable                    | Voreinstellung | Bedeutung                             |
| --------------------------- | -------------- | ------------------------------------- |
| `DOCUMENT_INDEXER_API_PORT` | `9102`         | Port der API                          |
| `DOCUMENT_MAX_SIZE_MB`      | `100`          | Obergrenze je Upload, darüber 413     |
| `OCR_LANGS`                 | `deu+eng`      | Tesseract-Sprachen                    |
| `LOG_LEVEL`                 | `INFO`         | wird von `structured_logging` gelesen |

Sonst nichts. Keine Zugangsdaten, keine Verbindungsdaten.

## Dateien

```
document-indexer/
├── api_server.py          # Flask: /health, /extract-text, 413-Handler
├── document_parsers.py    # Parser je Format, PARSERS, parse_document, strip_nul
├── ocr_service.py         # lokales Tesseract, OCR-Rückfall für Bild-PDFs
├── metadata_extractor.py  # Titel, Seitenzahl, Sprache
├── config.py              # DOCUMENT_MAX_SIZE_MB
├── requirements.txt       # Laufzeit
├── requirements-test.txt  # Tests (PyYAML, Flask); Parser werden gestubbt
├── tests/
└── Dockerfile             # python:3.11-slim + poppler, tesseract (deu/eng), mupdf
```

`structured_logging.py` kommt beim Bau aus `libs/shared-python/`.

## Tests

```bash
cd services/document-indexer
python3 -m venv .venv && .venv/bin/pip install pytest -r requirements-test.txt
PYTHONPATH=../../libs/shared-python .venv/bin/python -m pytest -q
```

Die Tests laufen ohne PyMuPDF, pdfplumber, python-docx und Tesseract;
`tests/conftest.py` stubbt sie. Was echt läuft: der Textparser, der
YAML-Parser, die Metadaten aus Text und der Flask-Client.

## Healthcheck

```
curl -f http://localhost:9102/health || exit 1
```

Alle 30 s, `start_period` 60 s, 3 Versuche (im Dockerfile).
