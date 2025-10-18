import { AuthManagerError, AuthManagerErrorCodeDict } from "./vault-errors";

/**
 * Keycloak Client Operations Dictionary
 *
 * Centralized dictionary of all operation names used in the Keycloak client.
 * This ensures consistency in error reporting and logging.
 */
export const KeycloakOperationDict = {
  refreshAccessToken: "refreshAccessToken",
  requestOfflineToken: "requestOfflineToken",
  offlineTokenRefresh: "offlineTokenRefresh",
  revokeToken: "revokeToken",
  introspectToken: "introspectToken",
  getUserInfo: "getUserInfo",
} as const;

export type KeycloakOperation =
  (typeof KeycloakOperationDict)[keyof typeof KeycloakOperationDict];

/**
 * Keycloak Configuration
 */
export interface KeycloakConfig {
  issuer: string; // e.g., http://localhost:8081/auth/realms/SBO
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  introspectionEndpoint: string;
  revocationEndpoint: string;
  userinfoEndpoint: string;
}

/**
 * Token Response from Keycloak
 */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
  token_type: string;
  id_token?: string;
  scope?: string;
  session_state: string;
}

/**
 * Token Introspection Response
 */
export interface TokenIntrospection {
  active: boolean;
  exp?: number;
  iat?: number;
  sub?: string;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
}

/**
 * User Info Response
 */
export interface UserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
}

/**
 * Keycloak Client for token operations
 */
export class KeycloakClient {
  private config: KeycloakConfig;
  private agent: any; // HTTP agent for connection pooling

  constructor(config?: Partial<KeycloakConfig>) {
    const issuer = config?.issuer || process.env.KEYCLOAK_ISSUER!;
    const clientId = config?.clientId || process.env.KEYCLOAK_CLIENT_ID!;
    const clientSecret =
      config?.clientSecret || process.env.KEYCLOAK_CLIENT_SECRET!;

    this.config = {
      issuer,
      clientId,
      clientSecret,
      tokenEndpoint:
        config?.tokenEndpoint || `${issuer}/protocol/openid-connect/token`,
      introspectionEndpoint:
        config?.introspectionEndpoint ||
        `${issuer}/protocol/openid-connect/token/introspect`,
      revocationEndpoint:
        config?.revocationEndpoint ||
        `${issuer}/protocol/openid-connect/revoke`,
      userinfoEndpoint:
        config?.userinfoEndpoint ||
        `${issuer}/protocol/openid-connect/userinfo`,
    };

    // Configure HTTP agent for connection pooling and keep-alive
    if (typeof window === "undefined") {
      // Server-side only
      const http = require("http");
      const https = require("https");

      const agentOptions = {
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 60000,
      };

      this.agent = issuer.startsWith("https")
        ? new https.Agent(agentOptions)
        : new http.Agent(agentOptions);
    }
  }

  /**
   * Get the HTTP agent for connection pooling
   */
  private getAgent() {
    return this.agent;
  }

  /**
   * Make a fetch request with the configured agent
   */
  private async fetch(url: string, options: RequestInit = {}) {
    const fetchOptions: RequestInit = {
      ...options,
      // @ts-ignore - agent is not in RequestInit type but works in Node.js
      agent: this.getAgent(),
    };

    return fetch(url, fetchOptions);
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const response = await this.fetch(this.config.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new AuthManagerError(AuthManagerErrorCodeDict.keycloak_error, {
          reason: `Failed to refresh token: ${
            error.error_description || error.error || response.statusText
          }`,
          status: response.status,
          keycloakError: error.error,
          operation: KeycloakOperationDict.refreshAccessToken,
        });
      }

      return await response.json();
    } catch (error) {
      if (AuthManagerError.is(error)) {
        throw error;
      }
      console.error("Error refreshing access token:", error);
      throw new AuthManagerError(AuthManagerErrorCodeDict.keycloak_error, {
        originalError: error,
        operation: KeycloakOperationDict.refreshAccessToken,
      });
    }
  }

  /**
   * Request an offline token by exchanging a regular refresh token
   * This requests a new token with offline_access scope for long-running jobs
   */
  async requestOfflineToken(refreshToken: string): Promise<TokenResponse> {
    try {
      // Exchange the refresh token and explicitly request offline_access scope
      // This will return a long-lived offline token
      const response = await this.fetch(this.config.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          response_type: "code",
          scope: "openid profile email offline_access", // Explicitly request offline_access
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new AuthManagerError(AuthManagerErrorCodeDict.keycloak_error, {
          reason: `Failed to request offline token: ${
            error.error_description || error.error || response.statusText
          }`,
          status: response.status,
          keycloakError: error.error,
          operation: KeycloakOperationDict.requestOfflineToken,
        });
      }

      const tokenResponse = await response.json();

      // The refresh_token in the response is now an offline token (long-lived)
      return tokenResponse;
    } catch (error) {
      if (AuthManagerError.is(error)) {
        throw error;
      }
      console.error("Error requesting offline token:", error);
      throw new AuthManagerError(AuthManagerErrorCodeDict.keycloak_error, {
        originalError: error,
        operation: KeycloakOperationDict.requestOfflineToken,
      });
    }
  }

  /**
   * Exchange an offline token for a new access token
   */
  async offlineTokenRefresh(offlineToken: string): Promise<TokenResponse> {
    // Offline tokens are just long-lived refresh tokens
    return this.refreshAccessToken(offlineToken);
  }

  /**
   * Revoke a token (refresh token or access token)
   */
  async revoke(
    token: string,
    tokenTypeHint?: "refresh_token" | "access_token"
  ): Promise<void> {
    try {
      const params: Record<string, string> = {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        token,
      };

      if (tokenTypeHint) {
        params.token_type_hint = tokenTypeHint;
      }

      const response = await this.fetch(this.config.revocationEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new AuthManagerError(AuthManagerErrorCodeDict.keycloak_error, {
          reason: `Failed to revoke token: ${error || response.statusText}`,
          status: response.status,
          tokenTypeHint,
          operation: KeycloakOperationDict.revokeToken,
        });
      }
    } catch (error) {
      if (AuthManagerError.is(error)) {
        throw error;
      }
      console.error("Error revoking token:", error);
      throw new AuthManagerError(AuthManagerErrorCodeDict.keycloak_error, {
        originalError: error,
        operation: KeycloakOperationDict.revokeToken,
      });
    }
  }

  /**
   * Introspect a token to check if it's valid
   */
  async introspect(token: string): Promise<TokenIntrospection> {
    try {
      const response = await this.fetch(this.config.introspectionEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          token,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new AuthManagerError(
          AuthManagerErrorCodeDict.token_introspection_failed,
          {
            reason: `Failed to introspect token: ${
              error.error_description || error.error || response.statusText
            }`,
            status: response.status,
            keycloakError: error.error,
            operation: KeycloakOperationDict.introspectToken,
          }
        );
      }

      return await response.json();
    } catch (error) {
      if (AuthManagerError.is(error)) {
        throw error;
      }
      console.error("Error introspecting token:", error);
      throw new AuthManagerError(
        AuthManagerErrorCodeDict.token_introspection_failed,
        {
          originalError: error,
          operation: KeycloakOperationDict.introspectToken,
        }
      );
    }
  }

  /**
   * Get user information using an access token
   */
  async info(accessToken: string): Promise<UserInfo> {
    try {
      const response = await this.fetch(this.config.userinfoEndpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new AuthManagerError(AuthManagerErrorCodeDict.keycloak_error, {
          reason: `Failed to get user info: ${error || response.statusText}`,
          status: response.status,
          operation: KeycloakOperationDict.getUserInfo,
        });
      }

      return await response.json();
    } catch (error) {
      if (AuthManagerError.is(error)) {
        throw error;
      }
      console.error("Error getting user info:", error);
      throw new AuthManagerError(AuthManagerErrorCodeDict.keycloak_error, {
        originalError: error,
        operation: KeycloakOperationDict.getUserInfo,
      });
    }
  }

  get conf() {
    return this.config;
  }
}

/**
 * Singleton instance of KeycloakClient
 */
let keycloakClientInstance: KeycloakClient | null = null;

/**
 * Get or create a KeycloakClient instance
 */
export function getKeycloakClient(
  config?: Partial<KeycloakConfig>
): KeycloakClient {
  if (!keycloakClientInstance) {
    keycloakClientInstance = new KeycloakClient(config);
  }
  return keycloakClientInstance;
}
