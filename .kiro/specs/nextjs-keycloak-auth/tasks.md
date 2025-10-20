# Implementation Plan

- [x] 1. Set up project structure and dependencies

  - Initialize Next.js 15 project with App Router and TypeScript
  - Install core dependencies: next-auth@beta (v5), jose, zod
  - Install database client (postgres with drizzle orm and redis)
  - Configure TypeScript with strict mode and path aliases
  - Set up environment variables structure in .env.example
  - Create basic folder structure: lib/auth, app/api/auth, app/actions
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 2. Implement Keycloak client service

  - [x] 2.1 Create Keycloak configuration interface and client class

    - Define KeycloakConfig interface with issuer, clientId, clientSecret, and endpoint URLs
    - Implement KeycloakClient class with HTTP client configuration
    - Add connection pooling and keep-alive settings
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 2.2 Implement token exchange methods

    - Write refreshAccessToken method using refresh token grant
    - Write requestOfflineToken method with offline_access scope
    - Write revokeToken method for token revocation
    - Write introspectToken method for token validation
    - Add proper error handling and retry logic
    - _Requirements: 2.4, 5.2, 6.3, 7.2_

  - [x] 2.3 Add token response parsing and validation
    - Implement TokenResponse interface and parser
    - Implement TokenIntrospection interface and parser
    - Add Zod schemas for response validation
    - Handle Keycloak error responses
    - _Requirements: 9.5_

- [x] 3. Implement token vault service

  - [x] 3.1 Create token vault interface and encryption utilities

    - Define TokenVaultEntry interface
    - Implement AES-256-GCM encryption functions (encrypt/decrypt)
    - Create utility for generating unique persistent token IDs (UUID)
    - Add IV (initialization vector) generation for each encryption
    - _Requirements: 8.1, 8.2, 3.2, 3.3_

  - [x] 3.2 Implement token vault storage layer

    - Create database schema (Drizzle) and Redis key structure
    - Implement store method with encryption
    - Implement retrieve method with decryption
    - Implement delete method
    - Add indexes for userId and expiresAt
    - _Requirements: 3.1, 3.2, 3.3, 4.4, 5.4_

  - [x] 3.3 Add token cleanup and expiration handling
    - Implement cleanup method to remove expired tokens
    - Create scheduled job or cron for periodic cleanup
    - Add TTL handling for Redis implementation
    - _Requirements: 10.2, 10.3, 10.5_

- [x] 4. Configure NextAuth.js in Core Web App for session-based token management

  - [x] 4.1 Create NextAuth.js route handler and configuration

    - Set up app/api/auth/[...nextauth]/route.ts in Core Web App
    - Configure KeycloakProvider with client credentials
    - Set session strategy to JWT with 12-hour maxAge
    - Configure custom sign-in and error pages
    - _Requirements: 1.1, 1.2_

  - [x] 4.2 Implement JWT callback for token storage in session

    - Store access_token and refresh_token from account object in JWT token on initial sign in
    - Store access token expiration timestamp
    - Handle token updates when Keycloak issues new refresh token
    - Keep tokens in encrypted JWT (not exposed to client)
    - _Requirements: 1.2, 1.3, 2.1, 2.2_

  - [x] 4.3 Implement session callback for user info exposure

    - Pass user ID and information to session object
    - Do NOT pass tokens to session (they stay in JWT)
    - Ensure refresh tokens never exposed to client-side code
    - _Requirements: 8.3, 8.4, 2.4_

  - [x] 4.4 Add logout handler with token cleanup
    - Create custom signOut handler
    - Revoke refresh token in Keycloak
    - Clear session cookie
    - _Requirements: 1.5, 10.4_

- [x] 5. Implement API route for getting refresh token ID from session

  - [x] 5.1 Create POST /api/auth/token/refresh-id endpoint

    - Set up app/api/auth/token/refresh-id/route.ts
    - Use getServerSession() to retrieve NextAuth session
    - Return persistent token ID from session
    - _Requirements: 3.1, 3.2, 9.1_

  - [x] 5.2 Add session validation and token ID retrieval

    - Validate user session exists
    - Retrieve persistent token ID from session
    - Return token ID to authorized callers only (server-side)
    - Handle case where session expired (user needs to re-login)
    - _Requirements: 3.2, 2.3_

  - [x] 5.3 Add error handling
    - Handle missing session (401)
    - Handle expired session (401)
    - Return appropriate error codes
    - _Requirements: 9.5_

- [x] 7. Create API route for offline token ID generation

  - [x] 7.1 Implement POST /api/auth/token/offline-id endpoint

    - Create app/api/auth/token/offline-id/route.ts
    - Define request/response interfaces with Zod validation
    - Extract and validate access token from request
    - _Requirements: 9.2, 5.1_

  - [x] 7.2 Implement offline token request flow

    - Request offline token from Keycloak with offline_access scope
    - Handle consent requirement response
    - Return consent URL if user consent needed
    - _Requirements: 5.2, 5.3_

  - [x] 7.3 Add consent callback handler
    - Create callback route for Keycloak consent redirect
    - Extract offline token from callback
    - Store offline token in token vault
    - Generate and return persistent token ID
    - _Requirements: 5.3, 5.4, 5.5_

- [x] 8. Create API route for access token retrieval

  - [x] 8.1 Implement POST /api/auth/token/access endpoint

    - Create app/api/auth/token/access/route.ts
    - Define request/response interfaces with Zod validation
    - Validate persistent token ID format
    - _Requirements: 9.3, 3.4, 3.5_

  - [x] 8.2 Add token retrieval and exchange logic

    - Retrieve token from vault using persistent token ID
    - Determine token type (refresh vs offline)
    - Exchange token with Keycloak for new access token
    - Return new access token with expiration info
    - _Requirements: 4.4, 4.5, 6.3, 6.4, 6.5_

  - [x] 8.3 Handle token exchange errors
    - Handle token not found (404)
    - Handle expired tokens
    - Handle Keycloak exchange failures
    - Implement retry logic with exponential backoff
    - _Requirements: 9.5_

- [x] 9. Create API route for offline token revocation

  - [x] 9.1 Implement DELETE /api/auth/token/offline-id endpoint

    - Create app/api/auth/token/offline-id/route.ts with DELETE handler
    - Define request/response interfaces with Zod validation
    - Validate persistent token ID
    - _Requirements: 9.4, 7.1_

  - [x] 9.2 Add token revocation logic
    - Retrieve offline token from vault
    - Revoke token in Keycloak
    - Delete token from vault
    - Return success response
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

- [ ] 10. Implement server actions for client components

  - [ ] 10.1 Create launchNotebook server action

    - Create app/actions/auth.ts with "use server" directive
    - Implement launchNotebook function
    - Get current session and validate
    - Call refresh token ID endpoint
    - Integrate with Jupyter Launcher API
    - Return notebook URL and token ID
    - _Requirements: 4.1, 4.2_

  - [ ] 10.2 Create launchBackgroundTask server action

    - Implement launchBackgroundTask function
    - Get current session and validate
    - Call offline token ID endpoint
    - Handle consent flow if required
    - Integrate with Task Manager API
    - Return task ID and persistent token ID
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 10.3 Create revokeBackgroundTask server action
    - Implement revokeBackgroundTask function
    - Call offline token revocation endpoint
    - Handle errors gracefully
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 11. Create UI components for authentication flows

  - [ ] 11.1 Create sign-in page component

    - Create app/auth/signin/page.tsx
    - Add sign-in button that triggers NextAuth signIn
    - Style with Tailwind CSS or chosen UI library
    - Add error message display
    - _Requirements: 1.1_

  - [ ] 11.2 Create notebook launcher component

    - Create component with launch button
    - Call launchNotebook server action on click
    - Display loading state during launch
    - Handle errors and display messages
    - Open notebook in new tab on success
    - _Requirements: 4.1, 4.2_

  - [ ] 11.3 Create background task launcher component
    - Create component with task configuration form
    - Call launchBackgroundTask server action on submit
    - Handle consent flow (redirect to consent URL)
    - Display task status after launch
    - Add revoke button for active tasks
    - _Requirements: 5.1, 5.2, 5.3, 7.1_

- [ ] 12. Implement error handling and logging

  - [ ] 12.1 Create error types and error handling utilities

    - Define AuthErrorCode enum
    - Define AuthError interface
    - Create error factory functions
    - Implement error response formatters
    - _Requirements: 9.5_

  - [x] 12.2 Add logging infrastructure

    - Set up logging library (winston or pino)
    - Define AuthLogEvent interface
    - Create logger utility with structured logging
    - Add log levels (debug, info, warn, error)
    - _Requirements: 10.5_

  - [ ] 12.3 Integrate logging into all components
    - Add logging to Keycloak client operations
    - Add logging to token vault operations
    - Add logging to API routes
    - Add logging to NextAuth callbacks
    - Log authentication events and errors
    - _Requirements: 1.1, 1.2, 1.5, 2.4, 2.5_

- [ ] 13. Add security enhancements

  - [ ] 13.1 Implement rate limiting for API routes

    - Install rate limiting library (upstash/ratelimit or custom)
    - Add rate limiting logic to API route handlers
    - Configure limits per endpoint
    - Return 429 status on rate limit exceeded
    - _Requirements: 9.5_

  - [ ] 13.2 Add CSRF protection

    - Verify NextAuth.js CSRF protection is enabled
    - Add CSRF tokens to forms if needed
    - Validate CSRF tokens in API routes
    - _Requirements: 8.3, 8.4, 8.5_

  - [ ] 13.3 Implement security headers
    - Add security headers in next.config.ts
    - Set Content-Security-Policy
    - Set X-Frame-Options
    - Set X-Content-Type-Options
    - _Requirements: 8.3, 8.4, 8.5_

- [ ] 14. Create integration with external services

  - [ ] 14.1 Create Jupyter Launcher client

    - Define JupyterLauncherClient interface
    - Implement launch method with access token and persistent token ID
    - Handle launcher API errors
    - _Requirements: 4.1, 4.2_

  - [ ] 14.2 Create Task Manager client

    - Define TaskManagerClient interface
    - Implement launch method with task config and persistent token ID
    - Implement status check method
    - Handle task manager API errors
    - _Requirements: 5.1, 5.5_

  - [ ] 14.3 Create EntityCore client (for testing)
    - Define EntityCoreClient interface
    - Implement API methods with access token
    - Add automatic token refresh on 401
    - Use for end-to-end testing
    - _Requirements: 4.3, 4.4, 4.5, 6.2, 6.4, 6.5_

- [ ] 15. Write tests

  - [ ]\* 15.1 Write unit tests for Keycloak client

    - Mock Keycloak API responses
    - Test token refresh method
    - Test offline token request method
    - Test token revocation method
    - Test error handling
    - _Requirements: 2.4, 5.2, 6.3, 7.2_

  - [ ]\* 15.2 Write unit tests for token vault

    - Test encryption and decryption
    - Test token storage and retrieval
    - Test token deletion
    - Test cleanup of expired tokens
    - _Requirements: 3.1, 3.2, 3.3, 4.4, 10.2, 10.3_

  - [ ]\* 15.3 Write integration tests for API routes

    - Test refresh token ID endpoint
    - Test offline token ID endpoint
    - Test access token endpoint
    - Test offline token revocation endpoint
    - Mock Keycloak and vault dependencies
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]\* 15.4 Write integration tests for authentication flow

    - Test login flow with Keycloak
    - Test session creation
    - Test logout and token revocation
    - Use Playwright or Cypress for E2E tests
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]\* 15.5 Write integration tests for token refresh flow
    - Test NextAuth JWT callback token refresh logic
    - Test proactive refresh before expiration (2 minute threshold)
    - Test refresh on expired token
    - Test refresh token rotation
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ]\* 16. Set up monitoring and observability

  - [ ]\* 16.1 Add metrics collection

    - Install metrics library (prom-client or custom)
    - Add counters for authentication events
    - Add histograms for token refresh latency
    - Add gauges for active sessions
    - _Requirements: 10.5_

  - [ ]\* 16.2 Create health check endpoint

    - Create /api/health endpoint
    - Check database connectivity
    - Check Keycloak connectivity
    - Return health status
    - _Requirements: 9.5_

  - [ ]\* 16.3 Set up error tracking
    - Integrate error tracking service (Sentry or similar)
    - Configure error reporting for server and client
    - Add context to error reports
    - _Requirements: 9.5_

- [ ]\* 17. Create documentation and deployment configuration

  - [ ]\* 17.1 Write API documentation

    - Document all API endpoints with request/response examples
    - Document authentication flow
    - Document token refresh mechanisms
    - Create OpenAPI/Swagger spec
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]\* 17.2 Create deployment configuration

    - Create Dockerfile for containerization
    - Create docker-compose.yml for local development
    - Create Kubernetes manifests or Terraform configs
    - Document environment variables
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]\* 17.3 Write developer setup guide
    - Document local Keycloak setup
    - Document database setup
    - Document environment configuration
    - Create setup scripts
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
