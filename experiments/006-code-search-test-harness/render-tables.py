#!/usr/bin/env python3
"""Render article tables using Rich for proper Unicode handling.

Usage:
    uv run --with rich render-tables.py [table_number]
    uv run --with rich render-tables.py          # all tables
    uv run --with rich render-tables.py 1        # specific table
"""
import sys
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich import box

console = Console()

def make_green(val: str, bold: bool = False) -> Text:
    style = "bold green" if bold else "green"
    return Text(val, style=style)

def make_red(val: str, bold: bool = False) -> Text:
    style = "bold red" if bold else "red"
    return Text(val, style=style)

def make_dim(val: str) -> Text:
    return Text(val, style="dim")

def bar(length: float, color: str = "green", max_width: int = 20) -> Text:
    full = int(length)
    frac = length - full
    eighths = " ▏▎▍▌▋▊▉"
    bar_str = "█" * full
    if frac > 0 and full < max_width:
        bar_str += eighths[int(frac * 8)]
    return Text(bar_str, style=color)


def table1():
    """Cross-Repo Ablation (860 queries, 12 repos)"""
    t = Table(
        title="TABLE 1: Cross-Repo Ablation (860 queries, 12 repos)",
        title_style="bold cyan",
        box=box.ROUNDED,
        show_lines=False,
        pad_edge=True,
    )
    t.add_column("Cond", style="white", min_width=4)
    t.add_column("Description", min_width=20)
    t.add_column("MRR@10", justify="right", min_width=6)
    t.add_column("Delta", justify="right", min_width=6)
    t.add_column("% Change", justify="right", min_width=7)
    t.add_column("P95 (ms)", justify="right", min_width=7)

    t.add_row(make_green("B1", bold=True), "+Regex router",
              make_green("0.524", bold=True), make_green("+0.094"),
              make_green("+21.8%", bold=True), "2,726")
    t.add_row(Text("A", style="white"), make_dim("Baseline — hybrid retrieval"),
              "0.430", make_dim("—"), make_dim("—"), "2,549")
    t.add_row(make_red("C2"), "+Expander (Qwen3-1.7B-FT)",
              make_red("0.316"), make_red("-0.114"), make_red("-26.4%"), "6,501")
    t.add_row(make_red("C3"), "+Expander (LFM2-2.6B)",
              make_red("0.307"), make_red("-0.123"), make_red("-28.6%"), "4,869")
    t.add_row(make_red("D"), "+Reranker only",
              make_red("0.292"), make_red("-0.138"), make_red("-32.0%"), "10,365")
    t.add_row(make_red("C1"), "+Expander (LFM2-700M)",
              make_red("0.292"), make_red("-0.138"), make_red("-32.0%"), "4,851")
    t.add_row(make_red("E", bold=True), "Full pipeline",
              make_red("0.255", bold=True), make_red("-0.175", bold=True),
              make_red("-40.6%", bold=True), make_red("20,656"))
    t.add_row(make_red("F", bold=True), "Router + expander (no reranker)",
              make_red("0.252", bold=True), make_red("-0.177", bold=True),
              make_red("-41.3%", bold=True), "5,370")

    console.print(t)
    console.print("  [dim]860 queries across 12 open-source Python repositories[/dim]")


def table2():
    """Per-Repo Router Improvement (B1 vs A)"""
    t = Table(
        title="TABLE 2: Per-Repo Router Improvement (B1 vs A)",
        title_style="bold cyan",
        box=box.ROUNDED,
        show_lines=False,
    )
    t.add_column("Repository", min_width=14)
    t.add_column("Baseline", justify="right", min_width=8)
    t.add_column("+Router", justify="right", min_width=8)
    t.add_column("Delta", justify="right", min_width=6)
    t.add_column("", min_width=20)  # bar chart

    repos = [
        ("smolagents",    0.521, 0.863, +0.342),
        ("pdm",           0.246, 0.499, +0.253),
        ("opshin",        0.469, 0.674, +0.205),
        ("fastmcp",       0.382, 0.498, +0.116),
        ("pr-agent",      0.454, 0.545, +0.091),
        ("ragas",         0.511, 0.575, +0.064),
        ("tinygrad",      0.578, 0.635, +0.057),
        ("wagtail",       0.361, 0.365, +0.004),
        ("openai-agents", 0.549, 0.468, -0.081),
    ]
    max_delta = 0.342
    for name, base, router, delta in repos:
        color = "green" if delta > 0.01 else ("red" if delta < 0 else "dim")
        bold = abs(delta) > 0.05
        bar_len = abs(delta) / max_delta * 20
        t.add_row(
            name,
            f"{base:.3f}",
            Text(f"{router:.3f}", style=f"{'bold ' if bold else ''}{color}"),
            Text(f"{'+' if delta > 0 else ''}{delta:.3f}", style=color),
            bar(bar_len, color=color, max_width=20),
        )

    console.print(t)
    console.print("  [dim]8/9 repos improved  |  bars = absolute delta[/dim]")


def table3():
    """Route-Aware Expansion Recovery (fastmcp, n=30)"""
    t = Table(
        title="TABLE 3: Route-Aware Expansion Recovery (fastmcp, n=30)",
        title_style="bold cyan",
        box=box.ROUNDED,
    )
    t.add_column("Cond", min_width=4)
    t.add_column("Description", min_width=24)
    t.add_column("MRR@10", justify="right", min_width=6)
    t.add_column("P95", justify="right", min_width=6)
    t.add_column("", min_width=18)  # bar

    rows = [
        ("E-RA", "Full pipeline + route-aware",     0.477, "35.4s", "bold green"),
        ("B1",   "Regex router only",               0.442,  "1.1s", "green"),
        ("F-RA", "Router + expander (route-aware)",  0.427,  "1.9s", "green"),
        ("A",    "Baseline",                         0.309,  "1.7s", "dim"),
        ("F",    "Router + expander (blind)",        0.119,  "3.9s", "bold red"),
        ("E",    "Full pipeline (blind expansion)",  0.118, "16.3s", "bold red"),
    ]
    max_mrr = 0.477
    for cond, desc, mrr, p95, style in rows:
        color = style.split()[-1]  # "green", "red", or "dim"
        bar_len = mrr / max_mrr * 18
        t.add_row(
            Text(cond, style=style),
            Text(desc, style="dim" if style == "dim" else ""),
            Text(f"{mrr:.3f}", style=style),
            p95,
            bar(bar_len, color=color, max_width=18),
        )

    console.print(t)
    console.print("  [dim]E-RA vs E: 4x recovery from skipping expansion on symbol queries[/dim]")


def table4():
    """Statistical Significance (Wilcoxon, n=30)"""
    t = Table(
        title="TABLE 4: Statistical Significance (Wilcoxon, n=30)",
        title_style="bold cyan",
        box=box.ROUNDED,
    )
    t.add_column("Cond", min_width=4)
    t.add_column("Δ MRR", justify="right", min_width=7)
    t.add_column("p-value", justify="right", min_width=8)
    t.add_column("Effect r", justify="right", min_width=6)
    t.add_column("Significant?", min_width=12)

    rows = [
        ("B1", "+0.047", "0.4017", "0.233", "No",           "green",     False),
        ("C1", "+0.048", "0.3081", "0.322", "No",           "green",     False),
        ("C2", "+0.002", "0.6832", "0.109", "No",           "green",     False),
        ("C3", "-0.086", "0.1742", "0.272", "No",           "red",       False),
        ("D",  "+0.002", "0.9687", "0.011", "No",           "green",     False),
        ("E",  "-0.281", "0.0004", "0.680", "Yes (p<.001)", "red",       True),
        ("F",  "-0.316", "<0.0001","0.807", "Yes (p<.001)", "red",       True),
    ]
    for cond, delta, pval, effect, sig, color, is_bold in rows:
        style = f"{'bold ' if is_bold else ''}{color}"
        sig_style = "bold green" if is_bold else "dim"
        t.add_row(
            Text(cond, style=style if is_bold else ""),
            Text(delta, style=style),
            Text(pval, style=style if is_bold else ""),
            Text(effect, style=style if is_bold else ""),
            Text(sig, style=sig_style),
        )

    console.print(t)
    console.print("  [dim]Only E and F reach significance — both regressions[/dim]")


def table5():
    """Latency Cost per Component"""
    t = Table(
        title="TABLE 5: Latency Cost per Component",
        title_style="bold cyan",
        box=box.ROUNDED,
    )
    t.add_column("Component", min_width=20)
    t.add_column("Added Latency P95", justify="right", min_width=14)
    t.add_column("", min_width=20)  # bar

    max_ms = 18000
    rows = [
        ("Router (regex)",           "<1ms",            1,      "green"),
        ("Expander — LFM2-700M",     "+700ms",          700,    "yellow"),
        ("Expander — LFM2-2.6B",     "+900ms",          900,    "yellow"),
        ("Expander — Qwen3-1.7B-FT", "+2,500ms",        2500,   "yellow"),
        ("Reranker — Qwen3-1.7B",    "+3,000–10,000ms", 6500,   "red"),
        ("Full pipeline (E)",        "+18,000ms",        18000,  "bold red"),
    ]
    for comp, latency, ms, style in rows:
        bar_len = ms / max_ms * 20
        color = style.split()[-1]
        comp_text = Text(comp, style=style) if "bold" in style else comp

        # Special variance bar for reranker
        if "Reranker" in comp:
            solid = 3000 / max_ms * 20
            var_end = 10000 / max_ms * 20
            bar_text = Text("█" * int(solid), style="red")
            bar_text.append("▒" * int(var_end - solid), style="dim red")
            t.add_row(comp, latency, bar_text)
        else:
            t.add_row(comp_text, Text(latency, style=style if "bold" in style else ""),
                      bar(bar_len, color=color, max_width=20))

    console.print(t)
    console.print("  [dim]▒ = variance range  |  Full pipeline 8x slower than baseline[/dim]")


def headline():
    title = Text.assemble(
        ("Less Is More: ", "bold cyan"),
        ("How a Regex Router Outperforms LLM Query\n", "bold white"),
        ("Expansion in Code Search", "bold white"),
    )
    subtitle = Text.assemble(
        ("An 860-query ablation study across 12 open-source repositories\n", "dim"),
        ("mnemex v0.24.0  •  2026-03-17  •  Experiment 006", "dim"),
    )
    panel = Panel(
        Text.assemble(title, "\n\n", subtitle),
        border_style="bold white",
        padding=(1, 3),
    )
    console.print(panel)


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "all"

    tables = {
        "1": table1,
        "2": table2,
        "3": table3,
        "4": table4,
        "5": table5,
    }

    if arg == "all":
        headline()
        for fn in tables.values():
            console.print()
            fn()
        console.print()
    elif arg in tables:
        console.print()
        tables[arg]()
        console.print()
    else:
        console.print(f"[red]Unknown table: {arg}[/red]")
        console.print("Usage: render-tables.py [1|2|3|4|5|all]")
        sys.exit(1)
