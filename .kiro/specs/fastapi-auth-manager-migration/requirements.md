# Requirements Document

## Introduction

This document outlines the requirements for migrating the Auth Manager service from a Next.js TypeScript application to a standalone Python FastAPI application. The Auth Manager service handles Keycloak token management, including refresh tokens, offline tokens, access token generation, and token validation. The migration will preserve all existing functionality while leveraging Python's ecosystem with FastAPI, Pydantic, SQLAlchemy, and UV package manager.

## Glossary

- **Auth Manager Service**: A microservice responsible for managing OAuth tokens (refresh, offline, access) with Keycloak integration
- **FastAPI Application**: The Python web framework used to build the new Auth Manager service
- **Keycloak**: The identity and access management solution providing OAuth2/OIDC authentication
- **Token Vault**: A secure storage system for encrypted refresh and offline tokens in PostgreSQL
- **Persistent Token ID**: A UUID identifier used to reference stored tokens in the vault
- **Offline Token**: A long-lived refresh token with offline_access scope that doesn't expire when user logs out
- **Refresh Token**: A short-lived token used to obtain new access tokens
- **Access Token**: A JWT token used to authenticate API requests
- **Session State ID**: Keycloak's session identifier linking tokens to user sessions
- **UV**: A fast Python package installer and resolver
- **Pydantic**: Python library for data validation using type annotations
- **SQLAlchemy**: Python SQL toolkit and ORM for database operations
- **Token Encryption**: AES-256-CBC encryption applied to tokens before storage
- **Token Hash**: SHA-256 hash of tokens used for deduplication

## Requirements

### Requirement 1: Project Setup and Configuration

**User Story:** As a developer, I want to set up a FastAPI project with UV package manager, so that I have a modern Python development environment with fast dependency resolution.

#### Acceptance Criteria

1. WHEN the project is initialized, THE Auth Manager Service SHALL create a pyproject.toml file with UV configuration using https://docs.astral.sh/uv/#installation
2. THE Auth Manager Service SHALL use Python 3.12 or later as the minimum version
3. THE Auth Manager Service SHALL include FastAPI, Pydantic v2, SQLAlchemy 2.0, and required dependencies in pyproject.toml
4. THE Auth Manager Service SHALL create a project structure in the auth-manager-svc directory with separate modules for routes, services, models, and database
5. THE Auth Manager Service SHALL provide a .env.example file documenting all required environment variables

### Requirement 2: Database Models and Schema

**User Story:** As a developer, I want to define SQLAlchemy models matching the existing database schema, so that the Python application can interact with the PostgreSQL token vault.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL create a SQLAlchemy model for the auth_vault table with all existing columns
2. THE Auth Manager Service SHALL define PostgreSQL ENUM types for token_type (offline, refresh)
3. THE Auth Manager Service SHALL include UUID primary key, user_id, token_type, encrypted_token, iv, token_hash, metadata (JSONB), session_state_id, and created_at and updated_at fields
4. THE Auth Manager Service SHALL create database indexes matching the existing schema on user_id+token_type, session_state_id.
5. THE Auth Manager Service SHALL provide Alembic migration scripts for database schema management

### Requirement 3: Pydantic Models for Request/Response Validation

**User Story:** As a developer, I want to define Pydantic models for all API requests and responses, so that data validation is automatic and type-safe.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL create Pydantic models for all API request payloads with field validation
2. THE Auth Manager Service SHALL create Pydantic models for all API response payloads matching existing TypeScript interfaces
3. THE Auth Manager Service SHALL define models for AccessTokenResponse, OfflineTokenResponse, ValidationResponse, and ErrorResponse
4. THE Auth Manager Service SHALL use Pydantic's UUID validation for persistent_token_id fields
5. THE Auth Manager Service SHALL include custom validators for Keycloak-specific fields where needed

### Requirement 4: Token Encryption and Security

**User Story:** As a security engineer, I want tokens to be encrypted before storage using AES-256-CBC, so that sensitive token data is protected at rest.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL implement AES-256-CBC encryption for token storage using the cryptography library
2. THE Auth Manager Service SHALL generate random initialization vectors (IV) for each encrypted token
3. THE Auth Manager Service SHALL retrieve the encryption key from AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY environment variable
4. THE Auth Manager Service SHALL validate that the encryption key is a 64-character hex string (32 bytes)
5. THE Auth Manager Service SHALL compute SHA-256 hashes of tokens for deduplication purposes
6. THE Auth Manager Service SHALL decrypt tokens when retrieving them from the vault

### Requirement 5: Keycloak Client Integration

**User Story:** As a developer, I want to integrate with Keycloak's OAuth endpoints, so that the service can refresh tokens, request offline tokens, introspect tokens, and revoke tokens.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL implement a Keycloak client class with methods for token operations
2. WHEN refreshing an access token, THE Auth Manager Service SHALL call Keycloak's token endpoint with refresh_token grant type
3. WHEN requesting an offline token, THE Auth Manager Service SHALL call Keycloak's token endpoint with offline_access scope
4. WHEN introspecting a token, THE Auth Manager Service SHALL call Keycloak's introspection endpoint with client credentials
5. WHEN revoking a token, THE Auth Manager Service SHALL call Keycloak's revocation endpoint
6. WHEN revoking a session, THE Auth Manager Service SHALL call Keycloak's admin API to delete the session
7. THE Auth Manager Service SHALL retrieve Keycloak configuration from environment variables (issuer, client_id, client_secret, endpoints)
8. THE Auth Manager Service SHALL handle Keycloak error responses and map them to appropriate HTTP status codes

### Requirement 6: Token Vault Storage Operations

**User Story:** As a developer, I want to implement database operations for the token vault, so that tokens can be securely stored, retrieved, updated, and deleted.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL implement a create operation that stores encrypted tokens with metadata
2. THE Auth Manager Service SHALL implement a retrieve operation that fetches and decrypts tokens by persistent_token_id
3. THE Auth Manager Service SHALL implement a delete operation that removes tokens by persistent_token_id
4. THE Auth Manager Service SHALL implement an upsert operation for refresh tokens ensuring only one refresh token per user
5. THE Auth Manager Service SHALL implement a getUserRefreshTokenById operation to fetch tokens by persistent_token_id
6. THE Auth Manager Service SHALL implement a getUserRefreshTokenBySessionId operation to fetch tokens by session_state_id
7. THE Auth Manager Service SHALL implement a getUserRefreshTokenByUserId operation to fetch tokens by user_id
8. THE Auth Manager Service SHALL implement an updateOfflineTokenById operation to update offline token status
9. THE Auth Manager Service SHALL implement a retrieveAllBySessionStateId operation to find tokens sharing a session
10. THE Auth Manager Service SHALL implement a retrieveDuplicateTokenHash operation to detect duplicate tokens

### Requirement 7: Access Token Endpoint

**User Story:** As an API consumer, I want to retrieve a fresh access token using a persistent token ID, so that I can authenticate API requests without storing refresh tokens.

#### Acceptance Criteria

1. WHEN a POST request is made to /api/auth/manager/access-token, THE Auth Manager Service SHALL validate the request has a valid access token in Authorization header
2. WHEN the persistent_token_id query parameter is provided, THE Auth Manager Service SHALL validate it is a valid UUID
3. THE Auth Manager Service SHALL retrieve the stored refresh/offline token from the vault using the persistent_token_id
4. THE Auth Manager Service SHALL decrypt the token and use it to request a new access token from Keycloak
5. THE Auth Manager Service SHALL return the new access token and expires_in value in the response
6. IF the persistent_token_id is not found, THE Auth Manager Service SHALL return a 404 error with code "token_not_found"
7. IF the token refresh fails, THE Auth Manager Service SHALL return an appropriate error response

### Requirement 8: Token Validation Endpoint

**User Story:** As an API consumer, I want to validate my access token, so that I can verify it is still active before making authenticated requests.

#### Acceptance Criteria

1. WHEN a GET request is made to /api/auth/manager/validate-token, THE Auth Manager Service SHALL extract the Bearer token from Authorization header
2. THE Auth Manager Service SHALL introspect the token using Keycloak's introspection endpoint
3. IF the token is active, THE Auth Manager Service SHALL return a 200 OK response
4. IF the token is not active or invalid, THE Auth Manager Service SHALL return a 401 error with code "token_not_active"
5. IF the Authorization header is missing, THE Auth Manager Service SHALL return a 401 error with code "unauthorized"

### Requirement 9: Offline Token Request Endpoint

**User Story:** As an API consumer, I want to request user consent for offline access, so that I can obtain a long-lived offline token for background operations.

#### Acceptance Criteria

1. WHEN a GET request is made to /api/auth/manager/offline-token, THE Auth Manager Service SHALL validate the request has a valid access token
2. THE Auth Manager Service SHALL extract the user_id and session_state_id from the validated token
3. THE Auth Manager Service SHALL generate a state token containing user_id and session_state_id
4. THE Auth Manager Service SHALL construct a Keycloak authorization URL with offline_access scope and the state token
5. THE Auth Manager Service SHALL return the consent URL, session_state_id, state token, and a message in the response
6. IF the access token is invalid, THE Auth Manager Service SHALL return a 401 error

### Requirement 10: Offline Token Callback Endpoint

**User Story:** As the Auth Manager Service, I want to handle the OAuth callback from Keycloak after user consent, so that I can exchange the authorization code for an offline token and store it securely.

#### Acceptance Criteria

1. WHEN a GET request is made to /api/auth/manager/offline-token/callback, THE Auth Manager Service SHALL validate the code and state query parameters are present
2. THE Auth Manager Service SHALL parse and validate the state token to extract user_id and session_state_id
3. THE Auth Manager Service SHALL exchange the authorization code for tokens using Keycloak's token endpoint
4. THE Auth Manager Service SHALL encrypt and store the offline token in the vault with type "offline"
5. THE Auth Manager Service SHALL return the persistent_token_id and session_state_id in the response
6. IF the code parameter is missing, THE Auth Manager Service SHALL return a 400 error with code "invalid_request"
7. IF Keycloak returns an error parameter, THE Auth Manager Service SHALL return the error with code "keycloak_error"

### Requirement 11: Offline Token Generation Endpoint

**User Story:** As an API consumer, I want to generate a new offline token from an existing refresh token, so that I can create additional offline tokens without requiring user consent again.

#### Acceptance Criteria

1. WHEN a POST request is made to /api/auth/manager/offline-token-id, THE Auth Manager Service SHALL validate the request has a valid access token
2. THE Auth Manager Service SHALL retrieve the user's refresh token from the vault using the session_state_id
3. THE Auth Manager Service SHALL use the refresh token to request a new offline token from Keycloak with offline_access scope
4. THE Auth Manager Service SHALL encrypt and store the new offline token in the vault
5. THE Auth Manager Service SHALL return the new persistent_token_id and session_state_id
6. IF no refresh token is found for the session, THE Auth Manager Service SHALL return a 404 error with code "token_not_found"

### Requirement 12: Offline Token Revocation Endpoint

**User Story:** As an API consumer, I want to revoke an offline token, so that it can no longer be used to generate access tokens.

#### Acceptance Criteria

1. WHEN a DELETE request is made to /api/auth/manager/offline-token-id, THE Auth Manager Service SHALL validate the request has a valid access token
2. THE Auth Manager Service SHALL validate the id query parameter is a valid UUID
3. THE Auth Manager Service SHALL retrieve the token from the vault using the persistent_token_id
4. THE Auth Manager Service SHALL decrypt the token and revoke it using Keycloak's revocation endpoint
5. THE Auth Manager Service SHALL check if other tokens share the same token_hash or session_state_id
6. IF no other tokens share the token, THE Auth Manager Service SHALL revoke the Keycloak session
7. THE Auth Manager Service SHALL delete the token entry from the vault
8. THE Auth Manager Service SHALL return a success response with revocation details
9. IF the token is not found, THE Auth Manager Service SHALL return a 404 error

### Requirement 13: Error Handling and Response Formatting

**User Story:** As an API consumer, I want consistent error responses across all endpoints, so that I can handle errors predictably in my client application.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL return error responses with a consistent JSON structure containing error, code, details, and operation fields
2. THE Auth Manager Service SHALL map Pydantic validation errors to 400 Bad Request responses with code "validation_error"
3. THE Auth Manager Service SHALL map authentication failures to 401 Unauthorized responses with code "unauthorized"
4. THE Auth Manager Service SHALL map not found errors to 404 Not Found responses with appropriate error codes
5. THE Auth Manager Service SHALL map Keycloak errors to appropriate HTTP status codes with code "keycloak_error"
6. THE Auth Manager Service SHALL include detailed error information in the details field for debugging
7. THE Auth Manager Service SHALL return success responses with a consistent JSON structure containing the data field

### Requirement 14: Logging and Monitoring

**User Story:** As a DevOps engineer, I want structured logging throughout the application, so that I can monitor and debug the service in production.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL use Python's structlog library for structured logging
2. THE Auth Manager Service SHALL log all incoming requests with method, path, and request_id
3. THE Auth Manager Service SHALL log all Keycloak API calls with endpoint, status code, and duration
4. THE Auth Manager Service SHALL log all database operations with operation type and execution time
5. THE Auth Manager Service SHALL log errors with full stack traces and context information
6. THE Auth Manager Service SHALL support configurable log levels via LOG_LEVEL environment variable
7. THE Auth Manager Service SHALL include correlation IDs in logs for request tracing

### Requirement 15: Health Check and Readiness Endpoints

**User Story:** As a DevOps engineer, I want health check endpoints, so that I can monitor the service status and database connectivity.

#### Acceptance Criteria

1. WHEN a GET request is made to /health, THE Auth Manager Service SHALL return a 200 OK response with status "healthy"
2. WHEN a GET request is made to /health/ready, THE Auth Manager Service SHALL check database connectivity
3. IF the database is reachable, THE Auth Manager Service SHALL return a 200 OK response with status "ready"
4. IF the database is not reachable, THE Auth Manager Service SHALL return a 503 Service Unavailable response with status "not_ready"
5. THE Auth Manager Service SHALL include version information in health check responses

### Requirement 16: Configuration Management

**User Story:** As a developer, I want centralized configuration management, so that all environment variables are validated and easily accessible throughout the application.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL use Pydantic Settings for configuration management
2. THE Auth Manager Service SHALL validate all required environment variables on startup
3. THE Auth Manager Service SHALL provide clear error messages for missing or invalid configuration
4. THE Auth Manager Service SHALL support the following configuration categories: Database, Keycloak, Encryption, and Application
5. THE Auth Manager Service SHALL fail fast on startup if required configuration is missing
6. THE Auth Manager Service SHALL support loading configuration from .env files in development

### Requirement 17: Database Connection Management

**User Story:** As a developer, I want efficient database connection pooling, so that the application can handle concurrent requests without connection exhaustion.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL use SQLAlchemy's async engine for database operations
2. THE Auth Manager Service SHALL configure connection pooling with appropriate pool size and timeout settings
3. THE Auth Manager Service SHALL use FastAPI's dependency injection for database session management
4. THE Auth Manager Service SHALL automatically commit successful transactions and rollback failed transactions
5. THE Auth Manager Service SHALL close database sessions after each request
6. THE Auth Manager Service SHALL handle database connection errors gracefully with retries

### Requirement 18: API Documentation

**User Story:** As an API consumer, I want interactive API documentation, so that I can understand and test the endpoints without reading code.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL generate OpenAPI 3.0 specification automatically from FastAPI route definitions
2. THE Auth Manager Service SHALL provide Swagger UI at /docs for interactive API testing
3. THE Auth Manager Service SHALL provide ReDoc documentation at /redoc for alternative documentation view
4. THE Auth Manager Service SHALL include request/response examples in the API documentation
5. THE Auth Manager Service SHALL document all query parameters, request bodies, and response schemas
6. THE Auth Manager Service SHALL include authentication requirements in the documentation

### Requirement 19: Testing Infrastructure

**User Story:** As a developer, I want a comprehensive testing setup, so that I can verify the application works correctly and prevent regressions.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL use pytest as the testing framework
2. THE Auth Manager Service SHALL provide fixtures for database setup and teardown
3. THE Auth Manager Service SHALL provide fixtures for mocking Keycloak API responses
4. THE Auth Manager Service SHALL include unit tests for encryption, hashing, and utility functions
5. THE Auth Manager Service SHALL include integration tests for database operations
6. THE Auth Manager Service SHALL include end-to-end tests for API endpoints
7. THE Auth Manager Service SHALL achieve at least 80% code coverage for core business logic

### Requirement 20: Deployment Configuration

**User Story:** As a DevOps engineer, I want deployment configuration files, so that I can run the service in containerized environments.

#### Acceptance Criteria

1. THE Auth Manager Service SHALL provide a Dockerfile for building the application image
2. THE Auth Manager Service SHALL use a multi-stage build to minimize image size
3. THE Auth Manager Service SHALL provide a docker-compose.yml for local development with PostgreSQL
4. THE Auth Manager Service SHALL document all required environment variables in deployment documentation
5. THE Auth Manager Service SHALL run as a non-root user in the container for security
6. THE Auth Manager Service SHALL expose the application on a configurable port (default 8000)
