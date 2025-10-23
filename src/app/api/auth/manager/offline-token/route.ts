import { NextRequest } from 'next/server';

import { AuthManagerError, AuthManagerErrorDict } from '@/services/auth-manager/auth/vault-errors';
import { makeOfflineConsent } from '@/services/auth-manager/use-cases/request-offline-token-consent';
import { validateRequest } from '@/services/auth-manager/auth/validate-token';
import {
  makeAuthManagerOkResponse,
  makeAuthManagerError,
  makeAuthManagerErrorResponse,
} from '@/services/auth-manager/auth/response';

/**
 * POST /api/auth-manager/offline-consent
 *
 * Creates a consent URL for the user to grant offline_access permission.
 *
 * Body Parameters:
 * - taskId: UUID of the task that will use the offline token
 *
 * Returns:
 * - consentUrl: URL to visit for granting consent
 * - persistentTokenId: ID that will be populated after consent
 * - stateToken: Token to track the consent flow
 * - message: Instructions for the user
 */
export async function POST(request: NextRequest) {
  try {
    const validatedRequest = await validateRequest(request);
    if (!validatedRequest.valid) {
      return makeAuthManagerError(new AuthManagerError(AuthManagerErrorDict.unauthorized.code));
    }

    if (!validatedRequest.sessionId) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.missing_session_state.code)
      );
    }

    const query = request.nextUrl.searchParams;
    const taskId = query.get('task_id');

    const result = await makeOfflineConsent({
      sessionStateId: validatedRequest.sessionId,
      userId: validatedRequest.userId,
      taskId,
    });

    return makeAuthManagerOkResponse(result);
  } catch (error) {
    return makeAuthManagerErrorResponse(error);
  }
}
