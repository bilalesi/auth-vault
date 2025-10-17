import { NextResponse } from "next/server";
import { z } from "zod";
import { match } from "ts-pattern";
import { StatusCodes } from "http-status-codes";
import {
  VaultError,
  VaultErrorCodeDict,
  type VaultErrorCode,
} from "./vault-errors";

/**
 * HTTP status codes for vault errors
 */
const VAULT_ERROR_STATUS_MAP: Record<VaultErrorCode, number> = {
  [VaultErrorCodeDict.token_not_found]: StatusCodes.NOT_FOUND,
  [VaultErrorCodeDict.invalid_token_id]: StatusCodes.BAD_REQUEST,
  [VaultErrorCodeDict.storage_error]: StatusCodes.INTERNAL_SERVER_ERROR,
  [VaultErrorCodeDict.connection_error]: StatusCodes.SERVICE_UNAVAILABLE,
  [VaultErrorCodeDict.encryption_failed]: StatusCodes.INTERNAL_SERVER_ERROR,
  [VaultErrorCodeDict.decryption_failed]: StatusCodes.INTERNAL_SERVER_ERROR,
  [VaultErrorCodeDict.cleanup_error]: StatusCodes.INTERNAL_SERVER_ERROR,
  [VaultErrorCodeDict.internal_error]: StatusCodes.INTERNAL_SERVER_ERROR,
  [VaultErrorCodeDict.no_refresh_token]: StatusCodes.NOT_FOUND,
  [VaultErrorCodeDict.invalid_request]: StatusCodes.BAD_REQUEST,
  [VaultErrorCodeDict.unauthorized]: StatusCodes.UNAUTHORIZED,
  [VaultErrorCodeDict.token_expired]: StatusCodes.UNAUTHORIZED,
  [VaultErrorCodeDict.forbidden]: StatusCodes.FORBIDDEN,
  [VaultErrorCodeDict.invalid_token_type]: StatusCodes.BAD_REQUEST,
  [VaultErrorCodeDict.keycloak_error]: StatusCodes.INTERNAL_SERVER_ERROR,
  [VaultErrorCodeDict.missing_bearer_token]: StatusCodes.UNAUTHORIZED,
  [VaultErrorCodeDict.invalid_bearer_token]: StatusCodes.UNAUTHORIZED,
  [VaultErrorCodeDict.token_introspection_failed]:
    StatusCodes.INTERNAL_SERVER_ERROR,
  [VaultErrorCodeDict.token_not_active]: StatusCodes.UNAUTHORIZED,
};

/**
 * Standard error response structure
 */
interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
  operation?: string;
}

/**
 * Make a standard JSON response
 */
export function makeResponse<T>(
  data: T,
  status: StatusCodes = StatusCodes.OK
): NextResponse<T> {
  return NextResponse.json(data, { status });
}

/**
 * Make an error response from a VaultError
 */
export function makeVaultError(error: VaultError): NextResponse<ErrorResponse> {
  const statusCode =
    VAULT_ERROR_STATUS_MAP[error.code] || StatusCodes.INTERNAL_SERVER_ERROR;

  return NextResponse.json(
    {
      error: error.msg(),
      code: error.code,
      ...(error.metadata.operation && {
        operation: error.metadata.operation,
      }),
    },
    { status: statusCode }
  );
}

/**
 * Make an error response from a Zod validation error
 */
export function makeZodError(error: z.ZodError): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: "invalid request body",
      code: "invalid_request",
      details: error.issues,
    },
    { status: StatusCodes.BAD_REQUEST }
  );
}

/**
 * Handle errors using pattern matching
 * Returns appropriate NextResponse based on error type
 */
export function throwError(error: unknown): NextResponse<ErrorResponse> {
  return match(error)
    .when(VaultError.is, (err) => makeVaultError(err))
    .when(
      (err): err is z.ZodError => err instanceof z.ZodError,
      (err) => makeZodError(err)
    )
    .when(
      (err): err is Error => err instanceof Error,
      (err) => {
        console.error("unhandled error:", err);
        return makeVaultError(
          new VaultError(VaultErrorCodeDict.internal_error, {
            originalError: err,
          })
        );
      }
    )
    .otherwise(() => {
      console.error("unknown error:", error);
      return makeVaultError(
        new VaultError(VaultErrorCodeDict.internal_error, {
          originalError: error,
        })
      );
    });
}
