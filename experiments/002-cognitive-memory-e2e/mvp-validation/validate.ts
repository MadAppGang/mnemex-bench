/**
 * Cognitive Codebase Memory MVP Validation
 *
 * Validates that session observations surface in search results at the right time.
 *
 * Usage: bun eval/cognitive-mvp/validate.ts [--project-path <path>]
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";

const projectPath = (() => {
	const idx = process.argv.indexOf("--project-path");
	return idx >= 0 ? resolve(process.argv[idx + 1]) : process.cwd();
})();

const OBSERVATIONS = [
	{
		content: "PageRank symbols with score > 0.05 are high-importance. Dead code detection uses pageRank <= 0.001 threshold.",
		file: "src/core/analysis/analyzer.ts",
		type: "gotcha",
	},
	{
		content: "The chunker splits oversized nodes into parts with partIndex/totalParts. MAX_CHUNK_TOKENS=600, MIN_CHUNK_TOKENS=50.",
		file: "src/core/chunker.ts",
		type: "architecture",
	},
	{
		content: "Embedding dimension mismatch causes automatic table clear. Changing embedding provider requires full re-index.",
		file: "src/core/store.ts",
		type: "gotcha",
	},
	{
		content: "Test file detection is language-specific. TypeScript uses *.test.ts/*.spec.ts, Python uses test_*.py, Go uses *_test.go.",
		file: "src/core/analysis/test-detector.ts",
		type: "pattern",
	},
	{
		content: "The --agent flag is stripped from args before command dispatch. Must check agentMode global, not args.",
		file: "src/cli.ts",
		type: "gotcha",
	},
];

const QUERIES = [
	{ query: "how does dead code detection work", expectedObservation: 0 },
	{ query: "chunking strategy oversized functions", expectedObservation: 1 },
	{ query: "what happens when I change embedding model", expectedObservation: 2 },
	{ query: "how are test files detected", expectedObservation: 3 },
	{ query: "machine parseable output", expectedObservation: 4 },
];

function run(cmd: string): string {
	try {
		return execSync(cmd, { encoding: "utf-8", cwd: projectPath, timeout: 60000 });
	} catch (e: any) {
		return e.stdout || e.stderr || String(e);
	}
}

async function main() {
	console.log("=== Cognitive Memory MVP Validation ===\n");
	console.log(`Project: ${projectPath}\n`);

	// Step 1: Ensure index exists
	console.log("Step 1: Checking index...");
	const status = run("bunx mnemex --agent status");
	if (status.includes("No index found") || status.includes("not found")) {
		console.log("  Creating index (--no-llm)...");
		run("bunx mnemex index --no-llm .");
	} else {
		console.log("  Index exists.");
	}

	// Step 2: Write observations
	console.log("\nStep 2: Writing observations...");
	for (let i = 0; i < OBSERVATIONS.length; i++) {
		const obs = OBSERVATIONS[i];
		const cmd = `bunx mnemex --agent observe "${obs.content}" --file ${obs.file} --type ${obs.type}`;
		const out = run(cmd);
		const idMatch = out.match(/observation_id=(\w+)/);
		console.log(`  [${i}] ${obs.type}: ${idMatch ? idMatch[1] : "written"}`);
	}

	// Step 3: Run queries and check results
	console.log("\nStep 3: Running queries...\n");
	let passed = 0;
	const results: { query: string; found: boolean; rank: number | null; topTypes: string[] }[] = [];

	for (const { query, expectedObservation } of QUERIES) {
		const expected = OBSERVATIONS[expectedObservation];
		const out = run(`bunx mnemex --agent search "${query}"`);
		const lines = out.split("\n").filter((l) => l.trim());

		// Check if observation appears in results
		const observationLines = lines
			.map((line, idx) => ({ line, idx }))
			.filter(({ line }) => line.startsWith("observation "));

		const codeLines = lines
			.map((line, idx) => ({ line, idx }))
			.filter(({ line }) => line.startsWith("result "));

		// Combine all result lines in order for rank tracking
		const allResultLines = lines
			.filter((l) => l.startsWith("result ") || l.startsWith("observation "));

		let found = false;
		let rank: number | null = null;

		// Check if the expected observation's content appears in any observation line
		for (let i = 0; i < allResultLines.length; i++) {
			const line = allResultLines[i];
			if (line.startsWith("observation ") && line.includes(expected.content.slice(0, 40))) {
				found = true;
				rank = i + 1;
				break;
			}
		}

		const topTypes = allResultLines.slice(0, 5).map((l) =>
			l.startsWith("observation ") ? "obs" : "code",
		);

		results.push({ query, found, rank, topTypes });

		const status = found && rank !== null && rank <= 5 ? "PASS" : "FAIL";
		if (status === "PASS") passed++;

		console.log(`  ${status} "${query}"`);
		console.log(`       observation ${found ? `found at rank ${rank}` : "NOT found in results"}`);
		console.log(`       top-5 types: [${topTypes.join(", ")}]`);
		console.log("");
	}

	// Step 4: Summary
	console.log("=== Results ===\n");
	console.log(`  Passed: ${passed}/${QUERIES.length}`);
	console.log(`  Success criteria: 4/${QUERIES.length} observations in top-5`);
	console.log(`  Verdict: ${passed >= 4 ? "PASS" : "FAIL"}\n`);

	// Output structured results
	console.log("=== Detailed Results (JSON) ===");
	console.log(JSON.stringify(results, null, 2));

	process.exit(passed >= 4 ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
