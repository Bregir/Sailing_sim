# Round 20 — report

Coder: `claude-opusplan`, built in one session (`--model opusplan`; the executing model reported itself as `claude-sonnet-5-5`).
Branch `round-20`. Built from `spec-2d-sandbox.md` §16 "Round 20" and `dispatch-round20.md`.

**Short version.**

| | Result |
|---|---|
| Step 1 — camber of an unloaded sail | Built as specified. It **does not fix the tack**: (d) improves, **(e) still fails**, and the camber side changes **24 and 26 times** per tack, not once. |
| Step 2 — rows | All pass: (a), (b) within 0.01% of round 19 final; goose-wing holds at 175 / 170 / 165; (i) crosses gently. |
| Step 3 — investigation | `index.html` untouched. The reviewer's clew-lift lead is **not supported** by the model's own hinge geometry: the lift pushes the clew *out*, not in. A cap on the clew angle shows what would work (≈ 55°). |

## 1 · md5s, before and after each step

| Point | Sloop | Cutter | Schooner |
|---|---|---|---|
| Before step 1 (round 19 final) | `9a9ab2d921324a974d5f28df7deb0b6d` | `e9f8fcaa876abf1188cc2453a28d2f43` | `83df12eb4f20848e8c1e6a8f29fb3c9a` |
| After step 1 | `246d8fe059bfb41ebef0961a7ec01c57` | `fbcc5ac4ae5ae3085ab6d20a54dd9914` | `e1cec83ab3b271977f28cef9b085e8f4` |
| After step 2 | unchanged | unchanged | unchanged |
| After step 3 | unchanged | unchanged | unchanged |

- Step 1 moved all three md5s, on purpose.
- Steps 2 and 3 changed no line of `index.html`; their rows and diagnostics live in `round20-checks.mjs`.
- The final `node round14-checks.mjs` run prints the after-step-1 values, and the reload identity holds for all three ships.

## 2 · Step 1 — an unloaded sail has no camber of its own

### What was built (`index.html`, `SIM.computeSailForces`)

- A sail whose effective angle `alphaE = s·i + i0` is below `luffThreshold` (4°) is unloaded. Its camber side becomes `s = sign(i)`, unless `|i| < camberDeadBand`, in which case `s` holds.
- A sail at or above the threshold keeps its side. First use still starts at `s = sign(i)`.
- `iFlip` is retired. It is gone from the config, its tuning tooltip and the tuning panel's scalar list.
- **No row or check read `iFlip`.** A search of `run-scenarios.mjs`, `render-checks.mjs` and every `round*-checks.mjs` finds nothing.
- New constant `camberDeadBand = 1°`. `[assumed]`, the spec's value, derived from nothing — it only has to be above the noise at `i ≈ 0`. It is in the tuning panel.

### The camber trace — FAIL

The (e) tack from 2 kn and from 0.75 kn, exactly as `runTackAttempt` runs it. `node round20-checks.mjs --trace` prints the full trace.

| Start | Jib camber changes | Staysail camber changes | How it ends |
|---|---|---|---|
| 2 kn | **24** (expect 1) | **24** (expect 1) | heading 96.5° off the wind, u 0.75 m/s, tack not completed |
| 0.75 kn | **26** (expect 1) | **26** (expect 1) | heading 101.6° off the wind, u 0.72 m/s, tack not completed |

What the 2 kn trace shows:

- **Before head to wind** the jib's incidence `i` falls from 18° to −1° as the bow comes up (t = 0–5 s), and the camber is still the old tack's.
- **From t = 6 to 15 s the camber flips every second or two.** `i` swings between about −4° and +2° and `alphaE` sits between 4.1 and 9.9.
- **At t = 8 s** the jib shows `i = −3.9°`, `s = +1`, `alphaE = 4.1°`, just above the 4° threshold. At t = 12 s it shows `i = −3.1°`, `alphaE = 4.9°`.
- **The knife edge has moved, not gone.** Round 19 had a free headsail parking at `s·i ≈ −7.5` against a flip threshold of −8. Now it parks at `s·i ≈ −3 … −4` against a threshold of −4.
- **The boat is not through the wind.** The heading crosses head to wind at t ≈ 10 s, goes back to −6° at t = 16 s, and the boat falls onto the old tack, bearing away to −103°. The jib's side force is mostly on the old side (−60 … −370 N), and the sails' yaw moment is −400 … −1700 N·m from t = 15 s on.
- **The jib and the staysail trace identically**, because they hang the same way.

The `iFlip = 6` failure case no longer exists to run, since `iFlip` is gone. The flip-flop it showed under round 19's rule is present under the new rule in the traces above.

### What the rule did do

| Row | Round 19 final | Step 1 | |
|---|---|---|---|
| (d) switched | 19.01 s, exit 3.02 kn | **14.23 s, exit 3.24 kn** | PASS (limit 20 s) — margin 5.8 s |
| (d) unswitched | 10.82 s, aback 0.752 | 10.14 s, aback 0.463 | PASS |
| (e) | no tested speed completes | **no tested speed completes** (heading ends 96–103° off the wind) | **FAIL** |
| (k) | 7.64 s, 3.574 kn | 7.62 s, 3.581 kn | PASS |
| (l) v1 / v2 / v3 | −3.56 / 1.52 / −7.92 °/s | −3.51 / 1.57 / −7.92 °/s | PASS |

Other rows that moved:

| Ship | Row | Round 19 final | Step 1 | |
|---|---|---|---|---|
| Cutter | peak vs settled heel, snapped sheets | 0.0% | 10.4% | FAIL both times (round 13's measurement issue) |
| Cutter | backed topsail: time to fall below 1.5 kn | 7.98 s | 7.41 s | PASS |
| Schooner | (r) pointing worsens by | 5.5° | 3.5° | PASS (band 3–8°) |
| Schooner | (r) SOG, topsail set vs furled | −0.1% | −4.7% | PASS ("no better with it set") |
| Schooner | (s) boat-lengths through the wind | 2.63 | 2.65 | PASS |
| Schooner | (s) exit SOG as a fraction of entry | 0.708 | 0.695 | PASS |
| Schooner | (u) closest approach / lies within | 61.2–93.7° | 62.1–93.5° | PASS |
| Schooner | (u) heel ratio | 0.977 | 0.996 | PASS (≤ 1.05) |
| Schooner | (u) drift | 1.164 kn | 1.183 kn | PASS |

Every other printed row is byte-identical to round 19. The schooner rows that print FAIL, and the three ships' "peak vs settled heel" line, print the same under round 19 and under this round.

### Not built, for you to decide

The rule as the spec words it does not fix the tack, and the trace says why: the free headsail's own incidence oscillates ±2–5° through head to wind, and any pure function of the instantaneous `alphaE` flips with it. Nothing was tuned to hide that. Untested options:

- Give an unloaded sail's camber a lag (cloth takes a moment to flip), so one flip needs the wind to stay on the other side for a time.
- Hold the camber side until the incidence has been past a bigger angle than the threshold.

Both add a constant that the round does not derive.

## 3 · Step 2 — rows (no physics)

`node round20-checks.mjs --beat --goose --sheets --i`, run on the step-1 build.

### Beat untouched, against round 19 final — PASS

| Row | Round 19 final | Now | Change |
|---|---|---|---|
| (a) SOG | 4.049 kn | 4.049 kn | −0.01% |
| (a) drive | 827.3 N | 827.3 N | 0.00% |
| (b) SOG | 2.160 kn | 2.160 kn | +0.01% |
| (b) drive | 354.3 N | 354.3 N | −0.01% |

### Goose-wing holds — PASS at all three

Set at TWA 180 by the round-18 procedure, then headed up at 0.25°/s and held 60 s at each angle. Last 40 s of each hold:

| TWA | Clew | Drive | Kept | Aback | SOG | |
|---|---|---|---|---|---|---|
| 175 | 70.0° | 115 N | 1.000 | 0% | 3.975 kn | holds |
| 170 | 70.0° | 114 N | 1.000 | 0% | 3.978 kn | holds |
| 165 | 70.0° | 112 N | 1.000 | 0% | 3.975 kn | holds |

### Goose-wing set from the main's side by the sheets alone — measurement, no criterion

| TWA | Last 40 s clew | Drive | |
|---|---|---|---|
| 170 | −52.0° | 61 N | falls back to the main's side |
| 165 | −52.0° | 67 N | falls back to the main's side |

### (i) crosses gently — PASS

Peak heel after the cross: sheeted 1.86° against eased 4.80°. The round-19 agent's criterion is confirmed.

### Goose-wing collapses — report only

Heading up from 180 at 0.25°/s. These numbers are identical to round 19, so step 1 did not move them.

| TWS | Jib comes across at | Band 150–165 |
|---|---|---|
| 4 m/s | **155.5°** (AWA 143.9) | PASS |
| 6 m/s | 142.0° (AWA 125.1) | outside — known, until round 21 |
| 8 m/s | 137.3° (AWA 119.8) | outside — known, until round 21 |

Heavier wind still holds it longer (155.5 → 142.0 → 137.3), so the ordering row passes.

## 4 · Acceptance, round 20

| Row | Expected | Measured | |
|---|---|---|---|
| (d) | < 20 s, exit > 2 kn | 14.23 s, 3.24 kn; margin 5.8 s | **PASS** |
| (e) | a threshold between 0.25 and 1.5 kn | no tested speed completes | **FAIL** |
| Camber trace | one flip per headsail per tack | 24 / 26 per headsail | **FAIL** |
| Beat untouched | (a), (b) within ±2% of round 19 final | all four within 0.01% | **PASS** |
| Goose-wing holds | holds at 175, 170, 165 | holds at all three | **PASS** |
| Goose-wing collapses | report TWS 4 / 6 / 8 | 155.5 / 142.0 / 137.3 | TWS 4 stays in its band |
| Schooner (u) | still passes all four | 62.1–93.5°, heel ratio 0.996, drift 1.183 kn, aback 100% | **PASS** |
| Everything else | re-run and report | see §2 | other rows pass |

Scenario scripts: `node run-scenarios.mjs` for the sloop exits 1 (the (e) FAIL and the round-13 heel line, which has printed FAIL since round 13); cutter m, n, o, p and schooner q–v PASS. `node render-checks.mjs` and `node render-smoke.mjs` are clean.

## 5 · Step 3 — why an unpoled goose-winged jib collapses earlier in a breeze

No change to `index.html`. Everything below is `round20-checks.mjs` (`--geometry --lift --sweep --rows --cloth`).

### The jib, from the ship definition

- Derived luff line: tack at x 6.73 m forward of the CLR, 0.8 m above the waterline; head at the mast, x 1.00 m, 8.90 m up. Luff 9.92 m.
- **The stay is raked 35.3° aft of vertical**, steeper than the reviewer's lead assumed.
- The clew is 2.02 m from the luff (perpendicular, 2A/luff). The sail and its sheets weigh 4.18 kg, which is 41 N.

### How far out the clew must stand — the sensitivity

The jib's clew angle is held at a cap from outside the physics, for the whole run. "70" is the shipped model.

| Cap | TWS 4 | TWS 6 | TWS 8 | Spread 4 → 8 |
|---|---|---|---|---|
| 70° (shipped) | 155.5 | 142.0 | 137.3 | 18.2° |
| 66° | 158.3 | 145.3 | 140.8 | 17.5° |
| 60° | 162.0 | 149.9 | 145.7 | 16.3° |
| **55°** | **164.6** | **153.4** | **149.5** | 15.1° |
| 50° | 166.8 | 156.7 | 153.1 | 13.7° |
| 45° | 168.7 | 159.7 | 156.4 | 12.3° |
| 40° | 170.4 | 162.5 | 159.5 | 10.9° |

- To get TWS 6 into 150–165 the clew must stand at about 60° or less. To get TWS 8 in, about 50° or less.
- **No cap puts all three in the band.** At 55° TWS 8 is 0.5° short; at 50° TWS 4 is 1.8° over.
- The remaining spread is the weight half of the balance: weight is constant, pressure grows with TWS². Lighter cloth narrows it, with the clew capped at 55°:

| Cloth | TWS 4 | TWS 6 | TWS 8 | Spread |
|---|---|---|---|---|
| 0.40 kg/m² (shipped) | 164.6 | 153.4 | 149.5 | 15.1° |
| 0.30 kg/m² | 159.8 | 151.6 | 148.5 | 11.2° |
| 0.20 kg/m² | 155.4 | 149.9 | 147.6 | 7.8° |

### What a cap does to the rows

| Cap | Holds at 175 / 170 / 165 (TWS 6) | (c) run at 180 | Ratio to the beam reach (≥ 0.70) |
|---|---|---|---|
| 70°, 66°, 60°, 55°, 50°, 45° | yes / yes / yes (115 / 114 / 112 N) | 3.964 kn | 0.709 PASS |

Nothing in these rows changes with the cap. A stalled jib on a run makes a drag along the flow, whatever its chord angle (round 19 §5). The goose-wing holds and the (c) run are therefore not at risk from a clew-angle limit; only the collapse heading is.

### Candidate 1 — the clew lift (the reviewer's lead): NOT SUPPORTED

The 2D force model has no vertical force. In the hinge geometry the model already uses, a sail swung out by δ about a stay raked θ has a plane normal with a vertical share `sin θ · sin δ`. A pressure force along that normal lifts the sail:

| Clew δ | Vertical share of the normal | F_z / F_h | Moment on δ with F_z, against 2D |
|---|---|---|---|
| 70° | 0.543 | 0.65 | +42% outward |
| 60° | 0.500 | 0.58 | +33% outward |
| 55° | 0.473 | 0.54 | +29% outward |
| 45° | 0.409 | 0.45 | +20% outward |

- **The lift is real.** At TWA 175 the jib's drive is 115 N; if the force is normal to the plane, that is about 81 N *up* against 41 N of weight. The clew rises from 0.8 m (at 0°) to 1.57 m (at 70°).
- **But the lift pushes the clew along its arc outward and upward.** The tangential moment that moves δ is 42% larger at 70° than the 2D model counts. A clew held out by its sheet stays at the sheet's limit; with lift it would want to go further. So this mechanism cannot stand the clew at 45–55° by itself.
- What does limit the clew is the sheet's length. The 2D model's sheet limit is `ease × deltaLim`, which is 72° at the procedure's ease of 0.8. A real sheet length in metres is not declared anywhere; no fairlead position exists in the ship definition (the "bowsprit" station is a keyboard row). An angle derived from it would be built from invented numbers.

### Candidate 2 — the plane of a raked sail has less incidence in plan view

The round 19 model measures incidence between the wind and the chord *as drawn in plan*. A sail on a stay raked 35° has a tilted plane, and the horizontal wind meets it at a smaller effective angle: `tan δ_eff = cos θ · tan δ`.

| Clew δ | Effective plan angle |
|---|---|
| 90° | 90.0° |
| 70° | **66.0°** |
| 60° | 54.7° |
| 55° | 49.4° |
| 50° | 44.2° |

- It is geometry only, with no new constant, and needs no wind speed.
- At the shipped 70° it is the same as a cap of 66°, which moves the collapse by only 3–4° (158.3 / 145.3 / 140.8).
- It predicts the right direction and under half the size needed (TWS 6 needs about 8° more to reach 150°; this gives 3.3°).
- Its effect on the rows is nil, as above.

### Candidate 3 — the sheet limit itself: the clew angle the crew sets

The procedure eases the weather sheet to 0.8, which allows 72° of clew. A crew without a pole does not necessarily give out that much sheet. A sheet eased to 0.6 limits the clew to 54°, which is the cap that fixes TWS 6 and nearly fixes TWS 8. This needs no model change in round 21, only a decision about what the "goose-wing holds" procedure and the collapse row should ease to. It is a row question for you.

### Recommendation

1. Build candidate 2 in round 21 first: effective plan incidence for a raked headsail, computed from the stay rake the model already holds. It needs no new constant. Expect the collapse to move 3–4°.
2. Do not build the clew lift as the mechanism; the geometry says it does the opposite.
3. Decide whether the collapse row's ease should be 0.8 or about 0.6 (candidate 3). That alone moves TWS 6 to 156.7° at a cap of 50° and 153.4° at 55°, inside the band; TWS 8 needs about 50° (153.1°).
4. The TWS ordering ("heavier wind holds it longer") is weight against pressure. To make it wind-independent, as the lead assumed, the weight half has to shrink: a 0.20 kg/m² cloth narrows the spread from 15° to 8°. That is a materials question, `[assumed]` like all the others.

## 6 · What the new camber rule did that the brief did not predict

1. The knife edge moved from −8° to −4° instead of going away (§2).
2. (d) improved by 4.8 s; the brief predicted only that (d) and (e) would be restored.
3. The schooner's pointing row (r) moved 2° (5.5° → 3.5°) and her topsail-set best SOG fell 4.7%, with the best VMG angle going from 52.5° to 56.5°. Nothing in the brief predicted the schooner would feel a headsail camber rule; I have not traced why.
4. The cutter's backed-topsail test fell to 1.5 kn half a second sooner.

## 7 · Constants

| Constant | Value | Derivation |
|---|---|---|
| `camberDeadBand` | 1° | `[assumed]`, the spec's figure. Stops chatter at `i ≈ 0`. Not fitted. |
| `iFlip` | removed | retired by the spec. |

Diagnostic-only numbers (printed, never shipped): a third of the cloth carried by the clew `[assumed]`; the caps and cloth weights in §5 are probes, not proposals.

## Files

| File | What it is |
|---|---|
| `index.html` | Step 1 only: the camber rule in `SIM.computeSailForces`; `iFlip` replaced by `camberDeadBand`. |
| `round20-checks.mjs` | New, kept. `--trace`, `--beat`, `--goose`, `--sheets`, `--collapse`, `--i`, `--geometry`, `--sweep`, `--rows`, `--lift`, `--cloth`. Changes no config value the harness uses. |
| `report-round20.md` | This file. |
