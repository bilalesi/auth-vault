import "server-only";

import { StatusCodes } from "http-status-codes";
import { NextResponse } from "next/server";
import { get } from "es-toolkit/compat";
import { match } from "ts-pattern";
import { z } from "zod";

import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/services/auth-manager/auth/vault-errors";
import { logger, AuthLogEventDict } from "@/services/auth-manager/logger";

interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
  operation?: string;
}

export function makeAuthManagerOkResponse<T>(
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
export function makeAuthManagerError(
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
export function makeValidationError(
  error: z.ZodError
): NextResponse<ErrorResponse> {
  logger.api(AuthLogEventDict.validationError, {
    component: "ZodValidation",
    issues: error.issues,
    error: "validation errors",
  });
  return NextResponse.json(
    {
      error: AuthManagerErrorDict.invalid_request.message,
      code: AuthManagerErrorDict.invalid_request.code,
      details: error.issues.map((o) => o.message),
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
export function makeAuthManagerErrorResponse(
  error: unknown
): NextResponse<ErrorResponse> {
  return match(error)
    .when(AuthManagerError.is, (err) => {
      logger.api("[API_ERROR] Error in running endpoint: ", {
        error: err,
      });
      return makeAuthManagerError(err);
    })
    .when(
      (err): err is z.ZodError => err instanceof z.ZodError,
      (err) => {
        logger.api("[VALIDATION_ERROR] Error in running endpoint: ", {
          error: err,
        });
        return makeValidationError(err);
      }
    )
    .when(
      (err): err is Error => err instanceof Error,
      (err) => {
        logger.api("[CUSTOM_ERROR] Error in running endpoint: ", {
          error: err,
        });
        return makeAuthManagerError(
          new AuthManagerError(AuthManagerErrorDict.internal_error.code, {
            originalError: err,
          })
        );
      }
    )
    .otherwise(() => {
      logger.api("Error in running endpoint: ", {
        error,
      });
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.internal_error.code, {
          originalError: error,
        })
      );
    });
}
