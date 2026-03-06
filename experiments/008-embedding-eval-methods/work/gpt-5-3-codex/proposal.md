`★ Coaching ────────────────────────────────────`
*Session 93978737...*

1. You read 6 files before delegating to an agent (pre-digestion anti-pattern).
  For investigation tasks, give agents the raw problem -- they investigate independently.
  Pre-digested context reduces multi-model diversity. See: MEMORY.md 'Raw Task vs Pre-Digested Context'

`─────────────────────────────────────────────────`

Excellent brief. Here’s a concrete redesign for an **embedding-first evaluation system** tailored to claudemem.

## 1) Metrics: what to measure and why

Use a **two-layer metric stack**:

### Core retrieval quality (primary)
- **NDCG@10** (primary headline): robust rank-sensitive metric, standard in CoIR/MTEB.
- **MRR** (co-headline): best for single “gold target” tasks.
- **Recall@{1,5,10,20}**: practical “can user find it quickly?” view.
- **Success@K** (binary hit@K): keep for continuity with existing P@K.

### Secondary diagnostics
- **MAP@10** only if you have multiple relevant chunks per query (otherwise little added value).
- **First Relevant Rank distribution** (p50/p90 rank): catches tail regressions.
- **Per-query-type breakdown** (API lookup, bug symptom, behavior, integration, vague).
- **Per-language / per-repo metrics** with macro average.

### Suggested K
- `K = [1, 5, 10, 20]`
  - 1/5 = interactive UX
  - 10 = benchmark comparability
  - 20 = debugging long-tail retrieval failures

---

## 2) Query design: realistic + controlled

Build a **mixed query set** (don’t rely on one source):

- **40% human-authored** (gold): from real dev workflows (issues, commit messages, “find where X happens” logs, prior agent prompts).
- **40% LLM-generated** with strict templates and diversity constraints.
- **20% adversarial/hard**: wrong terminology, ambiguous synonyms, near-miss intent.

For each query store metadata:
- `intent_type`, `specificity`, `terminology_match` (exact vs paraphrase), `difficulty`, `language_scope`.

Create a **frozen benchmark split**:
- `dev` (for prompt/weight tuning),
- `test` (never touched except final eval).

---

## 3) Hard negatives: formal difficulty tiers

For each query-target pair, build negatives by tier:

- **Tier A (easy):** random same-language cross-file.
- **Tier B (medium):** same module/package.
- **Tier C (hard):** same-file / sibling symbol.
- **Tier D (very hard):** semantic near-miss (same verbs/types, different behavior), e.g. `getUserById` vs `getUserByEmail`.

Then report:
- overall metrics
- **metrics by negative tier** (this is usually the real discriminator).

Implementation note: keep both **full-corpus retrieval** and **contrastive subset retrieval**; they answer different questions.

---

## 4) Cross-codebase testing: minimum viable rigor

Use at least **6 repos** (not 3) for stable comparisons:
- 2 TS/JS
- 1 Python
- 1 Go
- 1 Rust or Java
- 1 “large mixed” repo

From your 12-repo agentbench pool, define:
- **core-6** fast suite (CI/nightly),
- **full-12** weekly suite.

Aggregation:
- **macro-average across repos** (prevents one giant repo dominating).
- also report **micro-average** for volume-weighted perspective.
- compute **model × repo interaction matrix** to detect specialization bias.

---

## 5) Hybrid search evaluation

Yes—test both:
1. **Embedding-only**
2. **BM25-only**
3. **Hybrid (BM25 + vector)** with tunable alpha
4. Optional: **hybrid + reranker**

Evaluate each embedding model under all retrieval modes because “best vector model” is not always “best hybrid outcome.”

Add a **calibration sweep**:
- alpha in `[0.2, 0.4, 0.6, 0.8]`
- pick alpha on dev split, lock on test.

---

## 6) Practical metrics: quality vs ops

Track operational metrics per model/config:

- **Index-time throughput** (chunks/sec)
- **Query latency** p50/p95/p99
- **Peak RAM/VRAM**
- **Index size** (GB)
- **Cost** ($/1k queries, $/M chunks indexed)

Then compute a transparent scorecard:
- `QualityScore` (70%)
- `LatencyScore` (10%)
- `CostScore` (10%)
- `FootprintScore` (10%)

Keep raw metrics visible; composite is for ranking convenience only.

---

## 7) Quantization + MRL testing

Test a **factorial matrix** for top candidates:

- Precision: `fp16`, `int8`, `int4` (where available)
- Dimensions: full, 1024, 512, 256 (MRL/truncation)

Report:
- quality deltas vs model full-precision baseline
- storage reduction %
- speedup %
- **Pareto frontier** (quality vs latency vs size)

This yields deployable recommendations like:
- “512-d int8 gives -1.8% NDCG@10 for -72% storage, +35% throughput.”

---

## 8) Statistical rigor

Use paired statistics, not unpaired:

- **Bootstrap CIs** (10k resamples) for NDCG@10, MRR, Recall@K.
- **Paired randomization test** or **Wilcoxon signed-rank** per-query deltas.
- Multiple-comparison correction (Holm-Bonferroni) for many models.
- Report:
  - point estimate
  - 95% CI
  - p-value
  - effect size (Cliff’s delta / median delta rank)

Require significance + practical threshold:
- e.g. “winner must beat baseline by ≥1.0 NDCG point and p<0.05”.

---

## 9) CLI design (core vs optional)

Proposed command family:

- `claudemem embed-eval run`
- `claudemem embed-eval report`
- `claudemem embed-eval compare`
- `claudemem embed-eval list-runs`

Core flags:
- `--models <list>`
- `--repos <preset|paths>` (`core-6`, `full-12`)
- `--modes embedding,bm25,hybrid`
- `--k 1,5,10,20`
- `--output <dir>`
- `--seed <n>`
- `--split dev|test|both`

Optional advanced:
- `--quant fp16,int8,int4`
- `--dims 256,512,1024,full`
- `--alpha-sweep 0.2,0.4,0.6,0.8`
- `--bootstrap 10000`
- `--significance wilcoxon`
- `--max-queries-per-repo`
- `--query-source human,llm,mixed`
- `--hard-negative-policy tiered|full-corpus|both`

Outputs:
- machine-readable JSON/SQLite
- markdown leaderboard
- per-repo heatmaps
- pareto plot data

---

## Concrete rollout plan (short)

1. **V3 schema**: add repo_id, query metadata, negative tier, retrieval mode, quant config.
2. **Dataset builder**: mixed queries + frozen dev/test split.
3. **Evaluator refactor**: plug-in metric engine + paired stats module.
4. **Hybrid runner**: BM25/vector score fusion sweep.
5. **Ops profiler**: standardized latency/cost/footprint collection.
6. **CLI + reports**: comparison and regression gating for CI.

This gives you a benchmark that is both **research-valid** and **deployment-actionable**.

```vote
VERDICT: APPROVE
CONFIDENCE: 9
SUMMARY: A multi-repo, mixed-query, statistically rigorous evaluation framework with hybrid retrieval, hard-negative tiers, and quantization/MRL Pareto analysis.
KEY_ISSUES: Higher implementation complexity and benchmark runtime; requires disciplined split freezing and metadata hygiene to avoid leakage.
```
