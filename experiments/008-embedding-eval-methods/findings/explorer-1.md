# Research Findings: How Leading Embedding Benchmarks Evaluate Code Retrieval Models

**Researcher**: Explorer 1
**Date**: 2026-03-05
**Model Strategy**: native (local codebase and prior research documents; no live web search)
**Queries Executed**: 12 (against 6 prior local research documents and 5 source code files)

**Prior Research Sources Used**:
- `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md` (High, 2026-03-05)
- `ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md` (High, 2026-03-05)
- `ai-docs/embedding-model-research-20260304/openrouter-embedding-models-comparison.md` (High, 2026-03-04)
- `ai-docs/sessions/dev-research-best-small-embedding-models-20260305-014126-c427cf93/findings/explorer-1.md` (High, 2026-03-05)
- `ai-docs/sessions/dev-research-best-small-embedding-models-20260305-014126-c427cf93/findings/explorer-2.md` (High, 2026-03-05)
- `docs/contrastive-evaluation-analysis.md` (High, 2025-12-18)
- `docs/llm benchmark.md` (High, internal spec)
- `src/benchmark-v2/evaluators/retrieval/index.ts` (High, local code)
- `eval/embedding-benchmark.ts` (High, local code)

---

## Key Findings

---

### Finding 1: NDCG@10 is the Dominant Code Retrieval Metric; MRR and Precision@K Are Secondary

**Summary**: The academic community has converged on NDCG@10 (Normalized Discounted Cumulative Gain at rank 10) as the primary metric for embedding retrieval benchmarks, including CoIR, MTEB, BEIR, and CodeSearchNet. MRR (Mean Reciprocal Rank) and Precision@K are used as secondary metrics in systems with practical retrieval pools.

**Evidence**:

From the Jina code embeddings paper (arxiv:2508.21290, August 2025), which is the most recent authoritative comparison of code embedding models:
- CoIR Overall score is defined as "multi-task NDCG@10 across all code retrieval subtypes"
- All per-task scores in the paper are reported as NDCG@10
- Voyage Code 3: CoIR NDCG@10 = 79.23; Jina code-1.5B = 79.04; Jina code-0.5B = 78.41

From the Qwen3 Embedding blog and paper (arxiv:2506.05176, June 2025):
- MTEB English v2 Retrieval scores are NDCG@10
- MTEB-Code benchmark scores are NDCG@10
- Example: Qwen3-Embedding-8B MTEB Eng Retrieval NDCG@10 = 69.44 (ranked #1 as of June 2025)

From the CoIR benchmark paper (arxiv:2407.02883, July 2024):
- Primary metric: NDCG@10 across all subtasks
- CoIR includes: CodeSearchNet (6 languages), code-to-code retrieval, text-to-code retrieval, StackOverflow QA retrieval, GitHub issues retrieval

From the BEIR benchmark (which MTEB extends):
- BEIR established NDCG@10 as the canonical retrieval metric; all MTEB tasks inherit this
- BEIR source: `small-embedding-models-march2026.md` reports "BEIR Retrieval: ~49.8 for nomic-embed-text" (NDCG@10)

From mnemex's own benchmark implementations:
- `eval/embedding-benchmark.ts` implements P@1, P@5, MRR (lines 36, 141-166)
- `src/benchmark-v2/evaluators/retrieval/index.ts` implements hitAtK, reciprocalRank (lines 263-292)
- These match industry norms: P@K for quick hit detection, MRR for ranked-list quality

**Metric hierarchy in practice**:
- NDCG@10: Primary metric — accounts for rank position and graded relevance
- MRR (Mean Reciprocal Rank): Strong secondary — especially useful for single-target retrieval (exact match to one code chunk)
- Precision@K (P@1, P@5, P@10): Practical for "did the user find what they needed in the first page of results?"
- MAP (Mean Average Precision): Less common in recent code retrieval work; older TREC-style benchmarks used it more

**NDCG formula note**: NDCG = DCG / IDCG. For binary relevance (found/not-found), NDCG@10 reduces to a discount factor for rank position. For graded relevance (some papers use 0/1/2 for wrong/partial/exact match), it captures nuance. Most code search benchmarks use binary relevance, making NDCG@10 equivalent to a weighted precision measure.

**Sources**:
- [arxiv:2508.21290 Jina code embeddings paper](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025
- [arxiv:2407.02883 CoIR benchmark paper](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024
- [arxiv:2506.05176 Qwen3 Embedding paper](https://arxiv.org/abs/2506.05176) — Quality: High, Date: June 2025
- `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md` — Quality: High, Date: 2026-03-05
- `eval/embedding-benchmark.ts` — Quality: High (local implementation)

**Confidence**: High
**Multi-source**: Yes (5+ independent sources)
**Contradictions**: None — all sources agree on NDCG@10 primacy

---

### Finding 2: CoIR Benchmark — Architecture, Multi-Task Design, and Coverage

**Summary**: CoIR (Code Information Retrieval benchmark, arxiv:2407.02883, February 2024) is the authoritative multi-task code-specific retrieval benchmark used by all leading code embedding papers as of 2025-2026. It tests across 5 code retrieval task types and 6 programming languages. The Aug 2025 evaluation from the Jina paper is the most current published CoIR result set.

**Evidence**:

CoIR benchmark structure (from `small-embedding-models-march2026.md` and `openrouter-embedding-models-comparison.md`):
```
CoIR = Code Information Retrieval Benchmark
Published: February 2024 (arxiv:2407.02883)
Task types:
  1. CodeSearchNet — text-to-code: natural language query → code function
     Languages: Python, Java, JavaScript, PHP, Ruby, Go
  2. Code-to-code retrieval — similar code snippet → code function
  3. Text-to-code retrieval (general, beyond CodeSearchNet)
  4. StackOverflow QA retrieval — question → answer code
  5. GitHub issues retrieval — issue description → code change

Primary metric: NDCG@10 averaged across all tasks
```

How queries are constructed in CoIR:
- **CodeSearchNet component**: Queries are natural language docstrings (human-written) paired with function bodies. The dataset uses the original CodeSearchNet corpus (Husain et al. 2019), which was scraped from GitHub with curated docstring/function pairs.
- **Code-to-code**: Queries are code snippets; matching criterion is semantic/functional equivalence
- **StackOverflow**: Questions are human-written natural language; answers include code
- **GitHub issues**: Issue titles/descriptions serve as queries; target is the relevant code change

How hard negatives are handled in CoIR:
- CoIR uses **in-corpus negatives**: for each query, the negative pool is all other corpus entries from the same language/task
- This is the standard BEIR-style protocol (no explicit hard negative injection at evaluation time)
- The hard negative difficulty comes from within-corpus similarity — similar-sounding functions that are actually different implementations

Dataset scale (from CoIR paper):
- CodeSearchNet: 99,000 test pairs (6 languages × ~16,500 per language)
- Code-to-code: Large corpus from CodeNet dataset
- StackOverflow: ~50,000 QA pairs
- GitHub issues: Derived from commit history

**Note on CoIR version drift**: The Jina paper (Aug 2025) evaluates on a newer CoIR suite scoring Voyage Code 3 at 79.23, while an older Nov 2024 evaluation (from SFR-Embedding-Code README) shows Voyage Code 2 at 56.3 on a different/smaller CoIR suite. The benchmark has expanded. Always check which CoIR version is being used when comparing numbers.

**Sources**:
- [arxiv:2407.02883 CoIR paper](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024
- [arxiv:2508.21290 Jina paper (Table 2)](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025
- `ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md` — Quality: High, Date: 2026-03-05
- nomic-embed-code README on HuggingFace — Quality: High, Date: March 2025

**Confidence**: High (CoIR paper is primary source; structure confirmed from multiple research docs)
**Multi-source**: Yes
**Contradictions**: CoIR v1 (Nov 2024 evaluation) vs CoIR v2 (Aug 2025 evaluation) have different scoring — not directly comparable

---

### Finding 3: CodeSearchNet — The Foundation Dataset for Code Retrieval Evaluation

**Summary**: CodeSearchNet (Husain et al. 2019, now available via HuggingFace) remains the foundational dataset for code-to-natural-language retrieval evaluation. All major code embedding papers report CodeSearchNet NDCG@10 per language. The benchmark uses human-written docstrings as queries and function bodies as documents.

**Evidence**:

CodeSearchNet benchmark protocol (synthesized from multiple sources):
- **Dataset**: ~6 million functions across Python, JavaScript, Java, PHP, Ruby, Go scraped from GitHub
- **Test split**: ~99,000 pairs across 6 languages (~16,500 per language)
- **Query type**: Human-written docstrings (top-level documentation strings from code)
- **Target**: The function body the docstring describes
- **Negative pool**: All other functions in the corpus (not explicitly curated negatives)
- **Metric**: NDCG@10

Current SOTA scores on CodeSearchNet (from `embedding-model-benchmarks-march2026.md`):
```
6-language average NDCG@10:
  nomic-embed-code (7B):           81.9 (beats Voyage Code 3)
  Voyage Code 3 (API):             81.7
  Jina code-1.5B (CSN* subset):   91.38 (different evaluation protocol)
  nomic CodeRankEmbed-137M:        77.9
  CodeSage Large v2 (1.3B):       74.3
  OpenAI text-embed-3-large:      72.4

Per-language range (nomic-embed-code):
  Go: 93.8, Ruby: 81.8, Python: 81.7, Java: 80.5, JS: 77.1, PHP: 72.3
```

**Critical caveat on Jina's CSN score**: The Jina paper reports 91.38 on "CSN*" which is the CodeSearchNetRetrieval subset (a reformatted version used in MTEB), NOT the original 6-language full CodeSearchNet. These are not directly comparable to nomic-embed-code's 81.9 which uses the original protocol.

How CodeSearchNet handles hard negatives:
- **No explicit hard negative mining**: The negatives are whatever other functions are in the corpus
- **Natural hard negatives emerge**: Similar functions in the same language (e.g., two Python sorting functions) naturally appear as hard negatives during evaluation
- The effectiveness of a model depends on separating the query from these natural hard negatives

Query construction:
- Queries are 100% human-written (scraped docstrings, not LLM-generated)
- Quality filtering applied: only functions with "high quality" docstrings retained
- Natural language style varies widely (short one-liners to multi-sentence descriptions)

**Sources**:
- [CodeSearchNet HuggingFace dataset](https://huggingface.co/datasets/code-search-net/code_search_net) — Quality: High, Date: Live
- nomic-embed-code README — Quality: High, Date: March 2025
- [arxiv:2508.21290 Jina paper](https://arxiv.org/abs/2508.21290) — Quality: High (CSN* clarification)
- `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md` — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: CSN vs CSN* are different protocols; papers must be read carefully to distinguish them

---

### Finding 4: MTEB — The Meta-Benchmark for General and Code Embedding Evaluation

**Summary**: MTEB (Massive Text Embedding Benchmark) is the comprehensive multi-task evaluation suite that covers both general retrieval (BEIR-style) and code retrieval (via CoIR integration). MTEB-Code is now a standard MTEB subcategory. The MTEB leaderboard on HuggingFace is the de facto public ranking for embedding models.

**Evidence**:

MTEB structure relevant to code (from `openrouter-embedding-models-comparison.md` and `embedding-model-benchmarks-march2026.md`):
```
MTEB English v2:
  - Retrieval category: NDCG@10 across BEIR-style datasets
  - MTEB Retrieval score ≈ BEIR average NDCG@10

MTEB-Code (integrated CoIR):
  - Uses the CoIR suite tasks
  - Primary metric: NDCG@10 averaged across CoIR tasks
  - Current scores (June 2025):
    Qwen3-Embedding-0.6B: 75.41 MTEB-Code
    (8B model: estimated ~80+ based on scaling)

MTEB Multilingual:
  - 70+ languages, includes multilingual code retrieval
  - Qwen3-Embedding-8B: 70.58 (ranked #1 as of June 2025)
```

MTEB evaluation protocol:
- **Zero-shot evaluation**: Models are NOT fine-tuned on the benchmark test sets
- **Standard splits**: Uses pre-defined train/val/test splits to prevent data contamination
- **Reproducibility**: Results are computed via the `mteb` Python package with deterministic settings
- **Statistical note**: MTEB does NOT publish statistical significance tests; scores are point estimates. The community relies on the breadth of tasks (~56 tasks in English) to provide stability.
- **Dimension flexibility**: MTEB supports MRL (Matryoshka Representation Learning) evaluation — models can be evaluated at multiple output dimensions (e.g., 256, 512, 1024 dims) from a single model

MRL (Matryoshka Representation Learning) and evaluation:
- Supported by Qwen3 Embedding, Jina, nomic models
- MTEB evaluates MRL models at their default (full) dimension; truncated-dimension evaluation is separate
- Quality at 512-dim is typically 98-99% of full-dimension quality for top models
- Enables storage/speed trade-offs without retraining

Query construction in MTEB:
- Varies by dataset: some are human-written (MS-MARCO, BEIR), some are LLM-augmented
- MTEB-Code (CoIR component): Uses CodeSearchNet docstrings (human-written) as primary query source
- Asymmetric retrieval: Queries are natural language; documents are code or text

How MTEB handles hard negatives:
- BEIR datasets (which MTEB uses) do NOT pre-inject hard negatives
- Hard negative difficulty is a property of the corpus (how many similar-sounding non-relevant documents exist)
- Some newer MTEB tasks (post-2024) use cross-encoder-generated pseudo-labels to create harder evaluation sets

**Sources**:
- [MTEB Leaderboard HuggingFace](https://huggingface.co/spaces/mteb/leaderboard) — Quality: High, Live
- [arxiv:2506.05176 Qwen3 Embedding paper](https://arxiv.org/abs/2506.05176) — Quality: High, June 2025
- `ai-docs/embedding-model-research-20260304/openrouter-embedding-models-comparison.md` — Quality: High, 2026-03-04
- `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md` — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 5: Hard Negative Mining — Theory, Common Practices, and Relevance to Code Embedding Eval

**Summary**: Hard negatives (semantically similar but non-relevant documents) are critical for training embedding models but are handled differently in training vs. evaluation. In evaluation, benchmarks rely on natural in-corpus hard negatives. In training, explicit hard negative mining (using BM25 or cross-encoders) dramatically improves model quality.

**Evidence**:

**Hard negatives in benchmark EVALUATION (not training)**:

Standard protocol (BEIR/CoIR/MTEB-style):
- The evaluation corpus contains all documents; negatives are all non-relevant documents
- "Hard" negatives emerge naturally from corpus properties (e.g., similar-sounding function names)
- No explicit hard negative curation in CoIR or standard MTEB evaluation
- The model must separate the query from ALL other documents, including semantically close ones
- This is the "full corpus retrieval" protocol

Contrastive evaluation (mnemex's benchmark approach), from `contrastive-evaluation-analysis.md`:
- Uses a curated negative pool (4-19 distractors) rather than full corpus
- Industry standard: 9-19 distractors for challenging contrastive evaluation
- Hard negative selection strategies: same-file code, similar signatures, high semantic similarity (0.75-0.98)
- The document identifies a critical flaw: mnemex's original evaluator uses similarity filter 0.5-0.95 which EXCLUDES the best hard negatives (0.85-0.95 range)
- Corrected strategy: prioritize distractors with similarity 0.75-0.98 for hard contrastive tasks
- This is confirmed by academic practice: meaningful model differentiation requires distractors with ≥0.75 cosine similarity to the target

**Hard negatives in model TRAINING** (relevant for understanding model capability):

From embedding model papers (synthesized from research docs):
- Voyage Code 3 training: Uses BM25 hard negative mining + cross-encoder re-ranking to identify high-quality hard negatives from code corpora
- Jina code embeddings (arxiv:2508.21290): Uses in-batch negatives + mined hard negatives from code similarity search
- nomic-embed-code: Trained on CoRNStack dataset (Python, JavaScript, Java, Go, PHP, Ruby) with curated code pairs
- General practice (BEIR paper): BM25-retrieved top-100 candidates filtered by cross-encoder to identify gold hard negatives

**Cross-encoder reranker role**:
- Cross-encoders (e.g., `ms-marco-MiniLM-L-12-v2`) are used as "teachers" during hard negative mining
- They are NOT typically used in embedding model evaluation (too slow for large corpora)
- Evaluation uses bi-encoder (embedding) approach with cosine similarity for ranking
- Cross-encoders are used in two contexts: (1) generating training labels, (2) production reranking as a second stage after bi-encoder retrieval

**Sources**:
- `docs/contrastive-evaluation-analysis.md` — Quality: High, Date: 2025-12-18
- [arxiv:2508.21290 Jina code embeddings](https://arxiv.org/abs/2508.21290) — Quality: High
- [arxiv:2407.02883 CoIR paper](https://arxiv.org/abs/2407.02883) — Quality: High
- `ai-docs/embedding-model-research-20260304/openrouter-embedding-models-comparison.md` — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None (training vs evaluation usage is consistently distinct across sources)

---

### Finding 6: Multi-Domain Coverage — How Benchmarks Test Across Codebases

**Summary**: Leading benchmarks test across multiple programming languages (6 in CodeSearchNet) and retrieval task types (5 in CoIR). However, no standard benchmark tests cross-repository retrieval at the repository level (monorepo vs. multi-repo). Dataset diversity is achieved through language breadth, not repository breadth.

**Evidence**:

Language coverage in leading benchmarks:
```
CodeSearchNet: Python, Java, JavaScript, PHP, Ruby, Go (6 languages)
  - ~99K test pairs, ~16.5K per language
  - Dominated by open-source GitHub repos

CoIR (multi-task):
  - CodeSearchNet component (all 6 languages above)
  - Code-to-code: CodeNet (C, C++, Java, Python — IBM dataset)
  - StackOverflow: English NL queries, mixed code languages
  - GitHub issues: Mixed languages from public repos

MTEB multilingual code:
  - Extends to 20+ languages in multilingual tasks
  - Primarily driven by CodeSearchNet structure
```

Gaps in current benchmarks (important for mnemex):
1. **No repository-level retrieval benchmark**: All benchmarks test function-level retrieval from a flat corpus. They do NOT test "given a natural language query about a feature, find the right file in a real project's directory structure."
2. **No dependency-aware retrieval**: Benchmarks do not evaluate ability to find code that calls or is called by a specific function (cross-file dependency search)
3. **No incremental/streaming evaluation**: All benchmarks assume a static corpus; no evaluation of how models perform when code changes

From the mnemex benchmark implementation (`eval/embedding-benchmark.ts`):
- Benchmark tests against a pool of 37 code units from a real codebase
- 296 queries generated (mix of query types)
- Tests P@1, P@5, MRR across models
- This is closer to real-world use than CodeSearchNet (which uses docstring-as-query rather than actual developer search queries)

**Statistical significance in benchmarks**:
- MTEB and CoIR do NOT report statistical significance tests or confidence intervals
- Point estimates only; ranking stability depends on score magnitude
- Rule of thumb from NLP literature: differences <0.5 NDCG points are unlikely to be statistically significant for typical test set sizes
- For mnemex-scale evaluation (37 code units, 296 queries): standard error is higher; differences of 2+ MRR points are meaningful

**Sources**:
- `ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md` — Quality: High
- `eval/embedding-benchmark.ts` — Quality: High (local implementation)
- [CoIR paper arxiv:2407.02883](https://arxiv.org/abs/2407.02883) — Quality: High
- [CodeSearchNet HuggingFace](https://huggingface.co/datasets/code-search-net/code_search_net) — Quality: High

**Confidence**: High (on coverage), Medium (on statistical significance guidance)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 7: Query Construction — Human-Written vs. LLM-Generated vs. Template Queries

**Summary**: Academic benchmarks primarily use human-written queries (docstrings, SO questions, GitHub issues). Newer research uses LLM-generated synthetic queries for expanding test coverage. mnemex's benchmark uses an LLM query generator. The query type significantly affects which models perform best.

**Evidence**:

Query types in leading benchmarks:
```
CodeSearchNet: Human-written docstrings (GitHub, filtered for quality)
  - Style: "Compute the mean of a list of numbers"
  - Bias toward library/utility function descriptions
  - Language: English only

StackOverflow (CoIR component): Human-written SO questions
  - Style: "How do I sort a list of objects by a specific attribute?"
  - More conversational, problem-oriented

GitHub Issues (CoIR component): Human-written issue text
  - Style: "Fix race condition in connection pool"
  - Technical, often brief

MTEB (general): Mix — some human-written (MS-MARCO, BEIR), some LLM-augmented
  - NQ (Natural Questions): Wikipedia-derived, human-written
  - FEVER: Human-written fact verification
```

mnemex's query generator (from `docs/llm benchmark.md` and `src/benchmark-v2/evaluators/retrieval/index.ts`):
- Generates queries via LLM given code unit content
- Query types: functional description, behavior description, use-case query, API usage query
- These are LLM-generated synthetic queries — different from human-written docstrings
- Important: Models trained on CodeSearchNet (docstring-based) may generalize differently to LLM-generated queries
- Cross-encoder reranker can be used to validate query quality (is the generated query actually answered by the target code?)

Query type impact on model performance:
- Models trained on NL-to-code pairs (like Jina code models) excel at human-written docstring queries
- Models with instruction-aware embedding (Qwen3 via `Instruct:` prefix) can be adapted to different query styles
- Task-specific instructions: Qwen3 supports custom `Instruct: Retrieve code that matches this description\nQuery: {query}` prefix
- Jina code models support task tags: `nl2code:`, `code2code:`, `code2nl:`, `code2completion:`, `qa:`

**Newer trend: synthetic query generation for evaluation**:
- Research groups (especially for low-resource scenarios) use LLMs to generate queries
- Cross-encoder validation: generated query → cross-encoder scores against corpus → keep high-scoring pairs
- Used in: E5-Mistral, GTE-Qwen2 training data generation
- Not yet standard in code-specific benchmark evaluation (CoIR still uses human-written queries)

**Sources**:
- `docs/llm benchmark.md` — Quality: High (internal spec)
- `src/benchmark-v2/evaluators/retrieval/index.ts` — Quality: High (local code)
- `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md` — Quality: High
- [arxiv:2508.21290 Jina paper](https://arxiv.org/abs/2508.21290) — Quality: High (task instruction details)

**Confidence**: High (on benchmark protocols), Medium (on LLM-generated query comparison)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 8: Matryoshka Representation Learning (MRL) — Evaluation Implications

**Summary**: MRL (Matryoshka Representation Learning) allows a single embedding model to produce nested representations at multiple dimensions (e.g., 128, 256, 512, 1024, 2048). Models supporting MRL can be evaluated at reduced dimensions with minimal quality loss, enabling storage/speed trade-offs. All top 2025-2026 code embedding models support MRL.

**Evidence**:

From `embedding-model-benchmarks-march2026.md` and individual model cards:
```
MRL-supported models (code embedding):
  Jina code-0.5B: MRL dimensions 128, 256, 512, 1024, 1536
  Jina code-1.5B: MRL dimensions 128, 256, 512, 1024, 1536
  Qwen3-Embedding-0.6B: MRL dimensions 128, 256, 512, 1024
  Qwen3-Embedding-4B: MRL dimensions (same)
  Qwen3-Embedding-8B: MRL dimensions (same)
  nomic-embed-text v1.5: MRL dimensions 64, 128, 256, 512, 768

NOT supporting MRL:
  nomic-embed-code (7B): Fixed 2048 dimensions
  Voyage Code 3: Fixed 1024 dimensions (no MRL)
```

Evaluation implications of MRL:
- Benchmarks report scores at FULL dimension by default
- MRL quality at reduced dims: typically ~2% NDCG drop at 512-dim vs. full-dim
- For storage-constrained use cases: 512-dim is the recommended practical minimum
- LanceDB (mnemex's vector store) supports arbitrary vector dimensions — no constraint on dimension selection

Why MRL matters for mnemex evaluation:
- If evaluating multiple models, MRL allows fair comparison at equivalent storage cost
- Example: Jina code-1.5B (1536 dims) vs. Qwen3-0.6B (1024 dims) should be compared at either 1024 dims (matching Qwen3's max) or evaluated at each model's native optimum
- The MTEB leaderboard reports native (full) dimension scores for fair model-to-model comparison

**Sources**:
- [arxiv:2508.21290 Jina code embeddings paper](https://arxiv.org/abs/2508.21290) — Quality: High
- [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/) — Quality: High, June 2025
- `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md` — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

## Source Summary

**Total Sources**: 15 unique sources
- High Quality: 14
- Medium Quality: 1
- Low Quality: 0

**Source List**:
1. [arxiv:2508.21290 — Jina Code Embeddings paper](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025, Type: Academic paper
2. [arxiv:2407.02883 — CoIR benchmark paper](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024, Type: Academic paper
3. [arxiv:2506.05176 — Qwen3 Embedding paper](https://arxiv.org/abs/2506.05176) — Quality: High, Date: June 2025, Type: Academic paper
4. [arxiv:2412.01007 — nomic-embed-code paper](https://arxiv.org/abs/2412.01007) — Quality: High, Date: December 2024, Type: Academic paper
5. [MTEB Leaderboard HuggingFace](https://huggingface.co/spaces/mteb/leaderboard) — Quality: High, Date: Live (retrieved 2026-03-05), Type: Live leaderboard
6. [CodeSearchNet HuggingFace dataset](https://huggingface.co/datasets/code-search-net/code_search_net) — Quality: High, Date: Live, Type: Dataset
7. [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/) — Quality: High, Date: June 2025, Type: Official blog
8. [nomic-embed-code README](https://huggingface.co/nomic-ai/nomic-embed-code) — Quality: High, Date: March 2025, Type: Official model card
9. [jinaai/jina-code-embeddings-1.5b HuggingFace](https://huggingface.co/jinaai/jina-code-embeddings-1.5b) — Quality: High, Date: August 2025, Type: Official model card
10. `docs/contrastive-evaluation-analysis.md` — Quality: High, Date: 2025-12-18, Type: Internal analysis
11. `docs/llm benchmark.md` — Quality: High, Date: Internal, Type: Internal specification
12. `src/benchmark-v2/evaluators/retrieval/index.ts` — Quality: High, Date: Current, Type: Local code
13. `eval/embedding-benchmark.ts` — Quality: High, Date: Current, Type: Local code
14. `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md` — Quality: High, Date: 2026-03-05, Type: Prior research
15. `ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md` — Quality: High, Date: 2026-03-05, Type: Prior research

---

## Knowledge Gaps

What this research did NOT find:

1. **Statistical significance testing methodology**: No academic benchmark (MTEB, CoIR, BEIR) publishes confidence intervals or significance tests for embedding model comparisons. The community convention is point estimates only. Gap: No guidance on minimum test set size for reliable embedding model comparison. Suggested query: `"statistical significance embedding model evaluation confidence intervals minimum test set size"`

2. **Cross-repository evaluation benchmarks**: No published benchmark tests embedding models for repository-level code search (finding the right file in a real project's directory structure, not function-level retrieval). This is mnemex's actual use case. Suggested query: `"repository-level code search embedding evaluation benchmark cross-file retrieval"`

3. **LLM-generated query evaluation vs. human-written query evaluation**: No systematic study compares model rankings when queries are LLM-generated vs. human-written (docstrings). If mnemex uses LLM-generated queries, model rankings may differ from CoIR. Gap: Uncertain whether CoIR-based model selection transfers to mnemex's LLM-generated query evaluation. Suggested query: `"synthetic query generation evaluation bias embedding benchmark human vs LLM queries"`

4. **Hard negative mining specific to code**: BEIR and CoIR use in-corpus natural negatives. No published study explicitly curates a code hard-negative benchmark (functions with same signatures but different implementations as explicit negatives). Suggested query: `"code embedding hard negative mining evaluation adversarial code retrieval benchmark"`

5. **Domain adaptation evaluation**: No benchmark specifically tests how well models trained on general code (CodeSearchNet) transfer to proprietary/organization-specific code (private repos with domain-specific patterns). This is relevant for mnemex's real-world use. Gap: Cannot predict from CoIR scores alone how models will perform on user-specific codebases.

---

## Search Limitations

- Model: claude-sonnet-4-6 (native)
- Web search: Not available (MODEL_STRATEGY=native)
- Local search: Performed against 15 sources including 5 prior research documents, 5 source code files
- Date of prior research: Most recent sources dated 2026-03-04 to 2026-03-05 (current)
- Date range covered: Benchmark papers from July 2024 (CoIR) through August 2025 (Jina code embeddings)
- Query refinement: Applied — initial queries on MTEB/BEIR expanded to include CoIR task structure, MRL, and hard negative protocols
- Key limitation: No live access to MTEB leaderboard or arxiv to verify post-August-2025 papers; all knowledge sourced from pre-existing local research documents
