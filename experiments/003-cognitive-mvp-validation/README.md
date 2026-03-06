# 003 — Cognitive MVP Validation

**Date:** 2026-03-04
**Status:** Not yet run (harness + implementation ready)

---

## Motivation

ADR-004 proposes a two-layer cognitive memory architecture where session observations accumulate alongside code chunks. Before investing in the full 7-phase roadmap, this experiment validates the core hypothesis: **do session observations surface in search results at the right time and improve search quality?**

The implementation is small because observations are just LanceDB documents. The existing `addDocuments`, `typeAwareRRFFusion`, and hybrid search pipeline already handle arbitrary `DocumentType` values.

---

## Design

### What we're validating

1. Can observations be written to LanceDB and embedded alongside code chunks?
2. Do observations surface in search results when querying for related code?
3. Do observations rank usefully (not too high, not buried)?
4. Does the search experience improve with observations vs without?

### Implementation (503 lines across 6 files)

| File | Change |
|------|--------|
| `src/types.ts` | Add `"session_observation"` to DocumentType union |
| `src/core/store.ts` | Add observation weights (search: 0.20, nav: 0.15, FIM: 0.05) + observation result handling |
| `src/cli.ts` | Add `observe` CLI command |
| `src/mcp/tools/observe.ts` | New MCP tool (112 lines) |
| `src/mcp/tools/index.ts` | Register observe tool |
| `src/mcp/tools/search.ts` | Show observation results with metadata |

### Test observations (5 known facts about claudemem)

| # | Content | File | Type |
|---|---------|------|------|
| 1 | PageRank > 0.05 = high-importance. Dead code uses <= 0.001. | analyzer.ts | gotcha |
| 2 | Chunker splits oversized nodes. MAX_CHUNK_TOKENS=600. | chunker.ts | architecture |
| 3 | Embedding dimension mismatch causes auto table clear. | store.ts | gotcha |
| 4 | Test detection is language-specific (*.test.ts, test_*.py, *_test.go). | test-detector.ts | pattern |
| 5 | --agent flag stripped before dispatch. Use agentMode global. | cli.ts | gotcha |

### Test queries (5 queries, each should match one observation)

| # | Query | Expected match |
|---|-------|----------------|
| 1 | "how does dead code detection work" | observation #1 |
| 2 | "chunking strategy oversized functions" | observation #2 |
| 3 | "what happens when I change embedding model" | observation #3 |
| 4 | "how are test files detected" | observation #4 |
| 5 | "machine parseable output" | observation #5 |

### Success criteria

4 out of 5 observations surface in top-5 results for their target query.

---

## Results

**Not yet run.** Implementation is complete but the validation script has not been executed.

---

## Reproduction

```bash
# From the claudemem repo (with implementation changes applied)
cd /Users/jack/mag/claudemem

# Apply implementation patch (if not already applied)
git apply experiments/003-cognitive-mvp-validation/harness/implementation.patch

# Run validation
bun eval/cognitive-mvp/validate.ts

# Or with explicit path
bun eval/cognitive-mvp/validate.ts --project-path /Users/jack/mag/claudemem
```

The script:
1. Checks for existing index (creates with `--no-llm` if missing)
2. Writes 5 observations via `claudemem observe`
3. Runs 5 test queries via `claudemem search`
4. Checks if expected observation surfaces in top-5 results
5. Reports PASS/FAIL (exit code 0 if >= 4/5 pass)

---

## Files

```
harness/
  validate.ts              -- Main eval script (153 lines)
  observe-mcp-tool.ts      -- MCP observe tool implementation (112 lines)
  implementation.patch     -- Full diff of all source changes (503 lines across 6 files)

results/
  (empty — experiment not yet run)

logs/
  (empty — no logs generated yet)
```

---

## Related

- **002-cognitive-memory-e2e**: The follow-on experiment that ran 64 sessions (4 conditions x 16 scenarios) testing the full cognitive memory hypothesis at scale. Result: null (Sonnet too capable).
- **ADR-004**: Architecture Decision Record proposing the two-layer cognitive memory design.
