import "server-only";

import { GetStorage } from "@/lib/auth/token-vault-factory";
import { makeStateToken } from "@/lib/auth/state-token";
import { getExpirationDate, TokenExpirationDict } from "@/lib/auth/date-utils";
import logger, { AuthLogEventDict } from "@/lib/logger";

export interface CreateOfflineConsentParams {
  userId: string;
  taskId: string;
  email?: string;
  username?: string;
}

export interface CreateOfflineConsentResult {
  consentUrl: string;
  persistentTokenId: string;
  stateToken: string;
  message: string;
}

/**
 * Creates an offline consent URL for a user to grant offline_access permission.
 *
 * This function:
 * 1. Creates a pending offline token entry in the vault
 * 2. Generates a state token to track the consent flow
 * 3. Updates the vault entry with the state token
 * 4. Constructs a Keycloak authorization URL with offline_access scope
 * 5. Returns the consent URL and tracking information
 *
 * The user must visit the consent URL to grant offline_access permission.
 * After consent, Keycloak will redirect to the offline-callback endpoint
 * with an authorization code that can be exchanged for an offline token.
 *
 * @param params - The parameters for creating the consent URL
 * @returns A promise that resolves to the consent URL and tracking information
 *
 * @throws {AuthManagerError} If vault operations fail
 */
export async function createOfflineConsent(
  params: CreateOfflineConsentParams
): Promise<CreateOfflineConsentResult> {
  const { userId, taskId, email, username } = params;

  logger.vault(
    `[${AuthLogEventDict.offlineTokenRequested}] Creating consent URL`,
    {
      component: "OfflineConsentService",
      operation: "createOfflineConsent",
      userId,
      taskId,
    }
  );

  const vault = GetStorage();
  const expiresAt = getExpirationDate(TokenExpirationDict.Offline);

  const persistentTokenId = await vault.makePendingOfflineToken(
    userId,
    taskId,
    null,
    expiresAt,
    {
      email,
      username,
      createdVia: "offline_consent_request",
    }
  );

  const stateToken = makeStateToken({
    userId,
    taskId,
    persistentTokenId,
  });

  await vault.updateAckState(persistentTokenId, stateToken);

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

  logger.vault(
    `[${AuthLogEventDict.offlineTokenRequested}] Consent URL created`,
    {
      component: "OfflineConsentService",
      operation: "createOfflineConsent",
      userId,
      taskId,
      persistentTokenId,
    }
  );

  return {
    consentUrl,
    persistentTokenId,
    stateToken,
    message:
      "Visit this URL to grant offline_access consent, then the token will be automatically stored",
  };
}
