/**
 * Scenario definitions for cognitive memory E2E eval.
 *
 * Each scenario defines a task prompt, observations (for condition C),
 * and expected files that a correct answer should reference.
 */

export interface Scenario {
	id: number;
	repo: "mnemex" | "fastmcp";
	title: string;
	task: string;
	observations: Array<{
		content: string;
		file: string;
		type: string;
	}>;
	expectedFiles: string[];
}

export const REPOS = {
	mnemex: {
		slug: "mnemex",
		path: process.cwd(), // this repo
	},
	fastmcp: {
		slug: "jlowin_fastmcp",
		path: `${process.env.HOME}/mag/agentbench/data/eval-repos/jlowin_fastmcp`,
	},
} as const;

export const SCENARIOS: Scenario[] = [
	// ── mnemex scenarios ──────────────────────────────────────────────

	{
		id: 1,
		repo: "mnemex",
		title: "Bug: --agent flag ordering",
		task: "The `--agent` flag doesn't seem to work when placed after the command name (e.g., `mnemex search --agent`). Investigate why and explain the root cause. Do NOT make any code changes.",
		observations: [
			{
				content:
					"The --agent flag is stripped from args before command dispatch. Must be placed before the command name. Check the flag-alias ordering in cli.ts.",
				file: "src/cli.ts",
				type: "gotcha",
			},
		],
		expectedFiles: ["src/cli.ts"],
	},
	{
		id: 2,
		repo: "mnemex",
		title: "Feature: dead-code CSV output",
		task: 'Add a `--format csv` option to the `dead-code` command that outputs results as CSV (columns: symbol,file,line,pageRank,callerCount) instead of the default table format.',
		observations: [
			{
				content:
					"Dead code detection uses CodeAnalyzer.findDeadCode() with maxPageRank threshold. Results are printed via agentOutput.deadCodeOutput() in agent mode or renderTable() in interactive mode.",
				file: "src/core/analysis/analyzer.ts",
				type: "architecture",
			},
		],
		expectedFiles: [
			"src/cli.ts",
			"src/core/analysis/analyzer.ts",
		],
	},
	{
		id: 3,
		repo: "mnemex",
		title: "Architecture: search scoring",
		task: "How does the search scoring system work? Explain the fusion of vector and keyword results, and how document type weights affect ranking. Do NOT make any code changes.",
		observations: [
			{
				content:
					"Search uses typeAwareRRFFusion combining vector similarity (0.6 weight) and BM25 keyword scores (0.4 weight). Each DocumentType has per-use-case weights in USE_CASE_WEIGHTS.",
				file: "src/core/search/fusion.ts",
				type: "architecture",
			},
		],
		expectedFiles: [
			"src/core/search/fusion.ts",
			"src/core/search/hybrid.ts",
		],
	},
	{
		id: 4,
		repo: "mnemex",
		title: "Debug: empty search results",
		task: "Search results sometimes return empty when the index exists and has documents. What could cause this? Investigate the codebase and explain. Do NOT make any code changes.",
		observations: [
			{
				content:
					"Embedding dimension mismatch causes automatic table clear — the VectorStore detects dimension changes and wipes the table. This happens when switching embedding providers without re-indexing.",
				file: "src/core/store.ts",
				type: "gotcha",
			},
		],
		expectedFiles: ["src/core/store.ts"],
	},
	{
		id: 5,
		repo: "mnemex",
		title: "Trace: indexing pipeline",
		task: "I need to understand the full indexing pipeline from when a user runs `mnemex index` to when chunks are stored. Trace the execution path and list the key functions in order. Do NOT make any code changes.",
		observations: [
			{
				content:
					"Indexing pipeline: cli.ts handleIndex → Indexer.index() → discoverFiles → chunkFileByPath (AST chunker) → embeddingsClient.embed() → vectorStore.addChunks(). File tracker (SQLite) records hashes for incremental reindex.",
				file: "src/core/indexer/indexer.ts",
				type: "architecture",
			},
		],
		expectedFiles: [
			"src/cli.ts",
			"src/core/indexer/indexer.ts",
			"src/core/chunker.ts",
		],
	},
	{
		id: 11,
		repo: "mnemex",
		title: "Architecture: embedding providers",
		task: "What embedding providers does mnemex support and how does the code route between them? Explain the provider selection logic and any fallback behavior. Do NOT make any code changes.",
		observations: [
			{
				content:
					"Embedding providers: Voyage AI (direct), OpenRouter, Ollama (local), LM Studio. Provider is selected by MNEMEX_EMBEDDINGS env var prefix (voyage/, ollama/, lmstudio/) or auto-detected from available API keys. See createEmbeddingsClient() in embeddings.ts.",
				file: "src/core/embeddings.ts",
				type: "architecture",
			},
		],
		expectedFiles: ["src/core/embeddings.ts"],
	},
	{
		id: 12,
		repo: "mnemex",
		title: "Architecture: enrichment pipeline",
		task: "How does the LLM enrichment system work? What gets enriched, what prompts are used, and how are results stored? Do NOT make any code changes.",
		observations: [
			{
				content:
					"Enrichment generates file summaries and symbol summaries via LLM. enricher.ts orchestrates: groups files by importance (PageRank), sends content to LLM with structured prompts from enrichment.ts, stores results as file_summary/symbol_summary document types in LanceDB. Runs in parallel batches.",
				file: "src/core/enrichment/enricher.ts",
				type: "architecture",
			},
		],
		expectedFiles: [
			"src/core/enrichment/enricher.ts",
			"src/llm/prompts/enrichment.ts",
		],
	},
	{
		id: 13,
		repo: "mnemex",
		title: "Feature: add reindex command",
		task: "Add a `reindex` CLI command that forces a full re-index of the project (equivalent to `mnemex index --force`). It should accept the same options as `index` but always set force=true.",
		observations: [
			{
				content:
					"The index command is handled by handleIndex() in cli.ts. The --force flag is parsed there and passed to indexer.index(force). To add reindex, add a case in the command switch that calls handleIndex with force hardcoded to true.",
				file: "src/cli.ts",
				type: "procedure",
			},
		],
		expectedFiles: ["src/cli.ts"],
	},

	// ── fastmcp scenarios ────────────────────────────────────────────────

	{
		id: 6,
		repo: "fastmcp",
		title: "Bug: tool error handling",
		task: "The FastMCP server doesn't seem to handle tool errors gracefully — when a tool raises an exception, the client gets an opaque error. Find where error handling happens and explain the flow. Do NOT make any code changes.",
		observations: [
			{
				content:
					"Tool execution errors are caught in tool_manager.py's call_tool method. The error_handling middleware wraps tool calls. Exceptions become ToolError with is_error=True in the MCP response.",
				file: "src/fastmcp/server/server.py",
				type: "architecture",
			},
		],
		expectedFiles: ["src/fastmcp/server/server.py"],
	},
	{
		id: 7,
		repo: "fastmcp",
		title: "Feature: middleware pipeline",
		task: "How do I add middleware to a FastMCP server? What's the middleware pipeline and execution order? Do NOT make any code changes.",
		observations: [
			{
				content:
					"Middleware is registered via server.add_middleware(). The middleware pipeline in server.py processes requests through a chain. Order matters — first registered runs outermost.",
				file: "src/fastmcp/server/server.py",
				type: "architecture",
			},
		],
		expectedFiles: ["src/fastmcp/server/server.py"],
	},
	{
		id: 8,
		repo: "fastmcp",
		title: "Architecture: resource templates",
		task: "How does FastMCP handle resource templates? Explain the template resolution mechanism. Do NOT make any code changes.",
		observations: [
			{
				content:
					"Resource templates use URI patterns with {param} placeholders. Templates match incoming URIs against patterns, extract params, and call the resource function with extracted values.",
				file: "src/fastmcp/resources/templates.py",
				type: "architecture",
			},
		],
		expectedFiles: ["src/fastmcp/resources/templates.py"],
	},
	{
		id: 9,
		repo: "fastmcp",
		title: "Feature: resource description param",
		task: "Add a `description` parameter to the `@mcp.resource` decorator that gets included in the resource's MCP metadata.",
		observations: [
			{
				content:
					"Resources are defined via decorators in __init__.py which call resource_manager.add_resource(). The Resource dataclass holds metadata. MCP metadata is built in server.py's list_resources handler.",
				file: "src/fastmcp/resources/resource.py",
				type: "architecture",
			},
		],
		expectedFiles: [
			"src/fastmcp/resources/resource.py",
			"src/fastmcp/server/server.py",
		],
	},
	{
		id: 10,
		repo: "fastmcp",
		title: "Debug: OpenAPI conversion limits",
		task: "The OpenAPI experimental feature sometimes fails to convert endpoints. What are the known limitations? Do NOT make any code changes.",
		observations: [
			{
				content:
					"OpenAPI conversion has limitations: doesn't handle allOf/oneOf schemas well, skips endpoints with file upload parameters, and requires explicit operationId. The converter logs warnings for skipped endpoints.",
				file: "src/fastmcp/server/openapi.py",
				type: "gotcha",
			},
		],
		expectedFiles: ["src/fastmcp/server/openapi.py"],
	},
	{
		id: 14,
		repo: "fastmcp",
		title: "Architecture: context dependency injection",
		task: "How does FastMCP handle Context dependency injection in tool and resource functions? Explain how a tool function receives the Context object and what's available on it. Do NOT make any code changes.",
		observations: [
			{
				content:
					"Context is injected via type annotation inspection. Tool/resource functions that declare a parameter with type Context get it automatically injected at call time. The Context object provides logging, progress reporting, resource reading, and access to the request context. See server.py _execute_tool and resources/types.py.",
				file: "src/fastmcp/server/server.py",
				type: "architecture",
			},
		],
		expectedFiles: [
			"src/fastmcp/server/server.py",
			"src/fastmcp/server/context.py",
		],
	},
	{
		id: 15,
		repo: "fastmcp",
		title: "Architecture: server composition",
		task: "How does FastMCP's server mounting/composition system work? Explain how you can compose multiple MCP servers together and how requests are routed between them. Do NOT make any code changes.",
		observations: [
			{
				content:
					"FastMCP supports server composition via mcp.mount() which mounts a child server at a prefix. Requests are routed by prefix matching on tool/resource names. Each mounted server maintains its own middleware chain and state. See server.py mount() and _resolve_mount().",
				file: "src/fastmcp/server/server.py",
				type: "architecture",
			},
		],
		expectedFiles: ["src/fastmcp/server/server.py"],
	},
	{
		id: 16,
		repo: "fastmcp",
		title: "Feature: add tool timeout",
		task: "Add a `timeout` parameter to the `@mcp.tool` decorator that raises a TimeoutError if the tool function takes longer than the specified number of seconds.",
		observations: [
			{
				content:
					"Tools are registered via @mcp.tool() decorator in server.py which creates FunctionTool objects. The tool execution happens in _execute_tool(). To add timeout, wrap the tool._run() call with asyncio.wait_for(). The FunctionTool class is in tools/tool.py.",
				file: "src/fastmcp/tools/tool.py",
				type: "procedure",
			},
		],
		expectedFiles: [
			"src/fastmcp/tools/tool.py",
			"src/fastmcp/server/server.py",
		],
	},
];

export function getScenariosForRepo(repo: "mnemex" | "fastmcp"): Scenario[] {
	return SCENARIOS.filter((s) => s.repo === repo);
}

export function getScenarioById(id: number): Scenario | undefined {
	return SCENARIOS.find((s) => s.id === id);
}

export type Condition = "no-index" | "baseline" | "skill-doc" | "observations";
export const CONDITIONS: Condition[] = ["no-index", "baseline", "skill-doc", "observations"];
