# Research Synthesis: Best Small Embedding Models for Code Search

**Date**: 2026-03-05
**Session**: dev-research-best-small-embedding-models-20260305-014126-c427cf93
**Sources Processed**: 3 explorers, 20+ unique underlying sources
**Iteration**: 1

---

## Key Findings

### 1. Jina Code Embeddings 0.5B: Best Under-1B Code Specialist (CC-BY-NC License) [CONSENSUS: UNANIMOUS]

**Summary**: A 0.5B parameter code-specialized model (Qwen2.5-Coder base, August 2025) achieves CoIR 78.41 — only 0.82 points below Voyage Code 3 (79.23). This is the most important finding: the performance gap between the best API model and a 350MB local model is essentially negligible for code retrieval.

**Evidence**:
- CoIR Overall NDCG@10: **78.41** [Sources: arxiv:2508.21290, jinaai/jina-code-embeddings-0.5b HF card]
- MTEB-Code AVG: **78.72** [Sources: arxiv:2508.21290]
- Context window: **32,768 tokens** [Sources: explorer-1, explorer-2]
- Size at Q4 GGUF: **~350MB** [Sources: explorer-1, explorer-2]
- NOT on Ollama registry — requires GGUF manual import or LM Studio [Sources: explorer-1, explorer-2]

**Critical limitation**: License is **CC-BY-NC-4.0** (non-commercial use only). For production mnemex distribution, this is a blocker unless commercial license obtained from Jina AI.

**Supporting Sources**: 3 (arxiv paper + 2 HF model cards)
**Quality**: High

---

### 2. Qwen3-Embedding-0.6B: Best Apache 2.0 Small Model, On Ollama [CONSENSUS: UNANIMOUS — with size discrepancy]

**Summary**: Qwen3-Embedding-0.6B (June 2025, Apache 2.0) achieves CoIR 73.49 / MTEB-Code 75.41 — strong performance for a general model, and it is the best commercially-licensed option available natively on Ollama.

**Evidence**:
- CoIR Overall NDCG@10: **73.49** [Sources: arxiv:2508.21290 via explorer-1 and explorer-2]
- MTEB-Code: **75.41** [Sources: Qwen3 blog, arxiv:2506.05176 via explorer-2 and explorer-3]
- Context window: **32,768 tokens** [Sources: all 3 explorers]
- License: **Apache 2.0** [Sources: all 3 explorers]
- Ollama availability: **YES as of March 2026** — `ollama pull qwen3-embedding:0.6b` [Sources: explorer-1, explorer-2]

**Size discrepancy (CONTRADICTORY)**: Explorer-1 and Explorer-2 report 639MB Q4_K_M via Ollama. Explorer-3 reports ~230MB Q4_K_M from HuggingFace GGUF. Likely explanation: Ollama uses Q4_K_M with larger overhead (639MB) while raw GGUF on HuggingFace is ~230MB. The 639MB is the operative number for `ollama pull`.

**Instruction prefix required**: Queries must use "Instruct: Retrieve code matching this query\nQuery: {query}" prefix for best performance. Code chunks/passages need NO prefix (asymmetric retrieval).

**Supporting Sources**: 4 (Qwen3 blog + arxiv + HF card + local research)
**Quality**: High

---

### 3. Code-Specialized Training Dominates Raw Parameter Count [CONSENSUS: UNANIMOUS]

**Summary**: A 0.5B code-specialist (CoIR 78.41) outperforms a 3.8B general model with code adapter (CoIR 74.11) and a 0.6B general model (CoIR 73.49). Code-specific training objectives are the primary driver of code retrieval quality, not model scale.

**Evidence**:
- Jina code-0.5B (500M, code-specialist) CoIR 78.41 > Jina v4 (3.8B, general) CoIR 74.11 [Sources: arxiv:2508.21290]
- Jina code-0.5B (500M) CoIR 78.41 > Qwen3-0.6B (600M, general) CoIR 73.49 [Sources: arxiv:2508.21290]
- mnemex internal NDCG: voyage-code-3 outperforms text-embedding-3-small by 24% relative on real code queries [Sources: explorer-2 citing internal benchmark]
- nomic-embed-text (our current baseline, 137M, general) estimated CoIR ~44 — massive gap to code-specialized models [Sources: explorer-1, explorer-2]

**Supporting Sources**: 3
**Quality**: High

---

### 4. nomic CodeRankEmbed-137M: Tiny Code Specialist Needing Verification [CONSENSUS: STRONG]

**Summary**: A 137M parameter code-specialized model from Nomic achieving CodeSearchNet avg 77.9 — competitive with models 10x its size. If confirmed, it would be an exceptional baseline candidate: under 250MB, Apache 2.0, code-specialized.

**Evidence**:
- CodeSearchNet 6-language avg: **77.9** (Python 78.4, Java 76.9, Ruby 79.3, PHP 68.8, JS 71.4, Go 92.7) [Sources: nomic-embed-code README, confirmed by explorer-1 and explorer-2]
- License: Apache 2.0 [Sources: explorer-1]
- Size: ~250MB estimated [Sources: explorer-1]
- Ollama: NOT available [Sources: explorer-1, explorer-2]

**Verification gap**: No CoIR Overall or MTEB-Code score published. The 77.9 CSN score is from the nomic-embed-code comparison table — model card not independently read. HuggingFace ID needs direct confirmation.

**Supporting Sources**: 2 (both from nomic-embed-code README, not independently sourced)
**Quality**: Medium

---

### 5. Three-Tier Quality Structure for Code Retrieval [CONSENSUS: UNANIMOUS]

**Summary**: There is a clear three-tier structure: Tier A (code-specialists, CoIR 78-80), Tier B (strong general models, CoIR 73-77), and Tier C (legacy general models, CoIR/MTEB ~44-55). The Tier A/B gap is specifically attributable to code-specialized training.

**Evidence**:
- Tier A: jina-code-0.5B (78.41), jina-code-1.5B (79.04), Voyage Code 3 API (79.23) [Sources: arxiv:2508.21290]
- Tier B: Qwen3-0.6B (73.49), Jina v4 (74.11), Gemini 001 API (77.38) [Sources: arxiv:2508.21290]
- Tier C: nomic-embed-text v1.5 (~44 est.), snowflake-arctic-embed2 (~50 est.) [Sources: explorer-1, explorer-2]
- Current mnemex default (nomic-embed-text) is Tier C — any candidate upgrade is a massive improvement [Sources: explorer-1, explorer-2]

**Supporting Sources**: 3
**Quality**: High

---

## Unified Candidate Ranking

Sorted by expected code retrieval quality (CoIR when available, CSN avg otherwise).

| Rank | Model | Params | Size (Q4) | CoIR | MTEB-Code | CSN Avg | Context | License | Ollama | Release | Notes |
|------|-------|--------|-----------|------|-----------|---------|---------|---------|--------|---------|-------|
| 1 | voyage-3.5-lite (baseline) | API | Cloud | ~50 est. | — | — | 32K | Commercial | No | 2024 | Current mnemex cloud baseline; MRR 0.500 internal |
| 2 | jina-code-embeddings-1.5b | 1.5B | ~1.0GB | **79.04** | 78.94 | 91.38* | 32K | **CC-BY-NC** | No (GGUF) | Aug 2025 | Best open-weight code model; non-commercial only |
| 3 | jina-code-embeddings-0.5b | 0.5B | ~350MB | **78.41** | 78.72 | 90.68* | 32K | **CC-BY-NC** | No (GGUF) | Aug 2025 | Best sub-1B code model; non-commercial only |
| 4 | nomic-embed-code | 7B | ~4.5GB | — | — | 81.2 | 8K | Apache 2.0 | No (GGUF) | Mar 2025 | Best Apache 2.0 code model; too large for most |
| 5 | jina-embeddings-v4 | 3.8B | ~2.5GB | 74.11 | 74.87 | — | 32K | **CC-BY-NC** | No (GGUF) | 2025 | Multimodal; still CC-BY-NC |
| 6 | qwen3-embedding-0.6b | 0.6B | 639MB | **73.49** | **75.41** | — | 32K | Apache 2.0 | **YES** | Jun 2025 | Best Apache 2.0 sub-1B; native Ollama |
| 7 | nomic CodeRankEmbed-137M | 137M | ~250MB | — | — | **77.9** | ~8K | Apache 2.0 | No | 2025 | Tiny code specialist; needs verification |
| 8 | SFR-Embedding-Code-400M | 400M | ~800MB | 61.9** | — | — | ? | Apache 2.0 | No | Jan 2025 | Older CoIR suite; lower quality |
| 9 | CodeSage Large v2 | 1.3B | ~1.3GB | 64.2** | — | 74.3 | ? | Apache 2.0 | No | 2024 | Older CoIR suite; exceeds 1B constraint |
| 10 | snowflake-arctic-embed2 | 568M | ~309MB | ~50 est. | ~48 est. | — | 8K | Apache 2.0 | **YES** | 2024 | Best simple Ollama option; general model |
| 11 | nomic-embed-text v1.5 (baseline) | 137M | 274MB | ~44 est. | ~44 est. | — | 8K | Apache 2.0 | **YES** | 2023 | Current mnemex local default |
| 12 | nomic-embed-text-v2-moe | 475M | — | — | — | — | **512** | Apache 2.0 | No | Feb 2025 | **DISQUALIFIED** — 512-token context |
| 13 | embeddinggemma (baseline) | ~300M | ~300MB | — | — | — | ? | ? | No | 2024 | Current test; MRR 0.127 internal |

*CSN score uses CSN* subset (CodeSearchNetRetrieval), not full 6-language suite
**Older CoIR benchmark (Nov 2024), not comparable to Aug 2025 CoIR suite used for rows 2-3, 6

**Cloud/API models for reference**:

| Model | CoIR | MTEB-Code | Context | License | Notes |
|-------|------|-----------|---------|---------|-------|
| Voyage Code 3 | **79.23** | 79.84 | 32K | Commercial | Gold standard for code |
| Gemini Embedding 001 | 77.38 | 76.48 | 20K | Commercial | Strong general |
| Codestral Embed 2505 | — (est. ~80?) | — | 8K | Commercial | Self-reported only; no independent CoIR |
| Cohere embed-v4.0 | — | — | **128K** | Commercial | Unique large-context option |

---

## Top 5 Benchmark Candidates

### 1. qwen3-embedding:0.6b — Primary Local Candidate (Apache 2.0)

**Why**: The only sub-1B model that is (a) on Ollama natively, (b) Apache 2.0 licensed, (c) has a published CoIR score (73.49), and (d) has a 32K context window. Closest to a drop-in replacement for nomic-embed-text with dramatically better code retrieval. The 639MB Ollama size fits in 8GB unified memory machines. Instruction prefix needed for queries.

**Key stats**: 0.6B params, 639MB via Ollama, CoIR 73.49, MTEB-Code 75.41, 32K ctx, Apache 2.0
**Setup**: `ollama pull qwen3-embedding:0.6b`
**Risk**: Requires query-side instruction prefix; may need code changes to `LocalEmbeddingsClient`

---

### 2. jina-code-embeddings-0.5b — Best Code Quality if CC-BY-NC Acceptable

**Why**: The only sub-1B model in Tier A (CoIR 78.41). Outperforms qwen3-0.6b by +4.92 CoIR points for code-specific retrieval. At ~350MB GGUF, it is smaller than qwen3-0.6b on Ollama. If mnemex is used only internally/non-commercially, this is the optimal local model.

**Key stats**: 500M params, ~350MB Q4 GGUF, CoIR 78.41, MTEB-Code 78.72, 32K ctx, CC-BY-NC
**Setup**: GGUF import via Ollama or LM Studio (one-time, ~5 minutes)
**Risk**: CC-BY-NC blocks commercial distribution; requires GGUF manual import (not `ollama pull` native)

---

### 3. nomic CodeRankEmbed-137M — Tiny Code Specialist (Needs Verification)

**Why**: If the 77.9 CSN avg score holds up on independent evaluation, this 137M model (~250MB) would be the best code model per-megabyte by a wide margin. Apache 2.0, would slot below nomic-embed-text in size but far above it in code quality.

**Key stats**: 137M params, ~250MB est., CoIR unknown, CSN avg 77.9, Apache 2.0
**Setup**: GGUF (unconfirmed availability); likely needs sentence-transformers or LM Studio
**Risk**: No CoIR/MTEB-Code published; HuggingFace ID unconfirmed; CSN score from comparison table only

---

### 4. snowflake-arctic-embed2 — Best Native Ollama Baseline (Apache 2.0)

**Why**: Already on Ollama (309MB), Apache 2.0, better MTEB retrieval (~56.5) than nomic-embed-text (~49.8). Serves as the "zero-config upgrade" comparison point — validates whether qwen3-0.6b's extra setup is worth the quality gain.

**Key stats**: 568M params, 309MB Ollama, ~50 CoIR est., 8K ctx, Apache 2.0
**Setup**: `ollama pull snowflake-arctic-embed2` (already supported in mnemex codebase)
**Risk**: 8K context window limits large file indexing; general model not code-specialized

---

### 5. jina-code-embeddings-1.5b — Near-Voyage-Code-3 Quality (CC-BY-NC)

**Why**: CoIR 79.04 essentially ties Voyage Code 3 (79.23). At ~1.0GB GGUF, it fits on 16GB machines. Only 0.63 CoIR points better than the 0.5B variant — questionable whether the 3x parameter increase is worth it. Useful for establishing "local model ceiling" in the benchmark.

**Key stats**: 1.5B params, ~1.0GB Q4 GGUF, CoIR 79.04, MTEB-Code 78.94, 32K ctx, CC-BY-NC
**Setup**: GGUF import (LM Studio or manual Ollama import)
**Risk**: CC-BY-NC; 1.5B slightly exceeds "small" target; minimal quality gain vs. 0.5B variant

---

## Disqualified Models

| Model | Reason |
|-------|--------|
| nomic-embed-text-v2-moe | 512-token context — unusable for code chunks |
| mxbai-embed-large | 512-token context |
| all-minilm | 512-token context |
| bge-large | 512-token context + 1.3GB |

---

## Evidence Quality Assessment

**By Consensus Level**:
- UNANIMOUS agreement: 4 findings (Jina code models dominate, Qwen3-0.6B on Ollama, code-training > scale, three-tier structure)
- STRONG consensus: 2 findings (CodeRankEmbed-137M scores, Codestral lacks independent validation)
- MODERATE support: 0 findings
- WEAK support: 1 finding (BGE-EN-ICL research model only)
- CONTRADICTORY: 1 finding (Qwen3-0.6B GGUF size: 230MB raw vs. 639MB Ollama)

**By Source Count**:
- Multi-source (3+ sources): 8 findings
- Dual-source (2 sources): 4 findings
- Single-source (1 source): 3 findings

---

## Quality Metrics

**Factual Integrity**: 93% (target: 90%+)
- Total claims with factual assertions: ~45
- Sourced claims (explicit citations): ~42
- Status: **PASS**
- Unsourced claims: throughput estimates (Apple Silicon inference speed), some size estimates for older models

**Agreement Score**: 80% (target: 60%+)
- Total findings: 15
- Multi-source findings (2+ independent sources): 12
- Status: **PASS**

**Source Quality Distribution**:
- High quality (academic papers, official model cards, official docs): 16 sources (80%)
- Medium quality (vendor blogs, self-reported benchmarks): 4 sources (20%)
- Low quality: 0 sources (0%)
- Total unique sources across all explorers: ~20

---

## Knowledge Gaps

### CRITICAL Gaps (require immediate attention before benchmarking)

1. **Qwen3-Embedding-0.6B instruction prefix integration**: The model requires asymmetric query prefix ("Instruct: Retrieve code matching this query\nQuery: {query}") for best performance. Current `LocalEmbeddingsClient` does not support this. Without the prefix, benchmark results will understate actual performance by an unknown amount.
   - Why unexplored: Integration gap, not research gap
   - Suggested action: Add `queryPrefix` parameter to `EmbeddingsClientOptions` in `src/core/embeddings.ts`
   - Priority: CRITICAL

2. **nomic CodeRankEmbed-137M independent verification**: The 77.9 CSN score appears in a comparison table but the model card was not directly read. HuggingFace ID `nomic-ai/CodeRankEmbed-137M` needs direct verification.
   - Why unexplored: All explorers relied on nomic-embed-code README, not the model card itself
   - Suggested query: Direct read of `https://huggingface.co/nomic-ai/CodeRankEmbed-137M`
   - Priority: CRITICAL (it would change the Top 5 ranking if confirmed)

### IMPORTANT Gaps (should investigate)

3. **Jina code models commercial license path**: CC-BY-NC-4.0 blocks mnemex distribution. Does Jina offer a commercial license?
   - Suggested action: Contact jina.ai/contact or check enterprise pricing
   - Priority: IMPORTANT (affects whether jina-code models can be recommended to users)

4. **Full CoIR for Qwen3-Embedding-8B**: Only MTEB-Code (via reranker eval context) known; no standalone CoIR. Estimated ~80+ would put it in Tier A.
   - Suggested query: "Qwen3 Embedding 8B CoIR benchmark evaluation"
   - Priority: IMPORTANT (4B and 8B variants may be strong mid-tier candidates)

5. **Independent Codestral Embed 2505 CoIR evaluation**: Only self-reported Mistral benchmarks exist. May be best cloud code model with 8K context limitation.
   - Suggested action: Run mnemex benchmark empirically against Mistral API
   - Priority: IMPORTANT

### NICE-TO-HAVE Gaps

6. **SFR-Embedding-Code-400M on Aug 2025 CoIR suite**: Only older Nov 2024 CoIR benchmark (61.9). May rank higher on current suite.
   - Priority: NICE-TO-HAVE (Apache 2.0, relevant if top candidates unavailable)

7. **stella_en_400M_v5 code retrieval**: Strong MTEB avg (75.1) but no published CoIR/CSN scores.
   - Priority: NICE-TO-HAVE

8. **NVIDIA Llama Nemotron Embed VL 1B code performance**: 131K context, free OpenRouter access, but no code benchmark data.
   - Priority: NICE-TO-HAVE (unique large-context option)

---

## Convergence Assessment

**First iteration** — no previous synthesis to compare against.

**Information Saturation**:
- All 3 explorers converged on the same top models (jina-code-0.5B, Qwen3-0.6B, CodeRankEmbed-137M)
- High overlap in underlying sources (all cite arxiv:2508.21290 for Jina models)
- Explorer-3 added unique value on deployment specifics (inference speed, RAM, Apple Silicon setup)
- New information rate: ~20% (Explorer-3 deployment guide, instruction prefix details, CoreML info)
- Status: **EXPLORING** (first iteration, good initial coverage)

---

## Recommendations

**Immediate Actions**:
1. Add `queryPrefix` support to `LocalEmbeddingsClient` (CRITICAL for fair Qwen3-0.6B benchmark)
2. Verify `nomic-ai/CodeRankEmbed-137M` model card directly (may change rankings)
3. Run benchmark with: qwen3-0.6b, jina-code-0.5b (GGUF), snowflake-arctic-embed2, nomic-embed-text v1.5 (baseline)

**Benchmark Design**:
- Use existing mnemex internal NDCG evaluation framework (already has MRR metric)
- Add jina-code-0.5b via GGUF Ollama import (`ollama pull hf.co/jinaai/jina-code-embeddings-0.5b-GGUF:Q4_K_M`)
- Test Qwen3-0.6b WITH instruction prefix vs. without to quantify prefix impact
- Run all candidates against same test set to get comparable MRR values

**Exploration Strategy**:
- Next iteration should focus on: (a) verifying CodeRankEmbed-137M, (b) checking Qwen3-8B CoIR data, (c) confirming Ollama registry status for new models
- Consider adding voyageai/voyage-code-3 API as a reference point in benchmark (free tier available)
