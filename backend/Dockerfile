# ─── Base ─────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS base

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# ─── Builder (installs deps) ──────────────────────────────────────────────────
FROM base AS builder

RUN pip install --no-cache-dir uv

COPY pyproject.toml .
RUN uv venv .venv && \
    uv pip install --python .venv/bin/python -e . --no-cache

# ─── Production ───────────────────────────────────────────────────────────────
FROM base AS production

# git is required by the self-modification engine (commit / push operations)
# docker CLI is required for build-and-deploy after merging PRs
RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates curl gnupg && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    chmod a+r /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.venv .venv
COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]

# ─── Development (hot-reload; used in compose override) ───────────────────────
FROM production AS dev
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
