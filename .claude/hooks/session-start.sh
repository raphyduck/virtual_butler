#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code on the web sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Fix git ownership check in containerized environments
# The infrastructure may run git commands as different users (root, claude, etc.)
# so we set safe.directory at system level AND for all known user configs.
echo "==> Fixing git safe.directory for all users..."
echo "    Current user: $(whoami) (uid=$(id -u))"
echo "    HOME=$HOME"

# System-level config (applies to all users)
git config --system --add safe.directory '*' 2>/dev/null || echo "    WARN: could not write system gitconfig"
echo "    Set system-level safe.directory=*"

# Global config for current user
git config --global --add safe.directory '*'
echo "    Set global safe.directory=* for $(whoami)"

# Also set for the 'claude' user which may run git fetch separately
if [ -d /home/claude ]; then
  git config --file /home/claude/.gitconfig --add safe.directory '*'
  echo "    Set safe.directory=* in /home/claude/.gitconfig"
fi

# Also set in the local repo config as a final fallback
git config --local --add safe.directory '*' 2>/dev/null || true
echo "    Set local repo safe.directory=*"

# Log the effective config for debugging
echo "    System gitconfig: $(cat /etc/gitconfig 2>/dev/null || echo 'N/A')"
echo "    Git safe.directory values: $(git config --get-all safe.directory 2>/dev/null | tr '\n' ' ')"

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
