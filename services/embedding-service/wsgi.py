"""WSGI entry point for gunicorn production server."""

from embedding_server import app, load_model, logger

# Load model when worker starts (gunicorn imports this module per worker)
if not load_model():
    logger.error("Failed to load model on WSGI startup")
    raise RuntimeError("Model loading failed")

logger.info("WSGI worker ready with model loaded")
