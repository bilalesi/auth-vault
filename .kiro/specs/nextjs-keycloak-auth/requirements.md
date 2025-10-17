# Requirements Document

## Introduction

This document specifies the requirements for implementing a robust authentication and authorization system using Next.js 15 (App Router) and Keycloak. The system manages multiple token types (access, refresh, and offline tokens) to support both session-bound operations (web client, Jupyter notebooks) and non-session-bound operations (background tasks). The Authentication Manager component handles token lifecycle management, secure storage, and automatic refresh mechanisms to ensure seamless user experience across different execution contexts.

## Glossary

- **Core Web App**: The main Next.js application that users interact with through their browser, uses NextAuth.js exclusively for obtaining refresh tokens from Keycloak during login
- **Authentication Manager**: A server-side component within the Web Server that manages token storage and token refresh operations via API routes
- **Web Client**: Browser-based application code that interacts directly with Keycloak for authentication
- **Web Server**: Next.js application serving static assets, React components, and API routes
- **Keycloak**: Identity Provider (IdP) implementing OAuth2/OIDC protocols for issuing and validating authentication tokens
- **NextAuth.js**: Used only in the Core Web App to handle the OAuth callback and extract refresh tokens for storage
- **Access Token**: Short-lived JWT token (1 hour lifetime) used to authenticate API requests to protected services
- **Refresh Token**: Session-bound token (12 hours lifetime) used to obtain new access tokens while the user session is active
- **Offline Token**: Special refresh token (10 days lifetime) obtained with offline_access scope, valid beyond user session for background tasks
- **Persistent Token ID**: Server-generated identifier used by clients to reference securely stored refresh or offline tokens
- **EntityCore**: Backend service providing access to entity metadata and assets, requiring valid access tokens
- **EntitySDK**: Python client library for EntityCore that handles automatic token refresh
- **Task Manager**: Service executing non-session-bound background tasks on behalf of users
- **Jupyter Notebook Launcher**: Service that provisions Python kernels with appropriate authentication credentials
- **Jupyter Notebook Code**: User code executing within a Jupyter kernel environment
- **Secured Vault**: Server-side encrypted storage mechanism for sensitive tokens

## Requirements

### Requirement 1: User Authentication Flow

**User Story:** As a user, I want to log in once and access all services seamlessly, so that I don't need to repeatedly authenticate during my session.

#### Acceptance Criteria

1. WHEN a user initiates login in the Core Web App, THE Core Web App SHALL redirect the user to Keycloak for authentication using NextAuth.js
2. WHEN Keycloak successfully authenticates the user, THE NextAuth.js callback SHALL receive an access token and refresh token from Keycloak
3. WHEN NextAuth.js receives tokens from Keycloak, THE Core Web App SHALL store the refresh token in the Token Vault database
4. WHEN the Core Web App stores the refresh token, THE Core Web App SHALL create a session with the user information
5. WHEN a user logs out, THE Core Web App SHALL invalidate the refresh token in Keycloak and remove it from the Token Vault

### Requirement 2: Refresh Token Management in NextAuth Session

**User Story:** As a core web app, I want to store refresh tokens securely in the NextAuth session, so that they can be retrieved at request time for token operations.

#### Acceptance Criteria

1. WHEN NextAuth.js completes the OAuth callback, THE Core Web App SHALL store the access token and refresh token in the encrypted JWT session cookie
2. WHEN Keycloak issues a new refresh token, THE NextAuth.js SHALL automatically update the refresh token in the session
3. WHEN an API route needs the refresh token, THE API route SHALL retrieve it from the NextAuth session using getServerSession()
4. THE Core Web App SHALL never expose refresh tokens to client-side JavaScript
5. THE Core Web App SHALL store refresh tokens only in the encrypted HTTP-only session cookie

### Requirement 3: Persistent Token ID API for External Services

**User Story:** As an external service (Jupyter, Task Manager), I want to retrieve persistent token IDs, so that I can obtain fresh access tokens without user interaction.

#### Acceptance Criteria

1. WHEN an external service requests a persistent token ID with a valid user session, THE Authentication Manager API SHALL retrieve the stored refresh token from the Token Vault
2. WHEN the Authentication Manager API retrieves a refresh token, THE Authentication Manager API SHALL return the persistent token ID to the requesting service
3. WHEN an external service provides a persistent token ID to request a new access token, THE Authentication Manager API SHALL retrieve the associated refresh token from the Token Vault
4. WHEN the Authentication Manager API retrieves a refresh token, THE Authentication Manager API SHALL exchange it with Keycloak for a new access token
5. WHEN the Authentication Manager API receives a new access token from Keycloak, THE Authentication Manager API SHALL return the access token to the requesting service

### Requirement 4: Jupyter Notebook Token Management

**User Story:** As a data scientist, I want my Jupyter notebook to automatically refresh tokens, so that my long-running analyses complete without authentication failures.

#### Acceptance Criteria

1. WHEN the Jupyter Notebook Launcher receives a notebook launch request with a valid access token, THE Jupyter Notebook Launcher SHALL request a persistent token ID from the Authentication Manager
2. WHEN the Jupyter Notebook Launcher receives a persistent token ID, THE Jupyter Notebook Launcher SHALL inject both the access token and persistent token ID as environment variables into the kernel
3. WHEN the Jupyter Notebook Code initializes EntitySDK with a persistent token ID, THE EntitySDK SHALL use the access token for API requests
4. WHEN EntityCore returns a 401 error to EntitySDK, THE EntitySDK SHALL request a new access token from the Authentication Manager using the persistent token ID
5. WHEN EntitySDK receives a new access token, THE EntitySDK SHALL retry the failed request with the new access token

### Requirement 5: Offline Token Management for Background Tasks

**User Story:** As a user, I want to launch background tasks that continue running after I log out, so that long-running jobs complete without requiring my active session.

#### Acceptance Criteria

1. WHEN the Task Manager receives a task launch request with a valid access token, THE Task Manager SHALL request an offline token ID from the Authentication Manager
2. WHEN the Authentication Manager receives an offline token request, THE Authentication Manager SHALL request an offline token from Keycloak with the offline_access scope
3. WHEN Keycloak requires user consent for offline access, THE Authentication Manager SHALL redirect the user to Keycloak's consent page
4. WHEN the user grants consent and Keycloak returns an offline token, THE Authentication Manager SHALL store the offline token in the Secured Vault
5. WHEN the Authentication Manager stores an offline token, THE Authentication Manager SHALL generate a unique persistent token ID and return it to the Task Manager

### Requirement 6: Background Task Token Refresh

**User Story:** As a system administrator, I want background tasks to automatically refresh their access tokens, so that long-running jobs complete successfully even after user sessions expire.

#### Acceptance Criteria

1. WHEN Task Manager Code initializes EntitySDK with a persistent token ID, THE EntitySDK SHALL use the associated access token for API requests
2. WHEN EntityCore returns a 401 error during background task execution, THE EntitySDK SHALL request a new access token from the Authentication Manager using the persistent token ID
3. WHEN the Authentication Manager receives an access token request with a persistent token ID associated with an offline token, THE Authentication Manager SHALL exchange the offline token with Keycloak for a new access token
4. WHEN the Authentication Manager receives a new access token from Keycloak, THE Authentication Manager SHALL return the new access token to EntitySDK
5. WHEN EntitySDK receives a new access token, THE EntitySDK SHALL retry the failed request with the new access token

### Requirement 7: Offline Token Revocation

**User Story:** As a user, I want to revoke access for background tasks, so that I can control which tasks can act on my behalf.

#### Acceptance Criteria

1. WHEN a client requests offline token revocation with a valid persistent token ID, THE Authentication Manager SHALL retrieve the associated offline token from the Secured Vault
2. WHEN the Authentication Manager retrieves an offline token for revocation, THE Authentication Manager SHALL invalidate the offline token in Keycloak
3. WHEN Keycloak confirms offline token invalidation, THE Authentication Manager SHALL remove the offline token from the Secured Vault
4. WHEN the Authentication Manager completes offline token revocation, THE Authentication Manager SHALL return a success response to the client
5. WHEN a client attempts to use a revoked persistent token ID, THE Authentication Manager SHALL return an error indicating the token is no longer valid

### Requirement 8: Secure Token Storage

**User Story:** As a security administrator, I want all sensitive tokens stored securely, so that tokens are never exposed to client-side code or user runtime environments.

#### Acceptance Criteria

1. THE Core Web App SHALL store refresh tokens in encrypted JWT session cookies (HTTP-only, Secure, SameSite)
2. THE Authentication Manager API SHALL store offline tokens in the Token Vault database with AES-256-GCM encryption
3. THE Core Web App SHALL never expose refresh tokens to the Web Client browser code
4. THE Authentication Manager API SHALL never expose offline tokens to the Web Client or Jupyter Notebook Code
5. THE Authentication Manager API SHALL only expose access tokens and persistent token IDs to external services

### Requirement 9: Authentication Manager API Endpoints

**User Story:** As a service developer, I want well-defined API endpoints for token management, so that I can integrate authentication into various services consistently.

#### Acceptance Criteria

1. THE Authentication Manager SHALL provide a POST /refresh_token_id endpoint that accepts a valid access token and returns a persistent token ID for a refresh token
2. THE Authentication Manager SHALL provide a POST /offline_token_id endpoint that accepts a valid access token and returns a persistent token ID for an offline token after user consent
3. THE Authentication Manager SHALL provide a POST /access_token endpoint that accepts a persistent token ID and returns a valid access token
4. THE Authentication Manager SHALL provide a DELETE /offline_token_id endpoint that accepts a persistent token ID and invalidates the corresponding offline token
5. WHEN any endpoint receives an invalid or expired access token, THE Authentication Manager SHALL return a 401 error response

### Requirement 10: Token Lifecycle Management

**User Story:** As a system operator, I want tokens to be automatically cleaned up when they expire, so that the system maintains optimal performance and security.

#### Acceptance Criteria

1. WHEN an access token expires (after 1 hour), THE Authentication Manager SHALL not accept it for new requests
2. WHEN a refresh token expires (after 12 hours), THE Authentication Manager SHALL remove it from the Secured Vault
3. WHEN an offline token expires (after 10 days), THE Authentication Manager SHALL remove it from the Secured Vault
4. WHEN a user session ends, THE Authentication Manager SHALL invalidate the associated refresh token in Keycloak
5. THE Authentication Manager SHALL implement a cleanup process that removes expired tokens from the Secured Vault at regular intervals
