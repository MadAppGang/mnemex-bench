`★ Coaching ────────────────────────────────────`
*Session 93978737...*

1. You read 6 files before delegating to an agent (pre-digestion anti-pattern).
  For investigation tasks, give agents the raw problem -- they investigate independently.
  Pre-digested context reduces multi-model diversity. See: MEMORY.md 'Raw Task vs Pre-Digested Context'

`─────────────────────────────────────────────────`

---

## Embedding Model Evaluation Architecture for mnemex

I'll propose a comprehensive evaluation system that addresses all 9 areas. This is a **design proposal**, not a review — I'm proposing concrete solutions.

---

### 1. Metrics: What to Measure and Why

**Primary Metrics** (reported for every run):

| Metric | K Values | Rationale |
|--------|----------|-----------|
| **NDCG@K** | 1, 5, 10 | Academic standard (CoIR, MTEB). Captures rank position with discount. Primary comparison metric. |
| **MRR** | — | Critical for "single correct answer" retrieval (mnemex's dominant use case: find THE function) |
| **Precision@K** | 1, 3, 5 | Practical: "did user find what they needed on first screen?" P@1 = exact match rate |
| **Win Rate** | — | Cross-model competition: % of queries where this model ranked #1 among all models |

**Secondary Metrics** (optional, for deeper analysis):

| Metric | Purpose |
|--------|---------|
| **Recall@K** | For large repos, measure coverage: did the right answer appear anywhere in top-K? |
| **MAP (Mean Average Precision)** | For multi-relevant queries (same code unit appears multiple times) |
| **Confidence Gap** | Difference between top-1 and top-2 similarity scores — indicates decision certainty |

**Why this combination**:
- NDCG@10 enables comparison with academic benchmarks (CoIR, MTEB)
- MRR aligns with mnemex's "find the one function" use case
- Win Rate enables direct A/B comparison between models on the same queries
- P@1/P@5 are user-meaningful: "first result correct" / "first page correct"

**Implementation**:
```typescript
interface EmbeddingEvalMetrics {
  ndcg: Record<1|5|10, number>;
  mrr: number;
  precision: Record<1|3|5, number>;
  winRate?: number;  // Only when multiple models compete
  recall?: Record<10|20|50, number>;  // Optional for coverage analysis
}
```

---

### 2. Query Design: How to Construct Realistic Test Queries

**The Problem**: Current queries are LLM-generated from code units, which may not match real user search patterns.

**Proposed Solution: Three-Tier Query Mix**

| Tier | Source | % of Queries | Example |
|------|--------|--------------|---------|
| **Human-Written** | Curated from real mnemex usage logs | 20% | "how does authentication work" |
| **LLM-Generated (Diverse)** | Multiple generation strategies | 50% | See below |
| **Template-Based** | Programmatic variations | 30% | "function that {verb} {noun}" |

**LLM Generation Strategies** (diverse query types):

```typescript
const QUERY_GENERATION_STRATEGIES = [
  // Already implemented in benchmark-v2
  { type: "vague", prompt: "Generate a vague query..." },
  { type: "wrong_terminology", prompt: "Use wrong terms..." },
  { type: "specific_behavior", prompt: "Describe the behavior..." },
  { type: "integration", prompt: "How to use this with..." },
  { type: "problem_based", prompt: "I'm trying to solve..." },
  
  // NEW: Add realistic user query patterns
  { type: "doc_conceptual", prompt: "What is X? How does X work?" },
  { type: "doc_api_lookup", prompt: "X parameters, X return type, X signature" },
  { type: "debugging", prompt: "Why does X fail? X error handling" },
  { type: "refactoring", prompt: "Where is X used? Callers of X" },
];
```

**Human Query Collection Mechanism**:
1. Opt-in telemetry: Log anonymized search queries from real mnemex users
2. Manual curation: Create a `human-queries.json` file with ~100 high-quality queries per repo
3. Cross-validation: Use a judge LLM to verify human queries map to correct code units

**Query Quality Validation**:
After generating queries, run a **cross-encoder validation pass**:
- For each query, use a cross-encoder (e.g., `ms-marco-MiniLM-L-12-v2`) to score query vs. target code
- Discard queries with score < 0.7 (ambiguous mappings)
- This filters out low-quality synthetic queries

---

### 3. Hard Negatives: Constructing Challenging Distractors

**The Core Insight** (from research): Same-file and semantic near-miss distractors are the real discriminators. Random cross-file distractors are too easy.

**Proposed Hard Negative Tiers**:

```
Hard Negative Construction (per target code unit):
┌─────────────────────────────────────────────────────────────────┐
│ Tier 1: SAME-FILE (HARDEST)                                     │
│ - Other functions/classes in same file                          │
│ - Same class methods (for method targets)                       │
│ - Difficulty score: 0.9-1.0                                     │
├─────────────────────────────────────────────────────────────────┤
│ Tier 2: SEMANTIC NEAR-MISS (HARD)                               │
│ - Same signature pattern (getUserById vs getUserByEmail)        │
│ - High embedding similarity (0.75-0.95) to target               │
│ - Same module/package                                           │
│ - Difficulty score: 0.7-0.9                                     │
├─────────────────────────────────────────────────────────────────┤
│ Tier 3: CROSS-FILE SIMILAR (MEDIUM)                             │
│ - Same language, similar naming conventions                     │
│ - Moderate embedding similarity (0.5-0.75)                      │
│ - Difficulty score: 0.4-0.7                                     │
├─────────────────────────────────────────────────────────────────┤
│ Tier 4: RANDOM PADDING (EASY)                                   │
│ - Random code from other files/languages                        │
│ - Difficulty score: 0.0-0.4                                     │
│ - Only used to fill pool size                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation**:

```typescript
interface HardNegativeConfig {
  poolSize: number;           // Total distractors (default: 19)
  tierRatios: {
    sameFile: number;         // 0.25 = ~5 same-file
    semanticNearMiss: number; // 0.35 = ~7 semantic
    crossFileSimilar: number; // 0.25 = ~5 cross-file
    randomPadding: number;    // 0.15 = ~3 random
  };
  semanticSimilarityRange: [number, number]; // [0.75, 0.95] for Tier 2
}

function selectHardNegatives(
  target: CodeUnit,
  allUnits: CodeUnit[],
  config: HardNegativeConfig,
  embeddings: Map<string, number[]>,
): DistractorSet {
  // 1. Tier 1: Same-file candidates
  const sameFile = allUnits.filter(u => 
    u.path === target.path && u.id !== target.id
  );
  
  // 2. Tier 2: Semantic near-miss (0.75-0.95 similarity)
  const targetEmb = embeddings.get(target.id);
  const semanticNearMiss = allUnits
    .filter(u => u.id !== target.id && u.language === target.language)
    .map(u => ({
      unit: u,
      similarity: cosineSimilarity(targetEmb, embeddings.get(u.id))
    }))
    .filter(s => s.similarity >= 0.75 && s.similarity < 0.95)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, config.tierRatios.semanticNearMiss * config.poolSize);
    
  // ... continue for other tiers
}
```

**Difficulty Scoring**:
Each distractor set gets a computed `difficultyScore` (0-1) based on the weighted average of tier scores. Report metrics broken down by difficulty level.

---

### 4. Cross-Codebase Testing: Multi-Repo Evaluation

**Minimum Viable**: 3 repos across different languages
**Recommended**: 5-7 repos covering mnemex's target user base
**Ideal**: 12 repos (use existing agentbench infrastructure)

**Proposed Repo Selection**:

| Category | Example Repos | Languages | Why |
|----------|---------------|-----------|-----|
| **TypeScript/JS Web** | `vercel/next.js`, `facebook/react` | TS, JS | Largest mnemex user segment |
| **Python Data/AI** | `huggingface/transformers`, `pytorch/pytorch` | Python | ML/AI developers |
| **Go Systems** | `docker/docker`, `kubernetes/kubernetes` | Go | Infrastructure engineers |
| **Rust Systems** | `rust-lang/rust`, `tokio-rs/tokio` | Rust | Performance-critical code |
| **Multi-Language** | `tensorflow/tensorflow` | C++, Python | Cross-language patterns |

**Aggregation Strategy**:

```typescript
interface MultiRepoResults {
  byRepo: Map<string, EmbeddingEvalMetrics>;
  aggregated: EmbeddingEvalMetrics;
  variance: {
    acrossRepos: number;  // Standard deviation across repos
    byLanguage: Map<string, { mean: number; std: number }>;
  };
  outliers: string[];  // Repos where model over/under-performs
}

function aggregateMultiRepo(results: Map<string, EmbeddingEvalMetrics>): MultiRepoResults {
  // Weighted average by repo size (chunk count)
  const totalChunks = sum([...results.values()].map(r => r.chunkCount));
  
  const aggregated = {
    mrr: weightedAverage(results, r => r.mrr, r => r.chunkCount),
    ndcg10: weightedAverage(results, r => r.ndcg[10], r => r.chunkCount),
    // ...
  };
  
  // Detect model-repo bias: high variance = inconsistent performance
  const variance = computeVariance(results);
  
  return { byRepo: results, aggregated, variance, outliers };
}
```

**Model-Repo Bias Detection**:
Flag models with high cross-repo variance (>0.1 std dev in MRR). A model that wins on Python but loses on TypeScript is risky for general use.

---

### 5. Hybrid Search Testing: BM25 + Vector Combined

**Why**: mnemex uses hybrid search in production. Embedding-only evaluation doesn't reflect actual retrieval.

**Proposed Test Modes**:

| Mode | Description | When to Use |
|------|-------------|-------------|
| **embedding-only** | Pure cosine similarity | Isolate embedding quality |
| **bm25-only** | Pure lexical search | Baseline comparison |
| **hybrid (default)** | BM25 + embedding weighted sum | Production-realistic |
| **reranked** | Embedding retrieval + cross-encoder rerank | Best quality, high latency |

**Hybrid Score Formula**:
```typescript
function hybridScore(
  bm25Score: number,
  embeddingScore: number,
  alpha: number = 0.5  // Weight towards embedding (0 = BM25 only, 1 = embedding only)
): number {
  // Normalize both to [0, 1] range
  const normBM25 = bm25Score / (bm25Score + 1);
  const normEmb = (embeddingScore + 1) / 2;  // Cosine is [-1, 1]
  
  return alpha * normEmb + (1 - alpha) * normBM25;
}
```

**Evaluation Output**:
Report metrics for all 4 modes. The key comparison is `embedding-only` vs `hybrid` — shows how much BM25 helps (or hurts) each model.

---

### 6. Practical Metrics: Latency, Throughput, Cost

**Required Measurements**:

| Metric | How to Measure | Units |
|--------|----------------|-------|
| **Index Latency** | Time to embed all chunks in repo | seconds |
| **Query Latency p50/p95** | Time to embed query + search | milliseconds |
| **Throughput** | Chunks embedded per second | chunks/sec |
| **Memory Peak** | Max RAM during embedding | MB |
| **Cost** | Tokens × price/1M tokens | USD |

**Cost Model**:

```typescript
interface CostProfile {
  provider: 'openrouter' | 'voyage' | 'ollama' | 'lmstudio';
  pricePerMillion: number;
  
  estimateCost(tokens: number): number {
    return (tokens / 1_000_000) * this.pricePerMillion;
  }
}

const COST_PROFILES: Record<string, CostProfile> = {
  'voyage-code-3': { provider: 'voyage', pricePerMillion: 0.18 },
  'qwen3-embedding-8b': { provider: 'openrouter', pricePerMillion: 0.01 },
  'qwen3-embedding:0.6b': { provider: 'ollama', pricePerMillion: 0 },  // Free local
  // ...
};
```

**Quality-Cost Pareto Plot**:
Generate a scatter plot with:
- X-axis: Cost per 1M tokens (log scale)
- Y-axis: MRR or NDCG@10
- Each point = one model
- Identify Pareto frontier (best quality per cost tier)

---

### 7. Quantization and MRL Testing

**Quantization Test Matrix**:

| Quantization | Models to Test | Expected Quality Loss |
|--------------|----------------|----------------------|
| **fp16** (baseline) | All | 0% |
| **Q8_0** | Local models via llama.cpp/ollama | <0.5% |
| **Q4_K_M** | Local models | ~1.5-2% |
| **Q4_0** | Not recommended | ~3-4% |

**MRL Dimension Truncation**:

```typescript
const MRL_DIMENSIONS = [128, 256, 512, 768, 1024, 1536, 2048, 4096];

async function testMRLDimensions(
  model: string,
  fullEmbedding: number[],
  queries: Query[],
  index: VectorIndex,
): Promise<Map<number, EmbeddingEvalMetrics>> {
  const results = new Map();
  
  for (const dim of MRL_DIMENSIONS) {
    if (dim > fullEmbedding.length) continue;
    
    // Truncate embeddings to first N dimensions
    const truncatedEmb = fullEmbedding.slice(0, dim);
    
    // Rebuild index with truncated embeddings
    // Re-run evaluation
    const metrics = await evaluate(index.withTruncatedEmbeddings(dim), queries);
    results.set(dim, metrics);
  }
  
  return results;
}
```

**Output Format**:
```
MRL Dimension Impact (qwen3-embedding-0.6b, native 1024-dim):
  1024-dim: MRR 0.923, P@1 0.889 (baseline)
   512-dim: MRR 0.912, P@1 0.872 (-1.2% MRR)
   256-dim: MRR 0.895, P@1 0.851 (-3.0% MRR)
   128-dim: MRR 0.867, P@1 0.821 (-6.0% MRR)
```

---

### 8. Statistical Rigor: Confidence Intervals and Significance Tests

**Bootstrap Resampling for Confidence Intervals**:

```typescript
function bootstrapCI(
  metrics: EmbeddingEvalMetrics[],
  nSamples: number = 1000,
  confidence: number = 0.95
): { mean: number; ci: [number, number] } {
  const sampleMeans: number[] = [];
  
  for (let i = 0; i < nSamples; i++) {
    // Resample with replacement
    const sample = resampleWithReplacement(metrics);
    sampleMeans.push(mean(sample.map(m => m.mrr)));
  }
  
  sampleMeans.sort((a, b) => a - b);
  
  const alpha = (1 - confidence) / 2;
  const lower = sampleMeans[Math.floor(nSamples * alpha)];
  const upper = sampleMeans[Math.floor(nSamples * (1 - alpha))];
  
  return { mean: mean(sampleMeans), ci: [lower, upper] };
}
```

**Paired Significance Test** (for A/B comparison):

```typescript
function pairedSignificanceTest(
  modelA: EmbeddingEvalMetrics[],
  modelB: EmbeddingEvalMetrics[],
): { significant: boolean; pValue: number; effectSize: number } {
  // Wilcoxon signed-rank test (non-parametric, handles outliers)
  const differences = modelA.map((a, i) => a.mrr - modelB[i].mrr);
  
  const { statistic, pValue } = wilcoxonSignedRank(differences);
  
  // Effect size: Cohen's d
  const effectSize = cohensD(differences);
  
  return {
    significant: pValue < 0.05,
    pValue,
    effectSize
  };
}
```

**Minimum Sample Size Guidance**:
- For reliable CI width < 0.02: need ~300 queries minimum
- For detecting 2% MRR difference with 80% power: need ~200 queries per model
- Current benchmark (296 queries) is borderline adequate

---

### 9. CLI Design: Command Interface

**Core Command**:
```bash
mnemex embed-eval [options]

Options:
  --models <model1,model2,...>   Models to compare (default: all available)
  --repos <path1,path2,...>      Repos to evaluate on (default: current)
  --queries <n>                  Queries per repo (default: 100)
  --mode <mode>                  embedding-only|bm25-only|hybrid|reranked (default: hybrid)
  --output <format>              json|markdown|html (default: markdown)
  --ci                           Include confidence intervals (slower)
  --quantization <q4|q8|fp16>    Test quantization level (local models only)
  --mrl                          Test all MRL dimensions
  --hard-negatives <config>      Hard negative config (default: tiered)
  --cost-profile                 Include cost analysis
  --parallel <n>                 Parallel model evaluations (default: 2)
```

**Example Usage**:
```bash
# Quick comparison of 3 models on current repo
mnemex embed-eval --models qwen3-embedding-0.6b,voyage-code-3,nomic-embed-code

# Full multi-repo evaluation with CI
mnemex embed-eval \
  --models qwen3-embedding-8b,voyage-code-3 \
  --repos ./test/repos/ts-web,./test/repos/python-ml,./test/repos/go-infra \
  --queries 200 \
  --ci \
  --cost-profile \
  --output markdown > eval-report.md

# MRL dimension sweep
mnemex embed-eval --models qwen3-embedding-0.6b --mrl --mode embedding-only
```

**Output Format** (Markdown):
```markdown
# Embedding Model Evaluation Report

## Configuration
- Models: qwen3-embedding-0.6b, voyage-code-3, nomic-embed-code
- Repos: 3 (ts-web, python-ml, go-infra)
- Queries: 600 total (200 per repo)
- Mode: hybrid

## Results

| Model | MRR | P@1 | NDCG@10 | Win Rate | Cost/1M |
|-------|-----|-----|---------|----------|---------|
| voyage-code-3 | **0.942** ± 0.012 | **0.892** | **0.887** | 42% | $0.18 |
| nomic-embed-code | 0.931 ± 0.014 | 0.879 | 0.871 | 35% | Free |
| qwen3-embedding-0.6b | 0.903 ± 0.016 | 0.851 | 0.843 | 23% | Free |

## Statistical Significance
- voyage-code-3 vs qwen3-embedding-0.6b: p=0.003 (**significant**)
- nomic-embed-code vs qwen3-embedding-0.6b: p=0.042 (significant)

## By Repository
| Model | ts-web | python-ml | go-infra | Variance |
|-------|--------|-----------|----------|----------|
| voyage-code-3 | 0.951 | 0.938 | 0.937 | 0.007 |
| nomic-embed-code | 0.942 | 0.921 | 0.930 | 0.011 |
| qwen3-embedding-0.6b | 0.918 | 0.901 | 0.889 | 0.015 |

## MRL Dimensions (qwen3-embedding-0.6b)
| Dim | MRR | Δ vs 1024 |
|-----|-----|-----------|
| 1024 | 0.903 | baseline |
| 512 | 0.891 | -1.3% |
| 256 | 0.872 | -3.4% |
```

**Feature Tiers**:

| Tier | Features |
|------|----------|
| **Core (MVP)** | Multi-model comparison, MRR/P@K/NDCG, multi-repo, hybrid mode |
| **Standard** | + CI/bootstrap, cost analysis, hard negative tiers |
| **Advanced** | + MRL dimension sweep, quantization testing, Pareto plots |
| **Research** | + Cross-encoder reranking, online metric proxies |

---

```vote
VERDICT: APPROVE
CONFIDENCE: 8
SUMMARY: Comprehensive evaluation system with tiered hard negatives, multi-repo testing, hybrid search modes, cost analysis, MRL/quantization testing, and statistical rigor.
KEY_ISSUES: (1) Human query collection requires opt-in telemetry infrastructure not yet built; (2) Cross-encoder validation pass adds latency to evaluation; (3) 12-repo agentbench integration requires additional plumbing; (4) Minimum 300 queries per repo for tight CI may be expensive for cloud APIs.
```
