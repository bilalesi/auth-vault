import { z } from 'zod';

export const KeycloakContentType = 'application/x-www-form-urlencoded';
/**
 * Zod schema for Token Response validation
 * based on OAuth 2.0 RFC 6749 Section 5.1 and OpenID Connect Core 1.0
 */
export const TokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number().int(),
  refresh_token: z.string().optional(),
  refresh_expires_in: z.number().int().optional(),
  id_token: z.string().optional(),
  scope: z.string().optional(),
  session_state: z.string().optional(),
  'not-before-policy': z.number().int().optional(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

/**
 * Zod schema for Token Introspection Response
 * based on actual Keycloak response
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
  typ: z.string().optional(), // ex: Bearer
  azp: z.string().optional(),
  sid: z.string().optional(), // session id
  acr: z.string().optional(),
  'allowed-origins': z.array(z.string()).optional(),
  realm_access: z.object({ roles: z.array(z.string()) }).optional(),
  resource_access: z.record(z.string(), z.object({ roles: z.array(z.string()) })).optional(),
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
 * based on OpenID Connect Core 1.0 Section 5.1
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
 * based on OAuth 2.0 RFC 6749 Section 5.2
 */
export const KeycloakErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
  error_uri: z.string().url().optional(),
});
