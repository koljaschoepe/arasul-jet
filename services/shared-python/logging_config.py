"""
Standardized Logging Configuration
Consistent logging format across all Python services
"""

import os
import sys
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any


class JsonFormatter(logging.Formatter):
    """
    JSON formatter for structured logging.
    Outputs log records as JSON for easy parsing.
    """

    def __init__(self, service_name: str = "unknown"):
        super().__init__()
        self.service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "service": self.service_name,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Add extra fields
        if hasattr(record, 'extra_fields'):
            log_entry.update(record.extra_fields)

        return json.dumps(log_entry)


class ConsoleFormatter(logging.Formatter):
    """
    Colored console formatter for development.
    """

    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
    }
    RESET = '\033[0m'

    def __init__(self, service_name: str = "unknown", use_colors: bool = True):
        super().__init__()
        self.service_name = service_name
        self.use_colors = use_colors and sys.stdout.isatty()

    def format(self, record: logging.LogRecord) -> str:
        level = record.levelname
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        if self.use_colors:
            color = self.COLORS.get(level, '')
            return f"{timestamp} {color}[{level:8}]{self.RESET} [{self.service_name}] {record.getMessage()}"
        else:
            return f"{timestamp} [{level:8}] [{self.service_name}] {record.getMessage()}"


def setup_logging(
    service_name: str,
    level: str = None,
    log_file: Optional[str] = None,
    json_format: bool = False,
    log_dir: str = "/arasul/logs"
) -> logging.Logger:
    """
    Setup standardized logging for a service.

    Args:
        service_name: Name of the service (used in log entries)
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Optional log file name (will be created in log_dir)
        json_format: If True, use JSON format for file logging
        log_dir: Directory for log files

    Returns:
        Configured logger instance

    Example:
        logger = setup_logging("document-indexer", level="INFO", log_file="indexer.log")
        logger.info("Service started")
    """
    # Get log level from environment or parameter
    if level is None:
        level = os.getenv('LOG_LEVEL', 'INFO')

    log_level = getattr(logging, level.upper(), logging.INFO)

    # Create root logger for the service
    logger = logging.getLogger(service_name)
    logger.setLevel(log_level)

    # Clear existing handlers
    logger.handlers.clear()

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(ConsoleFormatter(service_name))
    logger.addHandler(console_handler)

    # File handler (if specified)
    if log_file:
        log_path = Path(log_dir)
        log_path.mkdir(parents=True, exist_ok=True)
        file_path = log_path / log_file

        file_handler = logging.FileHandler(file_path)
        file_handler.setLevel(log_level)

        if json_format:
            file_handler.setFormatter(JsonFormatter(service_name))
        else:
            file_handler.setFormatter(logging.Formatter(
                '%(asctime)s [%(levelname)s] [%(name)s] %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            ))

        logger.addHandler(file_handler)

    # Prevent propagation to root logger
    logger.propagate = False

    return logger


def get_logger(name: str = None) -> logging.Logger:
    """
    Get a logger instance.

    Args:
        name: Logger name (uses module name if not specified)

    Returns:
        Logger instance
    """
    if name is None:
        # Get caller's module name
        import inspect
        frame = inspect.currentframe()
        if frame and frame.f_back:
            name = frame.f_back.f_globals.get('__name__', 'unknown')
    return logging.getLogger(name)


class StructuredLogger:
    """
    Logger wrapper for structured logging with extra fields.

    Example:
        log = StructuredLogger("my-service")
        log.info("User logged in", user_id=123, ip="192.168.1.1")
    """

    def __init__(self, name: str, default_fields: Optional[Dict[str, Any]] = None):
        self.logger = logging.getLogger(name)
        self.default_fields = default_fields or {}

    def _log(self, level: int, message: str, **kwargs):
        """Log with extra fields"""
        extra_fields = {**self.default_fields, **kwargs}
        record = self.logger.makeRecord(
            self.logger.name,
            level,
            "",
            0,
            message,
            (),
            None
        )
        record.extra_fields = extra_fields
        self.logger.handle(record)

    def debug(self, message: str, **kwargs):
        self._log(logging.DEBUG, message, **kwargs)

    def info(self, message: str, **kwargs):
        self._log(logging.INFO, message, **kwargs)

    def warning(self, message: str, **kwargs):
        self._log(logging.WARNING, message, **kwargs)

    def error(self, message: str, **kwargs):
        self._log(logging.ERROR, message, **kwargs)

    def critical(self, message: str, **kwargs):
        self._log(logging.CRITICAL, message, **kwargs)

    def exception(self, message: str, **kwargs):
        """Log exception with traceback"""
        self.logger.exception(message, extra={'extra_fields': kwargs})
