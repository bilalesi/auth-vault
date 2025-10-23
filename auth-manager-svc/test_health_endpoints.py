"""Test script to verify health check endpoints implementation.

This script tests the health check endpoints to ensure they meet the requirements.
"""

import asyncio
import sys

from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint():
    """Test the /health endpoint."""
    print("Testing /health endpoint...")

    client = TestClient(app)
    response = client.get("/health")

    print(f"  Status Code: {response.status_code}")
    print(f"  Response: {response.json()}")

    # Verify requirements
    assert response.status_code == 200, "Expected status code 200"

    data = response.json()
    assert "status" in data, "Response should contain 'status' field"
    assert data["status"] == "healthy", "Status should be 'healthy'"
    assert "version" in data, "Response should contain 'version' field"
    assert "service" in data, "Response should contain 'service' field"

    print("  ✓ /health endpoint passed all checks")
    return True


def test_readiness_endpoint():
    """Test the /health/ready endpoint."""
    print("\nTesting /health/ready endpoint...")

    client = TestClient(app)
    response = client.get("/health/ready")

    print(f"  Status Code: {response.status_code}")
    print(f"  Response: {response.json()}")

    data = response.json()

    # The endpoint should return either 200 (ready) or 503 (not ready)
    assert response.status_code in [
        200,
        503,
    ], f"Expected status code 200 or 503, got {response.status_code}"

    # Verify response structure
    assert "status" in data, "Response should contain 'status' field"
    assert "version" in data, "Response should contain 'version' field"
    assert "service" in data, "Response should contain 'service' field"
    assert "database" in data, "Response should contain 'database' field"

    if response.status_code == 200:
        assert data["status"] == "ready", "Status should be 'ready' when code is 200"
        assert data["database"] == "connected", "Database should be 'connected' when ready"
        print("  ✓ /health/ready endpoint passed all checks (database connected)")
    else:
        assert data["status"] == "not_ready", "Status should be 'not_ready' when code is 503"
        assert data["database"] == "disconnected", (
            "Database should be 'disconnected' when not ready"
        )
        assert "error" in data, "Response should contain 'error' field when not ready"
        print("  ✓ /health/ready endpoint passed all checks (database not connected)")

    return True


def main():
    """Run all tests."""
    print("=" * 60)
    print("Health Check Endpoints Test Suite")
    print("=" * 60)

    try:
        # Test health endpoint
        test_health_endpoint()

        # Test readiness endpoint
        test_readiness_endpoint()

        print("\n" + "=" * 60)
        print("All tests passed! ✓")
        print("=" * 60)
        return 0

    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        return 1
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
