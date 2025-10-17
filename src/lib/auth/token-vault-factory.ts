import type { TokenVault } from "./token-vault-interface";
import { PostgresTokenVault } from "./token-vault-postgres";
import { RedisTokenVault } from "./token-vault-redis";
import { match } from "ts-pattern";
import {
  VaultError,
  VaultErrorCodeDict,
  VaultOperationDict,
} from "./vault-errors";

/**
 * Storage type dictionary
 */
export const StorageTypeDict = {
  pg: "pg",
  redis: "redis",
} as const;

/**
 * Extract storage type from dictionary
 */
export type StorageType =
  (typeof StorageTypeDict)[keyof typeof StorageTypeDict];

/**
 * Token Vault singleton instance
 */
let tokenVaultInstance: TokenVault | null = null;

/**
 * Create or get Token Vault instance based on configuration
 * Uses TOKEN_VAULT_STORAGE environment variable to determine implementation
 *
 * @returns TokenVault instance (PostgreSQL or Redis)
 */
export function getTokenVault(): TokenVault {
  if (tokenVaultInstance) {
    return tokenVaultInstance;
  }

  const storageType = process.env.TOKEN_VAULT_STORAGE;

  if (!storageType) {
    throw new VaultError(VaultErrorCodeDict.connection_error, {
      operation: "initialize",
    });
  }

  return (tokenVaultInstance = match({ storageType })
    .with({ storageType: StorageTypeDict.pg }, () => {
      console.log("Using PostgreSQL Token Vault");
      return new PostgresTokenVault();
    })
    .with({ storageType: StorageTypeDict.redis }, () => {
      console.log("Using Redis Token Vault");
      return new RedisTokenVault();
    })
    .otherwise(() => {
      throw new VaultError(VaultErrorCodeDict.connection_error, {
        operation: "initialize",
        storageType,
      });
    }));
}

/**
 * Reset the token vault instance (useful for testing)
 */
export function resetTokenVault(): void {
  tokenVaultInstance = null;
}
