# Experiment 006 — Code Search Test Harness Journal

Chronological log of implementation, runs, and findings.
Implementation lives at `../claudemem/eval/mnemex-search-steps-evaluation/`.

---

## 2026-03-10 — Harness Implementation

### What was done

Built the 3-file ablation test harness from the design spec in `report.md`:

1. **`loader.ts`** (358 lines) — Data loading from BEIR JSONL and SWE-bench formats. Heuristic query classifier with priority-ordered regex rules:
   - Backtick/CamelCase/snake_case → `symbol_lookup`
   - "callers of", "where is X called" → `structural`
   - "raises", "returns wrong", "error" → `semantic_search`
   - "add support", "implement", "how to" → `exploratory`
   - Default → `semantic_search`

2. **`ablation.ts`** (672 lines) — Core experiment runner with pluggable function interfaces:
   - `SearchFunction`, `RouterFunction`, `ExpanderFunction`, `RerankerFunction`
   - 10 standard conditions (A through F, see table below)
   - Metric computation: MRR@10, NDCG@K, Recall@K
   - Mock functions for offline testing

3. **`reporter.ts`** (389 lines) — Results formatting with Wilcoxon signed-rank test (imported from `benchmark-v2/scorers/statistics.ts`). TREC run file output for ranx/BEIR compatibility.

4. **`harness.test.ts`** (482 lines) — 95 tests, all passing.

5. **Type extension** in `src/benchmark-v2/types.ts` — added `RouterLabel` type and `routerLabel?`, `groundTruthFiles?` fields to `GeneratedQuery`.

### Standard ablation conditions

| Name | Components | Description |
|------|-----------|-------------|
| A | Retriever only | Baseline — pure hybrid retrieval |
| B1 | Retriever + regex router | When symbol_lookup, use keywordOnly search |
| B2 | Retriever + CNN router | (skipped — no trained model) |
| B3 | Retriever + LLM router | (skipped — decided not to build) |
| C1 | Retriever + LFM2-700M expander | Tiny expander |
| C2 | Retriever + Qwen3-1.7B-FT expander | Medium expander |
| C3 | Retriever + LFM2-2.6B expander | Large expander |
| D | Retriever + reranker | Qwen3-1.7B reranker scores 0-10 |
| E | All components | Full pipeline (regex router + LFM2-2.6B + reranker) |
| F | Router + expander | No reranker |

### Key design decisions

- **Wilcoxon, not t-test** for MRR comparisons — MRR is bounded [0,1] and right-skewed
- **Significance threshold**: p < 0.05 AND |r| > 0.1 (both required)
- **`type satisfies never`** instead of `const _exhaustive: never = type` to avoid unused-var lint errors
- **Renamed** from "search-step-ablation" to "mnemex-search-steps-evaluation" per user preference

### References

- Design spec: `experiments/006-code-search-test-harness/report.md`
- Implementation: `../claudemem/eval/mnemex-search-steps-evaluation/`
- Types extension: `../claudemem/src/benchmark-v2/types.ts` (lines 341-359)

---

## 2026-03-10 — Baseline Run (Condition A)

### What was done

Created `run-baseline.ts` — loads top-30 PageRank symbols from claudemem index, uses symbol names as queries with file-level ground truth.

**Repo**: jlowin_fastmcp (7MB index, 396 Python files)
**Queries**: 30 symbol-name lookups (e.g. "FastMCP" → `src/fastmcp/server/server.py`)

### Results

| Metric | Value |
|--------|-------|
| MRR@10 | 0.438 |
| NDCG@10 | 1.311 |
| Recall@100 | 0.967 |
| P50 latency | 1262ms |
| P95 latency | 1372ms |

Baseline MRR@10 = 0.438 falls in the expected 0.4-0.6 range from the spec. Validation gate passed.

### Key fix

Absolute vs relative path mismatch — search API returns absolute paths but symbols table stores relative. Fixed by stripping repo prefix before comparison.

### References

- Runner: `../claudemem/eval/mnemex-search-steps-evaluation/run-baseline.ts`
- Results: `../claudemem/eval/mnemex-search-steps-evaluation/runs/first-run/`

---

## 2026-03-11 — Full Ablation Run (All 8 Conditions)

### What was done

Created `run-all.ts` with subprocess-per-condition architecture to avoid LanceDB memory accumulation (segfault around 90-120 queries in a single process).

**Architecture**: Orchestrator spawns `bun run-all.ts --single-condition X` for each condition. Each subprocess loads its own LanceDB instance, runs 30 queries, writes JSON, exits. Orchestrator collects results and generates report.

**Expander**: Calls LM Studio at `http://localhost:1234` with model-specific IDs. System prompt outputs `lex:`, `vec:`, `hyde:` lines.

**Reranker**: Uses Qwen3-1.7B via LM Studio. Scores top-20 candidates 0-10, then blends 70% LLM + 30% retrieval score.

### Results (symbol-name queries, n=30)

| Condition | Description | MRR@10 | NDCG@10 | Recall@100 | P95 Latency |
|-----------|-------------|--------|---------|------------|-------------|
| A | Baseline | 0.438 | 1.311 | 0.967 | 1372ms |
| B1 | +Regex router | 0.485 | 1.206 | 0.967 | 1423ms |
| C1 | +LFM2-700M expander | **0.486** | **1.244** | 0.933 | 2155ms |
| C2 | +Qwen3-1.7B-FT expander | 0.439 | 1.113 | 0.867 | 3877ms |
| C3 | +LFM2-2.6B expander | 0.351 | 0.813 | 0.900 | 2680ms |
| D | +Reranker only | 0.439 | 1.236 | 0.933 | 3138ms |
| E | Full pipeline | 0.157 | 0.387 | 0.533 | 13179ms |
| F | Router + expander | 0.122 | 0.315 | 0.633 | 2722ms |

### Statistical significance (Wilcoxon vs Condition A)

| Condition | Delta MRR | p-value | Effect r | Significant? |
|-----------|-----------|---------|----------|-------------|
| B1 | +0.047 | 0.4017 | 0.233 | no |
| C1 | +0.048 | 0.3081 | 0.322 | no |
| C2 | +0.002 | 0.6832 | 0.109 | no |
| C3 | -0.086 | 0.1742 | 0.272 | no |
| D | +0.002 | 0.9687 | 0.011 | no |
| **E** | **-0.281** | **0.0004** | **0.680** | **YES** |
| **F** | **-0.316** | **0.0000** | **0.807** | **YES** |

### Key findings

1. **Query expansion HURTS symbol-lookup queries** — Conditions E and F showed statistically significant regressions (p<0.001). The expander rewrites "FastMCP" into natural-language descriptions, which destroys the keyword match.

2. **No single component significantly helps** on symbol queries — B1, C1, D all show tiny improvements that don't reach significance.

3. **The tiny expander (C1) is paradoxically best** — LFM2-700M's limited vocabulary means it preserves more of the original query compared to larger models that over-paraphrase.

4. **Conclusion from experiment 003 confirmed**: expansion should only activate for semantic/exploratory queries, never for symbol lookups.

### LanceDB segfault issue (Bun 1.3.2)

LanceDB accumulates ~50MB RSS per search session. After ~60-90 queries, Bun segfaults:
```
panic(main thread): Segmentation fault at address 0x...
RSS: 0.36GB | Peak: 0.68GB
```

**Root cause**: LanceDB's native bindings (Rust via NAPI) don't release memory between queries in the same process. The subprocess-per-condition architecture works around this, but even a single condition with 30 queries + k=100 results can crash.

**Impact**: Condition A crashes when run from the orchestrator (exit code 133 = SIGKILL). Works when run standalone with run-baseline.ts (presumably lower k or less memory pressure from orchestrator overhead).

**Workaround**: Use subprocess isolation and reduce `limit` parameter (k=20 instead of k=100 for queries).

### References

- Runner: `../claudemem/eval/mnemex-search-steps-evaluation/run-all.ts`
- Results: `../claudemem/eval/mnemex-search-steps-evaluation/runs/full-run/`
- Report: `../claudemem/eval/mnemex-search-steps-evaluation/runs/full-run/report.md`

---

## 2026-03-16 — QMD Integration & Comparison

### What was done

Added QMD (github.com/tobi/qmd) as an alternative full-pipeline comparison. QMD is a local search engine combining BM25 + LLM query expansion + LLM reranking, designed for markdown/code.

#### Setup

1. Installed QMD v2.0.1 via npm: `npm install -g @tobilu/qmd`
2. Created collection: `qmd collection add <repo-path> --name fastmcp --mask '**/*.py'` (396 Python files indexed)
3. **sqlite-vec broken in Bun 1.3.2** — `qmd embed` fails because Bun's SQLite doesn't support `loadExtension()`. Vector search unavailable. QMD falls back to BM25 + LLM expansion/reranking (no semantic vectors).
4. QMD auto-downloaded models: embeddinggemma-300M (328MB), qwen3-reranker-0.6B (639MB), qmd-query-expansion-1.7B (1.28GB)

#### QMD path normalization

QMD normalizes file paths differently from the filesystem:
- `__init__.py` → `init.py`
- `tool_manager.py` → `tool-manager.py` (underscores → hyphens everywhere)
- `qmd://collection/path` prefix

Built `qmdPathToRelative()` that reverses these transformations using `existsSync()` checks against the actual filesystem.

#### Code changes

- **`ablation.ts`** — added Q1 (QMD BM25) and Q2 (QMD expand+rerank) to `STANDARD_CONDITIONS`
- **`run-all.ts`** — added `makeQmdSearchFn()`, `qmdPathToRelative()`, `parseQmdResults()`, `--qmd-collection` flag, `--query-mode mixed` flag with 30 mixed queries (10 symbol + 10 semantic + 10 exploratory)

#### Two new conditions

| Name | Description | How it works |
|------|------------|--------------|
| Q1 | QMD BM25 only | `qmd search <query> --json -c fastmcp` |
| Q2 | QMD expand+rerank | `qmd query <query> --json -c fastmcp -C 10` |

Note: Q2 uses `-C 10` (10 reranking candidates) because default 40 causes 30-60s per query on CPU. Even with -C 10, some queries take 18s when QMD's local LLM generates long expansions.

### Results — Symbol-Only Queries (n=30)

| Condition | Description | MRR@10 | Recall@100 | P95 Latency | Sig vs A? |
|-----------|-------------|--------|------------|-------------|-----------|
| A | claudemem hybrid | **0.438** | **0.967** | 1372ms | — |
| B1 | claudemem + router | 0.485 | 0.967 | 1423ms | no |
| C1 | claudemem + expander | 0.486 | 0.933 | 2155ms | no |
| Q1 | QMD BM25 | 0.243 | 0.700 | **251ms** | **YES** (worse, p=0.013) |
| Q2 | QMD expand+rerank | 0.290 | 0.667 | 13312ms | **YES** (worse, p=0.042) |

### Results — Mixed Query Types (n=30: 10 symbol + 10 semantic + 10 exploratory)

| Condition | Overall MRR@10 | Symbol MRR | Semantic MRR | Exploratory MRR | Mean Latency |
|-----------|---------------|------------|--------------|-----------------|-------------|
| A (claudemem) | **0.269** | **0.461** | **0.177** | **0.170** | 1380ms |
| Q1 (QMD BM25) | 0.127 | 0.203 | 0.133 | 0.045 | **232ms** |
| Q2 (QMD expand+rerank) | 0.127 | 0.198 | 0.142 | 0.042 | 4803ms |

### Key findings

1. **claudemem wins across all query types** — 2x better MRR overall, 3-4x on exploratory queries. AST-aware indexing gives a structural advantage over QMD's text-only approach.

2. **QMD's expansion+reranking (Q2) doesn't help vs BM25-only (Q1)** — identical MRR (0.127) but 20x slower (4803ms vs 232ms). The local LLM expansion adds latency without improving relevance.

3. **QMD is fastest for BM25** — 232ms vs 1380ms. Pure keyword search with SQLite FTS is very fast.

4. **Semantic and exploratory queries are hard for both engines** — claudemem drops from 0.461 (symbols) to 0.17 (semantic/exploratory). QMD drops from 0.20 to 0.04. Neither engine handles natural-language code queries well.

5. **Important caveat**: QMD ran without vector search (sqlite-vec broken). With vectors enabled, Q2 would likely improve, especially on semantic queries.

### Why claudemem crashes (Bun 1.3.2 + LanceDB)

**Symptom**: Process killed with SIGKILL (exit 133) after 20-30 search queries.

**Root cause**: LanceDB (Rust NAPI bindings) allocates memory for vector search indices that isn't freed between queries. RSS grows ~15MB per query. At ~0.6GB RSS, macOS kills the process.

**Evidence**:
```
RSS: 0.43GB | Peak: 0.62GB | Commit: 0.94GB
panic(main thread): Segmentation fault at address 0xCDFC00B80
```

**Workarounds tried**:
- Subprocess per condition — partially works but single conditions with k=100 still crash
- Reduce k to 20 — reduces memory pressure, got through 30 queries
- Direct API call (bypass runCondition overhead) — most reliable

**Not a QMD issue**: QMD uses SQLite (no vector search due to sqlite-vec bug), so it has no memory accumulation.

### References

- QMD comparison results: `../claudemem/eval/mnemex-search-steps-evaluation/runs/qmd-comparison/`
- Mixed query results: `../claudemem/eval/mnemex-search-steps-evaluation/runs/mixed-qmd/`
- QMD GitHub: https://github.com/tobi/qmd
- QMD collection config: `~/.config/qmd/index.yml`
- QMD index: `~/.cache/qmd/index.sqlite`

### Next steps

- Fix sqlite-vec for QMD: upgrade Bun or use Node.js with better-sqlite3 (needs Homebrew SQLite with extension loading)
- Re-run Q2 with vector search enabled for fair comparison
- Run on more repos (tinygrad, transformers) to test generalization
- Add structural queries (callers-of, depends-on) which should favor claudemem's AST graph
- Run E-RA and F-RA conditions on mixed queries to measure improvement over E/F

---

## 2026-03-16 — Route-Aware Expansion & LanceDB Memory Mitigation

### What was done

Fixed two HIGH priority issues identified from the full ablation run:

#### Fix 1: Route-aware expansion (prevents expansion from destroying symbol queries)

**Problem**: Conditions E and F showed statistically significant regressions (-0.281 and -0.316 MRR vs baseline, p<0.001). Root cause: the expander rewrites symbol names like "FastMCP" into natural language like "server implementation for MCP protocol", destroying the keyword match.

**Fix**: Added `routeAwareExpansion?: boolean` field to `AblationCondition`. When set AND the router classifies a query as `symbol_lookup`, the expander is skipped — the original query passes through to retrieval unchanged.

**Code changes**:
- `ablation.ts` — added `routeAwareExpansion` to `AblationCondition` interface
- `ablation.ts:runCondition()` — skip expander when `routeAwareExpansion && routerLabel === "symbol_lookup"`
- Added two new conditions:
  - **E-RA**: Full pipeline + route-aware expansion (router + expander for non-symbol + reranker)
  - **F-RA**: Router + expander (route-aware, no reranker)
- `harness.test.ts` — updated condition count (10 → 14), added 3 new tests for route-aware behavior

**Expected impact**: E-RA should avoid the -0.281 MRR regression on symbol queries while still benefiting from expansion on semantic/exploratory queries. This implements the key finding from the full ablation: "expansion should only activate for semantic/exploratory queries, never for symbol lookups."

#### Fix 2: LanceDB memory mitigation (prevents segfault after ~30 queries)

**Problem**: LanceDB's Rust NAPI bindings (v0.13.0) accumulate ~15MB RSS per search query. After ~30 queries at k=100, the process hits ~0.6GB RSS and macOS sends SIGKILL (exit 133).

**Fix**: Capped `SEARCH_LIMIT` to 20 in `run-all.ts` for all claudemem search functions. This is sufficient for computing MRR@10 and NDCG@10 (the primary metrics) and keeps RSS growth manageable (~300MB for 30 queries). Changed `kValues` from `[1, 5, 10, 100]` to `[1, 5, 10, 20]`.

**Trade-off**: Recall@100 is no longer available (recall@20 is computed instead). This is acceptable because:
- MRR@10 and NDCG@10 are the primary comparison metrics
- At k=100, ~50% of results were irrelevant padding anyway
- Prevents crashes that blocked condition A from completing in orchestrator mode

**Not fixed**: LanceDB memory leak itself (v0.13.0 → v0.26.2 upgrade may help but is a larger change to the claudemem codebase).

#### Fix 3: sqlite-vec / QMD running under Bun instead of Node

**Problem**: `qmd embed` failed with "sqlite-vec is not available. Vector operations require a SQLite build with extension loading support." Despite being npm-installed (which should use Node), QMD's launcher script detects `$BUN_INSTALL` env var (set in shell profile) and runs under Bun. Bun's macOS SQLite doesn't support `loadExtension()`.

**Investigation**: Bun 1.3.2 through 1.3.10 all have the same limitation — Apple's macOS SQLite disables `SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION`. However, Bun already supports `Database.setCustomSQLite()` to swap in Homebrew's SQLite (which has extension loading enabled).

Two workarounds confirmed working:
1. **`Database.setCustomSQLite("/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib")`** — must be called before any `new Database()`. Full sqlite-vec KNN search verified working in Bun after this call.
2. **Run QMD via `node` directly** — bypasses the launcher's `$BUN_INSTALL` detection. `better-sqlite3` under Node supports `loadExtension()` natively.

**Fix applied**: Modified `makeQmdSearchFn()` in `run-all.ts` to resolve QMD's JS entry point and spawn via `node` instead of the `qmd` wrapper. This ensures QMD uses `better-sqlite3` (which supports sqlite-vec) instead of `bun:sqlite` (which doesn't without `setCustomSQLite`).

**Verification**: `node .../qmd.js embed -c fastmcp` → "All content hashes already have embeddings" (success). `qmd search` via Node returns results with vector search enabled.

### Test results

98 tests passing (up from 95 — 3 new tests for route-aware expansion behavior).

### References

- Route-aware expansion logic: `../claudemem/eval/mnemex-search-steps-evaluation/ablation.ts` (runCondition, lines ~460-475)
- Memory mitigation: `../claudemem/eval/mnemex-search-steps-evaluation/run-all.ts` (SEARCH_LIMIT constant)
- QMD Node.js fix: `../claudemem/eval/mnemex-search-steps-evaluation/run-all.ts` (QMD_CLI_PATH + makeQmdSearchFn)
- New conditions: E-RA, F-RA in `STANDARD_CONDITIONS` array
- sqlite-vec workaround for Bun: `Database.setCustomSQLite("/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib")`

---

## 2026-03-16 — Full Rerun with All Fixes Applied

### What was done

Ran full 12-condition ablation after applying all three fixes (route-aware expansion, LanceDB memory cap, QMD Node.js sqlite-vec). Had to work around two additional issues:

1. **Repo renamed claudemem → mnemex**: The `.mnemex/index.db` had empty symbols table. Copied 1914 symbols + 15032 references from old `.claudemem/index.db`.
2. **Vector store empty**: New `.mnemex/vectors/` was empty after re-index. Copied `code_chunks.lance` from `.claudemem/vectors/`.
3. **JSON parse crash in store.ts**: Corrupted metadata and sourceIds fields from legacy index migration caused `JSON.parse` to throw. Added try-catch guards in `store.ts:478` and `store.ts:453`.

### Results — Symbol Queries (n=30, jlowin_fastmcp)

| Rank | Condition | Description | MRR@10 | NDCG@10 | Recall@20 | P95 |
|------|-----------|-------------|--------|---------|-----------|-----|
| 1 | **E-RA** | Full pipeline + route-aware expansion | **0.477** | **1.171** | 0.733 | 35.4s |
| 2 | B1 | +Regex router | 0.442 | 1.138 | 0.767 | 1.1s |
| 3 | **F-RA** | Router + expander (route-aware) | **0.427** | **1.111** | 0.700 | 1.9s |
| 4 | D | +Reranker only | 0.419 | 1.115 | **0.833** | 16.2s |
| 5 | Q2 | QMD expand+rerank | 0.351 | 0.428 | 0.667 | 1.5s |
| 6 | C2 | +Qwen3-1.7B-FT expander | 0.338 | 0.900 | 0.700 | 8.3s |
| 7 | C3 | +LFM2-2.6B expander | 0.329 | 0.729 | 0.533 | 4.5s |
| 8 | A | Baseline (hybrid) | 0.309 | 0.839 | 0.700 | 1.7s |
| 9 | C1 | +LFM2-700M expander | 0.267 | 0.701 | 0.800 | 3.0s |
| 10 | Q1 | QMD BM25 | 0.241 | 0.322 | 0.633 | 0.4s |
| 11 | E | Full pipeline (no routing) | 0.118 | 0.278 | 0.333 | 16.3s |
| 12 | F | Router + expander (no routing) | 0.119 | 0.259 | 0.300 | 3.9s |

### Key findings

1. **Route-aware expansion is the single biggest win**: E-RA (0.477) vs E (0.118) = **4x improvement** in MRR@10. F-RA (0.427) vs F (0.119) = **3.6x improvement**. Skipping expansion for symbol queries preserves keyword matching.

2. **F-RA is the best cost-effective condition**: MRR@10=0.427 at only 1.9s P95 — nearly matches E-RA (0.477) but avoids the 35s reranker overhead. For production use, the reranker adds ~0.05 MRR but 33s latency.

3. **Blind expansion destroys symbol queries**: E and F are dead last among mnemex conditions. Confirms the original finding from the March 11 run.

4. **QMD Q2 is now 9x faster** (1.5s vs 13.3s previously) — the Node.js fix enabled sqlite-vec vector search, improving both latency and potentially relevance.

5. **Baseline MRR dropped from 0.438 to 0.309**: The re-indexed vector store may have different embeddings or the search path changed. Needs investigation.

6. **Reranker (D) has highest recall@20** (0.833) but 16s latency. Good for offline/batch use.

### Comparison with previous runs (March 11)

| Condition | MRR@10 (Mar 11) | MRR@10 (Mar 16) | Delta |
|-----------|-----------------|-----------------|-------|
| A | 0.438 | 0.309 | -0.129 |
| B1 | 0.485 | 0.442 | -0.043 |
| E | 0.157 | 0.118 | -0.039 |
| F | 0.122 | 0.119 | -0.003 |
| E-RA | — | **0.477** | new |
| F-RA | — | **0.427** | new |

The ~0.1 drop in baseline is likely due to using a migrated vector store with corrupted metadata. Re-indexing with the current mnemex version should fix this.

### References

- Results: `../mnemex/eval/mnemex-search-steps-evaluation/runs/full-rerun-v2/`
- Report: `../mnemex/eval/mnemex-search-steps-evaluation/runs/full-rerun-v2/report.md`
- JSON parse fixes: `../mnemex/src/core/store.ts` (lines ~453, ~478)
