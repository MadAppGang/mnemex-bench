#!/bin/bash
# run-comparison.sh — MCP vs CLI efficiency comparison for claudemem/mnemex
#
# Runs identical investigation tasks using two access methods:
#   - MCP: claude -p with --strict-mcp-config (claudemem MCP server only)
#   - CLI: claude -p with --strict-mcp-config (empty MCP, Bash tool available)
#
# Captures: transcript, duration, tool calls, token count
#
# Usage:
#   ./run-comparison.sh [--cases <ids>] [--parallel] [--target-dir <path>]
#
# The --target-dir specifies which codebase to investigate (defaults to mag/claude-code).

set -euo pipefail
unset CLAUDECODE 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXPERIMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_DIR="$EXPERIMENT_DIR/results/run-$TIMESTAMP"
TIMEOUT=180
MAX_BUDGET=0.50
TARGET_DIR=""

# MCP configs
MCP_CLAUDEMEM="$SCRIPT_DIR/mcp-claudemem.json"
MCP_EMPTY="$SCRIPT_DIR/mcp-empty.json"

# Prompt directories
MCP_PROMPTS="$EXPERIMENT_DIR/prompts/mcp"
CLI_PROMPTS="$EXPERIMENT_DIR/prompts/cli"

mkdir -p "$OUTPUT_DIR"

# Parse args
SELECTED_CASES=""
PARALLEL=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --cases) SELECTED_CASES="$2"; shift 2 ;;
    --parallel) PARALLEL=true; shift ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --max-budget) MAX_BUDGET="$2"; shift 2 ;;
    --target-dir) TARGET_DIR="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

# Default target: mag/claude-code (relative to typical location)
if [[ -z "$TARGET_DIR" ]]; then
  # Try to find mag/claude-code relative to mnemex-bench
  if [[ -d "$EXPERIMENT_DIR/../../claude-code" ]]; then
    TARGET_DIR="$(cd "$EXPERIMENT_DIR/../../claude-code" && pwd)"
  else
    echo "ERROR: No --target-dir specified and could not find ../claude-code"
    echo "Usage: $0 --target-dir /path/to/codebase"
    exit 1
  fi
fi

echo "Target codebase: $TARGET_DIR"

# Discover prompt pairs (matched by filename across mcp/ and cli/)
PROMPT_IDS=()
if [[ -n "$SELECTED_CASES" ]]; then
  IFS=',' read -ra PROMPT_IDS <<< "$SELECTED_CASES"
else
  for f in "$MCP_PROMPTS"/*.md; do
    [[ -f "$f" ]] && PROMPT_IDS+=("$(basename "$f" .md)")
  done
fi

TOTAL=${#PROMPT_IDS[@]}
echo ""
echo "=== MCP vs CLI Efficiency Comparison ==="
echo "Tests:      $TOTAL"
echo "Timeout:    ${TIMEOUT}s"
echo "Budget:     \$${MAX_BUDGET}"
echo "Target:     $TARGET_DIR"
echo "Output:     $OUTPUT_DIR"
echo ""

# Run a single test
run_test() {
  local method="$1"       # mcp or cli
  local mcp_config="$2"   # path to MCP JSON
  local prompt_file="$3"  # path to prompt .md
  local test_id="$4"      # e.g. 01-index-status

  local test_dir="$OUTPUT_DIR/$method/$test_id"
  mkdir -p "$test_dir"
  cp "$prompt_file" "$test_dir/prompt.md"

  local start_epoch=$(date +%s)
  local timed_out=false

  # Build env prefix for MCP mode (LSP needs CLAUDEMEM_LSP in parent env)
  local env_prefix=""
  if [[ "$method" == "mcp" ]]; then
    env_prefix="CLAUDEMEM_LSP=true"
  fi

  # Run claude -p with isolated MCP config
  # MCP mode: only claudemem MCP tools available
  # CLI mode: empty MCP (no MCP tools), but Bash/Read/etc available
  (
    cd "$TARGET_DIR"
    env $env_prefix claude -p \
      --strict-mcp-config \
      --mcp-config "$mcp_config" \
      --disable-slash-commands \
      --dangerously-skip-permissions \
      --verbose \
      --output-format stream-json \
      --max-budget-usd "$MAX_BUDGET" \
      < "$test_dir/prompt.md" \
      > "$test_dir/transcript.jsonl" \
      2> "$test_dir/stderr.log"
  ) &
  local pid=$!

  # Watchdog: kill after TIMEOUT seconds
  ( sleep "$TIMEOUT" && kill "$pid" 2>/dev/null ) &
  local watchdog=$!

  local exit_code=0
  wait "$pid" 2>/dev/null || exit_code=$?

  kill "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true

  local end_epoch=$(date +%s)
  local duration=$((end_epoch - start_epoch))

  if (( duration >= TIMEOUT - 2 )); then
    timed_out=true
  fi

  # Count tool calls by type
  local mcp_calls=$(grep -c '"type":"tool_use"' "$test_dir/transcript.jsonl" 2>/dev/null || echo 0)
  local bash_calls=$(grep -o '"name":"Bash"' "$test_dir/transcript.jsonl" 2>/dev/null | wc -l | tr -d ' ')
  local total_lines=$(wc -l < "$test_dir/transcript.jsonl" 2>/dev/null | tr -d ' ')

  # Extract MCP tool names
  local mcp_tool_names=$(grep -o '"name":"mcp__[^"]*"' "$test_dir/transcript.jsonl" 2>/dev/null | sort | uniq -c | sort -rn || echo "")

  # Write meta
  cat > "$test_dir/meta.json" <<METAJSON
{
  "test_id": "$test_id",
  "method": "$method",
  "duration_seconds": $duration,
  "exit_code": $exit_code,
  "total_tool_calls": $mcp_calls,
  "bash_tool_calls": $bash_calls,
  "transcript_lines": $total_lines,
  "timeout_seconds": $TIMEOUT,
  "max_budget_usd": $MAX_BUDGET,
  "timed_out": $timed_out,
  "target_dir": "$TARGET_DIR"
}
METAJSON

  local icon="OK"
  [[ $exit_code -ne 0 ]] && icon="FAIL"
  $timed_out && icon="TIMEOUT"
  echo "  $icon  [$test_id] method=$method dur=${duration}s tools=$mcp_calls bash=$bash_calls exit=$exit_code"
}

# Execute all tests for both methods
for test_id in "${PROMPT_IDS[@]}"; do
  mcp_prompt="$MCP_PROMPTS/$test_id.md"
  cli_prompt="$CLI_PROMPTS/$test_id.md"

  if [[ ! -f "$mcp_prompt" ]]; then
    echo "WARN: MCP prompt not found: $mcp_prompt"
    continue
  fi
  if [[ ! -f "$cli_prompt" ]]; then
    echo "WARN: CLI prompt not found: $cli_prompt"
    continue
  fi

  echo "--- $test_id ---"

  if $PARALLEL; then
    run_test "mcp" "$MCP_CLAUDEMEM" "$mcp_prompt" "$test_id" &
    run_test "cli" "$MCP_EMPTY" "$cli_prompt" "$test_id" &
    wait
  else
    run_test "mcp" "$MCP_CLAUDEMEM" "$mcp_prompt" "$test_id"
    run_test "cli" "$MCP_EMPTY" "$cli_prompt" "$test_id"
  fi
  echo ""
done

echo "=== Comparison Complete ==="
echo "Output: $OUTPUT_DIR"
echo ""

# Quick summary
echo "=== Quick Summary ==="
echo ""
printf "%-24s  %8s %6s %6s   %8s %6s %6s\n" "Test" "MCP dur" "tools" "bash" "CLI dur" "tools" "bash"
printf "%-24s  %8s %6s %6s   %8s %6s %6s\n" "----" "-------" "-----" "----" "-------" "-----" "----"

for test_id in "${PROMPT_IDS[@]}"; do
  mcp_meta="$OUTPUT_DIR/mcp/$test_id/meta.json"
  cli_meta="$OUTPUT_DIR/cli/$test_id/meta.json"

  if [[ -f "$mcp_meta" && -f "$cli_meta" ]]; then
    mcp_dur=$(grep -o '"duration_seconds": [0-9]*' "$mcp_meta" | grep -o '[0-9]*')
    mcp_tools=$(grep -o '"total_tool_calls": [0-9]*' "$mcp_meta" | grep -o '[0-9]*')
    mcp_bash=$(grep -o '"bash_tool_calls": [0-9]*' "$mcp_meta" | grep -o '[0-9]*')
    cli_dur=$(grep -o '"duration_seconds": [0-9]*' "$cli_meta" | grep -o '[0-9]*')
    cli_tools=$(grep -o '"total_tool_calls": [0-9]*' "$cli_meta" | grep -o '[0-9]*')
    cli_bash=$(grep -o '"bash_tool_calls": [0-9]*' "$cli_meta" | grep -o '[0-9]*')

    printf "%-24s  %6ss %6s %6s   %6ss %6s %6s\n" \
      "$test_id" "$mcp_dur" "$mcp_tools" "$mcp_bash" "$cli_dur" "$cli_tools" "$cli_bash"
  fi
done
echo ""
