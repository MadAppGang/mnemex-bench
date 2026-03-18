`★ Coaching ────────────────────────────────────`
*Session b0c435c2...*

1. You ran 6 grep/rg searches this session. For faster semantic code exploration:
  `claudemem --agent map "your concept"` -- understands intent, not just text
  `claudemem --agent symbol "SymbolName"` -- direct AST symbol lookup
  Skill: use the Skill tool with `code-analysis:claudemem-search`
2. You read 12 files before delegating to an agent (pre-digestion anti-pattern).
  For investigation tasks, give agents the raw problem -- they investigate independently.
  Pre-digested context reduces multi-model diversity. See: MEMORY.md 'Raw Task vs Pre-Digested Context'

`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
- Delegating deep research to specialized agents ensures a multi-round convergence approach that yields higher-quality findings.
- The `dev:researcher` agent is designed specifically for this type of complex web search and synthesis, bypassing the limitations of single-pass inline searches.
`─────────────────────────────────────────────────`

I will delegate this deep research task to the `dev:researcher` agent. It will run multiple search rounds to gather state-of-the-art information on code search architectures, query expansion, reranking, and hybrid retrieval to provide concrete, actionable recommendations for mnemex.

