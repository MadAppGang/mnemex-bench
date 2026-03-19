---
name: table-print
description: Render beautiful terminal tables, bar charts, and leaderboards for experiment results using tools/table.ts. Use when the user asks to display data, render a table, show results, create a leaderboard, make a chart, visualize experiment output, or print formatted terminal output. Also use when creating display scripts for any experiment in this repo.
---

# Table Print

Generate Bun/TypeScript scripts that render publication-quality terminal tables and charts using the shared `tools/table.ts` library. Every experiment in this repo can have a `display-tables.ts` that produces beautiful, screenshot-ready terminal output.

## The library: `tools/table.ts`

Located at the repo root. Import with a relative path from any experiment:

```ts
import {
  // Section structure
  clear, title, subtitle, note, wait,
  // Data visualization
  bar, center, renderTable,
  // Colors (foreground)
  RESET, BOLD, DIM, WHITE, CYAN, GREEN, YELLOW, RED, MAGENTA, BLUE, GRAY,
  // Backgrounds
  BG_ROW, BG_HEAD, BG_GREEN, BG_RED, BG_YELLOW, BG_CYAN,
  // Layout
  W,
  // Types
  type ColumnDef, type TableOptions,
} from "../../tools/table";
```

## API reference

### Section helpers

| Function | Purpose |
|----------|---------|
| `clear()` | Reset terminal screen |
| `title("TEXT")` | Full-width cyan ━━━ banner with centered white text |
| `subtitle("TEXT")` | Yellow bold heading with underline |
| `note("TEXT")` | Dimmed explanatory text |
| `wait()` | "Press Enter for next table..." prompt (async) |

### Data visualization

**`bar(value, maxVal?, width?, color?)`** → string

Unicode bar chart using █ (filled) and ░ (empty).

```ts
bar(0.8)                    // 20-wide green bar, 80% filled
bar(0.5, 1.0, 30, YELLOW)  // 30-wide yellow bar, 50% filled
bar(3500, 10000, 40, RED)   // scale to custom max
```

**`center(text, width)`** → string

Center-align text in a fixed-width field. Used inside cell formatters.

**`renderTable(options)`**

Full bordered table with box-drawing characters.

```ts
renderTable({
  columns: [
    { header: "#", width: 4 },
    { header: "Model", width: 20, align: "left" },
    { header: "Score", width: 8,
      format: (cell, ri, row) => {
        const v = parseFloat(cell);
        const color = v >= 0.8 ? GREEN : v >= 0.5 ? YELLOW : RED;
        return `${BOLD}${color}${center(cell, 8)}${RESET}`;
      }
    },
  ],
  rows: data,
  rowBg: (i, row) => i < 3 ? BG_GREEN : i % 2 === 0 ? BG_ROW : "",
});
```

Options:
- `columns: ColumnDef[]` — header, width, optional format function, optional align
- `rows: string[][]` — raw cell values as strings
- `rowBg?: (rowIndex, row) => string` — return ANSI bg code or `""`
- `indent?: number` — left margin (default 2)

When a column has a `format` function, it receives the raw cell string and must return a styled+aligned string of exactly `width` characters (use `center()` for alignment inside the formatter).

## Visual conventions

These conventions produce consistent, professional output across all experiments.

### Color semantics

| Color | Meaning |
|-------|---------|
| `GREEN` | Good / high score / fast |
| `YELLOW` | Medium / acceptable |
| `RED` | Poor / slow / below threshold |
| `CYAN` | Category labels, SFT type, tier names |
| `WHITE` + `BOLD` | Headers, model names in top positions |
| `DIM` | Secondary info, notes, explanations |
| `GRAY` | Table borders and separators |

### Score color thresholds

```ts
const color = v >= 0.8 ? GREEN : v >= 0.5 ? YELLOW : RED;
```

### Row backgrounds

```ts
// Top 3 highlighted
rowBg: (i) => i < 3 ? BG_GREEN : i % 2 === 0 ? BG_ROW : ""
```

### Star rankings

```ts
// Stars for top 3
const rankStr = rank <= 3
  ? `${BOLD}${GREEN} ★${rank.toString().padStart(2)}${RESET}`
  : `  ${rank.toString().padStart(2)}`;
```

## Script structure

Every display script follows this pattern:

```ts
#!/usr/bin/env bun
export {};
import { clear, title, subtitle, note, bar, renderTable, wait, /* colors */ } from "../../tools/table";

// ══════════════════════════════════════════════════════════════
// TABLE 1: Name
// ══════════════════════════════════════════════════════════════
clear();
title("TABLE TITLE IN CAPS");
note("One-line description of what this shows");
console.log();

// ... render table or chart ...

await wait();

// ══════════════════════════════════════════════════════════════
// TABLE 2: Next table
// ══════════════════════════════════════════════════════════════
clear();
title("NEXT TABLE");
// ...
```

Key patterns:
- `clear()` before each table so each fills the screen alone (for screenshots)
- `await wait()` between tables so user controls pacing
- `export {};` at top to satisfy Bun's module system
- Section comments with ══════ as visual separators in source code
- Run with: `bun experiments/NNN-name/display-tables.ts`

## Common patterns

### Inline bar chart rows (no bordered table)

For comparison views like SFT gain analysis:

```ts
for (const [model, base, ft, gain] of data) {
  const baseBar = bar(base, 1.0, 25, base >= 0.7 ? GREEN : YELLOW);
  const ftBar = bar(ft, 1.0, 25, ft >= 0.7 ? GREEN : YELLOW);
  const arrow = gain > 0 ? "▲" : "▼";
  const gainColor = gain > 0 ? GREEN : RED;
  write(`  ${BOLD}${model.padEnd(18)}${RESET}`);
  write(`  Base ${base.toFixed(3)} ${baseBar}  `);
  write(`  FT ${ft.toFixed(3)} ${ftBar}  `);
  write(`  ${gainColor}${arrow} ${gain.toFixed(1)}%${RESET}\n`);
}
```

### Key-value info blocks

```ts
subtitle("Configuration");
console.log(`  ${BOLD}Method:${RESET}     LoRA (rank 16, alpha 32)`);
console.log(`  ${BOLD}Data:${RESET}       622 train + 70 eval`);
console.log(`  ${BOLD}Platform:${RESET}   HuggingFace Jobs`);
```

### Findings list

```ts
for (const [num, finding, detail] of findings) {
  console.log(`  ${BOLD}${CYAN}Finding ${num}:${RESET}  ${BOLD}${WHITE}${finding}${RESET}`);
  for (const line of detail.split("\n")) {
    console.log(`  ${DIM}${line}${RESET}`);
  }
  console.log();
}
```

### Tier cards

```ts
for (const [tier, model, score] of tiers) {
  const bg = tier === "TINY" ? BG_YELLOW : tier === "MEDIUM" ? BG_CYAN : BG_GREEN;
  const color = tier === "TINY" ? YELLOW : tier === "MEDIUM" ? CYAN : GREEN;
  write(`  ${bg}${BOLD}${color}  ${tier.padEnd(8)}${RESET}`);
  write(`  ${BOLD}${WHITE}${model.padEnd(18)}${RESET}`);
  write(`  ${BOLD}${GREEN}${score}${RESET}\n`);
}
```

### Closing banner

```ts
console.log(`\n  ${BOLD}${GREEN}${"═".repeat(80)}${RESET}`);
console.log(`  ${BOLD}${GREEN}  Title of the experiment${RESET}`);
console.log(`  ${BOLD}${GREEN}  Summary stats  •  Date${RESET}`);
console.log(`  ${BOLD}${GREEN}${"═".repeat(80)}${RESET}`);
```

## Extending tools/table.ts

When you need a new primitive (sparkline, heatmap, grouped bars), add it to `tools/table.ts` — not inline in the experiment script. This keeps all visualization primitives in one place. Follow the existing pattern: export a pure function that returns a styled string.
