# Experiment 011 — N-Way Code Tool Benchmark

Compare MCP-based code intelligence tools head-to-head on identical tasks using isolated Claude sessions.

## Status: Round 1 Complete

First clean run (`run-20260311-183933`): 12 sessions, 0 failures, 0 timeouts.

### Results Summary

| Tool | Median Duration | Median Tool Calls | Total Cost | Compliance | Token Score |
|------|----------------|-------------------|------------|------------|-------------|
| serena | 88s | 19 | $0.59 | 100% | 1.0 |
| bare-claude | 51s | 10 | $0.80 | 100% | 0.8* |
| mnemex | 234s | 19 | $0.83 | 100% | 1.0 |

*bare-claude scored 0.2 on T03 (cross-file trace on fastmcp), pulling median down.

### Per-Task Breakdown

| Tool | T01 (symbol/fastmcp) | T02 (symbol/tinygrad) | T03 (trace/fastmcp) | T04 (trace/tinygrad) |
|------|---------------------|----------------------|--------------------|--------------------|
| mnemex | 38s / $0.11 | 24s / $0.06 | 296s / $0.41 | 234s / $0.25 |
| serena | 22s / $0.07 | 15s / $0.04 | 98s / $0.28 | 88s / $0.20 |
| bare-claude | 25s / $0.08 | 10s / $0.03 | 284s / $0.51 | 51s / $0.17 |

### Observations

- **Serena** is fastest and cheapest across all tasks. LSP-based symbol resolution is highly efficient for both lookup and trace tasks.
- **bare-claude** (Read/Grep/Glob/Bash only) is competitive on simple lookups but expensive on cross-file traces.
- **mnemex** (semantic search + AST) is slowest, spending more tool calls on search iterations. May benefit from harder tasks where semantic search provides an advantage over exact-match tools.

## Design

### Tools Under Test

| Tool | MCP Prefix | Description |
|------|-----------|-------------|
| mnemex | `mcp__mnemex__` | Semantic code search + AST analysis |
| serena | `mcp__serena__` | LSP-based code intelligence (pyright, etc.) |
| bare-claude | (none) | Stock Claude with Read/Grep/Glob/Bash only |

Each tool has a config directory under `tools/<id>/` containing:
- `config.json` — tool metadata, designated MCP prefix, version command
- `mcp-config.json` — MCP server configuration passed to `claude --mcp-config`
- `system-prompt.md` — tool-specific instructions (restricts tool usage)
- `setup.sh` / `teardown.sh` — optional per-repo lifecycle hooks

### Tasks

Defined in `tasks.json`. Each task is bound to a specific repo.

| ID | Category | Repo | Description |
|----|----------|------|-------------|
| T01 | symbol-lookup | fastmcp | Find the `Client` class definition |
| T02 | symbol-lookup | tinygrad | Find the `Tensor.backward` method |
| T03 | cross-file-trace | fastmcp | Trace SSE transport data flow |
| T04 | cross-file-trace | tinygrad | Trace lazy evaluation pipeline |

### Repos

Defined in `repos.json`. Points to local clones under `../agentbench/data/eval-repos/`.

### Harness

`harness/run.sh` orchestrates the benchmark:

1. Discovers tools from `tools/*/config.json`
2. For each (tool, repo) pair, runs setup, executes tasks, runs teardown
3. Each task runs as an isolated `claude -p --strict-mcp-config` session
4. Captures stream-json transcripts for post-hoc analysis
5. Computes metrics: duration, tool calls, cost, compliance, token score
6. Writes per-session `meta.json` and aggregate run record

```
harness/run.sh [OPTIONS]
  --tools TOOL1,TOOL2      Tools to test (default: all)
  --repos REPO1,REPO2      Repos to test (default: all)
  --tasks T01,T02           Tasks to run (default: all)
  --timeout SECONDS         Per-session timeout (default: 300)
  --max-budget USD          Per-session budget cap (default: 1.00)
  --parallel                Run tasks within each (tool,repo) group in parallel
  --dry-run                 Print plan without executing
```

### Metrics

- **Duration** — wall-clock seconds per session
- **Tool calls** — total tool_use events in transcript
- **Designated tool calls** — calls matching the tool's MCP prefix
- **Compliance** — clean exit + used designated tools + no unauthorized MCP calls
- **Token score** — automated proxy: checks if expected keywords appear in final response (0.0-1.0)
- **Cost** — USD from Claude API billing (via stream-json result event)

### Output Structure

```
results/
  run-YYYYMMDD-HHMMSS/
    <tool>/<repo>/<task>/
      prompt.md            # exact prompt sent
      transcript.jsonl     # stream-json output
      stderr.log           # claude stderr
      meta.json            # computed metrics
  records/
    run-YYYYMMDD-HHMMSS.json  # aggregate run record
  runs.json                    # manifest of all runs
```

## Adding a New Tool

1. Create `tools/<id>/config.json`:
   ```json
   {
     "id": "mytool",
     "designated_tool_prefix": "mcp__mytool__",
     "min_designated_calls": 1,
     "requires_preindex": false
   }
   ```
2. Create `tools/<id>/mcp-config.json` with MCP server definition
3. Create `tools/<id>/system-prompt.md` restricting tool usage
4. Optionally add `setup.sh` / `teardown.sh` for per-repo lifecycle

## Next Steps

- Add more tools: cognee, qmd, bare-claude-lsp
- Add harder task categories: architecture-summary, bug-investigation
- Manual quality grading of session transcripts
- Multiple runs for statistical significance (Wilcoxon signed-rank tests)
- Larger repo set from the 12 eval repos in S3
