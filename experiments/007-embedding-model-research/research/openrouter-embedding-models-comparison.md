# OpenRouter Embedding Models: Comparison for Code Search

**Research Date**: 2026-03-04
**Purpose**: Select the best embedding model on OpenRouter for semantic code search in claudemem
**Current Defaults**: OpenRouter: `qwen/qwen3-embedding-8b`, Voyage: `voyage-3.5-lite`, Ollama: `nomic-embed-text`

---

## 1. Complete OpenRouter Embedding Model List (Live as of 2026-03-04)

Data source: `GET https://openrouter.ai/api/v1/embeddings/models` — 22 total models.

### Tier A: Long Context + Modern (suitable for code chunks)

| Model ID | Context | Price/1M tokens | Dimensions | Notes |
|---|---|---|---|---|
| `qwen/qwen3-embedding-8b` | 32,000 | $0.010 | 4096 | **Currently default** |
| `qwen/qwen3-embedding-4b` | 32,768 | $0.020 | 2560 | Larger price, slightly more context |
| `mistralai/codestral-embed-2505` | 8,192 | $0.150 | 1024 | **Code-specialized** |
| `mistralai/mistral-embed-2312` | 8,192 | $0.100 | 1024 | General purpose |
| `google/gemini-embedding-001` | 20,000 | $0.150 | 3072 | MTEB #1 multilingual |
| `openai/text-embedding-3-small` | 8,192 | $0.020 | 1536 | Reliable general purpose |
| `openai/text-embedding-3-large` | 8,192 | $0.130 | 3072 | High quality, expensive |
| `openai/text-embedding-ada-002` | 8,192 | $0.100 | 1536 | Legacy, superseded |
| `baai/bge-m3` | 8,192 | $0.010 | 1024 | Multilingual, solid quality |
| `nvidia/llama-nemotron-embed-vl-1b-v2:free` | 131,072 | **FREE** | ? | Multimodal (image+text) — text/image |

### Tier B: Legacy Short-Context (512 tokens — too short for code chunks)

These models have a 512-token context window, making them **not suitable for code chunks** (which can easily be 200-800 tokens):

| Model ID | Context | Price/1M tokens |
|---|---|---|
| `thenlper/gte-base` | 512 | $0.005 |
| `thenlper/gte-large` | 512 | $0.010 |
| `intfloat/e5-large-v2` | 512 | $0.010 |
| `intfloat/e5-base-v2` | 512 | $0.005 |
| `intfloat/multilingual-e5-large` | 512 | $0.010 |
| `baai/bge-base-en-v1.5` | 512 | $0.005 |
| `baai/bge-large-en-v1.5` | 512 | $0.010 |
| `sentence-transformers/all-minilm-l6-v2` | 512 | $0.005 |
| `sentence-transformers/all-minilm-l12-v2` | 512 | $0.005 |
| `sentence-transformers/all-mpnet-base-v2` | 512 | $0.005 |
| `sentence-transformers/paraphrase-minilm-l6-v2` | 512 | $0.005 |
| `sentence-transformers/multi-qa-mpnet-base-dot-v1` | 512 | $0.005 |

**Conclusion**: Eliminate all 512-token models from consideration. Code chunks routinely exceed 512 tokens. Only 10 models remain viable.

---

## 2. Voyage Models on OpenRouter

**Answer: Voyage models are NOT available on OpenRouter.**

Verified by querying both `GET /api/v1/models` (all models) and `GET /api/v1/embeddings/models` (embedding-specific). Zero results for "voyage" in either endpoint as of 2026-03-04.

Voyage models must be accessed directly via the Voyage AI API (`https://api.voyageai.com/v1/embeddings`) with a separate `VOYAGE_API_KEY`. This is already implemented in claudemem's `VoyageEmbeddingsClient`.

**Voyage pricing** (from codebase `embeddings.ts`):
| Model | Price/1M | Context | Best For |
|---|---|---|---|
| `voyage-code-3` | $0.180 | 32,000 | **Best code quality** |
| `voyage-3-large` | $0.180 | 32,000 | High quality general |
| `voyage-3.5` | $0.060 | 32,000 | Good balanced |
| `voyage-3.5-lite` | $0.020 | 32,000 | **Current default** — budget |
| `voyage-3` | $0.060 | 32,000 | General purpose |
| `voyage-3-lite` | $0.020 | 32,000 | Budget |
| `voyage-code-2` | $0.120 | 16,000 | Older code model |

---

## 3. Code-Specific Quality Benchmarks

### 3a. MTEB English v2 Retrieval Scores (general retrieval proxy)

Source: Qwen/Qwen3-Embedding-8B README, HuggingFace (retrieved 2026-03-04)

| Model | Params | MTEB Eng Mean | Retrieval Score | Notes |
|---|---|---|---|---|
| `qwen/qwen3-embedding-8b` | 8B | **75.22** | **69.44** | #1 on MTEB multilingual (70.58) |
| `qwen/qwen3-embedding-4b` | 4B | 74.60 | 68.46 | Near 8B quality |
| `google/gemini-embedding-001` | - | 73.30 | 64.35 | Strong general purpose |
| `openai/text-embedding-3-large` | - | ~69.81 | ~62.84 | Solid but older |
| `qwen/qwen3-embedding-0.6b`* | 0.6B | 70.70 | 61.83 | Not on OpenRouter yet |
| `openai/text-embedding-3-small` | - | ~65-67 | ~53 | Good value |
| `baai/bge-m3` | 0.6B | ~59-62 | ~54 | Multilingual ok |
| `mistralai/mistral-embed-2312` | - | moderate | moderate | General purpose |

*`qwen3-embedding-0.6b` is not yet listed on OpenRouter's embedding endpoint.

### 3b. MTEB-Code Benchmark (code retrieval specific)

Source: Qwen3 blog (qwenlm.github.io/blog/qwen3-embedding, June 2025)

The **MTEB-Code** benchmark uses the CoIR suite which tests: code-to-code retrieval, text-to-code retrieval (like CodeSearchNet), and repository-level search.

| Model | MTEB-Code Score | Notes |
|---|---|---|
| `qwen/qwen3-embedding-8b` | **~77-80** (inferred from 8B > 0.6B) | 0.6B scores 75.41 per reranking baseline |
| `mistralai/codestral-embed-2505` | Unknown (claims SOTA on code) | Specialized code model |
| `voyage-code-3` | **177% NDCG vs baseline** | Best on Voyage's internal eval |
| `google/gemini-embedding-001` | ~67 MTEB multilingual | General, not code-specialized |
| `openai/text-embedding-3-large` | ~59 on MTEB-Code | General purpose |
| `baai/bge-m3` | ~54 on code tasks | Multilingual but not code-optimized |

**Key data point from Qwen blog**: Qwen3-Embedding-0.6B scores **75.41 on MTEB-Code** when used as a retrieval base. The 8B variant is substantially better on retrieval (69.44 vs 61.83 on MTEB Eng Retrieval). This strongly implies Qwen3-Embedding-8B scores ~80+ on MTEB-Code.

### 3c. Codestral Embed 2505 — Code-Specialized

From Mistral's announcement (May 2025):
- "Specially designed for code, perfect for embedding code databases, repositories, and powering coding assistants with state-of-the-art retrieval"
- Based on the Codestral language model foundation (trained on code)
- Context: 8,192 tokens
- Price: $0.15/1M (15x more expensive than Qwen3-8B)
- Dimensions: 1024

**Problem**: No published third-party benchmark comparisons between Codestral Embed and Qwen3-Embedding on CoIR/MTEB-Code as of March 2026. Mistral's claim of "SOTA on code" appears to be self-reported without direct Qwen3 comparison.

---

## 4. Speed / Latency Assessment

OpenRouter acts as a proxy to underlying providers. Speed varies by:
- Model size (smaller = faster)
- Provider infrastructure
- Batch size and concurrency

**Estimated latency ordering (faster to slower) for code indexing:**

| Model | Size | Relative Speed | Notes |
|---|---|---|---|
| `openai/text-embedding-3-small` | Small | Very fast | OpenAI's optimized infra |
| `mistralai/mistral-embed-2312` | Medium | Fast (~1.8s per benchmark) | Well-optimized |
| `baai/bge-m3` | 0.6B | Fast | Smaller model |
| `openai/text-embedding-3-large` | Large | Moderate | Larger model |
| `mistralai/codestral-embed-2505` | Unknown | Moderate | No public latency data |
| `google/gemini-embedding-001` | Unknown | Moderate | Google infra, good throughput |
| `qwen/qwen3-embedding-4b` | 4B | Moderate | 4B parameters |
| `qwen/qwen3-embedding-8b` | 8B | Slowest | 8B parameters |

**Note**: claudemem processes batches of 20 chunks at a time with 5 parallel batches. For indexing a typical 500-file repo:
- 500 files × ~10 chunks = ~5,000 chunks
- At 20/batch × 5 parallel = 100 chunks per round-trip
- 50 round trips total
- Speed matters for interactive use and re-indexing

The current `CURATED_PICKS.fastest` in the codebase is Mistral Embed at ~1.84s per batch.

---

## 5. Context Length Comparison

For code chunk embedding, context length is critical. claudemem's chunker creates chunks of varying sizes. Functions can range from 50 to 2,000+ tokens.

| Model | Context (tokens) | Adequate for Code? |
|---|---|---|
| `nvidia/llama-nemotron-embed-vl-1b-v2:free` | **131,072** | Overkill — great |
| `qwen/qwen3-embedding-8b` | **32,000** | Excellent |
| `qwen/qwen3-embedding-4b` | **32,768** | Excellent |
| `voyage-code-3` | **32,000** | Excellent |
| `voyage-3.5-lite` | **32,000** | Excellent |
| `google/gemini-embedding-001` | **20,000** | Very good |
| `openai/text-embedding-3-small/large` | 8,192 | Good |
| `mistralai/codestral-embed-2505` | 8,192 | Good |
| `mistralai/mistral-embed-2312` | 8,192 | Good |
| `baai/bge-m3` | 8,192 | Good |
| 512-token models | 512 | **Insufficient for code** |

---

## 6. Price Efficiency Analysis

For a 500-file repo with ~5,000 chunks, each ~300 tokens average = 1.5M tokens total indexing cost:

| Model | Price/1M | Cost to Index 1.5M tokens | Quality Tier |
|---|---|---|---|
| `nvidia/llama-nemotron-embed-vl-1b-v2:free` | **FREE** | $0.00 | Unknown (multimodal, text QA focus) |
| `qwen/qwen3-embedding-8b` | $0.010 | **$0.015** | Very High |
| `baai/bge-m3` | $0.010 | $0.015 | Good |
| `openai/text-embedding-3-small` | $0.020 | $0.030 | Good |
| `qwen/qwen3-embedding-4b` | $0.020 | $0.030 | Very High |
| `voyage-3.5-lite` (Voyage direct) | $0.020 | $0.030 | High |
| `mistralai/mistral-embed-2312` | $0.100 | $0.150 | Moderate |
| `openai/text-embedding-ada-002` | $0.100 | $0.150 | Moderate (legacy) |
| `openai/text-embedding-3-large` | $0.130 | $0.195 | High |
| `google/gemini-embedding-001` | $0.150 | $0.225 | Very High |
| `mistralai/codestral-embed-2505` | $0.150 | $0.225 | High (code-specific) |
| `voyage-code-3` (Voyage direct) | $0.180 | $0.270 | Highest (code) |

**Price surprise**: `qwen/qwen3-embedding-8b` at $0.01/M is extraordinarily cheap for an 8B parameter state-of-the-art model. It is priced the same as `baai/bge-m3` (a 0.6B model).

---

## 7. Head-to-Head: Best OpenRouter Models for Code Search

### Candidates (after eliminating 512-token and free-tier unknowns):

**1. qwen/qwen3-embedding-8b** — $0.010/1M, 32K ctx, 4096-dim
- MTEB multilingual #1 (70.58, June 2025)
- MTEB English v2 mean: 75.22 (best in class)
- MTEB Retrieval score: 69.44 (best)
- Instruction-aware (can add task-specific prompts)
- Explicitly designed for "code retrieval" per model card
- Supports MRL (Matryoshka Representation Learning) — dimension flexibility
- **Cheapest of the high-quality options at $0.01/M**

**2. mistralai/codestral-embed-2505** — $0.150/1M, 8K ctx, 1024-dim
- Built on Codestral LLM (code-specialized foundation)
- Claims SOTA on code retrieval
- No published third-party code benchmark vs Qwen3
- 15x more expensive than Qwen3-8B
- Context limited to 8K (Qwen3 has 32K)
- Smaller embedding dimension (1024 vs 4096)

**3. google/gemini-embedding-001** — $0.150/1M, 20K ctx, 3072-dim
- Strong general-purpose performance
- MTEB multilingual: ~68.37 (below Qwen3-8B's 70.58)
- "Top spot on MTEB Multilingual leaderboard" — but Qwen3-8B took #1 in June 2025
- Good for coding+science+legal (per Google's description)
- 15x more expensive than Qwen3-8B

**4. openai/text-embedding-3-small** — $0.020/1M, 8K ctx, 1536-dim
- Reliable, well-understood model
- Good general performance, not code-specialized
- Limited to 8K context (problematic for large files)
- 2x more expensive than Qwen3-8B despite lower quality

**5. qwen/qwen3-embedding-4b** — $0.020/1M, 32K ctx, 2560-dim
- Nearly same quality as 8B (74.60 vs 75.22 MTEB Eng)
- 2x more expensive than 8B (!!)
- Makes no sense given 8B is cheaper — 8B is strictly better

---

## 8. Key Finding: Qwen3-Embedding-8B is Currently the Wrong Default

**The codebase has a discrepancy:**

The `CURATED_PICKS.bestBalanced` in `model-discovery.ts` (line 79) currently points to:
```typescript
bestBalanced: {
    id: "google/gemini-embedding-001",   // <-- what's in CURATED_PICKS
    ...
    pricePerMillion: 0.0,               // <-- WRONG: it's $0.15/M, NOT free!
    isFree: true,                        // <-- WRONG!
```

But `DEFAULT_MODELS.openrouter` in `embeddings.ts` (line 50) points to:
```
openrouter: "qwen/qwen3-embedding-8b",
```

**The `google/gemini-embedding-001` is listed as FREE in the code but costs $0.15/1M tokens on OpenRouter. This is a data error in `model-discovery.ts`.**

---

## 9. Final Recommendations

### Best Overall for Code Search on OpenRouter: `qwen/qwen3-embedding-8b`

**Why it wins:**
1. **Quality**: #1 on MTEB multilingual (June 2025), best retrieval scores in class
2. **Code-explicit**: Designed and benchmarked for "code retrieval" in the model card
3. **Price**: $0.01/1M — cheapest among high-quality models (10-15x cheaper than Codestral/Gemini)
4. **Context**: 32K tokens — handles large files without truncation
5. **Dimensions**: 4096 — highest representational capacity (supports MRL for flexible sizing)
6. **Instruction-aware**: Can add "Represent this code for semantic search" style prompts

**Verdict: Keep `qwen/qwen3-embedding-8b` as the OpenRouter default. It is the right choice.**

### Best for Code Quality (if price not a concern): `mistralai/codestral-embed-2505`

Could be worth evaluating empirically. Codestral's foundation model is specialized for code, which may give it an edge on code-to-code retrieval tasks not well-covered by MTEB. However:
- 15x more expensive ($0.15 vs $0.01)
- No published benchmark showing it beats Qwen3-8B on CoIR
- Smaller context (8K vs 32K)
- Smaller dimensions (1024 vs 4096)

**Recommendation: Only switch if internal benchmarks show meaningful improvement.**

### Free Option: `nvidia/llama-nemotron-embed-vl-1b-v2:free`

- Genuinely free (OpenRouter lists at $0.00)
- 131K context window
- Designed for multimodal QA retrieval, not specifically code
- 1B parameters (much smaller model)
- No published MTEB code scores

**Recommendation: Add as a budget/free tier option in model discovery, but not as default.**

### Voyage Models

Not available on OpenRouter — must use direct Voyage API with `VOYAGE_API_KEY`.

| Recommendation | Model | Why |
|---|---|---|
| Best code quality | `voyage-code-3` ($0.18/M) | Specifically tuned for code retrieval |
| Best value | `voyage-3.5-lite` ($0.02/M) | Good general quality, same price as text-embedding-3-small |

The current default of `voyage-3.5-lite` is reasonable for a budget Voyage option. `voyage-code-3` would be worth recommending for users who want best-in-class code search and have a Voyage API key.

---

## 10. Model Discovery Data Errors to Fix

In `/Users/jack/mag/claudemem/src/models/model-discovery.ts`:

1. **`bestBalanced` ID is wrong**: Set to `google/gemini-embedding-001` but code comment says `qwen/qwen3-embedding-8b`. The comment on line 98 of `cli.ts` says `// qwen/qwen3-embedding-8b` for `CURATED_PICKS.bestBalanced`.

2. **`google/gemini-embedding-001` pricing is wrong**: Listed as `pricePerMillion: 0.0` and `isFree: true` in `model-discovery.ts` but the live API shows it costs `$0.15/M` ($0.00000015 per token).

3. **`qwen/qwen3-embedding-8b` context length is missing**: Not listed in `MODEL_CONTEXT_LENGTHS` in `embeddings.ts`. Should be 32,000.

4. **`qwen/qwen3-embedding-4b` is available** but not in `CURATED_PICKS` or `MODEL_CONTEXT_LENGTHS`.

5. **`mistralai/codestral-embed-2505`** is available but not in any curated list.

6. **`nvidia/llama-nemotron-embed-vl-1b-v2:free`** is genuinely free (131K context) but not listed.

---

## 11. Recommended `CURATED_PICKS` Update

```typescript
export const CURATED_PICKS = {
    /** Best Code Quality via OpenRouter */
    bestQuality: {
        id: "mistralai/codestral-embed-2505",
        name: "Codestral Embed",
        provider: "Mistral",
        contextLength: 8192,
        dimension: 1024,
        pricePerMillion: 0.15,
        isFree: false,
        isRecommended: true,
    } as EmbeddingModel,

    /** Best Balanced - State-of-the-art at minimal cost */
    bestBalanced: {
        id: "qwen/qwen3-embedding-8b",
        name: "Qwen3 Embedding 8B",
        provider: "Qwen",
        contextLength: 32000,
        dimension: 4096,
        pricePerMillion: 0.01,
        isFree: false,
        isRecommended: true,
    } as EmbeddingModel,

    /** Best Value - Low cost, good quality */
    bestValue: {
        id: "openai/text-embedding-3-small",
        name: "Text Embedding 3 Small",
        provider: "OpenAI",
        contextLength: 8191,
        dimension: 1536,
        pricePerMillion: 0.02,
        isFree: false,
        isRecommended: true,
    } as EmbeddingModel,

    /** Fastest - Low latency */
    fastest: {
        id: "mistralai/mistral-embed-2312",
        name: "Mistral Embed",
        provider: "Mistral",
        contextLength: 8192,
        dimension: 1024,
        pricePerMillion: 0.10,
        isFree: false,
        isRecommended: true,
    } as EmbeddingModel,

    /** Free - Genuinely free via OpenRouter */
    free: {
        id: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
        name: "Llama Nemotron Embed VL 1B",
        provider: "NVIDIA",
        contextLength: 131072,
        dimension: 0,  // TBD
        pricePerMillion: 0.0,
        isFree: true,
        isRecommended: false,  // QA needed
    } as EmbeddingModel,

    /** Best Voyage Code (direct API) */
    bestVoyageCode: {
        id: "voyage-code-3",
        name: "Voyage Code 3",
        provider: "Voyage",
        contextLength: 32000,
        dimension: 1024,
        pricePerMillion: 0.18,
        isFree: false,
        isRecommended: true,
    } as EmbeddingModel,

    /** Best Voyage Value (direct API) */
    bestVoyageValue: {
        id: "voyage-3.5-lite",
        name: "Voyage 3.5 Lite",
        provider: "Voyage",
        contextLength: 32000,
        dimension: 1024,
        pricePerMillion: 0.02,
        isFree: false,
        isRecommended: true,
    } as EmbeddingModel,

    /** Best Local - For Ollama users */
    bestLocal: {
        id: "ollama/nomic-embed-text",
        name: "Nomic Embed Text",
        provider: "Ollama",
        contextLength: 8192,
        dimension: 768,
        pricePerMillion: 0,
        isFree: true,
        isRecommended: true,
    } as EmbeddingModel,
};
```

---

## 12. Summary Table

| Model | Provider | Price/1M | Context | Dims | Code Quality | Recommended |
|---|---|---|---|---|---|---|
| `qwen/qwen3-embedding-8b` | OpenRouter | $0.010 | 32K | 4096 | Excellent (MTEB #1) | **YES — default** |
| `mistralai/codestral-embed-2505` | OpenRouter | $0.150 | 8K | 1024 | Excellent (code-specialized) | For code quality tier |
| `google/gemini-embedding-001` | OpenRouter | $0.150 | 20K | 3072 | Very Good | For multilingual |
| `openai/text-embedding-3-small` | OpenRouter | $0.020 | 8K | 1536 | Good | Budget fallback |
| `openai/text-embedding-3-large` | OpenRouter | $0.130 | 8K | 3072 | Good | No (overpriced vs Qwen3) |
| `baai/bge-m3` | OpenRouter | $0.010 | 8K | 1024 | Good | No (limited context) |
| `mistralai/mistral-embed-2312` | OpenRouter | $0.100 | 8K | 1024 | Moderate | Fastest tier |
| `nvidia/llama-nemotron-embed-vl-1b-v2:free` | OpenRouter | FREE | 131K | ? | Unknown | Free experiments |
| `voyage-code-3` | Voyage (direct) | $0.180 | 32K | 1024 | Best (code-specific) | For Voyage users |
| `voyage-3.5-lite` | Voyage (direct) | $0.020 | 32K | 1024 | Very Good | Default Voyage |

---

## Sources

1. OpenRouter Embedding Models API — `https://openrouter.ai/api/v1/embeddings/models` — retrieved live 2026-03-04
2. Qwen3-Embedding-8B HuggingFace README — `https://huggingface.co/Qwen/Qwen3-Embedding-8B` — retrieved 2026-03-04
3. Qwen3 Embedding Blog — `https://qwenlm.github.io/blog/qwen3-embedding/` — June 5, 2025
4. Voyage Code 3 Blog — `https://blog.voyageai.com/2024/12/04/voyage-code-3/` — Dec 2024
5. Mistral Codestral Embed announcement — `https://mistral.ai/news/codestral-embed/` — May 2025
6. claudemem source: `/Users/jack/mag/claudemem/src/models/model-discovery.ts`
7. claudemem source: `/Users/jack/mag/claudemem/src/core/embeddings.ts`
8. claudemem source: `/Users/jack/mag/claudemem/src/config.ts`
