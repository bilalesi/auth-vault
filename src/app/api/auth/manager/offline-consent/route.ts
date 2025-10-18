import { NextRequest } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth/validate-token";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";
import {
  AuthManagerError,
  AuthManagerErrorCodeDict,
} from "@/lib/auth/vault-errors";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { generateStateToken } from "@/lib/auth/state-token";
import { getExpirationDate, TokenExpirationDict } from "@/lib/auth/date-utils";

// Request schema
const ConsentUrlRequestSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  redirectUri: z.string().url().optional(),
});

/**
 * POST /api/auth/manager/offline-consent
 *
 * Generates a Keycloak consent URL for offline_access scope.
 * Creates a pending offline token request in the database with a state token.
 * The state token is used to track the consent flow and update the token later.
 *
 * Requirements: 5.1, 5.2
 */
export async function POST(request: NextRequest) {
  try {
    // Validate Bearer token from Authorization header
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorCodeDict.unauthorized)
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedBody = ConsentUrlRequestSchema.parse(body);

    // Create pending offline token request
    const vault = GetStorage();
    const expiresAt = getExpirationDate(TokenExpirationDict.offline);

    // Generate state token (will be created after we have persistentTokenId)
    const persistentTokenId = await vault.createPendingOfflineToken(
      validation.userId,
      validatedBody.taskId,
      "", // Temporary empty state, will update below
      expiresAt,
      {
        email: validation.email,
        username: validation.username,
        createdVia: "offline_consent_request",
      }
    );

    // Generate state token with userId, taskId, and persistentTokenId
    const stateToken = generateStateToken({
      userId: validation.userId,
      taskId: validatedBody.taskId,
      persistentTokenId,
    });

    // Update the pending token with the state token
    await vault.updateStateToken(persistentTokenId, stateToken);

    // Build consent URL using URLSearchParams
    const authParams = new URLSearchParams({
      client_id: process.env.KEYCLOAK_CLIENT_ID!,
      response_type: "code",
      scope: "openid offline_access",
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/manager/offline-callback`,
      state: stateToken,
    });

    const consentUrl = `${
      process.env.KEYCLOAK_ISSUER
    }/protocol/openid-connect/auth?${authParams.toString()}`;

    return makeResponse({
      consentUrl,
      persistentTokenId,
      stateToken,
      message:
        "Visit this URL to grant offline_access consent, then the token will be automatically stored",
    });
  } catch (error) {
    return throwError(error);
  }
}
