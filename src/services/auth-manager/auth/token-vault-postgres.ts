import { and, eq } from "drizzle-orm";

import {
  encryptToken,
  generateIV,
  hashToken,
} from "@/services/auth-manager/auth/encryption";
import {
  AuthVault,
  TAuthManagerTokenVaultRow,
} from "@/services/auth-manager/db/schema";
import { logger, AuthLogEventDict } from "@/services/auth-manager/logger";
import { makeUUID } from "@/services/auth-manager/auth/uuid";
import { makeDb } from "@/services/auth-manager/db/client";
import {
  AuthManagerTokenTypeDict,
  type IStorage,
  type TAuthManagerTokenType,
  type OfflineTokenStatus,
} from "@/services/auth-manager/auth/token-vault-interface";
import {
  AuthManagerError,
  AuthManagerErrorDict,
  AuthManagerStorageTypeDict,
} from "@/services/auth-manager/auth/vault-errors";

export class AuthManagerPgStorage implements IStorage {
  private db = makeDb();

  async create({
    userId,
    token,
    type,
    metadata,
    sessionStateId,
  }: {
    userId: string;
    token: string;
    type: TAuthManagerTokenType;
    sessionStateId: string;
    metadata?: Record<string, any>;
  }): Promise<TAuthManagerTokenVaultRow> {
    try {
      const iv = generateIV();
      const encryptedToken = encryptToken(token, iv);
      const tokenHash = hashToken(token);

      const [entry] = await this.db
        .insert(AuthVault)
        .values({
          userId,
          tokenType: type,
          encryptedToken,
          iv,
          tokenHash,
          metadata,
          sessionStateId,
        })
        .returning();

      return entry;
    } catch (error) {
      logger.storage(
        AuthLogEventDict.storageError,
        {
          userId,
          storageType: AuthManagerStorageTypeDict.postgres,
        },
        error
      );
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        userId,
        originalError: error,
      });
    }
  }

  async retrieve(tokenId: string): Promise<TAuthManagerTokenVaultRow | null> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where(f, op) {
          return op.eq(f.id, tokenId);
        },
      });

      if (!row) return null;

      return row;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        persistentTokenId: tokenId,
        originalError: error,
      });
    }
  }

  async delete(tokenId: string): Promise<void> {
    try {
      await this.db.delete(AuthVault).where(eq(AuthVault.id, tokenId));
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        persistentTokenId: tokenId,
        originalError: error,
      });
    }
  }

  async getUserRefreshTokenById({
    persistentTokenId,
  }: {
    persistentTokenId: string;
  }): Promise<TAuthManagerTokenVaultRow | null> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where(fields, operators) {
          return operators.and(
            operators.eq(fields.id, persistentTokenId),
            operators.eq(fields.tokenType, AuthManagerTokenTypeDict.Refresh)
          );
        },
      });

      if (!row) return null;
      return row;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        persistentTokenId,
        originalError: error,
      });
    }
  }

  async getUserRefreshTokenByUserId({
    userId,
  }: {
    userId: string;
  }): Promise<TAuthManagerTokenVaultRow | null> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where(fields, operators) {
          return operators.and(
            operators.eq(fields.userId, userId),
            operators.eq(fields.tokenType, AuthManagerTokenTypeDict.Refresh)
          );
        },
      });

      if (!row) return null;
      return row;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        userId,
        originalError: error,
      });
    }
  }

  async getUserRefreshTokenBySessionId({ sessionId }: { sessionId: string }) {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where(fields, operators) {
          return operators.and(
            operators.eq(fields.sessionStateId, sessionId),
            operators.eq(fields.tokenType, AuthManagerTokenTypeDict.Refresh)
          );
        },
      });

      if (!row) return null;
      return row;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        sessionId,
        originalError: error,
      });
    }
  }

  async updateOfflineTokenById({
    persistentTokenId,
    token,
    status,
    sessionStateId,
  }: {
    persistentTokenId: string;
    token: string;
    status: OfflineTokenStatus;
    sessionStateId?: string;
  }): Promise<TAuthManagerTokenVaultRow | null> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where: (f, op) => {
          return op.eq(f.id, persistentTokenId);
        },
      });

      if (!row) return null;

      const iv: string | null = generateIV();
      const encryptedToken: string | null = encryptToken(token, iv);
      const tokenHash: string | null = hashToken(token);

      const existingMetadata = (row.metadata as Record<string, any>) || {};
      const mergedMetadata = {
        ...existingMetadata,
        tokenActivatedAt: new Date().toISOString(),
        status,
      };

      await this.db
        .update(AuthVault)
        .set({
          encryptedToken,
          iv,
          tokenHash,
          sessionStateId,
          metadata: mergedMetadata,
        })
        .where(eq(AuthVault.id, row.id));
      return row;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        originalError: error,
        persistentTokenId,
        status,
        sessionStateId,
      });
    }
  }

  async upsertRefreshToken({
    token,
    userId,
    sessionStateId,
    metadata,
  }: {
    token: string;
    userId: string;
    sessionStateId: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where: (f, op) => {
          return op.and(
            op.eq(f.sessionStateId, sessionStateId),
            op.eq(f.tokenType, AuthManagerTokenTypeDict.Refresh)
          );
        },
      });

      const iv = generateIV();
      const encryptedToken = encryptToken(token, iv);
      let rowId: string | null = null;
      if (row) {
        const existingId = row.id;
        const existingMetadata = (row.metadata as Record<string, any>) || {};
        const mergedMetadata = metadata
          ? {
              ...existingMetadata,
              ...metadata,
              updatedAt: new Date().toISOString(),
            }
          : existingMetadata;

        await this.db
          .update(AuthVault)
          .set({
            encryptedToken,
            iv,
            sessionStateId,
            metadata: mergedMetadata,
          })
          .where(eq(AuthVault.id, existingId));

        rowId = existingId;
        logger.storage(AuthLogEventDict.tokenRefreshed, {
          persistentTokenId: rowId,
        });
      } else {
        const id = makeUUID();
        await this.db.insert(AuthVault).values({
          id,
          userId,
          tokenType: AuthManagerTokenTypeDict.Refresh,
          encryptedToken,
          iv,
          sessionStateId,
          metadata,
        });

        rowId = id;
        logger.storage(AuthLogEventDict.tokenCreated, {
          tokenType: AuthManagerTokenTypeDict.Refresh,
          persistentTokenId: rowId,
          userId,
        });
      }
      return rowId;
    } catch (err) {
      logger.storage(
        AuthLogEventDict.storageError,
        {
          userId,
          storageType: AuthManagerStorageTypeDict.postgres,
        },
        err
      );
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        userId,
        originalError: err,
      });
    }
  }

  async retrieveUserPersistentIdBySession(
    sessionStateId: string
  ): Promise<TAuthManagerTokenVaultRow | null> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where: (f, op) => {
          return op.and(
            op.eq(f.sessionStateId, sessionStateId),
            op.eq(f.tokenType, AuthManagerTokenTypeDict.Offline)
          );
        },
        orderBy: (f, op) => [op.desc(f.createdAt)],
      });

      if (!row) return null;

      return row;
    } catch (err) {
      logger.storage(
        AuthLogEventDict.storageError,
        {
          sessionStateId,
        },
        err
      );
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        sessionStateId,
        originalError: err,
      });
    }
  }

  async retrieveAllBySessionStateId(
    sessionStateId: string,
    excludeTokenId?: string,
    tokeType?: TAuthManagerTokenType
  ): Promise<Array<TAuthManagerTokenVaultRow>> {
    try {
      const rows = await this.db.query.AuthVault.findMany({
        where: (f, op) =>
          op.and(
            op.eq(f.sessionStateId, sessionStateId),
            excludeTokenId ? op.ne(f.id, excludeTokenId) : undefined,
            tokeType ? op.eq(f.tokenType, tokeType) : undefined
          ),
        orderBy: (f, op) => [op.desc(f.createdAt)],
      });

      return rows;
    } catch (err) {
      logger.storage(
        AuthLogEventDict.storageError,
        { sessionStateId, tokeType },
        err
      );
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        sessionStateId,
        excludeTokenId,
        originalError: err,
      });
    }
  }

  async retrieveDuplicateTokenHash(
    tokenHash: string,
    excludeTokenId: string
  ): Promise<boolean> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where: (f, op) => {
          return op.and(
            op.eq(f.tokenHash, tokenHash),
            op.ne(f.id, excludeTokenId)
          );
        },
      });

      return row !== undefined;
    } catch (err) {
      logger.storage(
        AuthLogEventDict.storageError,
        {
          tokenHash,
          excludeTokenId,
        },
        err
      );
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        tokenHash,
        excludeTokenId,
        originalError: err,
      });
    }
  }
}
