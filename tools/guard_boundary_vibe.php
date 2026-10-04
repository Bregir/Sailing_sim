<?php
// ⛔⛔ THE BOUNDARY GUARD, FOR MISTRAL VIBE — a pre_tool hook ADAPTER, installed by .vibe/hooks.toml.
//
// AN ADAPTER, NOT A FORK. The rules live in tools/guard_boundary.php (Claude Code's PreToolUse guard)
// and nowhere else. For a shell call this file translates Vibe's payload into the Claude-shaped one,
// pipes it to the UNMODIFIED guard, and maps the verdict. Change a rule there, never here.
//
// Contract (Vibe pre_tool, read from Vibe's source, vibe/core/hooks/*): stdin = JSON with tool_name,
// tool_call_id, tool_input (the validated arguments) + session fields (cwd, session_id, …).
// Verdict: exit 0 + empty stdout passes through; exit 0 + {"decision":"deny","reason":…} denies and the
// reason is shown to the model. There is no "ask". Anything else is a hook FAILURE, which Vibe turns
// into a deny only because the hook is declared `strict = true`.
//
// ⛔ THE GUARD'S "ask" BECOMES "deny" HERE, ON PURPOSE. For Vibe every boundary crossing is a step
// Bregir takes by hand — there is no prompt to approve, so there is nothing to ask.
//
// ⛔ FAIL CLOSED, TWICE. Inside this file: a payload it cannot read, a tool it does not know, a guard
// that is missing, exits non-zero or prints something unparseable → DENY. Outside it: `strict = true`
// turns this file failing to run at all (php missing → exit 127 / 9009, file missing → exit 1, a
// timeout, garbage on stdout) into a deny. Neither half is enough alone. Do not drop `strict`.
//
// ⚠ DENY-BY-DEFAULT FOR UNKNOWN TOOLS. The hook matches "*" so it sees every tool call, MCP and custom
// tools included. A tool name not in the tables below is refused until someone reads what it does and
// files it. A new Vibe release that adds a writer therefore fails LOUDLY, not silently.
//
// ⚠ WHAT THIS FILE ADDS that the shared guard does not have: Vibe's own install (.vibe/ and this
// adapter) must be as untouchable as .claude/settings.json and guard_boundary.php are for Claude Code,
// and the shared guard cannot know about it. That is the one shell check below, and it is stricter
// than the guard's read-only exemption (no command chaining after the read-only verb). It covers
// spec-2d-sandbox.md too, so the shared guard's declared chaining residue is closed for Vibe.
//
// Test battery: tools/test_guard_boundary_vibe.sh. Live check inside Vibe: tools/vibe_live_check.sh.
// No case count is written here on purpose — the battery reports its own total.

// Two spellings of every tool, because Vibe ships two runtimes and a server-side rollout (GrowthBook) can
// move a machine from one to the other: the legacy Python loop sends the leaf name (`bash`), the Unified
// Harness sends the qualified one (`file_system.bash`). Both are tabled; neither is assumed.
const SHELL_TOOLS = ['bash' => 'Bash', 'git_bash' => 'Bash', 'powershell' => 'PowerShell',
                     'file_system.bash' => 'Bash', 'process.start' => 'Bash'];
// Text typed into a running process IS a command.
const STDIN_TOOLS = ['bash_stdin' => 'Bash', 'git_bash_stdin' => 'Bash', 'powershell_stdin' => 'PowerShell',
                     'process.write' => 'Bash'];
const WRITE_TOOLS = ['write_file', 'edit', 'file_system.write_file', 'file_system.search_replace'];
// Read-only, or confined by Vibe itself to its own home (the *_log_file tools may only write under
// ~/.vibe/shell-tool — vibe/core/tools/builtins/experimental_bash.py write_log_file()). `task` and the
// subagent.* tools start agents whose own tool calls pass through this same hook.
const PASS_TOOLS  = ['read_file', 'grep', 'todo', 'skill', 'task', 'ask_user_question', 'exit_plan_mode',
                     'web_fetch', 'web_search',
                     'bash_output', 'bash_sessions', 'bash_log_file',
                     'git_bash_output', 'git_bash_sessions', 'git_bash_log_file',
                     'powershell_output', 'powershell_sessions', 'powershell_log_file',
                     'file_system.read_file', 'skill.read', 'self.sleep',
                     'process.output', 'process.list', 'process.stop',
                     'subagent.list', 'subagent.spawn', 'subagent.wait', 'subagent.send_message',
                     'subagent.interrupt', 'subagent.stop'];

function deny(string $reason): void {
    echo json_encode(['decision' => 'deny', 'reason' => 'BOUNDARY (Vibe): ' . $reason]), "\n";
    exit(0);
}

// Any un-silenced warning becomes an exception, and every exception becomes a DENY (bottom of file).
set_error_handler(function ($no, $str, $file, $line) {
    if (!(error_reporting() & $no)) { return false; }               // an @-silenced probe: not an error
    throw new ErrorException($str, 0, $no, $file, $line);
});

// ── path normalisation — this runs on Windows ─────────────────────────────────────────────────────
// Separators, case, `.`/`..`, NTFS alternate streams (`x.md:s`, `x.md::$DATA`) and the trailing dots/spaces
// Windows silently strips (`spec-2d-sandbox.md.` IS spec-2d-sandbox.md) are all folded before any match.
function norm_path(string $p, string $cwd): string {
    $p = str_replace('\\', '/', $p);
    if ($p === '~' || strncmp($p, '~/', 2) === 0) {
        $home = getenv('HOME') ?: getenv('USERPROFILE') ?: '';
        if ($home !== '') { $p = str_replace('\\', '/', $home) . substr($p, 1); }
    }
    $abs = ($p !== '' && $p[0] === '/') || preg_match('#^[A-Za-z]:/#', $p);
    if (!$abs) { $p = rtrim(str_replace('\\', '/', $cwd), '/') . '/' . $p; }
    $out = [];
    foreach (explode('/', $p) as $i => $seg) {
        if (!($i === 0 && preg_match('/^[A-Za-z]:$/', $seg))) {
            $c = strpos($seg, ':');
            if ($c !== false) { $seg = substr($seg, 0, $c); }
            if ($seg !== '.' && $seg !== '..') { $seg = rtrim($seg, ' .'); }
        }
        if ($seg === '' || $seg === '.') { if ($i === 0) { $out[] = ''; } continue; }
        if ($seg === '..') { if (count($out) > 1) { array_pop($out); } continue; }
        $out[] = $seg;
    }
    return strtolower(implode('/', $out));
}

// What a WRITE may never target. Matched on the path's tail, so it holds wherever the clone lives.
const PROTECTED_PATHS = [
    '#(^|/)tools/guard_boundary[^/]*\.php$#'  => 'the boundary guard itself',
    '#(^|/)\.claude/settings[^/]*\.json$#'    => '.claude/settings*.json — what installs the guard for Claude Code',
    '#(^|/)\.vibe(/|$)#'                      => '.vibe/ — what installs this guard for Vibe',
    // Top-level only by intent; matched on the tail like the rest (a nested copy is not a thing here).
    '#(^|/)spec-2d-sandbox\.md$#'             => 'spec-2d-sandbox.md — the reviewer\'s brief; coders never edit it',
];

function check_write_path(string $raw, string $cwd): void {
    $cands = [norm_path($raw, $cwd)];
    // Symlinked DIRECTORIES: resolve the parent for real. (A symlinked final component is the loop below.)
    $lex = str_replace('\\', '/', $raw);
    $full = (($lex !== '' && ($lex[0] === '/' || preg_match('#^[A-Za-z]:/#', $lex))) ? $lex : rtrim($cwd, '/\\') . '/' . $lex);
    if (($rd = @realpath(dirname($full))) !== false) { $cands[] = norm_path($rd . '/' . basename($full), $cwd); }
    // A symlinked FILE, dangling ones included (a write through a dangling link creates its target).
    for ($i = 0, $l = $full; $i < 8 && @is_link($l); $i++) {
        $t = (string)@readlink($l);
        $t = str_replace('\\', '/', $t);
        $l = ($t !== '' && ($t[0] === '/' || preg_match('#^[A-Za-z]:/#', $t))) ? $t : dirname($l) . '/' . $t;
        $cands[] = norm_path($l, $cwd);
    }
    foreach ($cands as $n) {
        foreach (PROTECTED_PATHS as $rx => $what) {
            if (preg_match($rx, $n)) { deny("a write to $what. Path: $raw. This is Bregir's step to take by hand."); }
        }
        // ⚠ Windows 8.3 short names (SPEC-2~1.MD, GUARD_~1.PHP, VIBE~1) cannot be matched by name; refuse
        // them where a protected name could hide.
        $segs = explode('/', $n);
        $tail = array_slice($segs, -2);
        foreach ($tail as $s) { if (preg_match('/~\d/', $s)) { deny("a write through an 8.3 short name ($raw) — the target cannot be verified."); } }
        foreach ($segs as $s) { if (preg_match('/^vibe~\d/', $s)) { deny("a write through an 8.3 short name ($raw) that may be .vibe/."); } }
    }
}

// ── the shared guard, unmodified ──────────────────────────────────────────────────────────────────
function run_guard(string $claudeTool, string $command, string $cwd): void {
    $guard = __DIR__ . '/guard_boundary.php';
    if (!is_file($guard)) { deny('tools/guard_boundary.php is MISSING — refusing every shell call until it is restored.'); }
    $payload = json_encode(['tool_name' => $claudeTool, 'tool_input' => ['command' => $command]]);
    $proc = proc_open([PHP_BINARY, $guard], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                      $pipes, is_dir($cwd) ? $cwd : null);
    if (!is_resource($proc)) { deny('the boundary guard could not be started — refusing.'); }
    fwrite($pipes[0], $payload); fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $err = stream_get_contents($pipes[2]); fclose($pipes[2]);
    $code = proc_close($proc);
    if ($code !== 0) { deny("the boundary guard FAILED (exit $code): " . trim((string)$err) . ' — refusing; fix the guard, do not work around it.'); }
    $out = trim((string)$out);
    if ($out === '') { return; }                                   // guard silent: no boundary crossed
    $v = json_decode($out, true);
    $dec = $v['hookSpecificOutput']['permissionDecision'] ?? null;
    $why = $v['hookSpecificOutput']['permissionDecisionReason'] ?? null;
    if (($dec === 'ask' || $dec === 'deny') && is_string($why)) { deny($why); }
    deny('the boundary guard printed output the adapter cannot read — refusing: ' . substr($out, 0, 200));
}

// Vibe's own install and the reviewer's spec, in a shell command. Read-only verbs pass only as a SINGLE
// command.
function check_vibe_install(string $command): void {
    if (!preg_match('/(guard_boundary[\w.-]*\.php|(?<![\w-])\.vibe\b|spec-2d-sandbox\.md)/i', $command)) { return; }
    $readonly = '/^\s*(cat|head|tail|wc|ls|stat|file|md5sum|sha1sum|sha256sum|grep|rg|diff|cmp|php\s+-l|'
              . 'git\s+(diff|log|show|status|blame)|Get-Content|Get-Item|Get-FileHash|Select-String|Compare-Object)\b/i';
    $chained  = '/[;&|`<>\r\n]|\$\(/';
    if (preg_match($readonly, $command) && !preg_match($chained, $command)) { return; }
    deny('this command touches the boundary\'s own install (.vibe/ or a guard_boundary*.php file) or the '
       . 'reviewer\'s spec-2d-sandbox.md. Reading it is free (as a single command); changing it is never a '
       . 'step inside a coder\'s work.');
}

try {
    $in = json_decode((string)stream_get_contents(STDIN), true);
    if (!is_array($in) || !isset($in['tool_name']) || !is_string($in['tool_name'])) {
        deny('unreadable hook payload — refusing rather than guessing.');
    }
    $tool  = strtolower($in['tool_name']);
    $input = $in['tool_input'] ?? null;
    if (!is_array($input)) { deny("tool '$tool' arrived without readable arguments."); }
    $cwd = (isset($in['cwd']) && is_string($in['cwd']) && $in['cwd'] !== '') ? $in['cwd'] : (string)getcwd();

    if (isset(SHELL_TOOLS[$tool])) {
        $cmd = $input['command'] ?? null;
        if (!is_string($cmd)) { deny("shell tool '$tool' without a command string."); }
        // git_bash / powershell take their own cwd; judge the branch where the command will run.
        $runCwd = $cwd;
        if (isset($input['cwd']) && is_string($input['cwd']) && $input['cwd'] !== '') {
            $c = str_replace('\\', '/', $input['cwd']);
            $runCwd = ($c[0] === '/' || preg_match('#^[A-Za-z]:/#', $c)) ? $c : rtrim($cwd, '/\\') . '/' . $c;
        }
        check_vibe_install($cmd);
        run_guard(SHELL_TOOLS[$tool], $cmd, $runCwd);
        exit(0);
    }
    if (isset(STDIN_TOOLS[$tool])) {
        // Text typed into a running shell IS a command. Judge it exactly like one.
        $text = '';
        if (isset($input['text']) && is_string($input['text'])) { $text .= $input['text']; }
        $b64 = $input['bytes_base64'] ?? $input['bytesBase64'] ?? null;
        if (is_string($b64)) {
            $b = base64_decode($b64, true);
            if ($b === false) { deny("'$tool' with undecodable bytes_base64."); }
            $text .= "\n" . $b;
        }
        if (trim($text) !== '') { check_vibe_install($text); run_guard(STDIN_TOOLS[$tool], $text, $cwd); }
        exit(0);
    }
    if (in_array($tool, WRITE_TOOLS, true)) {
        // Both argument spellings are checked whenever present (`file_path` legacy + edit, `path` for the
        // Unified Harness write_file), so a payload carrying both cannot slip one past.
        $paths = array_values(array_filter([$input['file_path'] ?? null, $input['path'] ?? null], 'is_string'));
        if (!$paths || trim(implode('', $paths)) === '') { deny("'$tool' without a target path."); }
        foreach ($paths as $p) { check_write_path($p, $cwd); }
        exit(0);
    }
    if (in_array($tool, PASS_TOOLS, true)) { exit(0); }
    deny("tool '$tool' is UNKNOWN to the boundary adapter, so it is refused by default. If it can neither "
       . 'write a file nor run a command, Bregir adds it to PASS_TOOLS in tools/guard_boundary_vibe.php.');
} catch (Throwable $e) {
    deny('the adapter itself failed (' . get_class($e) . ': ' . $e->getMessage() . ') — refusing.');
}
