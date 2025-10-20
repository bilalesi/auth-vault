import { eq, lt, and, sql } from "drizzle-orm";
import { makeDb } from "@/lib/db/client";
import { AuthVault, TokenStatusValues, TokenTypeEnum } from "@/lib/db/schema";
import {
  OfflineTokenStatusDict,
  AuthManagerTokenTypeDict,
  type IStorage,
  type AuthManagerVaultEntry,
  type TAuthManagerTokenType,
  type OfflineTokenStatus,
} from "./token-vault-interface";
import { encryptToken, generateIV, hashToken } from "./encryption";
import { makeUUID } from "./uuid";
import {
  AuthManagerError,
  AuthManagerErrorDict,
  AuthManagerStorageTypeDict,
} from "./vault-errors";
import { isExpired } from "./date-utils";
import { logger, AuthLogEventDict } from "@/lib/logger";

export class AuthManagerPgStorage implements IStorage {
  private db = makeDb();

  async create(
    userId: string,
    token: string,
    type: TAuthManagerTokenType,
    expiresAt: Date,
    metadata?: Record<string, any>,
    tokenId?: string
  ): Promise<string> {
    try {
      const id = tokenId || makeUUID();
      const iv = generateIV();
      const encryptedToken = encryptToken(token, iv);
      const tokenHash = hashToken(token);

      if (tokenId) {
        await this.db.delete(AuthVault).where(eq(AuthVault.id, tokenId));
      }

      await this.db.insert(AuthVault).values({
        id,
        userId,
        tokenType: type,
        encryptedToken,
        iv,
        tokenHash,
        expiresAt,
        metadata: metadata || null,
      });

      return id;
    } catch (error) {
      logger.storage(
        AuthLogEventDict.vaultError,
        {
          component: "AuthManagerPgVault",
          operation: "create",
          userId,
          storageType: AuthManagerStorageTypeDict.postgres,
        },
        error
      );
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "create",
        userId,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async retrieve(tokenId: string): Promise<AuthManagerVaultEntry | null> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where(f, op) {
          return op.eq(f.id, tokenId);
        },
      });

      if (!row) return null;

      if (isExpired(row.expiresAt)) {
        await this.delete(tokenId);
        return null;
      }

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as TAuthManagerTokenType,
        encryptedToken: row.encryptedToken,
        iv: row.iv,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: row.metadata as Record<string, any> | undefined,
        status: row.status as any,
        taskId: row.taskId || undefined,
        ackState: row.ackState || undefined,
        sessionState: row.sessionState || undefined,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "retrieve",
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async delete(tokenId: string): Promise<void> {
    try {
      await this.db.delete(AuthVault).where(eq(AuthVault.id, tokenId));
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "delete",
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async cleanup(): Promise<number> {
    try {
      const result = await this.db
        .delete(AuthVault)
        .where(lt(AuthVault.expiresAt, new Date()))
        .returning({ id: AuthVault.id });

      return result.length;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.cleanup_error.code, {
        operation: "cleanup",
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async getUserRefreshToken(
    userId: string
  ): Promise<AuthManagerVaultEntry | null> {
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
      if (isExpired(row.expiresAt)) {
        await this.delete(row.id);
        return null;
      }

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as TAuthManagerTokenType,
        encryptedToken: row.encryptedToken,
        iv: row.iv,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: row.metadata as Record<string, any> | undefined,
        status: row.status as any,
        taskId: row.taskId || undefined,
        ackState: row.ackState || undefined,
        sessionState: row.sessionState || undefined,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "getUserRefreshToken",
        userId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async makePendingOfflineToken(
    userId: string,
    taskId: string,
    ackState: string | null,
    expiresAt: Date,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const id = makeUUID();
      await this.db.insert(AuthVault).values({
        id,
        userId,
        tokenType: AuthManagerTokenTypeDict.Offline,
        encryptedToken: null,
        iv: null,
        expiresAt,
        metadata: metadata || null,
        status: OfflineTokenStatusDict.Pending,
        taskId,
        ackState,
      });

      return id;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "makePendingOfflineToken",
        userId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async updateOfflineTokenByState(
    ackState: string,
    token: string | null,
    status: OfflineTokenStatus,
    sessionState?: string
  ): Promise<AuthManagerVaultEntry | null> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where: (f, op) => {
          return op.eq(f.ackState, ackState);
        },
      });

      if (!row) return null;

      let encryptedToken: string | null = null;
      let iv: string | null = null;
      let tokenHash: string | null = null;

      if (token) {
        iv = generateIV();
        encryptedToken = encryptToken(token, iv);
        tokenHash = hashToken(token);
      }

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
          status,
          sessionState: sessionState || null,
          metadata: mergedMetadata,
        })
        .where(eq(AuthVault.id, row.id));

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as TAuthManagerTokenType,
        encryptedToken: encryptedToken || row.encryptedToken,
        iv: iv || row.iv,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: row.metadata as Record<string, any> | undefined,
        status: status as any,
        taskId: row.taskId || undefined,
        ackState: row.ackState || undefined,
        sessionState: sessionState || row.sessionState || undefined,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "updateOfflineTokenByState",
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async retrieveByAckState(
    ackState: string
  ): Promise<AuthManagerVaultEntry | null> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where(f, op) {
          return op.eq(f.ackState, ackState);
        },
      });

      if (!row) return null;

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as TAuthManagerTokenType,
        encryptedToken: row.encryptedToken,
        iv: row.iv,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: row.metadata as Record<string, any> | undefined,
        status: row.status as any,
        taskId: row.taskId || undefined,
        ackState: row.ackState || undefined,
        sessionState: row.sessionState || undefined,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "retrieveByAckState",
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async updateAckState(tokenId: string, ackState: string): Promise<void> {
    try {
      await this.db
        .update(AuthVault)
        .set({ ackState })
        .where(eq(AuthVault.id, tokenId));
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "updateAckState",
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async upsertRefreshToken(
    userId: string,
    token: string,
    expiresAt: Date,
    sessionState?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where: (f, op) => {
          return op.and(
            op.eq(f.userId, userId),
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
            expiresAt,
            sessionState: sessionState || null,
            metadata: mergedMetadata,
          })
          .where(eq(AuthVault.id, existingId));

        rowId = existingId;
        logger.storage(AuthLogEventDict.tokenRefreshed, {
          component: "AuthManagerRedisVault",
          operation: "upsertRefreshToken",
          userId,
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
          expiresAt,
          sessionState: sessionState || null,
          metadata: metadata || null,
        });

        rowId = id;
        logger.storage(AuthLogEventDict.tokenCreated, {
          component: "PgStorage",
          operation: "upsertRefreshToken",
          userId,
          persistentTokenId: rowId,
          tokenType: AuthManagerTokenTypeDict.Refresh,
        });
      }
      return rowId;
    } catch (err) {
      logger.storage(
        AuthLogEventDict.vaultError,
        {
          component: "AuthManagerPgVault",
          operation: "upsertRefreshToken",
          userId,
          storageType: AuthManagerStorageTypeDict.postgres,
        },
        err
      );
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "upsertRefreshToken",
        userId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: err,
      });
    }
  }

  async retrieveUserOfflineTokens(
    userId: string
  ): Promise<AuthManagerVaultEntry[]> {
    try {
      const rows = await this.db.query.AuthVault.findMany({
        where: (f, op) => {
          return op.and(
            op.eq(f.userId, userId),
            op.eq(f.tokenType, AuthManagerTokenTypeDict.Offline)
          );
        },
        orderBy: (f, op) => [op.desc(f.createdAt)],
      });

      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as TAuthManagerTokenType,
        encryptedToken: row.encryptedToken,
        iv: row.iv,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: (row.metadata as Record<string, any>) || undefined,
        status: row.status as OfflineTokenStatus | undefined,
        taskId: row.taskId || undefined,
        ackState: row.ackState || undefined,
        sessionState: row.sessionState || undefined,
      }));
    } catch (err) {
      logger.storage(
        AuthLogEventDict.vaultError,
        {
          component: "AuthManagerPgVault",
          operation: "retrieveUserOfflineTokens",
          userId,
          storageType: AuthManagerStorageTypeDict.postgres,
        },
        err
      );
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "retrieveUserOfflineTokens",
        userId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: err,
      });
    }
  }

  async retrieveBySessionState(
    sessionState: string,
    excludeTokenId: string
  ): Promise<AuthManagerVaultEntry[]> {
    try {
      const rows = await this.db.query.AuthVault.findMany({
        where: (f, op) =>
          op.and(
            op.eq(f.sessionState, sessionState),
            op.ne(f.id, excludeTokenId)
          ),
        orderBy: (f, op) => [op.desc(f.createdAt)],
      });

      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as TAuthManagerTokenType,
        encryptedToken: row.encryptedToken,
        iv: row.iv,
        tokenHash: row.tokenHash || undefined,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: (row.metadata as Record<string, any>) || undefined,
        status: row.status as OfflineTokenStatus | undefined,
        taskId: row.taskId || undefined,
        ackState: row.ackState || undefined,
        sessionState: row.sessionState || undefined,
      }));
    } catch (err) {
      logger.storage(
        AuthLogEventDict.vaultError,
        {
          component: "AuthManagerPgVault",
          operation: "retrieveBySessionState",
          sessionState,
          storageType: AuthManagerStorageTypeDict.postgres,
        },
        err
      );
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "retrieveBySessionState",
        sessionState,
        excludeTokenId,
        storageType: AuthManagerStorageTypeDict.postgres,
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
        AuthLogEventDict.vaultError,
        {
          component: "AuthManagerPgVault",
          operation: "retrieveDuplicateTokenHash",
          storageType: AuthManagerStorageTypeDict.postgres,
        },
        err
      );
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "retrieveDuplicateTokenHash",
        tokenHash,
        excludeTokenId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: err,
      });
    }
  }
}
