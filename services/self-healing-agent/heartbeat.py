#!/usr/bin/env python3
"""
Self-Healing Agent Heartbeat Health Check

Provides HTTP endpoint for Docker health checks and monitors
the agent's last check timestamp to ensure it's actively running.
"""

import os
import sys
import time
import json
import threading
from datetime import datetime, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Configuration
HEARTBEAT_PORT = int(os.getenv('HEARTBEAT_PORT', '9200'))
HEARTBEAT_FILE = '/tmp/self_healing_heartbeat.json'
MAX_HEARTBEAT_AGE_SECONDS = 60  # Consider unhealthy if no heartbeat in 60s
CHECK_INTERVAL_SECONDS = 10  # Expected interval between healing checks

class HealthCheckHandler(BaseHTTPRequestHandler):
    """HTTP request handler for health check endpoint"""

    def log_message(self, format, *args):
        """Suppress default HTTP logging"""
        pass

    def do_GET(self):
        """Handle GET requests for health check"""
        if self.path == '/health' or self.path == '/healthz':
            self.handle_health_check()
        elif self.path == '/metrics':
            self.handle_metrics()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not Found')

    def handle_health_check(self):
        """Perform comprehensive health check"""
        health_status = check_health()

        status_code = 200 if health_status['healthy'] else 503
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()

        response = json.dumps(health_status, indent=2)
        self.wfile.write(response.encode())

    def handle_metrics(self):
        """Return Prometheus-style metrics"""
        metrics = get_metrics()

        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; version=0.0.4')
        self.end_headers()

        self.wfile.write(metrics.encode())


def check_health():
    """
    Perform health check by validating heartbeat file

    Returns:
        dict: Health status with details
    """
    now = datetime.now()
    heartbeat_file = Path(HEARTBEAT_FILE)

    # Check if heartbeat file exists
    if not heartbeat_file.exists():
        return {
            'healthy': False,
            'status': 'unhealthy',
            'reason': 'Heartbeat file does not exist',
            'timestamp': now.isoformat(),
            'last_heartbeat': None,
            'seconds_since_heartbeat': None,
        }

    # Read heartbeat file
    try:
        with open(heartbeat_file, 'r') as f:
            heartbeat_data = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        return {
            'healthy': False,
            'status': 'unhealthy',
            'reason': f'Failed to read heartbeat file: {str(e)}',
            'timestamp': now.isoformat(),
            'last_heartbeat': None,
            'seconds_since_heartbeat': None,
        }

    # Parse last heartbeat timestamp
    last_heartbeat_str = heartbeat_data.get('timestamp')
    if not last_heartbeat_str:
        return {
            'healthy': False,
            'status': 'unhealthy',
            'reason': 'Heartbeat file missing timestamp',
            'timestamp': now.isoformat(),
            'last_heartbeat': None,
            'seconds_since_heartbeat': None,
        }

    try:
        last_heartbeat = datetime.fromisoformat(last_heartbeat_str.replace('Z', '+00:00'))
    except ValueError as e:
        return {
            'healthy': False,
            'status': 'unhealthy',
            'reason': f'Invalid heartbeat timestamp: {str(e)}',
            'timestamp': now.isoformat(),
            'last_heartbeat': last_heartbeat_str,
            'seconds_since_heartbeat': None,
        }

    # Calculate time since last heartbeat
    if last_heartbeat.tzinfo is None:
        # Make timezone-aware if naive
        last_heartbeat = last_heartbeat.replace(tzinfo=None)
        now = now.replace(tzinfo=None)

    time_since_heartbeat = now - last_heartbeat
    seconds_since_heartbeat = time_since_heartbeat.total_seconds()

    # Check if heartbeat is recent enough
    if seconds_since_heartbeat > MAX_HEARTBEAT_AGE_SECONDS:
        return {
            'healthy': False,
            'status': 'unhealthy',
            'reason': f'Heartbeat too old: {seconds_since_heartbeat:.1f}s > {MAX_HEARTBEAT_AGE_SECONDS}s',
            'timestamp': now.isoformat(),
            'last_heartbeat': last_heartbeat.isoformat(),
            'seconds_since_heartbeat': seconds_since_heartbeat,
            'max_age_seconds': MAX_HEARTBEAT_AGE_SECONDS,
            'check_count': heartbeat_data.get('check_count', 0),
        }

    # Determine status based on age
    if seconds_since_heartbeat < CHECK_INTERVAL_SECONDS * 2:
        status = 'healthy'
    else:
        status = 'degraded'

    return {
        'healthy': True,
        'status': status,
        'timestamp': now.isoformat(),
        'last_heartbeat': last_heartbeat.isoformat(),
        'seconds_since_heartbeat': seconds_since_heartbeat,
        'max_age_seconds': MAX_HEARTBEAT_AGE_SECONDS,
        'check_count': heartbeat_data.get('check_count', 0),
        'last_action': heartbeat_data.get('last_action'),
    }


def get_metrics():
    """
    Get Prometheus-style metrics

    Returns:
        str: Prometheus metrics
    """
    health_status = check_health()

    metrics = []

    # Health status metric (1 = healthy, 0 = unhealthy)
    health_value = 1 if health_status['healthy'] else 0
    metrics.append(f'self_healing_agent_healthy {health_value}')

    # Seconds since last heartbeat
    if health_status.get('seconds_since_heartbeat') is not None:
        metrics.append(f'self_healing_agent_seconds_since_heartbeat {health_status["seconds_since_heartbeat"]:.2f}')

    # Check count
    check_count = health_status.get('check_count', 0)
    metrics.append(f'self_healing_agent_check_count {check_count}')

    # Timestamp of metrics
    metrics.append(f'# HELP self_healing_agent_healthy Self-Healing Agent health status (1=healthy, 0=unhealthy)')
    metrics.append(f'# TYPE self_healing_agent_healthy gauge')

    return '\n'.join(metrics) + '\n'


def update_heartbeat(check_count=None, last_action=None):
    """
    Update heartbeat file with current timestamp

    Args:
        check_count (int, optional): Number of checks performed
        last_action (str, optional): Last action taken by agent
    """
    heartbeat_data = {
        'timestamp': datetime.now().isoformat(),
        'check_count': check_count,
        'last_action': last_action,
    }

    heartbeat_file = Path(HEARTBEAT_FILE)
    heartbeat_file.parent.mkdir(parents=True, exist_ok=True)

    with open(heartbeat_file, 'w') as f:
        json.dump(heartbeat_data, f)


def run_heartbeat_server():
    """Run HTTP server for health checks"""
    server_address = ('', HEARTBEAT_PORT)
    httpd = HTTPServer(server_address, HealthCheckHandler)

    print(f'[Heartbeat] Starting health check server on port {HEARTBEAT_PORT}', file=sys.stderr)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('[Heartbeat] Server stopped', file=sys.stderr)
        httpd.shutdown()


def main():
    """Main entry point for standalone execution"""
    import argparse

    parser = argparse.ArgumentParser(description='Self-Healing Agent Heartbeat Server')
    parser.add_argument('--port', type=int, default=HEARTBEAT_PORT,
                        help=f'Port to listen on (default: {HEARTBEAT_PORT})')
    parser.add_argument('--test', action='store_true',
                        help='Test mode: create test heartbeat and exit')

    args = parser.parse_args()

    if args.test:
        print('[Heartbeat] Test mode: Creating test heartbeat')
        update_heartbeat(check_count=1, last_action='test')
        health = check_health()
        print(json.dumps(health, indent=2))
        sys.exit(0 if health['healthy'] else 1)

    # Run server
    global HEARTBEAT_PORT
    HEARTBEAT_PORT = args.port

    run_heartbeat_server()


if __name__ == '__main__':
    main()
