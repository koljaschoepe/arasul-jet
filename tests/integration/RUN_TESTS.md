# Running Self-Healing ↔ LLM Integration Tests

## Prerequisites

1. **Docker Compose Services Running**
   ```bash
   cd /Users/koljaschope/Documents/dev/claude
   docker-compose up -d
   ```

2. **Wait for Services**
   ```bash
   # Wait ~30 seconds for all services to be healthy
   sleep 30

   # Check LLM service health
   curl http://localhost:11435/health
   # Should return: {"status":"healthy",...}
   ```

3. **Install Test Dependencies**
   ```bash
   pip3 install pytest pytest-timeout requests
   ```

## Run Tests

### All Tests

```bash
cd /Users/koljaschope/Documents/dev/claude
pytest tests/integration/test_self_healing_llm.py -v
```

### With Detailed Output

```bash
pytest tests/integration/test_self_healing_llm.py -v -s
```

### Specific Test

```bash
pytest tests/integration/test_self_healing_llm.py::test_llm_service_health -v
```

### Skip Slow Tests

```bash
pytest tests/integration/test_self_healing_llm.py -v -m "not slow"
```

## Expected Output

```
============================= test session starts ==============================
collected 9 items

tests/integration/test_self_healing_llm.py::test_llm_service_health PASSED
tests/integration/test_self_healing_llm.py::test_cache_clear_endpoint PASSED
tests/integration/test_self_healing_llm.py::test_session_reset_endpoint PASSED
tests/integration/test_self_healing_llm.py::test_stats_endpoint PASSED
tests/integration/test_self_healing_llm.py::test_healing_engine_integration PASSED
tests/integration/test_self_healing_llm.py::test_api_endpoint_urls_correct PASSED
tests/integration/test_self_healing_llm.py::test_multiple_cache_clears_dont_fail PASSED
tests/integration/test_self_healing_llm.py::test_session_reset_after_cache_clear PASSED
tests/integration/test_self_healing_llm.py::test_health_check_reflects_service_status PASSED

============================== 9 passed in 15.34s ===============================
```

## Troubleshooting

### Connection Refused

**Problem:** `requests.exceptions.ConnectionError: Connection refused`

**Solution:**
```bash
# Check if LLM service is running
docker ps | grep llm-service

# Check if port is exposed
docker port llm-service

# Check service logs
docker logs llm-service
```

### Test Hangs

**Problem:** Test hangs indefinitely

**Solution:**
- Increase timeout: `pytest ... --timeout=120`
- Check if Ollama is stuck (restart container)
- Check Docker resources

### Import Error

**Problem:** `ModuleNotFoundError: No module named 'healing_engine'`

**Solution:**
```bash
# Ensure running from project root
cd /Users/koljaschope/Documents/dev/claude
pytest tests/integration/test_self_healing_llm.py -v
```

### Service Unhealthy

**Problem:** Test fails with "Ollama API not responding"

**Solution:**
```bash
# Restart LLM service
docker-compose restart llm-service

# Wait for service to be ready
sleep 30

# Check health manually
curl http://localhost:11435/health
```

## CI/CD Integration

Add to `.github/workflows/test.yml`:

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Start Services
        run: |
          docker-compose up -d
          sleep 30

      - name: Install Test Dependencies
        run: pip3 install pytest pytest-timeout requests

      - name: Run Integration Tests
        run: pytest tests/integration/test_self_healing_llm.py -v

      - name: Stop Services
        if: always()
        run: docker-compose down
```

## Test Maintenance

### Adding New Tests

1. Add test function to `test_self_healing_llm.py`
2. Follow naming convention: `test_<description>`
3. Add docstring
4. Use appropriate markers (`@pytest.mark.slow` if >5s)
5. Add assertions with messages
6. Add print statements for debugging

### Updating Tests

If LLM API changes:
1. Update `LLM_API_URL` if port changes
2. Update assertions if response format changes
3. Update timeout values if needed
4. Re-run all tests to ensure no regressions
