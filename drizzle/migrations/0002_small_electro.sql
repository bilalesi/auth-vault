ALTER TABLE "auth_vault" ALTER COLUMN "id" SET DEFAULT '40930b39-5a21-498c-bfe4-ee18f7a85b15';--> statement-breakpoint
ALTER TABLE "auth_vault" ADD COLUMN "token_hash" text;--> statement-breakpoint
CREATE INDEX "auth_vault_token_hash_idx" ON "auth_vault" USING btree ("token_hash");