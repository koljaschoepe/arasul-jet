#!/usr/bin/env python3
"""
ARASUL PLATFORM - Post-Reboot Validation
Validates system state after reboot and updates database
"""

import os
import time
import logging
import psycopg2
import docker
import json
import psutil
import requests
from datetime import datetime
from typing import Dict, Optional

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('post-reboot-validation')

# Configuration
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'postgres-db')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_USER = os.getenv('POSTGRES_USER', 'arasul')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD')
POSTGRES_DB = os.getenv('POSTGRES_DB', 'arasul_db')

METRICS_COLLECTOR_URL = f"http://{os.getenv('METRICS_COLLECTOR_HOST', 'metrics-collector')}:9100"

# Critical services that must be healthy
CRITICAL_SERVICES = [
    'postgres-db',
    'metrics-collector',
    'llm-service',
    'dashboard-backend',
    'minio'
]


def connect_db(max_retries: int = 5) -> Optional[psycopg2.extensions.connection]:
    """Connect to PostgreSQL with retry logic"""
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(
                host=POSTGRES_HOST,
                port=POSTGRES_PORT,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                database=POSTGRES_DB,
                connect_timeout=10
            )
            conn.autocommit = True
            logger.info(f"Connected to PostgreSQL")
            return conn
        except Exception as e:
            logger.warning(f"Database connection attempt {attempt + 1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(5)

    return None


def get_pending_reboot_event(conn) -> Optional[Dict]:
    """Get the most recent pending reboot event"""
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, reason, pre_reboot_state, timestamp
            FROM reboot_events
            WHERE reboot_completed = false
            ORDER BY timestamp DESC
            LIMIT 1
        """)
        result = cursor.fetchone()
        cursor.close()

        if result:
            return {
                'id': result[0],
                'reason': result[1],
                'pre_reboot_state': json.loads(result[2]) if result[2] else {},
                'timestamp': result[3]
            }
        return None
    except Exception as e:
        logger.error(f"Failed to get pending reboot event: {e}")
        return None


def check_service_health() -> Dict[str, Dict]:
    """Check health of all services"""
    try:
        docker_client = docker.from_env()
        containers = docker_client.containers.list(all=True)

        services_status = {}
        for container in containers:
            name = container.name
            status = container.status
            health = 'unknown'

            # Get health status if available
            try:
                inspect = container.attrs
                if 'Health' in inspect.get('State', {}):
                    health = inspect['State']['Health']['Status']
            except:
                pass

            services_status[name] = {
                'status': status,
                'health': health,
                'running': status == 'running'
            }

        return services_status
    except Exception as e:
        logger.error(f"Failed to check services: {e}")
        return {}


def get_current_metrics() -> Dict:
    """Get current system metrics"""
    try:
        response = requests.get(f"{METRICS_COLLECTOR_URL}/metrics", timeout=5)
        return response.json()
    except Exception as e:
        logger.warning(f"Failed to get metrics: {e}")
        return {
            'cpu': 0, 'ram': 0, 'gpu': 0, 'temperature': 0,
            'disk': {'percent': 0}
        }


def validate_post_reboot_state() -> tuple[bool, str]:
    """Validate system state after reboot"""
    logger.info("Validating post-reboot system state...")

    validation_results = []
    all_passed = True

    # 1. Check if all critical services are running
    logger.info("Checking critical services...")
    services = check_service_health()

    for service_name in CRITICAL_SERVICES:
        if service_name not in services:
            validation_results.append(f"❌ Service {service_name} not found")
            all_passed = False
        elif not services[service_name]['running']:
            validation_results.append(f"❌ Service {service_name} not running (status: {services[service_name]['status']})")
            all_passed = False
        elif services[service_name]['health'] == 'unhealthy':
            validation_results.append(f"⚠️  Service {service_name} unhealthy")
            all_passed = False
        else:
            validation_results.append(f"✅ Service {service_name} healthy")

    # 2. Check database connectivity
    logger.info("Checking database connectivity...")
    try:
        conn = connect_db(max_retries=3)
        if conn:
            validation_results.append("✅ Database accessible")
            conn.close()
        else:
            validation_results.append("❌ Database not accessible")
            all_passed = False
    except Exception as e:
        validation_results.append(f"❌ Database error: {e}")
        all_passed = False

    # 3. Check metrics collector
    logger.info("Checking metrics collector...")
    metrics = get_current_metrics()
    if metrics.get('cpu', 0) >= 0:
        validation_results.append("✅ Metrics collector responding")
    else:
        validation_results.append("❌ Metrics collector not responding")
        all_passed = False

    # 4. Check disk space
    logger.info("Checking disk space...")
    try:
        disk = psutil.disk_usage('/')
        if disk.percent < 95:
            validation_results.append(f"✅ Disk usage acceptable ({disk.percent}%)")
        else:
            validation_results.append(f"⚠️  Disk usage still high ({disk.percent}%)")
            all_passed = False
    except Exception as e:
        validation_results.append(f"❌ Disk check failed: {e}")
        all_passed = False

    # 5. Check GPU availability
    logger.info("Checking GPU...")
    try:
        import subprocess
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=name', '--format=csv,noheader'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            validation_results.append(f"✅ GPU available: {result.stdout.strip()}")
        else:
            validation_results.append("⚠️  GPU not detected")
            # Not a failure - might be running without GPU
    except Exception as e:
        validation_results.append(f"⚠️  GPU check skipped: {e}")

    summary = "\n".join(validation_results)
    return all_passed, summary


def update_reboot_event(conn, reboot_id: int, validation_passed: bool, post_state: Dict):
    """Update reboot event with post-reboot state"""
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE reboot_events
            SET reboot_completed = true,
                validation_passed = %s,
                post_reboot_state = %s
            WHERE id = %s
        """, (validation_passed, json.dumps(post_state), reboot_id))
        cursor.close()
        logger.info(f"Updated reboot event {reboot_id}")
    except Exception as e:
        logger.error(f"Failed to update reboot event: {e}")


def log_validation_event(conn, validation_passed: bool, summary: str):
    """Log validation event to self_healing_events"""
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO self_healing_events (
                event_type, severity, description, action_taken, success
            ) VALUES (%s, %s, %s, %s, %s)
        """, (
            'post_reboot_validation',
            'INFO' if validation_passed else 'WARNING',
            f'Post-reboot validation {"passed" if validation_passed else "failed"}',
            summary,
            validation_passed
        ))
        cursor.close()
        logger.info("Logged validation event")
    except Exception as e:
        logger.error(f"Failed to log validation event: {e}")


def main():
    """Main entry point"""
    logger.info("=" * 60)
    logger.info("ARASUL POST-REBOOT VALIDATION")
    logger.info("=" * 60)

    # Wait a bit for services to stabilize
    logger.info("Waiting 30 seconds for services to stabilize...")
    time.sleep(30)

    # Connect to database
    conn = connect_db(max_retries=10)
    if not conn:
        logger.error("Failed to connect to database - cannot perform validation")
        return

    # Check if there's a pending reboot event
    reboot_event = get_pending_reboot_event(conn)

    if not reboot_event:
        logger.info("No pending reboot event found - system started normally")
        conn.close()
        return

    logger.info(f"Found pending reboot event: ID={reboot_event['id']}, Reason={reboot_event['reason']}")
    logger.info(f"Reboot timestamp: {reboot_event['timestamp']}")

    # Validate post-reboot state
    validation_passed, summary = validate_post_reboot_state()

    # Collect post-reboot state
    post_state = {
        'timestamp': datetime.now().isoformat(),
        'validation_passed': validation_passed,
        'services': check_service_health(),
        'metrics': get_current_metrics(),
        'disk_usage': psutil.disk_usage('/').percent,
        'uptime_seconds': int(time.time() - psutil.boot_time()),
        'validation_summary': summary
    }

    # Update reboot event
    update_reboot_event(conn, reboot_event['id'], validation_passed, post_state)

    # Log validation event
    log_validation_event(conn, validation_passed, summary)

    # Print results
    logger.info("=" * 60)
    logger.info("POST-REBOOT VALIDATION RESULTS")
    logger.info("=" * 60)
    logger.info(summary)
    logger.info("=" * 60)

    if validation_passed:
        logger.info("✅ System recovery successful")
    else:
        logger.warning("⚠️  System recovery incomplete - manual intervention may be required")

    conn.close()


if __name__ == '__main__':
    main()
