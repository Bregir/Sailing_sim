#!/bin/sh
# ⭐ THE BOUNDARY GUARD'S TEST BATTERY — tools/guard_boundary.php
#
#     sh tools/test_guard_boundary.sh      (POSIX sh: dash, Git Bash's sh and bash all run it)
#
# ⛔ EVERY CASE DECLARES THE ANSWER IT MUST PRODUCE, in both directions. A guard that only ever says
# "ask" is as useless as one that never does, and a battery of positive cases alone cannot tell the two
# apart.
#
# It earned its keep twice in the repo it was ported from (BoBS), on its own author's code:
#   * `git -C .. push --force` passed the FIRST version SILENTLY — the option parser consumed `-C` but
#     not its separate argument, so the single most dangerous command in the set was invisible.
#   * the branch check used `rev-parse --abbrev-ref`, which FAILS on an unborn branch; the failure was
#     read as "not main" and went silent. A guard answering "no" when it means "I cannot tell".
# Both are fixed and both are cases below. Add a case for every future hole rather than a comment.

GUARD="$(cd "$(dirname "$0")/.." && pwd)/tools/guard_boundary.php"
pass=0; fail=0

check() {                      # check <ASK|SILENT> <tool> <command>
  local want="$1" tool="$2" cmd="$3" payload out got
  payload=$(TOOL="$tool" CMD="$cmd" php -r 'echo json_encode(["tool_name"=>getenv("TOOL"),"tool_input"=>["command"=>getenv("CMD")]]);')
  out=$(printf '%s' "$payload" | php "$GUARD")
  [ -z "$out" ] && got="SILENT" || got="ASK"
  if [ "$got" = "$want" ]; then
    pass=$((pass+1)); printf '  ok    %-6s %s\n' "$got" "$cmd"
  else
    fail=$((fail+1)); printf '  FAIL  want %-6s got %-6s  %s\n' "$want" "$got" "$cmd"
  fi
}

echo "=== the git boundary — must ASK ==="
check ASK    Bash "git push"
check ASK    Bash "git push origin main"
check ASK    Bash "cd tools && git push"
check ASK    Bash "git -C .. push --force"
check ASK    Bash "git --git-dir=.git push origin HEAD"
check ASK    Bash "node run-scenarios.mjs && git push"
check ASK    Bash "git merge --ff-only round-20-wind-shadow"
check ASK    Bash "git -c user.name=x merge foo"
check ASK    Bash "git rebase main"
check ASK    Bash "git reset --hard origin/main"
check ASK    Bash "git branch -f main HEAD~1"
check ASK    Bash "git update-ref refs/heads/main HEAD"

echo "=== the untracked-file killers — must ASK (they name no file) ==="
check ASK    Bash "git clean -fdx"
check ASK    Bash "git -C .. clean -fdx"
check ASK    Bash "cd tools && git -C .. clean -n"
check ASK    Bash "git stash -u"
check ASK    Bash "git -c core.pager=cat stash -u"

echo "=== the reviewer's spec — a write must ASK ==="
check ASK    Bash "rm spec-2d-sandbox.md"
check ASK    Bash "mv spec-2d-sandbox.md /tmp/x"
check ASK    Bash "echo '## new rule' >> spec-2d-sandbox.md"
check ASK    Bash "sed -i 's/must/may/' spec-2d-sandbox.md"
check ASK    Bash "cp /tmp/better.md spec-2d-sandbox.md"
check ASK    Bash "git checkout main -- spec-2d-sandbox.md"
check ASK    Bash "node run-scenarios.mjs > spec-2d-sandbox.md"
check ASK    Bash "perl -pi -e 's/x/y/' ./SPEC-2D-SANDBOX.MD"
check ASK    PowerShell "Set-Content .\\spec-2d-sandbox.md 'x'"
check ASK    PowerShell "Remove-Item spec-2d-sandbox.md -Force"
echo "=== the reviewer's spec — reading it stays SILENT ==="
check SILENT Bash "cat spec-2d-sandbox.md"
check SILENT Bash "grep -n 'wind' spec-2d-sandbox.md"
check SILENT Bash "wc -l spec-2d-sandbox.md"
check SILENT Bash "git diff main -- spec-2d-sandbox.md"
check SILENT Bash "git log --oneline -- spec-2d-sandbox.md"
check SILENT PowerShell "Get-Content spec-2d-sandbox.md"

echo "=== the guard's own integrity — must ASK ==="
check ASK    Bash "rm tools/guard_boundary.php"
check ASK    Bash "echo '{}' > .claude/settings.json"
check ASK    Bash "sed -i 's/ask/allow/' tools/guard_boundary.php"
check SILENT Bash "cat tools/guard_boundary.php"
check SILENT Bash "php -l tools/guard_boundary.php"

echo "=== routine work — must stay SILENT ==="
check SILENT Bash "git status --short"
check SILENT Bash "git add index.html report-round20.md"
check SILENT Bash "git log --oneline -5"
check SILENT Bash "git diff index.html"
check SILENT Bash "git format-patch -1"
check SILENT Bash "git log --oneline --grep=push"
check SILENT Bash "git commit --dry-run"
check SILENT Bash "echo 'the word merge appears here'"
check SILENT Bash "node run-scenarios.mjs"
check SILENT Bash "node render-checks.mjs"
check SILENT Bash "node round19-checks.mjs --verbose"
check SILENT Bash "sed -i 's/a/b/' index.html"
check SILENT Bash "echo 'see the spec' > report-round20.md"
check SILENT Read "irrelevant — not a shell tool"

# ⚠ THE BRANCH-AWARE CASE, whose right answer DEPENDS ON THE CHECKOUT — so the expectation is derived
# rather than hardcoded. That is the whole property no permission rule can express.
branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo "")
echo "=== commit while HEAD is '${branch:-<detached>}' — expectation DERIVED from the checkout ==="
if [ "$branch" = "main" ] || [ "$branch" = "master" ] || [ -z "$branch" ]; then
  check ASK    Bash "git commit -m 'probe'"
else
  check SILENT Bash "git commit -m 'probe'"
fi

echo
echo "PASS $pass  FAIL $fail"
[ "$fail" -eq 0 ]
