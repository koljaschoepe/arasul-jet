"""
Integration Tests für Self-Healing Engine <-> LLM Service
Tests verifizieren dass Self-Healing Engine korrekt mit LLM Management API kommuniziert
"""

import pytest
import requests
import time
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../services/self-healing-agent'))

# LLM Management API URL (Port 11435, not 11434!)
LLM_API_URL = "http://llm-service:11435"


def test_llm_service_health():
    """Test: LLM Service ist erreichbar und healthy"""
    response = requests.get(f"{LLM_API_URL}/health", timeout=5)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "healthy"
    assert "models_count" in data

    print(f"✓ LLM Service is healthy with {data['models_count']} models")


def test_cache_clear_endpoint():
    """Test: Cache Clear Endpoint funktioniert"""
    response = requests.post(f"{LLM_API_URL}/api/cache/clear", timeout=10)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "success"
    assert "cache cleared" in data["message"].lower()

    print(f"✓ Cache clear successful: {data['message']}")


def test_session_reset_endpoint():
    """Test: Session Reset Endpoint funktioniert"""
    response = requests.post(f"{LLM_API_URL}/api/session/reset", timeout=15)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "success"
    assert "session reset" in data["message"].lower()

    print(f"✓ Session reset successful: {data['message']}")


def test_stats_endpoint():
    """Test: Stats Endpoint liefert GPU Metrics"""
    response = requests.get(f"{LLM_API_URL}/api/stats", timeout=5)
    assert response.status_code == 200

    data = response.json()
    assert "gpu_utilization" in data
    assert "gpu_memory" in data
    assert "process_memory_mb" in data

    print(f"✓ GPU Stats: {data['gpu_utilization']} utilization, {data['gpu_memory']} memory")


def test_healing_engine_integration():
    """
    Test: Self-Healing Engine kann LLM Service APIs aufrufen
    Simuliert Self-Healing Aktionen
    """
    try:
        # Import healing engine functions
        from healing_engine import HealingEngine

        # Create healing engine instance
        engine = HealingEngine()

        # Test clear_llm_cache
        result = engine.clear_llm_cache()
        assert result == True, "clear_llm_cache should return True"
        print("✓ Healing Engine can call clear_llm_cache()")

        # Wait a bit
        time.sleep(2)

        # Test reset_gpu_session
        result = engine.reset_gpu_session()
        assert result == True, "reset_gpu_session should return True"
        print("✓ Healing Engine can call reset_gpu_session()")

    except ImportError as e:
        pytest.skip(f"Could not import healing_engine: {e}")


def test_api_endpoint_urls_correct():
    """Test: Verifiziere dass healing_engine.py die korrekten URLs verwendet"""
    try:
        with open('services/self-healing-agent/healing_engine.py', 'r') as f:
            content = f.read()

        # Check for correct port (11435, not 11434)
        assert ':11435' in content, "LLM_SERVICE_URL should use port 11435 (Management API)"

        # Check for correct API paths
        assert '/api/cache/clear' in content, "Should have /api/cache/clear endpoint"
        assert '/api/session/reset' in content, "Should have /api/session/reset endpoint"

        print("✓ healing_engine.py uses correct LLM Management API URLs")

    except FileNotFoundError:
        pytest.skip("healing_engine.py not found")


@pytest.mark.slow
def test_multiple_cache_clears_dont_fail():
    """Test: Multiple cache clears in quick succession don't cause errors"""
    for i in range(3):
        response = requests.post(f"{LLM_API_URL}/api/cache/clear", timeout=10)
        assert response.status_code == 200
        time.sleep(1)

    print("✓ Multiple cache clears succeeded")


@pytest.mark.slow
def test_session_reset_after_cache_clear():
    """Test: Session reset works after cache clear"""
    # First clear cache
    response1 = requests.post(f"{LLM_API_URL}/api/cache/clear", timeout=10)
    assert response1.status_code == 200

    time.sleep(2)

    # Then reset session
    response2 = requests.post(f"{LLM_API_URL}/api/session/reset", timeout=15)
    assert response2.status_code == 200

    print("✓ Session reset works after cache clear")


def test_health_check_reflects_service_status():
    """Test: Health check returns accurate service status"""
    # Call health check
    response = requests.get(f"{LLM_API_URL}/health", timeout=5)
    assert response.status_code == 200

    data = response.json()

    # Health check should return models list
    assert isinstance(data.get("models"), list)
    assert isinstance(data.get("models_count"), int)

    print(f"✓ Health check reports {len(data['models'])} models available")


if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v", "-s"])
