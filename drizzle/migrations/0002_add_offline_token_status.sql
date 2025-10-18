-- Add new columns for offline token status tracking
ALTER TABLE "token_vault" 
  ALTER COLUMN "encrypted_token" DROP NOT NULL,
  ALTER COLUMN "iv" DROP NOT NULL,
  ADD COLUMN "status" TEXT,
  ADD COLUMN "task_id" TEXT,
  ADD COLUMN "state_token" TEXT;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS "token_vault_task_id_idx" ON "token_vault" ("task_id");
CREATE INDEX IF NOT EXISTS "token_vault_state_token_idx" ON "token_vault" ("state_token");

-- Add comments
COMMENT ON COLUMN "token_vault"."status" IS 'Status of offline token: pending, active, or failed';
COMMENT ON COLUMN "token_vault"."task_id" IS 'External task ID associated with this token';
COMMENT ON COLUMN "token_vault"."state_token" IS 'OAuth state token for consent flow tracking';
