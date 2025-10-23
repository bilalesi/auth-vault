# Guards Usage Guide

## Overview

Guards are context managers that provide clean, reusable validation patterns. They help eliminate repetitive `if` checks and make error handling more consistent.

## Available Guards

### 1. `guard_authorization`

Ensures authorization header is present.

**Before:**

```python
if not authorization:
    logger.warning("missing_authorization_header")
    raise UnauthorizedError("Authorization header is required")
```

**After:**

```python
from app.core.guards import guard_authorization

with guard_authorization(authorization) as auth_header:
    # Use auth_header safely
    process_auth(auth_header)
```

### 2. `guard_not_none`

Ensures a value is not None.

**Before:**

```python
if user_id is None:
    raise ValidationError("User ID is required", {"field": "user_id"})
```

**After:**

```python
from app.core.guards import guard_not_none

with guard_not_none(user_id, "User ID is required") as uid:
    # Use uid safely
    user = await get_user(uid)
```

### 3. `guard_result`

Handles database queries that might return no results.

**Before:**

```python
try:
    token = await repository.get_by_id(token_id)
except NoResultFound:
    raise TokenNotFoundError(f"Token {token_id} not found")
```

**After:**

```python
from app.core.guards import guard_result

with guard_result("Token not found", "token_not_found"):
    token = await repository.get_by_id(token_id)
```

### 4. `guard_condition`

Ensures a condition is true.

**Before:**

```python
if not introspection_result.active:
    logger.info("token_not_active")
    raise TokenNotActiveError("Token is not active")
```

**After:**

```python
from app.core.guards import guard_condition

with guard_condition(introspection_result.active, "Token is not active", "token_not_active"):
    # Proceed with active token
    logger.info("token_valid")
```

## Security: Bearer Token Extraction

### Using `BearerToken` Dependency

FastAPI's built-in `HTTPBearer` security scheme handles token extraction automatically.

**Before:**

```python
from typing import Optional
from fastapi import Header

async def validate_token(
    authorization: Optional[str] = Header(None),
):
    if not authorization:
        raise UnauthorizedError("Authorization header is required")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise UnauthorizedError("Invalid Authorization header format")

    token = parts[1]
    # Use token
```

**After:**

```python
from app.core.security import BearerToken

async def validate_token(
    token: BearerToken,
):
    # Token is already extracted and validated
    # Use token directly
```

## Complete Example: Validate Token Endpoint

### Before Refactoring

```python
from typing import Optional
from fastapi import APIRouter, Header

async def validate_token(
    authorization: Optional[str] = Header(None),
    keycloak_service: KeycloakService = Depends(get_keycloak_service),
):
    logger.info("validate_token_requested")

    # Manual authorization check
    if not authorization:
        logger.warning("missing_authorization_header")
        raise UnauthorizedError("Authorization header is required")

    # Manual token extraction
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        logger.warning("invalid_authorization_format")
        raise UnauthorizedError("Invalid Authorization header format")

    token = parts[1]

    # Introspect token
    introspection_result = await keycloak_service.introspect_token(token)

    # Manual active check
    if not introspection_result.active:
        logger.info("token_not_active")
        raise TokenNotActiveError("Token is not active")

    logger.info("token_valid")
    return ValidationResponse(valid=True)
```

### After Refactoring

```python
from fastapi import APIRouter
from app.core.guards import guard_condition
from app.core.security import BearerToken
from app.dependencies import KeycloakDep

async def validate_token(
    token: BearerToken,
    keycloak: KeycloakDep,
):
    logger.info("validate_token")

    introspection_result = await keycloak.introspect_token(token)

    with guard_condition(introspection_result.active, "Token is not active", "token_not_active"):
        logger.info("token_valid")

    return SuccessResponse(data=ValidationResponse(valid=True))
```

## Benefits

### 1. **Cleaner Code**

- Less boilerplate
- More readable
- Focused on business logic

### 2. **Consistent Error Handling**

- Standardized error messages
- Consistent error codes
- Predictable behavior

### 3. **Reusability**

- Write once, use everywhere
- Easy to test
- Easy to maintain

### 4. **Type Safety**

- FastAPI's `HTTPBearer` provides proper typing
- IDE autocomplete works better
- Fewer runtime errors

### 5. **Better Documentation**

- OpenAPI schema automatically includes security requirements
- Swagger UI shows "Authorize" button
- Clear API documentation

## OpenAPI Integration

When using `BearerToken`, FastAPI automatically:

1. Adds security scheme to OpenAPI schema
2. Shows "Authorize" button in Swagger UI
3. Documents authentication requirements
4. Provides proper error responses (401)

Example OpenAPI output:

```json
{
  "components": {
    "securitySchemes": {
      "HTTPBearer": {
        "type": "http",
        "scheme": "bearer"
      }
    }
  },
  "paths": {
    "/api/auth/manager/validate-token": {
      "get": {
        "security": [
          {
            "HTTPBearer": []
          }
        ]
      }
    }
  }
}
```

## Testing with Guards

Guards make testing easier:

```python
import pytest
from app.core.guards import guard_condition
from app.core.exceptions import AuthManagerError

def test_guard_condition_passes():
    with guard_condition(True, "Should not raise"):
        pass  # No exception

def test_guard_condition_fails():
    with pytest.raises(AuthManagerError) as exc_info:
        with guard_condition(False, "Test error", "test_code"):
            pass

    assert exc_info.value.message == "Test error"
    assert exc_info.value.code == "test_code"
```

## Best Practices

1. **Use guards for validation logic** - Keep business logic separate
2. **Use BearerToken for authentication** - Let FastAPI handle token extraction
3. **Provide clear error messages** - Help API consumers understand what went wrong
4. **Use appropriate error codes** - Make errors machine-readable
5. **Log before raising** - Include context in logs for debugging

## Migration Checklist

When refactoring existing endpoints:

- [ ] Replace manual authorization checks with `BearerToken`
- [ ] Replace `if not value` checks with `guard_not_none`
- [ ] Replace `try/except NoResultFound` with `guard_result`
- [ ] Replace condition checks with `guard_condition`
- [ ] Update tests to match new patterns
- [ ] Verify OpenAPI schema includes security requirements
