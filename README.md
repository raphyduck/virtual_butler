# Virtual Butler

A web service that lets users define and run AI-powered pipelines — called **Abilities** — each capable of producing a specific, measurable deliverable (code, websites, videos, documents, etc.) and publishing it to a target platform.

Think of it as a personal AI workforce: you define what you want built and where it should go, the Butler does the rest.

## Concept

An **Ability** is a user-defined AI pipeline composed of:

| Field | Description | Example |
|-------|-------------|---------|
| `name` | Human-readable label | `Movies`, `My Blog`, `Code Assistant` |
| `provider` | AI provider | `Anthropic`, `OpenAI`, `Google`, `Ollama` |
| `model` | Specific model | `claude-sonnet-4-6`, `gpt-4o` |
| `deliverable` | Type of output | `video`, `website`, `code`, `document` |
| `target` | Where to publish | `GitHub`, `YouTube`, `S3`, `FTP` |
| `system_prompt` | AI role definition | Custom instructions for the agent |

The user interacts with each Ability through a **chat interface** (similar to Claude Code or ChatGPT Codex). The AI executes the task end-to-end and delivers the output to the configured target.

## Architecture

```
virtual_butler/
├── backend/          # Python / FastAPI
│   ├── app/
│   │   ├── api/      # REST + WebSocket endpoints
│   │   ├── abilities/  # Ability engine & plugin system
│   │   ├── providers/  # AI provider adapters (Anthropic, OpenAI, Google, Ollama)
│   │   ├── targets/    # Publication target adapters (GitHub, S3, YouTube...)
│   │   ├── models/     # SQLAlchemy ORM models
│   │   └── auth/       # JWT authentication
│   └── pyproject.toml
├── frontend/         # Next.js / React
│   ├── app/
│   │   ├── (auth)/   # Login / register pages
│   │   ├── dashboard/ # Abilities overview
│   │   └── ability/[id]/ # Chat interface per Ability
│   └── package.json
├── docs/
│   └── architecture.md
├── docker-compose.yml
└── LICENSE
```

## Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy, PostgreSQL, Redis (task queue)
- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Auth**: JWT (access + refresh tokens)
- **AI Providers**: Anthropic, OpenAI, Google Gemini, Ollama (plugin architecture)
- **Realtime**: WebSockets for streaming AI responses

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
| `ANTHROPIC_API_KEY` | Optional | Anthropic API key (can also be set per-ability) |
| `OPENAI_API_KEY` | Optional | OpenAI API key |
| `GOOGLE_API_KEY` | Optional | Google Gemini API key |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth app credentials (self-modification feature) |

### 3. Start the application

**Development** (hot-reload enabled for backend and frontend):

```bash
docker compose up
```

The `docker-compose.override.yml` file is applied automatically and enables live-reload, exposes the database on port `5432`, and Redis on port `6379`.

**Production** (optimised builds, no volume mounts):

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
