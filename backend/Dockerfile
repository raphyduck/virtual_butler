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
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.venv .venv
COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]

# ─── Development (hot-reload; used in compose override) ───────────────────────
FROM production AS dev
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
