# Virtual Butler — Architecture

## Overview

Virtual Butler is a full-stack web service that lets users define and run
AI-powered pipelines called **Abilities**. Each Ability targets a specific AI
provider and model, executes through a real-time chat interface, and can
publish its output (code, websites, documents…) to a configured target.

```
User ──► chat (WebSocket) ──► AbilitySessionHandler ──► AI Provider (Anthropic / OpenAI / …)
                                       │
                              PostgreSQL database
                         (users, abilities, sessions, messages, deliverables)
```

---

## 1. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend framework | FastAPI + Uvicorn | 0.115 / 0.30 |
| Database | PostgreSQL + asyncpg | 16 / 0.29 |
| ORM + migrations | SQLAlchemy (async) + Alembic | 2.0 / 1.13 |
| Auth | python-jose + bcrypt | 3.3 / 4.0 |
| AI providers | Anthropic SDK | 0.28 |
| | OpenAI SDK | 1.35 |
| | Google Generative AI | 0.7 |
| | Ollama (local) | — |
| Validation | Pydantic v2 + Pydantic Settings | 2.7 / 2.3 |
| Cache / queue | Redis 7 | — |
| Frontend framework | Next.js (App Router) | 14.2 |
| UI library | React | 18.3 |
| Styling | Tailwind CSS | 3.4 |
| State management | Zustand | 4.5 |
| Language | TypeScript | 5.4 |
| Container | Docker Compose | — |
| CI | GitHub Actions | — |
| Linting / format | Ruff | — |
| Testing | pytest + aiosqlite | — |

---

## 2. Repository Structure

```
virtual_butler/
├── .github/
│   └── workflows/ci.yml          # CI pipeline
├── backend/
│   ├── alembic/                  # DB migration scripts
│   │   └── versions/
│   │       ├── 0001_init.py
│   │       └── 0002_ability_provider_config.py
│   ├── app/
│   │   ├── abilities/
│   │   │   └── session_handler.py  # Orchestrates AI execution
│   │   ├── api/
│   │   │   ├── auth.py             # Auth routes
│   │   │   ├── abilities.py        # Ability + session CRUD routes
│   │   │   └── ws.py               # WebSocket endpoint
│   │   ├── auth/
│   │   │   ├── dependencies.py     # FastAPI Depends helpers
│   │   │   ├── jwt.py              # Token generation / validation
│   │   │   └── password.py         # bcrypt helpers
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   ├── providers/              # AI provider plugin system
│   │   ├── schemas/                # Pydantic request / response models
│   │   ├── config.py               # Pydantic Settings
│   │   ├── database.py             # Async engine + session factory
│   │   └── main.py                 # FastAPI app + router registration
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── app/                    # Next.js App Router pages
│   │   │   ├── (auth)/             # Login / register (public)
│   │   │   └── (app)/              # Dashboard + chat (protected)
│   │   ├── components/             # React components
│   │   ├── lib/                    # API client, WS client, auth helpers
│   │   └── store/                  # Zustand stores
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml
├── docker-compose.override.yml     # Dev overrides (bind mounts, hot-reload)
└── .env.example
```

---

## 3. Database Schema

### Entity-Relationship Diagram

```
users
  │ id (UUID, PK)
  │ email (unique, indexed)
  │ hashed_password
  │ created_at / updated_at
  │
  ├─< abilities
  │     id (UUID, PK)
  │     user_id        FK → users       CASCADE
  │     name / description
  │     provider / model
  │     system_prompt
  │     deliverable_type / target_type / target_config (JSON text)
  │     provider_config (JSON text — per-ability API key override)
  │     created_at / updated_at
  │
  └─< sessions
        id (UUID, PK)
        ability_id     FK → abilities   CASCADE
        user_id        FK → users       CASCADE
        status  (idle | running | completed | failed)
        created_at / completed_at

        ├─< messages
        │     id (UUID, PK)
        │     session_id   FK → sessions  CASCADE
        │     role  (user | assistant | tool)
        │     content (Text)
        │     created_at

        └── deliverables  (0 or 1 per session — unique constraint)
              id (UUID, PK)
              session_id   FK → sessions  CASCADE  UNIQUE
              deliverable_type
              url (nullable)
              metadata_json (nullable)
              created_at
```

### Migrations

| File | Description |
|------|-------------|
| `0001_init.py` | Full initial schema: all five tables + indexes |
| `0002_ability_provider_config.py` | Adds `provider_config` column to `abilities` |

---

## 4. Authentication

### JWT Token Pair

```
POST /api/v1/auth/login  →  { access_token, refresh_token }
```

| Token | Lifetime | Payload |
|-------|---------|---------|
| Access | 30 min (configurable) | `{ sub, kind: "access", jti, iat, exp }` |
| Refresh | 7 days (configurable) | `{ sub, kind: "refresh", jti, iat, exp }` |

Algorithm: **HS256**. Secret key set by `SECRET_KEY` env variable.

### Auth Flow

```
1. POST /auth/register  →  bcrypt(password) stored, UserOut returned
2. POST /auth/login     →  password verified, token pair returned
3. POST /auth/refresh   →  refresh token verified, new pair returned
4. GET  /auth/me        →  Authorization: Bearer <access_token>  →  UserOut
```

### Dependency Injection

All protected endpoints declare `current_user: User = Depends(get_current_user)`.
`get_current_user()` extracts the Bearer token from the `Authorization` header,
verifies it with `python-jose`, and loads the user from the database.

For WebSocket connections (which cannot carry custom headers), the token is
passed as a query parameter: `?token=<access_token>`. The WS handler validates
it before accepting the connection (close code `4001` on failure).

---

## 5. API Endpoints

### Auth  (`/api/v1/auth`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/register` | — | Register new user |
| POST | `/login` | — | Login → token pair |
| POST | `/refresh` | — | Refresh access token |
| GET | `/me` | Bearer | Current user profile |

### Abilities  (`/api/v1/abilities`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `` | Bearer | List user's abilities |
| POST | `` | Bearer | Create ability |
| GET | `/{ability_id}` | Bearer | Get ability |
| PUT | `/{ability_id}` | Bearer | Update ability |
| DELETE | `/{ability_id}` | Bearer | Delete ability |
| GET | `/{ability_id}/sessions` | Bearer | List sessions |
| POST | `/{ability_id}/sessions` | Bearer | Create session |

### Real-time

| Type | Path | Auth | Purpose |
|------|------|------|---------|
| WebSocket | `/ws/session/{session_id}` | `?token=` | Streaming chat |
| GET | `/health` | — | Health check |

---

## 6. WebSocket Streaming Protocol

### Connection Handshake

```
Client  →  GET /ws/session/{id}?token=<jwt>
Server  ←  101 Switching Protocols   (or close 4001 if token invalid)
```

### Message Format

**Client → Server**
```json
{ "content": "user message text" }
```

**Server → Client** (streamed line by line)
```json
{ "type": "chunk", "content": "<text fragment>" }
{ "type": "chunk", "content": "<more text>" }
{ "type": "done" }
```

**On error**
```json
{ "type": "error", "detail": "Session <id> not found" }
```

### Execution Flow

```
Client sends {content}
  │
  ▼
ws.py  ──► AbilitySessionHandler.handle(session_id, user_id, user_message)
             │
             ├─ 1. Load session + ability from DB (ownership check)
             ├─ 2. Persist user message  (role="user")
             ├─ 3. Set session.status = "running"
             ├─ 4. Load full message history (user + assistant only)
             ├─ 5. Instantiate provider via ProviderFactory
             ├─ 6. Stream response → yield each chunk to WebSocket
             ├─ 7. Persist full assistant reply (role="assistant")
             └─ 8. Set session.status = "idle"
```

---

## 7. AI Provider Plugin System

### Base Interface

```python
class BaseProvider(ABC):
    def __init__(self, config: ProviderConfig): ...

    async def stream(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]: ...

    async def complete(
        self,
        messages: list[ChatMessage],
        system_prompt: str | None = None,
    ) -> str: ...
```

### ProviderConfig

```python
@dataclass
class ProviderConfig:
    model: str
    api_key: str | None = None
    base_url: str | None = None       # Ollama: "http://localhost:11434"
    extra: dict[str, Any] = field(default_factory=dict)
```

### Supported Providers

| Provider | Class | API key env | Notes |
|----------|-------|-------------|-------|
| Anthropic | `AnthropicProvider` | `ANTHROPIC_API_KEY` | Uses `AsyncAnthropic` streaming; default max_tokens 8096 |
| OpenAI | `OpenAIProvider` | `OPENAI_API_KEY` | Chat completions API |
| Google | `GoogleProvider` | `GOOGLE_API_KEY` | Generative AI SDK |
| Ollama | `OllamaProvider` | — | Local inference via `base_url` |

### API Key Resolution (precedence)

```
1. per-ability provider_config JSON  (highest — enables multi-tenant use)
2. environment variable
3. none (raises error at call time)
```

To add a new provider: subclass `BaseProvider`, implement `stream()` and
`complete()`, then register the class name in `ProviderFactory.get_provider()`.

---

## 8. Frontend Architecture

### Routing (Next.js App Router)

```
/                          →  redirect to /dashboard or /login
/(auth)/login              →  public
/(auth)/register           →  public
/(app)/dashboard           →  list abilities  (protected)
/(app)/abilities/new       →  create ability form  (protected)
/(app)/abilities/[id]      →  edit ability config  (protected)
/(app)/sessions/[id]       →  real-time chat  (protected)
```

The `/(app)/layout.tsx` guards all inner routes: it checks `useAuthStore`
and redirects unauthenticated users to `/login`.

### Auth State (Zustand)

```typescript
interface AuthState {
  token: string | null
  isAuthenticated: boolean
  login(token: string): void   // stores in localStorage
  logout(): void               // clears localStorage
  init(): void                 // rehydrate from localStorage on mount
}
```

Token expiry is checked client-side by decoding the JWT payload (`exp` claim)
in `lib/auth.ts:isTokenValid()`.

### Key Libraries

| File | Purpose |
|------|---------|
| `lib/api.ts` | Typed fetch wrapper; auto-injects `Authorization: Bearer` |
| `lib/ws.ts` | `SessionWebSocket` class; emits `chunk` / `done` / `error` events |
| `lib/auth.ts` | `getToken`, `setToken`, `clearToken`, `isTokenValid` |
| `store/auth.ts` | Zustand auth store |

---

## 9. Docker Compose

### Services

```
db        PostgreSQL 16     port 5432     volume: pg_data
redis     Redis 7           port 6379
backend   FastAPI / uvicorn port 8000     depends_on: db, redis
frontend  Next.js           port 3000     depends_on: backend
```

`backend/entrypoint.sh` runs `alembic upgrade head` before starting Uvicorn,
ensuring migrations are applied on every container start.

### Multi-stage Dockerfiles

**Backend** — `python:3.12-slim` base → install deps with `uv` → copy source → run entrypoint.

**Frontend** — `node:20-alpine` builder (`npm ci && next build`) → lean `node:20-alpine` runner.

---

## 10. CI/CD (GitHub Actions)

```
.github/workflows/ci.yml
│
├── backend job (python 3.12)
│     ruff check .
│     ruff format --check .
│     pytest tests/ --cov=app
│
└── frontend job (node 20)
      npm ci
      tsc --noEmit
```

Both jobs run on every push and pull request targeting `main`.

---

## 11. Configuration Reference

### Backend (`backend/app/config.py` — Pydantic Settings)

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql+asyncpg://butler:butler_secret@db:5432/virtual_butler` | Must use asyncpg driver |
| `REDIS_URL` | `redis://redis:6379` | Configured but not yet wired to application logic |
| `SECRET_KEY` | `change_me_in_production` | **Override in production** |
| `ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | |
| `DEBUG` | `False` | Enables SQLAlchemy echo logging |
| `ANTHROPIC_API_KEY` | — | |
| `OPENAI_API_KEY` | — | |
| `GOOGLE_API_KEY` | — | |

### Frontend (`.env.local`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Backend base URL (default: derived from `window.location`) |
| `NEXT_PUBLIC_WS_URL` | WebSocket server URL (default: `ws://localhost:8000`) |

---

## 12. Security Notes

| Concern | Mitigation |
|---------|-----------|
| Password storage | bcrypt with random salt |
| Token signing | HS256 + configurable `SECRET_KEY` |
| Token lifetime | Short-lived access (30 min) + refresh flow (7 d) |
| WebSocket auth | JWT validated before upgrade; close code 4001 on failure |
| SQL injection | Async SQLAlchemy with parameterised queries throughout |
| CORS | Restricted to `http://localhost:3000` in dev; update for production |
| Cascade deletes | FK constraints prevent orphan records |
| Secrets in DB | Per-ability `provider_config` stores API keys as plain JSON text — consider encryption at rest for production deployments |

---

## 13. Extension Points

| Area | How to extend |
|------|--------------|
| New AI provider | Subclass `BaseProvider`, implement `stream()` / `complete()`, register in `ProviderFactory` |
| Delivery targets | Add a `backend/app/targets/` module with a `BaseTarget` interface (`publish(deliverable, config) → url`), then wire into the session handler |
| Task queue | Wrap `AbilitySessionHandler.handle()` in a Celery task for async, long-running executions; use the existing Redis service |
| Frontend tests | Add Jest + React Testing Library; test components under `src/components/` |
