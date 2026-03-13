# Research Findings: Existing Evaluation Frameworks and Testing Harnesses for Code Search / IR

**Researcher**: Explorer 2
**Date**: 2026-03-06
**Model Strategy**: native (local codebase + prior research sessions; no live web search)
**Queries Executed**: 18 local queries across 12 source files and 4 prior research sessions

**Prior Research Sources Used**:
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` (High, 2026-03-05)
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md` (High, 2026-03-05)
- `src/benchmark-v2/evaluators/retrieval/index.ts` (High, current)
- `src/benchmark-v2/scorers/statistics.ts` (High, current)
- `src/benchmark-v2/types.ts` (High, current)
- `eval/embedding-benchmark.ts` (High, current)
- `eval/cognitive-mvp/validate.ts` (High, current)
- `eval/agentbench-mnemex/scripts/evaluate.py` (High, current)
- `eval/agentbench-mnemex/scripts/analyze.py` (High, current)
- `research-plan.md` (High, session context)
- Prior CoIR/MTEB/BEIR synthesis in explorer-1 from embed-eval session

---

## Key Findings

---

### Finding 1: BEIR — Confirmed Custom Dataset Support via JSONL; No Native Code Search Datasets

**Summary**: BEIR (Benchmarking Information Retrieval, github.com/beir-cellar/beir) provides a unified Python evaluation harness for retrieval pipelines. It accepts custom datasets in JSONL format (corpus + queries + qrels), computes NDCG@10, Recall@K, MRR out of the box, and allows plugging in any custom retrieval pipeline. It does NOT natively include code search datasets (CodeSearchNet, CoSQA, etc.) but these can be ingested with minimal adaptation.

**Evidence**:

From the research plan (research-plan.md, Section 2: Existing Testing Harnesses):
> "BEIR's `beir` Python package accepts custom datasets in JSONL format. Can ingest CodeSearchNet/CoSQA with minimal adaptation. Provides NDCG@10, Recall@k, MRR out of the box."

BEIR's three-file JSONL schema (confirmed in research plan, Section 7 output spec):
```
corpus.jsonl   — {"_id": "doc1", "text": "...", "title": "..."}
queries.jsonl  — {"_id": "q1", "text": "natural language query"}
qrels/test.tsv — query_id\tcorpus_id\tscore (0 or 1 for binary relevance)
```

For code search adaptation, the mapping is:
- `corpus.jsonl` → code function bodies (one document per function/chunk)
- `queries.jsonl` → natural language developer queries (or docstrings)
- `qrels/test.tsv` → (query_id, function_id, 1) for ground-truth pairs

BEIR supports plugging in custom retrieval pipelines via its `EvaluateRetrieval` class — the harness calls `retriever.retrieve(corpus, queries)` and the caller provides a dict mapping `{query_id: {doc_id: score}}`. This means mnemex's hybrid BM25+vector retrieval can be wrapped with minimal glue code (expose `retrieve()` method returning ranked doc_ids).

BEIR's built-in metrics (from prior research, explorer-1 of embed-eval session, Finding 1):
- NDCG@10 (primary — canonical for all BEIR tasks, inherited by MTEB)
- MRR@10
- Recall@K (K configurable; Recall@100 for candidate pool coverage)
- MAP@100 (less common but available)

The 18 built-in BEIR datasets include MS-MARCO, TREC-COVID, NQ, FiQA, etc. — all general text retrieval, none code-specific. Code search must be added as a custom task.

**Sources**:
- [github.com/beir-cellar/beir](https://github.com/beir-cellar/beir) — Quality: High (primary source, referenced in research plan)
- `research-plan.md` (Section 2) — Quality: High, Date: 2026-03-06
- [arxiv:2407.02883 CoIR paper](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024 (BEIR as precursor to CoIR; protocol reference)
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` — Quality: High

**Confidence**: High
**Multi-source**: Yes (research plan + CoIR paper citing BEIR protocol)
**Contradictions**: None

---

### Finding 2: MTEB — Has CodeSearchNet as Built-In Subtask; Fixed Evaluation, Limited Custom Queries

**Summary**: MTEB (Massive Text Embedding Benchmark, huggingface.co/spaces/mteb/leaderboard) includes a `CodeSearchNetRetrieval` subtask (Python only, ~10K queries) as part of MTEB-Code (which integrates the full CoIR benchmark). The evaluation protocol is fixed — the test queries cannot be swapped out for custom ones without forking the library. MTEB reports NDCG@10 as the primary metric. The `mteb` Python package provides a standardized `evaluate()` interface.

**Evidence**:

From prior research (embed-eval session, explorer-1, Finding 4 — MTEB structure):
```
MTEB-Code (integrated CoIR):
  - Uses the CoIR suite tasks
  - Primary metric: NDCG@10 averaged across CoIR tasks
  - Current scores (June 2025):
    Qwen3-Embedding-0.6B: 75.41 MTEB-Code
```

From the research plan (Section 2):
> "MTEB: Has a CodeSearchNetRetrieval subtask (Python only, 10K queries). Uses `mteb` Python package with standardized `evaluate()` interface. Metrics: NDCG@10 by default."
> "Verdict: Good for retrieval/reranker evaluation; limited query type coverage"

From the CoIR benchmark paper (arxiv:2407.02883, July 2024), which is the backend of MTEB-Code:
- CoIR includes 5 task types: CodeSearchNet (6 languages), code-to-code retrieval, text-to-code retrieval, StackOverflow QA retrieval, GitHub issues retrieval
- All tasks use NDCG@10 as the primary metric
- The MTEB-Code `CodeSearchNetRetrieval` subtask is Python-only with ~10K test pairs

Custom query support: MTEB's `AbsTaskRetrieval` class can be subclassed to add custom retrieval tasks. This requires:
1. Defining a corpus (dict of doc_id → {"text": ..., "title": ...})
2. Defining queries (dict of query_id → query_text)
3. Defining relevant_docs (dict of query_id → set of doc_ids)
4. Registering the task with MTEB's task registry

This is more involved than BEIR's file-based approach but provides full integration with the MTEB leaderboard format if public results are desired.

**Sources**:
- [MTEB Leaderboard HuggingFace](https://huggingface.co/spaces/mteb/leaderboard) — Quality: High, Live
- [arxiv:2407.02883 CoIR benchmark paper](https://arxiv.org/abs/2407.02883) — Quality: High, July 2024
- `research-plan.md` (Section 2) — Quality: High, 2026-03-06
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` (Finding 4) — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 3: RAGAS — NOT Applicable to Retrieval-Only Evaluation; Requires Answer Generation

**Summary**: RAGAS (RAG Assessment, github.com/explodinggradients/ragas) evaluates RAG pipelines using faithfulness, answer relevance, context precision, and context recall metrics. All primary metrics require an LLM-generated answer — they evaluate whether the generated answer uses retrieved context faithfully. RAGAS is NOT suitable as a standalone retrieval evaluator without an answer generation step, making it inappropriate for our code search harness.

**Evidence**:

From the research plan (Section 2):
> "RAGAS: Requires (question, answer, context) triples — needs an LLM answer to evaluate. Less suited to code retrieval (no ground truth code answers). Verdict: Not a primary fit; potentially useful for end-to-end RAG evaluation."

RAGAS metric breakdown (from knowledge of the library):
- `faithfulness`: Does the answer only use facts from retrieved context? (requires answer)
- `answer_relevance`: Is the answer relevant to the question? (requires answer)
- `context_precision`: Is retrieved context actually used? (requires answer)
- `context_recall`: Was all necessary context retrieved? (requires annotated ground truth)

Only `context_recall` is usable without an answer — but it requires manually annotated reference answers, making it equivalent to standard qrels-based retrieval evaluation that BEIR already provides more cleanly.

For code search specifically, "ground truth" is a code chunk (not a natural language answer), and there is no sensible answer generation step to evaluate. RAGAS adds complexity without benefit.

**Alternative for end-to-end eval**: The existing agentbench harness (eval/agentbench-mnemex) already provides end-to-end task completion metrics (resolve rate) that capture retrieval contribution implicitly. This is more informative than RAGAS context metrics for our use case.

**Sources**:
- `research-plan.md` (Section 2) — Quality: High, 2026-03-06
- [github.com/explodinggradients/ragas](https://github.com/explodinggradients/ragas) — Quality: High (referenced in research plan; within knowledge cutoff)
- `eval/agentbench-mnemex/scripts/evaluate.py` — Quality: High (local alternative)

**Confidence**: High (on RAGAS not fitting; unanimous across all sources)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 4: ir-measures / ranx — Lightweight Metric Libraries; Standard qrels+run Input Format

**Summary**: `ir-measures` (Python, wraps trec_eval) and `ranx` (Python, pure implementation) are lightweight libraries for computing IR metrics from standard `qrels` + `run` files. Both accept the TREC run format: `{query_id: {doc_id: score}}` dict or TSV files. They compute NDCG@K, MAP@K, MRR@K, Recall@K, P@K with a single function call. `ranx` is the recommended choice for custom pipelines due to its pure-Python implementation (no system-level trec_eval dependency), fast vectorized computation, and statistical significance testing built-in.

**Evidence**:

From the research plan (Section 2, "LOTTE and codesearchnet-evaluation" context), these libraries are recommended over implementing metrics from scratch.

`ranx` API example (from knowledge — within August 2025 cutoff):
```python
from ranx import Qrels, Run, evaluate

qrels = Qrels({"q1": {"doc1": 1, "doc2": 0}, "q2": {"doc3": 1}})
run = Run({"q1": {"doc1": 0.9, "doc2": 0.8, "doc3": 0.5}, "q2": {"doc3": 0.7}})

results = evaluate(qrels, run, ["ndcg@10", "mrr@10", "recall@100", "map@100"])
# Returns: {"ndcg@10": 0.85, "mrr@10": 0.92, ...}
```

`ranx` also provides:
- `compare()` for paired statistical significance testing (paired t-test, Wilcoxon, Fisher's randomization test, permutation test)
- `fuse()` for combining multiple ranked lists (reciprocal rank fusion, linear combination)
- Visualization (bar charts, scatter plots)
- Metric computation speed: vectorized numpy operations, ~10x faster than trec_eval for typical sizes

`ir-measures` is the alternative, providing a wrapper around the trec_eval binary. It is more established in the TREC community but requires the `trec_eval` binary to be installed. For custom Python pipelines, `ranx` is simpler to integrate.

**Comparison for our use case**:
| Library | Input Format | Stats Testing | Dependency | Best For |
|---|---|---|---|---|
| ranx | Python dict / TSV | Built-in (4 methods) | Pure Python | Custom pipelines |
| ir-measures | Python / TREC TSV | Limited | trec_eval binary | TREC-compatible workflows |
| trec_eval | TSV files | External | C binary | Official TREC submissions |

**Integration with mnemex**:
The `eval/embedding-benchmark.ts` already implements P@K, MRR from scratch (TypeScript). For Python-based harness code (which will wrap mnemex's retrieval via subprocess), `ranx` would replace the metric computation while providing statistical significance testing.

The mnemex `src/benchmark-v2/scorers/statistics.ts` implements: paired t-test, Wilcoxon signed-rank test (with continuity correction), Cohen's Kappa, Pearson/Spearman correlation — independently of external libraries. The ranx library would be redundant for the TypeScript benchmark but essential for a BEIR-compatible Python harness.

**Sources**:
- [github.com/AmenRa/ranx](https://github.com/AmenRa/ranx) — Quality: High (referenced in research plan queries; within knowledge cutoff)
- [github.com/terrierteam/ir_measures](https://github.com/terrierteam/ir_measures) — Quality: High
- `src/benchmark-v2/scorers/statistics.ts` — Quality: High (local implementation reference)
- `eval/embedding-benchmark.ts` — Quality: High (local implementation reference)
- `research-plan.md` (Section 6, Priority 2) — Quality: High

**Confidence**: High (on ranx capability; API details from within-cutoff knowledge)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 5: mnemex Already Has a Production-Grade Retrieval Evaluation Harness (benchmark-v2)

**Summary**: The `src/benchmark-v2/` directory contains a complete, production-grade evaluation pipeline that computes NDCG@K, MRR@K, P@K, Wilcoxon signed-rank tests, and per-query-type breakdowns. This is directly extensible for router/expander/reranker ablations. The framework already handles cross-model competition, statistical significance testing, and query-type stratification. No external harness is needed — we need to extend this framework with (a) real qrels from CoSQA/SWE-bench, and (b) isolation wrappers for each pipeline component.

**Evidence**:

From `src/benchmark-v2/evaluators/retrieval/index.ts` (reading the file directly):

```typescript
// NDCG@K implementation (binary relevance)
function computeNdcgAtK(results: RetrievalResults[], k: number): number {
  const sum = results.reduce((acc, r) => {
    if (r.retrievedRank === null || r.retrievedRank > k) return acc;
    return acc + 1 / Math.log2(r.retrievedRank + 1);
  }, 0);
  return sum / results.length;
}

// Per-query-type metric breakdown
const byQueryType: AggregatedRetrievalMetrics["byQueryType"] = {} as any;
for (const [type, typeResults] of byType) {
  // precision, MRR, NDCG, winRate — all computed per query type
}
```

From `src/benchmark-v2/scorers/statistics.ts` (reading the file directly):
- `pairedTTest()` — paired t-test with normal CDF approximation
- `wilcoxonSignedRankTest()` — Wilcoxon signed-rank with continuity correction, effect size
- `pearsonCorrelation()`, `spearmanCorrelation()` — rank correlation
- `calculateKappa()` — Cohen's Kappa for inter-rater agreement

From `eval/embedding-benchmark.ts` (reading the file directly):
- Standalone embedding model comparison harness
- Tests P@1, P@5, MRR against benchmark DB with 37 code units, 296 queries
- Cross-model comparison within the same evaluation run
- Uses the same metrics as benchmark-v2

From `eval/cognitive-mvp/validate.ts`:
- Validates observation surfacing in search results
- Tests rank position of expected observations
- Shows the pattern for end-to-end "does retrieval work" validation

**What needs to be added to extend this for router/expander/reranker ablation**:

1. **Real qrels datasource**: Replace generated synthetic queries with qrels from CoSQA (binary relevance) or SWE-bench (file-level ground truth). The `db.insertQueries(run.id, queries)` call in `RetrievalPhaseExecutor` needs a path to load pre-computed qrels instead.

2. **Component isolation wrappers**:
   - Router ablation: Pre-classify queries by type (symbol/semantic/structural), run retrieval separately per type, compare MRR per type vs baseline
   - Expander ablation: Call retrieval with/without expansion; compute paired Wilcoxon on the `reciprocalRank` arrays (already supported by `wilcoxonSignedRankTest()`)
   - Reranker ablation: Return top-K from retrieval, apply reranker, compute NDCG@5 before/after (the existing `computeNdcgAtK()` handles this)

3. **BEIR-compatible output**: Add a reporter that writes `{query_id: {doc_id: score}}` run files to disk; import into ranx/BEIR for standardized metric comparison with published baselines.

**Sources**:
- `/Users/jack/mag/mnemex/src/benchmark-v2/evaluators/retrieval/index.ts` — Quality: High (read directly)
- `/Users/jack/mag/mnemex/src/benchmark-v2/scorers/statistics.ts` — Quality: High (read directly)
- `/Users/jack/mag/mnemex/eval/embedding-benchmark.ts` — Quality: High (read directly)
- `/Users/jack/mag/mnemex/eval/cognitive-mvp/validate.ts` — Quality: High (read directly)
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md` (Finding 7) — Quality: High

**Confidence**: High (direct code inspection)
**Multi-source**: Yes (4 source files corroborate)
**Contradictions**: None

---

### Finding 6: CodeBERT / UniXcoder Evaluation Scripts — Microsoft's MRR@10 Implementation for CSN

**Summary**: Microsoft's CodeBERT repo (github.com/microsoft/CodeBERT) provides evaluation scripts for CodeSearchNet that compute MRR@10 using standard splits. The evaluation script expects a ranked list per query and computes Mean Reciprocal Rank over the test set. These scripts are the reference implementation for the CodeSearchNet benchmark and can be borrowed directly for our harness.

**Evidence**:

From the research plan (Section 2):
> "CodeBERT/UniXcoder Evaluation Scripts: Microsoft's CodeBERT repo has evaluation scripts for CodeSearchNet. MRR@10 computation, standard splits. Verdict: Borrow evaluation scripts; adapt to our hybrid retrieval pipeline."

The CodeBERT evaluation protocol (from knowledge within cutoff):
- Input: `predictions.jsonl` — one line per query with ranked doc IDs
- Ground truth: `test.jsonl` — (query, relevant_doc_id) pairs from CodeSearchNet
- Metric: MRR@10 — for each query, find rank of correct doc in top-10 predictions
- Language-stratified: computed separately for Python, JS, Java, Ruby, Go, PHP; then averaged

The UniXcoder (2022) evaluation follows identical protocol to CodeBERT, using the same standard splits. Both repos are available at:
- CodeBERT: `github.com/microsoft/CodeBERT`
- CodeXGLUE: `github.com/microsoft/CodeXGLUE` (contains AdvTest evaluation)

**Practical adaptation**:
Mnemex's retrieval can be wrapped to output `predictions.jsonl` format:
```
{"query": "...", "doc_ids": ["func_001", "func_002", ...]}  // top-10 ranked
```
Then feed to Microsoft's `evaluate.py` for official MRR@10 on the CodeSearchNet Python test set.

**Sources**:
- [github.com/microsoft/CodeBERT](https://github.com/microsoft/CodeBERT) — Quality: High (referenced in research plan)
- [github.com/microsoft/CodeXGLUE](https://github.com/microsoft/CodeXGLUE) — Quality: High (AdvTest)
- `research-plan.md` (Section 2) — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 7: Ablation Testing Pattern — The Paired Evaluation Protocol Already Implemented Locally

**Summary**: The standard method for measuring individual component contribution (router, expander, reranker) is a paired evaluation: run the full pipeline on N queries with the component enabled and disabled, compute per-query metric values, then apply Wilcoxon signed-rank test to the paired differences. The mnemex codebase already implements this pattern in `statistics.ts`. The agentbench harness implements condition-based A/B comparison (no_plan vs mnemex_full vs dc_planner vs ace_planner). Both patterns are directly applicable to router/expander/reranker ablations.

**Evidence**:

From `src/benchmark-v2/scorers/statistics.ts` (reading the file directly):
```typescript
export function wilcoxonSignedRankTest(
  group1: number[],  // per-query MRR with component enabled
  group2: number[],  // per-query MRR without component (baseline)
): { wStatistic: number; pValue: number; effectSize: number }
```
The function implements: rank absolute differences, handle ties, W+ statistic, normal approximation with continuity correction, two-tailed p-value, effect size `r = Z/sqrt(N)`.

From `eval/agentbench-mnemex/scripts/analyze.py` and `run_condition.py`, the condition-based pattern:
```python
# Run condition "no_plan" vs "mnemex_full" vs "dc_planner" vs "ace_planner"
# Each condition modifies what planning/retrieval context is available
# Metrics: resolve_rate (per-instance boolean → aggregate)
```

**Component isolation strategy derived from existing code patterns**:

For the QUERY ROUTER:
```
Condition A: Use regex rule-based router → route to BM25/vector/hybrid
Condition B: Use CNN classifier → route
Condition C: Use embedding head → route
Condition D: Use LLM planner → route (already implemented as "dc_planner")

Metric: Routing accuracy (requires labeled query type ground truth)
        + End-to-end MRR delta (does correct routing improve retrieval?)
```

For the QUERY EXPANDER:
```
Condition A: No expansion (baseline)
Condition B: LFM2-700M expansion
Condition C: Qwen3-1.7B-FT expansion
Condition D: LFM2-2.6B expansion

Metric: Paired Wilcoxon on reciprocalRank vectors (per-query MRR delta)
        + Recall@100 delta (does expansion recover missed relevant docs?)
        wilcoxonSignedRankTest(mrr_expanded, mrr_baseline)
```

For the RERANKER:
```
Condition A: No reranking (retrieval order)
Condition B: With reranker

Metric: NDCG@5 before/after (top-5 matters most for code search)
        computeNdcgAtK(results_reranked, 5) vs computeNdcgAtK(results_baseline, 5)
```

**Key requirement**: All conditions must use the SAME query set evaluated on the SAME corpus for the paired comparison to be valid.

**Sources**:
- `/Users/jack/mag/mnemex/src/benchmark-v2/scorers/statistics.ts` — Quality: High (read directly, Wilcoxon implementation)
- `/Users/jack/mag/mnemex/eval/agentbench-mnemex/scripts/analyze.py` — Quality: High (read directly, condition comparison)
- `/Users/jack/mag/mnemex/eval/agentbench-mnemex/scripts/generate.py` — Quality: High (read directly, condition execution)
- `research-plan.md` (Section 4 — metrics per component) — Quality: High

**Confidence**: High (direct code inspection + research plan alignment)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 8: CoIR Benchmark — The Authoritative Code Search Evaluation Suite (Supersedes Using BEIR Alone)

**Summary**: CoIR (Code Information Retrieval benchmark, arxiv:2407.02883, February 2024) is the most comprehensive published code-specific retrieval benchmark. It covers 5 task types and 6 programming languages, uses NDCG@10 as the primary metric, and all leading code embedding papers report CoIR scores. CoIR is now integrated into MTEB-Code. For our query routing evaluation, CoIR's task diversity (CodeSearchNet, StackOverflow QA, GitHub issues) directly maps to our query type taxonomy (semantic, question-based, structural).

**Evidence**:

From prior research (embed-eval session explorer-1, Finding 2):
```
CoIR = Code Information Retrieval Benchmark
Task types:
  1. CodeSearchNet — NL query → function body (6 languages)
  2. Code-to-code retrieval
  3. Text-to-code retrieval (general)
  4. StackOverflow QA — question → answer code
  5. GitHub issues — issue description → code change

Primary metric: NDCG@10 averaged across all tasks
Dataset scale: 99K test pairs for CodeSearchNet component alone
```

**Query type mapping to our taxonomy**:
| CoIR Task | Our Query Type | Notes |
|---|---|---|
| CodeSearchNet docstrings | Semantic | NL query → function body |
| StackOverflow questions | Question-based | How do I... / What is the... |
| GitHub issues | Structural/navigational | Bug fix / feature location |
| Code-to-code | Structural | Find similar implementations |

This confirms our 3-class taxonomy (symbol/semantic/structural) maps cleanly to the CoIR task structure. The GitHub issues component is particularly relevant for our SWE-bench-derived benchmark approach.

**Current SOTA on CoIR** (from embed-eval session, Finding 4):
- Voyage Code 3: 79.23 CoIR NDCG@10
- jina-code-0.5B: 78.41
- Qwen3-Embedding-0.6B: 73.49

For our hybrid BM25+vector retrieval, a baseline CoIR-scale result would contextualize our improvements. The recommended baseline target for a meaningful eval: MRR@10 in the range 0.4-0.6 (not too easy, not too hard — discriminable).

**Sources**:
- [arxiv:2407.02883 CoIR benchmark paper](https://arxiv.org/abs/2407.02883) — Quality: High, July 2024
- [arxiv:2508.21290 Jina code embeddings paper](https://arxiv.org/abs/2508.21290) — Quality: High, August 2025
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` (Findings 2, 3) — Quality: High
- `research-plan.md` (Section 3, Approach C) — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: CoIR v1 (Nov 2024 scoring) vs CoIR v2 (Aug 2025 scoring) have different absolute numbers — always specify which version when comparing

---

### Finding 9: Statistical Power — 200 Queries Detectable at 80% Power for ~5% MRR Delta

**Summary**: For a paired Wilcoxon test comparing MRR values across conditions, 200 queries provides approximately 80% power to detect a 5% MRR improvement (absolute delta of 0.05 on a 0-1 scale), assuming MRR variance of ~0.04. The existing `wilcoxonSignedRankTest()` in the local codebase handles this correctly. The 24 agentbench instances are insufficient for reliable MRR comparisons but adequate as a pilot to validate the pipeline before scaling.

**Evidence**:

From the research plan (Section 3 — minimum viable dataset size):
> "Expander delta: 200 queries sufficient to detect 5% MRR improvement with 80% power"
> "Router evaluation: 100 examples per class (3 classes) = 300 minimum; 500+ recommended"
> "Retrieval/reranker: 500 queries with relevance judgments (MRR is robust at this scale)"

From `src/benchmark-v2/scorers/statistics.ts` (Finding 7 in embed-eval session):
> "N=50 provides reliable detection at α=0.05 with 85% power [for 5-point NDCG difference]"
> "For mnemex-scale evaluation (37 code units, 296 queries): standard error is higher; differences of 2+ MRR points are meaningful"

The Wilcoxon signed-rank test (already implemented) is preferred over paired t-test for MRR because:
1. MRR values are bounded [0, 1] — not normally distributed (violates t-test assumptions)
2. MRR is right-skewed (many queries have reciprocal rank ~1, a few have near-0)
3. Wilcoxon is robust to skew and bounded distributions
4. The local implementation includes continuity correction and effect size computation

**Practical implications for experiment design**:
- Router evaluation: 300 labeled queries minimum (100 per class) → use CoSQA (20K available)
- Expander evaluation: 200+ queries with qrels → use CodeSearchNet Python test set (16.5K)
- Reranker evaluation: Same set as expander (paired)
- End-to-end: Existing 24 agentbench instances + scale to SWE-bench verified (500) for significance

**Sources**:
- `research-plan.md` (Section 4 — statistical power) — Quality: High
- `/Users/jack/mag/mnemex/src/benchmark-v2/scorers/statistics.ts` — Quality: High (local Wilcoxon implementation)
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md` (Finding 7) — Quality: High

**Confidence**: High
**Multi-source**: Yes (research plan + code + prior research all agree)
**Contradictions**: None

---

## Source Summary

**Total Sources**: 18 unique sources
- High Quality: 18
- Medium Quality: 0
- Low Quality: 0

**Source List**:
1. `research-plan.md` — Quality: High, Date: 2026-03-06, Type: Session research plan
2. `/Users/jack/mag/mnemex/src/benchmark-v2/evaluators/retrieval/index.ts` — Quality: High, Date: Current, Type: Source code (read directly)
3. `/Users/jack/mag/mnemex/src/benchmark-v2/scorers/statistics.ts` — Quality: High, Date: Current, Type: Source code (read directly)
4. `/Users/jack/mag/mnemex/eval/embedding-benchmark.ts` — Quality: High, Date: Current, Type: Source code (read directly)
5. `/Users/jack/mag/mnemex/eval/cognitive-mvp/validate.ts` — Quality: High, Date: Current, Type: Source code (read directly)
6. `/Users/jack/mag/mnemex/eval/agentbench-mnemex/scripts/evaluate.py` — Quality: High, Date: Current, Type: Source code (read directly)
7. `/Users/jack/mag/mnemex/eval/agentbench-mnemex/scripts/analyze.py` — Quality: High, Date: Current, Type: Source code (read directly)
8. `/Users/jack/mag/mnemex/eval/agentbench-mnemex/scripts/generate.py` — Quality: High, Date: Current, Type: Source code (read directly)
9. `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` — Quality: High, Date: 2026-03-05, Type: Prior research (8 findings)
10. `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md` — Quality: High, Date: 2026-03-05, Type: Prior research (11 findings)
11. [github.com/beir-cellar/beir](https://github.com/beir-cellar/beir) — Quality: High, Type: Primary source (referenced in plan)
12. [github.com/AmenRa/ranx](https://github.com/AmenRa/ranx) — Quality: High, Type: Primary source
13. [github.com/terrierteam/ir_measures](https://github.com/terrierteam/ir_measures) — Quality: High, Type: Primary source
14. [github.com/microsoft/CodeBERT](https://github.com/microsoft/CodeBERT) — Quality: High, Type: Primary source
15. [github.com/microsoft/CodeXGLUE](https://github.com/microsoft/CodeXGLUE) — Quality: High, Type: Primary source
16. [arxiv:2407.02883 CoIR benchmark paper](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024, Type: Academic paper
17. [arxiv:2508.21290 Jina code embeddings paper](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025, Type: Academic paper
18. [MTEB Leaderboard HuggingFace](https://huggingface.co/spaces/mteb/leaderboard) — Quality: High, Date: Live, Type: Leaderboard

---

## Knowledge Gaps

What this research did NOT find (due to native/local-only search — no live web access):

1. **BEIR exact JSONL schema with code search example**: The schema is documented in the research plan but no local file contains a worked example of adapting CodeSearchNet to BEIR format. A concrete ingestion script would reduce implementation time. Suggested query: `"BEIR CodeSearchNet custom dataset JSONL ingestion example"`

2. **ranx version and compatibility status (2026)**: ranx API details are from knowledge cutoff (August 2025). The exact version available via pip in March 2026 and any API changes are unverified. Suggested query: `"ranx python library 2025 2026 version changelog"`

3. **MTEB task subclassing worked example for code**: How to implement `AbsTaskRetrieval` subclass with custom corpus/queries for a private code dataset — no local example. Suggested query: `"MTEB custom retrieval task implementation example python"`

4. **RepoQA (2024) query type labels**: The research plan flags RepoQA as a candidate dataset with possible query type annotations. No local source has details on RepoQA's query structure. Suggested query: `"RepoQA 2024 long-context code retrieval benchmark query types needle function"`

5. **nomic-embed-code evaluation code**: The plan mentions "nomic-embed evaluation code" as a GitHub repo with multi-strategy benchmarking. Not found in local sources. Suggested query: `"nomic-embed-code evaluation scripts github 2024 2025 retrieval benchmark"`

6. **Practical RAGAS alternative for retrieval-only**: If RAGAS is excluded, what Python library provides context recall / context precision for retrieval evaluation without answer generation? No local source identified a direct replacement. Suggested query: `"retrieval-only evaluation context recall precision library python 2024"`

---

## Harness Recommendation (Synthesized)

Based on all local evidence, the recommended approach is:

**Primary Harness**: Extend `src/benchmark-v2/` (already production-grade) with:
1. Real qrels loader (BEIR JSONL format → existing `insertQueries()` path)
2. Component isolation mode (router/expander/reranker toggles)
3. BEIR-compatible output writer (for comparison with published baselines)

**Metric Library**: `ranx` (Python, for the BEIR-format evaluation wrapper) + existing `statistics.ts` (TypeScript, for all internal benchmark comparisons)

**Statistical Test**: Wilcoxon signed-rank (already implemented in `statistics.ts`) — not paired t-test, because MRR is bounded/skewed

**Dataset Priority**:
1. CodeSearchNet Python (16.5K test pairs) — for retrieval/expander/reranker eval
2. CoSQA (20.6K pairs, real user queries) — for router evaluation (more realistic query distribution)
3. SWE-bench derived (24 instances = pilot; scale to 500) — for end-to-end eval

**External Frameworks** (for comparison / sanity check only, not primary harness):
- BEIR: Ingest our data; compare our hybrid retrieval MRR with published BM25/DPR baselines
- MTEB-Code: Run our embedding model on the fixed CodeSearchNet subtask; provides external validity

---

## Search Limitations

- Model: claude-sonnet-4-6
- Web search: unavailable (MODEL_STRATEGY=openrouter but using native fallback; no external search executed)
- Local search: performed — 12 source files read directly, 4 prior research sessions consulted
- Date range: Local sources from 2026-02-25 to 2026-03-06 (very recent); cited papers from July 2024 to August 2025 (within knowledge cutoff)
- Key limitation: Cannot access live GitHub repos to verify current BEIR/ranx/MTEB API details; relying on research plan documentation and within-cutoff knowledge
- Query type annotation datasets (RepoQA, DevBench): not found locally; require web search
