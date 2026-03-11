In the `{{repo}}` codebase at `{{repo_path}}`, trace the execution path of an MCP tool call.

Specifically: when a client sends a `tools/call` MCP request to the FastMCP server, how does it get dispatched to the Python function that was registered as a tool handler?

Provide:
1. The entry point: which file and function first receives the `tools/call` request
2. The dispatch chain: the sequence of function calls (with file and line) that leads from the entry point to the tool handler
3. The final call site: the exact file and line where the user's Python handler function is invoked

Trace through at least 3 files. Name the actual functions and file paths from the source code.
