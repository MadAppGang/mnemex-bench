# 012: SWE-bench Context File Ablation

Does giving an AI coding agent a semantic code index (mnemex/claudemem) improve its ability to solve real GitHub issues? And how does that interact with human-written context files like CLAUDE.md?

## Background

Gloaguen et al. (2025) published ["Evaluating AGENTS.md"](https://arxiv.org/abs/2602.11988) with an open harness ([eth-sri/agentbench](https://github.com/eth-sri/agentbench)) that tests whether LLM-generated context files (AGENTS.md, CLAUDE.md) help AI agents solve SWE-bench issues. Their paper tests 4 conditions: no context, human-written, and two LLM planners (Dynamic Cheatsheet, ACE).

We forked the harness and added **4 new conditions** to test whether mnemex (semantic code search) provides better context than static files — and whether combining them helps or hurts.

## Conditions (6 total)

| Condition | Context Source | Description |
|-----------|---------------|-------------|
| `no_plan` | None | Baseline: raw Claude Code, no AGENTS.md |
| `human_written` | Repo's existing CLAUDE.md/AGENTS.md | Static context file from repo maintainers |
| `claude_planner` | LLM-generated AGENTS.md | Claude generates per-instance context (paper's approach) |
| `claudemem_full` | mnemex `map` + `search` | Per-instance: PageRank symbols + semantic search → AGENTS.md |
| `claudemem+generated` | mnemex + LLM-generated base | mnemex context layered on top of LLM-generated AGENTS.md |
| `claudemem+human_written` | mnemex + repo's CLAUDE.md | mnemex context layered on top of human-written file |

### How the claudemem planner works

The `claudemem_planner.py` (921 lines) runs on the host before each SWE-bench instance:

1. **Pre-indexes** repos with mnemex (AST + deepseek-v3.2 enrichment, cached across runs)
2. For each issue, runs `claudemem map` (PageRank top-10 symbols) and `claudemem search` (semantic top-5 results)
3. Composes an AGENTS.md with architecture overview, relevant symbols, and semantic matches
4. Injects it into the Docker container before the agent starts

The combined conditions (`claudemem+human_written`, `claudemem+generated`) prepend the base context file and append mnemex results.

## Results (Run 1, 2026-03-04)

**Model:** Claude Sonnet 4.5 | **Dataset:** eth-sri/agentbench (HuggingFace, train split)
**Repos:** ansible, graphiti, smolagents, transformers, fastmcp (5 of 12)
**Instances per condition:** 46–48 | **Infrastructure error rate:** 46–57%

Pass rates are corrected for infrastructure errors (empty `pr_test_results.json`):

| Condition | Resolved | Real Fail | Infra Error | Pass Rate (corrected) |
|-----------|----------|-----------|-------------|----------------------|
| **claudemem_full** | **15** | **9** | **22** | **62.5%** |
| human_written | 11 | 9 | 27 | 55.0% |
| claudemem+generated | 11 | 11 | 25 | 50.0% |
| claude_planner | 12 | 13 | 22 | 48.0% |
| no_plan | 10 | 11 | 27 | 47.6% |
| claudemem+human_written | 8 | 13 | 26 | 38.1% |

### Key Findings

**1. mnemex alone is the best context source (+14.9pp over baseline)**

`claudemem_full` at 62.5% is the only condition that breaks away from the ~48% baseline cluster. It resolved 15 instances vs 10 for no_plan — a 50% improvement in absolute solved issues.

**2. Adding CLAUDE.md on top of mnemex context *hurts* performance**

`claudemem+human_written` (38.1%) is the worst-performing condition — 9.5pp *below* baseline and 24.4pp below `claudemem_full`. The combination doesn't just fail to help; it actively interferes.

Hypothesis: the human-written context files in these repos are stale, generic, or misleading. When mnemex provides fresh, task-specific context, prepending a static CLAUDE.md dilutes the signal with noise.

**3. LLM-generated context barely beats no context**

`claude_planner` (48.0%) is only +0.4pp over `no_plan` (47.6%). The Dynamic Cheatsheet and ACE planners from the paper weren't run in this round, but the standard LLM planner shows minimal benefit.

**4. Infrastructure errors are the dominant noise source**

46–57% of instances failed due to Docker evaluation issues (empty `pr_test_results.json`), not agent failures. This is consistent across conditions, suggesting it's infrastructure-level, not condition-dependent. More instances are needed for statistical confidence.

## Caveats

- **Small effective sample sizes** (~21–24 valid instances per condition after removing infra errors). The corrected pass rates have wide confidence intervals.
- **Only 5 of 12 repos** were included (ansible, graphiti, smolagents, transformers, fastmcp). smolagents, transformers, and graphiti had near-100% infrastructure errors.
- **No statistical significance test** was run. With these sample sizes, the ~15pp difference between `claudemem_full` and `no_plan` is suggestive but not conclusive.
- **Run 1 only** — no replication yet.

## Reproduction

### Prerequisites

- Clone [eth-sri/agentbench](https://github.com/eth-sri/agentbench)
- Apply our patch: `git apply patches/agentbench-mnemex-extensions.patch`
- Install mnemex/claudemem: `npm install -g @anthropic/claudemem`
- Pre-index eval repos (see `scripts/agentbench/run_harness/preindex.py`)
- Docker for SWE-bench evaluation containers

### Run all 6 conditions

```bash
cd scripts/agentbench/run_harness
./run_all_conditions.sh --workers 2 --exec-model sonnet-4-5
```

### Run a single condition

```bash
python run_condition.py claudemem_full
```

### Restore pre-built indexes

```bash
aws s3 cp s3://mnemex-bench/archives/indexes-20260304-deepseek.tar.gz . --profile tools
./restore_indexes.sh --archive indexes-20260304-deepseek.tar.gz
```

## Files

```
012-swebench-context-ablation/
├── README.md                    # This file
├── results/
│   └── run-1-summary.json       # Raw results from run 1 (6 conditions, 46-48 instances each)
└── patches/
    └── agentbench-mnemex-extensions.patch  # 4 commits (3,479 lines) vs upstream eth-sri/agentbench
```

### What the patch adds

| File | Lines | Purpose |
|------|-------|---------|
| `src/agentbench/planners/claudemem_planner.py` | 921 | mnemex-based context generation with 4 variants |
| `src/agentbench/planners/human_written_planner.py` | 312 | Reads existing CLAUDE.md/AGENTS.md from repos |
| `src/configs/plan_constants.py` | +44 | Config dicts for all 6+ conditions |
| `scripts/.../preindex.py` | 194 | Pre-index repos with mnemex before eval |
| `scripts/.../restore_indexes.sh` | 104 | Restore cached indexes from S3 archive |
| `scripts/.../run_all_conditions.sh` | 152 | Run all 6 conditions end-to-end |
| `scripts/.../run_parallel.sh` | 127 | Parallel execution with port isolation |

### Fork location

The full fork with data, traces, and Docker configs lives at `/Users/jack/mag/agentbench/` (origin: `eth-sri/agentbench`). The indexes and traces total ~95GB and are not included here.

## Next Steps

1. **Run 2 with all 12 repos** — need to fix Docker evaluation for smolagents, transformers, graphiti
2. **Statistical testing** — Wilcoxon signed-rank on per-instance paired results (same test used in experiment 004)
3. **Ablate mnemex components** — run `map_only` and `search_only` variants to isolate which part of mnemex helps
4. **Try weaker base model** — Sonnet 4.5 may be capable enough to mask context benefits (same issue as experiment 002)
