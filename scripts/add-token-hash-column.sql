-- Migration: Add token_hash column to auth_vault table
-- This column stores SHA-256 hash of offline tokens for deduplication

-- Add the token_hash column
ALTER TABLE auth_vault 
ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Create an index on token_hash for faster lookups
CREATE INDEX IF NOT EXISTS auth_vault_token_hash_idx ON auth_vault(token_hash);

-- Add a comment to the column
COMMENT ON COLUMN auth_vault.token_hash IS 'SHA-256 hash of the decrypted token for deduplication and comparison';

-- Display the updated schema
\d auth_vault;
