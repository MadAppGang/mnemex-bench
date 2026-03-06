# 005 — Query Planner Architecture Research

**Date**: 2026-03-06
**Status**: Complete

## Motivation

Should claudemem's query expander (small LLM generating lex/vec/hyde strings) evolve into a query PLANNER that intelligently orchestrates multiple retrieval tools (AST, LSP, embedding, BM25, code descriptions, symbol graph)?

## Design

Deep research with 3 parallel explorer agents:
- Explorer 1: Existing tools (Cody, aider, Continue.dev) + academic papers (Self-RAG, FLARE, IRCoT)
- Explorer 2: Evaluation metrics & benchmarks (CodeSearchNet, SWE-bench, RAGAS)
- Explorer 3: LLM characteristics for planning + production system approaches

25+ sources consulted, 88% high quality. Factual integrity: 97%. Agreement score: 80%.

## Key Findings

1. **No production code AI tool uses an LLM at query time for retrieval routing.** Cody, Cursor, aider, Copilot, Continue.dev all use hardcoded parallel pipelines with heuristic routing. Reason: latency.

2. **Rule-based query classification is the correct default** — ~80% routing accuracy at <5ms with zero model dependency.

3. **LLM-based planning belongs in explicit "deep mode" only** — IRCoT/Self-RAG gains (+20% EM on multi-hop QA) are concentrated in complex queries that are rare in interactive code search.

4. **Query expander and query planner are different jobs.** Expander = rewrite queries into better search terms. Planner = decide which tools to call.

5. **Recommended: rule-based classifier + existing 3-tier expander.** No need for a 5th model.

## Architecture Recommendation

```
Query → Rule-based classifier (<5ms) → Strategy weights
  CamelCase / snake_case → boost AST + symbol graph
  File path patterns     → boost BM25
  "callers of", "uses"   → boost symbol graph + LSP
  "how does", "explain"  → boost vector + summaries
  default                → existing weights
```

## File Manifest

```
005-query-planner-architecture/
  README.md              <- This file
  report.md              <- Full research report
  session-meta.json      <- Research session metadata
  research/
    research-plan.md     <- Decomposed sub-questions
    search-queries.md    <- 75 search queries used
  findings/
    explorer-1.md        <- Tools & papers findings
    explorer-2.md        <- Eval metrics findings
    explorer-3.md        <- LLM requirements findings
  synthesis/
    iteration-1.md       <- Consolidated synthesis
```
