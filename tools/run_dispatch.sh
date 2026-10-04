#!/bin/sh
# run_dispatch.sh — the mechanical half of the run-dispatch skill (.claude/skills/run-dispatch/SKILL.md).
#
# Everything here is testable without a model: preflight, the Vibe call, running the dispatch's checks
# VERBATIM, reading Vibe's own machine output, assembling the STOP file, writing the run record.
# The judgement (is this result acceptable? what goes in a fix prompt?) stays with the Claude Code session.
#
#   sh tools/run_dispatch.sh preflight <branch> [dispatch-file]
#   sh tools/run_dispatch.sh vibe <round> [fix-prompt-file]     # round 0 = build, 1..2 = fix rounds
#   sh tools/run_dispatch.sh checks                              # the dispatch's checks, verbatim
#   sh tools/run_dispatch.sh figures                             # model / turns / tokens / cost, from Vibe's files
#   sh tools/run_dispatch.sh stopfile <foreman-section-file>     # writes <dispatch>-stop.md at the repo root
#   sh tools/run_dispatch.sh record <fix-rounds>                 # run record -> $DISPATCH_RUNLOG_DIR (or stdout)
#
# ⚠ REPO-SPECIFIC VALUES live in this block and nowhere else. Copy the script to another repo, change the
#   block (or override from the environment), and nothing else needs touching.
MAIN_BRANCH="${MAIN_BRANCH:-main}"
DISPATCH_GLOB="${DISPATCH_GLOB:-dispatch-*.md}"
BRIEF_FILE="${BRIEF_FILE:-AGENTS.md}"                       # named in Vibe's prompt
REQUIRED_FILES="${REQUIRED_FILES:-.vibe/hooks.toml tools/guard_boundary_vibe.php}"   # Vibe's boundary
REQUIRED_TOOLS="${REQUIRED_TOOLS:-git php vibe}"            # php: the boundary hook AND JSON parsing here
LIVE_CHECK_CMD="${LIVE_CHECK_CMD:-sh tools/vibe_live_check.sh}"  # '' = this repo has none
CHECKS_HEADING="${CHECKS_HEADING:-^## Checks}"               # the dispatch section whose bullets are checks
VIBE_FLAGS_FIXED="${VIBE_FLAGS_FIXED:---trust --auto-approve --legacy-harness}"
VIBE_MAX_TURNS="${VIBE_MAX_TURNS:-60}"                       # per round
VIBE_MAX_PRICE="${VIBE_MAX_PRICE:-2.00}"                     # USD per round
MAX_FIX_ROUNDS="${MAX_FIX_ROUNDS:-2}"
VIBE_HOME_DIR="${VIBE_HOME:-$HOME/.vibe}"

die() { echo "REFUSE: $*" >&2; exit 2; }

# State lives OUTSIDE the repo, per dispatch.
work_dir() { d="${DISPATCH_WORK_DIR:-${TMPDIR:-/tmp}/run-dispatch}"; mkdir -p "$d" || die "cannot create $d"; echo "$d"; }
state_get() { [ -f "$(work_dir)/state" ] && sed -n "s/^$1=//p" "$(work_dir)/state" | tail -1; }
state_put() { echo "$1=$2" >> "$(work_dir)/state"; }

main_ref() { git rev-parse --verify -q "origin/$MAIN_BRANCH" >/dev/null && echo "origin/$MAIN_BRANCH" || echo "$MAIN_BRANCH"; }

cmd_preflight() {
  branch="${1:-}"; named="${2:-}"
  [ -n "$branch" ] || die "usage: preflight <branch> [dispatch-file]"
  git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"
  [ -z "$(git rev-parse --show-cdup)" ] || die "not at the repo root (Vibe loads its boundary only from the root) — cd there first"
  for t in $REQUIRED_TOOLS; do command -v "$t" >/dev/null 2>&1 || die "$t is not on PATH"; done
  for f in $REQUIRED_FILES; do [ -f "$f" ] || die "$f is missing — no boundary for Vibe, refusing to run it unguarded"; done
  [ "$branch" != "$MAIN_BRANCH" ] || die "never run a dispatch on $MAIN_BRANCH"
  [ -z "$(git status --porcelain)" ] || die "working tree is not clean — commit or stash first"
  if ! git rev-parse --verify -q "refs/heads/$branch" >/dev/null; then
    git fetch origin "$branch" >/dev/null 2>&1 || die "branch '$branch' exists neither locally nor on origin"
    git checkout -q -b "$branch" --track "origin/$branch" || die "could not create '$branch' from origin"
  else
    git checkout -q "$branch" || die "could not check out '$branch'"
  fi
  [ "$(git rev-parse --abbrev-ref HEAD)" = "$branch" ] || die "not on '$branch' after checkout"
  if [ -n "$named" ]; then
    [ -f "$named" ] || die "dispatch file '$named' not found on $branch"
    dispatch="$named"
  else
    added=$(git diff --name-only --diff-filter=A "$(main_ref)...HEAD" -- "$DISPATCH_GLOB" | grep -v '/')
    n=$(printf '%s\n' "$added" | grep -c .)
    [ "$n" -eq 1 ] || die "expected exactly ONE $DISPATCH_GLOB added on $branch relative to $(main_ref), found $n ($(printf '%s' "$added" | tr '\n' ' ')) — name it explicitly"
    dispatch="$added"
  fi
  coder=$(sed -n 's/^- \*\*Coder:\*\* `\([a-z-]*\)`.*/\1/p' "$dispatch" | head -1)
  [ -n "$coder" ] || die "no '- **Coder:** \`...\`' line in $dispatch"
  case "$coder" in claude-sonnet|claude-opusplan|vibe) ;; *) die "unknown Coder '$coder' in $dispatch";; esac
  : > "$(work_dir)/state"
  state_put branch "$branch"; state_put dispatch "$dispatch"; state_put coder "$coder"
  state_put base "$(git rev-parse HEAD)"; state_put started "$(date +%s)"
  echo "PREFLIGHT OK"
  echo "branch=$branch"; echo "dispatch=$dispatch"; echo "coder=$coder"
  echo "head=$(git rev-parse --short=12 HEAD)"; echo "work_dir=$(work_dir)"
  [ "$coder" = vibe ] && echo "next: run '$LIVE_CHECK_CMD' once on this machine, then: vibe 0" || echo "next: Claude Code builds this itself (check the session model matches '$coder')"
  return 0
}

# Pull the final assistant text / the session id out of Vibe's streaming output (one JSON object per line).
php_final_text() { php -r '$t="";foreach(file($argv[1],FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $l){$j=json_decode($l,true);if(is_array($j)&&($j["type"]??"")==="message"&&($j["role"]??"")==="assistant"){foreach($j["content"]??[] as $c){if(($c["type"]??"")==="text")$t=$c["text"];}}}echo $t;' -- "$1"; }
php_session_id() { php -r 'foreach(file($argv[1],FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $l){$j=json_decode($l,true);if(is_array($j)&&isset($j["sessionId"])){echo $j["sessionId"];exit;}}' -- "$1"; }

session_meta() { # session id -> path of Vibe's own meta.json, or empty
  [ -n "$1" ] || return 0
  short=$(printf '%s' "$1" | cut -c1-8)
  d=$(ls -d "$VIBE_HOME_DIR"/logs/session/session_*"$short" 2>/dev/null | head -1)
  [ -n "$d" ] && [ -f "$d/meta.json" ] && echo "$d/meta.json"
}
# Cumulative figures from Vibe's meta.json: the "stats" block and config.active_model. Vibe writes these
# itself; nothing the model says goes through here.
stat_of() { awk -v k="\"$2\":" '/^  "stats": \{/{s=1;next} s&&/^  \}/{s=0} s&&index($0,k){v=$2;gsub(/,/,"",v);print v;exit}' "$1"; }
model_of() { awk '/^  "config": \{/{c=1;next} c&&/^    "active_model":/{v=$2;gsub(/[",]/,"",v);print v;exit}' "$1"; }

cmd_vibe() {
  round="${1:-}"; fixfile="${2:-}"
  case "$round" in [0-9]|[0-9][0-9]) ;; *) die "usage: vibe <round 0..$MAX_FIX_ROUNDS> [fix-prompt-file]";; esac
  [ "$round" -le "$MAX_FIX_ROUNDS" ] || die "round $round exceeds the $MAX_FIX_ROUNDS-fix-round limit — stop and report"
  branch=$(state_get branch); dispatch=$(state_get dispatch)
  [ -n "$branch" ] || die "no preflight state — run preflight first"
  [ "$(state_get coder)" = vibe ] || die "this dispatch's Coder is not vibe"
  [ "$(git rev-parse --abbrev-ref HEAD)" = "$branch" ] || die "HEAD is not on '$branch'"
  # A round that hit a turn/price limit leaves finished-so-far work uncommitted. Continuing it is legitimate but must be
  # explicit (ALLOW_DIRTY=1) so the session cannot do it by accident, and it is counted as a fix round.
  [ -z "$(git status --porcelain)" ] || [ "${ALLOW_DIRTY:-0}" = 1 ] || die "working tree is dirty before the round — Vibe must commit; a dirty tree means the last round did not finish cleanly (a limit stop? continue it with ALLOW_DIRTY=1 and say so in the notes)"
  w=$(work_dir); sid=$(state_get session); pc=0; pt=0; pp=0
  if [ "$round" -eq 0 ]; then
    prompt="You are the Vibe coder for this repository. Read $BRIEF_FILE first (especially its section on coders and the boundary), then work the dispatch file $dispatch end to end on the current branch ($branch). Commit your work on this branch; do not push, merge, or touch $MAIN_BRANCH. Run every check the dispatch lists exactly as written — do not narrow, skip or reword any. End with the STOP report the dispatch asks for, as your final message."
    resume=""
  else
    [ -n "$fixfile" ] && [ -s "$fixfile" ] || die "a fix round needs a prompt file naming exactly what failed"
    if [ -n "$sid" ]; then
      prompt="FIX ROUND $round on the same dispatch ($dispatch). $(cat "$fixfile") Commit the fix on this branch; do not push or merge. End with an updated STOP report."
      resume="--resume $sid"
      m=$(session_meta "$sid")
      if [ -n "$m" ]; then pc=$(stat_of "$m" steps); pt=$(stat_of "$m" session_total_llm_tokens); pp=$(stat_of "$m" session_cost); fi
    else
      # No recorded session (the build was not run through this helper): a fresh run is allowed by the skill.
      echo "NOTE: no session recorded — starting a FRESH Vibe session for this fix round (not a resume)"
      prompt="You are the Vibe coder for this repository. Read $BRIEF_FILE first (especially its section on coders and the boundary), then read the dispatch file $dispatch. Its work is already committed on the current branch ($branch) but FAILED review: FIX ROUND $round. $(cat "$fixfile") Fix exactly that, on this branch; commit; do not push, merge, or touch $MAIN_BRANCH. Run every check the dispatch lists exactly as written — do not narrow, skip or reword any. End with the STOP report the dispatch asks for, as your final message."
    fi
  fi
  # --max-turns / --max-price are cumulative across a resumed session (measured), so add what is already spent.
  turns=$(( ${pc:-0} + VIBE_MAX_TURNS ))
  price=$(awk -v a="${pp:-0}" -v b="$VIBE_MAX_PRICE" 'BEGIN{printf "%.4f", a+b}')
  out="$w/round$round.out"; err="$w/round$round.err"
  t0=$(date +%s)
  # shellcheck disable=SC2086
  # Windows: Vibe writes its stream with the console codepage and dies on the first non-ASCII character (an arrow
  # in a dispatch). Measured: exit 1, empty report. Force UTF-8.
  PYTHONUTF8=1 PYTHONIOENCODING=utf-8 vibe $VIBE_FLAGS_FIXED $resume --max-turns "$turns" --max-price "$price" --output streaming -p "$prompt" > "$out" 2> "$err"
  rc=$?
  t1=$(date +%s)
  echo $((t1 - t0)) > "$w/round$round.wall"; echo "$rc" > "$w/round$round.rc"
  [ -n "$sid" ] || { sid=$(php_session_id "$out"); [ -n "$sid" ] && state_put session "$sid"; }
  php_final_text "$out" > "$w/round$round.report"
  echo "vibe round $round: exit $rc, wall $((t1 - t0))s, session ${sid:-unknown}"
  echo "final message: $w/round$round.report ($(wc -l < "$w/round$round.report") lines)"
  { [ "$rc" -ne 0 ] || [ ! -s "$w/round$round.report" ]; } && echo "WARNING: vibe exited $rc with $( [ -s "$w/round$round.report" ] && echo a || echo NO ) final message — this round did NOT complete; read $err and $out before doing anything else"
  grep -q '<vibe_stop_event>' "$w/round$round.report" && echo "NOTE: Vibe was stopped by a limit — $(grep -o '<vibe_stop_event>[^<]*' "$w/round$round.report" | head -1)"
  echo "HEAD now $(git rev-parse --short=12 HEAD); tree: $( [ -z "$(git status --porcelain)" ] && echo clean || echo DIRTY — Vibe did not commit everything )"
  return "$rc"
}

# Run the dispatch's checks VERBATIM: every top-level bullet in the checks section whose first backtick span
# is a command. The command is handed to sh untouched — no editing, no narrowing, no "equivalent". The
# expectation (after the arrow) is printed beside the output for the SESSION to judge; a check with a
# non-zero exit is flagged, but a zero exit is not proof either: read the output against the bullet.
cmd_checks() {
  dispatch=$(state_get dispatch); [ -n "$dispatch" ] || die "no preflight state — run preflight first"
  w=$(work_dir); : > "$w/checks.log"
  awk -v h="$CHECKS_HEADING" '$0 ~ h {s=1;next} s&&/^## /{s=0} s&&/^- `/{print}' "$dispatch" > "$w/checks.list"
  [ -s "$w/checks.list" ] || die "no check bullets found under '$CHECKS_HEADING' in $dispatch"
  n=0
  while IFS= read -r line; do
    n=$((n+1))
    cmd=$(printf '%s\n' "$line" | sed -n 's/^- `\([^`]*\)`.*/\1/p')
    want=$(printf '%s\n' "$line" | sed 's/^- `[^`]*`//')
    { echo "=== CHECK $n: $cmd"; echo "--- dispatch says:$want"; } | tee -a "$w/checks.log"
    sh -c "$cmd" > "$w/check$n.out" 2>&1; rc=$?
    head -60 "$w/check$n.out" | tee -a "$w/checks.log"
    [ "$(wc -l < "$w/check$n.out")" -gt 60 ] && echo "... ($(wc -l < "$w/check$n.out") lines; full: $w/check$n.out)" | tee -a "$w/checks.log"
    echo "--- exit $rc" | tee -a "$w/checks.log"
  done < "$w/checks.list"
  echo "ran $n check(s) verbatim; log: $w/checks.log"
}

cmd_figures() {
  w=$(work_dir); sid=$(state_get session)
  m=$(session_meta "$sid")
  if [ -z "$m" ]; then echo "figures: UNAVAILABLE (no Vibe session meta for '${sid:-none}' under $VIBE_HOME_DIR) — say so; do not estimate"; return 1; fi
  echo "model=$(model_of "$m")"
  echo "turns=$(stat_of "$m" steps)"
  echo "tokens_prompt=$(stat_of "$m" session_prompt_tokens)"
  echo "tokens_completion=$(stat_of "$m" session_completion_tokens)"
  echo "tokens_cached=$(stat_of "$m" session_cached_tokens)"
  echo "cost_usd=$(stat_of "$m" session_cost)"
  wall=0; for f in "$w"/round*.wall; do [ -f "$f" ] && wall=$((wall + $(cat "$f"))); done
  echo "wall_seconds=$wall"
  echo "source=$m"
}

cmd_stopfile() {
  fsec="${1:-}"; [ -s "$fsec" ] || die "usage: stopfile <foreman-section-file>"
  dispatch=$(state_get dispatch); w=$(work_dir)
  base=${dispatch%.md}; out="${base}-stop.md"
  # SCRUB_WORDS: an extended regex of words the repo's rules keep out of tracked files (e.g. a real name). Case-insensitive.
  redact() { sed -E "${SCRUB_WORDS:+s#$SCRUB_WORDS#<name>#Ig;}"'s#(^|[^A-Za-z])[A-Za-z]:[\/][^[:space:]`)"'"'"']*#\1<path>#g; s#/(Users|home|c|mnt)/[^[:space:]`)"'"'"']*#<path>#g; s#\$[0-9][0-9.,]*#<cost>#g'; }
  {
    echo "# STOP — $base"; echo
    echo "## Vibe's STOP report (as written; absolute paths redacted by the foreman)"; echo
    for r in 0 1 2 3; do
      [ -f "$w/round$r.out" ] || continue
      [ "$r" -eq 0 ] && echo "### Round 0 — build" || echo "### Round $r — fix round"
      echo
      if [ -s "$w/round$r.report" ]; then redact < "$w/round$r.report"; else echo "(Vibe left no final message this round — it stopped on a limit or crashed; see the foreman section.)"; fi
      echo
    done
    echo "## Foreman"; echo; cat "$fsec"
  } > "$out"
  pat_cost='[$][0-9]+[.][0-9]'
  bad=$(grep -n -i -E "(^|[^A-Za-z])[A-Za-z]:[\/]|/(Users|home)/|$pat_cost|USD${SCRUB_WORDS:+|$SCRUB_WORDS}" "$out")
  [ -z "$bad" ] || { echo "stopfile: scrub failed — cost figure or absolute path still in $out:" >&2; echo "$bad" >&2; return 1; }
  echo "wrote $out ($(wc -l < "$out") lines) — scrub clean"
}

cmd_record() {
  fixes="${1:-0}"; w=$(work_dir)
  # Several repos share one DISPATCH_RUNLOG_DIR, so the record and its filename name the repo.
  repo=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")
  rec="repo=$repo
dispatch=$(state_get dispatch)
branch=$(state_get branch)
coder=$(state_get coder)
fix_rounds=$fixes
commit=$(git rev-parse --short=12 HEAD)
$(cmd_figures 2>&1)"
  if [ -n "${DISPATCH_RUNLOG_DIR:-}" ]; then
    mkdir -p "$DISPATCH_RUNLOG_DIR" || die "cannot create DISPATCH_RUNLOG_DIR"
    f="$DISPATCH_RUNLOG_DIR/$repo-$(basename "$(state_get dispatch)" .md)-$(date +%Y%m%d%H%M%S).txt"
    printf '%s\n' "$rec" > "$f"; echo "run record written: $f"
  else
    echo "DISPATCH_RUNLOG_DIR is unset — run record NOT written to a file; print it in the final message:"
    printf '%s\n' "$rec"
  fi
}

case "${1:-}" in
  preflight) shift; cmd_preflight "$@" ;;
  vibe)      shift; cmd_vibe "$@" ;;
  checks)    shift; cmd_checks "$@" ;;
  figures)   shift; cmd_figures "$@" ;;
  stopfile)  shift; cmd_stopfile "$@" ;;
  record)    shift; cmd_record "$@" ;;
  *) echo "usage: sh tools/run_dispatch.sh preflight|vibe|checks|figures|stopfile|record ..." >&2; exit 2 ;;
esac
