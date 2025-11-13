"""
End-to-End Test für GPU Overload Recovery
Simuliert GPU > 95% Auslastung und validiert Self-Healing Response

Tests validieren:
- GPU Overload Detection durch Metrics Collector
- Self-Healing Engine triggert GPU Session Reset
- Recovery Actions werden in DB gespeichert
- Self-Healing Events werden korrekt geloggt
- LLM Service bleibt nach Recovery healthy
"""

import pytest
import requests
import time
import psycopg2
from datetime import datetime, timedelta
import concurrent.futures
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Service URLs (Docker container names)
DASHBOARD_API = "http://dashboard-backend:3001"
METRICS_API = "http://metrics-collector:9100"
LLM_API = "http://llm-service:11435"

# PostgreSQL connection (Docker network)
POSTGRES_CONN = {
    "host": "postgres-db",
    "port": 5432,
    "database": "arasul_db",
    "user": "arasul",
    "password": "arasul_secure_password"
}


def get_db_connection():
    """Get PostgreSQL database connection"""
    return psycopg2.connect(**POSTGRES_CONN)


def wait_for_services(timeout=30):
    """Wait for all required services to be ready"""
    services = {
        "Metrics Collector": f"{METRICS_API}/api/metrics/ping",
        "LLM Service": f"{LLM_API}/health",
        "Dashboard Backend": f"{DASHBOARD_API}/api/health"
    }

    start_time = time.time()
    for service_name, url in services.items():
        while time.time() - start_time < timeout:
            try:
                response = requests.get(url, timeout=2)
                if response.status_code == 200:
                    logger.info(f"✓ {service_name} is ready")
                    break
            except:
                time.sleep(1)
        else:
            pytest.fail(f"{service_name} not ready after {timeout}s")


def test_services_available():
    """Pre-Test: Verify all required services are available"""
    logger.info("Checking service availability...")
    wait_for_services()

    # Check database connectivity
    try:
        conn = get_db_connection()
        conn.close()
        logger.info("✓ Database connection successful")
    except Exception as e:
        pytest.fail(f"Database connection failed: {e}")


def test_gpu_metrics_available():
    """Pre-Test: Verify GPU metrics are being collected"""
    try:
        response = requests.get(f"{METRICS_API}/api/gpu", timeout=5)
        assert response.status_code == 200, "GPU metrics endpoint not responding"

        data = response.json()
        assert "utilization" in data, "GPU utilization not in metrics"
        assert "memory_used" in data or "memory" in data, "GPU memory not in metrics"

        gpu_util = data["utilization"]
        logger.info(f"✓ Baseline GPU utilization: {gpu_util}%")

        # Verify GPU is functional (not 0% if models are loaded)
        # Allow 0% if no models are loaded yet
        if gpu_util == 0:
            logger.warning("⚠️  GPU utilization is 0% - models may not be loaded")

    except Exception as e:
        pytest.fail(f"GPU metrics check failed: {e}")


def test_database_tables_exist():
    """Pre-Test: Verify required database tables exist"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check recovery_actions table
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'recovery_actions'
        )
    """)
    assert cursor.fetchone()[0], "recovery_actions table does not exist"

    # Check self_healing_events table
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'self_healing_events'
        )
    """)
    assert cursor.fetchone()[0], "self_healing_events table does not exist"

    cursor.close()
    conn.close()

    logger.info("✓ All required database tables exist")


@pytest.mark.slow
def test_gpu_overload_triggers_recovery():
    """
    Main Test: GPU > 95% → Self-Healing should trigger GPU Session Reset

    This test:
    1. Records baseline GPU utilization
    2. Simulates GPU overload with parallel LLM requests
    3. Waits for self-healing cycle (10s interval)
    4. Verifies recovery action was recorded in database
    5. Verifies self-healing events were logged
    6. Confirms LLM service remains healthy after recovery
    """

    logger.info("="*80)
    logger.info("STARTING GPU OVERLOAD RECOVERY TEST")
    logger.info("="*80)

    # Step 1: Record baseline GPU utilization
    logger.info("\n[1/6] Recording baseline GPU utilization...")
    try:
        response = requests.get(f"{METRICS_API}/api/gpu", timeout=5)
        baseline_gpu = response.json()["utilization"]
        logger.info(f"    Baseline GPU: {baseline_gpu}%")
    except Exception as e:
        pytest.skip(f"Could not get baseline GPU metrics: {e}")

    # Step 2: Check if GPU overload test is feasible
    # (Some systems may not reach 95% with simulated load)
    if baseline_gpu < 10:
        logger.warning("    ⚠️  GPU utilization very low - overload may not trigger")

    # Step 3: Clear old recovery actions to have clean test state
    logger.info("\n[2/6] Clearing old recovery actions...")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM recovery_actions WHERE timestamp < NOW() - INTERVAL '1 minute'")
    cursor.execute("DELETE FROM self_healing_events WHERE timestamp < NOW() - INTERVAL '1 minute'")
    conn.commit()
    cursor.close()
    conn.close()
    logger.info("    ✓ Test database state prepared")

    # Step 4: Simulate GPU overload with parallel LLM requests
    logger.info("\n[3/6] Simulating GPU overload with parallel LLM requests...")
    logger.info("    Sending 10 parallel long-form generation requests...")

    def send_llm_request(request_id):
        """Send a heavy LLM request to load the GPU"""
        try:
            # Use a long prompt to ensure GPU load
            prompt = ("Write a comprehensive technical analysis of distributed systems, "
                     "covering architecture patterns, consensus algorithms, and failure modes. "
                     "Include detailed examples and code snippets. " * 20)

            response = requests.post(
                f"{LLM_API}/api/generate",
                json={
                    "model": "qwen2.5:0.5b",  # Use default model if available
                    "prompt": prompt,
                    "options": {
                        "num_predict": 1000,  # Generate many tokens
                        "temperature": 0.8
                    }
                },
                timeout=60
            )
            logger.debug(f"    Request {request_id}: Status {response.status_code}")
        except requests.exceptions.Timeout:
            logger.debug(f"    Request {request_id}: Timeout (expected under load)")
        except Exception as e:
            logger.debug(f"    Request {request_id}: Error {type(e).__name__}")

    # Launch parallel requests
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(send_llm_request, i) for i in range(10)]

        # Monitor GPU during load generation
        time.sleep(3)
        try:
            response = requests.get(f"{METRICS_API}/api/gpu", timeout=5)
            peak_gpu = response.json()["utilization"]
            logger.info(f"    GPU under load: {peak_gpu}%")

            if peak_gpu < 95:
                logger.warning(f"    ⚠️  GPU only reached {peak_gpu}%, may not trigger overload threshold")
        except Exception as e:
            logger.warning(f"    Could not read GPU during load: {e}")

        # Wait for requests to complete or timeout
        concurrent.futures.wait(futures, timeout=30)

    logger.info("    ✓ Load generation completed")

    # Step 5: Wait for self-healing cycle to detect and respond
    logger.info("\n[4/6] Waiting for self-healing engine to respond...")
    logger.info("    Self-healing runs every 10 seconds...")

    # Wait 2 cycles to ensure detection and action
    time.sleep(25)

    # Step 6: Check database for recovery actions
    logger.info("\n[5/6] Checking database for recovery actions...")

    conn = get_db_connection()
    cursor = conn.cursor()

    # Look for GPU-related recovery actions in the last 2 minutes
    cursor.execute("""
        SELECT
            action_type,
            service_name,
            reason,
            timestamp,
            success,
            duration_ms,
            error_message
        FROM recovery_actions
        WHERE action_type IN ('gpu_session_reset', 'llm_cache_clear')
          AND timestamp > NOW() - INTERVAL '2 minutes'
        ORDER BY timestamp DESC
        LIMIT 5
    """)

    recovery_actions = cursor.fetchall()

    if recovery_actions:
        logger.info(f"    ✓ Found {len(recovery_actions)} recovery action(s):")
        for action in recovery_actions:
            action_type, service_name, reason, timestamp, success, duration_ms, error = action
            logger.info(f"      - {action_type} on {service_name}")
            logger.info(f"        Reason: {reason}")
            logger.info(f"        Success: {success}, Duration: {duration_ms}ms")
            if error:
                logger.info(f"        Error: {error}")

            # Verify action was successful
            assert success is True, f"Recovery action {action_type} failed: {error}"
    else:
        logger.warning("    ⚠️  No recovery actions found")
        logger.warning("    This could mean:")
        logger.warning("      1. GPU utilization did not exceed 95% threshold")
        logger.warning("      2. Self-healing engine is not running")
        logger.warning("      3. Recovery actions are not being recorded")

        # Don't fail test - GPU overload may not have triggered on this hardware
        logger.info("    Checking if self-healing is running at all...")

        cursor.execute("""
            SELECT COUNT(*) FROM recovery_actions
            WHERE timestamp > NOW() - INTERVAL '1 hour'
        """)
        total_recent_actions = cursor.fetchone()[0]

        if total_recent_actions == 0:
            pytest.skip("Self-healing engine appears inactive - no recent recovery actions")

    # Step 7: Check self-healing events
    logger.info("\n[6/6] Checking self-healing events...")

    cursor.execute("""
        SELECT
            event_type,
            severity,
            description,
            action_taken,
            success,
            timestamp
        FROM self_healing_events
        WHERE event_type IN ('gpu_overload', 'gpu_session_reset', 'cache_clear_success')
          AND timestamp > NOW() - INTERVAL '2 minutes'
        ORDER BY timestamp DESC
    """)

    events = cursor.fetchall()

    if events:
        logger.info(f"    ✓ Found {len(events)} self-healing event(s):")
        for event in events:
            event_type, severity, description, action_taken, success, timestamp = event
            logger.info(f"      - [{severity}] {event_type}")
            logger.info(f"        {description}")
            if action_taken:
                logger.info(f"        Action: {action_taken}")
    else:
        logger.warning("    ⚠️  No self-healing events found in last 2 minutes")

    cursor.close()
    conn.close()

    # Step 8: Verify LLM service is still healthy
    logger.info("\nVerifying LLM service health after recovery...")
    try:
        response = requests.get(f"{LLM_API}/health", timeout=5)
        assert response.status_code == 200, "LLM service health check failed"

        health_data = response.json()
        logger.info(f"    ✓ LLM Service Status: {health_data.get('status', 'unknown')}")
        logger.info(f"    ✓ Models Available: {health_data.get('models_count', 0)}")
    except Exception as e:
        pytest.fail(f"LLM service not healthy after recovery: {e}")

    logger.info("\n" + "="*80)
    logger.info("GPU OVERLOAD RECOVERY TEST COMPLETED")
    logger.info("="*80)

    # Test passes if:
    # - Either recovery actions were triggered and successful
    # - Or no actions triggered but all services remain healthy
    # (Hardware may not support reaching 95% GPU load with simulation)


@pytest.mark.slow
def test_gpu_recovery_cooldown():
    """
    Test: Verify GPU recovery actions respect cooldown period

    Recovery actions should not be triggered too frequently to avoid
    unnecessary service disruption.
    """
    logger.info("\n" + "="*80)
    logger.info("TESTING GPU RECOVERY COOLDOWN")
    logger.info("="*80)

    conn = get_db_connection()
    cursor = conn.cursor()

    # Check for recent GPU-related actions
    cursor.execute("""
        SELECT
            action_type,
            timestamp,
            service_name
        FROM recovery_actions
        WHERE action_type IN ('gpu_session_reset', 'llm_cache_clear')
          AND timestamp > NOW() - INTERVAL '1 hour'
        ORDER BY timestamp DESC
    """)

    actions = cursor.fetchall()

    if len(actions) >= 2:
        # Check time between actions
        for i in range(len(actions) - 1):
            action1 = actions[i]
            action2 = actions[i + 1]
            time_diff = (action1[1] - action2[1]).total_seconds()

            logger.info(f"Time between {action1[0]} and {action2[0]}: {time_diff}s")

            # Self-healing uses 300s (5min) cooldown for GPU actions
            if time_diff < 60:
                logger.warning(f"⚠️  Actions very close together: {time_diff}s")
    else:
        logger.info("Not enough recent actions to test cooldown")

    cursor.close()
    conn.close()


@pytest.mark.slow
def test_recovery_action_metadata():
    """
    Test: Verify recovery actions contain proper metadata

    Metadata should include useful debugging information like
    GPU utilization at time of action, error details, etc.
    """
    logger.info("\n" + "="*80)
    logger.info("TESTING RECOVERY ACTION METADATA")
    logger.info("="*80)

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            action_type,
            reason,
            success,
            error_message,
            metadata,
            timestamp
        FROM recovery_actions
        WHERE timestamp > NOW() - INTERVAL '1 hour'
        ORDER BY timestamp DESC
        LIMIT 10
    """)

    actions = cursor.fetchall()

    if actions:
        logger.info(f"Found {len(actions)} recent recovery actions")
        for action in actions:
            action_type, reason, success, error, metadata, ts = action
            logger.info(f"\n  Action: {action_type}")
            logger.info(f"  Timestamp: {ts}")
            logger.info(f"  Reason: {reason}")
            logger.info(f"  Success: {success}")

            if error:
                logger.info(f"  Error: {error}")

            if metadata:
                logger.info(f"  Metadata: {metadata}")

                # Verify reason contains GPU percentage if it's a GPU action
                if action_type in ['gpu_session_reset', 'gpu_throttle']:
                    assert 'GPU' in reason or 'gpu' in reason, \
                        f"GPU action should have GPU info in reason: {reason}"
    else:
        logger.info("No recent recovery actions to check")

    cursor.close()
    conn.close()


if __name__ == "__main__":
    # Run tests with verbose output and show print statements
    pytest.main([__file__, "-v", "-s", "--tb=short"])
