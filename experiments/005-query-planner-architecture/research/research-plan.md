# Research Plan: Intelligent Query Planner for Code Search

**Session**: dev-research-query-planner-code-search-20260306-013647-95ad5665
**Date**: 2026-03-06
**Topic**: Orchestrating multiple retrieval tools (BM25, vector search, LSP, AST, symbol graph) via an intelligent query planner

---

## Background

claudemem currently has a simple "query expander" that translates a natural language query into
tagged retrieval strings (`lex:`, `vec:`, `hyde:`). The open question is whether this should
evolve into a **query planner**: a component that understands all available retrieval tools,
decides which to invoke, in what order, and how to combine results — potentially adapting based
on intermediate results (agentic retrieval).

Available retrieval tools:
- **BM25** — lexical/keyword index
- **Vector/embedding search** — semantic similarity
- **AST (tree-sitter)** — structural code parsing
- **LSP** — definitions, references, call hierarchy
- **Code summaries** — LLM-generated metadata stored at index time
- **Symbol graph + PageRank** — importance ranking

---

## Research Questions

### Q1: Existing Frameworks for Intelligent Query Planning / Routing in Code Search

**Goal**: Identify production systems and open-source projects that implement multi-tool retrieval
orchestration, query routing, or agentic RAG specifically for code.

**Search strategy**:
- GitHub: search for "code search query planner", "agentic RAG code", "retrieval routing"
- Review: LlamaIndex "query routing" and "sub-question query engine" docs
- Review: LangChain "adaptive RAG" and "self-RAG" implementations
- Check: Microsoft GraphRAG (graph-augmented retrieval) applicability to code
- Check: Sourcegraph Cody's retrieval pipeline (public blog posts, GitHub)
- Check: Greptile architecture (any published details)
- Check: Continue.dev retrieval context system (open source)
- Check: Cursor's codebase indexing/retrieval (any public docs or reverse-engineering)
- Check: JetBrains AI Assistant retrieval architecture

**Key artifacts to find**:
- Open-source implementations with multi-tool retrieval
- Blog posts describing production retrieval pipelines for code
- Any "query decomposition" patterns applied to code search

---

### Q2: Academic Papers on Multi-Tool Retrieval Orchestration and Query Planning

**Goal**: Find relevant academic work on adaptive retrieval, query planning, and multi-step search
that could inform the design.

**Search strategy**:
- arXiv searches:
  - "adaptive retrieval augmented generation"
  - "query planning retrieval"
  - "multi-step retrieval code search"
  - "tool-augmented retrieval"
  - "agentic RAG"
  - "code search neural symbolic"
  - "hybrid retrieval reranking code"
- Google Scholar: "retrieval orchestration", "query routing RAG"
- Semantic Scholar: filter to 2022-2026, CS.IR + CS.SE

**Key papers to look for**:
- Self-RAG (Asai et al., 2023) — self-reflective retrieval
- FLARE (Jiang et al., 2023) — active retrieval augmented generation
- IRCoT (Trivedi et al., 2022) — interleaved retrieval and chain-of-thought
- ToolFormer / Gorilla — LLM tool use for retrieval
- CodeBERT, GraphCodeBERT, UniXCoder — code-specific embedding models
- "Code as a Graph" retrieval papers
- Any papers specifically on hybrid BM25 + vector for code

**Questions to answer from literature**:
- What query decomposition strategies work best for code?
- When does sequential (adaptive) retrieval outperform parallel retrieval?
- How is retrieved context reranked across heterogeneous sources?

---

### Q3: Evaluation Metrics for Code Search Quality

**Goal**: Understand what metrics exist beyond recall/precision, especially for multi-step or
agentic retrieval systems.

**Search strategy**:
- Review CodeSearchNet benchmark (Husain et al., 2019) metrics
- Review SWE-bench evaluation methodology (does it measure retrieval quality?)
- Look for: MRR (Mean Reciprocal Rank), NDCG for code search
- Look for: "context relevance" metrics from RAG evaluation frameworks (RAGAS, TruLens)
- Look for: End-to-end task completion metrics (does better retrieval → better patch?)
- Review AgentBench and similar agentic evaluation frameworks
- Check: "faithfulness", "answer relevance", "context precision" from RAG eval literature

**Key questions**:
- How do you measure retrieval quality when ground truth is "the files needed to solve a task"?
- Are there labeled datasets mapping queries → relevant code files/symbols?
- How does claudemem's AgentBench setup measure retrieval contribution vs. generation quality?
- What offline metrics correlate with downstream task success?

**Datasets to catalog**:
- CodeSearchNet (6 languages, natural language → code)
- SWE-bench (GitHub issues → file-level relevance implied by patches)
- CoSQA (query-code pairs with relevance labels)
- AdvTest, WebQueryTest
- Any new 2024-2025 code retrieval benchmarks

---

### Q4: LLM Characteristics Needed for a Query Planner

**Goal**: Determine what model properties matter for the query planner role, and whether a small
local model can handle it.

**Research angles**:

**Tool use / function calling**:
- What model sizes reliably follow tool-call schemas?
- Survey: Llama 3.1 8B, Qwen2.5-Coder 7B, Mistral 7B, DeepSeek-Coder-V2-Lite tool use quality
- Review: Berkeley Function Calling Leaderboard (BFCL) for small model rankings
- Key question: Can a 7-8B model plan a 3-step retrieval sequence reliably?

**Reasoning / query decomposition**:
- Does chain-of-thought help with query planning at small model sizes?
- Review: "small LLMs reasoning" literature 2024-2025
- What prompt patterns (ReAct, structured output, few-shot) improve planner reliability?

**Latency constraints**:
- Query planning must be fast (< 500ms on CPU?) or it defeats local-first goals
- Local inference options: ollama, llama.cpp, mlx (Apple Silicon)
- Quantization impact on tool-use quality (Q4 vs Q8)

**Alternative: deterministic planner**:
- Could a rule-based or ML classifier route queries without an LLM?
- Query classification approaches (keyword detection, query type classifier)
- Cost/benefit: LLM planner vs. heuristic router

---

### Q5: How Existing Code Search Tools Handle Query Understanding

**Goal**: Survey production systems for their query understanding and multi-strategy retrieval
approaches.

**Tools to research**:

**Sourcegraph / Cody**:
- Cody's "context fetching" pipeline (open source: sourcegraph/cody)
- Do they use query expansion? Multi-step retrieval?
- How does Sourcegraph's symbol search integrate with semantic search?
- Public blog: "How Cody fetches context"

**GitHub Copilot / Code Search**:
- GitHub's hybrid lexical+semantic search (announced 2023)
- Copilot Workspace retrieval pipeline (any public details)
- GitHub Next research blog posts

**Greptile**:
- Any published architecture details
- How they handle "find the authentication flow" type queries

**Cursor**:
- Codebase indexing approach (chunking, embedding model choice)
- @codebase retrieval mechanism
- Any published or reverse-engineered details

**Aider**:
- "repo map" construction with tree-sitter + token budget
- How aider selects which files to include in context
- Open source — read the code directly

**Continue.dev**:
- Context providers architecture (open source)
- How they combine multiple context sources

**Key comparison dimensions**:
- Query understanding: keyword, semantic, or LLM-interpreted?
- Retrieval strategy: parallel, sequential, or adaptive?
- Reranking: does it exist, and how?
- Multi-hop: do they follow references/callers?

---

## Research Execution Plan

### Phase 1: Literature and Framework Survey (Day 1)
1. arXiv search for papers in Q2 — collect 10-15 most relevant abstracts
2. GitHub search for open-source implementations (Q1)
3. Read Cody and Continue.dev source code for retrieval pipeline patterns

### Phase 2: Tool Deep Dives (Day 1-2)
4. Read Sourcegraph blog posts on Cody context fetching
5. Read aider repo map implementation (aider/repomap.py)
6. Review BFCL leaderboard for small model tool-use rankings (Q4)
7. Review CodeSearchNet and SWE-bench metric definitions (Q3)

### Phase 3: Synthesis (Day 2)
8. Identify the 2-3 most promising planner architectures for claudemem
9. Identify evaluation dataset/metric recommendation
10. Identify candidate local models for query planner role
11. Write findings document with recommendations

---

## Key Decision the Research Should Inform

**Architecture choice**: Which of these approaches should claudemem adopt?

**Option A: Enhanced query expander (current direction)**
- LLM generates parallel retrieval strings
- All retrievals run simultaneously
- Simple merge + rerank
- Low latency, deterministic

**Option B: Sequential query planner (agentic)**
- LLM generates a retrieval plan (ordered steps)
- Each step's results inform the next query
- Higher quality but higher latency and complexity

**Option C: Hybrid (plan then execute in parallel where possible)**
- LLM identifies independent vs. dependent retrieval steps
- Parallelizes where safe, sequences where needed
- Balances quality and latency

**Option D: Learned router (no LLM at inference time)**
- Train a classifier on query type → retrieval strategy
- Zero added latency for planning
- Less flexible, requires training data

---

## Output Format for Findings

The research findings document should include:

1. **Executive summary** (3-5 bullets): key findings and recommendation
2. **Frameworks/tools survey**: table of existing systems with approach + notes
3. **Papers**: annotated bibliography of 8-12 most relevant papers
4. **Evaluation metrics**: recommended metric(s) for claudemem's query planner eval
5. **Model recommendations**: top 2-3 local models for query planner role with rationale
6. **Architecture recommendation**: which option (A/B/C/D) with justification
7. **Implementation sketch**: high-level design for chosen approach

---

## Related claudemem Context

- Current query expansion: `src/llm/prompts/enrichment.ts` (or similar)
- Search pipeline: `src/core/search/`
- Symbol graph: `src/core/graph/`
- MCP tools: `src/mcp/tools/search.ts`
- AgentBench eval conditions: `no_plan`, `claudemem_full`, `dc_planner`, `ace_planner`
  — the `dc_planner` and `ace_planner` conditions already demonstrate sequential planning;
  research should inform whether to bring similar logic into the core retrieval layer
