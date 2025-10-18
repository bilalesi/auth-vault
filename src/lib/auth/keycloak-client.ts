import { KeycloakContentType } from "./keycloak-schemas";
import { AuthManagerError, AuthManagerErrorDict } from "./vault-errors";

/**
 * Keycloak Client Operations Dictionary
 *
 * Centralized dictionary of all operation names used in the Keycloak client.
 * This ensures consistency in error reporting and logging.
 */
export const KeycloakOperationDict = {
  refreshAccessToken: "refreshAccessToken",
  requestOfflineToken: "requestOfflineToken",
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

export class KeycloakClient {
  private config: KeycloakConfig;
  private agent: any;

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

    // configure HTTP agent for connection pooling and keep-alive
    if (typeof window === "undefined") {
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

  private getAgent() {
    return this.agent;
  }

  private async fetch(url: string, options: RequestInit = {}) {
    const fetchOptions: RequestInit = {
      ...options,
      // @ts-ignore - agent is not in RequestInit type but works in Node.js
      agent: this.getAgent(),
    };

    return fetch(url, fetchOptions);
  }

  /**
   * Refreshes the access token using the provided refresh token.
   *
   * This method sends a POST request to the Keycloak token endpoint with the
   * necessary parameters to obtain a new access token. If the operation fails,
   * it throws an `AuthManagerError` with details about the failure.
   *
   * @param refreshToken - The refresh token used to obtain a new access token.
   * @returns A promise that resolves to the new token response.
   * @throws {AuthManagerError} If the token refresh operation fails or an unexpected error occurs.
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const response = await this.fetch(this.config.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": KeycloakContentType,
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
        throw new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
          reason: `Failed to refresh token: ${
            error.error_description || error.error
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
      throw new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
        originalError: error,
        operation: KeycloakOperationDict.refreshAccessToken,
      });
    }
  }

  /**
   * Requests an offline token from the Keycloak server using a provided refresh token.
   *
   * This method exchanges the given refresh token for a new token with the `offline_access` scope,
   * which allows the token to be long-lived and usable even when the user is not actively logged in.
   *
   * @param refreshToken - The refresh token to exchange for an offline token.
   * @returns A promise that resolves to a `TokenResponse` object containing the new token details.
   *
   * @throws {AuthManagerError} If the request fails due to a Keycloak error or other issues.
   */
  async requestOfflineToken(refreshToken: string): Promise<TokenResponse> {
    try {
      // Exchange the refresh token and explicitly request offline_access scope
      // This will return a long-lived offline token
      const response = await this.fetch(this.config.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": KeycloakContentType,
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
        throw new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
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
      throw new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
        originalError: error,
        operation: KeycloakOperationDict.requestOfflineToken,
      });
    }
  }

  /**
   * Revokes a token (either a refresh token or an access token) using the Keycloak revocation endpoint.
   *
   * @param token - The token to be revoked.
   * @param tokenTypeHint - An optional hint about the type of the token being revoked.
   *                         Can be either "refresh_token" or "access_token".
   * @returns A promise that resolves when the token is successfully revoked.
   * @throws {AuthManagerError} If the revocation request fails or an unexpected error occurs.
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
        throw new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
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
      throw new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
        originalError: error,
        operation: KeycloakOperationDict.revokeToken,
      });
    }
  }

  /**
   * Introspects a given token using the Keycloak introspection endpoint.
   *
   * This method sends a POST request to the configured introspection endpoint
   * with the provided token, client ID, and client secret. It validates the
   * token and retrieves its metadata, such as its active status, expiration,
   * and associated user information.
   *
   * @param token - The token to be introspected.
   * @returns A promise that resolves to the token introspection result, which
   *          includes details about the token's validity and associated metadata.
   * @throws {AuthManagerError} If the introspection request fails or the response
   *         indicates an error. The error contains additional context about the
   *         failure, such as the reason and HTTP status code.
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
          AuthManagerErrorDict.token_introspection_failed.code,
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
        AuthManagerErrorDict.token_introspection_failed.code,
        {
          originalError: error,
          operation: KeycloakOperationDict.introspectToken,
        }
      );
    }
  }

  /**
   * Retrieves user information from the Keycloak server using the provided access token.
   *
   * @param accessToken - The access token used to authenticate the request.
   * @returns A promise that resolves to the user information (`UserInfo`) retrieved from the Keycloak server.
   * @throws {AuthManagerError} If the request fails or the response is not successful.
   *         - `AuthManagerErrorDict.keycloak_error.code` is used for errors related to Keycloak operations.
   *         - Includes details such as the reason for failure, HTTP status, and operation context.
   * @throws {Error} If an unexpected error occurs during the operation.
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
        throw new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
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
      throw new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
        originalError: error,
        operation: KeycloakOperationDict.getUserInfo,
      });
    }
  }

  /**
   * Retrieves the current Keycloak client configuration.
   *
   * @returns The configuration object used by the Keycloak client.
   */
  get conf() {
    return this.config;
  }
}

let keycloakClientInstance: KeycloakClient | null = null;

/**
 * Retrieves a singleton instance of the KeycloakClient. If the instance does not already exist,
 * it initializes a new KeycloakClient with the provided configuration.
 *
 * @param config - An optional partial configuration object for the KeycloakClient.
 * @returns The singleton instance of the KeycloakClient.
 */
export function getKeycloakClient(
  config?: Partial<KeycloakConfig>
): KeycloakClient {
  if (!keycloakClientInstance) {
    keycloakClientInstance = new KeycloakClient(config);
  }
  return keycloakClientInstance;
}
