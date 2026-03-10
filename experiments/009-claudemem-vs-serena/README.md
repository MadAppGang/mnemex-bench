# 009 — Claudemem vs Serena Head-to-Head Comparison

**Date:** 2026-03-04
**Status:** Round 1 complete (preliminary)
**Source repo:** `mag/claude-code` (`autotest/claudemem/comparison/`)

## Motivation

Both claudemem and Serena provide MCP-based code intelligence to Claude Code. They take different architectural approaches:

- **claudemem** — Pre-built semantic index (embeddings + AST). Fewer, richer tool calls. Requires upfront indexing.
- **Serena** — LSP-backed on-demand queries. More tool calls, each individually lighter. No pre-indexing step.

This experiment measures which tool is more efficient for common code investigation tasks when Claude Code has access to only one of them.

## Design

### Isolation method

Each tool runs in its own `claude -p` session with `--strict-mcp-config`, ensuring Claude can ONLY use the specified MCP server (no Read, Grep, Glob, or Bash fallback).

### Test prompts (4 active, 1 skipped)

| ID | Task | Description |
|----|------|-------------|
| 01-find-symbol | Symbol definition lookup | Find `evaluate` function: file, line, signature, callers |
| 02-find-references | Cross-file reference search | Find ALL usages of `RunEntry` type across the codebase |
| 03-architecture-map | Architecture overview | Analyze `autotest/framework/` modules, data flow, centrality |
| 04-type-info | Type signature + impact analysis | `ResultsSummary` fields, consumers, change impact |
| 05-memory-write-read | Memory CRUD operations | Write/list/read/delete a memory entry (skipped — Serena lacks memory API) |

### MCP configs

- **claudemem:** `claudemem --mcp` with `CLAUDEMEM_LSP=true`
- **serena:** `uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context claude-code --project-from-cwd`

### Parameters

- Timeout: 180s (later runs) / 300s (initial runs)
- Max budget: $0.50 per session
- Model: Claude Sonnet (default `claude -p`)
- Target codebase: `mag/claude-code` (this repo, ~50 plugins + autotest framework)

## Results

### Run 7 (final, run-20260304-210656) — Best data

| Test | Claudemem Duration | Claudemem Tools | Serena Duration | Serena Tools |
|------|-------------------|-----------------|-----------------|--------------|
| 01-find-symbol | 32s | 3 | 39s | 6 |
| 02-find-references | 60s | 4 | 50s | 7 |
| 03-architecture-map | 102s | 11 | 82s | 13 |
| 04-type-info | 45s | 3 | 41s | 6 |
| **Average** | **59.8s** | **5.25** | **53.0s** | **8.0** |

### Run 2 (run-20260304-191541) — Earlier data (missing claudemem/01)

| Test | Claudemem Duration | Claudemem Tools | Serena Duration | Serena Tools |
|------|-------------------|-----------------|-----------------|--------------|
| 01-find-symbol | — | — | 44s | 7 |
| 02-find-references | 105s | 9 | 45s | 7 |
| 03-architecture-map | 102s | 20 | 140s | 26 |
| 04-type-info | 69s | 7 | 61s | 11 |

Runs 1, 3, 4, 5, 6 are empty or aborted (harness debugging iterations).

## Findings

### Claudemem: fewer tools, variable speed

- Averages **5.25 tool calls** vs Serena's **8.0** (34% fewer) in the final run
- Each claudemem call returns richer results (semantic search hits, PageRank maps)
- Duration is longer on average (59.8s vs 53.0s) — likely due to heavier per-call processing
- High variance between runs: run 2 had 9-20 tool calls vs run 7's 3-11 (index freshness or prompt sensitivity)

### Serena: more tools, consistent speed

- More tool calls but faster wall-clock in 3 of 4 tests (final run)
- LSP-backed queries are individually fast and well-scoped
- More consistent across runs (less variance in tool call counts)

### Neither tool clearly wins

- Claudemem is more efficient per-call but slower overall
- Serena is faster but chattier
- Answer correctness was NOT graded — only efficiency metrics were captured

## Known Limitations

1. **No correctness grading** — Meta.json captures duration/tool-count but not whether the answer was actually correct or complete
2. **Single model** — Only tested with Claude Sonnet; results may differ with other models
3. **Single codebase** — Only tested against `mag/claude-code`; different repo sizes/languages could change results
4. **Small sample** — 4 test prompts, 2 clean runs. Needs more prompts and statistical significance testing
5. **No cost tracking** — Token usage not captured (would show true cost-per-task)

## Future Work

1. **Add correctness grading** — Build an `analyze-comparison.ts` that reads transcripts and grades whether each tool produced a correct answer
2. **More test prompts** — Add cross-file refactoring, dead code detection, dependency analysis tasks
3. **Multiple models** — Run with Sonnet, Haiku, and external models via claudish
4. **Larger codebases** — Test against the 12 eval repos already indexed in S3 (`s3://mnemex-bench/archives/indexes-20260304-deepseek.tar.gz`)
5. **Cost analysis** — Capture input/output tokens per session for cost-per-task comparison

## Reproduction

```bash
cd /path/to/mag/claude-code

# Run all 4 prompts sequentially
./experiments/009-claudemem-vs-serena/harness/run-comparison.sh

# Run specific prompts
./experiments/009-claudemem-vs-serena/harness/run-comparison.sh --cases 01-find-symbol,03-architecture-map

# Run in parallel (claudemem + serena simultaneously)
./experiments/009-claudemem-vs-serena/harness/run-comparison.sh --parallel
```

Note: The harness expects to run from the `mag/claude-code` directory (the target codebase). Both `claudemem` and `uvx`/`serena` must be installed.

## File Manifest

```
009-claudemem-vs-serena/
  README.md                          # This file
  harness/
    run-comparison.sh                # Test harness (bash, runs claude -p with isolated MCP)
    mcp-claudemem.json               # MCP config: claudemem-only
    mcp-serena.json                  # MCP config: serena-only
  prompts/
    01-find-symbol.md                # Find function definition
    02-find-references.md            # Find type usages
    03-architecture-map.md           # Architecture analysis
    04-type-info.md                  # Type signature + impact
    05-memory-write-read.md.skip     # Memory CRUD (skipped, Serena lacks API)
  results/
    run-20260304-191355/             # Run 1 (empty, harness debugging)
    run-20260304-191541/             # Run 2 (partial, missing claudemem/01)
    run-20260304-192729/             # Run 3 (empty)
    run-20260304-193214/             # Run 4 (empty)
    run-20260304-210109/             # Run 5 (empty)
    run-20260304-210447/             # Run 6 (empty)
    run-20260304-210656/             # Run 7 (complete, best data)
      claudemem/{01,02,03,04}/       # meta.json + transcript.jsonl + stderr.log
      serena/{01,02,03,04}/          # meta.json + transcript.jsonl + stderr.log
```
