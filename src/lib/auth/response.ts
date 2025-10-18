import { NextResponse } from "next/server";
import { z } from "zod";
import { match } from "ts-pattern";
import get from "es-toolkit/compat/get";
import { StatusCodes } from "http-status-codes";
import {
  AuthManagerError,
  AuthManagerErrorDict,
  type TAuthManagerCode,
} from "./vault-errors";

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
          new AuthManagerError("internal_error", {
            originalError: err,
          })
        );
      }
    )
    .otherwise(() => {
      console.error("unknown error:", error);
      return makeVaultError(
        new AuthManagerError("internal_error", {
          originalError: error,
        })
      );
    });
}
