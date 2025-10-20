import type { IStorage } from "./token-vault-interface";
import { AuthManagerPgStorage } from "./token-vault-postgres";
import { AuthManagerRedisStorage } from "./token-vault-redis";
import { match } from "ts-pattern";
import { AuthManagerError, AuthManagerErrorDict } from "./vault-errors";
import { AuthLogEventDict, logger } from "../logger";

export const StorageTypeDict = {
  pg: "pg",
  redis: "redis",
} as const;

export type StorageType =
  (typeof StorageTypeDict)[keyof typeof StorageTypeDict];

let tokenVaultInstance: IStorage | null = null;

/**
 * Retrieves the storage instance for the token vault. If an instance already exists,
 * it returns the existing instance. Otherwise, it initializes a new storage instance
 * based on the `TOKEN_VAULT_STORAGE` environment variable.
 *
 * @throws {AuthManagerError} If the `TOKEN_VAULT_STORAGE` environment variable is not set
 * or if the specified storage type is unsupported.
 *
 * @returns {IStorage} The storage instance for the token vault.
 */
export function GetStorage(): IStorage {
  if (tokenVaultInstance) {
    return tokenVaultInstance;
  }

  const storageType = process.env.TOKEN_VAULT_STORAGE;

  if (!storageType) {
    throw new AuthManagerError(AuthManagerErrorDict.connection_error.code, {
      operation: "initialize_storage",
    });
  }

  return (tokenVaultInstance = match({ storageType })
    .with({ storageType: StorageTypeDict.pg }, () => {
      logger.storage(
        AuthLogEventDict.storageInit,
        {
          component: "Storage",
          operation: "GetStorage",
        },
        "Using Postgres storage"
      );
      return new AuthManagerPgStorage();
    })
    .with({ storageType: StorageTypeDict.redis }, () => {
      logger.storage(
        AuthLogEventDict.storageInit,
        {
          component: "Storage",
          operation: "GetStorage",
        },
        "Using Redis storage"
      );
      return new AuthManagerRedisStorage();
    })
    .otherwise(() => {
      throw new AuthManagerError(AuthManagerErrorDict.connection_error.code, {
        operation: "initialize_storage",
        component: "Storage",
      });
    }));
}
