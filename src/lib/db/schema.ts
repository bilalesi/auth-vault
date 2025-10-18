import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

export const TokenStatusEnum = pgEnum("auth_token_status", [
  "pending",
  "active",
  "failed",
  "none",
]);

export const TokenStatusValues = TokenStatusEnum.enumValues;
export type TTokenStatusValues = (typeof TokenStatusValues)[number];

export const TokenTypeEnum = pgEnum("auth_token_type", ["offline", "refresh"]);
export const TokenTypeEnumValues = TokenTypeEnum.enumValues;
export type TTokenTypeEnumValues = (typeof TokenTypeEnumValues)[number];

export const tokenVault = pgTable(
  "token_vault",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(), // UUID from Keycloak
    tokenType: TokenTypeEnum().notNull(),
    encryptedToken: text("encrypted_token"), // Nullable for pending offline tokens
    iv: text("iv"), // Nullable for pending offline tokens
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    metadata: jsonb("metadata"),
    status: TokenStatusEnum().default("none"),
    taskId: text("task_id"),
    stateToken: text("state_token"),
  },
  (table) => [
    index("token_vault_user_id_idx").on(table.userId),
    index("token_vault_expires_at_idx").on(table.expiresAt),
    index("token_vault_task_id_idx").on(table.taskId),
    index("token_vault_state_token_idx").on(table.stateToken),
  ]
);

export type TokenVaultRow = typeof tokenVault.$inferSelect;
export type TokenVaultInsert = typeof tokenVault.$inferInsert;
