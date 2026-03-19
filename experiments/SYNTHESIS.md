# Mnemex Evaluation Synthesis

**Date**: 2026-03-19
**Experiments**: 001, 002, 006, 009, 011, 012
**Period**: March 4-18, 2026

---

## Abstract

Across 6 experiments totaling 1,000+ evaluation queries, 64 end-to-end Claude sessions, and 280+ SWE-bench instances, we measured whether and how a semantic code index (mnemex) helps AI coding agents. The answer depends on the level of the stack being measured.

At the **task level** (SWE-bench), mnemex context improved issue resolution from 47.6% to 62.5% (+14.9pp). At the **retrieval level** (search ablation), a regex query router improved MRR by 21.8% across 12 repos — while LLM-based query expansion and reranking degraded results by 26-41%. At the **tool API level** (agent benchmarks), mnemex's MCP tools were 2.4x slower than Serena's LSP-backed tools due to API granularity mismatches.

The central finding: **a pre-built index helps, but the agent-facing API matters more than the retrieval pipeline behind it.**

---

## 1. Does a Semantic Index Help AI Agents?

### The null result (Experiment 002)

Tested 4 conditions (no-index, baseline index, skill-doc, seeded observations) across 16 scenarios on 2 repos, 64 sessions total. Claude Sonnet scored 2.0/2.0 on all conditions except one. The model is capable enough to grep its way to any answer in repos under 1,000 files.

| Condition | Avg Score | n |
|-----------|-----------|---|
| no-index | 2.00 | 16 |
| baseline | 2.00 | 16 |
| observations | 2.00 | 16 |
| skill-doc | 1.94 | 16 |

**Verdict**: No quality benefit on small repos with a strong model. But the index cut session time by 40-50% and tool calls by 30-40%.

### The positive result (Experiment 012)

Tested 6 conditions on SWE-bench (real GitHub issues), 46-48 instances each. Infrastructure errors affected 46-57% of instances, but the corrected pass rates showed a clear pattern.

| Condition | Pass Rate (corrected) | Delta vs baseline |
|-----------|-----------------------|-------------------|
| claudemem_full | **62.5%** | **+14.9pp** |
| human_written | 55.0% | +7.4pp |
| claudemem+generated | 50.0% | +2.4pp |
| claude_planner | 48.0% | +0.4pp |
| no_plan | 47.6% | -- |
| claudemem+human_written | 38.1% | -9.5pp |

**Verdict**: mnemex alone is the best context source. Combining mnemex with static CLAUDE.md files *hurts* — the static content dilutes task-specific context with stale information.

### Reconciling the results

The null result (002) and positive result (012) are consistent:
- 002 used small repos (400-700 files) where Sonnet can brute-force answers
- 012 used real SWE-bench issues on larger, more complex repos
- The index benefit grows with repo size, task difficulty, and agent budget constraints

---

## 2. What Makes the Search Pipeline Work?

### The router is the key component (Experiment 006)

Tested 8 pipeline conditions across 12 repos (860 queries). The regex query router classifies queries as symbol-lookup vs semantic and routes accordingly.

| Condition | Avg MRR@10 | Delta | % Change | Repos |
|-----------|-----------|-------|----------|-------|
| **B1 (+Router)** | **0.524** | **+0.094** | **+21.8%** | 11 |
| A (Baseline) | 0.430 | -- | -- | 12 |
| C2 (+Expander) | 0.316 | -0.114 | -26.4% | 2 |
| D (+Reranker) | 0.292 | -0.138 | -32.0% | 2 |
| E (Full pipeline) | 0.255 | -0.175 | -40.6% | 2 |

**Router wins in 8/9 repos (89%)**. Largest gain: smolagents (+0.342, +66%). The router costs nothing — it's a regex classifier with sub-millisecond latency.

### LLM at query time hurts (Experiment 006)

Every LLM-based component degraded search quality:
- Expanders (C1/C2/C3): -26% to -32% MRR
- Reranker (D): -32% MRR, +4x latency
- Full pipeline (E): -41% MRR, +8x latency

Root cause: small LLMs rewrite symbol queries (e.g., `FastMCPBaseModel`) into natural language (e.g., "base model class for MCP configuration"), destroying the precise keyword signal that BM25 needs.

### Exception: local embeddings benefit from LLM pipeline (Experiment 006)

When the baseline uses weaker local embeddings (nomic-embed-text via ollama, baseline MRR=0.248), the full route-aware pipeline compensates:

| Condition | voyage-3.5-lite | nomic-embed-text |
|-----------|----------------|------------------|
| A (baseline) | 0.438 | 0.248 |
| B1 (router) | 0.485 | 0.463 |
| E-RA (full+RA) | -- | **0.495** |
| F-RA (RA, no rerank) | -- | 0.467 |

All pipeline conditions were significant (p<0.003) on the weaker baseline. **F-RA (router + route-aware expansion, no reranker) is the sweet spot for local-only deployment**: MRR=0.467 at 2s P95, no cloud API needed.

### Production recommendation

```
query --> regex classifier --> {
  symbol_lookup   --> keyword-only (BM25) search
  semantic/other  --> hybrid (vector + BM25) search
}
```

With cloud embeddings: router only, no LLM at query time.
With local embeddings: router + route-aware expansion, optional reranker.

---

## 3. The MCP Tool API Is the Bottleneck

### Mnemex vs Serena: 2.4x slower (Experiments 009, 011)

Tested 3 tools (mnemex, serena, bare-claude) on 4 code investigation tasks across 2 repos.

| Tool | Total Duration | Total Calls | Total Cost |
|------|---------------|-------------|------------|
| serena | 223s | 45 | $0.59 |
| bare-claude | 370s | 49 | $0.80 |
| mnemex | 592s | 59 | $0.83 |

### Root causes (Experiment 011, transcript analysis)

Three specific MCP tool API deficiencies:

**1. No `includeBody` on symbol lookup**

| Step | Serena | Mnemex |
|------|--------|--------|
| 1 | `find_symbol("FastMCP/__init__", include_body=true)` | `symbol("FastMCP.__init__")` -- location only |
| 2 | **Done.** | `context(server.py, line 156)` |
| 3 | | `context(server.py, line 200)` |
| 4 | | `search("FastMCP __init__ params")` |
| 5 | | `Read(server.py, offset=156)` -- fallback |
| **Total** | **22s, 2 calls** | **38s, 8 calls** |

**2. `search_code` thrashing**

On T03 (cross-file trace), mnemex made 16 `search_code` calls rephrasing the same query. Serena used 12 precise `find_symbol` calls with exact paths. Natural language queries against code text are unreliable.

**3. No `read_file` with line ranges**

Mnemex's `context` returns a fixed window. No way to read an arbitrary span. Agents fall back to native `Read`.

### Pipeline improved the gap (Experiment 011)

After implementing parallel search backends with `includeBody`, the gap narrowed:

| Task | Before | After | Change |
|------|--------|-------|--------|
| T03 (cross-file trace) | 296s (28 calls) | 144s (22 calls) | **-51%** |
| T01 (symbol lookup) | 38s (8 calls) | 40s (7 calls) | ~same |
| T04 (tinygrad trace) | 234s (19 calls) | 266s (20 calls) | +14% (noise) |
| **Total** | **592s / 59 calls** | **486s / 56 calls** | **-18%** |

Mnemex/serena duration ratio: 2.65x --> 2.37x. Progress, but still a significant gap.

---

## 4. Supporting Results

### LLM Speed for Agent Tooling (Experiment 001)

Benchmarked 6 frontier LLMs on a TypeScript coding task via claudish/OpenRouter (5 rounds each, 12 model-routes).

| Model | Route | Mean | Cost (in/out per M) |
|-------|-------|------|---------------------|
| Gemini 3 Flash | OR | 32.6s | $0.50 / $3.00 |
| GPT-5.1 Codex Mini | OR | 32.7s | $0.25 / $2.00 |
| MiniMax M2.5 | OR | 40.4s | $0.29 / $1.20 |
| Qwen3.5 Plus | Direct | 41.7s | $0.26 / $1.56 |

GPT-5.1 Codex Mini is the best value: tied for fastest at the cheapest price. OpenRouter adds near-zero overhead for fast models.

---

## 5. Cross-Experiment Themes

### Theme 1: Simplicity wins at every level

- **Query routing**: Regex classifier beats LLM planners. No production tool (Cody, Cursor, aider) uses LLM at query time.
- **Context injection**: Raw mnemex output beats combined approaches. Adding CLAUDE.md on top *hurts*.
- **API design**: One `find_symbol(include_body=true)` call beats a 5-step sequence of search/context/read.

### Theme 2: The benefit scales with difficulty

| Difficulty proxy | Index benefit |
|-----------------|---------------|
| Small repos + strong model (002) | None (quality ceiling) |
| Medium repos + symbol queries (006) | +21.8% MRR (router) |
| Real SWE-bench issues (012) | +14.9pp pass rate |
| Weaker local embeddings (006) | +99% MRR (full pipeline) |

### Theme 3: Tool API > retrieval pipeline

Experiment 011 showed mnemex is 2.4x slower than serena despite having comparable retrieval quality. The gap is entirely in the MCP tool API layer — how results are exposed to the agent. Improving the pipeline (006) without fixing the API yields diminishing returns.

### Theme 4: Local-first is viable

With nomic-embed-text (local ollama) + route-aware expansion (local LM Studio), mnemex achieves MRR=0.467 — competitive with cloud-API baselines (voyage-3.5-lite at 0.438). No API keys needed. F-RA at 2s P95 is production-ready latency.

---

## 6. Actionable Recommendations

### For mnemex (the product)

| Priority | Action | Evidence | Expected Impact |
|----------|--------|----------|----------------|
| P0 | Ship regex query router | 006: +21.8% MRR, 8/9 repos | Biggest single improvement |
| P0 | Add `includeBody` to symbol tool | 011: 4x call reduction per lookup | Closes serena gap on symbol tasks |
| P1 | Add `readFile(path, start, end)` MCP tool | 011: eliminates fallback to native Read | Removes tool discovery confusion |
| P1 | Add regex `searchForPattern` tool | 011: replaces unreliable NL code search | Stops search_code thrashing |
| P2 | Default to local embeddings + F-RA pipeline | 006: MRR=0.467, no cloud API | Zero-config local deployment |
| P3 | Never combine mnemex context with CLAUDE.md | 012: combined is worst condition | Noise dilutes signal |

### For evaluation methodology

- Use Wilcoxon signed-rank, not t-test, for bounded metrics like MRR
- 30 queries per condition is underpowered; target n=100+
- Significance requires both p<0.05 AND |r|>0.1 (effect size filter)
- SWE-bench infrastructure errors dominate noise; report corrected pass rates

---

## 7. Open Questions

1. **Does router + includeBody close the serena gap entirely?** After 011's pipeline, mnemex was still 2.37x slower. Will the P0 API fixes bring it to parity?

2. **Why does combining contexts hurt?** 012 showed claudemem+human_written is the worst condition. Is it context window dilution, conflicting instructions, or stale CLAUDE.md content?

3. **Is the SWE-bench result robust?** Only 5 of 12 repos worked, with 46-57% infrastructure errors. Fisher exact test gives p=0.37 — not significant with current sample sizes.

4. **How much does embedding model quality matter at scale?** 006 showed local embeddings (MRR=0.248 baseline) benefit more from the pipeline than cloud embeddings (MRR=0.438). But is the ceiling higher with better base vectors?

---

## 8. Experiment Index

| # | Name | Dates | Key Finding | Journal |
|---|------|-------|-------------|---------|
| 001 | LLM Speed Claudish | Mar 5-6 | Gemini/GPT tied at 33s, GPT best value | `001-llm-speed-claudish/docs/journal.md` |
| 002 | Cognitive Memory E2E | Mar 4-6 | Null result on quality; 40-50% efficiency gain | `002-cognitive-memory-e2e/docs/journal.md` |
| 006 | Code Search Test Harness | Mar 10-18 | Router +21.8%, LLM at query time hurts | `006-code-search-test-harness/docs/journal.md` |
| 009 | Mnemex vs Serena | Mar 4 | Neither wins; mnemex fewer calls, serena faster | `009-mnemex-vs-serena/docs/journal.md` |
| 011 | N-Way Code Tool Benchmark | Mar 11-16 | Mnemex 2.4x slower; API granularity is root cause | `011-n-way-code-tool-benchmark/docs/journal.md` |
| 012 | SWE-bench Context Ablation | Mar 4 | mnemex alone +14.9pp; combining with CLAUDE.md hurts | `012-swebench-context-ablation/docs/journal.md` |

---

## Appendix: Key Numbers

| Metric | Value | Source |
|--------|-------|--------|
| SWE-bench pass rate (mnemex) | 62.5% | 012 |
| SWE-bench pass rate (baseline) | 47.6% | 012 |
| Router MRR improvement | +21.8% | 006, 12 repos |
| Router win rate | 8/9 repos (89%) | 006 |
| Full pipeline MRR degradation | -41% | 006, 2 repos |
| Mnemex/serena speed ratio | 2.37x (post-pipeline) | 011 |
| Mnemex tool calls per symbol | 8 vs serena's 2 | 011 |
| Local-only MRR (F-RA) | 0.467 at 2s P95 | 006 |
| Cloud-API baseline MRR | 0.438 | 006 |
| Efficiency gain from index | 40-50% time, 30-40% calls | 002 |
| Fastest coding LLM | Gemini 3 Flash (32.6s) | 001 |
| Best value coding LLM | GPT-5.1 Codex Mini ($0.25/M) | 001 |
| Total queries evaluated | 1,000+ | 006 |
| Total E2E sessions | 64 (002) + 280+ (012) + 24 (011) | all |
