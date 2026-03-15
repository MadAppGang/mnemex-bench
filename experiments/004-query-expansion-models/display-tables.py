#!/usr/bin/env python3
"""Pretty-print all research tables for terminal screenshots."""

import os

# Terminal width
W = 120

# Colors
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
UNDERLINE = "\033[4m"
# Foreground
WHITE = "\033[97m"
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
MAGENTA = "\033[95m"
BLUE = "\033[94m"
GRAY = "\033[90m"
# Background
BG_DARK = "\033[48;5;234m"
BG_ROW = "\033[48;5;236m"
BG_HEAD = "\033[48;5;25m"
BG_GOLD = "\033[48;5;136m"
BG_GREEN = "\033[48;5;22m"
BG_RED = "\033[48;5;52m"


def clear():
    os.system("clear")


def title(text):
    """Big centered title."""
    pad = (W - len(text) - 4) // 2
    print()
    print(f"{BOLD}{CYAN}{'━' * W}{RESET}")
    print(f"{BOLD}{CYAN}{'━' * pad}  {WHITE}{text}  {CYAN}{'━' * (W - pad - len(text) - 4)}{RESET}")
    print(f"{BOLD}{CYAN}{'━' * W}{RESET}")
    print()


def subtitle(text):
    """Section subtitle."""
    print(f"\n  {BOLD}{YELLOW}{text}{RESET}")
    print(f"  {DIM}{'─' * (len(text) + 4)}{RESET}\n")


def note(text):
    """Dimmed note text."""
    print(f"  {DIM}{text}{RESET}")


def bar(value, max_val=1.0, width=20, color=GREEN):
    """Horizontal bar chart."""
    filled = int((value / max_val) * width)
    empty = width - filled
    return f"{color}{'█' * filled}{DIM}{'░' * empty}{RESET}"


def score_color(val):
    """Color a score value."""
    if val >= 0.8:
        return f"{BOLD}{GREEN}{val:.3f}{RESET}"
    elif val >= 0.7:
        return f"{GREEN}{val:.3f}{RESET}"
    elif val >= 0.5:
        return f"{YELLOW}{val:.3f}{RESET}"
    elif val >= 0.3:
        return f"{RED}{val:.3f}{RESET}"
    else:
        return f"{DIM}{val:.3f}{RESET}"


def speed_fmt(ms):
    """Format speed with color."""
    if ms < 1000:
        return f"{GREEN}{ms:>7,}ms{RESET}"
    elif ms < 3000:
        return f"{YELLOW}{ms:>7,}ms{RESET}"
    elif ms < 10000:
        return f"{RED}{ms:>7,}ms{RESET}"
    else:
        return f"{BOLD}{RED}{ms:>7,}ms{RESET}"


def print_table(headers, rows, col_widths=None, highlight_rows=None):
    """Print a formatted table with box drawing."""
    if col_widths is None:
        col_widths = [max(len(str(h)), max(len(str(r[i])) for r in rows) if rows else 0) + 2
                      for i, h in enumerate(headers)]

    # Top border
    top = f"  {GRAY}┌" + "┬".join("─" * w for w in col_widths) + f"┐{RESET}"
    mid = f"  {GRAY}├" + "┼".join("─" * w for w in col_widths) + f"┤{RESET}"
    bot = f"  {GRAY}└" + "┴".join("─" * w for w in col_widths) + f"┘{RESET}"

    print(top)

    # Header
    hdr = f"  {GRAY}│{RESET}"
    for i, h in enumerate(headers):
        hdr += f"{BG_HEAD}{BOLD}{WHITE}{str(h):^{col_widths[i]}}{RESET}{GRAY}│{RESET}"
    print(hdr)
    print(mid)

    # Rows
    highlight_rows = highlight_rows or set()
    for ri, row in enumerate(rows):
        bg = BG_ROW if ri % 2 == 0 else ""
        if ri in highlight_rows:
            bg = BG_GREEN
        line = f"  {GRAY}│{RESET}"
        for i, cell in enumerate(row):
            line += f"{bg}{str(cell):^{col_widths[i]}}{RESET}{GRAY}│{RESET}"
        print(line)

    print(bot)


def wait():
    """Pause for screenshot."""
    print(f"\n  {DIM}{'─' * 60}{RESET}")
    input(f"  {DIM}Press Enter for next table...{RESET}")


# ══════════════════════════════════════════════════════════════════════
# TABLE 1: Full Leaderboard
# ══════════════════════════════════════════════════════════════════════

clear()
title("QUERY EXPANSION MODEL BENCHMARK — FULL LEADERBOARD")
note("25 models evaluated on 50 code search queries  •  Scoring: Format(.20) KW(.20) Sem(.20) HyDE(.25) Speed(.15)")
print()

leaderboard = [
    ("1",  "LFM2-2.6B",      "2.6B", "Base", "1.000", ".913", ".996", ".597", "1,879",  ".816"),
    ("2",  "Qwen3-4B-2507",  "4B",   "Base", "1.000", ".965", "1.00", ".633", "2,158",  ".811"),
    ("3",  "Qwen3-1.7B-FT",  "1.7B", "SFT",  "1.000", ".869", "1.00", ".588", "3,473",  ".777"),
    ("4",  "Qwen3.5-2B-FT",  "2B",   "SFT",  "1.000", ".938", "1.00", ".560", "10,241", ".742"),
    ("5",  "LFM2.5-1.2B",    "1.2B", "Base", ".986",  ".695", "1.00", ".272", "558",    ".728"),
    ("6",  "Qwen3-4B-FT",    "4B",   "SFT",  "1.000", ".888", "1.00", ".488", "6,011",  ".726"),
    ("7",  "Phi4-mini-FT",   "3.8B", "SFT",  ".973",  ".823", ".960", ".474", "4,136",  ".724"),
    ("8",  "Qwen3-8B-FT",    "8B",   "SFT",  "1.000", ".885", "1.00", ".490", "6,859",  ".720"),
    ("9",  "Qwen3.5-2B",     "2B",   "Base", ".959",  ".989", ".900", ".495", "9,369",  ".712"),
    ("10", "Qwen3.5-4B-FT",  "4B",   "SFT",  ".960",  ".912", ".960", ".577", "26,657", ".711"),
    ("11", "LFM2-700M",      "0.7B", "Base", ".879",  ".863", ".864", ".260", "697",    ".708"),
    ("12", "LFM2-1.2B-FT",   "1.2B", "SFT",  "1.000", ".818", ".973", ".340", "3,926",  ".698"),
    ("13", "Gemma-3-1B",     "1B",   "Base", ".960",  ".868", ".927", ".150", "1,057",  ".690"),
    ("14", "SmolLM2-1.7B",   "1.7B", "Base", ".940",  ".664", ".871", ".389", "1,240",  ".687"),
    ("15", "Qwen3.5-0.8B",   "0.8B", "Base", "1.000", ".802", ".996", ".339", "7,497",  ".666"),
    ("16", "LFM2-700M-FT",   "0.7B", "SFT",  ".973",  ".708", ".956", ".274", "2,614",  ".658"),
    ("17", "Qwen3.5-9B-FT",  "9B",   "SFT",  ".727",  ".668", ".720", ".444", "40,458", ".534"),
    ("18", "LFM2-350M",      "0.35B","Base", ".463",  ".000", ".596", ".253", "1,338",  ".366"),
    ("19", "Qwen3-0.6B",     "0.6B", "Base", ".326",  ".282", ".324", ".053", "1,382",  ".302"),
    ("20", "Qwen3-4B",       "4B",   "Base", ".338",  ".517", ".288", ".062", "5,545",  ".278"),
    ("21", "Qwen3-1.7B",     "1.7B", "Base", ".252",  ".340", ".200", ".045", "3,252",  ".230"),
    ("22", "Qwen3-8B",       "8B",   "Base", ".321",  ".310", ".228", ".143", "12,238", ".222"),
    ("23", "Qwen3.5-9B-GGUF","9B",   "Base", ".300",  ".102", ".090", ".000", "20,794", ".099"),
    ("24", "Qwen3.5-4B",     "4B",   "Base", ".000",  ".000", ".000", ".000", "8,290",  ".016"),
    ("25", "Qwen3.5-9B",     "9B",   "Base", ".000",  ".000", ".000", ".000", "14,590", ".011"),
]

headers = ["#", "Model", "Params", "Type", "Format", "KW", "Sem", "HyDE", "Speed", "Total"]
widths =  [4,   20,       7,        6,      8,        6,    6,     6,      9,       8]

# Print top border
top = f"  {GRAY}┌" + "┬".join("─" * w for w in widths) + f"┐{RESET}"
mid = f"  {GRAY}├" + "┼".join("─" * w for w in widths) + f"┤{RESET}"
bot = f"  {GRAY}└" + "┴".join("─" * w for w in widths) + f"┘{RESET}"

print(top)
hdr = f"  {GRAY}│{RESET}"
for i, h in enumerate(headers):
    hdr += f"{BG_HEAD}{BOLD}{WHITE}{h:^{widths[i]}}{RESET}{GRAY}│{RESET}"
print(hdr)
print(mid)

for ri, row in enumerate(leaderboard):
    rank = int(row[0])
    total = float(row[9])

    # Highlight top 3
    if rank <= 3:
        bg = BG_GREEN
        rank_str = f"{BOLD}{GREEN} ★{row[0]:>2}{RESET}"
    elif rank <= 11:
        bg = BG_ROW if ri % 2 == 0 else ""
        rank_str = f"  {row[0]:>2}"
    else:
        bg = ""
        rank_str = f"{DIM}  {row[0]:>2}{RESET}"

    # Color the total
    if total >= 0.8:
        total_str = f"{BOLD}{GREEN}{row[9]:^8}{RESET}"
    elif total >= 0.7:
        total_str = f"{GREEN}{row[9]:^8}{RESET}"
    elif total >= 0.5:
        total_str = f"{YELLOW}{row[9]:^8}{RESET}"
    elif total >= 0.3:
        total_str = f"{row[9]:^8}"
    else:
        total_str = f"{DIM}{row[9]:^8}{RESET}"

    # Type color
    type_str = f"{CYAN}{row[3]:^6}{RESET}" if row[3] == "SFT" else f"{row[3]:^6}"

    line = f"  {GRAY}│{RESET}"
    line += f"{bg}{rank_str}{RESET}{GRAY}│{RESET}"
    line += f"{bg}{BOLD if rank <= 3 else ''}{row[1]:^{widths[1]}}{RESET}{GRAY}│{RESET}"
    line += f"{bg}{row[2]:^{widths[2]}}{RESET}{GRAY}│{RESET}"
    line += f"{bg}{type_str}{RESET}{GRAY}│{RESET}"
    line += f"{bg}{row[4]:^{widths[4]}}{RESET}{GRAY}│{RESET}"
    line += f"{bg}{row[5]:^{widths[5]}}{RESET}{GRAY}│{RESET}"
    line += f"{bg}{row[6]:^{widths[6]}}{RESET}{GRAY}│{RESET}"
    line += f"{bg}{row[7]:^{widths[7]}}{RESET}{GRAY}│{RESET}"
    line += f"{bg}{row[8]:^{widths[8]}}{RESET}{GRAY}│{RESET}"
    line += f"{total_str}{GRAY}│{RESET}"
    print(line)

print(bot)

wait()

# ══════════════════════════════════════════════════════════════════════
# TABLE 2: SFT Gain Analysis
# ══════════════════════════════════════════════════════════════════════

clear()
title("SFT GAIN ANALYSIS — Does Fine-Tuning Help?")
note("Central finding: SFT teaches FORMAT, not domain knowledge (r = -0.95 correlation)")
print()

subtitle("Base → Fine-Tuned Score Comparison")

sft_data = [
    ("Qwen3.5-9B",  0.011, 0.534, "+0.523", "+4,710%"),
    ("Qwen3.5-4B",  0.016, 0.711, "+0.695", "+4,344%"),
    ("Qwen3-1.7B",  0.230, 0.777, "+0.547", "+238%"),
    ("Qwen3-8B",    0.222, 0.720, "+0.498", "+224%"),
    ("Qwen3-4B",    0.278, 0.726, "+0.448", "+161%"),
    ("Qwen3.5-2B",  0.712, 0.742, "+0.030", "+4%"),
    ("LFM2-1.2B",   0.728, 0.698, "-0.030", "-4%"),
    ("LFM2-700M",   0.708, 0.658, "-0.050", "-7%"),
]

for model, base, ft, gain_abs, gain_pct in sft_data:
    base_bar = bar(base, 1.0, 25, GREEN if base >= 0.7 else YELLOW if base >= 0.3 else RED)
    ft_bar = bar(ft, 1.0, 25, GREEN if ft >= 0.7 else YELLOW if ft >= 0.3 else RED)

    if float(gain_abs) > 0:
        gain_color = GREEN
        arrow = "▲"
    else:
        gain_color = RED
        arrow = "▼"

    print(f"  {BOLD}{model:<18}{RESET}", end="")
    print(f"  Base {base:.3f} {base_bar}  ", end="")
    print(f"  FT {ft:.3f} {ft_bar}  ", end="")
    print(f"  {gain_color}{arrow} {gain_pct:>8}{RESET}")

print()
subtitle("Key Insight")
print(f"  {BG_GREEN}{BOLD}{WHITE}  Models with broken format (base < 0.5): massive gains from SFT (100-5000%)  {RESET}")
print(f"  {BG_RED}{BOLD}{WHITE}  Models with good format (base > 0.9): zero or negative gains from SFT        {RESET}")
print(f"  {DIM}  Inflection point: ~0.7 base score. Qwen3.5-2B (0.712) gains only +4%.{RESET}")

wait()

# ══════════════════════════════════════════════════════════════════════
# TABLE 3: Final 3-Tier Selection
# ══════════════════════════════════════════════════════════════════════

clear()
title("FINAL MODEL SELECTION — Three-Tier Deployment")
note("Optimized for Apple Silicon local deployment  •  Total experiment cost: ~$45")
print()

tiers = [
    ("TINY",   "LFM2-700M",     "0.7B", ".708", "697ms",    "~450MB", "No",  "8GB Mac, latency-critical"),
    ("MEDIUM", "Qwen3-1.7B-FT", "1.7B", ".777", "3,473ms",  "~1.1GB", "Yes ($1.50)", "16GB Mac, best balance"),
    ("LARGE",  "LFM2-2.6B",     "2.6B", ".816", "1,879ms",  "~1.6GB", "No",  "32GB+ Mac, max quality"),
]

for tier, model, params, total, speed, vram, training, use_case in tiers:
    if tier == "TINY":
        tier_color = YELLOW
        bg = "\033[48;5;58m"
    elif tier == "MEDIUM":
        tier_color = CYAN
        bg = "\033[48;5;24m"
    else:
        tier_color = GREEN
        bg = "\033[48;5;22m"

    total_f = float(total)

    print(f"  {bg}{BOLD}{tier_color}  {tier:8}{RESET}", end="")
    print(f"  {BOLD}{WHITE}{model:<18}{RESET}", end="")
    print(f"  {params:>5}  ", end="")
    print(f"  {BOLD}{GREEN}{total}{RESET}  ", end="")
    print(f"  {speed:>10}  ", end="")
    print(f"  {vram:>7}  ", end="")
    print(f"  {DIM}{training:<14}{RESET}")
    print(f"  {DIM}{'':8}  Use: {use_case}{RESET}")
    print()

subtitle("Score Visualization")
for tier, model, params, total, speed, vram, training, use_case in tiers:
    total_f = float(total)
    b = bar(total_f, 1.0, 50, GREEN)
    print(f"  {BOLD}{model:<18}{RESET} {total}  {b}")

print()
subtitle("Runner-up")
print(f"  {DIM}Qwen3-4B-2507 (base, 4B) — .811 total, 2,158ms — could replace LFM2-2.6B as Large tier{RESET}")

wait()

# ══════════════════════════════════════════════════════════════════════
# TABLE 4: Speed Analysis
# ══════════════════════════════════════════════════════════════════════

clear()
title("INFERENCE SPEED — Architecture Comparison on Apple Silicon")
note("All measurements: Apple M2 Pro, 32GB, 4-bit quantization, 50-query average")
print()

speed_data = [
    ("LFM2.5-1.2B",    1.2, 558,    "SSM"),
    ("LFM2-700M",      0.7, 697,    "SSM"),
    ("Gemma-3-1B",     1.0, 1057,   "Transformer"),
    ("SmolLM2-1.7B",   1.7, 1240,   "Transformer"),
    ("LFM2-350M",      0.35, 1338,  "SSM *"),
    ("LFM2-2.6B",      2.6, 1879,   "SSM"),
    ("Qwen3-4B-2507",  4.0, 2158,   "Transformer"),
    ("Qwen3-1.7B-FT",  1.7, 3473,   "Transformer"),
    ("Qwen3-4B",       4.0, 5545,   "Transformer"),
    ("Qwen3.5-2B",     2.0, 9369,   "Gated Delta Net"),
    ("Qwen3-8B",       8.0, 12238,  "Transformer"),
    ("Qwen3.5-9B-FT",  9.0, 40458,  "Gated Delta Net"),
]

max_speed = 42000
for model, params, ms, arch in speed_data:
    bar_len = int((ms / max_speed) * 60)
    bar_len = max(1, bar_len)

    if ms < 1000:
        color = GREEN
    elif ms < 3000:
        color = YELLOW
    elif ms < 10000:
        color = RED
    else:
        color = f"{BOLD}{RED}"

    arch_color = CYAN if "SSM" in arch else MAGENTA if "Delta" in arch else ""

    print(f"  {BOLD}{model:<18}{RESET} {params:>4}B  {color}{ms:>6,}ms{RESET}  {color}{'█' * bar_len}{RESET}  {arch_color}{arch}{RESET}")

print()
note("* LFM2-350M anomalously slow — likely unoptimized MPS kernels for smallest SSM variant")
print()
subtitle("Key Finding: LFM2 (SSM) runs 2-10x faster than transformers at equivalent sizes")
print(f"  {GREEN}█ SSM{RESET}  < 2,000ms for all sizes up to 2.6B")
print(f"  {RED}█ Gated Delta Network{RESET}  5-10x slower than standard transformers")

wait()

# ══════════════════════════════════════════════════════════════════════
# TABLE 5: HyDE Quality by Model Size
# ══════════════════════════════════════════════════════════════════════

clear()
title("HyDE QUALITY BY MODEL SIZE")
note("HyDE (Hypothetical Document Embedding) — generate realistic code snippet for embedding")
note("Hardest dimension: avg 0.298 across all models. Weight: 0.25 (highest)")
print()

subtitle("Average HyDE Score by Parameter Range")

hyde_tiers = [
    ("<0.5B",  0.153, "LFM2-350M (0.253)"),
    ("0.5-1B", 0.207, "Qwen3.5-0.8B (0.339)"),
    ("1-2B",   0.393, "Qwen3-1.7B-FT (0.588)"),
    ("2-4B",   0.470, "Qwen3-4B-2507 (0.633)"),
    ("4-9B",   0.378, "Qwen3-8B-FT (0.490)"),
]

for size_range, avg_hyde, best in hyde_tiers:
    b = bar(avg_hyde, 0.7, 40, GREEN if avg_hyde >= 0.4 else YELLOW if avg_hyde >= 0.2 else RED)
    print(f"  {BOLD}{size_range:<8}{RESET}  avg {avg_hyde:.3f}  {b}  best: {DIM}{best}{RESET}")

print()
subtitle("Requirements for Good HyDE Output")
print(f"  {GREEN}✓{RESET} Correct syntax for target language")
print(f"  {GREEN}✓{RESET} Plausible function/variable names")
print(f"  {GREEN}✓{RESET} Realistic code patterns (not pseudocode)")
print(f"  {GREEN}✓{RESET} Appropriate detail level (not too short, not too long)")
print()
print(f"  {RED}✗{RESET} Below ~1B: models produce pseudocode or invalid syntax")
print(f"  {GREEN}✓{RESET} Above 2B: most models generate compilable code")

wait()

# ══════════════════════════════════════════════════════════════════════
# TABLE 6: Dimension Breakdown for Top Models
# ══════════════════════════════════════════════════════════════════════

clear()
title("SCORING DIMENSIONS — Top Models Compared")
note("5 dimensions: Format (0.20), Keyword (0.20), Semantic (0.20), HyDE (0.25), Speed (0.15)")
print()

models_detail = [
    ("LFM2-2.6B",     [1.000, 0.913, 0.996, 0.597, 1879]),
    ("Qwen3-4B-2507", [1.000, 0.965, 1.000, 0.633, 2158]),
    ("Qwen3-1.7B-FT", [1.000, 0.869, 1.000, 0.588, 3473]),
    ("LFM2-700M",     [0.879, 0.863, 0.864, 0.260, 697]),
    ("Qwen3-8B-FT",   [1.000, 0.885, 1.000, 0.490, 6859]),
]

dimensions = ["Format", "Keyword", "Semantic", "HyDE", "Speed(ms)"]

for model, scores in models_detail:
    print(f"  {BOLD}{WHITE}{model}{RESET}")
    for i, (dim, val) in enumerate(zip(dimensions, scores)):
        if dim == "Speed(ms)":
            # Speed bar (inverted — lower is better)
            speed_score = max(0, 1.0 - (val / 10000))
            b = bar(speed_score, 1.0, 30, GREEN if val < 2000 else YELLOW if val < 5000 else RED)
            print(f"    {dim:<10}  {val:>6,}ms  {b}")
        else:
            b = bar(val, 1.0, 30, GREEN if val >= 0.8 else YELLOW if val >= 0.5 else RED)
            print(f"    {dim:<10}  {val:>8.3f}  {b}")
    print()

wait()

# ══════════════════════════════════════════════════════════════════════
# TABLE 7: Experimental Setup Summary
# ══════════════════════════════════════════════════════════════════════

clear()
title("EXPERIMENTAL SETUP")
print()

subtitle("Benchmark Design")
print(f"  {BOLD}Queries:{RESET}     50 hand-crafted code search queries")
print(f"  {BOLD}Categories:{RESET}  symbol (10), error (10), concept (10), framework (10), code_review (10)")
print(f"  {BOLD}Models:{RESET}      25 total — 16 base + 9 fine-tuned")
print(f"  {BOLD}Families:{RESET}    Qwen3, Qwen3.5, LFM2, Gemma 3, Phi-4, SmolLM2")
print()

subtitle("Scoring Weights")
weights = [("Format",   0.20, "Valid lex:/vec:/hyde: lines"),
           ("Keyword",  0.20, "lex: term relevance & diversity"),
           ("Semantic", 0.20, "vec: rephrasing quality"),
           ("HyDE",     0.25, "hyde: code snippet realism"),
           ("Speed",    0.15, "Inference latency")]

for name, weight, desc in weights:
    b = bar(weight, 0.3, 20, CYAN)
    print(f"    {BOLD}{name:<10}{RESET}  {weight:.2f}  {b}  {DIM}{desc}{RESET}")

print()
subtitle("SFT Training Config")
print(f"  {BOLD}Method:{RESET}       LoRA (rank 16, alpha 32)")
print(f"  {BOLD}Data:{RESET}         622 train + 70 eval examples")
print(f"  {BOLD}Sources:{RESET}      65 handcrafted + 175 expanded + 452 synthetic (CodeSearchNet)")
print(f"  {BOLD}Platform:{RESET}     HuggingFace Jobs — A10G (24GB) / A100 (80GB)")
print(f"  {BOLD}Framework:{RESET}    TRL + PEFT + transformers")
print(f"  {BOLD}Epochs:{RESET}       5")
print(f"  {BOLD}LR:{RESET}           2e-4")
print()

subtitle("Cost Breakdown")
costs = [("Training data (GPT-5.3-Codex)", "$3"),
         ("SFT — Qwen3-1.7B only",        "$1.50"),
         ("SFT — all 9 models",            "$40"),
         ("Model evaluation (local)",       "$0"),
         ("Total experiment",               "$45"),
         ("Production (Tiny+Medium)",       "$5")]

for item, cost in costs:
    print(f"    {item:<38}  {BOLD}{GREEN}{cost:>6}{RESET}")

wait()

# ══════════════════════════════════════════════════════════════════════
# FINAL: Key Findings Summary
# ══════════════════════════════════════════════════════════════════════

clear()
title("KEY FINDINGS — Summary")
print()

findings = [
    ("1", "SFT teaches FORMAT, not domain knowledge",
     "r = -0.95 correlation between base format compliance and SFT gain.\n"
     "     Models with good pretraining + broken format → massive gains.\n"
     "     Models with good pretraining + good format → zero/negative gains."),
    ("2", "Top 2 models are BASE (unfine-tuned) models",
     "LFM2-2.6B (.816) and Qwen3-4B-2507 (.811) beat all fine-tuned models.\n"
     "     Best strategy: find models that already produce the right format."),
    ("3", "HyDE quality requires model capacity",
     "Below 1B params → pseudocode. Above 2B → compilable code.\n"
     "     Step function, not linear. Hardest dimension (avg 0.298)."),
    ("4", "Architecture > parameters",
     "LFM2-2.6B (SSM) beats Qwen3-8B-FT (transformer) at 3.6x fewer params.\n"
     "     SSM runs 2-10x faster on Apple Silicon MPS."),
    ("5", "Qwen3.5 (Gated Delta Network) not production-ready",
     "5-10x slower inference. A100 required for training. Poor LoRA at 9B.\n"
     "     Base 4B/9B produce zero formatted output."),
    ("6", "Diminishing returns beyond format fixing",
     "SFT gains are concentrated in format compliance, not quality.\n"
     "     Code knowledge was already present — just not parseable."),
]

for num, finding, detail in findings:
    print(f"  {BOLD}{CYAN}Finding {num}:{RESET}  {BOLD}{WHITE}{finding}{RESET}")
    for line in detail.split("\n"):
        print(f"  {DIM}{line}{RESET}")
    print()

print(f"\n  {BOLD}{GREEN}{'═' * 80}{RESET}")
print(f"  {BOLD}{GREEN}  Small LLM Query Expansion for Local Code Search: A Systematic Evaluation{RESET}")
print(f"  {BOLD}{GREEN}  25 models  •  50 queries  •  ~$45 total cost  •  March 2026{RESET}")
print(f"  {BOLD}{GREEN}{'═' * 80}{RESET}")
print()
