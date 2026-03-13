# 002 — Cognitive Memory E2E Eval

**Date:** 2026-03-04 to 2026-03-06
**Status:** Round 1 complete — null result (see findings)
**Repo under test:** mnemex (this repo) + jlowin/fastmcp

---

## Motivation

Validate whether mnemex's semantic index and session observations actually help real Claude Code sessions solve tasks better. Specifically: does adding a pre-built code index, a generated CLAUDE.md, or seeded session observations improve task quality or efficiency vs. a raw codebase?

---

## Design

### Four conditions (A/B/C/D)

| Condition | Setup | Hypothesis |
|-----------|-------|------------|
| **no-index** | Raw repo, no .mnemex at all | Baseline: agent must grep manually |
| **baseline** | Golden mnemex index (v2) | Semantic search available |
| **skill-doc** | Index + CLAUDE.md via `mnemex doctor` | Index + project context in system prompt |
| **observations** | Index + seeded session observations | Index + targeted architecture notes |

### Repos under test

- **mnemex** — 8 scenarios (bug investigation, architecture, features, debugging)
- **jlowin/fastmcp** — 8 scenarios (same task types on a Python codebase)

### Scenario types

1. Bug investigation — find root cause, no code changes
2. Architecture explanation — trace pipeline, explain system
3. Feature addition — implement a new CLI flag or parameter
4. Debugging — identify failure modes, no code changes

See `harness/scenarios.ts` for full task prompts and observations.

### Session runner

Each session: `claude -p "<task>" --model sonnet --permission-mode bypassPermissions --max-budget-usd 3 --output-format json`

- Model: claude-sonnet-4-6
- Budget limit: $3 USD
- Hard timeout: 30 min
- Working dir: temp workspace with repo + optional golden index

### Golden indexes

Pre-built once, reused across all sessions. Stored at:
`eval/cognitive-e2e/golden-indexes/<slug>/.mnemex/`

Index specs:
- **Format:** v2 (AST metadata + hierarchical code units)
- **Embeddings:** qwen/qwen3-embedding-8b via OpenRouter
- **LLM enrichment:** deepseek/deepseek-v3.2 via OpenRouter
- **mnemex:** voyage-3.5-lite recorded in config.json but overridden at build time

Indexing cost (see `logs/preindex.log`):
- mnemex: 715 files, 6417 chunks, $0.13 embeddings + $0.004 enrichment
- fastmcp: 417 files, 5027 chunks, $0.06 embeddings

---

## Grading

Manual grading on 3-point scale:
- **0** — Wrong answer, missed key insight, went in circles
- **1** — Partially correct, found some relevant code but missed key details
- **2** — Correct and complete answer

Rubric applied: did the agent identify the correct root cause / architecture / implementation? File references checked against `expectedFiles` in scenarios.ts.

---

## Results

**64 total sessions** (16 scenarios x 4 conditions)

### Quality scores

| Condition | Avg Score | 0s | 1s | 2s | n |
|-----------|-----------|----|----|----|----|
| no-index | **2.00** | 0 | 0 | 16 | 16 |
| baseline | **2.00** | 0 | 0 | 16 | 16 |
| skill-doc | **1.94** | 0 | 1 | 15 | 16 |
| observations | **2.00** | 0 | 0 | 16 | 16 |

The single score=1 was scenario 1 (--agent flag bug) under skill-doc: the CLAUDE.md pointed at `flagIndices` path which is unreachable (flag is stripped before dispatch).

### Per-scenario breakdown

All 16 scenarios scored 2/2 across all 4 conditions, except scenario 1 skill-doc.

See `results/grades.json` for full detail including grader notes.

### Session efficiency (approximate)

- no-index sessions: ~10-15 min, 15-25 tool calls (manual file reading)
- baseline/skill-doc/observations: ~5-8 min, 8-15 tool calls (semantic search)
- Index saves ~40-50% wall-clock time and ~30-40% tool calls

---

## Findings

### Key finding: null result on quality

claude-sonnet-4-6 achieves perfect scores regardless of condition. The model is strong enough to grep its way to the answer in any codebase of this size. All four conditions are statistically identical on correctness.

### Why the null result?

1. **Model too capable** — Sonnet can read 50+ files in 20 minutes and still get the right answer. The index trades time for quality, but quality was already at ceiling.

2. **Tasks not challenging enough** — All 16 scenarios had clear, localizable answers (1-3 key files). A smart grep sequence finds them without semantic search.

3. **Repos too small** — mnemex (~700 files) and fastmcp (~400 files) are small enough that brute-force exploration works fine. The index benefit becomes more pronounced on 10k+ file repos.

4. **Skill-doc slightly worse** — The generated CLAUDE.md steered the agent toward wrong files in 1 case (scenario 1). CLAUDE.md quality depends on observation accuracy.

### What the index DOES help with

- **Efficiency**: ~40-50% faster sessions, fewer tool calls
- **Large codebases**: Benefit grows with repo size (tested separately in agentbench on 12 repos)
- **Cross-file reasoning**: Tasks requiring understanding 20+ files simultaneously

---

## Problems encountered during setup

1. **v1 vs v2 index**: Initial mnemex golden index was v1 (no `config.json`). `mnemex observe` requires v2 (code_units schema). Rebuilt with current mnemex.

2. **Haiku + $5 budget = sessions never end**: Haiku is so cheap that $5 buys 100+ turns. Sessions ran 25-40 min each. Switched to Sonnet at $3 budget.

3. **15-min timeout too short for no-index**: no-index condition requires manual grepping (10-15 min per session). Increased timeout to 30 min.

4. **Observations condition requires v2**: Fixed by rebuilding golden indexes.

---

## Future work / harder experiments

The null result means we need harder tasks. Options:

### Option A: Weaker model + harder tasks
Use Haiku with $0.50 budget on same tasks. Model can't brute-force 20+ files in budget. Index should help.

### Option B: Cross-file reasoning tasks
Tasks that require synthesizing information across 10+ files simultaneously:
- "List all places where X data structure is mutated and explain the invariants"
- "Why does Y fail when Z is enabled? Trace the interaction across modules."

### Option C: Larger repos
Test on agentbench repos (5k-50k files). Semantic search essential for navigation.

### Option D: Time-constrained sessions
Hard time limit (2 min, 5 min) — index helps you find files fast.

### Option E: Verify observations are semantically retrievable
Confirm the observations seeded in condition D actually surface in search results for the relevant queries. If not, seeding may not be working as expected.

---

## Reproduction

### Prerequisites

```bash
# Build golden indexes (one-time, ~40 min)
cd /Users/jack/mag/mnemex
OPENROUTER_API_KEY=... bun eval/cognitive-e2e/run.ts --preindex

# Or copy from this experiment (already built):
# golden-indexes not included here (too large — use eval/cognitive-e2e/golden-indexes/ in mnemex repo)
```

### Run eval

```bash
cd /Users/jack/mag/mnemex

# Single scenario, all conditions
bun eval/cognitive-e2e/run.ts --scenario 1

# All mnemex scenarios
bun eval/cognitive-e2e/run.ts --repo mnemex --all

# Everything (64 sessions, ~4-6 hours, ~$50)
bun eval/cognitive-e2e/run.ts --all
```

### Grade results

```bash
bun eval/cognitive-e2e/grade.ts          # interactive grading
bun eval/cognitive-e2e/grade.ts --show   # show summary
```

---

## Files

```
harness/
  run.ts          — main eval runner (workspace setup, claude -p execution, result capture)
  grade.ts        — interactive grading UI + aggregate stats
  scenarios.ts    — 16 scenario definitions with tasks, observations, expectedFiles

results/
  grades.json                     — all 64 grades with scores and notes
  mnemex/scenario-{N}/         — raw session JSON per condition (8 scenarios × 4 conditions)
  jlowin_fastmcp/scenario-{N}/    — raw session JSON per condition (8 scenarios × 4 conditions)

logs/
  preindex.log    — golden index build log (costs, file counts, timing)
  eval-*.log      — embedding model fine-tuning benchmark logs (separate experiment, /tmp rescue)
```
