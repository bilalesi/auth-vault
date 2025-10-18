import { NextRequest } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth/validate-token";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { generateStateToken } from "@/lib/auth/state-token";
import { getExpirationDate, TokenExpirationDict } from "@/lib/auth/date-utils";

// Request schema
const ConsentUrlRequestSchema = z.object({
  taskId: z.uuid().min(1, "Task ID is required"),
});

/**
 * post /api/auth/manager/offline-consent
 *
 * generates a keycloak consent url for offline_access scope.
 * creates a pending offline token request in the database with a state token.
 * the state token is used to track the consent flow and update the token later.
 */
export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }

    const body = await request.json();
    const validatedBody = ConsentUrlRequestSchema.parse(body);

    const vault = GetStorage();
    const expiresAt = getExpirationDate(TokenExpirationDict.offline);

    const persistentTokenId = await vault.makePendingOfflineToken(
      validation.userId,
      validatedBody.taskId,
      null,
      expiresAt,
      {
        email: validation.email,
        username: validation.username,
        createdVia: "offline_consent_request",
      }
    );

    const stateToken = generateStateToken({
      userId: validation.userId,
      taskId: validatedBody.taskId,
      persistentTokenId,
    });

    await vault.updateStateToken(persistentTokenId, stateToken);

    const authParams = new URLSearchParams({
      client_id: process.env.KEYCLOAK_CLIENT_ID!,
      response_type: "code",
      scope: "openid profile email offline_access",
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
