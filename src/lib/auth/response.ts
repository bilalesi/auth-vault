import { NextResponse } from "next/server";
import { z } from "zod";
import { match } from "ts-pattern";
import get from "es-toolkit/compat/get";
import { StatusCodes } from "http-status-codes";
import { AuthManagerError, AuthManagerErrorDict } from "./vault-errors";

interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
  operation?: string;
}

export function makeResponse<T>(
  data: T,
  status: StatusCodes = StatusCodes.OK
): NextResponse<T> {
  return NextResponse.json(data, { status });
}

/**
 * Creates a standardized error response for the Vault application.
 *
 * This function takes an `AuthManagerError` object, retrieves the corresponding
 * HTTP status code from the `AuthManagerErrorDict`, and constructs a JSON response
 * with the error message and additional metadata.
 *
 * @param error - The `AuthManagerError` instance containing the error details.
 * @returns A `NextResponse` object containing the error response in JSON format
 *          and the appropriate HTTP status code.
 */
export function makeVaultError(
  error: AuthManagerError
): NextResponse<ErrorResponse> {
  const statusCode = get(
    AuthManagerErrorDict,
    `${error.code}.http`,
    StatusCodes.INTERNAL_SERVER_ERROR
  );

  return NextResponse.json(
    {
      error: error.msg(),
      ...error.metadata,
    },
    { status: statusCode }
  );
}

/**
 * Constructs a standardized error response for invalid request bodies
 * using Zod validation errors.
 *
 * @param error - The ZodError instance containing validation issues.
 * @returns A NextResponse object with a JSON payload describing the error
 *          and a status code of 400 (Bad Request).
 */
export function makeZodError(error: z.ZodError): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: AuthManagerErrorDict.invalid_request.message,
      code: AuthManagerErrorDict.invalid_request.code,
      details: error.issues,
    },
    { status: StatusCodes.BAD_REQUEST }
  );
}

/**
 * Handles an unknown error by matching its type and returning an appropriate `NextResponse<ErrorResponse>`.
 *
 * This function uses pattern matching to determine the type of the error and processes it accordingly:
 * - If the error is an `AuthManagerError`, it creates a vault-specific error response.
 * - If the error is a `z.ZodError`, it creates a Zod-specific error response.
 * - If the error is a generic `Error`, it logs the error and wraps it in an `AuthManagerError` with an "internal_error" code.
 * - For any other unknown error, it logs the error and wraps it in an `AuthManagerError` with an "internal_error" code.
 *
 * @param error - The unknown error to handle.
 * @returns A `NextResponse<ErrorResponse>` representing the processed error response.
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
          new AuthManagerError(AuthManagerErrorDict.internal_error.code, {
            originalError: err,
          })
        );
      }
    )
    .otherwise(() => {
      console.error("unknown error:", error);
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.internal_error.code, {
          originalError: error,
        })
      );
    });
}
