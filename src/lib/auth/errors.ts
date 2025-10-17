/**
 * Standard error cause format
 * All errors thrown in the auth system should follow this format
 */
export interface AuthErrorCause {
  code: string;
  statusCode: number;
  details?: unknown;
}

/**
 * Auth error codes
 */
export const AuthErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  TOKEN_NOT_FOUND: "TOKEN_NOT_FOUND",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  INVALID_REQUEST: "INVALID_REQUEST",
  KEYCLOAK_ERROR: "KEYCLOAK_ERROR",
  VAULT_ERROR: "VAULT_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NO_REFRESH_TOKEN: "NO_REFRESH_TOKEN",
  FORBIDDEN: "FORBIDDEN",
  INVALID_TOKEN_TYPE: "INVALID_TOKEN_TYPE",
} as const;

export type AuthErrorCodeType =
  (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

/**
 * Create a standard auth error
 */
export function createAuthError(
  message: string,
  code: AuthErrorCodeType,
  statusCode: number,
  details?: unknown
): Error {
  return new Error(message, {
    cause: {
      code,
      statusCode,
      details,
    } satisfies AuthErrorCause,
  });
}

/**
 * Check if an error is an auth error with proper cause
 */
export function isAuthError(error: unknown): error is Error & {
  cause: AuthErrorCause;
} {
  return (
    error instanceof Error &&
    error.cause !== undefined &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause &&
    "statusCode" in error.cause
  );
}

/**
 * Extract error response from any error
 */
export function getErrorResponse(error: unknown): {
  message: string;
  code: string;
  statusCode: number;
  details?: unknown;
} {
  if (isAuthError(error)) {
    return {
      message: error.message,
      code: error.cause.code,
      statusCode: error.cause.statusCode,
      details: error.cause.details,
    };
  }

  // Fallback for unknown errors
  console.error("Unhandled error:", error);
  return {
    message: error instanceof Error ? error.message : "Internal server error",
    code: AuthErrorCode.INTERNAL_ERROR,
    statusCode: 500,
  };
}
