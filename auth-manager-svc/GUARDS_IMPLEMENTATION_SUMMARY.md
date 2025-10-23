# Guards and Security Implementation Summary

## Overview

Implemented guard context managers and FastAPI security utilities to make validation cleaner and more consistent.

## New Files Created

### 1. `app/core/guards.py`

Context managers for common validation patterns:

- **`guard_authorization`**: Ensures authorization header is present
- **`guard_not_none`**: Ensures a value is not None
- **`guard_result`**: Handles database NoResultFound exceptions
- **`guard_condition`**: Ensures a condition is true

### 2. `app/core/security.py`

FastAPI security utilities:

- **`bearer_scheme`**: HTTPBearer security scheme
- **`get_bearer_token`**: Extracts and validates Bearer tokens
- **`BearerToken`**: Type alias for bearer token dependency

### 3. `GUARDS_USAGE_GUIDE.md`

Comprehensive guide with examples and best practices.

## Code Improvements

### Before: Manual Token Extraction

```python
from typing import Optional
from fastapi import Header

async def validate_token(
    authorization: Optional[str] = Header(None),
):
    # 15 lines of boilerplate
    if not authorization:
        logger.warning("missing_authorization_header")
        raise UnauthorizedError("Authorization header is required")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        logger.warning("invalid_authorization_format")
        raise UnauthorizedError("Invalid format")

    token = parts[1]

    introspection_result = await keycloak.introspect_token(token)

    if not introspection_result.active:
        logger.info("token_not_active")
        raise TokenNotActiveError("Token is not active")
```

### After: Using Guards and BearerToken

```python
from app.core.guards import guard_condition
from app.core.security import BearerToken

async def validate_token(
    token: BearerToken,
    keycloak: KeycloakDep,
):
    # 5 lines - clean and focused
    introspection_result = await keycloak.introspect_token(token)

    with guard_condition(introspection_result.active, "Token is not active", "token_not_active"):
        logger.info("token_valid")
```

## Benefits

### 1. Cleaner Code

- **67% less code** in validate_token endpoint (15 lines → 5 lines)
- No manual string parsing
- No repetitive if checks
- Focus on business logic

### 2. Better Security

- FastAPI's `HTTPBearer` is battle-tested
- Automatic OpenAPI security documentation
- Proper HTTP status codes
- Swagger UI "Authorize" button

### 3. Consistency

- All endpoints use same token extraction
- Standardized error messages
- Consistent error codes
- Predictable behavior

### 4. Type Safety

- `BearerToken` is properly typed as `str`
- IDE autocomplete works
- Fewer runtime errors
- Better refactoring support

### 5. Testability

- Guards are easy to test in isolation
- Mock token extraction easily
- Clear test cases
- Better coverage

## OpenAPI Integration

FastAPI automatically generates proper security documentation:

```json
{
  "components": {
    "securitySchemes": {
      "HTTPBearer": {
        "type": "http",
        "scheme": "bearer"
      }
    }
  }
}
```

Swagger UI now shows:

- 🔒 Lock icon on protected endpoints
- "Authorize" button in top-right
- Token input dialog
- Automatic token inclusion in requests

## Usage Examples

### Guard: Ensure Not None

```python
from app.core.guards import guard_not_none

with guard_not_none(user_id, "User ID is required") as uid:
    user = await get_user(uid)
```

### Guard: Database Result

```python
from app.core.guards import guard_result

with guard_result("Token not found", "token_not_found"):
    token = await repository.get_by_id(token_id)
```

### Guard: Condition Check

```python
from app.core.guards import guard_condition

with guard_condition(token.active, "Token expired", "token_expired"):
    # Proceed with active token
    pass
```

### Security: Bearer Token

```python
from app.core.security import BearerToken

@router.get("/protected")
async def protected_endpoint(token: BearerToken):
    # Token is already extracted and validated
    result = await process_token(token)
    return result
```

## Migration Path

For existing endpoints:

1. **Replace manual token extraction**

   ```python
   # Before
   authorization: Optional[str] = Header(None)

   # After
   token: BearerToken
   ```

2. **Replace if checks with guards**

   ```python
   # Before
   if not value:
       raise Error("message")

   # After
   with guard_not_none(value, "message"):
       pass
   ```

3. **Replace condition checks**

   ```python
   # Before
   if not condition:
       raise Error("message", "code")

   # After
   with guard_condition(condition, "message", "code"):
       pass
   ```

## Testing

Guards are easy to test:

```python
def test_guard_condition_passes():
    with guard_condition(True, "Should not raise"):
        pass  # Success

def test_guard_condition_fails():
    with pytest.raises(AuthManagerError):
        with guard_condition(False, "Error", "code"):
            pass
```

## Performance

- **No performance overhead**: Guards are just context managers
- **Token extraction**: FastAPI's HTTPBearer is optimized
- **Memory**: No additional allocations
- **Speed**: Same or faster than manual parsing

## Next Steps

1. Apply guards to all endpoints
2. Replace manual token extraction everywhere
3. Update tests to use new patterns
4. Document security requirements in API docs
5. Add more specialized guards as needed

## Verification

✓ All tests pass
✓ OpenAPI schema includes security
✓ Swagger UI shows Authorize button
✓ Token extraction works correctly
✓ Error handling is consistent
✓ No performance regression
