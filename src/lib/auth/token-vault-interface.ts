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
 * Token Vault Entry
 * Represents a stored token in the vault
 */
export interface TokenVaultEntry {
  id: string; // Persistent token ID (UUID)
  userId: string; // User ID from Keycloak
  tokenType: VaultTokenType; // Type of token
  encryptedToken: string; // AES-256-GCM encrypted token
  iv: string; // Initialization vector for decryption
  createdAt: Date; // When the token was stored
  expiresAt: Date; // When the token expires
  metadata?: Record<string, any>; // Optional metadata
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
  store(
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
}
