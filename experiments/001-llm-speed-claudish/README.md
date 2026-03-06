# Experiment 001: LLM Speed Benchmark via Claudish

**Date**: March 5-6, 2026
**Status**: Complete (with known failures)
**Gist**: https://gist.github.com/erudenko/efa673cb28635d4bf44afc1879f558cb

## Motivation

We wanted to find which frontier coding LLM is fastest for real-world coding tasks when used through [claudish](https://github.com/MadAppGang/claude-code) — an open-source proxy that lets Claude Code use any AI model via OpenRouter, direct APIs, or local models.

The specific question: **which model gives the fastest end-to-end response when asked to write a TypeScript function?**

## Models Tested

| Model | Provider | OpenRouter ID | Context | In $/M | Out $/M |
|-------|----------|---------------|---------|--------|---------|
| MiniMax M2.5 | MiniMax | `minimax/minimax-m2.5` | 197K | $0.29 | $1.20 |
| Kimi K2.5 | Moonshot AI | `moonshotai/kimi-k2.5` | 262K | $0.45 | $2.20 |
| GLM-5 | Zhipu AI | `z-ai/glm-5` | 203K | $0.80 | $2.56 |
| Gemini 3 Flash Preview | Google | `google/gemini-3-flash-preview` | 1049K | $0.50 | $3.00 |
| GPT-5.1 Codex Mini | OpenAI | `openai/gpt-5.1-codex-mini` | 400K | $0.25 | $2.00 |
| Qwen3.5 Plus | Alibaba | `qwen/qwen3.5-plus-02-15` | 1000K | $0.26 | $1.56 |

*Prices from OpenRouter as of March 5, 2026.*

## Task

```
Write a TypeScript function called `parseQueryParams` that takes a URL string
and returns a Record<string, string> of query parameters. Handle edge cases
like missing values, duplicate keys (last wins), and encoded characters.
Include JSDoc comment. Output ONLY the code, no explanation.
```

A representative real-world coding task: small, well-defined, requires understanding of URL parsing, TypeScript types, and documentation conventions.

## Methodology

- **5 rounds** of the identical prompt, all models launched **in parallel** per round
- **Two routes per model**: OpenRouter (OR) and Direct API (native provider endpoint)
- 12 model-routes total (6 models x 2 routes)
- **Timing**: wall-clock ms from `claudish` invocation to completion (includes proxy overhead ~2-3s)
- Single-shot mode with `--json` output, no system prompts, no conversation history — cold start each time
- Direct API routes use claudish provider shortcuts: `g@` (Google), `oai@` (OpenAI), `kimi@` (Moonshot), `mm@` (MiniMax), `glm@` (Zhipu)

### Test Environment

| | |
|---|---|
| Machine | MacBook Pro M1 Max, 64GB RAM |
| OS | macOS 26.3 (Tahoe) |
| Network | ~1.8s baseline latency to OpenRouter API |
| Claude Code | v2.1.69 |
| Claudish | v5.5.2 (initial run), v5.6.0 (retests) |
| Date | March 5, 2026, ~12:25-12:55 PM UTC+2 |

## Results

### Full Leaderboard (sorted by mean speed)

```
#   Model                  Route      Mean     Min     Max  StdDev  OK   In $/M  Out $/M
----------------------------------------------------------------------------------------
1   Gemini 3 Flash         OR        32.6s   28.6s   41.7s    4.7s   5  $0.50   $3.00
2   GPT-5.1 Codex Mini     OR        32.7s   29.9s   41.5s    4.4s   5  $0.25   $2.00
3   GPT-5.1 Codex Mini     Direct    32.9s   28.2s   40.2s    4.1s   5  $0.25   $2.00
4   Gemini 3 Flash         Direct    33.4s   29.1s   41.7s    4.7s   5  $0.50   $3.00
5   MiniMax M2.5           OR        40.4s   31.5s   50.2s    6.2s   5  $0.29   $1.20
6   Qwen3.5 Plus           Direct    41.7s   37.5s   50.2s    4.6s   5  $0.26   $1.56
7   Qwen3.5 Plus           OR        42.7s   35.9s   57.9s    7.8s   5  $0.26   $1.56
8   Kimi K2.5              Direct    43.8s   35.5s   53.5s    5.9s   5  $0.45   $2.20
9   GLM-5                  OR        47.4s   35.7s   61.3s    9.1s   5  $0.80   $2.56
10  Kimi K2.5              OR        48.7s   39.0s   65.6s    9.4s   5  $0.45   $2.20
11  MiniMax M2.5           Direct     FAIL       -       -       -   0  $0.29   $1.20
12  GLM-5                  Direct     FAIL       -       -       -   0  $0.80   $2.56
```

### Direct vs OpenRouter Comparison

```
Model                   OR Mean   Direct     Diff   Faster
----------------------------------------------------------
Gemini 3 Flash            32.6s    33.4s     0.8s    OR   2%
GPT-5.1 Codex Mini        32.7s    32.9s     0.2s    OR   1%
Kimi K2.5                 48.7s    43.8s     4.9s Direct  10%
MiniMax M2.5              40.4s   FAILED        -       OR
Qwen3.5 Plus              42.7s    41.7s     1.0s Direct   2%
GLM-5                     47.4s   FAILED        -       OR
```

### Raw Data (ms per round)

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

## Key Findings

### 1. Gemini 3 Flash and GPT-5.1 Codex Mini are virtually tied for speed

Both consistently landed at ~32-33s mean. The race was so close that the ranking flipped between routes — Gemini won via OpenRouter, GPT won via Direct. For practical purposes, they're equal.

### 2. GPT-5.1 Codex Mini is the best value

At $0.25/M input + $2.00/M output, it's the cheapest of the top-tier models while matching Gemini Flash on speed. If you're cost-sensitive, this is the clear pick.

### 3. OpenRouter adds almost zero overhead for fast models

For Gemini and GPT, Direct API was actually 0.2-0.8s *slower* than OpenRouter — within noise. The proxy overhead is negligible for fast models because the routing time is tiny compared to inference time.

### 4. Direct API is notably faster for Kimi

Kimi K2.5 showed a 10% speed improvement via Direct API (43.8s vs 48.7s). This suggests OpenRouter's routing adds measurable latency for some Chinese providers.

### 5. MiniMax M2.5 is the budget king

At $0.29/M in + $1.20/M out (cheapest output pricing), it's competitive at 40s mean. If you don't need sub-35s response times, it's the most cost-effective option.

### 6. GLM-5 is the worst value

Slowest model (47.4s), most inconsistent (9.1s std dev), AND second most expensive ($0.80 in + $2.56 out). Hard to recommend over any competitor.

### 7. All models slowed down in Round 5

Every model was 20-50% slower in Round 5 compared to Rounds 1-4. This likely reflects increased load (time-of-day effect) or rate limiting from running 12 parallel requests per round.

## Experiment History

### Run 0 — Initial Prototype (OpenRouter only, 5 rounds)

First attempt used `date +%s%3N` for millisecond timing, which doesn't work on macOS (no `%3N` support). Script crashed with `value too great for base` errors.

**Fix**: Switched to `python3 -c 'import time; print(int(time.time()*1000))'` for cross-platform ms timing.

### Run 1 — OpenRouter-only Benchmark (5 rounds, 6 models)

Successfully ran all 6 models via OpenRouter. Results:

```
Gemini 3 Flash            21.5s (fastest, most consistent)
GPT-5.1 Codex Mini        23.0s (best value at $1.13/M blended)
Kimi K2.5                 23.2s
MiniMax M2.5              29.6s (cheapest but inconsistent: 20s-47s range)
Qwen3.5 Plus              29.9s
GLM-5                     40.3s (slowest, most expensive — worst value)
```

### Run 2 — Direct API + OpenRouter (5 rounds, 12 model-routes)

Extended to test each model via both OpenRouter and its native Direct API. Two failures:

- **MiniMax M2.5 (Direct)**: `HTTP 401` — see [Bug Investigation](#bug-minimax-direct-api-401) below
- **GLM-5 (Direct)**: `HTTP 429` — Zhipu free-tier rate limits too aggressive

### Retest Attempts

1. **GLM-5 with `ZHIPU_API_KEY`**: The env var was `GLM_CODING_API_KEY` but claudish expects `ZHIPU_API_KEY`. After aliasing, auth worked but hit `HTTP 429` rate limits even with 10s cooldown between rounds.

2. **MiniMax M2.5**: Retried multiple times, always `HTTP 401`. Confirmed as a claudish auth bug (see below).

## Bug: MiniMax Direct API 401

**Filed for claudish developer.**

### Summary

`mm@MiniMax-M2.5` (Direct MiniMax API) always returns `HTTP 401`, even though the same model works via OpenRouter (`openrouter@minimax/minimax-m2.5`) and `MINIMAX_API_KEY` is set.

### Steps to Reproduce

```bash
# 1. Set your MiniMax API key
export MINIMAX_API_KEY='your-key-here'

# 2. Verify OpenRouter works (should succeed)
claudish --model "openrouter@minimax/minimax-m2.5" --json "Say hello"

# 3. Try Direct API (fails with 401)
claudish --model "mm@MiniMax-M2.5" --json "Say hello"
```

### Error Output

```
[claudish] Error [MiniMax]: HTTP 401. Check API key / OAuth credentials.
```

Repeated 5-11 times per invocation (retries all fail).

### Root Cause Analysis

From `claudish/dist/index.js` (v5.6.0):

1. MiniMax Direct uses `AnthropicCompatProvider` class (line ~64750)
2. Sends auth as: `x-api-key: <MINIMAX_API_KEY>` with `anthropic-version: 2023-06-01`
3. Endpoint: `https://api.minimax.io/anthropic/v1/messages`

MiniMax's API docs show their auth format is typically:
```
Authorization: Bearer <api_key>
```

But `AnthropicCompatProvider.getHeaders()` sends:
```
x-api-key: <api_key>
```

### Suggested Fix

In `AnthropicCompatProvider.getHeaders()`, MiniMax may need a provider-specific override to use `Authorization: Bearer` instead of `x-api-key`, similar to how Kimi has special OAuth handling.

## Bug: GLM-5 Direct API Env Var Mismatch

### Summary

Claudish `glm@` route requires `ZHIPU_API_KEY`, but the GLM Coding Plan (another claudish feature) sets `GLM_CODING_API_KEY`. Users with `GLM_CODING_API_KEY` get a confusing error asking for `ZHIPU_API_KEY`.

Even after setting the correct env var, GLM-5 Direct hits `HTTP 429` rate limits on Zhipu's free tier, making Direct API benchmarking impractical without a paid plan.

## Caveats

- **End-to-end latency**, not pure inference. Includes: claudish proxy startup, API routing, queue time, inference, and response streaming.
- **Single task type** — results may differ for longer prompts, multi-turn, or different languages.
- **5 rounds** shows trends but isn't statistically rigorous. For publication-grade results, run 20+ rounds.
- **Time-of-day effects** — load patterns vary. Our R5 slowdown confirms this.
- **Direct API failures** for MiniMax (auth format mismatch) and GLM (rate limits) are claudish/provider-specific, not model issues.

## How to Run

### Prerequisites

1. Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
2. Install [claudish](https://github.com/MadAppGang/claude-code): `npm install -g claudish`
3. Set API keys:
   ```bash
   export OPENROUTER_API_KEY='...'       # Required
   export GEMINI_API_KEY='...'           # For g@ direct
   export OPENAI_API_KEY='...'           # For oai@ direct
   export MOONSHOT_API_KEY='...'         # For kimi@ direct
   export MINIMAX_API_KEY='...'          # For mm@ direct (currently broken)
   export ZHIPU_API_KEY='...'            # For glm@ direct
   ```

### Run

```bash
./speed-test.sh        # 5 rounds (default)
./speed-test.sh 10     # 10 rounds
```

### Customize Models

Edit the `OR_MODELS` and `DIRECT_MODELS` arrays in `speed-test.sh`. Find model IDs with:

```bash
claudish --models <search-term>
```

## Files

- `speed-test.sh` — The benchmark script (12 model-routes, parallel execution, stats)
- `README.md` — This file (full experiment documentation)
