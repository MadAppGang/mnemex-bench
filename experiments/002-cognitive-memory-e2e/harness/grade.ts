#!/usr/bin/env bun
/**
 * Manual grading UI for cognitive memory E2E eval results.
 *
 * Displays each session's output and prompts for a grade (0/1/2).
 * Computes aggregate stats per condition.
 *
 * Usage:
 *   bun eval/cognitive-e2e/grade.ts                    # grade all ungraded
 *   bun eval/cognitive-e2e/grade.ts --show              # show existing grades
 *   bun eval/cognitive-e2e/grade.ts --scenario 1        # grade specific scenario
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { CONDITIONS, type Condition, SCENARIOS } from "./scenarios.js";

const EVAL_DIR = resolve(import.meta.dirname!);
const RESULTS_DIR = join(EVAL_DIR, "results");
const GRADES_FILE = join(EVAL_DIR, "grades.json");

interface Grade {
	scenarioId: number;
	repo: string;
	condition: Condition;
	score: number; // 0, 1, or 2
	notes: string;
}

function loadGrades(): Grade[] {
	if (!existsSync(GRADES_FILE)) return [];
	return JSON.parse(readFileSync(GRADES_FILE, "utf-8"));
}

function saveGrades(grades: Grade[]) {
	writeFileSync(GRADES_FILE, JSON.stringify(grades, null, 2));
}

function findResultFiles(): Array<{ repo: string; scenarioId: number; condition: Condition; path: string }> {
	const files: Array<{ repo: string; scenarioId: number; condition: Condition; path: string }> = [];

	if (!existsSync(RESULTS_DIR)) return files;

	for (const repoDir of readdirSync(RESULTS_DIR)) {
		const repoPath = join(RESULTS_DIR, repoDir);
		for (const scenarioDir of readdirSync(repoPath)) {
			const scenarioPath = join(repoPath, scenarioDir);
			const idMatch = scenarioDir.match(/scenario-(\d+)/);
			if (!idMatch) continue;
			const scenarioId = Number(idMatch[1]);

			for (const file of readdirSync(scenarioPath)) {
				const condMatch = file.match(/^(baseline|skill-doc|observations)\.json$/);
				if (!condMatch) continue;
				files.push({
					repo: repoDir,
					scenarioId,
					condition: condMatch[1] as Condition,
					path: join(scenarioPath, file),
				});
			}
		}
	}

	return files.sort((a, b) => a.scenarioId - b.scenarioId || CONDITIONS.indexOf(a.condition) - CONDITIONS.indexOf(b.condition));
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
	return new Promise((resolve) => rl.question(question, resolve));
}

async function gradeInteractive(scenarioFilter?: number) {
	const grades = loadGrades();
	const files = findResultFiles();

	if (files.length === 0) {
		console.log("No results found. Run eval first.");
		return;
	}

	const rl = createInterface({ input: process.stdin, output: process.stdout });

	for (const file of files) {
		if (scenarioFilter && file.scenarioId !== scenarioFilter) continue;

		// Skip already graded
		const existing = grades.find(
			(g) => g.scenarioId === file.scenarioId && g.condition === file.condition && g.repo === file.repo,
		);
		if (existing) continue;

		const result = JSON.parse(readFileSync(file.path, "utf-8"));
		const scenario = SCENARIOS.find((s) => s.id === file.scenarioId);

		console.log("\n" + "=".repeat(80));
		console.log(`Scenario ${file.scenarioId}: ${scenario?.title ?? "?"}`);
		console.log(`Condition: ${file.condition} | Repo: ${file.repo}`);
		console.log(`Time: ${(result.durationMs / 1000).toFixed(1)}s | Tools: ${result.toolCalls}`);
		console.log("-".repeat(80));
		console.log("Task:", result.task);
		console.log("-".repeat(80));

		// Show output (truncated)
		const output = typeof result.output === "string" ? result.output : JSON.stringify(result.output, null, 2);
		const lines = output.split("\n");
		if (lines.length > 60) {
			console.log(lines.slice(0, 60).join("\n"));
			console.log(`\n... (${lines.length - 60} more lines)`);
		} else {
			console.log(output);
		}

		console.log("-".repeat(80));
		if (scenario?.expectedFiles.length) {
			console.log("Expected files:", scenario.expectedFiles.join(", "));
		}

		// Prompt for grade
		console.log("\nGrading: 0=wrong/missed  1=partial  2=correct/complete");
		let score = -1;
		while (score < 0 || score > 2) {
			const input = await prompt(rl, "Grade (0/1/2): ");
			if (input === "q" || input === "quit") {
				saveGrades(grades);
				rl.close();
				return;
			}
			score = Number(input);
		}

		const notes = await prompt(rl, "Notes (optional): ");

		grades.push({
			scenarioId: file.scenarioId,
			repo: file.repo,
			condition: file.condition,
			score,
			notes,
		});

		saveGrades(grades);
	}

	rl.close();
	showSummary(grades);
}

function showSummary(grades?: Grade[]) {
	const g = grades ?? loadGrades();
	if (g.length === 0) {
		console.log("No grades yet.");
		return;
	}

	console.log("\n=== Grade Summary ===\n");

	// Per-condition averages
	for (const cond of CONDITIONS) {
		const condGrades = g.filter((x) => x.condition === cond);
		if (condGrades.length === 0) continue;
		const avg = condGrades.reduce((s, x) => s + x.score, 0) / condGrades.length;
		const dist = [0, 1, 2].map((s) => condGrades.filter((x) => x.score === s).length);
		console.log(`  ${cond.padEnd(14)} avg=${avg.toFixed(2)}  (0:${dist[0]} 1:${dist[1]} 2:${dist[2]})  n=${condGrades.length}`);
	}

	// Per-scenario breakdown
	console.log("\n  ID | no-index | baseline | skill-doc | observations | Title");
	console.log("  ---|----------|----------|-----------|--------------|------");
	const ids = [...new Set(g.map((x) => x.scenarioId))].sort((a, b) => a - b);
	for (const id of ids) {
		const scenario = SCENARIOS.find((s) => s.id === id);
		const scores = CONDITIONS.map((c) => {
			const grade = g.find((x) => x.scenarioId === id && x.condition === c);
			return grade !== undefined ? String(grade.score) : "-";
		});
		console.log(
			`  ${String(id).padStart(2)} | ${scores[0].padStart(8)} | ${scores[1].padStart(8)} | ${scores[2].padStart(9)} | ${scores[3].padStart(12)} | ${scenario?.title ?? "?"}`,
		);
	}
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--show")) {
	showSummary();
} else {
	const scenIdx = args.indexOf("--scenario");
	const scenFilter = scenIdx >= 0 ? Number(args[scenIdx + 1]) : undefined;
	gradeInteractive(scenFilter);
}
