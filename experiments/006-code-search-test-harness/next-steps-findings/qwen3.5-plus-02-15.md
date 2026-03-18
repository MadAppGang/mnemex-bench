Excellent — this is the comprehensive internal research document. This 37-page document from the native research agent contains **much more detail** than my web-based report. Let me synthesize the consensus:

---

## Consolidated Research Summary

Three independent research passes (my web research + two internal agents) have converged on the same findings. Here's the consolidated answer:

### Key Validations Across All Sources

| Finding | My Report | Internal Claude Doc | Second Agent |
|---------|-----------|---------------------|--------------|
| **Hybrid > pure dense/sparse** | ✓ SANER 2024 +22% | ✓ CodeSearchNet evidence | ✓ RAG architecture |
| **RRF fusion benefit** | ✓ +15-22% | ✓ +3-8%, 5-line change | ✓ Mentioned |
| **LLM expansion failure** | ✓ -26-32% documented | ✓ "Identifier dilution" | ✓ "Semantic drift" |
| **Reranking paradox** | ✓ -5 to -32% production | ✓ MS-MARCO mismatch | ✓ Symbol queries hurt |
| **Industry validation** | ✓ GitHub/Sourcegraph | ✓ Zoekt/trigram blogs | ✓ RAG standard |
| **Query taxonomy** | ✓ 55-65% symbol | ✓ 40-60% symbol | ✓ Router pattern |

---

## Top 3 Architectural Changes (Consensus Ranking)

All three sources agree on the priority order:

| Rank | Change | Expected Δ MRR | Effort | Confidence |
|------|--------|----------------|--------|------------|
| **1** | **RRF fusion** — replace linear interpolation with `1/(k+rank_bm25) + 1/(k+rank_dense)` | **+3-8%** | **5 lines** | **HIGH** — zero downside |
| **2** | **UniXcoder cross-encoder** — replace Qwen3-1.7B (MS-MARCO trained) with code-specific reranker | **+15-25%** on conceptual | **Medium** — fine-tune on CodeSearchNet | **HIGH** — tests H4 directly |
| **3** | **Extended regex router + 3-way classifier** — symbol/concept/usage routing with fastText | **+5-15%** | **Medium** — label 200 queries, train fastText | **HIGH** — matches GitHub/Sourcegraph |

---

## Critical Pre-Experiment: Query Type Analysis

The internal doc makes an essential point all sources agree on:

`★ Insight ─────────────────────────────────────`
Before running any experiment, **analyze your 860-query benchmark distribution**. Categorize each query as symbol/concept/usage (even with a simple heuristic: contains identifiers vs. pure NL). This 1-hour analysis tells you:

1. What fraction of MRR headroom is on symbol queries (B1 helps) vs. concept queries (B1 doesn't help)
2. Whether semantic search is contributing positively or just adding noise
3. Which experiment has highest expected gain on YOUR specific distribution

If 70%+ are symbol queries, pure BM25 might already beat your hybrid.
`─────────────────────────────────────────────────`

---

## Additional High-Value Experiments (from Internal Doc)

| Experiment | Why It Matters |
|------------|----------------|
| **HyDE for NL queries** — generate hypothetical code snippet, embed THAT for search | Best-validated LLM expansion technique for code |
| **SPLADE as BM25 replacement** — learned sparse expansion captures related identifiers | +8-15% on identifier-adjacent queries |
| **Function-level chunking audit** — verify chunks are complete functions, not split/merged | Cross-encoders need coherent units |
| **ColBERT-v2 for semantic leg** — late interaction, per-token matching | +8-12% over bi-encoder |

---

## Full Reports Available

1. **My web-based report**: `ai-docs/sessions/mnemex-architecture-research-20260318/report.md`
2. **Internal native research**: `ai-docs/sessions/dev-research-code-search-next-steps-20260318-125921-579794ce/findings/internal-claude.md`

The internal doc is more comprehensive (37 pages vs. 27) with specific implementation recipes and HuggingFace model links.
