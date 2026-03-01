#!/bin/sh
set -e

# The repo is mounted from the host so its owner differs from the container
# user. Mark it as safe so git commands (commit, push, etc.) work.
git config --global --add safe.directory /repo

echo "Running Alembic migrations…"
alembic upgrade head

echo "Starting server…"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
