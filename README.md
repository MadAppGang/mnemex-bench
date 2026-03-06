# mnemex-bench

Benchmark experiments for LLM and AI tooling evaluation.

## Structure

```
experiments/
  001-llm-speed-claudish/     # LLM speed benchmark: 6 models via claudish
    speed-test.sh             # Reusable benchmark script
    README.md                 # Full results, methodology, findings
  002-cognitive-memory-e2e/   # Cognitive memory E2E eval (4 conditions x 16 scenarios)
    harness/                  # run.ts, grade.ts, scenarios.ts
    results/                  # grades.json + 64 session JSON outputs
    logs/                     # preindex log + embedding benchmark logs
    README.md                 # Full results, findings, future steps
  003-cognitive-mvp-validation/ # Observation retrieval validation (5 queries x 5 observations)
    harness/                  # validate.ts, observe MCP tool, implementation patch
    results/                  # (not yet run)
    README.md                 # Design, test cases, reproduction steps
  004-query-expansion-models/ # 25 LLM benchmarks for query expansion (16 base + 9 fine-tuned)
    harness/                  # run.ts, run-finetuned.py, scorer.ts, queries.json
    results/                  # 25 JSON result files (base/ + finetuned/)
    training/                 # SFT pipeline (jobs, data, scripts)
    research/                 # Model tiers, SFT candidates, comparison notes
    README.md                 # Full leaderboard, SFT analysis, tier selection
  005-query-planner-architecture/ # Research: should expander become a planner?
    report.md                 # Full research report
    findings/                 # 3 explorer findings
    README.md                 # Key findings, architecture recommendation
  006-code-search-test-harness/ # Research: testing harness design for code search eval
    report.md                 # 800-line report with experiment plan
    findings/                 # Dataset, framework, benchmark building research
    README.md                 # Datasets, metrics, 6-condition experiment plan
  007-embedding-model-research/ # Research: best small embedding models for code search
    report.md                 # Full research report
    findings/                 # Model benchmarks, deployment, cost/quality
    README.md                 # Model recommendations
  008-embedding-eval-methods/ # Multi-model evaluation methodology design
    synthesis/                # Final embed-eval-spec
    work/                     # 6 external model proposals
    README.md                 # Design, multi-model validation approach
```

## Experiments

| # | Name | Date | Status | Summary |
|---|------|------|--------|---------|
| 001 | [LLM Speed Benchmark](experiments/001-llm-speed-claudish/) | 2026-03-05 | Complete | 6 frontier models speed-tested via claudish (OpenRouter + Direct API). Gemini 3 Flash and GPT-5.1 Codex Mini tied at ~33s. GPT best value at $0.25/M in. |
| 002 | [Cognitive Memory E2E Eval](experiments/002-cognitive-memory-e2e/) | 2026-03-06 | Round 1 complete (null result) | 64 sessions (16 scenarios x 4 conditions) comparing no-index / baseline / skill-doc / observations on claudemem + fastmcp repos. All conditions scored avg 2.00/2 — Sonnet too capable for these tasks. Index saves efficiency (~40% faster) but not quality. |
| 003 | [Cognitive MVP Validation](experiments/003-cognitive-mvp-validation/) | 2026-03-04 | Not yet run | 5 observations written to LanceDB, 5 targeted queries — validates that session observations surface in top-5 search results. Harness + implementation ready. |
| 004 | [Query Expansion Models](experiments/004-query-expansion-models/) | 2026-03-06 | Complete | 25 models benchmarked (16 base + 9 SFT). LFM2-2.6B wins (.816). SFT teaches format, not domain knowledge. 3-tier selection: LFM2-700M / Qwen3-1.7B-FT / LFM2-2.6B. |
| 005 | [Query Planner Architecture](experiments/005-query-planner-architecture/) | 2026-03-06 | Complete | No production tool uses LLM query planners. Rule-based classifier (<5ms, ~80% accuracy) is the right default. Expander and planner are different jobs. |
| 006 | [Code Search Test Harness](experiments/006-code-search-test-harness/) | 2026-03-06 | Complete (design) | 224-query minimum viable benchmark from SWE-bench + synthetic. Extend existing benchmark-v2. 6 ablation conditions, ~$5 total cost, 7 days to run. |
| 007 | [Embedding Model Research](experiments/007-embedding-model-research/) | 2026-03-05 | Complete | Small embedding model survey for local code search on Apple Silicon. |
| 008 | [Embedding Eval Methods](experiments/008-embedding-eval-methods/) | 2026-03-05 | Complete | Multi-model validation of embedding evaluation methodology. 6 external models reviewed and voted on eval spec. |


## Convention

Each experiment lives in `experiments/NNN-short-name/` with:
- `README.md` — motivation, methodology, results, findings, history
- Script(s) to reproduce the experiment
- Raw data (if small enough for git)
