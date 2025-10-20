import { Signale } from "signale";

export const AuthLogEventDict = {
  // Storage events
  storageInit: "storage.init",

  // Token events
  tokenCreated: "token.created",
  tokenRefreshed: "token.refreshed",
  tokenRevoked: "token.revoked",
  tokenExpired: "token.expired",
  tokenValidated: "token.validated",
  tokenValidationFailed: "token.validation_failed",

  // Offline token events
  offlineTokenRequested: "offline_token.requested",
  offlineTokenGranted: "offline_token.granted",
  offlineTokenRevoked: "offline_token.revoked",
  offlineTokenConsentRequired: "offline_token.consent_required",
  offlineTokenConsentGranted: "offline_token.consent_granted",
  offlineTokenConsentDenied: "offline_token.consent_denied",

  // Keycloak events
  keycloakRequest: "keycloak.request",
  keycloakResponse: "keycloak.response",
  keycloakError: "keycloak.error",

  // Vault events
  vaultStore: "vault.store",
  vaultRetrieve: "vault.retrieve",
  vaultDelete: "vault.delete",
  vaultError: "vault.error",

  // API events
  apiRequest: "api.request",
  apiResponse: "api.response",
  apiError: "api.error",

  // Validation events
  validationError: "validation.error",

  // Encryption events
  encryption: "encryption",
  decryption: "decryption",

  // Parsing events
  parsing: "parsing",

  // General events
  error: "error",
  warning: "warning",
} as const;

export type AuthLogEvent =
  (typeof AuthLogEventDict)[keyof typeof AuthLogEventDict];

export interface LogContext {
  userId?: string;
  username?: string;
  email?: string;

  tokenId?: string;
  tokenType?: string;
  persistentTokenId?: string;
  sessionState?: string;

  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;

  operation?: string;
  component?: string;
  duration?: number;

  error?: string;
  errorCode?: string;
  errorStack?: string;
  [key: string]: any;
}

const logLevel = "info";

export const logger = new Signale({
  disabled: false,
  interactive: false,
  logLevel: logLevel as any,
  scope: "AuthManager",
  secrets: [],
  stream: process.stdout,
  types: {
    auth: {
      badge: "🔐",
      color: "cyan",
      label: "auth",
      logLevel: "info",
    },
    vault: {
      badge: "✷✷✷",
      color: "magenta",
      label: "vault",
      logLevel: "info",
    },
    storage: {
      badge: "📦",
      color: "blue",
      label: "storage",
      logLevel: "info",
    },
    keycloak: {
      badge: "🔑",
      color: "yellow",
      label: "keycloak",
      logLevel: "info",
    },
    api: {
      badge: "📡",
      color: "green",
      label: "api",
      logLevel: "info",
    },
  },
  config: {
    displayTimestamp: true,
    displayDate: false,
  },
});

export default logger;
