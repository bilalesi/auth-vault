import { NextRequest } from 'next/server';
import { z } from 'zod';

import { AuthManagerError, AuthManagerErrorDict } from '@/services/auth-manager/auth/vault-errors';
import { makeAccessToken } from '@/services/auth-manager/use-cases/access-token';
import { validateRequest } from '@/services/auth-manager/auth/validate-token';
import {
  makeAuthManagerError,
  makeAuthManagerOkResponse,
  makeAuthManagerErrorResponse,
} from '@/services/auth-manager/auth/response';

/**
 * GET /api/auth-manager/access-token
 *
 * Retrieves a fresh access token using a persistent token ID.
 *
 * Query Parameters:
 * - persistent_token_id: UUID of the stored refresh/offline token
 *
 * Returns:
 * - accessToken: The new access token
 * - expiresIn: Number of seconds until expiration
 */
export async function POST(request: NextRequest) {
  try {
    const { valid } = await validateRequest(request);
    if (!valid) {
      return makeAuthManagerError(new AuthManagerError(AuthManagerErrorDict.unauthorized.code));
    }

    const { searchParams } = request.nextUrl;
    const persistentTokenId = await z.string().uuid().parseAsync(searchParams.get('id'));

    const result = await makeAccessToken({
      persistentTokenId,
    });

    return makeAuthManagerOkResponse(result);
  } catch (error) {
    return makeAuthManagerErrorResponse(error);
  }
}
