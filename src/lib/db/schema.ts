import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Token Vault Table
 * Stores encrypted offline tokens for background tasks
 */
export const tokenVault = pgTable(
  "token_vault",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(), // UUID from Keycloak
    tokenType: text("token_type").notNull(), // 'refresh' | 'offline'
    encryptedToken: text("encrypted_token").notNull(),
    iv: text("iv").notNull(), // Initialization vector for decryption
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    userIdIdx: index("token_vault_user_id_idx").on(table.userId),
    expiresAtIdx: index("token_vault_expires_at_idx").on(table.expiresAt),
  })
);

export type TokenVaultRow = typeof tokenVault.$inferSelect;
export type TokenVaultInsert = typeof tokenVault.$inferInsert;
