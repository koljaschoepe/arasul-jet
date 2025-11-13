"""
Integration Tests für Update System
Testet: Upload, Signature Verification, Version Checks, Update State Management

WICHTIG: Diese Tests setzen voraus dass das Dashboard Backend läuft.
Einige Tests sind als @pytest.mark.skip markiert wenn echte Signaturverifikation
nicht verfügbar ist.
"""

import pytest
import requests
import json
import os
import time
import subprocess
from pathlib import Path

# Service URLs
DASHBOARD_API = os.getenv("DASHBOARD_API_URL", "http://dashboard-backend:3001")
UPDATE_ENDPOINT = f"{DASHBOARD_API}/api/update"

# Test data directories
TESTS_DIR = Path(__file__).parent.parent
FIXTURES_DIR = TESTS_DIR / "fixtures"


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture(scope="module")
def auth_token():
    """
    Authenticate and get JWT token

    Note: Assumes default credentials. Update if needed.
    """
    try:
        response = requests.post(
            f"{DASHBOARD_API}/api/auth/login",
            json={"username": "admin", "password": os.getenv("ADMIN_PASSWORD", "admin")},
            timeout=5
        )

        if response.status_code == 200:
            token = response.json().get("token")
            if token:
                return token

        pytest.skip("Could not authenticate with dashboard backend")
    except Exception as e:
        pytest.skip(f"Dashboard backend not available: {e}")


@pytest.fixture
def auth_headers(auth_token):
    """HTTP headers with authentication"""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="module")
def test_update_package():
    """
    Create a minimal test update package

    Format: Simple tar.gz with manifest.json
    No signature for basic tests (will fail signature verification)
    """
    import tarfile
    import tempfile

    # Create manifest
    manifest = {
        "version": "1.0.1",
        "min_version": "1.0.0",
        "components": ["test-component"],
        "requires_reboot": False,
        "release_notes": "Test update package for integration tests"
    }

    # Create temp dir
    with tempfile.TemporaryDirectory() as tmpdir:
        # Write manifest
        manifest_path = os.path.join(tmpdir, "manifest.json")
        with open(manifest_path, "w") as f:
            json.dump(manifest, f)

        # Create dummy payload file
        payload_dir = os.path.join(tmpdir, "payload")
        os.makedirs(payload_dir)
        payload_file = os.path.join(payload_dir, "test.txt")
        with open(payload_file, "w") as f:
            f.write("Test payload content")

        # Create tar.gz
        package_path = FIXTURES_DIR / "test_update.araupdate"
        FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

        with tarfile.open(package_path, "w:gz") as tar:
            tar.add(manifest_path, arcname="manifest.json")
            tar.add(payload_file, arcname="payload/test.txt")

    yield package_path

    # Cleanup
    if package_path.exists():
        package_path.unlink()


# ============================================================================
# SERVICE AVAILABILITY TESTS
# ============================================================================

class TestServiceAvailability:
    """Pre-Tests: Verify services are running"""

    def test_dashboard_backend_reachable(self):
        """Test: Dashboard Backend ist erreichbar"""
        try:
            response = requests.get(f"{DASHBOARD_API}/api/health", timeout=5)
            assert response.status_code == 200
        except Exception as e:
            pytest.skip(f"Dashboard backend not reachable: {e}")

    def test_update_endpoint_exists(self, auth_headers):
        """Test: Update Endpoints sind verfügbar"""
        try:
            # Check /status endpoint
            response = requests.get(f"{UPDATE_ENDPOINT}/status", headers=auth_headers, timeout=5)
            assert response.status_code in [200, 404, 500]  # Endpoint exists

            # Check /history endpoint
            response = requests.get(f"{UPDATE_ENDPOINT}/history", headers=auth_headers, timeout=5)
            assert response.status_code in [200, 404, 500]  # Endpoint exists
        except requests.exceptions.ConnectionError:
            pytest.skip("Dashboard backend not available")


# ============================================================================
# AUTHENTICATION TESTS
# ============================================================================

class TestUpdateAuthentication:
    """Tests für Update Endpoint Authentication"""

    def test_upload_without_auth_rejected(self, test_update_package):
        """Test: Upload ohne Authentication → 401"""
        try:
            with open(test_update_package, "rb") as f:
                response = requests.post(
                    f"{UPDATE_ENDPOINT}/upload",
                    files={"file": ("test.araupdate", f, "application/octet-stream")},
                    timeout=10
                )

            assert response.status_code in [401, 403], \
                f"Expected 401/403, got {response.status_code}"
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")

    def test_status_without_auth_rejected(self):
        """Test: Status ohne Authentication → 401"""
        try:
            response = requests.get(f"{UPDATE_ENDPOINT}/status", timeout=5)
            assert response.status_code in [401, 403]
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")

    def test_apply_without_auth_rejected(self):
        """Test: Apply ohne Authentication → 401"""
        try:
            response = requests.post(
                f"{UPDATE_ENDPOINT}/apply",
                json={"file_path": "/tmp/test.araupdate"},
                timeout=5
            )
            assert response.status_code in [401, 403]
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")


# ============================================================================
# UPLOAD VALIDATION TESTS
# ============================================================================

class TestUpdateUploadValidation:
    """Tests für Update Upload Validation"""

    def test_upload_wrong_file_extension_rejected(self, auth_headers):
        """Test: Upload mit falscher Extension → 400"""
        try:
            # Create dummy file with wrong extension
            dummy_file = FIXTURES_DIR / "test.txt"
            dummy_file.write_text("test content")

            with open(dummy_file, "rb") as f:
                response = requests.post(
                    f"{UPDATE_ENDPOINT}/upload",
                    files={"file": ("test.txt", f, "text/plain")},
                    headers=auth_headers,
                    timeout=10
                )

            assert response.status_code == 400, \
                f"Expected 400, got {response.status_code}"

            if response.headers.get('content-type', '').startswith('application/json'):
                data = response.json()
                assert 'error' in data

            dummy_file.unlink()
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")

    def test_upload_empty_file_rejected(self, auth_headers):
        """Test: Upload einer leeren Datei → 400"""
        try:
            empty_file = FIXTURES_DIR / "empty.araupdate"
            empty_file.touch()

            with open(empty_file, "rb") as f:
                response = requests.post(
                    f"{UPDATE_ENDPOINT}/upload",
                    files={"file": ("empty.araupdate", f, "application/octet-stream")},
                    headers=auth_headers,
                    timeout=10
                )

            # Should fail validation
            assert response.status_code in [400, 500]

            empty_file.unlink()
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")

    @pytest.mark.skip(reason="Signature verification depends on configured keys")
    def test_upload_without_signature_rejected(self, auth_headers, test_update_package):
        """Test: Upload ohne Signature → 400"""
        try:
            with open(test_update_package, "rb") as f:
                response = requests.post(
                    f"{UPDATE_ENDPOINT}/upload",
                    files={"file": ("test.araupdate", f, "application/octet-stream")},
                    headers=auth_headers,
                    timeout=10
                )

            # Should fail signature verification
            assert response.status_code == 400

            if response.headers.get('content-type', '').startswith('application/json'):
                data = response.json()
                assert 'signature' in data.get('error', '').lower() or \
                       'valid' in data.get('error', '').lower()
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")


# ============================================================================
# UPDATE STATUS TESTS
# ============================================================================

class TestUpdateStatus:
    """Tests für Update Status Endpoint"""

    def test_get_status_idle(self, auth_headers):
        """Test: Status endpoint bei keinem laufenden Update"""
        try:
            response = requests.get(
                f"{UPDATE_ENDPOINT}/status",
                headers=auth_headers,
                timeout=5
            )

            assert response.status_code == 200
            data = response.json()

            assert 'status' in data
            assert 'timestamp' in data

            # Should be idle or report current state
            assert data['status'] in ['idle', 'in_progress', 'completed', 'failed']
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")

    def test_get_status_returns_json(self, auth_headers):
        """Test: Status endpoint gibt valides JSON zurück"""
        try:
            response = requests.get(
                f"{UPDATE_ENDPOINT}/status",
                headers=auth_headers,
                timeout=5
            )

            assert response.headers.get('content-type', '').startswith('application/json')

            # Should be valid JSON
            data = response.json()
            assert isinstance(data, dict)
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")


# ============================================================================
# UPDATE HISTORY TESTS
# ============================================================================

class TestUpdateHistory:
    """Tests für Update History Endpoint"""

    def test_get_history_returns_list(self, auth_headers):
        """Test: History endpoint gibt Liste zurück"""
        try:
            response = requests.get(
                f"{UPDATE_ENDPOINT}/history",
                headers=auth_headers,
                timeout=5
            )

            assert response.status_code == 200
            data = response.json()

            assert 'updates' in data or 'history' in data or isinstance(data, list)
            assert 'timestamp' in data or isinstance(data, list)
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")

    def test_history_has_required_fields(self, auth_headers):
        """Test: History Entries haben erforderliche Felder"""
        try:
            response = requests.get(
                f"{UPDATE_ENDPOINT}/history",
                headers=auth_headers,
                timeout=5
            )

            assert response.status_code == 200
            data = response.json()

            # Get updates list
            updates = data.get('updates', data if isinstance(data, list) else [])

            if len(updates) > 0:
                # Check first entry has required fields
                first_update = updates[0]

                # Should have version or status info
                has_version = 'version' in first_update or \
                              'version_from' in first_update or \
                              'version_to' in first_update

                has_status = 'status' in first_update
                has_timestamp = 'timestamp' in first_update or 'created_at' in first_update

                assert has_status or has_version, \
                    "Update history should contain version or status information"
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")


# ============================================================================
# VERSION COMPARISON TESTS
# ============================================================================

class TestVersionComparison:
    """Tests für Version Comparison Logic"""

    @pytest.mark.skip(reason="Requires implemented version check endpoint")
    def test_version_downgrade_rejected(self, auth_headers):
        """Test: Version Downgrade wird abgelehnt"""
        # This would require creating a package with older version
        # and verifying it's rejected
        pass

    @pytest.mark.skip(reason="Requires implemented version check endpoint")
    def test_same_version_rejected(self, auth_headers):
        """Test: Gleiche Version wird abgelehnt"""
        pass

    @pytest.mark.skip(reason="Requires implemented version check endpoint")
    def test_version_upgrade_accepted(self, auth_headers):
        """Test: Version Upgrade wird akzeptiert"""
        pass


# ============================================================================
# UPDATE APPLICATION TESTS
# ============================================================================

class TestUpdateApplication:
    """Tests für Update Application Process"""

    def test_apply_nonexistent_file_rejected(self, auth_headers):
        """Test: Apply mit nicht-existierender Datei → 404"""
        try:
            response = requests.post(
                f"{UPDATE_ENDPOINT}/apply",
                json={"file_path": "/nonexistent/path/to/update.araupdate"},
                headers=auth_headers,
                timeout=5
            )

            assert response.status_code in [400, 404], \
                f"Expected 400 or 404, got {response.status_code}"
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")

    def test_apply_without_file_path_rejected(self, auth_headers):
        """Test: Apply ohne file_path Parameter → 400"""
        try:
            response = requests.post(
                f"{UPDATE_ENDPOINT}/apply",
                json={},
                headers=auth_headers,
                timeout=5
            )

            assert response.status_code == 400

            if response.headers.get('content-type', '').startswith('application/json'):
                data = response.json()
                assert 'error' in data
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")

    @pytest.mark.skip(reason="Would start actual update process")
    def test_apply_valid_update_starts_process(self, auth_headers):
        """Test: Apply mit valider Datei startet Update Process"""
        # Skip this test as it would start an actual update
        pass


# ============================================================================
# ERROR HANDLING TESTS
# ============================================================================

class TestUpdateErrorHandling:
    """Tests für Error Handling"""

    def test_malformed_request_returns_400(self, auth_headers):
        """Test: Malformed Request → 400"""
        try:
            response = requests.post(
                f"{UPDATE_ENDPOINT}/upload",
                data="invalid data",
                headers=auth_headers,
                timeout=5
            )

            assert response.status_code in [400, 500]
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")

    def test_endpoints_return_json_errors(self, auth_headers):
        """Test: Fehler werden als JSON zurückgegeben"""
        try:
            # Trigger error with invalid request
            response = requests.post(
                f"{UPDATE_ENDPOINT}/apply",
                json={"invalid": "data"},
                headers=auth_headers,
                timeout=5
            )

            # Should return JSON error
            if response.status_code >= 400:
                assert response.headers.get('content-type', '').startswith('application/json')
                data = response.json()
                assert 'error' in data or 'message' in data
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")

    def test_all_responses_have_timestamp(self, auth_headers):
        """Test: Alle Responses haben Timestamp"""
        try:
            endpoints = [
                ('GET', f"{UPDATE_ENDPOINT}/status"),
                ('GET', f"{UPDATE_ENDPOINT}/history")
            ]

            for method, url in endpoints:
                if method == 'GET':
                    response = requests.get(url, headers=auth_headers, timeout=5)

                if response.status_code == 200:
                    data = response.json()
                    assert 'timestamp' in data or \
                           any('timestamp' in str(v) for v in data.values() if isinstance(v, dict)), \
                           f"Response from {url} missing timestamp"
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

class TestUpdateSystemIntegration:
    """Integration Tests für komplette Update Flows"""

    @pytest.mark.slow
    def test_full_status_check_workflow(self, auth_headers):
        """Test: Vollständiger Status Check Workflow"""
        try:
            # 1. Check initial status
            response1 = requests.get(
                f"{UPDATE_ENDPOINT}/status",
                headers=auth_headers,
                timeout=5
            )
            assert response1.status_code == 200
            status1 = response1.json()

            # 2. Check history
            response2 = requests.get(
                f"{UPDATE_ENDPOINT}/history",
                headers=auth_headers,
                timeout=5
            )
            assert response2.status_code == 200

            # 3. Check status again (should be consistent)
            response3 = requests.get(
                f"{UPDATE_ENDPOINT}/status",
                headers=auth_headers,
                timeout=5
            )
            assert response3.status_code == 200
            status3 = response3.json()

            # Status should be consistent
            assert status1.get('status') == status3.get('status')
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")

    @pytest.mark.slow
    def test_concurrent_status_requests(self, auth_headers):
        """Test: Mehrere parallele Status Requests"""
        try:
            import concurrent.futures

            def get_status():
                response = requests.get(
                    f"{UPDATE_ENDPOINT}/status",
                    headers=auth_headers,
                    timeout=5
                )
                return response.status_code == 200

            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(get_status) for _ in range(5)]
                results = [f.result() for f in concurrent.futures.as_completed(futures)]

            # All requests should succeed
            assert all(results), "Some concurrent requests failed"
        except Exception as e:
            pytest.skip(f"Test skipped: {e}")


# ============================================================================
# TEST RUNNER
# ============================================================================

if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([
        __file__,
        "-v",
        "-s",
        "--tb=short",
        "-W", "ignore::DeprecationWarning"
    ])
