# 010 — MCP vs CLI Efficiency for mnemex

**Date:** 2026-03-10
**Status:** Ready to run
**Evolved from:** Experiment 009 (mnemex vs Serena) and `autotest/mnemex/` standalone tests

## Motivation

Claude Code can access mnemex through two paths:

- **MCP tools** — Claude calls `mcp__mnemex__search`, `mcp__mnemex__symbol`, etc. via the MCP protocol. The mnemex MCP server handles the request and returns structured results.
- **CLI via Bash** — Claude runs `mnemex search "query"`, `mnemex symbol RunEntry`, etc. through the Bash tool. Output is plain text parsed by Claude.

Both paths access the same underlying index and produce equivalent information. The question: **which path is more efficient for an LLM agent?**

Hypotheses:
- MCP may be more efficient (fewer round-trips, structured output)
- CLI may be faster (lower protocol overhead, direct text output)
- MCP may produce better answers (structured data vs parsed text)

## Design

### 5 Test Prompts

| # | Task | MCP Tool | CLI Command |
|---|------|----------|-------------|
| 01 | Index status check | `index_status` / `get_status` | `mnemex status` |
| 02 | Semantic code search | `search` / `search_code` | `mnemex search "..."` |
| 03 | Architecture map | `map` | `mnemex map` |
| 04 | Symbol definition lookup | `symbol` / `define` | `mnemex symbol RunEntry` |
| 05 | Caller analysis | `callers` | `mnemex callers parseTranscript` |

### Isolation

Each variant runs in its own `claude -p` session with `--strict-mcp-config`:

- **MCP mode**: `mcp-mnemex.json` — only mnemex MCP server, no Bash/Read/Grep
- **CLI mode**: `mcp-empty.json` — no MCP servers, but Bash tool available for CLI commands

Prompts explicitly prohibit cross-method tool usage.

### Metrics Captured

| Metric | Source | Purpose |
|--------|--------|---------|
| `duration_seconds` | wall clock | Total task time |
| `total_tool_calls` | transcript | How many tool invocations |
| `bash_tool_calls` | transcript | Bash calls (should be 0 for MCP, >0 for CLI) |
| `transcript_lines` | file size | Proxy for token usage |
| `exit_code` | process | Success/failure |
| `timed_out` | watchdog | Hit 180s limit? |

### Parameters

- Timeout: 180s per test
- Max budget: $0.50 per session
- Model: Claude Sonnet (default `claude -p`)
- Target codebase: current working directory (or `--target-dir`)

## Running

```bash
# cd into the codebase you want to test, then run the harness
cd /path/to/your/codebase

# Run all 5 tests (sequential, both methods)
/path/to/mnemex-bench/experiments/010-mcp-vs-cli-efficiency/harness/run-comparison.sh

# Run in parallel (MCP + CLI simultaneously per test)
/path/to/mnemex-bench/experiments/010-mcp-vs-cli-efficiency/harness/run-comparison.sh --parallel

# Run specific tests
/path/to/mnemex-bench/experiments/010-mcp-vs-cli-efficiency/harness/run-comparison.sh --cases 02-search-code,04-symbol-lookup

# Or specify target explicitly
/path/to/mnemex-bench/experiments/010-mcp-vs-cli-efficiency/harness/run-comparison.sh --target-dir /path/to/repo
```

The harness defaults to the current working directory as the target codebase. It prints a summary table at the end comparing duration and tool counts.

## Expected Findings

Based on experiment 009 (mnemex vs Serena) preliminary data:

- MCP tools tend to produce fewer but richer tool calls (using mnemex MCP server)
- CLI may be faster wall-clock due to lower protocol overhead
- Claude may need multiple Bash calls to parse CLI text output vs one structured MCP response

## Analysis (TODO)

Build `analyze-comparison.ts` to:
1. Parse meta.json from each test/method pair
2. Verify compliance (MCP used no Bash, CLI used no MCP)
3. Compare efficiency metrics across methods
4. Grade answer correctness against expected outputs
5. Produce a structured report

## File Manifest

```
010-mcp-vs-cli-efficiency/
  README.md                 # This file
  test-cases.json           # Test definitions with per-method checks
  harness/
    run-comparison.sh       # Main harness script
    mcp-mnemex.json         # MCP config: mnemex server only
    mcp-empty.json          # MCP config: no servers (Bash only)
  prompts/
    mcp/                    # Prompts for MCP tool variant
      01-index-status.md
      02-search-code.md
      03-architecture-map.md
      04-symbol-lookup.md
      05-callers.md
    cli/                    # Prompts for CLI (Bash) variant
      01-index-status.md
      02-search-code.md
      03-architecture-map.md
      04-symbol-lookup.md
      05-callers.md
  results/                  # Run outputs (gitignored large transcripts)
    run-YYYYMMDD-HHMMSS/
      mcp/{test-id}/        # meta.json, transcript.jsonl, stderr.log
      cli/{test-id}/        # meta.json, transcript.jsonl, stderr.log
```
