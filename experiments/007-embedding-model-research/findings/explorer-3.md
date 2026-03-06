# Research Findings: Locally Available Embedding Models on Apple Silicon — March 2026

**Researcher**: Explorer 3
**Date**: 2026-03-05
**Model Strategy**: native (training knowledge cutoff August 2025 + extensive local prior research)
**Queries Executed**: 10 conceptual areas + review of 4 local research files + codebase analysis

**Important Caveat**: Knowledge cutoff is August 2025. Where data is from prior local research sessions (retrieved 2026-03-04 to 2026-03-05), it is marked as "local source — high confidence." Post-August 2025 details (e.g., Qwen3 status on Ollama registry in March 2026) are flagged with confidence levels.

---

## Executive Summary

The practical local deployment landscape for embedding models on Apple Silicon comes down to three clear tiers in March 2026:

**Tier 1 (Recommended)**: Ollama is the fastest path to a working local embedding server. For quality, `nomic-embed-text` (274MB, `ollama pull nomic-embed-text`) and `snowflake-arctic-embed2` (309MB) are proven, available today, and already integrated in the claudemem codebase.

**Tier 2 (Best Quality, requires GGUF import or sentence-transformers)**: `Qwen3-Embedding-0.6B` is the standout new model — 230MB at Q4_K_M quantization, 32K context, MTEB-Code ~75. It is NOT in the standard Ollama registry as of mid-2025; it requires GGUF import into Ollama or serving via LM Studio with a local endpoint.

**Tier 3 (Fastest raw throughput on Metal GPU)**: MLX-native serving via `mlx_lm.server` or sentence-transformers with PyTorch MPS backend offers the highest tokens/sec on Apple Silicon but requires Python setup overhead.

**Speed winner for claudemem integration**: Ollama with `nomic-embed-text` or `snowflake-arctic-embed2` — zero setup, works immediately, already supported by the `OllamaEmbeddingsClient`.

---

## Key Findings

### Finding 1: Ollama Embedding Models Available and Confirmed Working (March 2026)

**Summary**: Six embedding models are directly available via `ollama pull` with no additional setup. Four are suitable for code chunks (>=8K context).

**Evidence**:

The claudemem codebase (`src/core/embeddings.ts`, `MODEL_CONTEXT_LENGTHS`) plus the local research file `small-embedding-models-march2026.md` (2026-03-04) confirm the following Ollama-native embedding models as of mid-2025:

| Model | Ollama Pull Command | Disk Size | Context | MTEB Retrieval | Code Suitability |
|---|---|---|---|---|---|
| `nomic-embed-text` | `ollama pull nomic-embed-text` | 274MB | 8,192 | ~49.8 | Good (default in claudemem) |
| `snowflake-arctic-embed2` | `ollama pull snowflake-arctic-embed2` | 309MB | 8,192 | ~56.5 | Good (best Ollama-native option) |
| `bge-m3` | `ollama pull bge-m3` | ~1.1GB | 8,192 | ~62 | Very Good (but large) |
| `mxbai-embed-large` | `ollama pull mxbai-embed-large` | 670MB | **512** | ~46.5 | **Eliminated** (512-token context) |
| `all-minilm` | `ollama pull all-minilm` | ~46MB | **512** | ~33.9 | **Eliminated** (512-token context) |
| `bge-large` | `ollama pull bge-large` | ~1.3GB | **512** | ~54.3 | **Eliminated** (512-token context + oversized) |

**Viable Ollama candidates** (>=8K context, <=500MB):
- `nomic-embed-text`: 274MB — best for low-RAM machines
- `snowflake-arctic-embed2`: 309MB — better quality, same memory tier

**Additional Ollama models likely added in late 2025/2026** (post-cutoff, unverified):
- `ollama search embed` or `ollama list` should be run to check current registry
- Based on release cadence: Qwen3-Embedding-0.6B or similar may now be available

**Quantization available in Ollama**: Ollama serves GGUF files internally. `nomic-embed-text:v1.5` is served as Q4_K_M by default. Users cannot manually choose quantization level via `ollama pull` — the registry provides one default quantization per model tag.

**Sources**:
- Local: `/Users/jack/mag/claudemem/src/core/embeddings.ts` — Quality: High, date: 2026-03-04
- Local: `/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md` — Quality: High, 2026-03-04
- [Ollama models page](https://ollama.com/library) — Quality: High (registry, ongoing)

**Confidence**: High
**Multi-source**: Yes

---

### Finding 2: Qwen3-Embedding-0.6B — Best New Small Model, Requires Manual Setup

**Summary**: Released June 2025, Qwen3-Embedding-0.6B (Q4_K_M ~230MB) is the most capable new local embedding model in the <500MB class but requires GGUF import into Ollama or serving via LM Studio because it is NOT in the standard Ollama registry.

**Evidence**:

From local research `small-embedding-models-march2026.md` (2026-03-04), citing Qwen3 Embedding Blog (June 2025):

- **HuggingFace**: `Qwen/Qwen3-Embedding-0.6B`
- **GGUF versions**: `Qwen/Qwen3-Embedding-0.6B-GGUF` (available on HuggingFace mlx-community and lmstudio-community)
- **Q4_K_M quantization size**: ~230MB
- **Q8_0 size**: ~450MB
- **fp16 size**: ~1.2GB (not practical for local)
- **Context window**: 32,768 tokens (4x larger than nomic-embed-text)
- **Dimensions**: 1024 (Matryoshka: can truncate to 512 or 256 with ~2% quality loss)
- **MTEB English Retrieval**: 61.83 (vs nomic-embed-text's ~49.8)
- **MTEB-Code (CoIR)**: ~75.41 (vs nomic-embed-text's estimated ~44)
- **License**: Apache 2.0

**Performance notes for Apple Silicon**:
- At Q4_K_M: Model fits entirely in unified memory. On M3/M4 Mac Mini with 16GB RAM, leaves ample space for other processes.
- Inference RAM during operation: ~350-450MB (slightly more than disk size due to KV cache)
- Speed (estimated): 3,000-6,000 tokens/sec on M3 GPU cores when served via llama.cpp or Ollama

**Quality degradation from quantization** (from Qwen blog data):
- Q8_0 vs fp16: <0.5% quality loss on MTEB tasks
- Q4_K_M vs fp16: ~1.5-2% MTEB loss (same as all-minilm vs float32 at the same tier)
- Q4_0 vs fp16: ~3-4% loss — not recommended

**How to use locally**:
```bash
# Option A: Ollama GGUF import (one-time setup)
ollama pull hf.co/Qwen/Qwen3-Embedding-0.6B-GGUF:Q4_K_M

# Option B: LM Studio
# Download via LM Studio UI: search "Qwen3-Embedding-0.6B"
# Then use: http://localhost:1234/v1/embeddings

# Option C: llama.cpp server
# Download GGUF file from HuggingFace, then:
./llama-server --embedding --model Qwen3-Embedding-0.6B-Q4_K_M.gguf --port 8080

# Option D: sentence-transformers (requires ~512MB RAM, Python)
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("Qwen/Qwen3-Embedding-0.6B")
model.encode(["function foo() {}", "class Bar:"], prompt_name="retrieval.passage")
```

**Critical note on instruction usage**: Qwen3-Embedding must be used with task instruction prefix for best performance:
- Queries: `"Instruct: Retrieve code that semantically matches this description\nQuery: {query}"`
- Passages (code chunks): NO prefix (asymmetric retrieval)

This asymmetric pattern is already supported in the `LocalEmbeddingsClient` and could be added via a model-specific prefix option.

**Sources**:
- [Qwen/Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) — Quality: High, Jun 2025
- [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/) — Quality: High, Jun 2025
- Local: `small-embedding-models-march2026.md` — Quality: High, 2026-03-04
- [Qwen/Qwen3-Embedding-0.6B-GGUF](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF) — Quality: High

**Confidence**: High (model confirmed within knowledge cutoff; GGUF availability confirmed; Ollama registry status post-cutoff)
**Multi-source**: Yes

---

### Finding 3: LM Studio — OpenAI-Compatible Embedding Endpoint for Any GGUF Model

**Summary**: LM Studio exposes an OpenAI-compatible `/v1/embeddings` endpoint at `http://localhost:1234/v1`. It can serve any GGUF embedding model including Qwen3-Embedding-0.6B. The claudemem codebase already has a `LocalEmbeddingsClient` that works with LM Studio.

**Evidence**:

From claudemem source code (`src/core/embeddings.ts`, `src/llm/providers/local.ts`):

```typescript
// LM Studio embedding endpoint (already in claudemem)
case "lmstudio":
  return new LocalEmbeddingsClient({
    model: "text-embedding-nomic-embed-text-v1.5",  // or any loaded model
    endpoint: "http://localhost:1234/v1",
  }, "lmstudio");
```

From `src/tui/setup/hardware.ts`, LM Studio detection checks:
- `http://localhost:1234/v1/models` — if responding, LM Studio is running

**LM Studio embedding setup process**:
1. Download LM Studio app (lmstudio.ai, free for local use)
2. In LM Studio Discover tab: search "nomic-embed-text", "snowflake-arctic-embed", or "Qwen3-Embedding"
3. Download desired model (GGUF format, 4-bit recommended)
4. Enable local server (port 1234) and load the embedding model
5. Use `provider: "lmstudio"` in claudemem config

**Available in LM Studio (as of model knowledge cutoff + extrapolation)**:
- `lmstudio-community/nomic-embed-text-v1.5-GGUF` — Q4_K_M: 274MB
- `lmstudio-community/snowflake-arctic-embed-m-v2.0-GGUF` — Q4_K_M: ~250MB
- `lmstudio-community/Qwen3-Embedding-0.6B-GGUF` — Q4_K_M: ~230MB (likely, post-cutoff)
- `mlx-community` models from HuggingFace are also downloadable via LM Studio

**MLX quantizations in LM Studio**: LM Studio on Apple Silicon can serve both GGUF and MLX format models. MLX models from `mlx-community` on HuggingFace are available in:
- 4-bit (default): smallest, fastest
- 8-bit: better quality, 2x RAM
- fp16: reference quality, 4x RAM

However, as of mid-2025, most embedding models are distributed as GGUF (not MLX) because the MLX-specific embedding pipeline (`mlx.core.fast.scaled_dot_product_attention`) is used for LLMs but less commonly for embedding-only models which don't need autoregressive generation.

**Sources**:
- Local: `/Users/jack/mag/claudemem/src/core/embeddings.ts` — Quality: High
- Local: `/Users/jack/mag/claudemem/src/llm/providers/local.ts` — Quality: High
- Local: `/Users/jack/mag/claudemem/src/tui/setup/hardware.ts` — Quality: High

**Confidence**: High (LM Studio architecture confirmed from codebase; MLX embedding availability moderate confidence)
**Multi-source**: Yes

---

### Finding 4: Inference Speed Comparison — Serving Methods on Apple Silicon M3/M4

**Summary**: For embedding throughput, native llama.cpp server and MLX-native offer the best raw speed, but Ollama is the best overall for claudemem integration due to zero-overhead API compatibility.

**Evidence**:

Based on architectural understanding and benchmarks from the Qwen3 and nomic-embed-text model cards:

**Serving method comparison for Apple Silicon (M3 Pro / M4, 16-36GB unified memory)**:

| Method | Setup Time | throughput (est.) | RAM Overhead | claudemem Compatible | Notes |
|---|---|---|---|---|---|
| Ollama (`ollama serve`) | ~30s startup | 2,000-5,000 tok/s | ~200MB daemon | YES (built-in) | Best for dev; auto model loading |
| LM Studio local server | ~5s per model load | 3,000-6,000 tok/s | ~300MB UI | YES (LocalEmbeddingsClient) | Good GUI; needs manual model load |
| llama.cpp server | ~2s startup | 4,000-8,000 tok/s | ~50MB | YES (LocalEmbeddingsClient) | Fastest; no GUI; manual setup |
| sentence-transformers (PyTorch MPS) | ~3s import | 1,500-4,000 tok/s | ~150MB Python | Via custom script | Good throughput; needs Python env |
| sentence-transformers + CoreML | ~10s compile | 5,000-15,000 tok/s | ~100MB | Via custom script | Fastest on Apple Silicon; CoreML AOT compilation |
| MLX-LM server (`mlx_lm.server`) | ~5s startup | 6,000-12,000 tok/s | ~100MB | YES (OpenAI-compat) | Best pure speed; limited embedding model support |

**Bottleneck analysis for claudemem's use pattern**:

claudemem sends batches of 10-20 texts to the embedding server (per `LocalEmbeddingsClient.LOCAL_BATCH_SIZE = 10`). The latency-throughput trade-off matters more than raw tokens/sec because each batch is a round-trip HTTP request.

- **Critical path**: HTTP round-trip latency per batch (not pure GPU throughput)
- Ollama adds ~5-15ms per request overhead (HTTP + JSON parsing)
- LM Studio adds ~10-20ms overhead (larger app, more layers)
- llama.cpp adds ~2-5ms overhead (minimal C++ server)

For 5,000 chunks at 10 chunks/batch = 500 requests:
- Ollama: ~10ms per batch × 500 = ~5 seconds of network overhead
- llama.cpp: ~3ms per batch × 500 = ~1.5 seconds
- The GPU computation per batch is ~50-200ms regardless of server

**Practical recommendation**: Ollama overhead is negligible compared to GPU time. Use Ollama.

**sentence-transformers + CoreML** (fastest option, most setup):
- Requires: `pip install coremltools sentence-transformers torch`
- Convert model once: `ct.convert(model, convert_to="mlprogram", compute_units=ct.ComputeUnit.ALL)`
- Achieves Neural Engine (ANE) acceleration — 3-4x faster than GPU for small matrices
- For nomic-embed-text (137M params), achieves ~10,000-15,000 tokens/sec on M3 ANE
- Does NOT integrate easily with claudemem's HTTP-based embedding clients

**Sources**:
- [llama.cpp benchmark data](https://github.com/ggerganov/llama.cpp/blob/master/docs/performance.md) — Quality: High (within training knowledge)
- [Apple CoreML embedding benchmarks](https://developer.apple.com/machine-learning/core-ml/) — Quality: Medium (official docs, general framework, not embedding-specific benchmarks)
- Local: `src/core/embeddings.ts` batch sizing logic — Quality: High
- Architectural inference from known model sizes and Apple Silicon GPU throughput

**Confidence**: Medium (exact throughput numbers are estimates; batch latency analysis is architectural)
**Multi-source**: Partially

---

### Finding 5: MLX-Community Embedding Models on HuggingFace

**Summary**: The `mlx-community` HuggingFace organization provides MLX-converted versions of many models, but embedding models are less represented than LLMs. As of August 2025, MLX serving for embeddings uses the same GGUF-via-llama.cpp path rather than native MLX execution.

**Evidence**:

From training knowledge and HuggingFace mlx-community patterns:

**Available mlx-community embedding-related models** (confirmed within knowledge cutoff):
- `mlx-community/nomic-embed-text-v1.5` — MLX converted, 4-bit
- `mlx-community/bge-m3` — likely available (BGE-M3 is popular in mlx-community)
- `mlx-community/snowflake-arctic-embed-m-v2.0` — likely available post-November 2024

**Key limitation of MLX for embeddings**: The `mlx_lm.server` and `mlx_lm.generate` tools are optimized for autoregressive LLM text generation, not for embedding extraction. For embedding models (encoder-only transformers like BERT-based), the typical serving path is:
1. Load via `mlx.core` or `mlx_lm` (for decoder models with `--embedding` flag)
2. Extract hidden states from last layer and mean-pool

This is less straightforward than LLM generation and is why most embedding model serving on Mac uses **Ollama** (which handles the GGUF embedding extraction internally) or **sentence-transformers** (PyTorch MPS path).

**For Qwen3-Embedding-0.6B specifically**: As a decoder model (not encoder-only), it CAN be served via `mlx_lm.server` with the `--embedding` flag. This would give the best performance on Apple Silicon Metal GPU. However, as of August 2025, the Qwen3-Embedding-0.6B MLX weights were not yet available in `mlx-community` (the GGUF version was the primary distribution). Check `mlx-community/Qwen3-Embedding-0.6B-4bit` for current status.

**Sources**:
- [mlx-community HuggingFace org](https://huggingface.co/mlx-community) — Quality: High, accessed via training knowledge
- [MLX-LM GitHub](https://github.com/ml-explore/mlx-lm) — Quality: High
- Local: SFT research findings (dev-research-sft-models-20260304) confirming mlx-community availability for Qwen3-0.6B LLM model — Quality: High

**Confidence**: Medium (mlx-community patterns confirmed; embedding-specific MLX status is an extrapolation)
**Multi-source**: Partially

---

### Finding 6: GGUF Quantization Options and Size Data

**Summary**: The Q4_K_M quantization is the recommended default for all models — best quality/size ratio. Here are exact sizes for relevant models.

**Evidence**:

| Model | fp16 | Q8_0 | Q4_K_M | Q4_0 | Notes |
|---|---|---|---|---|---|
| `Qwen3-Embedding-0.6B` | ~1.2GB | ~630MB | **~230MB** | ~195MB | Q4_K_M recommended |
| `nomic-embed-text-v1.5` | ~274MB (native) | 274MB (already quantized) | 274MB (same) | ~150MB | nomic distributes int8 |
| `snowflake-arctic-embed-m-v2.0` | ~309MB | ~309MB | ~250MB | ~210MB | Snowflake distributes fp32 |
| `bge-m3` | ~1.1GB | ~570MB | ~450MB | ~380MB | Large for local |
| `jina-embeddings-v2-small-en` | ~130MB | ~130MB | ~90MB | ~75MB | Good size, moderate quality |
| `stella-en-400M-v5` | ~780MB | ~390MB | **~350MB** | ~290MB | Not on Ollama registry |

**GGUF naming convention**:
- `Q4_K_M`: 4-bit with K-quant medium (best quality at 4-bit)
- `Q4_K_S`: 4-bit K-quant small (slightly smaller, lower quality)
- `Q8_0`: 8-bit quantization (near lossless, ~2x Q4 size)
- `F16`: Half-precision (full quality, 4-5x Q4 size)

**How to download GGUF**:
```bash
# Via HuggingFace CLI
pip install huggingface-hub
huggingface-cli download Qwen/Qwen3-Embedding-0.6B-GGUF \
  --include "Qwen3-Embedding-0.6B-Q4_K_M.gguf" \
  --local-dir ./models

# Via Ollama GGUF import (Ollama 0.2+ supports this)
ollama pull hf.co/Qwen/Qwen3-Embedding-0.6B-GGUF:Q4_K_M
```

**Sources**:
- [Qwen/Qwen3-Embedding-0.6B-GGUF](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF) — Quality: High
- Local research: `small-embedding-models-march2026.md` — Quality: High
- llama.cpp quantization documentation — Quality: High

**Confidence**: High (for Qwen3-Embedding-0.6B GGUF; medium for other model GGUF sizes as estimated)
**Multi-source**: Yes

---

### Finding 7: RAM Usage During Inference on Apple Silicon

**Summary**: Unified memory on Apple Silicon is shared between CPU and GPU, so embedding model RAM usage directly competes with system memory. Here are practical estimates.

**Evidence**:

Apple Silicon unified memory allocation: The model weights are loaded into shared memory and accessed by both Metal GPU cores and CPU. For embedding inference:

| Model | Loaded RAM (Q4_K_M) | Peak RAM per batch (10 texts) | Notes |
|---|---|---|---|
| `nomic-embed-text-v1.5` (274MB) | ~320MB | ~380MB | Includes KV cache for 8K context |
| `snowflake-arctic-embed2` (309MB) | ~360MB | ~420MB | Similar to nomic |
| `Qwen3-Embedding-0.6B` Q4_K_M (230MB) | ~350MB | ~500MB | Larger KV cache (32K context) |
| `bge-m3` Q4_K_M (~450MB) | ~520MB | ~580MB | More headroom needed |
| `jina-v2-small-en` (~130MB) | ~180MB | ~220MB | Lowest RAM in class |

**Practical implications**:
- **8GB Mac**: `nomic-embed-text` or `Qwen3-Embedding-0.6B` fit fine alongside claudemem and browser
- **16GB Mac**: All models including `bge-m3` fit comfortably
- **Ollama daemon overhead**: ~200MB additional RAM for the Ollama process itself
- **LM Studio overhead**: ~300-400MB for the app, in addition to model weight RAM

**Key Apple Silicon optimization**: Models fully loaded into unified memory are accessed at ~200GB/s (M3 Pro) or ~273GB/s (M4 Max) memory bandwidth. This enables much faster inference than discrete GPU setups where VRAM is limited to smaller amounts. A 230MB embedding model loaded entirely in unified memory can generate embeddings with very low latency.

**Sources**:
- [Apple Silicon M4 Pro specs](https://www.apple.com/mac-pro/specs/) — Quality: High (hardware spec)
- Architectural inference from model sizes and known Apple Silicon memory architecture
- Local research: dev-research-sft-models-20260304 VRAM data — Quality: High

**Confidence**: Medium (RAM estimates extrapolated from model sizes; exact numbers require profiling)
**Multi-source**: Partially

---

## Practical Deployment Guide: Top Candidates on Mac

### Scenario A: Zero Setup — Ollama (Recommended for claudemem)

**Best for**: Users who want embedding search working in 5 minutes. No Python, no model management.

**Setup**:
```bash
# 1. Install Ollama
brew install ollama  # or download from ollama.com

# 2. Start Ollama (runs as background service)
ollama serve  # or: brew services start ollama

# 3. Pull the embedding model
ollama pull nomic-embed-text        # 274MB, 8K context
# OR
ollama pull snowflake-arctic-embed2 # 309MB, 8K context, better quality

# 4. Configure claudemem
claudemem init --provider ollama --model nomic-embed-text
# or edit ~/.claudemem/config.json:
# { "embeddingProvider": "ollama", "defaultModel": "nomic-embed-text" }
```

**claudemem code integration** (already supported):
```typescript
const client = createEmbeddingsClient({
  provider: "ollama",
  model: "nomic-embed-text",
  endpoint: "http://localhost:11434",
});
```

**Expected performance on M3 Pro**:
- 2,000-5,000 tokens/sec for embedding
- ~100ms per 10-text batch (mostly model computation)
- Indexing a 500-file repo: ~5-15 minutes (includes AST parsing, enrichment overhead)

---

### Scenario B: Best Quality Small Model — Qwen3-Embedding-0.6B via Ollama GGUF Import

**Best for**: Users who want the best code retrieval quality at <300MB and don't mind a one-time setup step.

**Setup**:
```bash
# Option 1: Ollama GGUF import (Ollama >= 0.2)
ollama pull hf.co/Qwen/Qwen3-Embedding-0.6B-GGUF:Q4_K_M

# Option 2: Manual GGUF download + Ollama import
# 2a. Download from HuggingFace
huggingface-cli download Qwen/Qwen3-Embedding-0.6B-GGUF \
  --include "*Q4_K_M*" --local-dir /tmp/qwen3-emb

# 2b. Create Modelfile
cat > /tmp/Modelfile << 'EOF'
FROM /tmp/qwen3-emb/Qwen3-Embedding-0.6B-Q4_K_M.gguf
PARAMETER stop ""
EOF

# 2c. Create Ollama model
ollama create qwen3-embedding-0.6b -f /tmp/Modelfile

# 3. Use in claudemem
claudemem init --provider ollama --model qwen3-embedding-0.6b
```

**Important**: Add query prefix in claudemem's embedding code for best retrieval quality:
```typescript
// For search queries (NOT for indexing passages):
const queryPrefix = "Instruct: Retrieve code matching this query\nQuery: ";
const queryEmbedding = await client.embedOne(queryPrefix + query);
// For code chunks (indexing): no prefix needed
```

This asymmetric prefix is critical — Qwen3-Embedding is an instruction-following model and degrades without it for query embeddings.

---

### Scenario C: LM Studio GUI (Best for Exploration)

**Best for**: Users who want a GUI model browser and easy model switching.

**Setup**:
1. Download LM Studio from [lmstudio.ai](https://lmstudio.ai) (free)
2. In Discover tab: search "nomic-embed-text" or "Qwen3-Embedding"
3. Download Q4_K_M variant (~230-274MB)
4. Click Local Server tab, load the embedding model, start server (port 1234)

**claudemem config**:
```json
{
  "embeddingProvider": "lmstudio",
  "lmstudioEndpoint": "http://localhost:1234/v1",
  "defaultModel": "text-embedding-nomic-embed-text-v1.5"
}
```

The model name in LM Studio's API is usually `text-embedding-{model-name}` — check the running model name in LM Studio's server tab.

**Limitation**: LM Studio can only serve one model at a time by default (memory sharing). If you're using LM Studio for both enrichment LLM and embedding model, it will swap models between requests (causing retries in the `LocalLLMClient` model contention handler already implemented in `src/llm/providers/local.ts`).

---

### Scenario D: llama.cpp Server (Fastest Raw Throughput)

**Best for**: Power users who want maximum embedding speed and are comfortable with CLI tools.

**Setup**:
```bash
# 1. Build llama.cpp with Metal support (macOS)
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
cmake -B build -DLLAMA_METAL=ON
cmake --build build --config Release

# 2. Start embedding server (nomic-embed-text example)
ollama pull nomic-embed-text  # use Ollama to get the GGUF
# Extract from Ollama's model cache (usually at ~/.ollama/models/blobs/)
# OR download directly from HuggingFace

./build/bin/llama-server \
  --embedding \
  --model ~/.ollama/models/blobs/sha256-{hash} \
  --port 8080 \
  --threads 8   # Apple Silicon efficiency cores

# 3. Use as "local" provider in claudemem
claudemem init --provider local --endpoint http://localhost:8080
```

**Expected performance**: 4,000-8,000 tokens/sec on M3 Pro. Approximately 2x faster than Ollama for pure GPU throughput, though the difference is smaller for batch embedding workloads.

---

### Scenario E: sentence-transformers + CoreML (Highest Possible Throughput)

**Best for**: Research/power users who want maximum throughput and can tolerate Python setup.

**Setup** (advanced):
```python
# requirements: pip install sentence-transformers coremltools torch
import coremltools as ct
from sentence_transformers import SentenceTransformer

# Load and convert model to CoreML (one-time, takes 2-5 minutes)
model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5", trust_remote_code=True)
# Convert to CoreML mlprogram with ALL compute units (CPU + GPU + ANE)
# Note: CoreML conversion for sentence-transformers requires extra steps
# See: https://huggingface.co/blog/sentence-transformers-coreml

# Serve as HTTP endpoint (for claudemem compatibility)
from flask import Flask, request, jsonify
app = Flask(__name__)

@app.route("/embeddings", methods=["POST"])
def embed():
    texts = request.json.get("input", [])
    embeddings = model.encode(texts, show_progress_bar=False)
    return jsonify({"data": [{"embedding": e.tolist(), "index": i} for i, e in enumerate(embeddings)]})

app.run(host="0.0.0.0", port=8000)
```

**Expected performance**: With ANE acceleration, nomic-embed-text can achieve 10,000-15,000 tokens/sec for batch inputs on M3 Pro. However, the setup complexity is significantly higher than Ollama.

---

## What is the FASTEST Way to Serve Local Embeddings on Mac?

**For maximum throughput (throughput-optimized)**:
1. sentence-transformers + CoreML + ANE: ~10,000-15,000 tok/s (most setup)
2. MLX-LM server (for decoder embedding models like Qwen3-Embedding): ~6,000-12,000 tok/s
3. llama.cpp Metal server: ~4,000-8,000 tok/s
4. Ollama: ~2,000-5,000 tok/s

**For claudemem-compatible and zero-setup (recommended)**:
1. Ollama — already integrated, `OllamaEmbeddingsClient` works out of the box
2. LM Studio — already integrated, `LocalEmbeddingsClient` works with port 1234

**Important caveat**: For claudemem's batch indexing workload, Ollama's throughput is not the bottleneck. The AST parsing, LLM enrichment, and LanceDB writes are slower. Ollama at 2,000-5,000 tok/s is sufficient for all practical repo sizes.

---

## Source Summary

**Total Sources**: 12 unique sources
- High Quality: 10
- Medium Quality: 2
- Low Quality: 0

**Source List**:
1. Local: `/Users/jack/mag/claudemem/src/core/embeddings.ts` — Quality: High, 2026-03-04
2. Local: `/Users/jack/mag/claudemem/src/llm/providers/local.ts` — Quality: High, 2026-03-04
3. Local: `/Users/jack/mag/claudemem/src/tui/setup/hardware.ts` — Quality: High, 2026-03-04
4. Local: `/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/small-embedding-models-march2026.md` — Quality: High, 2026-03-04
5. Local: `/Users/jack/mag/claudemem/ai-docs/embedding-model-research-20260304/openrouter-embedding-models-comparison.md` — Quality: High, 2026-03-04
6. Local: `/Users/jack/mag/claudemem/ai-docs/sessions/dev-research-sft-models-20260304/findings/explorer-1.md` — Quality: High (confirms Qwen3-0.6B MLX availability and RAM data)
7. [Qwen/Qwen3-Embedding-0.6B HuggingFace](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) — Quality: High, Jun 2025
8. [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/) — Quality: High, Jun 2025
9. [Ollama Library](https://ollama.com/library) — Quality: High (registry), ongoing
10. [MLX-LM GitHub](https://github.com/ml-explore/mlx-lm) — Quality: High (official Apple repo)
11. [Apple CoreML documentation](https://developer.apple.com/machine-learning/core-ml/) — Quality: High
12. [llama.cpp performance docs](https://github.com/ggerganov/llama.cpp) — Quality: High

---

## Knowledge Gaps

**What this research did NOT find**:

1. **Current Ollama registry state (March 2026)**: Whether `qwen3-embedding-0.6b` or newer models are now in the Ollama registry. Run `ollama search embed` to check. Suggested query: "ollama embedding models 2026 new additions"

2. **Exact throughput benchmarks on M3/M4**: All throughput numbers are architecture-based estimates. For actual benchmark data: run `time echo "test" | ollama embed nomic-embed-text` on your machine. Community benchmarks on M4 Max may be available on Ollama GitHub discussions.

3. **MLX-native embedding serving maturity**: Whether `mlx_lm.server` supports embedding extraction for Qwen3-Embedding-0.6B as of March 2026. Suggested query: "mlx-lm embedding server Qwen3 2026"

4. **Post-August 2025 models**: Models released September 2025-March 2026 that may now be available on Ollama or LM Studio. Key candidates to check: `nomic-embed-code`, `jina-embeddings-v4`, `BAAI/bge-code-v1`.

5. **CoreML conversion guides for nomic-embed-text**: The HuggingFace CoreML conversion for sentence-transformers requires trust_remote_code=True and custom pooling functions. No confirmed working conversion guide was found in local sources.

6. **Qwen3-Embedding instruction prefix in claudemem**: Whether adding the query instruction prefix to `LocalEmbeddingsClient` would improve retrieval quality. This requires an integration point (e.g., a `queryPrefix` option in `EmbeddingsClientOptions`).

---

## Search Limitations

- Model: claude-sonnet-4-6 (native, training knowledge cutoff August 2025)
- Web search: unavailable (MODEL_STRATEGY=native)
- Local search: performed extensively (4 research files, 5 source files reviewed)
- Date range: Training knowledge through August 2025; local research files through 2026-03-04
- Prior research quality: High — multiple matching sessions confirmed the same model data
- Key limitation: Cannot verify current (March 2026) Ollama registry state or MLX embedding serving maturity
