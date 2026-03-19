#!/usr/bin/env bun
export {};
import {
  clear, title, subtitle, note, bar, center, renderTable, wait,
  RESET, BOLD, DIM, WHITE, CYAN, GREEN, YELLOW, RED, GRAY,
  BG_ROW, BG_GREEN, BG_RED, BG_YELLOW, BG_CYAN,
} from "../tools/table";

const write = (s: string) => Bun.write(Bun.stdout, s);

// ══════════════════════════════════════════════════════════════
// TABLE 1: Experiment Overview
// ══════════════════════════════════════════════════════════════
clear();
title("MNEMEX EVALUATION SYNTHESIS");
note("6 experiments  ·  1,000+ queries  ·  350+ agent sessions  ·  March 4-18, 2026");
console.log();

renderTable({
  columns: [
    { header: "#", width: 5 },
    { header: "Experiment", width: 28, align: "left" },
    { header: "Dates", width: 12 },
    { header: "Scale", width: 16 },
    { header: "Key Finding", width: 40, align: "left",
      format: (cell, ri) => {
        const color = [GREEN, YELLOW, GREEN, YELLOW, RED, GREEN][ri] ?? WHITE;
        return `${BOLD}${color} ${cell.padEnd(39)}${RESET}`;
      },
    },
  ],
  rows: [
    ["001", "LLM Speed Claudish", "Mar 5-6", "12 model-routes", "Gemini/GPT tied at 33s"],
    ["002", "Cognitive Memory E2E", "Mar 4-6", "64 sessions", "Null result (model too capable)"],
    ["006", "Search Pipeline Ablation", "Mar 10-18", "1,000+ queries", "Router +21.8%, LLM hurts"],
    ["009", "Mnemex vs Serena", "Mar 4", "8 sessions", "Neither wins cleanly"],
    ["011", "N-Way Tool Benchmark", "Mar 11-16", "24 sessions", "Mnemex 2.4x slower (API gap)"],
    ["012", "SWE-bench Ablation", "Mar 4", "280+ instances", "mnemex +14.9pp pass rate"],
  ],
  rowBg: (i) => i % 2 === 0 ? BG_ROW : "",
});

await wait();

// ══════════════════════════════════════════════════════════════
// TABLE 2: SWE-bench Context Ablation (Experiment 012)
// ══════════════════════════════════════════════════════════════
clear();
title("SWE-BENCH CONTEXT ABLATION (EXPERIMENT 012)");
note("Does mnemex context help agents solve real GitHub issues?  ·  46-48 instances per condition");
console.log();

const sweRows: [string, number, number, number, number][] = [
  ["claudemem_full",        15,  9, 22, 62.5],
  ["human_written",         11,  9, 27, 55.0],
  ["claudemem+generated",   11, 11, 25, 50.0],
  ["claude_planner",        12, 13, 22, 48.0],
  ["no_plan (baseline)",    10, 11, 27, 47.6],
  ["claudemem+human",        8, 13, 26, 38.1],
];

renderTable({
  columns: [
    { header: "Condition", width: 24, align: "left" },
    { header: "Resolved", width: 10 },
    { header: "Real Fail", width: 10 },
    { header: "Infra Err", width: 10 },
    { header: "Pass Rate", width: 12,
      format: (cell) => {
        const v = parseFloat(cell);
        const color = v >= 60 ? GREEN : v >= 48 ? YELLOW : RED;
        return `${BOLD}${color}${center(cell + "%", 12)}${RESET}`;
      },
    },
    { header: "Bar", width: 22,
      format: (cell) => {
        const v = parseFloat(cell);
        const color = v >= 60 ? GREEN : v >= 48 ? YELLOW : RED;
        return ` ${bar(v, 100, 20, color)} `;
      },
    },
  ],
  rows: sweRows.map(([name, resolved, fail, infra, rate]) => [
    ` ${name}`, String(resolved), String(fail), String(infra), String(rate), String(rate),
  ]),
  rowBg: (i) => i === 0 ? BG_GREEN : i === 5 ? BG_RED : i % 2 === 0 ? BG_ROW : "",
});

console.log();
subtitle("Key Insight");
console.log(`  ${BOLD}${GREEN}+14.9pp${RESET}  mnemex alone beats baseline (62.5% vs 47.6%)`);
console.log(`  ${BOLD}${RED}-9.5pp${RESET}   combining mnemex + CLAUDE.md is the WORST condition`);
console.log(`  ${DIM}         Static context dilutes task-specific signal${RESET}`);

await wait();

// ══════════════════════════════════════════════════════════════
// TABLE 3: Search Pipeline (Experiment 006 — 12 repos)
// ══════════════════════════════════════════════════════════════
clear();
title("SEARCH PIPELINE ABLATION (EXPERIMENT 006)");
note("12 repos  ·  860 queries  ·  Does the router, expander, or reranker help?");
console.log();

const pipelineRows: [string, string, number, number, string, number][] = [
  ["B1", "+Regex router",      0.524, +21.8, "+0.094", 2726],
  ["A",  "Baseline (hybrid)",  0.430,   0.0, "—",      2549],
  ["C2", "+Expander (Qwen-FT)",0.316, -26.4, "-0.114", 6501],
  ["C3", "+Expander (LFM2)",   0.307, -28.6, "-0.123", 4869],
  ["D",  "+Reranker only",     0.292, -32.0, "-0.138", 10365],
  ["C1", "+Expander (LFM-700M)",0.292,-32.0, "-0.138", 4851],
  ["E",  "Full pipeline",      0.255, -40.6, "-0.175", 20656],
  ["F",  "Router + expander",  0.252, -41.3, "-0.177", 5370],
];

renderTable({
  columns: [
    { header: "Cond", width: 6 },
    { header: "Description", width: 24, align: "left" },
    { header: "MRR@10", width: 9,
      format: (cell, ri) => {
        const v = parseFloat(cell);
        const color = ri === 0 ? GREEN : ri === 1 ? WHITE : RED;
        return `${BOLD}${color}${center(v.toFixed(3), 9)}${RESET}`;
      },
    },
    { header: "MRR Bar", width: 22,
      format: (cell) => {
        const v = parseFloat(cell);
        const color = v >= 0.5 ? GREEN : v >= 0.4 ? YELLOW : RED;
        return ` ${bar(v, 0.7, 20, color)} `;
      },
    },
    { header: "% Change", width: 10,
      format: (cell) => {
        const v = parseFloat(cell);
        if (v === 0) return center("—", 10);
        const color = v > 0 ? GREEN : RED;
        const sign = v > 0 ? "+" : "";
        return `${BOLD}${color}${center(sign + v.toFixed(1) + "%", 10)}${RESET}`;
      },
    },
    { header: "P95 ms", width: 8 },
  ],
  rows: pipelineRows.map(([cond, desc, mrr, pct, _delta, p95]) => [
    cond, ` ${desc}`, String(mrr), String(mrr), String(pct), String(p95),
  ]),
  rowBg: (i) => i === 0 ? BG_GREEN : i >= 6 ? BG_RED : i % 2 === 0 ? BG_ROW : "",
});

console.log();
subtitle("Per-Repo Router Effect (B1 vs A)");

const repoRows: [string, number, number][] = [
  ["smolagents",    0.521, 0.863],
  ["pdm",           0.246, 0.499],
  ["opshin",        0.469, 0.674],
  ["fastmcp",       0.382, 0.498],
  ["pr-agent",      0.454, 0.545],
  ["ragas",         0.511, 0.575],
  ["tinygrad",      0.578, 0.635],
  ["wagtail",       0.361, 0.365],
  ["openai-agents", 0.549, 0.468],
];

for (const [repo, baseline, router] of repoRows) {
  const delta = router - baseline;
  const sign = delta >= 0 ? "+" : "";
  const color = delta > 0.1 ? GREEN : delta > 0 ? YELLOW : RED;
  const arrow = delta >= 0 ? "▲" : "▼";
  write(`  ${BOLD}${repo.padEnd(16)}${RESET}`);
  write(`  A ${baseline.toFixed(3)} ${bar(baseline, 1.0, 15, DIM)}  `);
  write(`  B1 ${router.toFixed(3)} ${bar(router, 1.0, 15, CYAN)}  `);
  write(`  ${color}${arrow} ${sign}${delta.toFixed(3)}${RESET}\n`);
}
console.log();
note("Router wins in 8/9 repos (89%). Largest: smolagents +0.342 (+66%)");

await wait();

// ══════════════════════════════════════════════════════════════
// TABLE 4: Local vs Cloud Embeddings (Experiment 006)
// ══════════════════════════════════════════════════════════════
clear();
title("LOCAL VS CLOUD EMBEDDINGS (EXPERIMENT 006)");
note("Does the pipeline compensate for weaker local embeddings?  ·  fastmcp, n=30");
console.log();

renderTable({
  columns: [
    { header: "Condition", width: 18, align: "left" },
    { header: "voyage-3.5-lite", width: 16,
      format: (cell) => {
        if (cell === "—") return center("—", 16);
        const v = parseFloat(cell);
        return `${BOLD}${CYAN}${center(v.toFixed(3), 16)}${RESET}`;
      },
    },
    { header: "nomic (local)", width: 16,
      format: (cell) => {
        if (cell === "—") return center("—", 16);
        const v = parseFloat(cell);
        const color = v >= 0.46 ? GREEN : v >= 0.4 ? YELLOW : RED;
        return `${BOLD}${color}${center(v.toFixed(3), 16)}${RESET}`;
      },
    },
    { header: "p-value", width: 10,
      format: (cell) => {
        if (cell === "—") return center("—", 10);
        const v = parseFloat(cell);
        const color = v < 0.05 ? GREEN : GRAY;
        return `${color}${center(cell, 10)}${RESET}`;
      },
    },
    { header: "Sig?", width: 6,
      format: (cell) => {
        const color = cell === "YES" ? GREEN : GRAY;
        return `${BOLD}${color}${center(cell, 6)}${RESET}`;
      },
    },
  ],
  rows: [
    [" A (baseline)",  "0.438", "0.248", "—",      "—"],
    [" B1 (router)",   "0.485", "0.463", "0.0025", "YES"],
    [" E-RA (full)",   "—",     "0.495", "0.0018", "YES"],
    [" F-RA (no rrk)", "—",     "0.467", "0.0020", "YES"],
  ],
  rowBg: (i) => i === 2 ? BG_GREEN : i % 2 === 0 ? BG_ROW : "",
});

console.log();
subtitle("The Pipeline Equalizer");
console.log(`  ${BOLD}Cloud baseline:${RESET}   ${CYAN}voyage-3.5-lite${RESET} A = ${BOLD}0.438${RESET}`);
console.log(`  ${BOLD}Local + pipeline:${RESET} ${GREEN}nomic-embed-text${RESET} E-RA = ${BOLD}${GREEN}0.495${RESET}  ${DIM}(beats cloud!)${RESET}`);
console.log(`  ${BOLD}Local sweet spot:${RESET} ${YELLOW}nomic-embed-text${RESET} F-RA = ${BOLD}${YELLOW}0.467${RESET}  ${DIM}at 2s P95, no cloud API${RESET}`);

await wait();

// ══════════════════════════════════════════════════════════════
// TABLE 5: MCP Tool Comparison (Experiments 009 + 011)
// ══════════════════════════════════════════════════════════════
clear();
title("MCP TOOL API COMPARISON (EXPERIMENTS 009, 011)");
note("3 tools  ·  4 tasks  ·  2 repos  ·  Why is mnemex 2.4x slower than serena?");
console.log();

renderTable({
  columns: [
    { header: "Tool", width: 14, align: "left",
      format: (cell, ri) => {
        const colors = [GREEN, YELLOW, RED];
        return `${BOLD}${colors[ri] ?? WHITE} ${cell.padEnd(13)}${RESET}`;
      },
    },
    { header: "Duration", width: 10 },
    { header: "Dur Bar", width: 22,
      format: (cell) => {
        const v = parseInt(cell);
        const color = v <= 250 ? GREEN : v <= 400 ? YELLOW : RED;
        return ` ${bar(v, 600, 20, color)} `;
      },
    },
    { header: "Tool Calls", width: 12 },
    { header: "Cost", width: 8 },
    { header: "vs Serena", width: 12,
      format: (cell) => {
        if (cell === "1.0x") return `${GREEN}${center(cell, 12)}${RESET}`;
        const v = parseFloat(cell);
        const color = v <= 1.5 ? YELLOW : RED;
        return `${BOLD}${color}${center(cell, 12)}${RESET}`;
      },
    },
  ],
  rows: [
    ["serena",      "223s", "223", "45", "$0.59", "1.0x"],
    ["bare-claude", "370s", "370", "49", "$0.80", "1.7x"],
    ["mnemex",      "592s", "592", "59", "$0.83", "2.7x"],
  ],
  rowBg: (i) => i === 0 ? BG_GREEN : i === 2 ? BG_RED : BG_ROW,
});

console.log();
subtitle("Root Cause: Symbol Lookup (T01 — Find FastMCP.__init__)");
console.log();

const stepsSerena = [
  ["1", "find_symbol(..., include_body=true)", "Done", GREEN],
];
const stepsMnemex = [
  ["1", "symbol('FastMCP.__init__')", "location only", RED],
  ["2", "symbol('FastMCP')", "class def", RED],
  ["3", "context(server.py, line 156)", "fixed window", YELLOW],
  ["4", "context(server.py, line 200)", "fixed window", YELLOW],
  ["5", "search('FastMCP __init__')", "NL against code", RED],
  ["6", "Read(server.py, offset=156)", "native fallback", GRAY],
];

write(`  ${BOLD}${GREEN}Serena: 22s, 2 calls${RESET}\n`);
for (const [step, tool, result, color] of stepsSerena) {
  write(`    ${DIM}${step}.${RESET} ${CYAN}${tool.padEnd(42)}${RESET} ${color as string}${result}${RESET}\n`);
}
console.log();
write(`  ${BOLD}${RED}Mnemex: 38s, 8 calls${RESET}\n`);
for (const [step, tool, result, color] of stepsMnemex) {
  write(`    ${DIM}${step}.${RESET} ${CYAN}${tool.padEnd(42)}${RESET} ${color as string}${result}${RESET}\n`);
}

console.log();
subtitle("Post-Pipeline Improvement");

renderTable({
  columns: [
    { header: "Task", width: 26, align: "left" },
    { header: "Before", width: 12 },
    { header: "After", width: 12 },
    { header: "Change", width: 12,
      format: (cell) => {
        const color = cell.includes("-51") ? GREEN : cell.includes("+") ? RED : YELLOW;
        return `${BOLD}${color}${center(cell, 12)}${RESET}`;
      },
    },
  ],
  rows: [
    [" T03 cross-file trace", "296s / 28", "144s / 22", "-51%"],
    [" T01 symbol lookup",    "38s / 8",   "40s / 7",   "~same"],
    [" T04 tinygrad trace",   "234s / 19", "266s / 20", "+14%"],
    [" Total",                "592s / 59", "486s / 56", "-18%"],
  ],
  rowBg: (i) => i === 0 ? BG_GREEN : i === 3 ? BG_CYAN : i % 2 === 0 ? BG_ROW : "",
});

await wait();

// ══════════════════════════════════════════════════════════════
// TABLE 6: LLM Speed (Experiment 001)
// ══════════════════════════════════════════════════════════════
clear();
title("LLM SPEED LEADERBOARD (EXPERIMENT 001)");
note("6 models  ·  5 rounds  ·  TypeScript coding task  ·  via claudish/OpenRouter");
console.log();

const speedRows: [number, string, string, number, number, string, string][] = [
  [1, "Gemini 3 Flash",     "OR",     32.6, 4.7, "$0.50", "$3.00"],
  [2, "GPT-5.1 Codex Mini", "OR",     32.7, 4.4, "$0.25", "$2.00"],
  [3, "GPT-5.1 Codex Mini", "Direct", 32.9, 4.1, "$0.25", "$2.00"],
  [4, "Gemini 3 Flash",     "Direct", 33.4, 4.7, "$0.50", "$3.00"],
  [5, "MiniMax M2.5",       "OR",     40.4, 6.2, "$0.29", "$1.20"],
  [6, "Qwen3.5 Plus",       "Direct", 41.7, 4.6, "$0.26", "$1.56"],
  [7, "Qwen3.5 Plus",       "OR",     42.7, 7.8, "$0.26", "$1.56"],
  [8, "Kimi K2.5",          "Direct", 43.8, 5.9, "$0.45", "$2.20"],
  [9, "GLM-5",              "OR",     47.4, 9.1, "$0.80", "$2.56"],
  [10,"Kimi K2.5",          "OR",     48.7, 9.4, "$0.45", "$2.20"],
];

renderTable({
  columns: [
    { header: "#", width: 5,
      format: (cell) => {
        const rank = parseInt(cell);
        if (rank <= 2) return `${BOLD}${GREEN}${center("★" + cell, 5)}${RESET}`;
        if (rank <= 4) return `${BOLD}${YELLOW}${center(cell, 5)}${RESET}`;
        return center(cell, 5);
      },
    },
    { header: "Model", width: 22, align: "left" },
    { header: "Route", width: 8 },
    { header: "Mean", width: 8,
      format: (cell) => {
        const v = parseFloat(cell);
        const color = v < 34 ? GREEN : v < 42 ? YELLOW : RED;
        return `${BOLD}${color}${center(v.toFixed(1) + "s", 8)}${RESET}`;
      },
    },
    { header: "Speed Bar", width: 22,
      format: (cell) => {
        const v = parseFloat(cell);
        const color = v < 34 ? GREEN : v < 42 ? YELLOW : RED;
        return ` ${bar(55 - v, 30, 20, color)} `;
      },
    },
    { header: "StdDev", width: 7 },
    { header: "In $/M", width: 8 },
    { header: "Out $/M", width: 8 },
  ],
  rows: speedRows.map(([rank, model, route, mean, std, inP, outP]) => [
    String(rank), ` ${model}`, route, String(mean), String(mean), std.toFixed(1) + "s", inP, outP,
  ]),
  rowBg: (i) => i < 2 ? BG_GREEN : i < 4 ? BG_CYAN : i % 2 === 0 ? BG_ROW : "",
});

console.log();
note("GPT-5.1 Codex Mini: tied for fastest at lowest price ($0.25/M). Best value.");
note("OpenRouter adds ~0% overhead for fast models. Direct API faster only for Kimi (-10%).");

await wait();

// ══════════════════════════════════════════════════════════════
// TABLE 7: Recommendations
// ══════════════════════════════════════════════════════════════
clear();
title("ACTIONABLE RECOMMENDATIONS");
console.log();

const recs: [string, string, string, string][] = [
  ["P0", "Ship regex query router",         "006: +21.8% MRR, 8/9 repos",     "Biggest single improvement"],
  ["P0", "Add includeBody to symbol tool",   "011: 4x call reduction",          "Closes serena gap"],
  ["P1", "Add readFile(path, start, end)",   "011: eliminates native fallback",  "Removes tool confusion"],
  ["P1", "Add regex searchForPattern",       "011: stops search_code thrashing", "Deterministic code search"],
  ["P2", "Default local embeds + F-RA",      "006: MRR=0.467, no cloud API",    "Zero-config deployment"],
  ["P3", "Never combine mnemex + CLAUDE.md", "012: combined = worst condition",  "Noise dilutes signal"],
];

for (const [pri, action, evidence, impact] of recs) {
  const color = pri === "P0" ? RED : pri === "P1" ? YELLOW : pri === "P2" ? CYAN : GRAY;
  const bg = pri === "P0" ? BG_RED : pri === "P1" ? BG_YELLOW : "";
  write(`  ${bg}${BOLD}${color} ${pri} ${RESET} `);
  write(`${BOLD}${WHITE}${action.padEnd(36)}${RESET}`);
  write(`${DIM}${evidence.padEnd(34)}${RESET}`);
  write(`${GREEN}${impact}${RESET}\n`);
  if (pri === "P0" || pri === "P1") console.log();
}

console.log();

// ── Closing banner ──
console.log(`\n  ${BOLD}${GREEN}${"═".repeat(80)}${RESET}`);
console.log(`  ${BOLD}${GREEN}  MNEMEX EVALUATION SYNTHESIS${RESET}`);
console.log(`  ${BOLD}${WHITE}  6 experiments  ·  1,000+ queries  ·  350+ sessions  ·  Mar 4-18, 2026${RESET}`);
console.log(`  ${DIM}  "A pre-built index helps, but the agent-facing API matters more"${RESET}`);
console.log(`  ${DIM}  "than the retrieval pipeline behind it."${RESET}`);
console.log(`  ${BOLD}${GREEN}${"═".repeat(80)}${RESET}\n`);
