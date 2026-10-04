---
name: run-dispatch
description: Work a dispatch end to end from one Claude Code session — preflight, build it yourself or hand it to Mistral Vibe per its `Coder:` line, re-check the result verbatim, record it, push the branch. Use when asked to "work the dispatch on branch X". Repo-agnostic.
---

# run-dispatch — one session works a dispatch

The mechanical parts live in **`tools/run_dispatch.sh`** (tested without a model by
`tools/test_run_dispatch.sh`). You supply the judgement. Every repo-specific value sits in the variable block
at the top of the script; project facts (the checks, the scrub rules, the boundary files) come from the repo's
`AGENTS.md` and the dispatch itself — never from this file.

`sh tools/run_dispatch.sh <cmd>` from the **repo root**, always. State lives outside the repo
(`DISPATCH_WORK_DIR`, default `$TMPDIR/run-dispatch`).

## 1. Preflight — refuse loudly

```
sh tools/run_dispatch.sh preflight <branch> [dispatch-file]
```
It refuses (exit 2, one line saying why) on: not the repo root · a missing boundary file · a required tool
(`git`, `php`, `vibe`) off PATH · dirty tree · `main` · a branch on neither the machine nor `origin` · not exactly
one `dispatch-*.md` added relative to `main` (name it as the 2nd argument) · no/unknown `Coder:` line. **Do not
work around a refusal** — report it to the user. It checks out the branch (fetching it from `origin` if needed).

Then read `coder=`:
- `claude-sonnet` / `claude-opusplan` → **you build it.** If this session's model does not match the line, say
  so and ask before going on. Read the dispatch and the repo brief, build, run the dispatch's checks (step 3),
  go to step 4.
- `vibe` → run the live check once on this machine (`LIVE_CHECK_CMD` in the script's header; `run`, then
  `verify <dir>` in a **separate** call) — `--auto-approve` is only safe because the boundary hook is live.
  If it does not pass, stop. Then step 2.

## 2. Run Vibe (`Coder: vibe` only)

```
sh tools/run_dispatch.sh vibe 0        # run with run_in_background; shell calls die at ~10 min
```
It runs `vibe --trust --auto-approve --legacy-harness --max-turns N --max-price USD --output streaming -p "<standard
prompt>"` from the root, output to files **outside the repo** (`$DISPATCH_WORK_DIR/round0.*`). Flags were
enumerated against the installed `vibe --help` — if a Vibe upgrade changes them, re-enumerate; do not trust this line.
- `--legacy-harness` is deliberate: only that harness writes the per-session `meta.json` with model, steps,
  tokens and **cost**. The default (unified) harness, and Vibe's `--output json`, carry **no** cost, model or
  turn count.
- The helper sets `PYTHONUTF8=1` for Vibe: on Windows, with output redirected, Vibe dies on the first non-ASCII
  character (an arrow in a dispatch) with a `charmap` error, exit 1, empty report — measured on the first real run.
- 60 turns / $2 per round are the defaults (`VIBE_MAX_TURNS`, `VIBE_MAX_PRICE`); a wide mechanical sweep can need more.
- Poll until the background job exits (e.g. watch the line count of `round0.out`). The helper prints wall time,
  the exit code, and whether Vibe stopped on a limit (`<vibe_stop_event>`) or left the tree dirty.

## 3. Check Vibe's work — supervise, don't redo

```
sh tools/run_dispatch.sh checks
```
It extracts **every** check bullet under the dispatch's `## Checks` heading and runs each command **verbatim**
through `sh -c` — no editing, no narrowing, no "equivalent". Then **you** read each output against the
expectation printed beside it (after the `→`); a zero exit is not proof by itself.

⛔ **Why this is a script and not a habit:** Vibe's first real run *narrowed* a check and reported PASS. Never
substitute your own variant of a check, and never accept Vibe's statement that a check passed — only the
output you just produced. If a command cannot run as written on this machine, that is a finding to report, not
a reason to rewrite it.

Also run `git diff --stat <main>..HEAD` and compare with the dispatch's scope/"Do not" rules (touching a
boundary file, `main`, state files…). Keep it thin; do not re-derive the task.

A round that exits non-zero, leaves **no final message**, or ends with `<vibe_stop_event>` (a turn/price limit) did
**not** complete: the helper says so. A limit stop usually leaves finished-so-far work uncommitted; the next round
refuses a dirty tree unless you deliberately continue it with `ALLOW_DIRTY=1 sh tools/run_dispatch.sh vibe N <file>`
(it counts as a fix round — say so in the notes).

**Never edit Vibe's work.** On a failure start a **fix round**:
```
echo "<exactly what failed, with the check's output>" > "$TMPDIR/fix.txt"
sh tools/run_dispatch.sh vibe 1 "$TMPDIR/fix.txt"      # background again; 2 is the last
```
A fix round **resumes the same Vibe session** (if none was recorded — the build did not run through the helper —
it starts a fresh one and says so) (`--resume`, verified), and Vibe's turn/price limits are
cumulative across a resumed session, so the helper adds what is already spent. **At most two fix rounds**
(round 3 is refused); after the second failure stop and report. Count every round.

## 4. Record

1. **Figures — from Vibe's machine output only:**
   ```
   sh tools/run_dispatch.sh figures
   ```
   Model, turns, tokens and cost come from Vibe's own `meta.json` (`stats` + `config.active_model`), cumulative
   across rounds. **Never take them from Vibe's report text, and never estimate.** If it prints `UNAVAILABLE`, say
   so in the final message instead of guessing.
2. Write your foreman notes to a temp file: fix rounds (count + what each fixed), each check as you re-ran it
   with the result, anything you doubt. Then
   ```
   sh tools/run_dispatch.sh stopfile <notes-file>
   ```
   writes `<dispatch-name>-stop.md` at the repo root (every round's Vibe report as written, then your section),
   redacting absolute paths and `$` figures and **failing if any survive**. Words the repo keeps out of tracked
   files (the repo's scrub rules in its `AGENTS.md` — e.g. a real name) go in the env var `SCRUB_WORDS` (an
   extended regex, case-insensitive): they are redacted from Vibe's report and **fail** the command if they are
   in your own notes. Vibe's report sometimes quotes exactly what it was told to scrub. This file is tracked: no cost, no
   names, no absolute paths. Commit it on the dispatch branch.
3. `sh tools/run_dispatch.sh record <fix-rounds>` writes the run record to **`$DISPATCH_RUNLOG_DIR`** (outside the
   repo). If that variable is unset it prints the record instead — put it in your final chat message and say it was
   unset. Never hard-code a path. Cost figures go there and in the final message **only**.
4. Push **only the dispatch's branch**: `git push origin <branch>`. The guard asks the user; that prompt is
   intended. Never `main`.

## 5. Clean up

Kill any background job or server you started; report it (and any port freed). End with the STOP report the
dispatch asks for, opening with the run block the repo's `AGENTS.md` prescribes — model/turns/wall/cost taken
from `figures`, never from Vibe's own report. (Measured: Vibe's own run block said `Turns: 0`, `Wall time: 15`
for a ten-minute, 93-step session.) Sessions that are not rounds (a crashed attempt, the live check) are not in
`figures`; list their cost in the run record / final message.
