# Implementation Plan

- [x] 1. Project Setup and Configuration

  - Initialize UV project with pyproject.toml including FastAPI, Pydantic v2, SQLAlchemy 2.0, and dependencies
  - Create project directory structure in auth-manager-svc with modules for api, models, db, services, core, and middleware
  - Set up .env.example file with all required environment variables
  - Configure Python 3.12+ as minimum version
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Configuration Management

  - [ ] 2.1 Implement Pydantic Settings classes for configuration
    - Create DatabaseSettings, KeycloakSettings, EncryptionSettings, and AppSettings classes
    - Add validation for required fields and formats
    - Support loading from .env files
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

- [x] 3. Database Layer Implementation

  - [x] 3.1 Create SQLAlchemy models and base configuration

    - Define TokenType enum (offline, refresh)
    - Create AuthVault model with all columns (id, user_id, token_type, encrypted_token, iv, token_hash, metadata, session_state_id, created_at, updated_at)
    - Add database indexes on user_id+token_type, session_state_id, and token_hash
    - Set up async SQLAlchemy engine and session management
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [x] 3.2 Implement TokenVaultRepository

    - Create create() method for storing tokens
    - Create get_by_id() method for retrieving by persistent_token_id
    - Create get_by_user_id() method for user-based retrieval
    - Create get_by_session_state_id() method for session-based retrieval
    - Create get_all_by_session_state_id() method for finding shared sessions
    - Create check_duplicate_token_hash() method for deduplication
    - Create upsert_refresh_token() method ensuring one refresh token per user
    - Create delete_by_id() method for token deletion
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [x] 3.3 Set up Alembic for database migrations
    - Initialize Alembic configuration
    - Create initial migration for auth_vault table
    - _Requirements: 2.5_

- [x] 4. Core Services Implementation

  - [x] 4.1 Implement EncryptionService

    - Create generate_iv() method for random IV generation
    - Create encrypt_token() method using AES-256-CBC
    - Create decrypt_token() method with proper padding handling
    - Create hash_token() method using SHA-256
    - Validate encryption key format (64-character hex string)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 4.2 Implement KeycloakService

    - Create refresh_access_token() method with refresh_token grant type
    - Create request_offline_token() method with offline_access scope
    - Create introspect_token() method for token validation
    - Create revoke_token() method for token revocation
    - Create revoke_session() method using admin API
    - Create exchange_code_for_token() method for OAuth callback
    - Add \_get_admin_token() helper for admin operations
    - Handle Keycloak error responses and map to HTTP status codes
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 4.3 Implement StateTokenService

    - Create generate_state_token() method using JWT
    - Create parse_state_token() method with validation
    - Handle token expiration (10 minutes default)
    - _Requirements: 9.3, 10.2_

  - [x] 4.4 Implement TokenVaultService
    - Create store_token() method combining encryption and repository
    - Create retrieve_and_decrypt() method for fetching tokens
    - Create upsert_refresh_token() method for refresh token management
    - Create get_by_session_state() method with decryption
    - Create delete_token() method
    - Create check_shared_token() method for duplicate detection
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

- [x] 5. Pydantic Models

  - [x] 5.1 Create request models

    - Define AccessTokenRequest with UUID validation
    - Define OfflineTokenRevokeRequest
    - Define StateTokenPayload
    - _Requirements: 3.1, 3.4_

  - [x] 5.2 Create response models

    - Define AccessTokenResponse
    - Define OfflineTokenResponse
    - Define OfflineConsentResponse
    - Define ValidationResponse
    - Define ErrorResponse with error, code, details, operation fields
    - Define SuccessResponse wrapper
    - _Requirements: 3.2, 3.3, 13.1_

  - [x] 5.3 Create domain models
    - Define TokenVaultEntry
    - Define KeycloakTokenResponse
    - Define TokenIntrospection
    - _Requirements: 3.2, 3.5_

- [-] 6. Exception Handling

  - [x] 6.1 Create custom exception classes

    - Define AuthManagerError base exception
    - Define TokenNotFoundError
    - Define UnauthorizedError
    - Define TokenNotActiveError
    - Define KeycloakError
    - Define InvalidStateTokenError
    - Define ValidationError
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 6.2 Implement global exception handlers
    - Create handler for AuthManagerError with status code mapping
    - Create handler for Pydantic ValidationError
    - Create handler for generic exceptions
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [x] 7. Middleware Implementation

  - [x] 7.1 Create request ID middleware

    - Generate unique request ID for each request
    - Add request ID to response headers
    - _Requirements: 14.2, 14.7_

  - [x] 7.2 Create logging middleware
    - Log incoming requests with method, path, request_id
    - Log response status and duration
    - _Requirements: 14.2, 14.3_

- [x] 8. Logging Configuration

  - [-] 8.1 Set up structlog
    - Configure structured logging with JSON output
    - Add processors for timestamps, log levels, and context
    - Support configurable log levels via LOG_LEVEL environment variable
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

- [-] 9. FastAPI Application Setup

  - [x] 9.1 Create main application entry point

    - Initialize FastAPI app with metadata
    - Register exception handlers
    - Register middleware
    - Configure CORS
    - Set up dependency injection
    - Configure OpenAPI documentation
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

  - [x] 9.2 Create dependency injection functions
    - Create get_db_session() dependency for database sessions
    - Create get_keycloak_service() dependency
    - Create get_encryption_service() dependency
    - Create get_token_vault_service() dependency
    - Create get_state_token_service() dependency
    - _Requirements: 17.3_

- [x] 10. API Endpoints - Health Checks

  - [x] 10.1 Implement health check endpoint

    - Create GET /health endpoint returning status "healthy"
    - Include version information
    - _Requirements: 15.1, 15.5_

  - [x] 10.2 Implement readiness check endpoint
    - Create GET /health/ready endpoint
    - Check database connectivity
    - Return 200 if ready, 503 if not ready
    - _Requirements: 15.2, 15.3, 15.4, 15.5_

- [x] 11. API Endpoints - Token Validation

  - [x] 11.1 Implement validate token endpoint
    - Create GET /api/auth/manager/validate-token endpoint
    - Extract Bearer token from Authorization header
    - Call Keycloak introspection endpoint
    - Return 200 if active, 401 if not active
    - Handle missing Authorization header
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 12. API Endpoints - Access Token

  - [x] 12.1 Implement access token endpoint
    - Create POST /api/auth/manager/access-token endpoint
    - Validate Bearer token in Authorization header
    - Validate persistent_token_id query parameter as UUID
    - Retrieve and decrypt token from vault
    - Call Keycloak to refresh access token
    - Return new access token and expires_in
    - Handle token not found (404)
    - Handle refresh failures
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 13. API Endpoints - Offline Token Request

  - [x] 13.1 Implement offline token consent endpoint
    - Create GET /api/auth/manager/offline-token endpoint
    - Validate Bearer token
    - Extract user_id and session_state_id from token
    - Generate state token with user_id and session_state_id
    - Construct Keycloak authorization URL with offline_access scope
    - Return consent URL, session_state_id, state token, and message
    - Handle invalid access token (401)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 14. API Endpoints - Offline Token Callback

  - [x] 14.1 Implement offline token callback endpoint
    - Create GET /api/auth/manager/offline-token/callback endpoint
    - Validate code and state query parameters
    - Parse and validate state token
    - Exchange authorization code for tokens with Keycloak
    - Encrypt and store offline token in vault
    - Return persistent_token_id and session_state_id
    - Handle missing code parameter (400)
    - Handle Keycloak error parameter
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 15. API Endpoints - Offline Token Generation

  - [x] 15.1 Implement offline token generation endpoint
    - Create POST /api/auth/manager/offline-token-id endpoint
    - Validate Bearer token
    - Retrieve user's refresh token from vault by session_state_id
    - Request new offline token from Keycloak with offline_access scope
    - Encrypt and store new offline token
    - Return new persistent_token_id and session_state_id
    - Handle no refresh token found (404)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [ ] 16. API Endpoints - Offline Token Revocation

  - [ ] 16.1 Implement offline token revocation endpoint
    - Create DELETE /api/auth/manager/offline-token-id endpoint
    - Validate Bearer token
    - Validate id query parameter as UUID
    - Retrieve token from vault by persistent_token_id
    - Decrypt token
    - Revoke token using Keycloak revocation endpoint
    - Check for duplicate token_hash
    - Check for shared session_state_id
    - Revoke Keycloak session if no other tokens share it
    - Delete token from vault
    - Return success response with revocation details
    - Handle token not found (404)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9_

- [ ] 17. Testing Infrastructure

  - [ ] 17.1 Set up pytest configuration

    - Configure pytest with pytest-asyncio
    - Create conftest.py with shared fixtures
    - Set up test database fixtures
    - Create Keycloak mock fixtures
    - _Requirements: 19.1, 19.2, 19.3_

  - [ ]\* 17.2 Write unit tests

    - Test encryption/decryption functions
    - Test token hashing
    - Test state token generation/parsing
    - Test Pydantic model validation
    - Test configuration validation
    - _Requirements: 19.4_

  - [ ]\* 17.3 Write integration tests

    - Test repository CRUD operations
    - Test service layer methods
    - Test database transactions
    - _Requirements: 19.5_

  - [ ]\* 17.4 Write end-to-end tests
    - Test all API endpoints with test database
    - Test error scenarios
    - Test authentication flows
    - Achieve 80% code coverage for core logic
    - _Requirements: 19.6, 19.7_

- [ ] 18. Deployment Configuration

  - [ ] 18.1 Create Dockerfile

    - Use multi-stage build with Python 3.12-slim
    - Install UV and dependencies
    - Copy application code
    - Create non-root user
    - Expose port 8000
    - Set uvicorn as entrypoint
    - _Requirements: 20.1, 20.2, 20.5, 20.6_

  - [ ] 18.2 Create docker-compose.yml

    - Define auth-manager service
    - Define PostgreSQL service
    - Configure environment variables
    - Set up volumes for development
    - Configure networking
    - _Requirements: 20.3_

  - [ ] 18.3 Create deployment documentation
    - Document all environment variables
    - Provide setup instructions
    - Include migration steps
    - Add troubleshooting guide
    - _Requirements: 20.4_

- [ ] 19. Documentation

  - [ ] 19.1 Create README.md

    - Add project overview
    - Include setup instructions
    - Document API endpoints
    - Add development guide
    - Include deployment instructions

  - [ ] 19.2 Verify OpenAPI documentation
    - Ensure all endpoints are documented
    - Add request/response examples
    - Document authentication requirements
    - Test Swagger UI at /docs
    - Test ReDoc at /redoc
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

- [ ] 20. Integration and Testing

  - [ ] 20.1 Test with existing Keycloak setup

    - Verify token refresh works
    - Verify offline token flow works
    - Verify token revocation works
    - Test with real Keycloak instance

  - [ ] 20.2 Verify database compatibility

    - Test with existing PostgreSQL database
    - Verify migrations work correctly
    - Test data integrity

  - [ ] 20.3 Performance testing
    - Test concurrent requests
    - Verify connection pooling
    - Check response times
    - Monitor resource usage
