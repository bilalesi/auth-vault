import { NextRequest } from "next/server";
import { makeAuthManagerError, throwError } from "@/lib/auth/response";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";
import { handleOfflineCallback } from "@/lib/services/offline-callback.service";

/**
 * GET /api/auth/manager/offline-callback
 *
 * OAuth callback endpoint that handles the authorization code from Keycloak
 * after the user grants offline_access consent.
 *
 * Query Parameters:
 * - code: Authorization code from Keycloak
 * - state: State token to track the consent flow
 * - error: (optional) Error code if consent was denied
 * - error_description: (optional) Error description
 *
 * Returns:
 * - Redirects to /tasks page with success parameters
 * - Or returns error response if something fails
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const ackState = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Handle Keycloak errors (user denied consent, etc.)
    if (error) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
          reason: `Consent flow failed: ${errorDescription || error}`,
          keycloakError: error,
        })
      );
    }

    // Validate required parameters
    if (!code || !ackState) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.invalid_request.code, {
          reason: "Missing code or state parameter",
        })
      );
    }

    // Call service to handle the callback
    const result = await handleOfflineCallback({
      code,
      ackState,
    });

    // Redirect to tasks page with success parameters
    return Response.redirect(
      `${process.env.NEXTAUTH_URL}/tasks?success=true&taskId=${result.taskId}&persistentTokenId=${result.persistentTokenId}`
    );
  } catch (error) {
    return throwError(error);
  }
}
