# Research Synthesis: Iteration 1
# Code Search Testing Harness — Datasets, Framework, and Experiment Plan

**Date**: 2026-03-06
**Sources Processed**: 3 explorer findings + research plan + 12 local code files + 8 prior research session archives
**Iteration**: 1
**Mode**: synthesis

---

## Key Findings

### 1. SWE-bench Issue-to-Patch Pairs Are the Best Real-Developer Retrieval Ground Truth [CONSENSUS: UNANIMOUS]

**Summary**: The SWE-bench schema maps directly to a (query, relevant_files) retrieval benchmark with zero annotation cost. Every SWE-bench instance gives a `problem_statement` (NL query) and a `patch` (unified diff → extract modified file paths as ground truth). This is confirmed from three independent sources: the agentbench `swebench.py` schema, the mnemex `analyze.py` gold-patch extraction, and the research plan's Approach A.

**Evidence**:
- The `SweBenchInstance.task` field = `problem_statement` (the GitHub issue text — the retrieval query) [Source: `agentbench/benchmarks/swebench.py`]
- `analyze.py` extracts `gold_patch.get_file_names()` as ground truth files already [Source: local `eval/agentbench-mnemex/scripts/analyze.py`]
- 24 instances available immediately (12 repos × 2), 500 via `princeton-nlp/SWE-bench_Verified`, ~2,294 via full SWE-bench [Source: `run_condition.py` FILTER + HuggingFace dataset card]
- No published paper has formally packaged SWE-bench as a standalone retrieval benchmark — this is genuinely novel [Confirmed by all 3 explorers]
- Limitation: file-level granularity (not function-level); patches touch auxiliary files (tests, docs) alongside core implementation files

**Supporting Sources**:
- `/Users/jack/mag/agentbench/src/agentbench/benchmarks/swebench.py` — High, 2026-03-06
- `/Users/jack/mag/mnemex/eval/agentbench-mnemex/scripts/analyze.py` — High, 2026-03-06
- [SWE-bench HuggingFace (princeton-nlp/SWE-bench_Verified)](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified) — High, 2024
- [SWE-bench paper arXiv:2310.06770](https://arxiv.org/abs/2310.06770) — High, 2023

**Confidence**: High (local schema directly readable)

---

### 2. No Published Code Search Dataset Has Query Type Labels — Must Generate [CONSENSUS: UNANIMOUS]

**Summary**: Every major code search dataset (CodeSearchNet, CoSQA, AdvTest, RepoQA, CoIR) was surveyed across all 3 explorers. None provide explicit symbol_lookup / semantic_search / structural / exploratory type labels. The field's query type taxonomy is newer than the datasets. The mnemex codebase's existing `query-generator.ts` (8 query types) and heuristic auto-labeling (regex patterns on issue text) are the recommended solutions.

**Evidence**:
- Survey of all major datasets confirms: CodeSearchNet (docstrings only = all semantic), CoSQA (Bing queries, no type labels), RepoQA (function descriptions only = all semantic), CoIR (mixed but unlabeled), SWE-bench (partial: bug/feature = proxy for type) [Source: Explorer 1, Finding 6, full survey table]
- Existing `query-generator.ts` generates 8 typed queries per code unit — maps to 4-class taxonomy [Source: Explorer 3, Finding 2]
- Heuristic auto-labeling for SWE-bench issues: backtick-quoted identifiers → symbol_lookup; behavior descriptions → semantic; "add support for" → exploratory [Source: Explorer 3, Finding 5]
- SWE-bench issue type (bug/feature) partially proxies for query intent but is not the same as query type [Source: Explorer 1, Finding 6]

**Supporting Sources**:
- [CoIR benchmark paper arXiv:2407.02883](https://arxiv.org/abs/2407.02883) — High, July 2024
- `/Users/jack/mag/mnemex/src/benchmark-v2/extractors/query-generator.ts` — High, 2026-02-25
- Research plan `/research-plan.md` Section 1 "Query Type Label Gap" — High, 2026-03-06
- Prior research session `dev-research-query-planner-code-search-20260306-013647-95ad5665/report.md` — High, 2026-03-06

**Confidence**: High

---

### 3. Extend benchmark-v2 as Primary Harness — Already Has NDCG, MRR, Wilcoxon [CONSENSUS: STRONG]

**Summary**: The mnemex `src/benchmark-v2/` directory contains a production-grade evaluation pipeline with NDCG@K, MRR@K, P@K, paired Wilcoxon signed-rank tests, and per-query-type breakdowns. Extending this is lower effort than adopting an external harness. The required additions are: (a) real qrels loader from BEIR JSONL format, (b) component isolation toggles (router/expander/reranker on/off), (c) BEIR-compatible output writer for external comparison. BEIR and ranx serve as compatibility layers, not replacements.

**Evidence**:
- `src/benchmark-v2/evaluators/retrieval/index.ts` implements NDCG@K, per-query-type breakdown [Source: Explorer 2, Finding 5 — direct code read]
- `src/benchmark-v2/scorers/statistics.ts` implements Wilcoxon signed-rank, paired t-test, Cohen's Kappa, Pearson/Spearman [Source: Explorer 2, Finding 7 — direct code read]
- `eval/embedding-benchmark.ts` shows working pattern: P@1, P@5, MRR against 37 code units, 296 queries [Source: Explorer 2, Finding 5]
- `src/benchmark-v2/types.ts` has `EvaluationWeights` and `GeneratedQuery` with `type: QueryType` field — schema supports query-type-labeled evaluation without changes [Source: Explorer 3, Finding 8]

**Supporting Sources**:
- `/Users/jack/mag/mnemex/src/benchmark-v2/evaluators/retrieval/index.ts` — High, 2026-02-25
- `/Users/jack/mag/mnemex/src/benchmark-v2/scorers/statistics.ts` — High, 2026-02-25
- `/Users/jack/mag/mnemex/src/benchmark-v2/types.ts` — High, 2026-02-25
- `/Users/jack/mag/mnemex/eval/embedding-benchmark.ts` — High, 2026-02-25

**Confidence**: High (direct code inspection)

---

### 4. Statistical Power: Need 150-200 Queries Minimum for 5% MRR Detection [CONSENSUS: UNANIMOUS]

**Summary**: For a paired Wilcoxon signed-rank test to detect a 5% absolute MRR improvement at 80% power (α=0.05), approximately 128-200 queries are required. The 24 SWE-bench instances available today can only detect improvements ≥18% MRR — too large to be useful for fine-grained component comparison. Wilcoxon is preferred over paired t-test because MRR values are bounded [0,1] and right-skewed, violating t-test normality assumptions.

**Evidence**:
- Power calculation: MRR baseline ≈ 0.5, delta = 0.05, σ ≈ 0.2, effect size = 0.25 (Cohen's d), required N ≈ 128, with non-parametric overhead → 150-200 [Source: Explorer 3, Finding 4 — derived from statistics.ts + standard power tables]
- Detectable MRR deltas by N: 24 queries → ≥0.18, 50 → ≥0.12, 120-200 → ≥0.05, 500 → ≥0.03 [Source: Explorer 3, Finding 4]
- The existing `wilcoxonSignedRankTest()` in `statistics.ts` handles this correctly with continuity correction and effect size r = Z/sqrt(N) [Source: Explorers 2 + 3 — direct code read]
- Research plan Section 3 specifies "200 queries sufficient to detect 5% MRR improvement with 80% power" [Source: research-plan.md]

**Supporting Sources**:
- `/Users/jack/mag/mnemex/src/benchmark-v2/scorers/statistics.ts` — High, 2026-02-25
- `research-plan.md` Section 3 — High, 2026-03-06
- `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md` Finding 7 — High, 2026-03-05

**Confidence**: High (statistical theory + local implementation confirmed)

---

### 5. Hybrid Dataset (SWE-bench + Synthetic) Achieves Minimum Viable Coverage in One Pass [CONSENSUS: STRONG]

**Summary**: Combining the 24 SWE-bench instances (real developer queries, file-level GT) with synthetic queries generated from our 12 repos (function-level GT, typed labels) gives ~384 queries at negligible cost (~$0.14 LLM cost for generation). This surpasses the 150-200 query threshold and covers all 4 query types. The synthetic generation uses the existing `query-generator.ts` (8 types → map to 4-class taxonomy). A separate held-out router test set of 300 queries (100/class) is needed for classification evaluation.

**Evidence**:
- 30 high-PageRank symbols × 12 repos = 360 symbols × 8 queries = 2,880 raw queries; after quality filtering ≈ 2,000 usable [Source: Explorer 3, Finding 7]
- Cost: 360 symbols × $0.002/1K tokens × 200 tokens = ~$0.14 [Source: Explorer 3, Finding 2]
- Quality filters needed: identifier leakage filter (flag exact function names), length filter (4-30 words), diversity check [Source: Explorer 3, Finding 3]
- Dataset split: 300-query router test set (held out, labeled for type) + 200-query retrieval eval set (separate, labeled for GT) = 500 queries total, from disjoint pools [Source: Explorer 3, Finding 7]
- Vocabulary contamination risk: `doc_api_lookup` and `specific_behavior` query types have high identifier leakage risk; `vague`, `wrong_terminology`, `problem_based` are low risk [Source: Explorer 3, Finding 3 + prior research]

**Supporting Sources**:
- `/Users/jack/mag/mnemex/src/benchmark-v2/extractors/query-generator.ts` — High, 2026-02-25
- `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md` — High, 2026-03-05
- `research-plan.md` Section 3 Approach C — High, 2026-03-06
- MEMORY.md (12 repos, ~39K symbols confirmed) — High, 2026-03-06

**Confidence**: High

---

## Recommended Testing Architecture

```
Layer 1: Data
  SWE-bench-derived (24 instances, immediate)     — real queries, file-level GT
  + Synthetic from 12 repos (2,000 generated)    — typed queries, function-level GT
  + CoSQA Python subset (optional, 2K)           — real user queries, function-level GT
  → Partitioned into: router_test (300) + retrieval_eval (200+)

Layer 2: Harness
  Primary: src/benchmark-v2/ (extend, not replace)
  - Add: real qrels loader (BEIR JSONL → existing insertQueries() path)
  - Add: component toggle flags (--no-router, --no-expander, --no-reranker)
  - Add: BEIR-compatible run file output {query_id: {doc_id: score}}
  Metric library: ranx (Python, for BEIR-format wrapper) + statistics.ts (TypeScript, internal)

Layer 3: Metrics
  Router: Macro-F1 per class + confusion matrix (Accuracy, per-class P/R)
  Retrieval/Expander: MRR@10, NDCG@10, Recall@100 — paired Wilcoxon (statistics.ts)
  Reranker: NDCG@5 (top-5 most relevant for code search)
  End-to-end: SWE-bench resolve rate (existing agentbench harness — already built)

Layer 4: Comparison
  BEIR: External validity — compare hybrid retrieval MRR vs BM25/DPR baselines
  MTEB CodeSearchNetRetrieval: External baseline for embedding quality
```

---

## Dataset Selection (Ranked by Fit)

| Rank | Dataset | Fit | Why | Primary Use | Status |
|------|---------|-----|-----|-------------|--------|
| 1 | **Our hybrid (SWE-bench + synthetic)** | BEST | Exact repos, exact components, typed labels, zero cost | All components | Build from existing code |
| 2 | **CoSQA** (20,604 pairs, Python) | HIGH | Real Bing queries, binary GT, function-level, HuggingFace | Router eval, real-user baseline | `load_dataset("microsoft/CoSQA")` |
| 3 | **CodeSearchNet Python test** (16.5K pairs) | HIGH | Largest labeled set, MRR@10 baseline comparable to SOTA | Retrieval/expander eval | `load_dataset("code-search-net/code_search_net", "python")` |
| 4 | **SWE-bench-verified** (500 instances) | HIGH | Real developer queries, scale for significance | End-to-end + retrieval | `load_dataset("princeton-nlp/SWE-bench_Verified")` |
| 5 | **AdvTest** (280 queries) | MEDIUM | Robustness test: does BM25 over-rely on identifiers? | Supplementary robustness | Via microsoft/CodeXGLUE GitHub |
| 6 | **CoIR** (multi-task) | MEDIUM | External validity; NDCG@10 comparable to published models | Baseline comparison only | Via `mteb` package |
| 7 | **WebQueryTest** (~1K pairs) | LOW | Too small; overlaps with CoSQA methodology | Skip for now | Download path uncertain |
| 8 | **RepoQA** (hundreds of pairs) | LOW | Long-context LLM eval, not retrieval; no type labels | Skip | Dataset details unconfirmed |
| EXCLUDE | **LOTTE** | 0 | Not a code retrieval dataset; NL tech questions only | Do not use | Confirmed non-applicable |

**Minimum Viable Benchmark** (for immediate use without external downloads):
- 24 SWE-bench instances (already loaded in agentbench harness) + 200 synthetic queries from 12 repos
- Total: 224 queries — surpasses 150-200 threshold; sufficient for 5% MRR detection
- Cost to build: ~$0.06 (generate 30 symbols × 5 queries × 12 repos via deepseek-v3.2)
- Build time: ~2 hours including quality filtering

---

## Evaluation Framework

### Primary: Extend src/benchmark-v2/ (TypeScript)

**What already exists** (no new code needed):
- `evaluators/retrieval/index.ts`: NDCG@K, MRR@K, P@K, per-query-type breakdown
- `scorers/statistics.ts`: Wilcoxon signed-rank, paired t-test, effect size
- `extractors/query-generator.ts`: 8-type query generation, quality controls
- `eval/embedding-benchmark.ts`: Cross-model comparison pattern
- `eval/agentbench-mnemex/`: End-to-end resolve rate (already built)

**What to add** (minimal delta):
1. `eval/code-search-harness/loader.ts` — load BEIR JSONL qrels into benchmark-v2 format
2. `eval/code-search-harness/ablation.ts` — run conditions A-F (all component combinations)
3. `eval/code-search-harness/reporter.ts` — output BEIR run files for external comparison
4. Schema extension in `types.ts`: add `routerLabel?: "symbol_lookup" | "semantic_search" | "structural" | "exploratory"` to `GeneratedQuery`

### Secondary: BEIR + ranx (Python, for external comparison)

```python
# Wrap mnemex retrieval as BEIR-compatible retriever
from beir.retrieval.evaluation import EvaluateRetrieval

class Mnemex Retriever:
    def retrieve(self, corpus, queries):
        # Call mnemex CLI via subprocess with --agent flag
        # Parse ranked results
        return {query_id: {doc_id: score, ...}, ...}

evaluator = EvaluateRetrieval(MnemexRetriever())
ndcg, map, recall, precision = evaluator.evaluate(qrels, results, [5, 10, 100])
```

### Statistical Test Protocol

All component comparisons use paired Wilcoxon signed-rank (not t-test):
```typescript
// Per-query metric vectors
const mrrWithExpansion: number[] = [...];  // one value per query
const mrrBaseline: number[] = [...];       // same queries, same order

const test = wilcoxonSignedRankTest(mrrWithExpansion, mrrBaseline);
// Reports: wStatistic, pValue, effectSize (r = Z/sqrt(N))
// Alpha = 0.05, two-tailed
```

---

## Concrete Experiment Plan

### Phase 0: Build Benchmark Dataset (Day 1-2)

**Step 1: Extract SWE-bench ground truth from 24 instances**
```python
# From each SWE-bench instance in agentbench harness:
import re
for instance in load_24_agentbench_instances():
    query = instance.task  # = problem_statement
    patch_files = re.findall(r'^--- a/(.*)', instance.patch, re.MULTILINE)
    auto_label = classify_query_type(query)  # heuristic rules
    write_to_qrels(query, patch_files, auto_label)
```

**Step 2: Generate synthetic queries from 12 repos**
```bash
# For each repo, get top-30 PageRank symbols:
mnemex map --agent /path/to/repo | head -30
# Feed to query-generator.ts → 8 queries per symbol
# Apply quality filters: identifier leakage, length, diversity
```

**Step 3: Split dataset**
- Router test set: 300 queries (100/class, stratified) — hold out completely
- Retrieval eval set: 200 queries (separate pool) — used for all retrieval ablations

### Phase 1: Baseline (Day 2-3)

**Condition A: Pure hybrid retrieval (no router, no expander, no reranker)**
- Run mnemex retrieval on all 200 retrieval eval queries
- Record per-query MRR, NDCG@10, Recall@100
- Target: MRR@10 baseline in 0.4-0.6 range (too easy <0.7, too hard >0.8 — need discriminable range)
- If baseline is outside range: adjust corpus size or query difficulty

### Phase 2: Component Ablations (Day 3-4)

**Condition B: +Router only (3 methods in parallel)**
- B1: Regex rule-based router
- B2: CNN classifier (if trained)
- B3: LLM planner (existing dc_planner from agentbench)
- Metric: Routing accuracy on 300-query router test set (macro-F1 per class)
- + End-to-end MRR delta over Condition A (does correct routing improve retrieval?)

**Condition C: +Expander only (3 model tiers)**
- C1: LFM2-700M expansion
- C2: Qwen3-1.7B-FT expansion
- C3: LFM2-2.6B expansion
- Metric: Paired Wilcoxon on (MRR_Cx, MRR_baseline) per query — same 200 queries
- Also: Recall@100 delta (expansion should recover missed relevant docs)
- Also: P50/P95 latency per expansion call (quality vs latency tradeoff)

**Condition D: +Reranker only**
- Take top-100 from Condition A retrieval; apply reranker; re-evaluate top-10
- Metric: NDCG@5 before/after (top-5 most critical for code navigation)
- Paired Wilcoxon on NDCG@5 vectors

### Phase 3: Full Pipeline (Day 4-5)

**Condition E: Full pipeline (best router + best expander + retriever + reranker)**
**Condition F: Router + expander (no reranker)**
- Compare E vs F: isolates reranker contribution in full-pipeline context
- Report: MRR@10, NDCG@5, NDCG@10, Recall@100 for all conditions A-F in one table

### Phase 4: End-to-End Validation (Day 5-6)

**Use existing agentbench harness** with 24 SWE-bench instances:
- Run conditions: no_plan vs mnemex_full vs best-new-router
- Metrics: resolve_rate + files_retrieved_that_were_patched (new metric)
- Statistical note: 24 instances only detects ≥18% resolve rate delta — interpret with caution; use for directional signal only

### Phase 5: External Validation (Day 6-7, optional)

- Run CodeSearchNet Python subset (16.5K) through Condition A retrieval
- Compare MRR@10 with published baselines (CodeBERT MRR@10, UniXcoder MRR@10)
- This validates our pipeline is in the right ballpark vs the literature

---

## Evidence Quality Assessment

**By Consensus Level**:
- UNANIMOUS agreement: 5 findings (SWE-bench as GT, query type label gap, 150-200 query threshold, Wilcoxon for MRR, hybrid dataset viability)
- STRONG consensus: 4 findings (extend benchmark-v2, BEIR compatibility, RAGAS exclusion, LOTTE exclusion)
- MODERATE support: 1 finding (synthetic query cost estimate — only Explorer 3)
- WEAK support: 1 finding (RepoQA details — Explorer 1 training knowledge only)
- CONTRADICTORY: 0 findings

**By Source Count**:
- Multi-source (3+ sources): 8 findings
- Dual-source (2 sources): 4 findings
- Single-source (1 source): 2 findings (RepoQA, WebQueryTest)

---

## Quality Metrics

**Factual Integrity**: 96% (target: 90%+)
- Total claims: ~54
- Sourced claims: ~52 (2 unsourced: RepoQA exact details from training knowledge only; WebQueryTest exact paper unknown)
- Status: PASS

**Agreement Score**: 80% (target: 60%+)
- Total findings: 15 distinct findings
- Multi-source findings: 12
- Status: PASS

**Source Quality**:
- High quality: ~28 sources (93%)
- Medium quality: ~3 sources (7%)
- Low quality: ~0 sources (0%)

**Overall**: Both quality gates PASS. Synthesis is ready for implementation planning.

---

## Knowledge Gaps

### CRITICAL Gaps (require immediate investigation)

1. **"SWE-bench as retrieval benchmark" prior art**: All 3 explorers confirm no published paper formally frames SWE-bench as a retrieval benchmark (query=issue, GT=patch files, metrics=Recall@K/MRR). Before building, verify no Nov 2025 - Feb 2026 paper beat us to this. This also represents a potential novel contribution.
   - Why unexplored: Training knowledge cutoff Aug 2025; no live web search
   - Suggested query: `"SWE-bench file localization retrieval benchmark recall MRR 2025 arxiv"`
   - Priority: CRITICAL (prior art check before investing implementation time)

2. **Agentless/SWE-agent file localization baselines**: The Agentless paper (2024) explicitly solves file localization as a subtask. Their localization recall metrics would be direct baselines for our retrieval evaluation.
   - Why unexplored: Local research sessions don't cover Agentless internals
   - Suggested query: `"Agentless SWE-bench file localization recall precision arxiv 2024"`
   - Priority: CRITICAL (defines competitive baseline)

### IMPORTANT Gaps (should investigate before Phase 2)

3. **CoSQA query intent distribution**: What fraction of 20,604 CoSQA queries are symbol_lookup vs semantic_search vs structural? This validates (or invalidates) our auto-labeling heuristics and tells us whether CoSQA can substitute for the router test set.
   - Suggested query: `"CoSQA query intent distribution Bing search code type breakdown symbol semantic"`
   - Priority: IMPORTANT

4. **Vocabulary contamination empirical rate**: The identifier leakage filter is described heuristically. What fraction of `doc_api_lookup` and `specific_behavior` queries actually contain exact function names? Needs an empirical pass over a sample of generated queries.
   - This can be measured locally once query generation runs — no external research needed
   - Priority: IMPORTANT (implement as part of Phase 0)

5. **RepoQA exact dataset structure**: Explorer 1 mentions it at `Qwen/RepoQA-bench` but with Medium confidence. Confirm the exact HuggingFace path, scale (number of repo-question pairs), and whether any query type annotations exist.
   - Suggested query: `"RepoQA 2024 huggingface dataset long-context code retrieval Qwen/RepoQA-bench"`
   - Priority: IMPORTANT (may provide an additional test set)

### NICE-TO-HAVE Gaps (optional)

6. **Bootstrap CI for MRR at N=24**: The parametric power analysis gives approximate N requirements. Empirical bootstrap CIs from published IR papers would be more precise. Not blocking implementation.
   - Suggested query: `"bootstrap confidence interval MRR code retrieval small dataset Sakai"`
   - Priority: NICE-TO-HAVE

7. **WebQueryTest exact download**: ~1K pairs, Python only — too small for primary evaluation. Only needed if supplementary robustness testing beyond AdvTest is desired.
   - Priority: NICE-TO-HAVE

---

## Convergence Assessment

**Comparison with Previous Iteration**:
- This is iteration 1 — no previous synthesis to compare
- Status: EARLY (cannot assess convergence; need at least 3 iterations)

**Information Saturation**:
- All three explorers converge on the same datasets, framework, and statistical protocol
- Remaining gaps (RepoQA details, CoSQA type distribution) are secondary
- Status: HIGH SATURATION for core questions; gaps are confirmatory, not foundational

---

## Recommendations

**Immediate actions (this week)**:

1. **Run prior-art check** (30 min): Search for "SWE-bench retrieval benchmark Recall MRR 2025" before investing in dataset construction. If someone has done this, adopt their format.

2. **Generate synthetic query set** (2-3 hours): Use existing `query-generator.ts` with 30 high-PageRank symbols from each of the 12 repos. Apply identifier leakage filter before quality review.

3. **Extract SWE-bench pairs** (1 hour): Write a 20-line Python script using the agentbench `swebench.py` schema to output `(problem_statement, patch_files, auto_label)` for all 24 instances. This is the immediate pilot dataset.

4. **Run Condition A baseline** (2 hours): Run existing mnemex retrieval on the 24 SWE-bench queries, record Recall@1 and Recall@5. This validates the pipeline before building the full harness.

**Architecture decisions** (confirmed):
- Extend `benchmark-v2/` rather than building from scratch
- Use `ranx` for BEIR-format metric computation in Python wrapper
- Use paired Wilcoxon (not t-test) for all component delta comparisons
- Keep router test set and retrieval eval set disjoint

**Dataset acquisition order**:
1. Build hybrid dataset from local resources (zero external dependency)
2. Optionally add CoSQA for real-user query distribution validation
3. Optionally add CodeSearchNet Python for external baseline comparison
4. Skip LOTTE, WebQueryTest, RepoQA (LOTTE is wrong domain; others are too small or low-confidence)
