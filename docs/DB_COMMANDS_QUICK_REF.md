# Database Commands Quick Reference

## 🚀 Quick Start

```bash
# Complete setup (first time)
npm run db:setup

# Check status
npm run db:status
```

## 📋 Common Commands

| Command               | Description              | When to Use          |
| --------------------- | ------------------------ | -------------------- |
| `npm run db:generate` | Generate migration files | After schema changes |
| `npm run db:migrate`  | Apply migrations         | Deploy changes       |
| `npm run db:push`     | Push schema directly     | Dev quick iterations |
| `npm run db:studio`   | Open database GUI        | Browse/edit data     |
| `npm run db:status`   | Check database status    | Verify setup         |
| `npm run db:setup`    | Generate + Migrate       | Initial setup        |
| `npm run db:fresh`    | Reset + Setup + Seed     | Clean start          |

## 🔄 Workflows

### Initial Setup

```bash
npm run db:setup
npm run db:status
```

### Schema Change

```bash
# 1. Edit src/lib/db/schema.ts
# 2. Generate migration
npm run db:generate
# 3. Apply migration
npm run db:migrate
# 4. Verify
npm run db:status
```

### Quick Dev Iteration

```bash
npm run db:push
npm run db:studio
```

### Clean Reset

```bash
npm run db:fresh
```

## 🛠️ All Commands

### Core Operations

- `db:generate` - Generate migration from schema
- `db:migrate` - Run pending migrations
- `db:push` - Push schema (no migrations)
- `db:pull` - Pull schema from database
- `db:studio` - Open Drizzle Studio
- `db:drop` - Drop migration
- `db:check` - Check migration status
- `db:up` - Apply specific migration

### Maintenance

- `db:seed` - Seed database with data
- `db:reset` - Drop all tables (⚠️ destructive)
- `db:status` - Show database info
- `db:setup` - Generate + Migrate
- `db:fresh` - Reset + Setup + Seed (⚠️ destructive)

## ⚠️ Warnings

**Destructive Commands:**

- `db:reset` - Deletes ALL data
- `db:fresh` - Deletes ALL data
- `db:push` - Can cause data loss

**Production:**

- ✅ Use: `db:migrate`
- ❌ Never: `db:push`, `db:reset`, `db:fresh`

## 🔍 Troubleshooting

```bash
# Connection issues
npm run db:status

# View in GUI
npm run db:studio

# Reset and start over
npm run db:fresh
```

## 📝 Environment Setup

```env
# .env.local
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
TOKEN_VAULT_ENCRYPTION_KEY=your_64_char_hex_key
TOKEN_VAULT_STORAGE=postgres
```

## 🎯 Pro Tips

1. **Always backup before reset**
2. **Use migrations in production**
3. **Test on staging first**
4. **Check status after changes**
5. **Use studio for debugging**

## 📚 More Info

See `DATABASE_SETUP.md` for detailed documentation.
