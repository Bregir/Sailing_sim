# Dispatch — Round 20: camber of an unloaded sail, two acceptance fixes, an investigation

- **Coder:** `claude-opusplan`
- **Branch:** `round-20` (this file is its first commit, together with the spec's Round 20 section)
- **Do not:** push · merge · touch `main` · edit `spec-2d-sandbox.md` or the boundary files (`tools/guard_boundary*.php`, `.claude/settings*.json`, `.vibe/`) · change `index.html` in step 3
- **STOP:** commit on `round-20`, report the hash. Run block per `AGENTS.md` §8.

## Why / Build

Build `spec-2d-sandbox.md` §16 **"Round 20"** — the spec is the brief; read §5 and §16 Round 19 first, and `report-round19.md` §5–§6 for every number the round cites. Three steps, in order, not merged: (1) the camber rule for an unloaded sail, (2) three acceptance rows rewritten, (3) an investigation with no model change. md5s of all three ships before step 1 and after every step (`round14-checks.mjs` prints them). Nothing tuned; fails reported as fails. Keep any new diagnostics in `round20-checks.mjs`. Full report in `report-round20.md`.

## Checks
- `node run-scenarios.mjs` → sloop set: (d) completes < 20 s and (e) shows a threshold between 0.25 and 1.5 kn; every row printed with PASS/FAIL
- `node run-scenarios.mjs --ship topsailCutter` → m, n, o, p PASS
- `node run-scenarios.mjs --ship topsailSchooner` → q–v PASS, (u) all four tests
- `node render-checks.mjs` → all green, prints its total
- `node render-smoke.mjs` → clean
- `node round14-checks.mjs` → reload identity holds for all three ships; prints the three md5s
- `node round20-checks.mjs` → camber traces (one flip per headsail per tack), goose-wing hold rows at 175/170/165, collapse angles at TWS 4/6/8
- `git diff --quiet main..HEAD -- tools .claude .vibe && echo BOUNDARY-UNTOUCHED` → BOUNDARY-UNTOUCHED
