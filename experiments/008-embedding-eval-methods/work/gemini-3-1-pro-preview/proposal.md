`★ Coaching ────────────────────────────────────`
*Session 93978737...*

1. You read 6 files before delegating to an agent (pre-digestion anti-pattern).
  For investigation tasks, give agents the raw problem -- they investigate independently.
  Pre-digested context reduces multi-model diversity. See: MEMORY.md 'Raw Task vs Pre-Digested Context'

`─────────────────────────────────────────────────`

Here is my independent architecture proposal for the `claudemem` embedding model evaluation system.

## claudemem Embedding Evaluation Architecture (v3)

To move beyond the flawed single-codebase LLM-summary evaluation, we need a system optimized specifically for testing embedding representations of code across realistic conditions.

### 1. Metrics
*   **Primary Metric: NDCG@10**. Industry standard for code retrieval (CoIR, MTEB). It heavily penalizes models that bury the correct code chunk beneath similar-sounding distractors.
*   **Secondary Metrics: MRR and Precision@1/5**. MRR is highly interpretable for "exact match" code-to-function searches, while P@1/5 maps directly to the user experience in the `claudemem` TUI (what fits on the first screen).
*   **Implementation**: Treat evaluation as binary relevance for MRR/P@K, but use graded relevance for NDCG if partial matches (e.g., an interface vs. implementation) are identified.

### 2. Query Design (The Hybrid Corpus)
Relying solely on LLM-generated summaries is flawed. We will build a hybrid evaluation corpus:
*   **Docstring Extraction (CodeSearchNet style)**: Extract high-quality human-written docstrings from the 12 `agentbench` repos. Strip them from the indexed code chunk, and use the docstring as the query.
*   **Cross-Encoder Validated Synthetic Queries**: Generate "How do I..." and "Where is the..." queries using a strong LLM (e.g., Claude 3.5 Sonnet). *Crucially*, validate these queries by scoring them against the target code using a cross-encoder (like `ms-marco-MiniLM-L-12-v2`). Discard any synthetic queries that the cross-encoder scores low. This ensures query validity.

### 3. Hard Negatives
Instead of relying only on random in-corpus negatives, we will construct explicit distractor tiers for a subset of queries to test model discrimination:
*   **Tier 1 (Lexical Traps)**: Functions with overlapping BM25 terms but entirely different semantics.
*   **Tier 2 (Structural Traps)**: Same-file / Same-class distractors (e.g., `getUserById` vs `getUserByEmail`).
*   **Tier 3 (Semantic Near-Misses)**: Use a strong baseline embedding model (like `voyage-code-3`) to pre-compute the top 50 nearest neighbors for the target, strip the target, and force the candidate models to rank the target against these known high-similarity distractors.

### 4. Cross-Codebase Testing
*   **Corpus**: Utilize the 12 existing `agentbench` repositories (spanning TS, Python, Go, Rust, Java).
*   **Aggregation**: Report an **Average NDCG@10** across all repos, but also report a **Win-Rate matrix** (Model A vs Model B on per-repo basis).
*   **Bias Detection**: Track standard deviation of NDCG across languages to penalize models that overfit to Python/TS at the expense of Rust/Go.

### 5. Hybrid Search Evaluation
*   Test embedding-only vs. BM25-only vs. **Hybrid (RRF - Reciprocal Rank Fusion)**.
*   This determines if a cheap local model (e.g., `qwen3-0.6b` + BM25) can match an expensive API model (`voyage-code-3` alone).

### 6. Practical Metrics (The Pareto Frontier)
Code search is interactive. Quality must be weighed against operational realities.
*   **Measurements**: Indexing throughput (chunks/sec), p50/p95 Query latency (ms, including HTTP overhead), Memory footprint (MB), Cost ($/1M tokens).
*   **Output**: Generate a 2D scatter plot (CLI ASCII or markdown) of **NDCG@10 vs. Latency/Cost**.

### 7. Quantization & MRL Testing
*   **MRL Sweeps**: For models supporting Matryoshka Representation Learning (Qwen3, Jina, Nomic), evaluate at dimensions `256, 512, 1024, native`.
*   **Quantization**: Test `fp16` against `Q8_0` and `Q4_K_M` (for Ollama/LM Studio local targets).
*   Report the precise degradation curve (e.g., "512-dim Q4 saves 87% storage for a 3.5% NDCG drop").

### 8. Statistical Rigor
*   **Paired Bootstrap Resampling**: Resample the query set 1,000 times with replacement. Calculate the NDCG@10 difference between Model A and Model B for each resample to generate a 95% Confidence Interval.
*   If the CI crosses 0, the models are a statistical tie.

### 9. CLI Design
The CLI should separate dataset compilation from evaluation to allow rapid iterative testing.

```bash
# 1. Compile the test dataset across the 12 repos
claudemem eval-build --repos agentbench-all --out benchmark-v3.db

# 2. Run the evaluation
claudemem eval-embed \
  --db benchmark-v3.db \
  --models voyage-code-3,ollama/qwen3-embedding:0.6b \
  --hybrid-bm25 true \
  --mrl 512,1024 \
  --bootstrap 1000

# 3. Output
# Yields a markdown table with NDCG@10, 95% CI, Latency (ms/batch), Cost, and Storage (MB/10k chunks).
```

```vote
VERDICT: APPROVE
CONFIDENCE: 9
SUMMARY: A rigorous, multi-repo embedding evaluation framework using NDCG@10, cross-encoder validated hybrid queries, explicit semantic hard negatives, and practical Pareto frontiers (Cost/Latency/Storage via MRL).
KEY_ISSUES: Requires up-front computational cost to generate cross-encoder validated synthetic queries and pre-compute semantic near-miss distractors across the 12 agentbench repositories.
```
