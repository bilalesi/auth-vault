# Database Setup Guide

Complete guide for setting up and managing the PostgreSQL database with Drizzle ORM.

## Prerequisites

1. **PostgreSQL** installed and running
2. **Node.js** 18+ installed
3. **Environment variables** configured in `.env.local`

## Environment Variables

Add to `.env.local`:

```env
# PostgreSQL Database
DATABASE_URL=postgresql://username:password@localhost:5433/database_name

# Token Vault Encryption
TOKEN_VAULT_ENCRYPTION_KEY=your_64_character_hex_string

# Redis (optional, for Redis storage)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

# Storage Type
TOKEN_VAULT_STORAGE=postgres  # or 'redis'
```

## Quick Start

### 1. Generate Encryption Key

```bash
openssl rand -hex 32
```

Copy the output to `TOKEN_VAULT_ENCRYPTION_KEY` in `.env.local`

### 2. Create Database

```bash
# Using psql
createdb your_database_name

# Or using SQL
psql -U postgres
CREATE DATABASE your_database_name;
\q
```

### 3. Setup Database

```bash
# Generate migration files from schema
npm run db:generate

# Apply migrations to database
npm run db:migrate

# Or do both at once
npm run db:setup
```

### 4. Verify Setup

```bash
npm run db:check
```

## Available Scripts

### Core Database Operations

#### `npm run db:generate`

Generate migration files from schema changes.

```bash
npm run db:generate
```

**When to use:**

- After modifying `src/lib/db/schema.ts`
- Before applying changes to database
- Creates SQL migration files in `drizzle/migrations/`

**Output:**

```
drizzle/migrations/
  ├── 0001_initial_schema.sql
  ├── 0002_add_offline_token_status.sql
  └── meta/
```

#### `npm run db:migrate`

Apply pending migrations to database.

```bash
npm run db:migrate
```

**When to use:**

- After generating migrations
- To update database schema
- On production deployments

**What it does:**

- Executes SQL migration files
- Updates migration history
- Creates/modifies tables

#### `npm run db:push`

Push schema changes directly without migrations (development only).

```bash
npm run db:push
```

**When to use:**

- Rapid prototyping
- Development environment
- Quick schema iterations

**Warning:** ⚠️ Not recommended for production!

#### `npm run db:pull`

Pull schema from existing database.

```bash
npm run db:pull
```

**When to use:**

- Reverse engineering existing database
- Syncing schema from production
- Creating initial schema from legacy DB

#### `npm run db:studio`

Open Drizzle Studio (database GUI).

```bash
npm run db:studio
```

**Features:**

- Visual database browser
- Run queries
- Edit data
- View relationships
- Access at `https://local.drizzle.studio`

### Maintenance Scripts

#### `npm run db:check`

Check database status and display information.

```bash
npm run db:check
```

**Shows:**

- Connection status
- Existing tables
- Column structure
- Token statistics
- Row counts

**Example output:**

```
🔍 Checking database status...

✅ Database connection successful!

📊 Found 1 table(s):
   - token_vault

📋 Token Vault table structure:
   - id: uuid NOT NULL
   - user_id: uuid NOT NULL
   - token_type: text NOT NULL
   - encrypted_token: text NULL
   - iv: text NULL
   - status: text NULL
   - task_id: text NULL
   - state_token: text NULL

📊 Total tokens in vault: 5

📈 Token statistics:
   - refresh (N/A): 3
   - offline (pending): 1
   - offline (active): 1
```

#### `npm run db:seed`

Seed database with sample data.

```bash
npm run db:seed
```

**When to use:**

- Setting up development environment
- Creating test data
- Populating empty database

#### `npm run db:reset`

Drop all tables and reset database.

```bash
npm run db:reset
```

**Warning:** ⚠️ This deletes ALL data!

**Prompts for confirmation:**

```
⚠️  WARNING: This will delete ALL data from the database!
⚠️  This action cannot be undone!

Are you sure you want to continue? (yes/no):
```

**When to use:**

- Starting fresh
- Cleaning test data
- Fixing corrupted schema

### Composite Scripts

#### `npm run db:setup`

Generate migrations and apply them.

```bash
npm run db:setup
```

**Equivalent to:**

```bash
npm run db:generate && npm run db:migrate
```

**When to use:**

- Initial setup
- After pulling code with schema changes
- CI/CD pipelines

#### `npm run db:fresh`

Complete database refresh with seeding.

```bash
npm run db:fresh
```

**Equivalent to:**

```bash
npm run db:reset && npm run db:setup && npm run db:seed
```

**When to use:**

- Complete reset needed
- Setting up clean development environment
- After major schema changes

## Common Workflows

### Initial Setup (New Project)

```bash
# 1. Create database
createdb auth_vault_db

# 2. Configure .env.local
echo "DATABASE_URL=postgresql://user:pass@localhost:5432/auth_vault_db" >> .env.local

# 3. Generate encryption key
openssl rand -hex 32

# 4. Setup database
npm run db:setup

# 5. Verify
npm run db:check
```

### Schema Changes (Development)

```bash
# 1. Modify src/lib/db/schema.ts
# 2. Generate migration
npm run db:generate

# 3. Review migration file in drizzle/migrations/

# 4. Apply migration
npm run db:migrate

# 5. Verify changes
npm run db:check
```

### Quick Iteration (Development)

```bash
# Modify schema and push directly (no migrations)
npm run db:push

# Check changes
npm run db:studio
```

### Production Deployment

```bash
# 1. Generate migrations locally
npm run db:generate

# 2. Commit migration files
git add drizzle/migrations/
git commit -m "Add migration for offline token status"

# 3. On production server
git pull
npm run db:migrate
```

### Troubleshooting

```bash
# Check database status
npm run db:check

# View in GUI
npm run db:studio

# Reset if needed
npm run db:reset
npm run db:setup
```

## Migration Files

### Location

```
drizzle/migrations/
  ├── 0001_initial_schema.sql
  ├── 0002_add_offline_token_status.sql
  └── meta/
      ├── _journal.json
      └── 0001_snapshot.json
```

### Manual Migration

Create `drizzle/migrations/0003_custom.sql`:

```sql
-- Custom migration
ALTER TABLE token_vault ADD COLUMN custom_field TEXT;
```

Then run:

```bash
npm run db:migrate
```

## Database Schema

### Current Schema (v0.2)

```sql
CREATE TABLE token_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_type TEXT NOT NULL,
  encrypted_token TEXT,
  iv TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  metadata JSONB,
  status TEXT,
  task_id TEXT,
  state_token TEXT
);

CREATE INDEX token_vault_user_id_idx ON token_vault(user_id);
CREATE INDEX token_vault_expires_at_idx ON token_vault(expires_at);
CREATE INDEX token_vault_task_id_idx ON token_vault(task_id);
CREATE INDEX token_vault_state_token_idx ON token_vault(state_token);
```

## Drizzle Studio

### Start Studio

```bash
npm run db:studio
```

### Features

- **Browse Tables**: View all tables and data
- **Run Queries**: Execute SQL queries
- **Edit Data**: Modify records directly
- **View Relationships**: See foreign keys
- **Export Data**: Download as CSV/JSON

### Access

Open browser to: `https://local.drizzle.studio`

## Backup & Restore

### Backup Database

```bash
# Full backup
pg_dump -U username database_name > backup.sql

# Schema only
pg_dump -U username --schema-only database_name > schema.sql

# Data only
pg_dump -U username --data-only database_name > data.sql
```

### Restore Database

```bash
# Restore full backup
psql -U username database_name < backup.sql

# Restore schema
psql -U username database_name < schema.sql

# Restore data
psql -U username database_name < data.sql
```

## Environment-Specific Setup

### Development

```bash
# Use local PostgreSQL
DATABASE_URL=postgresql://localhost:5432/auth_vault_dev

# Quick iterations
npm run db:push
```

### Staging

```bash
# Use staging database
DATABASE_URL=postgresql://staging-host:5432/auth_vault_staging

# Use migrations
npm run db:migrate
```

### Production

```bash
# Use production database
DATABASE_URL=postgresql://prod-host:5432/auth_vault_prod

# Always use migrations
npm run db:migrate

# Never use db:push or db:reset!
```

## Troubleshooting

### Connection Issues

```bash
# Check if PostgreSQL is running
pg_isready

# Test connection
psql -U username -d database_name -c "SELECT 1"

# Check DATABASE_URL
echo $DATABASE_URL
```

### Migration Issues

```bash
# Check migration status
npm run db:check

# View migration history
psql -U username database_name -c "SELECT * FROM drizzle_migrations"

# Rollback last migration (manual)
# Edit migration file and run db:migrate
```

### Schema Conflicts

```bash
# Pull current schema from database
npm run db:pull

# Compare with local schema
# Resolve conflicts manually

# Generate new migration
npm run db:generate
```

## Best Practices

1. **Always use migrations in production**
2. **Test migrations on staging first**
3. **Backup before major changes**
4. **Version control migration files**
5. **Use db:push only in development**
6. **Run db:check after changes**
7. **Document custom migrations**
8. **Keep .env.local secure**

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Database Migration

on:
  push:
    branches: [main]

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run db:migrate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Additional Resources

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Drizzle Kit CLI](https://orm.drizzle.team/kit-docs/overview)
