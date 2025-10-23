import { NextRequest } from "next/server";
import z from "zod";

import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/services/auth-manager/auth/vault-errors";
import { makeOfflineTokenThroughCallback } from "@/services/auth-manager/use-cases/offline-token-callback";
import {
  makeAuthManagerError,
  makeAuthManagerOkResponse,
  makeAuthManagerErrorResponse,
} from "@/services/auth-manager/auth/response";
import { parseAckKeycloakRequestState } from "@/services/auth-manager/auth/state-token";

const KeycloakCallbackUrlSchema = z.object({
  code: z.string({ error: "authorization code is missing" }),
  ackState: z.string({ error: "acknowledgement state is missing" }),
});

/**
 * GET /api/auth-manager/offline-callback
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
 * - Redirects to /consent-accepted page with success parameters
 * - Or returns error response if something fails
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const kcCode = searchParams.get("code");
    const ackKcRequestState = searchParams.get("state");
    const kcError = searchParams.get("error");
    const kcErrorDescription = searchParams.get("error_description");

    if (kcError) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
          reason: `Consent flow failed: ${kcErrorDescription || kcError}`,
          keycloakError: kcError,
        })
      );
    }

    const { ackState, code } = await KeycloakCallbackUrlSchema.parseAsync({
      code: kcCode,
      ackState: ackKcRequestState,
    });

    const statePayload = await parseAckKeycloakRequestState(ackState);

    if (!code || !statePayload?.sessionStateId) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.invalid_request.code, {
          reason: "Missing code or state parameters",
        })
      );
    }

    const result = await makeOfflineTokenThroughCallback({
      code,
      userId: statePayload.userId,
    });

    return makeAuthManagerOkResponse(result);
    // return Response.redirect(`/app/consent-accepted`);
  } catch (error) {
    return makeAuthManagerErrorResponse(error);
  }
}
