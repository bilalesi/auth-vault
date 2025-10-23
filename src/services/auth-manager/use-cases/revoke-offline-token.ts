import { z } from 'zod';

import { AuthManagerError, AuthManagerErrorDict } from '@/services/auth-manager/auth/vault-errors';
import { AuthManagerTokenTypeDict } from '@/services/auth-manager/auth/token-vault-interface';
import { GetKeycloakClient } from '@/services/auth-manager/auth/keycloak-client';
import { GetStorage } from '@/services/auth-manager/auth/token-vault-factory';

export interface RevokeOfflineTokenParams {
  id: string;
  sessionStateId: string;
}

export interface RevokeOfflineTokenResult {
  success: boolean;
  revoked: boolean;
  message: string;
}

const RevokeTokenRequestSchema = z.object({
  persistentTokenId: z.string().uuid(),
});

/**
 * Revokes an offline token associated with a given session ID.
 *
 * This function retrieves all offline token entries associated with the provided
 * session state ID. If an entry is found, it deletes the token from storage. If
 * the session has only one token entry and the session state is valid, it also
 * revokes the session using the Keycloak client.
 *
 * @param params - The parameters required to revoke the offline token.
 * @param params.sessionId - The session ID associated with the offline token.
 *
 * @returns A promise that resolves to an object indicating the success of the operation,
 *          whether the session was revoked, and a descriptive message.
 *
 * @throws AuthManagerError - If no token entries are found for the given session state ID.
 */
export async function revokeOfflineToken(
  params: RevokeOfflineTokenParams
): Promise<RevokeOfflineTokenResult> {
  const { id, sessionStateId } = params;

  const { persistentTokenId } = await RevokeTokenRequestSchema.parseAsync({
    persistentTokenId: id,
  });

  const storage = GetStorage();
  const entry = await storage.retrieve(persistentTokenId);

  const allSessionPersistentIds = await storage.retrieveAllBySessionStateId(
    sessionStateId,
    undefined,
    AuthManagerTokenTypeDict.Offline
  );

  if (!entry) {
    throw new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
      sessionStateId,
      persistentTokenId,
      reason: 'Token not found by state id',
    });
  }

  if (!allSessionPersistentIds) {
    throw new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
      sessionStateId,
      reason: 'Token not found by state id',
    });
  }

  await storage.delete(entry?.id);

  if (allSessionPersistentIds.length === 1) {
    const keycloakClient = GetKeycloakClient();
    if (entry.sessionStateId) {
      // TODO: need to check if the session is valid yet or not
      await keycloakClient.revokeSession(entry.sessionStateId);
      return {
        success: true,
        revoked: true,
        message: 'Offline token deleted and session revoked successfully',
      };
    }
  }
  return {
    success: true,
    revoked: false,
    message: 'Offline token deleted successfully (session still active)',
  };
}
