# Experiment Migration Prompt

Use this prompt when migrating a completed experiment from its source location (typically inside a feature repo like `mnemex`) into the `mnemex-bench` experiments archive.

---

## Prompt

```
You are migrating a completed AI/ML experiment into the mnemex-bench experiments archive.

REPO: /Users/jack/mag/mnemex-bench
SOURCE: <path to experiment source, e.g. /Users/jack/mag/mnemex/eval/cognitive-e2e>
EXPERIMENT_NAME: <short human name, e.g. "cognitive-memory-e2e">
EXPERIMENT_SLUG: <kebab-case slug, e.g. "cognitive-memory-e2e">
GOLDEN_INDEX_PATHS: <comma-separated paths to .mnemex/ dirs to archive, or "none">

Work through these steps in order. Do NOT delete source files until all verification checks pass.

---

## STEP 1 — Auto-number the experiment

List existing experiment directories:
  ls /Users/jack/mag/mnemex-bench/experiments/

Find the highest NNN prefix (e.g., 002). Use NNN+1 zero-padded to 3 digits.
Set: EXPERIMENT_NUMBER=003 (or whatever is next)
Set: EXPERIMENT_DIR=/Users/jack/mag/mnemex-bench/experiments/${EXPERIMENT_NUMBER}-${EXPERIMENT_SLUG}

---

## STEP 2 — Create directory structure

mkdir -p ${EXPERIMENT_DIR}/{harness,results,logs}

---

## STEP 3 — Discover and copy artifacts

### 3a. Harness code (scripts that drove the experiment)
Search SOURCE for: *.ts, *.py, *.sh, *.js that are experiment runner/grading scripts
Copy to: ${EXPERIMENT_DIR}/harness/

### 3b. Results
Search SOURCE for:
- grades.json or any *grades*.json
- results/ subdirectory (session JSON outputs per scenario/condition)
- Any *_results*.json or summary files
Copy all to: ${EXPERIMENT_DIR}/results/

### 3c. Logs
Search SOURCE for: *.log files
ALSO check /tmp/ for any logs named with the experiment slug or related keywords.
  Common patterns: /tmp/eval-*.log, /tmp/${EXPERIMENT_SLUG}*.log, /tmp/preindex*.log
Copy all found logs to: ${EXPERIMENT_DIR}/logs/

### 3d. Loose scripts at source repo root
Check the parent repo root (not the experiment subfolder) for one-off scripts
  related to this experiment (e.g., check-*.js, speed-test.sh, verify-*.ts).
If found, copy to: ${EXPERIMENT_DIR}/harness/ and note them in README.

### 3e. Any other files in SOURCE
Copy any remaining files not covered above to their natural location in ${EXPERIMENT_DIR}.

---

## STEP 4 — Upload golden indexes to S3

If GOLDEN_INDEX_PATHS != "none":
  For each path in GOLDEN_INDEX_PATHS:
    SLUG=$(basename of parent dir, e.g. "mnemex")
    ARCHIVE_NAME="${SLUG}-golden-index-$(date +%Y%m%d).tar.gz"

    Compress:
      tar -czf /tmp/${ARCHIVE_NAME} -C $(dirname PATH) $(basename PATH)

    Upload:
      aws s3 cp /tmp/${ARCHIVE_NAME} \
        s3://mnemex-bench/indexes/${EXPERIMENT_NUMBER}-${EXPERIMENT_SLUG}/${ARCHIVE_NAME} \
        --profile tools

    Note: Upload is blocking. Wait for exit code 0 before continuing.
    Record S3 path in README (see Step 5).

S3 configuration:
  AWS CLI profile:  tools   (SSO via https://madappgang.awsapps.com/start/#)
  Region:           ap-southeast-2
  Bucket:           mnemex-bench
  Prefix:           indexes/${EXPERIMENT_NUMBER}-${EXPERIMENT_SLUG}/
  File:             ${SLUG}-golden-index-${date}.tar.gz

  Full restore command:
    aws s3 cp s3://mnemex-bench/indexes/${EXPERIMENT_NUMBER}-${EXPERIMENT_SLUG}/${ARCHIVE_NAME} . --profile tools
    tar -xzf ${ARCHIVE_NAME}

---

## STEP 5 — Generate experiment README

Always generate (or regenerate) ${EXPERIMENT_DIR}/README.md from the migrated artifacts.

README must include:
- Experiment number and name
- Date the experiment was run (check timestamps on result files if not stated)
- Status (e.g., "Round 1 complete", "In progress", "Null result")
- Motivation — why was this experiment run?
- Design — conditions, repos under test, models used, session setup
- Results — key numbers (scores, costs, timing)
- Findings — what did we learn? what was the null result if any?
- Problems encountered — what broke, what had to be fixed during setup
- Future work — next experiments to run, harder scenarios to try
- Reproduction instructions — exact commands to re-run
- File manifest — what's in each subdirectory and why
- Golden index S3 paths (if any were uploaded):
  Restore: aws s3 cp s3://mnemex-bench/indexes/.../X.tar.gz . --profile tools && tar -xzf X.tar.gz

Read results/, logs/, harness/ to synthesize accurate content.
Do not invent numbers — read them from grades.json, result JSONs, log files.

---

## STEP 6 — Update mnemex-bench root README

Add one row to the experiments table in /Users/jack/mag/mnemex-bench/README.md:

| NNN | [Experiment Name](experiments/${EXPERIMENT_NUMBER}-${EXPERIMENT_SLUG}/) | YYYY-MM-DD | Status | One-line key finding |

Also update the structure block at the top to list the new experiment directory.

Status values: "Complete", "In progress", "Round N complete (null result)", "Round N complete"
Key finding: One sentence max. The most important insight or outcome.

---

## STEP 7 — Verification (all must pass before deleting source)

Run these checks:

### 7a. File count
  SRC_COUNT=$(find SOURCE -type f | wc -l)
  DST_COUNT=$(find ${EXPERIMENT_DIR} -type f | wc -l)
  # Allow DST >= SRC (destination may have more files if logs were rescued from /tmp)
  Fail if DST_COUNT < SRC_COUNT

### 7b. Key file spot-check
  Verify these exist in ${EXPERIMENT_DIR}:
  - README.md
  - results/ (non-empty)
  - harness/ (non-empty)

### 7c. S3 upload (if applicable)
  aws s3 ls s3://mnemex-bench/indexes/${EXPERIMENT_NUMBER}-${EXPERIMENT_SLUG}/ --profile tools
  Fail if upload is missing.

### 7d. Multi-model validation
  Run the following prompt via claudish for each model listed below:

  VALIDATION_PROMPT:
  "Review this experiment migration. Read ${EXPERIMENT_DIR}/README.md and
   list the files in ${EXPERIMENT_DIR}/. Answer:
   1. Is the README complete? Does it cover: motivation, design, results, findings, future work?
   2. Are there any obviously missing artifact types for an ML experiment of this kind?
   3. Rate migration completeness: COMPLETE / NEEDS_WORK / INCOMPLETE
   Give a 2-3 sentence verdict."

  Models to run (via claudish --model):
  - internal
  - minimax/minimax-m2.5
  - moonshot/kimi-k2.5
  - zhipu/glm-5
  - google/gemini-3.1-pro-preview
  - openai/gpt-5.3-codex
  - qwen/qwen3.5-plus-02-15

  Collect all verdicts. Proceed if majority say COMPLETE.
  If any say INCOMPLETE: fix the flagged issues before deleting source.

---

## STEP 8 — Delete source files

Only after all Step 7 checks pass:
  rm -rf SOURCE

Report: "Migration complete. Source deleted. Experiment archived at ${EXPERIMENT_DIR}"

---

## STEP 9 — Final report

Print:
  Experiment:    ${EXPERIMENT_NUMBER}-${EXPERIMENT_SLUG}
  Archived at:   ${EXPERIMENT_DIR}
  Files copied:  ${DST_COUNT}
  S3 indexes:    s3://mnemex-bench/indexes/${EXPERIMENT_NUMBER}-${EXPERIMENT_SLUG}/  (or "none")
  Model votes:   X/7 COMPLETE
  Source:        DELETED (or KEPT if verification failed)
```

---

## Notes

- **AWS profile**: Always use `--profile tools` with every `aws` command. SSO login if expired: `aws sso login --profile tools`.
- **S3 bucket**: `mnemex-bench` in `ap-southeast-2`, account `339287956559` (tools). Bucket already exists.
- **Large indexes**: tar.gz compression runs before upload — do not skip even if slow.
- **/tmp rescue**: Always check /tmp for logs even if none are obvious; they disappear on reboot.
- **Root scripts**: Check `git status` in source repo root for untracked experiment-related files.
- **Claudish**: Use the `code-analysis:claudish-usage` skill for the correct claudish invocation pattern.
- **SSO session expired?**: Run `aws sso login --profile tools` then retry.
