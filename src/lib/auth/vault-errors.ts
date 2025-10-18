export const AuthManagerErrorCodeDict = {
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

export type TAuthManagerCode =
  (typeof AuthManagerErrorCodeDict)[keyof typeof AuthManagerErrorCodeDict];

export const AuthManagerOperationDict = {
  store: "store",
  retrieve: "retrieve",
  delete: "delete",
  cleanup: "cleanup",
  get_user_tokens: "get_user_tokens",
  initialize: "initialize",
  validate_token: "validate_token",
  introspect_token: "introspect_token",
} as const;

export type TAuthManagerOperation =
  (typeof AuthManagerOperationDict)[keyof typeof AuthManagerOperationDict];

/**
 * Storage type dictionary
 */
export const AuthManagerStorageTypeDict = {
  postgres: "postgres",
  redis: "redis",
} as const;

/**
 * Extract storage type
 */
export type TAuthManagerStorageType =
  (typeof AuthManagerStorageTypeDict)[keyof typeof AuthManagerStorageTypeDict];

/**
 * User-friendly error messages dictionary
 */
export const AuthManagerErrorMessageDict: Record<TAuthManagerCode, string> = {
  [AuthManagerErrorCodeDict.encryption_failed]: "failed to encrypt token",
  [AuthManagerErrorCodeDict.decryption_failed]: "failed to decrypt token",
  [AuthManagerErrorCodeDict.storage_error]: "storage operation failed",
  [AuthManagerErrorCodeDict.token_not_found]: "token not found",
  [AuthManagerErrorCodeDict.invalid_token_id]: "invalid token id",
  [AuthManagerErrorCodeDict.connection_error]: "failed to connect to storage",
  [AuthManagerErrorCodeDict.cleanup_error]: "failed to cleanup expired tokens",
  [AuthManagerErrorCodeDict.internal_error]: "internal server error",
  [AuthManagerErrorCodeDict.no_refresh_token]: "no refresh token available",
  [AuthManagerErrorCodeDict.invalid_request]: "invalid request",
  [AuthManagerErrorCodeDict.unauthorized]: "unauthorized",
  [AuthManagerErrorCodeDict.token_expired]: "token expired",
  [AuthManagerErrorCodeDict.forbidden]: "forbidden",
  [AuthManagerErrorCodeDict.invalid_token_type]: "invalid token type",
  [AuthManagerErrorCodeDict.keycloak_error]: "keycloak error",
  [AuthManagerErrorCodeDict.missing_bearer_token]:
    "missing or invalid authorization header",
  [AuthManagerErrorCodeDict.invalid_bearer_token]:
    "invalid bearer token format",
  [AuthManagerErrorCodeDict.token_introspection_failed]:
    "failed to introspect token",
  [AuthManagerErrorCodeDict.token_not_active]: "token is not active",
};

/**
 * Vault error metadata (fully typed)
 */
export interface AuthManagerErrorMetadata {
  code: TAuthManagerCode;
  operation?: TAuthManagerOperation;
  persistentTokenId?: string;
  userId?: string;
  storageType?: TAuthManagerStorageType;
  originalError?: unknown;
  [key: string]: unknown;
}

/**
 * Custom error class for auth manager operations
 * Extends Error with structured metadata
 */
export class AuthManagerError extends Error {
  public readonly code: TAuthManagerCode;
  public readonly metadata: AuthManagerErrorMetadata;
  public readonly timestamp: Date;

  constructor(
    code: TAuthManagerCode,
    metadata?: Omit<AuthManagerErrorMetadata, "code">
  ) {
    const message =
      metadata?.originalError instanceof Error
        ? metadata.originalError.message
        : AuthManagerErrorMessageDict[code];

    super(message);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthManagerError);
    }

    this.name = "AuthManagerError";
    this.code = code;
    this.metadata = { code, ...metadata };
    this.timestamp = new Date();

    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, AuthManagerError.prototype);
  }

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

  msg(): string {
    return AuthManagerErrorMessageDict[this.code];
  }

  static is(error: unknown): error is AuthManagerError {
    return error instanceof AuthManagerError;
  }
}
