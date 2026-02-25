#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code on the web sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "==> Installing backend Python dependencies..."
cd "$CLAUDE_PROJECT_DIR/backend"
uv sync --extra dev --python 3.12

# Activate the venv for the rest of the session
echo "export PATH=\"$CLAUDE_PROJECT_DIR/backend/.venv/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
echo "export VIRTUAL_ENV=\"$CLAUDE_PROJECT_DIR/backend/.venv\"" >> "$CLAUDE_ENV_FILE"

echo "==> Installing frontend npm dependencies..."
cd "$CLAUDE_PROJECT_DIR/frontend"
npm install --prefer-offline

echo "==> Dev environment ready."
