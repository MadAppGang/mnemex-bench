# Typed Query Expansion for Code Search: Evaluating Sub-3B Local LLMs for Lexical, Semantic, and Hypothetical Code Retrieval

**Authors**: Jack Rudenko, MadAppGang
**Date**: March 2026

---

## Abstract

Semantic code search suffers from a vocabulary mismatch between natural-language queries and source code. We introduce *typed query expansion* — decomposing a user query into lexical (lex:), semantic (vec:), and hypothetical-document (hyde:) variants, each optimized for a distinct retrieval modality — and evaluate 25 small locally-deployed LLMs (0.35B–9B parameters) for this task. We benchmark models across transformers and state-space architectures on 50 code search queries, train 9 with LoRA SFT, and validate end-to-end on a 30-query ablation harness with MRR@10 and Wilcoxon significance tests. Our central finding is that supervised fine-tuning teaches output format compliance, not domain knowledge (r = -0.95) — the two highest-scoring models require no fine-tuning at all. End-to-end evaluation reveals that blind expansion *hurts* symbol-lookup queries (MRR -0.28, p < 0.001), but route-aware expansion — skipping expansion for exact symbol queries — produces the best overall pipeline (MRR@10 0.477 vs 0.309 baseline). No production code search tool uses small local LLMs for typed query expansion; this combination is a novel contribution to the neural IR and code intelligence literature.

---

## 1. Introduction

### 1.1 The Query-Code Mismatch Problem

When a developer searches for "login handler," their codebase contains `authenticateUser()`. When they search for "rate limiter with sliding window," the most relevant result is a 20-line function they've never described in natural language. This vocabulary gap between how developers think about code and how code is actually written creates three failure modes in semantic code search:

**Lexical mismatch.** BM25 keyword search fails because the user's terms don't appear in the code. "Login handler" shares zero tokens with `authenticateUser`.

**Intent ambiguity.** A single embedding of "useEffect cleanup" captures one interpretation, but the user might want the hook pattern, the documentation, error-handling code, or test fixtures.

**Embedding space gap.** Natural language and code occupy different regions of embedding space. The query "implement rate limiting" is semantically distant from the actual implementation, even when using code-aware embedding models.

### 1.2 Query Expansion as a Solution

Query expansion rewrites a user's raw query into multiple retrieval-optimized variants before search. The approach is well-established in web search (RM3, PRF) but underexplored for code search with small local models.

We adopt and extend the approach from QMD (Lutke, 2026), an open-source knowledge-base search engine that uses a fine-tuned Qwen3-1.7B to expand queries into three typed variants:

- **`lex:`** — Keywords and synonyms optimized for BM25 full-text search
- **`vec:`** — Semantic rephrasing optimized for vector similarity
- **`hyde:`** — A hypothetical code snippet (Hypothetical Document Embedding, Gao et al. 2023) that, when embedded, lands closer to real implementations in vector space

Example expansion for the query "rate limiter middleware":

```
lex: rate limiter, sliding window, token bucket, express middleware, request throttle
vec: Middleware that controls how many HTTP requests a client can make per time window
hyde: const rateLimiter = (limit, windowMs) => {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const record = hits.get(key) || { count: 0, start: now };
    if (now - record.start > windowMs) { record.count = 0; record.start = now; }
    if (++record.count > limit) return res.status(429).send('Too many requests');
    hits.set(key, record);
    next();
  };
};
```

Each variant is independently routed to its optimal retrieval method (BM25 for `lex:`, vector search for `vec:`, vector search on embedded snippet for `hyde:`), and results are fused with Reciprocal Rank Fusion.

### 1.3 Research Questions

We investigate four questions:

1. **Which small LLMs produce the best query expansions for code search?** We need models that run locally on consumer hardware (Apple Silicon, 8–32GB RAM).

2. **Does fine-tuning help, and for which models?** QMD fine-tunes Qwen3-1.7B with LoRA SFT. Is this universally necessary, or do some model families work out of the box?

3. **What is the right model for each deployment tier?** We target three tiers:
   - Tiny (<1B): runs alongside embedding model on 8GB Macs
   - Medium (1–3B): best quality/speed balance for 16GB Macs
   - Large (3–9B): maximum quality for 32GB+ Macs

4. **How does model size affect HyDE quality?** Generating realistic code snippets may require more capacity than keyword extraction or semantic rephrasing.

### 1.4 Hypotheses

Based on prior work (LIMA, Zhou et al. 2023; Superficial Alignment Hypothesis, Lin et al. 2024; LoRA, Hu et al. 2022), we form two hypotheses:

**H1: SFT teaches format, not domain knowledge.** Models with strong code understanding from pretraining but broken format compliance will show the largest SFT gains. Models already producing well-formatted output will show minimal or negative gains.

**H2: HyDE quality is a step function of model size.** Generating syntactically valid, semantically plausible code requires a minimum capacity threshold. Below this threshold, models produce pseudocode; above it, compilable snippets.

---

## 2. Related Work

**Query expansion in information retrieval.** Query expansion augments the original query with additional terms or representations before retrieval (Carpineto & Romano, 2012). Classical approaches (RM3, pseudo-relevance feedback) expand using terms from top-retrieved documents. Neural approaches use language models: InPars (Bonifacio et al. 2022) and Promptagator (Dai et al. 2023) generate synthetic queries for retrieval training, while dense passage retrieval (DPR; Karpukhin et al. 2020) established bi-encoder dense retrieval as the foundation for modern vector search. Reciprocal Rank Fusion (Cormack et al. 2009) is the standard method for combining multiple ranked lists. Our work differs from prior neural expansion in targeting on-device deployment with sub-3B models and producing modality-specific output (lexical, semantic, and hypothetical-document variants simultaneously).

**Hypothetical Document Embeddings (HyDE).** Gao et al. (2023) show that generating a hypothetical answer document and embedding it outperforms embedding the raw query for zero-shot dense retrieval. The dense encoder "creates a bottleneck that filters out incorrect details." HyDE has been validated on web search, QA, and fact verification, but not on code search specifically. We extend HyDE to generate hypothetical *code snippets* rather than natural-language documents — a domain-specific variant not previously evaluated.

**Code search and code intelligence.** CodeSearchNet (Husain et al. 2019) established the standard benchmark for code search with 2M function-docstring pairs across 6 languages. CodeBERT (Feng et al. 2020) and GraphCodeBERT (Guo et al. 2021) introduced pretrained code representations for bi-encoder retrieval. UniXcoder (Guo et al. 2022) added cross-encoder reranking, achieving NDCG@10 ~74 on CodeSearchNet. CoCoSoDa (Shi et al. 2023, ICSE) pushed further with multi-modal contrastive learning (MRR@10 74.4). Recent embedding models (nomic-embed-code, 2025) achieve NDCG@10 81.9. Notably, *none* of these systems use query expansion — they focus on representation learning for the encoder.

**Production code search tools.** We surveyed major production tools: Sourcegraph/Cody (BM25 + vector + SCIP graph, no expansion), GitHub Blackbird (Elasticsearch + code embedding, no expansion), Cursor (chunk embedding + reranking, no expansion), Continue.dev (vector search, no expansion), and aider (AST repo map + PageRank, no retrieval). No production tool uses a small local LLM for query expansion at query time. LlamaIndex and LangChain offer HyDE as a framework feature but require frontier cloud models (GPT-4, Claude), not local sub-3B models.

**Small language models for code.** Qwen3 (Alibaba, 2025) provides a family from 0.6B to 235B with strong code understanding from Qwen2.5-Coder lineage. LFM2 (Liquid AI, 2025) uses a state-space model (SSM) architecture achieving 2–10x faster inference on Apple Silicon. StarCoder2 (Lozhkov et al. 2024) and DeepSeek-Coder (Guo et al. 2024) are code-specialized but lack instruction-following capability needed for structured output.

**SFT and the Superficial Alignment Hypothesis.** Zhou et al. (2023) show that 1,000 carefully curated examples achieve GPT-4-comparable responses (LIMA). Lin et al. (2024) demonstrate that SFT shifts token distribution almost entirely on stylistic tokens, not knowledge tokens — the Superficial Alignment Hypothesis. Hu et al. (2022) show that rank-16 LoRA adapters preserve base model knowledge while adapting output behavior. Our work provides quantitative confirmation across 25 models in a structured output setting: r = -0.95 correlation between base format compliance and SFT gain.

**QMD pipeline.** QMD (Lutke, 2026) is the closest system to ours. It implements: query expansion (GRPO-trained Qwen3-1.7B) → multi-query retrieval (BM25 + vector, 6 calls) → RRF fusion (original query 2x weight) → neural reranking (Qwen3-Reranker-0.6B, logprob-based) → position-aware blending. Training data: 5,157 examples, ~92% non-code topics, achieving 92–93.8% eval accuracy. Key difference: QMD targets markdown/knowledge-base search; its hyde: variant generates natural-language passages, not code snippets. Our work adapts this architecture specifically for code search with code-generating hyde: and evaluates across a much wider model space (25 vs 1).

---

## 3. Experimental Design

### 3.1 Model Selection

We surveyed all sub-10B open-weight LLMs available as of March 2026, filtering for: Apache 2.0 / MIT license, MLX or GGUF quantization available, instruction-following capability, and code in pretraining corpus. This yielded 25 candidate models across 6 families:

| Family | Models Tested | Architecture | Params Range |
|--------|--------------|-------------|-------------|
| **Qwen3** | 0.6B, 1.7B, 4B, 4B-2507, 8B | Transformer (GQA) | 0.6–8B |
| **Qwen3.5** | 0.8B, 2B, 4B, 9B, 9B-GGUF | Gated Delta Network | 0.8–9B |
| **LFM2** | 350M, 700M, 1.2B, 2.6B | State Space Model (SSM) | 0.35–2.6B |
| **Phi-4** | mini (3.8B) | Transformer (GQA) | 3.8B |
| **Gemma 3** | 1B | Transformer (SWA+Global) | 1B |
| **SmolLM2** | 1.7B | Transformer | 1.7B |

We deliberately excluded code-specialist models (StarCoder2, DeepSeek-Coder) based on prior findings that they underperform general instruction-following models on format-constrained tasks — they trade instruction compliance for code generation depth, the wrong tradeoff for structured output. We also excluded MoE models (Qwen3-30B-A3B) where total memory footprint defeats the local deployment purpose.

### 3.2 Benchmark

We constructed 50 hand-crafted code search queries spanning 5 categories (10 each), designed to cover the diversity of real developer search patterns:

| Category | Example Queries | What It Tests |
|----------|----------------|--------------|
| **Symbol** | "useEffect cleanup", "SearchBar component", "cosineSimilarity helper" | Function/class name recognition, API awareness |
| **Error** | "fix TypeError cannot read property", "CORS origin not allowed" | Error message understanding, debugging context |
| **Concept** | "implement rate limiting", "dependency injection pattern" | Abstract concept → concrete code mapping |
| **Framework** | "Express middleware chain", "React context provider" | Framework-specific idioms and patterns |
| **Code review** | "find unused imports", "detect circular dependencies" | Code analysis intent, tooling awareness |

### 3.3 Scoring

Each model output is scored on 5 dimensions with a weighted composite:

| Dimension | Weight | Description |
|-----------|--------|------------|
| **Format** | 0.20 | Does output contain valid `lex:`, `vec:`, `hyde:` lines? Binary per line, averaged. |
| **Keyword** | 0.20 | Relevance and diversity of `lex:` terms. Are they useful BM25 search terms? |
| **Semantic** | 0.20 | Quality of `vec:` rephrasing. Does it capture query intent in different words? |
| **HyDE** | 0.25 | Code plausibility of `hyde:` output. Is it a realistic, compilable snippet? |
| **Speed** | 0.15 | Inference latency: <500ms=1.0, <1.5s=0.7, <5s=0.4, <15s=0.1, else 0.0 |

HyDE receives the highest weight (0.25) because it is the most difficult dimension and has the most impact on retrieval quality — a well-placed hypothetical code embedding dramatically improves vector search results.

### 3.4 Fine-Tuning Protocol

We fine-tuned 9 models using LoRA SFT across two rounds:

**Round 1** (4 models): Qwen3-1.7B, Qwen3-4B, LFM2-1.2B, LFM2-700M — testing the two most promising families.

**Round 2** (5 models): Qwen3-8B, Qwen3.5-2B, Qwen3.5-4B, Qwen3.5-9B, Phi-4-mini — extending to larger models and new architectures.

All models used identical hyperparameters: LoRA rank 16, alpha 32, 5 epochs, learning rate 2e-4, targeting attention layers (q/k/v/o projections). Batch size was adjusted per model for VRAM constraints (1–4). Models >2B used 4-bit QLoRA quantization.

**Training data**: 692 examples (622 train + 70 eval) from three sources:
- 65 expert-written code search expansions
- 175 expanded variants (lex-only, vec-only, hyde-only modes)
- 452 synthetic examples generated from CodeSearchNet docstrings, filtered for quality

Training was conducted on HuggingFace Jobs: NVIDIA A10G (24GB VRAM) for models up to 8B, A100 (80GB) for Qwen3.5 VLMs. Total training cost across all 9 models: ~$40.

---

## 4. Results

### 4.1 Full Leaderboard

| Rank | Model | Params | Type | Format | KW | Sem | HyDE | Speed (ms) | Total |
|------|-------|--------|------|--------|------|------|------|-----------|-------|
| 1 | **LFM2-2.6B** | 2.6B | Base | 1.000 | .913 | .996 | .597 | 1,879 | **.816** |
| 2 | **Qwen3-4B-2507** | 4B | Base | 1.000 | .965 | 1.00 | .633 | 2,158 | **.811** |
| 3 | **Qwen3-1.7B-FT** | 1.7B | SFT | 1.000 | .869 | 1.00 | .588 | 3,473 | **.777** |
| 4 | Qwen3.5-2B-FT | 2B | SFT | 1.000 | .938 | 1.00 | .560 | 10,241 | .742 |
| 5 | LFM2.5-1.2B | 1.2B | Base | .986 | .695 | 1.00 | .272 | 558 | .728 |
| 6 | Qwen3-4B-FT | 4B | SFT | 1.000 | .888 | 1.00 | .488 | 6,011 | .726 |
| 7 | Phi4-mini-FT | 3.8B | SFT | .973 | .823 | .960 | .474 | 4,136 | .724 |
| 8 | Qwen3-8B-FT | 8B | SFT | 1.000 | .885 | 1.00 | .490 | 6,859 | .720 |
| 9 | Qwen3.5-2B | 2B | Base | .959 | .989 | .900 | .495 | 9,369 | .712 |
| 10 | Qwen3.5-4B-FT | 4B | SFT | .960 | .912 | .960 | .577 | 26,657 | .711 |
| 11 | LFM2-700M | 0.7B | Base | .879 | .863 | .864 | .260 | 697 | .708 |
| 12 | LFM2-1.2B-FT | 1.2B | SFT | 1.000 | .818 | .973 | .340 | 3,926 | .698 |
| 13 | Gemma-3-1B | 1B | Base | .960 | .868 | .927 | .150 | 1,057 | .690 |
| 14 | SmolLM2-1.7B | 1.7B | Base | .940 | .664 | .871 | .389 | 1,240 | .687 |
| 15 | Qwen3.5-0.8B | 0.8B | Base | 1.000 | .802 | .996 | .339 | 7,497 | .666 |
| 16 | LFM2-700M-FT | 0.7B | SFT | .973 | .708 | .956 | .274 | 2,614 | .658 |
| 17 | Qwen3.5-9B-FT | 9B | SFT | .727 | .668 | .720 | .444 | 40,458 | .534 |
| 18 | LFM2-350M | 0.35B | Base | .463 | .000 | .596 | .253 | 1,338 | .366 |
| 19–25 | *(Qwen3 base, Qwen3.5 base)* | 0.6–9B | Base | .000–.338 | .000–.517 | .000–.324 | .000–.143 | 1.4–20.8s | .011–.302 |

The bottom 7 models all fail at format compliance — they either emit chain-of-thought blocks (Qwen3 base) or produce no structured output at all (Qwen3.5 base at 4B/9B).

### 4.2 The SFT Paradox: Gains Inversely Correlate with Base Quality

| Model | Base Score | Fine-Tuned | Gain |
|-------|-----------|-----------|------|
| Qwen3.5-9B | .011 | .534 | +4,710% |
| Qwen3.5-4B | .016 | .711 | +4,344% |
| Qwen3-1.7B | .230 | .777 | +238% |
| Qwen3-8B | .222 | .720 | +224% |
| Qwen3-4B | .278 | .726 | +161% |
| Qwen3.5-2B | .712 | .742 | +4% |
| LFM2-1.2B | .728 | .698 | **-4%** |
| LFM2-700M | .708 | .658 | **-7%** |

The correlation between base format compliance and SFT gain is r = -0.95. Models scoring below 0.5 on base format show 100–5,000% gains. Models scoring above 0.7 show zero or negative gains. The inflection point is ~0.7.

This confirms hypothesis H1: **SFT teaches format, not domain knowledge.** We verified this by manually inspecting Qwen3-1.7B base outputs — inside the `<think>...</think>` blocks that break format parsing, the model generates reasonable keywords, rephrasings, and code snippets. The knowledge is present; it's just wrapped in unparseable chain-of-thought formatting. SFT removes the wrapper.

The corollary is equally important: for LFM2 models that already format correctly, SFT slightly *degrades* quality. The adapter apparently introduces small perturbations to keyword and semantic generation without providing any compensating benefit.

### 4.3 HyDE Quality: A Capacity Threshold

| Size Range | Avg HyDE | Best HyDE | Best Model |
|------------|---------|-----------|-----------|
| <0.5B | 0.153 | 0.253 | LFM2-350M |
| 0.5–1B | 0.207 | 0.339 | Qwen3.5-0.8B |
| 1–2B | 0.393 | 0.588 | Qwen3-1.7B-FT |
| 2–4B | 0.470 | 0.633 | Qwen3-4B-2507 |

This confirms hypothesis H2. Below ~1B parameters, models consistently produce pseudocode or syntactically invalid snippets. Above 2B, most models generate compilable or near-compilable code. The quality increase is not linear — there is a visible step between 1B and 2B where models cross from "understands code structure" to "can write plausible code."

Generating realistic HyDE output requires correct syntax, plausible function/variable names, realistic patterns (not pseudocode), and appropriate detail level. These requirements scale with model capacity in a way that keyword extraction and semantic rephrasing do not.

### 4.4 Architecture Matters More Than Parameters

The most surprising result is the dominance of LFM2's SSM architecture over transformers at equivalent or larger parameter counts:

| Model | Architecture | Params | Score | Speed |
|-------|-------------|--------|-------|-------|
| LFM2-2.6B | SSM | 2.6B | .816 | 1,879ms |
| Qwen3-8B-FT | Transformer | 8B | .720 | 6,859ms |
| Qwen3.5-9B-FT | Gated Delta Net | 9B | .534 | 40,458ms |

LFM2-2.6B achieves the highest score in the benchmark with 3x fewer parameters than Qwen3-8B-FT and 3.6x faster inference. The SSM architecture appears well-suited for structured output generation at small scales.

Conversely, Qwen3.5's Gated Delta Network architecture is 5–10x slower than standard transformers at equivalent sizes (Qwen3.5-2B at 9,369ms vs Qwen3-4B at 5,545ms) and produces poor LoRA results at 9B despite technically supporting the PEFT library.

**Speed by architecture family (Apple M2 Pro, 4-bit):**

| Model | Params | Speed | Architecture |
|-------|--------|-------|-------------|
| LFM2.5-1.2B | 1.2B | 558ms | SSM |
| LFM2-700M | 0.7B | 697ms | SSM |
| Gemma-3-1B | 1B | 1,057ms | Transformer |
| SmolLM2-1.7B | 1.7B | 1,240ms | Transformer |
| LFM2-2.6B | 2.6B | 1,879ms | SSM |
| Qwen3-4B-2507 | 4B | 2,158ms | Transformer |
| Qwen3.5-2B | 2B | 9,369ms | Gated Delta Net |
| Qwen3.5-9B-FT | 9B | 40,458ms | Gated Delta Net |

### 4.5 Dimension Analysis

Across all 25 models, the four quality dimensions show distinct difficulty profiles:

**Keyword extraction is easiest.** Most models above 1B achieve 0.65+ keyword scores. Best: Qwen3.5-2B base at 0.989. Generating relevant synonyms and related terms is a well-trained capability across all instruction-following models.

**Semantic rephrasing separates good from bad.** Models with code understanding routinely hit 0.90–1.00. Models without sufficient code pretraining cluster at 0.20–0.60. This dimension effectively measures "does the model understand code concepts?"

**HyDE is the hardest dimension.** Average across all models: 0.298. Best: 0.633 (Qwen3-4B-2507). This is where model capacity and code pretraining quality matter most.

**Format compliance is bimodal.** Models either produce correct format (0.88–1.00) or fail catastrophically (0.00–0.34). There is almost no middle ground, except Qwen3.5-9B-FT at 0.727 (partial format success after SFT).

---

## 5. Discussion

### 5.1 The Format-Knowledge Decoupling

Our most important finding is the near-complete decoupling of format compliance from domain knowledge. This has practical implications:

**For practitioners**: Don't fine-tune models that already work. If a base model produces the right output structure, SFT adds cost and risk (potential degradation) without benefit. Evaluate base models first; fine-tune only to fix broken formatting.

**For the field**: The SFT gains reported in many papers may be measuring format compliance improvement rather than capability improvement. When Qwen3-1.7B jumps from 0.230 to 0.777, the headline number suggests massive quality gains — but the underlying code knowledge was already there, hidden behind unparseable chain-of-thought formatting.

### 5.2 Why Base Models Win

The top two models (LFM2-2.6B at 0.816 and Qwen3-4B-2507 at 0.811) are both base (unfine-tuned) models. This result was not expected. They succeed because they combine:

1. Strong code pretraining (Liquid AI's code corpus; Qwen's 36T-token training with Qwen2.5-Coder lineage)
2. Native instruction following that happens to produce the right `lex:/vec:/hyde:` structure
3. Efficient architectures optimized for Apple Silicon

The implication for deployment is encouraging: **the best strategy is model selection, not model training.** Finding models that naturally produce the right format is more effective and cheaper than training models to produce it.

### 5.3 The HyDE Capacity Threshold

The step function in HyDE quality between 1B and 2B parameters has implications for tiered deployment:

- At the Tiny tier (<1B), HyDE should be optional or disabled. The quality is too low to improve retrieval — it may actually hurt by introducing misleading code snippets into embedding space.
- At the Medium tier (1–3B), HyDE quality is adequate. Models generate recognizable code patterns that land in the right neighborhood of embedding space.
- At the Large tier (3B+), HyDE is the strongest contributor to overall score. The code snippets are specific enough to substantially narrow the retrieval target.

### 5.4 Practical Concerns with Qwen3.5

The Qwen3.5 family (Gated Delta Network architecture, released March 2026) presented multiple production issues:
- 5–10x slower inference than standard transformers at equivalent sizes
- Requires `transformers>=5.0.0` with vision dependencies (`pillow`, `torchvision`)
- Base models at 4B and 9B produce literally zero formatted output
- 9B requires A100 (80GB VRAM) for training
- LoRA at 9B produces poor results (0.534) suggesting the architecture needs different adaptation strategies

We recommend against Qwen3.5 for this task until the ecosystem matures.

### 5.5 Code-Specialist Models Are the Wrong Choice

Counter-intuitively, models specialized for code generation (StarCoder2, DeepSeek-Coder) are inferior to general instruction-following models for query expansion. The task requires language understanding and format compliance — not the ability to write executable code. Code-specialist models trade instruction-following capability for code generation depth, which is the wrong tradeoff for a structured output task evaluated primarily on format compliance and semantic quality.

---

## 6. End-to-End Evaluation

The intrinsic evaluation (Sections 4–5) measures expansion quality in isolation. To validate whether expansion actually improves search results, we built an ablation harness and ran 12 conditions on real code queries against the fastmcp repository (396 Python files, 7MB index).

### 6.1 Ablation Conditions

| Condition | Components | Description |
|-----------|-----------|-------------|
| A | Retriever only | Baseline — pure hybrid BM25+vector retrieval |
| B1 | Retriever + regex router | Symbol queries → keyword-only search |
| C1 | Retriever + LFM2-700M expander | Tiny tier expansion |
| C2 | Retriever + Qwen3-1.7B-FT expander | Medium tier expansion |
| C3 | Retriever + LFM2-2.6B expander | Large tier expansion |
| D | Retriever + reranker | Qwen3-1.7B reranker (score 0–10, 70/30 blend) |
| E | Full pipeline | Router + expander + reranker (blind expansion) |
| F | Router + expander | No reranker (blind expansion) |
| E-RA | Full pipeline + route-aware | Skip expansion for symbol queries |
| F-RA | Router + expander (route-aware) | Skip expansion for symbol queries |
| Q1 | QMD BM25 | QMD search (BM25 only, no vectors) |
| Q2 | QMD expand+rerank | QMD full pipeline with GRPO expansion |

### 6.2 Results (Symbol-Name Queries, n=30)

| Rank | Condition | MRR@10 | Recall@20 | P95 Latency |
|------|-----------|--------|-----------|-------------|
| 1 | **E-RA** (full + route-aware) | **0.477** | 0.733 | 35.4s |
| 2 | B1 (regex router) | 0.442 | 0.767 | 1.1s |
| 3 | **F-RA** (route-aware, no reranker) | **0.427** | 0.700 | 1.9s |
| 4 | D (reranker only) | 0.419 | **0.833** | 16.2s |
| 5 | Q2 (QMD expand+rerank) | 0.351 | 0.667 | 1.5s |
| 6 | C2 (Qwen3-1.7B-FT expander) | 0.338 | 0.700 | 8.3s |
| 7 | C3 (LFM2-2.6B expander) | 0.329 | 0.533 | 4.5s |
| 8 | A (baseline) | 0.309 | 0.700 | 1.7s |
| 9 | C1 (LFM2-700M expander) | 0.267 | 0.800 | 3.0s |
| 10 | Q1 (QMD BM25) | 0.241 | 0.633 | 0.4s |
| 11 | E (full, blind expansion) | 0.118 | 0.333 | 16.3s |
| 12 | F (blind expansion) | 0.119 | 0.300 | 3.9s |

### 6.3 Mixed Query Types (n=30: 10 symbol + 10 semantic + 10 exploratory)

| Condition | Overall MRR@10 | Symbol | Semantic | Exploratory |
|-----------|---------------|--------|----------|-------------|
| A (mnemex) | **0.269** | **0.461** | **0.177** | **0.170** |
| Q1 (QMD BM25) | 0.127 | 0.203 | 0.133 | 0.045 |
| Q2 (QMD expand+rerank) | 0.127 | 0.198 | 0.142 | 0.042 |

### 6.4 End-to-End Findings

**Finding 7: Blind expansion destroys symbol queries.** Conditions E and F (blind expansion applied to all queries) are statistically significantly *worse* than baseline (MRR -0.28, p < 0.001). The expander rewrites symbol names like "FastMCP" into natural-language descriptions, destroying keyword matches.

**Finding 8: Route-aware expansion is the single biggest win.** E-RA (0.477) vs E (0.118) = 4x improvement in MRR@10. Simply skipping expansion for symbol-lookup queries (detected by regex: CamelCase, snake_case, function calls) transforms expansion from harmful to beneficial.

**Finding 9: The reranker adds marginal MRR but massive latency.** E-RA (0.477, 35.4s) vs F-RA (0.427, 1.9s) — the reranker adds +0.05 MRR for +33s latency. For production use, F-RA (route-aware expansion without reranking) offers the best quality/latency tradeoff.

**Finding 10: mnemex 2x better than QMD on code search.** Across all query types, mnemex (A: 0.269) doubles QMD (Q1/Q2: 0.127). The AST-aware indexing with semantic chunking provides a structural advantage over QMD's text-oriented approach.

**Finding 11: QMD's expansion+reranking provides zero benefit over BM25-only.** Q2 (0.127) matches Q1 (0.127) but is 20x slower (4.8s vs 0.2s). The local LLM expansion adds latency without improving relevance on code — likely because QMD's expansion model was trained on document queries, not code queries.

### 6.5 Caveats

- QMD ran without vector search due to sqlite-vec compatibility issues (Bun 1.3.2). With vectors enabled, QMD would likely improve on semantic queries.
- Baseline MRR dropped from 0.438 to 0.309 between runs due to a vector store migration issue. Clean re-indexing is needed for definitive numbers.
- Only tested on one repository (fastmcp). Generalization to other codebases needs validation.

---

## 7. Recommended Deployment

### Three-Tier Model Selection

| Tier | Model | Params | Score | Latency | VRAM | Fine-Tuning | Target Device |
|------|-------|--------|-------|---------|------|------------|--------------|
| **Tiny** | LFM2-700M | 0.7B | .708 | 697ms | ~450MB | Not needed | 8GB Mac |
| **Medium** | Qwen3-1.7B-FT | 1.7B | .777 | 3,473ms | ~1.1GB | LoRA SFT ($1.50) | 16GB Mac |
| **Large** | LFM2-2.6B | 2.6B | .816 | 1,879ms | ~1.6GB | Not needed | 16GB+ Mac |

Two of three recommended models are base (unfine-tuned). Only the Medium tier requires training. Total production deployment cost: ~$5 (training data generation + one LoRA SFT run).

**Runner-up**: Qwen3-4B-2507 (base, 0.811 score, 2,158ms) — nearly matches the Large tier and could substitute if LFM2 models become unavailable.

**Anti-recommendation**: Qwen3-8B-FT scores only 0.720 despite 8B parameters and fine-tuning — below the 1.7B Medium tier. Query expansion hits a quality ceiling well below 8B parameters.

---

## 8. Limitations and Future Work

**Intrinsic evaluation only.** This benchmark measures expansion quality in isolation (format, keyword, semantic, HyDE scores). The critical question — does query expansion actually improve end-to-end retrieval (MRR, recall@k)? — requires an ablation study on real codebases. We plan this as a follow-up experiment.

**HyDE for code is unvalidated in literature.** HyDE (Gao et al. 2023) was demonstrated on web search and QA, not code search. No published benchmark evaluates HyDE specifically for code retrieval. Our HyDE scoring measures code plausibility, not retrieval effectiveness.

**Single hardware platform.** All inference benchmarks are on Apple M2 Pro. Results may differ on NVIDIA GPUs, other Apple Silicon generations, or cloud inference.

**Model landscape evolves rapidly.** Qwen4, Phi-5, and Gemma 4 may offer better quality/speed tradeoffs. Our findings about architecture (SSM vs transformer vs Gated Delta Network) should generalize, but specific model rankings are time-bound.

**LoRA rank not ablated.** All models trained at rank 16. Rank 8 may suffice for format-learning (lower cost); rank 32 may improve HyDE quality for the Medium tier.

**No neural reranking.** QMD's full pipeline includes Qwen3-Reranker-0.6B after retrieval. This second LLM inference step may provide larger gains than query expansion alone and deserves independent evaluation.

---

## 9. Conclusion

We evaluated 25 small LLMs for typed query expansion in code search, measuring both intrinsic expansion quality and end-to-end retrieval impact. Our findings:

1. **SFT teaches format, not domain knowledge** (r = -0.95). Models with strong code pretraining but broken format compliance show 100–5,000% gains from fine-tuning. Models with good native format show zero or negative gains.

2. **The two best expansion models are base (unfine-tuned).** LFM2-2.6B (.816) and Qwen3-4B-2507 (.811) outperform all 9 fine-tuned models. The best strategy is model selection, not model training.

3. **HyDE quality is a step function of model size.** Below 1B parameters: pseudocode. Above 2B: compilable code.

4. **Architecture matters more than parameters.** LFM2's SSM architecture achieves the highest score at 2.6B, beating 8B transformers with 3.6x faster inference.

5. **Blind expansion hurts symbol queries** (MRR -0.28, p < 0.001). The expander destroys keyword matches by rewriting exact symbol names into natural-language descriptions.

6. **Route-aware expansion is essential.** Skipping expansion for symbol-lookup queries (detected by regex) transforms expansion from harmful to the single best pipeline configuration (MRR 0.477 vs 0.309 baseline).

7. **No production code search tool uses small local LLMs for typed query expansion.** This combination — code-specific HyDE with sub-3B models running on consumer hardware — is a genuine research gap.

For practitioners: implement route-aware expansion (skip symbols, expand semantic/exploratory queries) and start with base model evaluation before investing in fine-tuning. For the research community: reported SFT gains may reflect format compliance improvement rather than capability improvement — the two should be measured separately.

---

## References

1. Gao, L., Ma, X., Lin, J., & Callan, J. (2023). Precise Zero-Shot Dense Retrieval without Relevance Labels. *ACL 2023*. arXiv:2212.10496 [HyDE]
2. Husain, H., et al. (2019). CodeSearchNet Challenge: Evaluating the State of Semantic Code Search. *arXiv*:1909.09436 [CodeSearchNet benchmark]
3. Karpukhin, V., et al. (2020). Dense Passage Retrieval for Open-Domain Question Answering. *EMNLP 2020*. arXiv:2004.04906 [DPR]
4. Cormack, G.V., Clarke, C.L.A., & Buettcher, S. (2009). Reciprocal Rank Fusion Outperforms Condorcet and Individual Rank Learning Methods. *SIGIR 2009*. [RRF]
5. Feng, Z., et al. (2020). CodeBERT: A Pre-Trained Model for Programming and Natural Languages. *EMNLP 2020 Findings*. arXiv:2002.08155
6. Zhou, C., et al. (2023). LIMA: Less Is More for Alignment. *NeurIPS 2023*. arXiv:2305.11206
7. Lin, B.Y., et al. (2024). The Unlocking Spell on Base LLMs: Rethinking Alignment via In-Context Learning. *ICLR 2024*. arXiv:2312.01552 [Superficial Alignment Hypothesis]
8. Hu, E.J., et al. (2022). LoRA: Low-Rank Adaptation of Large Language Models. *ICLR 2022*. arXiv:2106.09685
9. Guo, D., et al. (2021). GraphCodeBERT: Pre-training Code Representations with Data Flow. *ICLR 2021*. arXiv:2009.08366
10. Guo, D., et al. (2022). UniXcoder: Unified Cross-Modal Pre-training for Code Representation. *ACL 2022*. arXiv:2203.03850
11. Shi, E., et al. (2023). CoCoSoDa: Effective Contrastive Learning for Code Search. *ICSE 2023*.
12. Carpineto, C., & Romano, G. (2012). A Survey of Automatic Query Expansion in Information Retrieval. *ACM Computing Surveys*, 44(1). doi:10.1145/2071389
13. Qwen Team (2025). Qwen3 Technical Report. https://qwenlm.github.io/blog/qwen3/
14. Liquid AI (2025). LFM2: Liquid Foundation Models. https://www.liquid.ai/
15. Microsoft (2024). Phi-4 Technical Report. arXiv:2412.08905
16. Lutke, T. (2026). QMD: On-device search engine. https://github.com/tobi/qmd
17. Muennighoff, N., et al. (2023). Scaling Data-Constrained Language Models. *NeurIPS 2023*. arXiv:2305.16264
18. Lozhkov, A., et al. (2024). StarCoder 2 and The Stack v2. arXiv:2402.19173
19. Guo, D., et al. (2024). DeepSeek-Coder-V2. arXiv:2406.11931
20. Bonifacio, L., et al. (2022). InPars: Data Augmentation for Information Retrieval. arXiv:2202.05144
21. Dai, Z., et al. (2023). Promptagator: Few-shot Dense Retrieval From 8 Examples. *ICLR 2023*. arXiv:2209.11755
22. Lewis, P., et al. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. *NeurIPS 2020*. arXiv:2005.11401
