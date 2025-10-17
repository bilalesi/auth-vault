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
  internal_error: "internal_error",
  no_refresh_token: "no_refresh_token",
  invalid_request: "invalid_request",
  unauthorized: "unauthorized",
  token_expired: "token_expired",
  forbidden: "forbidden",
  invalid_token_type: "invalid_token_type",
  keycloak_error: "keycloak_error",
  missing_bearer_token: "missing_bearer_token",
  invalid_bearer_token: "invalid_bearer_token",
  token_introspection_failed: "token_introspection_failed",
  token_not_active: "token_not_active",
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
  validate_token: "validate_token",
  introspect_token: "introspect_token",
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
  [VaultErrorCodeDict.internal_error]: "internal server error",
  [VaultErrorCodeDict.no_refresh_token]: "no refresh token available",
  [VaultErrorCodeDict.invalid_request]: "invalid request",
  [VaultErrorCodeDict.unauthorized]: "unauthorized",
  [VaultErrorCodeDict.token_expired]: "token expired",
  [VaultErrorCodeDict.forbidden]: "forbidden",
  [VaultErrorCodeDict.invalid_token_type]: "invalid token type",
  [VaultErrorCodeDict.keycloak_error]: "keycloak error",
  [VaultErrorCodeDict.missing_bearer_token]:
    "missing or invalid authorization header",
  [VaultErrorCodeDict.invalid_bearer_token]: "invalid bearer token format",
  [VaultErrorCodeDict.token_introspection_failed]: "failed to introspect token",
  [VaultErrorCodeDict.token_not_active]: "token is not active",
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
      message: this.msg,
      code: this.code,
      metadata: this.metadata,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Get a user-friendly error message
   */
  msg(): string {
    return VaultErrorMessageDict[this.code];
  }

  /**
   * Check if an error is a VaultError
   */
  static is(error: unknown): error is VaultError {
    return error instanceof VaultError;
  }
}
