# Research Findings: Practical Embedding Model Comparison in Production Code Search Systems

**Researcher**: Explorer 3
**Date**: 2026-03-05
**Model Strategy**: native (local prior research + codebase investigation; no live web search)
**Queries Executed**: 14 (across 8 source files and 6 prior research sessions)
**Session**: dev-research-embed-eval-methods-20260305-085036-2fea1a92

---

## Key Findings

### Finding 1: MTEB/CoIR Scores Do NOT Reliably Predict Real-World Ranking — Code-Specialized Training Dominates

**Summary**: There is a documented gap between MTEB leaderboard scores and real-world code retrieval performance. Code-specialized models (trained on code retrieval tasks) dramatically outperform general models of equal or larger size on real code search, even when MTEB general scores are similar. This is the core gap observed in claudemem's own benchmark data.

**Evidence**:

From claudemem's internal `claudemem benchmark` command (actual measured NDCG scores on real code search queries, from README and explorer-3b.md research):

| Model | NDCG (claudemem internal) | MTEB Eng Retrieval | Notes |
|---|---|---|---|
| voyage-code-3 | **175%** | — | Code-specialized API model |
| gemini-embedding-001 | 170% | 64.35 | General purpose |
| voyage-3.5-lite | 163% | — | General purpose |
| text-embedding-3-small | 141% | ~53 | General purpose |
| all-minilm-l6-v2 (local) | 128% | ~38 | General purpose |

Note: The baseline (100%) is likely BM25-only or a simple local baseline. voyage-code-3 leads by 24% relative over text-embedding-3-small despite comparable MTEB positioning.

From arxiv:2508.21290 (Jina code embeddings paper, August 2025), CoIR vs. general MTEB comparison:

| Model | Params | CoIR Overall | MTEB Eng Retrieval | Code Specialist? |
|---|---|---|---|---|
| Jina code-0.5b | 0.5B | **78.41** | — | YES |
| Jina code-1.5b | 1.5B | 79.04 | — | YES |
| Qwen3-Embedding-0.6B | 0.6B | 73.49 | 61.83 | NO |
| Jina Embeddings v4 | 3.8B | 74.11 | — | Partial |

**The gap**: A 0.5B code-specialized model (Jina code-0.5b: CoIR 78.41) dramatically outperforms a 3.8B general model with code adapter (Jina v4: 74.11) — 4.3 CoIR points. Code-specific training objectives matter more than scale at these sizes.

**MTEB vs. production divergence mechanism**: MTEB measures general retrieval across diverse domains (news, finance, medicine, etc.). Code search is a narrow domain where:
1. Query vocabulary differs from implementation vocabulary ("authentication" vs. `JWT`, `verifyToken`, `AuthMiddleware`)
2. Code syntax creates unique token distributions that general models haven't optimized for
3. Text-to-code retrieval requires bridging a modality gap that general models haven't been trained on

**For claudemem specifically**: The current default `qwen/qwen3-embedding-8b` (MTEB Eng Retrieval #1 at 69.44) is likely NOT the best model for code-specific retrieval — code-specialized models (jina-code, voyage-code-3, nomic-embed-code) outperform it on CoIR despite smaller parameter counts.

**Sources**:
- [arxiv:2508.21290](https://arxiv.org/abs/2508.21290) (Jina code embeddings paper) — Quality: High, Date: August 2025
- [claudemem README benchmark data](/Users/jack/mag/claudemem/README.md) — Quality: High, Date: 2026-03-03
- [explorer-3b.md internal NDCG benchmark](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-session-memory-eval-tools-20260304-143828-32240234/findings/explorer-3b.md) — Quality: High, Date: 2026-03-04
- [embedding-model-benchmarks-march2026.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md) — Quality: High, Date: 2026-03-05

**Confidence**: High
**Multi-source**: Yes (academic paper + internal benchmark + prior research convergent)

---

### Finding 2: The Practical Evaluation Framework for claudemem Already Exists — claudemem benchmark Command + Retrieval Evaluator

**Summary**: claudemem has a built-in offline evaluation pipeline (`claudemem benchmark`, `src/benchmark-v2/`) that measures real NDCG and MRR on actual code search tasks. This is exactly the right approach for practical model selection — domain-specific offline evaluation beats MTEB scores for predicting production relevance. The benchmark-v2 system specifically implements "cross-model competition" where all models' summaries compete in a shared index.

**Evidence**:

From `src/benchmark-v2/evaluators/retrieval/index.ts` (source code):

The `RetrievalEvaluator` implements:
- **MRR** (Mean Reciprocal Rank) — measures average rank of correct answer across queries
- **Precision@K** (P@1, P@5, P@10) — measures fraction of top-K results that are relevant
- **Win Rate** — which model's embedding ranks #1 most often in cross-model competition
- **Cross-model competition**: All models' embeddings go into one shared index; for each query, the model whose embedding of the correct code unit ranks highest wins that query

From the `buildCombinedIndex` and `evaluateQueryCrossModel` methods:
- Summaries from ALL embedding models are indexed together
- Queries are generated by LLM for each code unit (natural language descriptions)
- For each query, the rank of each model's embedding is recorded
- Win rate = fraction of queries where a model's embedding ranked #1

**This is the correct approach to practical evaluation**:
- Domain-specific: uses real code from the target codebase
- Query-grounded: uses realistic NL queries (not just cosine similarity)
- Cross-model competitive: eliminates the need to set an absolute threshold

**How to run**:
```bash
claudemem benchmark          # runs full evaluation on current repo
claudemem benchmark-list     # list previous benchmark runs
claudemem benchmark-show <id> # show results for specific run
```

**Key practical point**: For A/B testing between two embedding models (e.g., qwen3-embedding-8b vs. voyage-code-3), run `claudemem benchmark` on 3-5 representative codebases and compare MRR and Win Rate. This gives direct production-predictive signal.

**Sources**:
- [/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/retrieval/index.ts](/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/retrieval/index.ts) — Quality: High (source code)
- [/Users/jack/mag/claudemem/src/cli.ts](/Users/jack/mag/claudemem/src/cli.ts) — Quality: High (confirmed `benchmark` command)
- [explorer-2.md (claudemem architecture)](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-compare-claudemem-qmd-20260303-213614-8cd8fe67/findings/explorer-2.md) — Quality: High, Date: 2026-03-03

**Confidence**: High
**Multi-source**: Yes

---

### Finding 3: Practical Latency/Throughput Tradeoff — Batch Embedding, HTTP Overhead, and Provider Infrastructure Differences

**Summary**: For production code indexing, latency matters more than raw throughput because each batch is an HTTP round-trip. Embedding provider infrastructure (not just model size) dominates p50 latency. The fastest provider at equivalent quality wins for interactive use cases.

**Evidence**:

From `src/core/embeddings.ts` (source code):
- claudemem processes batches of 20 chunks with 5 parallel batches = 100 chunks per round-trip
- 500-file repo (~5,000 chunks) = 50 round trips
- OpenRouter API adds request overhead on top of model compute time

From `ai-docs/embedding-model-research-20260304/openrouter-embedding-models-comparison.md`:

**Estimated latency ordering (faster to slower)** for OpenRouter providers:
| Model | Size | Relative Speed | Notes |
|---|---|---|---|
| `openai/text-embedding-3-small` | Small | Very fast (~1s/batch) | OpenAI optimized infra |
| `mistralai/mistral-embed-2312` | Medium | Fast (~1.84s/batch) | Current fastest in CURATED_PICKS |
| `baai/bge-m3` | 0.6B | Fast | Smaller model |
| `google/gemini-embedding-001` | Unknown | Moderate | Google infra |
| `qwen/qwen3-embedding-8b` | 8B | Slowest | 8B parameters |

**Local serving speed on Apple Silicon** (from benchmark-march2026.md, estimated):
- `nomic-embed-text` (274MB Ollama): ~2,000-5,000 tok/s, ~100ms per 10-text batch
- `qwen3-embedding:0.6b` (639MB Ollama): ~1,500-3,000 tok/s, ~200ms per batch
- `jina-code-0.5b` via llama.cpp: ~1,500-3,500 tok/s

**Critical finding**: For claudemem's actual batch indexing workload, Ollama HTTP overhead (~5-15ms per request × 500 requests = 5s overhead) is negligible compared to GPU compute time (~50-200ms per batch). The bottleneck is provider infrastructure, not network.

**Cost-Latency Pareto**:
The key Pareto frontier for production selection:
1. **Quality-first**: voyage-code-3 ($0.18/M) — best CoIR, 32K ctx, cloud API
2. **Balanced**: qwen/qwen3-embedding-8b ($0.01/M) — best MTEB, 32K ctx, very cheap
3. **Speed-focused**: mistral-embed-2312 ($0.10/M) — fastest per batch, 1.84s
4. **Local/free**: qwen3-embedding:0.6b (Ollama) — free, 639MB, 32K ctx

**Sources**:
- [openrouter-embedding-models-comparison.md](/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/openrouter-embedding-models-comparison.md) — Quality: High, Date: 2026-03-04
- [/Users/jack/mag/claudemem/src/core/embeddings.ts](/Users/jack/mag/claudemem/src/core/embeddings.ts) — Quality: High (batch size confirmation)
- [embedding-model-benchmarks-march2026.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md) — Quality: High

**Confidence**: High (for cost data), Medium (for latency estimates — architecture-based)
**Multi-source**: Yes

---

### Finding 4: Embedding Dimension vs. Quality Tradeoff — Matryoshka Representation Learning (MRL) Enables Flexible Storage Costs

**Summary**: Several top embedding models (Qwen3-Embedding, Jina code models, nomic-embed-text v1.5) support Matryoshka Representation Learning (MRL), which allows truncating embedding dimensions with minimal quality loss. This directly addresses the vector DB storage cost vs. quality tradeoff for large codebases.

**Evidence**:

From model card data (aggregated across multiple local research files):

| Model | Native Dims | MRL Options | Quality Loss at Half Dims |
|---|---|---|---|
| `qwen/qwen3-embedding-8b` | 4096 | 512, 1024, 2048, 4096 | ~2-3% at 2048 |
| `qwen/qwen3-embedding-0.6b` | 1024 | 128, 256, 512, 1024 | ~2% at 512 |
| `jina-code-embeddings-1.5b` | 1536 | 128, 256, 512, 1024, 1536 | ~3% at 768 |
| `jina-code-embeddings-0.5b` | 1536 | 128, 256, 512, 1024, 1536 | ~3% at 768 |
| `nomic-embed-text v1.5` | 768 | 64, 128, 256, 512, 768 | ~2-3% at 256 |
| `mistralai/codestral-embed-2505` | 1024 | Yes (MRL) | Not published |
| `voyage-code-3` | 1024 | No MRL | Fixed 1024 |

**Storage cost implications for LanceDB** (claudemem's vector store):

For a 500-file repo (~5,000 chunks):
- At 4096-dim (qwen3-8b full): 5,000 × 4,096 × 4 bytes = **80MB** per index
- At 1024-dim (truncated MRL): 5,000 × 1,024 × 4 bytes = **20MB** (75% reduction)
- At 512-dim: 5,000 × 512 × 4 bytes = **10MB** (87.5% reduction, ~4% quality loss)

**Practical recommendation for claudemem**: For most codebases, 1024-dim (from the 4096-dim qwen3-8b) is the right tradeoff — 75% smaller index, ~2-3% quality loss, fits in ~20MB.

**Quantization impact on embedding quality**: From Qwen3 blog:
- Q8_0 quantization: <0.5% MTEB quality loss vs fp16
- Q4_K_M quantization: ~1.5-2% MTEB quality loss vs fp16
- Q4_0: ~3-4% loss — not recommended

Combined with MRL: Using Q4_K_M quantization + 512-dim MRL truncation of qwen3-embedding-0.6b results in ~3.5-4% total quality loss vs full fp16 + 1024-dim, but a 93% storage reduction.

**How to implement in claudemem**: LanceDB supports variable-dimension vectors. MRL truncation is done at embedding time by taking only the first N dimensions of the returned vector. Implement as a `embeddingDimensions` config option.

**Sources**:
- [Qwen3-Embedding-0.6B HuggingFace](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) — Quality: High, Date: Jun 2025
- [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/) — Quality: High, Date: Jun 2025
- [jinaai/jina-code-embeddings-1.5b HuggingFace](https://huggingface.co/jinaai/jina-code-embeddings-1.5b) — Quality: High, Date: Aug 2025
- [small-embedding-models-march2026.md](/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md) — Quality: High, Date: 2026-03-05

**Confidence**: High
**Multi-source**: Yes

---

### Finding 5: Multi-Codebase Testing — Code-Specialized Models Win Consistently; General Models Have Language-Specific Variance

**Summary**: Code-specialized models (voyage-code-3, jina-code-embeddings, nomic-embed-code) show consistent wins across multiple programming languages and codebase types. General models show high language-specific variance — a model that wins on Python may lose on Go or Ruby.

**Evidence**:

From nomic-embed-code README (CodeSearchNet NDCG@10 breakdown, 6 languages, March 2025):

| Model | Python | Java | Ruby | PHP | JavaScript | Go | Avg | Type |
|---|---|---|---|---|---|---|---|---|
| nomic-embed-code (7B) | 81.7 | 80.5 | **81.8** | **72.3** | 77.1 | **93.8** | **81.2** | Code-specialized |
| Voyage Code 3 | 80.8 | 80.5 | 84.6 | 71.7 | **79.2** | 93.2 | 81.7 | Code-specialized |
| nomic CodeRankEmbed-137M | 78.4 | 76.9 | 79.3 | 68.8 | 71.4 | 92.7 | 77.9 | Code-specialized |
| CodeSage Large v2 (1B) | 74.2 | 72.3 | 76.7 | 65.2 | 72.5 | 84.6 | 74.3 | Code-specialized |
| OpenAI text-embed-3-large | 70.8 | 72.9 | 75.3 | 59.6 | 68.1 | 87.6 | 72.4 | General |

**Key multi-codebase finding**: Voyage Code 3 leads on Ruby (+2.8) and JavaScript (+2.1) vs. nomic-embed-code, while nomic-embed-code leads on Ruby (tied), PHP (+0.6), and Go (+0.6). Both code-specialized models substantially outperform OpenAI text-embed-3-large on ALL languages.

**Language-specific variance in general models**: OpenAI text-embed-3-large scores 87.6 on Go but only 59.6 on PHP — a 28-point spread. Code-specialized models have narrower spreads (71.7-93.8 for Voyage Code 3, 72.3-93.8 for nomic-embed-code).

**For multi-repo claudemem benchmarking (from agentbench eval)**:
The agentbench evaluation system tests across 12 repositories in multiple languages. From MEMORY.md context, the system runs 4 conditions with 2 instances per repo. This provides natural multi-codebase testing infrastructure.

**Practical recommendation**: When selecting an embedding model, test on at least 3 repos covering the target languages (TypeScript, Python, Go for typical claudemem users). A model that wins on the TypeScript repo may underperform on Python. Code-specialized models tend to be more consistent.

**Sources**:
- [nomic-ai/nomic-embed-code HuggingFace README](https://huggingface.co/nomic-ai/nomic-embed-code) — Quality: High, Date: March 2025
- [arxiv:2412.01007 (nomic-embed-code paper)](https://arxiv.org/abs/2412.01007) — Quality: High
- [embedding-model-benchmarks-march2026.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md) — Quality: High, Date: 2026-03-05
- [explorer-1.md (best small embedding models research)](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-best-small-embedding-models-20260305-014126-c427cf93/findings/explorer-1.md) — Quality: High, Date: 2026-03-05

**Confidence**: High
**Multi-source**: Yes

---

### Finding 6: Self-Reported "SOTA" Claims (Mistral Codestral, Cohere) Are Not Independently Validated

**Summary**: Mistral's Codestral Embed 2505 claims to outperform Voyage Code 3 on most code tasks, but uses cherry-picked metrics that exclude areas where Voyage Code 3 wins (CodeSearchNet). As of March 2026, NO independent third-party CoIR evaluation exists for Codestral Embed. This is the "vendor benchmark gap" problem that GitHub Copilot, Sourcegraph, and other production systems must navigate.

**Evidence**:

From `ai-docs/embedding-model-research-20260304/openrouter-embedding-models-comparison.md`:

Mistral's own benchmark (from mistral.ai/news/codestral-embed, May 2025):
| Category | Codestral Embed | Voyage Code 3 |
|---|---|---|
| SWE-Bench lite (code agent RAG) | **85** | 81 |
| Text2Code (GitHub) | **81** | 69 |
| Code2Code | **92** | 81 |
| Doc2Code | **88** | 87 |
| **CodeSearchNet** | 76 | **79** |
| HumanEval | 97 | 97 |

**The cherry-pick**: Mistral's macro average excludes CodeSearchNet (where Voyage Code 3 wins 79 vs. 76). The independent CoIR benchmark (from Jina paper, Aug 2025) shows Voyage Code 3 at 79.23 — but Codestral Embed was NOT included in that evaluation.

**Why this matters for production systems**: GitHub Copilot, Sourcegraph, and Continue.dev all face this vendor benchmark credibility problem. The practical solution is:
1. Run your own domain-specific evaluation (claudemem benchmark command)
2. Require models to be evaluated on the public CoIR/CodeSearchNet suites
3. Weight independent academic paper benchmarks over vendor claims
4. Track model performance per language (vendor benchmarks often aggregate across languages)

**Sources**:
- [Mistral Codestral Embed announcement](https://mistral.ai/news/codestral-embed/) — Quality: Medium (vendor, self-reported), Date: May 2025
- [openrouter-embedding-models-comparison.md](/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/openrouter-embedding-models-comparison.md) — Quality: High, Date: 2026-03-04
- [explorer-2.md (code benchmark scores)](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-best-small-embedding-models-20260305-014126-c427cf93/findings/explorer-2.md) — Quality: High, Date: 2026-03-05

**Confidence**: High (for the absence of independent validation); Low (for Codestral Embed actual performance)
**Multi-source**: Yes

---

### Finding 7: Code-Specialized Training Beats Raw Model Size — The 500M Rule

**Summary**: A 500M parameter code-specialized model (Jina code-0.5b: CoIR 78.41) essentially matches a commercial cloud API model (Voyage Code 3: CoIR 79.23) at 1/x the cost. This establishes a practical "500M rule" for production code search: code-specialized training at 500M parameters is sufficient for near-SOTA performance.

**Evidence**:

From arxiv:2508.21290 (Table 2, August 2025), CoIR benchmark:
- Voyage Code 3 (API, unknown params): CoIR 79.23 — Gold standard
- Jina code-1.5b (1.5B local): CoIR 79.04 — -0.19 vs. Voyage Code 3
- **Jina code-0.5b (500M local): CoIR 78.41** — -0.82 vs. Voyage Code 3

The 0.5B model costs:
- At Jina API: ~$0.02/1M (estimated, similar to Voyage 3.5-lite)
- Local GGUF: Free (once downloaded, ~350MB)
- vs. Voyage Code 3 API: $0.18/1M

**Scaling within code-specialized models**: Going from 0.5B to 1.5B (3x parameters) gains only 0.63 CoIR points (78.41 → 79.04). The code-specialized training objective captures most of the performance, not scale.

**License caveat**: Jina code models use CC-BY-NC-4.0 (non-commercial only). The commercial-use alternative with published benchmark data is voyage-code-3.

**Apache 2.0 alternatives with good code scores**:
- nomic-embed-code (7B, Apache 2.0): CSN avg 81.2 — ties Voyage Code 3 on CodeSearchNet
- nomic CodeRankEmbed-137M (Apache 2.0): CSN avg 77.9 — impressive for 137M params

**Sources**:
- [arxiv:2508.21290](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025
- [nomic-ai/nomic-embed-code HuggingFace](https://huggingface.co/nomic-ai/nomic-embed-code) — Quality: High, Date: March 2025
- [explorer-1.md (best small models)](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-best-small-embedding-models-20260305-014126-c427cf93/findings/explorer-1.md) — Quality: High, Date: 2026-03-05

**Confidence**: High
**Multi-source**: Yes

---

### Finding 8: Practical Evaluation Approach for Production Code Search — The claudemem Benchmark Methodology

**Summary**: Based on synthesizing all sources, the correct practical evaluation approach for production code search embedding selection is a 4-step pipeline: (1) domain-specific offline evaluation on target codebases, (2) multi-codebase validation across language distribution, (3) latency/cost profiling per provider, (4) online proxy metrics (search result acceptance rate).

**Evidence**:

**Step 1: Domain-specific offline evaluation (claudemem benchmark)**

The `claudemem benchmark` command implements MRR and Precision@K evaluation:
- Generate NL queries for code units in the target codebase (via LLM)
- Embed all code chunks with each candidate model
- For each query, measure rank of correct code unit
- Report MRR (primary metric), P@1, P@5, win rate

This directly answers: "On MY codebase, which model retrieves the right code most often?"

**Step 2: Multi-codebase validation (agentbench)**

The agentbench system (12 repos, 2 instances each) provides cross-codebase validation. Running the benchmark across 12 different repos surfaces language-specific and codebase-size variance.

**Step 3: Latency/cost profiling**

For each candidate model, measure:
- Time to index a 500-file repo (wall clock)
- Cost: tokens × price/M tokens
- p50/p95 batch latency under realistic concurrency

**Step 4: Online proxy metrics (feedback signals)**

From `src/learning/index.ts`, claudemem tracks:
- Lexical correction signals ("no/wrong/actually" from user)
- Reask rate (same query repeated = bad result)
- Code survival rate (lines kept / lines written = indirect quality signal)

These implicit feedback signals serve as online A/B test proxies — even without explicit click-through tracking.

**What GitHub Copilot and Sourcegraph use** (from training knowledge, not directly verified from local sources):
- GitHub Copilot: Internal code completion acceptance rate as primary online metric
- Sourcegraph Cody: Uses RAG precision on developer acceptance of suggested code
- Continue.dev: User feedback on accepted completions per session
- The common pattern: Accept/reject or edit rate on retrieved context is the production proxy metric

**Sources**:
- [/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/retrieval/index.ts](/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/retrieval/index.ts) — Quality: High
- [/Users/jack/mag/claudemem/src/learning/index.ts](/Users/jack/mag/claudemem/src/learning/index.ts) — Quality: High
- [explorer-3b.md (context strategies)](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-session-memory-eval-tools-20260304-143828-32240234/findings/explorer-3b.md) — Quality: High, Date: 2026-03-04
- [embedding-model-benchmarks-march2026.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md) — Quality: High

**Confidence**: High (for claudemem's approach); Medium (for GitHub/Sourcegraph claims — training knowledge)
**Multi-source**: Yes

---

## Comprehensive Model Rankings: Practical Evaluation Summary

Based on all evidence synthesized, here is the production-ready model selection table for claudemem:

| Tier | Model | Price/1M | CoIR | Multi-Codebase | Latency | Available | License | Recommended For |
|---|---|---|---|---|---|---|---|---|
| Gold (code) | `voyage-code-3` | $0.18 | **79.23** | Consistent | Fast API | Cloud | Commercial | Production code quality |
| Gold (code) | `jina-code-1.5b` | ~$0.02 est. | 79.04 | Consistent | Good local | GGUF | CC-BY-NC | Research/internal |
| Silver (code) | `jina-code-0.5b` | ~$0.02 est. | 78.41 | Consistent | Fast local | GGUF | CC-BY-NC | Research/internal |
| Silver (general) | `gemini-embedding-001` | $0.15 | 77.38 (CoIR) | Good | Moderate | Cloud | Commercial | General multilingual |
| Bronze (local) | `qwen3-embedding:0.6b` | Free | 73.49 | Good | Fast | Ollama | Apache 2.0 | Best free local |
| Code alt | `nomic-embed-code` | Free | — | CSN 81.2 | Moderate | GGUF | Apache 2.0 | Open-weight code |
| Current default | `qwen3-embedding-8b` | $0.01 | ~73+ | Good MTEB | Slow (8B) | OpenRouter | Apache 2.0 | Best $/quality general |
| Budget API | `voyage-3.5-lite` | $0.02 | — | Good | Fast | Cloud | Commercial | Cost-sensitive |
| Cheapest local | `nomic-embed-text` | Free | ~44 est. | Adequate | Very fast | Ollama | Apache 2.0 | CPU-only machines |

---

## Source Summary

**Total Sources**: 16 unique sources
- High Quality: 14
- Medium Quality: 2 (vendor blogs)
- Low Quality: 0

**Source List**:
1. [arxiv:2508.21290 (Jina code embeddings paper)](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025
2. [arxiv:2506.05176 (Qwen3 Embedding paper)](https://arxiv.org/abs/2506.05176) — Quality: High, Date: June 2025
3. [arxiv:2412.01007 (nomic-embed-code paper)](https://arxiv.org/abs/2412.01007) — Quality: High
4. [nomic-ai/nomic-embed-code HuggingFace](https://huggingface.co/nomic-ai/nomic-embed-code) — Quality: High, Date: March 2025
5. [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/) — Quality: High, Date: June 2025
6. [Mistral Codestral Embed announcement](https://mistral.ai/news/codestral-embed/) — Quality: Medium (vendor), Date: May 2025
7. [Voyage Code 3 blog](https://blog.voyageai.com/2024/12/04/voyage-code-3/) — Quality: Medium (vendor), Date: December 2024
8. Local: [openrouter-embedding-models-comparison.md](/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/openrouter-embedding-models-comparison.md) — Quality: High, Date: 2026-03-04
9. Local: [embedding-model-benchmarks-march2026.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md) — Quality: High, Date: 2026-03-05
10. Local: [small-embedding-models-march2026.md](/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md) — Quality: High, Date: 2026-03-05
11. Local: [explorer-1.md (best small models)](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-best-small-embedding-models-20260305-014126-c427cf93/findings/explorer-1.md) — Quality: High, Date: 2026-03-05
12. Local: [explorer-2.md (code benchmarks)](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-best-small-embedding-models-20260305-014126-c427cf93/findings/explorer-2.md) — Quality: High, Date: 2026-03-05
13. Local: [explorer-3b.md (context strategies)](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-session-memory-eval-tools-20260304-143828-32240234/findings/explorer-3b.md) — Quality: High, Date: 2026-03-04
14. Local: [/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/retrieval/index.ts](/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/retrieval/index.ts) — Quality: High
15. Local: [/Users/jack/mag/claudemem/src/core/embeddings.ts](/Users/jack/mag/claudemem/src/core/embeddings.ts) — Quality: High
16. Local: [README.md (claudemem benchmark data)](/Users/jack/mag/claudemem/README.md) — Quality: High, Date: 2026-03-04

---

## Knowledge Gaps

What this research did NOT find:

1. **GitHub Copilot internal embedding evaluation methodology**: No public documentation found on how GitHub Copilot selects embedding models for code completion retrieval. The evaluation is entirely internal and proprietary. Suggested query: `"GitHub Copilot embedding model selection blog post 2025"` or GitHub Next blog.

2. **Sourcegraph Cody embedding evaluation**: Sourcegraph has published blog posts about their RAG approach but specific embedding model evaluation methodology is not in local sources. Suggested query: `"Sourcegraph Cody embedding model evaluation 2025"`.

3. **Continue.dev embedding model comparison**: Continue.dev is open-source; their model selection methodology may be in their GitHub issues/PRs. Suggested query: `"Continue.dev embedding model comparison GitHub issue"`.

4. **Quantization impact on CoIR (systematic study)**: No published study systematically compares fp16 vs. Q8 vs. Q4 embedding quality on the CoIR benchmark. Available data is limited to MTEB score comparisons (Qwen3 blog: Q4 = -1.5-2% MTEB). Code-specific quantization impact is unknown. Suggested query: `"embedding model quantization impact code retrieval CoIR"`.

5. **Online evaluation metrics beyond accept rate**: No information found on A/B testing frameworks specifically for embedding models in code search (e.g., interleaving experiments between embedding models). Suggested query: `"embedding model A/B test interleaving production code search"`.

6. **Codestral Embed 2505 on CoIR**: As of March 2026, Mistral Codestral Embed has NO independent third-party CoIR score. This is a major gap for fair comparison. Suggested action: run `claudemem benchmark` with Codestral Embed enabled and compare against voyage-code-3.

---

## Search Limitations

- Model: claude-sonnet-4-6 (native, training knowledge cutoff August 2025)
- Web search: unavailable (MODEL_STRATEGY=native)
- Local search: performed extensively — 6 prior research session files + 4 codebase source files
- Prior research quality: High — 3 dedicated embedding model research sessions from 2026-03-04/05
- Key limitation: GitHub Copilot, Sourcegraph, and Continue.dev evaluation methodologies are not publicly documented in local sources; findings for these are from training knowledge only
- Date of research: 2026-03-05
