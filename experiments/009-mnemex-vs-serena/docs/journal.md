# Experiment 009 -- Mnemex vs Serena Head-to-Head Journal

Chronological log of all steps, runs, and findings from the 2-way MCP tool comparison.
Precursor to experiment 011 (N-Way Code Tool Benchmark), which generalized this to N tools.

---

## 2026-03-04 -- Harness Design and Implementation

### What was done

Designed and built a head-to-head comparison harness to measure mnemex vs Serena efficiency on identical code investigation tasks. Both tools provide MCP-based code intelligence to Claude Code but take fundamentally different architectural approaches:

- **mnemex** -- Pre-built semantic index (embeddings + AST). Fewer, richer tool calls. Requires upfront indexing.
- **Serena** -- LSP-backed on-demand queries. More tool calls, each individually lighter. No pre-indexing step.

Implemented `harness/run-comparison.sh` (~165 lines) with:
- Isolated `claude -p --strict-mcp-config` sessions ensuring each tool can ONLY use its own MCP server (no Read, Grep, Glob, or Bash fallback)
- Per-session watchdog timeout (300s initially, 180s in later runs)
- Budget cap: $0.50 per session
- Stream-json transcript capture for post-hoc analysis
- `meta.json` output per session with duration, exit code, tool call count, timeout flag

MCP configs:
- `harness/mcp-mnemex.json` -- `mnemex --mcp` with `MNEMEX_LSP=true`
- `harness/mcp-serena.json` -- `uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context claude-code --project-from-cwd`

### Test prompts (4 active, 1 skipped)

| ID | Task | Description |
|----|------|-------------|
| 01-find-symbol | Symbol definition lookup | Find `evaluate` function: file, line, signature, callers |
| 02-find-references | Cross-file reference search | Find ALL usages of `RunEntry` type across the codebase |
| 03-architecture-map | Architecture overview | Analyze `autotest/framework/` modules, data flow, centrality |
| 04-type-info | Type signature + impact analysis | `ResultsSummary` fields, consumers, change impact |
| 05-memory-write-read | Memory CRUD operations | Write/list/read/delete a memory entry (skipped -- Serena lacks memory API) |

Each prompt explicitly instructs the agent: "Use ONLY the MCP tools available to you. Do NOT use Read, Grep, Glob, or Bash tools."

### Parameters

- Model: Claude Sonnet (default `claude -p`)
- Target codebase: `mag/claude-code` (~50 plugins + autotest framework)
- Timeout: 300s (runs 1-4), 180s (runs 5-7)
- Max budget: $0.50 per session

### References

- Harness: `harness/run-comparison.sh`
- MCP configs: `harness/mcp-mnemex.json`, `harness/mcp-serena.json`
- Prompts: `prompts/01-find-symbol.md` through `prompts/04-type-info.md`

---

## 2026-03-04 -- Initial Runs: Debugging (Runs 1-6)

### What was done

Ran the harness 6 times, iterating on bugs and configuration issues. Only Run 2 produced usable data; the rest were empty or aborted.

### Run inventory

| Run | Timestamp | Meta Files | Transcripts | Status |
|-----|-----------|-----------|-------------|--------|
| 1 | run-20260304-191355 | 0 | 10 | Empty -- no meta.json written (harness bug) |
| 2 | run-20260304-191541 | 7 | 8 | Partial -- mnemex/01 missing meta.json |
| 3 | run-20260304-192729 | 0 | 6 | Empty -- aborted (config debugging) |
| 4 | run-20260304-193214 | 0 | 2 | Empty -- aborted early |
| 5 | run-20260304-210109 | 0 | 1 | Empty -- mnemex-only test, aborted |
| 6 | run-20260304-210447 | 0 | 1 | Empty -- mnemex-only test, aborted |

Run 1 had transcripts but no meta.json files, indicating the harness was capturing output but the meta-writing step failed (likely a path or variable issue). Runs 3-6 were progressively shorter as configuration issues were identified and fixed. Runs 5-6 only had a mnemex directory, suggesting serena config was being debugged separately.

### Bugs and failures

- Meta.json not written in Run 1 despite transcripts being captured
- mnemex/01-find-symbol missing meta.json in Run 2 (7 of 8 sessions have meta, 1 missing)
- Timeout set to 300s initially -- some sessions may have been killed by watchdog
- Multiple aborted runs while tuning MCP config paths and environment variables

### References

- Run 1: `results/run-20260304-191355/`
- Run 2: `results/run-20260304-191541/`
- Runs 3-6: `results/run-20260304-192729/` through `results/run-20260304-210447/`

---

## 2026-03-04 -- Run 2: Partial Results (run-20260304-191541)

### What was done

Run 2 produced the first usable data. All 8 sessions (4 tests x 2 tools) generated transcripts, but mnemex/01-find-symbol had no meta.json (the session ran but metrics were not recorded). Timeout was 180s for this run.

### Results

| Test | Mnemex Duration | Mnemex Tools | Serena Duration | Serena Tools |
|------|-----------------|--------------|-----------------|--------------|
| 01-find-symbol | -- | -- | 44s | 7 |
| 02-find-references | 105s | 9 | 45s | 7 |
| 03-architecture-map | 102s | 20 | 140s | 26 |
| 04-type-info | 69s | 7 | 61s | 11 |

### Key findings

- Serena dominated simple lookups: 44s/7 calls (01) and 45s/7 calls (02) vs mnemex's 105s/9 calls (02)
- Mnemex performed better on architecture mapping: 102s/20 calls vs Serena's 140s/26 calls -- the only test where mnemex was faster
- Both tools used significantly more tool calls than in Run 7: mnemex averaged 12 calls (vs 5.25 in Run 7), Serena averaged 12.75 calls (vs 8.0 in Run 7)
- High variance between Run 2 and Run 7 suggests prompt sensitivity or index freshness differences

### References

- Run directory: `results/run-20260304-191541/`
- Meta files: `results/run-20260304-191541/{mnemex,serena}/0*/meta.json`

---

## 2026-03-04 -- Run 7: Complete Results (run-20260304-210656)

### What was done

Run 7 was the final, clean run with all 8 sessions completing successfully. Timeout reduced to 180s. All sessions exited cleanly (exit code 0), no timeouts.

### Results

| Test | Mnemex Duration | Mnemex Tools | Serena Duration | Serena Tools |
|------|-----------------|--------------|-----------------|--------------|
| 01-find-symbol | 32s | 3 | 39s | 6 |
| 02-find-references | 60s | 4 | 50s | 7 |
| 03-architecture-map | 102s | 11 | 82s | 13 |
| 04-type-info | 45s | 3 | 41s | 6 |
| **Average** | **59.8s** | **5.25** | **53.0s** | **8.0** |

### Per-session detail from meta.json

| Session | Duration | Tool Calls | Transcript Lines | Timeout | Exit |
|---------|----------|-----------|------------------|---------|------|
| mnemex/01 | 32s | 3 | 20 | 180s | 0 |
| mnemex/02 | 60s | 4 | 24 | 180s | 0 |
| mnemex/03 | 102s | 11 | 43 | 180s | 0 |
| mnemex/04 | 45s | 3 | 20 | 180s | 0 |
| serena/01 | 39s | 6 | 30 | 180s | 0 |
| serena/02 | 50s | 7 | 33 | 180s | 0 |
| serena/03 | 82s | 13 | 45 | 180s | 0 |
| serena/04 | 41s | 6 | 26 | 180s | 0 |

### Key findings

- Serena faster in 3 of 4 tests (02, 03, 04). Mnemex faster only in 01-find-symbol (32s vs 39s).
- Mnemex used 34% fewer tool calls on average (5.25 vs 8.0), confirming the architectural hypothesis: pre-built index returns richer per-call results.
- Despite fewer calls, mnemex was 13% slower on average (59.8s vs 53.0s). The per-call processing overhead (semantic search, PageRank) exceeds the savings from fewer round trips.
- Architecture map (03) was the hardest task for both tools: 102s/11 calls (mnemex) and 82s/13 calls (serena). Complex multi-file analysis requires many lookups regardless of tool.

### References

- Run directory: `results/run-20260304-210656/`
- All meta.json: `results/run-20260304-210656/{mnemex,serena}/0*/meta.json`
- All transcripts: `results/run-20260304-210656/{mnemex,serena}/0*/transcript.jsonl`

---

## 2026-03-04 -- Comparison Analysis

### Mnemex: fewer tools, variable speed

Mnemex averaged 5.25 tool calls vs Serena's 8.0 in the final run -- a 34% reduction. Each mnemex call returns richer results (semantic search hits, PageRank-weighted symbol maps). However, wall-clock duration was longer on average (59.8s vs 53.0s), likely because heavier per-call processing (embedding lookup, reranking) offsets the round-trip savings.

High variance between runs was notable. Mnemex used 9-20 tool calls in Run 2 but only 3-11 in Run 7 for the same prompts. This suggests sensitivity to index freshness or non-determinism in the agent's search strategy.

### Serena: more tools, consistent speed

Serena made more tool calls but completed faster in 3 of 4 tests. Its LSP-backed queries are individually fast and well-scoped (go-to-definition, find-references). The tool showed less variance across runs -- Run 2 averaged 12.75 calls, Run 7 averaged 8.0 -- a narrower spread than mnemex.

### Head-to-head by task type

| Task Type | Winner (Duration) | Winner (Tool Calls) | Margin |
|-----------|-------------------|---------------------|--------|
| Symbol lookup (01) | Mnemex (32s vs 39s) | Mnemex (3 vs 6) | Mnemex by 7s |
| Reference search (02) | Serena (50s vs 60s) | Mnemex (4 vs 7) | Serena by 10s |
| Architecture map (03) | Serena (82s vs 102s) | Mnemex (11 vs 13) | Serena by 20s |
| Type info (04) | Serena (41s vs 45s) | Mnemex (3 vs 6) | Serena by 4s |

Mnemex consistently used fewer tool calls, but Serena was faster in wall-clock time for all tasks except simple symbol lookup.

### Run 2 vs Run 7 comparison

| Test | Mnemex Run 2 | Mnemex Run 7 | Serena Run 2 | Serena Run 7 |
|------|-------------|-------------|-------------|-------------|
| 01 | -- | 32s / 3 calls | 44s / 7 calls | 39s / 6 calls |
| 02 | 105s / 9 calls | 60s / 4 calls | 45s / 7 calls | 50s / 7 calls |
| 03 | 102s / 20 calls | 102s / 11 calls | 140s / 26 calls | 82s / 13 calls |
| 04 | 69s / 7 calls | 45s / 3 calls | 61s / 11 calls | 41s / 6 calls |

Both tools improved between Run 2 and Run 7, but the improvement was larger for mnemex (total calls dropped from ~36 to 21) than for Serena (~51 to 32). The harness or environment stabilization between runs likely contributed.

### Neither tool clearly wins

- Mnemex is more efficient per-call but slower overall.
- Serena is faster but chattier.
- Answer correctness was NOT graded -- only efficiency metrics were captured.
- Sample size (4 prompts, 2 clean runs) is too small for statistical significance testing.

---

## 2026-03-04 -- Known Limitations and Future Work

### Limitations

1. **No correctness grading** -- meta.json captures duration and tool-count but not whether the answer was actually correct or complete. A wrong-but-fast answer is worse than a slow-but-correct one.
2. **Single model** -- Only tested with Claude Sonnet (default `claude -p`). Results may differ substantially with other models (Haiku, Opus, external via claudish).
3. **Single codebase** -- Only tested against `mag/claude-code`. Different repo sizes, languages, and structures could change results. The 12 eval repos in S3 (`s3://mnemex-bench/archives/indexes-20260304-deepseek.tar.gz`) were not used.
4. **Small sample** -- 4 test prompts, 2 clean runs (Run 2 partial, Run 7 complete). Not enough data for Wilcoxon or any statistical significance test.
5. **No cost tracking** -- Token usage not captured. Tool call count is a proxy for cost but does not account for differences in prompt/response token volume.
6. **2-way only** -- Comparing mnemex vs Serena without a "bare Claude" (Read/Grep/Glob/Bash only) baseline. Cannot tell whether either tool is better than no tool.
7. **Prompt 05 skipped** -- Memory CRUD test dropped because Serena lacks a memory API. Reduces the comparison surface.

### Future work planned

1. **Add correctness grading** -- Build `analyze-comparison.ts` to read transcripts and grade whether each tool produced a correct, complete answer.
2. **More test prompts** -- Cross-file refactoring, dead code detection, dependency analysis.
3. **Multiple models** -- Run with Sonnet, Haiku, and external models via claudish.
4. **Larger codebases** -- Test against the 12 eval repos already indexed.
5. **Cost analysis** -- Capture input/output tokens per session for true cost-per-task comparison.
6. **Bare-Claude baseline** -- Add a "no MCP tool" condition using native Read/Grep/Glob/Bash.
7. **N-way generalization** -- Extend the 2-way harness to support N tools with pluggable configs.

### Follow-up: Experiment 011

All items 6 and 7 above were addressed by experiment 011 (N-Way Code Tool Benchmark), which generalized this 2-way comparison into an extensible N-tool framework. Experiment 011 added bare-claude as a third tool, expanded to 2 target repos (fastmcp, tinygrad), and introduced compliance checking, token scoring, and structured run records. The harness design in experiment 011 drew directly from lessons learned here -- particularly the need for `--strict-mcp-config` isolation, per-session watchdog timeouts, and structured meta.json output.

### References

- Experiment 011 journal: `../011-n-way-code-tool-benchmark/docs/journal.md`
- Experiment 011 first clean run: `../011-n-way-code-tool-benchmark/results/records/run-20260311-183933.json`
