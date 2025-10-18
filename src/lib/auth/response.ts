import { NextResponse } from "next/server";
import { z } from "zod";
import { match } from "ts-pattern";
import { StatusCodes } from "http-status-codes";
import {
  AuthManagerError,
  AuthManagerErrorCodeDict,
  type TAuthManagerCode,
} from "./vault-errors";

/**
 * HTTP status codes for vault errors
 */
const VAULT_ERROR_STATUS_MAP: Record<TAuthManagerCode, number> = {
  [AuthManagerErrorCodeDict.token_not_found]: StatusCodes.NOT_FOUND,
  [AuthManagerErrorCodeDict.invalid_token_id]: StatusCodes.BAD_REQUEST,
  [AuthManagerErrorCodeDict.storage_error]: StatusCodes.INTERNAL_SERVER_ERROR,
  [AuthManagerErrorCodeDict.connection_error]: StatusCodes.SERVICE_UNAVAILABLE,
  [AuthManagerErrorCodeDict.encryption_failed]:
    StatusCodes.INTERNAL_SERVER_ERROR,
  [AuthManagerErrorCodeDict.decryption_failed]:
    StatusCodes.INTERNAL_SERVER_ERROR,
  [AuthManagerErrorCodeDict.cleanup_error]: StatusCodes.INTERNAL_SERVER_ERROR,
  [AuthManagerErrorCodeDict.internal_error]: StatusCodes.INTERNAL_SERVER_ERROR,
  [AuthManagerErrorCodeDict.no_refresh_token]: StatusCodes.NOT_FOUND,
  [AuthManagerErrorCodeDict.invalid_request]: StatusCodes.BAD_REQUEST,
  [AuthManagerErrorCodeDict.unauthorized]: StatusCodes.UNAUTHORIZED,
  [AuthManagerErrorCodeDict.token_expired]: StatusCodes.UNAUTHORIZED,
  [AuthManagerErrorCodeDict.forbidden]: StatusCodes.FORBIDDEN,
  [AuthManagerErrorCodeDict.invalid_token_type]: StatusCodes.BAD_REQUEST,
  [AuthManagerErrorCodeDict.keycloak_error]: StatusCodes.INTERNAL_SERVER_ERROR,
  [AuthManagerErrorCodeDict.missing_bearer_token]: StatusCodes.UNAUTHORIZED,
  [AuthManagerErrorCodeDict.invalid_bearer_token]: StatusCodes.UNAUTHORIZED,
  [AuthManagerErrorCodeDict.token_introspection_failed]:
    StatusCodes.INTERNAL_SERVER_ERROR,
  [AuthManagerErrorCodeDict.token_not_active]: StatusCodes.UNAUTHORIZED,
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
export function makeVaultError(
  error: AuthManagerError
): NextResponse<ErrorResponse> {
  const statusCode =
    VAULT_ERROR_STATUS_MAP[error.code] || StatusCodes.INTERNAL_SERVER_ERROR;

  return NextResponse.json(
    {
      error: error.msg(),
      ...error.metadata,
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
    .when(AuthManagerError.is, (err) => makeVaultError(err))
    .when(
      (err): err is z.ZodError => err instanceof z.ZodError,
      (err) => makeZodError(err)
    )
    .when(
      (err): err is Error => err instanceof Error,
      (err) => {
        console.error("unhandled error:", err);
        return makeVaultError(
          new AuthManagerError(AuthManagerErrorCodeDict.internal_error, {
            originalError: err,
          })
        );
      }
    )
    .otherwise(() => {
      console.error("unknown error:", error);
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorCodeDict.internal_error, {
          originalError: error,
        })
      );
    });
}
