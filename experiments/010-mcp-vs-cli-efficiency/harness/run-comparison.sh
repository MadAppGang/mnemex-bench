#!/bin/bash
# run-comparison.sh — MCP vs CLI efficiency comparison for mnemex
#
# Runs identical investigation tasks using two access methods:
#   - MCP: claude -p with --strict-mcp-config (mnemex MCP server only)
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

# Capture mnemex version at run start
MNEMEX_VERSION=$(mnemex --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
TIMEOUT=180
MAX_BUDGET=0.50
TARGET_DIR=""

# MCP configs
MCP_MNEMEX="$SCRIPT_DIR/mcp-mnemex.json"
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

# Default target: current working directory
if [[ -z "$TARGET_DIR" ]]; then
  TARGET_DIR="$(pwd)"
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

  # Build env prefix for MCP mode (LSP needs MNEMEX_LSP in parent env)
  local env_prefix=""
  if [[ "$method" == "mcp" ]]; then
    env_prefix="MNEMEX_LSP=true"
  fi

  # Run claude -p with isolated MCP config
  # MCP mode: only mnemex MCP tools available
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
  "mnemex_version": "$MNEMEX_VERSION",
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

write_run_record() {
  local record_file="$EXPERIMENT_DIR/results/records/v${MNEMEX_VERSION}-${TIMESTAMP}.json"
  mkdir -p "$(dirname "$record_file")"

  # Build test_results array from meta.json files using jq
  local test_results="[]"
  local tid
  for tid in "${PROMPT_IDS[@]}"; do
    local mcp_meta="$OUTPUT_DIR/mcp/$tid/meta.json"
    local cli_meta="$OUTPUT_DIR/cli/$tid/meta.json"
    [[ -f "$mcp_meta" && -f "$cli_meta" ]] || continue

    local entry
    entry=$(jq -n \
      --arg tid "$tid" \
      --slurpfile mcp "$mcp_meta" \
      --slurpfile cli "$cli_meta" \
      '{
        test_id: $tid,
        mcp: { duration_s: $mcp[0].duration_seconds, total_tool_calls: $mcp[0].total_tool_calls,
               bash_tool_calls: $mcp[0].bash_tool_calls, timed_out: $mcp[0].timed_out,
               exit_code: $mcp[0].exit_code, checks_passed: null, checks: {} },
        cli: { duration_s: $cli[0].duration_seconds, total_tool_calls: $cli[0].total_tool_calls,
               bash_tool_calls: $cli[0].bash_tool_calls, timed_out: $cli[0].timed_out,
               exit_code: $cli[0].exit_code, checks_passed: null, checks: {} }
      }')
    test_results=$(echo "$test_results" | jq ". += [$entry]")
  done

  # Compute aggregates
  local mcp_avg_dur cli_avg_dur mcp_avg_tools cli_avg_tools
  mcp_avg_dur=$(echo "$test_results" | jq '[.[].mcp.duration_s] | add / length')
  cli_avg_dur=$(echo "$test_results" | jq '[.[].cli.duration_s] | add / length')
  mcp_avg_tools=$(echo "$test_results" | jq '[.[].mcp.total_tool_calls] | add / length')
  cli_avg_tools=$(echo "$test_results" | jq '[.[].cli.total_tool_calls] | add / length')

  jq -n \
    --arg schema "1" \
    --arg run_id "run-$TIMESTAMP" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg ver "$MNEMEX_VERSION" \
    --arg target "$TARGET_DIR" \
    --argjson tests "$test_results" \
    --argjson mcp_dur "$mcp_avg_dur" \
    --argjson cli_dur "$cli_avg_dur" \
    --argjson mcp_tools "$mcp_avg_tools" \
    --argjson cli_tools "$cli_avg_tools" \
    '{
      schema_version: $schema, run_id: $run_id, timestamp: $ts,
      mnemex_version: $ver, target_dir: $target,
      harness_version: "1.0.0",
      test_results: $tests,
      aggregate: {
        mcp: { avg_duration_s: $mcp_dur, avg_total_tool_calls: $mcp_tools },
        cli: { avg_duration_s: $cli_dur, avg_total_tool_calls: $cli_tools }
      }
    }' > "$record_file"

  echo "Run record: $record_file"
}

update_manifest() {
  local manifest="$EXPERIMENT_DIR/results/runs.json"
  local record_rel="records/v${MNEMEX_VERSION}-${TIMESTAMP}.json"
  local mcp_avg cli_avg
  mcp_avg=$(jq '.aggregate.mcp.avg_duration_s' "$EXPERIMENT_DIR/results/$record_rel")
  cli_avg=$(jq '.aggregate.cli.avg_duration_s' "$EXPERIMENT_DIR/results/$record_rel")

  local new_entry
  new_entry=$(jq -n \
    --arg run_id "run-$TIMESTAMP" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg ver "$MNEMEX_VERSION" \
    --arg rec "$record_rel" \
    --argjson mcp_dur "$mcp_avg" \
    --argjson cli_dur "$cli_avg" \
    '{ run_id: $run_id, timestamp: $ts, mnemex_version: $ver, record_path: $rec,
       mcp_avg_duration_s: $mcp_dur, cli_avg_duration_s: $cli_dur,
       mcp_pass_rate: null, cli_pass_rate: null }')

  # Initialize if missing
  if [[ ! -f "$manifest" ]]; then
    echo '{"schema_version":"1","runs":[]}' > "$manifest"
  fi

  # Atomic append via temp file
  local tmp="$manifest.tmp.$$"
  jq --argjson entry "$new_entry" '.runs += [$entry]' "$manifest" > "$tmp" && mv "$tmp" "$manifest"
  echo "Manifest updated: $manifest"
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
    run_test "mcp" "$MCP_MNEMEX" "$mcp_prompt" "$test_id" &
    run_test "cli" "$MCP_EMPTY" "$cli_prompt" "$test_id" &
    wait
  else
    run_test "mcp" "$MCP_MNEMEX" "$mcp_prompt" "$test_id"
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

write_run_record
update_manifest
