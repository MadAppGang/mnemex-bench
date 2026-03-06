## Your Role
You are an **Embedding Evaluation Architect** — expert in information retrieval benchmarking, code search, and embedding model comparison.

---

## Team Vote: Independent Architecture Proposal

You are reviewing and improving the embedding model evaluation system for **claudemem**, a semantic code search tool. Each team member independently proposes their own improvements. This is NOT a review of existing code quality — you DESIGN a better evaluation methodology.

### What claudemem Does

claudemem indexes codebases for semantic search. The embedding model is critical infrastructure:
1. **Embed** — convert code chunks + summaries to vectors
2. **Index** — store in LanceDB (local) or pgvector (shared)
3. **Search** — vector similarity + BM25 hybrid search
4. **Rerank** — LLM re-orders results

### Current Evaluation (benchmark-v2)

The current system evaluates LLM *generators* (which LLM writes the best code summaries), using the embedding model as fixed infrastructure. It was NOT designed to compare embedding models.

**Current approach for embedding comparison** (quick hack):
1. Take existing summaries + queries from a previous benchmark run
2. Re-embed all summaries with each candidate embedding model
3. For each query, embed query + find nearest summary via cosine similarity
4. Measure P@1, P@5, MRR

**Problems identified:**
1. Single codebase (claudemem itself) — no cross-repo generalization
2. MTEB/CoIR rankings don't match our results (qwen3-0.6b is MTEB-Code #1 but ranks 8th in our test)
3. Queries are LLM-generated from code units — may not match real user queries
4. No statistical significance testing
5. No hard negative difficulty control
6. No latency/throughput/cost evaluation
7. No quantization impact testing
8. No hybrid search testing (BM25 + vector combined)

### Research Findings (from web exploration)

**Key finding 1**: MTEB scores correlate poorly with real code search (24%+ relative gap between MTEB rank and production retrieval).

**Key finding 2**: Code-specialized models beat general models. A 0.5B code specialist beats a 3.8B general model on CoIR.

**Key finding 3**: Hard negative construction matters most. Same-file distractors are harder than random cross-file distractors. Semantic near-misses (e.g., `getUserById` vs `getUserByEmail`) are the real discriminator.

**Key finding 4**: Cross-codebase generalization is critical — models that win on one repo often lose on another. Minimum 3 repos across different languages.

**Key finding 5**: MRL (Matryoshka) enables 75% storage reduction with ~2-3% quality loss. Should be tested at multiple dimensions.

### Available Test Infrastructure

- **agentbench**: 12 pre-indexed repos (Go, Python, TypeScript, Rust, Java, etc.)
- **LM Studio**: Local embedding models via OpenAI-compatible API at localhost:1234
- **Ollama**: Local embedding models
- **Cloud APIs**: Voyage AI, OpenRouter
- **benchmark.db**: SQLite with existing summaries, queries, evaluation results

### Your Assignment

Design a comprehensive **embedding model evaluation system** for claudemem. Specifically:

1. **Metrics**: Which metrics should we use? (P@K, MRR, NDCG@K, MAP, Recall@K?) At what K values? Why?

2. **Query Design**: How should test queries be constructed? Human-written? LLM-generated? Templates? Mix? How to ensure they match real usage?

3. **Hard Negatives**: How to construct challenging distractors? Same-file? Same-class? Semantic near-misses?

4. **Cross-Codebase Testing**: How many repos? Which languages? How to aggregate results? How to detect model-repo-specific biases?

5. **Hybrid Search**: Should we test embedding-only vs BM25+embedding? How?

6. **Practical Metrics**: Latency, throughput (chunks/sec), memory, cost. How to weight vs quality?

7. **Quantization Testing**: 4-bit vs 8-bit vs fp16. MRL dimension reduction. How to measure quality degradation?

8. **Statistical Rigor**: Confidence intervals, bootstrap resampling, paired significance tests?

9. **CLI Design**: What should the command look like? Which features are core vs optional CLI flags?

Be creative. Don't just list problems — propose CONCRETE solutions with implementation details.

### Required Vote Format

End your response with a vote block rating YOUR OWN confidence in your design:

```vote
VERDICT: APPROVE
CONFIDENCE: [1-10]
SUMMARY: [One sentence describing your design approach]
KEY_ISSUES: [Any trade-offs or limitations of your approach]
```
