import { NextRequest } from "next/server";
import { getKeycloakClient } from "./keycloak-client";
import {
  AuthManagerError,
  AuthManagerErrorDict,
  AuthManagerOperationDict,
} from "./vault-errors";

/**
 * Extract Bearer token from Authorization header
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
 * Validate access token with Keycloak and return user info
 * @throws {AuthManagerError} if token is invalid or validation fails
 */
export async function validateAccessToken(accessToken: string): Promise<{
  userId: string;
  email?: string;
  username?: string;
}> {
  try {
    const keycloakClient = getKeycloakClient();
    const introspection = await keycloakClient.introspect(accessToken);

    if (!introspection.active) {
      throw new AuthManagerError(AuthManagerErrorDict.token_not_active.code, {
        operation: AuthManagerOperationDict.introspect_token,
      });
    }

    // Get user info from the token
    const userInfo = await keycloakClient.info(accessToken);

    return {
      userId: userInfo.sub,
      email: userInfo.email,
      username: userInfo.preferred_username,
    };
  } catch (error) {
    if (AuthManagerError.is(error)) {
      throw error;
    }

    console.error("error validating access token:", error);
    throw new AuthManagerError(
      AuthManagerErrorDict.token_introspection_failed.code,
      {
        operation: AuthManagerOperationDict.introspect_token,
        originalError: error,
      }
    );
  }
}

type TValidation =
  | {
      valid: true;
      userId: string;
      email?: string;
      username?: string;
      accessToken: string;
    }
  | {
      valid: false;
      error: string;
    };

/**
 * Middleware helper to validate Bearer token from request
 * Returns validation result with error info instead of throwing
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

    const userInfo = await validateAccessToken(accessToken);

    return {
      valid: true,
      ...userInfo,
      accessToken,
    };
  } catch (error) {
    if (AuthManagerError.is(error)) {
      return {
        valid: false,
        error: error.msg(),
      };
    }

    return {
      valid: false,
      error: error instanceof Error ? error.message : "validation failed",
    };
  }
}
