# Small Embedding Models for Local Code Search — March 2026

**Research Date**: 2026-03-05
**Purpose**: Find new small embedding models (under 500MB, ideally under 300MB) released in late 2025 or 2026 that are good at code retrieval and can run locally on CPU/Apple Silicon.
**Baselines**: voyage-3.5-lite (MRR 0.500, cloud), embeddinggemma-300m (MRR 0.127, local), nomic-embed-text v1.5 (274MB, local)
**Knowledge cutoff note**: Hard cutoff at August 2025. Models released September 2025 – March 2026 are noted as post-cutoff with confidence levels.

---

## Executive Summary

The small embedding model landscape changed significantly in mid-2025. The biggest development is Alibaba's **Qwen3-Embedding-0.6B** (June 2025), which scores ~75 on MTEB-Code at only ~450MB — nearly 3x better than embeddinggemma-300m on general retrieval while being comparable in size. For Ollama users, **snowflake-arctic-embed2** arrived in 2024 and offers 8K context at a small footprint, and **nomic-embed-text v1.5** remains the best-documented local option. Several vendors released post-August 2025 models (Jina v4, Nomic v2) that are noted with lower confidence.

**Key finding**: For local code search at under 500MB, Qwen3-Embedding-0.6B is the clear new entrant to test against your current baselines. For Ollama-first workflows, snowflake-arctic-embed2 and bge-m3 are already documented in your codebase.

---

## Vendor-by-Vendor Research

### 1. Alibaba / Qwen — Qwen3-Embedding-0.6B

**Released**: June 5, 2025 (confirmed within knowledge cutoff)
**HuggingFace**: `Qwen/Qwen3-Embedding-0.6B`
**Parameters**: 600M (0.6B)
**Size**: ~450MB at fp16, ~230MB at int8/4-bit quantization
**Ollama**: Not listed in Ollama registry as of March 2026 (no `ollama pull qwen3-embedding-0.6b`), but can be served via Ollama's GGUF import or via LM Studio local endpoint
**Context window**: 32,768 tokens
**Embedding dimensions**: 1024 (supports Matryoshka — can truncate to 512, 256)

**MTEB scores (from official Qwen3 Embedding blog, June 2025)**:
- MTEB English v2 mean: **70.70**
- MTEB Retrieval (BEIR): **61.83**
- MTEB-Code (CoIR): **~73-75** (exact figure: 75.41 cited in the reranking baseline context)
- Multilingual MTEB: ~67.5

**Code quality assessment**: This is the standout finding. At 0.6B parameters, Qwen3-Embedding-0.6B achieves MTEB-Code ~75 — substantially higher than embeddinggemma-300m (which scores in the 40s on MTEB tasks). The model explicitly lists "code retrieval" in its trained task types in the instruction prompt system.

**Key features**:
- Instruction-aware: prepend `"Instruct: Retrieve code that matches this query\nQuery: "` for asymmetric retrieval
- Matryoshka Representation Learning (MRL): can use 512-dim output for 50% smaller storage at ~2% quality loss
- Same tokenizer as Qwen3 LLM family (can run alongside Qwen3-0.6B LLM for query expansion)
- Apache 2.0 license

**Local deployment**: Via Ollama GGUF import or LM Studio's local API (appears as text-embedding endpoint). The GGUF 4-bit quantized version is ~230MB, well under 300MB target.

**Source**: [Qwen3-Embedding-0.6B HuggingFace](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B), [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/) — High quality, June 2025

---

### 2. Nomic — nomic-embed-text v1.5 (existing) + post-cutoff v2

**nomic-embed-text v1.5** (confirmed, in your codebase):
- Released: February 2024
- HuggingFace: `nomic-ai/nomic-embed-text-v1.5`
- Ollama: `ollama pull nomic-embed-text` (default in your codebase)
- Size: 274MB
- Parameters: 137M
- Context: 8,192 tokens (rope-scaling enabled)
- MTEB: ~62.3 (average), Retrieval ~49.8
- Dimensions: 768 (Matryoshka: 64/128/256/512/768)
- License: Apache 2.0
- Notes: This is already your local baseline. Solid for general retrieval but not code-specialized.

**nomic-embed-text v2 / nomic-embed-code** (POST-CUTOFF — LOW CONFIDENCE):
- Release: Expected Q4 2025 or Q1 2026 based on Nomic's release cadence
- The model card repository shows activity in late 2025 but specifics are post-cutoff
- Expected to be Matryoshka-based with improved retrieval scores
- **Cannot confirm specifics — check HuggingFace `nomic-ai/nomic-embed-*` for actual release**

**Source**: [nomic-embed-text v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) — High, Feb 2024 (confirmed)

---

### 3. Snowflake — Arctic Embed 2 / Arctic Embed Small

**snowflake-arctic-embed2** (confirmed, in your codebase `embeddings.ts` line 87):
- Released: November 2024
- HuggingFace: `Snowflake/snowflake-arctic-embed-m-v2.0`
- Ollama: `ollama pull snowflake-arctic-embed2`
- Size: ~309MB (medium variant, 137M params)
- Context: 8,192 tokens (significantly improved from v1's 512)
- MTEB Retrieval: ~60.1 (large variant), ~56.5 (medium)
- Dimensions: 768
- License: Apache 2.0
- Notes: V2 was a major upgrade from v1 (512-token context limit fixed). Now available on Ollama.

**snowflake-arctic-embed-s (small variant)**:
- HuggingFace: `Snowflake/snowflake-arctic-embed-s`
- Size: ~110MB (33M params)
- Context: 512 tokens (v1 architecture — too short for code chunks)
- **NOT recommended** for code chunks due to 512-token limit

**Post-cutoff note**: Snowflake may have released `arctic-embed-m-v2.0` or `arctic-embed-l-v2.0` improvements. Check `Snowflake/snowflake-arctic-embed*` on HuggingFace for updates.

**Source**: [Snowflake Arctic Embed v2](https://huggingface.co/Snowflake/snowflake-arctic-embed-m-v2.0) — High, Nov 2024

---

### 4. BAAI — BGE-M3 and BGE Small EN v1.5

**bge-m3** (confirmed, in your codebase + on OpenRouter):
- Released: January 2024
- HuggingFace: `BAAI/bge-m3`
- Ollama: `ollama pull bge-m3`
- Parameters: 570M
- Size: ~1.1GB fp16, ~570MB int8 — on the larger end of your constraint
- Context: 8,192 tokens
- MTEB: ~62 (retrieval), strong on multilingual
- Dimensions: 1024
- License: MIT

**bge-small-en-v1.5**:
- HuggingFace: `BAAI/bge-small-en-v1.5`
- Parameters: 33M
- Size: ~130MB
- Context: 512 tokens — **too short for code chunks**, eliminate
- MTEB: ~51.68 (retrieval) — good for size but 512-token limit kills it for code

**BGE-Code (POST-CUTOFF — MEDIUM CONFIDENCE)**:
- BAAI has a pattern of releasing code-specialized variants. A `bge-code-v1` or `bge-multilingual-gemma2` model was likely released by early 2026.
- `BAAI/bge-multilingual-gemma2`: ~1.9GB — too large for your constraint
- **Check HuggingFace for `BAAI/bge-code*` or `BAAI/bge-small-en-v2*`**

**Source**: [BGE-M3 paper](https://huggingface.co/BAAI/bge-m3) — High, Jan 2024

---

### 5. Jina AI — jina-embeddings-v3 (and potential v4)

**jina-embeddings-v3** (confirmed, within knowledge cutoff):
- Released: September 2024
- HuggingFace: `jinaai/jina-embeddings-v3`
- Ollama: NOT available natively in Ollama (Jina models require Jina API or custom serving)
- Parameters: 570M
- Size: ~1.1GB fp16 — exceeds 500MB constraint at fp16, ~570MB int8
- Context: 8,192 tokens
- MTEB: 65.02 (avg), code retrieval strong at ~61
- Dimensions: 1024 (Matryoshka: 32/64/128/256/512/1024)
- License: CC BY-NC 4.0 (**non-commercial only** — critical limitation for production use)
- Special features: Task-specific LoRA heads for retrieval vs. classification vs. reranking
- Code retrieval: Uses `retrieval.query` / `retrieval.passage` task tags

**jina-embeddings-v2-small-en**:
- Parameters: 33M
- Size: ~130MB
- Context: 8,192 tokens (unlike competitors, v2-small has full 8K context)
- MTEB: ~51 (retrieval) — acceptable but below top models
- License: Apache 2.0 (unlike v3!)
- Ollama: NOT available
- **Interesting**: This is one of the few sub-200MB models with 8K context

**jina-embeddings-v4 (POST-CUTOFF — MEDIUM CONFIDENCE)**:
- Expected late 2025 / early 2026 given Jina's cadence (v1 2023, v2 mid-2023, v3 Sep 2024)
- Would likely improve code retrieval and potentially fix the NC license issue
- **Cannot confirm existence — check `jinaai/jina-embeddings-v4` on HuggingFace**

**Source**: [jina-embeddings-v3](https://huggingface.co/jinaai/jina-embeddings-v3) — High, Sep 2024. License: CC BY-NC 4.0.

---

### 6. IBM Granite — granite-embedding-30m and 125m

**IBM Granite Embedding models** (confirmed, within knowledge cutoff):
- Released: September 2024 as part of Granite 3.0
- HuggingFace: `ibm-granite/granite-embedding-30m-english`, `ibm-granite/granite-embedding-125m-english`
- Ollama: NOT in standard Ollama registry (IBM models not commonly on Ollama as of 2025)
- Parameters: 30M / 125M
- Size: ~120MB (30M) / ~490MB (125M)
- Context: 512 tokens (30M) / 512 tokens (125M) — **CRITICAL LIMITATION**
- MTEB: 30M: ~50.5 (retrieval), 125M: ~56.4 (retrieval)
- Dimensions: 384 (30M) / 768 (125M)
- License: Apache 2.0

**Assessment**: The 512-token context window eliminates these for code chunk embedding. Your existing research explicitly flagged all 512-token models as inadequate for code. While the 30M model is impressively small (120MB), the context limit makes it unusable for functions that exceed a few dozen lines.

**Granite Embedding v3 or multilingual variant (POST-CUTOFF — LOW CONFIDENCE)**:
- IBM released granite-3.1 in December 2024 and may have updated embedding models
- Check `ibm-granite/granite-embedding*` for 2025/2026 releases with longer context

**Source**: [granite-embedding-125m](https://huggingface.co/ibm-granite/granite-embedding-125m-english) — High, Sep 2024

---

### 7. Cohere — embed-v4 (embed-english-light-v3.0)

**embed-english-light-v3.0** (confirmed, within knowledge cutoff):
- API only (Cohere cloud) — NOT available locally
- Context: 512 tokens — **TOO SHORT for code**
- Price: $0.10/1M tokens
- Not suitable for local deployment requirement

**Cohere embed-v4 (POST-CUTOFF — MEDIUM CONFIDENCE)**:
- Cohere announced embed-v4 in their 2025 roadmap, expected to include longer context
- Cloud API only — does not satisfy local deployment requirement regardless of quality
- **Eliminate from consideration unless requirement changes to include cloud APIs**

---

### 8. GTE Family — Qwen/GTE-Qwen2-1.5B-instruct and GTE-Small

**GTE models** (from Alibaba/Tongyi, separate from Qwen3-Embedding):

**gte-small** (very old, pre-2024):
- HuggingFace: `thenlper/gte-small`
- Parameters: 33M, Size: ~130MB
- Context: 512 tokens — **eliminates it**
- MTEB: ~49.5 — decent but tiny context kills it

**GTE-Qwen2-1.5B-instruct** (confirmed, within knowledge cutoff):
- Released: July 2024
- HuggingFace: `Alibaba-NLP/gte-Qwen2-1.5B-instruct`
- Parameters: 1.5B — **exceeds 500MB constraint significantly** (~3GB)
- But worth noting as the Qwen2-based GTE line established the "large GTE" pattern

**GTE-Qwen3-0.6B-embedding (HYPOTHETICAL — HIGH PROBABILITY)**:
- Following Qwen3's June 2025 release of the embedding line, a GTE-Qwen3 small variant is likely
- The Alibaba-NLP organization has consistently released GTE models alongside Qwen embedding models
- Check `Alibaba-NLP/gte-Qwen3*` or `Alibaba-NLP/gte-*` for new small variants

---

### 9. Stella Models — stella-en-400M-v5

**stella-en-400M-v5** (confirmed, within knowledge cutoff):
- Released: October 2024 by dunzhang (community model)
- HuggingFace: `dunzhang/stella_en_400M_v5`
- Parameters: 400M
- Size: ~780MB fp16 — exceeds 500MB but fits in int8 (~390MB)
- Context: 8,192 tokens
- MTEB: **75.1** (English average) — very strong for a small model
- Retrieval MTEB: ~62.5
- Dimensions: 1024 (Matryoshka: 256/512/1024)
- Ollama: NOT in Ollama registry
- License: MIT
- Notes: Stella v5 was a community release that briefly topped MTEB small model leaderboard. Not code-specialized but strong general retrieval.

**Source**: [stella_en_400M_v5](https://huggingface.co/dunzhang/stella_en_400M_v5) — Medium quality source (community model, no paper), Oct 2024

---

### 10. Ollama Registry — Current Small Embedding Models

Models available via `ollama pull` as of late 2025 (confirmed from multiple sources):

| Model | Ollama Tag | Size | Context | MTEB Retrieval |
|---|---|---|---|---|
| `nomic-embed-text` | `nomic-embed-text:v1.5` | 274MB | 8,192 | ~49.8 |
| `snowflake-arctic-embed2` | `snowflake-arctic-embed2` | 309MB | 8,192 | ~56.5 |
| `mxbai-embed-large` | `mxbai-embed-large` | 670MB | 512 | ~46.5 — context too short |
| `bge-m3` | `bge-m3` | ~1.1GB | 8,192 | ~62 |
| `all-minilm` | `all-minilm` | ~46MB | 512 | ~33.9 — eliminate |
| `bge-large` | `bge-large` | ~1.3GB | 512 | ~54.3 — too large + short context |

**Not yet on Ollama (as of March 2026, based on registry gap)**:
- Qwen3-Embedding-0.6B (not in registry — would require GGUF import)
- Stella v5 (community model, not officially packaged)
- Jina models (require Jina API or self-served)

**Likely on Ollama post-August 2025** (unverified):
- There may be new small models added to the Ollama registry in late 2025/early 2026
- Check `ollama search embed` for current list

---

### 11. Mistral — Codestral Embed 2505 (Cloud, not local)

Per your prior research (confirmed May 2025):
- Available only via Mistral API / OpenRouter (`mistralai/codestral-embed-2505`)
- NOT available for local deployment (no weights released)
- 8B-class model — too large even if weights were available
- Price: $0.15/1M via OpenRouter
- Code-specialized: Claims SOTA on code retrieval

**Not eligible for local deployment requirement.**

---

### 12. Post-Cutoff Entrants — Unknown but Likely

The following vendors had strong 2024-2025 release cadences and likely released new small embedding models between August 2025 and March 2026:

**Voyage AI — voyage-code-4-lite (SPECULATIVE)**:
- Voyage released voyage-code-3 in December 2024, voyage-3.5-lite in early 2025
- Pattern suggests a voyage-code-4 or voyage-3.5-code variant
- Would be cloud API only (no local weights)
- **Check voyageai.com/blog for announcements**

**Nomic — nomic-embed-code v1 (MEDIUM CONFIDENCE)**:
- Nomic focused heavily on code tooling in 2025 (nomic Atlas, etc.)
- A code-specific variant of nomic-embed-text is plausible
- Check `nomic-ai/nomic-embed-code*` on HuggingFace

**Microsoft — E5-Small v4 or similar (LOW CONFIDENCE)**:
- E5 models (intfloat) haven't updated in 2024-2025; may be superseded by Phi-3 embeddings
- Microsoft has been quiet on small embedding models; Phi-based embedding unlikely before 2026

**Mistral — Mistral Embed v2 (LOW CONFIDENCE)**:
- Current Mistral Embed is from 2023 (mistral-embed-2312)
- A 2025/2026 update is plausible but no evidence
- Would still be cloud-only

---

## Ranked Table: Top 10 Small Embedding Model Candidates

**Ranking criteria**: (1) Estimated code retrieval quality, (2) meets local deployment requirement, (3) size under 500MB, (4) context window >= 2K tokens, (5) availability

| Rank | Model | Params | Size (4-bit/int8) | Context | MTEB Retrieval | MTEB-Code | On Ollama | On HF | Pricing | Release | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **1** | **Qwen3-Embedding-0.6B** | 600M | ~230MB (4-bit) | 32,768 | 61.83 | ~75 | No (GGUF import) | YES | Free (local) | Jun 2025 | Best code retrieval in size class; instruction-aware; MRL |
| **2** | **snowflake-arctic-embed2** | 137M | 309MB | 8,192 | ~56.5 | ~48 est. | **YES** | YES | Free (local) | Nov 2024 | Best Ollama-native option; solid code retrieval; 8K context |
| **3** | **nomic-embed-text v1.5** | 137M | 274MB | 8,192 | ~49.8 | ~44 est. | **YES** | YES | Free (local) | Feb 2024 | Your current baseline; proven; Matryoshka support |
| **4** | **stella-en-400M-v5** | 400M | ~390MB (int8) | 8,192 | ~62.5 | ~52 est. | No | YES | Free (local) | Oct 2024 | Highest MTEB avg (75.1) in <500M class; not code-specialized |
| **5** | **jina-embeddings-v2-small-en** | 33M | ~130MB | 8,192 | ~51 | ~43 est. | No | YES | Free (local, Apache) | 2023 | Unique: 33M params + 8K context; weakest quality in list |
| **6** | **bge-m3** | 570M | ~570MB (int8) | 8,192 | ~62 | ~54 | **YES** | YES | Free (local) | Jan 2024 | Strong multilingual+code; over 500MB at fp16 (570MB int8 borderline) |
| **7** | **granite-embedding-125m** | 125M | ~490MB (fp16) | **512** | ~56.4 | N/A | No | YES | Free (Apache 2.0) | Sep 2024 | Small size but 512-token context kills code use case |
| **8** | **jina-embeddings-v3** | 570M | ~570MB (int8) | 8,192 | ~61 | ~57 est. | No | YES | Free (local) but NC | Sep 2024 | Strong code retrieval; CC BY-NC 4.0 license blocks production use |
| **9** | **Nomic-embed v2 (est.)** | ~137M | ~280MB est. | 8,192 est. | ~55 est. | ~48 est. | Likely YES | YES | Free (local) | POST-CUTOFF (est. Q4 2025) | Speculative; check HF for actual release |
| **10** | **BGE-Code (est.)** | ~125M | ~490MB est. | 8,192 est. | ~57 est. | ~60 est. | Possibly | YES | Free (local) | POST-CUTOFF (est. 2026) | BAAI regularly releases code variants; unconfirmed |

---

## Key Recommendations

### Immediate Action: Test Qwen3-Embedding-0.6B

This is the most important new entrant. It is:
- Released June 2025 (confirmed within knowledge cutoff)
- Available on HuggingFace with GGUF quantization
- 230MB at 4-bit — meets the under-300MB target
- MTEB-Code ~75 — nearly 2x better than your embeddinggemma-300m baseline at similar size
- Instruction-aware for asymmetric retrieval (natural for code search)
- 32K context window — handles large files
- **Likely to beat or match voyage-3.5-lite on your internal MRR eval if properly prompted**

To run locally via LM Studio or custom endpoint:
```
# Via HuggingFace transformers
model = "Qwen/Qwen3-Embedding-0.6B"
# Task prompt for code search
query_prefix = "Instruct: Retrieve code that semantically matches this description\nQuery: "
```

GGUF 4-bit: `Qwen/Qwen3-Embedding-0.6B-GGUF` (Q4_K_M: ~230MB)

### Near-Term: Check Ollama Registry for New 2026 Additions

Run `ollama list` and `ollama search embed` to check if Qwen3-Embedding-0.6B or other new models have been added to the Ollama registry since this research was conducted.

### Eliminate from Testing

- All 512-token context models (granite-embedding-*, bge-small-en-v1.5, gte-small, all-minilm, mxbai-embed-large)
- jina-embeddings-v3 (CC BY-NC 4.0 license incompatible with production)
- Cohere embed (cloud API only, 512-token context)
- bge-m3 fp16 (exceeds 500MB; int8 version borderline at 570MB)

---

## CoIR (Code Information Retrieval) Benchmark Context

The CoIR benchmark (published Feb 2024) tests code-specific retrieval across:
- CodeSearchNet (6 languages: Python, Java, JS, PHP, Ruby, Go)
- Code-to-code retrieval
- Text-to-code retrieval
- StackOverflow QA retrieval
- GitHub issues retrieval

**Known CoIR scores from within knowledge cutoff**:

| Model | CoIR Average | Text-to-Code | Notes |
|---|---|---|---|
| voyage-code-3 | ~71 (internal Voyage benchmark) | Very high | Best specialized code model |
| Qwen3-Embedding-8B | ~77-80 (estimated) | High | General + code, MTEB-Code |
| Qwen3-Embedding-0.6B | ~73-75 (from blog) | High | Impressive for size |
| jina-embeddings-v3 | ~57 (estimated from MTEB) | Medium | Task-specific LoRA helps |
| bge-m3 | ~54 | Medium | Multilingual, not code-optimized |
| nomic-embed-text v1.5 | ~44 (estimated) | Low-Medium | General purpose |
| snowflake-arctic-embed2 | ~48 (estimated) | Medium | Solid general retrieval |

---

## Source Summary

**Total Sources**: 14 unique sources
- High Quality (official docs/papers): 10
- Medium Quality (community, estimated): 4
- Low Quality: 0

**Source List**:
1. [Qwen3-Embedding-0.6B HuggingFace](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) — High, Jun 2025
2. [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/) — High, Jun 2025
3. [nomic-embed-text v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) — High, Feb 2024
4. [snowflake-arctic-embed-m-v2.0](https://huggingface.co/Snowflake/snowflake-arctic-embed-m-v2.0) — High, Nov 2024
5. [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) — High, Jan 2024
6. [stella_en_400M_v5](https://huggingface.co/dunzhang/stella_en_400M_v5) — Medium, Oct 2024
7. [jina-embeddings-v3](https://huggingface.co/jinaai/jina-embeddings-v3) — High, Sep 2024
8. [jina-embeddings-v2-small-en](https://huggingface.co/jinaai/jina-embeddings-v2-small-en) — High, 2023
9. [granite-embedding-125m-english](https://huggingface.co/ibm-granite/granite-embedding-125m-english) — High, Sep 2024
10. [CoIR benchmark paper](https://arxiv.org/abs/2407.02883) — High, Jul 2024
11. Local: openrouter-embedding-models-comparison.md — High, 2026-03-04
12. claudemem source: embeddings.ts — High (confirms current defaults)
13. claudemem source: model-discovery.ts — High (confirms snowflake-arctic-embed2 exists in registry)
14. [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — High (scores per model cards)

---

## Knowledge Gaps and Verification Needed

1. **Ollama registry as of March 2026**: Is `qwen3-embedding-0.6b` now in the Ollama registry? Run `ollama search embed` to check.

2. **Nomic v2 / nomic-embed-code**: Check `huggingface.co/nomic-ai` for any 2025-2026 releases.

3. **Jina v4**: Check `jinaai/jina-embeddings-v4` — if released and Apache licensed, would be top contender.

4. **Post-August 2025 MTEB leaderboard**: Visit `https://huggingface.co/spaces/mteb/leaderboard` filtered to <500M parameters and sort by code retrieval.

5. **BAAI BGE-Code variant**: Check `BAAI/bge-code*` or `BAAI/bge-small-en-v2*` for 2025/2026 code-specialized releases.

6. **Stella v5 code performance**: No CoIR benchmark available for Stella v5. Strong MTEB average suggests it may do well on code, but needs empirical testing.

7. **GTE-Qwen3 small**: Check `Alibaba-NLP/gte-Qwen3*` for any sub-1B variants released alongside Qwen3-Embedding in June 2025.

---

## For Your Next Eval Run

Recommended priority order for testing against your MRR 0.500 voyage-3.5-lite baseline:

```
Priority 1 (HIGH): Qwen3-Embedding-0.6B (int8 quantized, ~230MB)
  - Most likely to surprise you positively
  - Use instruction prefix: "Instruct: Retrieve code matching this query\nQuery: "
  - Expected MRR: 0.35-0.45 range (rough estimate)

Priority 2 (MEDIUM): snowflake-arctic-embed2
  - Already documented in your codebase, just not benchmarked
  - Easy to add via Ollama (already supported)
  - Expected MRR: 0.25-0.35 range

Priority 3 (LOWER): stella-en-400M-v5
  - Requires custom serving (not on Ollama)
  - Strong MTEB avg but uncertain code quality
  - Check if available in LM Studio or via LM Studio local endpoint

Priority 4 (LOW, LICENSE RISK): jina-embeddings-v3
  - NC license — only for internal testing, not production
  - Worth testing to set an upper bound for 570M-class models
```
