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
 * Token Vault Entry
 * Represents a stored token in the vault
 */
export interface AuthManagerVaultEntry {
  id: string;
  userId: string;
  tokenType: TAuthManagerTokenType;
  encryptedToken: string | null;
  iv: string | null;
  tokenHash?: string | null;
  createdAt: Date;
  expiresAt: Date;
  metadata?: Record<string, any>;
  status?: OfflineTokenStatus;
  taskId?: string;
  ackState?: string;
  sessionState?: string;
}

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
   * @param expiresAt - Expiration date
   * @param metadata - Optional metadata
   * @param tokenId - Optional: Use specific token ID (for updates)
   * @returns Persistent token ID
   */
  create(
    userId: string,
    token: string,
    type: TAuthManagerTokenType,
    expiresAt: Date,
    metadata?: Record<string, any>,
    tokenId?: string
  ): Promise<string>;

  /**
   * Retrieve a token from the vault
   * @param tokenId - Persistent token ID
   * @returns Token vault entry or null if not found
   */
  retrieve(tokenId: string): Promise<AuthManagerVaultEntry | null>;

  /**
   * Delete a token from the vault
   * @param tokenId - Persistent token ID
   */
  delete(tokenId: string): Promise<void>;

  /**
   * Cleanup expired tokens
   * @returns Number of tokens deleted
   */
  cleanup(): Promise<number>;

  /**
   * Get all tokens for a user
   * @param userId - User ID
   * @returns Array of token vault entries
   */
  getUserRefreshToken(userId: string): Promise<AuthManagerVaultEntry | null>;

  /**
   * Create a pending offline token request
   * @param userId - User ID
   * @param taskId - External task ID
   * @param ackState - Acknowledgment state for consent flow
   * @param expiresAt - Expiration date
   * @param metadata - Optional metadata
   * @returns Persistent token ID
   */
  makePendingOfflineToken(
    userId: string,
    taskId: string,
    ackState: string | null,
    expiresAt: Date,
    metadata?: Record<string, any>
  ): Promise<string>;

  /**
   * Update offline token status and store the actual token
   * @param ackState - Acknowledgment state to identify the request
   * @param token - The offline token to store (will be encrypted)
   * @param status - New status (active or failed)
   * @param sessionState - Keycloak session state from token response
   * @returns Updated token entry or null if not found
   */
  updateOfflineTokenByState(
    ackState: string,
    token: string | null,
    status: OfflineTokenStatus,
    sessionState?: string
  ): Promise<AuthManagerVaultEntry | null>;

  /**
   * Get offline token by acknowledgment state
   * @param ackState - Acknowledgment state
   * @returns Token vault entry or null if not found
   */
  retrieveByAckState(ackState: string): Promise<AuthManagerVaultEntry | null>;

  /**
   * Update acknowledgment state for a pending offline token request
   * @param tokenId - Persistent token ID
   * @param ackState - Acknowledgment state
   */
  updateAckState(tokenId: string, ackState: string): Promise<void>;

  /**
   * Update or create a refresh token (upsert by userId)
   * Ensures only one refresh token exists per user
   * @param userId - User ID
   * @param token - The refresh token to store (will be encrypted)
   * @param expiresAt - Expiration date
   * @param sessionState - Keycloak session state
   * @param metadata - Optional metadata
   * @returns Persistent token ID
   */
  upsertRefreshToken(
    userId: string,
    token: string,
    expiresAt: Date,
    sessionState?: string,
    metadata?: Record<string, any>
  ): Promise<string>;

  /**
   * Get all offline tokens for a user
   * @param userId - User ID
   * @returns Array of offline token vault entries
   */
  retrieveUserPersistentIdBySession(
    sessionStateId: string
  ): Promise<{ sessionId: string; id: string } | null>;

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
   * @param sessionState - Keycloak session state
   * @param excludeTokenId - Token ID to exclude from the search
   * @returns Array of token vault entries with matching session state
   */
  retrieveBySessionState(
    sessionState: string,
    excludeTokenId: string
  ): Promise<AuthManagerVaultEntry[]>;
}
