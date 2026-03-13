# Research Plan: Best Small Embedding Models for Code Semantic Search (2025-2026)

## Objective
Identify top 5-8 candidate embedding models under 1GB (ideally <500MB) released in 2025-2026 that excel at code retrieval and can run locally on Apple Silicon or via affordable cloud APIs. Create benchmarking candidates against current models: voyage-3.5-lite (cloud), nomic-embed-text (274MB), embeddinggemma (300M).

## Key Sub-Questions (Priority Order)

### 1. What are the newest small embedding models (<500MB) released in 2025-2026?
**Why First**: Foundation for all other research. Need current landscape before evaluating.

**Sources**:
- HuggingFace Models Hub (filter by date, size, embedding category)
- Model release announcements (Ollama releases, LM Studio updates)
- MTEB leaderboard (Massive Text Embedding Benchmark)
- GitHub trending ML repos (embedding model releases)
- OpenAI/Anthropic partner announcements

**Success Criteria**:
- ✓ Compile list of 15+ candidate models with exact release dates
- ✓ Verify model sizes (disk, quantized variants available)
- ✓ Identify license/availability (open-source, cloud-only, etc.)
- ✓ Document quantization options (GGUF, MLX, fp32, int8)

---

### 2. Which models have strong code retrieval/semantic search performance?
**Why Second**: Must validate that small models actually work for code, not just general text.

**Sources**:
- MTEB leaderboard (code-specific retrieval tasks)
- Model cards on HuggingFace (benchmark numbers)
- Published papers/blogs comparing code embeddings
- Ollama registry community reviews/downloads
- Custom evaluation results from recent benchmarks

**Success Criteria**:
- ✓ Document MTEB code retrieval scores (nDCG@10) for all candidates
- ✓ Identify which models were trained on code corpora
- ✓ Note context window length (must be ≥512 tokens, preferably ≥2048)
- ✓ Compare against our current baselines (nomic, embeddinggemma performance)

---

### 3. What are the deployment/runtime constraints for Apple Silicon?
**Why Third**: Must be runnable on our target hardware without breaking hardware requirements.

**Sources**:
- Ollama registry (filter by mlx-compatible models)
- LM Studio model registry (Apple Silicon support)
- HuggingFace MLX community models
- GGUF format availability and quantization guides
- Apple Silicon performance benchmarks (tokens/sec, memory usage)

**Success Criteria**:
- ✓ Verify each candidate has MLX/GGUF/native MLX support
- ✓ Document RAM requirements (load time, inference memory)
- ✓ Note quantization impact (float32 vs fp32 vs int8 performance)
- ✓ Identify any models with MLX-specific optimizations
- ✓ List compatible tools (Ollama, LM Studio, llama.cpp, MLX-LM)

---

### 4. Which models offer the best cost/performance for cloud APIs?
**Why Fourth**: Some users may prefer cloud APIs; need affordable options.

**Sources**:
- Cloud provider pricing (OpenRouter, Together AI, Replicate)
- Model card cost comparisons
- API documentation (latency, rate limits)
- Community benchmarks (cost per 1000 requests)

**Success Criteria**:
- ✓ Document pricing for top candidates ($/1K queries)
- ✓ Compare latency vs local inference trade-off
- ✓ Identify which APIs support batch processing
- ✓ Note any startup/integration complexity

---

### 5. How do top candidates compare to our current models in code retrieval quality?
**Why Fifth**: Dependency on Q2 & Q4; determines which models to benchmark.

**Sources**:
- MTEB leaderboard comparisons
- Model card evaluations on code datasets
- Dimension counts (256, 384, 768, 1024 - impacts retrieval quality vs speed)
- Dimensionality reduction studies (if applicable)

**Success Criteria**:
- ✓ Create comparison table: voyage-3.5-lite vs nomic vs embeddinggemma vs new candidates
- ✓ Rank candidates by code retrieval nDCG@10 score
- ✓ Document trade-offs: speed vs quality for each model
- ✓ Identify top 3-5 models for empirical benchmarking

---

## Information Sources (Priority & Frequency)

| Source | Priority | Frequency | Coverage |
|--------|----------|-----------|----------|
| MTEB Leaderboard | 🔴 Critical | Weekly | Standardized benchmarks, code tasks |
| HuggingFace Hub | 🔴 Critical | Ongoing | Model cards, metadata, downloads |
| Ollama Registry | 🟠 High | Weekly | Local deployment, MLX/GGUF availability |
| LM Studio | 🟠 High | Monthly | Apple Silicon models, UI discoverability |
| Model Release Blogs | 🟠 High | Monthly | Context on new releases, paper links |
| GitHub Issues (ollama/ollama) | 🟡 Medium | Ongoing | Community reports, new model requests |
| OpenRouter Docs | 🟡 Medium | Monthly | Cloud API options, pricing |
| Papers on arXiv | 🟡 Medium | As-needed | Deep technical details, training data |

---

## Research Execution Plan

### Phase 1: Landscape Scan (1-2 hours)
1. **MTEB Leaderboard**: Query embedding models, filter by 2025-2026 release, sort by code retrieval score
2. **HuggingFace Search**: Filter embeddings category, date range, sort by downloads
3. **Ollama Registry**: Search for new models, check MLX support status
4. **Compile Initial List**: 15+ candidates with basic metadata (name, size, date, context window)

### Phase 2: Deep Evaluation (2-3 hours)
1. **Code Retrieval Performance**: Extract nDCG@10 scores from model cards & MTEB
2. **Deployment Feasibility**: Verify MLX/GGUF/cloud availability for each candidate
3. **Size Verification**: Confirm fp32 sizes, document quantized variants
4. **Cost Analysis**: Lookup cloud API pricing for each model

### Phase 3: Comparative Analysis (1-2 hours)
1. **Create Comparison Matrix**: All candidates vs current baseline models
2. **Score Top 5-8**: Rank by (code quality × deployment ease × availability)
3. **Identify Gaps**: Note which models have missing benchmarks or lack details
4. **Flag for Empirical Testing**: Highlight top 3 for hands-on evaluation

### Phase 4: Documentation (30 min)
1. **Write Research Summary**: Key findings, top candidates, recommended next steps
2. **Create Benchmark Roadmap**: Which models to empirically test and in what order
3. **Document Limitations**: Where information is incomplete; what needs experimental validation

---

## Success Criteria (Overall)

✓ **Comprehensive Candidate List**: 15+ models identified with release dates and sizes
✓ **Code Quality Data**: nDCG@10 or equivalent retrieval scores documented for each
✓ **Deployment Validation**: MLX/GGUF/cloud availability confirmed for top 5
✓ **Cost Transparency**: Pricing and RAM requirements clear for cost-benefit analysis
✓ **Top Candidates**: 5-8 models ranked and recommended for empirical benchmarking
✓ **Comparison Baseline**: Clear comparison table against voyage-3.5-lite, nomic, embeddinggemma
✓ **Actionable Output**: Specific models identified for Phase 2 empirical testing

---

## Assumptions & Constraints

- **Model Size**: Assuming "under 1GB" means unquantized fp32 or better-compressed variant available
- **Code Focus**: Prioritizing models with demonstrated code retrieval capability (not just general text)
- **Apple Silicon Requirement**: MLX or GGUF-quantized variants must be available or convertible
- **Context Window**: Must support ≥512 tokens (ideally ≥2048 for file context)
- **Timeline**: Research assumes early 2026 release windows; models must be publicly available
- **Cost Baseline**: Defining "affordable cloud API" as <$1 per 1M input tokens for comparable performance

---

## Next Steps (Phase 2: Empirical Benchmarking)

Once candidates are ranked, conduct hands-on evaluation:
1. **Download Top 3 Models**: Load into local environment (MLX/Ollama)
2. **Benchmark on Code Corpus**: Run retrieval experiments against our standard test set
3. **Profile Performance**: Measure inference time, memory, embedding quality
4. **Document Results**: Create empirical comparison table with real-world numbers
5. **Recommendation**: Select top 2-3 for integration into mnemex

---

## Key Questions to Resolve

- [ ] Are there 2025-2026 models specifically trained on code embeddings (vs. general text)?
- [ ] Do any new models offer <500MB with >90% of voyage-3.5-lite retrieval quality?
- [ ] Which models have best MLX/Apple Silicon support out-of-the-box?
- [ ] Can we leverage dimensionality reduction (256→384 dims) without quality loss?
- [ ] What is the cost-to-quality ratio for cloud APIs vs. local inference?

---

**Estimated Time to Complete Research**: 4-7 hours
**Target Completion**: 2026-03-06
**Owner**: Research Planner
**Status**: Planning phase
