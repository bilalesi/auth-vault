import { NextRequest } from "next/server";

import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/services/auth-manager/auth/vault-errors";
import { GetKeycloakClient } from "@/services/auth-manager/auth/keycloak-client";
import { logger, AuthLogEventDict } from "@/services/auth-manager/logger";

/**
 * Extracts the Bearer token from the `authorization` header of a Next.js request.
 *
 * @param request - The Next.js request object containing headers.
 * @returns The Bearer token as a string if present and valid, otherwise `null`.
 *
 * @remarks
 * This function expects the `authorization` header to follow the format:
 * `Bearer <token>`. If the header is missing, improperly formatted, or does not
 * start with "Bearer", the function will return `null`.
 */
export function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1];
}

/**
 * Validates an access token by introspecting it and retrieving user information.
 *
 * @param accessToken - The access token to be validated.
 * @returns A promise that resolves to an object containing the user's ID, and optionally their email and username.
 *
 * @throws {AuthManagerError} If the token is not active or introspection fails.
 * - `AuthManagerErrorDict.token_not_active.code`: Thrown when the token is not active.
 * - `AuthManagerErrorDict.token_introspection_failed.code`: Thrown when token introspection fails.
 *
 * @remarks
 * This function uses a Keycloak client to introspect the token and fetch user information.
 * If an error occurs during the process, it is logged and rethrown as an `AuthManagerError`.
 */
export async function validateAccessToken(accessToken: string): Promise<{
  userId: string;
  sessionStateId: string;
}> {
  try {
    const keycloakClient = GetKeycloakClient();
    const introspection = await keycloakClient.introspect(accessToken);

    if (!introspection.active) {
      throw new AuthManagerError(AuthManagerErrorDict.token_not_active.code, {
        operation: "introspect_token",
      });
    }

    return {
      userId: introspection.sub,
      sessionStateId: introspection.sid,
    };
  } catch (error) {
    if (AuthManagerError.is(error)) {
      throw error;
    }
    throw new AuthManagerError(
      AuthManagerErrorDict.token_introspection_failed.code,
      {
        operation: "introspect_token",
        originalError: error,
      }
    );
  }
}

type TValidation =
  | {
      valid: true;
      userId: string;
      accessToken: string;
      sessionId: string;
    }
  | {
      valid: false;
      error: string;
    };

/**
 * Validates an incoming request by extracting and verifying the access token.
 *
 * @param request - The incoming `NextRequest` object containing the authorization header.
 * @returns A promise that resolves to a `TValidation` object indicating whether the request is valid.
 *          - If valid, it includes user information and the access token.
 *          - If invalid, it includes an error message describing the issue.
 *
 * @throws Will handle and return errors from `AuthManagerError` or other unexpected errors.
 */
export async function validateRequest(
  request: NextRequest
): Promise<TValidation> {
  try {
    const accessToken = extractBearerToken(request);

    if (!accessToken) {
      return {
        valid: false,
        error: "missing or invalid authorization header",
      };
    }

    const payload = await validateAccessToken(accessToken);

    return {
      valid: true,
      accessToken,
      userId: payload.userId,
      sessionId: payload.sessionStateId,
    };
  } catch (err) {
    logger.vault(AuthLogEventDict.validationError, {
      originalError: err,
    });

    if (AuthManagerError.is(err)) {
      return {
        valid: false,
        error: err.msg(),
      };
    }

    return {
      valid: false,
      error: err instanceof Error ? err.message : "validation failed",
    };
  }
}
