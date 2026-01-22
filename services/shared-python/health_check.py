"""
Health Check Server
Flask-based health endpoint for Docker healthchecks
"""

import os
import time
import threading
import logging
from typing import Dict, Any, Optional, Callable

from flask import Flask, jsonify

logger = logging.getLogger(__name__)


class HealthState:
    """Thread-safe health state tracker"""

    def __init__(self, service_name: str):
        self.service_name = service_name
        self._state = {
            'healthy': False,
            'ready': False,
            'start_time': time.time(),
            'last_update': None,
            'metrics': {},
            'errors': 0,
            'details': {}
        }
        self._lock = threading.Lock()

    def set_healthy(self, healthy: bool):
        """Update health status"""
        with self._lock:
            self._state['healthy'] = healthy
            self._state['last_update'] = time.time()

    def set_ready(self, ready: bool):
        """Update readiness status"""
        with self._lock:
            self._state['ready'] = ready
            self._state['last_update'] = time.time()

    def update_metric(self, name: str, value: Any):
        """Update a health metric"""
        with self._lock:
            self._state['metrics'][name] = value
            self._state['last_update'] = time.time()

    def record_error(self):
        """Increment error counter"""
        with self._lock:
            self._state['errors'] += 1

    def set_detail(self, key: str, value: Any):
        """Set a detail field"""
        with self._lock:
            self._state['details'][key] = value

    def get_state(self) -> Dict[str, Any]:
        """Get current health state"""
        with self._lock:
            uptime = time.time() - self._state['start_time']
            return {
                'service': self.service_name,
                'status': 'healthy' if self._state['healthy'] else 'unhealthy',
                'ready': self._state['ready'],
                'uptime_seconds': round(uptime, 2),
                'errors': self._state['errors'],
                'metrics': self._state['metrics'].copy(),
                'details': self._state['details'].copy(),
                'last_update': self._state['last_update'],
                'timestamp': time.time()
            }

    @property
    def is_healthy(self) -> bool:
        """Check if service is healthy"""
        with self._lock:
            # Consider unhealthy if no update in 60 seconds
            if self._state['last_update']:
                time_since_update = time.time() - self._state['last_update']
                if time_since_update > 60:
                    return False
            return self._state['healthy']

    @property
    def is_ready(self) -> bool:
        """Check if service is ready"""
        with self._lock:
            return self._state['ready']


def create_health_app(
    service_name: str,
    health_state: Optional[HealthState] = None,
    custom_checks: Optional[Dict[str, Callable[[], bool]]] = None
) -> Flask:
    """
    Create a Flask app with health endpoints.

    Args:
        service_name: Name of the service
        health_state: Optional HealthState instance to use
        custom_checks: Optional dict of name -> check_function

    Returns:
        Flask app with /health, /ready, and / endpoints

    Example:
        app = create_health_app("my-service")
        app.run(host='0.0.0.0', port=8080)
    """
    app = Flask(service_name)
    state = health_state or HealthState(service_name)
    checks = custom_checks or {}

    @app.route('/health', methods=['GET'])
    def health_check():
        """Liveness probe - is the service running?"""
        # Run custom health checks
        all_checks_pass = True
        check_results = {}

        for check_name, check_func in checks.items():
            try:
                result = check_func()
                check_results[check_name] = result
                if not result:
                    all_checks_pass = False
            except Exception as e:
                check_results[check_name] = False
                check_results[f"{check_name}_error"] = str(e)
                all_checks_pass = False

        response = state.get_state()
        response['checks'] = check_results

        is_healthy = state.is_healthy and all_checks_pass
        response['status'] = 'healthy' if is_healthy else 'unhealthy'

        status_code = 200 if is_healthy else 503
        return jsonify(response), status_code

    @app.route('/ready', methods=['GET'])
    def readiness_check():
        """Readiness probe - is the service ready to accept traffic?"""
        response = {
            'service': service_name,
            'ready': state.is_ready,
            'timestamp': time.time()
        }
        status_code = 200 if state.is_ready else 503
        return jsonify(response), status_code

    @app.route('/', methods=['GET'])
    def root():
        """Service info endpoint"""
        return jsonify({
            'service': service_name,
            'version': os.getenv('SERVICE_VERSION', '1.0.0'),
            'health_endpoint': '/health',
            'ready_endpoint': '/ready',
            'timestamp': time.time()
        })

    return app, state


class HealthServer:
    """
    Background health check server.

    Usage:
        health = HealthServer("my-service", port=8080)
        health.start()

        # Update health status
        health.state.set_healthy(True)
        health.state.update_metric("requests", 100)

        # On shutdown
        health.stop()
    """

    def __init__(
        self,
        service_name: str,
        port: int = 8080,
        custom_checks: Optional[Dict[str, Callable[[], bool]]] = None
    ):
        self.service_name = service_name
        self.port = port
        self.app, self.state = create_health_app(service_name, custom_checks=custom_checks)
        self._thread: Optional[threading.Thread] = None
        self._running = False

    def start(self):
        """Start the health server in a background thread"""
        if self._running:
            return

        def run_server():
            # Suppress Flask/Werkzeug logs
            log = logging.getLogger('werkzeug')
            log.setLevel(logging.WARNING)

            self.app.run(
                host='0.0.0.0',
                port=self.port,
                debug=False,
                use_reloader=False,
                threaded=True
            )

        self._thread = threading.Thread(target=run_server, daemon=True)
        self._thread.start()
        self._running = True
        logger.info(f"Health server started on port {self.port}")

    def stop(self):
        """Stop the health server"""
        self._running = False
        # Note: Flask doesn't have a clean shutdown from a thread
        # The daemon thread will be killed when the main process exits

    def set_healthy(self, healthy: bool = True):
        """Convenience method to set healthy status"""
        self.state.set_healthy(healthy)

    def set_ready(self, ready: bool = True):
        """Convenience method to set ready status"""
        self.state.set_ready(ready)
