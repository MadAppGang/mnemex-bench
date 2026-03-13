#!/bin/bash
set -euo pipefail

REPO_PATH="${1:-$(pwd)}"

# Check for .mnemex directory and that it is non-empty
if [[ ! -d "$REPO_PATH/.mnemex" ]]; then
  echo "ERROR: No mnemex index at $REPO_PATH/.mnemex"
  echo "Run: cd $REPO_PATH && mnemex index"
  exit 1
fi

# Verify the index directory is non-empty
if [[ -z "$(ls -A "$REPO_PATH/.mnemex" 2>/dev/null)" ]]; then
  echo "ERROR: mnemex index directory is empty at $REPO_PATH/.mnemex"
  echo "Run: cd $REPO_PATH && mnemex index"
  exit 1
fi

echo "OK: mnemex index validated for $REPO_PATH"
exit 0
