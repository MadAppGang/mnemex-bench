#!/usr/bin/env bun
/**
 * analyze-comparison.ts
 *
 * Validate benchmark check results against transcripts and produce a run report.
 *
 * Usage:
 *   bun analysis/analyze-comparison.ts validate <run-dir>
 */

import { join, dirname, basename, resolve } from "path";
import type {
	TestCase,
	TestCasesConfig,
	MCPChecks,
	CLIChecks,
	CheckResult,
	MethodResult,
	TestResult,
	RunRecord,
	TestMeta,
	ManifestEntry,
	RunsManifest,
} from "./types.ts";

// ── Transcript parsing ────────────────────────────────────────────────────────

interface TranscriptToolUse {
	name: string;
	input: Record<string, unknown>;
}

interface ParsedTranscript {
	toolNames: string[];
	bashCommands: string[];
	finalResponse: string;
}

async function parseTranscript(path: string): Promise<ParsedTranscript | null> {
	const file = Bun.file(path);
	if (!(await file.exists())) {
		return null;
	}

	const text = await file.text();
	const lines = text.split("\n").filter((l) => l.trim().length > 0);

	const toolNames: string[] = [];
	const bashCommands: string[] = [];
	let finalResponse = "";

	for (const line of lines) {
		let entry: Record<string, unknown>;
		try {
			entry = JSON.parse(line);
		} catch {
			// Skip malformed lines
			continue;
		}

		// Look for assistant messages that contain content arrays
		if (entry.type !== "assistant") continue;

		const message = entry.message as Record<string, unknown> | undefined;
		if (!message) continue;

		const content = message.content;
		if (!Array.isArray(content)) continue;

		for (const block of content) {
			if (typeof block !== "object" || block === null) continue;
			const b = block as Record<string, unknown>;

			if (b.type === "tool_use") {
				const toolUse = b as TranscriptToolUse & { type: string };
				toolNames.push(toolUse.name);

				if (toolUse.name === "Bash") {
					const input = toolUse.input as Record<string, unknown>;
					const cmd = input?.command;
					if (typeof cmd === "string") {
						bashCommands.push(cmd);
					}
				}
			}

			if (b.type === "text") {
				const text = b.text;
				if (typeof text === "string") {
					finalResponse = text;
				}
			}
		}
	}

	return { toolNames, bashCommands, finalResponse };
}

// ── Check validation ──────────────────────────────────────────────────────────

function validateChecks(
	checks: MCPChecks | CLIChecks,
	toolNames: string[],
	bashCommands: string[],
	response: string
): { results: Record<string, boolean>; details: CheckResult[] } {
	const results: Record<string, boolean> = {};
	const details: CheckResult[] = [];

	function record(name: string, passed: boolean, detail?: string) {
		results[name] = passed;
		details.push({ check_name: name, passed, detail });
	}

	// has_tool_prefix: at least one tool name starts with prefix
	if ("has_tool_prefix" in checks && checks.has_tool_prefix) {
		const prefix = checks.has_tool_prefix;
		const matched = toolNames.filter((n) => n.startsWith(prefix));
		const passed = matched.length > 0;
		record(
			"has_tool_prefix",
			passed,
			passed
				? `Matched: ${matched.slice(0, 3).join(", ")}`
				: `No tool found with prefix "${prefix}". Tools used: ${toolNames.join(", ") || "(none)"}`
		);
	}

	// tools_used_include_any: at least one combination (array of tool names) is fully matched
	if ("tools_used_include_any" in checks && checks.tools_used_include_any) {
		const combos = checks.tools_used_include_any;
		const matchedCombo = combos.find((combo) =>
			combo.every((t) => toolNames.includes(t))
		);
		const passed = matchedCombo !== undefined;
		record(
			"tools_used_include_any",
			passed,
			passed
				? `Matched combo: [${matchedCombo!.join(", ")}]`
				: `No matching combo. Tools: ${toolNames.join(", ") || "(none)"}`
		);
	}

	// min_tool_calls: total tool call count meets minimum
	if ("min_tool_calls" in checks && checks.min_tool_calls !== undefined) {
		const min = checks.min_tool_calls;
		const passed = toolNames.length >= min;
		record(
			"min_tool_calls",
			passed,
			`Got ${toolNames.length}, required >= ${min}`
		);
	}

	// min_bash_calls: bash tool call count meets minimum
	if ("min_bash_calls" in checks && checks.min_bash_calls !== undefined) {
		const min = checks.min_bash_calls;
		const passed = bashCommands.length >= min;
		record(
			"min_bash_calls",
			passed,
			`Got ${bashCommands.length}, required >= ${min}`
		);
	}

	// no_bash_calls: compliance check — no Bash tool used in MCP mode
	if ("no_bash_calls" in checks && checks.no_bash_calls === true) {
		const passed = bashCommands.length === 0;
		record(
			"no_bash_calls",
			passed,
			passed ? "No Bash calls" : `Found ${bashCommands.length} Bash call(s)`
		);
	}

	// no_mcp_calls: compliance check — no MCP tools used in CLI mode
	if ("no_mcp_calls" in checks && checks.no_mcp_calls === true) {
		const mcpTools = toolNames.filter((n) => n.startsWith("mcp__"));
		const passed = mcpTools.length === 0;
		record(
			"no_mcp_calls",
			passed,
			passed ? "No MCP calls" : `Found MCP tools: ${mcpTools.join(", ")}`
		);
	}

	// bash_contains_any: at least one Bash command contains one of the patterns
	if ("bash_contains_any" in checks && checks.bash_contains_any) {
		const patterns = checks.bash_contains_any;
		const matchedCmd = bashCommands.find((cmd) =>
			patterns.some((p) => cmd.includes(p))
		);
		const passed = matchedCmd !== undefined;
		record(
			"bash_contains_any",
			passed,
			passed
				? `Matched pattern in: "${matchedCmd!.slice(0, 80)}"`
				: `No Bash command contains any of: ${patterns.join(", ")}`
		);
	}

	// response_contains_any: final response contains at least one keyword (case-insensitive)
	if ("response_contains_any" in checks && checks.response_contains_any) {
		const keywords = checks.response_contains_any;
		const responseLower = response.toLowerCase();
		const matched = keywords.filter((k) =>
			responseLower.includes(k.toLowerCase())
		);
		const passed = matched.length > 0;
		record(
			"response_contains_any",
			passed,
			passed
				? `Found: ${matched.join(", ")}`
				: `None of [${keywords.join(", ")}] found in response (${response.length} chars)`
		);
	}

	return { results, details };
}

// ── Run record loading/updating ───────────────────────────────────────────────

async function loadRunRecord(recordPath: string): Promise<RunRecord | null> {
	const file = Bun.file(recordPath);
	if (!(await file.exists())) {
		return null;
	}
	try {
		return (await file.json()) as RunRecord;
	} catch {
		return null;
	}
}

function findRecordFile(resultsRecordsDir: string, runId: string): string | null {
	// The record file is named v{VERSION}-{TIMESTAMP}.json
	// The run_id is "run-TIMESTAMP" so we need to match by timestamp suffix
	const timestamp = runId.replace(/^run-/, "");
	// We'll return the expected glob pattern path and let caller handle existence check
	return join(resultsRecordsDir, `*-${timestamp}.json`);
}

// ── Validate mode ─────────────────────────────────────────────────────────────

async function validate(runDir: string): Promise<void> {
	const resolvedRunDir = resolve(runDir);

	// test-cases.json is 2 dirs up from analysis/ — at the experiment root
	// run-dir is inside results/ which is inside the experiment root
	// So: runDir -> results -> experiment root -> test-cases.json
	const experimentRoot = dirname(dirname(resolvedRunDir));
	const testCasesPath = join(experimentRoot, "test-cases.json");
	const resultsDir = dirname(resolvedRunDir);
	const resultsRecordsDir = join(resultsDir, "records");

	// Load test cases
	const tcFile = Bun.file(testCasesPath);
	if (!(await tcFile.exists())) {
		console.error(`Error: test-cases.json not found at ${testCasesPath}`);
		process.exit(1);
	}
	const testCasesConfig: TestCasesConfig = await tcFile.json();
	const testCases = testCasesConfig.test_cases;

	const runId = basename(resolvedRunDir);
	const timestamp = runId.replace(/^run-/, "");

	// Try to find existing run-record.json
	const recordsGlob = await Array.fromAsync(
		new Bun.Glob(`*-${timestamp}.json`).scan(resultsRecordsDir)
	).catch(() => [] as string[]);

	let existingRecord: RunRecord | null = null;
	let recordFilePath: string;

	if (recordsGlob.length > 0) {
		recordFilePath = join(resultsRecordsDir, recordsGlob[0]);
		existingRecord = await loadRunRecord(recordFilePath);
	} else {
		// Create a placeholder record path — we'll write a new one
		recordFilePath = join(resultsRecordsDir, `vunknown-${timestamp}.json`);
	}

	// Validate all test cases
	const testResults: TestResult[] = [];
	const skipped: string[] = [];

	// Track summary counts
	let totalChecks = 0;
	let passedChecks = 0;

	// Table rows for stdout summary
	const tableRows: Array<{
		testId: string;
		method: string;
		passed: boolean;
		checks: string;
		skipped: boolean;
	}> = [];

	for (const tc of testCases) {
		const methods: Array<{ method: "mcp" | "cli"; checks: MCPChecks | CLIChecks }> = [
			{ method: "mcp", checks: tc.mcp_checks },
			{ method: "cli", checks: tc.cli_checks },
		];

		const methodResults: Partial<Record<"mcp" | "cli", MethodResult>> = {};

		for (const { method, checks } of methods) {
			const transcriptPath = join(
				resolvedRunDir,
				method,
				tc.id,
				"transcript.jsonl"
			);
			const metaPath = join(resolvedRunDir, method, tc.id, "meta.json");

			// Load transcript
			const parsed = await parseTranscript(transcriptPath);
			if (parsed === null) {
				skipped.push(`${tc.id}/${method}`);
				tableRows.push({
					testId: tc.id,
					method,
					passed: false,
					checks: "(transcript missing)",
					skipped: true,
				});
				continue;
			}

			// Load meta for timing/tool counts
			const metaFile = Bun.file(metaPath);
			let meta: TestMeta | null = null;
			if (await metaFile.exists()) {
				try {
					meta = (await metaFile.json()) as TestMeta;
				} catch {
					meta = null;
				}
			}

			const { toolNames, bashCommands, finalResponse } = parsed;
			const { results: checkResults, details: checkDetails } = validateChecks(
				checks,
				toolNames,
				bashCommands,
				finalResponse
			);

			const allPassed = Object.values(checkResults).every(Boolean);
			const checkCount = Object.keys(checkResults).length;
			const passCount = Object.values(checkResults).filter(Boolean).length;

			totalChecks += checkCount;
			passedChecks += passCount;

			const methodResult: MethodResult = {
				duration_s: meta?.duration_seconds ?? 0,
				total_tool_calls: meta?.total_tool_calls ?? toolNames.length,
				bash_tool_calls: meta?.bash_tool_calls ?? bashCommands.length,
				timed_out: meta?.timed_out ?? false,
				exit_code: meta?.exit_code ?? 0,
				checks_passed: allPassed,
				checks: checkResults,
				check_details: checkDetails,
			};

			methodResults[method] = methodResult;

			tableRows.push({
				testId: tc.id,
				method,
				passed: allPassed,
				checks: `${passCount}/${checkCount}`,
				skipped: false,
			});
		}

		// Only add to test_results if both methods ran
		if (methodResults.mcp && methodResults.cli) {
			testResults.push({
				test_id: tc.id,
				mcp: methodResults.mcp,
				cli: methodResults.cli,
			});
		} else {
			// Add partial result with whatever we have, using a placeholder for the missing method
			const placeholder: MethodResult = {
				duration_s: 0,
				total_tool_calls: 0,
				bash_tool_calls: 0,
				timed_out: false,
				exit_code: -1,
				checks_passed: false,
				checks: {},
				check_details: [{ check_name: "transcript_missing", passed: false, detail: "Transcript not found" }],
			};
			testResults.push({
				test_id: tc.id,
				mcp: methodResults.mcp ?? placeholder,
				cli: methodResults.cli ?? placeholder,
			});
		}
	}

	// Compute aggregates
	const completed = testResults.filter(
		(r) =>
			r.mcp.check_details[0]?.check_name !== "transcript_missing" &&
			r.cli.check_details[0]?.check_name !== "transcript_missing"
	);

	const mcpAvgDuration =
		completed.length > 0
			? completed.reduce((s, r) => s + r.mcp.duration_s, 0) / completed.length
			: 0;
	const cliAvgDuration =
		completed.length > 0
			? completed.reduce((s, r) => s + r.cli.duration_s, 0) / completed.length
			: 0;
	const mcpAvgTools =
		completed.length > 0
			? completed.reduce((s, r) => s + r.mcp.total_tool_calls, 0) / completed.length
			: 0;
	const cliAvgTools =
		completed.length > 0
			? completed.reduce((s, r) => s + r.cli.total_tool_calls, 0) / completed.length
			: 0;
	const mcpPassRate =
		completed.length > 0
			? completed.filter((r) => r.mcp.checks_passed).length / completed.length
			: 0;
	const cliPassRate =
		completed.length > 0
			? completed.filter((r) => r.cli.checks_passed).length / completed.length
			: 0;

	// Build or update run record
	const mnemexVersion =
		existingRecord?.mnemex_version ??
		(await detectMnemexVersion(resolvedRunDir));

	const runRecord: RunRecord = {
		schema_version: existingRecord?.schema_version ?? "1",
		run_id: runId,
		timestamp: existingRecord?.timestamp ?? new Date().toISOString(),
		mnemex_version: mnemexVersion,
		target_dir: existingRecord?.target_dir ?? "",
		harness_version: existingRecord?.harness_version ?? "1.0.0",
		test_results: testResults,
		aggregate: {
			mcp: {
				avg_duration_s: round2(mcpAvgDuration),
				avg_total_tool_calls: round2(mcpAvgTools),
				pass_rate: round2(mcpPassRate),
			},
			cli: {
				avg_duration_s: round2(cliAvgDuration),
				avg_total_tool_calls: round2(cliAvgTools),
				pass_rate: round2(cliPassRate),
			},
		},
	};

	// Update record file path to use detected version if we created a new one
	if (!recordsGlob.length && mnemexVersion !== "unknown") {
		recordFilePath = join(
			resultsRecordsDir,
			`v${mnemexVersion}-${timestamp}.json`
		);
	}

	// Write updated run record
	await Bun.write(recordFilePath, JSON.stringify(runRecord, null, 2) + "\n");

	// Write report.md into the run directory
	const reportPath = join(resolvedRunDir, "report.md");
	const reportMd = buildReportMd(runId, mnemexVersion, testResults, skipped, tableRows, totalChecks, passedChecks);
	await Bun.write(reportPath, reportMd);

	// Print summary table to stdout
	printSummaryTable(tableRows, totalChecks, passedChecks, skipped, runId);

	// Exit with code 1 if any checks failed
	const anyFailed = tableRows.some((r) => !r.passed && !r.skipped);
	if (anyFailed || skipped.length > 0) {
		process.exit(1);
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

async function detectMnemexVersion(runDir: string): Promise<string> {
	// Try to read version from any meta.json in the run dir
	for (const method of ["mcp", "cli"]) {
		const glob = new Bun.Glob("*/meta.json");
		for await (const rel of glob.scan(join(runDir, method))) {
			const metaFile = Bun.file(join(runDir, method, rel));
			try {
				const meta = (await metaFile.json()) as Record<string, unknown>;
				const v = meta.mnemex_version;
				if (typeof v === "string" && v.length > 0) {
					return v;
				}
			} catch {
				continue;
			}
		}
	}
	return "unknown";
}

function buildReportMd(
	runId: string,
	version: string,
	testResults: TestResult[],
	skipped: string[],
	tableRows: Array<{ testId: string; method: string; passed: boolean; checks: string; skipped: boolean }>,
	totalChecks: number,
	passedChecks: number
): string {
	const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
	const lines: string[] = [];

	lines.push(`# Benchmark Validation Report`);
	lines.push(``);
	lines.push(`**Run:** ${runId}  `);
	lines.push(`**mnemex version:** ${version}  `);
	lines.push(`**Generated:** ${now}  `);
	lines.push(`**Checks:** ${passedChecks}/${totalChecks} passed`);
	lines.push(``);

	if (skipped.length > 0) {
		lines.push(`> **Skipped** (missing transcript): ${skipped.join(", ")}`);
		lines.push(``);
	}

	// Per-test detail
	for (const result of testResults) {
		lines.push(`## ${result.test_id}`);
		lines.push(``);

		for (const method of ["mcp", "cli"] as const) {
			const mr = result[method];
			const statusIcon = mr.checks_passed ? "PASS" : "FAIL";
			lines.push(`### ${method.toUpperCase()} — ${statusIcon}`);
			lines.push(``);
			lines.push(`- Duration: ${mr.duration_s}s`);
			lines.push(`- Tool calls: ${mr.total_tool_calls} (${mr.bash_tool_calls} Bash)`);
			lines.push(`- Timed out: ${mr.timed_out}`);
			lines.push(`- Exit code: ${mr.exit_code}`);
			lines.push(``);

			if (mr.check_details.length > 0) {
				lines.push(`| Check | Result | Detail |`);
				lines.push(`|-------|--------|--------|`);
				for (const cd of mr.check_details) {
					const icon = cd.passed ? "PASS" : "FAIL";
					const detail = (cd.detail ?? "").replace(/\|/g, "\\|");
					lines.push(`| \`${cd.check_name}\` | ${icon} | ${detail} |`);
				}
				lines.push(``);
			}
		}
	}

	// Aggregate table
	lines.push(`## Aggregate`);
	lines.push(``);
	lines.push(`| Metric | MCP | CLI |`);
	lines.push(`|--------|-----|-----|`);

	const completed = testResults.filter(
		(r) =>
			r.mcp.check_details[0]?.check_name !== "transcript_missing" &&
			r.cli.check_details[0]?.check_name !== "transcript_missing"
	);

	if (completed.length > 0) {
		const mcpAvgDur = round2(completed.reduce((s, r) => s + r.mcp.duration_s, 0) / completed.length);
		const cliAvgDur = round2(completed.reduce((s, r) => s + r.cli.duration_s, 0) / completed.length);
		const mcpAvgTools = round2(completed.reduce((s, r) => s + r.mcp.total_tool_calls, 0) / completed.length);
		const cliAvgTools = round2(completed.reduce((s, r) => s + r.cli.total_tool_calls, 0) / completed.length);
		const mcpPassRate = round2(completed.filter((r) => r.mcp.checks_passed).length / completed.length);
		const cliPassRate = round2(completed.filter((r) => r.cli.checks_passed).length / completed.length);

		lines.push(`| Avg duration (s) | ${mcpAvgDur} | ${cliAvgDur} |`);
		lines.push(`| Avg tool calls | ${mcpAvgTools} | ${cliAvgTools} |`);
		lines.push(`| Pass rate | ${(mcpPassRate * 100).toFixed(0)}% | ${(cliPassRate * 100).toFixed(0)}% |`);
	}

	lines.push(``);

	return lines.join("\n");
}

function printSummaryTable(
	tableRows: Array<{ testId: string; method: string; passed: boolean; checks: string; skipped: boolean }>,
	totalChecks: number,
	passedChecks: number,
	skipped: string[],
	runId: string
): void {
	console.log(`\nValidation Summary — ${runId}`);
	console.log("=".repeat(70));

	const colWidths = { testId: 22, method: 6, result: 10, checks: 8 };
	const header = [
		"Test ID".padEnd(colWidths.testId),
		"Method".padEnd(colWidths.method),
		"Result".padEnd(colWidths.result),
		"Checks",
	].join("  ");
	console.log(header);
	console.log("-".repeat(70));

	for (const row of tableRows) {
		const resultStr = row.skipped ? "SKIPPED" : row.passed ? "PASS" : "FAIL";
		console.log(
			[
				row.testId.padEnd(colWidths.testId),
				row.method.padEnd(colWidths.method),
				resultStr.padEnd(colWidths.result),
				row.checks,
			].join("  ")
		);
	}

	console.log("-".repeat(70));
	console.log(`Checks passed: ${passedChecks}/${totalChecks}`);
	if (skipped.length > 0) {
		console.log(`Skipped: ${skipped.join(", ")}`);
	}

	const anyFailed = tableRows.some((r) => !r.passed && !r.skipped);
	const allPassed = !anyFailed && skipped.length === 0;
	console.log(`Overall: ${allPassed ? "PASS" : "FAIL"}`);
	console.log("");
}

// ── Manifest loading ──────────────────────────────────────────────────────────

function normalizeVersion(v: string): string {
	return v.replace(/^v/, "");
}

async function loadManifest(manifestPath: string): Promise<RunsManifest> {
	const file = Bun.file(manifestPath);
	if (!(await file.exists())) {
		return { schema_version: "1", runs: [] };
	}
	try {
		return (await file.json()) as RunsManifest;
	} catch {
		console.error(`Error: could not parse manifest at ${manifestPath}`);
		process.exit(1);
	}
}

async function loadRecordFromEntry(
	manifestDir: string,
	entry: ManifestEntry
): Promise<RunRecord | null> {
	const recordPath = join(manifestDir, entry.record_path);
	return loadRunRecord(recordPath);
}

// ── History mode ──────────────────────────────────────────────────────────────

interface HistoryRow {
	version: string;
	date: string;
	mcpDur: number;
	cliDur: number;
	mcpTools: number;
	cliTools: number;
	mcpPass: number | null;
	cliPass: number | null;
	regressions: string[];
}

async function history(manifestPath: string, regressionThreshold: number): Promise<void> {
	const manifest = await loadManifest(manifestPath);
	const manifestDir = dirname(manifestPath);

	if (manifest.runs.length === 0) {
		console.log("No runs found in manifest.");
		return;
	}

	// Build rows from manifest entries (prefer manifest summary, supplement from record)
	const rows: HistoryRow[] = [];

	for (let i = 0; i < manifest.runs.length; i++) {
		const entry = manifest.runs[i];
		const prior = i > 0 ? manifest.runs[i - 1] : null;

		// Try to load full record for pass_rate (manifest may have null)
		let mcpPass = entry.mcp_pass_rate;
		let cliPass = entry.cli_pass_rate;
		let mcpTools: number | null = null;
		let cliTools: number | null = null;

		const record = await loadRecordFromEntry(manifestDir, entry);
		if (record) {
			if (mcpPass === null) mcpPass = record.aggregate.mcp.pass_rate;
			if (cliPass === null) cliPass = record.aggregate.cli.pass_rate;
			mcpTools = record.aggregate.mcp.avg_total_tool_calls;
			cliTools = record.aggregate.cli.avg_total_tool_calls;
		}

		// Detect regressions vs prior row (higher duration or tool count = worse)
		const regressions: string[] = [];
		if (prior !== null) {
			const factor = 1 + regressionThreshold / 100;
			if (entry.mcp_avg_duration_s > prior.mcp_avg_duration_s * factor) {
				const pct = (((entry.mcp_avg_duration_s - prior.mcp_avg_duration_s) / prior.mcp_avg_duration_s) * 100).toFixed(1);
				regressions.push(`MCP dur +${pct}%`);
			}
			if (entry.cli_avg_duration_s > prior.cli_avg_duration_s * factor) {
				const pct = (((entry.cli_avg_duration_s - prior.cli_avg_duration_s) / prior.cli_avg_duration_s) * 100).toFixed(1);
				regressions.push(`CLI dur +${pct}%`);
			}
			// Tool count regressions only if we have data from records
			if (mcpTools !== null) {
				const priorRecord = await loadRecordFromEntry(manifestDir, prior);
				const priorMcpTools = priorRecord?.aggregate.mcp.avg_total_tool_calls ?? null;
				const priorCliTools = priorRecord?.aggregate.cli.avg_total_tool_calls ?? null;
				if (priorMcpTools !== null && mcpTools > priorMcpTools * factor) {
					const pct = (((mcpTools - priorMcpTools) / priorMcpTools) * 100).toFixed(1);
					regressions.push(`MCP tools +${pct}%`);
				}
				if (cliTools !== null && priorCliTools !== null && cliTools > priorCliTools * factor) {
					const pct = (((cliTools - priorCliTools) / priorCliTools) * 100).toFixed(1);
					regressions.push(`CLI tools +${pct}%`);
				}
			}
		}

		rows.push({
			version: `v${normalizeVersion(entry.mnemex_version)}`,
			date: entry.timestamp.slice(0, 10),
			mcpDur: entry.mcp_avg_duration_s,
			cliDur: entry.cli_avg_duration_s,
			mcpTools: mcpTools ?? 0,
			cliTools: cliTools ?? 0,
			mcpPass,
			cliPass,
			regressions,
		});
	}

	// Collect all detected regressions for the summary section
	const allRegressions: Array<{ version: string; details: string[] }> = rows
		.filter((r) => r.regressions.length > 0)
		.map((r) => ({ version: r.version, details: r.regressions }));

	// Build table lines
	const output = buildHistoryOutput(rows, allRegressions, regressionThreshold);

	console.log(output);

	// Write HISTORY.md into the results directory (sibling of runs.json)
	const historyPath = join(dirname(manifestPath), "HISTORY.md");
	await Bun.write(historyPath, output + "\n");
	console.error(`Written: ${historyPath}`);
}

function fmtPass(rate: number | null): string {
	if (rate === null) return "n/a";
	return `${Math.round(rate * 100)}%`;
}

function buildHistoryOutput(
	rows: HistoryRow[],
	regressions: Array<{ version: string; details: string[] }>,
	threshold: number
): string {
	const lines: string[] = [];

	lines.push("mnemex Benchmark History — MCP vs CLI Efficiency");
	lines.push("====================================================");
	lines.push("");

	// Column widths
	const cVersion = 9;
	const cDate = 12;
	const cMcpDur = 9;
	const cCliDur = 9;
	const cMcpTools = 11;
	const cCliTools = 11;
	const cMcpPass = 10;
	const cCliPass = 10;

	const header = [
		"Version".padEnd(cVersion),
		"Date".padEnd(cDate),
		"MCP dur".padEnd(cMcpDur),
		"CLI dur".padEnd(cCliDur),
		"MCP tools".padEnd(cMcpTools),
		"CLI tools".padEnd(cCliTools),
		"MCP pass".padEnd(cMcpPass),
		"CLI pass".padEnd(cCliPass),
	].join("  ");

	const separator = [
		"-".repeat(cVersion),
		"-".repeat(cDate),
		"-".repeat(cMcpDur),
		"-".repeat(cCliDur),
		"-".repeat(cMcpTools),
		"-".repeat(cCliTools),
		"-".repeat(cMcpPass),
		"-".repeat(cCliPass),
	].join("  ");

	lines.push(header);
	lines.push(separator);

	for (const row of rows) {
		const regNote = row.regressions.length > 0
			? `  <-- REGRESSION: ${row.regressions.join(", ")}`
			: "";

		const dataRow = [
			row.version.padEnd(cVersion),
			row.date.padEnd(cDate),
			`${row.mcpDur.toFixed(1)}s`.padEnd(cMcpDur),
			`${row.cliDur.toFixed(1)}s`.padEnd(cCliDur),
			row.mcpTools.toFixed(1).padEnd(cMcpTools),
			row.cliTools.toFixed(1).padEnd(cCliTools),
			fmtPass(row.mcpPass).padEnd(cMcpPass),
			fmtPass(row.cliPass).padEnd(cCliPass),
		].join("  ");

		lines.push(dataRow + regNote);
	}

	lines.push("");
	lines.push(`Regressions (>${threshold}% worsening vs prior version):`);
	if (regressions.length === 0) {
		lines.push("  None detected.");
	} else {
		for (const reg of regressions) {
			lines.push(`  ${reg.version}: ${reg.details.join(", ")}`);
		}
	}

	return lines.join("\n");
}

// ── Compare mode ──────────────────────────────────────────────────────────────

async function compare(
	versionA: string,
	versionB: string,
	manifestPath: string
): Promise<void> {
	const manifest = await loadManifest(manifestPath);
	const manifestDir = dirname(manifestPath);

	const normA = normalizeVersion(versionA);
	const normB = normalizeVersion(versionB);

	const entryA = manifest.runs.find(
		(r) => normalizeVersion(r.mnemex_version) === normA
	);
	const entryB = manifest.runs.find(
		(r) => normalizeVersion(r.mnemex_version) === normB
	);

	if (!entryA) {
		console.error(`Error: version "${versionA}" not found in manifest.`);
		console.error(`Available: ${manifest.runs.map((r) => `v${normalizeVersion(r.mnemex_version)}`).join(", ") || "(none)"}`);
		process.exit(1);
	}
	if (!entryB) {
		console.error(`Error: version "${versionB}" not found in manifest.`);
		console.error(`Available: ${manifest.runs.map((r) => `v${normalizeVersion(r.mnemex_version)}`).join(", ") || "(none)"}`);
		process.exit(1);
	}

	// Load records for tool call data
	const recordA = await loadRecordFromEntry(manifestDir, entryA);
	const recordB = await loadRecordFromEntry(manifestDir, entryB);

	const mcpPassA = entryA.mcp_pass_rate ?? recordA?.aggregate.mcp.pass_rate ?? null;
	const cliPassA = entryA.cli_pass_rate ?? recordA?.aggregate.cli.pass_rate ?? null;
	const mcpPassB = entryB.mcp_pass_rate ?? recordB?.aggregate.mcp.pass_rate ?? null;
	const cliPassB = entryB.cli_pass_rate ?? recordB?.aggregate.cli.pass_rate ?? null;

	const mcpToolsA = recordA?.aggregate.mcp.avg_total_tool_calls ?? null;
	const cliToolsA = recordA?.aggregate.cli.avg_total_tool_calls ?? null;
	const mcpToolsB = recordB?.aggregate.mcp.avg_total_tool_calls ?? null;
	const cliToolsB = recordB?.aggregate.cli.avg_total_tool_calls ?? null;

	// Print comparison
	const vA = `v${normA}`;
	const vB = `v${normB}`;

	console.log(`\nmnemex Benchmark Comparison — ${vA} vs ${vB}`);
	console.log("=".repeat(60));
	console.log("");

	const cMetric = 22;
	const cA = 12;
	const cB = 12;
	const cDelta = 14;

	const header = [
		"Metric".padEnd(cMetric),
		vA.padEnd(cA),
		vB.padEnd(cB),
		"Delta".padEnd(cDelta),
		"Change %",
	].join("  ");
	const sep = "-".repeat(header.length);

	console.log(header);
	console.log(sep);

	function printMetricRow(
		label: string,
		a: number | null,
		b: number | null,
		unit: string,
		lowerIsBetter: boolean
	): void {
		if (a === null || b === null) {
			const aStr = a !== null ? `${a.toFixed(1)}${unit}` : "n/a";
			const bStr = b !== null ? `${b.toFixed(1)}${unit}` : "n/a";
			console.log(
				[
					label.padEnd(cMetric),
					aStr.padEnd(cA),
					bStr.padEnd(cB),
					"n/a".padEnd(cDelta),
					"n/a",
				].join("  ")
			);
			return;
		}

		const delta = b - a;
		const pct = a !== 0 ? (delta / a) * 100 : 0;
		const deltaSigned = delta >= 0 ? `+${delta.toFixed(1)}${unit}` : `${delta.toFixed(1)}${unit}`;
		const pctSigned = pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
		const direction = lowerIsBetter
			? delta > 0 ? " (worse)" : delta < 0 ? " (better)" : ""
			: delta > 0 ? " (better)" : delta < 0 ? " (worse)" : "";

		console.log(
			[
				label.padEnd(cMetric),
				`${a.toFixed(1)}${unit}`.padEnd(cA),
				`${b.toFixed(1)}${unit}`.padEnd(cB),
				deltaSigned.padEnd(cDelta),
				pctSigned + direction,
			].join("  ")
		);
	}

	function printPassRateRow(
		label: string,
		a: number | null,
		b: number | null
	): void {
		const aStr = a !== null ? `${Math.round(a * 100)}%` : "n/a";
		const bStr = b !== null ? `${Math.round(b * 100)}%` : "n/a";

		let deltaStr = "n/a";
		let pctStr = "n/a";
		if (a !== null && b !== null) {
			const delta = (b - a) * 100;
			deltaStr = delta >= 0 ? `+${delta.toFixed(1)}pp` : `${delta.toFixed(1)}pp`;
			pctStr = delta >= 0 ? "(better)" : "(worse)";
		}

		console.log(
			[
				label.padEnd(cMetric),
				aStr.padEnd(cA),
				bStr.padEnd(cB),
				deltaStr.padEnd(cDelta),
				pctStr,
			].join("  ")
		);
	}

	printMetricRow("MCP avg duration", entryA.mcp_avg_duration_s, entryB.mcp_avg_duration_s, "s", true);
	printMetricRow("CLI avg duration", entryA.cli_avg_duration_s, entryB.cli_avg_duration_s, "s", true);
	printMetricRow("MCP avg tool calls", mcpToolsA, mcpToolsB, "", true);
	printMetricRow("CLI avg tool calls", cliToolsA, cliToolsB, "", true);
	printPassRateRow("MCP pass rate", mcpPassA, mcpPassB);
	printPassRateRow("CLI pass rate", cliPassA, cliPassB);

	console.log(sep);
	console.log(`\nDates: ${vA} = ${entryA.timestamp.slice(0, 10)}, ${vB} = ${entryB.timestamp.slice(0, 10)}`);
	console.log("");
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const command = args[0];

	const usageText = [
		"Usage:",
		"  bun analysis/analyze-comparison.ts validate <run-dir>",
		"  bun analysis/analyze-comparison.ts history [--manifest <path>] [--regression-threshold <pct>]",
		"  bun analysis/analyze-comparison.ts compare <version-a> <version-b> [--manifest <path>]",
	].join("\n");

	if (!command) {
		console.error(usageText);
		process.exit(1);
	}

	if (command === "validate") {
		const runDir = args[1];
		if (!runDir) {
			console.error("Usage: bun analysis/analyze-comparison.ts validate <run-dir>");
			process.exit(1);
		}
		await validate(runDir);
	} else if (command === "history") {
		// Parse flags: --manifest <path>, --regression-threshold <pct>
		let manifestPath: string | undefined;
		let regressionThreshold = 20;

		for (let i = 1; i < args.length; i++) {
			if (args[i] === "--manifest" && args[i + 1]) {
				manifestPath = args[++i];
			} else if (args[i] === "--regression-threshold" && args[i + 1]) {
				const parsed = parseFloat(args[++i]);
				if (isNaN(parsed) || parsed < 0) {
					console.error("Error: --regression-threshold must be a non-negative number");
					process.exit(1);
				}
				regressionThreshold = parsed;
			}
		}

		// Default manifest path: ../../results/runs.json relative to analysis/
		if (!manifestPath) {
			const scriptDir = dirname(resolve(process.argv[1]));
			manifestPath = resolve(join(scriptDir, "..", "results", "runs.json"));
		} else {
			manifestPath = resolve(manifestPath);
		}

		await history(manifestPath, regressionThreshold);
	} else if (command === "compare") {
		const versionA = args[1];
		const versionB = args[2];

		if (!versionA || !versionB) {
			console.error("Usage: bun analysis/analyze-comparison.ts compare <version-a> <version-b> [--manifest <path>]");
			process.exit(1);
		}

		let manifestPath: string | undefined;
		for (let i = 3; i < args.length; i++) {
			if (args[i] === "--manifest" && args[i + 1]) {
				manifestPath = args[++i];
			}
		}

		if (!manifestPath) {
			const scriptDir = dirname(resolve(process.argv[1]));
			manifestPath = resolve(join(scriptDir, "..", "results", "runs.json"));
		} else {
			manifestPath = resolve(manifestPath);
		}

		await compare(versionA, versionB, manifestPath);
	} else {
		console.error(`Unknown command: ${command}`);
		console.error(usageText);
		process.exit(1);
	}
}

await main();
