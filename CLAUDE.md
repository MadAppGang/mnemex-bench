# mnemex-bench — Benchmark & Evaluation Hub

Benchmark experiments for claudemem (semantic code search tool). Each experiment lives in `experiments/NNN-short-name/` with its own README, harness scripts, results, and research.

## Project Context

This repo evaluates components of the **claudemem search pipeline**:
- **Embedding models** — local code search on Apple Silicon
- **Query expansion** — small LLM rewrites queries into better search terms (lex/vec/HyDE)
- **Query routing** — classifying query type to boost the right retrieval method
- **Reranking** — reorder search results by relevance
- **End-to-end** — does the full pipeline actually help agents solve tasks?

The claudemem source code lives at `../claudemem/`. The agentbench eval harness lives at `../agentbench/`.

## Current Status & Next Steps

### Ready to implement (high priority)

1. **Build the code search test harness** (from experiment 006 design)
   - Extend `../claudemem/src/benchmark-v2/` with 3 new files: `loader.ts`, `ablation.ts`, `reporter.ts`
   - 224-query benchmark: 24 SWE-bench instances + 200 synthetic from 12 repos
   - 6 ablation conditions to measure each pipeline component's contribution
   - See: `experiments/006-code-search-test-harness/report.md` for full spec

2. **Run SFT Round 2** for query expansion models
   - Priority queue: Qwen3.5-9B, Qwen3.5-4B, MiMo-7B, Phi-4-mini, Qwen3.5-2B
   - Full plan with HF Jobs commands: `experiments/004-query-expansion-models/research/NEXT-TRAINING-PLAN.md`
   - Round 1 proved SFT teaches format compliance (0.23 -> 0.78 for Qwen3-1.7B)

3. **Implement rule-based query classifier** (from experiment 005 findings)
   - Regex rules: CamelCase/snake_case -> boost AST+symbol, file paths -> boost BM25, etc.
   - <5ms overhead, ~80% accuracy, no model needed
   - See: `experiments/005-query-planner-architecture/README.md`

### Research complete (reference)

4. **Query expansion model selection** — 3-tier deployment decided:
   - Tiny: LFM2-700M (.708 score, 697ms)
   - Medium: Qwen3-1.7B-FT (.777, 3473ms) — best HyDE for the size
   - Large: LFM2-2.6B (.816, 1879ms) — overall winner
   - See: `experiments/004-query-expansion-models/README.md`

5. **Embedding model research** — small models survey for Apple Silicon
   - See: `experiments/007-embedding-model-research/report.md`

6. **Embedding eval methodology** — 6-model voting on eval spec
   - See: `experiments/008-embedding-eval-methods/synthesis/embed-eval-spec.md`

### Needs redesign

7. **Cognitive memory E2E eval** (experiment 002) — Round 1 was a null result (Sonnet too capable). Needs harder tasks: weaker model, cross-file reasoning, larger repos, or time constraints.
   - See: `experiments/002-cognitive-memory-e2e/README.md` "Future work" section

8. **Observation retrieval validation** (experiment 003) — harness built but not yet run
   - See: `experiments/003-cognitive-mvp-validation/README.md`

## Data Archives (S3)

Large binary data (eval repo indexes) stored in S3, not git.

- **Bucket**: `s3://mnemex-bench/` (region: `ap-southeast-2`, AWS profile: `tools`)
- **Latest**: `archives/indexes-20260304-deepseek.tar.gz` (1.2 GB, 12 repos, deepseek enrichment)
- **12 eval repos**: ansible, graphiti, smolagents, transformers, fastmcp, openai-agents-python, opshin, pdm, pr-agent, tinygrad, ragas, wagtail

Download: `aws s3 cp s3://mnemex-bench/archives/indexes-20260304-deepseek.tar.gz . --profile tools`

See README.md for full archive table.

## Key Decisions Made

- **No LLM query planner** — rule-based classifier is correct. No production tool (Cody, Cursor, aider) uses LLM at query time for routing (experiment 005)
- **SFT teaches format, not domain knowledge** — models with good native format get no benefit from fine-tuning (experiment 004)
- **Wilcoxon, not t-test** for MRR comparisons — bounded [0,1] and skewed (experiment 006)
- **HyDE weight 0.25** is highest weight in query expansion scoring — model generates hypothetical code snippet that gets embedded (experiment 004)
