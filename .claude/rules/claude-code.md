# Claude Code only

The project brief is `AGENTS.md`, shared by every coding agent — Claude Code loads it natively because
the repo has no `CLAUDE.md`. ⚠ Do not add a `CLAUDE.md` or `.claude/CLAUDE.md`: either one makes Claude
Code read it *instead of* `AGENTS.md`. Claude-Code-specific notes go in this folder.

- The boundary (`AGENTS.md` §6) is enforced for Claude Code by `.claude/settings.json`: a PreToolUse hook
  runs `tools/guard_boundary.php`, wrapped so it fails closed. Read the guard's header before touching
  either file, and never change them inside other work.
- `--model opusplan` is the `claude-opusplan` coder in `AGENTS.md` §7's routing table.
- The `run-dispatch` skill lives in `.claude/skills/` and loads on "work the dispatch on branch X".
