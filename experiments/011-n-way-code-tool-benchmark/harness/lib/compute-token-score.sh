#!/bin/bash
# compute-token-score.sh — Source this file to compute how many expected_tokens appear
# in the final assistant message of a transcript.
#
# Usage:
#   TRANSCRIPT_FILE=/path/to/transcript.jsonl
#   EXPECTED_TOKENS_JSON='["token1","token2","token3"]'
#   source harness/lib/compute-token-score.sh
#
# Exports:
#   TOKEN_SCORE   float in [0.0, 1.0], or "null" if expected_tokens is empty

_transcript="${TRANSCRIPT_FILE:-}"
_tokens_json="${EXPECTED_TOKENS_JSON:-[]}"

# Check if expected_tokens array is empty
_token_count=$(echo "$_tokens_json" | jq 'length' 2>/dev/null || echo 0)

if [[ "$_token_count" -eq 0 ]]; then
  TOKEN_SCORE="null"
elif [[ -z "$_transcript" || ! -f "$_transcript" ]]; then
  TOKEN_SCORE="null"
else
  # Extract the final assistant text message from the transcript
  # The result event contains the full final response in .result field
  _result_line=$(grep '"type":"result"' "$_transcript" 2>/dev/null | tail -1 || true)

  if [[ -n "$_result_line" ]]; then
    _final_text=$(echo "$_result_line" | jq -r '.result // ""' 2>/dev/null || echo "")
  else
    # Fallback: extract last assistant text content block
    _final_text=$(grep '"type":"text"' "$_transcript" 2>/dev/null | tail -1 \
      | jq -r '.text // .message.content[]?.text // ""' 2>/dev/null || echo "")
  fi

  if [[ -z "$_final_text" ]]; then
    TOKEN_SCORE=0.0
  else
    # Count how many expected tokens appear (case-insensitive) in the final text
    _matched=0
    _total="$_token_count"

    # Iterate over expected tokens using jq to extract each one
    while IFS= read -r _token; do
      # Case-insensitive grep for the token in the final text
      if echo "$_final_text" | grep -qiF "$_token" 2>/dev/null; then
        _matched=$((_matched + 1))
      fi
    done < <(echo "$_tokens_json" | jq -r '.[]' 2>/dev/null)

    # Compute score as float using awk
    TOKEN_SCORE=$(awk "BEGIN { printf \"%.4f\", $_matched / $_total }")
  fi
fi

export TOKEN_SCORE
