## Available Tool: mnemex

You have access to the mnemex MCP server for code search and analysis. Available tools include:
- `mcp__mnemex__search` — semantic + keyword hybrid search
- `mcp__mnemex__symbol` — find symbol definition, signature, callers
- `mcp__mnemex__callers` — BFS traversal up the call graph
- `mcp__mnemex__callees` — BFS traversal down the call graph
- `mcp__mnemex__map` — architectural overview of a directory
- `mcp__mnemex__context` — rich context for a file:line position
- `mcp__mnemex__define` — go-to-definition (LSP-backed)
- `mcp__mnemex__references` — find all references (LSP-backed)

**Restriction:** Do NOT use Read, Grep, Glob, or Bash to explore the codebase. Use ONLY the mnemex MCP tools above. The index is pre-built and ready to use.
