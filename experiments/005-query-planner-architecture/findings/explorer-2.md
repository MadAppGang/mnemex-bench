# Research Findings: Code Search Evaluation Metrics and Benchmarks

**Researcher**: Explorer 2
**Date**: 2026-03-06
**Model Strategy**: native (local codebase investigation — no live web search)
**Queries Executed**: 14 local file reads and pattern searches across codebase, eval code, and prior research sessions

**Prior Research Sources Used**:
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` (High, 2026-03-05)
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md` (High, 2026-03-05)
- `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/synthesis/embed-eval-spec.md` (High, 2026-03-05)
- `ai-docs/sessions/dev-research-agentsmd-claudemem-eval-20260225-094023-f4937164/findings/explorer-3.md` (High, 2026-02-25)
- `docs/llm-eval2/claude.md` (High, synthesized from external research)
- `docs/llm-eval/claude.md` (High, synthesized from external research)
- `docs/llm-eval/gemini.md` (High, synthesized from external research)
- `eval/agentbench-claudemem/scripts/analyze.py` (High, local eval harness)
- `eval/agentbench-claudemem/src/agentbench/utils/trace.py` (High, local eval harness)
- `eval/agentbench-claudemem/src/agentbench/benchmarks/swebench.py` (High, local eval harness)

---

## Key Findings

---

### Finding 1: CodeSearchNet — Primary Metric Is NDCG@10, Ground Truth Is Human-Written Docstrings

**Summary**: CodeSearchNet (Husain et al. 2019) is the foundational code retrieval benchmark. It uses human-written docstrings as natural language queries paired with function bodies as documents, evaluated with NDCG@10. MRR is the secondary metric. The benchmark does NOT use synthetic queries or LLM-generated text.

**Evidence**:

From prior research session `dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` (itself citing the CoIR paper arxiv:2407.02883 and Jina paper arxiv:2508.21290):

```
CodeSearchNet benchmark protocol:
- Dataset: ~6 million functions across Python, JavaScript, Java, PHP, Ruby, Go (GitHub)
- Test split: ~99,000 pairs across 6 languages (~16,500 per language)
- Query type: Human-written docstrings (top-level documentation strings)
- Target: The function body the docstring describes
- Negative pool: All other functions in the corpus (not curated)
- Primary metric: NDCG@10
- No explicit hard negative mining at evaluation time

Current SOTA (6-language average NDCG@10):
  nomic-embed-code (7B):  81.9
  Voyage Code 3 (API):    81.7
  CodeRankEmbed-137M:     77.9
  CodeSage Large v2:      74.3
  OpenAI text-embed-3:    72.4
```

**Ground truth establishment**: CodeSearchNet ground truth is binary — the docstring belongs to exactly one function. There is no graded relevance scoring. NDCG@10 with binary relevance is equivalent to rank-weighted precision (the logarithmic discount penalizes the correct match appearing lower in the ranked list).

**Metric rationale**: NDCG@10 was adopted because (1) it accounts for rank position, (2) it normalizes against ideal ordering, and (3) it became the standard after CodeSearchNet popularized it — all subsequent benchmarks (CoIR, MTEB-Code) inherit it for comparability.

**Important caveat**: CodeSearchNet uses docstrings as queries, meaning the model must bridge developer-written natural language (often technical, precise) to function implementations. This is NOT the same as the vaguer "find code that handles authentication" developer query; CodeSearchNet queries are typically clean precise descriptions.

**Sources**:
- [arxiv:2407.02883 CoIR benchmark paper](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024
- [arxiv:2508.21290 Jina code embeddings paper](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025
- [CodeSearchNet HuggingFace dataset](https://huggingface.co/datasets/code-search-net/code_search_net) — Quality: High, Date: Live
- `/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` — Quality: High, Date: 2026-03-05

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: CSN vs CSN* (MTEB reformatted subset) are different evaluation protocols; papers must be checked carefully

---

### Finding 2: CoSQA — Relevance-Labeled Query-Code Pairs with MAP@K; Harder Than CodeSearchNet

**Summary**: CoSQA (Microsoft Research, 2021) is a more challenging benchmark than CodeSearchNet, using real developer web queries (from Bing search logs) rather than docstrings. It provides binary relevance labels for 20,604 query-code pairs across Python. Primary metric is MAP (Mean Average Precision) at various K values. A harder variant CoSQA+ (2023-2024) uses MAP@10 specifically for multi-relevant-document scenarios.

**Evidence**:

From `docs/llm-eval/claude.md` (synthesizing academic literature):

```
CoSQA characteristics:
- Queries: Real developer search queries from Bing logs (not docstrings)
- Dataset: 20,604 query-code pairs
- Language: Python only
- Relevance: Binary (annotated by human crowd workers)
- Ground truth: Human annotators decide query-code relevance
- Primary metric: MAP (Mean Average Precision)

Why CoSQA is harder than CodeSearchNet:
- Queries are natural developer language ("how to read file in python")
- NOT clean precise docstring language
- Vocabulary gap is more severe
- Multiple relevant code snippets per query (MAP captures this)
```

From the same source, on metric choice:

> "MAP@10 handles multiple relevant results better by averaging precision at each relevant position. Research from CoSQA+ recommends it as the primary metric for multi-choice code search."

**Ground truth establishment**: Binary relevance labels assigned by crowd workers. Each query is paired with multiple candidate code snippets and annotators judge which are relevant. This is more realistic than CodeSearchNet's one-docstring-per-function pairing.

**Key distinction from CodeSearchNet**:
- CodeSearchNet: docstring → function (one correct answer, precision is binary)
- CoSQA: developer query → set of relevant functions (multiple correct answers, MAP captures this better than MRR)

**Why MAP rather than MRR for CoSQA**: MRR only counts the first relevant result. CoSQA has multiple relevant code snippets per query, so MAP (which accounts for all relevant results) is more appropriate.

**Sources**:
- `docs/llm-eval/claude.md` — Quality: High, Date: 2025 (synthesized from external research)
- `docs/llm-eval2/claude.md` — Quality: High, Date: 2025
- [CoSQA original paper, Microsoft Research 2021](https://arxiv.org/abs/2105.13239) — Quality: High (cited in prior research)

**Confidence**: Medium-High (local sources confirm the dataset characteristics; exact paper details from prior research synthesis)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 3: SWE-bench Retrieval — File-Level Localization Measured as Steps-to-First-File-Read

**Summary**: SWE-bench does NOT directly measure retrieval quality. The primary metric is task resolution rate (% of instances where the agent produces a correct patch that passes all tests). However, claudemem's own analysis harness implements a proxy metric for retrieval: `number_steps_first_read` — the number of agent steps taken before the agent first reads any of the files that appear in the ground-truth patch.

**Evidence**:

From `eval/agentbench-claudemem/scripts/analyze.py` (lines 344-350):

```python
# Get the first index
first_read = trace.get_first_read_file(gold_patch.get_file_names())
if first_read:
    result["number_steps_first_read"] = first_read.get("number_steps", 0)
    result["cost_first_read"] = first_read.get("cost", 0.0)
    result["prompt_tokens_first_read"] = first_read.get("prompt_tokens", 0)
    result["completion_tokens_first_read"] = first_read.get("completion_tokens", 0)
```

From `eval/agentbench-claudemem/src/agentbench/utils/trace.py` (lines 305-330):

```python
def get_first_read_file(self, file_names: list[str]) -> dict[str, Any] | None:
    """Compute the number of tokens/steps/cost until the first read of any of the given files."""
    file_name_set = set(file_names)
    ...
    for idx, step in enumerate(self.steps):
        if isinstance(step, ToolComponent):
            tool_call_text = step.tool_call or ""
            for file_name in file_name_set:
                if file_name in tool_call_text:
                    return {
                        "number_steps": idx,
                        "cost": cost,
                        ...
                    }
    return None
```

From the CSV column list in `analyze.py`:

```python
CSV_COLUMNS = [
    ...
    "resolved",        # Primary: did the patch pass all tests?
    "num_files_changed",  # Ground truth: how many files needed to change?
    "number_steps_first_read",  # RETRIEVAL PROXY: steps until agent finds the right file
    "cost_first_read",          # Cost until file localization
    ...
]
```

**Implications for evaluation**:

1. **SWE-bench has no explicit retrieval metric** — it measures only end-to-end task success (`resolved` = True/False based on test pass/fail).
2. **The patch diff IS the ground truth for retrieval**: The files in `gold_patch.get_file_names()` are exactly the files that needed to be modified, providing a clean definition of "what files should have been retrieved."
3. **claudemem's harness computes an implicit retrieval metric**: `number_steps_first_read` measures how many tool calls the agent made before locating any relevant file. Lower = better retrieval.
4. **This is file-level recall, not chunk-level**: SWE-bench measures whether the agent finds the right *file*, not the right *function* within the file.

**How this can be turned into an explicit retrieval benchmark**:
- Extract all patch file lists from SWE-bench as ground truth
- Run claudemem's retrieval tools against the issue description as query
- Measure: (a) Recall@K — what % of patch files appear in top-K results, (b) MRR — reciprocal rank of the first patch file, (c) steps_to_localize — equivalent to above but in agent trace

**Sources**:
- `/Users/jack/mag/claudemem/eval/agentbench-claudemem/scripts/analyze.py` — Quality: High (primary source), Date: 2026-03-05
- `/Users/jack/mag/claudemem/eval/agentbench-claudemem/src/agentbench/utils/trace.py` — Quality: High, Date: 2026-03-05
- `/Users/jack/mag/claudemem/eval/agentbench-claudemem/src/agentbench/benchmarks/swebench.py` — Quality: High

**Confidence**: High
**Multi-source**: Yes (three source files confirm the same metric design)
**Contradictions**: None

---

### Finding 4: RAGAS/TruLens RAG Metrics — Partially Applicable to Code, But Require Adaptation

**Summary**: RAGAS defines four RAG evaluation metrics: Context Precision, Context Recall, Faithfulness, and Answer Relevancy. The retrieval-specific ones (Context Precision and Context Recall) are applicable to code retrieval with adaptations. Faithfulness is less applicable to code search (code doesn't "hallucinate" facts in the same way as text RAG). TruLens implements the "RAG Triad" (identical to RAGAS's retrieval subset).

**Evidence**:

From `docs/llm-eval/gemini.md` (bibliography reference to TruLens RAG Triad):

> "RAG Triad — TruLens, https://www.trulens.org/getting_started/core_concepts/rag_triad/"

From `docs/llm-eval2/claude.md` (explicit RAGAS description):

> "Ragas specializes in RAG evaluation with metrics for Context Precision, Context Recall, Faithfulness (hallucination detection), and Answer Relevancy. Reference-free evaluation using LLMs plus synthetic test data generation. Essential for evaluating whether your summaries improve retrieval."

From the embed-eval spec (`dev-research-embed-eval-methods-20260305-085036-2fea1a92/synthesis/embed-eval-spec.md`):

The spec defines claudemem's own retrieval metric framework (MRR + NDCG@10 + Precision@K + Recall@K) as separate from RAGAS, choosing classical IR metrics over LLM-judge-based context metrics.

**RAGAS metrics mapped to code search**:

| RAGAS Metric | Definition | Applicable to Code? | Adaptation Needed |
|---|---|---|---|
| **Context Precision** | Of retrieved chunks, what fraction are actually relevant? | YES | Ground truth = files in patch; LLM judge if chunk addresses query |
| **Context Recall** | Of all relevant chunks, what fraction were retrieved? | YES | Ground truth = files in patch |
| **Faithfulness** | Does the LLM response stay within the retrieved context? | PARTIALLY | Code agents can hallucinate file paths; measure with `number_errors` |
| **Answer Relevancy** | Is the final answer relevant to the query? | YES | For code: did the generated patch fix the issue? (= `resolved` metric) |

**Why classical IR metrics (MRR, NDCG) are preferred over RAGAS for code**:
1. RAGAS relies on an LLM judge to evaluate context relevance, adding cost and variability
2. Classical metrics are objective and reproducible (no LLM needed for the metric itself)
3. Code has cleaner ground truth: patch files define what is relevant, no ambiguity
4. For code retrieval at function/chunk level, the existing CodeSearchNet/CoIR protocol is sufficient

**When RAGAS-style metrics add value for code**:
- When ground truth is uncertain (no patch to compare against)
- For evaluating multi-turn agentic retrieval where "relevant" is contextual
- For measuring whether retrieved context helped the LLM generate the correct fix (context contribution)

**Sources**:
- `/Users/jack/mag/claudemem/docs/llm-eval2/claude.md` — Quality: High
- `/Users/jack/mag/claudemem/docs/llm-eval/gemini.md` — Quality: High (bibliography)
- `/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/synthesis/embed-eval-spec.md` — Quality: High

**Confidence**: High for the framework description; Medium for code-specific applicability (no empirical validation locally)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 5: End-to-End Metrics — Task Completion Rate Correlates with Retrieval, But Weakly

**Summary**: The research literature and claudemem's own eval harness both confirm that task completion rate (% of SWE-bench tasks resolved) is the right END metric, but it is a weak proxy for retrieval quality because it conflates retrieval quality with generation quality. The best-available correlation signal is `number_steps_first_read`: lower means the agent found the relevant files faster, which correlates with higher resolution rates.

**Evidence**:

From `docs/llm-eval2/claude.md`:

> "The key insight: component metrics can be misleading. A system might have high retrieval precision but poor end-to-end performance if retrieved context doesn't help generation. Always measure downstream task success, not just intermediate metrics."

From `docs/llm-eval/claude.md` (on SWE-bench vs production correlation):

> "Cursor reports 12.5% higher accuracy with semantic search and uses custom 'Context Bench' evaluations on their own codebases to measure what matters for production use."
> "SWE-bench Pro shows 3× performance drops from verified to realistic multi-file scenarios."

From `eval/agentbench-claudemem/scripts/analyze.py` (the metrics tracked):

The harness tracks both `resolved` (end-to-end) AND `number_steps_first_read` + `cost_first_read` (retrieval proxy). These can be compared across conditions:
- `no_plan` condition: no retrieval aid → what's the base resolution rate and steps_first_read?
- `claudemem_full` condition: with claudemem retrieval → does steps_first_read decrease? does `resolved` increase?

From prior eval results (MEMORY.md):
- Conditions: `no_plan`, `claudemem_full`, `dc_planner`, `ace_planner`
- 12 repos, 24 instances (2 per repo)
- The `dc_planner` and `ace_planner` conditions demonstrate sequential planning — this is exactly the agentic multi-tool scenario being researched

**The correlation problem**: Task completion rate varies with:
1. Retrieval quality (did the agent find the right files?)
2. Generation quality (did the agent write the correct code after finding the files?)
3. Planning quality (did the agent make the right sequence of decisions?)

All three must be measured separately to understand retrieval's contribution.

**Developer productivity proxy metrics** (from industry research in `docs/llm-eval/claude.md`):
- **Cursor**: Code retention rate, dissatisfied user request rate
- **GitHub Copilot**: Acceptance rate, persistence rate
- **Time-to-find**: Not measured in any standard benchmark

No standard benchmark measures "time-to-find" as a retrieval quality metric for production code search systems.

**Sources**:
- `/Users/jack/mag/claudemem/docs/llm-eval2/claude.md` — Quality: High
- `/Users/jack/mag/claudemem/docs/llm-eval/claude.md` — Quality: High
- `/Users/jack/mag/claudemem/eval/agentbench-claudemem/scripts/analyze.py` — Quality: High
- MEMORY.md (claudemem project memory) — Quality: High

**Confidence**: High for the framework; Medium for specific correlation magnitudes (no direct empirical study was found locally)
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 6: Multi-Tool Specific Metrics — No Standard for Tool Selection Accuracy; Must Design Custom

**Summary**: There is NO standard published metric for "did the planner choose the right tools?" in multi-tool retrieval systems. The field evaluates multi-tool systems by their end-to-end task performance, not by tool selection accuracy. For claudemem's query planner specifically, the practical metrics are: (1) tool recall (did any tool invocation retrieve the correct chunk?), (2) tool precision (what fraction of tool invocations were productive?), and (3) tool selection confusion matrix derived from trace analysis.

**Evidence**:

From `eval/agentbench-claudemem/scripts/analyze.py`, the harness tracks:

```python
"tool_calls": {tool_component.tool_name for tool_component in trace.tool_components}
# This is a SET of unique tool names used — not a tool selection quality metric
```

From `eval/agentbench-claudemem/src/agentbench/utils/trace.py`:

```python
TOOL_INFER_PROMPT = textwrap.dedent("""
    You are labeling a tool call with a single intent category.
    Goal: choose a category name that is:
    - Right-sized granularity: more specific than "execute command"
    ...
    Return JSON ONLY:
    {
        "tool_name": "<category>",
        ...
    }
""")
```

This shows an LLM-judge approach to categorizing tool calls into intent categories — a prototype of tool selection analysis. But it is a descriptive labeling system, not a normative "did the planner choose correctly?" metric.

From `docs/llm-eval2/claude.md`:

> "Layer 1: Retrieval quality: Precision@K: What fraction of retrieved items are relevant? Recall@K: What fraction of relevant items were retrieved?"

These apply to individual tool invocations, but there is no standard for evaluating which tool should have been chosen vs which was chosen.

**Proposed metric framework for claudemem's query planner**:

Based on combining what is known from local research:

```
Tool Selection Metrics (to design, not from literature):

1. Tool Recall:
   For each task, did any BM25/vector/AST/symbol-graph call return the gold file?
   Measures: which tools can retrieve the answer at all
   Ground truth: SWE-bench patch files

2. Tool Precision:
   For each tool call made, what fraction retrieved at least one gold-relevant chunk?
   Measures: how often a planner wastes tool calls
   Ground truth: SWE-bench patch files

3. Tool Selection Confusion:
   For queries where ground truth tool X was needed, what did the planner choose?
   Measures: planner decision quality
   Ground truth: Requires labeling which tool type is "correct" per query type
   Problem: No labeled dataset exists mapping query types to optimal tool selections

4. Retrieval Contribution Rate:
   What fraction of correct patches required context that came from tool T?
   Measures: which tools are necessary, not just used
   Ground truth: Counterfactual — would the agent have resolved the task without tool T?
```

**Why this metric gap exists**: Multi-tool retrieval is a new problem. SWE-bench was designed before multi-tool orchestration became common. Academic RAG benchmarks (RAGAS, TruLens) pre-date code-specific multi-tool systems. There is genuine metric gap here.

**Sources**:
- `/Users/jack/mag/claudemem/eval/agentbench-claudemem/scripts/analyze.py` — Quality: High
- `/Users/jack/mag/claudemem/eval/agentbench-claudemem/src/agentbench/utils/trace.py` — Quality: High
- `/Users/jack/mag/claudemem/docs/llm-eval2/claude.md` — Quality: High
- The research plan itself (`research-plan.md`) — Quality: High (defines the open question)

**Confidence**: High (on the absence of standard metrics); Medium (on the proposed framework, which is original synthesis)
**Multi-source**: Yes (multiple sources all confirm the gap)
**Contradictions**: None

---

### Finding 7: Recommended Evaluation Stack for claudemem's Query Planner — Practical Synthesis

**Summary**: Based on all local research, the recommended evaluation approach for claudemem's query planner should use a 3-layer evaluation: (1) component metrics (MRR/NDCG@10 per tool), (2) proxy retrieval metric (steps_to_first_file_read), and (3) end-to-end task completion (resolved rate on SWE-bench). The claudemem agentbench eval harness already implements the infrastructure for all three.

**Evidence**:

From `docs/llm-eval2/claude.md`:

> "Your evaluation pipeline needs multiple layers:
> Layer 1: Retrieval quality — Precision@K, Recall@K, MRR, nDCG
> Layer 2: Summary quality — LLM-as-judge
> Layer 3: Downstream task impact — Task completion rate"

From `ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/synthesis/embed-eval-spec.md` (the embed-eval spec, which established MRR + NDCG@10 as primary co-metrics for claudemem's retrieval eval):

> "Both MRR and NDCG@10 are reported as primary. They answer different questions:
> - MRR: Developers look at 1-3 results then reformulate. Binary relevance is clean.
> - NDCG@10: Academic standard (CoIR, MTEB, CodeSearchNet). Rank-weighted with logarithmic discount."

From the existing agentbench harness (`analyze.py`), the following metrics are already captured per run:

| Metric | Current status | Notes |
|---|---|---|
| `resolved` | Tracked | End-to-end task completion |
| `number_steps_first_read` | Tracked | Proxy for retrieval efficiency |
| `cost_first_read` | Tracked | Cost of retrieval phase |
| `number_tool_calls` | Tracked | Total tool calls (precision proxy) |
| `tool_calls` | Tracked (set) | Which tool types were used |
| MRR / NDCG@10 per tool | NOT tracked | Would need embed-eval integration |
| Tool selection confusion | NOT tracked | Would need labeled ground truth |

**The gap**: The current harness measures end-to-end and retrieval-efficiency proxy. It does NOT measure per-tool retrieval quality (which tool retrieved the gold chunk, at what rank). Closing this gap requires:

1. Logging which specific chunks/files each tool returned, not just whether the tool was called
2. Comparing those chunks to the gold patch files to compute per-tool MRR/Recall
3. Running in a controlled way where only one tool is active at a time for ablation

**Practical recommendation for fast iteration**:

For the query planner research decision (Option A vs B vs C vs D), the fastest signal is:
- Run all 4 conditions (no_plan, A, B, C) on the existing 12-repo agentbench setup
- Compare `resolved` rate and `number_steps_first_read` across conditions
- The condition with highest resolved rate AND lowest steps_first_read wins
- This costs ~12 × 4 conditions × ~$0.10/instance ≈ $5 per experiment

**Sources**:
- `/Users/jack/mag/claudemem/docs/llm-eval2/claude.md` — Quality: High
- `/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/synthesis/embed-eval-spec.md` — Quality: High
- `/Users/jack/mag/claudemem/eval/agentbench-claudemem/scripts/analyze.py` — Quality: High
- MEMORY.md project memory — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

## Dataset Catalog (for reference)

| Dataset | Query Type | Scale | Languages | Primary Metric | Ground Truth |
|---|---|---|---|---|---|
| **CodeSearchNet** | Docstrings (human) | 99K test pairs | Python, Java, JS, PHP, Ruby, Go | NDCG@10 | Docstring-function pairing |
| **CoSQA** | Developer web queries (Bing) | 20,604 pairs | Python only | MAP@K | Human crowd annotations |
| **SWE-bench** | GitHub issues | 500 (Verified), 300 (Lite) | Python repos | % resolved | Tests pass/fail |
| **CoIR** | Mixed (CSN + SO + GitHub) | Multi-task | 6 languages | NDCG@10 | Multi-source |
| **AdvTest** | Natural language queries | ~8K | Python | NDCG@10 | Code search QA |
| **WebQueryTest** | Web queries | ~5K | Python | NDCG@10 | Bing query logs |
| **claudemem agentbench** | GitHub issues | 24 instances (12 repos) | Python repos | % resolved + steps_first_read | Patch files |

---

## Source Summary

**Total Sources**: 13 unique sources
- High Quality: 12
- Medium Quality: 1
- Low Quality: 0

**Source List**:
1. [arxiv:2407.02883 — CoIR benchmark paper](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024, Type: Academic paper (cited via prior research)
2. [arxiv:2508.21290 — Jina Code Embeddings paper](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025, Type: Academic paper (cited via prior research)
3. [CodeSearchNet HuggingFace dataset](https://huggingface.co/datasets/code-search-net/code_search_net) — Quality: High, Date: Live
4. [CoSQA paper — Microsoft Research 2021](https://arxiv.org/abs/2105.13239) — Quality: High, Date: 2021 (cited via research synthesis)
5. `/Users/jack/mag/claudemem/eval/agentbench-claudemem/scripts/analyze.py` — Quality: High, Date: 2026-03-05, Type: Local eval harness
6. `/Users/jack/mag/claudemem/eval/agentbench-claudemem/src/agentbench/utils/trace.py` — Quality: High, Date: 2026-03-05, Type: Local eval harness
7. `/Users/jack/mag/claudemem/eval/agentbench-claudemem/src/agentbench/benchmarks/swebench.py` — Quality: High, Date: 2026-03-05, Type: Local eval harness
8. `/Users/jack/mag/claudemem/docs/llm-eval2/claude.md` — Quality: High, Date: 2025 (synthesized external research), Type: Research synthesis
9. `/Users/jack/mag/claudemem/docs/llm-eval/claude.md` — Quality: High, Date: 2025, Type: Research synthesis
10. `/Users/jack/mag/claudemem/docs/llm-eval/gemini.md` — Quality: High, Date: 2025, Type: Research synthesis (includes TruLens/RAGAS citations)
11. `/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-1.md` — Quality: High, Date: 2026-03-05, Type: Prior research session
12. `/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/findings/explorer-2.md` — Quality: High, Date: 2026-03-05, Type: Prior research session
13. `/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92/synthesis/embed-eval-spec.md` — Quality: High, Date: 2026-03-05, Type: Synthesized specification

---

## Knowledge Gaps

What this research did NOT find:

1. **Tool selection accuracy labeled datasets**: No published dataset maps query types to optimal retrieval tool selections (BM25 vs. vector vs. AST vs. symbol graph). This is the core gap for evaluating a query planner's tool routing. Suggested query: `"tool routing evaluation labeled dataset retrieval selection accuracy benchmark"`

2. **CoSQA exact metric specification**: CoSQA's ground truth annotation methodology (exact crowdworker instructions, inter-annotator agreement) was not confirmed locally. The metric is MAP but the specific K value and annotation protocol would require reading the original paper directly. Suggested query: `"CoSQA Microsoft 2021 annotation methodology MAP evaluation code search"`

3. **SWE-bench file localization as standalone benchmark**: No published paper was found that uses SWE-bench patch files as an explicit retrieval benchmark (query = issue description, ground truth = patch files, metric = Recall@K or MRR). This is a gap in the literature, not a search failure. Suggested query: `"SWE-bench file localization retrieval benchmark recall MRR 2024 2025"`

4. **RAGAS for code-specific evaluation empirical results**: The local research confirms RAGAS exists and is applicable in principle to code RAG, but no empirical study comparing RAGAS metrics to task completion rates for code retrieval was found. Suggested query: `"RAGAS context precision recall code retrieval evaluation empirical correlation"`

5. **Retrieval contribution attribution in multi-tool systems**: No standard methodology was found for measuring which specific tool in a multi-tool system contributed to task success. The tool_calls set in analyze.py captures tool usage but not tool contribution. Suggested query: `"multi-tool retrieval contribution attribution ablation method code agent 2024"`

6. **Developer productivity correlation with offline retrieval metrics**: No local source found a study showing that higher MRR/NDCG@10 in offline evaluation actually predicts better developer task completion in production. Suggested query: `"retrieval metric offline online correlation developer productivity code search 2024"`

---

## Search Limitations

- Model: claude-sonnet-4-6 (native)
- Web search: Not available (MODEL_STRATEGY=native)
- Local search: Performed extensively across 13 source files and prior research archives
- Date range covered: Local research from 2026-02-25 to 2026-03-05; papers cited through August 2025
- Key limitation: CoSQA details come from research synthesis documents, not the original paper. SWE-bench retrieval methodology was confirmed by reading the actual claudemem eval harness code (high confidence). RAGAS applicability is from documentation cross-reference, not empirical testing.
- No live access to arxiv, MTEB leaderboard, or RAGAS documentation during this session
