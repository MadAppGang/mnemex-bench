# Search Queries: Code Search Test Harness Research

Generated: 2026-03-06

---

## Q1: Pre-Built Code Search Datasets

### Q1.1 — CodeSearchNet dataset format and query types
- `CodeSearchNet dataset NL query code retrieval evaluation 2019`
- `CodeSearchNet huggingface code_search_net query type distribution docstring`
- `CodeSearchNet test set size splits Python Java Go Ruby evaluation`

### Q1.2 — CoSQA real user query annotations
- `CoSQA dataset Bing search queries Python code relevance annotations 2021`
- `CoSQA microsoft CodeBERT binary relevance judgments 20604 pairs`
- `CoSQA overlap CodeSearchNet Python test set query distribution`

### Q1.3 — AdvTest and adversarial code search
- `AdvTest CodeXGLUE adversarial code search hard negatives 280 queries`
- `CodeXGLUE code search adversarial test robustness evaluation`

### Q1.4 — RepoQA query type labels (2024)
- `RepoQA 2024 long-context code retrieval benchmark query types annotations`
- `RepoQA dataset repository-level code search query intent labels`
- `RepoQA arxiv 2024 needle function retrieval ground truth`

### Q1.5 — Query type / intent labels for code search
- `code search dataset query intent classification symbol semantic structural labels`
- `natural language code search query type annotation benchmark 2023 2024`
- `code IR dataset explicit function name lookup vs semantic query labels`
- `StackOverflow code search dataset question intent type annotations`

### Q1.6 — WebQueryTest and related real-query datasets
- `WebQueryTest web crawled natural language queries code snippets evaluation`
- `real user query code search dataset high fidelity benchmark comparison`

---

## Q2: Existing Eval Harnesses and Frameworks

### Q2.1 — BEIR code search support
- `BEIR benchmark code search dataset custom ingestion JSONL format`
- `BEIR beir-cellar custom dataset corpus queries qrels schema`
- `BEIR NDCG MRR Recall evaluation code retrieval pipeline integration`
- `BEIR adding custom dataset code search CodeSearchNet adaptation`

### Q2.2 — MTEB code search subtask
- `MTEB CodeSearchNetRetrieval task Python queries NDCG@10 evaluation`
- `MTEB code search subtask custom query set fixed evaluation protocol`
- `mteb python package CodeSearchNet evaluate() interface retrieval`

### Q2.3 — RAGAS for code retrieval
- `RAGAS code retrieval context precision recall evaluation RAG pipeline`
- `RAGAS code search ground truth without LLM answer retrieval only evaluation`

### Q2.4 — GitHub repos and frameworks for code search evaluation
- `code search evaluation harness GitHub 2023 2024 retrieval metrics MRR NDCG`
- `hybrid BM25 vector code search evaluation framework Python`
- `CodeBERT evaluation scripts MRR@10 CodeSearchNet standard splits`
- `LOTTE long-tail topic-stratified evaluation programming technology domain`

### Q2.5 — Microsoft CodeBERT/UniXcoder evaluation
- `CodeBERT microsoft evaluation scripts CodeSearchNet MRR retrieval`
- `UniXcoder code search evaluation NL code retrieval metrics`

---

## Q3: Building Custom Benchmarks

### Q3.1 — Deriving queries from SWE-bench patches
- `SWE-bench issue text patch files ground truth retrieval evaluation`
- `SWE-bench verified 500 instances issue to modified files code search`
- `SWE-bench issue text symbol name mention fraction query type classification`
- `SWE-bench average files modified per patch ground truth precision retrieval`
- `SWE-bench derived retrieval benchmark issue body relevant files construction`

### Q3.2 — Synthetic query generation for code search
- `synthetic query generation code search LLM docstring paraphrase benchmark`
- `automated code search benchmark construction function docstring to query`
- `deepseek query generation code retrieval ground truth symbol semantic`
- `code search benchmark synthetic queries LLM quality evaluation 2024`
- `generating natural language queries from code for retrieval evaluation`

### Q3.3 — Minimum dataset sizes and statistical power
- `MRR NDCG statistical significance sample size code retrieval evaluation`
- `paired t-test Wilcoxon signed-rank retrieval MRR delta 200 queries power`
- `minimum queries statistical power 80% 5% MRR improvement code search`
- `information retrieval evaluation dataset size significance testing sample`
- `code search evaluation dataset size recommendation retrieval benchmark`

### Q3.4 — Query type taxonomy for code search
- `code search query taxonomy symbol lookup semantic structural exploratory`
- `code search query classification types intent categories literature 2022 2024`
- `software developer search behavior query type taxonomy study`

---

## Q4: Component-Level Metrics

### Q4.1 — Query router evaluation metrics
- `query router classifier evaluation metrics code search accuracy macro-F1`
- `query intent classifier evaluation precision recall confusion matrix code IR`
- `query routing accuracy code search regex classifier learned embedding comparison`
- `query type classification code search literature routing methods 2022 2025`
- `CNN vs embedding classifier query type classification code search comparison`

### Q4.2 — Retrieval quality metrics (MRR, NDCG, Recall@K)
- `MRR NDCG Recall@K code search retrieval evaluation metrics comparison`
- `NDCG@5 NDCG@10 MRR@10 code retrieval benchmark standard metrics`
- `hybrid BM25 dense retrieval NDCG evaluation code search improvement`
- `Recall@100 retrieval code search coverage metric evaluation`
- `retrieval metrics code search function level file level granularity`

### Q4.3 — Reranker evaluation approaches
- `reranker evaluation NDCG@5 code search improvement over retrieval baseline`
- `cross-encoder reranker code retrieval evaluation pipeline NDCG improvement`
- `reranking evaluation code search before after comparison metric methodology`
- `code reranker ColBERT cross-encoder evaluation benchmark metrics 2023 2024`

### Q4.4 — Query expansion evaluation for code search
- `query expansion code search NDCG delta evaluation LLM expansion`
- `query expansion evaluation retrieval improvement paired comparison code IR`
- `LLM query expansion code search quality latency tradeoff evaluation`
- `pseudo relevance feedback query expansion code search benchmark evaluation`

---

## Query Counts by Section

| Section | Query Count |
|---------|-------------|
| Q1: Pre-built datasets | 17 |
| Q2: Eval harnesses/frameworks | 15 |
| Q3: Custom benchmark construction | 15 |
| Q4: Component-level metrics | 16 |
| **Total** | **63** |
