// types.ts — TypeScript interfaces for benchmark JSON schemas

// ── Per-test meta.json ──────────────────────────────────────────────────────

export interface TestMeta {
	test_id: string;
	method: "mcp" | "cli";
	mnemex_version: string;
	duration_seconds: number;
	exit_code: number;
	total_tool_calls: number;
	bash_tool_calls: number;
	transcript_lines: number;
	timed_out: boolean;
	target_dir: string;
}

// ── Check validation results ─────────────────────────────────────────────────

export interface CheckResult {
	check_name: string;
	passed: boolean;
	detail?: string;
}

// ── Run record types ─────────────────────────────────────────────────────────

export interface MethodResult {
	duration_s: number;
	total_tool_calls: number;
	bash_tool_calls: number;
	timed_out: boolean;
	exit_code: number;
	checks_passed: boolean;
	checks: Record<string, boolean>;
	check_details: CheckResult[];
}

export interface TestResult {
	test_id: string;
	mcp: MethodResult;
	cli: MethodResult;
}

export interface RunRecord {
	schema_version: string;
	run_id: string;
	timestamp: string;
	mnemex_version: string;
	target_dir: string;
	harness_version: string;
	test_results: TestResult[];
	aggregate: {
		mcp: { avg_duration_s: number; avg_total_tool_calls: number; pass_rate: number };
		cli: { avg_duration_s: number; avg_total_tool_calls: number; pass_rate: number };
	};
}

// ── Runs manifest ─────────────────────────────────────────────────────────────

export interface ManifestEntry {
	run_id: string;
	timestamp: string;
	mnemex_version: string;
	record_path: string;
	mcp_avg_duration_s: number;
	cli_avg_duration_s: number;
	mcp_pass_rate: number | null;
	cli_pass_rate: number | null;
}

export interface RunsManifest {
	schema_version: string;
	runs: ManifestEntry[];
}

// ── test-cases.json types ─────────────────────────────────────────────────────

export interface MCPChecks {
	has_tool_prefix?: string;
	tools_used_include_any?: string[][];
	min_tool_calls?: number;
	no_bash_calls?: boolean;
	response_contains_any?: string[];
}

export interface CLIChecks {
	min_bash_calls?: number;
	no_mcp_calls?: boolean;
	bash_contains_any?: string[];
	response_contains_any?: string[];
}

export interface TestCase {
	id: string;
	description: string;
	task: string;
	mcp_checks: MCPChecks;
	cli_checks: CLIChecks;
}

export interface TestCasesConfig {
	meta: {
		description: string;
		version: string;
		created: string;
		type: string;
		notes: string;
	};
	test_cases: TestCase[];
	efficiency_metrics: Record<string, unknown>;
}
