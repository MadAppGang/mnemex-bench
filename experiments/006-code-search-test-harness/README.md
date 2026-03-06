# 006 — Code Search Test Harness Design

**Date**: 2026-03-06
**Status**: Complete (design phase)

## Motivation

Design a testing harness to compare code search methods: query routing (rule-based, CNN, embedding head, LLM), query expansion (3 model tiers), and reranking. Find pre-built datasets and eval frameworks to use.

## Key Findings

1. **Don't build from scratch** — existing `src/benchmark-v2/` has NDCG@K, MRR@K, Wilcoxon tests. Need only 3 new files: `loader.ts`, `ablation.ts`, `reporter.ts`.

2. **224 queries is the minimum viable benchmark** — 24 SWE-bench instances + 200 synthetic queries from 12 repos. Detects 5% MRR improvement at 80% power.

3. **No dataset has query type labels** — must auto-generate using heuristic rules.

4. **Best datasets**: (1) Internal hybrid from SWE-bench + synthetic, (2) CoSQA for real queries, (3) CodeSearchNet Python for baselines.

5. **Use Wilcoxon, not t-test** — MRR is bounded [0,1] and skewed.

## Experiment Plan

6 ablation conditions: baseline, router-only (x3), expander-only (x3), reranker-only, full pipeline, router+expander. Total cost: ~$5, 7 days.

## File Manifest

```
006-code-search-test-harness/
  README.md              <- This file
  report.md              <- Full 800-line research report with architecture diagrams
  session-meta.json      <- Research session metadata
  research/
    research-plan.md     <- Research decomposition
    search-queries.md    <- 63 search queries
  findings/
    explorer-1.md        <- Datasets research (CodeSearchNet, CoSQA, SWE-bench)
    explorer-2.md        <- Eval frameworks (BEIR, MTEB, RAGAS, ranx)
    explorer-3.md        <- Custom benchmark building
  synthesis/
    iteration-1.md       <- Consolidated synthesis
```
