# Database Scripts Summary

Complete database management system with npm scripts, utilities, and documentation.

## 📦 Files Created

### Configuration

- ✅ `drizzle.config.ts` - Drizzle ORM configuration
- ✅ `package.json` - Updated with 15 database scripts

### Scripts

- ✅ `scripts/seed-db.ts` - Database seeding utility
- ✅ `scripts/reset-db.ts` - Database reset utility (with confirmation)
- ✅ `scripts/check-db.ts` - Database status checker

### Documentation

- ✅ `DATABASE_SETUP.md` - Complete setup guide (200+ lines)
- ✅ `DB_COMMANDS_QUICK_REF.md` - Quick reference card

## 🎯 Available Commands

### Core Database Operations (7 commands)

```bash
npm run db:generate    # Generate migrations from schema
npm run db:migrate     # Apply migrations to database
npm run db:push        # Push schema directly (dev only)
npm run db:pull        # Pull schema from database
npm run db:studio      # Open Drizzle Studio GUI
npm run db:drop        # Drop migration
npm run db:check       # Check migration status
npm run db:up          # Apply specific migration
```

### Maintenance Scripts (5 commands)

```bash
npm run db:seed        # Seed database with data
npm run db:reset       # Drop all tables (⚠️ with confirmation)
npm run db:status      # Check database status & stats
npm run db:setup       # Generate + Migrate (combo)
npm run db:fresh       # Reset + Setup + Seed (⚠️ full refresh)
```

## 🚀 Quick Start Guide

### 1. First Time Setup

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL

# Generate encryption key
openssl rand -hex 32
# Add to .env.local as TOKEN_VAULT_ENCRYPTION_KEY

# Setup database
npm run db:setup

# Verify
npm run db:status
```

### 2. Daily Development

```bash
# Make schema changes in src/lib/db/schema.ts

# Generate migration
npm run db:generate

# Apply migration
npm run db:migrate

# Check status
npm run db:status
```

### 3. Quick Iteration (Dev Only)

```bash
# Edit schema
# Push directly (no migration files)
npm run db:push

# View in GUI
npm run db:studio
```

## 📊 Script Details

### `db:generate`

**Purpose:** Generate SQL migration files from TypeScript schema

**Usage:**

```bash
npm run db:generate
```

**Output:**

```
drizzle/migrations/
  └── 0001_initial_schema.sql
```

**When to use:**

- After modifying `src/lib/db/schema.ts`
- Before deploying schema changes
- To create version-controlled migrations

---

### `db:migrate`

**Purpose:** Apply pending migrations to database

**Usage:**

```bash
npm run db:migrate
```

**What it does:**

- Executes SQL files in `drizzle/migrations/`
- Updates migration history
- Creates/modifies tables

**When to use:**

- After generating migrations
- On production deployments
- In CI/CD pipelines

---

### `db:push`

**Purpose:** Push schema changes directly without migrations

**Usage:**

```bash
npm run db:push
```

**⚠️ Warning:** Can cause data loss! Dev only!

**When to use:**

- Rapid prototyping
- Local development
- Quick schema iterations

---

### `db:studio`

**Purpose:** Open Drizzle Studio (visual database browser)

**Usage:**

```bash
npm run db:studio
```

**Features:**

- Browse tables
- Edit data
- Run queries
- View relationships

**Access:** `https://local.drizzle.studio`

---

### `db:status`

**Purpose:** Check database connection and display statistics

**Usage:**

```bash
npm run db:status
```

**Shows:**

- Connection status
- Table list
- Column structure
- Token counts
- Statistics by type/status

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

---

### `db:reset`

**Purpose:** Drop all tables and reset database

**Usage:**

```bash
npm run db:reset
```

**⚠️ Warning:** Deletes ALL data! Requires confirmation.

**Prompts:**

```
⚠️  WARNING: This will delete ALL data from the database!
⚠️  This action cannot be undone!

Are you sure you want to continue? (yes/no):
```

**When to use:**

- Starting fresh
- Cleaning test data
- Fixing corrupted schema

---

### `db:seed`

**Purpose:** Populate database with sample data

**Usage:**

```bash
npm run db:seed
```

**When to use:**

- Setting up dev environment
- Creating test data
- After reset

---

### `db:setup`

**Purpose:** Complete setup (generate + migrate)

**Usage:**

```bash
npm run db:setup
```

**Equivalent to:**

```bash
npm run db:generate && npm run db:migrate
```

**When to use:**

- Initial project setup
- After pulling code with schema changes
- CI/CD pipelines

---

### `db:fresh`

**Purpose:** Complete refresh (reset + setup + seed)

**Usage:**

```bash
npm run db:fresh
```

**Equivalent to:**

```bash
npm run db:reset && npm run db:setup && npm run db:seed
```

**⚠️ Warning:** Deletes ALL data!

**When to use:**

- Complete reset needed
- Clean development environment
- After major schema changes

## 🔧 Configuration

### `drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

**Key settings:**

- `schema`: Location of TypeScript schema
- `out`: Migration files output directory
- `dialect`: Database type (postgresql)
- `verbose`: Show detailed logs
- `strict`: Strict mode for safety

## 📁 Directory Structure

```
project/
├── drizzle/
│   └── migrations/
│       ├── 0001_initial_schema.sql
│       ├── 0002_add_offline_token_status.sql
│       └── meta/
│           ├── _journal.json
│           └── 0001_snapshot.json
├── scripts/
│   ├── seed-db.ts
│   ├── reset-db.ts
│   └── check-db.ts
├── src/
│   └── lib/
│       └── db/
│           ├── schema.ts
│           └── client.ts
├── drizzle.config.ts
├── package.json
├── DATABASE_SETUP.md
└── DB_COMMANDS_QUICK_REF.md
```

## 🎓 Common Workflows

### Workflow 1: Initial Setup

```bash
# 1. Clone repository
git clone <repo>
cd <repo>

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local

# 4. Setup database
npm run db:setup

# 5. Verify
npm run db:status
```

### Workflow 2: Schema Changes

```bash
# 1. Edit schema
vim src/lib/db/schema.ts

# 2. Generate migration
npm run db:generate

# 3. Review migration
cat drizzle/migrations/0003_*.sql

# 4. Apply migration
npm run db:migrate

# 5. Verify
npm run db:status
```

### Workflow 3: Development Iteration

```bash
# Quick changes without migrations
npm run db:push

# View changes
npm run db:studio
```

### Workflow 4: Production Deployment

```bash
# 1. Generate migrations locally
npm run db:generate

# 2. Commit migrations
git add drizzle/migrations/
git commit -m "Add migration"
git push

# 3. On production
git pull
npm run db:migrate
```

### Workflow 5: Troubleshooting

```bash
# Check status
npm run db:status

# View in GUI
npm run db:studio

# Reset if needed
npm run db:fresh
```

## ⚠️ Safety Guidelines

### Development

✅ **Safe to use:**

- `db:generate`
- `db:migrate`
- `db:push`
- `db:studio`
- `db:status`
- `db:seed`
- `db:reset` (with confirmation)
- `db:fresh` (with confirmation)

### Staging

✅ **Safe to use:**

- `db:generate`
- `db:migrate`
- `db:studio`
- `db:status`

❌ **Never use:**

- `db:push`
- `db:reset`
- `db:fresh`

### Production

✅ **Safe to use:**

- `db:migrate`
- `db:status`

❌ **Never use:**

- `db:push`
- `db:reset`
- `db:fresh`
- `db:drop`

## 🐛 Troubleshooting

### Connection Failed

```bash
# Check PostgreSQL is running
pg_isready

# Test connection
psql -U username -d database_name

# Verify DATABASE_URL
echo $DATABASE_URL
```

### Migration Failed

```bash
# Check current status
npm run db:status

# View in GUI
npm run db:studio

# Reset and retry
npm run db:fresh
```

### Schema Conflicts

```bash
# Pull current schema
npm run db:pull

# Compare with local
# Resolve conflicts

# Generate new migration
npm run db:generate
```

## 📚 Documentation

- **Complete Guide:** `DATABASE_SETUP.md`
- **Quick Reference:** `DB_COMMANDS_QUICK_REF.md`
- **This Summary:** `DATABASE_SCRIPTS_SUMMARY.md`

## 🎉 Summary

You now have:

- ✅ 15 npm scripts for database management
- ✅ 3 utility scripts (seed, reset, check)
- ✅ Complete configuration
- ✅ Comprehensive documentation
- ✅ Safety confirmations for destructive operations
- ✅ Status checking and statistics
- ✅ GUI access via Drizzle Studio

**Next Steps:**

1. Run `npm run db:setup` to initialize
2. Run `npm run db:status` to verify
3. Run `npm run db:studio` to explore
4. Read `DATABASE_SETUP.md` for details
