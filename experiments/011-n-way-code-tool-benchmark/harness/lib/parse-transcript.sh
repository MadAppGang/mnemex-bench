#!/bin/bash
# parse-transcript.sh — Source this file to extract metrics from a stream-json transcript.
#
# Usage:
#   TRANSCRIPT_FILE=/path/to/transcript.jsonl
#   DESIGNATED_PREFIX="mcp__mnemex__"  # or "" for bare-claude
#   source harness/lib/parse-transcript.sh
#
# Exports:
#   INPUT_TOKENS          integer
#   OUTPUT_TOKENS         integer
#   COST_USD              float (total_cost_usd from result event)
#   TOTAL_TOOL_CALLS      integer (all tool_use content blocks in transcript)
#   DESIGNATED_TOOL_CALLS integer (calls starting with DESIGNATED_PREFIX)
#   UNAUTHORIZED_MCP_CALLS integer (mcp__ calls not matching DESIGNATED_PREFIX)
#   TRANSCRIPT_LINES      integer

# Requires: TRANSCRIPT_FILE and DESIGNATED_PREFIX to be set by caller

_transcript="${TRANSCRIPT_FILE:-}"
_prefix="${DESIGNATED_PREFIX:-}"

if [[ -z "$_transcript" || ! -f "$_transcript" ]]; then
  INPUT_TOKENS=0
  OUTPUT_TOKENS=0
  COST_USD=0.0
  TOTAL_TOOL_CALLS=0
  DESIGNATED_TOOL_CALLS=0
  UNAUTHORIZED_MCP_CALLS=0
  TRANSCRIPT_LINES=0
else
  # Token and cost extraction from the result event (last line with "type":"result")
  _result_line=$(grep '"type":"result"' "$_transcript" 2>/dev/null | tail -1 || true)

  if [[ -n "$_result_line" ]]; then
    INPUT_TOKENS=$(echo "$_result_line" | jq '.usage.input_tokens // 0' 2>/dev/null || echo 0)
    OUTPUT_TOKENS=$(echo "$_result_line" | jq '.usage.output_tokens // 0' 2>/dev/null || echo 0)
    COST_USD=$(echo "$_result_line" | jq '.total_cost_usd // 0.0' 2>/dev/null || echo 0.0)
  else
    # Fallback: look for any line with input_tokens
    _usage_line=$(grep '"input_tokens"' "$_transcript" 2>/dev/null | tail -1 || true)
    INPUT_TOKENS=$(echo "$_usage_line" | jq '.usage.input_tokens // .input_tokens // 0' 2>/dev/null || echo 0)
    OUTPUT_TOKENS=$(echo "$_usage_line" | jq '.usage.output_tokens // .output_tokens // 0' 2>/dev/null || echo 0)
    COST_USD=0.0
  fi

  # Clamp to safe defaults
  INPUT_TOKENS="${INPUT_TOKENS:-0}"
  OUTPUT_TOKENS="${OUTPUT_TOKENS:-0}"
  COST_USD="${COST_USD:-0.0}"

  # Count total tool_use events (tool_use appears as content inside assistant messages)
  TOTAL_TOOL_CALLS=$(grep -c '"type":"tool_use"' "$_transcript" 2>/dev/null || echo 0)

  # Count designated tool calls (by prefix match on tool name)
  if [[ -n "$_prefix" ]]; then
    DESIGNATED_TOOL_CALLS=$(grep -o "\"name\":\"${_prefix}[^\"]*\"" "$_transcript" 2>/dev/null | wc -l | tr -d ' ')
  else
    DESIGNATED_TOOL_CALLS=0
  fi

  # Count unauthorized MCP calls: mcp__ prefix but NOT the designated prefix
  if [[ -n "$_prefix" ]]; then
    UNAUTHORIZED_MCP_CALLS=$(grep -o '"name":"mcp__[^"]*"' "$_transcript" 2>/dev/null \
      | grep -v "\"name\":\"${_prefix}" \
      | wc -l | tr -d ' ' || echo 0)
  else
    # For bare-claude: any mcp__ call is unauthorized
    UNAUTHORIZED_MCP_CALLS=$(grep -o '"name":"mcp__[^"]*"' "$_transcript" 2>/dev/null \
      | wc -l | tr -d ' ' || echo 0)
  fi

  TRANSCRIPT_LINES=$(wc -l < "$_transcript" 2>/dev/null | tr -d ' ' || echo 0)
fi

export INPUT_TOKENS OUTPUT_TOKENS COST_USD TOTAL_TOOL_CALLS DESIGNATED_TOOL_CALLS UNAUTHORIZED_MCP_CALLS TRANSCRIPT_LINES
