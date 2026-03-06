# Embedding Evaluation System — Synthesized Specification

**Date**: 2026-03-05
**Session**: dev-research-embed-eval-methods-20260305-085036-2fea1a92
**Models Consulted**: Claude (Internal), Gemini 3.1 Pro, GPT-5.3 Codex, Kimi K2.5, Minimax M2.5, GLM-5
**Consensus**: All 6 models APPROVED the overall direction

---

## 1. Executive Summary

`claudemem embed-eval` is a purpose-built command that answers one question: **which embedding model best retrieves raw code chunks for claudemem's hybrid search pipeline?**

The existing `eval/embedding-benchmark.ts` conflates two separate signals — embedding model quality and LLM summary quality — by re-embedding LLM-generated summaries. This makes it impossible to know whether a score improvement comes from the embedding model or from better summaries. `embed-eval` eliminates this by indexing raw code chunks directly, evaluating each candidate embedding model independently, across multiple codebases, with controlled query types and tiered hard negatives.

**Why this system exists:**
- The current benchmark evaluates `embedding_model * summary_quality` not `embedding_model` alone
- Single-codebase evaluation produces results that do not generalize
- No statistical significance testing means small differences are treated as meaningful
- No hybrid search testing means results do not reflect production behavior
- No latency or cost data means model selection ignores operational constraints

**What this system produces:**
- Per-model MRR and NDCG@10 with bootstrap 95% confidence intervals
- Statistical significance tests (Wilcoxon + Holm-Bonferroni) for every pairwise comparison
- Per-repo, per-query-type, and per-hard-negative-tier breakdowns
- Hybrid search results (vector-only vs BM25-only vs RRF) for each model
- Latency, throughput, and cost profiles for each model
- MRL dimension x quantization degradation matrix
- A Pareto frontier (quality vs cost) and a recommendation grid

All results persist to a separate `eval-embed.db` SQLite database. The command runs standalone without requiring a prior `benchmark` run.

---

## 2. Architecture

```
claudemem embed-eval [--quick] [--hybrid] [--latency] [--quant-sweep] ...
       |
       v
┌────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: Dataset Construction                                          │
│                                                                        │
│  RepoSampler              QueryBuilder           HardNegativeMiner     │
│  - 5+ repos               - 8 query types        - 4 tiers             │
│  - AST chunking           - template + LLM        (T0 same-file        │
│  - N=50 per repo          - decontam filter        T1 similar-sig      │
│  - stratified sampling    - frozen dev/test split  T2 semantic near    │
│  - 40% fn / 30% method /                          T3 random)           │
│    20% class / 10% module                                              │
│                    |                                                   │
│                    v                                                   │
│            eval-embed.db (queries, distractors, code_units)            │
└────────────────────────────────────────────────────────────────────────┘
       |
       v
┌────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: Model Embedding                                               │
│                                                                        │
│  ModelRunner (parallel per model)                                      │
│  - EmbedCorpus: raw chunks, MRL truncation, quant variants             │
│  - LatencyProfiler: 5-batch warmup + 50-batch measurement              │
│    records p50/p95/chunks-per-sec/cost-per-1M                          │
│  - MRLSweep (optional): embed at 128, 256, 512, 1024, native dims      │
│                    |                                                   │
│                    v                                                   │
│            eval-embed.db (model_embeddings, latency_profiles)          │
└────────────────────────────────────────────────────────────────────────┘
       |
       v
┌────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: Retrieval Evaluation                                          │
│                                                                        │
│  VectorEval                    HybridEval (optional, --hybrid)         │
│  - MRR, NDCG@10, P@1/5        - BM25 ranks (from core/search/)        │
│  - per query type              - RRF fusion (primary hybrid metric)    │
│  - per hard-neg tier           - linear alpha sweep on dev split       │
│  - tier-weighted MRR           - lock best alpha for test split        │
│  - macro + micro averages      - report: vector / bm25 / hybrid MRRs  │
└────────────────────────────────────────────────────────────────────────┘
       |
       v
┌────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: Statistical Analysis                                          │
│                                                                        │
│  Bootstrap CI (n=10,000)        Paired Wilcoxon signed-rank test       │
│  - 95% CI on MRR per model      - per-query deltas                    │
│  - per-repo variance            - Holm-Bonferroni correction           │
│  - query-type breakdown         - effect size (Cohen's d)              │
│                                                                        │
│  Convergence check: if CIs overlap, models are NOT distinguishable     │
└────────────────────────────────────────────────────────────────────────┘
       |
       v
┌────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: Report Generation                                             │
│                                                                        │
│  Terminal Table        Pareto Plot           Recommendation Grid       │
│  - overall ranking     - quality vs cost     - best quality            │
│  - cross-repo heatmap  - ASCII scatter        - best value             │
│  - query-type heatmap  - Pareto frontier      - best speed             │
│  - quant degradation   - models labeled       - best local             │
└────────────────────────────────────────────────────────────────────────┘
       |
       v
eval-embed.db (eval_results, bootstrap CIs, significance tests)
```

**Data flow**: raw code chunks -> model embeddings -> retrieval ranks -> metric computation -> statistical analysis -> report. The `eval-embed.db` stores every intermediate artifact so any phase can be re-run without re-embedding.

---

## 3. Metrics

### Primary Co-Metrics

Both MRR and NDCG@10 are reported as primary. They answer different questions:

| Metric | Rationale | Target for "good" |
|--------|-----------|-------------------|
| **MRR** (Mean Reciprocal Rank) | Developers look at 1-3 results then reformulate. Binary relevance (one correct chunk) is clean and unambiguous. MRR 0.75 means correct chunk is typically in position 1-2. | > 0.75 |
| **NDCG@10** | Academic standard (CoIR, MTEB, CodeSearchNet). Rank-weighted with logarithmic discount. Enables comparison with published benchmarks. | > 0.80 |

**Why not MAP**: MAP assumes multiple relevant documents per query. Each query in embed-eval has exactly one ground-truth chunk. MAP degenerates to MRR in that case. Do not use MAP.

### Secondary Metrics

| Metric | K Values | Purpose |
|--------|----------|---------|
| Precision@K | 1, 5 | User-visible: "did correct result appear on first screen?" |
| Recall@K | 10, 20 | Coverage for multi-result contexts (agent context window filling) |
| Win Rate | — | Cross-model: which model places #1 most often per query |
| Confidence Gap | — | top-1 minus top-2 similarity score; indicates decisiveness |

### Tier-Weighted MRR (claudemem-specific)

A composite that rewards models which maintain quality on hard distractors:

```
TW-MRR = 0.50 * mrr_T0 + 0.25 * mrr_T1 + 0.15 * mrr_T2 + 0.10 * mrr_T3
```

Where T0 is same-file (hardest), T3 is random (easiest). The ratio `mrr_T0 / mrr_T3` reveals degradation under pressure.

### Per-Breakdown Reporting

All primary metrics are reported at 4 levels:
1. **Overall** — single number per model across all repos and query types
2. **Per-repo** — reveals cross-codebase generalization and language bias
3. **Per-query-type** — reveals where a model wins or loses (vague vs. exact API lookup)
4. **Per-hard-negative-tier** — reveals discriminating power against difficult distractors

**Aggregation**: Report both macro-average (equal weight per repo) and micro-average (weighted by chunk count). A model with lower macro but lower variance across repos may be the better production choice.

---

## 4. Query Design

### Two Sources, Eight Types, One Decontamination Filter

Pure LLM generation is contaminated: the LLM sees function names and generates queries containing those names, inflating scores. Pure templates are too rigid. The correct approach is two sources with a decontamination filter and a frozen dev/test split.

### The 8-Type Query Taxonomy

Inherited from `benchmark-v2/extractors/query-generator.ts`:

```
Type                  Description                         Contamination Risk
-----------------------------------------------------------------------
vague                 "something with users"              LOW
wrong_terminology     "authenticate" for "login"          LOW
specific_behavior     "check if token is expired"         MEDIUM
integration_query     "use with Express middleware"       MEDIUM
problem_based         "prevent double-submission"         LOW
doc_conceptual        "How does pagination work?"         LOW
doc_api_lookup        "SearchOptions parameters"          HIGH (exact names)
doc_best_practice     "when to use batchEmbed"            MEDIUM
```

### Query Sources Per Code Unit

```
Source                Count   Query Types Covered
-----------------------------------------------------------
Template-based          3     vague, problem-based, integration
LLM-generated           5     wrong_terminology, specific_behavior,
                              doc_conceptual, doc_api_lookup,
                              doc_best_practice
Total                   8     All 8 types covered
```

**Template examples** (use `inferDomain()` to extract domain words from comments/imports, never function names):

```typescript
const TEMPLATES = [
  (unit) => `code that deals with ${unit.language} ${unit.type}`,
  (unit) => `how to handle errors in ${inferDomain(unit.content)}`,
  (unit) => `example of using ${inferDomain(unit.content)} with other components`,
];
```

**LLM generation prompt** (temperature 0.8, from raw code NOT summaries):

```
Generate 5 natural language search queries a developer might use to find this code.
DO NOT use exact function names or variable names from the code.
Mix: 1 vague, 1 wrong-terminology, 1 problem-based, 1 conceptual, 1 behavioral.
Each query should be 5-15 words. Use natural developer language, not formal descriptions.
```

### Decontamination Filter

Any generated query containing a verbatim identifier from the target function's signature is flagged as contaminated and regenerated (up to 3 retries). Implementation: token overlap check between query tokens and function signature tokens.

```typescript
function isContaminated(query: string, signature: string): boolean {
  const queryTokens = new Set(query.toLowerCase().split(/\W+/));
  const sigTokens = new Set(signature.toLowerCase().split(/\W+/)
    .filter(t => t.length > 3));  // skip short tokens (a, b, is, by, etc.)
  return [...sigTokens].some(t => queryTokens.has(t));
}
```

### Frozen Dev/Test Split

Queries are partitioned into `dev` and `test` at construction time and never re-generated:
- **dev** (30%): used for alpha sweeps (hybrid search), query validation, parameter tuning
- **test** (70%): used for final model ranking, never touched except in final eval

The split is stored in `eval-embed.db` and reproduced from a fixed seed. The seed is recorded in the run config. No model is ever evaluated on the dev split for its primary ranking.

### Real User Query Integration (optional)

Minimax proposed opt-in telemetry. If enabled via `claudemem telemetry enable`, actual `claudemem search` queries are logged anonymously and can be replayed in eval. These are treated as a third query source (labeled `user_telemetry`) and reported separately. They are NOT mixed into the primary query set to preserve benchmark reproducibility.

### Scale

With 50 code units per repo, 5 repos, 8 queries per unit:
- **Total queries**: 2,000 (test split: ~1,400; dev split: ~600)
- This exceeds the minimum of 400 for bootstrap CI width < 0.03 MRR points
- This exceeds the minimum of 600 for NDCG@10 CI width < 0.02

---

## 5. Hard Negatives

### 4-Tier Distractor System

Each query's evaluation uses exactly 9 distractors (the pool size the existing contrastive evaluator uses), drawn from 4 tiers with fixed proportions:

```
Tier   Count   Selection Strategy                    Difficulty
-----------------------------------------------------------------------
T0       3     SAME FILE: other functions in          HARDEST
               exact same file as target.
               Shared context, similar scope names.

T1       2     SIMILAR SIGNATURE: matching param      HARD
               count + overlapping param names.
               Tests whether model distinguishes
               semantically similar APIs.

T2       2     SEMANTIC NEAR-MISS: embedding          MEDIUM-HARD
               similarity 0.75-0.95 (pre-computed
               with reference model).
               Tests resilience against near-miss
               neighbors in embedding space.

T3       2     RANDOM SAME-LANGUAGE: from a           EASY
               different file, same language.
               Baseline difficulty.
```

**Why 0.75-0.95 for T2, not 0.5-0.95**: Research shows the 0.5-0.75 range is easy for all models. The discriminating range is 0.75-0.95. Distractors below 0.75 inflate scores without revealing real differences.

**Cross-language distractors** (GPT-5.3 contribution): For the T3 random tier, 1 of the 2 slots should be from a *different* language when available. Cross-language distractors reveal whether a model treats `getUserById` in TypeScript and `get_user_by_id` in Python as similar, which should not happen.

### Reference Model for T2 Bootstrapping

T2 requires pre-computing embeddings with a reference model (`qwen/qwen3-embedding-8b`, the current claudemem default). This is the bootstrapping step: the reference model's embedding space defines the semantic near-miss pool. All candidate models are evaluated against this shared pool, which is fair because the pool is fixed across models.

**Trade-off**: If the reference model has biases, those propagate to all models' T2 pools. This is acceptable because T2 is only one of four tiers (2/9 distractors). The shared pool also ensures comparability across runs.

### Difficulty Labeling and Per-Tier Reporting

Each distractor set is labeled by dominant tier: if 5+ of 9 distractors are T0/T1, the query is labeled `hard`. Report metrics at each tier level separately:

```
Tier label    MRR         Interpretation
easy          0.921       baseline (random same-lang)
medium        0.876       -4.9% degradation
hard          0.773       -15.9% degradation (main discriminator)
semantic      0.812       -11.8% (embedding near-miss resilience)
```

Models that maintain high `mrr_T0` relative to `mrr_T3` are more reliable for production use.

---

## 6. Cross-Codebase Testing

### Repo Selection

Minimum 5 repos (statistical reliability requires 3+; 5 gives stable variance estimates):

```
Repo           Language      Size      Why Selected
-----------------------------------------------------------------------
claudemem      TypeScript    Medium    Home repo; known quantities
fastify        TypeScript    Large     HTTP server; async patterns; TS #2
cpython/Lib    Python        Large     Docstring-rich; established idioms
ruff           Rust          Medium    CLI tool; non-TS naming conventions
chi            Go            Small     HTTP router; idiomatic Go
```

These cover 4 languages (TS, Python, Rust, Go), sizes from small to large, and domains from CLI tools to stdlib. All 5 are available in the agentbench pool (`../agentbench/data/eval-repos/`).

**Extended suite** (optional with `--full-repos`): Use all 12 agentbench repos for a weekly sweep. The core 5 are the fast CI suite; the full 12 is for release validation.

### Stratified Sampling

Per repo, sample 50 code units stratified by type:
- 40% functions (most common search target)
- 30% methods (inside classes)
- 20% classes
- 10% modules/files

This ensures the benchmark tests all granularities, not just small utilities.

### Aggregation

Report three aggregate views:

1. **Macro-average** (equal weight per repo): prevents one large repo from dominating
2. **Micro-average** (weighted by chunk count): volume-weighted perspective
3. **Language-stratified**: separate averages for TypeScript/JS, Python, Rust/Go

Cross-repo variance (standard deviation of MRR across repos) is a key secondary metric:
- Low variance (< 0.02) = model generalizes well across languages
- High variance (> 0.05) = model has language-specific strengths, risky for general use

**Bias detection**: flag any model where MRR on its best repo exceeds MRR on its worst repo by more than 0.10. This indicates language or domain bias.

### Cross-Repo Generalization Test (optional)

Kimi's contribution: train the alpha sweep (hybrid search) on 4 repos, evaluate on the 5th held-out repo. Rotate. A model that picks a good alpha on held-out data generalizes its hybrid configuration.

---

## 7. Hybrid Search

### Why Hybrid Search Must Be Evaluated

BM25 excels on exact identifier matches ("useAuthStore", "PageRank", class/function names). Embeddings excel on semantic natural language queries. claudemem uses hybrid search by default. A "worse" embedding model can win in hybrid mode if it provides complementary signal to BM25. Evaluating embedding-only underestimates the combined system.

### Evaluation Modes

| Mode | Description | Reported as |
|------|-------------|-------------|
| `vector-only` | Cosine similarity ranking only | Baseline |
| `bm25-only` | BM25 lexical ranking only | Language control |
| `hybrid-rrf` | Reciprocal Rank Fusion (parameter-free) | Primary hybrid metric |
| `hybrid-linear` | Weighted linear combination, alpha swept on dev split | Secondary |

**RRF formula** (k=60, industry standard):
```
RRF_score(d) = 1 / (60 + rank_vector(d)) + 1 / (60 + rank_bm25(d))
```

RRF is the primary hybrid metric because it is parameter-free, making cross-model comparison fair. No alpha to tune per model means no per-model inflation.

### Alpha Sweep

For each model, sweep alpha in [0.1, 0.2, 0.3, 0.4, 0.5] on the **dev split only**. Lock the best alpha (`alpha*`). Report `alpha*` alongside hybrid MRR on the test split. A model with high `alpha*` (e.g., 0.45) needs heavy BM25 support; a model with low `alpha*` (e.g., 0.10) is strong semantically.

```
Model              Vector-MRR   BM25-MRR   Hybrid-RRF   alpha*   Hybrid-Linear
voyage-code-3        0.800       0.680       0.858       0.25       0.861
qwen3-emb-8b         0.754       0.680       0.836       0.30       0.839
nomic-embed-code     0.783       0.680       0.854       0.20       0.855
all-minilm-l6-v2     0.623       0.680       0.742       0.45       0.749
```

Note: BM25 MRR is identical across models (BM25 is embedding-independent). The key insight: `all-minilm-l6-v2` is weak vector-only but recovers with heavy BM25 support. Whether this matters depends on the query mix.

---

## 8. Practical Metrics

### Measurements

| Metric | Method | Why |
|--------|--------|-----|
| p50 batch latency | Median of 50 batch calls | Interactive indexing feel |
| p95 batch latency | 95th percentile | Tail latency for large files |
| chunks/sec (sustained) | 500-chunk index / wall-time | Re-indexing speed |
| cost per 1M tokens | price * (tokens / 1M) | Budget for large repos |
| cost per 500-file repo | normalized from above | Real user cost estimate |
| VRAM / RAM peak | nvidia-smi or Metal stats | Local model resource planning |

### Profiling Protocol

For each model:
1. Warm-up: 5 batches of 20 chunks (discarded)
2. Measurement: 50 batches of 20 chunks (1,000 chunks total)
3. Record: batch start/end timestamps, reported token counts, API cost fields

For local models (Ollama, LM Studio): same protocol, note $0 cost but record compute time.

### Pareto Frontier (ASCII + Markdown)

Quality and latency are NOT combined into a single score. A composite score encodes an arbitrary weighting that varies by user context (interactive vs. nightly CI). Instead, the Pareto frontier shows which models are dominated:

```
Quality (MRR)
  0.85 |  * voyage-code-3 ($0.18/M)
       |
  0.80 |              * nomic-embed-code (free, local)
       |
  0.75 |       * qwen3-emb-8b ($0.01/M)
       |
  0.70 |
       |                          * all-minilm-l6-v2 (free)
  0.65 |
       +-------+-------+------+------+--> Cost ($/M tokens)
        free   0.01   0.05  0.10   0.20
```

Models below/right of the Pareto frontier are dominated. Report the recommendation grid:

```
RECOMMENDATION
Best quality:     voyage-code-3    (MRR 0.802, $0.18/M)
Best value:       nomic-embed-code (MRR 0.783, free local, n.s. vs #1)
Best speed:       qwen3-emb-0.6b   (3,200 chunks/sec, MRR 0.731)
Best budget API:  qwen3-emb-8b     (MRR 0.754, $0.01/M)
```

---

## 9. Quantization and MRL Testing

### The Test Matrix

For each model that supports both quantization variants and MRL (Matryoshka Representation Learning):

```
                 Full dims   Half dims   Quarter dims
fp16 (baseline)    MRR         MRR           MRR
Q8_0 (~0% loss)    MRR         MRR           MRR
Q4_K_M (~2% loss)  MRR         MRR           MRR
```

For models without MRL (voyage-code-3, nomic-embed-code 7B): quantization rows only.

Expected degradation from research:
- Q8_0: < 0.5% MRR loss (use this freely for storage savings)
- Q4_K_M: ~1.5-2% MRR loss (acceptable for most use cases)
- Half-dims MRL: ~2-3% MRR loss
- Combined Q4 + half-dims: ~3.5-4% MRR loss, ~75% storage reduction

### MRL Implementation

MRL truncation is implemented at embed time by taking only the first N dimensions of the returned vector. Add `embeddingDimensions` to `EmbeddingsClientOptions`:

```typescript
interface EmbeddingsClientOptions {
  // ... existing fields ...
  embeddingDimensions?: number;  // MRL: take first N dims (must be <= model's native dim)
  queryPrefix?: string;          // Instruction prefix (Qwen3: "Instruct: Retrieve...\nQuery: ")
  passagePrefix?: string;        // Passage prefix for asymmetric models
}
```

After receiving the full embedding:
```typescript
if (this.options.embeddingDimensions && embedding.length > this.options.embeddingDimensions) {
  return embedding.slice(0, this.options.embeddingDimensions);
}
```

### Degradation Report Format

```
Model: qwen3-embedding-0.6b (native 1024-dim)
                fp16    Q8_0    Q4_K_M   Storage (10K chunks)
1024-dim        0.754   0.752   0.740    40MB baseline
 512-dim        0.738   0.736   0.725    10MB (-75%, -1.6% quality)
 256-dim        0.721   0.719   0.709    5MB  (-87.5%, -3.3% quality)
 128-dim        0.693   0.691   0.682    2.5MB (-93.8%, -7.2% quality)

Recommended sweet spot: 512-dim Q4_K_M (knee of quality-storage curve)
```

### Pareto Frontier for Quant/MRL

For each model, plot MRR vs. storage size across the matrix. The knee of this curve is the recommended production configuration. Report as: "512-dim Q4 saves 75% storage for 1.6% MRR loss."

---

## 10. Statistical Rigor

### Bootstrap Confidence Intervals

For each model's MRR, compute 95% CI via bootstrap resampling (n=10,000 samples):

```typescript
function bootstrapCI(scores: number[], nSamples = 10_000): { lo: number; hi: number } {
  const means: number[] = [];
  for (let i = 0; i < nSamples; i++) {
    const resample = Array.from(
      { length: scores.length },
      () => scores[Math.floor(Math.random() * scores.length)]
    );
    means.push(resample.reduce((a, b) => a + b, 0) / resample.length);
  }
  means.sort((a, b) => a - b);
  return {
    lo: means[Math.floor(0.025 * nSamples)],
    hi: means[Math.floor(0.975 * nSamples)],
  };
}
```

When CIs overlap between two models: explicitly state "not statistically distinguishable at 95% confidence." In that case, the cheaper/faster/local model is preferred.

### Paired Wilcoxon Signed-Rank Test

For each pair of models (A vs B), compute a paired Wilcoxon signed-rank test on per-query MRR scores. This is more appropriate than a paired t-test because MRR values (1, 1/2, 1/3, ...) are not normally distributed.

Apply Holm-Bonferroni correction for multiple comparisons. With 5 models: 10 pairs = 10 tests. Report the corrected p-value for each pair.

**Effect size**: Report Cohen's d (or Cliff's delta for non-parametric) for practical significance. A statistically significant difference with d < 0.2 is practically negligible.

### Significance Table Format

```
Model A           Model B             MRR-A   MRR-B   Delta   p (corrected)  Sig?
voyage-code-3     qwen3-emb-8b        0.802   0.754   +0.048  0.0003         YES
voyage-code-3     nomic-embed-code    0.802   0.783   +0.019  0.142          NO  (n.s.)
nomic-embed-code  qwen3-emb-8b        0.783   0.754   +0.029  0.021          YES
```

### Minimum Sample Sizes

| Requirement | Minimum queries | embed-eval provides |
|-------------|-----------------|---------------------|
| Bootstrap CI width < 0.03 MRR | 400 | 2,000 (5x margin) |
| NDCG@10 CI width < 0.02 | 600 | 2,000 (3x margin) |
| 80% power to detect 0.03 MRR difference | ~500 | 2,000 |
| After Holm-Bonferroni (10 pairs): detect 0.04 difference | ~800 | 2,000 |

Emit a warning if N < 400 (e.g., in `--quick` mode).

### Friedman Test for Multi-Model Comparison

When comparing more than 2 models across multiple repos simultaneously, use the Friedman test (non-parametric equivalent of repeated-measures ANOVA). This handles the non-independence of per-repo scores correctly. Use this for the overall ranking; use Wilcoxon for pairwise comparisons.

---

## 11. CLI Design

### Core Command

```bash
claudemem embed-eval [CORE_FLAGS] [OPTIONAL_FLAGS] [repos...]
```

### CORE Flags (always available, essential)

These flags define what you are evaluating. Every run uses them.

```
--models/-m <list>    REQUIRED. Comma-separated model IDs.
                      Formats: openrouter model IDs, voyage-*, ollama/*, lmstudio/*
                      Example: --models voyage-code-3,qwen/qwen3-embedding-8b,ollama/nomic-embed-code

--repos/-r <list>     Comma-separated repo paths or agentbench slugs.
                      Default: claudemem (home repo only, for quick checks)
                      Example: --repos claudemem,fastify,cpython,ruff,chi

--n-per-repo <n>      Code units sampled per repo.
                      Default: 50. Quick mode default: 20.
                      Minimum for reliable CIs: 30.

--output/-o <path>    SQLite DB for results.
                      Default: eval-embed-TIMESTAMP.db

--format <fmt>        Output format: table (default), json, csv

--quick               Fast mode: --n-per-repo 20, 4 queries/unit, 1 repo,
                      no latency, no hybrid, no CIs.
                      Runtime: ~10 minutes for 3 models.

--seed <n>            Random seed for query sampling and bootstrap.
                      Default: 42. Set for reproducible runs.

--split <which>       Which split to evaluate: dev, test (default), both.
                      Use 'dev' only for tuning. Use 'test' for final ranking.
```

### OPTIONAL Flags (advanced features, explicitly gated)

These flags enable features that add runtime or compute. Off by default.

```
--- Evaluation extensions ---
--hybrid              OPTIONAL. Also evaluate BM25+vector hybrid search.
                      Adds: BM25-only, RRF, and alpha-swept linear combination.
                      Adds ~20% runtime. Requires BM25 index build.

--latency             OPTIONAL. Profile latency and throughput.
                      Runs: 5-batch warmup + 50-batch measurement.
                      Adds ~5 minutes per model.

--full-repos          OPTIONAL. Use all 12 agentbench repos instead of core 5.
                      Adds runtime linearly with repo count.

--- Statistical options ---
--ci                  OPTIONAL. Compute bootstrap confidence intervals (n=10,000).
                      Adds ~2 minutes.

--significance <thr>  OPTIONAL. Significance threshold for pairwise Wilcoxon tests.
                      Default when flag present: 0.05.

--bootstrap-n <n>     OPTIONAL. Number of bootstrap samples.
                      Default: 10000. Reduce to 1000 for faster dev runs.

--- Quantization / MRL ---
--quant-sweep         OPTIONAL. Test fp16, Q8_0, Q4_K_M for each model.
                      Only applies to local models (Ollama, LM Studio).

--mrl-dims <list>     OPTIONAL. MRL dimension truncation to test.
                      Example: --mrl-dims 1024,512,256,128
                      Requires models that support MRL (Qwen3, Jina, Nomic).

--- Comparison ---
--baseline <db>       OPTIONAL. Previous eval-embed.db to compare against.
                      Loads prior results for statistical comparison without re-running.

--alpha-range <list>  OPTIONAL. Alpha values for hybrid linear sweep (dev split only).
                      Default: 0.1,0.2,0.3,0.4,0.5
                      Only active when --hybrid is set.

--- Output extensions ---
--pareto              OPTIONAL. Render ASCII Pareto plot (quality vs cost).
                      Requires --latency to be set.

--html <path>         OPTIONAL. Write HTML report with interactive charts (Vega-Lite).
```

### Invocation Examples

```bash
# Minimal: compare 3 models on home repo (default)
claudemem embed-eval --models voyage-code-3,qwen/qwen3-embedding-8b,ollama/nomic-embed-code

# Quick smoke test: fast, single repo
claudemem embed-eval --quick \
  --models voyage-code-3,qwen3-embedding-0.6b

# Full cross-repo evaluation with all recommended features
claudemem embed-eval \
  --models voyage-code-3,qwen/qwen3-embedding-8b,ollama/nomic-embed-code \
  --repos claudemem,fastify,cpython,ruff,chi \
  --hybrid --latency --ci \
  --output eval-embed-2026-03.db \
  --pareto

# Quantization and MRL sweep for a single model
claudemem embed-eval \
  --models qwen/qwen3-embedding-0.6b \
  --quant-sweep \
  --mrl-dims 1024,512,256,128 \
  --repos claudemem

# Compare new model against previous baseline
claudemem embed-eval \
  --baseline eval-embed-2026-01.db \
  --models mistralai/codestral-embed \
  --ci --significance 0.05

# Dataset build only (Gemini's eval-build idea, useful for pre-computation)
claudemem embed-eval \
  --build-only \
  --repos claudemem,fastify,cpython,ruff,chi \
  --n-per-repo 50 \
  --output eval-dataset-2026-03.db
```

### Default Terminal Output

```
claudemem embed-eval — 2026-03-05 14:32 — 5 repos, 250 units, 2000 queries
=======================================================================

OVERALL RANKING (by MRR on test split)
----------------------------------------------------------------------
#  Model                MRR [95% CI]         NDCG@10  P@1    Win%
1  voyage-code-3        0.802 [0.781-0.823]  0.847    0.689  41%
2  nomic-embed-code     0.783 [0.762-0.804]  0.831    0.671  35%  (n.s. vs #1)
3  qwen3-emb-8b         0.754** [0.731-0.777] 0.812  0.641  24%
4  qwen3-emb-0.6b       0.731** [0.708-0.754] 0.793  0.618  —
** p < 0.05 vs #1 (Holm-Bonferroni corrected)
(n.s.) not significantly different from #1

CROSS-REPO BREAKDOWN
----------------------------------------------------------------------
Model                claudemem  fastify  cpython  ruff   chi  StdDev
voyage-code-3          0.821    0.791    0.813   0.778  0.808  0.016
nomic-embed-code       0.808    0.778    0.796   0.765  0.769  0.017
qwen3-emb-8b           0.771    0.743    0.781   0.734  0.741  0.019

HARD NEGATIVE TIERS (voyage-code-3)
----------------------------------------------------------------------
T3 easy (random)       0.921
T2 semantic near-miss  0.812  (-11.8%)
T1 similar-signature   0.876  (-4.9%)
T0 same-file           0.773  (-15.9%)  <- main discriminator

QUERY TYPE BREAKDOWN (voyage-code-3)
----------------------------------------------------------------------
vague                  0.742    doc_conceptual    0.834
wrong_terminology      0.718    doc_api_lookup    0.881
specific_behavior      0.851    doc_best_practice 0.821
integration_query      0.803    problem_based     0.779

PRACTICAL METRICS
----------------------------------------------------------------------
Model               Cost/1M  Chunks/s  p50-batch  Local?
voyage-code-3       $0.18    1420      0.89s      NO
qwen3-emb-8b        $0.01     210      4.10s      NO
nomic-embed-code    free      380      2.40s      YES (GGUF)
qwen3-emb-0.6b      free     3200      0.31s      YES (Ollama)

RECOMMENDATION
----------------------------------------------------------------------
Best quality:     voyage-code-3    (MRR 0.802, $0.18/M)
Best value:       nomic-embed-code (MRR 0.783, free local, n.s. vs #1)
Best speed:       qwen3-emb-0.6b   (3200 chunks/sec, MRR 0.731)
Best budget API:  qwen3-emb-8b     (MRR 0.754, $0.01/M, sig. below #1)
```

---

## 12. Database Schema

All results are stored in `eval-embed.db` (SQLite), separate from the existing `benchmark.db`. This allows embed-eval to run without a prior benchmark run.

```sql
-- Run metadata
CREATE TABLE eval_runs (
  id          TEXT PRIMARY KEY,  -- UUID
  created_at  TEXT NOT NULL,
  config_json TEXT NOT NULL       -- Full EvalConfig as JSON (models, repos, flags, seed)
);

-- Code units sampled from repos
CREATE TABLE code_units (
  id                 TEXT PRIMARY KEY,
  run_id             TEXT NOT NULL REFERENCES eval_runs(id),
  repo               TEXT NOT NULL,     -- repo slug
  path               TEXT NOT NULL,     -- file path
  language           TEXT NOT NULL,     -- typescript, python, rust, go, ...
  type               TEXT NOT NULL,     -- function, method, class, module
  content            TEXT NOT NULL,     -- raw source code
  chunk_size_tokens  INTEGER,
  split              TEXT NOT NULL      -- 'dev' or 'test'
);

-- Queries (one row per query-unit pair)
CREATE TABLE queries (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL,
  code_unit_id        TEXT NOT NULL REFERENCES code_units(id),
  type                TEXT NOT NULL,    -- vague, wrong_terminology, ...
  query               TEXT NOT NULL,
  is_template         INTEGER NOT NULL, -- 1 if template-generated, 0 if LLM
  contamination_check TEXT,             -- tokens that were flagged (or null)
  source              TEXT             -- 'template', 'llm', 'user_telemetry'
);

-- Distractor sets (one row per code unit)
CREATE TABLE distractor_sets (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  code_unit_id    TEXT NOT NULL REFERENCES code_units(id),
  t0_unit_ids     TEXT NOT NULL,   -- JSON array of unit IDs (same-file)
  t1_unit_ids     TEXT NOT NULL,   -- JSON array of unit IDs (similar-sig)
  t2_unit_ids     TEXT NOT NULL,   -- JSON array of unit IDs (semantic near-miss)
  t3_unit_ids     TEXT NOT NULL,   -- JSON array of unit IDs (random, cross-lang)
  reference_model TEXT NOT NULL    -- model used to compute T2 similarities
);

-- Embeddings (one row per model × unit × quant × dim combination)
CREATE TABLE model_embeddings (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL,
  model_id     TEXT NOT NULL,
  code_unit_id TEXT NOT NULL,
  embedding    BLOB NOT NULL,   -- stored as Float32Array binary
  dim          INTEGER NOT NULL,
  quant        TEXT NOT NULL,   -- 'fp16', 'q8_0', 'q4_k_m'
  mrl_dims     INTEGER          -- null if not MRL-truncated
);

-- Per-query retrieval results
CREATE TABLE eval_results (
  id               TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL,
  model_id         TEXT NOT NULL,
  query_id         TEXT NOT NULL,
  retrieval_rank   INTEGER NOT NULL,   -- rank of correct chunk in result list
  mrr              REAL NOT NULL,      -- 1/retrieval_rank
  hit_at_1         INTEGER NOT NULL,   -- 1 if rank == 1
  hit_at_5         INTEGER NOT NULL,
  hit_at_10        INTEGER NOT NULL,
  ndcg_10          REAL NOT NULL,
  tier             TEXT NOT NULL,      -- 'T0', 'T1', 'T2', 'T3' (dominant tier)
  hybrid_rank      INTEGER,            -- rank under RRF (null if not hybrid run)
  hybrid_mrr       REAL,
  quant            TEXT,               -- null unless quant-sweep run
  mrl_dims         INTEGER             -- null unless MRL run
);

-- Bootstrap CIs per model (aggregated)
CREATE TABLE model_stats (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  repo        TEXT,            -- null = across all repos
  mrr_mean    REAL NOT NULL,
  mrr_ci_lo   REAL NOT NULL,   -- 95% CI lower bound
  mrr_ci_hi   REAL NOT NULL,
  ndcg_mean   REAL NOT NULL,
  sample_size INTEGER NOT NULL,
  n_bootstrap INTEGER NOT NULL
);

-- Pairwise significance tests
CREATE TABLE significance_tests (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  model_a     TEXT NOT NULL,
  model_b     TEXT NOT NULL,
  mrr_delta   REAL NOT NULL,   -- model_a - model_b
  p_value     REAL NOT NULL,   -- Holm-Bonferroni corrected
  cohens_d    REAL NOT NULL,
  significant INTEGER NOT NULL -- 1 if p < threshold
);

-- Latency profiles (one row per model)
CREATE TABLE latency_profiles (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  model_id        TEXT NOT NULL,
  p50_ms          REAL,
  p95_ms          REAL,
  chunks_per_sec  REAL,
  cost_per_1m     REAL,
  is_local        INTEGER NOT NULL,  -- 1 for Ollama/LM Studio
  vram_mb         REAL               -- null for API models
);
```

---

## 13. Implementation Phases

Ordered by priority. Phases 1-4 constitute the MVP; Phase 5+ are enhancements.

### Phase 1: Dataset Builder (2 days) — REQUIRED

**Files**: `src/embed-eval/dataset/repo-sampler.ts`, `query-builder.ts`, `hard-negative-miner.ts`, `database.ts`

- `RepoSampler`: wraps `benchmark-v2/codebase-detector.ts`; adds multi-repo support and stratified type sampling (40/30/20/10)
- `QueryBuilder`: reuses `benchmark-v2/extractors/query-generator.ts`; adds 3 template generators, decontamination filter, frozen dev/test split
- `HardNegativeMiner`: extends `selectDistractors()` in `contrastive/index.ts`; adds explicit T3 random tier; enforces 0.75 lower bound on T2; adds cross-language slot to T3
- `EvalDatabase`: new SQLite schema (`eval-embed.db`)

**Existing code reuse**: The `contrastive/index.ts` already implements T0, T1, T2 (lines 98-138). Reuse and extend.

### Phase 2: Model Runner (1.5 days) — REQUIRED

**Files**: `src/embed-eval/runner/model-runner.ts`, `latency-profiler.ts`

- `ModelRunner`: wraps existing `createEmbeddingsClient()` from `src/core/embeddings.ts`; adds `embeddingDimensions` MRL truncation and `queryPrefix`/`passagePrefix` instruction support
- `LatencyProfiler`: 5-batch warmup + 50-batch measurement; records p50/p95/throughput

**Required change to existing code**: Add `embeddingDimensions`, `queryPrefix`, `passagePrefix` to `EmbeddingsClientOptions` in `src/core/embeddings.ts`. This is the only modification to an existing file in Phase 1-2.

### Phase 3: Retrieval Evaluator (1.5 days) — REQUIRED

**Files**: `src/embed-eval/evaluators/vector-eval.ts`, `hybrid-eval.ts`

- `VectorEval`: reuses `RetrievalEvaluator` from `benchmark-v2/evaluators/retrieval/index.ts`; adds tier-aware distractor filtering and NDCG@10 computation
- `HybridEval`: wraps BM25 scorer from `src/core/search/`; implements RRF; sweeps alpha on dev split, locks on test split

### Phase 4: Statistics + CLI (1 day) — REQUIRED

**Files**: `src/embed-eval/stats/bootstrap.ts`, `significance.ts`, `src/embed-eval/cli.ts`

- `bootstrapCI()`: pure function, n=10,000 samples
- `wilcoxonSignedRank()`: extend `src/benchmark-v2/scorers/statistics.ts`
- `holmBonferroni()`: multiple comparison correction
- CLI entry point: add `embed-eval` case to `src/cli.ts` switch statement
- Table formatter for terminal output

**Total MVP estimate**: 6 developer-days

### Phase 5: MRL and Quantization Sweep (1.5 days) — OPTIONAL

**Files**: `src/embed-eval/runner/mrl-sweep.ts`, `src/embed-eval/runner/quant-runner.ts`

- `MRLSweep`: iterates dimension list per model; stores separate embedding rows per dim
- `QuantRunner`: dispatches to quantized Ollama variant; parses GGUF quant level from model name

### Phase 6: Report Enhancements (1 day) — OPTIONAL

**Files**: `src/embed-eval/report/pareto-plot.ts`, `src/embed-eval/report/html-report.ts`

- Pareto ASCII plot (quality vs cost)
- HTML report with Vega-Lite charts (heatmaps, scatter plots)
- JSON export with full CIs

### Phase 7: Agentbench Integration (1 day) — OPTIONAL

**Files**: `scripts/embed-eval-agentbench.sh`

- Shell script to run embed-eval across all 12 agentbench repos
- Uses restored indexes (no re-indexing needed)
- Outputs per-language summary table

---

## 14. Model Attribution

Which idea originated with which model:

| Idea | Source |
|------|--------|
| Embed raw chunks not summaries (core fix) | Internal (Claude) — primary contribution |
| 8-type query taxonomy | Internal — inherited from benchmark-v2 |
| Decontamination filter (token overlap check) | Internal |
| Tier-weighted MRR (TW-MRR formula) | Internal |
| Reference model bootstrapping for T2 semantic distractors | Internal |
| Decision not to aggregate quality + latency into single score | Internal |
| Separate eval-build vs eval-embed phases / `--build-only` | Gemini 3.1 Pro |
| Pareto frontier plot (quality vs cost) | Gemini 3.1 Pro (echoed by Internal) |
| Cross-encoder validation for synthetic queries | Gemini 3.1 Pro, GLM-5 |
| Three-tier query mix (human/LLM/template percentages) | GPT-5.3 Codex, Kimi, GLM-5 |
| Cross-language distractors in T3 tier | GPT-5.3 Codex |
| Macro-average vs micro-average distinction | GPT-5.3 Codex, Kimi |
| core-6 fast suite vs full-12 weekly suite | GPT-5.3 Codex |
| Frozen dev/test split (alpha locked on dev only) | Kimi K2.5 |
| Cross-repo generalization test (train on 4, test on 1) | Kimi K2.5 |
| Confidence Gap secondary metric | GLM-5 |
| Feature tier labels (MVP / Standard / Advanced) | GLM-5 |
| HTML report with interactive Vega-Lite charts | GLM-5 |
| Real user query telemetry (opt-in) | Minimax M2.5 |
| Total Cost of Ownership (TCO) formula | Minimax M2.5, Kimi |
| `queryPrefix`/`passagePrefix` in EmbeddingsClientOptions | Internal (note on Qwen3 instruction prefix) |
| Wilcoxon over t-test for non-normal MRR distribution | Internal, GPT-5.3 Codex, Kimi, GLM-5 (unanimous) |
| Holm-Bonferroni correction | Internal, GPT-5.3 Codex (unanimous) |
| Friedman test for multi-model multi-repo comparison | Kimi K2.5 |
| Win Rate metric | GLM-5, Minimax |
| RRF as primary hybrid (parameter-free = fair comparison) | Internal, Kimi (unanimous) |

---

## Appendix: Key Design Decisions

### A. Raw Chunks, Not Summaries

The current benchmark re-embeds LLM-generated summaries. This conflates embedding model quality with summary quality, measuring `embedding_model * summary_quality`. embed-eval indexes raw code chunks directly, isolating the embedding model. The two tools answer different questions and should not be compared directly.

### B. Shared T2 Distractor Pool

All candidate models are evaluated against the same T2 semantic near-misses, pre-computed using the reference model (`qwen/qwen3-embedding-8b`). This is fair because the pool is fixed across models. If each model defined its own T2 pool, models would be graded on different tests with different difficulty levels.

### C. RRF as Primary Hybrid Metric

RRF is parameter-free. This is why it is the primary hybrid metric: no per-model alpha tuning means cross-model comparison is not inflated by different per-model optimal alphas. The linear alpha sweep (on dev split) is reported as secondary, useful for understanding each model's semantic vs. lexical complementarity.

### D. Separate eval-embed.db

No modification to `benchmark.db`. The existing `benchmark.db` is tied to the summary generation pipeline and `benchmark-v2` schema. A separate DB allows embed-eval to run without a prior benchmark run and evolve its schema independently.

### E. Quality and Latency Not Combined

The weighting of quality vs. speed is user-specific. An interactive tool values p50 latency; a nightly CI job does not. A composite score encodes an arbitrary weighting. Instead, the recommendation grid explicitly names the trade-off and lets users choose.

---

## Appendix: Known Limitations

1. **Human query validation gap**: The decontamination filter removes identifier-based contamination, but LLM queries at temperature 0.8 are still "inspired by" comment text. Real search logs would validate more rigorously. Minimax's telemetry proposal addresses this but requires opt-in infrastructure.

2. **Reference model bias in T2**: T2 semantic distractors depend on the reference model's embedding space. A radically different model might not agree these are semantically near. Acceptable because T2 is only 2 of 9 distractors.

3. **Open-source repo bias**: All 5 core repos are open-source. Proprietary codebases (medical, trading) may have different vocabulary distribution. A model that wins on open-source may not win there. Partially mitigated by testing 4 languages and 5 domains.

4. **Instruction prefix correctness**: Qwen3-Embedding requires `"Instruct: Retrieve code...\nQuery: {query}"` to score correctly; without it, scores drop ~5-8 points. The `queryPrefix`/`passagePrefix` fields in `EmbeddingsClientOptions` must be set correctly per model. The CLI cannot auto-detect these from model IDs; a model configuration registry is needed.

5. **No online signal connection**: The `src/learning/index.ts` feedback system (correction rates) is the only source of real user quality signal but is not connected to embed-eval. Long-term, an A/B test routing users to different embedding models would give the ground truth.
