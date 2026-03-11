#!/bin/bash
# write-record.sh — Source this file to assemble a run record JSON from all meta.json files.
#
# Required variables (set by caller before sourcing):
#   OUTPUT_DIR          path to the run's output directory
#   EXPERIMENT          path to the experiment root
#   RUN_ID              run identifier string
#   HARNESS_VER         harness version string
#   TASKS_VERSION       tasks.json version
#   TIMEOUT             timeout in seconds
#   MAX_BUDGET          max budget in USD
#   SELECTED_TOOLS      space-separated list of tool IDs
#   SELECTED_REPOS      space-separated list of repo names
#   SELECTED_TASKS      space-separated list of task IDs
#   TOOL_VERSIONS_JSON  JSON object mapping tool_id -> version string
#
# Exports:
#   RECORD_FILE         path to the written record file

_record_file="$EXPERIMENT/results/records/$RUN_ID.json"
mkdir -p "$(dirname "$_record_file")"

# Collect all meta.json files from the run directory
# Use find and store as newline-separated, then slurp with jq
_meta_list=$(find "$OUTPUT_DIR" -name "meta.json" 2>/dev/null || true)

if [[ -z "$_meta_list" ]]; then
  _sessions_json="[]"
  _aggregate_json="{}"
else
  # Build sessions array by slurping all meta.json files
  _sessions_json=$(echo "$_meta_list" | xargs jq -s '.' 2>/dev/null || echo "[]")

  # Compute per-tool aggregates
  _aggregate_json=$(echo "$_sessions_json" | jq '
    group_by(.tool) |
    map({
      key: .[0].tool,
      value: {
        n: length,
        compliance_rate: ((map(select(.compliance_passed == true)) | length) / length),
        median_duration_s: (map(.duration_seconds) | sort | .[((length / 2) | floor)]),
        median_tool_calls: (map(.total_tool_calls) | sort | .[((length / 2) | floor)]),
        median_token_score: (
          [.[].token_score | numbers] |
          if length == 0 then null
          else sort | .[((length / 2) | floor)]
          end
        ),
        timeout_rate: ((map(select(.timed_out == true)) | length) / length),
        total_cost_usd: (map(.cost_usd) | add)
      }
    }) | from_entries
  ' 2>/dev/null || echo "{}")
fi

# Build JSON arrays from space-separated strings
_tools_json=$(echo "$SELECTED_TOOLS" | tr ' ' '\n' | jq -R . | jq -s .)
_repos_json=$(echo "$SELECTED_REPOS" | tr ' ' '\n' | jq -R . | jq -s .)
_tasks_json=$(echo "$SELECTED_TASKS" | tr ' ' '\n' | jq -R . | jq -s .)
_tool_versions="${TOOL_VERSIONS_JSON:-{}}"

# Write the record atomically
_tmp="$_record_file.tmp.$$"
jq -n \
  --arg  schema       "1" \
  --arg  run_id       "$RUN_ID" \
  --arg  ts           "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg  harness_ver  "$HARNESS_VER" \
  --arg  tasks_ver    "$TASKS_VERSION" \
  --argjson tools     "$_tools_json" \
  --argjson repos     "$_repos_json" \
  --argjson tasks     "$_tasks_json" \
  --argjson timeout   "$TIMEOUT" \
  --argjson budget    "$MAX_BUDGET" \
  --argjson tool_versions "$_tool_versions" \
  --argjson sessions  "$_sessions_json" \
  --argjson aggregate "$_aggregate_json" \
  '{
    schema_version:   $schema,
    run_id:           $run_id,
    timestamp:        $ts,
    harness_version:  $harness_ver,
    tasks_version:    $tasks_ver,
    tools:            $tools,
    repos:            $repos,
    tasks:            $tasks,
    timeout_seconds:  $timeout,
    max_budget_usd:   $budget,
    tool_versions:    $tool_versions,
    sessions:         $sessions,
    aggregate:        $aggregate
  }' > "$_tmp" && mv "$_tmp" "$_record_file"

echo "Run record: $_record_file"
RECORD_FILE="$_record_file"
export RECORD_FILE
