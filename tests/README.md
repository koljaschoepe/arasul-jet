# Arasul Platform Tests

Automated tests for the Arasul Platform.

## Structure

```
tests/
├── integration/              # Integration tests
│   ├── test_self_healing_llm.py
│   └── __init__.py
├── unit/                     # Unit tests (TBD)
├── pytest.ini                # Pytest configuration
└── README.md                 # This file
```

## Running Tests

### Prerequisites

```bash
pip3 install pytest pytest-timeout requests
```

### Run All Integration Tests

```bash
# From project root
cd /Users/koljaschope/Documents/dev/claude

# Ensure services are running
docker-compose up -d

# Wait for services to be ready
sleep 30

# Run tests
pytest tests/integration/ -v
```

### Run Specific Test

```bash
pytest tests/integration/test_self_healing_llm.py::test_llm_service_health -v
```

### Run Tests Without Slow Tests

```bash
pytest tests/integration/ -v -m "not slow"
```

### Run with Detailed Output

```bash
pytest tests/integration/ -v -s
```

## Integration Tests

### test_self_healing_llm.py

Tests the integration between Self-Healing Engine and LLM Service.

**Tests:**
- `test_llm_service_health`: LLM Service health check
- `test_cache_clear_endpoint`: Cache clear API
- `test_session_reset_endpoint`: Session reset API
- `test_stats_endpoint`: GPU stats API
- `test_healing_engine_integration`: Direct healing engine calls
- `test_api_endpoint_urls_correct`: Configuration validation
- `test_multiple_cache_clears_dont_fail`: Stress test
- `test_session_reset_after_cache_clear`: Sequence test
- `test_health_check_reflects_service_status`: Data structure validation

**Total:** 9 tests

## CI/CD

Tests are run automatically in the CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run Integration Tests
  run: |
    docker-compose up -d
    sleep 30
    pytest tests/integration/ -v
```

## Test Coverage Goals

- Integration Tests: 80%+
- Unit Tests: 80%+
- Self-Healing: 90%+
- GPU Recovery: 90%+

## Troubleshooting

### Tests fail with connection errors

Ensure services are running:
```bash
docker-compose ps
```

Check LLM service health:
```bash
curl http://localhost:11435/health
```

### Tests timeout

Increase timeout in pytest.ini or use:
```bash
pytest tests/ --timeout=120
```

### Import errors

Ensure you're running from project root:
```bash
cd /Users/koljaschope/Documents/dev/claude
pytest tests/
```
