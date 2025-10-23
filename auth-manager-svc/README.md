# Auth Manager Service

FastAPI microservice for managing Keycloak OAuth tokens, including refresh tokens, offline tokens, and access token generation.

## Features

- **Token Vault**: Secure storage for encrypted refresh and offline tokens
- **Access Token Generation**: Generate fresh access tokens using stored refresh/offline tokens
- **Token Validation**: Validate access tokens via Keycloak introspection
- **Offline Token Management**: Request, store, and revoke long-lived offline tokens
- **Session Management**: Track and manage Keycloak sessions
- **AES-256-CBC Encryption**: All tokens encrypted at rest
- **Async/Await**: Full async support for high performance

## Technology Stack

- **FastAPI** 0.119.1 - Modern async web framework
- **Python** 3.12+ - Latest Python features
- **SQLAlchemy** 2.0 - Async ORM for PostgreSQL
- **Pydantic** v2 - Data validation and settings
- **UV** - Fast Python package manager
- **PostgreSQL** 18 - Token vault database
- **Keycloak** - OAuth2/OIDC provider

## Project Structure

```
auth-manager-svc/
├── app/
│   ├── api/              # API routes
│   ├── core/             # Core utilities
│   ├── db/               # Database models and repositories
│   ├── middleware/       # Custom middleware
│   ├── models/           # Pydantic models
│   └── services/         # Business logic
├── alembic/              # Database migrations
├── tests/                # Test suite
├── pyproject.toml        # Project dependencies
└── .env.example          # Environment variables template
```

## Setup

### Prerequisites

- Python 3.12+
- PostgreSQL 18
- Keycloak instance
- UV package manager

### Installation

1. Install UV (if not already installed):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

2. Clone the repository and navigate to the service directory:

```bash
cd auth-manager-svc
```

3. Create a virtual environment and install dependencies:

```bash
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -e ".[dev]"
```

4. Copy the environment template and configure:

```bash
cp .env.example .env
# Edit .env with your configuration
```

5. Run database migrations:

```bash
alembic upgrade head
```

### Running the Service

Development mode with auto-reload:

```bash
uvicorn app.main:app --reload --port 8000
```

Production mode:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Documentation

Once running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## Environment Variables

See `.env.example` for all required environment variables. Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `KEYCLOAK_*` - Keycloak configuration
- `AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY` - 64-char hex encryption key
- `LOG_LEVEL` - Logging level (DEBUG, INFO, WARNING, ERROR)

## Testing

Run the test suite:

```bash
pytest
```

With coverage:

```bash
pytest --cov=app --cov-report=html
```

## Development

### Code Formatting

```bash
ruff format .
```

### Linting

```bash
ruff check .
```

## Docker

Build the image:

```bash
docker build -t auth-manager-svc .
```

Run with docker-compose:

```bash
docker-compose up
```

## License

MIT
