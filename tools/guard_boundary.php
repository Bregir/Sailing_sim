<?php
// ⛔⛔ THE BOUNDARY GUARD — PreToolUse, Bash + PowerShell. Installed by .claude/settings.json.
//
// Auto mode removes the permission prompt that would otherwise be the de facto mechanism enforcing two
// rules this repo states in prose:
//
//   1. commit on a branch; never push; never move `main` without Bregir's word
//   2. spec-2d-sandbox.md is the reviewer's brief — coders read it, never edit it
//
// A rule stated in AGENTS.md is not enforcement. That lesson was paid for in the repo this guard was
// ported from (BoBS), where a contract written in prose three times was violated a fourth, and a freeze
// became real only when a gate asserted it. So the boundary is asserted here, in code, on every shell call.
//
// ⚠ WRITTEN IN PHP ON PURPOSE: PHP is on this machine's toolchain and needs no jq. A guard that needs jq
// would silently no-op on a machine without it (a hook that cannot run is a hook that allows).
//
// Contract: stdin = the PreToolUse hook payload. If the command crosses a boundary, emit
// permissionDecision "ask" (a prompt auto mode cannot skip) with the reason. Otherwise print NOTHING
// and exit 0 — normal permission handling proceeds, so this file can only ever ADD a prompt.
//
// The measurements dated below were taken in BoBS, against the same harness and this same file's
// generic sections (§1, §2, §4), which are carried over unchanged.
//
// ⛔⛔ IT CANNOT ENFORCE ITS OWN EXECUTION, AND THE NAIVE INSTALL FAILS OPEN. MEASURED 2026-08-17:
//
//     hook command                        exit
//     php <this file>   (gated command)    0   + the ask JSON     ← the working case
//     php <missing file>                   1   "Could not open input file"
//     phpXX <this file> (php absent)     127   "command not found"
//
// Only exit code 2 is a BLOCKING hook error; 1 and 127 are non-blocking, so the command PROCEEDS and
// nothing says the boundary is gone. A deleted guard or a php missing from PATH would therefore disarm
// every gate here, silently. That is why .claude/settings.json wraps the call as
//
//     php "…/tools/guard_boundary.php" || { echo '…refusing…' >&2; exit 2; }
//
// ⚠ DO NOT REMOVE THE WRAPPER, and do not "simplify" it back to a bare call. It is the half of the
// mechanism that lives outside this file, and it was added because the question "does it fail closed?"
// was asked and measured rather than assumed.
//
// ⚠⚠ IF YOU EVER TEST WHETHER THIS HOOK FIRES, DO NOT DELETE THE LOG IN THE SAME COMMAND. That trap
// cost a false conclusion on 2026-08-17: the sentinel wrote to a temp file, and the probe command began
// `rm -f "$LOG"`. PreToolUse fires BEFORE the command, so the hook wrote its line and the probe's own
// first action deleted it — the instrument destroyed its own reading, and the empty log was reported as
// "the boundary is not live in this session". It was live the whole time. Measured after the fact:
// cwd=<repo root>, sys_get_temp_dir() writable=yes, same user — i.e. the sentinel COULD write; it was
// simply erased. ⛔ And note why the mistake survived one round of checking: from the model's side an
// APPROVED PROMPT AND NO PROMPT ARE INDISTINGUISHABLE, so a silent run proves nothing either way. The
// only sound test writes its evidence where the probe does not touch it, and is read in a separate
// call. What a live hook looks like: ONE log line per shell call, gated or not.
//
// ⭐ PRECEDENCE — MEASURED 2026-08-17, not assumed. The whole boundary rests on two claims, and both
// were open until an instrument could see a prompt. A temporary `PermissionRequest` hook logging to a
// file made "a prompt was requested" observable, and the design that makes its output mean something:
//
//   positive control   a §4 command (named this file) → LINE WRITTEN. Without this the instrument
//                      could be dead and its silence would read as "no prompt".
//   the probe          `Bash(git branch --merged:*)` placed in ask WHILE ALREADY IN allow, run BARE
//                      (the first attempt was piped through `head`, and a compound command can prompt
//                      for its unlisted second part — a confound, not a result) → LINE WRITTEN.
//                      ⇒ `ask` BEATS a matching `allow`.
//   negative control   `git status --short`, allow-listed and benign → NO LINE. So a line means
//                      "prompt", not "the hook ran".
//   mode discriminator `wc -l <a file>`, matching NO allow rule → NO LINE, i.e. the auto-mode
//                      classifier auto-allowed it. So auto mode was ACTIVE for all of the above,
//                      and the §4 prompt fired anyway ⇒ a hook's `ask` IS a prompt auto mode cannot
//                      skip. Both [assumed] claims are now [verified] by observation.
//
// ⚠ Re-run this design rather than re-deriving it if the rules or the harness change. And do not delete
// the log inside the probe — see the trap below.
//
// Test battery: tools/test_guard_boundary.sh — positive AND negative cases, because a guard that can
// only say "ask" is as useless as one that never does. ⚠ No case COUNT is written here on purpose: it
// would go stale the first time a case is added, which is the defect this repo spent today removing
// from CLAUDE.md. The battery reports its own total.

$raw = stream_get_contents(STDIN);
$in  = json_decode($raw, true);
if (!is_array($in)) { exit(0); }                       // unparseable payload: never block on our own bug

$tool = $in['tool_name'] ?? '';
if ($tool !== 'Bash' && $tool !== 'PowerShell') { exit(0); }
$cmd = (string)($in['tool_input']['command'] ?? '');
if ($cmd === '') { exit(0); }

function ask($reason) {
    echo json_encode([
        'hookSpecificOutput' => [
            'hookEventName'            => 'PreToolUse',
            'permissionDecision'       => 'ask',
            'permissionDecisionReason' => $reason,
        ],
    ]), "\n";
    exit(0);
}

// A git invocation ANYWHERE in the command line — not just at the start. `cd game && git push` and
// `git -C .. push` are the forms a prefix-matching permission rule cannot see, which is the whole
// reason this guard exists rather than a longer allow/ask list.
//
// ⚠ THE OPTION BLOCK IS PARSED, NOT SKIPPED, and the first version of this function got it wrong:
// `-[^\s]+\s+` swallows `-C` but not its separate argument, so `git -C .. push --force` matched
// NOTHING and the guard passed the single most dangerous command in the set. The test battery caught
// it. Global options that take an argument are therefore enumerated; everything else is a bare flag.
const GIT_OPT_WITH_ARG = '-c|-C|--git-dir|--work-tree|--namespace|--exec-path|--config-env';
function git_verb($cmd, $verb) {
    $opts = '(?:\s+(?:' . GIT_OPT_WITH_ARG . ')(?:=|\s+)\S+|\s+--?[A-Za-z][\w-]*)*';
    return (bool)preg_match('/(?:^|[\s;&|(`])git' . $opts . '\s+' . $verb . '(?![\w-])/i', $cmd);
}

// ── 1. THE GIT BOUNDARY ─────────────────────────────────────────────────────────────────────────
if (git_verb($cmd, 'push')) {
    ask('git push — ANY remote, ANY branch. Nothing leaves this machine without Bregir saying so. '
      . 'A push is the one git action no local undo reaches.');
}
foreach (['merge' => 'a merge', 'rebase' => 'a rebase', 'cherry-pick' => 'a cherry-pick',
          'revert' => 'a revert', 'am' => 'an `am`', 'reset' => 'a reset',
          'update-ref' => 'an update-ref', 'filter-branch' => 'a filter-branch'] as $verb => $what) {
    if (git_verb($cmd, preg_quote($verb, '/'))) {
        ask("git $verb — $what moves a branch ref. If the current branch is `main`, it moves `main`, "
          . 'which is Bregir\'s call and never a step taken in passing.');
    }
}
if (preg_match('/(?:^|[\s;&|(`])git(?:\s+(?:' . GIT_OPT_WITH_ARG . ')(?:=|\s+)\S+)*\s+branch\s+(?:-[^\s]*\s+)*(-f|-M|--force)/i', $cmd)) {
    ask('git branch -f/-M — this rewrites where a branch points, `main` included.');
}
// ⛔ THE UNTRACKED-FILE KILLER, and it names no file: anything untracked or gitignored — scratch output,
// local notes, a half-written report — is gone after `git clean -fdx`, with no commit to recover it from.
// ⚠ Both of these use git_verb() for the option-block reason above: written as a bare `git\s+clean`
// they missed `git -C .. clean -fdx`, which is the same defect the battery caught on `push`.
if (git_verb($cmd, 'clean')) {
    ask('git clean — DELETES untracked (and with -x, gitignored) files: scratch output, local notes, '
      . 'anything not yet committed. No commit or remote holds a copy. This is the unrecoverable one.');
}
if (git_verb($cmd, 'stash') && preg_match('/(-u\b|-a\b|--include-untracked|--all)/i', $cmd)) {
    ask('git stash -u/-a — sweeps untracked files into a stash. Recoverable, but not obviously.');
}

// ── 2. A COMMIT THAT WOULD MOVE `main` — branch-aware, which no permission rule can be ──────────
if (git_verb($cmd, 'commit') && !preg_match('/--dry-run\b/i', $cmd)) {
    // ⚠ `symbolic-ref`, NOT `rev-parse --abbrev-ref`: rev-parse FAILS on an unborn branch (a repo with
    // no commits yet), and the first version of this check read that failure as "not main" and went
    // silent — a guard that answers "no" when it means "I could not tell". symbolic-ref answers before
    // the first commit exists.
    $branch = @shell_exec('git symbolic-ref --quiet --short HEAD 2>&1');
    $branch = is_string($branch) ? trim($branch) : '';
    if ($branch === 'main' || $branch === 'master') {
        ask("git commit while HEAD is `$branch` — this MOVES $branch. Repo practice is to branch first. "
          . 'Approve only if committing straight onto the pilot branch is what Bregir asked for.');
    }
    if ($branch === '' || strpos($branch, 'fatal') !== false) {
        // FAIL CLOSED. Detached HEAD, or not a repo: unknown is not the same as safe.
        ask('git commit, and the guard could NOT determine the current branch (detached HEAD, or not a '
          . 'git repo). It therefore cannot rule out that this moves `main`. Unknown is not safe.');
    }
    // On any other named branch a commit is routine: fall through, no prompt.
    // ⚠ Declared residue: the branch is read in the SESSION's working directory. A command that cd's
    // into a different repo first is judged against this one.
}

// ── 3. THE SPEC IS THE REVIEWER'S BRIEF ─────────────────────────────────────────────────────────
// spec-2d-sandbox.md is written and owned by the reviewer. A coder that "fixes" the spec to match its
// build has moved the goalposts, and every later review measures against the moved ones.
// Reading, searching and diffing it stay quiet — the gate is on WRITES, not on inspection. The
// read-only prefix is §4's, plus the read-only git verbs (a reviewer's diff of the spec is inspection).
// ⚠ Declared residue, shared with §4: the command is judged by its FIRST verb, so `cat spec… && rm spec…`
// passes here. The Vibe adapter closes that for Vibe (no chaining after a read-only verb); for Claude
// Code the Write/Edit ask rules in .claude/settings.json cover the editor path.
if (preg_match('/spec-2d-sandbox\.md/i', $cmd)) {
    $readonly = '/^\s*(cat|head|tail|wc|ls|stat|file|md5sum|sha1sum|sha256sum|grep|rg|jq|diff|cmp|'
              . 'git\s+(diff|log|show|status|blame)|'
              . 'Get-Content|Get-Item|Get-FileHash|Select-String|Compare-Object)\b/i';
    if (!preg_match($readonly, $cmd)) {
        ask('this command names spec-2d-sandbox.md and is not read-only. The spec is the REVIEWER\'S brief; '
          . 'coders never edit it. If the spec looks wrong, say so in the STOP report and let the reviewer '
          . 'change it.');
    }
}

// ── 4. THE GUARD'S OWN INTEGRITY ────────────────────────────────────────────────────────────────
// ⛔ A boundary the agent can quietly edit is not a boundary. This file and the settings that install
// it are the enforcement; changing them is Bregir's act, not a step taken while doing something else.
if (preg_match('/(guard_boundary\.php|\.claude[\/\\\\]settings(\.local)?\.json)/i', $cmd)) {
    $readonly = '/^\s*(cat|head|tail|wc|ls|stat|file|md5sum|sha1sum|sha256sum|grep|rg|jq|diff|cmp|'
              . 'php\s+-l|Get-Content|Get-Item|Get-FileHash|Select-String|Compare-Object)\b/i';
    if (!preg_match($readonly, $cmd)) {
        ask('this command would modify the BOUNDARY ITSELF (the guard script, or the settings that '
          . 'install it). Reading it is free; changing it is the one edit that must never ride along '
          . 'inside other work.');
    }
}

exit(0);   // nothing matched: silent, and the normal permission flow decides
