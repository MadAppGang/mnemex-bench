# 007 — Embedding Model Research

**Date**: 2026-03-04 to 2026-03-05
**Status**: Complete

## Motivation

Find the best small embedding model for mnemex's local code search. Must run on consumer hardware (Apple Silicon), support code-specific embeddings, and balance quality vs latency.

## Key Findings

Research covers OpenRouter embedding models comparison and small embedding models survey for local deployment. Includes benchmark data from MTEB CodeSearchNet subtask and practical latency measurements.

See `report.md` for full findings and model recommendations.

## File Manifest

```
007-embedding-model-research/
  README.md              <- This file
  report.md              <- Full research report
  research/
    research-plan.md     <- Research decomposition
    openrouter-embedding-models-comparison.md <- API embedding model comparison
    small-embedding-models-march2026.md       <- Local small models survey
  findings/
    explorer-1.md        <- Model benchmarks findings
    explorer-2.md        <- Deployment considerations
    explorer-3.md        <- Cost/quality tradeoffs
  synthesis/
    iteration-1.md       <- Consolidated synthesis
```
