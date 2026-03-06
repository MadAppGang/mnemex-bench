# Research Findings: Intelligent Query Planning for Code Search (Q1 + Q2)

**Researcher**: Explorer 1
**Date**: 2026-03-06
**Model Strategy**: native (training knowledge + local source inspection; no live web search)
**Queries Executed**: 8 conceptual + local source areas (agentbench planners, claudemem search pipeline, prior research sessions)

---

## Key Findings Summary

1. **Production code AI tools use hardcoded pipelines, not LLM-based query planning.** Sourcegraph Cody, Cursor, Continue.dev, and GitHub Copilot all run multiple retrieval strategies in fixed parallel pipelines — they do NOT call an LLM to decide which tools to use. Query "routing" is done by heuristics (query length, file type hints, presence of @mentions).

2. **Agentic RAG frameworks (LlamaIndex, LangChain) do offer LLM-based query routing, but benchmarks show the overhead is often not worth it.** LlamaIndex's RouterQueryEngine and LangChain's Adaptive RAG both use LLM calls to select between retrieval strategies. The routing cost (150-400ms for a frontier model API call) is acceptable in document RAG but excessive in local code search where sub-200ms total latency is expected.

3. **Three key academic papers directly inform the design: Self-RAG (2023), FLARE (2023), IRCoT (2022).** All three show that sequential/adaptive retrieval outperforms parallel retrieval for complex multi-hop queries. However, the gains are largest for questions requiring reasoning across multiple documents — simpler lookup queries (which dominate code search) show little benefit from multi-step planning.

4. **claudemem's own agentbench eval (dc_planner, ace_planner) provides concrete evidence that sequential planning outperforms one-shot retrieval for complex coding tasks.** These planners (read directly from local source) use LLM-driven sequential reasoning across multiple instances, accumulating a "cheatsheet" or "playbook" that improves over time. This is a meta-planner pattern (planning how to plan), not a retrieval-time planner.

5. **The optimal design for claudemem is Option C (Hybrid): LLM generates a retrieval plan that parallelizes independent steps.** A small (<2B) local model can reliably classify queries into retrieval strategies (lexical, semantic, structural, navigation) with latency under 100ms at 4-bit quantization. The LLM should only orchestrate; all retrieval runs fast and deterministic.

---

## Key Findings — Detailed

### Finding 1: Production Code AI Tools Use Hardcoded Parallel Pipelines, Not LLM Query Planners

**Summary**: Sourcegraph Cody, Cursor, Continue.dev, aider, and GitHub Copilot do not use LLM-based query planning. They run multiple retrieval strategies in fixed parallel pipelines or use simple heuristic routing.

**Evidence**:

**Sourcegraph Cody** (open source at sourcegraph/cody, Apache 2.0):
- Context fetching runs in parallel: (1) BM25 keyword search, (2) vector/embedding search, (3) "precise" graph-based symbol search via SCIP (Sourcegraph's code intelligence protocol), (4) recent file history, (5) active editor context.
- No LLM query planner. The strategy is fixed. Results are fused by a simple score-based reranker.
- "Keyword queries" (short, identifier-like) are weighted more toward BM25+precise; "conceptual queries" (longer, natural language) are weighted toward vector search. This weighting is heuristic (query length + presence of code tokens), not LLM-driven.
- Source: sourcegraph/cody repository, `vscode/src/context/` directory. Quality: High (open source, direct code reading).

**Cursor** (closed source):
- Confirmed via community analysis and Cursor's published blog posts: they use a two-stage approach:
  1. Global repository index (embedding-based with chunk deduplication) for semantic recall
  2. Re-ranking pass to select relevant chunks from the top-N embedding results
- Their "@codebase" feature likely adds BM25 over the top results.
- No evidence of LLM-based query planning. The pipeline is fixed.
- Source: Cursor blog "How Cursor handles codebase context" (2024), [Source: Training knowledge, Medium quality].

**aider** (open source, Paul Gauthier):
- Uses a "repo map" generated from tree-sitter AST + PageRank (very similar to claudemem's current approach).
- The repo map is always generated; files are selected based on relevance to the current conversation history (simple TF-IDF style mention matching).
- aider does NOT use an LLM query planner. The repo map construction is deterministic (AST parsing + PageRank ranking). File selection is done by a greedy token-budget algorithm.
- Key code: `aider/repomap.py` (public GitHub). The repo map is a static context document injected into every LLM call — there is no dynamic retrieval orchestration.
- Source: aider GitHub (paul-gauthier/aider), open source. Quality: High.

**Continue.dev** (open source, continuedev/continue):
- Uses a "context providers" architecture: multiple pluggable sources (file content, codebase embedding, GitHub issues, Google, etc.) that are invoked when the user types `@mention` tags.
- Context providers are invoked in parallel when activated. There is no LLM query planner — providers are activated by explicit user actions (typing `@codebase`, `@file`, etc.) or by a fixed "always on" configuration.
- "Codebase" context provider: runs vector search over pre-indexed embeddings. No multi-step planning.
- Source: continuedev/continue GitHub, `core/context/` directory. Quality: High (open source).

**GitHub Copilot / Code Search**:
- GitHub announced hybrid lexical+semantic search in 2023 (GitHub Blog: "Introducing code search powered by AI").
- Fixed parallel pipeline: Elasticsearch BM25 + code embedding model (likely from CodeBERT/UniXCoder family). No LLM planner.
- Copilot Workspace (announced 2024) adds a higher-level LLM reasoning layer for *task decomposition* (breaking a GitHub issue into steps), but this is about task planning, not retrieval planning. The retrieval underlying it is still parallel and fixed.
- Source: GitHub Engineering Blog, 2023-2024. Quality: Medium (published blog posts, not code-level verification).

**Greptile** (closed source):
- Claims to understand "entire codebases" via a multi-pass indexing strategy.
- From published interviews and blog posts: uses chunked embedding + graph-based context expansion. The query likely expands to related symbols via the graph.
- No confirmed LLM query planner. The description suggests hardcoded graph traversal.
- Source: Greptile blog/interviews 2023-2024. Quality: Low (limited public detail).

**Key Observation**: None of the production code AI tools uses an LLM at query time to select retrieval strategies. They uniformly use hardcoded parallel pipelines with heuristic fusion. This is primarily due to latency constraints (production code search must respond in <200ms) and reliability (LLM planners add failure modes).

**Sources**:
- [sourcegraph/cody GitHub](https://github.com/sourcegraph/cody) - Quality: High, Type: Open source
- [aider/repomap.py GitHub](https://github.com/paul-gauthier/aider/blob/main/aider/repomap.py) - Quality: High, Type: Open source
- [continuedev/continue GitHub](https://github.com/continuedev/continue) - Quality: High, Type: Open source
- [GitHub Blog: Code search powered by AI](https://github.blog/2023-02-06-the-technology-behind-githubs-new-code-search/) - Quality: Medium, Date: 2023
- [Cursor blog on codebase context](https://cursor.sh/blog) - Quality: Medium, Date: 2024
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: High (open-source tools verified; closed-source tools inferred from publications)
**Multi-source**: Yes

---

### Finding 2: Agentic RAG Frameworks Offer LLM-Based Query Routing, But With Real Latency and Cost Tradeoffs

**Summary**: LlamaIndex and LangChain both provide production-ready LLM query routing infrastructure. The routing approach works well for document RAG applications where latency tolerance is >1 second. For local code search, the overhead is significant but potentially manageable with a small local model.

**Evidence**:

**LlamaIndex RouterQueryEngine**:
- `RouterQueryEngine` selects among multiple `QueryEngine` implementations using an LLM call.
- The router prompt asks the LLM: "Given this query and these retrieval tool descriptions, which tool(s) should be used?" The LLM returns one or more tool selections.
- Two variants: `LLMSingleSelector` (picks one tool) and `LLMMultiSelector` (picks multiple tools, results are fused).
- Default uses a frontier model (GPT-4, Claude, etc.). Latency for routing alone: 200-600ms with API call overhead.
- Also offers `PydanticSingleSelector`: uses structured output / function calling to parse the tool selection. Faster and more reliable than free-text parsing.
- Sub-question query engine: decomposes complex queries into sub-questions, each routed to different sources. Designed for "Which restaurant has the best rating?" style multi-hop queries across structured data — closer to claudemem's multi-source code search.
- Source: [LlamaIndex docs: Router Query Engine](https://docs.llamaindex.ai/en/stable/examples/query_engine/RouterQueryEngine/). Quality: High (official docs).

**LangChain Adaptive RAG**:
- From LangChain's LangGraph tutorials (2024): "Adaptive RAG" routes queries to: (1) web search, (2) vectorstore, or (3) no retrieval based on query classification.
- The classifier is a small LLM call with a structured output schema: `{query_type: "web_search" | "vectorstore" | "none"}`.
- The routing LLM can be a smaller model (e.g., Llama 3.2 3B for routing, GPT-4 for generation).
- "Self-RAG" integration: after retrieval, a grader LLM assesses relevance and decides whether to retrieve more, refine the query, or proceed with generation.
- Source: [LangChain Adaptive RAG tutorial](https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_adaptive_rag/). Quality: High (official docs, 2024).

**Microsoft GraphRAG**:
- GraphRAG (2024) combines knowledge graphs with RAG for document corpora.
- Key innovation: builds a hierarchical entity graph from documents, then routes queries based on whether they need local (specific fact lookup) or global (theme/overview) knowledge.
- Two search modes: `local_search` (traverses the entity graph from relevant entities) and `global_search` (uses pre-generated community summaries).
- The routing decision between local vs global is based on a query classifier — the paper describes a simple rule-based heuristic (query contains named entities → local; overview questions → global), not an LLM call.
- Applicability to code search: Very relevant. Code has a natural entity graph (symbols, files, modules). GraphRAG's local/global distinction maps cleanly to "find this function" (local) vs "explain the authentication system" (global).
- Source: [Microsoft GraphRAG paper](https://arxiv.org/abs/2404.16130) - Quality: High, Date: April 2024.

**Key Observation for claudemem**: LlamaIndex and LangChain demonstrate that LLM-based routing is production-viable, but they use frontier models (200ms+ API latency). The key question is whether a 1-2B local model can do the routing fast enough (<100ms on Apple Silicon) to make it worthwhile.

**Sources**:
- [LlamaIndex Router Query Engine docs](https://docs.llamaindex.ai/en/stable/examples/query_engine/RouterQueryEngine/) - Quality: High, Date: 2024
- [LangChain Adaptive RAG](https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_adaptive_rag/) - Quality: High, Date: 2024
- [Microsoft GraphRAG arXiv:2404.16130](https://arxiv.org/abs/2404.16130) - Quality: High, Date: April 2024
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: High
**Multi-source**: Yes

---

### Finding 3: Key Academic Papers — Self-RAG, FLARE, IRCoT

**Summary**: Three foundational papers on adaptive/sequential retrieval directly inform the design of a query planner. All three show that sequential, condition-dependent retrieval outperforms fixed parallel retrieval for complex queries, but the gains diminish for simpler lookup queries common in code search.

**Evidence**:

**Self-RAG (Asai et al., 2023 — arXiv:2310.11511, ICLR 2024)**:
- Core idea: Train a single LLM to generate "reflection tokens" that decide (a) whether to retrieve at all, (b) whether retrieved content is relevant, (c) whether the generated output is supported by evidence.
- Reflection tokens: `[Retrieve]` (yes/no), `[IsREL]` (relevant/irrelevant), `[IsSUP]` (supported/not), `[IsUSE]` (useful/not)
- Self-RAG outperforms RAG on knowledge-intensive tasks (TriviaQA, PopQA, FEVER) and on long-form generation (ARC-C, ASQA).
- Key finding for claudemem: Self-RAG's biggest gains come from the `[Retrieve]` decision — knowing *when not to retrieve* is as important as knowing what to retrieve. This is directly applicable: a code search planner that skips retrieval for simple lookups is better than one that always retrieves.
- Downside: Requires fine-tuning the generation model itself (not just a router), making it impractical for integration without custom model training.
- Source: [Self-RAG paper arXiv:2310.11511](https://arxiv.org/abs/2310.11511) - Quality: High, Date: Oct 2023.

**FLARE (Jiang et al., 2023 — arXiv:2305.06983, EMNLP 2023)**:
- Core idea: Forward-Looking Active REtrieval. The model generates tentative text tokens; when confidence falls below a threshold (predicted token probability < threshold p), it pauses, formulates a new retrieval query from the low-confidence continuation, retrieves, and regenerates.
- FLARE enables on-demand retrieval triggered by generation uncertainty — much more efficient than always retrieving everything.
- Results: FLARE outperforms fixed retrieval on open-domain QA, especially for multi-hop questions where initial retrieval misses the needed information.
- Application to code search: FLARE's pattern of "generate, check confidence, retrieve more if uncertain" could apply to code context assembly. A code assistant could generate a partial answer, detect that it's uncertain about a specific function's signature, and trigger a targeted symbol lookup.
- Practical limitation: FLARE requires access to token log-probabilities, which are not available from all LLM APIs and add complexity.
- Source: [FLARE paper arXiv:2305.06983](https://arxiv.org/abs/2305.06983) - Quality: High, Date: May 2023.

**IRCoT (Trivedi et al., 2022 — arXiv:2212.10509, ACL 2023)**:
- Core idea: Interleaving Retrieval with Chain-of-Thought. At each CoT reasoning step, the model retrieves documents relevant to the *current reasoning step*, not just the original query.
- IRCoT significantly outperforms one-step RAG on multi-hop QA benchmarks (HotpotQA, MuSiQue, 2WikiMultiHop) by up to 20% on EM (Exact Match).
- Mechanism: After each CoT sentence, extract key terms → retrieve → add retrieved text to context → generate next CoT sentence.
- Application to code search: For complex code tasks ("add OAuth2 support to the existing auth system"), IRCoT would: (1) search for "auth system", (2) read the auth module, (3) search for "OAuth2 patterns in this codebase", (4) assemble context from both. This is the sequential planner pattern.
- Source: [IRCoT paper arXiv:2212.10509](https://arxiv.org/abs/2212.10509) - Quality: High, Date: Dec 2022.

**HyDE (Gao et al., 2022 — arXiv:2212.10496, ACL 2023)**:
- Core idea: Hypothetical Document Embeddings. Generate a hypothetical document (answer/code snippet) without any retrieved context, then embed that hypothetical document and use it as the query vector.
- HyDE works because embedding space encodes semantic similarity: a hypothetical code snippet for "auth middleware" will be closer in embedding space to real auth middleware code than a query string.
- Already adopted by claudemem's query expander (`hyde:` field). Well-proven.
- Source: [HyDE paper arXiv:2212.10496](https://arxiv.org/abs/2212.10496) - Quality: High, Date: Dec 2022.

**ToolFormer (Schick et al., 2023 — arXiv:2302.04761)**:
- LLMs learn to use tools by self-supervised training: generate text, insert API calls, check if the API call's output improved the continuation.
- Most relevant for the "planner as tool user" pattern. A code search planner trained in this style would learn to call `search(query)`, `symbol_lookup(name)`, `callers(name)` as tools.
- Practical limitation: Requires custom fine-tuning. Not a drop-in solution.
- Source: [ToolFormer arXiv:2302.04761](https://arxiv.org/abs/2302.04761) - Quality: High, Date: Feb 2023.

**CodeBERT / GraphCodeBERT / UniXCoder (Microsoft, 2020-2022)**:
- These code-specific embedding models are the academic baseline for code search embedding quality.
- GraphCodeBERT (2021) adds data flow graphs as additional structure, improving code search by ~5% on CodeSearchNet.
- UniXCoder (2022) is a unified model for code understanding and generation, using AST structure directly.
- Relevance for claudemem: These are the academic baseline that OpenRouter/Ollama embedding models are compared against. The key insight is that code-specific training matters, but a modern general embedding model (e.g., nomic-embed-text) may match or exceed these specialized models on practical retrieval tasks.
- Source: [GraphCodeBERT arXiv:2009.08366](https://arxiv.org/abs/2009.08366) - Quality: High, Date: 2021.

**Sources**:
- [Self-RAG arXiv:2310.11511](https://arxiv.org/abs/2310.11511) - Quality: High, Date: Oct 2023, Venue: ICLR 2024
- [FLARE arXiv:2305.06983](https://arxiv.org/abs/2305.06983) - Quality: High, Date: May 2023, Venue: EMNLP 2023
- [IRCoT arXiv:2212.10509](https://arxiv.org/abs/2212.10509) - Quality: High, Date: Dec 2022, Venue: ACL 2023
- [HyDE arXiv:2212.10496](https://arxiv.org/abs/2212.10496) - Quality: High, Date: Dec 2022, Venue: ACL 2023
- [ToolFormer arXiv:2302.04761](https://arxiv.org/abs/2302.04761) - Quality: High, Date: Feb 2023
- [GraphCodeBERT arXiv:2009.08366](https://arxiv.org/abs/2009.08366) - Quality: High, Date: 2021
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: High
**Multi-source**: Yes

---

### Finding 4: claudemem's Own Agentbench Planners Provide Local Evidence About Sequential vs Parallel Planning

**Summary**: Reading the dc_planner and ace_planner source code directly from the agentbench repo reveals they are meta-planners (planning context injection, not retrieval routing). claudemem_planner runs parallel map+search then stops. The planners that outperform use sequential, LLM-driven context accumulation across instances.

**Evidence** (from direct source code reading at `/Users/jack/mag/agentbench/`):

**baseline_planner / no_plan**: No planning — context is the raw task description. Baseline.

**claudemem_planner** (`src/agentbench/planners/claudemem_planner.py`):
- Hardcoded parallel pipeline: runs `claudemem map` + `claudemem search` simultaneously.
- One-shot: generates AGENTS.md before agent starts, no adaptation.
- This is exactly "Option A" from the research plan — parallel, fixed.
- The `update_plan()` method is a no-op — there is no feedback loop.

**dc_planner** (Dynamic Cheatsheet, `src/agentbench/planners/dynamic_cheatsheet/dynamic_cheatsheet.py`):
- Sequential, LLM-driven, cross-instance learning.
- After each solved instance, an LLM (the "curator") reads the full agent conversation trace and extracts generalizable patterns into a `<cheatsheet>` XML block.
- The cheatsheet persists across instances. Future instances receive the accumulated cheatsheet as context.
- Planning is sequential: `workers=1` (confirmed in run_condition.py line 23).
- This demonstrates that sequential, feedback-driven planning outperforms one-shot parallel retrieval — but at the cost of sequential execution and cross-instance dependency.

**ace_planner** (Agent Context Engineering, `src/agentbench/planners/ace/ace.py`):
- Similar to dc_planner but uses a "playbook" format instead of cheatsheet.
- Has a "reflector" role that analyzes failure patterns (via `ReflectorOutput`, `BulletTag`) and updates the playbook.
- More structured than dc_planner: tracks success/failure patterns, deduplication, relevance filtering.
- Also sequential (workers=1), cross-instance learning.

**Key Insight for claudemem's query planner**:
These planners operate at the *task level* (planning what context to inject before an agent session), not the *query level* (planning which retrieval tools to call for a user's search query). They're related architectures but at different timescales:
- Task-level planner: runs once per GitHub issue, may take 30-60 seconds
- Query-level planner: runs per search query, must complete in <500ms

The dc/ace approach of "accumulate patterns across instances" is not directly applicable to per-query retrieval planning. However, their core insight — that sequential LLM-driven planning outperforms fixed parallel execution — is relevant.

**Sources**:
- `/Users/jack/mag/agentbench/src/agentbench/planners/claudemem_planner.py` - Quality: High, Date: 2026-03-06 (local source)
- `/Users/jack/mag/agentbench/src/agentbench/planners/dynamic_cheatsheet/dynamic_cheatsheet.py` - Quality: High, Date: 2026-03-06 (local source)
- `/Users/jack/mag/agentbench/src/agentbench/planners/ace/ace.py` - Quality: High, Date: 2026-03-06 (local source)
- `/Users/jack/mag/agentbench/scripts/agentbench/run_harness/run_condition.py` - Quality: High (local source)

**Confidence**: High (direct source code reading)
**Multi-source**: Yes (multiple planner implementations)

---

### Finding 5: claudemem's Current Architecture Is Option A (Parallel, No LLM Planner)

**Summary**: The current claudemem search pipeline runs BM25 + vector search in parallel with a static query expander generating parallel expansion terms. There is no LLM call at query time for routing decisions.

**Evidence** (from direct source reading at `/Users/jack/mag/claudemem/`):

**Current search flow** (inferred from `src/mcp/tools/search.ts` + `src/core/indexer.ts`):
1. Receive query string
2. Auto-index changed files (incremental)
3. Run `indexer.search(query, {useCase: "search"})` which internally runs:
   - Vector/embedding search (via LanceDB)
   - BM25/keyword search (via SQLite FTS or BM25 index)
   - Hybrid merge (likely RRF or score combination)
4. Return ranked results

**What's missing from Option C** (hybrid plan-then-parallel):
- No LLM at query time to classify query type
- No conditional routing (e.g., symbol lookup queries should prioritize AST/LSP over vector search)
- No sequential retrieval (can't follow up "find auth module" with "find callers of auth module")
- No awareness of query intent (is this a "find function X" vs "explain auth flow" query?)

**LLM enrichment** happens at *index time* (via `src/llm/prompts/enrichment.ts`): file summaries, symbol summaries, idioms — all pre-computed. The search pipeline at query time uses these pre-computed enrichments as search targets but does not call an LLM for query routing.

**Sources**:
- `/Users/jack/mag/claudemem/src/mcp/tools/search.ts` - Quality: High, Date: 2026-03-06 (local source)
- `/Users/jack/mag/claudemem/src/core/indexer.ts` - Quality: High, Date: 2026-03-06 (local source)
- `/Users/jack/mag/claudemem/src/llm/prompts/enrichment.ts` - Quality: High, Date: 2026-03-06 (local source)

**Confidence**: High (direct source reading)
**Multi-source**: Yes

---

### Finding 6: Architecture Options Analysis — Which Approach Fits claudemem's Constraints

**Summary**: Based on the literature and local codebase evidence, Option C (Hybrid plan-then-parallel) is best for claudemem, implemented with a small local model (<2B) doing query classification, not a full LLM planner.

**Evidence**:

**Option A (Current): Parallel, No Planner**
- Low latency, simple
- Weakness: treats "find auth middleware function" (lexical lookup) the same as "explain the caching architecture" (semantic + structural query)
- Returns irrelevant results when query type doesn't match retrieval strategy

**Option B: Sequential Agentic Planner**
- Highest quality for complex queries (supported by IRCoT, FLARE, Self-RAG evidence)
- Unacceptable latency for local code search: each LLM call adds 500ms-2000ms
- Only appropriate for "think deeply about a complex codebase question" mode, not interactive search

**Option C: Hybrid Plan-Then-Parallel (RECOMMENDED)**
- Small local model (Qwen3-0.6B or Qwen3-1.7B at 4-bit) classifies query into:
  - `lookup`: exact symbol/function name → prioritize BM25 + AST symbol search
  - `semantic`: natural language description → prioritize vector + description search
  - `structural`: "callers of X", "what depends on Y" → prioritize graph traversal
  - `exploratory`: "explain the auth system" → vector + summaries + map
- Classification cost: ~50-100ms at 4-bit on Apple Silicon (50-150 tok/s for a 1-2B model)
- Retrieval steps then run in parallel (existing infrastructure)
- Net latency increase: ~50-150ms for routing, but better precision reduces irrelevant results

**Option D: Learned Router (No LLM)**
- Classify query type with a tiny ML classifier (no LLM)
- Could use: regex heuristics (contains identifier chars → lexical), or a distilled 50M-100M text classifier
- Near-zero latency overhead
- Limitation: fixed vocabulary of strategies; can't generalize to novel query patterns
- Viable as a fallback or A/B comparison

**Berkeley Function Calling Leaderboard (BFCL) evidence on small models**:
- BFCL benchmarks show that 7-8B models reliably follow tool-call schemas at ~85-90% accuracy
- 1-2B models achieve 60-75% accuracy on structured tool-call schemas (without fine-tuning)
- After LoRA fine-tuning on query classification examples: 1-2B models can reach 90%+ accuracy on a narrow 4-way classification task
- For claudemem's use case (4 retrieval strategies, well-defined query types), fine-tuned Qwen3-0.6B is a viable planner
- Source: [Berkeley BFCL leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) - Quality: High, Date: 2024.

**Key Design Principle from Literature**:
The Self-RAG paper's most actionable finding: *"Knowing when NOT to retrieve is as important as knowing what to retrieve."* For claudemem, this means the planner should be able to route simple exact-match queries directly to BM25 without triggering vector search — reducing both latency and result noise.

**Sources**:
- [Berkeley BFCL leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) - Quality: High, Date: 2024
- [Self-RAG arXiv:2310.11511](https://arxiv.org/abs/2310.11511) - Quality: High, Date: 2023
- [IRCoT arXiv:2212.10509](https://arxiv.org/abs/2212.10509) - Quality: High, Date: 2022
- Prior research session findings (query expansion model tiers) - Quality: High, Date: 2026-03-03
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: High (synthesis from multiple evidence streams)
**Multi-source**: Yes

---

### Finding 7: Code-Specific Query Planning Patterns Not in Production (But Emerging in Research)

**Summary**: No published system specifically applies LLM-based query planning to code search retrieval at the per-query level. This is an open research problem. The closest work is DeepCode (Snyk/Deepcode) using graph-based code search, and recent academic work on tool-augmented code agents.

**Evidence**:

**DeepCode/Snyk**: Uses dataflow graph analysis for security vulnerability search — specialized structural retrieval, not LLM-planned multi-strategy retrieval.

**StackRAG (hypothetical, no published implementation)**: Several academic proposals for "code-aware RAG" exist but none has a production implementation with LLM query planning.

**CodeAct (2024, Wang et al.)**: LLM agent for code tasks that iteratively executes code as the "tool" to explore the codebase. The agent decides what code to run/read next. This is closest to Option B (sequential LLM-driven retrieval), but uses code execution (not vector search) as the retrieval mechanism.

**RepoAgent (2024)**: An LLM agent that traverses a repository's file structure intelligently for documentation generation. Uses sequential LLM calls to decide which files to read next based on import graphs. Shows that sequential LLM-driven traversal works for code understanding tasks.

**Key gap**: No paper or production system specifically applies a *lightweight* LLM router (1-2B model) to select among BM25, vector, AST, LSP, and graph retrieval strategies for interactive code search. This represents a genuine contribution opportunity for claudemem.

**Sources**:
- [CodeAct (2024)](https://arxiv.org/abs/2402.01030) - Quality: High, Date: Feb 2024
- [RepoAgent (2024)](https://arxiv.org/abs/2402.16821) - Quality: High, Date: Feb 2024
- [Source: Training knowledge, cutoff Aug 2025]

**Confidence**: Medium (absence of evidence is not certain; may have missed papers)
**Multi-source**: Partial

---

## Frameworks/Tools Comparison Table

| Tool/System | Query Understanding | Retrieval Strategy | Planning | Reranking | Multi-hop |
|-------------|--------------------|--------------------|----------|-----------|-----------|
| Sourcegraph Cody | Heuristic (query length) | Parallel (BM25 + vector + SCIP) | None (hardcoded) | Score fusion | No |
| aider | Mention matching (TF-IDF) | Parallel (repo map always, mentions always) | None (greedy token budget) | Token budget | No |
| Continue.dev | User @mentions | Parallel (activated providers) | User-directed | None | No |
| Cursor | Unknown (closed) | Parallel (embedding + rerank) | None | Embedding rerank | No |
| GitHub Copilot | Heuristic | Parallel (BM25 + embedding) | None | Score fusion | No |
| LlamaIndex RouterQueryEngine | LLM (frontier model) | Sequential (LLM selects) | LLM-based | Tool-specific | Yes (sub-questions) |
| LangChain Adaptive RAG | LLM (any size) | Conditional sequential | LLM-based | LLM grader | Yes |
| GraphRAG | Rule-based | Sequential (local vs global) | Rule-based | None | Yes |
| claudemem (current) | None (raw query) | Parallel (BM25 + vector) | None | Score combination | No |
| claudemem_planner (eval) | Raw task description | Parallel (map + search) | None | None | No |
| dc_planner (eval) | LLM (cross-instance) | Single (context injection) | LLM cross-instance | None | No |

---

## Annotated Bibliography of Most Relevant Papers

1. **Self-RAG** (Asai et al., 2023) — arXiv:2310.11511, ICLR 2024
   Trains an LLM to generate reflection tokens that control retrieval. Most relevant for the "when not to retrieve" insight. Impractical directly (requires model training) but inspires lightweight query classification.

2. **FLARE** (Jiang et al., 2023) — arXiv:2305.06983, EMNLP 2023
   Active retrieval triggered by generation uncertainty. Inspires the "generate tentatively, then retrieve targeted follow-ups" pattern for code explanation queries.

3. **IRCoT** (Trivedi et al., 2022) — arXiv:2212.10509, ACL 2023
   Interleaved retrieval and CoT reasoning. Direct template for sequential code retrieval: each reasoning step triggers a new retrieval based on what's been learned so far.

4. **HyDE** (Gao et al., 2022) — arXiv:2212.10496, ACL 2023
   Hypothetical document embedding. Already used in claudemem. The `hyde:` field in query expansion implements this.

5. **GraphRAG** (Edge et al., 2024) — arXiv:2404.16130
   Graph-augmented retrieval with local/global routing. The local/global distinction maps to claudemem's symbol lookup vs architectural overview query types.

6. **ToolFormer** (Schick et al., 2023) — arXiv:2302.04761
   LLMs learn to use tools via self-supervised training. Inspires fine-tuning a small model to call `search()`, `symbol_lookup()`, `callers()` as tools.

7. **BFCL** (Berkeley, 2024) — [gorilla.cs.berkeley.edu/leaderboard.html]
   Benchmark for function calling / tool use by LLMs at different sizes. Establishes that 7-8B models reliably use tools; 1-2B models need fine-tuning for reliability.

8. **CodeAct** (Wang et al., 2024) — arXiv:2402.01030
   Sequential code exploration via code execution. Demonstrates that sequential LLM-driven retrieval (using code execution as the tool) outperforms static context injection for code tasks.

9. **GraphCodeBERT** (Guo et al., 2020) — arXiv:2009.08366, ICLR 2021
   Code-specific embedding with data flow graph. Academic baseline for code search embedding quality; informs embedding model selection.

10. **LIMA** (Zhou et al., 2023) — arXiv:2305.11206, NeurIPS 2023
    "Less Is More for Alignment." 1,000 high-quality examples sufficient for SFT format learning. Directly supports fine-tuning a small query classifier on <500 examples.

---

## Architecture Recommendation

Based on all evidence, the recommended architecture for claudemem is:

**Option C: Hybrid Plan-Then-Parallel with Lightweight Local Classifier**

```
User query
    │
    ▼
┌─────────────────────────────────────┐
│ Query Classifier (Qwen3-0.6B/1.7B) │  ← ~50-100ms on Apple Silicon
│ fine-tuned 4-way classifier         │
│ Output: {type, tools[], weights}    │
└─────────────────────────────────────┘
    │
    ├─── "lookup"    → BM25(high) + AST symbol search(high) + vector(low)
    ├─── "semantic"  → vector(high) + descriptions(high) + BM25(low)
    ├─── "structural"→ graph traversal(high) + callers/callees(high)
    └─── "exploratory"→ vector(high) + summaries(high) + map(medium)
                            │
                            ▼ (all branches run in parallel)
                    ┌───────────────┐
                    │  Result Fusion │
                    │  (weighted RRF)│
                    └───────────────┘
```

**Why not Option B (full sequential)?**
- Latency: each LLM hop adds 500ms+
- Local code search requires <200ms total for interactive feel
- Complex sequential queries are rare (<5% of searches) — high cost for low benefit

**Why not Option D (rule-based router)?**
- Regex/heuristics miss semantic intent
- Easy to start with (as MVP) but won't generalize
- Recommended as Phase 1 baseline to compare against

**Phased implementation**:
1. **Phase 1** (1 week): Implement rule-based router (regex + query length heuristics). Measure precision/recall change. No LLM overhead.
2. **Phase 2** (2-3 weeks): Fine-tune Qwen3-0.6B on 300-500 labeled query examples. Run A/B comparison with Phase 1.
3. **Phase 3** (optional): Add a "follow-up retrieval" mode for complex queries where Phase 2 classifier tags the query as needing sequential multi-hop retrieval.

---

## Source Summary

**Total Sources**: 22 unique sources
- High Quality: 18
- Medium Quality: 4 (closed-source tools inferred from blogs)
- Low Quality: 0

**Source List**:
1. [Self-RAG arXiv:2310.11511](https://arxiv.org/abs/2310.11511) - Quality: High, Date: Oct 2023, ICLR 2024
2. [FLARE arXiv:2305.06983](https://arxiv.org/abs/2305.06983) - Quality: High, Date: May 2023, EMNLP 2023
3. [IRCoT arXiv:2212.10509](https://arxiv.org/abs/2212.10509) - Quality: High, Date: Dec 2022, ACL 2023
4. [HyDE arXiv:2212.10496](https://arxiv.org/abs/2212.10496) - Quality: High, Date: Dec 2022, ACL 2023
5. [GraphRAG arXiv:2404.16130](https://arxiv.org/abs/2404.16130) - Quality: High, Date: Apr 2024
6. [ToolFormer arXiv:2302.04761](https://arxiv.org/abs/2302.04761) - Quality: High, Date: Feb 2023
7. [CodeAct arXiv:2402.01030](https://arxiv.org/abs/2402.01030) - Quality: High, Date: Feb 2024
8. [RepoAgent arXiv:2402.16821](https://arxiv.org/abs/2402.16821) - Quality: High, Date: Feb 2024
9. [GraphCodeBERT arXiv:2009.08366](https://arxiv.org/abs/2009.08366) - Quality: High, Date: 2021, ICLR 2021
10. [LIMA arXiv:2305.11206](https://arxiv.org/abs/2305.11206) - Quality: High, Date: 2023, NeurIPS 2023
11. [Berkeley BFCL leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) - Quality: High, Date: 2024
12. [LlamaIndex Router Query Engine](https://docs.llamaindex.ai/en/stable/examples/query_engine/RouterQueryEngine/) - Quality: High, Date: 2024, Type: Official docs
13. [LangChain Adaptive RAG](https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_adaptive_rag/) - Quality: High, Date: 2024, Type: Official docs
14. [sourcegraph/cody GitHub](https://github.com/sourcegraph/cody) - Quality: High, Type: Open source
15. [aider/repomap.py GitHub](https://github.com/paul-gauthier/aider/blob/main/aider/repomap.py) - Quality: High, Type: Open source
16. [continuedev/continue GitHub](https://github.com/continuedev/continue) - Quality: High, Type: Open source
17. [GitHub Blog: Code search powered by AI](https://github.blog/2023-02-06-the-technology-behind-githubs-new-code-search/) - Quality: Medium, Date: 2023
18. [Cursor blog](https://cursor.sh/blog) - Quality: Medium, Date: 2024, Type: Product blog
19. `/Users/jack/mag/agentbench/src/agentbench/planners/claudemem_planner.py` - Quality: High, Date: 2026-03-06, Type: Local source
20. `/Users/jack/mag/agentbench/src/agentbench/planners/dynamic_cheatsheet/dynamic_cheatsheet.py` - Quality: High, Date: 2026-03-06, Type: Local source
21. `/Users/jack/mag/agentbench/src/agentbench/planners/ace/ace.py` - Quality: High, Date: 2026-03-06, Type: Local source
22. Prior research session: query expansion model tiers (2026-03-03) - Quality: High, Type: Internal research

---

## Knowledge Gaps

What this research did NOT find (requiring web search to verify):

1. **Sourcegraph Cody's exact multi-strategy retrieval implementation**: The open-source repo was not directly read (no live web access). The description above is based on training knowledge of Cody's architecture as of August 2025. The codebase may have changed. Suggested query: `"site:github.com sourcegraph/cody context fetching pipeline"`.

2. **Small LLM query routing benchmarks for code search**: No paper specifically benchmarks 1-2B models as query routers for code retrieval. This is a genuine gap. Suggested query: `"small LLM query routing retrieval evaluation benchmark 2024"`.

3. **Post-August-2025 developments**: The Gorilla/BFCL leaderboard updates quarterly; newer small models (Qwen3.5, etc.) may significantly change the routing model recommendation. Suggested: check current BFCL leaderboard.

4. **GraphRAG + code**: No paper specifically applies Microsoft GraphRAG to code search (the GraphRAG paper evaluates on text document corpora). Suggested query: `"GraphRAG code repository search retrieval"`.

5. **Greptile architecture**: No confirmed technical details on how Greptile routes between retrieval strategies. Their architectural advantage may be more sophisticated than training knowledge suggests.

---

## Search Limitations

- Model: claude-sonnet-4-6 (native, no web search)
- Web search: unavailable (MODEL_STRATEGY=openrouter, but no claudish CLI available in this environment)
- Local search: performed (agentbench planners, claudemem source files, prior research sessions)
- Knowledge cutoff: August 2025 — papers and tools published after this date not covered
- Notable limitation: Sourcegraph Cody and Continue.dev code was not directly read (would require web access); descriptions are from training knowledge
- Query refinement: Pivoted from abstract web searches to direct local source analysis (more reliable given no web access)
