# Deployment Guide

## Architecture Overview

The platform uses a **Docker image-based deployment** model:

1. Code changes go through **Pull Requests** on GitHub.
2. When a PR is merged and a **release** is created (e.g., `v0.3.1`), GitHub Actions
   automatically builds and publishes Docker images to **GHCR** (GitHub Container Registry).
3. The production server pulls the tagged images and restarts services.

```
Developer → PR → Merge → Release (tag) → GitHub Actions → GHCR Images
                                                                ↓
                                      Server: docker compose pull → up -d
```

## Publishing a Release

1. Merge all desired changes to `main`.
2. Create a new GitHub release:
   - Go to **Releases** → **Draft a new release**
   - Create a tag following semver: `v0.3.1`, `v0.4.0`, etc.
   - Write release notes describing the changes.
   - Click **Publish release**.
3. GitHub Actions (`release-images.yml`) will automatically:
   - Build `ghcr.io/raphyduck/virtual_butler-backend:<tag>`
   - Build `ghcr.io/raphyduck/virtual_butler-frontend:<tag>`
   - Tag both as `latest`
   - Push to GHCR

## Server Setup (First Time)

### Prerequisites

- Docker and Docker Compose installed
- Access to GHCR (images are public, or configure `docker login ghcr.io`)

### Steps

1. Clone the repo (for the compose files only):

   ```bash
   mkdir -p /deploy && cd /deploy
   curl -O https://raw.githubusercontent.com/raphyduck/virtual_butler/main/docker-compose.prod.yml
   ```

2. Create the `.env` file:

   ```bash
   cp .env.example .env
   # Edit .env with your production values:
   # - POSTGRES_PASSWORD (strong random value)
   # - SECRET_KEY (openssl rand -hex 32)
   # - APP_VERSION (e.g., v0.3.1)
   # - CORS_ORIGINS (your domain)
   # - NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL (baked at build time in images)
   # - GITHUB_* (OAuth config)
   # - AI provider keys
   ```

3. Start the services:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

4. Verify:

   ```bash
   docker compose -f docker-compose.prod.yml ps
   curl http://localhost:8000/health
   ```

## Updating the Server

### Option A: Via the Web UI

1. Navigate to the **Update** page in the web UI.
2. Enter the target version tag (e.g., `v0.3.2`).
3. Click **Apply update**.
4. The backend will update `.env`, pull new images, and restart services.

### Option B: Via the command line

```bash
cd /deploy

# Update the version in .env
sed -i 's/^APP_VERSION=.*/APP_VERSION=v0.3.2/' .env

# Pull new images
docker compose -f docker-compose.prod.yml pull

# Restart with new images
docker compose -f docker-compose.prod.yml up -d

# Optional: clean up old images
docker image prune -f
```

### Option C: Via the API

```bash
# Check current version
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/update/status

# Apply update
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"target_version": "v0.3.2"}' \
  http://localhost:8000/api/v1/update/apply

# Rollback
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/update/rollback
```

## Rollback

If an update causes issues:

1. **Web UI**: Go to the Update page and click "Rollback to {previous_version}".
2. **CLI**:
   ```bash
   cd /deploy
   sed -i 's/^APP_VERSION=.*/APP_VERSION=v0.3.1/' .env
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```
3. **API**: `POST /api/v1/update/rollback`

## Important Rules

- **Never** use `git pull` on the production server to update.
- The self-modification engine (local mode) is for **development only**.
- For production changes, always use the **PR-first** workflow:
  1. Create a PR (manually or via the Butler in "repo" mode)
  2. Review and merge
  3. Create a release
  4. GitHub Actions builds new images
  5. Update the server via UI, CLI, or API

## Development (Local)

For local development with hot-reload:

```bash
# Uses docker-compose.yml + docker-compose.override.yml
docker compose up -d
```

This mounts source code directly and enables hot-reload for both backend and frontend.

## Skills

Skills are installed at runtime without rebuilding Docker images (for Python-only skills).
Skills requiring system packages (`apt`) need to be included in a Docker image rebuild:

1. Add the skill's system dependencies to the backend `Dockerfile`.
2. Create a PR, merge, and release.
3. Update the server to the new version.
