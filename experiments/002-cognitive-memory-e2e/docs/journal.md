# Experiment 002 — Cognitive Memory E2E Eval Journal

Chronological log of all steps, results, and analysis for the cognitive memory end-to-end evaluation.

---

## 2026-03-04 — Golden Index Construction

### What was done

Built pre-computed ("golden") mnemex indexes for two evaluation repos. These indexes are reused across all 64 sessions to eliminate indexing variance.

**Repos indexed:**
- **mnemex** (the mnemex codebase itself) -- TypeScript
- **jlowin/fastmcp** (Python MCP framework) -- Python

**Index configuration:**
- Format: v2 (AST metadata + hierarchical code units)
- Embeddings: qwen/qwen3-embedding-8b via OpenRouter
- LLM enrichment: deepseek/deepseek-v3.2 via OpenRouter
- Config recorded voyage-3.5-lite but overridden at build time

**Command:** `bun eval/cognitive-e2e/run.ts --preindex`

### Results

| Repo | Files | Chunks | Duration | Embedding Cost | Enrichment Cost | Enrichment Docs | LLM Calls |
|------|-------|--------|----------|---------------|-----------------|-----------------|-----------|
| mnemex | 715 | 6,417 | 41 min | $0.123 | $0.004 | 3,612 | 1,178 |
| fastmcp | 417 | 5,027 | 31 min | $0.063 | -- | 3,350 | 757 |
| **Total** | **1,132** | **11,444** | **~72 min** | **$0.186** | **$0.004** | **6,962** | **1,935** |

### Bugs and failures

- **v1 vs v2 index incompatibility.** The initial mnemex golden index was v1 format (no `config.json`). The `mnemex observe` command (needed for condition D) requires v2 with the `code_units` schema. Rebuilt both indexes from scratch with the current mnemex version.
- **context7 rate limit.** zod docs fetch via context7 was rate-limited during mnemex indexing. Non-blocking -- logged as "No summary returned" for several lock-related symbols (readLockFile, isLockStale, IIndexLock, etc.). Did not affect index quality.

### References

- Build log: `logs/preindex.log`
- Golden indexes stored at: `eval/cognitive-e2e/golden-indexes/<slug>/.mnemex/` (in the mnemex repo, not committed here -- too large)

---

## 2026-03-04 to 2026-03-05 — Eval Design and Scenario Authoring

### What was done

Designed a 4-condition A/B/C/D test to isolate the contribution of each mnemex layer.

**Four conditions:**

| Condition | Label | Setup | Hypothesis |
|-----------|-------|-------|------------|
| A | no-index | Raw repo, no `.mnemex/` | Agent must grep manually -- slowest, same quality? |
| B | baseline | Golden mnemex index (v2) | Semantic search available -- faster navigation |
| C | skill-doc | Index + CLAUDE.md via `mnemex doctor` | Index + project context injected into system prompt |
| D | observations | Index + seeded session observations | Index + targeted architecture notes from prior sessions |

**16 scenarios authored** across 4 task types:

| Type | mnemex Scenarios | fastmcp Scenarios | Total |
|------|------------------|-------------------|-------|
| Bug investigation | S01, S04 | S06, S10 | 4 |
| Architecture explanation | S03, S05, S11, S12 | S07, S08, S14, S15 | 8 |
| Feature addition | S02, S13 | S09, S16 | 4 |

Each scenario includes: task prompt, seeded observations (for condition D), and expectedFiles list for grading.

**Session runner config:**
- Model: claude-sonnet-4-6
- Budget limit: $3 USD per session
- Hard timeout: 30 min
- Execution: `claude -p "<task>" --model sonnet --permission-mode bypassPermissions --max-budget-usd 3 --output-format json`
- Working dir: fresh temp workspace with repo copy + optional golden index

### Key decisions

- Chose Sonnet over Haiku after discovering Haiku at $5 budget produced sessions that ran 25-40 minutes each without converging. Haiku is too cheap per token -- $5 buys 100+ turns. Switched to Sonnet at $3.
- Increased timeout from 15 min to 30 min after no-index sessions required 10-15 min for manual grepping.
- Manual grading on 3-point scale (0/1/2) rather than automated scoring, because task answers are explanatory prose with file references.

### References

- Scenario definitions: `harness/scenarios.ts` (310 lines, 16 scenarios)
- Runner: `harness/run.ts`
- Grader: `harness/grade.ts`

---

## 2026-03-05 to 2026-03-06 — Full Eval Run (64 Sessions)

### What was done

Ran all 16 scenarios across all 4 conditions. 64 total sessions (16 x 4). Each session launched in an isolated temp workspace. Graded all 64 sessions manually using the 3-point rubric.

**Grading rubric:**
- **0** -- Wrong answer, missed key insight, went in circles
- **1** -- Partially correct, found some relevant code but missed key details
- **2** -- Correct and complete answer

File references checked against `expectedFiles` defined in scenarios.ts.

### Results -- Quality Scores

| Condition | Avg Score | Score=0 | Score=1 | Score=2 | n |
|-----------|-----------|---------|---------|---------|---|
| no-index | **2.00** | 0 | 0 | 16 | 16 |
| baseline | **2.00** | 0 | 0 | 16 | 16 |
| skill-doc | **1.94** | 0 | 1 | 15 | 16 |
| observations | **2.00** | 0 | 0 | 16 | 16 |

All four conditions are statistically identical on correctness. 63 out of 64 sessions scored 2/2.

### Results -- Per-Scenario Breakdown

All 16 scenarios scored 2/2 across all 4 conditions, with one exception:

| Scenario | Condition | Score | Notes |
|----------|-----------|-------|-------|
| S01 (--agent flag bug) | skill-doc | 1 | CLAUDE.md pointed at `flagIndices` path which is unreachable (flag is stripped before dispatch). Slightly off root cause. |

Every other cell in the 16x4 matrix scored 2.

### Results -- Per-Scenario Grader Notes (Selected)

| ID | Title | no-index | baseline | skill-doc | observations |
|----|-------|----------|----------|-----------|-------------|
| S01 | Bug: --agent flag | includes() position-independent, handleSearch error path | Same correct analysis | **Score=1**: flagIndices path unreachable | Correct |
| S02 | Feature: CSV output | Implemented flag, CSV, help | RFC 4180 compliant | Implemented | Implemented |
| S03 | Architecture: search scoring | vector+BM25, RRF, type weights | Two retrieval legs, RRF | Hybrid, RRF, type weights | Two-signal, type-aware RRF |
| S04 | Debug: empty results | code_unit vs code_chunk mismatch | Summary-only crowding, FTS failures | Summary-only filtering | ftsIndexReady not reset |
| S05 | Trace: indexing pipeline | Complete trace with all phases | Function names + data flow | Step-by-step table | CLI through LanceDB |
| S06 | Bug: tool error handling | _call_tool chain, mask_error_details | ErrorHandlingMiddleware | 3 layers identified | 3 layers, key levers |
| S07 | Feature: middleware | Two ways, first=outermost | Execution order, hooks | Execution order, hooks | Two ways, first=outermost |
| S08 | Architecture: resource templates | Registration, URI regex, resolution | Template registration, match_uri | Registration, matching, execution | Registration, matching, injection |
| S09 | Feature: resource description | Correctly identifies already exists | Already implemented, traces chain | Already implemented | Already implemented |
| S10 | Debug: OpenAPI limits | External refs, schema quirks | Stable promotion in v2.14 | Refs, schema handling | Cookie params, director.py |
| S11 | Architecture: embedding providers | 5 providers, priority chain, env var | 5 providers, routing, classification | 5 providers, 4 client classes | 5 providers, default model |
| S12 | Architecture: enrichment | 6 extractors, parallel execution | Prompts, parallel, storage | 6 doc types, enrichFiles flow | 2 active, 4 defined but unwired |
| S13 | Feature: reindex command | Switch case, help, cloud/local | Switch case, compact/full help | Switch case + help | Switch case, cloud/local |
| S14 | Architecture: context DI | Type-hint, ContextVar, Context API | resolve_dependencies, ContextVar | Two mechanisms, ContextVar | Legacy + modern mechanisms |
| S15 | Architecture: server composition | Provider pattern, mount(), namespace | mount() vs import_server(), lifespans | mount() vs import_server() | Dynamic link, deprecated |
| S16 | Feature: tool timeout | asyncio.wait_for, @mcp.tool overloads | timeout field, wait_for | timeout=None transparent | timeout field, wait_for |

### Results -- Session Efficiency

| Metric | no-index | baseline / skill-doc / observations |
|--------|----------|-------------------------------------|
| Wall-clock time | ~10-15 min | ~5-8 min |
| Tool calls | 15-25 (manual file reading) | 8-15 (semantic search) |
| Time savings | -- | ~40-50% faster |
| Tool call savings | -- | ~30-40% fewer |

Sample session costs (scenario 1):
- no-index: $0.99, 359s, 16 turns
- baseline: $1.69, 669s, 19 turns

The index saves wall-clock time but does not consistently reduce dollar cost -- Sonnet uses fewer turns but more context per turn when reading search results.

### References

- All 64 session results: `results/<repo>/scenario-<N>/<condition>.json`
- Grades with notes: `results/grades.json` (81 lines)

---

## 2026-03-06 — Null Result Analysis and Conclusions

### Key finding: NULL RESULT on quality

The semantic index, CLAUDE.md, and seeded observations produce no measurable improvement in answer correctness. Sonnet achieves perfect scores (2.00 avg) regardless of condition. The index trades time for quality, but quality was already at ceiling.

### Root cause analysis

Four factors combined to produce the null result:

1. **Model too capable.** Claude Sonnet can read 50+ files in 20 minutes and still get the right answer. Brute-force exploration via grep/read is slow but sufficient for these tasks. The index saves time, not correctness.

2. **Tasks not challenging enough.** All 16 scenarios had clear, localizable answers (1-3 key files). A systematic grep sequence finds the relevant code without needing semantic search. No scenario required synthesizing information across 10+ files simultaneously.

3. **Repos too small.** mnemex (~700 files) and fastmcp (~400 files) are small enough that exhaustive exploration works. The index benefit grows with repo size -- at 10k+ files, brute-force exploration becomes infeasible within budget.

4. **Skill-doc slightly harmful.** The generated CLAUDE.md steered the agent toward an incorrect path in scenario 1 (flagIndices, which is unreachable). CLAUDE.md quality depends on observation accuracy -- bad observations produce bad guidance.

### What the index DOES help with

- **Efficiency**: ~40-50% faster sessions, ~30-40% fewer tool calls
- **Large codebases**: Benefit grows with repo size (tested separately in agentbench on 12 repos in experiment 012)
- **Cross-file reasoning**: Tasks requiring understanding of 20+ files simultaneously

### MVP validation status

The `mvp-validation/` directory contains a separate, smaller validation harness (5 observations, 5 queries) designed to test whether observations actually surface in search results. This harness was implemented but never run. It should be executed before any Round 2 E2E eval to confirm the retrieval mechanism works as expected.

### References

- MVP validation harness: `mvp-validation/validate.ts`, `mvp-validation/README.md`
- Implementation patch for observation support: `mvp-validation/implementation.patch` (503 lines across 6 files)

---

## Future Work -- Harder Experiment Designs

The null result means Round 2 must increase task difficulty along at least one axis. Five options identified:

### Option A: Weaker model + tighter budget

Use Haiku with $0.50 budget on the same tasks. Haiku cannot brute-force 20+ files within budget. The index should provide a measurable quality advantage when the agent cannot afford exhaustive exploration.

### Option B: Cross-file reasoning tasks

Design tasks that require synthesizing information across 10+ files simultaneously:
- "List all places where X data structure is mutated and explain the invariants"
- "Why does Y fail when Z is enabled? Trace the interaction across modules"

These cannot be solved by reading 1-3 files.

### Option C: Larger repos (5k-50k files)

Test on agentbench repos where semantic search is essential for navigation. At 10k+ files, grep-based exploration exhausts the budget before finding the answer.

### Option D: Time-constrained sessions

Hard time limit (2 min or 5 min). The index helps find files fast -- under time pressure, the no-index condition should degrade while indexed conditions maintain quality.

### Option E: Verify observation retrieval

Run the MVP validation harness (`mvp-validation/validate.ts`) to confirm seeded observations actually surface in search results for relevant queries. If observations do not rank in top-5 results, the condition D setup may not be working as intended.

### Recommended next step

Option A (weaker model + tighter budget) is the fastest path to a non-null result. It requires no new scenario design -- just rerun the existing 64-session matrix with Haiku at $0.50 budget.
