/**
 * Token type dictionary
 */
export const VaultTokenTypeDict = {
  Refresh: "refresh",
  Offline: "offline",
} as const;

/**
 * Extract token type from dictionary
 */
export type VaultTokenType =
  (typeof VaultTokenTypeDict)[keyof typeof VaultTokenTypeDict];

/**
 * Offline token status dictionary
 */
export const OfflineTokenStatusDict = {
  Pending: "pending",
  Active: "active",
  Failed: "failed",
} as const;

/**
 * Extract offline token status from dictionary
 */
export type OfflineTokenStatus =
  (typeof OfflineTokenStatusDict)[keyof typeof OfflineTokenStatusDict];

/**
 * Token Vault Entry
 * Represents a stored token in the vault
 */
export interface TokenVaultEntry {
  id: string; // Persistent token ID (UUID)
  userId: string; // User ID from Keycloak
  tokenType: VaultTokenType; // Type of token
  encryptedToken: string | null; // AES-256-GCM encrypted token (null for pending)
  iv: string | null; // Initialization vector for decryption (null for pending)
  createdAt: Date; // When the token was stored
  expiresAt: Date; // When the token expires
  metadata?: Record<string, any>; // Optional metadata
  // Offline token specific fields
  status?: OfflineTokenStatus; // Status for offline tokens
  taskId?: string; // External task ID
  stateToken?: string; // OAuth state token
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
    type: VaultTokenType,
    expiresAt: Date,
    metadata?: Record<string, any>,
    tokenId?: string
  ): Promise<string>;

  /**
   * Retrieve a token from the vault
   * @param tokenId - Persistent token ID
   * @returns Token vault entry or null if not found
   */
  retrieve(tokenId: string): Promise<TokenVaultEntry | null>;

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
  getUserTokens(userId: string): Promise<TokenVaultEntry[]>;

  /**
   * Create a pending offline token request
   * @param userId - User ID
   * @param taskId - External task ID
   * @param stateToken - OAuth state token for consent flow
   * @param expiresAt - Expiration date
   * @param metadata - Optional metadata
   * @returns Persistent token ID
   */
  makePendingOfflineToken(
    userId: string,
    taskId: string,
    stateToken: string | null,
    expiresAt: Date,
    metadata?: Record<string, any>
  ): Promise<string>;

  /**
   * Update offline token status and store the actual token
   * @param stateToken - OAuth state token to identify the request
   * @param token - The offline token to store (will be encrypted)
   * @param status - New status (active or failed)
   * @returns Updated token entry or null if not found
   */
  updateOfflineTokenByState(
    stateToken: string,
    token: string | null,
    status: OfflineTokenStatus
  ): Promise<TokenVaultEntry | null>;

  /**
   * Get offline token by state token
   * @param stateToken - OAuth state token
   * @returns Token vault entry or null if not found
   */
  getByStateToken(stateToken: string): Promise<TokenVaultEntry | null>;

  /**
   * Update state token for a pending offline token request
   * @param tokenId - Persistent token ID
   * @param stateToken - OAuth state token
   */
  updateStateToken(tokenId: string, stateToken: string): Promise<void>;
}
