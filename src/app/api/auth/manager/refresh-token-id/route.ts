import { NextRequest } from 'next/server';

import { AuthManagerError, AuthManagerErrorDict } from '@/services/auth-manager/auth/vault-errors';
import { makeNewRefreshTokenId } from '@/services/auth-manager/use-cases/refresh-token-id';
import { validateRequest } from '@/services/auth-manager/auth/validate-token';
import {
  makeAuthManagerErrorResponse,
  makeAuthManagerOkResponse,
  makeAuthManagerError,
} from '@/services/auth-manager/auth/response';

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
      return makeAuthManagerError(new AuthManagerError(AuthManagerErrorDict.unauthorized.code));
    }

    const result = await makeNewRefreshTokenId({
      userId: validation.userId,
      sessionId: validation.sessionId,
    });

    return makeAuthManagerOkResponse(result);
  } catch (error) {
    return makeAuthManagerErrorResponse(error);
  }
}
