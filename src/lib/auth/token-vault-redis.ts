import Redis from "ioredis";
import type {
  IStorage,
  TokenVaultEntry,
  VaultTokenType,
} from "./token-vault-interface";
import { encryptToken, decryptToken, generateIV } from "./encryption";
import { generatePersistentTokenId } from "./uuid";
import {
  AuthManagerError,
  AuthManagerErrorCodeDict,
  AuthManagerOperationDict,
  AuthManagerStorageTypeDict,
} from "./vault-errors";
import { getTTLSeconds, isExpired } from "./date-utils";

/**
 * Redis Token Vault Entry (stored in Redis)
 */
interface RedisTokenEntry {
  id: string;
  userId: string;
  tokenType: VaultTokenType;
  encryptedToken: string | null;
  iv: string | null;
  createdAt: string; // ISO string
  expiresAt: string; // ISO string
  metadata?: Record<string, any>;
  status?: string;
  taskId?: string;
  stateToken?: string;
}

/**
 * Redis singleton instance
 */
let redisInstance: Redis | null = null;

/**
 * Get or create Redis connection
 */
function getRedisClient(): Redis {
  if (redisInstance) {
    return redisInstance;
  }

  const host = process.env.REDIS_HOST || "localhost";
  const port = parseInt(process.env.REDIS_PORT || "6379", 10);
  const password = process.env.REDIS_PASSWORD;
  const tls = process.env.REDIS_TLS === "true";

  redisInstance = new Redis({
    host,
    port,
    password,
    tls: tls ? {} : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    lazyConnect: false,
  });

  redisInstance.on("error", (error) => {
    console.error("Redis connection error:", error);
  });

  redisInstance.on("connect", () => {
    console.log("Redis connected successfully");
  });

  return redisInstance;
}

/**
 * Redis implementation of TokenVault using ioredis
 */
export class RedisStorage implements IStorage {
  private redis: Redis;

  constructor() {
    this.redis = getRedisClient();
  }

  /**
   * Get Redis key for a token
   */
  private getTokenKey(tokenId: string): string {
    return `token:${tokenId}`;
  }

  /**
   * Get Redis key for user tokens index
   */
  private getUserTokensKey(userId: string): string {
    return `user:${userId}:tokens`;
  }

  /**
   * Get Redis key for state token index
   */
  private getStateTokenKey(stateToken: string): string {
    return `state:${stateToken}`;
  }

  async store(
    userId: string,
    token: string,
    type: VaultTokenType,
    expiresAt: Date,
    metadata?: Record<string, any>,
    tokenId?: string
  ): Promise<string> {
    try {
      const id = tokenId || generatePersistentTokenId();
      const iv = generateIV();
      const encryptedToken = encryptToken(token, iv);

      const entry: RedisTokenEntry = {
        id,
        userId,
        tokenType: type,
        encryptedToken,
        iv,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        metadata,
      };

      const tokenKey = this.getTokenKey(id);
      const userTokensKey = this.getUserTokensKey(userId);

      // Calculate TTL in seconds
      const ttl = getTTLSeconds(expiresAt);

      // Store token with TTL
      await this.redis.setex(tokenKey, ttl, JSON.stringify(entry));

      // Add token ID to user's token set (with same TTL)
      await this.redis.sadd(userTokensKey, id);
      await this.redis.expire(userTokensKey, ttl);

      return id;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorCodeDict.storage_error, {
        operation: AuthManagerOperationDict.store,
        userId,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async retrieve(tokenId: string): Promise<TokenVaultEntry | null> {
    try {
      const tokenKey = this.getTokenKey(tokenId);
      const data = await this.redis.get(tokenKey);

      if (!data) {
        return null;
      }

      const entry: RedisTokenEntry = JSON.parse(data);

      // Check if token has expired
      const expiresAt = new Date(entry.expiresAt);
      if (isExpired(expiresAt)) {
        await this.delete(tokenId);
        return null;
      }

      // Decrypt the token if it exists
      const decryptedToken =
        entry.encryptedToken && entry.iv
          ? decryptToken(entry.encryptedToken, entry.iv)
          : null;

      return {
        id: entry.id,
        userId: entry.userId,
        tokenType: entry.tokenType,
        encryptedToken: decryptedToken, // Return decrypted token
        iv: entry.iv,
        createdAt: new Date(entry.createdAt),
        expiresAt: new Date(entry.expiresAt),
        metadata: entry.metadata,
        status: entry.status as any,
        taskId: entry.taskId,
        stateToken: entry.stateToken,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorCodeDict.storage_error, {
        operation: AuthManagerOperationDict.retrieve,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async delete(tokenId: string): Promise<void> {
    try {
      const tokenKey = this.getTokenKey(tokenId);

      // Get the entry to find userId
      const data = await this.redis.get(tokenKey);
      if (data) {
        const entry: RedisTokenEntry = JSON.parse(data);
        const userTokensKey = this.getUserTokensKey(entry.userId);

        // Remove from user's token set
        await this.redis.srem(userTokensKey, tokenId);
      }

      // Delete the token
      await this.redis.del(tokenKey);
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorCodeDict.storage_error, {
        operation: AuthManagerOperationDict.delete,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async cleanup(): Promise<number> {
    // Redis automatically handles expiration with TTL
    // This method is a no-op for Redis but kept for interface compatibility
    console.log("Redis cleanup: TTL handles expiration automatically");
    return 0;
  }

  async getUserTokens(userId: string): Promise<TokenVaultEntry[]> {
    try {
      const userTokensKey = this.getUserTokensKey(userId);
      const tokenIds = await this.redis.smembers(userTokensKey);

      if (!tokenIds || tokenIds.length === 0) {
        return [];
      }

      const tokens: TokenVaultEntry[] = [];

      for (const tokenId of tokenIds) {
        const entry = await this.retrieve(tokenId);
        if (entry) {
          tokens.push(entry);
        }
      }

      return tokens;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorCodeDict.storage_error, {
        operation: AuthManagerOperationDict.get_user_tokens,
        userId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async createPendingOfflineToken(
    userId: string,
    taskId: string,
    stateToken: string,
    expiresAt: Date,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const id = generatePersistentTokenId();

      const entry: RedisTokenEntry = {
        id,
        userId,
        tokenType: "offline",
        encryptedToken: null,
        iv: null,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        metadata,
        status: "pending",
        taskId,
        stateToken,
      };

      const tokenKey = this.getTokenKey(id);
      const userTokensKey = this.getUserTokensKey(userId);
      const stateKey = this.getStateTokenKey(stateToken);

      // Calculate TTL in seconds
      const ttl = getTTLSeconds(expiresAt);

      // Store token with TTL
      await this.redis.setex(tokenKey, ttl, JSON.stringify(entry));

      // Add token ID to user's token set
      await this.redis.sadd(userTokensKey, id);
      await this.redis.expire(userTokensKey, ttl);

      // Create state token index pointing to token ID
      await this.redis.setex(stateKey, ttl, id);

      return id;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorCodeDict.storage_error, {
        operation: AuthManagerOperationDict.store,
        userId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async updateOfflineTokenByState(
    stateToken: string,
    token: string | null,
    status: any
  ): Promise<TokenVaultEntry | null> {
    try {
      // Find token ID by state token
      const stateKey = this.getStateTokenKey(stateToken);
      const tokenId = await this.redis.get(stateKey);

      if (!tokenId) {
        return null;
      }

      // Get existing entry
      const tokenKey = this.getTokenKey(tokenId);
      const data = await this.redis.get(tokenKey);

      if (!data) {
        return null;
      }

      const entry: RedisTokenEntry = JSON.parse(data);

      // Encrypt token if provided
      let encryptedToken: string | null = null;
      let iv: string | null = null;

      if (token) {
        iv = generateIV();
        encryptedToken = encryptToken(token, iv);
      }

      // Update entry
      const updatedEntry: RedisTokenEntry = {
        ...entry,
        encryptedToken,
        iv,
        status,
      };

      // Calculate remaining TTL
      const ttl = getTTLSeconds(new Date(entry.expiresAt));

      // Store updated entry
      await this.redis.setex(tokenKey, ttl, JSON.stringify(updatedEntry));

      return {
        id: updatedEntry.id,
        userId: updatedEntry.userId,
        tokenType: updatedEntry.tokenType,
        encryptedToken: token,
        iv: iv || entry.iv,
        createdAt: new Date(updatedEntry.createdAt),
        expiresAt: new Date(updatedEntry.expiresAt),
        metadata: updatedEntry.metadata,
        status: status as any,
        taskId: updatedEntry.taskId,
        stateToken: updatedEntry.stateToken,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorCodeDict.storage_error, {
        operation: AuthManagerOperationDict.store,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async getByStateToken(stateToken: string): Promise<TokenVaultEntry | null> {
    try {
      // Find token ID by state token
      const stateKey = this.getStateTokenKey(stateToken);
      const tokenId = await this.redis.get(stateKey);

      if (!tokenId) {
        return null;
      }

      // Retrieve the token entry
      return await this.retrieve(tokenId);
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorCodeDict.storage_error, {
        operation: AuthManagerOperationDict.retrieve,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async updateStateToken(tokenId: string, stateToken: string): Promise<void> {
    try {
      // Get existing entry
      const tokenKey = this.getTokenKey(tokenId);
      const data = await this.redis.get(tokenKey);

      if (!data) {
        throw new AuthManagerError(AuthManagerErrorCodeDict.token_not_found, {
          persistentTokenId: tokenId,
        });
      }

      const entry: RedisTokenEntry = JSON.parse(data);

      // Update entry with state token
      const updatedEntry: RedisTokenEntry = {
        ...entry,
        stateToken,
      };

      // Calculate remaining TTL
      const ttl = getTTLSeconds(new Date(entry.expiresAt));

      // Store updated entry
      await this.redis.setex(tokenKey, ttl, JSON.stringify(updatedEntry));

      // Create state token index
      const stateKey = this.getStateTokenKey(stateToken);
      await this.redis.setex(stateKey, ttl, tokenId);
    } catch (error) {
      if (AuthManagerError.is(error)) {
        throw error;
      }
      throw new AuthManagerError(AuthManagerErrorCodeDict.storage_error, {
        operation: AuthManagerOperationDict.store,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }
}
