# Virtual Butler

A **minimal, auto-extensible AI platform** with a Butler chat interface, installable Skills, and Docker-based auto-updates.

## Core Platform

The core is intentionally small — it does only three things:

1. **Chat Butler** — Web chat interface powered by LLM (Anthropic, OpenAI, Google, Ollama)
2. **Skill Management** — Install, enable, disable extension skills
3. **Auto-Update** — Docker image-based updates via GitHub Actions

Everything else is implemented as **Skills** — installable extensions.

## Concept

A **Skill** is a user-defined AI pipeline composed of:

| Field | Description | Example |
|-------|-------------|---------|
| `name` | Human-readable label | `Movies`, `My Blog`, `Code Assistant` |
| `provider` | AI provider | `Anthropic`, `OpenAI`, `Google`, `Ollama` |
| `model` | Specific model | `claude-sonnet-4-6`, `gpt-4o` |
| `deliverable` | Type of output | `video`, `website`, `code`, `document` |
| `target` | Where to publish | `GitHub`, `YouTube`, `S3`, `FTP` |
| `system_prompt` | AI role definition | Custom instructions for the agent |

## Architecture

```
virtual_butler/
├── backend/              # Python / FastAPI
│   ├── app/
│   │   ├── api/          # REST + WebSocket endpoints
│   │   ├── skills/       # Skill engine, butler handler, code modifier
│   │   ├── providers/    # AI provider adapters
│   │   ├── models/       # SQLAlchemy ORM models
│   │   └── auth/         # JWT authentication
│   └── pyproject.toml
├── frontend/             # Next.js / React
│   ├── src/app/
│   │   ├── (app)/dashboard/    # Skills overview
│   │   ├── (app)/skill-store/  # Install extension skills
│   │   └── (app)/settings/     # Platform settings
│   └── package.json
├── skills/               # Installable extension skills
│   └── dentist_booking/  # Example skill
│       ├── manifest.json
│       └── runtime.py
├── .github/workflows/
│   ├── ci.yml            # Lint + test
│   └── build-images.yml  # Build & push Docker images on release
├── docker-compose.yml          # Development
├── docker-compose.prod.yml     # Production (pre-built images)
└── docker-compose.override.yml # Dev hot-reload
```

## Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy, PostgreSQL, Redis
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Auth**: JWT (access + refresh tokens)
- **AI Providers**: Anthropic, OpenAI, Google Gemini, Ollama
- **Realtime**: WebSockets for streaming AI responses
- **Deploy**: Docker + GitHub Actions (GHCR)

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) >= 24
- [Docker Compose](https://docs.docker.com/compose/install/) >= 2.20 (bundled with Docker Desktop)
- Git

### 1. Clone the repository

```bash
git clone https://github.com/raphyduck/virtual_butler.git
cd virtual_butler
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | Yes | Password for the PostgreSQL `butler` user |
| `SECRET_KEY` | Yes | Long random string for JWT signing — generate with `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | Optional | Anthropic API key (can also be set per-skill) |
| `OPENAI_API_KEY` | Optional | OpenAI API key |
| `GOOGLE_API_KEY` | Optional | Google Gemini API key |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth app credentials (self-modification feature) |

### 3. Start the application

**Development** (hot-reload enabled for backend and frontend):

```bash
docker compose up
```

The `docker-compose.override.yml` file is applied automatically and enables live-reload, exposes the database on port `5432`, and Redis on port `6379`.

**Production** (pre-built images from GHCR):

```bash
APP_VERSION=v1.0.0 docker compose -f docker-compose.prod.yml up -d
```

**Production** (local build, no volume mounts):

```bash
docker compose -f docker-compose.yml up -d
```

### 4. Access the application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |

> Default ports can be overridden via `FRONTEND_PORT` and `BACKEND_PORT` in `.env`.

### Useful commands

```bash
# View logs for a specific service
docker compose logs -f backend
docker compose logs -f frontend

# Stop all services
docker compose down

# Rebuild images after dependency changes
docker compose build

# Run database migrations manually
docker compose exec backend alembic upgrade head

# Run backend tests
docker compose exec backend pytest
```

## License

[AGPL-3.0](./LICENSE) — Any hosted version of this software must remain open-source.
