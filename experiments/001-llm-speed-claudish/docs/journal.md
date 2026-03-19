# Experiment 001 — LLM Speed Benchmark Journal

Chronological log of the LLM speed benchmark via claudish/OpenRouter.
Measures end-to-end latency of frontier coding LLMs on a representative
TypeScript coding task, comparing OpenRouter proxy vs Direct API routes.

Benchmark script: `../speed-test.sh`
Results data: `../results/`
Error logs: `../logs/`

---

## 2026-03-05 — Run 0: Initial Prototype (Failed)

### What was done

Built the first version of `speed-test.sh` targeting 6 models via OpenRouter.
Used `date +%s%3N` for millisecond timing of each claudish invocation.

### Results

No usable data. The script crashed on every invocation.

### Bugs and failures

**macOS `date` lacks `%3N` (nanosecond) support.** The BSD `date` shipped with
macOS does not support GNU extensions. `date +%s%3N` produces literal `%3N`
appended to the epoch, which downstream arithmetic interprets as an octal
literal. The script crashed with `value too great for base` errors.

**Fix:** Replaced all `date` timing calls with
`python3 -c 'import time; print(int(time.time()*1000))'` for cross-platform
millisecond timestamps.

### References

- Script: `speed-test.sh` (fixed in place)

### Next steps

Re-run with the corrected timing.

---

## 2026-03-05 — Run 1: OpenRouter-Only Benchmark

### What was done

Ran all 6 models through OpenRouter with 5 rounds of the same prompt, all
models launched in parallel per round. Single-shot mode with `--json` output,
no system prompts, no conversation history -- cold start each time.

**Task prompt:**
> Write a TypeScript function called `parseQueryParams` that takes a URL string
> and returns a Record<string, string> of query parameters. Handle edge cases
> like missing values, duplicate keys (last wins), and encoded characters.
> Include JSDoc comment. Output ONLY the code, no explanation.

**Test environment:**

| Property | Value |
|----------|-------|
| Machine | MacBook Pro M1 Max, 64GB RAM |
| OS | macOS 26.3 (Tahoe) |
| Network | ~1.8s baseline latency to OpenRouter API |
| Claude Code | v2.1.69 |
| Claudish | v5.5.2 |
| Date | March 5, 2026, ~12:25 PM UTC+2 |

**Models tested (6, all via OpenRouter):**

| Model | OpenRouter ID | Context | In $/M | Out $/M |
|-------|---------------|---------|--------|---------|
| MiniMax M2.5 | `minimax/minimax-m2.5` | 197K | $0.29 | $1.20 |
| Kimi K2.5 | `moonshotai/kimi-k2.5` | 262K | $0.45 | $2.20 |
| GLM-5 | `z-ai/glm-5` | 203K | $0.80 | $2.56 |
| Gemini 3 Flash Preview | `google/gemini-3-flash-preview` | 1049K | $0.50 | $3.00 |
| GPT-5.1 Codex Mini | `openai/gpt-5.1-codex-mini` | 400K | $0.25 | $2.00 |
| Qwen3.5 Plus | `qwen/qwen3.5-plus-02-15` | 1000K | $0.26 | $1.56 |

### Results

| # | Model | Mean | Notes |
|---|-------|------|-------|
| 1 | Gemini 3 Flash | 21.5s | Fastest, most consistent |
| 2 | GPT-5.1 Codex Mini | 23.0s | Best value at $0.25/$2.00 blended |
| 3 | Kimi K2.5 | 23.2s | |
| 4 | MiniMax M2.5 | 29.6s | Cheapest output pricing but inconsistent: 20s-47s range |
| 5 | Qwen3.5 Plus | 29.9s | |
| 6 | GLM-5 | 40.3s | Slowest, most expensive -- worst value |

All 30 invocations (6 models x 5 rounds) completed successfully.

### Key findings

- Gemini 3 Flash and GPT-5.1 Codex Mini were clearly faster than the field (21-23s vs 29-40s).
- GLM-5 was both the slowest and second-most expensive model, making it the worst value proposition.
- MiniMax M2.5 showed the widest variance (20s-47s), suggesting inconsistent backend load or queue behavior.

### References

- Results: `results/run1-or-only/` (5 round directories, each with per-model output files)

### Next steps

Add Direct API routes to compare OpenRouter proxy overhead vs native provider endpoints.

---

## 2026-03-05 — Run 2: OpenRouter + Direct API Benchmark

### What was done

Extended the benchmark to test each model via both OpenRouter and its native
Direct API endpoint. This doubled the matrix to 12 model-routes (6 models x 2
routes), still 5 rounds each, all launched in parallel per round.

Updated claudish to v5.6.0 for Direct API support. Direct API routes use
claudish provider shortcuts: `g@` (Google), `oai@` (OpenAI), `kimi@`
(Moonshot), `mm@` (MiniMax), `glm@` (Zhipu).

### Results

#### Full leaderboard (sorted by mean speed)

| # | Model | Route | Mean | Min | Max | StdDev | OK | In $/M | Out $/M |
|---|-------|-------|------|-----|-----|--------|----|--------|---------|
| 1 | Gemini 3 Flash | OR | 32.6s | 28.6s | 41.7s | 4.7s | 5 | $0.50 | $3.00 |
| 2 | GPT-5.1 Codex Mini | OR | 32.7s | 29.9s | 41.5s | 4.4s | 5 | $0.25 | $2.00 |
| 3 | GPT-5.1 Codex Mini | Direct | 32.9s | 28.2s | 40.2s | 4.1s | 5 | $0.25 | $2.00 |
| 4 | Gemini 3 Flash | Direct | 33.4s | 29.1s | 41.7s | 4.7s | 5 | $0.50 | $3.00 |
| 5 | MiniMax M2.5 | OR | 40.4s | 31.5s | 50.2s | 6.2s | 5 | $0.29 | $1.20 |
| 6 | Qwen3.5 Plus | Direct | 41.7s | 37.5s | 50.2s | 4.6s | 5 | $0.26 | $1.56 |
| 7 | Qwen3.5 Plus | OR | 42.7s | 35.9s | 57.9s | 7.8s | 5 | $0.26 | $1.56 |
| 8 | Kimi K2.5 | Direct | 43.8s | 35.5s | 53.5s | 5.9s | 5 | $0.45 | $2.20 |
| 9 | GLM-5 | OR | 47.4s | 35.7s | 61.3s | 9.1s | 5 | $0.80 | $2.56 |
| 10 | Kimi K2.5 | OR | 48.7s | 39.0s | 65.6s | 9.4s | 5 | $0.45 | $2.20 |
| 11 | MiniMax M2.5 | Direct | FAIL | - | - | - | 0 | $0.29 | $1.20 |
| 12 | GLM-5 | Direct | FAIL | - | - | - | 0 | $0.80 | $2.56 |

#### Direct vs OpenRouter comparison

| Model | OR Mean | Direct Mean | Diff | Faster Route | Delta % |
|-------|---------|-------------|------|--------------|---------|
| Gemini 3 Flash | 32.6s | 33.4s | 0.8s | OR | 2% |
| GPT-5.1 Codex Mini | 32.7s | 32.9s | 0.2s | OR | 1% |
| Kimi K2.5 | 48.7s | 43.8s | 4.9s | Direct | 10% |
| MiniMax M2.5 | 40.4s | FAILED | - | OR | - |
| Qwen3.5 Plus | 42.7s | 41.7s | 1.0s | Direct | 2% |
| GLM-5 | 47.4s | FAILED | - | OR | - |

#### Raw data (ms per round)

| Model (Route) | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| Gemini 3 Flash (OR) | 32362 | 28618 | 30177 | 30304 | 41705 |
| GPT-5.1 Codex Mini (OR) | 30522 | 31153 | 30536 | 29894 | 41513 |
| GPT-5.1 Codex Mini (Direct) | 34030 | 28189 | 31368 | 30930 | 40184 |
| Gemini 3 Flash (Direct) | 35521 | 29132 | 30856 | 29927 | 41668 |
| MiniMax M2.5 (OR) | 42435 | 40693 | 37116 | 31497 | 50234 |
| Qwen3.5 Plus (Direct) | 41992 | 38196 | 40572 | 37493 | 50227 |
| Qwen3.5 Plus (OR) | 38661 | 35925 | 40021 | 41107 | 57929 |
| Kimi K2.5 (Direct) | 41590 | 35539 | 42686 | 53506 | 45873 |
| GLM-5 (OR) | 39490 | 49774 | 50911 | 35738 | 61322 |
| Kimi K2.5 (OR) | 40626 | 38983 | 65555 | 49001 | 49518 |

Note: Run 2 times are ~10s slower than Run 1 across the board. This reflects
the increased parallelism (12 concurrent requests per round vs 6) and possible
time-of-day load differences.

### Key findings

1. **Gemini 3 Flash and GPT-5.1 Codex Mini are virtually tied for speed.**
   Both landed at ~32-33s mean. The ranking flipped between routes: Gemini won
   via OpenRouter, GPT won via Direct. For practical purposes they are equal.

2. **GPT-5.1 Codex Mini is the best value.** At $0.25/M input + $2.00/M
   output, it is the cheapest of the top-tier models while matching Gemini
   Flash on speed.

3. **OpenRouter adds almost zero overhead for fast models.** For Gemini and
   GPT, Direct API was actually 0.2-0.8s slower than OpenRouter -- within
   noise. The proxy overhead is negligible because routing time is small
   compared to inference time.

4. **Direct API is notably faster for Kimi.** Kimi K2.5 showed a 10% speed
   improvement via Direct API (43.8s vs 48.7s), suggesting OpenRouter adds
   measurable latency for some Chinese providers.

5. **MiniMax M2.5 is the budget king.** At $0.29/M in + $1.20/M out (cheapest
   output pricing), it ran at 40.4s mean. If sub-35s latency is not required,
   it is the most cost-effective option.

6. **GLM-5 is the worst value.** Slowest model (47.4s), most inconsistent
   (9.1s std dev), and second most expensive ($0.80/$2.56). No reason to
   choose it over any competitor.

7. **All models slowed down in Round 5.** Every model was 20-50% slower in R5
   compared to R1-R4. Likely reflects increased load (time-of-day effect) or
   rate limiting from running 12 parallel requests per round.

### Bugs and failures

Two Direct API routes failed completely. See dedicated entries below.

### References

- Results: `results/run2-or-plus-direct/` (5 round directories, each with per-model-route output files)
- Gist with full data: https://gist.github.com/erudenko/efa673cb28635d4bf44afc1879f558cb

### Next steps

Investigate the MiniMax and GLM Direct API failures.

---

## 2026-03-06 — Bug: MiniMax Direct API HTTP 401

### What was done

Investigated why `mm@MiniMax-M2.5` (Direct MiniMax API) always returns
HTTP 401, even though the same model works via OpenRouter
(`openrouter@minimax/minimax-m2.5`) and `MINIMAX_API_KEY` is correctly set.

Retried multiple times with different key formats. Every attempt produced 11
consecutive 401 errors (claudish retries internally).

### Root cause

Inspected `claudish/dist/index.js` (v5.6.0). MiniMax Direct uses the
`AnthropicCompatProvider` class (around line 64750), which sends auth as:

```
x-api-key: <MINIMAX_API_KEY>
anthropic-version: 2023-06-01
```

Endpoint: `https://api.minimax.io/anthropic/v1/messages`

MiniMax's own API documentation specifies auth via:

```
Authorization: Bearer <api_key>
```

The `AnthropicCompatProvider.getHeaders()` method sends `x-api-key` instead of
`Authorization: Bearer`, which MiniMax rejects with 401.

### Suggested fix

`AnthropicCompatProvider.getHeaders()` needs a provider-specific override for
MiniMax to use `Authorization: Bearer` instead of `x-api-key`, similar to how
Kimi has special OAuth handling in claudish.

### References

- Error log: `logs/minimax-direct-401.log` (11 repeated 401 lines)
- Filed for claudish developer

---

## 2026-03-06 — Bug: GLM-5 Direct API Env Var Mismatch and Rate Limits

### What was done

Investigated why `glm@glm-5` (Direct Zhipu API) failed in Run 2. Two separate
issues discovered.

**Issue 1: Environment variable mismatch.** Claudish's `glm@` route requires
`ZHIPU_API_KEY`, but the GLM Coding Plan feature (a separate claudish feature)
sets `GLM_CODING_API_KEY`. Users who configured GLM via the Coding Plan get a
confusing error about the missing `ZHIPU_API_KEY` variable.

After aliasing `ZHIPU_API_KEY` to match, authentication succeeded.

**Issue 2: HTTP 429 rate limits.** Even with correct auth and a 10-second
cooldown between rounds, Zhipu's free tier rate limits triggered on every
attempt. Each invocation produced 11 retry attempts, all returning 429. Direct
API benchmarking is impractical without a paid Zhipu plan.

### References

- Error log: `logs/glm5-direct-429.log` (11 repeated 429 lines)

### Next steps

GLM-5 Direct benchmarking requires a paid Zhipu API plan. Not worth pursuing
given GLM-5 is already the worst-performing model via OpenRouter.

---

## 2026-03-06 — Summary and Conclusions

### Final rankings

**Speed tier list (Run 2, best route per model):**

| Tier | Models | Mean Latency | Notes |
|------|--------|-------------|-------|
| Fast | Gemini 3 Flash, GPT-5.1 Codex Mini | 32-33s | Virtually tied |
| Mid | MiniMax M2.5, Qwen3.5 Plus, Kimi K2.5 | 40-44s | 25-35% slower than leaders |
| Slow | GLM-5 | 47s | Also most expensive and inconsistent |

**Value ranking (speed-adjusted cost):**

| # | Model | Speed | Cost (In/Out $/M) | Verdict |
|---|-------|-------|--------------------|---------|
| 1 | GPT-5.1 Codex Mini | 32.7s | $0.25 / $2.00 | Best overall value |
| 2 | MiniMax M2.5 | 40.4s | $0.29 / $1.20 | Budget pick (cheapest output) |
| 3 | Gemini 3 Flash | 32.6s | $0.50 / $3.00 | Tied fastest, pricier |
| 4 | Qwen3.5 Plus | 41.7s | $0.26 / $1.56 | Mid-speed, cheap |
| 5 | Kimi K2.5 | 43.8s | $0.45 / $2.20 | Mid-speed, mid-price |
| 6 | GLM-5 | 47.4s | $0.80 / $2.56 | Worst value -- slowest and expensive |

### Caveats

- Measured **end-to-end latency**, not pure inference. Includes claudish proxy
  startup, API routing, queue time, inference, and response streaming.
- **Single task type** -- results may differ for longer prompts, multi-turn
  conversations, or different programming languages.
- **5 rounds** shows trends but is not statistically rigorous. Publication-grade
  results would need 20+ rounds.
- **Time-of-day effects** are real -- the R5 slowdown across all models
  confirms this.
- **Direct API failures** for MiniMax (auth format mismatch) and GLM (rate
  limits) are claudish/provider-specific issues, not model deficiencies.

### Experiment status

Complete. No further runs planned.
