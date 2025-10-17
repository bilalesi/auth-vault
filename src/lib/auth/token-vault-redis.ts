import Redis from "ioredis";
import type {
  IStorage,
  TokenVaultEntry,
  VaultTokenType,
} from "./token-vault-interface";
import { encryptToken, decryptToken, generateIV } from "./encryption";
import { generatePersistentTokenId } from "./uuid";
import {
  VaultError,
  VaultErrorCodeDict,
  VaultOperationDict,
  VaultStorageTypeDict,
} from "./vault-errors";
import { getTTLSeconds, isExpired } from "./date-utils";

/**
 * Redis Token Vault Entry (stored in Redis)
 */
interface RedisTokenEntry {
  id: string;
  userId: string;
  tokenType: VaultTokenType;
  encryptedToken: string;
  iv: string;
  createdAt: string; // ISO string
  expiresAt: string; // ISO string
  metadata?: Record<string, any>;
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
      throw new VaultError(VaultErrorCodeDict.storage_error, {
        operation: VaultOperationDict.store,
        userId,
        persistentTokenId: tokenId,
        storageType: VaultStorageTypeDict.redis,
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

      // Decrypt the token
      const decryptedToken = decryptToken(entry.encryptedToken, entry.iv);

      return {
        id: entry.id,
        userId: entry.userId,
        tokenType: entry.tokenType,
        encryptedToken: decryptedToken, // Return decrypted token
        iv: entry.iv,
        createdAt: new Date(entry.createdAt),
        expiresAt: new Date(entry.expiresAt),
        metadata: entry.metadata,
      };
    } catch (error) {
      throw new VaultError(VaultErrorCodeDict.storage_error, {
        operation: VaultOperationDict.retrieve,
        persistentTokenId: tokenId,
        storageType: VaultStorageTypeDict.redis,
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
      throw new VaultError(VaultErrorCodeDict.storage_error, {
        operation: VaultOperationDict.delete,
        persistentTokenId: tokenId,
        storageType: VaultStorageTypeDict.redis,
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
      throw new VaultError(VaultErrorCodeDict.storage_error, {
        operation: VaultOperationDict.get_user_tokens,
        userId,
        storageType: VaultStorageTypeDict.redis,
        originalError: error,
      });
    }
  }
}
