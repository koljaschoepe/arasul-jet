"""
Structured JSON Logging for Arasul Platform Python Services.

Outputs all log records as single-line JSON to stdout for consistent,
machine-parseable log output across every Python service.

Usage:
    from structured_logging import setup_logging
    logger = setup_logging("document-indexer")
    logger.info("Document indexed", extra={"document_id": doc_id, "duration_ms": 42})

No external dependencies -- stdlib only.
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone

# Fields present on every LogRecord -- used to detect extra fields added by callers.
_BUILTIN_ATTRS = frozenset(logging.LogRecord('', 0, '', 0, '', (), None).__dict__.keys())


class JSONFormatter(logging.Formatter):
    """Formats every log record as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Service name attached by the record factory (see setup_logging)
        if hasattr(record, "service"):
            log_entry["service"] = record.service

        # Exception traceback
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Include any extra fields passed by the caller
        for key, value in record.__dict__.items():
            if key not in _BUILTIN_ATTRS and key not in ("message", "service"):
                log_entry[key] = value

        return json.dumps(log_entry, default=str)


def setup_logging(service_name: str, level: str = None) -> logging.Logger:
    """
    Configure structured JSON logging for a service.

    Replaces the root logger's handlers so that *all* loggers in the process
    (including library loggers like Flask, requests, etc.) emit JSON to stdout.

    Args:
        service_name: Identifies the service in every log line.
        level: Log level string (DEBUG, INFO, WARNING, ERROR, CRITICAL).
               Falls back to the LOG_LEVEL env var, then INFO.

    Returns:
        A logger named ``service_name`` ready to use.
    """
    if level is None:
        level = os.getenv("LOG_LEVEL", "INFO")

    log_level = getattr(logging, level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    # Inject service name into every log record produced by any logger.
    old_factory = logging.getLogRecordFactory()

    def record_factory(*args, **kwargs):
        record = old_factory(*args, **kwargs)
        record.service = service_name
        return record

    logging.setLogRecordFactory(record_factory)

    return logging.getLogger(service_name)
