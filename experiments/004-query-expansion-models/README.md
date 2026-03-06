# 004 — Query Expansion Model Benchmarks

**Date**: 2026-03-03 to 2026-03-06
**Status**: Complete (Round 1 + Round 2)

## Motivation

claudemem's hybrid search pipeline needs a small local LLM to expand user queries into three retrieval variants:
- `lex:` keywords for BM25 search
- `vec:` semantic rephrasing for vector search
- `hyde:` hypothetical code snippet for HyDE embedding

The goal: find the best model across 4 tiers (tiny/small/medium/large) balancing quality vs inference speed on Apple Silicon.

## Design

### Benchmark
- 50 hand-crafted code search queries (`harness/queries.json`)
- Weighted composite scoring: format (0.20), keyword (0.20), semantic (0.20), hyde (0.25), speed (0.15)
- Base models run via LM Studio on MPS; fine-tuned models via transformers+peft with LoRA adapter merge

### Models Tested
- **16 base models**: LFM2 family (350M-2.6B), Qwen3 family (0.6B-8B), Qwen3.5 family (0.8B-9B), Gemma-3-1B, SmolLM2-1.7B
- **9 fine-tuned models**: 4 Round 1 (Qwen3-1.7B, Qwen3-4B, LFM2-700M, LFM2-1.2B) + 5 Round 2 (Qwen3-8B, Phi4-mini, Qwen3.5-2B, Qwen3.5-4B, Qwen3.5-9B)
- **25 total evaluations**

### SFT Training
- LoRA fine-tuning via HuggingFace Jobs (A10G-large for Round 1, A100-large for Qwen3.5 VLMs)
- 622 training examples, 70 eval examples
- Training data generated from handcrafted + synthetic sources

## Results

### Full Leaderboard (25 models)

| # | Model | Params | Format | KW | Sem | HyDE | Speed | Total |
|---|-------|--------|--------|------|------|------|-------|-------|
| 1 | LFM2-2.6B | 2.6B | 1.000 | .913 | .996 | .597 | 1879ms | .816 |
| 2 | Qwen3-4B-2507 | 4B | 1.000 | .965 | 1.00 | .633 | 2158ms | .811 |
| 3 | Qwen3-1.7B-FT | 1.7B | 1.000 | .869 | 1.00 | .588 | 3473ms | .777 |
| 4 | Qwen3.5-2B-FT | 2B | 1.000 | .938 | 1.00 | .560 | 10241ms | .742 |
| 5 | LFM2.5-1.2B | 1.2B | .986 | .695 | 1.00 | .272 | 558ms | .728 |
| 6 | Qwen3-4B-FT | 4B | 1.000 | .888 | 1.00 | .488 | 6011ms | .726 |
| 7 | Phi4-mini-FT | 3.8B | .973 | .823 | .960 | .474 | 4136ms | .724 |
| 8 | Qwen3-8B-FT | 8B | 1.000 | .885 | 1.00 | .490 | 6859ms | .720 |
| 9 | Qwen3.5-2B | 2B | .959 | .989 | .900 | .495 | 9369ms | .712 |
| 10 | Qwen3.5-4B-FT | 4B | .960 | .912 | .960 | .577 | 26657ms | .711 |
| 11 | LFM2-700M | 0.7B | .879 | .863 | .864 | .260 | 697ms | .708 |
| 12 | LFM2-1.2B-FT | 1.2B | 1.000 | .818 | .973 | .340 | 3926ms | .698 |
| 13 | Gemma-3-1B | 1B | .960 | .868 | .927 | .150 | 1057ms | .690 |
| 14 | SmolLM2-1.7B | 1.7B | .940 | .664 | .871 | .389 | 1240ms | .687 |
| 15 | Qwen3.5-0.8B | 0.8B | 1.000 | .802 | .996 | .339 | 7497ms | .666 |
| 16 | LFM2-700M-FT | 0.7B | .973 | .708 | .956 | .274 | 2614ms | .658 |
| 17 | Qwen3.5-9B-FT | 9B | .727 | .668 | .720 | .444 | 40458ms | .534 |
| 18 | LFM2-350M | 0.35B | .463 | .000 | .596 | .253 | 1338ms | .366 |
| 19 | Qwen3-0.6B | 0.6B | .326 | .282 | .324 | .053 | 1382ms | .302 |
| 20 | Qwen3-4B | 4B | .338 | .517 | .288 | .062 | 5545ms | .278 |
| 21 | Qwen3-1.7B | 1.7B | .252 | .340 | .200 | .045 | 3252ms | .230 |
| 22 | Qwen3-8B | 8B | .321 | .310 | .228 | .143 | 12238ms | .222 |
| 23 | Qwen3.5-9B-GGUF | 9B | .300 | .102 | .090 | .000 | 20794ms | .099 |
| 24 | Qwen3.5-4B | 4B | .000 | .000 | .000 | .000 | 8290ms | .016 |
| 25 | Qwen3.5-9B | 9B | .000 | .000 | .000 | .000 | 14590ms | .011 |

### SFT Gain Analysis

| Model | Base | FT | Gain |
|-------|------|-----|------|
| Qwen3.5-9B | .011 | .534 | +4710% |
| Qwen3.5-4B | .016 | .711 | +4344% |
| Qwen3-1.7B | .230 | .777 | +238% |
| Qwen3-8B | .222 | .720 | +224% |
| Qwen3-4B | .278 | .726 | +161% |
| Qwen3.5-2B | .712 | .742 | +4% |
| LFM2-1.2B | .728 | .698 | -4% |
| LFM2-700M | .708 | .658 | -7% |

### Final 3-Tier Selection

| Tier | Model | Params | Total | Speed |
|------|-------|--------|-------|-------|
| Tiny | LFM2-700M | 0.7B | .708 | 697ms |
| Medium | Qwen3-1.7B-FT | 1.7B | .777 | 3473ms |
| Large | LFM2-2.6B | 2.6B | .816 | 1879ms |

## Findings

1. **SFT teaches FORMAT, not domain knowledge.** Models with broken format compliance (Qwen3 base: 0.01-0.28) jump to 0.72-0.78 after fine-tuning. Models with good native format (LFM2) show no gain or slight degradation.

2. **Top 2 models are base models** — LFM2-2.6B (.816) and Qwen3-4B-2507 (.811) need no fine-tuning at all.

3. **HyDE is the hardest dimension** — generating realistic hypothetical code snippets requires models with strong code generation ability. Scores range from .000 to .633 across models.

4. **LFM2 family dominates speed** — Liquid Foundation Models run 2-10x faster than similarly-sized Qwen models on Apple Silicon MPS.

5. **Qwen3.5 VLMs need special handling** — require transformers>=5.0.0, pillow, torchvision dependencies. Their Gated Delta Network architecture produces poor results with standard LoRA target modules at 9B.

## Problems Encountered

- Qwen3-8B download stalled at 22% for 50+ minutes during eval; had to kill and restart
- Qwen3.5 models required A100-large (80GB VRAM) for training due to VLM architecture
- `tee` didn't capture stderr from adapter loading; had to monitor via ps aux
- HF Jobs streaming logs (`hf jobs logs`) hang indefinitely; used `hf jobs inspect` instead

## Future Work

- End-to-end evaluation: does the expander actually improve search results? (see experiment 006)
- Train a CNN/embedding-head query router to complement the expander
- Evaluate query expansion contribution via ablation (MRR delta with/without expander)

## Reproduction

```bash
# Benchmark a base model (requires LM Studio running the model)
bun run harness/run.ts --model qwen3-1.7b

# Benchmark a fine-tuned model (downloads from HuggingFace Hub)
uv run harness/run-finetuned.py --model qwen3-1.7b

# Generate comparison report
bun run harness/report.ts

# Train a new model (requires HF_TOKEN)
hf jobs uv run --flavor a10g-large --secrets HF_TOKEN --timeout 2h \
    training/jobs/sft.py --model qwen3-1.7b
```

## File Manifest

```
004-query-expansion-models/
  README.md               <- This file
  harness/                <- Benchmark scripts
    run.ts                <- Base model runner (LM Studio)
    run-finetuned.py      <- Fine-tuned model runner (transformers+peft)
    scorer.ts             <- Scoring functions
    models.ts             <- Model registry
    report.ts             <- Comparison table generator
    queries.json          <- 50 test queries
  results/                <- All 25 benchmark results
    base/                 <- 16 base model JSONs
    finetuned/            <- 9 fine-tuned model JSONs
  training/               <- SFT pipeline
    jobs/sft.py           <- HF Jobs training script (all model configs)
    scripts/              <- Data generation & validation
    data/                 <- Training data (622 train + 70 eval)
    seeds/                <- Seed queries
  research/               <- Research notes & plans
    model-tiers.md        <- Tier comparison matrix
    qmd-comparison.md     <- claudemem vs qmd comparison
    sft-candidates.md     <- LoRA SFT candidate analysis
    sft-models-research.md <- SFT model deep research
    small-lm-candidates-code-expansion-march2026.md <- LM candidates survey
    NEXT-TRAINING-PLAN.md <- Round 2 training plan
    original-README.md    <- Original README from claudemem repo
```
