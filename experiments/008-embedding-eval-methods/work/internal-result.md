# Embedding Evaluation System — Architecture Proposal

**Author**: Universal Architecture Specialist (claude-sonnet-4-6)
**Date**: 2026-03-05
**Session**: dev-research-embed-eval-methods-20260305-085036-2fea1a92

---

## Executive Summary

The current embedding benchmark (`eval/embedding-benchmark.ts`) is a working prototype with
eight specific gaps: single codebase, LLM-contaminated queries, no hard negative difficulty
tiers, no statistical significance, no hybrid search, no latency profiling, no quantization
testing, and no MRL dimension sweeps. This proposal designs a complete replacement — a
standalone `mnemex embed-eval` command — that addresses all eight gaps through a layered,
phased evaluation pipeline built on the existing `benchmark-v2` infrastructure.

**Central design decision**: embed-eval is NOT a replacement for `mnemex benchmark`. It is
a separate, purpose-built tool for comparing embedding models only, using code chunks directly
(not summaries), across multiple repos, with controlled query types and hard negatives.

---

## 1. Problem Statement: What the Current System Gets Wrong

The current `eval/embedding-benchmark.ts` evaluates embedding models by:
1. Loading LLM-generated summaries (not raw code) from a fixed benchmark run
2. Re-embedding those summaries with each candidate embedding model
3. Measuring whether the re-embedded query finds the right summary

This conflates two separate questions:
- **Question A**: Which embedding model best represents code/summaries for retrieval?
- **Question B**: Which LLM writes summaries that are easiest to retrieve?

An embedding benchmark must answer Question A, not Question B. Evaluating model X by
embedding summaries written by model Y means the result measures X*Y interactions, not X alone.

**The fix**: embed-eval indexes raw code chunks directly, bypassing summaries entirely.
Each chunk is embedded by the candidate model; queries test retrieval of those chunks.

Additional gaps (from vote-prompt.md):

```
Gap                          Current State          Required State
----------------------------------------------------------------------
Query diversity              LLM-generated only     8-type taxonomy + human templates
Hard negatives               Random same-language   4-tier: file/sig/semantic/random
Cross-codebase               1 repo (mnemex)     5 repos, 3+ languages
Statistical rigor            None                   Bootstrap CIs, paired Wilcoxon
Hybrid search                Not tested             Vector-only vs BM25+vector
Latency/throughput           Embed time only        p50/p95 batch, chunks/sec, cost
Quantization                 Not tested             fp16/Q8/Q4 x MRL dims matrix
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      mnemex embed-eval                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PHASE 1: Dataset Construction                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  RepoSampler          QueryBuilder         HardNegativeMiner  │  │
│  │  - 5 repos            - 8 query types      - 4 distractor     │  │
│  │  - AST chunking       - template + LLM     │  tiers           │  │
│  │  - N=50 per repo      - decontam filter    └──────────────    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  PHASE 2: Model Embedding                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  ModelRunner (parallel per model)                             │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                  │  │
│  │  │  EmbedCorpus     │  │  LatencyProfiler │                  │  │
│  │  │  - chunks        │  │  - p50/p95 batch │                  │  │
│  │  │  - MRL truncation│  │  - chunks/sec    │                  │  │
│  │  │  - quant matrix  │  │  - cost/1M tokens│                  │  │
│  │  └──────────────────┘  └──────────────────┘                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  PHASE 3: Retrieval Evaluation                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  VectorOnlyEval       HybridEval (BM25 + vector)              │  │
│  │  - MRR, NDCG@10       - RRF fusion                           │  │
│  │  - P@1, P@5           - compare vs vector-only               │  │
│  │  - by query type      - BM25 weight sweep (0.1..0.5)         │  │
│  │  - by hard-neg tier   - per-repo breakdown                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  PHASE 4: Statistical Analysis                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Bootstrap CI (n=10000)    Paired Wilcoxon test               │  │
│  │  - 95% CI on MRR           - p-value per model pair           │  │
│  │  - per-repo variance        - Holm-Bonferroni correction       │  │
│  │  - query-type breakdown     - effect size (Cohen's d)         │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  PHASE 5: Report Generation                                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Scorecard             Heatmap               Recommendation   │  │
│  │  - per model           - model x repo        - top pick       │  │
│  │  - per tier            - model x query type  - trade-off grid │  │
│  │  - quant degradation   - dim vs MRR          - CLI output     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  STORAGE: eval-embed.db (SQLite, separate from benchmark.db)        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Metrics Design

### Primary Metric: MRR (Mean Reciprocal Rank)

MRR is the right primary metric for mnemex's use case:
- Developers look at 1-3 results then reformulate; MRR captures this behavior
- Binary relevance (each query has exactly one correct chunk) makes MRR clean and
  unambiguous — no graded relevance to define or debate
- Easy to interpret: MRR 0.75 means the correct chunk is typically in position 1-2

### Secondary Metrics

```
Metric          K Values    Purpose
-----------------------------------------------------------------------
NDCG@K          10          Academic comparability with CoIR/CodeSearchNet
                            Weighted by rank position; more discriminating than P@K
Precision@K     1, 5, 10    Practical: "did user find it on first page?"
Recall@K        10, 20      For multi-result use cases (context window filling)
Win Rate        —           Cross-model: which model places #1 most often
```

### Why NOT MAP

MAP (Mean Average Precision) assumes multiple relevant documents per query. In mnemex's
corpus, each query has exactly one ground-truth chunk. MAP degenerates to MRR when there is
one relevant document. Do not use MAP here.

### Per-Tier Metrics

All retrieval metrics are computed separately for each hard-negative distractor tier:
- `mrr_easy` (random cross-file distractors)
- `mrr_medium` (same-language similar signatures)
- `mrr_hard` (same-file functions)
- `mrr_semantic` (embedding-mined near-misses, sim 0.75-0.95)

The ratio `mrr_hard / mrr_easy` reveals whether a model degrades on difficult tasks —
models that maintain this ratio near 1.0 are robust; models that drop significantly
expose over-reliance on lexical surface similarity.

### Per-Query-Type Metrics

All metrics are tracked per query type (see Section 4). A model that wins on "doc API lookup"
queries but loses on "vague" queries reveals a different capability profile than a model that
wins uniformly. Report these breakdowns; do not average them away.

---

## 4. Query Design

### Query Source: Hybrid (Templates + LLM, Contamination-Controlled)

Pure LLM generation is contaminated: the LLM sees function names and generates queries
containing those names, inflating BM25 and vector scores alike. Pure templates are too
rigid. The correct approach is a two-source mix with a contamination filter.

### The 8-Type Query Taxonomy (inherited from benchmark-v2 query-generator)

```
Type               Description                        Contamination Risk
----------------------------------------------------------------------
vague              "something with users"             LOW  (imprecise)
wrong_terminology  "authenticate" for "login"         LOW  (wrong vocab)
specific_behavior  "check if token is expired"        MEDIUM
integration_query  "use with Express middleware"      MEDIUM
problem_based      "prevent double-submission"        LOW
doc_conceptual     "How does pagination work?"        LOW
doc_api_lookup     "SearchOptions parameters"         HIGH (exact names)
doc_best_practice  "when to use batchEmbed"           MEDIUM
```

**Decontamination rule**: Any generated query that contains a verbatim identifier from the
target function's signature is flagged as contaminated and regenerated. This is implemented
as a simple token overlap check: if any token in the query exactly matches a token in the
function signature, regenerate (up to 3 retries).

### Template-Based Queries (N=3 per code unit, mandatory)

Templates guarantee coverage of high-risk contaminated query types without using an LLM:

```typescript
const TEMPLATES = [
  // Vague - always safe
  (unit) => `code that deals with ${unit.language} ${unit.type}`,

  // Problem-based - uses semantic description, not identifier
  (unit) => `how to handle errors in ${inferDomain(unit.content)}`,

  // Integration - forces cross-reference framing
  (unit) => `example of using ${inferDomain(unit.content)} with other components`,
];
```

`inferDomain()` extracts high-level domain words (auth, payment, database, http) from
comment text and import statements — avoiding function name leakage.

### LLM-Generated Queries (N=5 per code unit, with decontam filter)

Generated from raw code (NOT summaries) at temperature 0.8. The system prompt is:

```
Generate 5 natural language search queries a developer might use to find this code.
DO NOT use exact function names or variable names from the code.
Mix: 1 vague, 1 wrong-terminology, 1 problem-based, 1 conceptual, 1 behavioral.
Each query should be 5-15 words. Use natural developer language, not formal descriptions.
```

### Final Query Set Per Code Unit

```
Source          Count   Query Types
------------------------------------------
Templates       3       vague, problem-based, integration
LLM (filtered)  5       wrong_terminology, specific_behavior,
                        doc_conceptual, doc_api_lookup, doc_best_practice
Total           8       All 8 types covered
```

With 50 code units per repo and 5 repos: **2000 total queries**.

---

## 5. Hard Negative Construction

### 4-Tier Distractor System

Each query's evaluation includes exactly 9 distractors (the pool size the existing contrastive
evaluator uses). These 9 are drawn from 4 tiers with fixed proportions:

```
Tier   Count   Selection Strategy
-----------------------------------------------------------------------
T0       3     SAME FILE — other functions in the exact same file
               These are the hardest: shared context, similar scope names
T1       2     SIMILAR SIGNATURE — matching param count + overlapping param names
               Tests whether model distinguishes semantically similar APIs
T2       2     SEMANTIC NEAR-MISS — embedding similarity 0.75-0.95 (pre-computed)
               Tests resilience against embedding-space neighbors
T3       2     RANDOM SAME-LANGUAGE — from a different file, same language
               Baseline difficulty; should be easy to distinguish
```

Tier T2 requires pre-computing embeddings with a reference model (the current default,
`qwen/qwen3-embedding-8b`). This is the bootstrapping step: the reference model's embedding
space defines the semantic near-miss pool. All candidate models are then evaluated against
this shared pool, which is fair because the pool is fixed across models.

**Important**: the `selectDistractors` function in `contrastive/index.ts` already implements
tiers T0, T1, and T2 (lines 98-138). This proposal reuses that logic and adds T3 padding.
The existing filter `similarity < 0.95` correctly excludes near-duplicates. The filter
`similarity > 0.70` should be explicit (currently implied by sort-and-take).

### Why 0.75-0.95 for T2 (not 0.5-0.95)?

The contrastive-evaluation-analysis.md document identifies the critical finding: the
0.5-0.75 similarity range is easy for all models (they can all distinguish these). The
discriminating range is 0.75-0.95. Distractors with similarity below 0.75 inflate scores
without revealing real model differences. Filter hard: only include T2 distractors with
similarity in [0.75, 0.95].

### Tier-Weighted Score

For reporting, compute a tier-weighted MRR that weights harder tiers more heavily:

```
TW-MRR = 0.50 * mrr_T0 + 0.25 * mrr_T1 + 0.15 * mrr_T2 + 0.10 * mrr_T3
```

This is a mnemex-specific metric (not academic standard) that rewards models which
maintain quality on same-file discrimination.

---

## 6. Cross-Codebase Testing

### Repo Selection Criteria

Minimum 5 repos (the research findings show 3+ is required for generalization; 5 gives
statistical reliability). Selection criteria:

```
Repo           Language    Size        Characteristics
----------------------------------------------------------------------
mnemex      TypeScript  Medium      Home repo; known quantities
fastify        TypeScript  Large       HTTP server; async patterns
cpython (lib)  Python      Large       stdlib subset; docstring-rich
ruff           Rust        Medium      CLI tool; different naming conventions
chi            Go          Small       HTTP router; idiomatic Go
```

These cover 3 languages (TypeScript/JavaScript, Python, Rust, Go), sizes from small to
large, and domain types (tooling, server, stdlib, CLI, HTTP). The "developer tools trinity"
(TypeScript, Python, Go) from Explorer 2's Finding 8 is covered.

All 5 repos are pre-indexed for the agentbench eval (12 available); no new indexing needed.
The agentbench data directory at `../agentbench/data/eval-repos/` contains AST-chunked
indexes for all repos.

### Sampling Strategy

Per repo: 50 code units sampled with stratification:
- 40% functions (most common search target)
- 30% methods (inside classes)
- 20% classes (structural understanding)
- 10% modules/files (higher-level queries)

Stratification ensures the benchmark tests the full range of code granularities, not just
small utility functions that all models handle easily.

### Aggregation Across Repos

**Do not average across repos in the primary report**. Instead:

1. Report a per-repo scorecard for each model
2. Compute cross-repo variance (standard deviation of MRR across repos)
   - Low variance = model generalizes well
   - High variance = model has repo-specific strengths
3. Report language-stratified averages (TypeScript repos, Python repos, etc.)
4. Compute a weighted aggregate where weight = repo size (larger = more representative)

```
               mnemex  fastify  cpython  ruff   chi    Avg   StdDev
voyage-code-3    0.82      0.79     0.81    0.77   0.80   0.80   0.018
qwen3-emb-8b     0.78      0.74     0.80    0.71   0.73   0.75   0.034
nomic-embed-code 0.81      0.77     0.79    0.76   0.78   0.78   0.018
```

A model with lower average but lower variance (e.g., nomic-embed-code in the example) may
be the better production choice if consistency across languages matters more than peak score.

---

## 7. Hybrid Search Testing

### Why Hybrid Search Matters

BM25 excels on exact identifier matches ("useAuthStore", "PageRank", class/function names).
Embedding excels on semantic similarity for natural language queries. In production,
mnemex uses hybrid search by default. Evaluating embedding-only underestimates the
combined system's quality, and a "worse" embedding model can win in hybrid mode if it
provides complementary signal to BM25.

### Design: RRF (Reciprocal Rank Fusion)

Hybrid scoring uses RRF (Reciprocal Rank Fusion), which is parameter-free and robust:

```
RRF_score(d) = sum_over_rankers(1 / (k + rank(d)))  where k = 60
```

For each query, compute:
1. BM25 rank for each chunk (using existing BM25 implementation in `core/search/`)
2. Vector rank for each chunk (cosine similarity)
3. RRF combined rank

Evaluate MRR/NDCG@10 for:
- Vector-only
- BM25-only
- RRF(BM25 + vector)

Also sweep the BM25 weight in a weighted linear combination (not just RRF) to find the
optimal mix per model:

```
hybrid_score(d) = (1 - alpha) * vector_score(d) + alpha * bm25_score(d)
alpha in [0.1, 0.2, 0.3, 0.4, 0.5]
```

Report the `alpha*` that maximizes MRR for each model. If a model's optimal alpha is
significantly different from others, it reveals that model's relative semantic vs. lexical
strengths.

### Expected Output

```
Model            Vector-MRR   BM25-MRR   Hybrid-MRR   Optimal-alpha
voyage-code-3      0.80        0.68        0.86          0.25
qwen3-emb-8b       0.75        0.68        0.83          0.30
nomic-embed-code   0.78        0.68        0.85          0.20
all-minilm-l6-v2   0.62        0.68        0.74          0.45
```

Note: BM25-MRR is identical across models because BM25 is not embedding-dependent. The
hybrid benefit is model-specific. A model like all-minilm-l6-v2 that loses badly on
vector-only may need BM25 support (higher alpha) to be competitive — this is important
information for mnemex's configuration defaults.

---

## 8. Practical Metrics: Latency, Throughput, and Cost

### What to Measure

```
Metric                   How to Measure              Why It Matters
----------------------------------------------------------------------
p50 batch latency        Median of 50 batch calls    Interactive indexing feel
p95 batch latency        95th percentile             Tail latency (large files)
chunks/sec (sustained)   500-chunk index / wall-time Re-indexing speed
tokens/sec               Measured from API responses  Provider infrastructure
cost per 1M tokens       price * (tokens / 1M)       Budget for large repos
cost per 500-file repo   cost per 1M * avg tokens    Real user cost
```

### Profiling Protocol

For each model, run a standardized profiling workload:
1. Warm-up: 5 batches of 20 chunks (discarded)
2. Measurement: 50 batches of 20 chunks (1000 chunks total)
3. Record: batch start/end timestamps, reported token counts, cost field from API

For local models (Ollama, LM Studio):
- Same protocol but measure at both GPU and CPU inference
- Record VRAM usage (from `nvidia-smi` or Metal stats on Apple Silicon)
- Note: local models have $0 cost but non-zero compute cost (electricity, time)

### Pareto Frontier Visualization

The output includes a Pareto analysis of quality vs. cost:

```
Quality (MRR)
   0.85 |   *voyage-code-3 ($0.18/M)
        |
   0.80 |            *nomic-embed-code (free, local)
        |
   0.75 |      *qwen3-emb-8b ($0.01/M)
        |
   0.70 |
        |                        *all-minilm-l6-v2 (free)
   0.65 |
        +--------+-------+-------+-------+------> Cost ($/M tokens)
         free    0.01   0.05    0.10    0.20
```

Models on the Pareto frontier (upper-left) are the only rational choices. Models below/right
of the frontier are dominated — there exists a cheaper-or-better alternative.

### Latency Weight in Overall Score

Quality and latency should NOT be combined into a single weighted score in the primary
ranking. Latency is a hard constraint for some users (interactive indexing) and irrelevant
for others (nightly batch indexing). Instead:

- Primary ranking: by MRR (quality-only)
- Separate recommendation grid: "Best for quality", "Best for cost", "Best for speed", "Best local"

---

## 9. Quantization and MRL Testing

### The Quantization x Dimension Matrix

For each model that supports both quantization variants and MRL, evaluate:

```
                   Full dims   Half dims   Quarter dims
fp16 (baseline)       Q        Q_halfD      Q_quartD
Q8_0 (~0% loss)    Q_q8      Q_q8_half    Q_q8_quart
Q4_K_M (~2% loss)  Q_q4      Q_q4_half    Q_q4_quart
```

Expected from research:
- Q8_0: < 0.5% MRR loss (can always use this for free speedup)
- Q4_K_M: ~1.5-2% MRR loss (acceptable for most use cases)
- Half dims (MRL truncation): ~2-3% MRR loss
- Combined Q4+half dims: ~3.5-4% MRR loss, ~93% storage reduction

For models without MRL (e.g., voyage-code-3, nomic-embed-code 7B), only quantization
rows are evaluated.

### Implementation Note

MRL truncation is implemented at embedding time by taking only the first N dimensions
of the returned vector. This is already supported by LanceDB (arbitrary vector dimensions).
Add an `embeddingDimensions` config option to `EmbeddingsClientOptions`:

```typescript
interface EmbeddingsClientOptions {
  // ... existing fields ...
  embeddingDimensions?: number;  // MRL truncation: take first N dims
}
```

In `embed()`, after receiving the full embedding vector:
```typescript
if (this.embeddingDimensions && embedding.length > this.embeddingDimensions) {
  return embedding.slice(0, this.embeddingDimensions);
}
```

### Degradation Report Format

```
Model: qwen3-embedding-0.6b (native 1024-dim)
                fp16    Q8_0    Q4_K_M   Delta-Q4
 1024-dim       0.754   0.752   0.740    baseline
  512-dim       0.738   0.736   0.725    -1.6%
  256-dim       0.721   0.719   0.709    -3.3%
  128-dim       0.693   0.691   0.682    -7.2%

Storage at 5K chunks:
 1024-dim fp16:    20MB
  512-dim Q4:       5MB  (75% reduction, -1.6% quality)
  256-dim Q4:     2.5MB  (87.5% reduction, -3.3% quality)
```

The "sweet spot" recommendation is the knee of the quality-vs-storage curve, typically
512-dim Q4_K_M for most models.

---

## 10. Statistical Rigor

### Minimum Sample Size

At N=50 code units x 8 queries = 400 retrieval judgments per repo, 5 repos = 2000 total.
This exceeds the N=30-50 minimum (Explorer 2, Finding 7) and provides:
- Bootstrap CI width < 0.03 MRR points (tight enough to distinguish 0.02+ differences)
- Paired Wilcoxon test: 80% power to detect 0.03 MRR difference at alpha=0.05
- After Holm-Bonferroni correction for 10 model pairs: still detects 0.04+ differences

### Bootstrap Confidence Intervals

For each model's MRR, compute 95% CI via bootstrap resampling (n=10,000 samples):

```typescript
function bootstrapCI(scores: number[], nSamples = 10000): { lo: number; hi: number } {
  const means: number[] = [];
  for (let i = 0; i < nSamples; i++) {
    const resample = Array.from({ length: scores.length },
      () => scores[Math.floor(Math.random() * scores.length)]);
    means.push(resample.reduce((a, b) => a + b, 0) / resample.length);
  }
  means.sort((a, b) => a - b);
  return {
    lo: means[Math.floor(0.025 * nSamples)],
    hi: means[Math.floor(0.975 * nSamples)],
  };
}
```

When CIs overlap between two models, explicitly state "not statistically distinguishable at
95% confidence" rather than claiming a winner.

### Paired Significance Tests

For each pair of models (A vs B), compute a paired Wilcoxon signed-rank test on the
per-query MRR scores. This is more appropriate than paired t-test because MRR values
(1, 1/2, 1/3, ...) are not normally distributed.

The existing `src/benchmark-v2/scorers/statistics.ts` implements `pairedTTest` — extend
this with a Wilcoxon test or use the t-test as an approximation given the large N.

Apply Holm-Bonferroni correction for multiple comparisons (10 model pairs = 10 tests).
Report the corrected p-value for each pair.

### What Gets Reported

```
Model A          Model B          MRR-A   MRR-B   Delta   p-value   Sig?
voyage-code-3    qwen3-emb-8b     0.802   0.754   +0.048  0.0003    YES
voyage-code-3    nomic-embed-code 0.802   0.783   +0.019  0.142     NO (insuff.)
nomic-embed-code qwen3-emb-8b     0.783   0.754   +0.029  0.021     YES
```

Crucially: a model comparison with p > 0.05 is reported as "not significantly different"
with the implication that the cheaper/faster/local model is preferred for practical deployment.

---

## 11. CLI Design

### Core Command

```bash
mnemex embed-eval [options] [repos...]
```

### Minimal Invocation (Quick Check)

```bash
# Quick 10-minute comparison of 3 models on 1 repo, N=20 code units
mnemex embed-eval --quick voyage-code-3 qwen3-embedding-0.6b nomic-embed-code
```

### Full Evaluation

```bash
# Full cross-repo eval: 5 repos, N=50, all metrics, save to DB
mnemex embed-eval \
  --models voyage-code-3,qwen/qwen3-embedding-8b,ollama/nomic-embed-code \
  --repos mnemex,fastify,cpython,ruff,chi \
  --n-per-repo 50 \
  --queries 8 \
  --distractors 9 \
  --hybrid \
  --latency \
  --output eval-embed-2026-03.db
```

### Quantization Sweep

```bash
# Test MRL dimensions + quantization for a single model
mnemex embed-eval \
  --model qwen/qwen3-embedding-0.6b \
  --quant-sweep \
  --mrl-dims 1024,512,256,128 \
  --repos mnemex
```

### Compare Against Previous Run

```bash
# Load previous results and compare new model
mnemex embed-eval \
  --baseline eval-embed-2026-01.db \
  --models mistralai/codestral-embed \
  --significance 0.05
```

### Flag Reference

```
Core flags:
  --models/-m     Comma-separated model IDs (openrouter, voyage-*, ollama/*)
  --repos/-r      Comma-separated repo paths or slugs from agentbench
  --n-per-repo    Code units to sample per repo (default 50, quick default 20)
  --queries/-q    Queries per code unit (default 8, quick default 4)
  --distractors   Distractor count (default 9, min 4)

Evaluation mode flags:
  --quick         Fast mode: N=20, 4 queries, 1 repo, no latency, no hybrid
  --hybrid        Also evaluate BM25+vector hybrid search
  --latency       Profile latency and throughput (adds ~5 min)
  --quant-sweep   Test fp16/Q8/Q4 x MRL dimensions matrix

Statistical flags:
  --ci            Compute bootstrap confidence intervals (adds ~2 min)
  --significance  Significance threshold for pairwise tests (default 0.05)

Output flags:
  --output/-o     SQLite DB path for results (default: eval-embed-TIMESTAMP.db)
  --format        Output format: table (default), json, csv
  --baseline      Previous DB to compare against
```

### Output Format (Default Table)

```
mnemex embed-eval results — 2026-03-05 14:32 — 5 repos, 250 code units, 2000 queries
================================================================================

OVERALL RANKING (by weighted MRR across all repos)
-----------------------------------------------------------------------
#  Model                    MRR          P@1    P@5    NDCG@10  Hybrid-Boost
1  voyage-code-3            0.802        0.689  0.921   0.847    +0.058 (RRF)
2  nomic-embed-code         0.783 (n.s.) 0.671  0.912   0.831    +0.071 (RRF)
3  qwen3-embedding-8b       0.754**      0.641  0.896   0.812    +0.082 (RRF)
4  qwen3-embedding-0.6b     0.731**      0.618  0.881   0.793    +0.089 (RRF)
5  all-minilm-l6-v2         0.623**      0.510  0.789   0.702    +0.119 (RRF)

** p < 0.05 vs #1 (Holm-Bonferroni corrected)
(n.s.) not significantly different from #1

CROSS-REPO BREAKDOWN (MRR per repo)
-----------------------------------------------------------------------
Model                  mnemex  fastify  cpython  ruff   chi   StdDev
voyage-code-3            0.821     0.791    0.813   0.778  0.808  0.016
nomic-embed-code         0.808     0.778    0.796   0.765  0.769  0.017
qwen3-embedding-8b       0.771     0.743    0.781   0.734  0.741  0.019

HARD NEGATIVE DIFFICULTY BREAKDOWN (voyage-code-3)
-----------------------------------------------------------------------
Tier       Distractors        MRR     vs Easy
easy       random same-lang   0.921   baseline
medium     similar signature  0.876   -4.9%
hard       same-file          0.773   -15.9%  <- main discriminator
semantic   embedding near-miss 0.812  -11.8%

QUERY TYPE BREAKDOWN (voyage-code-3)
-----------------------------------------------------------------------
vague                   0.742
wrong_terminology       0.718
specific_behavior       0.851
integration_query       0.803
problem_based           0.779
doc_conceptual          0.834
doc_api_lookup          0.881
doc_best_practice       0.821

PRACTICAL METRICS
-----------------------------------------------------------------------
Model                  Cost/1M   Chunks/sec  p50-batch  p95-batch  Local?
voyage-code-3           $0.18      1420        0.89s      1.24s      NO
qwen3-embedding-8b      $0.01       210        4.10s      5.80s      NO
nomic-embed-code (7B)   free        380        2.40s      3.20s      YES (GGUF)
qwen3-embedding-0.6b    free       3200        0.31s      0.42s      YES (Ollama)

RECOMMENDATION
-----------------------------------------------------------------------
  Best quality:    voyage-code-3     (MRR 0.802, $0.18/M tokens)
  Best value:      nomic-embed-code  (MRR 0.783, free local, n.s. vs #1)
  Best speed:      qwen3-emb-0.6b    (3200 chunks/sec, MRR 0.731)
  Best budget API: qwen3-emb-8b      (MRR 0.754, $0.01/M)
```

---

## 12. Implementation Phases

### Phase 1: Dataset Builder (1-2 days)

**Files**: `src/embed-eval/dataset/repo-sampler.ts`, `query-builder.ts`, `hard-negative-miner.ts`

- `RepoSampler`: wraps existing `benchmark-v2/codebase-detector.ts`; adds multi-repo support
  and stratified sampling (40/30/20/10 type distribution)
- `QueryBuilder`: reuses `benchmark-v2/extractors/query-generator.ts`; adds template queries
  and contamination filter
- `HardNegativeMiner`: extends `selectDistractors()` in `contrastive/index.ts`;
  adds explicit T3 random tier; enforces 0.75 lower bound on T2 semantic similarity
- `EvalDatabase`: new SQLite schema (`eval-embed.db`), separate from `benchmark.db`

**Schema** (eval-embed.db):
```sql
CREATE TABLE eval_runs (
  id TEXT PRIMARY KEY, created_at TEXT, config_json TEXT
);
CREATE TABLE code_units (
  id TEXT, run_id TEXT, repo TEXT, path TEXT, language TEXT,
  type TEXT, content TEXT, chunk_size_tokens INTEGER
);
CREATE TABLE queries (
  id TEXT, run_id TEXT, code_unit_id TEXT, type TEXT, query TEXT,
  is_template INTEGER, contamination_check TEXT
);
CREATE TABLE distractor_sets (
  id TEXT, run_id TEXT, code_unit_id TEXT,
  t0_ids TEXT, t1_ids TEXT, t2_ids TEXT, t3_ids TEXT
);
CREATE TABLE model_embeddings (
  id TEXT, run_id TEXT, model_id TEXT, code_unit_id TEXT,
  embedding BLOB, dim INTEGER, quant TEXT, mrl_dims INTEGER
);
CREATE TABLE eval_results (
  id TEXT, run_id TEXT, model_id TEXT, query_id TEXT,
  retrieval_rank INTEGER, mrr REAL, hit_at_1 INTEGER,
  hit_at_5 INTEGER, ndcg_10 REAL, tier TEXT,
  hybrid_rank INTEGER, hybrid_mrr REAL
);
CREATE TABLE latency_profiles (
  id TEXT, run_id TEXT, model_id TEXT,
  p50_ms REAL, p95_ms REAL, chunks_per_sec REAL,
  cost_per_1m REAL, is_local INTEGER
);
```

### Phase 2: Model Runner (1 day)

**Files**: `src/embed-eval/runner/model-runner.ts`, `latency-profiler.ts`, `mrl-sweep.ts`

- `ModelRunner`: wraps existing `createEmbeddingsClient()` from `src/core/embeddings.ts`;
  adds MRL truncation support and quantization variant dispatch
- `LatencyProfiler`: 50-batch warm-up + measurement protocol; records p50/p95/throughput
- `MRLSweep`: iterates over dimension list per model; stores separate embedding rows per dim

**Important**: Add `embeddingDimensions` option to `EmbeddingsClientOptions` in
`src/core/embeddings.ts` (see Section 9). This is the only required change to existing code.

### Phase 3: Retrieval Evaluator (1 day)

**Files**: `src/embed-eval/evaluators/vector-eval.ts`, `hybrid-eval.ts`

- `VectorEval`: reuses core logic from `RetrievalEvaluator` in `benchmark-v2/evaluators/retrieval/index.ts`
  with tier-aware distractor filtering; computes NDCG@10 in addition to MRR/P@K
- `HybridEval`: adds BM25 scoring using the existing search infrastructure in `src/core/search/`;
  implements RRF fusion; sweeps alpha values

**BM25 integration**: mnemex's search already implements BM25 in `src/core/search/`. The
hybrid evaluator wraps both the vector index and the BM25 scorer, computing RRF ranks for
the same queries used in the vector eval.

### Phase 4: Statistics Module (0.5 days)

**Files**: `src/embed-eval/stats/bootstrap.ts`, `significance.ts`

- `bootstrapCI()`: functional, pure — no dependencies
- `wilcoxonTest()` or extend `pairedTTest()` in `src/benchmark-v2/scorers/statistics.ts`
- `holmBonferroni()`: multiple comparison correction

### Phase 5: CLI Integration (0.5 days)

**Files**: `src/embed-eval/cli.ts`; modify `src/cli.ts`

- Add `embed-eval` case to CLI switch statement in `src/cli.ts`
- Implement `--quick` vs full mode dispatch
- Implement table formatter for the output format shown in Section 11

### Phase 6: Agentbench Integration (optional, 1 day)

**Files**: `scripts/embed-eval-agentbench.sh`

- Shell script that runs embed-eval across all 12 agentbench repos
- Outputs per-language summary table
- Uses the existing restored indexes (no re-indexing needed)

---

## 13. Key Design Decisions and Trade-offs

### Decision 1: Evaluate Raw Chunks, Not Summaries

**Decision**: Embed-eval indexes raw code chunks directly, not LLM-generated summaries.

**Trade-off**: This means embed-eval results are NOT directly comparable to the existing
`benchmark` command results (which embed summaries). However, this is correct:
- Embedding benchmark should test the embedding model's ability to represent code
- Summary benchmark should test the LLM's ability to write searchable summaries
- Conflating them (current state) means you cannot isolate which component improved

**Consequence**: embed-eval and benchmark answer different questions and should be run
separately. The recommendation layer in Section 11 combines both signals: "this model is
the best embedding for raw code AND the X model produces summaries that embed well."

### Decision 2: Shared Hard Negative Pool (Reference Model Pre-Compute)

**Decision**: T2 semantic distractors are mined using the existing default model
(`qwen/qwen3-embedding-8b`) as the reference, not each candidate model's own embedding space.

**Trade-off**: This means T2 distractors are defined by one model's similarity metric.
A radically different model might not agree that these are "similar" — but that's the point.
We want a stable, shared definition of semantic similarity for the distractor pool so all
models are evaluated on the same task. If we used each model's own T2 distractors, we would
be grading models on different tests.

**Alternative rejected**: Define T2 as BM25-near-misses (same-function-name-prefix + similar
signature). This is model-agnostic but too lexical; it doesn't capture actual semantic
confusion. Embedding-based T2 with a reference model is the right approach.

### Decision 3: RRF Over Weighted Linear Combination as the Primary Hybrid Method

**Decision**: Report RRF hybrid as the primary hybrid metric, sweep linear combinations
as secondary.

**Rationale**: RRF is parameter-free (no alpha to tune per model), which makes it the
correct baseline for fair model comparison. Linear combination with swept alpha is useful for
understanding each model's optimal BM25 complement, but comparing models at their own
optimal alpha inflates every model's hybrid score differently.

### Decision 4: Separate eval-embed.db, Do Not Modify benchmark.db

**Decision**: All embed-eval results go into a separate SQLite database (`eval-embed.db`
by default).

**Rationale**: The existing `benchmark.db` is tied to the summary generation pipeline and
the `benchmark-v2` schema. Modifying it would require schema migration logic and could break
existing benchmark workflows. A separate DB is clean and allows embed-eval to be run
independently without a prior benchmark run existing.

### Decision 5: Don't Aggregate Quality and Latency Into a Single Score

**Decision**: Report quality (MRR) and practical metrics (latency, cost) separately; provide
a recommendation grid instead of a weighted composite.

**Rationale**: The weighting of quality vs. speed is user-specific and context-dependent.
An interactive tool values p50 latency; a nightly CI job does not. A composite score would
encode an implicit weighting that is arbitrary and would mislead users. Instead, a
recommendation grid (Section 11) explicitly names the trade-off: "voyage-code-3 is best
quality at 9x the cost of qwen3-embedding-8b and the two are not statistically
distinguishable" is a more honest output than a single number.

---

## 14. What This Design Does NOT Solve

**Limitation 1: Human-written query validation**

The query decontamination filter removes obvious identifier-based contamination, but LLM
query generation at temperature 0.8 still produces queries that are "inspired by" the code's
comment text. The ideal evaluation would use actual developer search logs from production
systems. This design accepts that limitation and mitigates it through template diversity,
but it does not eliminate the fundamental gap between synthetic and real queries.

**Limitation 2: Domain shift for private codebases**

The 5 evaluation repos are all open-source. mnemex's production users may work on
proprietary codebases with highly domain-specific vocabulary (medical records, trading
systems, etc.). A model that wins on open-source code may not win on those domains. This
design cannot test for this; it can only reduce the risk by testing across diverse repos.

**Limitation 3: Online feedback signals**

The `src/learning/index.ts` feedback system ("no/wrong/actually" corrections, reask rate)
is the only source of real user signal about retrieval quality. This design does not connect
embed-eval results to those online signals. The correct long-term architecture is an online
A/B test that randomly routes users to different embedding models and compares correction
rates — but that requires tracking infrastructure not currently in place.

**Limitation 4: Model instruction prefix correctness**

As Explorer 2's Finding 10 notes, Qwen3-Embedding requires the instruction prefix
`"Instruct: Retrieve code...\nQuery: {query}"` for correct results. Without it, Qwen3
scores ~5-8 points lower. This design assumes each model is evaluated with its recommended
configuration (from model card), but the CLI cannot auto-detect and apply these prefixes.
A model configuration registry (model_id -> query_prefix, passage_prefix, pooling_method)
is needed and should be added to the EmbeddingsClient options.

---

## 15. Connection to Existing Code

Summary of changes to existing files:

```
File                                    Change
----------------------------------------------------------------------
src/core/embeddings.ts                  ADD: embeddingDimensions option
                                             (MRL truncation at embed time)
src/benchmark-v2/scorers/statistics.ts  EXTEND: add wilcoxon test alongside t-test
src/cli.ts                              ADD: 'embed-eval' command case
```

New files (all in `src/embed-eval/`):

```
src/embed-eval/
├── cli.ts                    Main command entry point
├── types.ts                  EvalRun, CodeUnit, Query, ModelResult types
├── database.ts               EvalDatabase (eval-embed.db)
├── dataset/
│   ├── repo-sampler.ts       Multi-repo stratified sampling
│   ├── query-builder.ts      8-type query generation + decontam filter
│   └── hard-negative-miner.ts  4-tier distractor selection
├── runner/
│   ├── model-runner.ts       Embedding dispatch + MRL truncation
│   ├── latency-profiler.ts   p50/p95/throughput measurement
│   └── mrl-sweep.ts          Quantization x dimension matrix
├── evaluators/
│   ├── vector-eval.ts        MRR/NDCG@10/P@K, tier-aware
│   └── hybrid-eval.ts        BM25+vector, RRF, alpha sweep
├── stats/
│   ├── bootstrap.ts          CI computation
│   └── significance.ts       Wilcoxon + Holm-Bonferroni
└── report/
    ├── table-formatter.ts    Terminal table output
    └── scorecard.ts          Per-model scorecard builder
```

Total estimated implementation: 5-6 days of focused development.

---

```vote
VERDICT: APPROVE
CONFIDENCE: 8
SUMMARY: A purpose-built embed-eval pipeline that separates embedding evaluation from summary evaluation, uses 4-tier hard negatives on 5 repos with 8 query types, adds hybrid BM25+vector testing, bootstrap CIs, MRL/quantization sweeps, and a practical Pareto recommendation grid — all built as thin layers over existing benchmark-v2 and embeddings infrastructure.
KEY_ISSUES: (1) T2 semantic distractors depend on reference model quality — if qwen3-embedding-8b has its own biases, those propagate to all models' distractor pools; (2) human query validation gap remains; (3) instruction-prefix configuration (Qwen3, Jina) must be manually correct to avoid systematic underestimation; (4) 5-6 day estimate assumes existing BM25 search infrastructure can be invoked without a full index build, which needs verification.
```
