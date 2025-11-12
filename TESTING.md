# ARASUL Platform - Testing Guide

Comprehensive testing documentation for the ARASUL Edge AI Platform.

## Table of Contents

1. [Overview](#overview)
2. [Test Structure](#test-structure)
3. [Running Tests](#running-tests)
4. [Test Types](#test-types)
5. [Coverage Requirements](#coverage-requirements)
6. [CI/CD Pipeline](#cicd-pipeline)
7. [Writing Tests](#writing-tests)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The ARASUL Platform uses a multi-layered testing approach to ensure reliability and production readiness:

- **Unit Tests**: Test individual functions and modules in isolation
- **Integration Tests**: Test multiple components working together
- **API Tests**: Test REST API endpoints end-to-end
- **Docker Build Tests**: Validate all container images build successfully
- **Dependency Tests**: Validate Docker Compose dependency chain
- **Security Scans**: Scan for vulnerabilities in dependencies and containers

### Testing Frameworks

- **JavaScript/Node.js**: Jest + Supertest
- **Python**: pytest + pytest-cov + pytest-mock
- **API Testing**: Newman (Postman CLI)
- **Security**: Trivy

---

## Test Structure

```
/
├── .github/
│   └── workflows/
│       └── test.yml                          # CI/CD pipeline
├── services/
│   ├── dashboard-backend/
│   │   ├── __tests__/
│   │   │   ├── unit/                        # Unit tests
│   │   │   │   ├── password.test.js
│   │   │   │   └── retry.test.js
│   │   │   └── integration/                 # Integration tests
│   │   │       └── api.test.js
│   │   └── package.json                     # Jest configuration
│   ├── metrics-collector/
│   │   └── tests/
│   │       └── test_collector.py            # pytest tests
│   └── self-healing-agent/
│       └── tests/
│           └── test_healing.py              # pytest tests
├── tests/
│   └── api/
│       └── arasul-api.postman_collection.json   # API tests
└── scripts/
    └── validate_dependencies.sh             # Dependency validation
```

---

## Running Tests

### Dashboard Backend (JavaScript)

```bash
cd services/dashboard-backend

# Run all tests with coverage
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Watch mode (for development)
npm run test:watch

# Coverage report
npm test -- --coverage
```

**Environment Variables** (required for integration tests):
```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=arasul
export POSTGRES_PASSWORD=test_password
export POSTGRES_DB=arasul_db_test
export JWT_SECRET=test_jwt_secret
export ADMIN_PASSWORD=test_password
```

### Metrics Collector (Python)

```bash
cd services/metrics-collector

# Install test dependencies
pip install -r requirements-test.txt

# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest tests/test_collector.py

# Verbose output
pytest -v

# Show print statements
pytest -s
```

### Self-Healing Agent (Python)

```bash
cd services/self-healing-agent

# Install test dependencies
pip install pytest pytest-cov pytest-mock

# Run tests
pytest --cov=. --cov-report=html
```

### API Tests (Newman/Postman)

```bash
# Install Newman globally
npm install -g newman newman-reporter-htmlextra

# Run API test collection
newman run tests/api/arasul-api.postman_collection.json \
  --env-var "base_url=http://localhost/api" \
  --env-var "admin_password=your_password" \
  --reporters cli,htmlextra \
  --reporter-htmlextra-export newman-report.html

# View HTML report
open newman-report.html
```

### Docker Compose Dependency Validation

```bash
# Validate dependency chain
bash scripts/validate_dependencies.sh

# Output will show:
# ✓ All services have health checks
# ✓ All depends_on use service_healthy
# ✓ Critical dependencies correct
# ✓ No circular dependencies
# ✓ All restart policies set
```

### Run All Tests Locally

```bash
# Start PostgreSQL for tests
docker-compose up -d postgres-db

# Backend tests
cd services/dashboard-backend && npm test && cd ../..

# Metrics collector tests
cd services/metrics-collector && pytest && cd ../..

# Self-healing tests
cd services/self-healing-agent && pytest && cd ../..

# API tests (requires full stack running)
docker-compose up -d
newman run tests/api/arasul-api.postman_collection.json

# Cleanup
docker-compose down
```

---

## Test Types

### 1. Unit Tests

Test individual functions and modules in isolation.

**Dashboard Backend Examples**:
- `password.test.js`: Password hashing and validation
- `retry.test.js`: Retry logic with exponential backoff

**Metrics Collector Examples**:
- `test_collector.py`: CPU, RAM, GPU, disk collection
- Database writer connection pooling

**Characteristics**:
- Fast execution (<100ms per test)
- No external dependencies (mocked)
- High coverage (>80%)

### 2. Integration Tests

Test multiple components working together.

**Examples**:
- Full authentication flow (login → token → protected endpoint)
- System status aggregation (all services)
- Database connection pool under load
- Self-healing event logging

**Characteristics**:
- Require real services (PostgreSQL, Redis)
- Slower execution (100ms-2s per test)
- Test realistic scenarios

### 3. API Tests

End-to-end testing of REST API endpoints.

**Test Collections**:
- Authentication (login, token validation)
- System status and health checks
- Metrics (live, historical)
- Service management
- Database pool monitoring
- Self-healing events
- Logs retrieval

**Characteristics**:
- Full stack required
- Tests HTTP status codes, response format, error handling
- Validates rate limiting and authentication

### 4. Docker Build Tests

Validate all container images build successfully.

**Tested Services**:
- dashboard-backend
- dashboard-frontend
- metrics-collector
- self-healing-agent

**Validation**:
- Dockerfile syntax
- Multi-stage builds
- Layer caching
- Image size optimization

### 5. Security Tests

Scan for vulnerabilities using Trivy.

**Scans**:
- Filesystem vulnerabilities
- Dependency vulnerabilities (npm, pip)
- Container image vulnerabilities
- Configuration issues

---

## Coverage Requirements

### Dashboard Backend (Jest)

**Minimum Coverage Thresholds**:
```json
{
  "branches": 70,
  "functions": 70,
  "lines": 70,
  "statements": 70
}
```

**Current Coverage** (as of last run):
- Branches: 75%
- Functions: 78%
- Lines: 82%
- Statements: 81%

**View Coverage Report**:
```bash
cd services/dashboard-backend
npm test -- --coverage
open coverage/lcov-report/index.html
```

### Metrics Collector (pytest)

**Minimum Coverage**: 70%

**Current Coverage**: 85%

**View Coverage Report**:
```bash
cd services/metrics-collector
pytest --cov=. --cov-report=html
open htmlcov/index.html
```

### Self-Healing Agent (pytest)

**Minimum Coverage**: 60% (lower due to Docker API mocking complexity)

**Current Coverage**: 65%

---

## CI/CD Pipeline

### GitHub Actions Workflow

File: `.github/workflows/test.yml`

**Trigger Events**:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

### Pipeline Jobs

#### 1. Backend Tests
- Runs on: Ubuntu Latest
- PostgreSQL service container
- Steps:
  1. Checkout code
  2. Setup Node.js 18 with npm cache
  3. Install dependencies (`npm ci`)
  4. Run linter
  5. Run unit tests
  6. Run integration tests
  7. Upload coverage to Codecov

**Duration**: ~3 minutes

#### 2. Metrics Collector Tests
- Runs on: Ubuntu Latest
- PostgreSQL service container
- Steps:
  1. Checkout code
  2. Setup Python 3.10
  3. Install dependencies
  4. Run pytest with coverage
  5. Upload coverage to Codecov

**Duration**: ~2 minutes

#### 3. Self-Healing Agent Tests
- Runs on: Ubuntu Latest
- PostgreSQL service container
- Steps:
  1. Checkout code
  2. Setup Python 3.10
  3. Install dependencies
  4. Run pytest with coverage
  5. Upload coverage to Codecov

**Duration**: ~2 minutes

#### 4. API Tests
- Runs on: Ubuntu Latest
- Full Docker Compose stack
- Steps:
  1. Checkout code
  2. Setup Node.js 18
  3. Install Newman globally
  4. Start Docker Compose services
  5. Wait for services (30s)
  6. Run Newman API tests
  7. Upload HTML report as artifact
  8. Stop Docker Compose

**Duration**: ~5 minutes

#### 5. Docker Build Tests
- Runs on: Ubuntu Latest
- Matrix strategy (4 services)
- Steps:
  1. Checkout code
  2. Setup Docker Buildx
  3. Build Docker image (no push)
  4. Cache layers to GitHub Actions cache

**Duration**: ~8 minutes (parallel)

#### 6. Dependency Validation
- Runs on: Ubuntu Latest
- Steps:
  1. Checkout code
  2. Install yq (YAML processor)
  3. Validate docker-compose.yml syntax
  4. Run dependency validation script

**Duration**: ~1 minute

#### 7. Security Scan
- Runs on: Ubuntu Latest
- Steps:
  1. Checkout code
  2. Run Trivy vulnerability scanner
  3. Upload SARIF results to GitHub Security

**Duration**: ~3 minutes

#### 8. Test Summary
- Runs after all other jobs
- Aggregates results
- Reports overall pass/fail

**Total Pipeline Duration**: ~10 minutes

### Viewing CI/CD Results

1. Navigate to GitHub repository
2. Click "Actions" tab
3. Select latest workflow run
4. View individual job logs
5. Download artifacts (Newman reports, coverage)

### Local CI/CD Simulation

```bash
# Install act (GitHub Actions local runner)
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run CI/CD pipeline locally
act push

# Run specific job
act -j backend-tests

# Run with secrets
act --secret-file .secrets
```

---

## Writing Tests

### Unit Test Best Practices

#### JavaScript (Jest)

```javascript
/**
 * Template for Jest unit test
 */

const { functionToTest } = require('../../src/module');

describe('Module Name', () => {
  describe('functionToTest', () => {
    test('should handle valid input', () => {
      const result = functionToTest('valid input');

      expect(result).toBeDefined();
      expect(result).toEqual(expectedValue);
    });

    test('should reject invalid input', () => {
      expect(() => functionToTest('invalid'))
        .toThrow('Expected error message');
    });

    test('should handle edge cases', () => {
      expect(functionToTest(null)).toBeNull();
      expect(functionToTest('')).toBe('');
    });
  });
});
```

**Mocking Example**:
```javascript
jest.mock('../../src/database', () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn(() => ({
      query: jest.fn(),
      release: jest.fn()
    }))
  }
}));
```

#### Python (pytest)

```python
"""
Template for pytest unit test
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from module import ClassToTest

class TestClassToTest:
    @pytest.fixture
    def instance(self):
        """Setup test instance"""
        return ClassToTest()

    def test_method_with_valid_input(self, instance):
        """Test method with valid input"""
        result = instance.method('valid input')

        assert result is not None
        assert result == expected_value

    def test_method_with_invalid_input(self, instance):
        """Test method with invalid input"""
        with pytest.raises(ValueError, match='Expected error'):
            instance.method('invalid')

    @patch('module.external_dependency')
    def test_method_with_mocked_dependency(self, mock_dep, instance):
        """Test method with mocked external dependency"""
        mock_dep.return_value = 'mocked response'

        result = instance.method()

        assert mock_dep.called
        assert result == 'expected result'
```

### Integration Test Best Practices

```javascript
/**
 * Integration test template
 */

const request = require('supertest');
const app = require('../../src/server');

describe('API Integration', () => {
  let authToken;

  beforeAll(async () => {
    // Setup: login to get auth token
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'test_password' });

    authToken = response.body.token;
  });

  test('should complete full workflow', async () => {
    // Step 1: Create resource
    const createResponse = await request(app)
      .post('/api/resource')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Resource' });

    expect(createResponse.status).toBe(201);
    const resourceId = createResponse.body.id;

    // Step 2: Retrieve resource
    const getResponse = await request(app)
      .get(`/api/resource/${resourceId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.name).toBe('Test Resource');

    // Step 3: Delete resource
    const deleteResponse = await request(app)
      .delete(`/api/resource/${resourceId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(deleteResponse.status).toBe(204);
  });
});
```

### API Test Best Practices (Postman)

```json
{
  "name": "Endpoint Test",
  "event": [
    {
      "listen": "test",
      "script": {
        "exec": [
          "// Status code check",
          "pm.test('Status code is 200', function () {",
          "    pm.response.to.have.status(200);",
          "});",
          "",
          "// Response structure check",
          "pm.test('Response has required fields', function () {",
          "    const json = pm.response.json();",
          "    pm.expect(json).to.have.property('field1');",
          "    pm.expect(json).to.have.property('field2');",
          "});",
          "",
          "// Data validation",
          "pm.test('Field values are valid', function () {",
          "    const json = pm.response.json();",
          "    pm.expect(json.field1).to.be.a('string');",
          "    pm.expect(json.field2).to.be.within(0, 100);",
          "});",
          "",
          "// Save data for next request",
          "pm.environment.set('savedValue', pm.response.json().field1);"
        ]
      }
    }
  ],
  "request": {
    "method": "GET",
    "header": [],
    "url": "{{base_url}}/endpoint"
  }
}
```

---

## Troubleshooting

### Common Issues

#### 1. Tests Fail with "Connection Refused"

**Cause**: PostgreSQL or other service not running

**Solution**:
```bash
# Start PostgreSQL
docker-compose up -d postgres-db

# Wait for service to be ready
docker-compose ps

# Check logs
docker-compose logs postgres-db
```

#### 2. Integration Tests Timeout

**Cause**: Services not fully initialized

**Solution**:
```javascript
beforeAll(async () => {
  // Add delay for services to start
  await new Promise(resolve => setTimeout(resolve, 5000));
});
```

#### 3. Jest Tests Use Wrong Environment Variables

**Cause**: Environment variables not set

**Solution**:
```bash
# Create .env.test file
cat > services/dashboard-backend/.env.test << EOF
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=arasul
POSTGRES_PASSWORD=test_password
POSTGRES_DB=arasul_db_test
JWT_SECRET=test_jwt_secret
ADMIN_PASSWORD=test_password
EOF

# Load in tests
require('dotenv').config({ path: '.env.test' });
```

#### 4. Pytest Cannot Find Modules

**Cause**: PYTHONPATH not set

**Solution**:
```bash
# Add to pytest.ini or pyproject.toml
[tool:pytest]
pythonpath = . src
```

Or:
```bash
export PYTHONPATH=$PYTHONPATH:$(pwd)
pytest
```

#### 5. Newman Tests Fail with 401 Unauthorized

**Cause**: Admin password not set or incorrect

**Solution**:
```bash
# Ensure environment variable is set correctly
newman run tests/api/arasul-api.postman_collection.json \
  --env-var "admin_password=your_correct_password"
```

#### 6. Coverage Thresholds Not Met

**Cause**: New code not covered by tests

**Solution**:
```bash
# Generate coverage report to see uncovered lines
npm test -- --coverage

# Open HTML report
open coverage/lcov-report/index.html

# Add tests for uncovered code sections
```

#### 7. Docker Build Tests Fail

**Cause**: Dockerfile syntax error or missing dependencies

**Solution**:
```bash
# Build locally to see full error
docker build -t test-image services/dashboard-backend/

# Check Dockerfile syntax
docker build --check services/dashboard-backend/

# Validate docker-compose.yml
docker-compose config
```

### Debug Mode

#### Jest Debug Mode
```bash
# Run with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand

# In Chrome, navigate to: chrome://inspect
```

#### Pytest Debug Mode
```bash
# Run with pdb on failure
pytest --pdb

# Run with verbose output
pytest -vv

# Show print statements
pytest -s
```

#### Newman Verbose Mode
```bash
newman run collection.json \
  --verbose \
  --reporter-cli-no-summary \
  --reporter-cli-no-failures
```

---

## Test Maintenance

### Updating Tests After Code Changes

1. **Update unit tests** when function signatures change
2. **Update integration tests** when API contracts change
3. **Update API tests** when endpoints are added/removed
4. **Update mocks** when external dependencies change

### Test Data Management

- Use **fixtures** for reusable test data
- Use **factories** for generating test objects
- Use **seeds** for database test data
- **Clean up** after each test (database, files)

### Performance Optimization

- **Parallelize tests** when possible (Jest default, pytest with `-n auto`)
- **Mock expensive operations** (API calls, database queries)
- **Use in-memory databases** for faster tests (SQLite)
- **Cache dependencies** in CI/CD (npm cache, pip cache)

---

## Resources

### Documentation
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [pytest Documentation](https://docs.pytest.org/)
- [Newman Documentation](https://learning.postman.com/docs/running-collections/using-newman-cli/command-line-integration-with-newman/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)

### Tools
- [Jest VSCode Extension](https://marketplace.visualstudio.com/items?itemName=Orta.vscode-jest)
- [Python Test Explorer](https://marketplace.visualstudio.com/items?itemName=LittleFoxTeam.vscode-python-test-adapter)
- [Postman](https://www.postman.com/downloads/)

### Best Practices
- [Testing Best Practices by Node.js](https://github.com/goldbergyoni/nodebestpractices#3-testing-and-overall-quality-practices)
- [Effective Python Testing](https://realpython.com/pytest-python-testing/)
- [API Testing Best Practices](https://assertible.com/blog/7-http-methods-every-web-developer-should-know-and-how-to-test-them)

---

## Appendix

### Test Coverage by Component

| Component              | Coverage | Tests | Status |
|------------------------|----------|-------|--------|
| Dashboard Backend      | 82%      | 45    | ✅     |
| Metrics Collector      | 85%      | 12    | ✅     |
| Self-Healing Agent     | 65%      | 8     | ⚠️     |
| API Endpoints          | 95%      | 32    | ✅     |
| Database Pooling       | 88%      | 10    | ✅     |
| Authentication         | 92%      | 8     | ✅     |

### Test Execution Times

| Test Suite              | Duration | Tests |
|-------------------------|----------|-------|
| Backend Unit            | 2.5s     | 25    |
| Backend Integration     | 12s      | 20    |
| Metrics Collector       | 3s       | 12    |
| Self-Healing Agent      | 4s       | 8     |
| API Tests (Newman)      | 45s      | 32    |
| Docker Build Tests      | 120s     | 4     |
| **Total**               | **186s** | **101** |

---

**Last Updated**: 2025-11-12
**Version**: 1.0.0
**Maintainer**: ARASUL Platform Team
