Based on my analysis of the codebase and research findings, here's my comprehensive embedding model evaluation system design:

---

## Embedding Evaluation System Design Proposal

### 1. Metrics Suite: Comprehensive Quality Assessment

**Primary Metrics (Academic Standard)**
- **NDCG@10** — Primary ranking metric per CoIR/MTEB standard. Accounts for position with logarithmic discounting
- **MRR** — Critical for single-target code search (1/rank of first relevant result)
- **Recall@K** — Important for ensuring coverage in RAG contexts (K=10, 50, 100)

**Secondary Metrics**
- **Precision@1, @5, @10** — Binary hit detection at common cutoffs
- **MAP (Mean Average Precision)** — For multi-relevance scenarios (when multiple code units are valid)
- **Success@K** — Binary: was target found in top K? (K=1, 5, 10)

**Why this set**: Research shows NDCG@10 is the academic standard, but MRR better reflects single-code-unit search (common in IDE "go to definition" scenarios). Recall@K matters for RAG where we need to surface all relevant context.

---

### 2. Query Design: Multi-Source Query Generation

**Three-Tier Query Mix** (inspired by CoIR + real usage patterns):

**Tier 1: Human-Written Queries (40%)**
- Extract docstrings from functions as queries
- Use actual GitHub issue titles/descriptions
- StackOverflow-style problem descriptions

**Tier 2: LLM-Generated Realistic Queries (40%)**
- Generate from code units with varied prompt templates:
  - *Vague*: "Find the code that handles X"
  - *Specific behavior*: "Function that validates JWT tokens"
  - *Wrong terminology*: "Where is the user login?" (when function is `authenticateUser`)
  - *Integration*: "How do I call the API from Python?"
  - *Problem-based*: "Fix the race condition in connection pool"

**Tier 3: Template-Based Edge Cases (20%)**
- "What does `{function_name}` do?"
- "Find all functions that use `{dependency}`"
- "Code that implements `{concept}`"

**Implementation**: Extend `src/benchmark-v2/extractors/query-generator.ts` with a `QueryMixer` class that combines sources with configurable weights.

---

### 3. Hard Negatives: Tiered Difficulty System

**Tier 1: Same-File Negatives (Easiest)**
- Other functions/classes in the same file
- Share context but different purposes

**Tier 2: Same-Directory/Similar Import Negatives**
- Functions from files with similar imports
- Same module/namespace context

**Tier 3: Semantic Near-Misses (Hardest)**
- Functions with similar signatures: `getUserById` vs `getUserByEmail`
- Similar functionality, different implementation
- Detected via: AST signature similarity + embedding cosine similarity (0.75-0.95 range)

**Tier 4: Cross-Language Paraphrases** (experimental)
- Same algorithm implemented in different languages
- Tests cross-lingual code understanding

**Difficulty Calibration**: Track per-query difficulty scores. Models should show monotonic performance degradation: Easy > Medium > Hard > Very Hard. If a model scores higher on Hard than Easy, the difficulty calibration is wrong.

---

### 4. Cross-Codebase Testing: Multi-Repo Evaluation

**Test Corpus (using agentbench infrastructure)**:
- **Minimum 5 repos** covering: TypeScript, Python, Go, Rust, Java
- **Size distribution**: 2 small (<100 files), 2 medium (100-500 files), 1 large (500+ files)
- **Domain variety**: CLI tool, web service, library, algorithm implementation

**Aggregation Strategy**:
```
OverallScore = weighted_mean(repo_scores, weights_by_repo_size)
             + regularization_term(variance_across_repos)

# Models with high variance (good on some repos, bad on others) penalized
```

**Per-Language Breakdown**: Always report scores per-language to detect language-specific model biases.

**Cross-Codebase Generalization Score**: Train/test split across repos — train queries on 4 repos, test on 1 held-out repo. Rotate through all repos. Models that generalize better score higher.

---

### 5. Hybrid Search Testing: BM25 + Vector

**Evaluation Modes**:
1. **Vector-only** — Baseline semantic search
2. **BM25-only** — Baseline lexical search  
3. **Hybrid (RRF)** — Reciprocal Rank Fusion: `score = 1/(k + rank_vector) + 1/(k + rank_bm25)`
4. **Hybrid (Linear)** — Weighted combination: `score = α·vector_score + (1-α)·bm25_score`

**α Optimization**: Grid search α ∈ [0.1, 0.9] to find optimal weighting per model. Report best α and sensitivity.

**Why this matters**: Research shows hybrid search can improve recall by 15-25% over vector-only. Models should be evaluated in the configuration they'll actually be used.

---

### 6. Practical Metrics: Latency, Throughput, Cost

**Timing Measurements**:
- **Cold-start latency**: Time from process start to first embedding
- **Warm p50/p95/p99 latency**: Per-batch embedding times after warm-up
- **Throughput**: chunks/second at batch sizes 1, 10, 50, 100
- **VRAM usage**: Peak memory consumption (for local models)

**Cost Modeling**:
```typescript
interface CostModel {
  inputTokensPerDollar: number;
  outputDimension: number;  // affects storage cost
  storageCostPerMBPerMonth: number;  // LanceDB overhead
}
```

**Total Cost of Ownership (TCO)**:
```
TCO = embedding_API_cost + storage_cost + query_latency_cost
    = (tokens / 1M) * price_per_M + (dim * count * 4 bytes) * storage_rate + (latency * hourly_dev_rate)
```

---

### 7. Quantization & Dimension Testing

**Quantization Levels**:
- **FP16** (baseline)
- **INT8** (Q8_0) — Expected <0.5% quality loss
- **INT4** (Q4_K_M) — Expected 1.5-3% quality loss
- **INT4** (Q4_0) — Expected 3-5% quality loss

**MRL Dimension Truncation** (for models that support it):
- Test at 128, 256, 512, 1024, 2048 dimensions
- Plot quality vs. dimension curve
- Identify "knee point" where additional dims give diminishing returns

**Storage Impact**:
```
IndexSize = num_chunks × dimensions × bytes_per_float × quantization_factor
          = 10,000 × 1024 × 4 × 0.5 (INT8) = 20MB vs 40MB FP16
```

**Recommendation Engine**: Given a quality tolerance (e.g., "accept 2% loss"), recommend optimal quantization + dimension combination.

---

### 8. Statistical Rigor

**Confidence Intervals**:
- Bootstrap resampling (1000 iterations) to compute 95% CI for all metrics
- Report: `MRR = 0.823 ± 0.031 (95% CI: 0.792-0.854)`

**Paired Significance Testing**:
- For each query, compute paired difference between Model A and Model B
- Wilcoxon signed-rank test (non-parametric, handles ties better than t-test)
- Report p-values and effect sizes (Cohen's d)

**Minimum Sample Sizes**:
- For reliable MRR comparison (±0.05 at 95% CI): ~400 queries
- For reliable NDCG@10 comparison (±0.03 at 95% CI): ~600 queries
- System should warn if N < minimum and suggest running more queries

**Multi-Codebase Significance**: Friedman test for comparing >2 models across multiple repos (handles non-independence).

---

### 9. CLI Design: `mnemex eval-embed`

**Core Command**:
```bash
mnemex eval-embed \
  --models "voyage-code-3,qwen3-embedding-8b,jina-code-1.5b" \
  --repos "agentbench/data/eval-repos/*" \
  --queries 500 \
  --metrics "ndcg@10,mrr,p@1,p@5,recall@10" \
  --hard-negatives "tiered" \
  --hybrid \
  --quantization "fp16,int8,q4_k_m" \
  --dimensions "512,1024,2048" \
  --statistical-test \
  --output "embed-eval-results.json"
```

**Subcommands**:
```bash
# Quick smoke test on single repo
mnemex eval-embed quick --model "qwen3-embedding-8b" --repo ./my-project

# Full benchmark across all configured repos
mnemex eval-embed full --config eval-embed.config.json

# Compare two models with statistical testing
mnemex eval-embed compare --model-a "model1" --model-b "model2" --paired-test

# Generate recommendation report
mnemex eval-embed recommend --constraints "max-cost:0.05,quality-tolerance:0.02"
```

**Output Formats**:
- JSON (machine-readable with full statistics)
- Markdown (human-readable report with tables)
- HTML (interactive charts via Vega-Lite)

---

### Implementation Architecture

**New Module Structure**:
```
src/eval-embed/
├── index.ts              # Main entry point
├── types.ts              # Evaluation-specific types
├── metrics/
│   ├── ndcg.ts           # NDCG@K computation
│   ├── mrr.ts            # MRR computation
│   ├── recall.ts         # Recall@K
│   └── bootstrap.ts      # Confidence intervals
├── negatives/
│   ├── tiered.ts         # Tiered negative selection
│   ├── semantic.ts       # Semantic near-miss detection
│   └── signature.ts      # AST signature similarity
├── hybrid/
│   ├── rrf.ts            # Reciprocal rank fusion
│   └── linear.ts         # Linear combination
├── stats/
│   ├── bootstrap.ts      # Bootstrap CI
│   ├── wilcoxon.ts       # Paired testing
│   └── friedman.ts       # Multi-model testing
├── queries/
│   ├── mixer.ts          # Multi-source query mixing
│   ├── templates.ts      # Template-based generation
│   └── docstring.ts      # Docstring extraction
└── report/
    ├── json.ts
    ├── markdown.ts
    └── html.ts
```

**Database Schema Additions**:
```sql
-- Embedding model evaluation runs
CREATE TABLE embed_eval_runs (
    id TEXT PRIMARY KEY,
    name TEXT,
    started_at TEXT,
    completed_at TEXT,
    config_json TEXT
);

-- Per-model results
CREATE TABLE embed_eval_results (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    model_id TEXT,
    repo_slug TEXT,
    quantization TEXT,
    dimensions INTEGER,
    metric_name TEXT,
    metric_value REAL,
    ci_lower REAL,
    ci_upper REAL,
    sample_size INTEGER
);

-- Per-query detailed results (for statistical testing)
CREATE TABLE embed_eval_query_results (
    run_id TEXT,
    model_id TEXT,
    query_id TEXT,
    target_rank INTEGER,
    target_score REAL,
    is_hit_at_1 BOOLEAN,
    is_hit_at_5 BOOLEAN,
    is_hit_at_10 BOOLEAN
);
```

---

### Key Trade-offs & Decisions

| Decision | Rationale |
|----------|-----------|
| **NDCG@10 as primary** | Academic standard, but MRR also reported for single-target scenarios |
| **Tiered negatives vs. random** | Research shows meaningful differentiation requires ≥0.75 cosine similarity distractors |
| **Cross-model competition** | Eliminates absolute threshold problems; models compete head-to-head |
| **Bootstrap CI over analytic** | Handles non-normal distributions better; standard in NLP benchmarks |
| **Hybrid mandatory** | Real-world usage always uses hybrid; evaluating vector-only is unrealistic |

---

```vote
VERDICT: APPROVE
CONFIDENCE: 9
SUMMARY: Comprehensive tiered-hard-negative evaluation with NDCG@10/MRR metrics, cross-codebase testing via agentbench, hybrid BM25+vector search, quantization/MRL dimension testing, and statistical rigor via bootstrap CI and paired Wilcoxon tests.
KEY_ISSUES: (1) Requires significant implementation effort (~2-3 weeks), (2) Statistical tests need large query sets (400+) for reliable results, (3) Semantic near-miss detection adds compute overhead, (4) Multi-repo testing increases runtime linearly with repo count.
```
