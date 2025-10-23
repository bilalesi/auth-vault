import { TAuthManagerTokenVaultRow } from "@/services/auth-manager/db/schema";

export const AuthManagerTokenTypeDict = {
  Refresh: "refresh",
  Offline: "offline",
} as const;

export type TAuthManagerTokenType =
  (typeof AuthManagerTokenTypeDict)[keyof typeof AuthManagerTokenTypeDict];

export const OfflineTokenStatusDict = {
  Pending: "pending",
  Active: "active",
  Failed: "failed",
} as const;

export type OfflineTokenStatus =
  (typeof OfflineTokenStatusDict)[keyof typeof OfflineTokenStatusDict];

/**
 * Token Vault Interface
 * Abstract interface for token storage implementations
 */
export interface IStorage {
  /**
   * Store a token in the vault
   * @param userId - User ID
   * @param token - The token to store (will be encrypted)
   * @param type - Type of token (refresh or offline)
   * @param metadata - Optional metadata
   * @param tokenId - Optional: Use specific token ID (for updates)
   * @returns Persistent token ID
   */
  create(params: {
    userId: string;
    token: string;
    type: TAuthManagerTokenType;
    metadata?: Record<string, any>;
    sessionStateId: string;
  }): Promise<TAuthManagerTokenVaultRow>;

  /**
   * Retrieve a token from the vault
   * @param tokenId - Persistent token ID
   * @returns Token vault entry or null if not found
   */
  retrieve(tokenId: string): Promise<TAuthManagerTokenVaultRow | null>;

  /**
   * Delete a token from the vault
   * @param tokenId - Persistent token ID
   */
  delete(tokenId: string): Promise<void>;

  /**
   * Get all tokens for a user
   * @param persistentTokenId -  ID
   * @returns Array of token vault entries
   */
  getUserRefreshTokenById({
    persistentTokenId,
  }: {
    persistentTokenId: string;
  }): Promise<TAuthManagerTokenVaultRow | null>;

  getUserRefreshTokenBySessionId({
    sessionId,
  }: {
    sessionId: string;
  }): Promise<TAuthManagerTokenVaultRow | null>;

  getUserRefreshTokenByUserId({
    userId,
  }: {
    userId: string;
  }): Promise<TAuthManagerTokenVaultRow | null>;

  /**
   * Update an offline token by its persistent token ID
   * @param persistentTokenId - The persistent token ID to update
   * @param token - The new offline token value (will be encrypted)
   * @param status - The status of the offline token (pending, active, or failed)
   * @param sessionStateId - Optional Keycloak session state
   * @returns Updated token vault entry or null if not found
   */
  updateOfflineTokenById({
    persistentTokenId,
    token,
    status,
    sessionStateId,
  }: {
    persistentTokenId: string;
    token: string;
    status: OfflineTokenStatus;
    sessionStateId?: string;
  }): Promise<TAuthManagerTokenVaultRow | null>;

  /**
   * Update or create a refresh token (upsert by userId)
   * Ensures only one refresh token exists per user
   * @param userId - User ID
   * @param token - The refresh token to store (will be encrypted)
   * @param sessionStateId - Keycloak session state
   * @param metadata - Optional metadata
   * @returns Persistent token ID
   */
  upsertRefreshToken(params: {
    userId: string;
    token: string;
    sessionStateId: string;
    metadata?: Record<string, any>;
  }): Promise<string>;

  /**
   * Get all offline tokens for a user
   * @param userId - User ID
   * @returns Array of offline token vault entries
   */
  retrieveUserPersistentIdBySession(
    sessionStateId: string
  ): Promise<TAuthManagerTokenVaultRow | null>;

  /**
   * Check if a token hash exists in the vault (excluding a specific token ID)
   * Used to determine if an offline token is shared across multiple persistent token IDs
   * @param tokenHash - SHA-256 hash of the token
   * @param excludeTokenId - Token ID to exclude from the search
   * @returns True if the hash exists in another entry
   */
  retrieveDuplicateTokenHash(
    tokenHash: string,
    excludeTokenId: string
  ): Promise<boolean>;

  /**
   * Get all tokens with a specific session state (excluding a specific token ID)
   * Used to determine if other tokens share the same Keycloak session
   * @param sessionStateId - Keycloak session state
   * @param excludeTokenId - Token ID to exclude from the search
   * @returns Array of token vault entries with matching session state
   */
  retrieveAllBySessionStateId(
    sessionStateId: string,
    excludeTokenId?: string,
    tokeType?: TAuthManagerTokenType
  ): Promise<TAuthManagerTokenVaultRow[]>;
}
