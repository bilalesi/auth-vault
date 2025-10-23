import "server-only";

import { makeKeycloakRequestState } from "@/services/auth-manager/auth/state-token";
import { logger } from "@/services/auth-manager/logger";

export interface CreateOfflineConsentParams {
  sessionStateId: string;
  userId: string;
  taskId?: string | null;
}

export interface CreateOfflineConsentResult {
  consentUrl: string;
  sessionStateId: string;
  stateToken: string;
  message: string;
}

const CONSENT_SCOPE = "openid profile email offline_access";

/**
 * Creates an offline consent URL for a user to grant offline access.
 *
 * This function generates a consent URL that allows a user to grant offline access
 * by interacting with the Keycloak authentication server. It also creates a pending
 * offline token and a state token to track the consent process.
 *
 * @param params - The parameters required to create the offline consent.
 * @param params.userId - The ID of the user for whom the consent is being created.
 * @param params.taskId - The ID of the task associated with the consent.
 * @param params.sessionStateId - The session state ID for the current session.
 *
 * @returns A promise that resolves to an object containing:
 * - `consentUrl`: The URL the user should visit to grant offline access.
 * - `sessionStateId`: The ID of the pending offline token created for the user.
 * - `stateToken`: The state token used to track the consent process.
 * - `message`: A message indicating the purpose of the consent URL.
 *
 * @throws Will throw an error if the storage operation or URL generation fails.
 */
export async function makeOfflineConsent(
  params: CreateOfflineConsentParams
): Promise<CreateOfflineConsentResult> {
  const { userId, taskId, sessionStateId } = params;

  logger.vault("Creating consent URL", {
    userId,
    taskId,
  });

  const stateToken = makeKeycloakRequestState({
    userId,
    sessionStateId,
  });

  const authParams = new URLSearchParams({
    client_id: process.env.KEYCLOAK_CLIENT_ID!,
    response_type: "code",
    scope: CONSENT_SCOPE,
    state: stateToken,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/manager/offline-token/callback`,
  });

  const consentUrl = [
    process.env.KEYCLOAK_ISSUER,
    "/protocol/openid-connect/auth",
    `?${authParams.toString()}`,
  ].join("");
  console.log("–– – makeOfflineConsent – consentUrl––", consentUrl);

  logger.vault("Consent URL created", {
    userId,
    taskId,
    sessionStateId,
  });

  return {
    consentUrl,
    sessionStateId,
    stateToken,
    message: "Visit this URL to grant offline_access consent",
  };
}
