/**
 * Authentication and token management type definitions
 */

export type TokenType = "refresh" | "offline";

export interface TokenVaultEntry {
  id: string; // Persistent token ID (UUID)
  userId: string;
  tokenType: TokenType;
  encryptedToken: string;
  iv: string; // Initialization vector for encryption
  createdAt: Date;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

export interface TokenVault {
  store(
    userId: string,
    token: string,
    type: TokenType,
    expiresAt: Date
  ): Promise<string>;
  retrieve(tokenId: string): Promise<TokenVaultEntry | null>;
  delete(tokenId: string): Promise<void>;
  cleanup(): Promise<void>;
}

export interface KeycloakConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  introspectionEndpoint: string;
  revocationEndpoint: string;
  userinfoEndpoint: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface TokenIntrospection {
  active: boolean;
  exp?: number;
  iat?: number;
  sub?: string;
  scope?: string;
  client_id?: string;
  username?: string;
}

export enum AuthErrorCode {
  // Token errors
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  TOKEN_INVALID = "TOKEN_INVALID",
  REFRESH_FAILED = "REFRESH_FAILED",

  // Session errors
  SESSION_EXPIRED = "SESSION_EXPIRED",
  SESSION_INVALID = "SESSION_INVALID",

  // Keycloak errors
  KEYCLOAK_UNAVAILABLE = "KEYCLOAK_UNAVAILABLE",
  KEYCLOAK_ERROR = "KEYCLOAK_ERROR",

  // Vault errors
  VAULT_ERROR = "VAULT_ERROR",
  TOKEN_NOT_FOUND = "TOKEN_NOT_FOUND",

  // Authorization errors
  UNAUTHORIZED = "UNAUTHORIZED",
  CONSENT_REQUIRED = "CONSENT_REQUIRED",
}

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  retryable: boolean;
  recoveryAction?: "LOGIN" | "RETRY" | "CONSENT";
}
