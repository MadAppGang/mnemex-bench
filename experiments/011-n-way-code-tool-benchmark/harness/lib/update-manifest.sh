#!/bin/bash
# update-manifest.sh — Source this file to atomically append a run entry to results/runs.json.
#
# Required variables (set by caller before sourcing):
#   EXPERIMENT        path to experiment root
#   RUN_ID            run identifier string
#   RECORD_FILE       path to the run record JSON file
#   SELECTED_TOOLS    space-separated list of tool IDs
#   SELECTED_REPOS    space-separated list of repo names
#   SELECTED_TASKS    space-separated list of task IDs

_manifest="$EXPERIMENT/results/runs.json"

# Initialize manifest if missing
if [[ ! -f "$_manifest" ]]; then
  echo '{"schema_version":"1","runs":[]}' > "$_manifest"
fi

# Build JSON arrays from space-separated lists
_tools_json=$(echo "$SELECTED_TOOLS" | tr ' ' '\n' | jq -R . | jq -s . 2>/dev/null || echo "[]")
_repos_json=$(echo "$SELECTED_REPOS" | tr ' ' '\n' | jq -R . | jq -s . 2>/dev/null || echo "[]")
_tasks_json=$(echo "$SELECTED_TASKS" | tr ' ' '\n' | jq -R . | jq -s . 2>/dev/null || echo "[]")

_record_rel="records/$RUN_ID.json"

# Build the new entry
_new_entry=$(jq -n \
  --arg run_id "$RUN_ID" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson tools "$_tools_json" \
  --argjson repos "$_repos_json" \
  --argjson tasks "$_tasks_json" \
  --arg record "$_record_rel" \
  '{
    run_id: $run_id,
    timestamp: $ts,
    tools: $tools,
    repos: $repos,
    tasks: $tasks,
    record_path: $record,
    compliance_rates: {},
    median_grades: {}
  }' 2>/dev/null)

# Atomic append via temp file
_tmp="$_manifest.tmp.$$"
jq --argjson entry "$_new_entry" '.runs += [$entry]' "$_manifest" > "$_tmp" && mv "$_tmp" "$_manifest"

echo "Manifest updated: $_manifest"
