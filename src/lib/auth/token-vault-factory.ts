import type { IStorage } from "./token-vault-interface";
import { PgStorage } from "./token-vault-postgres";
import { RedisStorage } from "./token-vault-redis";
import { match } from "ts-pattern";
import {
  AuthManagerError,
  AuthManagerErrorDict,
  AuthManagerOperationDict,
} from "./vault-errors";

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
