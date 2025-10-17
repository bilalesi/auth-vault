import { z } from "zod";

/**
 * Zod schema for Token Response validation
 * Based on OAuth 2.0 RFC 6749 Section 5.1 and OpenID Connect Core 1.0
 *
 * Required fields per RFC 6749:
 * - access_token: The access token issued by the authorization server
 * - token_type: The type of token (usually "Bearer")
 *
 * Recommended fields:
 * - expires_in: Lifetime in seconds of the access token
 *
 * Optional fields:
 * - refresh_token: Can be used to obtain new access tokens
 * - scope: Scope of the access token
 */
export const TokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(), // "Bearer"
  expires_in: z.number().int(), // Seconds until expiration (can be 0)
  refresh_token: z.string().optional(),
  refresh_expires_in: z.number().int().optional(), // Keycloak specific, 0 for offline tokens
  id_token: z.string().optional(), // OpenID Connect
  scope: z.string().optional(),
  session_state: z.string().optional(), // Keycloak specific (with underscore)
  "not-before-policy": z.number().int().optional(), // Keycloak specific (with hyphen!)
});

/**
 * Zod schema for Token Introspection Response
 * Based on actual Keycloak response
 */
export const TokenIntrospectionSchema = z.object({
  active: z.boolean(),
  exp: z.number().int().optional(),
  iat: z.number().int().optional(),
  auth_time: z.number().int().optional(),
  jti: z.string().optional(),
  iss: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  sub: z.string().optional(),
  typ: z.string().optional(), // "Bearer"
  azp: z.string().optional(),
  sid: z.string().optional(), // Session ID
  acr: z.string().optional(),
  "allowed-origins": z.array(z.string()).optional(), // Note: kebab-case!
  realm_access: z.object({ roles: z.array(z.string()) }).optional(),
  resource_access: z
    .record(z.string(), z.object({ roles: z.array(z.string()) }))
    .optional(),
  scope: z.string().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  preferred_username: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  email: z.string().optional(),
  client_id: z.string().optional(),
  username: z.string().optional(),
  token_type: z.string().optional(),
});

/**
 * Zod schema for User Info Response
 * Based on OpenID Connect Core 1.0 Section 5.1
 */
export const UserInfoSchema = z.object({
  sub: z.string(), // Subject - required
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  middle_name: z.string().optional(),
  nickname: z.string().optional(),
  preferred_username: z.string().optional(),
  profile: z.string().url().optional(),
  picture: z.string().url().optional(),
  website: z.string().url().optional(),
  email: z.string().email().optional(),
  email_verified: z.boolean().optional(),
  gender: z.string().optional(),
  birthdate: z.string().optional(),
  zoneinfo: z.string().optional(),
  locale: z.string().optional(),
  phone_number: z.string().optional(),
  phone_number_verified: z.boolean().optional(),
  address: z
    .object({
      formatted: z.string().optional(),
      street_address: z.string().optional(),
      locality: z.string().optional(),
      region: z.string().optional(),
      postal_code: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  updated_at: z.number().int().optional(),
});

/**
 * Zod schema for Keycloak Error Response
 * Based on OAuth 2.0 RFC 6749 Section 5.2
 */
export const KeycloakErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
  error_uri: z.string().url().optional(),
});

/**
 * Parse and validate Token Response
 */
export function parseTokenResponse(data: unknown) {
  return TokenResponseSchema.parse(data);
}

/**
 * Parse and validate Token Introspection Response
 */
export function parseTokenIntrospection(data: unknown) {
  return TokenIntrospectionSchema.parse(data);
}

/**
 * Parse and validate User Info Response
 */
export function parseUserInfo(data: unknown) {
  return UserInfoSchema.parse(data);
}

/**
 * Parse Keycloak Error Response
 */
export function parseKeycloakError(data: unknown) {
  try {
    return KeycloakErrorSchema.parse(data);
  } catch {
    return { error: "unknown_error", error_description: String(data) };
  }
}
