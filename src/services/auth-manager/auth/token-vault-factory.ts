import { match } from "ts-pattern";

import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/services/auth-manager/auth/vault-errors";
import { AuthManagerPgStorage } from "@/services/auth-manager/auth/token-vault-postgres";
import { AuthLogEventDict, logger } from "@/services/auth-manager/logger";

import type { IStorage } from "@/services/auth-manager/auth/token-vault-interface";

export const StorageTypeDict = {
  pg: "pg",
  redis: "redis",
} as const;

export type TStorageType =
  (typeof StorageTypeDict)[keyof typeof StorageTypeDict];

let storage: IStorage | null = null;

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
  if (storage) {
    return storage;
  }

  const storageType = process.env.AUTH_MANAGER_VAULT_STORAGE;

  if (!storageType) {
    throw new AuthManagerError(AuthManagerErrorDict.connection_error.code, {
      operation: "initialize_storage",
    });
  }

  storage = match({ storageType })
    .with({ storageType: StorageTypeDict.pg }, () => {
      logger.storage(
        AuthLogEventDict.storageInit,
        { storageType },
        "Using Postgres storage"
      );
      return new AuthManagerPgStorage();
    })
    .otherwise(() => {
      throw new AuthManagerError(AuthManagerErrorDict.connection_error.code, {
        operation: "initialize_storage",
        component: "Storage",
      });
    });

  return storage;
}
