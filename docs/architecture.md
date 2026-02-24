# Architecture — Virtual Butler

## Core Entities

### User
- id, email, hashed_password, created_at
- Can own multiple Abilities

### Ability
- id, user_id, name, description
- provider: `anthropic | openai | google | ollama`
- model: string (e.g. `claude-sonnet-4-6`)
- deliverable_type: `code | website | video | document | image | audio | ...`
- target_type: `github | s3 | youtube | ftp | local | ...`
- target_config: JSON (repo name, bucket, channel, etc.)
- system_prompt: text
- created_at, updated_at

### Session
- id, ability_id, user_id
- status: `idle | running | completed | failed`
- created_at, completed_at

### Message
- id, session_id
- role: `user | assistant | tool`
- content: text / JSON
- created_at

### Deliverable
- id, session_id
- type: mirrors Ability.deliverable_type
- url: where it was published
- metadata: JSON
- created_at

## Data Flow

```
User (chat) → WebSocket → Session Handler
                              ↓
                        Ability Engine
                         ↙        ↘
                  AI Provider    Tool Executor
               (Claude/GPT/...)  (GitHub push, S3 upload...)
                         ↘        ↙
                        Deliverable saved
                              ↓
                        User notified (WebSocket)
```

## Plugin System

### AI Provider Adapter (interface)
```python
class BaseProvider:
    async def stream(self, messages, system_prompt, tools) -> AsyncIterator[str]: ...
    async def complete(self, messages, system_prompt, tools) -> str: ...
```

Implementations: `AnthropicProvider`, `OpenAIProvider`, `GoogleProvider`, `OllamaProvider`

### Target Adapter (interface)
```python
class BaseTarget:
    async def publish(self, deliverable: Deliverable, config: dict) -> str: ...
    # returns: public URL or identifier
```

Implementations: `GitHubTarget`, `S3Target`, `YouTubeTarget`, `FTPTarget`

## API Endpoints (planned)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Get JWT tokens |
| GET | `/abilities` | List user's Abilities |
| POST | `/abilities` | Create a new Ability |
| GET | `/abilities/{id}` | Get Ability details |
| PUT | `/abilities/{id}` | Update Ability |
| DELETE | `/abilities/{id}` | Delete Ability |
| GET | `/abilities/{id}/sessions` | List sessions |
| POST | `/abilities/{id}/sessions` | Start new session |
| WS | `/ws/session/{id}` | Realtime chat + streaming |
| GET | `/sessions/{id}/deliverable` | Get deliverable info |

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/login` | Authentication |
| `/register` | Registration |
| `/dashboard` | All Abilities overview |
| `/ability/new` | Create Ability wizard |
| `/ability/[id]` | Chat interface for an Ability |
| `/ability/[id]/settings` | Edit Ability config |
