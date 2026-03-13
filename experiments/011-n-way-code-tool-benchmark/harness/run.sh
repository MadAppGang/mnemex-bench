#!/bin/bash
# run.sh — N-Way Code Tool Benchmark main runner
#
# Usage:
#   bash harness/run.sh [OPTIONS]
#
# Options:
#   --tools   mnemex,bare-claude  (comma-separated tool IDs, or "all")
#   --repos   fastmcp,tinygrad       (comma-separated repo names, or "all")
#   --tasks   T01,T02                (comma-separated task IDs, or "all")
#   --timeout 300                    (seconds per session, default 300)
#   --max-budget 1.00                (USD per session, default 1.00)
#   --parallel                       (run tasks in parallel within each tool/repo pair)
#   --dry-run                        (print plan without executing)

set -euo pipefail
unset CLAUDECODE 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXPERIMENT="$(cd "$SCRIPT_DIR/.." && pwd)"
HARNESS_VER="1.0.0"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RUN_ID="run-$TIMESTAMP"
OUTPUT_DIR="$EXPERIMENT/results/$RUN_ID"

DEFAULT_TIMEOUT=300
DEFAULT_MAX_BUDGET=1.00

# ─── Argument parsing ────────────────────────────────────────────────────────

TOOLS_ARG="all"
REPOS_ARG="all"
TASKS_ARG="all"
TIMEOUT=$DEFAULT_TIMEOUT
MAX_BUDGET=$DEFAULT_MAX_BUDGET
PARALLEL=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --tools)      TOOLS_ARG="$2"; shift 2 ;;
    --repos)      REPOS_ARG="$2"; shift 2 ;;
    --tasks)      TASKS_ARG="$2"; shift 2 ;;
    --timeout)    TIMEOUT="$2"; shift 2 ;;
    --max-budget) MAX_BUDGET="$2"; shift 2 ;;
    --parallel)   PARALLEL=true; shift ;;
    --dry-run)    DRY_RUN=true; shift ;;
    *) echo "ERROR: Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ─── Dependency check ────────────────────────────────────────────────────────

require_cmd() {
  local cmd="$1"
  local hint="${2:-}"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: Required command '$cmd' not found." >&2
    [[ -n "$hint" ]] && echo "  Hint: $hint" >&2
    exit 1
  fi
}

require_cmd jq     "Install jq via homebrew: brew install jq"
require_cmd claude "Install Claude Code CLI"

# ─── Tool discovery ──────────────────────────────────────────────────────────

TOOLS_DIR="$EXPERIMENT/tools"

# Discover all tools from tools/*/config.json
# Space-separated string (bash 3.2 compatible — no associative arrays)
ALL_TOOLS=""
for _cfg in "$TOOLS_DIR"/*/config.json; do
  [[ -f "$_cfg" ]] || continue
  _tid=$(jq -r '.id' "$_cfg" 2>/dev/null || true)
  [[ -n "$_tid" ]] && ALL_TOOLS="$ALL_TOOLS$_tid "
done
ALL_TOOLS="${ALL_TOOLS% }"

if [[ -z "$ALL_TOOLS" ]]; then
  echo "ERROR: No tool configs found in $TOOLS_DIR" >&2
  exit 1
fi

# Resolve selected tools
SELECTED_TOOLS=""
if [[ "$TOOLS_ARG" == "all" ]]; then
  SELECTED_TOOLS="$ALL_TOOLS"
else
  for _t in $(echo "$TOOLS_ARG" | tr ',' ' '); do
    if [[ -f "$TOOLS_DIR/$_t/config.json" ]]; then
      SELECTED_TOOLS="$SELECTED_TOOLS$_t "
    else
      echo "WARN: Tool '$_t' not found (no config at $TOOLS_DIR/$_t/config.json), skipping" >&2
    fi
  done
  SELECTED_TOOLS="${SELECTED_TOOLS% }"
fi

if [[ -z "$SELECTED_TOOLS" ]]; then
  echo "ERROR: No valid tools selected" >&2
  exit 1
fi

# Verify mcp-config.json exists for each selected tool
for _t in $SELECTED_TOOLS; do
  if [[ ! -f "$TOOLS_DIR/$_t/mcp-config.json" ]]; then
    echo "ERROR: Missing mcp-config.json for tool '$_t'" >&2
    exit 1
  fi
done

# ─── Repo resolution ─────────────────────────────────────────────────────────

REPOS_JSON="$EXPERIMENT/repos.json"

if [[ ! -f "$REPOS_JSON" ]]; then
  echo "ERROR: repos.json not found at $REPOS_JSON" >&2
  exit 1
fi

# Helpers: look up repo fields directly from JSON at call time
get_repo_path() { jq -r --arg r "$1" '.[$r].path' "$REPOS_JSON"; }
get_repo_lang()  { jq -r --arg r "$1" '.[$r].language' "$REPOS_JSON"; }

ALL_REPOS=$(jq -r 'keys[]' "$REPOS_JSON" | tr '\n' ' ')
ALL_REPOS="${ALL_REPOS% }"

SELECTED_REPOS=""
if [[ "$REPOS_ARG" == "all" ]]; then
  SELECTED_REPOS="$ALL_REPOS"
else
  for _r in $(echo "$REPOS_ARG" | tr ',' ' '); do
    if jq -e --arg r "$_r" 'has($r)' "$REPOS_JSON" >/dev/null 2>&1; then
      SELECTED_REPOS="$SELECTED_REPOS$_r "
    else
      echo "WARN: Repo '$_r' not found in repos.json, skipping" >&2
    fi
  done
  SELECTED_REPOS="${SELECTED_REPOS% }"
fi

if [[ -z "$SELECTED_REPOS" ]]; then
  echo "ERROR: No valid repos selected" >&2
  exit 1
fi

# ─── Task loading ────────────────────────────────────────────────────────────

TASKS_JSON="$EXPERIMENT/tasks.json"

if [[ ! -f "$TASKS_JSON" ]]; then
  echo "ERROR: tasks.json not found at $TASKS_JSON" >&2
  exit 1
fi

TASKS_VERSION=$(jq -r '.version' "$TASKS_JSON")

# Helpers: look up task fields directly from JSON at call time
get_task_repo()            { jq -r --arg t "$1" '.tasks[] | select(.id == $t) | .repo' "$TASKS_JSON"; }
get_task_prompt_file()     { jq -r --arg t "$1" '.tasks[] | select(.id == $t) | .prompt_file' "$TASKS_JSON"; }
get_task_expected_tokens() { jq -c  --arg t "$1" '.tasks[] | select(.id == $t) | .expected_tokens' "$TASKS_JSON"; }
get_task_category()        { jq -r  --arg t "$1" '.tasks[] | select(.id == $t) | .category' "$TASKS_JSON"; }
get_task_difficulty()      { jq -r  --arg t "$1" '.tasks[] | select(.id == $t) | .difficulty' "$TASKS_JSON"; }

ALL_TASKS=$(jq -r '.tasks[].id' "$TASKS_JSON" | tr '\n' ' ')
ALL_TASKS="${ALL_TASKS% }"

SELECTED_TASKS=""
if [[ "$TASKS_ARG" == "all" ]]; then
  SELECTED_TASKS="$ALL_TASKS"
else
  for _tid in $(echo "$TASKS_ARG" | tr ',' ' '); do
    _exists=$(jq -r --arg t "$_tid" '.tasks[] | select(.id == $t) | .id' "$TASKS_JSON" 2>/dev/null || true)
    if [[ -n "$_exists" ]]; then
      SELECTED_TASKS="$SELECTED_TASKS$_tid "
    else
      echo "WARN: Task '$_tid' not found in tasks.json, skipping" >&2
    fi
  done
  SELECTED_TASKS="${SELECTED_TASKS% }"
fi

if [[ -z "$SELECTED_TASKS" ]]; then
  echo "ERROR: No valid tasks selected" >&2
  exit 1
fi

# ─── Tool version capture ────────────────────────────────────────────────────

# Build a JSON object mapping tool_id -> version string (using jq for safe escaping)
TOOL_VERSIONS_JSON='{}'
for _t in $SELECTED_TOOLS; do
  _ver_cmd=$(jq -r '.version_command // ""' "$TOOLS_DIR/$_t/config.json" 2>/dev/null || true)
  if [[ -n "$_ver_cmd" ]]; then
    _ver=$(eval "$_ver_cmd" 2>/dev/null | head -1 || echo "unknown")
  else
    _ver="n/a"
  fi
  TOOL_VERSIONS_JSON=$(echo "$TOOL_VERSIONS_JSON" | jq --arg k "$_t" --arg v "$_ver" '. + {($k): $v}')
done

# ─── Run announcement ────────────────────────────────────────────────────────

echo ""
echo "=== N-Way Code Tool Benchmark ==="
echo "Run ID:    $RUN_ID"
echo "Tools:     $SELECTED_TOOLS"
echo "Repos:     $SELECTED_REPOS"
echo "Tasks:     $SELECTED_TASKS"
echo "Timeout:   ${TIMEOUT}s"
echo "Budget:    \$${MAX_BUDGET} per session"
echo "Parallel:  $PARALLEL"
echo "Dry run:   $DRY_RUN"
echo "Output:    $OUTPUT_DIR"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo "=== DRY RUN — planned sessions ==="
  for _tool in $SELECTED_TOOLS; do
    for _repo in $SELECTED_REPOS; do
      for _tid in $SELECTED_TASKS; do
        _tr=$(get_task_repo "$_tid")
        [[ "$_tr" == "$_repo" ]] || continue
        echo "  WOULD RUN: tool=$_tool repo=$_repo task=$_tid"
      done
    done
  done
  echo ""
  echo "Dry run complete. No sessions executed."
  exit 0
fi

# ─── Session helpers ─────────────────────────────────────────────────────────

render_system_prompt() {
  local base_file="$1"
  local tool_file="$2"
  local repo="$3"
  local repo_path="$4"

  local combined
  combined=$(sed \
    -e "s|{{repo}}|${repo}|g" \
    -e "s|{{repo_path}}|${repo_path}|g" \
    "$base_file")

  if [[ -f "$tool_file" && -s "$tool_file" ]]; then
    combined+=$'\n\n---\n\n'
    combined+=$(cat "$tool_file")
  fi

  echo "$combined"
}

compute_compliance() {
  local prefix="$1"
  local designated_calls="$2"
  local min_calls="$3"
  local unauthorized_mcp_calls="$4"
  local exit_code="${5:-0}"
  local timed_out="${6:-false}"

  # FR-12: compliance requires clean exit AND no timeout AND correct tool usage
  if [[ "$exit_code" -ne 0 || "$timed_out" == "true" ]]; then
    echo "false"
    return
  fi

  if [[ -z "$prefix" ]]; then
    # bare-claude: pass if no mcp__ calls made at all
    if [[ "$unauthorized_mcp_calls" -eq 0 ]]; then
      echo "true"
    else
      echo "false"
    fi
  else
    # MCP tool: pass if designated_calls >= min_calls AND no unauthorized MCP calls
    if [[ "$designated_calls" -ge "$min_calls" && "$unauthorized_mcp_calls" -eq 0 ]]; then
      echo "true"
    else
      echo "false"
    fi
  fi
}

run_session() {
  local tool="$1"
  local repo="$2"
  local task_id="$3"

  local repo_path
  repo_path=$(get_repo_path "$repo")
  local tool_config="$TOOLS_DIR/$tool/config.json"
  local tool_mcp_config="$TOOLS_DIR/$tool/mcp-config.json"
  local tool_system_prompt_file="$TOOLS_DIR/$tool/system-prompt.md"
  local base_system_prompt_file="$EXPERIMENT/prompts/base-system-prompt.md"
  local prompt_file_name
  prompt_file_name=$(get_task_prompt_file "$task_id")
  local task_prompt_file="$EXPERIMENT/prompts/$prompt_file_name"
  local task_category
  task_category=$(get_task_category "$task_id")
  local task_difficulty
  task_difficulty=$(get_task_difficulty "$task_id")
  local expected_tokens_json
  expected_tokens_json=$(get_task_expected_tokens "$task_id")

  local session_dir="$OUTPUT_DIR/$tool/$repo/$task_id"
  mkdir -p "$session_dir"

  # 1. Build combined system prompt
  local system_prompt
  system_prompt=$(render_system_prompt \
    "$base_system_prompt_file" \
    "$tool_system_prompt_file" \
    "$repo" \
    "$repo_path")

  # 2. Render task prompt (substitute template variables)
  local task_prompt
  task_prompt=$(sed \
    -e "s|{{repo}}|${repo}|g" \
    -e "s|{{repo_path}}|${repo_path}|g" \
    "$task_prompt_file")

  # Write rendered prompt to session dir
  printf '%s\n' "$task_prompt" > "$session_dir/prompt.md"

  # 3. Get designated prefix and min_calls
  local designated_prefix
  designated_prefix=$(jq -r '.designated_tool_prefix // ""' "$tool_config")
  local min_designated_calls
  min_designated_calls=$(jq -r '.min_designated_calls // 0' "$tool_config")

  # 4. Build env vars for this tool
  local env_prefix=""
  local _env_entries
  _env_entries=$(jq -r '.env // {} | to_entries | .[] | "\(.key)=\(.value)"' "$tool_config" 2>/dev/null || true)
  if [[ -n "$_env_entries" ]]; then
    env_prefix=$(printf '%s' "$_env_entries" | tr '\n' ' ')
  fi

  # 5. Record start time
  local start_epoch
  start_epoch=$(date +%s)

  # 6. Launch claude in background from repo directory
  (
    cd "$repo_path"
    # shellcheck disable=SC2086
    env $env_prefix claude -p \
      --system-prompt "$system_prompt" \
      --strict-mcp-config \
      --mcp-config "$tool_mcp_config" \
      --disable-slash-commands \
      --dangerously-skip-permissions \
      --verbose \
      --output-format stream-json \
      --max-budget-usd "$MAX_BUDGET" \
      < "$session_dir/prompt.md" \
      > "$session_dir/transcript.jsonl" \
      2> "$session_dir/stderr.log"
  ) &
  local pid=$!

  # 7. Watchdog: kill after TIMEOUT seconds (macOS compatible — no `timeout` command)
  ( sleep "$TIMEOUT" && kill "$pid" 2>/dev/null ) &
  local watchdog_pid=$!

  local exit_code=0
  wait "$pid" 2>/dev/null || exit_code=$?

  kill "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true

  local end_epoch
  end_epoch=$(date +%s)
  local duration=$(( end_epoch - start_epoch ))

  local timed_out="false"
  if (( duration >= TIMEOUT - 2 )); then
    timed_out="true"
  fi

  # 8. Parse transcript for metrics
  TRANSCRIPT_FILE="$session_dir/transcript.jsonl"
  DESIGNATED_PREFIX="$designated_prefix"
  source "$SCRIPT_DIR/lib/parse-transcript.sh"

  # 9. Compute compliance
  local compliance_passed
  compliance_passed=$(compute_compliance \
    "$designated_prefix" \
    "$DESIGNATED_TOOL_CALLS" \
    "$min_designated_calls" \
    "$UNAUTHORIZED_MCP_CALLS" \
    "$exit_code" \
    "$timed_out")

  # 10. Compute token score
  TRANSCRIPT_FILE="$session_dir/transcript.jsonl"
  EXPECTED_TOKENS_JSON="$expected_tokens_json"
  source "$SCRIPT_DIR/lib/compute-token-score.sh"
  local token_score="$TOKEN_SCORE"

  # 11. Write meta.json atomically
  local tmp="$session_dir/meta.json.tmp.$$"
  jq -n \
    --arg  test_id              "$task_id" \
    --arg  tool                 "$tool" \
    --arg  repo                 "$repo" \
    --arg  run_id               "$RUN_ID" \
    --arg  harness_ver          "$HARNESS_VER" \
    --argjson duration          "$duration" \
    --argjson exit_code         "$exit_code" \
    --arg  timed_out_str        "$timed_out" \
    --argjson timeout_seconds   "$TIMEOUT" \
    --argjson max_budget_usd    "$MAX_BUDGET" \
    --argjson total_tool_calls  "$TOTAL_TOOL_CALLS" \
    --argjson designated_calls  "$DESIGNATED_TOOL_CALLS" \
    --argjson unauth_mcp        "$UNAUTHORIZED_MCP_CALLS" \
    --arg  compliance_str       "$compliance_passed" \
    --argjson transcript_lines  "$TRANSCRIPT_LINES" \
    --argjson input_tokens      "$INPUT_TOKENS" \
    --argjson output_tokens     "$OUTPUT_TOKENS" \
    --argjson cost_usd          "$COST_USD" \
    --arg  task_category        "$task_category" \
    --arg  task_difficulty      "$task_difficulty" \
    --arg  designated_prefix    "$designated_prefix" \
    --arg  token_score_str      "$token_score" \
    '{
      test_id:                  $test_id,
      tool:                     $tool,
      repo:                     $repo,
      run_id:                   $run_id,
      harness_version:          $harness_ver,
      duration_seconds:         $duration,
      exit_code:                $exit_code,
      timed_out:                ($timed_out_str == "true"),
      timeout_seconds:          $timeout_seconds,
      max_budget_usd:           $max_budget_usd,
      total_tool_calls:         $total_tool_calls,
      designated_tool_calls:    $designated_calls,
      unauthorized_mcp_calls:   $unauth_mcp,
      compliance_passed:        ($compliance_str == "true"),
      designated_tool_prefix:   $designated_prefix,
      token_score:              (if $token_score_str == "null" then null else ($token_score_str | tonumber) end),
      transcript_lines:         $transcript_lines,
      input_tokens:             $input_tokens,
      output_tokens:            $output_tokens,
      cost_usd:                 $cost_usd,
      task_category:            $task_category,
      task_difficulty:          $task_difficulty
    }' > "$tmp" && mv "$tmp" "$session_dir/meta.json"

  # 12. Print status line
  local icon="OK"
  [[ $exit_code -ne 0 ]] && icon="FAIL"
  [[ "$timed_out" == "true" ]] && icon="TIMEOUT"
  printf "  %-7s  task=%-4s tool=%-12s repo=%-10s dur=%ds tools=%d cost=\$%s exit=%d\n" \
    "$icon" "$task_id" "$tool" "$repo" "$duration" "$TOTAL_TOOL_CALLS" "$COST_USD" "$exit_code"
}

run_setup() {
  local tool="$1"
  local repo="$2"
  local repo_path
  repo_path=$(get_repo_path "$repo")
  local setup_script="$TOOLS_DIR/$tool/setup.sh"

  if [[ ! -f "$setup_script" ]]; then
    return 0  # no setup required
  fi

  echo "  SETUP  tool=$tool repo=$repo"
  local setup_log="$OUTPUT_DIR/setup-$tool-$repo.log"
  mkdir -p "$OUTPUT_DIR"

  local setup_timeout
  setup_timeout=$(jq -r '.setup_timeout_seconds // 60' "$TOOLS_DIR/$tool/config.json")

  (
    cd "$repo_path"
    bash "$setup_script" "$repo_path"
  ) > "$setup_log" 2>&1 &
  local setup_pid=$!

  ( sleep "$setup_timeout" && kill "$setup_pid" 2>/dev/null ) &
  local setup_watchdog=$!

  local setup_exit=0
  wait "$setup_pid" 2>/dev/null || setup_exit=$?
  kill "$setup_watchdog" 2>/dev/null || true
  wait "$setup_watchdog" 2>/dev/null || true

  if [[ $setup_exit -ne 0 ]]; then
    echo "  SETUP FAILED  tool=$tool repo=$repo exit=$setup_exit (see $setup_log)" >&2
    return 1
  fi
  return 0
}

run_teardown() {
  local tool="$1"
  local repo="$2"
  local repo_path
  repo_path=$(get_repo_path "$repo")
  local teardown_script="$TOOLS_DIR/$tool/teardown.sh"

  if [[ ! -f "$teardown_script" ]]; then
    return 0
  fi

  echo "  TEARDOWN  tool=$tool repo=$repo"
  (
    cd "$repo_path"
    bash "$teardown_script" "$repo_path"
  ) >> "$OUTPUT_DIR/teardown-$tool-$repo.log" 2>&1 || {
    echo "  WARN: teardown failed for tool=$tool repo=$repo" >&2
  }
}

# ─── Main loop ───────────────────────────────────────────────────────────────

mkdir -p "$OUTPUT_DIR"

SESSION_COUNT=0
FAILED_COUNT=0

for tool in $SELECTED_TOOLS; do
  for repo in $SELECTED_REPOS; do

    # Collect tasks for this repo
    REPO_TASKS=""
    for tid in $SELECTED_TASKS; do
      _tr=$(get_task_repo "$tid")
      [[ "$_tr" == "$repo" ]] && REPO_TASKS="$REPO_TASKS$tid "
    done
    REPO_TASKS="${REPO_TASKS% }"

    [[ -z "$REPO_TASKS" ]] && continue

    _task_count=$(echo "$REPO_TASKS" | wc -w | tr -d ' ')
    echo ""
    echo "--- tool=$tool repo=$repo ($_task_count tasks) ---"

    # Run setup hook
    if ! run_setup "$tool" "$repo"; then
      mkdir -p "$OUTPUT_DIR/$tool/$repo"
      echo '{"skipped":true,"reason":"setup_failed"}' > "$OUTPUT_DIR/$tool/$repo/skipped-setup.json"
      echo "  SKIP  tool=$tool repo=$repo reason=setup_failed"
      continue
    fi

    if [[ "$PARALLEL" == "true" ]]; then
      PIDS=""
      for tid in $REPO_TASKS; do
        run_session "$tool" "$repo" "$tid" &
        PIDS="$PIDS$! "
        SESSION_COUNT=$(( SESSION_COUNT + 1 ))
      done
      for _p in $PIDS; do
        wait "$_p" 2>/dev/null || FAILED_COUNT=$(( FAILED_COUNT + 1 ))
      done
    else
      for tid in $REPO_TASKS; do
        run_session "$tool" "$repo" "$tid"
        SESSION_COUNT=$(( SESSION_COUNT + 1 ))
      done
    fi

    # Run teardown (even if some sessions failed)
    run_teardown "$tool" "$repo" || true

  done
done

echo ""
echo "=== All sessions complete ==="
echo "Sessions run:    $SESSION_COUNT"
echo "Failures:        $FAILED_COUNT"
echo ""

# ─── Write run record ────────────────────────────────────────────────────────
# Variables are already set in the current shell; source directly.

source "$SCRIPT_DIR/lib/write-record.sh"

# ─── Update manifest ─────────────────────────────────────────────────────────
# RECORD_FILE is exported by write-record.sh

source "$SCRIPT_DIR/lib/update-manifest.sh"

# ─── Summary table ───────────────────────────────────────────────────────────

echo ""
echo "=== Summary ==="
echo ""
printf "%-12s  %-10s  %-6s  %8s  %6s  %6s  %11s  %10s\n" \
  "Tool" "Repo" "Task" "Duration" "Tools" "Exit" "Compliance" "TokenScore"
printf "%-12s  %-10s  %-6s  %8s  %6s  %6s  %11s  %10s\n" \
  "----" "----" "----" "--------" "-----" "----" "----------" "----------"

for _tool in $SELECTED_TOOLS; do
  for _repo in $SELECTED_REPOS; do
    for _tid in $SELECTED_TASKS; do
      _tr=$(get_task_repo "$_tid")
      [[ "$_tr" == "$_repo" ]] || continue
      _meta="$OUTPUT_DIR/$_tool/$_repo/$_tid/meta.json"
      if [[ -f "$_meta" ]]; then
        _dur=$(jq -r '.duration_seconds'      "$_meta")
        _tc=$(jq -r '.total_tool_calls'       "$_meta")
        _ex=$(jq -r '.exit_code'              "$_meta")
        _cp=$(jq -r '.compliance_passed'      "$_meta")
        _ts=$(jq -r '.token_score // "n/a"'   "$_meta")
        printf "%-12s  %-10s  %-6s  %7ds  %6d  %6d  %11s  %10s\n" \
          "$_tool" "$_repo" "$_tid" "$_dur" "$_tc" "$_ex" "$_cp" "$_ts"
      fi
    done
  done
done

echo ""
echo "Output: $OUTPUT_DIR"
echo "Record: $EXPERIMENT/results/records/$RUN_ID.json"
echo ""
