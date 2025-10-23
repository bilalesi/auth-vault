# Alembic Database Migrations

This directory contains database migration scripts for the Auth Manager Service.

## Setup

Alembic is configured to work with async SQLAlchemy and PostgreSQL. The configuration automatically loads the database URL from the `DATABASE_URL` environment variable.

## Common Commands

### View Migration History

```bash
uv run alembic history
```

### Check Current Database Version

```bash
uv run alembic current
```

### Upgrade to Latest Version

```bash
uv run alembic upgrade head
```

### Upgrade to Specific Version

```bash
uv run alembic upgrade <revision>
```

### Downgrade One Version

```bash
uv run alembic downgrade -1
```

### Downgrade to Specific Version

```bash
uv run alembic downgrade <revision>
```

### Create New Migration (Auto-generate)

```bash
uv run alembic revision --autogenerate -m "description of changes"
```

### Create Empty Migration

```bash
uv run alembic revision -m "description of changes"
```

## Environment Variables

Make sure to set the `DATABASE_URL` environment variable before running migrations:

```bash
export DATABASE_URL="postgresql+asyncpg://user:password@localhost:5432/dbname"
```

Or use a `.env` file in the project root.

## Initial Migration

The initial migration (`001_create_auth_vault_table.py`) creates:

- `auth_vault` table with all necessary columns
- `auth_token_type` enum type (offline, refresh)
- Indexes for efficient querying:
  - `auth_vault_user_id_token_type_idx` - composite index on user_id and token_type
  - `auth_vault_session_state_idx` - index on session_state_id
  - `auth_vault_token_hash_idx` - index on token_hash

## Notes

- All migrations run asynchronously using SQLAlchemy's async engine
- The `metadata` column in the database is mapped to `token_metadata` in the Python model to avoid conflicts with SQLAlchemy's reserved names
- Migrations are automatically discovered from the `versions/` directory
