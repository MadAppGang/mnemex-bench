#!/bin/bash
# Render article tables as beautiful CLI output
# All tables fit within 95 columns for split-pane display
# Usage: bash render-tables.sh [table_number]

BOLD="\033[1m"
DIM="\033[2m"
RESET="\033[0m"
CYAN="\033[36m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
WHITE="\033[97m"

# Box-drawing chars
H="─"; V="│"; TL="┌"; TR="┐"; BL="└"; BR="┘"
LT="├"; RT="┤"; TT="┬"; BT="┴"; CR="┼"

# ── TABLE 1: 96 cols ── fits at 99
table1() {
  echo ""
  printf "${BOLD}${CYAN}  TABLE 1: Cross-Repo Ablation (860 queries, 12 repos)${RESET}\n"
  echo ""
  printf "  ┌──────────┬───────────────────────────────────┬────────────┬─────────┬──────────┬──────────┐\n"
  printf "  │${BOLD}${WHITE} Cond     ${RESET}│${BOLD}${WHITE} Description                       ${RESET}│${BOLD}${WHITE} MRR@10     ${RESET}│${BOLD}${WHITE} Delta   ${RESET}│${BOLD}${WHITE} %% Change ${RESET}│${BOLD}${WHITE} P95 (ms) ${RESET}│\n"
  printf "  ├──────────┼───────────────────────────────────┼────────────┼─────────┼──────────┼──────────┤\n"
  printf "  │ ${GREEN}${BOLD}B1${RESET}       │ +Regex router                     │ ${GREEN}${BOLD}0.524${RESET}      │ ${GREEN}+0.094${RESET}  │ ${GREEN}${BOLD}+21.8%%${RESET}   │   2,726  │\n"
  printf "  │ ${WHITE}A${RESET}        │ ${DIM}Baseline — hybrid retrieval${RESET}       │ 0.430      │ ${DIM}—${RESET}       │ ${DIM}—${RESET}        │   2,549  │\n"
  printf "  │ ${RED}C2${RESET}       │ +Expander (Qwen3-1.7B-FT)        │ ${RED}0.316${RESET}      │ ${RED}-0.114${RESET}  │ ${RED}-26.4%%${RESET}   │   6,501  │\n"
  printf "  │ ${RED}C3${RESET}       │ +Expander (LFM2-2.6B)            │ ${RED}0.307${RESET}      │ ${RED}-0.123${RESET}  │ ${RED}-28.6%%${RESET}   │   4,869  │\n"
  printf "  │ ${RED}D${RESET}        │ +Reranker only                    │ ${RED}0.292${RESET}      │ ${RED}-0.138${RESET}  │ ${RED}-32.0%%${RESET}   │  10,365  │\n"
  printf "  │ ${RED}C1${RESET}       │ +Expander (LFM2-700M)            │ ${RED}0.292${RESET}      │ ${RED}-0.138${RESET}  │ ${RED}-32.0%%${RESET}   │   4,851  │\n"
  printf "  │ ${RED}${BOLD}E${RESET}        │ Full pipeline                     │ ${RED}${BOLD}0.255${RESET}      │ ${RED}${BOLD}-0.175${RESET}  │ ${RED}${BOLD}-40.6%%${RESET}   │  ${RED}20,656${RESET}  │\n"
  printf "  │ ${RED}${BOLD}F${RESET}        │ Router + expander (no reranker)   │ ${RED}${BOLD}0.252${RESET}      │ ${RED}${BOLD}-0.177${RESET}  │ ${RED}${BOLD}-41.3%%${RESET}   │   5,370  │\n"
  printf "  └──────────┴───────────────────────────────────┴────────────┴─────────┴──────────┴──────────┘\n"
  printf "  ${DIM}860 queries across 12 open-source Python repositories${RESET}\n"
}

# ── TABLE 2: 90 cols ── fits at 99
table2() {
  echo ""
  printf "${BOLD}${CYAN}  TABLE 2: Per-Repo Router Improvement (B1 vs A)${RESET}\n"
  echo ""
  printf "  ┌──────────────────┬──────────┬──────────┬────────┬────────────────────┐\n"
  printf "  │${BOLD}${WHITE} Repository       ${RESET}│${BOLD}${WHITE} Baseline ${RESET}│${BOLD}${WHITE} +Router  ${RESET}│${BOLD}${WHITE} Delta  ${RESET}│${BOLD}${WHITE}                    ${RESET}│\n"
  printf "  ├──────────────────┼──────────┼──────────┼────────┼────────────────────┤\n"
  printf "  │ smolagents       │  0.521   │ ${GREEN}${BOLD} 0.863${RESET}   │ ${GREEN}+.342${RESET}  │ ${GREEN}████████████████████${RESET}│\n"
  printf "  │ pdm              │  0.246   │ ${GREEN}${BOLD} 0.499${RESET}   │ ${GREEN}+.253${RESET}  │ ${GREEN}██████████████▊     ${RESET}│\n"
  printf "  │ opshin           │  0.469   │ ${GREEN}${BOLD} 0.674${RESET}   │ ${GREEN}+.205${RESET}  │ ${GREEN}████████████        ${RESET}│\n"
  printf "  │ fastmcp          │  0.382   │ ${GREEN}${BOLD} 0.498${RESET}   │ ${GREEN}+.116${RESET}  │ ${GREEN}██████▊             ${RESET}│\n"
  printf "  │ pr-agent         │  0.454   │ ${GREEN}${BOLD} 0.545${RESET}   │ ${GREEN}+.091${RESET}  │ ${GREEN}█████▍              ${RESET}│\n"
  printf "  │ ragas            │  0.511   │ ${GREEN}${BOLD} 0.575${RESET}   │ ${GREEN}+.064${RESET}  │ ${GREEN}███▊                ${RESET}│\n"
  printf "  │ tinygrad         │  0.578   │ ${GREEN}${BOLD} 0.635${RESET}   │ ${GREEN}+.057${RESET}  │ ${GREEN}███▍                ${RESET}│\n"
  printf "  │ wagtail          │  0.361   │  0.365   │ ${DIM}+.004${RESET}  │ ${GREEN}▎                   ${RESET}│\n"
  printf "  │ openai-agents    │  0.549   │ ${RED} 0.468${RESET}   │ ${RED}-.081${RESET}  │ ${RED}████▊               ${RESET}│\n"
  printf "  └──────────────────┴──────────┴──────────┴────────┴────────────────────┘\n"
  printf "  ${DIM}8/9 repos improved  │  bars = absolute delta${RESET}\n"
}

# ── TABLE 3: 90 cols ── fits at 99
table3() {
  echo ""
  printf "${BOLD}${CYAN}  TABLE 3: Route-Aware Expansion Recovery (fastmcp, n=30)${RESET}\n"
  echo ""
  printf "  ┌──────┬──────────────────────────────────┬────────┬────────┬──────────────────┐\n"
  printf "  │${BOLD}${WHITE} Cond ${RESET}│${BOLD}${WHITE} Description                      ${RESET}│${BOLD}${WHITE} MRR@10 ${RESET}│${BOLD}${WHITE} P95    ${RESET}│${BOLD}${WHITE}                  ${RESET}│\n"
  printf "  ├──────┼──────────────────────────────────┼────────┼────────┼──────────────────┤\n"
  printf "  │ ${GREEN}${BOLD}E-RA${RESET} │ Full pipeline + route-aware      │ ${GREEN}${BOLD}0.477${RESET}  │ 35.4s  │ ${GREEN}██████████████████${RESET}│\n"
  printf "  │ ${GREEN}B1${RESET}   │ Regex router only                │ ${GREEN}0.442${RESET}  │  1.1s  │ ${GREEN}████████████████▊ ${RESET}│\n"
  printf "  │ ${GREEN}F-RA${RESET} │ Router + expander (route-aware)  │ ${GREEN}0.427${RESET}  │  1.9s  │ ${GREEN}████████████████▏ ${RESET}│\n"
  printf "  │ ${WHITE}A${RESET}    │ ${DIM}Baseline${RESET}                         │ 0.309  │  1.7s  │ ${DIM}███████████▋      ${RESET}│\n"
  printf "  │ ${RED}${BOLD}F${RESET}    │ Router + expander (blind)        │ ${RED}0.119${RESET}  │  3.9s  │ ${RED}████▌             ${RESET}│\n"
  printf "  │ ${RED}${BOLD}E${RESET}    │ Full pipeline (blind expansion)  │ ${RED}0.118${RESET}  │ 16.3s  │ ${RED}████▍             ${RESET}│\n"
  printf "  └──────┴──────────────────────────────────┴────────┴────────┴──────────────────┘\n"
  printf "  ${DIM}E-RA vs E: 4x recovery from skipping expansion on symbol queries${RESET}\n"
}

# ── TABLE 4: 65 cols ── fits easily
table4() {
  echo ""
  printf "${BOLD}${CYAN}  TABLE 4: Statistical Significance (Wilcoxon, n=30)${RESET}\n"
  echo ""
  printf "  ┌──────┬───────────┬──────────┬──────────┬──────────────┐\n"
  printf "  │${BOLD}${WHITE} Cond ${RESET}│${BOLD}${WHITE} Δ MRR     ${RESET}│${BOLD}${WHITE} p-value  ${RESET}│${BOLD}${WHITE} Effect r ${RESET}│${BOLD}${WHITE} Significant? ${RESET}│\n"
  printf "  ├──────┼───────────┼──────────┼──────────┼──────────────┤\n"
  printf "  │ B1   │ ${GREEN}+0.047${RESET}    │ 0.4017   │ 0.233    │ ${DIM}No${RESET}           │\n"
  printf "  │ C1   │ ${GREEN}+0.048${RESET}    │ 0.3081   │ 0.322    │ ${DIM}No${RESET}           │\n"
  printf "  │ C2   │ ${GREEN}+0.002${RESET}    │ 0.6832   │ 0.109    │ ${DIM}No${RESET}           │\n"
  printf "  │ C3   │ ${RED}-0.086${RESET}    │ 0.1742   │ 0.272    │ ${DIM}No${RESET}           │\n"
  printf "  │ D    │ ${GREEN}+0.002${RESET}    │ 0.9687   │ 0.011    │ ${DIM}No${RESET}           │\n"
  printf "  │ ${RED}${BOLD}E${RESET}    │ ${RED}${BOLD}-0.281${RESET}    │ ${RED}${BOLD}0.0004${RESET}   │ ${RED}${BOLD}0.680${RESET}    │ ${GREEN}${BOLD}Yes (p<.001)${RESET} │\n"
  printf "  │ ${RED}${BOLD}F${RESET}    │ ${RED}${BOLD}-0.316${RESET}    │ ${RED}${BOLD}<0.0001${RESET}  │ ${RED}${BOLD}0.807${RESET}    │ ${GREEN}${BOLD}Yes (p<.001)${RESET} │\n"
  printf "  └──────┴───────────┴──────────┴──────────┴──────────────┘\n"
  printf "  ${DIM}Only E and F reach significance — both regressions${RESET}\n"
}

# ── TABLE 5: 93 cols ── fits at 99
table5() {
  echo ""
  printf "${BOLD}${CYAN}  TABLE 5: Latency Cost per Component${RESET}\n"
  echo ""
  printf "  ┌──────────────────────────────┬───────────────────┬──────────────────────────────────┐\n"
  printf "  │${BOLD}${WHITE} Component                    ${RESET}│${BOLD}${WHITE} Added Latency P95  ${RESET}│${BOLD}${WHITE}                                ${RESET}│\n"
  printf "  ├──────────────────────────────┼───────────────────┼──────────────────────────────────┤\n"
  printf "  │ Router (regex)               │ ${GREEN}<1ms${RESET}              │ ${GREEN}▏${RESET}                               │\n"
  printf "  │ Expander — LFM2-700M         │ +700ms            │ ${YELLOW}██▍${RESET}                             │\n"
  printf "  │ Expander — LFM2-2.6B         │ +900ms            │ ${YELLOW}███${RESET}                             │\n"
  printf "  │ Expander — Qwen3-1.7B-FT     │ +2,500ms          │ ${YELLOW}████████▍${RESET}                       │\n"
  printf "  │ Reranker — Qwen3-1.7B        │ +3,000–10,000ms   │ ${RED}██████████${RESET}${DIM}▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒${RESET}│\n"
  printf "  │ ${RED}${BOLD}Full pipeline (E)${RESET}             │ ${RED}${BOLD}+18,000ms${RESET}         │ ${RED}████████████████████████████████${RESET}│\n"
  printf "  └──────────────────────────────┴───────────────────┴──────────────────────────────────┘\n"
  printf "  ${DIM}▒ = variance range  │  Full pipeline 8x slower than baseline${RESET}\n"
}

headline() {
  echo ""
  printf "  ${BOLD}${WHITE}╔════════════════════════════════════════════════════════════════════════╗${RESET}\n"
  printf "  ${BOLD}${WHITE}║${RESET}                                                                        ${BOLD}${WHITE}║${RESET}\n"
  printf "  ${BOLD}${WHITE}║${RESET}   ${BOLD}${CYAN}Less Is More:${RESET} How a Regex Router Outperforms LLM Query            ${BOLD}${WHITE}║${RESET}\n"
  printf "  ${BOLD}${WHITE}║${RESET}   Expansion in Code Search                                             ${BOLD}${WHITE}║${RESET}\n"
  printf "  ${BOLD}${WHITE}║${RESET}                                                                        ${BOLD}${WHITE}║${RESET}\n"
  printf "  ${BOLD}${WHITE}║${RESET}   ${DIM}An 860-query ablation study across 12 open-source repositories${RESET}      ${BOLD}${WHITE}║${RESET}\n"
  printf "  ${BOLD}${WHITE}║${RESET}   ${DIM}mnemex v0.24.0  •  2026-03-17  •  Experiment 006${RESET}                     ${BOLD}${WHITE}║${RESET}\n"
  printf "  ${BOLD}${WHITE}║${RESET}                                                                        ${BOLD}${WHITE}║${RESET}\n"
  printf "  ${BOLD}${WHITE}╚════════════════════════════════════════════════════════════════════════╝${RESET}\n"
}

case "${1:-all}" in
  1) table1 ;;
  2) table2 ;;
  3) table3 ;;
  4) table4 ;;
  5) table5 ;;
  all)
    headline
    table1
    table2
    table3
    table4
    table5
    echo ""
    ;;
esac
