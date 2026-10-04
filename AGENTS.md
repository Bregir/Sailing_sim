# Sailing sim — coding-agent brief

> The brief for **every** coding agent working in this repo (Claude Code, Mistral Vibe). Claude Code loads it
> natively because the repo has no `CLAUDE.md` — do not add one (see `.claude/rules/claude-code.md`).
> Read all of it before your first change.

## 1. What this project is

A small first-person Age-of-Sail sailing game, built physics-first. Today it is a top-down 2D sandbox in one
browser page (vanilla JS + canvas) where the physics model *is* the product: sails are constrained by their
sheets and pushed by the wind, the hull has keel, rudder, heel and leeway, and manoeuvres (tacking, heaving
to, irons, a backed headsail, goose-winging) must **emerge from the model, never be scripted**. Three rigs
share one data-driven ship definition: a gaff sloop, a topsail cutter and a topsail schooner; a brig is next.
Graphics stay simple; feel and authenticity come first.

## 2. Files

| File | What it is |
|---|---|
| `index.html` | The whole sim, one file: `CONFIG`, `WIND`, `SAILS`, `HULL`, `INTEGRATOR`, `CONTROLS`, `RENDER`, `SCENARIOS`, `MAIN`. Open it in a browser to sail. |
| `spec-2d-sandbox.md` | **The build brief**, owned by the reviewer (Cowork). §1–§15 the model; §16 the current and next rounds. **Coders never edit it** — the boundary enforces this. |
| `run-scenarios.mjs` | Headless harness: loads `index.html`'s script into a Node `vm` and runs a ship's acceptance scenarios. |
| `render-checks.mjs` | Headless render/geometry assertions (sign conventions, drawn geometry, rules over the ship definitions). |
| `render-smoke.mjs` | Smoke test of the render path. |
| `round14-checks.mjs` | Serialise/reload byte-identity for every ship; prints the **harness md5** per ship. |
| `roundNN-checks.mjs` | Per-round diagnostics kept as tools (`round18-…`, `round19-…`). |
| `report-roundNN.md` | The coder's report for round NN, as the spec asked. History, not instructions. |
| `dispatch-*.md` | One build task each, written by Cowork, committed on its own branch (§7). |
| `tools/` | The boundary guard, its Vibe adapter and batteries, the `run-dispatch` helper (§6, §7). |

## 3. Run & test

Node (any current LTS) is the only runtime the sim's tools need. From the repo root:

```
node run-scenarios.mjs                      # sloop
node run-scenarios.mjs --ship topsailCutter
node run-scenarios.mjs --ship topsailSchooner
node render-checks.mjs                      # must end all green; it prints its own total
node render-smoke.mjs
node round14-checks.mjs                     # reload identity + the three harness md5s
```

**The harness md5** is the md5 of `run-scenarios.mjs`'s output for one ship with its two self-describing
lines stripped — exactly what `round14-checks.mjs` prints. It is the project's regression fingerprint: a
change that should not move the physics leaves all three md5s identical; a physics change moves them
deliberately, and the report says which step moved which.

The boundary's own tests (POSIX `sh`; Git Bash on Windows; need `php`):

```
sh tools/test_guard_boundary.sh
sh tools/test_guard_boundary_vibe.sh
sh tools/test_run_dispatch.sh
```

## 4. Verification discipline — binding on every coder

- **Never report a check as passing from reading code.** Run it and print the measured numbers.
- **md5s before the first step and after every step** of a multi-step round, for all three ships. This is the
  discipline that has caught every refactor bug since round 14.
- **One model for all scenarios.** A scenario may set wind, sails, sheets, rudder and initial state — never a
  physics or config value for one scenario. If a row seems to need that, it is a finding, not a fix.
- **Nothing is tuned to make a row pass** unless the round explicitly says which value may move and against
  what. A fail is reported as a fail, with its diagnostic. Tuning silently is the worst outcome here.
- **Every new constant is `[assumed]`**, derived from geometry, materials or a stated source — never fitted —
  and listed in the report with its derivation.
- **Measure transients over more than one period of themselves**, and fast ones at held speed (lessons from
  rounds 13 and 17).
- Where the brief is silent, choose the simplest thing and say so in the report.

## 5. Design rules that must hold

- **No mechanism without physics.** A line, control or state exists only if the model lets it change
  something measurable; otherwise it is scenery.
- **Every control is classified general or trim** in the ship definition (spec §13 D′).
- **The ship definition drives everything.** Rig-specific behaviour is data in `SHIPS.*` or a sail-type
  handler, never an `if (ship === …)` in the physics.
- Comments in English. No frameworks, no external assets, no `localStorage`. Physics independent of frame rate.

## 6. The boundary — binds every coder

Never push · never move `main` (no merge/rebase/reset onto it, no commit while HEAD is `main`) · never edit
`spec-2d-sandbox.md` · never edit `tools/guard_boundary*.php`, `.claude/settings*.json` or `.vibe/` inside
other work.

- **Claude Code:** enforced by `.claude/settings.json` → PreToolUse hook `tools/guard_boundary.php`, wrapped to
  fail closed. Known residue, written in the guard: only the first verb of a chained shell command is checked
  for the spec rule.
- **Vibe:** enforced by `.vibe/hooks.toml` → `tools/guard_boundary_vibe.php`, a fail-closed adapter over the
  same guard (battery `tools/test_guard_boundary_vibe.sh`). It is live **only when Vibe starts in the repo root
  of a trusted folder**. Vibe stays **read-only** in this repo until `sh tools/vibe_live_check.sh run` then
  `… verify <dir>` passes on the machine it runs on.

## 7. Dispatches and coders

**Routing — the `Coder:` line.** Every dispatch names its builder. If you are not the coder a dispatch
names, **stop and say so** before doing anything.

| `Coder:` | Who | Gets |
|---|---|---|
| `claude-sonnet` | Claude Code, Sonnet | Default builder: presentation and render rounds, UI, controls, small fixes. |
| `claude-opusplan` | Claude Code, `--model opusplan` (Opus plans, Sonnet executes) | Physics rounds (anything that moves an md5 on purpose), acceptance design, cross-ship refactors, the boundary itself. |
| `vibe` | Mistral Vibe | Self-contained work with a checkable result: render-check additions, diagnostic scripts, `tools/`, doc sweeps. Not physics rounds until cleared. |

**A dispatch file** (`dispatch-<name>.md`, at the repo root, the first commit on its branch):

```
# Dispatch — <title>

- **Coder:** `claude-opusplan`
- **Branch:** `<branch>` (this file is its first commit)
- **Do not:** push · merge · touch `main` · edit `spec-2d-sandbox.md` or the boundary files
- **STOP:** commit on `<branch>`, report the hash. Run block per `AGENTS.md` §8.

## Why / Build
<the task — for a physics round: "build spec §16 Round NN; the spec is the brief">

## Checks
- `node render-checks.mjs` → all green
- `node round14-checks.mjs` → reload identity holds; prints the three md5s
```

Each `## Checks` bullet is one command in backticks, then `→` and the expectation. The foreman runs them
**verbatim**.

**Working a dispatch end to end — Claude Code only.** *"Work the dispatch on branch X"* loads the
`run-dispatch` skill (`.claude/skills/run-dispatch/SKILL.md`, helper `tools/run_dispatch.sh`): preflight, build
or delegate to Vibe per the `Coder:` line, re-run the checks verbatim, take cost/turns/model from Vibe's
machine output (never its own report), commit `<dispatch>-stop.md`, push the branch (the guard asks).

**Every coder, every dispatch:** commit on the feature branch before STOP and report the hash · a physics
round's full report goes in `report-roundNN.md` on the branch · kill any server you started · author is
**Bregir** — never write a real name, an email, an account or an absolute local path into a tracked file.

## 8. The STOP report

Opens with a run block:

```
Coder: <claude-sonnet | claude-opusplan | vibe>    Model: <exact model id, as the tool reports it>
Turns: <n>    Wall time: <minutes>
Checks run: <each command, with its pass/fail counts>
md5 (sloop / cutter / schooner): <before> → <after>
Branch @ commit: <branch> @ <hash>
```

Then what the dispatch asks for. Plain, short sentences; tables for numbers; fails stated as fails.
Cost and usage figures go in the **final chat message only** — never into a tracked file.
