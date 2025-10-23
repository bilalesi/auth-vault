// this can only be used server side
import { Signale } from 'signale';

export const AuthLogEventDict = {
  storageInit: 'storage.init',
  tokenCreated: 'token.created',
  tokenRefreshed: 'token.refreshed',
  tokenRevoked: 'token.revoked',
  offlineTokenRevoked: 'offline_token.revoked',
  keycloakError: 'keycloak.error',
  storageError: 'storage.error',
  validationError: 'validation.error',
  encryptionError: 'encryption.error',
  decryptionError: 'decryption.error',
  parsing: 'parsing',
  error: 'error',
  warning: 'warning',
} as const;

export type AuthLogEvent = (typeof AuthLogEventDict)[keyof typeof AuthLogEventDict];

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

const logLevel = 'info';

export const logger = new Signale({
  disabled: false,
  interactive: false,
  logLevel: logLevel as any,
  scope: 'AuthManager',
  secrets: [],
  stream: process.stdout,
  types: {
    auth: {
      badge: '🔐',
      color: 'cyan',
      label: 'auth',
      logLevel: 'info',
    },
    vault: {
      badge: '✷✷✷',
      color: 'magenta',
      label: 'vault',
      logLevel: 'info',
    },
    storage: {
      badge: '📦',
      color: 'blue',
      label: 'storage',
      logLevel: 'info',
    },
    keycloak: {
      badge: '🔑',
      color: 'yellow',
      label: 'keycloak',
      logLevel: 'info',
    },
    api: {
      badge: '📡',
      color: 'green',
      label: 'api',
      logLevel: 'info',
    },
  },
  config: {
    displayTimestamp: true,
    displayDate: false,
  },
});

export default logger;
