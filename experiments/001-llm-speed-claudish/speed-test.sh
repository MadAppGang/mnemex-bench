#!/bin/bash
# ============================================================================
# LLM Speed Benchmark via claudish (Claude Code + OpenRouter / Direct APIs)
# ============================================================================
# Runs the same coding task on multiple models in parallel, repeats N rounds,
# and reports mean/min/max times with pricing (input & output separately).
#
# Tests each model via TWO routes:
#   1. OpenRouter (consistent proxy)
#   2. Direct API (native provider endpoint)
#
# Prerequisites:
#   - Claude Code: https://docs.anthropic.com/en/docs/claude-code
#   - claudish:    npm install -g claudish (https://github.com/MadAppGang/claude-code)
#   - API keys:    OPENROUTER_API_KEY (required)
#                  GEMINI_API_KEY, OPENAI_API_KEY, MINIMAX_API_KEY,
#                  MOONSHOT_API_KEY, ZHIPU_API_KEY (optional, for direct tests)
#
# Usage:
#   ./speed-test.sh        # 5 rounds (default)
#   ./speed-test.sh 3      # 3 rounds
# ============================================================================

set -euo pipefail

ROUNDS=${1:-5}

TASK='Write a TypeScript function called `parseQueryParams` that takes a URL string and returns a Record<string, string> of query parameters. Handle edge cases like missing values, duplicate keys (last wins), and encoded characters. Include JSDoc comment. Output ONLY the code, no explanation.'

OUTDIR="/tmp/speed-test-$(date +%s)"
mkdir -p "$OUTDIR"

# --- Models config: model_id | label | route | $/M input | $/M output ---
# OpenRouter routes
OR_MODELS=(
  "openrouter@minimax/minimax-m2.5|MiniMax M2.5|OR|0.29|1.20"
  "openrouter@moonshotai/kimi-k2.5|Kimi K2.5|OR|0.45|2.20"
  "openrouter@z-ai/glm-5|GLM-5|OR|0.80|2.56"
  "openrouter@google/gemini-3-flash-preview|Gemini 3 Flash|OR|0.50|3.00"
  "openrouter@openai/gpt-5.1-codex-mini|GPT-5.1 Codex Mini|OR|0.25|2.00"
  "openrouter@qwen/qwen3.5-plus-02-15|Qwen3.5 Plus|OR|0.26|1.56"
)

# Direct API routes (same models, native endpoints)
DIRECT_MODELS=(
  "mm@MiniMax-M2.5|MiniMax M2.5|Direct|0.29|1.20"
  "kimi@kimi-k2.5|Kimi K2.5|Direct|0.45|2.20"
  "glm@glm-5|GLM-5|Direct|0.80|2.56"
  "g@gemini-3-flash-preview|Gemini 3 Flash|Direct|0.50|3.00"
  "oai@gpt-5.1-codex-mini|GPT-5.1 Codex Mini|Direct|0.25|2.00"
  "openrouter@qwen/qwen3.5-plus-02-15|Qwen3.5 Plus|Direct|0.26|1.56"
)
# Note: Qwen has no direct API via claudish, falls back to OpenRouter

# Combine all models
ALL_MODELS=("${OR_MODELS[@]}" "${DIRECT_MODELS[@]}")
NUM_MODELS=${#ALL_MODELS[@]}

echo "=== LLM Speed Benchmark ($ROUNDS rounds x $NUM_MODELS model-routes) ==="
echo "Task: TypeScript parseQueryParams function"
echo "Output: $OUTDIR"
echo ""

# --- Run all rounds ---
for round in $(seq 1 $ROUNDS); do
  echo "--- Round $round/$ROUNDS ---"
  mkdir -p "$OUTDIR/round-$round"

  for i in $(seq 0 $((NUM_MODELS - 1))); do
    entry="${ALL_MODELS[$i]}"
    model=$(echo "$entry" | cut -d'|' -f1)
    label=$(echo "$entry" | cut -d'|' -f2)
    route=$(echo "$entry" | cut -d'|' -f3)
    tag="$label ($route)"
    (
      start=$(python3 -c 'import time; print(int(time.time()*1000))')
      claudish --model "$model" --json "$TASK" > "$OUTDIR/round-$round/$i.json" 2>"$OUTDIR/round-$round/$i.err"
      exit_code=$?
      end=$(python3 -c 'import time; print(int(time.time()*1000))')
      elapsed=$(( end - start ))
      if [ $exit_code -eq 0 ] && [ -s "$OUTDIR/round-$round/$i.json" ]; then
        echo "$elapsed" > "$OUTDIR/round-$round/$i.time"
        echo "  R$round $tag: ${elapsed}ms"
      else
        echo "ERR" > "$OUTDIR/round-$round/$i.time"
        err=$(head -1 "$OUTDIR/round-$round/$i.err" 2>/dev/null)
        echo "  R$round $tag: FAILED ($err)"
      fi
    ) &
  done
  wait
  echo ""
done

# --- Calculate and display results ---
echo "=== Results ==="
echo ""

python3 - "$OUTDIR" "$ROUNDS" "$NUM_MODELS" <<'PYEOF'
import sys, os, math, json

outdir = sys.argv[1]
rounds = int(sys.argv[2])
num_models = int(sys.argv[3])

# Parse model config from env
models_raw = os.environ.get("ALL_MODELS_JSON", "")

# Hardcoded model metadata (must match script order)
meta = [
    # OpenRouter
    ("MiniMax M2.5", "OR", 0.29, 1.20),
    ("Kimi K2.5", "OR", 0.45, 2.20),
    ("GLM-5", "OR", 0.80, 2.56),
    ("Gemini 3 Flash", "OR", 0.50, 3.00),
    ("GPT-5.1 Codex Mini", "OR", 0.25, 2.00),
    ("Qwen3.5 Plus", "OR", 0.26, 1.56),
    # Direct
    ("MiniMax M2.5", "Direct", 0.29, 1.20),
    ("Kimi K2.5", "Direct", 0.45, 2.20),
    ("GLM-5", "Direct", 0.80, 2.56),
    ("Gemini 3 Flash", "Direct", 0.50, 3.00),
    ("GPT-5.1 Codex Mini", "Direct", 0.25, 2.00),
    ("Qwen3.5 Plus", "Direct", 0.26, 1.56),
]

results = []
for i in range(num_models):
    label, route, price_in, price_out = meta[i]
    times = []
    for r in range(1, rounds + 1):
        tf = os.path.join(outdir, f"round-{r}", f"{i}.time")
        try:
            val = open(tf).read().strip()
            if val != "ERR":
                times.append(int(val))
        except:
            pass
    if times:
        mean = sum(times) / len(times)
        mn = min(times)
        mx = max(times)
        std = math.sqrt(sum((t - mean) ** 2 for t in times) / len(times))
    else:
        mean, mn, mx, std = 999999, 0, 0, 0
    results.append({
        "label": label, "route": route,
        "price_in": price_in, "price_out": price_out,
        "times": times, "mean": mean, "min": mn, "max": mx,
        "std": std, "ok": len(times),
    })

# --- Table 1: All results sorted by mean ---
results.sort(key=lambda x: x["mean"])

hdr = f"{'#':<3} {'Model':<22} {'Route':<7} {'Mean':>7} {'Min':>7} {'Max':>7} {'StdDev':>7} {'OK':>3}  {'In $/M':>7} {'Out $/M':>8}"
print(hdr)
print("-" * len(hdr))

for rank, r in enumerate(results, 1):
    if r["ok"] == 0:
        print(f"{rank:<3} {r['label']:<22} {r['route']:<7} {'FAIL':>7} {'-':>7} {'-':>7} {'-':>7} {r['ok']:>3}  ${r['price_in']:<6.2f} ${r['price_out']:<7.2f}")
    else:
        print(f"{rank:<3} {r['label']:<22} {r['route']:<7} {r['mean']/1000:>6.1f}s {r['min']/1000:>6.1f}s {r['max']/1000:>6.1f}s {r['std']/1000:>6.1f}s {r['ok']:>3}  ${r['price_in']:<6.2f} ${r['price_out']:<7.2f}")

# --- Table 2: Direct vs OpenRouter comparison ---
print()
print("=== Direct vs OpenRouter (speed difference) ===")
print()

or_map = {r["label"]: r for r in results if r["route"] == "OR" and r["ok"] > 0}
dr_map = {r["label"]: r for r in results if r["route"] == "Direct" and r["ok"] > 0}

hdr2 = f"{'Model':<22} {'OR Mean':>8} {'Direct':>8} {'Diff':>8} {'Faster':>8}"
print(hdr2)
print("-" * len(hdr2))

for label in ["Gemini 3 Flash", "GPT-5.1 Codex Mini", "Kimi K2.5", "MiniMax M2.5", "Qwen3.5 Plus", "GLM-5"]:
    or_r = or_map.get(label)
    dr_r = dr_map.get(label)
    if or_r and dr_r:
        or_s = f"{or_r['mean']/1000:.1f}s"
        dr_s = f"{dr_r['mean']/1000:.1f}s"
        diff = or_r['mean'] - dr_r['mean']
        diff_s = f"{abs(diff)/1000:.1f}s"
        winner = "Direct" if diff > 0 else "OR"
        pct = abs(diff) / max(or_r['mean'], dr_r['mean']) * 100
        print(f"{label:<22} {or_s:>8} {dr_s:>8} {diff_s:>8} {winner:>5} {pct:>3.0f}%")
    elif or_r:
        or_s = f"{or_r['mean']/1000:.1f}s"
        print(f"{label:<22} {or_s:>8} {'FAILED':>8} {'-':>8} {'OR':>8}")
    elif dr_r:
        dr_s = f"{dr_r['mean']/1000:.1f}s"
        print(f"{label:<22} {'FAILED':>8} {dr_s:>8} {'-':>8} {'Direct':>8}")
    else:
        print(f"{label:<22} {'FAILED':>8} {'FAILED':>8} {'-':>8} {'-':>8}")

# --- Raw data ---
print()
print("--- Raw times (ms) per round ---")
for r in results:
    tag = f"{r['label']} ({r['route']})"
    vals = " ".join(f"{t:>6}" for t in r["times"]) if r["times"] else "no data"
    print(f"  {tag:<30} {vals}")

print()
print(f"Rounds: {rounds} | Sorted by mean (fastest first)")
print(f"Output: {outdir}")
PYEOF

echo ""
echo "Done! View model outputs: cat $OUTDIR/round-1/0.json | python3 -m json.tool"
