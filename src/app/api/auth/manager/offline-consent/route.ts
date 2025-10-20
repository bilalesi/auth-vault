import { NextRequest } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth/validate-token";
import {
  makeResponse,
  makeAuthManagerError,
  throwError,
} from "@/lib/auth/response";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";
import { createOfflineConsent } from "@/lib/services/offline-consent.service";

const ConsentUrlRequestSchema = z.object({
  taskId: z.uuid().min(1, "Task ID is required"),
});

/**
 * POST /api/auth/manager/offline-consent
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
    // Validate authentication
    const validation = await validateRequest(request);
    if (!validation.valid) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { taskId } = ConsentUrlRequestSchema.parse(body);

    // Call service to create consent URL
    const result = await createOfflineConsent({
      userId: validation.userId,
      taskId,
      email: validation.email,
      username: validation.username,
    });

    return makeResponse(result);
  } catch (error) {
    return throwError(error);
  }
}
