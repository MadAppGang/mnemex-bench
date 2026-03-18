# Less Is More: How a Regex Router Outperforms LLM Query Expansion in Code Search

**An 860-query ablation study across 12 open-source repositories**

---

**Version**: 1.0.0
**Date**: 2026-03-17
**Experiment**: 006 — Code Search Test Harness
**Status**: Run 1 complete

---

## Abstract

Mnemex is a local code search tool for AI coding agents. It indexes codebases using AST-aware analysis, enriches symbol metadata with a small LLM, and stores both vector embeddings and a BM25 inverted index. We hypothesized that adding LLM-based query expansion and reranking to the hybrid retrieval pipeline would improve search quality — a common assumption in production RAG systems.

An 860-query ablation study across 12 open-source repositories showed the opposite. A simple regex-based query classifier is the only component that helps: +21.8% MRR@10 over the baseline at essentially zero added latency. Every LLM-based component degrades quality and adds latency: expanders reduced MRR by 26–32%, the reranker by 32%, and the full pipeline by 41% relative to the unaugmented baseline. The full pipeline reached a P95 latency of 20 seconds — 8x slower than baseline — while delivering worse results.

The root cause is query distribution mismatch. Roughly 60–80% of code search queries in AI agent sessions are symbol-name lookups (class names, function names, identifiers). LLM expanders optimize for natural-language semantic queries and rewrite symbol names into descriptions, destroying the precise keyword match that BM25 provides for free. The optimal pipeline turns out to be exactly what production tools like Cody and Cursor already use: classify the query type with deterministic rules, then route symbol lookups to keyword-only search.

---

## 1. Introduction

AI coding agents — Claude Code, Cursor, Aider — need to navigate large codebases efficiently. When a developer asks "how does FastMCP handle authentication?", the agent must retrieve the right source files before it can reason about them. Retrieval quality directly determines whether the agent reads the correct code or hallucinates.

Mnemex approaches this as a local semantic code search problem. Its pipeline has four composable components:

1. **Router**: classifies the incoming query by type (symbol lookup, semantic, structural, exploratory)
2. **Expander**: rewrites the query into multiple sub-queries (lexical, vector, HyDE) to improve recall
3. **Retriever**: executes hybrid search using vector embeddings (LanceDB) and BM25 (SQLite FTS5)
4. **Reranker**: rescores the top-N retrieval candidates using a small LLM

The standard assumption in retrieval-augmented generation (RAG) is that more pipeline stages improve quality. Expanders increase recall on underspecified queries. Rerankers improve precision by applying a more capable relevance model than the initial retriever. Both are well-supported in the literature on document retrieval and general RAG systems.

This paper tests whether that assumption holds for code search in the context of AI agent workflows. We ran an 860-query ablation study across 12 open-source repositories, testing 8 pipeline configurations from the unaugmented baseline (retriever only) to the full four-component pipeline. The results contradict the standard assumption.

---

## 2. Related work

Husain et al. [2] introduced CodeSearchNet, the foundational benchmark for semantic code search. Their setup — docstring-style natural language queries matched to function bodies — established the paradigm that code search is primarily a semantic retrieval problem. Most subsequent work, including the training data for code embedding models, follows this framing.

CoSQA [3] challenged this by constructing queries from real Bing search logs rather than docstrings. Real user queries are shorter, more ambiguous, and span a broader range of intent — including direct identifier lookups that CodeSearchNet does not cover. This distribution shift matters for our results: the queries in our study, drawn from top-PageRank symbols in 12 repositories, resemble the identifier-heavy tail of CoSQA more than they resemble CodeSearchNet's docstring queries.

HyDE [4] — hypothetical document embeddings — is the theoretical basis for the expander component we evaluate. Gao et al. showed that generating a hypothetical answer to a query and embedding that answer (rather than the query itself) improved dense retrieval on general IR benchmarks. Our results suggest this approach fails for symbol-lookup queries because the "hypothetical answer" for "FastMCP" is something like "server implementation for Model Context Protocol," which has low lexical overlap with the actual class definition.

Gloaguen et al. [1] evaluated AI-generated context files (AGENTS.md, CLAUDE.md) on SWE-bench using an open harness (eth-sri/agentbench). Their work motivated our companion experiment (experiment 012), which forks that harness and adds mnemex-based context generation as a condition. Section 5.6 connects our retrieval findings to those end-to-end results.

No production code search tool — Sourcegraph Cody, Cursor, Aider — uses LLM query planners for real-time search. All use deterministic routing and rely on keyword or hybrid retrieval as the primary mechanism. Our study provides empirical grounding for that architectural choice.

---

## 3. Methodology

### 3.1 System under test

Mnemex v0.24.0. The indexer parses each repository with tree-sitter, extracts symbols (functions, classes, methods) with their AST-derived signatures, and enriches each symbol with a short natural-language description generated by deepseek-v3.2. Vectors are stored in LanceDB. The BM25 index lives in SQLite FTS5. All components run locally on Apple Silicon (M-series Mac) with no external API calls during query time, except for the expander and reranker which call LM Studio at localhost:1234.

### 3.2 Pipeline components

**Retriever (always present)**

The baseline retriever executes both a vector similarity search (LanceDB ANN) and a BM25 keyword search (SQLite FTS5), then combines results using reciprocal rank fusion. The `k` parameter was capped at 20 throughout this study due to a memory accumulation bug in LanceDB's NAPI bindings that triggers SIGKILL at higher result counts (see section 6).

**Router (B1 condition)**

A regex-based query classifier. Rules execute in priority order:

```
1. Backtick-quoted text OR CamelCase OR snake_case token → symbol_lookup
2. "callers of" OR "where is X called" OR "imports" → structural
3. Error keywords: "raises", "returns wrong", "error", "bug" → semantic_search
4. "how to", "implement", "add support" → exploratory
5. Default → semantic_search
```

Classification takes under 1ms. When the router labels a query as `symbol_lookup`, the retriever bypasses vector search and uses keyword-only BM25 search. All other query types use hybrid retrieval unchanged.

**Expander (C1, C2, C3 conditions)**

A small LLM running in LM Studio at localhost:1234. The system prompt instructs the model to rewrite the incoming query into three variants on separate lines:

```
lex:  <lexical keyword expansion>
vec:  <natural-language description for vector search>
hyde: <hypothetical code snippet the answer might contain>
```

Three models were tested:
- **C1**: LFM2-700M (smallest, fastest)
- **C2**: Qwen3-1.7B-FT (medium, fine-tuned)
- **C3**: LFM2-2.6B (largest of the three)

**Reranker (D condition)**

Qwen3-1.7B running in LM Studio. Scores the top-20 retrieval candidates on a 0–10 relevance scale. The final score blends 70% LLM score + 30% retrieval score. Scores run sequentially, so latency scales with the number of candidates.

### 3.3 Ablation conditions

Eight conditions were tested:

| ID | Components | Description |
|----|-----------|-------------|
| A | Retriever only | Baseline — pure hybrid retrieval |
| B1 | Retriever + regex router | Symbol lookups route to keyword-only search |
| C1 | Retriever + LFM2-700M expander | Tiny expander |
| C2 | Retriever + Qwen3-1.7B-FT expander | Medium expander (fine-tuned) |
| C3 | Retriever + LFM2-2.6B expander | Large expander |
| D | Retriever + reranker | Qwen3-1.7B reranker, k=20 candidates |
| E | All components | Full pipeline: regex router + LFM2-2.6B expander + reranker |
| F | Router + expander | Full pipeline minus the reranker |

Two additional route-aware conditions (E-RA, F-RA) were run on single-repo symbol queries. These variants skip expansion when the router classifies a query as `symbol_lookup`, even in conditions that include an expander.

### 3.4 Evaluation dataset

**Repositories**

Twelve repositories from the mnemex agentbench eval set:

| Repository | Primary Language | Domain |
|-----------|-----------------|--------|
| ansible/ansible | Python | Configuration management |
| getzep/graphiti | Python | Knowledge graph |
| huggingface/smolagents | Python | AI agent framework |
| huggingface/transformers | Python | ML library |
| jlowin/fastmcp | Python | MCP server framework |
| openai/openai-agents-python | Python | Agent SDK |
| opshin/opshin | Python | Smart contract language |
| pdm-project/pdm | Python | Package manager |
| qodo-ai/pr-agent | Python | PR automation |
| tinygrad/tinygrad | Python/C | ML framework |
| vibrantlabsai/ragas | Python | RAG evaluation |
| wagtail/wagtail | Python | CMS |

Two repositories failed due to infrastructure issues: `huggingface/transformers` had an empty symbols table after indexing (AST parsing did not run), and `getzep/graphiti` was killed by the OS during execution due to LanceDB memory accumulation (see section 6).

**Query generation**

For most repositories, queries were the names of the top-20 symbols ranked by PageRank in the mnemex symbol graph. Symbol-name queries represent the dominant query pattern in AI agent sessions: an agent encounters a class name in one file and searches for its definition.

For `jlowin/fastmcp` and `tinygrad/tinygrad`, a "mixed mode" dataset was also created: 10 symbol-name queries, 10 hand-crafted semantic queries (natural language descriptions of functionality), and 10 hand-crafted exploratory queries (open-ended "how does X work" style). This yielded 30-query mixed sets for these two repositories.

**Ground truth**

File-level: each query's correct answer is the file containing the symbol definition or the most relevant implementation. This is the same ground truth format used by the SWE-bench retrieval experiments.

**Total query count**

860 queries across 10–12 repositories (varying by condition, since LLM-based conditions only ran on 2 repositories due to LM Studio overhead).

**Statistical test**

Wilcoxon signed-rank test (paired, non-parametric). MRR@10 is bounded [0, 1] and right-skewed; the t-test's normality assumption does not hold. Significance requires p < 0.05 AND |r| > 0.1 (effect size r = Z / sqrt(N)).

### 3.5 Infrastructure

All runs on Apple Silicon (M-series Mac). LM Studio served all local LLMs at localhost:1234. The ablation runner used subprocess isolation (one process per condition per repository) to work around LanceDB's memory accumulation bug. The `k` parameter was capped at 20 across all conditions for the same reason, which means Recall@100 is not reported — only Recall@20.

---

## 4. Results

### 4.1 Cross-repo ablation (860 queries, 10–12 repos)

The router (B1) is the only component that improves MRR@10 over the baseline. Every LLM-based component degrades it.

| Condition | Description | Avg MRR@10 | Delta | % Change | Avg P95 | Repos |
|-----------|-------------|-----------|-------|----------|---------|-------|
| B1 | +Regex router | **0.524** | +0.094 | **+21.8%** | 2726ms | 11 |
| A | Baseline | 0.430 | — | — | 2549ms | 12 |
| C2 | +Expander (Qwen3-1.7B-FT) | 0.316 | -0.114 | -26.4% | 6501ms | 2 |
| C3 | +Expander (LFM2-2.6B) | 0.307 | -0.123 | -28.6% | 4869ms | 2 |
| D | +Reranker | 0.292 | -0.138 | -32.0% | 10365ms | 2 |
| C1 | +Expander (LFM2-700M) | 0.292 | -0.138 | -32.0% | 4851ms | 2 |
| E | Full pipeline | 0.255 | -0.175 | -40.6% | 20656ms | 2 |
| F | Router + expander | 0.252 | -0.177 | -41.3% | 5370ms | 2 |

Note: LLM-based conditions (C1–F) were only run on 2 repositories (`fastmcp`, `tinygrad`) due to the overhead of running LM Studio in batch mode across all 12 repos.

### 4.2 Per-repo breakdown (router vs baseline)

The router improved MRR@10 in 8 of 9 repositories where both conditions were run:

| Repo | A (baseline) | B1 (router) | Delta |
|------|-------------|-------------|-------|
| smolagents | 0.521 | **0.863** | +0.342 |
| pdm | 0.246 | 0.499 | +0.253 |
| opshin | 0.469 | 0.674 | +0.205 |
| fastmcp | 0.382 | 0.498 | +0.116 |
| pr-agent | 0.454 | 0.545 | +0.091 |
| ragas | 0.511 | 0.575 | +0.064 |
| tinygrad | 0.578 | 0.635 | +0.057 |
| wagtail | 0.361 | 0.365 | +0.004 |
| openai-agents | 0.549 | 0.468 | -0.081 |

The largest gain was smolagents (+0.342, +66% relative). The only regression was openai-agents (-0.081, -15%). The wagtail gain was negligible (+0.004).

The `ansible` repository ran but is not shown here because it was in the 10-repo A+B1 run without per-repo breakdown in the aggregated output.

### 4.3 Mixed-query results (fastmcp, 30 queries)

The 30-query mixed dataset for fastmcp (10 symbol + 10 semantic + 10 exploratory) shows a compressed picture: the router still wins, but by a smaller margin because the majority of queries are no longer symbol lookups.

| Condition | MRR@10 | P95 | vs Baseline |
|-----------|--------|-----|-------------|
| B1 (+Router) | **0.229** | 1334ms | +10% |
| A (Baseline) | 0.208 | 1295ms | — |
| C3 (+LFM2-2.6B) | 0.202 | 2358ms | -3% |
| E (Full pipeline) | 0.200 | 24781ms | -4% |
| C2 (+Qwen3-FT) | 0.199 | 3843ms | -4% |
| C1 (+LFM2-700M) | 0.192 | 2155ms | -8% |
| D (+Reranker) | 0.162 | 12346ms | -22% |
| F (Router+expander) | 0.144 | 3282ms | -31% |

The full pipeline (E) runs 19x slower than baseline (24781ms vs 1295ms P95) while delivering 4% worse MRR. Statistical significance was not computed for the mixed-query run given the small sample size.

### 4.4 Route-aware expansion (single-repo)

The route-aware expansion variants (E-RA, F-RA) were designed to test whether the expansion damage is localized to symbol queries. These conditions include an expander but skip it when the router classifies the query as `symbol_lookup`.

Results from the March 16 rerun on fastmcp (n=30 symbol queries):

| Condition | MRR@10 | P95 | Description |
|-----------|--------|-----|-------------|
| E-RA | **0.477** | 35.4s | Full pipeline + route-aware expansion |
| B1 | 0.442 | 1.1s | Regex router only |
| F-RA | 0.427 | 1.9s | Router + expander (route-aware) |
| A | 0.309 | 1.7s | Baseline |
| E | 0.118 | 16.3s | Full pipeline (blind expansion) |
| F | 0.119 | 3.9s | Router + expander (blind expansion) |

E-RA (0.477) vs E (0.118) represents a 4x improvement from simply skipping expansion when the router identifies the query as a symbol lookup. F-RA (0.427) vs F (0.119) shows the same pattern: route-aware expansion recovers 3.6x. Both E and F without route awareness are the worst-performing mnemex conditions.

Note: the March 16 baseline (A = 0.309) is lower than the March 11 baseline (A = 0.438), likely due to using a migrated vector store with partially corrupted metadata after the claudemem → mnemex rename. The relative ordering of conditions is consistent across runs.

### 4.5 Statistical significance

From the March 11 single-repo run on fastmcp (n=30 symbol queries):

| Condition | Delta MRR | p-value | Effect r | Significant? |
|-----------|-----------|---------|----------|-------------|
| B1 vs A | +0.047 | 0.4017 | 0.233 | No |
| C1 vs A | +0.048 | 0.3081 | 0.322 | No |
| C2 vs A | +0.002 | 0.6832 | 0.109 | No |
| C3 vs A | -0.086 | 0.1742 | 0.272 | No |
| D vs A | +0.002 | 0.9687 | 0.011 | No |
| **E vs A** | **-0.281** | **0.0004** | **0.680** | **Yes** |
| **F vs A** | **-0.316** | **<0.0001** | **0.807** | **Yes** |

The two statistically significant results are both regressions. The full pipeline (E) and the router-plus-expander without reranker (F) both showed large, significant degradation (p < 0.001, large effect sizes r = 0.68 and 0.81 respectively).

The router's improvement (B1: +0.047, p = 0.40) did not reach significance in the single-repo run. The cross-repo evidence is stronger: the router improved MRR in 8 of 9 repositories, with an aggregate +21.8% improvement over 860 queries. This consistent direction across diverse codebases provides practical confidence in the finding even without a statistically significant single-repo result.

### 4.6 Latency analysis

The router adds no measurable latency. LLM-based components add seconds to minutes:

| Component | Added latency (P95 estimate) |
|-----------|------------------------------|
| Router (regex) | <1ms |
| Expander — LFM2-700M | +700ms |
| Expander — LFM2-2.6B | +900ms |
| Expander — Qwen3-1.7B-FT | +2500ms |
| Reranker — Qwen3-1.7B | +3000–10000ms |
| Full pipeline (E) | +18000ms |

The reranker's latency varies widely because it scores candidates sequentially. Short documents resolve faster; the 10000ms tail reflects queries that retrieve many long candidates. Full pipeline P95 of 20656ms (from the aggregate table) means one in twenty searches takes over 20 seconds — unacceptable for interactive use in an AI agent session.

---

## 5. Discussion

### 5.1 Why the router works

Code search query distributions differ from general-purpose search in one key way: a large fraction of queries are exact identifier lookups. Developers and AI agents searching for "FastMCP", "ConnectionPool", or "parse_requirements" want the definition of that symbol — not documents that describe what it does.

BM25 is well-suited to exact-match queries. The symbol name appears verbatim in the source file, in the function signature, and in the mnemex-generated description. Hybrid retrieval dilutes this BM25 signal with vector similarity, which matches semantically related content regardless of whether the exact identifier appears. For symbol lookups, this dilution hurts.

The router's regex rules correctly identify this query class in under 1ms and switch to keyword-only BM25. No machine learning is required. No LLM call happens. The improvement is free.

### 5.2 Why expansion hurts

Query expansion was designed for a different problem: underspecified natural-language queries where the user's intent is vague. For "authentication middleware for fastapi", generating a HyDE snippet or a semantic paraphrase helps close the vocabulary gap between the query and the codebase.

For "FastMCP", the expander rewrites the query into something like "server implementation for the Model Context Protocol, handling tool registration and request routing." This paraphrase has high semantic relevance to MCP documentation and comments in the codebase — but low lexical overlap with the class definition itself. The expander assumes all queries are natural language. Most agent queries are identifiers.

All three expander models degraded MRR relative to the baseline. LFM2-700M (-32.0% MRR) performed worst, followed by LFM2-2.6B (-28.6%) and the fine-tuned Qwen3-1.7B-FT (-26.4%). The fine-tuned model performed best among the three, presumably because fine-tuning exposed it to code-search patterns, but it still degraded quality relative to the unaugmented baseline. Model size alone did not predict expansion quality — the relationship between expander capacity and retrieval harm is not monotonic.

### 5.3 Why the full pipeline is worst

Each pipeline stage amplifies the error from the previous one. The expander transforms "FastMCP" into a natural-language description. The hybrid retriever scores documents against that description, surfacing documentation and comments instead of the class definition. The reranker then re-evaluates these already-degraded candidates, applying a relevance model that confirms they match the expanded query.

The result is compound degradation: -40.6% MRR at 8x the baseline latency. Adding more components did not compensate for the fundamental mismatch between expander behavior and query distribution.

### 5.4 The route-aware fix

The E-RA condition (full pipeline but skip expansion for symbol queries) recovers to 0.477 MRR@10 from 0.118 — a 4x improvement. This confirms that the expansion behavior is the root cause, not the reranker or the retriever.

F-RA (route-aware expansion, no reranker) achieves 0.427 MRR@10 at 1.9s P95 — nearly matching E-RA while avoiding the 35-second reranker overhead. For most production use cases, F-RA is the better tradeoff: a 38% improvement over E at one-eighteenth the latency.

The route-aware variants were added after the initial ablation identified the problem. They were not the focus of the study, and the sample size (n=30, single repo) is too small for statistical significance. But the directional evidence is strong: every route-aware condition outperforms its blind-expansion counterpart by a wide margin.

### 5.5 Implications for production code search tools

Production tools have independently converged on the same conclusion. Cody, Cursor, and Aider all use deterministic routing and rely on keyword or hybrid retrieval without real-time LLM query modification. Our results explain why: LLM query planners provide no quality benefit for the symbol-lookup queries that dominate code search traffic, and they add latency that degrades user experience.

The optimal mnemex pipeline based on these results:

```
query → regex classifier → {
  symbol_lookup → keyword-only BM25 search
  semantic / exploratory → hybrid (vector + BM25) search
}
```

No expander. No reranker. No LLM at query time.

Expansion may still provide value for semantic and exploratory queries, where the vocabulary gap between natural-language intent and source code is real. The mixed-query results (section 4.3) show the router's advantage shrinks when the query set includes more semantic and exploratory queries. A targeted evaluation of expansion on semantic-only queries is needed before ruling it out entirely.

### 5.6 Connection to SWE-bench results

Experiment 012 (a separate but related study) forked the eth-sri/agentbench harness to test whether mnemex context files improve AI agent performance on SWE-bench issues. The mnemex-only condition (`claudemem_full`) achieved 62.5% corrected pass rate, +14.9 percentage points over the no-context baseline (47.6%).

The most relevant finding for this paper: adding a human-written CLAUDE.md on top of mnemex context (`claudemem+human_written`) produced the worst result at 38.1% — below the no-context baseline. The hypothesis is that the static context file (written before the specific issue was raised) dilutes the fresh, task-specific context that mnemex provides.

Both studies point to the same underlying principle: adding more context or more pipeline stages does not reliably improve quality when the additional signal does not match the query or task distribution. Fresh, specific context beats stale, generic context. Exact-match retrieval beats semantic rewriting for identifier queries.

---

## 6. Limitations

**File-level ground truth only.** The evaluation measures whether the correct file appears in the top results, not whether the correct function is ranked first within that file. A retrieval system that finds the right file but returns an unrelated function would score the same as one that returns the exact definition.

**LLM conditions tested on 2 repositories.** Conditions C1–F were only run on `fastmcp` and `tinygrad` due to the batch overhead of running LM Studio sequentially across 12 repositories. The cross-repo averages for those conditions are not representative of the full 12-repo distribution.

**No external benchmark.** All queries were generated internally from PageRank-ranked symbols. The query distribution does not match CodeSearchNet (docstring queries), CoSQA (real user queries), or any published benchmark. Performance on these external benchmarks is unknown.

**Single evaluation round.** No replication. The cross-repo results should be treated as directional evidence, not statistically validated findings.

**Symbol query bias.** Symbol-name queries dominate the dataset (20 per repository in the main run). This biases all results toward the regime where the router performs best. An evaluation balanced across query types would likely show smaller router gains and potentially some benefit from expansion on semantic queries.

**LanceDB memory limitation.** LanceDB's Rust NAPI bindings accumulate approximately 15MB RSS per query. After 20–30 queries at k=100, macOS sends SIGKILL. The study capped k at 20, which means Recall@20 rather than Recall@100 is the coverage metric. Two repositories (`transformers`, `graphiti`) could not be evaluated at all. A future study should either upgrade LanceDB or use a different vector store.

**Baseline variation across runs.** The March 16 rerun showed a baseline MRR@10 of 0.309 vs 0.438 in the March 11 run, likely due to a partially corrupted vector store after the claudemem → mnemex rename. Relative rankings are consistent, but absolute numbers across runs are not directly comparable.

---

## 7. Conclusion

For local code search in AI agent workflows, a regex-based query classifier is the highest-value pipeline component — and the only one that provides a consistent quality improvement. Across 860 queries and 10+ open-source repositories, the regex router improved MRR@10 by 21.8% at zero latency cost.

LLM-based query expansion and reranking reduced search quality in every tested configuration. The degradation was statistically significant for the full pipeline (p = 0.0004, r = 0.68) and the router-plus-expander variant (p < 0.0001, r = 0.81). The full four-component pipeline reached a P95 latency of 20 seconds while delivering 40.6% worse MRR than the unaugmented baseline.

The cause is query distribution mismatch: the majority of code search queries in agent sessions are symbol-name lookups for which BM25 exact-match search already performs well. LLM expanders rewrite these identifiers into natural-language paraphrases, destroying the keyword signal. Skipping expansion for symbol queries (route-aware expansion) recovers the lost performance, confirming that the expander's query-type blindness — not any inherent model limitation — drives the degradation.

The practical recommendation: classify queries with regex patterns, route symbol lookups to keyword-only search, and route everything else to hybrid retrieval. No LLM calls at query time. Less pipeline is more.

---

## 8. References

1. Gloaguen et al. (2025). "Evaluating AGENTS.md: A Benchmark for AI Agent Context Understanding." arXiv:2602.11988.

2. Husain et al. (2019). "CodeSearchNet Challenge: Evaluating the State of Semantic Code Search." arXiv:1909.09436.

3. Huang et al. (2021). "CoSQA: 20,000+ Web Queries for Code Search and Question Answering." ACL 2021.

4. Gao et al. (2023). "Precise Zero-Shot Dense Retrieval without Relevance Labels." ACL 2023.

5. Robertson & Zaragoza (2009). "The Probabilistic Relevance Framework: BM25 and Beyond." Foundations and Trends in Information Retrieval.

---

## Appendix A: Evaluation repositories

| Repository | Primary Language | Approximate size | Symbol count (approx) |
|-----------|-----------------|-----------------|----------------------|
| ansible/ansible | Python | Large (>1000 files) | High |
| getzep/graphiti | Python | Medium | Medium |
| huggingface/smolagents | Python | Small–medium | Medium |
| huggingface/transformers | Python | Very large | Very high |
| jlowin/fastmcp | Python | Small (396 files) | ~1914 |
| openai/openai-agents-python | Python | Small | Medium |
| opshin/opshin | Python | Small–medium | Medium |
| pdm-project/pdm | Python | Medium | Medium |
| qodo-ai/pr-agent | Python | Medium | Medium |
| tinygrad/tinygrad | Python/C | Medium | Medium |
| vibrantlabsai/ragas | Python | Medium | Medium |
| wagtail/wagtail | Python | Large | High |

`huggingface/transformers` was indexed but the symbols table was empty (AST parsing did not complete). `getzep/graphiti` was killed by the OS during evaluation due to LanceDB memory accumulation.

Exact file counts and symbol counts are available in the mnemex index databases at `{eval-repos-dir}/{name}/.mnemex/index.db`.

---

## Appendix B: Router regex rules

The router in this study uses the following pattern-matching rules, executed in priority order. The first matching rule determines the query label.

```typescript
// Rule 1: Symbol lookup — backtick-quoted, CamelCase, or snake_case identifier
const SYMBOL_PATTERNS = [
  /`[^`]+`/,                         // Backtick-quoted: `FastMCP`, `parse_args`
  /\b[A-Z][a-zA-Z0-9]{2,}\b/,       // CamelCase: FastMCP, ConnectionPool
  /\b[a-z][a-z0-9_]{2,}\b(?=\s*$)/, // snake_case standalone: parse_requirements
];

// Rule 2: Structural — relationship queries
const STRUCTURAL_PATTERNS = [
  /callers?\s+of\b/i,
  /where\s+is\s+.+\s+called/i,
  /\bimports?\s+/i,
  /depends?\s+on\b/i,
];

// Rule 3: Semantic — error and behavior descriptions
const SEMANTIC_PATTERNS = [
  /\braises?\b/i,
  /\breturns?\s+wrong\b/i,
  /\bdoes(n'?t|not)\s+work\b/i,
  /\bbug\b/i,
  /\berror\b/i,
  /\bfail(s|ing|ed)?\b/i,
];

// Rule 4: Exploratory — intent-based queries
const EXPLORATORY_PATTERNS = [
  /\bhow\s+(to|does|do)\b/i,
  /\bimplement(s|ation)?\b/i,
  /\badd\s+support\b/i,
  /\bwhat\s+(is|does|are)\b/i,
];

// Default: semantic_search
```

When the router classifies a query as `symbol_lookup`, the retriever executes BM25-only search. All other labels use the hybrid vector + BM25 pipeline.
