★ Coaching ────────────────────────────────────
*Session 93978737...*

1. You read 6 files before delegating to an agent (pre-digestion anti-pattern).
  For investigation tasks, give agents the raw problem -- they investigate independently.
  Pre-digested context reduces multi-model diversity. See: MEMORY.md 'Raw Task vs Pre-Digested Context'

`─────────────────────────────────────────────────`

# Embedding Model Evaluation System Design for mnemex

## Executive Summary

The current benchmark-v2 system evaluates LLM *generators* (summaries), treating the embedding model as fixed infrastructure. This design inverts that — we evaluate *embedding models* as the primary subject, using mnemex's existing summary/query infrastructure as the test harness.

---

## 1. Metrics: NDCG@10 as Primary, MRR/P@K as Secondary

**Recommendation:**
- **Primary**: `NDCG@10` — industry standard, accounts for rank position
- **Secondary**: `MRR` (single-target retrieval), `P@1`, `P@5`, `P@10`
- **Added**: `Win Rate` (cross-model competition — what % of queries does model X rank #1?)

**K Values**: 1, 3, 5, 10

**Rationale**: Research confirms NDCG@10 is the dominant metric in CoIR, MTEB, and CodeSearchNet. MRR is valuable for single-target queries (typical in code search: "find the function that does X"). P@1 matters for "top result must be correct" UX.

**Implementation**:
```typescript
// In retrieval evaluator, add NDCG calculation
function ndcgAtK(results: RetrievedResult[], k: number): number {
  const dcg = results.slice(0, k).reduce((sum, r, i) => 
    sum + (r.isRelevant ? 1 / Math.log2(i + 2) : 0), 0);
  const idcg = results.slice(0, k).reduce((sum, _, i) => 
    sum + 1 / Math.log2(i + 2), 0);
  return idcg > 0 ? dcg / idcg : 0;
}
```

---

## 2. Query Design: Tri-Source Query Construction

**Recommendation**: Use three query sources to ensure broad coverage:

| Source | Weight | Description |
|--------|--------|-------------|
| Human-written | 30% | CodeSearchNet-style docstrings (from benchmark extraction) |
| LLM-generated | 50% | Current approach — functional/behavioral queries |
| Template-based | 20% | Fixed patterns: `"Find function that {verb} {noun}"` |

**Query Types to Include**:
- `functional`: "calculates Fibonacci numbers"
- `behavioral`: "handles authentication errors"
- `api_usage`: "How do I call the resize method?"
- `problem_based`: "I need to parse CSV files"
- `vague`: "data processing" (tests semantic robustness)

**Real User Query Integration**: Log actual `mnemex search` queries (opt-in via `mnemex telemetry`) and replay them in evaluation.

---

## 3. Hard Negatives: Tiered Difficulty Construction

**Recommendation**: Implement 4-tier hard negative selection:

| Tier | Description | Difficulty |
|------|-------------|------------|
| T1-SameFile | Other functions in same file | Hardest |
| T2-SameClass | Functions with same class/interface | Hard |
| T3-Semantic | Cosine similarity 0.75-0.95 | Medium-Hard |
| T4-Random | Different files, random selection | Easy |

**Critical Fix**: Current code (in `contrastive/index.ts`) uses similarity filter `0.5-0.95` which *excludes* the hardest negatives (0.85-0.95 range). Fix to `0.75-0.98`.

**Distractor Count**: 9 per target (industry standard for contrastive eval)

**Difficulty Labeling**: Each distractor set gets a difficulty label (`easy`/`medium`/`hard`) based on T1/T2 count.

---

## 4. Cross-Codebase Testing: Agentbench Integration

**Recommendation**: Leverage existing agentbench infrastructure (12 repos, 2 instances each = 24 test cases per model)

**Repository Selection** (minimum 3-4 for evaluation):
1. **TypeScript/JS**: `react` or `vscode` (large, mature)
2. **Python**: `transformers` or `fastapi` (widely used)
3. **Go**: `kubernetes` or `terraform` (infrastructure)
4. **Rust**: `tokio` or `ripgrep` (systems code)

**Aggregation Strategy**:
```typescript
interface CrossRepoResults {
  perRepo: Map<string, { ndcg: number, mrr: number, p1: number }>;
  // Language-weighted average (if user primarily searches TS, weight TS higher)
  languageWeighted: Map<string, number>;
  // Unweighted average across all repos
  unweightedAverage: { ndcg: number, mrr: number };
  // Variance detection
  variance: { modelId: string, stdDev: number }; // High variance = repo-specific bias
}
```

**Bias Detection**: Flag models that win on 1-2 repos but lose on others (variance > 0.05 NDCG points).

---

## 5. Hybrid Search: Embedding + BM25 Combination

**Recommendation**: Test 4 configurations:

| Config | Vector Weight | BM25 Weight | Description |
|--------|---------------|-------------|-------------|
| `vector-only` | 1.0 | 0.0 | Current default |
| `bm25-only` | 0.0 | 1.0 | Baseline |
| `hybrid-balanced` | 0.5 | 0.5 | Equal weight |
| `hybrid-vector-heavy` | 0.7 | 0.3 | Vector-first |

**Implementation**: Use LanceDB's hybrid search or implement in retrieval evaluator:
```typescript
function hybridScore(vectorScore: number, bm25Score: number, vectorWeight: number): number {
  return vectorWeight * vectorScore + (1 - vectorWeight) * bm25Score;
}
```

**When to Use Hybrid**: For queries with exact-match terms (function names, parameters), BM25 helps. For vague behavioral queries, vector wins.

---

## 6. Practical Metrics: Latency, Throughput, Cost, Memory

**Recommendation**: Add operational metrics alongside quality metrics:

| Metric | Measurement | Target |
|--------|-------------|--------|
| **p50 latency** | Time to embed 1 query | < 100ms (local), < 500ms (API) |
| **p95 latency** | Time to embed 1 query | < 500ms (local), < 2s (API) |
| **Index throughput** | Chunks/second | > 100 chunks/sec (local) |
| **Cost** | $/1M tokens | Track per-model |
| **Memory** | RAM usage (GB) | < 4GB for local models |
| **Index size** | LanceDB file size | Per-dimension |

**CLI Output**:
```
Model          | Quality (NDCG@10) | Latency (p95) | Cost/1M   | Index Size
---------------+-------------------+---------------+-----------+------------
voyage-code-3  | 0.82              | 245ms         | $0.18     | 5.2MB
qwen3-embed-8b | 0.76              | 890ms         | $0.01     | 20.8MB
jina-code-0.5b| 0.78              | 180ms         | (local)   | 3.1MB
```

---

## 7. Quantization Testing: MRL + Quantization Matrix

**Recommendation**: Test each model across dimension/quantization matrix:

| Dimension | Quantization | Expected Quality Loss |
|-----------|-------------|---------------------|
| Native (e.g., 1024) | fp16 | Baseline |
| 512 | fp16 | ~2-3% |
| 256 | fp16 | ~5-8% |
| 512 | Q8 | ~1-2% additional |
| 256 | Q4_K_M | ~3-4% additional |

**MRL Implementation**: Truncate embedding vector at dimension N (first N dimensions). LanceDB supports variable-dimension vectors.

**Quantization**: For local models (Ollama/LM Studio), test Q4 vs Q8 vs fp16.

**Output**: Quality vs. Storage Pareto frontier for each model.

---

## 8. Statistical Rigor: Bootstrap + Paired Tests

**Recommendation**: Implement statistical testing to validate ranking differences:

| Test | Purpose | Threshold |
|------|---------|-----------|
| **Bootstrap CI** | 95% confidence interval for NDCG/MRR | Report CI, not just point estimate |
| **Paired t-test** | Model A vs Model B significance | p < 0.05 = significant |
| **Effect size** | Cohen's d for practical significance | d > 0.5 = meaningful |

**Implementation**:
```typescript
function bootstrapCI(scores: number[], nResamples: number = 1000): [number, number] {
  const means: number[] = [];
  for (let i = 0; i < nResamples; i++) {
    const sample = scores.filter(() => Math.random() < 0.5);
    means.push(mean(sample));
  }
  return [percentile(means, 2.5), percentile(means, 97.5)];
}

function pairedTTest(modelAScores: number[], modelBScores: number[]): { t: number, p: number } {
  // Standard paired t-test implementation
}
```

**Minimum Sample Size**: For reliable significance, need ≥100 queries per repo. Current: 296 queries (sufficient).

---

## 9. CLI Design: `mnemex eval:embeddings`

**Recommendation**: New command structure:

```bash
# Core evaluation (all models, single repo)
mnemex eval:embeddings --models voyage-code-3,qwen3-embed-8b

# Cross-repo evaluation (uses agentbench infrastructure)
mnemex eval:embeddings --cross-repo --repos react,transformers,kubernetes

# Hybrid search comparison
mnemex eval:embeddings --hybrid --weights 0.5,0.7

# Quantization/MRL testing
mnemex eval:embeddings --dimensions 1024,512,256 --quantization fp16,q4

# Full benchmark with all features
mnemex eval:embeddings \
  --models voyage-code-3,qwen3-embed-8b,jina-code-0.5b \
  --cross-repo \
  --hybrid \
  --dimensions 1024,512 \
  --output eval-results.json
```

**Flags**:
- `--models` (required): Comma-separated model IDs
- `--cross-repo`: Run on agentbench repos (default: current repo)
- `--repos`: Specific repos for cross-repo eval
- `--hybrid`: Test vector+BM25 combinations
- `--weights`: Vector/BM25 weights to test
- `--dimensions`: MRL dimensions to test
- `--quantization`: Quantization levels
- `--output`: JSON/Markdown output path
- `--agent`: Machine-parseable output

**Output Formats**:
- Markdown table (default)
- JSON (with full statistics, CIs, per-repo breakdown)
- CSV (for external analysis)

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Add NDCG@10 to existing retrieval evaluator | 1 day | High |
| 2 | Fix hard negative similarity filter (0.75-0.98) | 1 hour | High |
| 3 | Cross-repo eval using agentbench | 2 days | High |
| 4 | Statistical significance (bootstrap CI) | 1 day | Medium |
| 5 | Hybrid search testing | 2 days | Medium |
| 6 | Practical metrics (latency/cost) | 1 day | Medium |
| 7 | Quantization/MRL testing | 2 days | Low-Medium |
| 8 | Tri-source query construction | 3 days | Low |

---

## Vote

```vote
VERDICT: APPROVE
CONFIDENCE: 9
SUMMARY: Design uses NDCG@10 as primary metric with MRR/P@K secondary, tri-source query construction, tiered hard negatives with fixed similarity range, agentbench integration for cross-repo testing, hybrid search comparison, practical latency/cost tracking, MRL/quantization matrix testing, and bootstrap statistical rigor. The CLI exposes all features through a clean `eval:embeddings` command.
KEY_ISSUES: Cross-repo evaluation requires agentbench repo indexing (one-time cost); statistical significance needs ≥100 queries per repo (current 296 is sufficient); hybrid search requires BM25 index alongside vector index (adds complexity).
```
