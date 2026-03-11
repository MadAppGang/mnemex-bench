## Available Tool: claudemem

You have access to the claudemem MCP server for code search and analysis. Available tools include:
- `mcp__claudemem__search` — semantic + keyword hybrid search
- `mcp__claudemem__symbol` — find symbol definition, signature, callers
- `mcp__claudemem__callers` — BFS traversal up the call graph
- `mcp__claudemem__callees` — BFS traversal down the call graph
- `mcp__claudemem__map` — architectural overview of a directory
- `mcp__claudemem__context` — rich context for a file:line position
- `mcp__claudemem__define` — go-to-definition (LSP-backed)
- `mcp__claudemem__references` — find all references (LSP-backed)

**Restriction:** Do NOT use Read, Grep, Glob, or Bash to explore the codebase. Use ONLY the claudemem MCP tools above. The index is pre-built and ready to use.
