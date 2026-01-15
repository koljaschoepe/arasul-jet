#!/usr/bin/env python3
"""
ARASUL PLATFORM - Telegram Bot Health Check Server
Flask-based health endpoint for Docker healthchecks
"""

import os
import time
import threading
import logging
from flask import Flask, jsonify

logger = logging.getLogger('telegram-bot.health')

app = Flask(__name__)

# Global state for health tracking
health_state = {
    'bot_running': False,
    'last_update': None,
    'start_time': time.time(),
    'messages_sent': 0,
    'messages_received': 0,
    'errors': 0
}


def update_health(bot_running: bool = None, message_sent: bool = False,
                  message_received: bool = False, error: bool = False):
    """Update health state from bot."""
    if bot_running is not None:
        health_state['bot_running'] = bot_running
    health_state['last_update'] = time.time()
    if message_sent:
        health_state['messages_sent'] += 1
    if message_received:
        health_state['messages_received'] += 1
    if error:
        health_state['errors'] += 1


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for Docker."""
    uptime = time.time() - health_state['start_time']

    # Determine health status
    is_healthy = health_state['bot_running']

    # Check for stale updates (no update in 60s = potentially stuck)
    if health_state['last_update']:
        time_since_update = time.time() - health_state['last_update']
        if time_since_update > 60:
            is_healthy = False

    response = {
        'status': 'healthy' if is_healthy else 'unhealthy',
        'service': 'telegram-bot',
        'bot_running': health_state['bot_running'],
        'uptime_seconds': round(uptime, 2),
        'messages_sent': health_state['messages_sent'],
        'messages_received': health_state['messages_received'],
        'errors': health_state['errors'],
        'timestamp': time.time()
    }

    status_code = 200 if is_healthy else 503
    return jsonify(response), status_code


@app.route('/', methods=['GET'])
def root():
    """Root endpoint with service info."""
    return jsonify({
        'service': 'Arasul Telegram Bot',
        'version': '1.0.0',
        'health_endpoint': '/health',
        'timestamp': time.time()
    })


def run_health_server(port: int = 8090):
    """Run the Flask health server in a separate thread."""
    logger.info(f"Starting health server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False, threaded=True)


def start_health_server_thread(port: int = 8090):
    """Start health server in background thread."""
    thread = threading.Thread(target=run_health_server, args=(port,), daemon=True)
    thread.start()
    logger.info(f"Health server thread started on port {port}")
    return thread


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    run_health_server()
