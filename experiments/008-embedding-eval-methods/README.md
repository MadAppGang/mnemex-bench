# 008 — Embedding Evaluation Methods

**Date**: 2026-03-05
**Status**: Complete

## Motivation

Design a rigorous evaluation methodology for comparing embedding models in mnemex's code search pipeline. Multi-model validation approach using 6 external AI models to review and vote on proposed evaluation specs.

## Design

- Code digest of existing benchmark-v2 harness analyzed
- 6 external models (Gemini, GPT-5.3, Qwen3.5, MiniMax, Kimi, GLM-5) independently proposed evaluation frameworks
- Proposals synthesized into final embed-eval-spec

## File Manifest

```
008-embedding-eval-methods/
  README.md              <- This file
  research/
    code-digest.md       <- Digest of benchmark-v2 codebase
    vote-prompt.md       <- Prompt sent to all models
  findings/
    explorer-1.md        <- Initial research findings
    explorer-2.md        <- Framework comparison
    explorer-3.md        <- Statistical methods
  synthesis/
    embed-eval-spec.md   <- Final evaluation specification
  work/                  <- Individual model proposals
    gemini-3-1-pro-preview/proposal.md
    gpt-5-3-codex/proposal.md
    qwen3-5-plus-02-15/proposal.md
    minimax-m2-5/proposal.md
    kimi-k2-5/proposal.md
    glm-5/proposal.md
    internal-result.md
```
