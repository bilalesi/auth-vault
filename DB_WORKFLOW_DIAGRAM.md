# Database Workflow Diagrams

Visual guides for common database workflows.

## 🚀 Initial Setup Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    INITIAL SETUP                             │
└─────────────────────────────────────────────────────────────┘

1. Install Dependencies
   npm install
   │
   ├─ Installs Drizzle ORM
   ├─ Installs Drizzle Kit
   └─ Installs PostgreSQL driver
   │
   ▼

2. Configure Environment
   Edit .env.local
   │
   ├─ DATABASE_URL=postgresql://...
   ├─ TOKEN_VAULT_ENCRYPTION_KEY=...
   └─ TOKEN_VAULT_STORAGE=postgres
   │
   ▼

3. Setup Database
   npm run db:setup
   │
   ├─ npm run db:generate
   │  └─ Creates drizzle/migrations/*.sql
   │
   └─ npm run db:migrate
      └─ Executes SQL on database
   │
   ▼

4. Verify Setup
   npm run db:status
   │
   └─ Shows tables, columns, statistics
   │
   ▼

✅ Ready to use!
```

## 🔄 Schema Change Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  SCHEMA CHANGE WORKFLOW                      │
└─────────────────────────────────────────────────────────────┘

1. Edit Schema
   src/lib/db/schema.ts
   │
   ├─ Add new column
   ├─ Modify existing column
   └─ Add new table
   │
   ▼

2. Generate Migration
   npm run db:generate
   │
   └─ Creates: drizzle/migrations/0003_add_column.sql
   │
   ▼

3. Review Migration
   cat drizzle/migrations/0003_*.sql
   │
   ├─ Check SQL syntax
   ├─ Verify changes
   └─ Ensure no data loss
   │
   ▼

4. Apply Migration
   npm run db:migrate
   │
   ├─ Executes SQL
   ├─ Updates schema
   └─ Records in migration history
   │
   ▼

5. Verify Changes
   npm run db:status
   │
   └─ Confirms new structure
   │
   ▼

✅ Schema updated!
```

## ⚡ Quick Development Flow

```
┌─────────────────────────────────────────────────────────────┐
│              QUICK DEVELOPMENT ITERATION                     │
└─────────────────────────────────────────────────────────────┘

1. Edit Schema
   src/lib/db/schema.ts
   │
   ▼

2. Push Directly
   npm run db:push
   │
   ├─ No migration files
   ├─ Direct schema update
   └─ ⚠️ Can cause data loss
   │
   ▼

3. View Changes
   npm run db:studio
   │
   └─ Opens GUI at https://local.drizzle.studio
   │
   ▼

4. Test Changes
   Run application
   │
   ▼

5. Iterate
   Repeat steps 1-4
   │
   ▼

⚠️ Dev only! Use migrations for production
```

## 🔄 Reset & Refresh Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  RESET & REFRESH WORKFLOW                    │
└─────────────────────────────────────────────────────────────┘

Option 1: Full Reset
npm run db:fresh
│
├─ npm run db:reset
│  ├─ Prompts for confirmation
│  └─ Drops all tables
│
├─ npm run db:setup
│  ├─ Generates migrations
│  └─ Applies migrations
│
└─ npm run db:seed
   └─ Populates with sample data
│
▼
✅ Clean database with data


Option 2: Partial Reset
npm run db:reset
│
└─ Drops all tables
│
▼
npm run db:setup
│
└─ Recreates schema
│
▼
✅ Clean empty database
```

## 🚢 Production Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│                PRODUCTION DEPLOYMENT                         │
└─────────────────────────────────────────────────────────────┘

LOCAL MACHINE:
1. Make schema changes
   src/lib/db/schema.ts
   │
   ▼

2. Generate migration
   npm run db:generate
   │
   └─ Creates migration file
   │
   ▼

3. Test locally
   npm run db:migrate
   npm run db:status
   │
   ▼

4. Commit & Push
   git add drizzle/migrations/
   git commit -m "Add migration"
   git push
   │
   ▼

PRODUCTION SERVER:
5. Pull changes
   git pull
   │
   ▼

6. Apply migration
   npm run db:migrate
   │
   ├─ Executes SQL
   └─ Updates production schema
   │
   ▼

7. Verify
   npm run db:status
   │
   ▼

✅ Production updated!
```

## 🐛 Troubleshooting Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  TROUBLESHOOTING WORKFLOW                    │
└─────────────────────────────────────────────────────────────┘

Problem: Database not working
│
▼

1. Check Status
   npm run db:status
   │
   ├─ Connection OK? ──────┐
   │                       │
   NO                     YES
   │                       │
   ▼                       ▼
   Check PostgreSQL    2. Check Tables
   - Is it running?       │
   - Correct URL?         ├─ Tables exist? ────┐
   - Firewall?            │                    │
   │                     NO                   YES
   │                      │                    │
   │                      ▼                    ▼
   │                  Run db:setup        3. Check Data
   │                      │                   │
   │                      ▼                   ├─ Data correct? ──┐
   │                  Tables created          │                  │
   │                                         NO                 YES
   │                                          │                  │
   │                                          ▼                  ▼
   └──────────────────────────────────> Run db:fresh      ✅ All good!
                                             │
                                             ▼
                                        Fresh start
```

## 📊 Command Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│              WHICH COMMAND SHOULD I USE?                     │
└─────────────────────────────────────────────────────────────┘

What do you want to do?
│
├─ First time setup?
│  └─> npm run db:setup
│
├─ Changed schema?
│  │
│  ├─ Production/Staging?
│  │  └─> npm run db:generate
│  │      npm run db:migrate
│  │
│  └─ Development?
│     └─> npm run db:push (quick)
│          OR
│          npm run db:generate + db:migrate (proper)
│
├─ Check database?
│  └─> npm run db:status
│
├─ Browse/edit data?
│  └─> npm run db:studio
│
├─ Add sample data?
│  └─> npm run db:seed
│
├─ Start fresh?
│  └─> npm run db:fresh
│
└─ Something broken?
   └─> npm run db:status (diagnose)
       npm run db:studio (inspect)
       npm run db:fresh (reset)
```

## 🎯 Environment-Specific Workflows

```
┌─────────────────────────────────────────────────────────────┐
│                  DEVELOPMENT WORKFLOW                        │
└─────────────────────────────────────────────────────────────┘

Edit Schema → db:push → Test → Repeat
                │
                └─> db:studio (view changes)

✅ Fast iteration
⚠️ No migration history


┌─────────────────────────────────────────────────────────────┐
│                   STAGING WORKFLOW                           │
└─────────────────────────────────────────────────────────────┘

Edit Schema → db:generate → Review → db:migrate → Test
                                        │
                                        └─> db:status (verify)

✅ Proper migrations
✅ Version controlled
✅ Reversible


┌─────────────────────────────────────────────────────────────┐
│                 PRODUCTION WORKFLOW                          │
└─────────────────────────────────────────────────────────────┘

Test on Staging → Commit Migrations → Deploy → db:migrate
                                                   │
                                                   └─> db:status (verify)

✅ Tested migrations
✅ Minimal downtime
✅ Rollback possible
```

## 📈 Migration Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                  MIGRATION LIFECYCLE                         │
└─────────────────────────────────────────────────────────────┘

Schema Change
    │
    ▼
┌─────────────────┐
│  db:generate    │ Creates migration file
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Review SQL      │ Check migration content
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  db:migrate     │ Apply to database
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Migration Table │ Records in drizzle_migrations
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  db:status      │ Verify changes
└────────┬────────┘
         │
         ▼
    ✅ Complete
```

## 🔐 Safety Checklist

```
┌─────────────────────────────────────────────────────────────┐
│                    SAFETY CHECKLIST                          │
└─────────────────────────────────────────────────────────────┘

Before db:migrate in production:
☐ Tested on staging
☐ Reviewed SQL
☐ Backup created
☐ Rollback plan ready
☐ Off-peak hours
☐ Team notified

Before db:reset:
☐ Confirmed environment (not production!)
☐ Backup created (if needed)
☐ Team notified
☐ Ready to rebuild

Before db:push:
☐ Development environment only
☐ No important data
☐ Can afford data loss
```

## 📝 Quick Reference

```
┌──────────────────────────────────────────────────────────┐
│                  COMMAND CHEAT SHEET                      │
├──────────────────────────────────────────────────────────┤
│ Setup        │ npm run db:setup                          │
│ Status       │ npm run db:status                         │
│ GUI          │ npm run db:studio                         │
│ Generate     │ npm run db:generate                       │
│ Migrate      │ npm run db:migrate                        │
│ Push (dev)   │ npm run db:push                           │
│ Reset        │ npm run db:fresh                          │
└──────────────────────────────────────────────────────────┘
```
