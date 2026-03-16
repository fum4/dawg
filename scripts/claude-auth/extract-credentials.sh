#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_FILE="$SCRIPT_DIR/claude-credentials.json"

# Pre-flight checks
if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker is required but not installed."
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo "ERROR: GitHub CLI (gh) is required but not installed."
  echo "Install it from https://cli.github.com/"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "ERROR: GitHub CLI is not authenticated."
  echo "Run 'gh auth login' first."
  exit 1
fi

REPO_NAME="$(cd "$REPO_ROOT" && gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)" || true
if [ -z "$REPO_NAME" ]; then
  echo "ERROR: Could not determine GitHub repository."
  echo "Make sure this repo has a GitHub remote and 'gh' can access it."
  exit 1
fi

echo "Building Claude Code Docker image..."
docker build -t claude-auth "$SCRIPT_DIR"

echo ""
echo "==================================================="
echo "  Claude Code will start and prompt you to log in."
echo "  1. Open the URL it gives you in your browser"
echo "  2. Complete the OAuth flow"
echo "  3. Once authenticated, type /exit or press Ctrl+C"
echo "==================================================="
echo ""

# Run claude interactively — first run triggers OAuth flow.
# Volume persists credentials after container exits.
docker run -it --rm \
  -v claude-auth-data:/root \
  claude-auth claude

# Search common credential locations and extract
docker run --rm \
  -v claude-auth-data:/root \
  -v "$SCRIPT_DIR":/out \
  node:22-slim \
  sh -c '
    if [ -f /root/.claude.json ]; then
      cp /root/.claude.json /out/claude-credentials.json
    elif [ -f /root/.config/claude/credentials.json ]; then
      cp /root/.config/claude/credentials.json /out/claude-credentials.json
    elif [ -f /root/.claude/credentials.json ]; then
      cp /root/.claude/credentials.json /out/claude-credentials.json
    else
      echo "Could not find credentials. Listing possible locations:"
      find /root -name "*.json" -path "*claude*" 2>/dev/null || true
      find /root/.config -name "*.json" 2>/dev/null || true
    fi
  '

# Clean up the volume
docker volume rm claude-auth-data 2>/dev/null || true

if [ ! -f "$OUTPUT_FILE" ]; then
  echo ""
  echo "ERROR: Failed to extract credentials."
  echo "Re-run and check the listed file paths above."
  exit 1
fi

echo ""
echo "Credentials extracted successfully."
echo "Updating CLAUDE_AUTH_JSON secret on $REPO_NAME..."

gh secret set CLAUDE_AUTH_JSON --repo "$REPO_NAME" < "$OUTPUT_FILE"

# Clean up local credentials file
rm -f "$OUTPUT_FILE"

echo "Done — CLAUDE_AUTH_JSON secret updated on $REPO_NAME. Local credentials removed."
