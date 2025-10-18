import { StatusCodes } from "http-status-codes";

export const AuthManagerErrorDict = {
  encryption_failed: {
    http: StatusCodes.INTERNAL_SERVER_ERROR,
    code: "encryption_failed",
    message: "failed to encrypt token",
  },
  decryption_failed: {
    http: StatusCodes.INTERNAL_SERVER_ERROR,
    code: "decryption_failed",
    message: "failed to decrypt token",
  },
  storage_error: {
    http: StatusCodes.INTERNAL_SERVER_ERROR,
    code: "storage_error",
    message: "storage operation failed",
  },
  token_not_found: {
    http: StatusCodes.NOT_FOUND,
    code: "token_not_found",
    message: "token not found",
  },
  invalid_token_id: {
    http: StatusCodes.BAD_REQUEST,
    code: "invalid_token_id",
    message: "invalid token id",
  },
  connection_error: {
    http: StatusCodes.SERVICE_UNAVAILABLE,
    code: "connection_error",
    message: "failed to connect to storage",
  },
  cleanup_error: {
    http: StatusCodes.INTERNAL_SERVER_ERROR,
    code: "cleanup_error",
    message: "failed to cleanup expired tokens",
  },
  internal_error: {
    http: StatusCodes.INTERNAL_SERVER_ERROR,
    code: "internal_error",
    message: "internal server error",
  },
  no_refresh_token: {
    http: StatusCodes.NOT_FOUND,
    code: "no_refresh_token",
    message: "no refresh token available",
  },
  invalid_request: {
    http: StatusCodes.BAD_REQUEST,
    code: "invalid_request",
    message: "invalid request",
  },
  unauthorized: {
    http: StatusCodes.UNAUTHORIZED,
    code: "unauthorized",
    message: "unauthorized",
  },
  token_expired: {
    http: StatusCodes.UNAUTHORIZED,
    code: "token_expired",
    message: "token expired",
  },
  forbidden: {
    http: StatusCodes.FORBIDDEN,
    code: "forbidden",
    message: "forbidden",
  },
  invalid_token_type: {
    http: StatusCodes.BAD_REQUEST,
    code: "invalid_token_type",
    message: "invalid token type",
  },
  keycloak_error: {
    http: StatusCodes.INTERNAL_SERVER_ERROR,
    code: "keycloak_error",
    message: "keycloak error",
  },
  missing_bearer_token: {
    http: StatusCodes.UNAUTHORIZED,
    code: "missing_bearer_token",
    message: "missing or invalid authorization header",
  },
  invalid_bearer_token: {
    http: StatusCodes.UNAUTHORIZED,
    code: "invalid_bearer_token",
    message: "invalid bearer token format",
  },
  token_introspection_failed: {
    http: StatusCodes.INTERNAL_SERVER_ERROR,
    code: "token_introspection_failed",
    message: "failed to introspect token",
  },
  token_not_active: {
    http: StatusCodes.UNAUTHORIZED,
    code: "token_not_active",
    message: "token is not active",
  },
} as const;

export type TAuthManagerCode = keyof typeof AuthManagerErrorDict;

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

export type TAuthManagerStorageType =
  (typeof AuthManagerStorageTypeDict)[keyof typeof AuthManagerStorageTypeDict];

export interface AuthManagerErrorMetadata {
  code: TAuthManagerCode;
  operation?: TAuthManagerOperation;
  persistentTokenId?: string;
  userId?: string;
  storageType?: TAuthManagerStorageType;
  originalError?: unknown;
  [key: string]: unknown;
}

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
        : AuthManagerErrorDict[code].message;

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
      message: this.msg(),
      code: this.code,
      metadata: this.metadata,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  msg(): string {
    return AuthManagerErrorDict[this.code].message;
  }

  static is(error: unknown): error is AuthManagerError {
    return error instanceof AuthManagerError;
  }
}
