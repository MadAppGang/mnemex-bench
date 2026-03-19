#!/usr/bin/env bun
/**
 * Reusable terminal table renderer for experiment reports.
 *
 * Usage:
 *   import { title, subtitle, renderTable, bar, wait } from "../tools/table";
 */

// ── Terminal width ──────────────────────────────────────────────────────
export const W = 120;

// ── ANSI colors ─────────────────────────────────────────────────────────
export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";

// Foreground
export const WHITE = "\x1b[97m";
export const CYAN = "\x1b[96m";
export const GREEN = "\x1b[92m";
export const YELLOW = "\x1b[93m";
export const RED = "\x1b[91m";
export const MAGENTA = "\x1b[95m";
export const BLUE = "\x1b[94m";
export const GRAY = "\x1b[90m";

// Background
export const BG_ROW = "\x1b[48;5;236m";
export const BG_HEAD = "\x1b[48;5;25m";
export const BG_GREEN = "\x1b[48;5;22m";
export const BG_RED = "\x1b[48;5;52m";
export const BG_YELLOW = "\x1b[48;5;58m";
export const BG_CYAN = "\x1b[48;5;24m";

// ── Low-level I/O ───────────────────────────────────────────────────────
const write = (s: string) => Bun.write(Bun.stdout, s);

// ── Section helpers ─────────────────────────────────────────────────────

export function clear(): void {
  write("\x1bc");
}

export function title(text: string): void {
  const pad = Math.floor((W - text.length - 4) / 2);
  const rightPad = W - pad - text.length - 4;
  console.log();
  console.log(`${BOLD}${CYAN}${"━".repeat(W)}${RESET}`);
  console.log(
    `${BOLD}${CYAN}${"━".repeat(pad)}  ${WHITE}${text}  ${CYAN}${"━".repeat(rightPad)}${RESET}`,
  );
  console.log(`${BOLD}${CYAN}${"━".repeat(W)}${RESET}`);
  console.log();
}

export function subtitle(text: string): void {
  console.log(`\n  ${BOLD}${YELLOW}${text}${RESET}`);
  console.log(`  ${DIM}${"─".repeat(text.length + 4)}${RESET}\n`);
}

export function note(text: string): void {
  console.log(`  ${DIM}${text}${RESET}`);
}

/** Unicode bar chart: █ filled, ░ empty */
export function bar(
  value: number,
  maxVal = 1.0,
  width = 20,
  color = GREEN,
): string {
  const filled = Math.floor((value / maxVal) * width);
  const empty = width - filled;
  return `${color}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RESET}`;
}

/** Center-align text within a fixed width */
export function center(s: string, width: number): string {
  const len = s.length;
  if (len >= width) return s.slice(0, width);
  const total = width - len;
  const left = Math.floor(total / 2);
  const right = total - left;
  return " ".repeat(left) + s + " ".repeat(right);
}

/** "Press Enter" prompt between tables */
export async function wait(): Promise<void> {
  console.log(`\n  ${DIM}${"─".repeat(60)}${RESET}`);
  write(`  ${DIM}Press Enter for next table...${RESET}`);
  const reader = Bun.stdin.stream().getReader();
  await reader.read();
  reader.releaseLock();
}

// ── Table renderer ──────────────────────────────────────────────────────

export interface ColumnDef {
  header: string;
  width: number;
  /** Optional per-cell formatter. Receives the raw cell string, row index, and full row. */
  format?: (cell: string, rowIndex: number, row: string[]) => string;
  /** Alignment: "center" (default) | "left" | "right" */
  align?: "center" | "left" | "right";
}

export interface TableOptions {
  columns: ColumnDef[];
  rows: string[][];
  /** Optional row-level background. Return an ANSI bg code or "" for none. */
  rowBg?: (rowIndex: number, row: string[]) => string;
  /** Indent from left edge (default: 2) */
  indent?: number;
}

function alignCell(text: string, width: number, align: "center" | "left" | "right" = "center"): string {
  const len = text.length;
  if (len >= width) return text.slice(0, width);
  const space = width - len;
  switch (align) {
    case "left":
      return " " + text + " ".repeat(space - 1);
    case "right":
      return " ".repeat(space - 1) + text + " ";
    default:
      return center(text, width);
  }
}

export function renderTable(opts: TableOptions): void {
  const { columns, rows, rowBg, indent = 2 } = opts;
  const pad = " ".repeat(indent);
  const widths = columns.map((c) => c.width);

  // Border lines
  const topLine = `${pad}${GRAY}┌${widths.map((w) => "─".repeat(w)).join("┬")}┐${RESET}`;
  const midLine = `${pad}${GRAY}├${widths.map((w) => "─".repeat(w)).join("┼")}┤${RESET}`;
  const botLine = `${pad}${GRAY}└${widths.map((w) => "─".repeat(w)).join("┴")}┘${RESET}`;

  // Header
  console.log(topLine);
  let hdr = `${pad}${GRAY}│${RESET}`;
  for (const col of columns) {
    hdr += `${BG_HEAD}${BOLD}${WHITE}${center(col.header, col.width)}${RESET}${GRAY}│${RESET}`;
  }
  console.log(hdr);
  console.log(midLine);

  // Rows
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const bg = rowBg ? rowBg(ri, row) : "";

    let line = `${pad}${GRAY}│${RESET}`;
    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci];
      const raw = row[ci] ?? "";

      if (col.format) {
        // Formatter is responsible for alignment + styling
        line += `${bg}${col.format(raw, ri, row)}${RESET}${GRAY}│${RESET}`;
      } else {
        line += `${bg}${alignCell(raw, col.width, col.align)}${RESET}${GRAY}│${RESET}`;
      }
    }
    console.log(line);
  }

  console.log(botLine);
}
