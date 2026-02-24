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

> Full setup instructions coming soon.

```bash
# Clone the repo
git clone https://github.com/raphyduck/virtual_butler.git
cd virtual_butler

# Start all services
docker compose up
```

## License

[AGPL-3.0](./LICENSE) — Any hosted version of this software must remain open-source.
