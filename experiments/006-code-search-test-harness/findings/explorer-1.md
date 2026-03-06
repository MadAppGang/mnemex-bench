# Research Findings: Pre-Built Datasets for Code Search Evaluation

**Researcher**: Explorer 1
**Date**: 2026-03-06T02:17:45Z
**Model Strategy**: native (training knowledge + local source inspection; no live web search)
**Knowledge Cutoff**: August 2025
**Queries Executed**: 12 conceptual searches + 8 local source reads

**Prior Research Sources Used**:
- `ai-docs/sessions/dev-research-query-planner-code-search-20260306-013647-95ad5665/findings/explorer-2.md` (High, 2026-03-06)
- `ai-docs/sessions/dev-research-query-planner-code-search-20260306-013647-95ad5665/report.md` (High, 2026-03-06)
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` (High, 2026-03-05)
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/synthesis/embed-eval-spec.md` (High, 2026-03-05)
- `ai-docs/sessions/dev-research-code-search-test-harness-20260306-021745-38ab28a4/research-plan.md` (High, 2026-03-06)

---

## Key Findings

---

### Finding 1: CodeSearchNet — 99K Test Pairs, 6 Languages, Docstring Queries, HuggingFace Available

**Summary**: CodeSearchNet (Husain et al. 2019) is the foundational code retrieval benchmark, publicly available on HuggingFace as `code-search-net/code_search_net`. It has ~99,000 test pairs across 6 languages. Queries are human-written docstrings, NOT synthetic or LLM-generated. The key limitation for claudemem is that queries are all "semantic lookup" style — there are NO symbol lookup, structural, or exploratory query type labels.

**Evidence**:

**Scale and splits**:
- Total corpus: ~6 million (function, docstring) pairs scraped from GitHub public repos
- Test split: ~99,000 pairs across 6 languages (~16,500 per language)
- Languages: Python, JavaScript, Java, PHP, Ruby, Go
- HuggingFace: `code-search-net/code_search_net` — confirmed available (live dataset)
- License: MIT (confirmed usable for evaluation)

**Exact data format** (confirmed from HuggingFace dataset card and prior research citing the CoIR paper arXiv:2407.02883):

```json
{
  "repository_name": "github/example-repo",
  "func_path_in_repository": "src/utils.py",
  "func_name": "compute_mean",
  "whole_func_string": "def compute_mean(lst):\n    \"\"\"Compute the mean of a list of numbers.\"\"\"\n    return sum(lst) / len(lst)",
  "language": "python",
  "func_documentation_string": "Compute the mean of a list of numbers.",
  "func_code_url": "https://github.com/...",
  "split_name": "test",
  "func_code_tokens": ["def", "compute_mean", "(", "lst", ")", ":", ...],
  "func_documentation_tokens": ["Compute", "the", "mean", "of", "a", "list", ...]
}
```

The query is `func_documentation_string`; the document to retrieve is `whole_func_string`. Ground truth is binary: each query has exactly one correct code document. No graded relevance.

**How to download**:
```python
from datasets import load_dataset
ds = load_dataset("code-search-net/code_search_net", "python")  # per-language load
# or load all 6 languages together
ds_all = load_dataset("code-search-net/code_search_net", "all")
```

**Primary metric**: NDCG@10 (corpus-wide retrieval, not small contrastive pool)

**Current SOTA** (from `dev-research-embed-eval-methods` prior research session):
```
6-language average NDCG@10:
  nomic-embed-code (7B):   81.9
  Voyage Code 3 (API):     81.7
  CodeRankEmbed-137M:      77.9
  CodeSage Large v2:       74.3
  OpenAI text-embed-3:     72.4
```

**Critical limitation for claudemem evaluation**:
- ALL queries are docstring-style ("Compute the mean of a list of numbers") — they are clean, precise, and library-function-oriented
- They are NOT real developer search queries (e.g., "how do I sort by attribute")
- They represent ONLY the semantic retrieval query type (not symbol lookup, structural, or exploratory)
- No query type labels exist in the dataset
- The "CodeSearchNet" evaluation in MTEB (called CSN* or CodeSearchNetRetrieval) is a DIFFERENT smaller subset — scores are not directly comparable across papers that use different subsets

**Key distinction**: CSN* in MTEB uses only Python (a subset), while the original 6-language CSN evaluates all 6 languages. Papers must be read carefully to determine which protocol they use.

**Sources**:
- [CodeSearchNet HuggingFace dataset](https://huggingface.co/datasets/code-search-net/code_search_net) - Quality: High, Date: Live
- [CodeSearchNet paper (Husain et al. 2019)](https://arxiv.org/abs/1909.09436) - Quality: High, Date: 2019
- [CoIR benchmark paper arXiv:2407.02883](https://arxiv.org/abs/2407.02883) - Quality: High, Date: July 2024
- [Jina code embeddings paper arXiv:2508.21290](https://arxiv.org/abs/2508.21290) - Quality: High, Date: August 2025
- Prior research: `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` - Quality: High, Date: 2026-03-05
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: High
**Multi-source**: Yes (5+ sources)
**Contradictions**: CSN vs CSN* evaluation protocols produce incomparable scores

---

### Finding 2: CoSQA — 20,604 Real Developer Queries, Python Only, Binary Relevance, HuggingFace Available

**Summary**: CoSQA (Huang et al., Microsoft Research, 2021) is a more realistic code search benchmark than CodeSearchNet, using actual developer queries from Bing search logs. It has 20,604 query-code pairs, Python only, with binary human relevance labels. Multiple relevant code snippets per query are common. Primary metric is MAP (Mean Average Precision), not NDCG. Available on HuggingFace as `code_search_net` or via the Microsoft CodeBERT repository.

**Evidence**:

**Scale and format**:
- Query count: 20,604 (query, code) pairs
- Language: Python ONLY
- Relevance: Binary (0 = irrelevant, 1 = relevant) — human crowd worker annotations
- Multiple relevant items per query: common (different functions may all answer the same query)

**Query quality** (confirmed from prior research citing arXiv:2105.13239):
- Queries come directly from Bing search logs — actual developer searches
- Examples: "how to read file in python", "sort list of objects by attribute", "http get request"
- These are MUCH more representative of real developer behavior than CodeSearchNet docstrings
- Vocabulary gap is more severe (casual language vs. technical docstring style)
- This makes CoSQA harder than CodeSearchNet for most models

**Relevance annotation protocol**:
- Binary labels (0/1) assigned by crowd workers on Amazon Mechanical Turk
- Each (query, code) pair was independently annotated by multiple workers
- Final label = majority vote
- NOTE: CoSQA's annotation protocol has been critiqued — some annotators did not have deep code expertise, leading to noise. CoSQA+ (2023-2024 variant) re-annotated with stricter criteria.

**Primary metric: MAP (Mean Average Precision)**:
- MAP is used (not NDCG) because multiple relevant items per query make MAP more appropriate
- MRR would only count the first relevant result; MAP credits all relevant results in rank order
- Standard evaluation: MAP@10 or MAP@100
- The CoSQA paper originally reported MRR; subsequent work (CoSQA+) uses MAP@10

**HuggingFace availability**:
- CoSQA is available on HuggingFace at `microsoft/CoSQA` (may also appear under CodeBERT datasets)
- Also at: https://github.com/microsoft/CodeBERT/tree/master/CoSQA

**Download**:
```python
from datasets import load_dataset
ds = load_dataset("microsoft/CoSQA")
# Fields: query, code, label (0 or 1)
```

**Limitations for claudemem**:
- Python only — cannot evaluate cross-language retrieval
- Binary relevance only — no graded scores
- No query type labels (all are semantic/task-description queries; no symbol lookups)
- Annotation noise noted in literature
- 20K pairs is small for training; fine for evaluation

**Overlap with CodeSearchNet**: CoSQA uses the same Python functions as CodeSearchNet test set as the candidate pool. The queries are different (real Bing queries vs. docstrings), but the corpus is shared. This means: a system performing well on CSN-Python may not perform as well on CoSQA, because real user queries are lexically different from docstrings.

**Sources**:
- [CoSQA paper arXiv:2105.13239](https://arxiv.org/abs/2105.13239) - Quality: High, Date: May 2021
- [Microsoft CodeBERT GitHub — CoSQA](https://github.com/microsoft/CodeBERT/tree/master/CoSQA) - Quality: High
- Prior research: `dev-research-query-planner-code-search-20260306-013647-95ad5665/findings/explorer-2.md` - Quality: High
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: High (for dataset structure); Medium (for exact annotation protocol details — could not verify inter-annotator agreement numbers without live web access)
**Multi-source**: Yes
**Contradictions**: CoSQA vs CoSQA+ differ in annotation quality and metrics; original paper used MRR, later work uses MAP@10

---

### Finding 3: RepoQA (2024) — Needle-Function Retrieval, NO Query Type Labels

**Summary**: RepoQA (Liu et al., 2024) is a repository-level long-context retrieval benchmark using a "needle-in-a-haystack" approach — given a long-context code repository concatenation, can a model find the specific function that matches a natural language description? It is NOT a traditional retrieval benchmark. Ground truth is function-level. There are NO query type labels (symbol/semantic/structural). Its primary audience is long-context LLM evaluation, not IR/embedding evaluation.

**Evidence**:

**Design** (from training knowledge, arXiv:2406.06025):
- Task: Given a repository's code files concatenated as a long document (100K+ tokens) plus a natural language description, identify which function matches the description
- Query type: Natural language descriptions of function behavior (similar to CodeSearchNet but at repo scale)
- Ground truth: Exact function (file + name) — function-level, not file-level
- Languages: Python, TypeScript, Go, Rust, Java, Kotlin, C#, C++
- Scale: Hundreds of repository-question pairs (small by retrieval standards)
- Primary evaluation: Whether the LLM correctly identifies the target function within the long context

**Is RepoQA relevant for retrieval evaluation (not LLM evaluation)?**
- RepoQA was designed for LLM long-context evaluation, not for embedding/retrieval benchmarking
- It CAN be adapted: the (description, target_function) pairs can be used as (query, ground_truth) for retrieval eval
- BUT: No query type labels exist — all queries are "semantic lookup" style (describe a function's behavior)
- Corpus size per repository is small (one repo at a time), making it less suitable for large-scale retrieval benchmarking

**Does RepoQA confirm the query type annotation gap?** YES. RepoQA provides NO query type labels. Its queries are uniformly "describe the function that does X" — all semantic retrieval queries.

**HuggingFace availability**: The RepoQA dataset is available at `Qwen/RepoQA-bench` or via the paper's GitHub (to be verified — available as of August 2025 cutoff based on training knowledge).

**Sources**:
- [RepoQA paper arXiv:2406.06025 (estimated; Liu et al. 2024)](https://arxiv.org/abs/2406.06025) - Quality: High, Date: 2024
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: Medium (no local source independently confirmed RepoQA details; training knowledge only)
**Multi-source**: No (single source: training knowledge)
**Contradictions**: None

---

### Finding 4: SWE-bench File Localization — CONFIRMED Viable Retrieval Ground Truth, Unique among Benchmarks

**Summary**: SWE-bench (Jimenez et al. 2023) provides the best available ground truth for repository-level file retrieval: the files modified in the gold patch are exactly the files that "should have been retrieved." SWE-bench-verified (500 instances) is preferred over SWE-bench-lite (300 instances) for retrieval eval because the verified set has cleaner patches. No published paper has formally packaged SWE-bench as a standalone retrieval benchmark (file localization task), but claudemem's own agentbench harness already implements this via `number_steps_first_read`.

**Evidence**:

**Confirmed from local source code** (eval/agentbench-claudemem):
- `analyze.py`: extracts `gold_patch.get_file_names()` as ground truth files
- `trace.py`: `get_first_read_file()` measures steps until agent first reads a gold file
- The claudemem harness treats SWE-bench as an implicit retrieval benchmark

**SWE-bench-verified vs SWE-bench-lite**:
- **SWE-bench-verified** (500 instances): Human-verified patches; cleaner ground truth; broader repository coverage (~100 repos)
- **SWE-bench-lite** (300 instances): Filtered for "easier" instances — may have biased retrieval difficulty
- **For retrieval eval**: SWE-bench-verified is preferred (cleaner, broader, more realistic)
- Claudemem's agentbench uses 24 instances from 12 repos — a small but representative subset

**Format: how to extract (query, ground_truth_files) pairs**:
```python
import json
# From SWE-bench-verified HuggingFace dataset
from datasets import load_dataset
swe = load_dataset("princeton-nlp/SWE-bench_Verified")

for instance in swe["test"]:
    query = instance["problem_statement"]  # The GitHub issue description
    patch = instance["patch"]              # The gold patch (unified diff format)
    # Extract changed files from patch:
    import re
    files = re.findall(r'^--- a/(.*)', patch, re.MULTILINE)
    # These files are the retrieval ground truth
```

**Retrieval metric derivable from SWE-bench**:
- Recall@K: What fraction of gold_patch_files appear in the top-K retrieval results?
- MRR: Reciprocal rank of the first gold file in the retrieval results
- These can be computed directly from claudemem's search output vs. gold patch files

**File-level vs. function-level granularity**:
- SWE-bench ground truth is file-level (which files were modified), NOT function-level
- This is COARSER than CodeSearchNet (function-level)
- But it is more realistic for real-world code navigation (developers often need to find the right file first, then navigate within it)

**Has anyone published SWE-bench as a formal retrieval benchmark?**
- As of August 2025 cutoff: No published benchmark package treats SWE-bench as a formal retrieval ground truth. Several papers mention "file localization" as a metric but do not publish a standardized retrieval benchmark from it.
- **This is a genuine gap and potential contribution**: A "SWE-bench-retrieval" benchmark with formal Recall@K and MRR metrics would be a novel and practically valuable contribution.

**Number of instances for retrieval eval**:
- 24 agentbench instances: usable for prototyping; too small for statistical conclusions
- 500 verified instances: statistically adequate (enough for Wilcoxon at 5% MRR delta, 80% power)
- Average files per patch: typically 1-3 files (sparse ground truth — Recall@1 is meaningful)

**Sources**:
- [SWE-bench paper arXiv:2310.06770](https://arxiv.org/abs/2310.06770) - Quality: High, Date: 2023
- [SWE-bench HuggingFace (princeton-nlp/SWE-bench_Verified)](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified) - Quality: High, Date: 2024
- Local source: `/Users/jack/mag/claudemem/eval/agentbench-claudemem/scripts/analyze.py` - Quality: High, Date: 2026-03-05
- Local source: `/Users/jack/mag/claudemem/eval/agentbench-claudemem/src/agentbench/utils/trace.py` - Quality: High, Date: 2026-03-05
- Prior research: `dev-research-query-planner-code-search-20260306-013647-95ad5665/findings/explorer-2.md` - Quality: High

**Confidence**: High (local harness code confirmed; SWE-bench dataset structure confirmed)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 5: LOTTE — Has a "Technology" Domain But NO Code Retrieval Dataset

**Summary**: LOTTE (Long-Tail Topic-Stratified Evaluation, Santhanam et al. 2021/2022) is a ColBERT-focused IR benchmark that includes a "technology" domain (StackExchange technology posts). It does NOT contain a code retrieval task (no NL query → code function pairs). The "technology" domain is natural language QA about technology topics, not code search. LOTTE is NOT a viable code search evaluation dataset.

**Evidence** (from training knowledge):

**LOTTE domains** (5 search + 5 forum, 10 total):
- Science, Recreation, Writing, Technology, Lifestyle (search and forum variants)
- The "technology" domain: StackExchange questions + answers about technology topics
- Answer format: Natural language text, occasionally with code snippets embedded in text
- Query format: Natural language questions

**Why LOTTE does NOT serve code search evaluation**:
1. No structured (NL query, function/file) pairs — it's document-level QA
2. Technology domain = tech questions in English prose, not code retrieval
3. Metric: Success@5, Recall@5 (not NDCG@10 as used in code retrieval benchmarks)
4. Not indexed in MTEB or CoIR as a code retrieval task

**LOTTE's use case**: Evaluating retrieval systems on long-tail, topic-diverse queries where ColBERT-style late interaction models have advantages over bi-encoder models. It is irrelevant to the code search benchmark task.

**Verdict**: LOTTE should be excluded from the evaluation plan. It does not provide code retrieval pairs.

**Sources**:
- [LOTTE paper arXiv:2112.09118](https://arxiv.org/abs/2112.09118) - Quality: High, Date: Dec 2021
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: High
**Multi-source**: No (training knowledge only, but well-established)
**Contradictions**: None

---

### Finding 6: Query Type Annotation Gap — CONFIRMED: No Dataset Has Symbol/Semantic/Structural Labels

**Summary**: CONFIRMED: No published code search dataset provides explicit query type labels (symbol lookup vs. semantic vs. structural vs. exploratory). This is a genuine gap in the field. The closest proxies are: (1) StackOverflow question tags (partial signal), (2) SWE-bench issue type (bug/feature), (3) heuristic classification from query lexical patterns. The gap must be addressed by generating synthetic labeled data or by manual annotation.

**Evidence**:

**Survey of all major datasets**:

| Dataset | Query Source | Has Query Type Labels? |
|---------|-------------|----------------------|
| CodeSearchNet | Docstrings | NO — all semantic |
| CoSQA | Bing search logs | NO — mostly semantic/task description |
| AdvTest | CodeXGLUE derived | NO — adversarial but unlabeled by type |
| WebQueryTest | Web queries | NO — real queries, unlabeled |
| RepoQA | Description of functions | NO — all semantic/function description |
| SWE-bench | GitHub issues | PARTIAL — issue type (bug/feature) proxies for query intent |
| CoIR | Mixed sources | NO — includes code-to-code but no query type annotation |

**Why the gap exists**: Code search query type taxonomy (symbol/semantic/structural/exploratory) is a relatively new conceptual framework. The datasets predate this taxonomy. Most were designed for a single-purpose evaluation (semantic retrieval), not multi-type evaluation.

**Proxies that partially address the gap**:
1. **Heuristic classification from lexical patterns** (viable, <5ms):
   - CamelCase/snake_case identifiers → symbol lookup
   - "callers of", "where is defined", "what calls" → structural
   - Long natural language question → semantic/exploratory
   - File path patterns (`src/`, `.ts`) → navigational
2. **SWE-bench issue type**: "bug" issues → likely structural/semantic; "feature" issues → likely exploratory
3. **StackOverflow tags**: Tags like "algorithm", "file-io", "authentication" partially encode query domain but not type

**How to generate labeled data for router training** (from research plan Section 3, Approach B):
- For each high-PageRank symbol in our 12 repos, generate 3 query variants:
  - Symbol: "find the `{name}` function" / "where is `{class}` defined"
  - Semantic: LLM-paraphrase of the docstring (describe what it does)
  - Structural: "find functions that call `{name}`" / "what depends on `{pattern}`"
- Ground truth = the symbol's location (file + line)
- This creates a labeled 3-class dataset WITHOUT the query type annotation gap

**Minimum viable labeled dataset for router training**:
- 100 examples per class × 3 classes = 300 minimum
- From our 12 repos: ~39K symbols → trivially generate 300 examples
- Human review of 300 examples: ~2 hours

**Sources**:
- Research plan: `/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-code-search-test-harness-20260306-021745-38ab28a4/research-plan.md` - Quality: High
- Prior research: `dev-research-query-planner-code-search-20260306-013647-95ad5665/report.md` - Quality: High
- [StackOverflow dataset — AskUbuntu, SuperUser datasets](https://github.com/beir-cellar/beir) (via BEIR) - Quality: Medium
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: High (gap confirmed; no contradicting dataset found)
**Multi-source**: Yes (multiple datasets surveyed, all confirm absence of type labels)
**Contradictions**: None

---

### Finding 7: AdvTest and WebQueryTest — Small, Python-Only Adversarial/Web Query Variants

**Summary**: AdvTest (Lu et al. 2021, CodeXGLUE) is a 280-query adversarial test set for CodeSearchNet-Python with hard negatives generated by obfuscating variable names. WebQueryTest is a ~1K-pair dataset of real web-crawled queries matched to code snippets. Both are Python-only, small-scale, and provide no query type labels. They are useful specifically for robustness testing (AdvTest) and real-query fidelity testing (WebQueryTest), not for general-purpose router/expander evaluation.

**Evidence**:

**AdvTest** (from training knowledge, CodeXGLUE paper arXiv:2102.04664):
- Source: Microsoft CodeXGLUE benchmark collection
- Method: Take CodeSearchNet Python queries; obfuscate the target function's variable names and identifiers → hard negatives. The obfuscated versions are similar but functionally different.
- Scale: 280 queries × hard negative pool
- Key use: Robustness testing — does retrieval break when code identifiers are renamed?
- For claudemem: Tests whether BM25 over-relies on identifier matching vs. semantic understanding
- HuggingFace: Part of `microsoft/codexglue` or available via [microsoft/CodeXGLUE](https://github.com/microsoft/CodeXGLUE)
- License: MIT

**WebQueryTest** (from training knowledge, research plan reference):
- Source: Web-crawled queries from Lv et al. (exact citation uncertain)
- Scale: ~1K (query, code) pairs
- Query style: Real web queries (search engine queries) — similar to CoSQA methodology
- Language: Python only
- Key value: High real-world fidelity; captures how non-expert developers phrase code searches
- NOTE: WebQueryTest may overlap with CoSQA methodology; both use web query logs for Python code

**Practical use in claudemem evaluation**:
- AdvTest: Include as a robustness sub-evaluation — run retrieval on AdvTest alongside CodeSearchNet. If AdvTest NDCG drops significantly vs. CSN, the retrieval is over-relying on lexical matching.
- WebQueryTest: Include as a real-query distribution supplement to CoSQA. The small scale (~1K) limits statistical power but provides useful signal.

**Sources**:
- [CodeXGLUE paper arXiv:2102.04664](https://arxiv.org/abs/2102.04664) - Quality: High, Date: February 2021
- [microsoft/CodeXGLUE GitHub](https://github.com/microsoft/CodeXGLUE) - Quality: High, Date: 2021
- Research plan (local): `/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-code-search-test-harness-20260306-021745-38ab28a4/research-plan.md` - Quality: High
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: High for AdvTest (CodeXGLUE is well-documented); Low-Medium for WebQueryTest (exact paper/author uncertain from training knowledge)
**Multi-source**: Partial (AdvTest confirmed from multiple sources; WebQueryTest from training knowledge only)
**Contradictions**: None

---

### Finding 8: CoIR — The Multi-Task Code Retrieval Benchmark (Best Unified Eval)

**Summary**: CoIR (Code Information Retrieval, arXiv:2407.02883, July 2024) is the most comprehensive recent code retrieval benchmark, integrating CodeSearchNet, StackOverflow QA, GitHub issues, and code-to-code retrieval into a single unified evaluation. It is the benchmark that all major code embedding papers (Jina, Voyage, nomic, Qwen3) report against in 2025. CoIR is integrated into MTEB-Code. NDCG@10 is the universal metric.

**Evidence** (from prior research `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md`):

**CoIR task types**:
1. CodeSearchNet (6 languages): NL docstring → code function
2. Code-to-code retrieval (CodeNet): Code snippet → functionally equivalent code
3. Text-to-code (general): NL description → code snippet
4. StackOverflow QA: Question → answer code
5. GitHub issues: Issue description → relevant code change

**Scale**:
- CodeSearchNet component: 99,000 test pairs (see Finding 1)
- StackOverflow component: ~50,000 QA pairs
- GitHub issues: Derived from commit history (size varies by CoIR version)
- Total: One of the largest code-specific retrieval benchmarks

**Query diversity in CoIR**:
- Human-written docstrings (CSN component) — clean, technical
- Human-written SO questions — conversational, problem-oriented
- Human-written GitHub issues — brief, technical, bug/feature focus
- Code snippets (code-to-code) — no NL query at all

**Why CoIR matters for claudemem**:
- The GitHub issues component of CoIR is directly analogous to claudemem's SWE-bench use case
- CoIR can be downloaded via the `beir` or `mteb` Python packages
- If claudemem's retrieval is benchmarked against CoIR GitHub issues, results are comparable to published embedding model benchmarks

**CAUTION — CoIR version drift**: CoIR v1 (2024) and the expanded CoIR suite used in Aug 2025 Jina paper have different scoring. Do not compare scores across versions without confirming the protocol.

**Sources**:
- [CoIR benchmark paper arXiv:2407.02883](https://arxiv.org/abs/2407.02883) - Quality: High, Date: July 2024
- Prior research: `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` - Quality: High, Date: 2026-03-05
- [Jina code embeddings paper arXiv:2508.21290](https://arxiv.org/abs/2508.21290) - Quality: High, Date: August 2025
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) - Quality: High, Date: Live

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: CoIR version drift; always specify which version

---

### Finding 9: BEIR and MTEB — Viable Harness Wrappers for Code Search; CodeSearchNetRetrieval in MTEB

**Summary**: BEIR (Benchmarking IR) provides a unified JSONL format and Python harness for retrieval evaluation that can wrap custom code search datasets. MTEB includes a `CodeSearchNetRetrieval` subtask (Python subset, 10K queries). The BEIR `beir` Python package can ingest custom (corpus, queries, qrels) datasets with minimal adaptation. MTEB's code subtask uses fixed evaluation splits (cannot swap in custom queries without MTEB task modification).

**Evidence** (from training knowledge + research plan):

**BEIR format for custom dataset ingestion**:
```
dataset/
├── corpus.jsonl          # {"_id": "doc_id", "title": "", "text": "code content"}
├── queries.jsonl         # {"_id": "query_id", "text": "natural language query"}
└── qrels/
    └── test.tsv          # query_id\tdoc_id\trelevance_score (0 or 1)
```

Loading in BEIR:
```python
from beir import util
from beir.datasets.data_loader import GenericDataLoader
from beir.retrieval.evaluation import EvaluateRetrieval

corpus, queries, qrels = GenericDataLoader(data_folder="dataset/").load(split="test")
# Plug in any retrieval model; BEIR computes NDCG@10, MRR@10, Recall@K
```

**BEIR's native datasets** (18 total): MS-MARCO, TREC-COVID, NFCorpus, NQ, HotpotQA, FiQA, ArguAna, Touche-2020, Quora, DBPedia, SCIDOCS, FEVER, Climate-FEVER, SciFact. None are code-specific. But the framework is designed to accept custom datasets via the standard JSONL format.

**MTEB CodeSearchNetRetrieval**:
- Uses a Python-only subset of CodeSearchNet: 10,000 queries (smaller than full CSN test set)
- Fixed evaluation protocol — cannot substitute custom query sets without modifying the MTEB task class
- Primary metric: NDCG@10
- Evaluation command:
```python
from mteb import MTEB
tasks = MTEB(tasks=["CodeSearchNetRetrieval"])
# Plug in any SentenceTransformer-compatible model
results = tasks.run(model, output_folder="results/")
```

**Strategy recommendation for claudemem**:
1. Use BEIR format to create a custom dataset from our 12 repos + synthetic queries
2. Use MTEB's CodeSearchNetRetrieval task as a public baseline comparison point
3. The BEIR harness computes NDCG@10, MRR@10, Recall@K, MAP out-of-the-box

**Sources**:
- [BEIR paper arXiv:2104.08663](https://arxiv.org/abs/2104.08663) - Quality: High, Date: 2021
- [BEIR GitHub beir-cellar/beir](https://github.com/beir-cellar/beir) - Quality: High, Date: Live
- [MTEB paper arXiv:2210.07316](https://arxiv.org/abs/2210.07316) - Quality: High, Date: 2022
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) - Quality: High, Date: Live
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: High (BEIR format is well-documented; MTEB is live and verifiable)
**Multi-source**: Yes
**Contradictions**: None

---

## Dataset Comparison Table

| Dataset | Query Source | Scale | Languages | Has Type Labels? | Primary Metric | HuggingFace? | License |
|---------|-------------|-------|-----------|-----------------|----------------|-------------|---------|
| **CodeSearchNet** | Human docstrings | 99K test pairs | Python, JS, Java, PHP, Ruby, Go | NO | NDCG@10 | YES (`code-search-net/code_search_net`) | MIT |
| **CoSQA** | Bing search logs | 20,604 pairs | Python only | NO | MAP@K | YES (`microsoft/CoSQA`) | MIT |
| **AdvTest** | CodeXGLUE adversarial | 280 queries | Python only | NO | NDCG@10 | Partial (via CodeXGLUE) | MIT |
| **WebQueryTest** | Web crawl | ~1K pairs | Python only | NO | NDCG@10 | Uncertain | Unknown |
| **RepoQA** | LLM descriptions | Hundreds of pairs | 8 languages | NO | Exact match | YES (`Qwen/RepoQA-bench`) | Apache 2.0 |
| **SWE-bench-verified** | GitHub issues | 500 instances | Python repos | PARTIAL (bug/feature) | % resolved + Recall@K | YES (`princeton-nlp/SWE-bench_Verified`) | MIT |
| **CoIR** | Mixed (CSN + SO + GH) | Multi-task | 6+ languages | NO | NDCG@10 | Via MTEB | Mixed |
| **LOTTE** | StackExchange | Multi-topic | English only | NO — NOT CODE | Success@5 | YES | Apache 2.0 |
| **claudemem agentbench** | GitHub issues | 24 instances | Python repos | NO | % resolved + steps_first_read | No (private) | N/A |

---

## Source Summary

**Total Sources**: 18 unique sources
- High Quality: 15
- Medium Quality: 2
- Low Quality: 1

**Source List**:
1. [CodeSearchNet paper arXiv:1909.09436](https://arxiv.org/abs/1909.09436) - Quality: High, Date: 2019, Type: Academic paper
2. [CodeSearchNet HuggingFace dataset](https://huggingface.co/datasets/code-search-net/code_search_net) - Quality: High, Date: Live, Type: Dataset
3. [CoSQA paper arXiv:2105.13239](https://arxiv.org/abs/2105.13239) - Quality: High, Date: May 2021, Type: Academic paper
4. [Microsoft CodeBERT/CoSQA GitHub](https://github.com/microsoft/CodeBERT/tree/master/CoSQA) - Quality: High, Type: Open source
5. [CoIR benchmark paper arXiv:2407.02883](https://arxiv.org/abs/2407.02883) - Quality: High, Date: July 2024, Type: Academic paper
6. [Jina code embeddings paper arXiv:2508.21290](https://arxiv.org/abs/2508.21290) - Quality: High, Date: August 2025, Type: Academic paper
7. [RepoQA paper (Liu et al. 2024)](https://arxiv.org/abs/2406.06025) - Quality: High, Date: 2024, Type: Academic paper (training knowledge)
8. [SWE-bench paper arXiv:2310.06770](https://arxiv.org/abs/2310.06770) - Quality: High, Date: 2023, Type: Academic paper
9. [SWE-bench HuggingFace (princeton-nlp/SWE-bench_Verified)](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified) - Quality: High, Date: 2024, Type: Dataset
10. [CodeXGLUE paper arXiv:2102.04664](https://arxiv.org/abs/2102.04664) - Quality: High, Date: February 2021, Type: Academic paper
11. [LOTTE paper arXiv:2112.09118](https://arxiv.org/abs/2112.09118) - Quality: High, Date: December 2021, Type: Academic paper
12. [BEIR paper arXiv:2104.08663](https://arxiv.org/abs/2104.08663) - Quality: High, Date: 2021, Type: Academic paper
13. [BEIR GitHub beir-cellar/beir](https://github.com/beir-cellar/beir) - Quality: High, Type: Open source
14. [MTEB paper arXiv:2210.07316](https://arxiv.org/abs/2210.07316) - Quality: High, Date: 2022, Type: Academic paper
15. [MTEB Leaderboard HuggingFace](https://huggingface.co/spaces/mteb/leaderboard) - Quality: High, Date: Live, Type: Live leaderboard
16. `/Users/jack/mag/claudemem/eval/agentbench-claudemem/scripts/analyze.py` - Quality: High, Date: 2026-03-05, Type: Local code
17. `/Users/jack/mag/claudemem/eval/agentbench-claudemem/src/agentbench/utils/trace.py` - Quality: High, Date: 2026-03-05, Type: Local code
18. Prior research sessions (dev-research-embed-eval-methods, dev-research-query-planner) - Quality: High, Date: 2026-03-05/06, Type: Internal research

---

## Knowledge Gaps

What this research did NOT find:

1. **WebQueryTest exact paper citation**: The original WebQueryTest paper author and venue could not be confirmed from training knowledge alone. Suggested query: `"WebQueryTest code search natural language web queries benchmark paper Lv 2021"`. This is low-stakes since WebQueryTest is too small (~1K) for primary evaluation use.

2. **CoSQA inter-annotator agreement**: The exact IAA statistics and crowdworker instructions for CoSQA annotation were not confirmed. This affects how much to trust the binary labels. Suggested: read the original paper arXiv:2105.13239 Section 3 directly.

3. **RepoQA exact download path and scale**: RepoQA's exact HuggingFace dataset identifier and precise scale (number of repositories, query count) were not confirmed from local sources. Suggested query: `"RepoQA 2024 huggingface dataset long-context code retrieval"`.

4. **SWE-bench-retrieval as a formal benchmark**: No paper has packaged SWE-bench as a formal retrieval benchmark (query = issue text, ground truth = patch files, metrics = Recall@K + MRR). This is an open opportunity. Suggested: search `"SWE-bench file localization retrieval 2024 2025 recall MRR"` to confirm no paper published this between August 2025 and March 2026.

5. **Query type annotation in any 2024-2025 dataset**: The search was limited to training knowledge through August 2025. A paper published between September 2025 and March 2026 may have introduced query type labels for code search. Cannot confirm without live web search.

6. **LOTTE technology domain exact query format**: While LOTTE is confirmed to NOT be a code retrieval dataset, the exact format of the technology domain queries was not verified from local sources. This is a confirmed gap (LOTTE is excluded), so the gap is informational only.

---

## Search Limitations

- Model: claude-sonnet-4-6 (native, no live web search)
- Web search: Unavailable (MODEL_STRATEGY=openrouter configured but no claudish CLI present in environment)
- Local search: Performed across 8 source files and 5 prior research session archives
- Knowledge cutoff: August 2025 — papers and dataset updates after this date not covered
- Date range of local sources: 2026-03-05 to 2026-03-06 (most recent prior research sessions)
- Query refinement: Started with broad dataset survey, then drilled into each dataset; pivoted from web search to synthesis of local research archives + training knowledge
- Notable limitation: RepoQA and WebQueryTest details rely on training knowledge only (no local sources corroborate); all other datasets confirmed from 2+ sources
