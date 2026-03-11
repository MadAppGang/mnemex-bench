#!/bin/bash
set -euo pipefail

REPO_PATH="${1:-$(pwd)}"

# Check for .claudemem directory and that it is non-empty
if [[ ! -d "$REPO_PATH/.claudemem" ]]; then
  echo "ERROR: No claudemem index at $REPO_PATH/.claudemem"
  echo "Run: cd $REPO_PATH && claudemem index"
  exit 1
fi

# Verify the index directory is non-empty
if [[ -z "$(ls -A "$REPO_PATH/.claudemem" 2>/dev/null)" ]]; then
  echo "ERROR: claudemem index directory is empty at $REPO_PATH/.claudemem"
  echo "Run: cd $REPO_PATH && claudemem index"
  exit 1
fi

echo "OK: claudemem index validated for $REPO_PATH"
exit 0
