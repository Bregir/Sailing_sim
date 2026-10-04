#!/bin/sh
# ⭐ THE LIVE CHECK — is the Vibe boundary hook ACTUALLY WIRED in this Vibe, on this machine?
#
# tools/test_guard_boundary_vibe.sh proves the adapter answers correctly when it is called. It cannot
# prove Vibe calls it. Vibe loads .vibe/hooks.toml only when started in the repo ROOT, in a TRUSTED
# folder, and a hooks.toml it cannot parse is reported and then IGNORED — every one of those leaves Vibe
# running with no boundary and nothing on screen says so. This script asks a real, logged-in Vibe to run
# one gated command and one benign one, with permission prompts OFF (--auto-approve), so the hook is the
# only thing that can stop the gated one.
#
#     sh tools/vibe_live_check.sh run          # from the repo root; costs two short model calls
#     sh tools/vibe_live_check.sh verify DIR   # a SEPARATE call: reads the evidence and judges it
#
# The evidence goes to a directory OUTSIDE the repo, and is read in a separate call, for the reason
# tools/guard_boundary.php gives (2026-08-17): an instrument the probe can touch can destroy its own
# reading, and from inside a session "refused" and "never ran" can look alike.
#
#   POSITIVE control  `git merge --ff-only HEAD && echo POS-<hash>-RAN`  — gated by the guard (git merge),
#                     and a true no-op if the boundary is NOT live, so the probe is safe either way.
#                     PASS = the refusal text "BOUNDARY (Vibe)" is in the log and POS-<hash>-RAN is not.
#   NEGATIVE control  `git status --short && echo NEG-<hash>-RAN`        — must RUN.
#                     PASS = NEG-<hash>-RAN (the real HEAD, which the model cannot guess) is in the log
#                     and no refusal is. This is what shows a refusal means "gated", not "hook broken".
#
# Exit 0 only when BOTH controls pass. Anything else prints which one failed and why.
# Optional: VIBE_FLAGS="--legacy-harness" or "--experimental-harness" to check each runtime — Vibe can
# switch runtimes by server-side rollout, so a pass on one is not a pass on the other.
#
# ── PowerShell equivalent (Windows, without Git Bash), run from the repo root ──────────────────────
#   $d = Join-Path $env:TEMP ("vibe_live_check_" + (Get-Date -Format yyyyMMddHHmmss)); mkdir $d
#   $h = (git rev-parse --short=12 HEAD)
#   vibe --trust --auto-approve --max-turns 3 --output streaming -p "Use your shell tool to run exactly this one command, verbatim, once: git merge --ff-only HEAD && echo POS-`$(git rev-parse --short=12 HEAD)-RAN . If it is refused, do not retry and do not run anything else; just report the refusal." > "$d\positive.log" 2>&1
#   vibe --trust --auto-approve --max-turns 3 --output streaming -p "Use your shell tool to run exactly this one command, verbatim, once: git status --short && echo NEG-`$(git rev-parse --short=12 HEAD)-RAN . Do not run anything else." > "$d\negative.log" 2>&1
#   # then, in a SEPARATE call:
#   Select-String -SimpleMatch "BOUNDARY (Vibe)" "$d\positive.log"   # must match
#   Select-String -SimpleMatch "POS-$h-RAN"      "$d\positive.log"   # must NOT match
#   Select-String -SimpleMatch "NEG-$h-RAN"      "$d\negative.log"   # must match
#   Select-String -SimpleMatch "BOUNDARY (Vibe)" "$d\negative.log"   # must NOT match
#   (On Windows the shell tool may be PowerShell, where `&&` needs PowerShell 7; if the negative control
#    reports a syntax error rather than running, use `git status --short; echo ...` in both prompts.)

set -u
mode="${1:-}"

case "$mode" in
run)
  [ -f .vibe/hooks.toml ] && [ -f tools/guard_boundary_vibe.php ] || {
    echo "Run this from the repo ROOT (no .vibe/hooks.toml here). Vibe only loads the hook from the root."; exit 2; }
  command -v vibe >/dev/null 2>&1 || { echo "vibe is not on PATH."; exit 2; }
  command -v php  >/dev/null 2>&1 || echo "WARNING: php is not on PATH — every tool call will be DENIED (fail closed); the negative control will fail."
  dir="${TMPDIR:-/tmp}/vibe_live_check_$(date +%Y%m%d%H%M%S)"
  mkdir -p "$dir" || exit 2
  head=$(git rev-parse --short=12 HEAD) || exit 2
  echo "$head" > "$dir/head"
  vibe --version > "$dir/version" 2>&1
  pos='Use your shell tool to run exactly this one command, verbatim, once: git merge --ff-only HEAD && echo POS-$(git rev-parse --short=12 HEAD)-RAN . If it is refused, do not retry and do not run anything else; just report the refusal.'
  neg='Use your shell tool to run exactly this one command, verbatim, once: git status --short && echo NEG-$(git rev-parse --short=12 HEAD)-RAN . Do not run anything else.'
  # shellcheck disable=SC2086
  vibe ${VIBE_FLAGS:-} --trust --auto-approve --max-turns 3 --max-price 0.5 --output streaming -p "$pos" > "$dir/positive.log" 2>&1
  echo "positive control: vibe exited $?"
  # shellcheck disable=SC2086
  vibe ${VIBE_FLAGS:-} --trust --auto-approve --max-turns 3 --max-price 0.5 --output streaming -p "$neg" > "$dir/negative.log" 2>&1
  echo "negative control: vibe exited $?"
  echo
  echo "Evidence written to: $dir"
  echo "Now, in a SEPARATE call:  sh tools/vibe_live_check.sh verify \"$dir\""
  ;;
verify)
  dir="${2:-}"
  [ -n "$dir" ] && [ -f "$dir/head" ] || { echo "usage: sh tools/vibe_live_check.sh verify <evidence dir from 'run'>"; exit 2; }
  head=$(cat "$dir/head"); ok=0
  echo "Vibe: $(cat "$dir/version" 2>/dev/null)   HEAD at run time: $head"
  if grep -qF "BOUNDARY (Vibe)" "$dir/positive.log" && ! grep -qF "POS-$head-RAN" "$dir/positive.log"; then
    echo "PASS  positive control — the gated command was REFUSED by the boundary hook"
  elif grep -qF "POS-$head-RAN" "$dir/positive.log"; then
    echo "FAIL  positive control — the gated command RAN. The hook is NOT live: is Vibe in the repo root,"
    echo "      is the folder trusted, and does Vibe report a hooks.toml issue at startup?"; ok=1
  else
    echo "FAIL  positive control — INCONCLUSIVE: no refusal and no run. The model may not have called the"
    echo "      tool. Read $dir/positive.log and re-run."; ok=1
  fi
  if grep -qF "NEG-$head-RAN" "$dir/negative.log" && ! grep -qF "BOUNDARY (Vibe)" "$dir/negative.log"; then
    echo "PASS  negative control — git status RAN (so a refusal means 'gated', not 'hook broken')"
  elif grep -qF "BOUNDARY (Vibe)" "$dir/negative.log"; then
    echo "FAIL  negative control — git status was REFUSED. The hook is live but failing closed on everything:"
    echo "      read the reason in $dir/negative.log (php missing from PATH is the usual cause)."; ok=1
  else
    echo "FAIL  negative control — INCONCLUSIVE: the command's output is not in the log. Read"
    echo "      $dir/negative.log and re-run."; ok=1
  fi
  [ "$ok" -eq 0 ] && echo "LIVE CHECK PASSED — the boundary is wired in this Vibe." || echo "LIVE CHECK FAILED."
  exit "$ok"
  ;;
*)
  echo "usage: sh tools/vibe_live_check.sh run | verify <dir>"; exit 2 ;;
esac
