#!/usr/bin/env bun
/**
 * Cognitive Memory E2E Eval Runner
 *
 * Runs Claude Code sessions under 4 conditions to compare:
 *   A (no-index)      - raw codebase, no claudemem index at all
 *   B (baseline)      - golden index only
 *   C (skill-doc)     - golden index + CLAUDE.md via `claudemem doctor`
 *   D (observations)  - golden index + seeded observations
 *
 * Usage:
 *   bun eval/cognitive-e2e/run.ts --preindex                              # build golden indexes (one-time)
 *   bun eval/cognitive-e2e/run.ts --repo claudemem --scenario 1 --condition baseline
 *   bun eval/cognitive-e2e/run.ts --repo claudemem --all                  # all scenarios × all conditions
 *   bun eval/cognitive-e2e/run.ts --all                                   # everything (64 sessions)
 */

import { execSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
	type Condition,
	CONDITIONS,
	type Scenario,
	SCENARIOS,
	REPOS,
	getScenariosForRepo,
	getScenarioById,
} from "./scenarios.js";

// ── Paths ────────────────────────────────────────────────────────────────────

const EVAL_DIR = resolve(import.meta.dirname!);
const GOLDEN_DIR = join(EVAL_DIR, "golden-indexes");
const RESULTS_DIR = join(EVAL_DIR, "results");

function goldenIndexPath(repoSlug: string): string {
	return join(GOLDEN_DIR, repoSlug, ".claudemem");
}

function resultPath(repoSlug: string, scenarioId: number, condition: Condition): string {
	return join(RESULTS_DIR, repoSlug, `scenario-${scenarioId}`, `${condition}.json`);
}

// ── CLI parsing ──────────────────────────────────────────────────────────────

interface CliArgs {
	preindex: boolean;
	repo?: "claudemem" | "fastmcp";
	scenario?: number;
	condition?: Condition;
	all: boolean;
	dryRun: boolean;
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const has = (flag: string) => args.includes(flag);
	const val = (flag: string) => {
		const i = args.indexOf(flag);
		return i >= 0 ? args[i + 1] : undefined;
	};

	return {
		preindex: has("--preindex"),
		repo: val("--repo") as CliArgs["repo"],
		scenario: val("--scenario") ? Number(val("--scenario")) : undefined,
		condition: val("--condition") as CliArgs["condition"],
		all: has("--all"),
		dryRun: has("--dry-run"),
	};
}

// ── Pre-indexing ─────────────────────────────────────────────────────────────

async function preindex() {
	console.log("=== Pre-indexing: building golden indexes ===\n");

	// Embeddings: voyage-3.5-lite via Voyage AI directly (VOYAGE_API_KEY)
	// LLM enrichment: deepseek-v3.2 via OpenRouter (OPENROUTER_API_KEY)
	if (!process.env.VOYAGE_API_KEY) {
		console.error("ERROR: VOYAGE_API_KEY not set. Required for voyage-3.5-lite embeddings.");
		console.error("  Get a key at https://www.voyageai.com/ and export VOYAGE_API_KEY=...");
		process.exit(1);
	}
	if (!process.env.OPENROUTER_API_KEY) {
		console.error("ERROR: OPENROUTER_API_KEY not set. Required for deepseek-v3.2 LLM enrichment.");
		process.exit(1);
	}

	console.log("  Embeddings:  voyage-3.5-lite (Voyage AI direct)");
	console.log("  Enrichment:  deepseek/deepseek-v3.2 (OpenRouter)\n");

	for (const [name, repo] of Object.entries(REPOS)) {
		const repoPath = repo.path;
		const slug = repo.slug;
		const dest = goldenIndexPath(slug);

		if (!existsSync(repoPath)) {
			console.error(`  SKIP ${name}: repo not found at ${repoPath}`);
			continue;
		}

		console.log(`  Indexing ${name} (${repoPath})...`);

		try {
			execSync(`bunx claudemem index "${repoPath}"`, {
				stdio: "inherit",
				timeout: 600_000, // 10 min
				env: {
					...process.env,
					CLAUDEMEM_LLM: "or/deepseek/deepseek-v3.2",  // enrichment via OpenRouter
					// VOYAGE_API_KEY inherited from process.env → voyage-3.5-lite direct
				},
			});
		} catch (e) {
			console.error(`    FAILED to index ${name}: ${e}`);
			continue;
		}

		// Copy .claudemem/ to golden location
		const srcIndex = join(repoPath, ".claudemem");
		if (!existsSync(srcIndex)) {
			console.error(`    FAILED: no .claudemem/ dir created at ${srcIndex}`);
			continue;
		}

		mkdirSync(join(GOLDEN_DIR, slug), { recursive: true });
		if (existsSync(dest)) rmSync(dest, { recursive: true });
		cpSync(srcIndex, dest, { recursive: true });

		// Validate
		const dbPath = join(dest, "index.db");
		if (existsSync(dbPath)) {
			console.log(`    OK: golden index saved to ${dest}`);
		} else {
			console.error(`    WARN: index.db not found in golden index`);
		}
	}

	console.log("\nDone. Golden indexes ready.");
}

// ── Check golden indexes exist ───────────────────────────────────────────────

function checkGoldenIndexes(repos: string[]): boolean {
	let ok = true;
	for (const slug of repos) {
		const p = goldenIndexPath(slug);
		if (!existsSync(p)) {
			console.error(`Missing golden index for "${slug}" at ${p}`);
			console.error(`  Run: bun eval/cognitive-e2e/run.ts --preindex`);
			ok = false;
		}
	}
	return ok;
}

// ── Workspace setup ──────────────────────────────────────────────────────────

function createWorkspace(repoPath: string, repoSlug: string, includeIndex: boolean): string {
	const ws = mkdtempSync(join(tmpdir(), `eval-cognitive-${repoSlug}-`));

	// Copy repo source (exclude .git, .claudemem, .claude, node_modules for clean workspace)
	execSync(`rsync -a --exclude='.git' --exclude='.claudemem' --exclude='.claude' --exclude='node_modules' --exclude='.venv' --exclude='__pycache__' "${repoPath}/" "${ws}/"`, {
		timeout: 60_000,
	});

	// Copy golden index (unless no-index condition)
	if (includeIndex) {
		const goldenSrc = goldenIndexPath(repoSlug);
		const dest = join(ws, ".claudemem");
		cpSync(goldenSrc, dest, { recursive: true });
	}

	// Create minimal .claude/settings.json that disables all plugins
	// (plugins cause claude -p to hang starting MCP servers)
	mkdirSync(join(ws, ".claude"), { recursive: true });
	writeFileSync(join(ws, ".claude", "settings.json"), JSON.stringify({
		enabledPlugins: {},
	}, null, 2));

	return ws;
}

function cleanupWorkspace(ws: string) {
	try {
		rmSync(ws, { recursive: true, force: true });
	} catch {
		// best effort
	}
}

// ── Condition setup ──────────────────────────────────────────────────────────

function setupCondition(ws: string, condition: Condition, scenario: Scenario) {
	switch (condition) {
		case "no-index":
			// Nothing extra — raw codebase, no index
			break;

		case "baseline":
			// Nothing extra — golden index only
			break;

		case "skill-doc": {
			// Generate CLAUDE.md via claudemem doctor
			try {
				const doctorOutput = execSync(`bunx claudemem --agent doctor "${ws}"`, {
					encoding: "utf-8",
					timeout: 120_000,
				});
				writeFileSync(join(ws, "CLAUDE.md"), doctorOutput);
			} catch (e) {
				console.error(`    WARN: doctor failed, writing fallback CLAUDE.md`);
				writeFileSync(join(ws, "CLAUDE.md"), "# Project\nSee source code for details.\n");
			}
			break;
		}

		case "observations": {
			// Seed observations via claudemem observe
			for (const obs of scenario.observations) {
				try {
					execSync(
						`bunx claudemem --agent observe "${obs.content}" --file "${obs.file}" --type ${obs.type} -p "${ws}"`,
						{ encoding: "utf-8", timeout: 30_000 },
					);
				} catch (e) {
					console.error(`    WARN: failed to seed observation: ${e}`);
				}
			}
			break;
		}
	}
}

// ── Run a single eval session ────────────────────────────────────────────────

interface SessionResult {
	scenarioId: number;
	repo: string;
	condition: Condition;
	title: string;
	task: string;
	output: string;
	claudeJson: Record<string, unknown> | null;
	durationMs: number;
	tokensIn: number;
	tokensOut: number;
	toolCalls: number;
	costUsd: number;
	timestamp: string;
}

function runSession(scenario: Scenario, condition: Condition, dryRun: boolean): SessionResult {
	const repo = REPOS[scenario.repo];
	const repoSlug = repo.slug;

	console.log(`\n  [${scenario.id}/${condition}] ${scenario.title}`);

	if (dryRun) {
		console.log(`    DRY RUN — would create workspace from ${repo.path}`);
		return {
			scenarioId: scenario.id,
			repo: scenario.repo,
			condition,
			title: scenario.title,
			task: scenario.task,
			output: "(dry run)",
			claudeJson: null,
			durationMs: 0,
			tokensIn: 0,
			tokensOut: 0,
			toolCalls: 0,
			costUsd: 0,
			timestamp: new Date().toISOString(),
		};
	}

	// Create workspace (no-index condition skips golden index copy)
	const includeIndex = condition !== "no-index";
	const ws = createWorkspace(repo.path, repoSlug, includeIndex);
	console.log(`    workspace: ${ws}`);

	// Setup condition
	setupCondition(ws, condition, scenario);

	// Run claude -p
	const start = Date.now();
	let rawOutput = "";
	let claudeJson: Record<string, unknown> | null = null;

	try {
		const result = spawnSync("claude", [
			"-p", scenario.task,
			"--output-format", "json",
			"--model", "sonnet",
			"--permission-mode", "bypassPermissions",
			"--max-budget-usd", "3",
		], {
			encoding: "utf-8",
			timeout: 1_800_000, // 30 min hard timeout (budget limit should stop earlier)
			cwd: ws,
			env: { ...process.env, CLAUDECODE: undefined },
		});

		if (result.signal) {
			console.log(`    signal: ${result.signal} (status: ${result.status})`);
		}

		rawOutput = result.stdout || "";
		if (result.stderr) {
			console.log(`    stderr: ${result.stderr.slice(0, 500)}`);
		}

		try {
			claudeJson = JSON.parse(rawOutput);
		} catch {
			// output may not be valid JSON
			if (rawOutput.length > 0) {
				console.log(`    raw output (${rawOutput.length} chars): ${rawOutput.slice(0, 200)}`);
			}
		}
	} catch (e) {
		console.error(`    ERROR: claude -p failed: ${e}`);
		rawOutput = `ERROR: ${e}`;
	}

	const durationMs = Date.now() - start;

	// Extract metrics from JSON output (claude -p --output-format json)
	const tokensIn = (claudeJson as any)?.usage?.input_tokens ?? 0;
	const tokensOut = (claudeJson as any)?.usage?.output_tokens ?? 0;
	const costUsd = (claudeJson as any)?.total_cost_usd ?? 0;
	const toolCalls = (claudeJson as any)?.num_turns ?? 0;

	const subtype = (claudeJson as any)?.subtype ?? "";
	console.log(`    done in ${(durationMs / 1000).toFixed(1)}s | turns: ${toolCalls} | cost: $${costUsd.toFixed(2)}${subtype === "error_max_budget_usd" ? " (budget limit)" : ""}`);

	// Save result
	const sessionResult: SessionResult = {
		scenarioId: scenario.id,
		repo: scenario.repo,
		condition,
		title: scenario.title,
		task: scenario.task,
		output: typeof claudeJson === "object" && claudeJson !== null
			? ((claudeJson as any).result ?? `[${subtype}] Budget-limited after ${toolCalls} turns, $${costUsd.toFixed(2)}`)
			: rawOutput,
		claudeJson,
		durationMs,
		tokensIn,
		tokensOut,
		toolCalls,
		costUsd,
		timestamp: new Date().toISOString(),
	};

	const outPath = resultPath(repoSlug, scenario.id, condition);
	mkdirSync(join(outPath, ".."), { recursive: true });
	writeFileSync(outPath, JSON.stringify(sessionResult, null, 2));

	// Cleanup
	cleanupWorkspace(ws);

	return sessionResult;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const cli = parseArgs();

	if (cli.preindex) {
		await preindex();
		return;
	}

	// Determine which scenarios to run
	let scenarios: Scenario[] = [];
	let conditions: Condition[] = [];

	if (cli.all) {
		if (cli.repo) {
			scenarios = getScenariosForRepo(cli.repo);
		} else {
			scenarios = [...SCENARIOS];
		}
		conditions = [...CONDITIONS];
	} else if (cli.scenario) {
		const s = getScenarioById(cli.scenario);
		if (!s) {
			console.error(`Unknown scenario: ${cli.scenario}`);
			process.exit(1);
		}
		scenarios = [s];
		conditions = cli.condition ? [cli.condition] : [...CONDITIONS];
	} else {
		console.error("Usage: bun eval/cognitive-e2e/run.ts --all | --scenario <id> [--condition <cond>] | --preindex");
		process.exit(1);
	}

	// Check golden indexes (only needed for conditions that use them)
	const needsIndex = conditions.some((c) => c !== "no-index");
	if (needsIndex) {
		const neededRepos = [...new Set(scenarios.map((s) => REPOS[s.repo].slug))];
		if (!checkGoldenIndexes(neededRepos)) {
			process.exit(1);
		}
	}

	const totalSessions = scenarios.length * conditions.length;
	console.log(`=== Cognitive E2E Eval ===`);
	console.log(`  Scenarios: ${scenarios.length}, Conditions: ${conditions.length}, Total sessions: ${totalSessions}`);
	if (cli.dryRun) console.log(`  MODE: dry run`);
	console.log("");

	// Run sessions
	const results: SessionResult[] = [];

	for (const scenario of scenarios) {
		for (const condition of conditions) {
			const result = runSession(scenario, condition, cli.dryRun);
			results.push(result);
		}
	}

	// Print summary table
	console.log("\n=== Summary ===\n");
	console.log("ID | Repo       | Title                          | Condition      | Time(s) | Turns | Cost");
	console.log("---|------------|--------------------------------|----------------|---------|-------|------");
	for (const r of results) {
		console.log(
			`${String(r.scenarioId).padStart(2)} | ${r.repo.padEnd(10)} | ${r.title.slice(0, 30).padEnd(30)} | ${r.condition.padEnd(14)} | ${(r.durationMs / 1000).toFixed(0).padStart(7)} | ${String(r.toolCalls).padStart(5)} | $${r.costUsd.toFixed(2)}`,
		);
	}

	// Totals
	const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
	const totalTime = results.reduce((s, r) => s + r.durationMs, 0);
	console.log(`\nTotal: ${(totalTime / 1000).toFixed(0)}s, $${totalCost.toFixed(2)}`);
	console.log(`\nResults saved to ${RESULTS_DIR}/`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
