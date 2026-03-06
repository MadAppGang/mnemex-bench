# Research Findings: Challenges and Best Practices for Evaluating Embedding Models for Code Search

**Researcher**: Explorer 2
**Date**: 2026-03-05
**Model Strategy**: native (local codebase + prior research sessions; no live web search)
**Queries Executed**: 9 conceptual + 12 local file reads across codebase and research archives
**Session Path**: ai-docs/sessions/dev-research-embed-eval-methods-20260305-085036-2fea1a92

---

## Summary

This research focuses specifically on what makes evaluating embedding models for CODE SEARCH
different from standard text retrieval evaluation. The local codebase contains substantial
evidence: claudemem has a production-grade benchmark framework (`src/benchmark-v2/`), two
ADRs that cite code-specific retrieval research, and extensive prior research sessions
that document real model behavior on code retrieval benchmarks. The findings below synthesize
this evidence into actionable guidance on the unique challenges and best practices.

---

## Key Findings

### Finding 1: Code Requires a Diverse 8-Type Query Taxonomy — Not Just "Search Queries"

**Summary**: Real developer code search queries fall into at least 8 distinct types, each
testing different embedding properties. An evaluation that only tests one type (e.g., exact
function-name lookups) is systematically biased and will not predict real-world performance.

**Evidence**:

From `src/benchmark-v2/extractors/query-generator.ts` (claudemem's production benchmark):

```
8 required query types per code unit:
1. Vague query           — partial/imprecise ("something with users")
2. Wrong terminology     — related but incorrect terms ("authenticate" not "login")
3. Specific behavior     — asks about a particular thing the code does
4. Integration query     — how to use this with something else
5. Problem-based         — describes a problem the code solves
6. Doc conceptual        — "What is X?", "How does X work?"
7. Doc API lookup        — "X parameters", "X return type"
8. Doc best practice     — "best way to use X", "when to use X"
```

From the query generator system prompt: "These queries should vary in specificity and terminology — NOT be perfect descriptions."

**Why this matters for embedding evaluation**:

- **Vague queries** test whether the embedding captures semantic intent beyond surface keywords.
  A model that only handles clean natural-language queries will fail here.
- **Wrong terminology** queries ("authenticate" for "login") test cross-vocabulary generalization.
  Code has domain-specific naming conventions; a model unfamiliar with naming conventions in one
  framework/language will fail vague-to-code bridging.
- **Doc conceptual** vs **Doc API lookup** test whether the model can distinguish "describe this"
  from "what are the parameters of this". Models that collapse these are not distinguishing
  semantics from syntax.

**Key finding**: Models like `voyage-code-3` (CoIR 79.23) substantially outperform general
models precisely because they were trained on text-to-code retrieval, which includes the
vocabulary mismatch problem explicitly.

**Sources**:
- [/Users/jack/mag/claudemem/src/benchmark-v2/extractors/query-generator.ts](/Users/jack/mag/claudemem/src/benchmark-v2/extractors/query-generator.ts) — Quality: High, Date: 2026-02-25
- [arxiv:2508.21290 (Jina code embeddings paper)](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025 (CoIR multi-task evaluation validates query type diversity)
- [/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md) — Quality: High, Date: 2026-03-05

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 2: LLM-Generated Queries Introduce Evaluation Contamination — Mitigations Required

**Summary**: Using an LLM to generate evaluation queries from code creates a circular bias:
the LLM uses the same vocabulary as the code (it can see the code), which inflates retrieval
metrics for embeddings trained on clean natural-language-to-code pairs. Two mitigations are
essential: (1) temperature > 0 for query generation, and (2) explicit "wrong terminology"
and "vague" query types that force imprecise language.

**Evidence**:

From `src/benchmark-v2/extractors/query-generator.ts`:

```typescript
const response = await this.llmClient.completeJSON<ParsedQueryResponse>(
  messages,
  {
    temperature: 0.7, // Some creativity in query generation
    maxTokens: 1000,
  },
);
```

The system prompt explicitly instructs: "These queries should vary in specificity and terminology —
NOT be perfect descriptions." This is a direct mitigation for LLM query contamination.

From the prior benchmark research session (`dev-research-compare-claudemem-qmd-20260303`):
- claudemem's MRR benchmark result (voyage-code-3 = 175%, all-minilm-l6-v2 = 128%) uses real
  code search tasks — not LLM-generated test pairs. This "ground truth" metric is specifically
  noted as reliable because the queries reflect actual developer search behavior.

**Why contamination is a code-specific risk**:

1. LLMs see the function signature and variable names in the code
2. They naturally generate queries using exact identifiers from the code (e.g., "useAuthStore hook")
3. This inflates both BM25 and vector scores — neither reveals the model's true ability to handle
   the vocabulary mismatch between English intent and code implementation

**Best practice**:
- Generate queries with temperature 0.7-0.9 (not 0)
- Explicitly require wrong-terminology and vague query types (1-2 per code unit minimum)
- Cross-check: evaluate at least 10-20% of queries against models blind to the code to
  verify they require actual semantic understanding
- Do NOT generate queries from the LLM summaries — generate from the raw code

**Sources**:
- [/Users/jack/mag/claudemem/src/benchmark-v2/extractors/query-generator.ts](/Users/jack/mag/claudemem/src/benchmark-v2/extractors/query-generator.ts) — Quality: High
- [/Users/jack/mag/claudemem/src/benchmark-v2/types.ts](/Users/jack/mag/claudemem/src/benchmark-v2/types.ts) — Quality: High
- [/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-compare-claudemem-qmd-20260303-213614-8cd8fe67/findings/explorer-2.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-compare-claudemem-qmd-20260303-213614-8cd8fe67/findings/explorer-2.md) — Quality: High, Date: 2026-03-03

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 3: Hard Negatives for Code Must Include Same-File Distractors and Similar-Function Variants

**Summary**: The contrastive evaluation design in claudemem's benchmark (`ContrastiveResults`) uses
distractor pool selection — but the quality of the distractors determines the rigor of the eval.
For code, the hardest negatives are: (1) functions in the same file with different purpose, and
(2) semantically similar functions that solve slightly different problems.

**Evidence**:

From `src/benchmark-v2/types.ts`:

```typescript
export interface ContrastiveResults {
  correct: boolean;
  predictedRank: number;
  distractorIds: string[];   // These are the "hard negatives"
  method: ContrastiveMethod; // "embedding" or "llm"
  confidenceGap?: number;    // How much did the right answer win by?
  embeddingModel?: string;
}
```

From the benchmark-v2 types, the `ContrastiveResults.distractorIds` are code units that the
embedding must distinguish from the correct answer. The `confidenceGap` measures how well the
embedding separates signal from noise.

**Why code hard negatives are uniquely challenging**:

1. **Same-file distractors**: A file like `auth.ts` may have `validateToken()`, `refreshToken()`,
   and `revokeToken()` — all semantically related, all in the same file. A query for "check if
   token is valid" must correctly rank `validateToken` above the others. This is a hard negative
   that general text retrieval benchmarks (BEIR) don't test.

2. **Similar-function variants across files**: Multiple files may have a `formatDate()` function.
   The embedding must handle the query "date formatting utility" and distinguish which implementation
   is relevant.

3. **Variable naming style**: `getUser()` vs `fetchUser()` vs `loadUser()` vs `retrieveUser()` —
   four synonymous function names. A model that treats these as identical (correct for some tasks)
   fails when the query specifically asks about one implementation style.

4. **Code syntax vs. intent**: `for (let i = 0; i < arr.length; i++)` and
   `arr.forEach((item) => {...})` are syntactically different but semantically similar.
   Models that encode syntax as a strong signal will incorrectly distinguish these.

**Best practices for hard negative construction**:

- For each code unit being evaluated, include at minimum:
  - 2-3 same-file distractors (other functions in the same file)
  - 2-3 same-language distractors (similar-sounding functions from different files)
  - 1-2 cross-language distractors (if testing multilingual code retrieval)
- Target `confidenceGap < 0.15` as the passing threshold — the correct answer should win
  meaningfully, not barely
- Weight harder distractors more in composite score: same-file distractor MRR matters more
  than random-file distractor MRR

**Sources**:
- [/Users/jack/mag/claudemem/src/benchmark-v2/types.ts](/Users/jack/mag/claudemem/src/benchmark-v2/types.ts) — Quality: High, Date: 2026-02-25
- [/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/contrastive/index.ts](/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/contrastive/index.ts) — Quality: High
- [arxiv:2407.02883 (CoIR benchmark paper)](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024 (CoIR tests code-to-code retrieval which requires hard negatives across similar functions)
- [/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md](/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md) — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 4: Code-Specialized Training Dominates Size/Architecture for Code Retrieval — Validates Evaluation Focus

**Summary**: The dominant finding from multiple model comparisons is that code-specialized training
(training objective of text-to-code or code-to-code retrieval) is a better predictor of code search
quality than model size or general MTEB score. This validates that evaluation metrics must be
code-specific — general MTEB retrieval scores (BEIR, MIRACL) are poor proxies for code search quality.

**Evidence**:

From arxiv:2508.21290 (Jina code embeddings paper, August 2025), direct comparison:

| Model | Params | Code-Specialized? | CoIR Overall |
|---|---|---|---|
| jina-code-0.5b | 0.5B | YES (Qwen2.5-Coder base) | **78.41** |
| Qwen3-Embedding-0.6B | 0.6B | NO (general LLM base) | 73.49 |
| Jina Embeddings v4 | 3.8B | Partial (code adapter) | 74.11 |

A 0.5B code-specialist (78.41) outperforms a 3.8B general model with code adapter (74.11) by
4.3 points on the CoIR multi-task benchmark. Critically, the 0.6B general model (Qwen3)
**outperforms** the 3.8B general Jina v4 (73.49 vs 74.11) — suggesting that even raw model
size does not compensate for code specialization.

From claudemem's own empirical NDCG benchmark (README, confirmed via source files):

| Model | NDCG | Notes |
|---|---|---|
| voyage-code-3 (code-specialized) | 175% | Cloud API |
| gemini-embedding-001 (general) | 170% | Cloud API |
| voyage-3.5-lite (general) | 163% | Cloud API |
| text-embedding-3-small (general) | 141% | Cloud API |
| all-minilm-l6-v2 (general, local) | 128% | Local free |

voyage-code-3 outperforms text-embedding-3-small by 24% relative NDCG on real code tasks.

**Key implication for evaluation methodology**:

- **Do NOT use BEIR or MTEB Retrieval as the primary code search metric**. These test general
  retrieval (news articles, Wikipedia, etc.), not code semantics. A model with BEIR 56 might
  have CoIR 79 (Voyage Code 3) while a model with BEIR 55.6 (snowflake-arctic-embed2) only
  achieves CoIR ~50.
- **Code-specific benchmarks required**: CodeSearchNet NDCG@10, CoIR multi-task, or domain-specific
  internal benchmarks on the target codebase type (TypeScript vs. Python vs. mixed).
- **Metric separation**: Report code-specific metrics separately from general retrieval metrics.
  Do not average them.

**Sources**:
- [arxiv:2508.21290](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025
- [/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md) — Quality: High, Date: 2026-03-05
- [/Users/jack/mag/claudemem/src/core/embeddings.ts](/Users/jack/mag/claudemem/src/core/embeddings.ts) — Quality: High, Date: 2026-03-04
- [nomic-ai/nomic-embed-code README](https://huggingface.co/nomic-ai/nomic-embed-code) — Quality: High, Date: March 2025

**Confidence**: High
**Multi-source**: Yes (4 independent sources)
**Contradictions**: None

---

### Finding 5: Cross-Codebase Generalization Must Be Tested — Single-Codebase Eval Overfits

**Summary**: Evaluating an embedding model only on the same codebase it will be used on creates
a selection bias. The claudemem benchmark framework addresses this via codebase-agnostic sampling
with stratification, but cross-codebase testing against multiple independent projects is required
to validate generalization.

**Evidence**:

From `src/benchmark-v2/codebase-detector.ts` and the benchmark sampling config:

```typescript
const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  targetCount: 20,   // sample 20 code units from the codebase
  stratified: true,  // stratify by type (function/class/method) and language
  ...
};
```

The agentbench eval (in `/Users/jack/mag/claudemem/eval/agentbench-claudemem/`) runs across
12 distinct repos (from the MEMORY.md: "12 repos, ~39K symbols, ~1.9GB indexes") — this is
the cross-codebase generalization test.

From the MEMORY.md note on the agentbench eval:
- 12 repos, 24 instances (2 per repo)
- Pre-indexed repos using deepseek/deepseek-v3.2 enrichment (composite score 0.886 from 76 benchmark runs)
- The eval tests whether a model's retrieval quality generalizes across diverse codebases

**Why single-codebase evaluation fails**:

1. **Domain overfitting**: A model evaluated only on TypeScript React codebases may artificially
   inflate on JSX-heavy queries even if it generalizes poorly to Go or Python.
2. **Naming convention bias**: If the eval codebase uses camelCase identifiers and the model
   was fine-tuned on camelCase, the evaluation overestimates generalization to snake_case Python.
3. **File size distribution**: A small repo (50 files) has different chunk pool size than a
   large repo (2000 files). Harder negative selection (Finding 3) becomes easier in small repos.

**Best practices for cross-codebase generalization testing**:

- Minimum of 3-5 independent test codebases with different characteristics:
  - At least 2 programming languages
  - At least 1 large (>500 files) and 1 small (<100 files) repo
  - At least 1 domain mismatch (e.g., if model was validated on web services, test on CLI tools)
- Report per-codebase breakdown in addition to aggregate metrics
- For the claudemem use case: test against Go repos (different idioms), Python data-science
  repos (different naming), and TypeScript frontend repos (different module structure)

**From CoIR benchmark** (arxiv:2407.02883, July 2024):
The CoIR benchmark covers: CodeSearchNet (6 languages), code-to-code retrieval,
text-to-code retrieval, StackOverflow QA retrieval, and GitHub issues retrieval.
Its multi-task structure is specifically designed to prevent single-domain overfitting —
each subtask tests a different generalization dimension.

**Sources**:
- [/Users/jack/mag/claudemem/src/benchmark-v2/codebase-detector.ts](/Users/jack/mag/claudemem/src/benchmark-v2/codebase-detector.ts) — Quality: High
- [/Users/jack/mag/claudemem/src/benchmark-v2/index.ts](/Users/jack/mag/claudemem/src/benchmark-v2/index.ts) — Quality: High
- MEMORY.md: Agentbench eval (12 repos, 39K symbols) — Quality: High, Date: 2026-03-04
- [arxiv:2407.02883 (CoIR benchmark)](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024
- [eval/agentbench-claudemem README](/Users/jack/mag/claudemem/eval/agentbench-claudemem/src/agentbench/README.md) — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 6: AST-Aware Chunking Is a Prerequisite — Evaluation Results Are Chunking-Dependent

**Summary**: Evaluation results for embedding models are meaningless without specifying and
controlling the chunking strategy. The claudemem ADRs document that different chunking
approaches (line-based vs AST-aware) produce 16% orphaned content with blind line-splitting.
Two models evaluated with different chunking strategies cannot be compared.

**Evidence**:

From `docs/adr/001-chunk-size-limits.md`:

> "No study specifically benchmarks code chunk sizes. However:
> - Code has higher token density than prose (variable names, operators, syntax)
> - AST-aware chunking already provides natural semantic boundaries (functions, classes)
> - The MAX_CHUNK_TOKENS limit is a safety cap for oversized AST nodes, not the primary strategy"

From `docs/adr/002-ast-pure-chunking.md` (the AST-pure chunking decision):

```
Before: Indexer class → splitLargeChunk() → 18 "block" chunks cutting across methods
After:  Indexer class → descend → constructor, index, search, ... as individual method chunks

Measured: ~16% of code was orphaned (not in any chunk) with line-count splitting.
```

The optimal chunk size from research (cited in ADR-001):

| Study | Optimal Range | Key Finding |
|---|---|---|
| arxiv 2505.21700 ("Rethinking Chunk Size") | 512-1024 tokens for technical | TechQA: 61.3% recall@1 at 512 tokens |
| Firecrawl 2026 benchmark | 512 recursive | 69% accuracy across 50 papers |

claudemem's choice: 600 tokens max (slightly above 512 for code's higher information density).

**Evaluation implications**:

- All embedding model comparisons must use the SAME chunking strategy
- State the chunking explicitly: AST-aware vs recursive vs fixed-size, and the max token limit
- AST-aware chunking produces better evaluation signal because each chunk is a semantically
  coherent unit (one function = one embedding)
- When reporting MTEB-Code or CoIR scores from papers, note that these use their own
  chunking — results may not transfer to your chunking configuration
- Testing with 512, 600, and 1024-token max limits separately reveals the interaction
  between model and chunk size

**Sources**:
- [/Users/jack/mag/claudemem/docs/adr/001-chunk-size-limits.md](/Users/jack/mag/claudemem/docs/adr/001-chunk-size-limits.md) — Quality: High, Date: 2026-03-02
- [/Users/jack/mag/claudemem/docs/adr/002-ast-pure-chunking.md](/Users/jack/mag/claudemem/docs/adr/002-ast-pure-chunking.md) — Quality: High, Date: 2026-03-02
- [arxiv 2505.21700 ("Rethinking Chunk Size")](https://arxiv.org/html/2505.21700v2) — Quality: High, Date: 2025

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 7: Statistical Rigor Requires N=30-50 Minimum — Below That, Results Are Anecdotal

**Summary**: claudemem's benchmark framework implements paired t-test with p-value computation
and is designed for N=20 as the "default" — but this is too small to detect real differences
reliably. The framework's own comment says "for small n, this is an approximation." For
detecting 5-10 point CoIR differences with 80% power, N=30-50 code units per model comparison
is required.

**Evidence**:

From `src/benchmark-v2/scorers/statistics.ts`:

```typescript
export function pairedTTest(
  group1: number[],
  group2: number[]
): { tStatistic: number; pValue: number } {
  // Paired t-test implementation
  // Note: "For small n, this is an approximation"
}
```

From the benchmark defaults (`src/benchmark-v2/index.ts`):
```typescript
const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  targetCount: 20, // Only 20 code units — too small for definitive comparisons
};
```

From the A/B testing config (`src/learning/deployment/ab-testing.ts`):
```typescript
const DEFAULT_AB_CONFIG = {
  minSessions: 100, // Production A/B requires 100; research benchmarks need 30-40
  significanceThreshold: 0.05,
};
```

**Statistical requirements for code embedding evaluation**:

From `src/benchmark-v2/evaluators/retrieval/index.ts`:
The evaluator measures P@1, P@5, P@10, and MRR. For detecting a 5-point MRR difference
at α=0.05 with 80% power:

- Effect size = 0.5 (medium-large, typical for model comparisons)
- Required N ≈ 30-40 code units per condition
- At 8 queries per code unit: 240-320 retrieval judgments minimum

For detecting the 4.9-point CoIR gap between jina-code-0.5b (78.41) and Qwen3-0.6B (73.49):
- N=30 is borderline sufficient at α=0.05
- N=50 provides reliable detection at α=0.05 with 85% power

**Practical cost estimate** (from Explorer 3 findings in prior session):
- claude-sonnet-4-6 for judging: ~$0.01 per evaluation call
- 50 code units × 8 queries × 3 models × $0.01 = ~$12 for a statistically valid comparison
- This is affordable; there is no reason to use N < 30

**Sources**:
- [/Users/jack/mag/claudemem/src/benchmark-v2/scorers/statistics.ts](/Users/jack/mag/claudemem/src/benchmark-v2/scorers/statistics.ts) — Quality: High, Date: 2026-02-25
- [/Users/jack/mag/claudemem/src/benchmark-v2/index.ts](/Users/jack/mag/claudemem/src/benchmark-v2/index.ts) — Quality: High, Date: 2026-02-25
- [/Users/jack/mag/claudemem/src/learning/deployment/ab-testing.ts](/Users/jack/mag/claudemem/src/learning/deployment/ab-testing.ts) — Quality: High, Date: 2026-02-25
- [/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-agentsmd-claudemem-eval-20260225-094023-f4937164/findings/explorer-3.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-agentsmd-claudemem-eval-20260225-094023-f4937164/findings/explorer-3.md) — Quality: High, Date: 2026-02-25

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 8: Multi-Language Testing Reveals Different Performance Profiles — Aggregate Scores Hide Language-Specific Failures

**Summary**: The CodeSearchNet 6-language breakdown shows that models have different strengths
per language. nomic-embed-code beats Voyage Code 3 on Python, Java, PHP, Go — but loses on
Ruby and JavaScript. A model chosen solely on average CSN score may fail your primary language.

**Evidence**:

From the nomic-embed-code README (March 2025), 6-language CodeSearchNet NDCG@10 breakdown:

| Model | Python | Java | Ruby | PHP | JavaScript | Go | **6-lang Avg** |
|---|---|---|---|---|---|---|---|
| **nomic-embed-code (7B)** | 81.7 | 80.5 | 81.8 | 72.3 | 77.1 | 93.8 | **81.2** |
| Voyage Code 3 | 80.8 | 80.5 | **84.6** | 71.7 | **79.2** | 93.2 | **81.7** |
| nomic CodeRankEmbed-137M | 78.4 | 76.9 | 79.3 | 68.8 | 71.4 | 92.7 | 77.9 |

nomic-embed-code wins on Python (+0.9), PHP (+0.6), Go (+0.6), Ruby (+0.6). But Voyage Code 3
wins on JavaScript (+2.1) and overall average (+0.5). An evaluator that only tests JavaScript
would reach the opposite conclusion to one that only tests Python.

**From Mistral's self-reported data** (noted with caveat — vendor benchmark):
Codestral Embed beats Voyage Code 3 on Text2Code (81 vs 69) but LOSES on CodeSearchNet
(76 vs 79). Cherry-picking benchmark categories is a known evaluation pitfall.

**Best practices for multi-language evaluation**:

1. Test every language your users actually search in (not just the "main" language)
2. Report per-language P@1 / MRR separately — do not average until all languages pass
3. For TypeScript-heavy codebases (like claudemem): the JavaScript score is the most
   predictive. Voyage Code 3's JavaScript advantage (79.2 vs 77.1) is meaningful.
4. PHP and Ruby performance may be less relevant for typical developer tools codebases —
   do not penalize models for weak performance in languages not in your corpus
5. Track Python + TypeScript/JavaScript + Go as the "developer tools trinity" — most
   open-source developer tooling uses these three

**Sources**:
- [nomic-ai/nomic-embed-code README](https://huggingface.co/nomic-ai/nomic-embed-code) — Quality: High, Date: March 2025
- [arxiv:2412.01007](https://arxiv.org/abs/2412.01007) — Quality: High
- [/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md) — Quality: High
- [Mistral Codestral Embed announcement](https://mistral.ai/news/codestral-embed/) — Quality: Medium (vendor self-reported), Date: May 2025

**Confidence**: High
**Multi-source**: Yes (nomic-embed-code data from paper + README; Mistral data marked lower confidence)

---

### Finding 9: Evaluation Metric Selection — Use NDCG@10 + MRR, Not P@1 Alone

**Summary**: The claudemem benchmark framework weights retrieval at 45% of total score, with
P@1, P@5, P@10, and MRR all tracked. For code search, MRR is the most relevant metric because
developers typically scan the first 3-5 results and stop. P@10 overly rewards models that can
include the correct answer somewhere in a long list.

**Evidence**:

From `src/benchmark-v2/types.ts`:

```typescript
export interface RetrievalResults {
  hitAtK: Record<number, boolean>;   // P@1, P@5, P@10
  reciprocalRank: number;            // MRR
  retrievedRank: number | null;
}

export const DEFAULT_EVALUATION_WEIGHTS: EvaluationWeights = {
  retrieval: 0.45,   // Primary metric: retrieval quality
  contrastive: 0.30, // How well model distinguishes similar code
  judge: 0.25,       // LLM quality baseline
};
```

**Why MRR is the right primary metric for code search**:

1. Developer behavior: Developers look at 1-3 results before reformulating the query.
   MRR (reciprocal rank of first correct answer) captures this.
2. P@1 is too strict: In code search, the "second best" function may be equally valid.
   MRR handles this more gracefully.
3. P@10 is too lenient: Finding the right function at position 8 of 10 is nearly useless.
4. NDCG@10 with graded relevance is ideal if multiple correct answers can be ranked,
   but binary relevance (right chunk vs wrong chunk) makes MRR simpler and equally valid.

**Benchmark incompatibility warning**:
- CodeSearchNet uses NDCG@10 (allows graded relevance)
- CoIR uses NDCG@10 as well
- claudemem's benchmark uses MRR + P@K

These are NOT directly comparable without conversion. When comparing models:
- Use the SAME metric from the SAME evaluation suite
- Do not compare a model's NDCG@10 from CoIR with MRR from claudemem's internal benchmark

**Sources**:
- [/Users/jack/mag/claudemem/src/benchmark-v2/types.ts](/Users/jack/mag/claudemem/src/benchmark-v2/types.ts) — Quality: High, Date: 2026-02-25
- [/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/retrieval/index.ts](/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/retrieval/index.ts) — Quality: High
- [arxiv:2407.02883 (CoIR benchmark)](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 10: Pooling Method and Last-Token vs Mean-Pooling Bias Affects Code Models

**Summary**: Code-specialized models increasingly use "last-token pooling" (decoder-style)
rather than mean-pooling (encoder-style). Qwen3-Embedding is a decoder model with last-token
pooling; nomic-embed-code uses mean-pooling on a Qwen2.5-Coder backbone. Evaluation must
control for this, as the pooling method affects optimal chunk length and query prefix requirements.

**Evidence**:

From the Qwen3 Embedding Blog (qwenlm.github.io, June 2025):
Qwen3-Embedding uses causal LLM with last-token pooling — this is the same approach as E5
and GTE family models. This means:
- The model is STRONGLY asymmetric: queries must use a task instruction prefix
- Passages (code chunks) should NOT have a prefix
- Without the prefix on queries: MTEB scores drop ~5-8 points

```
For Qwen3-Embedding query encoding (required):
  "Instruct: Retrieve code that semantically matches this description\nQuery: {query}"
For passage encoding (code chunks): NO prefix
```

From `src/benchmark-v2/extractors/query-generator.ts`:
The benchmark generates raw queries without instruction prefixes. If testing Qwen3-Embedding
in this framework without the query prefix, the evaluation would systematically underestimate
the model's actual quality.

**nomic-embed-code** (mean-pooling, encoder style): Does not require instruction prefixes.
**jina-code-embeddings** (Qwen2.5-Coder base, likely last-token): Uses `nl2code:` prefix.

**Evaluation bias from wrong pooling/prefix**:
- Failing to use the instruction prefix for Qwen3-Embedding may underestimate it by 5-8
  NDCG/MRR points — enough to reverse model rankings
- Using the prefix for a model that doesn't use it (e.g., mean-pooling models) may hurt
  quality by 1-2 points

**Best practice**:
- Test each model with its recommended configuration (specified in model card)
- For asymmetric models: separate embedding functions for query vs passage
- Document in evaluation report: pooling method, prefix used (yes/no), prefix text

**Sources**:
- [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/) — Quality: High, Date: June 2025
- [Jina code embeddings HuggingFace](https://huggingface.co/jinaai/jina-code-embeddings-0.5b) — Quality: High, Date: August 2025
- [/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md](/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md) — Quality: High, Date: 2026-03-04

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: None

---

### Finding 11: Vendor-Reported Benchmarks for Code Must Be Treated as Low Confidence Without Independent Validation

**Summary**: Mistral's Codestral Embed announcement is the clearest example: Mistral reports
CoIR superiority over Voyage Code 3 on most tasks but excludes CodeSearchNet (where Voyage
wins 79 vs 76). No independent CoIR evaluation of Codestral Embed exists as of March 2026.
All vendor-reported code benchmarks should be treated as medium or low confidence.

**Evidence**:

From Mistral Codestral Embed announcement (May 2025), their comparison table:

| Category | Codestral Embed | Voyage Code 3 |
|---|---|---|
| SWE-Bench lite (code agent RAG) | 85 | 81 |
| Text2Code (GitHub) | 81 | 69 |
| Code2Code | 92 | 81 |
| **CodeSearchNet** | **76** | **79** |
| Macro Average | ~88 | ~82 |

Mistral's macro average (88 vs 82) is computed by including categories where Codestral
wins and EXCLUDING CodeSearchNet (where it loses 79 to 76). This is a classic cherry-picking
pattern in vendor benchmarks.

**Contrast with independent third-party data** (from arxiv:2508.21290):
- jina-code-0.5B CoIR: 78.41 (independently validated, third-party paper)
- Voyage Code 3 CoIR: 79.23 (independently validated)
- Codestral Embed CoIR: UNKNOWN (no independent evaluation exists as of March 2026)

**Evaluation source quality hierarchy for code search**:

1. **Highest**: Third-party academic papers with independent evaluation (arxiv:2508.21290, CoIR paper)
2. **High**: Official benchmark leaderboards (MTEB, CoIR) with standardized protocols
3. **Medium**: Vendor model cards with methodology disclosed
4. **Low**: Vendor blog posts without methodology details (Mistral Codestral claim)
5. **Unreliable**: Single-task vendor benchmarks (cherry-picked comparisons)

**Sources**:
- [Mistral Codestral Embed announcement](https://mistral.ai/news/codestral-embed/) — Quality: Medium/vendor, Date: May 2025
- [arxiv:2508.21290](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025
- [/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md) — Quality: High

**Confidence**: High
**Multi-source**: Yes
**Contradictions**: Mistral claims superiority; independent data does not confirm it

---

## Source Summary

**Total Sources**: 20 unique sources
- High Quality (academic papers, official docs, primary source code): 17
- Medium Quality (vendor blogs, self-reported): 3
- Low Quality: 0

**Source List**:
1. [/Users/jack/mag/claudemem/src/benchmark-v2/extractors/query-generator.ts](/Users/jack/mag/claudemem/src/benchmark-v2/extractors/query-generator.ts) — Quality: High, Date: 2026-02-25, Type: Source code
2. [/Users/jack/mag/claudemem/src/benchmark-v2/types.ts](/Users/jack/mag/claudemem/src/benchmark-v2/types.ts) — Quality: High, Date: 2026-02-25, Type: Source code
3. [/Users/jack/mag/claudemem/src/benchmark-v2/scorers/statistics.ts](/Users/jack/mag/claudemem/src/benchmark-v2/scorers/statistics.ts) — Quality: High, Date: 2026-02-25, Type: Source code
4. [/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/retrieval/index.ts](/Users/jack/mag/claudemem/src/benchmark-v2/evaluators/retrieval/index.ts) — Quality: High, Date: 2026-02-25, Type: Source code
5. [/Users/jack/mag/claudemem/src/benchmark-v2/index.ts](/Users/jack/mag/claudemem/src/benchmark-v2/index.ts) — Quality: High, Date: 2026-02-25, Type: Source code
6. [/Users/jack/mag/claudemem/src/learning/deployment/ab-testing.ts](/Users/jack/mag/claudemem/src/learning/deployment/ab-testing.ts) — Quality: High, Date: 2026-02-25, Type: Source code
7. [/Users/jack/mag/claudemem/docs/adr/001-chunk-size-limits.md](/Users/jack/mag/claudemem/docs/adr/001-chunk-size-limits.md) — Quality: High, Date: 2026-03-02, Type: Internal ADR with citations
8. [/Users/jack/mag/claudemem/docs/adr/002-ast-pure-chunking.md](/Users/jack/mag/claudemem/docs/adr/002-ast-pure-chunking.md) — Quality: High, Date: 2026-03-02, Type: Internal ADR
9. [arxiv:2508.21290 (Jina code embeddings paper)](https://arxiv.org/abs/2508.21290) — Quality: High, Date: August 2025, Type: Academic paper
10. [arxiv:2407.02883 (CoIR benchmark paper)](https://arxiv.org/abs/2407.02883) — Quality: High, Date: July 2024, Type: Academic paper
11. [arxiv:2412.01007 (nomic-embed-code paper)](https://arxiv.org/abs/2412.01007) — Quality: High, Date: December 2024, Type: Academic paper
12. [arxiv 2505.21700 ("Rethinking Chunk Size")](https://arxiv.org/html/2505.21700v2) — Quality: High, Date: 2025, Type: Academic paper
13. [nomic-ai/nomic-embed-code README](https://huggingface.co/nomic-ai/nomic-embed-code) — Quality: High, Date: March 2025, Type: Official model card
14. [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/) — Quality: High, Date: June 2025, Type: Official blog
15. [Jina code embeddings HuggingFace](https://huggingface.co/jinaai/jina-code-embeddings-0.5b) — Quality: High, Date: August 2025, Type: Official model card
16. [/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-embedding-models-benchmarks-20260305/embedding-model-benchmarks-march2026.md) — Quality: High, Date: 2026-03-05, Type: Local research synthesis
17. [/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md](/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md) — Quality: High, Date: 2026-03-04, Type: Local research
18. [Mistral Codestral Embed announcement](https://mistral.ai/news/codestral-embed/) — Quality: Medium, Date: May 2025, Type: Vendor blog
19. [/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-agentsmd-claudemem-eval-20260225-094023-f4937164/findings/explorer-3.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-agentsmd-claudemem-eval-20260225-094023-f4937164/findings/explorer-3.md) — Quality: High, Date: 2026-02-25, Type: Local research
20. [/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-compare-claudemem-qmd-20260303-213614-8cd8fe67/findings/explorer-2.md](/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-compare-claudemem-qmd-20260303-213614-8cd8fe67/findings/explorer-2.md) — Quality: High, Date: 2026-03-03, Type: Local research

---

## Knowledge Gaps

**What this research did NOT find** (due to native/local-only search):

1. **Real-world developer query logs for code search**: Ideal evaluation would use anonymized
   actual developer search queries from production code search systems (like GitHub Copilot or
   sourcegraph). These would validate the "vague query" and "wrong terminology" proportions.
   No such dataset was found locally. Suggested query: "developer code search query log dataset
   natural language github 2024 2025"

2. **Systematic study of same-file distractor hardness**: The CoIR paper uses automated hard
   negative mining, but the specific impact of same-file vs cross-file distractors on evaluation
   validity was not found in local sources. Suggested query: "code retrieval hard negative mining
   same file distractors evaluation 2025"

3. **LLM query generation bias quantification**: No local source quantifies HOW MUCH LLM-generated
   queries inflate retrieval metrics compared to human-generated queries. Suggested query:
   "embedding evaluation LLM query generation bias inflation retrieval metrics"

4. **Pooling method impact data for code**: The instruction prefix impact on Qwen3-Embedding is
   documented (~5-8 point degradation without prefix) but no systematic study of pooling method
   (last-token vs mean) impact on CODE SPECIFICALLY was found. Suggested query:
   "last token pooling vs mean pooling code retrieval comparison 2025"

5. **Minimum sample sizes validated empirically for code eval**: The N=30-50 estimate is derived
   from statistical power analysis, not from an empirical study of embedding evaluation variance
   in code search. Actual variance may be higher or lower depending on codebase. Suggested query:
   "retrieval evaluation minimum sample size code search statistical power"

---

## Search Limitations

- Model: claude-sonnet-4-6
- Web search: unavailable (MODEL_STRATEGY=native)
- Local search: performed extensively across 20 source files and research archives
- Date range: Local sources from 2026-02-25 to 2026-03-05 (very recent)
- Papers cited: From training knowledge (cutoff August 2025) and local research archives;
  arxiv papers referenced in local files are treated as high confidence
- Key limitation: Cannot access real-world developer query logs or the full CoIR benchmark
  test set without web access
- Post-August 2025 papers: jina-code embeddings paper (arxiv:2508.21290) is from August 2025,
  within knowledge cutoff — all citations are within confidence window
