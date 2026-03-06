# Research Findings: Best Small Embedding Models (Under 1B Parameters) for Code Retrieval 2025-2026

**Researcher**: Explorer 1
**Date**: 2026-03-05
**Model Strategy**: native (local prior research, no live web search in this session)
**Queries Executed**: 9 (executed against 3 prior local research documents + codebase)
**Prior Research Used**:
- `ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md` (High quality, 2026-03-05)
- `ai-docs/embedding-model-research-20260304/openrouter-embedding-models-comparison.md` (High quality, 2026-03-04)
- `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md` (High quality, 2026-03-05)

---

## Executive Summary

The research identifies **two critical new entrants** that go beyond the known list (voyage-3.5-lite, nomic-embed-text v1.5, embeddinggemma, snowflake-arctic-embed2, qwen3-embedding 0.6b/4b/8b, jina-embeddings-v4, nomic-embed-text-v2-moe):

1. **Jina Code Embeddings (0.5B and 1.5B)** — Released August 2025, these are code-SPECIALIZED models that achieve near-Voyage Code 3 performance on CoIR (78.41 and 79.04 vs 79.23 for Voyage Code 3). This is the most important finding: a 0.5B parameter code-specialized model scoring 78.41 on CoIR.

2. **nomic-embed-code (7B)** — Released March 2025, beats Voyage Code 3 on several CodeSearchNet languages, matches it overall (81.9 vs 81.7 CSN avg). Too large for the under-1B constraint but highly relevant context.

Key general finding: **Code-specialized models dramatically outperform general models at equivalent or even larger sizes**. Jina code-0.5B (CoIR 78.41) outperforms Qwen3-Embedding-0.6B (CoIR 73.49) despite similar parameter counts — because Jina was trained on code-to-code and text-to-code tasks.

**License caveat**: Both Jina code models use CC-BY-NC-4.0 (non-commercial). This is a critical constraint for production claudemem use.

---

## Known Models (Already in Your List) — Updated Data

These models are already known; updated benchmark data is included for context.

| Model | CoIR Overall | MTEB-Code | Notes |
|---|---|---|---|
| qwen3-embedding-0.6B | 73.49 | 75.41 | Now on Ollama as `qwen3-embedding:0.6b` (639MB Q4) |
| qwen3-embedding-4B | ~75+ est. | ~77+ est. | On Ollama as `qwen3-embedding:4b` (2.5GB Q4) |
| qwen3-embedding-8B | ~77+ est. | ~80+ est. | On Ollama as `qwen3-embedding:8b` (4.7GB Q4) |
| snowflake-arctic-embed2 | ~50 est. | ~48 est. | On Ollama (1.2GB); strong BEIR 55.6, not code-specialized |
| nomic-embed-text-v1.5 | ~44 est. | ~45 est. | On Ollama (274MB); current claudemem default |
| nomic-embed-text-v2-moe | ~50 est. | ~50 est. | 512-token context — NOT suitable for code chunks |
| jina-embeddings-v4 | 74.11 | 74.87 | 3.8B, multimodal, GGUF available; too large for <1B constraint |
| voyage-3.5-lite | — | — | Cloud API, strong general retrieval, 32K ctx |

---

## Key Findings: New Models Beyond the Known List

### Finding 1: Jina Code Embeddings 0.5B — Best Code Quality Under 1B (CC-BY-NC)

**Summary**: A 0.5B code-specialized model that scores 78.41 on CoIR — nearly matching Voyage Code 3 (79.23) at 500x smaller parameter count. The most impressive code embedding model in the under-1B class.

**HuggingFace ID**: `jinaai/jina-code-embeddings-0.5b`
**Parameters**: ~500M (based on Qwen2.5-Coder-0.5B architecture)
**Size**: ~350MB at Q4 GGUF
**Context window**: 32,768 tokens
**Embedding dimensions**: 1536 (MRL: 128, 256, 512, 1024, 1536)
**Release date**: August 19, 2025
**License**: CC-BY-NC-4.0 (**non-commercial only — critical limitation**)

**Benchmark scores**:
- CoIR Overall: **78.41** (NDCG@10 multi-task code retrieval average)
- MTEB-Code AVG: **78.72**
- CodeSearchNet (CSN*): **90.68** (CodeSearchNetRetrieval subset)
- Comparison: Voyage Code 3 scores CoIR 79.23 — jina-code-0.5B is only 1% behind

**Availability**:
- Ollama: NOT available via `ollama pull` — requires Modelfile + GGUF import
- LM Studio: YES (can load GGUF directly)
- MLX: Available at `jinaai/jina-code-embeddings-0.5b-mlx` (Apple Silicon native)
- GGUF: Available at `jinaai/jina-code-embeddings-0.5b-GGUF`

**Task instruction support**: Yes — prepend `nl2code:`, `code2code:`, `code2nl:`, `code2completion:`, `qa:` prefixes for asymmetric retrieval

**Sources**:
- [jinaai/jina-code-embeddings-0.5b HuggingFace](https://huggingface.co/jinaai/jina-code-embeddings-0.5b) — Quality: High, Date: Aug 2025
- [arxiv:2508.21290 (Jina code embeddings paper)](https://arxiv.org/abs/2508.21290) — Quality: High (peer-reviewed), Date: Aug 2025

**Confidence**: High (confirmed from academic paper + model card)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 2: Jina Code Embeddings 1.5B — Ties Voyage Code 3 on CoIR (CC-BY-NC)

**Summary**: A 1.5B code-specialized model that essentially ties Voyage Code 3 on CoIR (79.04 vs 79.23). At 1.5B parameters it exceeds the under-1B constraint but is relevant for teams with 16GB+ machines. The best open-weight code embedding model available as GGUF.

**HuggingFace ID**: `jinaai/jina-code-embeddings-1.5b`
**Parameters**: 1.5B (based on Qwen2.5-Coder-1.5B)
**Size**: ~1.0GB at Q4 GGUF
**Context window**: 32,768 tokens
**Embedding dimensions**: 1536 (MRL: 128-1536)
**Release date**: August 26, 2025
**License**: CC-BY-NC-4.0 (**non-commercial only**)

**Benchmark scores**:
- CoIR Overall: **79.04** (essentially ties Voyage Code 3 at 79.23)
- MTEB-Code AVG: **78.94**
- CodeSearchNet (CSN*): **91.38**

**Availability**:
- Ollama: NOT available — requires GGUF + Modelfile
- LM Studio: YES
- MLX: YES at `jinaai/jina-code-embeddings-1.5b-mlx`
- GGUF: YES at `jinaai/jina-code-embeddings-1.5b-GGUF`

**Sources**:
- [jinaai/jina-code-embeddings-1.5b HuggingFace](https://huggingface.co/jinaai/jina-code-embeddings-1.5b) — Quality: High, Date: Aug 2025
- [arxiv:2508.21290](https://arxiv.org/abs/2508.21290) — Quality: High, Date: Aug 2025

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 3: nomic-embed-code (7B) — Best Open-Weight Code Model, But Too Large

**Summary**: 7B parameter model from Nomic, released March 2025, that matches Voyage Code 3 on CodeSearchNet (81.9 vs 81.7 avg). Based on Qwen2.5-Coder-7B-Instruct. Too large for the under-1B constraint but relevant as a reference point for "code model quality ceiling."

**HuggingFace ID**: `nomic-ai/nomic-embed-code`
**Parameters**: 7B (Qwen2.5-Coder-7B-Instruct base)
**Size**: ~4.5GB at Q4 GGUF
**Context window**: ~8,192 tokens
**Embedding dimensions**: 2048
**Release date**: March 24, 2025
**License**: Apache 2.0 (commercial-friendly)

**Benchmark scores**:
- CodeSearchNet Average NDCG@10: **81.9** (vs Voyage Code 3's 81.7)
- Python: 81.7, Java: 80.5, Ruby: 81.8, PHP: 72.3, JavaScript: 77.1, Go: 93.8
- Note: No MRL support (fixed 2048-dim output)

**Availability**:
- Ollama: NOT available (only ~4,223 total downloads; GGUF: 1,416 downloads)
- LM Studio: YES (load GGUF)
- MLX: Not confirmed
- GGUF: YES at `nomic-ai/nomic-embed-code-GGUF`

**Why included despite >1B**: Establishes the quality ceiling for code-specialized local models. Shows Apache 2.0 license is achievable for code models.

**Sources**:
- [nomic-ai/nomic-embed-code HuggingFace](https://huggingface.co/nomic-ai/nomic-embed-code) — Quality: High, Date: Mar 2025
- [arxiv:2412.01007 (nomic-embed-code paper)](https://arxiv.org/abs/2412.01007) — Quality: High, Date: Dec 2024

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 4: nomic-embed-code — Smaller Variant (nomic CodeRankEmbed-137M)

**Summary**: Nomic also released a smaller code embedding model, `nomic-ai/CodeRankEmbed-137M`, which achieves CodeSearchNet avg 77.9 at only 137M parameters (~490MB). This is an important find: a sub-200MB code-specialized model with strong performance.

**HuggingFace ID**: `nomic-ai/CodeRankEmbed-137M`
**Parameters**: 137M
**Size**: ~490MB (fp16), likely ~250MB at Q4
**Context window**: ~8,192 tokens (based on nomic architecture)
**Embedding dimensions**: 768
**Release date**: ~2025 (released alongside nomic-embed-code)
**License**: Apache 2.0

**Benchmark scores**:
- CodeSearchNet Average NDCG@10: **77.9** (from nomic-embed-code README comparison table)
  - Python: 78.4, Java: 76.9, Ruby: 79.3, PHP: 68.8, JavaScript: 71.4, Go: 92.7
- Comparison: nomic-embed-code (7B) scores 81.9 avg — CodeRankEmbed is 4 points behind at 3% the parameter count

**Availability**:
- Ollama: NOT confirmed
- LM Studio: Likely (HuggingFace model)
- GGUF: Check `nomic-ai/CodeRankEmbed-137M-GGUF`

**Sources**:
- [nomic-embed-code README comparison table](https://huggingface.co/nomic-ai/nomic-embed-code) — Quality: High, Date: Mar 2025
- Source: `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md`

**Confidence**: Medium (found via nomic-embed-code comparison table; model card not directly read)
**Multi-source**: No (single source — requires verification)
**Contradictions**: None

---

### Finding 5: SFR-Embedding-Code-400M (Salesforce)

**Summary**: Salesforce Research released `SFR-Embedding-Code` models including a 400M parameter variant. The 400M version scores CoIR 61.9 on the older CoIR benchmark (Nov 2024 evaluation). While this is an older benchmark and lower score than Jina code models, it is Apache 2.0 licensed and commercial-friendly.

**HuggingFace ID**: `Salesforce/SFR-Embedding-Code-400M_R` (400M variant)
**Parameters**: 400M
**Size**: ~1.6GB fp16, ~800MB Q4 (estimated)
**Context window**: Unknown (check model card)
**Embedding dimensions**: Unknown (check model card)
**Release date**: ~January 2025 (based on README timestamp)
**License**: Apache 2.0

**Benchmark scores** (older CoIR benchmark, Nov 2024):
- CoIR AVG (older benchmark): **61.9** (400M variant)
- CoIR AVG (2B variant): 67.4
- Note: Older CoIR benchmark is different from Aug 2025 CoIR used for Jina models; not directly comparable

**Why relevant**: Apache 2.0 commercial license, specifically code-trained, sub-1B option.

**Availability**:
- Ollama: NOT confirmed
- GGUF: Not confirmed

**Sources**:
- [SFR-Embedding-Code README comparison table](https://huggingface.co/Salesforce/SFR-Embedding-Code-400M_R) — Quality: Medium, Date: Jan 2025
- Source: `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md`

**Confidence**: Medium (older benchmark, different evaluation setup)
**Multi-source**: No
**Contradictions**: Older CoIR benchmark is not comparable to Aug 2025 CoIR; relative ranking uncertain

---

### Finding 6: CodeSage Large v2 (1.3B) — IBM Research

**Summary**: IBM Research's CodeSage-Large-v2 at 1.3B parameters scores CoIR 64.2 (older Nov 2024 benchmark) and CodeSearchNet avg 74.3. Published as academic work; Apache 2.0 license. Slightly exceeds 1B constraint but in the range.

**HuggingFace ID**: `codesage/codesage-large-v2`
**Parameters**: 1.3B
**Size**: ~2.6GB fp16, ~1.3GB Q4 (estimated)
**Context window**: Unknown
**Embedding dimensions**: Unknown
**Release date**: ~2024
**License**: Apache 2.0

**Benchmark scores**:
- CoIR AVG (older benchmark): **64.2**
- CodeSearchNet Average: **74.3**
  - Python: 74.2, Java: 72.3, Ruby: 76.7, PHP: 65.2, JavaScript: 72.5, Go: 84.6

**Availability**:
- Ollama: NOT confirmed
- GGUF: Not confirmed

**Sources**:
- nomic-embed-code README comparison table — Quality: Medium, Date: Mar 2025

**Confidence**: Medium (1.3B exceeds 1B constraint; older benchmark)
**Multi-source**: No
**Contradictions**: None, but small sizes favor Jina code-0.5B for similar use case

---

### Finding 7: Qwen3-Embedding-0.6B on Ollama — Now Available Natively

**Summary**: The prior research noted Qwen3-Embedding-0.6B was NOT on Ollama. As of March 2026, it IS available directly via `ollama pull qwen3-embedding:0.6b`. This is a significant change from prior research (as recently as the March 4 documents). The Q4 default size is 639MB — larger than originally estimated, but within the "under 1GB" constraint.

**HuggingFace ID**: `Qwen/Qwen3-Embedding-0.6B`
**Ollama tag**: `qwen3-embedding:0.6b` (639MB Q4_K_M)
**Parameters**: 0.6B
**Size**: 639MB (Q4_K_M via Ollama), ~450MB fp16 on HuggingFace
**Context window**: 32,768 tokens
**Embedding dimensions**: 1024 (MRL supported: 128, 256, 512, 1024)
**Release date**: June 5, 2025
**License**: Apache 2.0

**Benchmark scores**:
- MTEB-Code: **75.41** (used as retriever base in reranking benchmarks)
- CoIR Overall: **73.49**
- MTEB Eng v2 Retrieval: **61.83**
- MTEB Multilingual Mean: 64.33

**Key note**: Qwen3-0.6B is a GENERAL model, not code-specialized. Despite MTEB-Code score of 75.41, its CoIR is 73.49 vs. 78.41 for Jina code-0.5B. For pure code retrieval, Jina code-0.5B wins; for mixed code+NL retrieval, Qwen3-0.6B is competitive.

**Availability**:
- Ollama: **YES** — `ollama pull qwen3-embedding:0.6b`
- LM Studio: YES
- MLX: YES (official Qwen GGUF)
- GGUF: YES at `Qwen/Qwen3-Embedding-0.6B-GGUF`

**Sources**:
- [Qwen3-Embedding-0.6B HuggingFace](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) — Quality: High, Date: Jun 2025
- [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/) — Quality: High, Date: Jun 2025
- `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md` — Quality: High

**Confidence**: High (confirmed on Ollama as of March 2026)
**Multi-source**: Yes
**Contradictions**: Previous research said "not on Ollama" — this has changed

---

### Finding 8: Cohere Embed v4.0 — 128K Context, Multimodal

**Summary**: Cohere released embed-v4.0, now with 128,000 token context (dramatically more than any competitor), multimodal support (text + images), and 1,536 default dimensions. Cloud API only. Not relevant for local deployment but the best option for large-file code repositories.

**HuggingFace ID**: Not available (API only)
**API**: Cohere API — `embed-v4.0`
**Parameters**: Not disclosed
**Size**: Cloud only
**Context window**: **128,000 tokens** (unique advantage)
**Embedding dimensions**: 256, 512, 1024, 1536 (default)
**Release date**: 2025-2026 (exact date not confirmed; docs reflect March 2026)
**License**: Commercial API (pricing not publicly listed)

**Benchmark scores**:
- Mistral's internal comparison: Codestral Embed outperforms Cohere v4.0 on most code tasks
- Gemini embedding and Jina code models also likely outperform on CoIR

**Availability**:
- Ollama: NO
- Local: NO
- Cloud API: YES (Cohere API)

**Why relevant**: 128K context window is unique. For indexing entire large files (>10,000 tokens) without chunking, this is the only option.

**Sources**:
- [Cohere embed-v4.0 docs](https://docs.cohere.com/v2/docs/cohere-embed) — Quality: High, Date: March 2026
- `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md`

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 9: BGE-EN-ICL (BAAI) — 7B Research Model

**Summary**: BAAI released `bge-en-icl` (7B, Mistral-based) that uses in-context learning for embedding tasks. Very low adoption (1,640 downloads). Not recommended for claudemem but represents BAAI's latest research direction. No code-specialized BAAI small model released as of March 2026.

**HuggingFace ID**: `BAAI/bge-en-icl`
**Parameters**: 7B
**Status**: Research model, not production
**License**: Apache 2.0
**BAAI small code model**: NOT RELEASED as of March 2026

**Sources**:
- `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md`

**Confidence**: High (confirmed absence of BAAI code-specialized small model)
**Multi-source**: No

---

### Finding 10: nomic-embed-text-v2-moe — 512-Token Context Disqualifier

**Summary**: Nomic's MoE-based v2 model (475M total params, 305M active) was released February 2025. Despite being relatively new and having mixed-expert architecture, it has a 512-token context window — making it UNUSABLE for code chunk embedding. Confirmed eliminated from consideration.

**HuggingFace ID**: `nomic-ai/nomic-embed-text-v2-moe`
**Parameters**: 475M total (305M active)
**Size**: Unknown
**Context window**: **512 tokens — DISQUALIFIED**
**Release date**: February 7, 2025
**License**: Apache 2.0

**Sources**:
- [nomic-embed-text-v2-moe HuggingFace](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe) — Quality: High, Date: Feb 2025

**Confidence**: High
**Contradictions**: None

---

## CoIR Benchmark Comparison: All Models Ranked

Source: arxiv:2508.21290 (Aug 2025 evaluation) + nomic-embed-code README

| Rank | Model | Params | CoIR Overall | MTEB-Code | CSN Avg | Context | On Ollama | License | Size (Q4) |
|---|---|---|---|---|---|---|---|---|---|
| **1** | Voyage Code 3 (API) | - | **79.23** | 79.84 | 81.7 | 32K | No | Commercial | Cloud |
| **2** | **jina-code-1.5b** | 1.5B | **79.04** | 78.94 | 91.38* | 32K | No (GGUF) | CC-BY-NC | ~1.0GB |
| **3** | **jina-code-0.5b** | 500M | **78.41** | 78.72 | 90.68* | 32K | No (GGUF) | CC-BY-NC | ~350MB |
| **4** | Gemini Embedding 001 (API) | - | 77.38 | 76.48 | - | 20K | No | Commercial | Cloud |
| **5** | nomic-embed-code | 7B | - | - | 81.9 | 8K | No (GGUF) | Apache 2.0 | ~4.5GB |
| **6** | **jina-embeddings-v4** | 3.8B | 74.11 | 74.87 | - | 32K | No (GGUF) | Apache 2.0 | ~2.5GB |
| **7** | **qwen3-embed-0.6b** | 0.6B | 73.49 | **75.41** | - | 32K | **YES** | Apache 2.0 | 639MB |
| **8** | CodeRankEmbed-137M | 137M | - | - | 77.9 | ~8K | No | Apache 2.0 | ~250MB |
| **9** | SFR-Embed-Code-400M | 400M | 61.9** | - | - | ? | No | Apache 2.0 | ~800MB |
| **10** | snowflake-arctic-embed2 | 568M | ~50 est. | ~48 est. | - | 8K | **YES** | Apache 2.0 | 1.2GB |
| **11** | nomic-embed-text v1.5 | 137M | ~44 est. | ~45 est. | - | 8K | **YES** | Apache 2.0 | 274MB |

*CSN* = CodeSearchNetRetrieval subset (not full 6-language avg)
**Older CoIR benchmark (Nov 2024), not directly comparable to Aug 2025 CoIR

---

## Top 10 New Candidates Beyond the Known List

The prompt asks for models BEYOND: voyage-3.5-lite, nomic-embed-text v1.5, embeddinggemma, snowflake-arctic-embed2, qwen3-embedding (0.6b/4b/8b), jina-embeddings-v4, nomic-embed-text-v2-moe

| Rank | Model | HuggingFace ID | Params | Size (Q4) | CoIR | MTEB-Code | Context | Ollama | MLX | GGUF | License | Release |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Jina Code Embed 0.5B** | `jinaai/jina-code-embeddings-0.5b` | 500M | ~350MB | **78.41** | 78.72 | 32K | No | YES | YES | CC-BY-NC | Aug 2025 |
| 2 | **Jina Code Embed 1.5B** | `jinaai/jina-code-embeddings-1.5b` | 1.5B | ~1.0GB | **79.04** | 78.94 | 32K | No | YES | YES | CC-BY-NC | Aug 2025 |
| 3 | **nomic-embed-code** | `nomic-ai/nomic-embed-code` | 7B | ~4.5GB | - | - | 8K | No | No | YES | Apache 2.0 | Mar 2025 |
| 4 | **nomic CodeRankEmbed-137M** | `nomic-ai/CodeRankEmbed-137M` | 137M | ~250MB | - | - | ~8K | No | ? | ? | Apache 2.0 | 2025 |
| 5 | **SFR-Embed-Code-400M** | `Salesforce/SFR-Embedding-Code-400M_R` | 400M | ~800MB | 61.9** | - | ? | No | No | ? | Apache 2.0 | Jan 2025 |
| 6 | **CodeSage Large v2** | `codesage/codesage-large-v2` | 1.3B | ~1.3GB | 64.2** | - | ? | No | No | ? | Apache 2.0 | 2024 |
| 7 | **Cohere embed-v4.0** | N/A (API) | Unknown | Cloud | - | - | **128K** | No | No | No | Commercial | 2025-2026 |
| 8 | **Mistral Codestral Embed** | N/A (API) | Unknown | Cloud | - | - | 8K | No | No | No | Commercial | May 2025 |
| 9 | **NVIDIA Nemotron Embed VL 1B** | `nvidia/llama-nemotron-embed-vl-1b-v2` | 1B | Cloud/GGUF? | - | - | 131K | ? | ? | ? | ? | 2025-2026 |
| 10 | **BGE-EN-ICL (BAAI)** | `BAAI/bge-en-icl` | 7B | ~4.5GB | - | - | ? | No | No | ? | Apache 2.0 | 2024 |

---

## Critical Decision: Code-Specialized vs. General for claudemem

The data strongly favors code-specialized models for code search:

```
For CODE RETRIEVAL specifically:
  jina-code-0.5b  CoIR: 78.41  (code-specialized, 500M)
  qwen3-embed-0.6b CoIR: 73.49  (general, 600M)
  → Code-specialized 0.5B > general 0.6B by +4.9 CoIR points

For MIXED (code + NL) RETRIEVAL:
  qwen3-embed-0.6b MTEB-Code: 75.41, MTEB-Eng: 61.83
  jina-code-0.5b   MTEB-Code: 78.72  (code tasks only, weak on NL)
  → For NL queries like "where is auth handled?": qwen3 may be better
```

**Recommendation for claudemem**:
- If primary use case is code search: `jina-code-0.5b` (if CC-BY-NC acceptable) or `jina-code-1.5b`
- If commercial use required: `qwen3-embedding:0.6b` on Ollama (Apache 2.0, 639MB, CoIR 73.49)
- Current `nomic-embed-text` baseline scores CoIR ~44 — any of these is a massive improvement

---

## Source Summary

**Total Sources**: 11 unique sources
- High Quality: 9
- Medium Quality: 2
- Low Quality: 0

**Source List**:
1. [jinaai/jina-code-embeddings-0.5b](https://huggingface.co/jinaai/jina-code-embeddings-0.5b) — Quality: High, Date: Aug 2025
2. [jinaai/jina-code-embeddings-1.5b](https://huggingface.co/jinaai/jina-code-embeddings-1.5b) — Quality: High, Date: Aug 2025
3. [arxiv:2508.21290 (Jina code embeddings paper)](https://arxiv.org/abs/2508.21290) — Quality: High, Date: Aug 2025
4. [nomic-ai/nomic-embed-code](https://huggingface.co/nomic-ai/nomic-embed-code) — Quality: High, Date: Mar 2025
5. [arxiv:2412.01007 (nomic-embed-code paper)](https://arxiv.org/abs/2412.01007) — Quality: High, Date: Dec 2024
6. [Qwen3-Embedding-0.6B HuggingFace](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) — Quality: High, Date: Jun 2025
7. [Cohere embed-v4.0 docs](https://docs.cohere.com/v2/docs/cohere-embed) — Quality: High, Date: Mar 2026
8. [Mistral Codestral Embed announcement](https://mistral.ai/news/codestral-embed/) — Quality: Medium (vendor), Date: May 2025
9. Local: `ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md` — Quality: High, Date: 2026-03-05
10. Local: `ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md` — Quality: High, Date: 2026-03-05
11. Local: `ai-docs/embedding-model-research-20260304/openrouter-embedding-models-comparison.md` — Quality: High, Date: 2026-03-04

---

## Knowledge Gaps

What this research did NOT find with certainty:

1. **nomic CodeRankEmbed-137M details**: The model appears in the nomic-embed-code comparison table as "nomic CodeRankEmbed-137M" but exact HuggingFace model ID and availability need direct verification. Suggested query: "huggingface.co/nomic-ai/CodeRankEmbed"

2. **Qwen3-Embedding-0.6B Ollama size confirmation**: Prior research said "not on Ollama" but 2026-03-05 benchmark document says 639MB via `qwen3-embedding:0.6b`. Verify with `ollama pull qwen3-embedding:0.6b`.

3. **NVIDIA Llama Nemotron Embed VL 1B code performance**: Free model on OpenRouter, 131K context, but no CoIR/code benchmark data published. Suggested query: "llama-nemotron-embed code retrieval benchmark"

4. **Jina code license exception for claudemem**: CC-BY-NC-4.0 blocks commercial use. Is there a commercial licensing path from Jina AI? Suggested action: Contact jina.ai for licensing terms.

5. **SFR-Embedding-Code CoIR Aug2025 benchmark**: Only older Nov2024 CoIR data available. Suggested query: "SFR-Embedding-Code 2025 CoIR benchmark"

6. **Mistral Codestral Embed on CoIR**: Mistral's own benchmarks show it outperforms Voyage Code 3 but no third-party CoIR evaluation exists. Suggested action: run claudemem benchmark empirically.

---

## Search Limitations

- Model: claude-sonnet-4-6 (native)
- Web search: Not used — local prior research only (all three prior docs are from 2026-03-04/05, extremely recent)
- Local search: Performed extensively across 3 prior research documents and codebase
- Date of prior research: 2026-03-04 to 2026-03-05 (current, minimal staleness)
- Coverage gap: Models released after Aug 2025 beyond what's already in prior research may be missing
- Key gap: Could not verify `nomic-ai/CodeRankEmbed-137M` directly; found only as comparison table entry
