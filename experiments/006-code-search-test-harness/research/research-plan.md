# Research Plan: Testing Harness and Datasets for Code Search Quality Evaluation

## Objective

Design a rigorous evaluation framework for mnemex's 4 query-time components:
- **Query router/classifier** (3 methods: regex rules, learned classifier, LLM planner)
- **Query expander** (3 tiers: LFM2-700M, Qwen3-1.7B-FT, LFM2-2.6B)
- **Retrieval** (hybrid BM25 + vector)
- **Reranker**

---

## Section 1: Pre-Built Datasets

### Primary Candidates

**CodeSearchNet** (Husain et al., 2019)
- 6 languages (Python, JS, Ruby, Go, Java, PHP)
- ~2M (docstring, function) pairs; ~99K NL query → code test pairs
- Query type: purely semantic (docstring-style natural language → function body)
- Limitation: no query type labels (all are semantic lookup); queries are synthetic (from docstrings)
- Source: https://github.com/github/CodeSearchNet
- HuggingFace: `code_search_net`

**CoSQA** (Huang et al., 2021)
- 20,604 real user queries from Bing search logs → Python function pairs
- More realistic than CodeSearchNet (actual user queries)
- Has human relevance annotations (binary)
- Limitation: Python only; no query type labels
- Source: https://github.com/microsoft/CodeBERT/tree/master/CoSQA

**AdvTest** (Lu et al., 2021, CodeXGLUE)
- Adversarial test set derived from CodeSearchNet Python
- 280 queries with hard negatives
- Good for robustness testing of retrieval
- Source: https://github.com/microsoft/CodeXGLUE

**WebQueryTest** (Lv et al.)
- Web-crawled natural language queries → code snippets
- Smaller (~1K pairs) but high real-world fidelity
- May overlap with CoSQA methodology

**SWE-bench** (derived)
- Issue text → patch files = implicit (query, relevant_files) pairs
- Our agentbench uses 24 instances from 12 repos
- Full SWE-bench has ~2,294 instances (verified: 500)
- Query type: mostly structural/semantic (bug reports, feature requests)

### Query Type Label Gap

None of the above datasets label queries by TYPE (symbol lookup vs semantic vs structural). This is a key gap — we must derive or generate type labels ourselves.

**Research question**: Do any recent datasets (2023-2025) include query intent/type annotations for code search?

Candidates to investigate:
- **RepoQA** (2024) — long-context code retrieval benchmark; check for type labels
- **SWE-bench-verified** — issue types (bug/feature) could proxy for query type
- **StackOverflow datasets** — question tags may provide type signal
- **DevBench** — software development benchmark tasks

---

## Section 2: Existing Testing Harnesses

### BEIR (Benchmarking IR)
- 18 retrieval datasets, unified interface
- Does NOT natively include code search datasets
- **But**: BEIR's `beir` Python package accepts custom datasets in JSONL format
- Can ingest CodeSearchNet/CoSQA with minimal adaptation
- Provides NDCG@10, Recall@k, MRR out of the box
- Source: https://github.com/beir-cellar/beir
- **Verdict**: Strong harness candidate — adapt for code datasets

### MTEB (Massive Text Embedding Benchmark)
- Has a `CodeSearchNetRetrieval` subtask (Python only, 10K queries)
- Uses `mteb` Python package with standardized `evaluate()` interface
- Metrics: NDCG@10 by default
- **Verdict**: Good for retrieval/reranker evaluation; limited query type coverage

### RAGAS
- Focused on RAG pipelines: faithfulness, answer relevance, context precision/recall
- Requires (question, answer, context) triples — needs an LLM answer to evaluate
- Less suited to code retrieval (no ground truth code answers)
- **Verdict**: Not a primary fit; potentially useful for end-to-end RAG evaluation

### CodeBERT/UniXcoder Evaluation Scripts
- Microsoft's CodeBERT repo has evaluation scripts for CodeSearchNet
- MRR@10 computation, standard splits
- Source: https://github.com/microsoft/CodeBERT
- **Verdict**: Borrow evaluation scripts; adapt to our hybrid retrieval pipeline

### LOTTE (Long-Tail Topic-Stratified Evaluation)
- Stratified by topic and query source (search vs forum)
- May have tech/programming domain
- **Verdict**: Investigate for topic-stratified evaluation

### codesearchnet-evaluation
- Original CSN evaluation harness
- Computes NDCG with hand-annotated relevance for a subset
- **Verdict**: Borrow NDCG computation; likely outdated infrastructure

---

## Section 3: Building Our Own Benchmark

### Approach A: Derive from SWE-bench Patches

**Method**:
1. For each SWE-bench instance: `issue_text` → ground truth = files modified in patch
2. Filter to our 12 agentbench repos (24 instances already available)
3. Scale to full SWE-bench-verified (500 instances across ~100 repos)

**Query type mapping**:
- Issues mentioning function/class names → symbol lookup
- Bug descriptions without explicit names → semantic search
- "Add support for X" → structural/exploratory

**Pros**: Real developer queries; ground truth files from actual patches
**Cons**: File-level granularity (not function-level); noisy (patches may touch unrelated files)

**Minimum viable**: 24 instances (our repos) = usable but tight; 200+ instances recommended

### Approach B: Generate Labeled Queries from Our 12 Repos

**Method using mnemex itself**:
1. For each high-PageRank symbol in our 12 repos, generate 3 query variants:
   - Type 1 (symbol): "find the `{symbol_name}` function" / "where is `{class_name}` defined"
   - Type 2 (semantic): LLM-generated docstring → query (paraphrase what this function does)
   - Type 3 (structural): LLM-generated "find all X that implement Y pattern"
2. Ground truth = the symbol's file + line range
3. Use deepseek/deepseek-v3.2 (our enrichment model) for generation — consistent quality

**Pros**: Full query type labels; leverages existing index; controllable distribution
**Cons**: Synthetic; may not reflect real user query distribution

**Minimum viable dataset size**:
- Router evaluation: 100 examples per class (3 classes) = 300 minimum; 500+ recommended
- Retrieval/reranker: 500 queries with relevance judgments (MRR is robust at this scale)
- Expander delta: 200 queries sufficient to detect 5% MRR improvement with 80% power

### Approach C: Hybrid (Recommended)

Combine real + synthetic:
1. **SWE-bench-verified** (500 real instances) — semantic/structural queries, file-level GT
2. **Generated symbol queries** from our 12 repos (~360 queries, 30 per repo) — symbol lookup GT
3. **CoSQA subset** (2K Python queries) — real user queries, function-level GT

Total: ~2,860 (query, ground_truth) pairs across 3 query types

---

## Section 4: Metrics Per Component

### Router / Classifier
- **Primary**: Accuracy, macro-F1 across 3 classes (symbol/semantic/structural)
- **Secondary**: Per-class precision/recall (symbol lookup is high-stakes — false negatives costly)
- **Test set requirement**: Stratified 80/10/10 train/val/test split; test must be held out completely
- **Reporting**: Confusion matrix; error analysis on misclassified examples

### Query Expander (MRR/NDCG delta)
- **Primary**: NDCG@10 delta vs no-expansion baseline
- **Secondary**: MRR@10 delta; Recall@100 delta (does expansion recover missed relevant docs?)
- **Per-model comparison**: LFM2-700M vs Qwen3-1.7B-FT vs LFM2-2.6B
- **Latency**: p50/p95 expansion time (must be reported alongside quality)
- **Test**: Paired t-test or Wilcoxon signed-rank for statistical significance

### Reranker
- **Primary**: NDCG@5 (top results matter most for code search)
- **Secondary**: NDCG@10; MRR (position of first relevant result)
- **Baseline**: Unranked retrieval output order
- **Test**: Same query set as retrieval; measure improvement over retrieval-only

### End-to-End (Agent Task Completion)
- **Primary**: SWE-bench resolve rate (existing agentbench harness — already built)
- **Secondary**: Files-retrieved-that-were-patched rate (new metric; measures retrieval contribution)
- **Routing ablation**: Run agentbench with regex-only vs learned vs LLM planner
- **Expander ablation**: no-expand vs each tier

---

## Section 5: Research Questions to Answer

### Q1: Dataset Availability
- Does RepoQA (2024) include query type annotations?
- Are there any code IR datasets with explicit symbol/semantic/structural labels?
- What is the overlap between CoSQA and CodeSearchNet test sets?

### Q2: Harness Adaptation
- Can BEIR ingest our hybrid dataset with minimal code changes?
- Does MTEB's CodeSearchNet task allow custom query sets or is it fixed?
- What's the BEIR JSONL schema for (corpus, queries, qrels)?

### Q3: SWE-bench Derivation
- What fraction of SWE-bench-verified issues mention explicit symbol names (→ symbol type)?
- What is the average number of files modified per patch (ground truth precision estimate)?
- Can we use our existing 24 agentbench instances to prototype the pipeline before scaling?

### Q4: Statistical Power
- With 200 queries, what MRR delta is detectable at 80% power (assume MRR variance ~0.04)?
- Is 24 agentbench instances sufficient to detect 5% end-to-end task completion improvement?

### Q5: Prior Art
- Have any papers evaluated query routing methods specifically for code search?
- What routing baselines exist in the literature (2022-2025)?
- Does any paper compare CNN vs embedding-head classifiers for query type classification?

---

## Section 6: Recommended Research Tasks (Ordered by Priority)

### Priority 1: Immediate (before any implementation)
1. Download and profile CoSQA + CodeSearchNet Python test sets
   - Count queries by inferred type (heuristic: explicit identifiers → symbol)
   - Compute size, format, license
2. Audit BEIR package for code search dataset ingestion
   - Can we add a custom dataset with our (query, corpus, qrels) format?
3. Review RepoQA paper (2024) for query type coverage

### Priority 2: Core benchmark construction
4. Derive (issue_text → patch_files) pairs from our 24 agentbench instances
   - Script: parse SWE-bench JSON, extract issue body + modified files from patch
5. Generate synthetic symbol/semantic queries from our 12 repos
   - Use mnemex `map` + `symbol` output as seed; deepseek for paraphrase generation
6. Annotate 50 example queries per type for router training seed set

### Priority 3: Harness implementation
7. Implement BEIR-compatible evaluation wrapper for mnemex retrieval
   - Input: BEIR JSONL corpus + queries + qrels
   - Output: NDCG@5, NDCG@10, MRR@10, Recall@100
8. Implement per-component evaluation isolation
   - Router: feed gold query type → measure routing accuracy
   - Expander: measure NDCG with/without expansion (paired)
   - Reranker: measure NDCG before/after reranking

### Priority 4: Validation
9. Run baseline (no router, no expander, no reranker) on constructed dataset
   - Establishes floor; validates dataset has non-trivial retrieval difficulty
10. Sanity check: does our hybrid dataset have reasonable difficulty distribution?
    - Target: MRR@10 baseline ~0.4-0.6 (too easy or too hard reduces discriminability)

---

## Section 7: Expected Outputs

| Output | Description | Timeline |
|--------|-------------|----------|
| Dataset profile | CoSQA/CSN size, format, type distribution | Day 1 |
| BEIR compatibility report | What changes needed; sample JSONL schema | Day 1 |
| SWE-bench derivation script | issue → patch_files for 24 agentbench instances | Day 2 |
| Synthetic query generator | deepseek-based query generation from symbol index | Day 3 |
| Evaluation harness v0 | BEIR-wrapped retrieval eval with our metrics | Day 4-5 |
| Baseline results | Floor metrics on hybrid dataset | Day 5 |

---

## Section 8: Open Questions for Follow-Up

1. **License**: CoSQA and CodeSearchNet are MIT/Apache — confirm before using in eval
2. **Corpus size**: Our 12 repos have ~39K symbols; is per-repo evaluation meaningful or do we need cross-repo?
3. **Query type taxonomy**: 3 classes (symbol/semantic/structural) may be insufficient — consider 4-class with "exploratory/navigational"
4. **Human annotation budget**: For router training, do we need human-labeled queries or can we rely on synthetic labels + LLM verification?
5. **Retrieval unit**: Evaluate at file level (coarse, matches SWE-bench) or function level (fine, matches CSN)? Recommend function-level for retrieval components, file-level for end-to-end.
