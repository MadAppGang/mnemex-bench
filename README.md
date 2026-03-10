# mnemex-bench

Benchmark experiments for LLM and AI tooling evaluation.

## Structure

```
experiments/
  001-llm-speed-claudish/     # LLM speed benchmark: 6 models via claudish
    harness/speed-test.sh     # Reusable benchmark script
    results/run1-or-only/     # Run 1 raw data (OR only, 5 rounds x 6 models)
    results/run2-or-plus-direct/ # Run 2 raw data (OR + Direct, 5 rounds x 12 routes)
    logs/                     # Error logs from failed Direct API tests
    README.md                 # Full results, methodology, findings, bug reports
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
  009-claudemem-vs-serena/    # Head-to-head claudemem vs Serena MCP comparison
    harness/                  # run-comparison.sh, MCP configs
    prompts/                  # 4 code investigation prompts (+1 skipped)
    results/                  # 7 runs (2 with complete data)
    README.md                 # Results, findings, future work
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
| 009 | [Claudemem vs Serena](experiments/009-claudemem-vs-serena/) | 2026-03-04 | Round 1 complete (preliminary) | Head-to-head MCP tool comparison: claudemem uses 34% fewer tool calls but Serena is ~11% faster wall-clock. Neither clearly wins. Correctness not yet graded. |


## Data Archives (S3)

Large binary data (indexes, model outputs) is stored in S3, not in git.

**Bucket**: `s3://mnemex-bench/` (region: `ap-southeast-2`, AWS profile: `tools`)

| Archive | Size | Date | Contents |
|---------|------|------|----------|
| `archives/indexes-20260304-deepseek.tar.gz` | 1.2 GB | 2026-03-04 | 12 eval repos with deepseek-v3.2 enrichment (latest, recommended) |
| `archives/indexes-20260304-deepseek-11of12.tar.gz` | 830 MB | 2026-03-04 | 11 repos enriched (missing 1 repo) |
| `archives/indexes-20260303.tar.gz` | 578 MB | 2026-03-03 | 12 repos, older index version |
| `archives/generated-20260303.tar.gz` | 1.2 KB | 2026-03-03 | Generated eval data |

**Eval repos** (12 repos, ~39K symbols, ~1.9GB uncompressed indexes):
ansible/ansible, getzep/graphiti, huggingface/smolagents, huggingface/transformers,
jlowin/fastmcp, openai/openai-agents-python, opshin/opshin, pdm-project/pdm,
qodo-ai/pr-agent, tinygrad/tinygrad, vibrantlabsai/ragas, wagtail/wagtail

### Download & Restore

```bash
# Download the latest archive
aws s3 cp s3://mnemex-bench/archives/indexes-20260304-deepseek.tar.gz . --profile tools

# Extract to agentbench data directory
tar xzf indexes-20260304-deepseek.tar.gz -C /path/to/agentbench/data/
```

### Upload new archives

```bash
aws s3 cp /path/to/archive.tar.gz s3://mnemex-bench/archives/ --profile tools
```

After uploading, update this table.

## Convention

Each experiment lives in `experiments/NNN-short-name/` with:
- `README.md` — motivation, methodology, results, findings, history
- Script(s) to reproduce the experiment
- Raw data (if small enough for git)
