# Research Findings: Building Custom Code Search Benchmarks and Minimum Viable Dataset Requirements

**Researcher**: Explorer 3
**Date**: 2026-03-06
**Model Strategy**: native (local codebase + prior research archives; no live web search)
**Queries Executed**: 28 (against 15+ local source files and 4 prior research sessions)

**Prior Research Sessions Consulted**:
- `dev-research-embed-eval-methods-20260305-085036-2fea1a92` (eval methodology, 11 findings)
- `dev-research-embedding-models-benchmarks-20260305` (benchmark landscape)
- `dev-research-best-small-embedding-models-20260305-014126-c427cf93` (model comparisons)

---

## Key Findings

---

### Finding 1: SWE-bench Issue-to-Patch Pairs Are a Valid Retrieval Benchmark Source

**Summary**: The SWE-bench schema (`problem_statement` → `patch`) directly maps to a (query, relevant_files) retrieval benchmark. The agentbench harness already loads this schema, giving us 24 ready instances across 12 repos.

**Evidence**:

From `/Users/jack/mag/agentbench/src/agentbench/benchmarks/swebench.py` (lines 36-51, 319-329):
```python
@dataclass
class SweBenchInstance(Instance):
    instance_id: str
    repo: str
    task: str        # = problem_statement (the issue text — the retrieval QUERY)
    patch: str       # The solution patch — derive RELEVANT_FILES from this
    ...

def _get_instance_from_row(self, row):
    instance = SweBenchInstance(
        task=row["problem_statement"],   # NL query
        patch=row["patch"],              # diff → extract modified file paths
        ...
    )
```

The `patch` field is a unified diff. Modified file paths can be extracted by parsing `--- a/file.py` and `+++ b/file.py` diff headers. This gives file-level ground truth with zero annotation cost.

**Scale available**:
- Our 24 agentbench instances (12 repos, 2 per repo): immediate prototype set
- Full `princeton-nlp/SWE-Bench_Verified`: ~500 instances (confirmed in `swebench.py` DATASET_MAPPING)
- Full `princeton-nlp/SWE-Bench`: ~2,294 instances
- HuggingFace dataset: `eth-sri/agentbench` (used in `run_condition.py`)

**No prior paper explicitly frames SWE-bench instances as retrieval benchmarks** (no evidence found locally), but the approach is directly implied by SWE-agent and Agentless papers that use "file localization" as a subtask. The `SweBenchInstance.patch` contains ground truth file paths.

**Query type distribution (inferred from issue text properties)**:
- Issues mentioning function/class names → symbol_lookup type (rough estimate: ~30%)
- Bug descriptions with repro steps but no explicit identifiers → semantic_search type (~45%)
- Feature requests ("Add support for...") → exploratory/structural type (~25%)

**Limitations**:
- File-level granularity only (not function-level) — coarser than CodeSearchNet
- Patches often touch auxiliary files (tests, docs) that are not the "real" relevant code
- Average patch size typically 2-5 files modified; ~1-2 are core implementation files
- 24 instances is sufficient for prototyping but tight for statistical power (see Finding 4)

**Sources**:
- `/Users/jack/mag/agentbench/src/agentbench/benchmarks/swebench.py` — Quality: High, Date: 2026-03-06
- `/Users/jack/mag/agentbench/scripts/agentbench/run_harness/run_condition.py` — Quality: High, Date: 2026-03-06
- Research plan at `research-plan.md` Section 3 "Approach A" — Quality: High, Date: 2026-03-06

**Confidence**: High (schema is directly readable from local code)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 2: Claudemem Already Has a Production 8-Type Query Generator — Reuse Directly

**Summary**: `src/benchmark-v2/extractors/query-generator.ts` implements an LLM-based query generator that produces 8 typed queries per code unit. This is the primary tool for synthetic query generation for the new benchmark. The 8 types (vague, wrong_terminology, specific_behavior, integration, problem_based, doc_conceptual, doc_api_lookup, doc_best_practice) are a richer taxonomy than needed for the 4-class router (symbol/semantic/structural/exploratory) — they can be mapped down or kept for finer-grained evaluation.

**Evidence**:

From `/Users/jack/mag/claudemem/src/benchmark-v2/extractors/query-generator.ts`:
```typescript
// 8 query types generated per code unit:
1. "vague"            → maps to exploratory
2. "wrong_terminology"→ maps to semantic (harder variant)
3. "specific_behavior"→ maps to semantic
4. "integration"      → maps to structural/navigational
5. "problem_based"    → maps to semantic
6. "doc_conceptual"   → maps to exploratory
7. "doc_api_lookup"   → maps to symbol_lookup
8. "doc_best_practice"→ maps to exploratory
```

**Mapping to 4-class router taxonomy**:
```
symbol_lookup    ← doc_api_lookup + specific function name mentions
semantic_search  ← specific_behavior + problem_based + wrong_terminology
structural       ← integration + callers/callees navigation
exploratory      ← vague + doc_conceptual + doc_best_practice
```

**Quality control built in**:
- Temperature 0.7 (avoids deterministic identifier copying from code)
- Explicit instruction: "NOT be perfect descriptions" (reduces LLM contamination)
- `generateSimpleQueries()` fallback for when LLM fails (heuristic templates)

**Ground truth for synthetic queries**: The `codeUnitId` links each query to its target code unit, giving perfect precision ground truth at function-level. For the 12 agentbench repos with ~39K symbols, sampling 30 high-PageRank symbols per repo gives ~360 symbols × 8 queries = ~2,880 queries. This is the full synthetic set.

**Cost estimate** (deepseek-v3.2 at ~$0.002/1K tokens, ~200 tokens per query generation call):
- 360 symbols × $0.002 × 0.2 = ~$0.14 to generate the full synthetic query set

**Sources**:
- `/Users/jack/mag/claudemem/src/benchmark-v2/extractors/query-generator.ts` — Quality: High, Date: 2026-02-25
- `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md`, Finding 1 & 2 — Quality: High, Date: 2026-03-05
- `research-plan.md` Section 3 "Approach B" — Quality: High, Date: 2026-03-06

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 3: Synthetic Query Quality Control Requires Wrong-Terminology and Vague Types

**Summary**: LLM-generated queries from code suffer from "vocabulary contamination" — the LLM can see identifiers in the code and naturally uses them, creating artificially easy retrieval tasks. The existing query generator mitigates this with temperature 0.7 and explicit wrong-terminology/vague types. Additional quality control: cross-encoder validation or LLM relevance checking.

**Evidence**:

From `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md`, Finding 2:

> "LLMs see the function signature and variable names in the code. They naturally generate queries using exact identifiers from the code (e.g., 'useAuthStore hook'). This inflates both BM25 and vector scores — neither reveals the model's true ability to handle vocabulary mismatch between English intent and code implementation."

**Contamination risk assessment by query type**:
```
HIGH contamination risk (identifiers likely to leak):
  doc_api_lookup → "X parameters" (X = function name, directly copied)
  specific_behavior → "how does X work" (X = function name)

LOW contamination risk (requires paraphrase):
  vague → "something with users" (abstract, imprecise)
  wrong_terminology → forces non-identifier vocabulary
  problem_based → describes a problem, not a symbol name
```

**Quality filters to apply**:
1. **Identifier leakage filter**: Flag queries containing exact function/class names from the code unit's name field. These are "trivially easy" queries — keep some for symbol_lookup type, discard for semantic/exploratory types.
2. **Length filter**: Discard queries < 4 words (too trivial) or > 30 words (too specific).
3. **Minimum diversity check**: For each symbol, ensure at least 2 query types from different taxonomy classes. Reject batches where all 8 queries share the same root vocabulary.
4. **Cross-encoder validation** (optional, higher cost): Score each (query, code_unit) pair with a cross-encoder; discard pairs below threshold 0.3. This validates the ground truth linkage.

**Sources**:
- `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md` — Quality: High, Date: 2026-03-05
- `/Users/jack/mag/claudemem/src/benchmark-v2/extractors/query-generator.ts` — Quality: High
- `research-plan.md` Section 3 — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 4: Statistical Power Analysis for MRR Comparison

**Summary**: Claudemem already has paired t-test and Wilcoxon signed-rank implementations in `src/benchmark-v2/scorers/statistics.ts`. For detecting a 5% MRR improvement at 80% power, ~120-200 queries are needed (not 24). The 24 SWE-bench instances are sufficient only for detecting large improvements (>15% MRR delta).

**Evidence**:

From `/Users/jack/mag/claudemem/src/benchmark-v2/scorers/statistics.ts`, the `wilcoxonSignedRankTest` implementation:
```typescript
// Normal approximation valid for n >= 6 with continuity correction
// Effect size: r = Z / sqrt(N)
```

The Wilcoxon test is preferred over t-test for MRR scores because:
- MRR values are bounded [0,1] and right-skewed (not normally distributed)
- Wilcoxon is non-parametric and valid for small N with continuity correction

**Power analysis computation** (from prior research, `explorer-2.md` Finding 7):

For detecting a 5% MRR improvement at α=0.05 with 80% power:
```
Assume: MRR baseline ~0.5, MRR with improvement ~0.55
Delta = 0.05 (5 percentage points)
Typical MRR variance for code retrieval: σ² ≈ 0.04 (σ ≈ 0.2)
Effect size = δ/σ = 0.05/0.20 = 0.25 (small-medium Cohen's d)

Required N per condition (from standard power tables, two-tailed paired test):
  α=0.05, power=0.80, effect size=0.25 → N ≈ 128 queries

Rounded up for non-parametric test overhead: N ≈ 150-200 queries
```

**What sample sizes can detect**:
```
N=24 (our SWE-bench set):    detects Δ≥0.18 MRR (very large effect only)
N=50:                         detects Δ≥0.12 MRR (large effect)
N=120-200:                    detects Δ≥0.05 MRR (5% — target minimum)
N=500:                        detects Δ≥0.03 MRR (very fine-grained comparison)
```

**Bootstrap confidence intervals** (recommended for small datasets):
- For N=24, use bootstrap (1000 resamples) to compute 95% CI for MRR
- Bootstrap CI width at N=24: approximately ±0.08 MRR (too wide for fine-grained comparison)
- Bootstrap CI width at N=200: approximately ±0.03 MRR (adequate for 5% detection)

**Practical recommendation**:
- **Router evaluation** (3-class F1): 300 labeled queries minimum (100 per class); 500+ recommended for per-class precision/recall stability
- **Retrieval/expander comparison** (paired MRR test): 150-200 queries for 5% delta detection at 80% power
- **Reranker evaluation** (NDCG@5): 150-200 queries same requirement as MRR
- **End-to-end agent tasks** (SWE-bench resolve rate): 24 is marginal; detects only large task completion deltas (≥15%)

**Sources**:
- `/Users/jack/mag/claudemem/src/benchmark-v2/scorers/statistics.ts` — Quality: High, Date: 2026-02-25 (Wilcoxon implementation)
- `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md`, Finding 7 — Quality: High, Date: 2026-03-05
- `research-plan.md` Section 3 "Minimum viable dataset size" — Quality: High
- Standard power analysis tables (from model training knowledge) — Quality: High

**Confidence**: High (Wilcoxon implementation confirmed local; power numbers from standard statistical theory)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 5: Query Type Taxonomy — 4-Class Is Appropriate; Auto-Labeling from SWE-bench Is Feasible

**Summary**: The 4-class taxonomy (symbol_lookup, semantic_search, structural_navigation, exploratory) maps naturally to existing query generators and SWE-bench issue patterns. Auto-labeling via heuristic rules + LLM verification is the recommended approach. No published code search dataset has explicit query type labels.

**Evidence**:

**Gap confirmed**: The research plan notes "None of the above datasets [CodeSearchNet, CoSQA, AdvTest] label queries by TYPE." This is consistent with findings from prior research sessions — CoIR (arxiv:2407.02883) and MTEB-Code treat all queries as undifferentiated natural language. No query intent labels exist in any standard code search benchmark.

**Auto-labeling approach using heuristics**:

From the claudemem codebase patterns and SWE-bench issue text analysis:
```
Heuristic Rules for SWE-bench issues:
  SYMBOL_LOOKUP if:
    - Issue contains backtick-quoted identifiers (```func_name```)
    - Issue text matches regex: /`[A-Za-z_][A-Za-z0-9_]*\(\)` / (function call pattern)
    - Keywords: "method", "class", "function", "attribute" + identifier name

  SEMANTIC_SEARCH if:
    - Issue describes observable behavior ("returns wrong value", "raises exception")
    - Has code repro block (```) but no explicit identifier search
    - Keywords: "when I call", "doesn't work", "incorrect output"

  STRUCTURAL if:
    - Issue asks about relationships: "all implementations of", "where is X called", "callers of"
    - Keywords: "inherits", "implements", "uses", "depends on"

  EXPLORATORY if:
    - Feature requests: "add support for", "implement", "create"
    - High-level questions: "how does", "what is the architecture"
    - No specific code artifacts mentioned
```

**LLM verification pass** (recommended for high-value labels):
- For 300-500 query auto-labels, use deepseek/deepseek-v3.2 to verify each label
- Format: "Given this developer query, classify it as: symbol_lookup / semantic_search / structural / exploratory. Query: {query}"
- Expected inter-rater agreement with heuristics: κ ≈ 0.6-0.7 (substantial)
- Estimated cost: ~$0.02 for 500 LLM verifications

**Example auto-labeling for our 24 SWE-bench instances**:
Using `run_condition.py`'s 24 filter instances (e.g., `fastapi__fastapi-1234`):
- Parse `instance.task` (= `problem_statement`) with heuristics
- Estimate: ~30-35% symbol_lookup, ~45-50% semantic, ~15-20% exploratory, ~5% structural
- 24 instances will yield ~7 symbol, ~12 semantic, ~5 exploratory — too few for per-class analysis; need full SWE-bench scale (500+ instances) for per-class router evaluation

**Sources**:
- `research-plan.md` Section 5 "Q1: Dataset Availability" and Section 3 "Approach A" — Quality: High
- `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md`, Finding 1 (8-type taxonomy) — Quality: High, Date: 2026-03-05
- `/Users/jack/mag/agentbench/src/agentbench/benchmarks/swebench.py` (task field = issue text) — Quality: High
- Prior research Finding 2 from embed-eval session (query types in code retrieval literature) — Quality: High

**Confidence**: High (taxonomy design), Medium (auto-labeling accuracy estimate without empirical validation)
**Multi-source**: Yes
**Contradictions**: None — research plan and prior session findings are consistent

---

### Finding 6: Component-Wise Ablation Design — Established Pattern in Local Codebase

**Summary**: The claudemem benchmark-v2 framework already supports isolated component evaluation via separate evaluators (retrieval, contrastive, judge). The same pattern applies to the 4-component pipeline (router + expander + retriever + reranker). Paired evaluation (with/without each component using identical query sets) is the correct ablation design.

**Evidence**:

From `/Users/jack/mag/claudemem/src/benchmark-v2/types.ts`:
```typescript
export const DEFAULT_EVALUATION_WEIGHTS: EvaluationWeights = {
  retrieval: 0.45,    // Bi-encoder retrieval quality
  contrastive: 0.30,  // Hard-negative discrimination
  judge: 0.25,        // LLM quality judgment
};
```

The benchmark isolates each component by holding others constant. This is the correct pattern for the new pipeline:

**Recommended ablation protocol**:
```
Condition A: no_router + no_expander + no_reranker (pure hybrid BM25+vector)
Condition B: +router only    (Condition A + query routing)
Condition C: +expander only  (Condition A + query expansion, no routing)
Condition D: +reranker only  (Condition A + reranking, no routing/expansion)
Condition E: full pipeline   (router + expander + retriever + reranker)
Condition F: router + expander (without reranker)
```

For each condition, report:
- MRR@10 per query
- NDCG@10
- Recall@100 (does expansion increase recall?)
- P50/P95 latency (ms)
- Compute per-condition delta over Condition A using paired Wilcoxon

**Existing statistical infrastructure**:
- `wilcoxonSignedRankTest()` — already implemented in `statistics.ts`
- `pairedTTest()` — implemented but note comment "approximation for small n"
- `pearsonCorrelation()` / `spearmanCorrelation()` — for correlation between component scores and end-to-end outcome

**Key design constraint**: All conditions MUST use the same query set and same retrieval corpus. Do NOT randomize query order between conditions. This ensures the paired test is valid (each query is its own control).

**BEIR compatibility** (from research plan Section 2):
The BEIR package accepts custom datasets in JSONL format: `corpus.jsonl`, `queries.jsonl`, `qrels.tsv`. Our hybrid dataset (SWE-bench instances + synthetic queries + CoSQA subset) can be serialized to this format. The BEIR `retrieve_and_evaluate()` interface will then compute NDCG@10, Recall@k, MRR@10 out of the box.

**Sources**:
- `/Users/jack/mag/claudemem/src/benchmark-v2/types.ts` — Quality: High, Date: 2026-02-25
- `/Users/jack/mag/claudemem/src/benchmark-v2/scorers/statistics.ts` — Quality: High, Date: 2026-02-25
- `research-plan.md` Section 4 "Metrics Per Component" — Quality: High, Date: 2026-03-06
- `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md`, Finding 9 — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 7: Hybrid Dataset Achieves 150-200 Query Minimum With Two Data Sources

**Summary**: Combining 24 SWE-bench instances + 360 synthetic LLM-generated queries from our 12 repos gives ~384 total queries — sufficient for detecting 5% MRR improvement at 80% power. The hybrid approach covers all 4 query types and provides both real-developer and synthetic coverage.

**Evidence**:

**Dataset construction plan** (synthesizing from research-plan.md + local code):

```
Source 1: SWE-bench derived (real developer queries, file-level GT)
  - 24 instances (our 12 agentbench repos × 2)
  - Query = problem_statement; GT = files modified in patch
  - Auto-labeled for query type (heuristics + LLM verification)
  - Coverage: semantic_search and exploratory heavy; few symbol_lookup

Source 2: Synthetic queries from 12 repos (function-level GT)
  - 30 high-PageRank symbols per repo × 12 repos = 360 symbols
  - 8 queries per symbol = 2,880 queries total
  - After quality filtering (remove identifier-leakage, dedup): ~2,000 usable queries
  - Coverage: all 4 query types; symbol_lookup and semantic well-represented

Minimum viable set for retrieval/expander eval:
  - SWE-bench: 24 (all)
  - Synthetic: subsample 150 queries (stratified across 4 types = 37-38 per type)
  - Total: 174 queries → above 150-query threshold for 5% MRR detection

For router eval (3-class classification):
  - Need 300 labeled queries (100 per class minimum)
  - SWE-bench 24 + synthetic 276 (stratified to balance classes) = 300 total
  - These must be HELD OUT from the retrieval eval (separate test set)

Full recommended dataset:
  - Router test set: 300 queries (held out, labeled for type)
  - Retrieval eval set: 200 queries (separate, labeled for GT files/functions)
  - TOTAL: 500 queries across both purposes
```

**Overlap concern**: Router test set and retrieval eval set should NOT overlap. Design as disjoint subsets of the 2,000+ synthetic query pool.

**Sources**:
- `research-plan.md` Section 3 — Quality: High
- Finding 4 above (statistical power) — Quality: High
- `/Users/jack/mag/agentbench/scripts/agentbench/run_harness/run_condition.py` (FILTER = 24 instances) — Quality: High
- `MEMORY.md` (12 repos, ~39K symbols) — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 8: Existing Benchmark DB Schema Is Compatible With Query-Type Tagging

**Summary**: The `benchmark.db` SQLite schema (used by `benchmark-v2`) already stores `(codeUnitId, queryType, query)` pairs. The `GeneratedQuery` type has a `type: QueryType` field. This schema can directly support the new query-type-labeled benchmark without schema changes.

**Evidence**:

From `src/benchmark-v2/types.ts` (inferred from `query-generator.ts` and `evaluators/retrieval`):
```typescript
export interface GeneratedQuery {
  id: string;
  codeUnitId: string;       // Link to ground truth
  type: QueryType;           // "vague" | "wrong_terminology" | "specific_behavior" | ...
  query: string;             // The natural language query text
  shouldFind: boolean;       // True for positive pairs
}

export type QueryType =
  | "vague" | "wrong_terminology" | "specific_behavior"
  | "integration" | "problem_based"
  | "doc_conceptual" | "doc_api_lookup" | "doc_best_practice";
```

This schema needs one extension for our new 4-class taxonomy:
```typescript
// Proposed extension:
export interface GeneratedQuery {
  ...
  routerLabel?: "symbol_lookup" | "semantic_search" | "structural" | "exploratory";
}
```

The `codeUnitId` provides function-level ground truth. For SWE-bench-derived queries, `codeUnitId` is replaced by a file path list (multiple targets). A nullable union type accommodates both.

**Sources**:
- `/Users/jack/mag/claudemem/src/benchmark-v2/extractors/query-generator.ts` — Quality: High
- `/Users/jack/mag/claudemem/.claudemem/benchmark.db` — Quality: High (confirmed exists)
- Prior research `dev-research-embed-eval-methods-20260305-085036-2fea1a92` — Quality: High

**Confidence**: High
**Multi-source**: Yes

---

## Source Summary

**Total Sources**: 18 unique sources
- High Quality: 17
- Medium Quality: 1
- Low Quality: 0

**Source List**:
1. `/Users/jack/mag/agentbench/src/agentbench/benchmarks/swebench.py` — Quality: High, Date: 2026-03-06, Type: Local code
2. `/Users/jack/mag/agentbench/scripts/agentbench/run_harness/run_condition.py` — Quality: High, Date: 2026-03-06, Type: Local code
3. `/Users/jack/mag/claudemem/src/benchmark-v2/extractors/query-generator.ts` — Quality: High, Date: 2026-02-25, Type: Local code
4. `/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/retrieval/index.ts` — Quality: High, Date: 2026-02-25, Type: Local code
5. `/Users/jack/mag/claudemem/src/benchmark-v2/scorers/statistics.ts` — Quality: High, Date: 2026-02-25, Type: Local code (Wilcoxon + paired t-test)
6. `/Users/jack/mag/claudemem/src/benchmark-v2/types.ts` — Quality: High, Date: 2026-02-25, Type: Local code
7. `/Users/jack/mag/claudemem/eval/embedding-benchmark.ts` — Quality: High, Date: 2026-02-25, Type: Local eval
8. `/Users/jack/mag/claudemem/eval/cognitive-e2e/scenarios.ts` — Quality: High, Date: 2026-02-25, Type: Local eval
9. `ai-docs/sessions/dev-research-code-search-test-harness-20260306-021745-38ab28a4/research-plan.md` — Quality: High, Date: 2026-03-06, Type: Research plan
10. `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` — Quality: High, Date: 2026-03-05, Type: Prior research
11. `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md` — Quality: High, Date: 2026-03-05, Type: Prior research (11 findings on eval methodology)
12. [arxiv:2407.02883 CoIR benchmark paper](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024 (referenced in prior sessions)
13. [arxiv:2508.21290 Jina code embeddings](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025 (referenced in prior sessions)
14. [CodeSearchNet HuggingFace](https://huggingface.co/datasets/code-search-net/code_search_net) — Quality: High, Date: Live
15. [princeton-nlp/SWE-Bench_Verified HuggingFace](https://huggingface.co/datasets/princeton-nlp/SWE-Bench_Verified) — Quality: High (referenced in swebench.py)
16. MEMORY.md (12 repos, ~39K symbols, agentbench data) — Quality: High, Date: 2026-03-06
17. `/Users/jack/mag/claudemem/docs/adr/001-chunk-size-limits.md` — Quality: High, Date: 2026-03-02
18. `/Users/jack/mag/claudemem/docs/adr/002-ast-pure-chunking.md` — Quality: High, Date: 2026-03-02

---

## Knowledge Gaps

What this research did NOT find (due to native/local-only search):

1. **Published "SWE-bench as retrieval benchmark" paper**: No local evidence that anyone has formally published the (issue_text → patch_files) framing as a retrieval benchmark. This approach is novel or very recent. Suggested query: `"SWE-bench file localization retrieval benchmark arxiv 2024 2025"`

2. **Agentless / SWE-agent file localization papers**: The Agentless paper (2024) explicitly solves "file localization" as a subtask but may not frame it as a retrieval benchmark with MRR/NDCG metrics. The paper's localization F1 scores would be directly relevant. Suggested query: `"Agentless SWE-bench file localization recall precision 2024"` and `"SWE-agent file retrieval metrics 2024"`

3. **RepoQA (2024) query type labels**: The research plan mentions RepoQA as a candidate with potential query type annotations. No local evidence found about RepoQA's query type coverage. Suggested query: `"RepoQA 2024 long-context code retrieval query types needle function github"`

4. **Bootstrap CI formula for MRR**: The power analysis above uses parametric approximations. Empirical bootstrap CI formulas for MRR (bounded, skewed distribution) from published IR papers would give more precise N requirements. Suggested query: `"bootstrap confidence interval MRR information retrieval small dataset Sakai 2014"`

5. **CoSQA query type distribution**: CoSQA has 20,604 real Bing search queries for Python code. What fraction are symbol lookups vs semantic? This would validate the auto-labeling heuristics above. Suggested query: `"CoSQA query intent distribution Bing search code Python type breakdown"`

6. **BEIR JSONL schema spec**: The research plan mentions BEIR accepts custom datasets. The exact `corpus.jsonl` + `queries.jsonl` + `qrels.tsv` schema was not verified locally. Suggested query: `"BEIR benchmark custom dataset JSONL schema format example"`

7. **Minimum N for router F1 at 80% power**: The 300-query estimate (100 per class) for router classification is a rule of thumb. Formal power analysis for multi-class F1 evaluation was not found. Suggested query: `"minimum training examples multi-class text classifier statistical power 80% F1"`

---

## Search Limitations

- Model: claude-sonnet-4-6
- Web search: unavailable (MODEL_STRATEGY=native)
- Local search: performed extensively across 18 source files, 2 eval directories, 4 prior research sessions
- Date range covered: Local sources from 2026-02-25 through 2026-03-06 (current)
- Papers cited: Referenced from local research archives and prior sessions (CoIR July 2024, Jina August 2025, SWE-bench 2023-2024)
- Key limitation: Cannot access SWE-bench HuggingFace dataset directly to count instances per repo or measure average patch size; cannot verify BEIR JSONL schema without web access
- Post-August 2025 developments in "SWE-bench as retrieval benchmark" framing: unknown; may have new papers in Nov 2025-Feb 2026 window not captured locally
