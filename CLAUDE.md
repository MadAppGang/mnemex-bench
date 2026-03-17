# mnemex-bench — Benchmark & Evaluation Hub

Benchmark experiments for mnemex (semantic code search tool). Each experiment lives in `experiments/NNN-short-name/` with its own README, harness scripts, results, and research.

## Project Context

This repo evaluates components of the **mnemex search pipeline**:
- **Embedding models** — local code search on Apple Silicon
- **Query expansion** — small LLM rewrites queries into better search terms (lex/vec/HyDE)
- **Query routing** — classifying query type to boost the right retrieval method
- **Reranking** — reorder search results by relevance
- **End-to-end** — does the full pipeline actually help agents solve tasks?

The mnemex source code lives at `../mnemex/`. The agentbench eval harness (fork of eth-sri/agentbench) lives at `../agentbench/`; experiment 012 contains our patches and results.

## Experiments

| # | Name | Topic | Status |
|---|------|-------|--------|
| 001 | LLM Speed Claudish | Frontier LLM speed via claudish/OpenRouter | Complete |
| 002 | Cognitive Memory | Engrams: observation retrieval + E2E eval | Null result; MVP not yet run |
| 003 | Query Expansion & Planner | Custom LLM for query expansion + planner architecture | Complete |
| 004 | Code Search Test Harness | Ablation harness design for search pipeline | Design complete |
| 005 | Embedding Models | Model research + evaluation methodology | Complete |
| 009 | Mnemex vs Serena | Head-to-head MCP tool comparison (efficiency) | Round 1 complete |
| 010 | MCP vs CLI Efficiency | MCP tools vs CLI (Bash) for same tasks | Ready to run |
| 012 | SWE-bench Context Ablation | 6-condition ablation: mnemex vs CLAUDE.md on SWE-bench | Round 1 complete |

## Current Status & Next Steps

### Ready to implement (high priority)

1. **Build the code search test harness** (from experiment 004 design)
   - Extend `../mnemex/src/benchmark-v2/` with 3 new files: `loader.ts`, `ablation.ts`, `reporter.ts`
   - 224-query benchmark: 24 SWE-bench instances + 200 synthetic from 12 repos
   - 6 ablation conditions to measure each pipeline component's contribution
   - See: `experiments/004-code-search-test-harness/report.md` for full spec

2. **Run SFT Round 2** for query expansion models
   - Priority queue: Qwen3.5-9B, Qwen3.5-4B, MiMo-7B, Phi-4-mini, Qwen3.5-2B
   - Full plan with HF Jobs commands: `experiments/003-query-expansion-models/research/NEXT-TRAINING-PLAN.md`
   - Round 1 proved SFT teaches format compliance (0.23 -> 0.78 for Qwen3-1.7B)

3. **Implement rule-based query classifier** (from experiment 003 planner research)
   - Regex rules: CamelCase/snake_case -> boost AST+symbol, file paths -> boost BM25, etc.
   - <5ms overhead, ~80% accuracy, no model needed
   - See: `experiments/003-query-expansion-models/planner-architecture/README.md`

### Research complete (reference)

4. **Query expansion model selection** — 3-tier deployment decided:
   - Tiny: LFM2-700M (.708 score, 697ms)
   - Medium: Qwen3-1.7B-FT (.777, 3473ms) — best HyDE for the size
   - Large: LFM2-2.6B (.816, 1879ms) — overall winner
   - See: `experiments/003-query-expansion-models/README.md`

5. **Embedding model research** — small models survey + eval methodology
   - See: `experiments/005-embedding-models/report.md`
   - Eval spec: `experiments/005-embedding-models/eval-methods/synthesis/embed-eval-spec.md`

### Needs redesign

6. **Cognitive memory eval** (experiment 002) — Round 1 E2E was a null result (Sonnet too capable). MVP validation harness built but not yet run. Needs harder tasks: weaker model, cross-file reasoning, larger repos, or time constraints.
   - See: `experiments/002-cognitive-memory-e2e/README.md`

## Data Archives (S3)

Large binary data (eval repo indexes) stored in S3, not git.

- **Bucket**: `s3://mnemex-bench/` (region: `ap-southeast-2`, AWS profile: `tools`)
- **Latest**: `archives/indexes-20260304-deepseek.tar.gz` (1.2 GB, 12 repos, deepseek enrichment)
- **12 eval repos**: ansible, graphiti, smolagents, transformers, fastmcp, openai-agents-python, opshin, pdm, pr-agent, tinygrad, ragas, wagtail

Download: `aws s3 cp s3://mnemex-bench/archives/indexes-20260304-deepseek.tar.gz . --profile tools`

See README.md for full archive table.

## Language Preferences

Scripts and tooling in this repo follow this priority order:

1. **Bun + TypeScript** — analyzers, parsers, report generators, any non-trivial logic
2. **Bash** — harness runners, shell orchestration, simple glue scripts
3. **Python** — last resort only, when a dependency requires it (e.g. agentbench upstream)

## Key Decisions Made

- **No LLM query planner** — rule-based classifier is correct. No production tool (Cody, Cursor, aider) uses LLM at query time for routing (experiment 003)
- **SFT teaches format, not domain knowledge** — models with good native format get no benefit from fine-tuning (experiment 003)
- **Wilcoxon, not t-test** for MRR comparisons — bounded [0,1] and skewed (experiment 004)
- **HyDE weight 0.25** is highest weight in query expansion scoring — model generates hypothetical code snippet that gets embedded (experiment 003)
