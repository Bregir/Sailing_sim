#!/bin/sh
# Tests for tools/run_dispatch.sh WITHOUT a real Vibe: a stub `vibe` on PATH mimics the CLI (commit, final
# STOP-report message, streaming JSON, and Vibe's own meta.json with cumulative stats). Run from anywhere:
#     sh tools/test_run_dispatch.sh
# Each scenario builds a throwaway repo + bare origin in a temp dir. Exit 0 only if every assertion holds.
# The LAST block proves the tests can fail: it sabotages a copy of the helper and requires the suite's
# own assertions to notice.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
HELPER="$HERE/run_dispatch.sh"
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/rd_test.XXXXXX") || exit 2
PASS=0; FAIL=0
ok()  { if [ "$2" = 0 ]; then PASS=$((PASS+1)); echo "PASS  $1"; else FAIL=$((FAIL+1)); echo "FAIL  $1"; fi; }
has() { grep -qF -- "$2" "$1"; }          # has <file> <text>
hasnt() { ! grep -qF -- "$2" "$1"; }

# ---- the stub vibe -------------------------------------------------------------------------------
mkdir -p "$ROOT/bin"
cat > "$ROOT/bin/vibe" <<'STUB'
#!/bin/sh
# stub: STUB_MODE = pass | fixonce | never | foobar ; STUB_DIR = scratch ; VIBE_HOME = fake home
[ "${1:-}" = "--version" ] && { echo "vibe-stub 0.0"; exit 0; }
resume=""; prompt=""; turns=""; price=""; flags=""
while [ $# -gt 0 ]; do case "$1" in
  --resume) resume="$2"; shift 2;; -p) prompt="$2"; shift 2;;
  --max-turns) turns="$2"; shift 2;; --max-price) price="$2"; shift 2;;
  --output) shift 2;; *) flags="$flags $1"; shift;; esac; done
echo "utf8=${PYTHONUTF8:-unset} resume=$resume turns=$turns price=$price flags=$flags" >> "$STUB_DIR/calls.log"
n=$(cat "$STUB_DIR/count" 2>/dev/null || echo 0); echo $((n+1)) > "$STUB_DIR/count"
SID=aaaaaaaa-1111-2222-3333-444444444444
case "${STUB_MODE:-pass}" in
  pass)    [ "$n" -eq 0 ] && echo ok > done.txt ;;
  fixonce) [ "$n" -eq 1 ] && echo ok > done.txt ;;
  foobar)  echo "a foobar here" > work.txt ;;
esac
if [ "${STUB_MODE:-pass}" = limit ] && [ "$n" -eq 0 ]; then   # a limit stop: uncommitted work, no final message
  echo partial > partial.txt
  echo "{\"sessionId\":\"aaaaaaaa-1111-2222-3333-444444444444\",\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hi\"}]}"
  d="$VIBE_HOME/logs/session/session_20260101_000000_aaaaaaaa"; mkdir -p "$d"
  printf "{\n  \"config\": {\n    \"active_model\": \"stub-model-9\"\n  },\n  \"stats\": {\n    \"steps\": 3,\n    \"session_cost\": 0.5\n  }\n}\n" > "$d/meta.json"
  exit 1
fi
echo "round $n" >> work.log
git add -A >/dev/null 2>&1; git commit -q -m "stub round $n" >/dev/null 2>&1
d="$VIBE_HOME/logs/session/session_20260101_000000_aaaaaaaa"; mkdir -p "$d"
steps=$(( (n+1) * 3 )); cost=$(awk -v n=$((n+1)) 'BEGIN{printf "%.4f", n*0.5}')
cat > "$d/meta.json" <<META
{
  "session_id": "$SID",
  "experiments": {
    "x": { "config": {
          "active_model": "decoy-model" } }
  },
  "config": {
    "active_model": "stub-model-9",
    "routed_default_model": "other"
  },
  "stats": {
    "steps": $steps,
    "session_prompt_tokens": $((n+1))000,
    "session_completion_tokens": 100,
    "session_cached_tokens": 10,
    "session_cost": $cost
  },
  "total_messages": 2
}
META
echo "{\"sessionId\":\"$SID\",\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hi\"}]}"
printf '{"sessionId":"%s","type":"message","role":"assistant","content":[{"type":"text","text":"STOP report round %s\\nI worked in C:\\\\Users\\\\someone\\\\src\\\\repo and it cost $9.99; turns: 99; model: lying-model; author is Zebediah, see https://example.org/x/y"}]}\n' "$SID" "$n"
exit 0
STUB
chmod +x "$ROOT/bin/vibe"

# ---- fixture builder -----------------------------------------------------------------------------
# build <name> : repo at $ROOT/<name>/repo on branch feat with ONE added dispatch, origin bare beside it.
build() {
  r="$ROOT/$1"; rm -rf "$r"; mkdir -p "$r"
  git init -q --bare "$r/origin.git"
  git clone -q "$r/origin.git" "$r/repo" 2>/dev/null
  cd "$r/repo" || exit 2
  git config user.email t@t; git config user.name t
  mkdir -p .vibe tools
  echo '# hooks' > .vibe/hooks.toml; echo '<?php' > tools/guard_boundary_vibe.php; echo base > f.txt
  git add -A; git commit -q -m base; git branch -M main; git push -q origin main 2>/dev/null
  git checkout -q -b feat
  cat > dispatch-demo.md <<'D'
# Dispatch — demo
- **Coder:** `vibe` — test fixture.

## Task
Make done.txt.

## Checks
- `test -f done.txt` → exists.
- `test -z "$(git grep -n -i "fo""obar")"` → no hits.

## STOP report
Run block.
D
  git add -A; git commit -q -m dispatch; git push -q origin feat 2>/dev/null
  mkdir -p "$r/stub" "$r/home" "$r/work"
}
env_for() { # env_for <name> <mode>
  r="$ROOT/$1"
  export PATH="$ROOT/bin:$ORIG_PATH" STUB_DIR="$r/stub" STUB_MODE="$2" VIBE_HOME="$r/home" DISPATCH_WORK_DIR="$r/work"
  unset DISPATCH_RUNLOG_DIR
  : > "$r/stub/calls.log"; rm -f "$r/stub/count"; rm -rf "$r/work"/*; rm -rf "$r/home"/*
  cd "$r/repo" || exit 2
}
ORIG_PATH="$PATH"
H() { sh "$HELPER" "$@"; }

# ================= 1. clean pass =====================================================================
build s1; env_for s1 pass
H preflight feat > "$ROOT/s1/pre.out" 2>&1;           ok "s1 preflight passes"                 $?
has "$ROOT/s1/pre.out" "coder=vibe";                   ok "s1 reads the Coder line"             $?
H vibe 0 > "$ROOT/s1/v0.out" 2>&1;                    ok "s1 vibe round 0 runs"                $?
has "$ROOT/s1/stub/calls.log" "utf8=1";                    ok "s1 forces PYTHONUTF8=1 for Vibe (Windows cp1252 crash)" $?
has "$ROOT/s1/stub/calls.log" "--trust";                    ok "s1 passes --trust"                   $?
has "$ROOT/s1/stub/calls.log" "--auto-approve";             ok "s1 passes --auto-approve"            $?
has "$ROOT/s1/stub/calls.log" "--legacy-harness";           ok "s1 passes --legacy-harness (machine stats)" $?
has "$ROOT/s1/stub/calls.log" "turns=60 price=2.0000";      ok "s1 round-0 limits are the per-round defaults" $?
H checks > "$ROOT/s1/ck.out" 2>&1;                    ok "s1 checks run"                       $?
[ "$(grep -c '^--- exit 0' "$ROOT/s1/ck.out")" = 2 ];  ok "s1 both checks exit 0"               $?
has "$ROOT/s1/ck.out" 'test -z "$(git grep -n -i "fo""obar")"'; ok "s1 check printed VERBATIM, split quotes intact" $?
H figures > "$ROOT/s1/fig.out" 2>&1;                  ok "s1 figures available"                $?
has "$ROOT/s1/fig.out" "model=stub-model-9";           ok "s1 model from Vibe's meta, not the decoy or the report" $?
has "$ROOT/s1/fig.out" "turns=3";                      ok "s1 turns from Vibe's meta (not the report's 99)" $?
has "$ROOT/s1/fig.out" "cost_usd=0.5";                 ok "s1 cost from Vibe's meta (not the report's 9.99)" $?
printf 'Checks re-run: all green.\nFix rounds: 0.\n' > "$ROOT/s1/fsec.md"
H stopfile "$ROOT/s1/fsec.md" > "$ROOT/s1/sf.out" 2>&1; ok "s1 stopfile written, scrub clean"   $?
has "$ROOT/s1/repo/dispatch-demo-stop.md" "<cost>"; ok "s1 stopfile redacts the cost figure" $?
f="$ROOT/s1/repo/dispatch-demo-stop.md"
has "$f" "<path>";                                     ok "s1 stopfile redacts the absolute path" $?
hasnt "$f" "C:\\Users";                                ok "s1 no absolute path left"             $?
DISPATCH_RUNLOG_DIR="$ROOT/s1/runlog" H record 0 > "$ROOT/s1/rec.out" 2>&1; ok "s1 record with DISPATCH_RUNLOG_DIR set" $?
n=$(ls "$ROOT/s1/runlog" 2>/dev/null | wc -l); [ "$n" = 1 ]; ok "s1 run record file created outside the repo" $?
has "$ROOT/s1/runlog/"* "cost_usd=0.5";                ok "s1 run record carries Vibe's cost"    $?
ls "$ROOT/s1/runlog" | grep -q '^repo-dispatch-demo-[0-9]*\.txt$'; ok "s1 run record filename is prefixed with the repo name" $?
has "$ROOT/s1/runlog/"* "repo=repo";                   ok "s1 run record names the repo (git toplevel basename)" $?
H record 0 > "$ROOT/s1/rec2.out" 2>&1;                ok "s1 record with DISPATCH_RUNLOG_DIR unset" $?
has "$ROOT/s1/rec2.out" "DISPATCH_RUNLOG_DIR is unset"; ok "s1 unset => says so and prints the record" $?
has "$ROOT/s1/rec2.out" "cost_usd=0.5";                ok "s1 unset => record printed to chat"   $?
has "$ROOT/s1/rec2.out" "repo=repo";                   ok "s1 unset => printed record names the repo" $?

# ================= 2. failing check -> fix round -> pass ==============================================
build s2; env_for s2 fixonce
H preflight feat >/dev/null 2>&1; H vibe 0 >/dev/null 2>&1
H checks > "$ROOT/s2/ck0.out" 2>&1
has "$ROOT/s2/ck0.out" "--- exit 1";                   ok "s2 failing check is reported with a non-zero exit" $?
echo "check 1 failed: done.txt is missing." > "$ROOT/s2/fix.txt"
H vibe 1 "$ROOT/s2/fix.txt" > "$ROOT/s2/v1.out" 2>&1; ok "s2 fix round runs" $?
has "$ROOT/s2/stub/calls.log" "resume=aaaaaaaa-1111-2222-3333-444444444444"; ok "s2 fix round RESUMES the recorded session" $?
has "$ROOT/s2/stub/calls.log" "turns=63";                   ok "s2 resume limit = turns already spent (3) + 60" $?
H checks > "$ROOT/s2/ck1.out" 2>&1
[ "$(grep -c '^--- exit 0' "$ROOT/s2/ck1.out")" = 2 ]; ok "s2 checks pass after the fix round" $?
H figures > "$ROOT/s2/fig.out" 2>&1; has "$ROOT/s2/fig.out" "turns=6"; ok "s2 figures are cumulative across rounds" $?

# ================= 3. two failed fix rounds -> stop ===================================================
build s3; env_for s3 never
H preflight feat >/dev/null 2>&1; H vibe 0 >/dev/null 2>&1
echo "still failing" > "$ROOT/s3/fix.txt"
H vibe 1 "$ROOT/s3/fix.txt" >/dev/null 2>&1;          ok "s3 fix round 1 allowed" $?
H vibe 2 "$ROOT/s3/fix.txt" >/dev/null 2>&1;          ok "s3 fix round 2 allowed" $?
H vibe 3 "$ROOT/s3/fix.txt" > "$ROOT/s3/v3.out" 2>&1; [ $? -eq 2 ]; ok "s3 round 3 REFUSED (exit 2)" $?
has "$ROOT/s3/v3.out" "limit";                         ok "s3 refusal names the limit" $?
H vibe 1 >/dev/null 2>&1;                              [ $? -eq 2 ]; ok "s3 a fix round with no prompt file is refused" $?

# ================= 3b. fix round with NO recorded session => fresh run ================================
build s8; env_for s8 pass
H preflight feat >/dev/null 2>&1
echo "something failed" > "$ROOT/s8/fix.txt"
H vibe 1 "$ROOT/s8/fix.txt" > "$ROOT/s8/v1.out" 2>&1;  ok "s8 fix round without a session runs" $?
has "$ROOT/s8/v1.out" "FRESH Vibe session";            ok "s8 says it is a fresh session, not a resume" $?
has "$ROOT/s8/stub/calls.log" "resume= ";              ok "s8 no --resume passed" $?
H figures 2>&1 | has /dev/stdin "model=stub-model-9";  ok "s8 the new session is recorded and measured" $?

# ================= 3c. limit stop -> dirty tree -> ALLOW_DIRTY continue; scrub words ==================
build s9; env_for s9 limit
H preflight feat >/dev/null 2>&1
H vibe 0 > "$ROOT/s9/v0.out" 2>&1;                    [ $? -eq 1 ]; ok "s9 a limit-stopped round exits non-zero" $?
has "$ROOT/s9/v0.out" "did NOT complete";              ok "s9 helper warns the round did not complete" $?
has "$ROOT/s9/v0.out" "DIRTY";                         ok "s9 helper reports the dirty tree" $?
echo "finish it" > "$ROOT/s9/fix.txt"
H vibe 1 "$ROOT/s9/fix.txt" > "$ROOT/s9/v1.out" 2>&1; [ $? -eq 2 ]; ok "s9 a round on a dirty tree is REFUSED by default" $?
has "$ROOT/s9/v1.out" "ALLOW_DIRTY";                   ok "s9 refusal says how to continue deliberately" $?
ALLOW_DIRTY=1 H vibe 1 "$ROOT/s9/fix.txt" > "$ROOT/s9/v1b.out" 2>&1; ok "s9 ALLOW_DIRTY=1 continues the round" $?
printf "Notes: continued after a limit stop.\n" > "$ROOT/s9/fsec.md"
SCRUB_WORDS="zebe""diah" H stopfile "$ROOT/s9/fsec.md" > "$ROOT/s9/sf.out" 2>&1; ok "s9 stopfile with SCRUB_WORDS" $?
f="$ROOT/s9/repo/dispatch-demo-stop.md"
hasnt "$f" "Zebediah";                                 ok "s9 scrub word removed from the tracked file" $?
has "$f" "<name>";                                     ok "s9 scrub word replaced by a placeholder" $?
has "$f" "https://example.org/x/y";                    ok "s9 a URL is NOT mistaken for a drive path" $?
has "$f" "Round 0";                                    ok "s9 stopfile lists round 0 even though it left no message" $?
has "$f" "left no final message";                      ok "s9 stopfile says plainly that a round left no report" $?
has "$f" "Round 1";                                    ok "s9 stopfile lists the fix round" $?
printf "mentions Zebediah again\n" > "$ROOT/s9/fsec2.md"
SCRUB_WORDS="zebe""diah" H stopfile "$ROOT/s9/fsec2.md" > "$ROOT/s9/sf2.out" 2>&1; [ $? -ne 0 ]; ok "s9 scrub word in the FOREMAN section makes stopfile fail (the net catches what redaction cannot)" $?

# ================= 4. preflight refusals ==============================================================
refuse() { # refuse <label> <expected text> <cmd...>
  l="$1"; t="$2"; shift 2; "$@" > "$ROOT/ref.out" 2>&1; rc=$?
  [ $rc -eq 2 ] && has "$ROOT/ref.out" "$t"; ok "refuse: $l" $?
}
build s4; env_for s4 pass
mv .vibe/hooks.toml .vibe/hooks.off; git add -A; git commit -q -m x
refuse "no hooks file" ".vibe/hooks.toml is missing" H preflight feat
mv .vibe/hooks.off .vibe/hooks.toml; git add -A; git commit -q -m y
echo dirt > untracked.txt
refuse "dirty tree" "not clean" H preflight feat
rm untracked.txt
refuse "branch main" "never run a dispatch on main" H preflight main
refuse "unknown branch" "neither locally nor on origin" H preflight nope
mkdir -p sub; refuse "wrong folder" "not at the repo root" sh -c "cd sub && sh '$HELPER' preflight feat"
refuse "php missing" "php is not on PATH" env PATH="$(dirname "$(command -v git)"):/usr/bin:/bin" sh "$HELPER" preflight feat
git checkout -q -b two; echo '- **Coder:** `vibe`' > dispatch-second.md; git add -A; git commit -q -m two
refuse "two dispatches added" "found 2" H preflight two
git checkout -q feat
git push -q origin feat:remoteonly 2>/dev/null
H preflight remoteonly > "$ROOT/s4/ro.out" 2>&1;      ok "branch present only on origin is fetched" $?
mkdir -p "$ROOT/notgit"; ( cd "$ROOT/notgit" && sh "$HELPER" preflight feat > "$ROOT/ng.out" 2>&1 ); [ $? -eq 2 ]; ok "refuse: not a git repository" $?
build s5; env_for s5 pass
sed -i 's/`vibe`/`claude-opusplan`/' dispatch-demo.md; git add -A; git commit -q -m c
H preflight feat > "$ROOT/s5/p.out" 2>&1;             ok "s5 claude coder passes preflight" $?
has "$ROOT/s5/p.out" "coder=claude-opusplan";          ok "s5 coder reported" $?
H vibe 0 >/dev/null 2>&1; [ $? -eq 2 ];                ok "s5 vibe refused when Coder is not vibe" $?

# ================= 5. checks are verbatim, and can fail ================================================
build s6; env_for s6 foobar
H preflight feat >/dev/null 2>&1; H vibe 0 >/dev/null 2>&1
H checks > "$ROOT/s6/ck.out" 2>&1
[ "$(grep -c '^--- exit 1' "$ROOT/s6/ck.out")" = 2 ];  ok "s6 both checks FAIL on the bad work (the name check CAN fail)" $?

# ================= 6. liveness: sabotage the helper, the suite must notice ============================
SAB="$ROOT/sabotaged.sh"
sed 's|sh -c "\$cmd" > "\$w/check\$n.out" 2>&1; rc=\$?|echo narrowed > "$w/check$n.out"; rc=0|' "$HELPER" > "$SAB"
cmp -s "$HELPER" "$SAB"; [ $? -ne 0 ]; ok "liveness: sabotage applied" $?
build s7; env_for s7 foobar
sh "$SAB" preflight feat >/dev/null 2>&1; sh "$SAB" vibe 0 >/dev/null 2>&1; sh "$SAB" checks > "$ROOT/s7/ck.out" 2>&1
# the s6 assertion, replayed against the sabotaged helper, MUST now fail — so success here means "it failed".
[ "$(grep -c '^--- exit 1' "$ROOT/s7/ck.out")" = 2 ]; [ $? -ne 0 ]; ok "liveness: sabotaged helper is detected by the s6 assertion" $?

echo; echo "RESULT: $PASS passed, $FAIL failed"; rm -rf "$ROOT"
[ "$FAIL" -eq 0 ]
