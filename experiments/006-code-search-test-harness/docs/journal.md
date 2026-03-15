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
- Investigate LanceDB memory fix (upgrade LanceDB version or use connection pooling)
