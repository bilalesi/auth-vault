"""Test guards and security utilities."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))


def test_guards():
    """Test guard context managers."""
    from app.core.exceptions import AuthManagerError, ValidationError
    from app.core.guards import guard_condition, guard_not_none

    print("Testing guards...")

    # Test guard_condition - success
    try:
        with guard_condition(True, "Should not raise"):
            print("✓ guard_condition passes when condition is True")
    except Exception as e:
        print(f"✗ guard_condition failed: {e}")
        return False

    # Test guard_condition - failure
    try:
        with guard_condition(False, "Test error", "test_code"):
            pass
        print("✗ guard_condition should have raised")
        return False
    except AuthManagerError as e:
        if e.message == "Test error" and e.code == "test_code":
            print("✓ guard_condition raises correct error when condition is False")
        else:
            print(f"✗ guard_condition raised wrong error: {e}")
            return False

    # Test guard_not_none - success
    try:
        with guard_not_none("value", "Should not raise") as val:
            if val == "value":
                print("✓ guard_not_none passes when value is not None")
            else:
                print(f"✗ guard_not_none returned wrong value: {val}")
                return False
    except Exception as e:
        print(f"✗ guard_not_none failed: {e}")
        return False

    # Test guard_not_none - failure
    try:
        with guard_not_none(None, "Test error"):
            pass
        print("✗ guard_not_none should have raised")
        return False
    except ValidationError as e:
        if e.message == "Test error":
            print("✓ guard_not_none raises correct error when value is None")
        else:
            print(f"✗ guard_not_none raised wrong error: {e}")
            return False

    return True


def test_bearer_token():
    """Test BearerToken security."""
    from fastapi import FastAPI, Request, status
    from fastapi.testclient import TestClient
    from pydantic import BaseModel
    from starlette.responses import Response

    from app.core.exceptions import UnauthorizedError
    from app.core.security import BearerToken
    from app.models.api import ErrorResponse, SuccessResponse

    print("\nTesting BearerToken security...")

    app = FastAPI()

    # Add exception handler
    @app.exception_handler(UnauthorizedError)
    async def unauthorized_handler(request: Request, exc: UnauthorizedError) -> Response:
        error_response = ErrorResponse(error=exc.message, code=exc.code, reason=None)
        return Response(
            content=error_response.model_dump_json(),
            status_code=status.HTTP_401_UNAUTHORIZED,
            media_type="application/json",
        )

    class TestResponse(BaseModel):
        token: str

    @app.get("/test", response_model=SuccessResponse[TestResponse])
    async def test_endpoint(token: BearerToken):
        return SuccessResponse(data=TestResponse(token=token))

    client = TestClient(app)

    # Test with valid Bearer token
    response = client.get("/test", headers={"Authorization": "Bearer test-token-123"})
    if response.status_code == 200:
        data = response.json()
        if data.get("data", {}).get("token") == "test-token-123":
            print("✓ BearerToken extracts token correctly")
        else:
            print(f"✗ BearerToken extracted wrong token: {data}")
            return False
    else:
        print(f"✗ BearerToken failed with status {response.status_code}: {response.text}")
        return False

    # Test without Authorization header
    response = client.get("/test")
    if response.status_code == 401:
        print("✓ BearerToken returns 401 when Authorization header is missing")
    else:
        print(f"✗ BearerToken should return 401, got {response.status_code}")
        return False

    # Test with invalid scheme
    response = client.get("/test", headers={"Authorization": "Basic test-token"})
    if response.status_code == 401:
        print("✓ BearerToken returns 401 when scheme is not Bearer")
    else:
        print(f"✗ BearerToken should return 401 for invalid scheme, got {response.status_code}")
        return False

    return True


def test_openapi_security():
    """Test OpenAPI security documentation."""
    from app.main import app

    print("\nTesting OpenAPI security documentation...")

    openapi_schema = app.openapi()

    # Check if security schemes are defined
    security_schemes = openapi_schema.get("components", {}).get("securitySchemes", {})
    if "HTTPBearer" in security_schemes:
        scheme = security_schemes["HTTPBearer"]
        if scheme.get("type") == "http" and scheme.get("scheme") == "bearer":
            print("✓ HTTPBearer security scheme is properly defined in OpenAPI")
        else:
            print(f"✗ HTTPBearer scheme is incorrect: {scheme}")
            return False
    else:
        print("✗ HTTPBearer security scheme not found in OpenAPI")
        return False

    # Check if validate-token endpoint has security
    validate_token_path = openapi_schema.get("paths", {}).get(
        "/api/auth/manager/validate-token", {}
    )
    if validate_token_path:
        get_method = validate_token_path.get("get", {})
        security = get_method.get("security", [])
        if any("HTTPBearer" in s for s in security):
            print("✓ validate-token endpoint has HTTPBearer security requirement")
        else:
            print(f"✗ validate-token endpoint missing security: {security}")
            return False
    else:
        print("✗ validate-token endpoint not found in OpenAPI")
        return False

    return True


if __name__ == "__main__":
    print("=" * 80)
    print("GUARDS AND SECURITY TESTS")
    print("=" * 80)
    print()

    all_passed = True

    if not test_guards():
        all_passed = False

    if not test_bearer_token():
        all_passed = False

    if not test_openapi_security():
        all_passed = False

    print()
    print("=" * 80)
    if all_passed:
        print("✓ ALL TESTS PASSED")
    else:
        print("✗ SOME TESTS FAILED")
    print("=" * 80)

    sys.exit(0 if all_passed else 1)
