import type { IStorage } from "./token-vault-interface";
import { PgStorage } from "./token-vault-postgres";
import { RedisStorage } from "./token-vault-redis";
import { match } from "ts-pattern";
import {
  AuthManagerError,
  AuthManagerErrorDict,
  AuthManagerOperationDict,
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
let tokenVaultInstance: IStorage | null = null;

/**
 * Create or get Token Vault instance based on configuration
 * Uses TOKEN_VAULT_STORAGE environment variable to determine implementation
 *
 * @returns TokenVault instance (PostgreSQL or Redis)
 */
export function GetStorage(): IStorage {
  if (tokenVaultInstance) {
    return tokenVaultInstance;
  }

  const storageType = process.env.TOKEN_VAULT_STORAGE;

  if (!storageType) {
    throw new AuthManagerError(AuthManagerErrorDict.connection_error.code, {
      operation: AuthManagerOperationDict.initialize,
    });
  }

  return (tokenVaultInstance = match({ storageType })
    .with({ storageType: StorageTypeDict.pg }, () => {
      console.log("Using PostgreSQL Token Vault");
      return new PgStorage();
    })
    .with({ storageType: StorageTypeDict.redis }, () => {
      console.log("Using Redis Token Vault");
      return new RedisStorage();
    })
    .otherwise(() => {
      throw new AuthManagerError(AuthManagerErrorDict.connection_error.code, {
        operation: AuthManagerOperationDict.initialize,
      });
    }));
}
