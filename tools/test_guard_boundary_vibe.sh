#!/bin/sh
# ⭐ THE VIBE BOUNDARY'S TEST BATTERY — tools/guard_boundary_vibe.php + .vibe/hooks.toml
#
#     sh tools/test_guard_boundary_vibe.sh      (POSIX sh: dash, Git Bash's sh and bash all run it)
#
# ⛔ EVERY CASE DECLARES ITS ANSWER, in both directions — DENY or PASS — for the reason the Claude
# battery gives: a guard that only ever refuses is as useless as one that never does.
#
# ⭐ The shell cases are NOT copied: they are READ OUT OF tools/test_guard_boundary.sh at run time and
# replayed through the adapter (ASK → must DENY, SILENT → must PASS). A case added there is a case here.
#
# What this battery CANNOT prove: that Vibe actually loaded the hook. A battery that passes while the
# live hook is not wired is exactly the failure tools/vibe_live_check.sh exists to catch — run that too.
#
# Section 4 needs a git checkout with a `main` branch. Where there is none, its cases print SKIP lines
# and are counted as SKIP — never as PASS.
#
# The battery reports its own total; no count is written anywhere else, on purpose.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADAPTER="$ROOT/tools/guard_boundary_vibe.php"
pass=0; fail=0; skip=0
cd "$ROOT" || exit 2

verdict() {                    # verdict <payload-json> [adapter] [cwd] → prints DENY | PASS | BROKEN(<exit>)
  local out code
  out=$(cd "${3:-$ROOT}" && printf '%s' "$1" | php "${2:-$ADAPTER}" 2>/dev/null); code=$?
  if [ "$code" -ne 0 ]; then echo "BROKEN($code)"; return; fi
  if [ -z "$out" ]; then echo PASS; return; fi
  if printf '%s' "$out" | php -r '$v=json_decode(stream_get_contents(STDIN),true); exit((is_array($v)&&($v["decision"]??"")==="deny"&&is_string($v["reason"]??null))?0:1);'
  then echo DENY; else echo "BROKEN(out)"; fi
}
record() {                     # record <want> <got> <label>
  if [ "$2" = "$1" ]; then pass=$((pass+1)); printf '  ok    %-6s %s\n' "$2" "$3"
  else fail=$((fail+1)); printf '  FAIL  want %-6s got %-10s %s\n' "$1" "$2" "$3"; fi
}
payload() {                    # payload <tool> <json-object-of-args>
  TOOL="$1" ARGS="$2" CWD="$ROOT" php -r 'echo json_encode(["session_id"=>"t","transcript_path"=>"","cwd"=>getenv("CWD"),
    "hook_event_name"=>"pre_tool","tool_name"=>getenv("TOOL"),"tool_call_id"=>"c1","tool_input"=>json_decode(getenv("ARGS"),true)]);'
}
shell() {                      # shell <want> <vibe-tool> <command>
  local args; args=$(CMD="$3" php -r 'echo json_encode(["command"=>getenv("CMD")]);')
  record "$1" "$(verdict "$(payload "$2" "$args")")" "$2: $3"
}
write() {                      # write <want> <vibe-tool> <file_path>
  local args; args=$(P="$3" php -r 'echo json_encode(["file_path"=>getenv("P"),"content"=>"x","old_string"=>"a","new_string"=>"b"]);')
  record "$1" "$(verdict "$(payload "$2" "$args")")" "$2: $3"
}

# ── 1. every case of the Claude battery, replayed through the adapter ──────────────────────────────
# The family each Claude tool name maps onto in Vibe. Bash cases run through bash, git_bash (Windows) and
# file_system.bash (the Unified Harness spelling of the same tool).
check() {                      # the Claude battery's own signature: check <ASK|SILENT> <tool> <command>
  local want; [ "$1" = ASK ] && want=DENY || want=PASS
  case "$2" in
    Bash)       shell "$want" bash "$3"; shell "$want" git_bash "$3"; shell "$want" file_system.bash "$3" ;;
    PowerShell) shell "$want" powershell "$3" ;;
    Read)       local a; a=$(P="$3" php -r 'echo json_encode(["path"=>getenv("P")]);')
                record "$want" "$(verdict "$(payload read_file "$a")")" "read_file: $3" ;;
    *)          fail=$((fail+1)); echo "  FAIL  no Vibe mapping for Claude tool '$2'" ;;
  esac
}
echo "=== the Claude battery, replayed (ASK → DENY, SILENT → PASS), bash + git_bash + file_system.bash + powershell ==="
replayed=0
cases=$(mktemp); grep -E '^check (ASK|SILENT) ' "$ROOT/tools/test_guard_boundary.sh" > "$cases"
while IFS= read -r line; do
  eval "$line"; replayed=$((replayed+1))
done < "$cases"
rm -f "$cases"
[ "$replayed" -gt 0 ] && record PASS PASS "replayed $replayed lines from tools/test_guard_boundary.sh" \
                      || record PASS NONE "no lines could be read from tools/test_guard_boundary.sh"

branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo "")
echo "=== commit while HEAD is '${branch:-<detached>}' — expectation DERIVED from the checkout ==="
if [ "$branch" = "main" ] || [ "$branch" = "master" ] || [ -z "$branch" ]; then
  shell DENY bash "git commit -m 'probe'"
else
  shell PASS bash "git commit -m 'probe'"
fi

echo "=== text typed into a running shell is a command — the *_stdin tools ==="
for t in bash_stdin git_bash_stdin powershell_stdin; do
  record DENY "$(verdict "$(payload $t '{"session_id":"s","text":"git push origin main\n"}')")" "$t: git push"
  record PASS "$(verdict "$(payload $t '{"session_id":"s","text":"git status\n"}')")" "$t: git status"
done
b64=$(printf 'rm spec-2d-sandbox.md\n' | base64 | tr -d '\n')
record DENY "$(verdict "$(payload bash_stdin "{\"session_id\":\"s\",\"bytes_base64\":\"$b64\"}")")" "bash_stdin: base64 of rm spec-2d-sandbox.md"
record PASS "$(verdict "$(payload bash_stdin '{"session_id":"s","control":["ctrl_c"]}')")" "bash_stdin: ctrl_c only"
record DENY "$(verdict "$(payload bash_stdin '{"session_id":"s","bytes_base64":"!!!not base64"}')")" "bash_stdin: undecodable bytes"
echo "=== the Unified Harness spellings (qualified names, camelCase args) ==="
shell DENY process.start "git push"
shell PASS process.start "node run-scenarios.mjs"
record DENY "$(verdict "$(payload process.write '{"processId":"p","text":"git reset --hard origin/main\n"}')")" "process.write: git reset"
record DENY "$(verdict "$(payload process.write "{\"processId\":\"p\",\"bytesBase64\":\"$b64\"}")")" "process.write: bytesBase64 of rm spec-2d-sandbox.md"
record PASS "$(verdict "$(payload process.write '{"processId":"p","control":["ctrl_c"]}')")" "process.write: ctrl_c only"
for a in '{"path":"spec-2d-sandbox.md","content":"x"}' '{"path":".vibe/hooks.toml","content":"x"}'; do
  record DENY "$(verdict "$(payload file_system.write_file "$a")")" "file_system.write_file $a"
done
record PASS "$(verdict "$(payload file_system.write_file '{"path":"index.html","content":"x"}')")" "file_system.write_file index.html"
record DENY "$(verdict "$(payload file_system.search_replace '{"file_path":"tools/guard_boundary.php","content":[]}')")" "file_system.search_replace the guard"
record DENY "$(verdict "$(payload write_file '{"file_path":"index.html","path":"spec-2d-sandbox.md"}')")" "both path keys: the protected one still wins"
record DENY "$(verdict "$(payload run_typescript '{"code":"1"}')")" "run_typescript (programmatic tool calling) — unknown, refused"
for t in file_system.read_file skill.read process.output subagent.spawn; do
  record PASS "$(verdict "$(payload $t '{"path":"x"}')")" "$t"
done

echo "=== the boundary's own install, in a shell — DENY (stricter than the shared guard: no chaining) ==="
shell DENY bash "rm tools/guard_boundary_vibe.php"
shell DENY bash "echo '' > .vibe/hooks.toml"
shell DENY bash "rm -rf .vibe"
shell DENY powershell "Remove-Item .vibe\\hooks.toml"
shell DENY bash "sed -i 's/true/false/' .vibe/hooks.toml"
shell DENY bash "cat .vibe/hooks.toml; rm .vibe/hooks.toml"
shell DENY bash "git checkout main -- .vibe"
shell PASS bash "cat .vibe/hooks.toml"
shell PASS bash "php -l tools/guard_boundary_vibe.php"
shell PASS bash "git diff main -- tools/guard_boundary_vibe.php"
shell PASS bash "sh tools/test_guard_boundary_vibe.sh"

echo "=== the reviewer's spec, in a shell — DENY unless a single read-only command ==="
shell DENY bash "cat spec-2d-sandbox.md; rm spec-2d-sandbox.md"
shell DENY bash "cat spec-2d-sandbox.md && echo x >> spec-2d-sandbox.md"
shell DENY bash "grep -c wind spec-2d-sandbox.md | tee spec-2d-sandbox.md"
shell DENY bash "cat spec-2d-sandbox.md > /tmp/s; cp /tmp/s spec-2d-sandbox.md"
shell DENY powershell "Get-Content spec-2d-sandbox.md; Clear-Content spec-2d-sandbox.md"
shell PASS bash "grep -n 'wind' spec-2d-sandbox.md"
shell PASS bash "git blame spec-2d-sandbox.md"

echo "=== protected-path WRITES (write_file + edit) — DENY ==="
for t in write_file edit; do
  write DENY $t "spec-2d-sandbox.md"
  write DENY $t "$ROOT/spec-2d-sandbox.md"
  write DENY $t "./spec-2d-sandbox.md"
  write DENY $t "SPEC-2D-Sandbox.MD"
  write DENY $t "C:\\Users\\someone\\sejlsim\\spec-2d-sandbox.md"
  write DENY $t "tools/../tools/./../spec-2d-sandbox.md"
  write DENY $t "spec-2d-sandbox.md."
  write DENY $t "spec-2d-sandbox.md . "
  write DENY $t "spec-2d-sandbox.md::\$DATA"
  write DENY $t "spec-2d-sandbox.md:hidden"
  write DENY $t "SPEC-2~1.MD"
  write DENY $t "tools/guard_boundary.php"
  write DENY $t "tools/guard_boundary_vibe.php"
  write DENY $t "TOOLS\\Guard_Boundary.PHP"
  write DENY $t "tools\\GUARD_~1.PHP"
  write DENY $t ".claude/settings.json"
  write DENY $t ".claude\\settings.local.json"
  write DENY $t ".vibe/hooks.toml"
  write DENY $t ".VIBE\\config.toml"
  write DENY $t ".vibe/tools/evil.py"
  write DENY $t "C:\\Users\\someone\\sejlsim\\VIBE~1\\hooks.toml"
done
echo "=== ordinary WRITES — PASS ==="
for t in write_file edit; do
  write PASS $t "index.html"
  write PASS $t "report-round20.md"
  write PASS $t "run-scenarios.mjs"
  write PASS $t "tools/test_guard_boundary_vibe.sh"
  write PASS $t ".\\index.html"
  write PASS $t "spec-2d-sandbox-notes.md"
  write PASS $t "spec-2d-sandbox.md.bak"
done

echo "=== a symlink onto a protected path is still the protected path ==="
tmpd=$(mktemp -d)
ln -s "$ROOT/.vibe" "$tmpd/v"
write DENY write_file "$tmpd/v/hooks.toml"
ln -s "$ROOT/tools" "$tmpd/t"
write DENY edit "$tmpd/t/guard_boundary.php"
: > "$tmpd/spec-2d-sandbox.md"; ln -s "$tmpd/spec-2d-sandbox.md" "$tmpd/innocent.md"
write DENY write_file "$tmpd/innocent.md"
mkdir "$tmpd/x"; ln -s "$tmpd/x/spec-2d-sandbox.md" "$tmpd/dangling.md"
write DENY edit "$tmpd/dangling.md"
ln -s "x/spec-2d-sandbox.md" "$tmpd/s2"; mkdir "$tmpd/sub"; ln -s "../s2" "$tmpd/sub/chain.md"
write DENY write_file "$tmpd/sub/chain.md"
ln -s "$tmpd/x/notes.md" "$tmpd/fine.md"
write PASS write_file "$tmpd/fine.md"
rm -rf "$tmpd"

echo "=== payloads and tools the adapter cannot vouch for — DENY (fail closed) ==="
record DENY "$(verdict 'not json at all')" "unparseable payload"
record DENY "$(verdict '{"tool_input":{"command":"ls"}}')" "payload without tool_name"
record DENY "$(verdict "$(payload bash '{"timeout":5}')")" "bash without a command"
record DENY "$(verdict "$(payload write_file '{"content":"x"}')")" "write_file without file_path"
record DENY "$(verdict "$(payload mcp_github_create_file '{"path":"x"}')")" "unknown tool (an MCP writer)"
record DENY "$(verdict "$(payload some_future_tool '{}')")" "unknown tool (a future builtin)"
echo "=== read-only tools — PASS ==="
for t in read_file grep todo skill task web_fetch bash_output bash_sessions bash_log_file; do
  record PASS "$(verdict "$(payload $t '{"path":"spec-2d-sandbox.md"}')")" "$t"
done

# ── 2. FAIL CLOSED inside the adapter — a sandbox copy of tools/, so the real guard is never touched ──
echo "=== fail-closed: the guard missing / exiting 1 / printing garbage / printing allow ==="
sb=$(mktemp -d); mkdir -p "$sb/tools"; cp "$ADAPTER" "$sb/tools/"
P_PUSH=$(payload bash '{"command":"git push"}'); P_OK=$(payload bash '{"command":"git status"}')
record DENY "$(verdict "$P_OK" "$sb/tools/guard_boundary_vibe.php")" "guard_boundary.php MISSING → even git status denied"
printf '<?php exit(1);\n' > "$sb/tools/guard_boundary.php"
record DENY "$(verdict "$P_OK" "$sb/tools/guard_boundary_vibe.php")" "guard exits 1"
printf '<?php echo "not json";\n' > "$sb/tools/guard_boundary.php"
record DENY "$(verdict "$P_OK" "$sb/tools/guard_boundary_vibe.php")" "guard prints garbage"
printf '<?php echo json_encode(["hookSpecificOutput"=>["permissionDecision"=>"allow"]]);\n' > "$sb/tools/guard_boundary.php"
record DENY "$(verdict "$P_PUSH" "$sb/tools/guard_boundary_vibe.php")" "guard prints an unexpected verdict"
printf '<?php syntax error here\n' > "$sb/tools/guard_boundary.php"
record DENY "$(verdict "$P_OK" "$sb/tools/guard_boundary_vibe.php")" "guard has a parse error"
rm -rf "$sb"

# ── 3. FAIL CLOSED outside the adapter — the hook command as .vibe/hooks.toml declares it ──────────
# Vibe turns a non-zero exit into a deny ONLY under strict = true, so both halves are asserted: the
# command really does exit non-zero with no verdict, AND the hook really is strict.
echo "=== fail-closed: the hook command itself cannot run ==="
hookcmd=$(sed -n 's/^command *= *"\(.*\)"$/\1/p' .vibe/hooks.toml)
nophp=$(mktemp -d); ln -s "$(command -v sh)" "$nophp/sh"
out=$(cd "$ROOT" && printf '%s' "$P_OK" | env -i PATH="$nophp" "$nophp/sh" -c "$hookcmd" 2>/dev/null); code=$?
[ "$code" -ne 0 ] && [ -z "$out" ] && got=NONZERO || got="exit$code"
record NONZERO "$got" "php ABSENT from PATH → hook command exits $code, no verdict (Vibe+strict ⇒ deny)"
rm -rf "$nophp"
elsewhere=$(mktemp -d)
out=$(cd "$elsewhere" && printf '%s' "$P_OK" | sh -c "$hookcmd" 2>/dev/null); code=$?
[ "$code" -ne 0 ] && [ -z "$out" ] && got=NONZERO || got="exit$code"
record NONZERO "$got" "hook run outside the repo root (adapter not found) → exits $code, no verdict"
rmdir "$elsewhere"
grep -Eq '^strict *= *true *$' .vibe/hooks.toml && got=yes || got=no
record yes "$got" ".vibe/hooks.toml: strict = true"
grep -Eq '^type *= *"pre_tool" *$' .vibe/hooks.toml && got=yes || got=no
record yes "$got" ".vibe/hooks.toml: type = \"pre_tool\""
grep -Eq '^match *= *"\*" *$' .vibe/hooks.toml && got=yes || got=no
record yes "$got" ".vibe/hooks.toml: match = \"*\" (every tool, unknown ones refused by the adapter)"
[ "$(grep -c '^\[\[hooks\]\]' .vibe/hooks.toml)" = 1 ] && got=yes || got=no
record yes "$got" ".vibe/hooks.toml: exactly one [[hooks]] entry"
case "$hookcmd" in "php tools/guard_boundary_vibe.php") got=yes ;; *) got=no ;; esac
record yes "$got" ".vibe/hooks.toml: command runs the adapter ($hookcmd)"

# ── 4. tracked, and the shared guard untouched ──────────────────────────────────────────────────────
echo "=== the install is tracked; the shared guard and its settings are byte-identical to main ==="
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  skip=$((skip+4)); echo "  SKIP  not a git checkout — tracked/byte-identical-to-main cases NOT RUN (4 cases)"
else
  for f in .vibe/hooks.toml .vibe/config.toml; do
    git check-ignore -q "$f" && got=ignored || got=tracked
    record tracked "$got" "$f is not gitignored"
  done
  if ! git rev-parse --verify -q main >/dev/null 2>&1; then
    skip=$((skip+2)); echo "  SKIP  no 'main' branch — byte-identical-to-main cases NOT RUN (2 cases)"
  else
    for f in tools/guard_boundary.php .claude/settings.json; do
      want=$(git rev-parse "main:$f" 2>/dev/null); have=$(git hash-object "$f" 2>/dev/null)
      [ -n "$want" ] && [ "$want" = "$have" ] && got=identical || got=DIFFERS
      record identical "$got" "$f vs main ($have)"
    done
  fi
fi

echo
echo "PASS $pass  FAIL $fail  SKIP $skip"
[ "$fail" -eq 0 ]
