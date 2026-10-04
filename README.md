# Sailing sim

A physics-first Age-of-Sail sailing game. Today: a top-down 2D sandbox in one browser page, where sheets,
sails, hull, keel and rudder are modelled closely enough that tacking, heaving to, irons and goose-winging
emerge from the physics rather than being scripted. Three rigs — gaff sloop, topsail cutter, topsail
schooner — share one data-driven ship definition.

Open `index.html` in a browser to sail. Keys follow spec §14: the left keyboard block is the deck seen from
above; the rudder is on the numpad.

## Tests

    node run-scenarios.mjs [--ship topsailCutter|topsailSchooner]
    node render-checks.mjs
    node round14-checks.mjs

Node only. The build brief is `spec-2d-sandbox.md`; the brief for coding agents is `AGENTS.md`.
