#!/usr/bin/env bun
/**
 * Pretty-print all research tables for terminal screenshots.
 */
export {};

// Terminal width
const W = 120;

// Colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
// const UNDERLINE = "\x1b[4m";
// Foreground
const WHITE = "\x1b[97m";
const CYAN = "\x1b[96m";
const GREEN = "\x1b[92m";
const YELLOW = "\x1b[93m";
const RED = "\x1b[91m";
const MAGENTA = "\x1b[95m";
// const BLUE = "\x1b[94m";
const GRAY = "\x1b[90m";
// Background
const BG_ROW = "\x1b[48;5;236m";
const BG_HEAD = "\x1b[48;5;25m";
const BG_GREEN = "\x1b[48;5;22m";
const BG_RED = "\x1b[48;5;52m";

declare var Bun: any;
const write = (s: string) => Bun.write(Bun.stdout, s);

function clear(): void {
  write("\x1bc");
}

function title(text: string): void {
  const pad = Math.floor((W - text.length - 4) / 2);
  const rightPad = W - pad - text.length - 4;
  console.log();
  console.log(`${BOLD}${CYAN}${"━".repeat(W)}${RESET}`);
  console.log(`${BOLD}${CYAN}${"━".repeat(pad)}  ${WHITE}${text}  ${CYAN}${"━".repeat(rightPad)}${RESET}`);
  console.log(`${BOLD}${CYAN}${"━".repeat(W)}${RESET}`);
  console.log();
}

function subtitle(text: string): void {
  console.log(`\n  ${BOLD}${YELLOW}${text}${RESET}`);
  console.log(`  ${DIM}${"─".repeat(text.length + 4)}${RESET}\n`);
}

function note(text: string): void {
  console.log(`  ${DIM}${text}${RESET}`);
}

function bar(value: number, maxVal = 1.0, width = 20, color = GREEN): string {
  const filled = Math.floor((value / maxVal) * width);
  const empty = width - filled;
  return `${color}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RESET}`;
}

async function wait(): Promise<void> {
  console.log(`\n  ${DIM}${"─".repeat(60)}${RESET}`);
  write(`  ${DIM}Press Enter for next table...${RESET}`);
  const reader = Bun.stdin.stream().getReader();
  await reader.read();
  reader.releaseLock();
}

// ══════════════════════════════════════════════════════════════════════
// TABLE 1: Full Leaderboard
// ══════════════════════════════════════════════════════════════════════

clear();
title("QUERY EXPANSION MODEL BENCHMARK — FULL LEADERBOARD");
note("25 models evaluated on 50 code search queries  •  Scoring: Format(.20) KW(.20) Sem(.20) HyDE(.25) Speed(.15)");
console.log();

type LeaderboardRow = [string, string, string, string, string, string, string, string, string, string];

const leaderboard: LeaderboardRow[] = [
  ["1",  "LFM2-2.6B",       "2.6B",  "Base", "1.000", ".913", ".996", ".597", "1,879",   ".816"],
  ["2",  "Qwen3-4B-2507",   "4B",    "Base", "1.000", ".965", "1.00", ".633", "2,158",   ".811"],
  ["3",  "Qwen3-1.7B-FT",   "1.7B",  "SFT",  "1.000", ".869", "1.00", ".588", "3,473",   ".777"],
  ["4",  "Qwen3.5-2B-FT",   "2B",    "SFT",  "1.000", ".938", "1.00", ".560", "10,241",  ".742"],
  ["5",  "LFM2.5-1.2B",     "1.2B",  "Base", ".986",  ".695", "1.00", ".272", "558",     ".728"],
  ["6",  "Qwen3-4B-FT",     "4B",    "SFT",  "1.000", ".888", "1.00", ".488", "6,011",   ".726"],
  ["7",  "Phi4-mini-FT",    "3.8B",  "SFT",  ".973",  ".823", ".960", ".474", "4,136",   ".724"],
  ["8",  "Qwen3-8B-FT",     "8B",    "SFT",  "1.000", ".885", "1.00", ".490", "6,859",   ".720"],
  ["9",  "Qwen3.5-2B",      "2B",    "Base", ".959",  ".989", ".900", ".495", "9,369",   ".712"],
  ["10", "Qwen3.5-4B-FT",   "4B",    "SFT",  ".960",  ".912", ".960", ".577", "26,657",  ".711"],
  ["11", "LFM2-700M",       "0.7B",  "Base", ".879",  ".863", ".864", ".260", "697",     ".708"],
  ["12", "LFM2-1.2B-FT",    "1.2B",  "SFT",  "1.000", ".818", ".973", ".340", "3,926",   ".698"],
  ["13", "Gemma-3-1B",      "1B",    "Base", ".960",  ".868", ".927", ".150", "1,057",   ".690"],
  ["14", "SmolLM2-1.7B",    "1.7B",  "Base", ".940",  ".664", ".871", ".389", "1,240",   ".687"],
  ["15", "Qwen3.5-0.8B",    "0.8B",  "Base", "1.000", ".802", ".996", ".339", "7,497",   ".666"],
  ["16", "LFM2-700M-FT",    "0.7B",  "SFT",  ".973",  ".708", ".956", ".274", "2,614",   ".658"],
  ["17", "Qwen3.5-9B-FT",   "9B",    "SFT",  ".727",  ".668", ".720", ".444", "40,458",  ".534"],
  ["18", "LFM2-350M",       "0.35B", "Base", ".463",  ".000", ".596", ".253", "1,338",   ".366"],
  ["19", "Qwen3-0.6B",      "0.6B",  "Base", ".326",  ".282", ".324", ".053", "1,382",   ".302"],
  ["20", "Qwen3-4B",        "4B",    "Base", ".338",  ".517", ".288", ".062", "5,545",   ".278"],
  ["21", "Qwen3-1.7B",      "1.7B",  "Base", ".252",  ".340", ".200", ".045", "3,252",   ".230"],
  ["22", "Qwen3-8B",        "8B",    "Base", ".321",  ".310", ".228", ".143", "12,238",  ".222"],
  ["23", "Qwen3.5-9B-GGUF", "9B",    "Base", ".300",  ".102", ".090", ".000", "20,794",  ".099"],
  ["24", "Qwen3.5-4B",      "4B",    "Base", ".000",  ".000", ".000", ".000", "8,290",   ".016"],
  ["25", "Qwen3.5-9B",      "9B",    "Base", ".000",  ".000", ".000", ".000", "14,590",  ".011"],
];

const headers = ["#", "Model", "Params", "Type", "Format", "KW", "Sem", "HyDE", "Speed", "Total"];
const widths =  [4,   20,       7,        6,      8,        6,    6,     6,      9,       8];

function center(s: string, width: number): string {
  const len = s.length;
  if (len >= width) return s.slice(0, width);
  const total = width - len;
  const left = Math.floor(total / 2);
  const right = total - left;
  return " ".repeat(left) + s + " ".repeat(right);
}

// Build border lines
const topLine = `  ${GRAY}┌` + widths.map(w => "─".repeat(w)).join("┬") + `┐${RESET}`;
const midLine = `  ${GRAY}├` + widths.map(w => "─".repeat(w)).join("┼") + `┤${RESET}`;
const botLine = `  ${GRAY}└` + widths.map(w => "─".repeat(w)).join("┴") + `┘${RESET}`;

console.log(topLine);
let hdr = `  ${GRAY}│${RESET}`;
for (let i = 0; i < headers.length; i++) {
  hdr += `${BG_HEAD}${BOLD}${WHITE}${center(headers[i], widths[i])}${RESET}${GRAY}│${RESET}`;
}
console.log(hdr);
console.log(midLine);

for (let ri = 0; ri < leaderboard.length; ri++) {
  const row = leaderboard[ri];
  const rank = parseInt(row[0]);
  const total = parseFloat(row[9]);

  let bg: string;
  let rankStr: string;

  if (rank <= 3) {
    bg = BG_GREEN;
    rankStr = `${BOLD}${GREEN} ★${row[0].padStart(2)}${RESET}`;
  } else if (rank <= 11) {
    bg = ri % 2 === 0 ? BG_ROW : "";
    rankStr = `  ${row[0].padStart(2)}`;
  } else {
    bg = "";
    rankStr = `${DIM}  ${row[0].padStart(2)}${RESET}`;
  }

  let totalStr: string;
  if (total >= 0.8) {
    totalStr = `${BOLD}${GREEN}${center(row[9], widths[9])}${RESET}`;
  } else if (total >= 0.7) {
    totalStr = `${GREEN}${center(row[9], widths[9])}${RESET}`;
  } else if (total >= 0.5) {
    totalStr = `${YELLOW}${center(row[9], widths[9])}${RESET}`;
  } else if (total >= 0.3) {
    totalStr = center(row[9], widths[9]);
  } else {
    totalStr = `${DIM}${center(row[9], widths[9])}${RESET}`;
  }

  const typeStr = row[3] === "SFT"
    ? `${CYAN}${center(row[3], widths[3])}${RESET}`
    : center(row[3], widths[3]);

  let line = `  ${GRAY}│${RESET}`;
  line += `${bg}${rankStr}${RESET}${GRAY}│${RESET}`;
  line += `${bg}${rank <= 3 ? BOLD : ""}${center(row[1], widths[1])}${RESET}${GRAY}│${RESET}`;
  line += `${bg}${center(row[2], widths[2])}${RESET}${GRAY}│${RESET}`;
  line += `${bg}${typeStr}${RESET}${GRAY}│${RESET}`;
  line += `${bg}${center(row[4], widths[4])}${RESET}${GRAY}│${RESET}`;
  line += `${bg}${center(row[5], widths[5])}${RESET}${GRAY}│${RESET}`;
  line += `${bg}${center(row[6], widths[6])}${RESET}${GRAY}│${RESET}`;
  line += `${bg}${center(row[7], widths[7])}${RESET}${GRAY}│${RESET}`;
  line += `${bg}${center(row[8], widths[8])}${RESET}${GRAY}│${RESET}`;
  line += `${totalStr}${GRAY}│${RESET}`;
  console.log(line);
}

console.log(botLine);

await wait();

// ══════════════════════════════════════════════════════════════════════
// TABLE 2: SFT Gain Analysis
// ══════════════════════════════════════════════════════════════════════

clear();
title("SFT GAIN ANALYSIS — Does Fine-Tuning Help?");
note("Central finding: SFT teaches FORMAT, not domain knowledge (r = -0.95 correlation)");
console.log();

subtitle("Base → Fine-Tuned Score Comparison");

type SftRow = [string, number, number, string, string];

const sftData: SftRow[] = [
  ["Qwen3.5-9B",  0.011, 0.534, "+0.523", "+4,710%"],
  ["Qwen3.5-4B",  0.016, 0.711, "+0.695", "+4,344%"],
  ["Qwen3-1.7B",  0.230, 0.777, "+0.547", "+238%"],
  ["Qwen3-8B",    0.222, 0.720, "+0.498", "+224%"],
  ["Qwen3-4B",    0.278, 0.726, "+0.448", "+161%"],
  ["Qwen3.5-2B",  0.712, 0.742, "+0.030", "+4%"],
  ["LFM2-1.2B",   0.728, 0.698, "-0.030", "-4%"],
  ["LFM2-700M",   0.708, 0.658, "-0.050", "-7%"],
];

for (const [model, base, ft, gainAbs, gainPct] of sftData) {
  const baseBar = bar(base, 1.0, 25, base >= 0.7 ? GREEN : base >= 0.3 ? YELLOW : RED);
  const ftBar = bar(ft, 1.0, 25, ft >= 0.7 ? GREEN : ft >= 0.3 ? YELLOW : RED);

  const gainVal = parseFloat(gainAbs);
  const gainColor = gainVal > 0 ? GREEN : RED;
  const arrow = gainVal > 0 ? "▲" : "▼";

  write(`  ${BOLD}${model.padEnd(18)}${RESET}`);
  write(`  Base ${base.toFixed(3)} ${baseBar}  `);
  write(`  FT ${ft.toFixed(3)} ${ftBar}  `);
  write(`  ${gainColor}${arrow} ${gainPct.padStart(8)}${RESET}\n`);
}

console.log();
subtitle("Key Insight");
console.log(`  ${BG_GREEN}${BOLD}${WHITE}  Models with broken format (base < 0.5): massive gains from SFT (100-5000%)  ${RESET}`);
console.log(`  ${BG_RED}${BOLD}${WHITE}  Models with good format (base > 0.9): zero or negative gains from SFT        ${RESET}`);
console.log(`  ${DIM}  Inflection point: ~0.7 base score. Qwen3.5-2B (0.712) gains only +4%.${RESET}`);

await wait();

// ══════════════════════════════════════════════════════════════════════
// TABLE 3: Final 3-Tier Selection
// ══════════════════════════════════════════════════════════════════════

clear();
title("FINAL MODEL SELECTION — Three-Tier Deployment");
note("Optimized for Apple Silicon local deployment  •  Total experiment cost: ~$45");
console.log();

type TierRow = [string, string, string, string, string, string, string, string];

const tiers: TierRow[] = [
  ["TINY",   "LFM2-700M",     "0.7B", ".708", "697ms",   "~450MB", "No",          "8GB Mac, latency-critical"],
  ["MEDIUM", "Qwen3-1.7B-FT", "1.7B", ".777", "3,473ms", "~1.1GB", "Yes ($1.50)", "16GB Mac, best balance"],
  ["LARGE",  "LFM2-2.6B",     "2.6B", ".816", "1,879ms", "~1.6GB", "No",          "32GB+ Mac, max quality"],
];

for (const [tier, model, params, total, speed, vram, training, useCase] of tiers) {
  let tierColor: string;
  let bg: string;
  if (tier === "TINY") {
    tierColor = YELLOW;
    bg = "\x1b[48;5;58m";
  } else if (tier === "MEDIUM") {
    tierColor = CYAN;
    bg = "\x1b[48;5;24m";
  } else {
    tierColor = GREEN;
    bg = "\x1b[48;5;22m";
  }

  write(`  ${bg}${BOLD}${tierColor}  ${tier.padEnd(8)}${RESET}`);
  write(`  ${BOLD}${WHITE}${model.padEnd(18)}${RESET}`);
  write(`  ${params.padStart(5)}  `);
  write(`  ${BOLD}${GREEN}${total}${RESET}  `);
  write(`  ${speed.padStart(10)}  `);
  write(`  ${vram.padStart(7)}  `);
  write(`  ${DIM}${training.padEnd(14)}${RESET}\n`);
  console.log(`  ${DIM}${"".padEnd(8)}  Use: ${useCase}${RESET}`);
  console.log();
}

subtitle("Score Visualization");
for (const [, model, , total] of tiers) {
  const totalF = parseFloat(total);
  const b = bar(totalF, 1.0, 50, GREEN);
  console.log(`  ${BOLD}${model.padEnd(18)}${RESET} ${total}  ${b}`);
}

console.log();
subtitle("Runner-up");
console.log(`  ${DIM}Qwen3-4B-2507 (base, 4B) — .811 total, 2,158ms — could replace LFM2-2.6B as Large tier${RESET}`);

await wait();

// ══════════════════════════════════════════════════════════════════════
// TABLE 4: Speed Analysis
// ══════════════════════════════════════════════════════════════════════

clear();
title("INFERENCE SPEED — Architecture Comparison on Apple Silicon");
note("All measurements: Apple M2 Pro, 32GB, 4-bit quantization, 50-query average");
console.log();

type SpeedRow = [string, number, number, string];

const speedData: SpeedRow[] = [
  ["LFM2.5-1.2B",    1.2,  558,   "SSM"],
  ["LFM2-700M",      0.7,  697,   "SSM"],
  ["Gemma-3-1B",     1.0,  1057,  "Transformer"],
  ["SmolLM2-1.7B",   1.7,  1240,  "Transformer"],
  ["LFM2-350M",      0.35, 1338,  "SSM *"],
  ["LFM2-2.6B",      2.6,  1879,  "SSM"],
  ["Qwen3-4B-2507",  4.0,  2158,  "Transformer"],
  ["Qwen3-1.7B-FT",  1.7,  3473,  "Transformer"],
  ["Qwen3-4B",       4.0,  5545,  "Transformer"],
  ["Qwen3.5-2B",     2.0,  9369,  "Gated Delta Net"],
  ["Qwen3-8B",       8.0,  12238, "Transformer"],
  ["Qwen3.5-9B-FT",  9.0,  40458, "Gated Delta Net"],
];

const maxSpeed = 42000;
for (const [model, params, ms, arch] of speedData) {
  let barLen = Math.max(1, Math.floor((ms / maxSpeed) * 60));

  let color: string;
  if (ms < 1000) {
    color = GREEN;
  } else if (ms < 3000) {
    color = YELLOW;
  } else if (ms < 10000) {
    color = RED;
  } else {
    color = `${BOLD}${RED}`;
  }

  const archColor = arch.includes("SSM") ? CYAN : arch.includes("Delta") ? MAGENTA : "";
  const msFormatted = ms.toLocaleString("en-US");

  console.log(`  ${BOLD}${model.padEnd(18)}${RESET} ${params.toFixed(2).replace(/\.?0+$/, "").padStart(4) }B  ${color}${msFormatted.padStart(6)}ms${RESET}  ${color}${"█".repeat(barLen)}${RESET}  ${archColor}${arch}${RESET}`);
}

console.log();
note("* LFM2-350M anomalously slow — likely unoptimized MPS kernels for smallest SSM variant");
console.log();
subtitle("Key Finding: LFM2 (SSM) runs 2-10x faster than transformers at equivalent sizes");
console.log(`  ${GREEN}█ SSM${RESET}  < 2,000ms for all sizes up to 2.6B`);
console.log(`  ${RED}█ Gated Delta Network${RESET}  5-10x slower than standard transformers`);

await wait();

// ══════════════════════════════════════════════════════════════════════
// TABLE 5: HyDE Quality by Model Size
// ══════════════════════════════════════════════════════════════════════

clear();
title("HyDE QUALITY BY MODEL SIZE");
note("HyDE (Hypothetical Document Embedding) — generate realistic code snippet for embedding");
note("Hardest dimension: avg 0.298 across all models. Weight: 0.25 (highest)");
console.log();

subtitle("Average HyDE Score by Parameter Range");

type HydeTierRow = [string, number, string];

const hydeTiers: HydeTierRow[] = [
  ["<0.5B",  0.153, "LFM2-350M (0.253)"],
  ["0.5-1B", 0.207, "Qwen3.5-0.8B (0.339)"],
  ["1-2B",   0.393, "Qwen3-1.7B-FT (0.588)"],
  ["2-4B",   0.470, "Qwen3-4B-2507 (0.633)"],
  ["4-9B",   0.378, "Qwen3-8B-FT (0.490)"],
];

for (const [sizeRange, avgHyde, best] of hydeTiers) {
  const b = bar(avgHyde, 0.7, 40, avgHyde >= 0.4 ? GREEN : avgHyde >= 0.2 ? YELLOW : RED);
  console.log(`  ${BOLD}${sizeRange.padEnd(8)}${RESET}  avg ${avgHyde.toFixed(3)}  ${b}  best: ${DIM}${best}${RESET}`);
}

console.log();
subtitle("Requirements for Good HyDE Output");
console.log(`  ${GREEN}✓${RESET} Correct syntax for target language`);
console.log(`  ${GREEN}✓${RESET} Plausible function/variable names`);
console.log(`  ${GREEN}✓${RESET} Realistic code patterns (not pseudocode)`);
console.log(`  ${GREEN}✓${RESET} Appropriate detail level (not too short, not too long)`);
console.log();
console.log(`  ${RED}✗${RESET} Below ~1B: models produce pseudocode or invalid syntax`);
console.log(`  ${GREEN}✓${RESET} Above 2B: most models generate compilable code`);

await wait();

// ══════════════════════════════════════════════════════════════════════
// TABLE 6: Dimension Breakdown for Top Models
// ══════════════════════════════════════════════════════════════════════

clear();
title("SCORING DIMENSIONS — Top Models Compared");
note("5 dimensions: Format (0.20), Keyword (0.20), Semantic (0.20), HyDE (0.25), Speed (0.15)");
console.log();

type ModelDetail = [string, [number, number, number, number, number]];

const modelsDetail: ModelDetail[] = [
  ["LFM2-2.6B",     [1.000, 0.913, 0.996, 0.597, 1879]],
  ["Qwen3-4B-2507", [1.000, 0.965, 1.000, 0.633, 2158]],
  ["Qwen3-1.7B-FT", [1.000, 0.869, 1.000, 0.588, 3473]],
  ["LFM2-700M",     [0.879, 0.863, 0.864, 0.260, 697]],
  ["Qwen3-8B-FT",   [1.000, 0.885, 1.000, 0.490, 6859]],
];

const dimensions = ["Format", "Keyword", "Semantic", "HyDE", "Speed(ms)"];

for (const [model, scores] of modelsDetail) {
  console.log(`  ${BOLD}${WHITE}${model}${RESET}`);
  for (let i = 0; i < dimensions.length; i++) {
    const dim = dimensions[i];
    const val = scores[i];
    if (dim === "Speed(ms)") {
      const speedScore = Math.max(0, 1.0 - (val / 10000));
      const b = bar(speedScore, 1.0, 30, val < 2000 ? GREEN : val < 5000 ? YELLOW : RED);
      const msFormatted = val.toLocaleString("en-US");
      console.log(`    ${dim.padEnd(10)}  ${msFormatted.padStart(6)}ms  ${b}`);
    } else {
      const b = bar(val, 1.0, 30, val >= 0.8 ? GREEN : val >= 0.5 ? YELLOW : RED);
      console.log(`    ${dim.padEnd(10)}  ${val.toFixed(3).padStart(8)}  ${b}`);
    }
  }
  console.log();
}

await wait();

// ══════════════════════════════════════════════════════════════════════
// TABLE 7: Experimental Setup Summary
// ══════════════════════════════════════════════════════════════════════

clear();
title("EXPERIMENTAL SETUP");
console.log();

subtitle("Benchmark Design");
console.log(`  ${BOLD}Queries:${RESET}     50 hand-crafted code search queries`);
console.log(`  ${BOLD}Categories:${RESET}  symbol (10), error (10), concept (10), framework (10), code_review (10)`);
console.log(`  ${BOLD}Models:${RESET}      25 total — 16 base + 9 fine-tuned`);
console.log(`  ${BOLD}Families:${RESET}    Qwen3, Qwen3.5, LFM2, Gemma 3, Phi-4, SmolLM2`);
console.log();

subtitle("Scoring Weights");
type WeightRow = [string, number, string];
const weights: WeightRow[] = [
  ["Format",   0.20, "Valid lex:/vec:/hyde: lines"],
  ["Keyword",  0.20, "lex: term relevance & diversity"],
  ["Semantic", 0.20, "vec: rephrasing quality"],
  ["HyDE",     0.25, "hyde: code snippet realism"],
  ["Speed",    0.15, "Inference latency"],
];

for (const [name, weight, desc] of weights) {
  const b = bar(weight, 0.3, 20, CYAN);
  console.log(`    ${BOLD}${name.padEnd(10)}${RESET}  ${weight.toFixed(2)}  ${b}  ${DIM}${desc}${RESET}`);
}

console.log();
subtitle("SFT Training Config");
console.log(`  ${BOLD}Method:${RESET}       LoRA (rank 16, alpha 32)`);
console.log(`  ${BOLD}Data:${RESET}         622 train + 70 eval examples`);
console.log(`  ${BOLD}Sources:${RESET}      65 handcrafted + 175 expanded + 452 synthetic (CodeSearchNet)`);
console.log(`  ${BOLD}Platform:${RESET}     HuggingFace Jobs — A10G (24GB) / A100 (80GB)`);
console.log(`  ${BOLD}Framework:${RESET}    TRL + PEFT + transformers`);
console.log(`  ${BOLD}Epochs:${RESET}       5`);
console.log(`  ${BOLD}LR:${RESET}           2e-4`);
console.log();

subtitle("Cost Breakdown");
type CostRow = [string, string];
const costs: CostRow[] = [
  ["Training data (GPT-5.3-Codex)", "$3"],
  ["SFT — Qwen3-1.7B only",        "$1.50"],
  ["SFT — all 9 models",            "$40"],
  ["Model evaluation (local)",       "$0"],
  ["Total experiment",               "$45"],
  ["Production (Tiny+Medium)",       "$5"],
];

for (const [item, cost] of costs) {
  console.log(`    ${item.padEnd(38)}  ${BOLD}${GREEN}${cost.padStart(6)}${RESET}`);
}

await wait();

// ══════════════════════════════════════════════════════════════════════
// FINAL: Key Findings Summary
// ══════════════════════════════════════════════════════════════════════

clear();
title("KEY FINDINGS — Summary");
console.log();

type FindingRow = [string, string, string];

const findings: FindingRow[] = [
  ["1", "SFT teaches FORMAT, not domain knowledge",
   "r = -0.95 correlation between base format compliance and SFT gain.\n" +
   "     Models with good pretraining + broken format → massive gains.\n" +
   "     Models with good pretraining + good format → zero/negative gains."],
  ["2", "Top 2 models are BASE (unfine-tuned) models",
   "LFM2-2.6B (.816) and Qwen3-4B-2507 (.811) beat all fine-tuned models.\n" +
   "     Best strategy: find models that already produce the right format."],
  ["3", "HyDE quality requires model capacity",
   "Below 1B params → pseudocode. Above 2B → compilable code.\n" +
   "     Step function, not linear. Hardest dimension (avg 0.298)."],
  ["4", "Architecture > parameters",
   "LFM2-2.6B (SSM) beats Qwen3-8B-FT (transformer) at 3.6x fewer params.\n" +
   "     SSM runs 2-10x faster on Apple Silicon MPS."],
  ["5", "Qwen3.5 (Gated Delta Network) not production-ready",
   "5-10x slower inference. A100 required for training. Poor LoRA at 9B.\n" +
   "     Base 4B/9B produce zero formatted output."],
  ["6", "Diminishing returns beyond format fixing",
   "SFT gains are concentrated in format compliance, not quality.\n" +
   "     Code knowledge was already present — just not parseable."],
];

for (const [num, finding, detail] of findings) {
  console.log(`  ${BOLD}${CYAN}Finding ${num}:${RESET}  ${BOLD}${WHITE}${finding}${RESET}`);
  for (const line of detail.split("\n")) {
    console.log(`  ${DIM}${line}${RESET}`);
  }
  console.log();
}

console.log(`\n  ${BOLD}${GREEN}${"═".repeat(80)}${RESET}`);
console.log(`  ${BOLD}${GREEN}  Small LLM Query Expansion for Local Code Search: A Systematic Evaluation${RESET}`);
console.log(`  ${BOLD}${GREEN}  25 models  •  50 queries  •  ~$45 total cost  •  March 2026${RESET}`);
console.log(`  ${BOLD}${GREEN}${"═".repeat(80)}${RESET}`);
console.log();
