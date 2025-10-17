/**
 * Vault error codes dictionary
 */
export const VaultErrorCodeDict = {
  encryption_failed: "encryption_failed",
  decryption_failed: "decryption_failed",
  storage_error: "storage_error",
  token_not_found: "token_not_found",
  invalid_token_id: "invalid_token_id",
  connection_error: "connection_error",
  cleanup_error: "cleanup_error",
} as const;

/**
 * Extract vault error code type
 */
export type VaultErrorCode =
  (typeof VaultErrorCodeDict)[keyof typeof VaultErrorCodeDict];

/**
 * Vault operation types
 */
export const VaultOperationDict = {
  store: "store",
  retrieve: "retrieve",
  delete: "delete",
  cleanup: "cleanup",
  get_user_tokens: "get_user_tokens",
  initialize: "initialize",
} as const;

/**
 * Extract vault operation type
 */
export type VaultOperation =
  (typeof VaultOperationDict)[keyof typeof VaultOperationDict];

/**
 * Storage type dictionary
 */
export const VaultStorageTypeDict = {
  postgres: "postgres",
  redis: "redis",
} as const;

/**
 * Extract storage type
 */
export type VaultStorageType =
  (typeof VaultStorageTypeDict)[keyof typeof VaultStorageTypeDict];

/**
 * User-friendly error messages dictionary
 */
export const VaultErrorMessageDict: Record<VaultErrorCode, string> = {
  [VaultErrorCodeDict.encryption_failed]: "failed to encrypt token",
  [VaultErrorCodeDict.decryption_failed]: "failed to decrypt token",
  [VaultErrorCodeDict.storage_error]: "storage operation failed",
  [VaultErrorCodeDict.token_not_found]: "token not found",
  [VaultErrorCodeDict.invalid_token_id]: "invalid token id",
  [VaultErrorCodeDict.connection_error]: "failed to connect to storage",
  [VaultErrorCodeDict.cleanup_error]: "failed to cleanup expired tokens",
};

/**
 * Vault error metadata (fully typed)
 */
export interface VaultErrorMetadata {
  code: VaultErrorCode;
  operation?: VaultOperation;
  persistentTokenId?: string;
  userId?: string;
  storageType?: VaultStorageType;
  originalError?: unknown;
  [key: string]: unknown;
}

/**
 * Custom error class for vault operations
 * Extends Error with structured metadata
 */
export class VaultError extends Error {
  public readonly code: VaultErrorCode;
  public readonly metadata: VaultErrorMetadata;
  public readonly timestamp: Date;

  constructor(
    code: VaultErrorCode,
    metadata?: Omit<VaultErrorMetadata, "code">
  ) {
    const message =
      metadata?.originalError instanceof Error
        ? metadata.originalError.message
        : VaultErrorMessageDict[code];

    super(message);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VaultError);
    }

    this.name = "VaultError";
    this.code = code;
    this.metadata = { code, ...metadata };
    this.timestamp = new Date();

    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, VaultError.prototype);
  }

  /**
   * Convert error to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      metadata: this.metadata,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage(): string {
    return VaultErrorMessageDict[this.code];
  }

  /**
   * Check if an error is a VaultError
   */
  static isVaultError(error: unknown): error is VaultError {
    return error instanceof VaultError;
  }
}
