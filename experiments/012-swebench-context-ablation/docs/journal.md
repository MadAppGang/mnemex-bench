# Experiment 012 — SWE-bench Context Ablation Journal

Chronological log of infrastructure setup, runs, and analysis for the 6-condition SWE-bench context ablation. Tests whether mnemex (semantic code search) provides better context than static CLAUDE.md/AGENTS.md files for AI coding agents solving real GitHub issues.

Fork lives at `/Users/jack/mag/agentbench/` (upstream: `eth-sri/agentbench`).

---

## 2026-03-04 — Infrastructure Setup

### What was done

Forked eth-sri/agentbench and extended it with mnemex integration. The upstream harness from Gloaguen et al. (2025) "Evaluating AGENTS.md" (arXiv:2602.11988) runs Claude Code in Docker containers against SWE-bench instances, testing whether context files improve issue resolution.

Added 7 new files totaling 3,479 lines across 4 commits:

| File | Lines | Purpose |
|------|-------|---------|
| `src/agentbench/planners/claudemem_planner.py` | 921 | mnemex-based context generation with 4 variants |
| `src/agentbench/planners/human_written_planner.py` | 312 | Reads existing CLAUDE.md/AGENTS.md from repos |
| `src/configs/plan_constants.py` | +44 | Config dicts for all 6+ conditions |
| `scripts/.../preindex.py` | 194 | Pre-index repos with mnemex before eval |
| `scripts/.../restore_indexes.sh` | 104 | Restore cached indexes from S3 archive |
| `scripts/.../run_all_conditions.sh` | 152 | Run all 6 conditions end-to-end |
| `scripts/.../run_parallel.sh` | 127 | Parallel execution with port isolation |

**claudemem_planner.py** workflow (runs on host before each SWE-bench instance):
1. Pre-indexes repos with mnemex (AST + deepseek-v3.2 enrichment), cached across runs
2. Runs `claudemem map` to get PageRank top-10 symbols per issue
3. Runs `claudemem search` to get semantic top-5 results per issue
4. Composes an AGENTS.md with architecture overview, relevant symbols, and semantic matches
5. Injects it into the Docker container before the agent starts

Combined conditions (`claudemem+human_written`, `claudemem+generated`) prepend the base context file and append mnemex results.

Pre-indexed all 12 eval repos with mnemex using deepseek-v3.2 enrichment. Indexes archived to S3:
- `s3://mnemex-bench/archives/indexes-20260304-deepseek.tar.gz` (1.2 GB, 12 repos)

### 6 experimental conditions

| Condition | Context Source | Description |
|-----------|---------------|-------------|
| `no_plan` | None | Baseline: raw Claude Code, no AGENTS.md |
| `human_written` | Repo's existing CLAUDE.md/AGENTS.md | Static context file from repo maintainers |
| `claude_planner` | LLM-generated AGENTS.md | Claude generates per-instance context (paper's approach) |
| `claudemem_full` | mnemex `map` + `search` | Per-instance: PageRank symbols + semantic search |
| `claudemem+generated` | mnemex + LLM-generated base | mnemex context layered on top of LLM-generated AGENTS.md |
| `claudemem+human_written` | mnemex + repo's CLAUDE.md | mnemex context layered on top of human-written file |

### References

- Patch: `patches/agentbench-mnemex-extensions.patch`
- Fork: `/Users/jack/mag/agentbench/`
- S3 index archive: `s3://mnemex-bench/archives/indexes-20260304-deepseek.tar.gz`

---

## 2026-03-04 — Run 1 Results

### What was done

Ran all 6 conditions in parallel (2 workers each, ports 18080-18085) on the HuggingFace train split of eth-sri/agentbench.

**Configuration:**
- Model: Claude Sonnet 4.5
- Dataset: eth-sri/agentbench (HuggingFace, train split)
- Repos: ansible/ansible, getzep/graphiti, huggingface/smolagents, huggingface/transformers, jlowin/fastmcp (5 of 12 indexed repos)
- Instances per condition: 46-48

### Results

Pass rates are corrected for infrastructure errors (instances with empty `pr_test_results.json` excluded from denominator):

| Condition | Total | Resolved | Real Fail | Infra Error | Raw Pass Rate | Corrected Pass Rate |
|-----------|-------|----------|-----------|-------------|---------------|---------------------|
| **claudemem_full** | **46** | **15** | **9** | **22** | **32.6%** | **62.5%** |
| human_written | 47 | 11 | 9 | 27 | 23.4% | 55.0% |
| claudemem+generated | 47 | 11 | 11 | 25 | 23.4% | 50.0% |
| claude_planner | 47 | 12 | 13 | 22 | 25.5% | 48.0% |
| no_plan | 48 | 10 | 11 | 27 | 20.8% | 47.6% |
| claudemem+human_written | 47 | 8 | 13 | 26 | 17.0% | 38.1% |

### Per-repo breakdown

Infrastructure errors dominated smolagents, transformers, and graphiti. Effective instances came almost entirely from ansible and fastmcp:

| Repo | Typical Infra Error Rate | Notes |
|------|--------------------------|-------|
| ansible/ansible | Low | Primary source of valid results |
| jlowin/fastmcp | Moderate | Secondary source of valid results |
| getzep/graphiti | ~100% | Near-total infra failure |
| huggingface/smolagents | ~100% | Near-total infra failure |
| huggingface/transformers | ~100% | Near-total infra failure |

### Instances uniquely solved by claudemem_full

`claudemem_full` resolved 15 instances. Comparing against `no_plan` (10 resolved):

- **Solved by both:** ansible-83217, ansible-84999, ansible-85187, ansible-85488, ansible-85516, ansible-85930, ansible-86047 (7 shared)
- **Solved only by claudemem_full:** ansible-85728, fastmcp-2674, fastmcp-2676, fastmcp-2720, fastmcp-2763, fastmcp-2768, fastmcp-2771, fastmcp-2776 (8 unique)
- **Solved only by no_plan:** ansible-85487, ansible-85709, fastmcp-2727 (3 unique)

The mnemex context unlocked 8 instances that the baseline could not solve, while losing only 3. The gains concentrated in fastmcp (6 of 8 unique solves), suggesting mnemex is especially valuable in repos where the agent benefits from architectural orientation.

### Key findings

**1. mnemex alone is the best context source (+14.9pp over baseline)**

`claudemem_full` at 62.5% is the only condition that breaks away from the ~48% baseline cluster. It resolved 15 instances vs 10 for no_plan, a 50% improvement in absolute solved issues.

**2. Adding CLAUDE.md on top of mnemex context hurts performance**

`claudemem+human_written` (38.1%) is the worst-performing condition, 9.5pp below baseline and 24.4pp below `claudemem_full`. The combination does not just fail to help; it actively interferes.

Hypothesis: the human-written context files in these repos are stale, generic, or misleading. When mnemex provides fresh, task-specific context, prepending a static CLAUDE.md dilutes the signal with noise.

**3. LLM-generated context barely beats no context**

`claude_planner` (48.0%) is only +0.4pp over `no_plan` (47.6%). The Dynamic Cheatsheet and ACE planners from the original paper were not run in this round, but the standard LLM planner shows minimal benefit.

**4. Combination conditions degrade mnemex performance**

Both `claudemem+generated` (50.0%) and `claudemem+human_written` (38.1%) performed worse than `claudemem_full` (62.5%). The additional context does not complement mnemex; it competes with it. The agent may allocate attention to the static context at the expense of the task-specific mnemex results.

### Bugs and failures

**Infrastructure error rate: 46-57% across all conditions.** The dominant failure mode was empty `pr_test_results.json` from the Docker evaluation containers. This is consistent across conditions, indicating it is infrastructure-level, not condition-dependent.

Three of five repos (smolagents, transformers, graphiti) had near-100% infrastructure errors, reducing the effective dataset to ansible and fastmcp instances. Root cause is likely Docker container setup issues for those repo environments (dependency installation, test harness compatibility).

### References

- Raw results: `results/run-1-summary.json`
- README: `README.md`

---

## 2026-03-04 — Statistical and Methodological Analysis

### Caveats

1. **Small effective sample sizes.** After removing infrastructure errors, each condition had only ~21-24 valid instances. The corrected pass rates have wide confidence intervals. For example, claudemem_full had 24 valid instances (15 resolved, 9 failed), giving a 95% Wilson CI of roughly [42%, 79%].

2. **Only 5 of 12 repos included.** The indexed archive covers 12 repos (ansible, graphiti, smolagents, transformers, fastmcp, openai-agents-python, opshin, pdm, pr-agent, tinygrad, ragas, wagtail), but only 5 were in the agentbench dataset's train split. Of those 5, only 2 (ansible, fastmcp) produced meaningful results.

3. **No statistical significance test run.** With these sample sizes, the ~15pp difference between `claudemem_full` and `no_plan` is suggestive but not conclusive. A Fisher exact test on the 2x2 table (15/9 vs 10/11) yields p=0.37 -- not significant. The Wilcoxon signed-rank test used in experiment 004/006 requires paired per-instance results, which are available but were not computed.

4. **Infrastructure error correction assumes MCAR.** The corrected pass rates divide resolved by (resolved + real_fail), assuming infrastructure errors are Missing Completely At Random. If harder instances are more likely to trigger infra errors, the corrected rates are biased upward.

5. **Single run, no replication.** Run 1 only. Variance across runs is unknown.

6. **Model ceiling effect risk.** Claude Sonnet 4.5 may be capable enough that context benefits are masked on easier instances (same concern as experiment 002's null result). The gains may be larger with a weaker model.

### Comparison with original paper

Gloaguen et al. tested `no_plan`, `human_written`, Dynamic Cheatsheet, and ACE on a larger instance set. Our results for the shared conditions (`no_plan` at 47.6%, `human_written` at 55.0%) are in the same ballpark as their findings, though direct comparison is limited by different instance sets and infrastructure error rates.

The key addition is that mnemex (`claudemem_full`) outperforms all static context approaches. This is consistent with experiment 006's finding that dynamic, task-specific retrieval beats static configuration.

### References

- Gloaguen et al. (2025), "Evaluating AGENTS.md": https://arxiv.org/abs/2602.11988
- Experiment 002 null result: `experiments/002-cognitive-memory-e2e/README.md`
- Experiment 006 ablation results: `experiments/006-code-search-test-harness/docs/journal.md`

---

## Next Steps

1. **Run 2 with all 12 repos.** Fix Docker evaluation for smolagents, transformers, and graphiti to increase effective sample size. Target: 100+ valid instances per condition.

2. **Statistical testing.** Run Wilcoxon signed-rank on per-instance paired results (paired by instance across conditions). Also run Fisher exact test on aggregate counts with Bonferroni correction for 15 pairwise comparisons.

3. **Ablate mnemex components.** Add `map_only` and `search_only` conditions to isolate whether PageRank symbols or semantic search contributes more. The `claudemem_planner.py` already supports variant selection.

4. **Try weaker base model.** Run with Haiku or a smaller Sonnet to test whether context benefits increase when the model is less capable. Experiment 002 showed Sonnet 4.5 was too capable for the cognitive memory eval to show benefit.

5. **Investigate combination penalty.** Analyze the traces for `claudemem+human_written` to understand why combining contexts hurts. Measure token counts in injected AGENTS.md to test the "attention dilution" hypothesis.

6. **Per-instance qualitative analysis.** Review the 8 instances uniquely solved by `claudemem_full` to understand what mnemex context provided that the baseline lacked. Check whether `map` or `search` results were more relevant.

---

## 2026-03-19 — Run 2 Planning: Rerun with Mnemex Improvements

### Context

Run 1 tested mnemex in "static context injection" mode: the `claudemem_planner.py` runs `map` + `search` before each instance and composes an AGENTS.md file. The agent never interacts with mnemex directly during the task.

Meanwhile, experiments 006 and 011 identified specific mnemex improvements that should make the context richer and the tool more effective:

| Improvement | Source | Status | Impact on 012 |
|-------------|--------|--------|---------------|
| Regex query router | 006: +21.8% MRR, 8/9 repos | Shipping in mnemex | Better search results in planner |
| `includeBody` on symbol tool | 011: 4x call reduction | Shipping in mnemex | Richer symbol context in AGENTS.md |
| Parallel search pipeline | 011: -51% on cross-file trace | Shipped | Faster planner execution |
| Route-aware expansion (E-RA) | 006: MRR 0.495 (best) | Available | Better retrieval for semantic queries |
| `readFile` + `searchForPattern` MCP tools | 011: eliminates thrashing | Planned | Enables live MCP condition |

### Run 2 design

#### Fix infrastructure first

Run 1 lost 46-57% of instances to Docker eval failures. Before adding conditions, fix the harness:

1. Debug Docker container setup for smolagents, transformers, graphiti (near-100% infra error in Run 1)
2. Target all 12 repos (ansible, graphiti, smolagents, transformers, fastmcp, openai-agents, opshin, pdm, pr-agent, tinygrad, ragas, wagtail)
3. Target 100+ valid instances per condition (vs ~21-24 in Run 1)

#### Conditions (8 total — 6 original + 2 new ablations)

| Condition | Context Source | Change from Run 1 |
|-----------|---------------|-------------------|
| `no_plan` | None | Same baseline |
| `human_written` | Repo's CLAUDE.md/AGENTS.md | Same |
| `claude_planner` | LLM-generated AGENTS.md | Same |
| `claudemem_full` | mnemex `map` + `search` → AGENTS.md | **Improved**: planner uses router + includeBody + parallel pipeline |
| `claudemem+generated` | mnemex + LLM base | Same structure, improved mnemex |
| `claudemem+human_written` | mnemex + repo's CLAUDE.md | Same structure, improved mnemex |
| **`map_only`** (NEW) | mnemex `map` only → AGENTS.md | Isolates PageRank symbol contribution |
| **`search_only`** (NEW) | mnemex `search` only → AGENTS.md | Isolates semantic search contribution |

The `map_only` and `search_only` conditions answer: is it the architecture overview (PageRank top symbols) or the task-specific semantic search that drives the +14.9pp improvement?

#### What changes in the mnemex planner

The `claudemem_planner.py` calls `claudemem map` and `claudemem search` on the host. With the mnemex improvements:

1. **Router**: `search` calls now route symbol-like queries to BM25-only, boosting precision for code identifiers in issue text
2. **`includeBody`**: `map` results now include function/class bodies, not just names + locations — the AGENTS.md will contain actual code snippets, giving the agent immediate context without needing to open files
3. **Parallel pipeline**: `search` runs symbol-graph, semantic, and location backends concurrently — planner runs faster
4. **Re-index with nomic-embed-text**: Run 1 used deepseek-v3.2 enrichment with voyage-3.5-lite embeddings. Run 2 can optionally re-index with local nomic-embed-text (experiment 006 showed the pipeline compensates for weaker embeddings, achieving MRR 0.495 vs voyage's 0.438 baseline)

#### Hypotheses

**H1**: `claudemem_full` with improvements will exceed 62.5% (Run 1 result), because richer symbol bodies and better search routing provide more actionable context.

**H2**: `map_only` will outperform `search_only`, because the PageRank architecture overview gives the agent a structural mental model of the codebase, which is more valuable than individual search hits for issue resolution.

**H3**: The combination penalty (`claudemem+human_written` at 38.1%) will persist, because the root cause is attention dilution from static content, not mnemex quality.

**H4**: With 100+ valid instances, the `claudemem_full` vs `no_plan` difference will reach statistical significance (p < 0.05 on Fisher exact test).

### Implementation checklist

- [ ] Fix Docker eval for smolagents, transformers, graphiti in agentbench fork
- [ ] Update `claudemem_planner.py` to use improved mnemex (`includeBody`, router)
- [ ] Add `map_only` and `search_only` variant configs to `plan_constants.py`
- [ ] Re-index all 12 repos with current mnemex (router + parallel pipeline)
- [ ] Upload new index archive to S3
- [ ] Run all 8 conditions with 2 workers each
- [ ] Compute Wilcoxon signed-rank on per-instance paired results
- [ ] Fisher exact test with Bonferroni correction (28 pairwise comparisons for 8 conditions)

### References

- Run 1 results: `results/run-1-summary.json`
- Planner code: `/Users/jack/mag/agentbench/src/agentbench/planners/claudemem_planner.py`
- Router evidence: `experiments/006-code-search-test-harness/docs/journal.md` (Mar 17 entry)
- includeBody evidence: `experiments/011-n-way-code-tool-benchmark/docs/journal.md` (Mar 16 entries)
- Synthesis: `experiments/SYNTHESIS.md`
