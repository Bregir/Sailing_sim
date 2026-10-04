---
title: Round 19 — report
type: report
tags:
  - sejlsim
  - report
updated: 2026-10-03
---

# Round 19 — report

Built 2026-10-03 against `spec-2d-sandbox.md` §16 "Round 19", in the brief's order: step 1 (sheet interval), step 2 (shadows scale), step 3 (moment balance). Then one extra, rows-only step: the harness rows (c) and (i) were rewritten to the round-19 acceptance table. No physics changed in that step.

**Short version.**
- **Step 1** works as specified. The goose-wing now holds at TWA 180, 175, 170 and 167. It still falls back at 165, where the tipping point is past the fairlead.
- **Step 2** works as specified. The sloop's jib keeps 0.372 dead downwind (brief's estimate: about 0.37).
- **Step 3** works, and does three things the brief did not predict:
  1. Weight moves the jib's tipping point about 10° outboard, so the goose-wing procedure now fails at TWA 170 and 167 as well as 165.
  2. The jib comes across between TWA 137 and 156, depending on wind.
  3. The sloop's tack breaks: (e) completes at no speed, and (d) takes 19.0 s against a 20 s limit. The cause is a knife edge in the camber model, explained in §6.
- **Good news from step 3:** schooner row (u) now passes all four of its tests.

Nothing was tuned. Every fail below is reported as a fail, with its diagnostic.

---

## 1 · md5s, before and after each step

Same method as round 18: md5 of `run-scenarios.mjs` output per ship, with the two self-describing lines stripped. `round14-checks.mjs` printed the same md5s after every step.

| Step | Sloop | Cutter | Schooner |
|---|---|---|---|
| Before (round 18 final) | `cc9ec0ab1cf9ec3f41aba56ed52cfdd5` | `7a4b7497c8dbc1132145f37f154bd51a` | `3514d4369ddfbc0d1be8e2d045938494` |
| After step 1 (sheet interval) | `e3f6baade443fbf8b2d580d79721b5b2` | `452f49c777d58282cc1185dcaedcd3eb` | `ef6502a42bd33fa56fd55ad9438a9016` |
| After step 2 (shadow scales) | `8efa3dd0afbf59df58017e5f6e427f08` | `879c1161e482888ca4a05e66e38a9eb3` | `0e12f09a235dfdb7ed78764e668d7ea7` |
| After step 3 (moment balance) | `b66779929e7786562b6a0e982f6ba7f3` | `e9f8fcaa876abf1188cc2453a28d2f43` | `83df12eb4f20848e8c1e6a8f29fb3c9a` |
| After rows (c), (i) rewritten — **final** | **`9a9ab2d921324a974d5f28df7deb0b6d`** | `e9f8fcaa876abf1188cc2453a28d2f43` (= step 3) | `83df12eb4f20848e8c1e6a8f29fb3c9a` (= step 3) |

The last step touches only the sloop's scenario list; the cutter and schooner outputs are byte-identical to step 3 (checked with `cmp`).

Tools after every step:

| Tool | Step 1 | Step 2 | Step 3 | Final |
|---|---|---|---|---|
| `render-checks.mjs` | green, 171 | green, 171 | green, 171 | green, 171 |
| `render-smoke.mjs` | clean | clean | clean | clean |
| `round14-checks.mjs` | green | green | green | green (captive roll 33.1%) |

171 assertions = round 18's 157 plus 14 in the new CHECK 25.

---

## 2 · Step 1 — the sheet interval

**Form used: the brief's suggested one.**
- Starboard sheet: `[β − es·L, max(β, es·L)]`. Port is that interval negated. (β is the fairlead offset, 20°; L is the sail's clew limit, deltaLim.)
- Neither bound can cross the other, so the collapse clause is gone.
- The empty-intersection rule stays: both sheets hard puts the clew at 0.
- New helper `SIM.sheetIntervalOne(e, side, deltaLim, beta)`; `SIM.sheetIntervalTwo` intersects two of them.
- I found no better form. This one meets all three principles, and it leaves every ease ≥ β/L byte-identical.

**New CHECK 25 in `render-checks.mjs`** (run on the staysail and the jib):

| Check | Result |
|---|---|
| Mirror: port = negated starboard, every ease on a 0.01 grid | 101/101 exact |
| Monotone: interval at e2 contains interval at e1, every pair, both sides | all nested |
| Hauled home is ±β exactly | port [−20, −20] · stbd [20, 20] |
| No single-sheet interval inverts (0.001 grid) | 2002 intervals, none |
| Easing from home never lowers the outer bound | 20, 20, 20, 20, 27 at e 0, 0.05, 0.11, 0.2, 0.3 (old rule dragged it to 15.5, 10.1) |
| Both sheets home → clew flat amidships | empty, 0 |
| Every ease pair ≥ 0.222 equals round 18 bit for bit | identical |

**Goose-wing procedure, still before step 3** (lee sheet let fly; weather sheet hauled home at 0.25/s; held 2 s; eased to 0.8 at 0.5/s; then 60 s). From `round19-checks.mjs` CHECK G:

| TWA | Tipping point (clew) | Round 18 | After step 1 |
|---|---|---|---|
| 180 | 0.0° | holds | **holds** (clew 70°, 115 N) |
| 175 | 7.4° | holds | **holds** |
| 170 | 14.8° | falls back | **holds** (clew 70°, 114 N) |
| 167 | 19.2° | falls back | **holds** (clew 70°, 113 N) |
| 165 | 22.1° | falls back | **falls back** |

TWA 165 is geometry, not the collapse rule. A sheet hauled home puts the clew at the fairlead, 20°, and the tipping point is at 22.1°. No sheet setting can get the clew past it.

**Sloop scenarios with a sheet below 0.22, and how much each moved in step 1:**

| Row | Sheet below 0.22 | Round 18 | After step 1 |
|---|---|---|---|
| (a) | working 0.20 | 4.076 kn · drive 833.6 N · heel 13.16° | 4.049 kn (−0.7%) · 827.3 N (−0.8%) · 12.94° |
| (b) | working 0.20 | 2.305 kn · drive 380.8 N | **2.160 kn (−6.3%) · 354.3 N (−7.0%)** |
| (d) switched | working 0.20 | 12.39 s · exit 3.30 kn | 12.78 s · 3.36 kn |
| (d) unswitched | working 0.20 | 10.10 s · aback 0.518 | 9.98 s · 0.520 |
| (e) | working 0.20 | irons threshold 0.25–0.5 kn | **completes at every speed down to 0.25 kn** (a finding under §9, reported as OBSERVED) |
| (f) | working 0.20 | 42.6° · 1.68 kn | unchanged to 3 decimals (the hove-to window settles to the same state) |
| (k) | port 0.10, then 0.20 | pays off 7.13 s · 3.573 kn | 6.97 s · 3.563 kn |
| (l) v1 / v2 / v3 | (a)'s 0.20 | −3.61 / 1.58 / −7.84 °/s | −3.51 / 1.58 / −7.86 °/s |

Why they moved: a working sheet at 0.20 used to hold the clew at −18°. That is 2° *inside* its own fairlead, which a rope cannot do. It now holds it at −20°.
- (b) pinches at an apparent wind near 20°, so 2° less jib incidence costs 7% of drive.
- In (e), the tack gets easier.

Other ships in step 1:
- cutter (n): topsail-set SOG 3.814 → 3.784 kn against the sloop's (a) 4.049. Still passes.
- schooner (q): the two closest sweep angles lost speed (40.7°: 5.15 → 4.85 kn; 44.6°: 5.70 → 5.52 kn). The best angle did not move.
- schooner (r): pointing loss 6.4° → 5.5°. Still in 3–8.

---

## 3 · Step 2 — a shadow scales with the pressure its sail gets

- Each sail k's shadow term is now multiplied by `kept_k`, k's own pressure factor.
- Factors are computed aft to forward (ascending `xCE`). A stable sort keeps definition order for equal `xCE`.
- New `SIM.shadeFactors(wind, rig)` computes all of them at once. It is memoised per rig view and wind, so a step still does the work once. `SIM.shadeFactor` reads from it.
- No new knob.

**Pressure each sail keeps** (`round19-checks.mjs` CHECK P):

| Ship, point of sail | Sail | Round 18 | After step 2 |
|---|---|---|---|
| Sloop TWA 160 (AWA 150.7) | main | 1.000 | 1.000 |
| | staysail | 0.721 | 0.721 |
| | jib | 0.582 | **0.655** |
| Sloop TWA 180 (AWA 180) | main | 1.000 | 1.000 |
| | staysail | 0.436 | 0.436 |
| | jib | 0.258 | **0.372** (brief's estimate ≈ 0.37) |
| Schooner (v), TWA 170 | jib | 0.183 | **0.383** |
| | fore staysail | 0.284 | 0.479 |
| | foresail | 0.412 | 0.500 |
| | fore topsail | 0.559 | 0.685 |
| | main-topmast staysail | 0.467 | 0.494 |
| | mainsail | 1.000 | 1.000 |
| | main gaff topsail | 0.730 | 0.730 |

Checks:
- The beat row still loses 0%: all three sloop sails keep 1.000 at AWA 32.6.
- The aftmost sail is unshaded on every ship.
- CHECK 19's no-step checks still pass. The largest steps are 0.0068 per 0.5° of AWA and 0.0128 per 0.5° of clew.
- Pairs are unchanged. The staysail (shaded by the main alone) and the main gaff topsail keep exactly their round-18 values.

**Row (v), unchanged criteria: PASS.**
- fore-mast canvas loses 41.3% (band 25–60);
- fore topsail keeps 68.5% (≥ 50);
- main unshaded;
- SOG 5.34 kn (was 5.20).

Other effects of step 2: the sloop's (c) main-side run 3.757 → 3.791 kn, and small moves in (i), (k), cutter (o) and schooner (t), (u).

---

## 4 · Step 3 — the clew held out by its own sail, against weight

### What was built

One rule for every fore-and-aft sail (gaff, headsail, gaff topsail). Square sails keep their old rule. `SIM.chordAback` is untouched.
- **Hinge.** A headsail's hinge is its stay. A gaff sail's is its mast, taken as vertical. A gaff topsail's is its topmast, also vertical. Each type now carries `trimHinge`.
- **Moment** (positive drives the clew to starboard; θ = rake of the hinge, φ = heel):
  - `M_aero = armCE · (Fx·cos θ·sin δ + Fy·cos δ)`, from the force model as computed, shading included.
  - `M_grav = g · Σ(m·ρ) · (sin φ·cos δ − cos φ·sin θ·sin δ)`, where ρ is each mass's distance from the hinge.
  - Derived for a rigid plate rotating about a raked axis. A boom on a vertical mast (θ = 0) feels weight only through heel.
- **Motion.** The clew moves the way the net moment drives it, at most `kBoom·AWS·dt` (today's rate). The sheets clamp it as before.
  - To stop it chattering by a full step around a balance point, the force is evaluated once more at the far end of the allowed step.
  - If the moment has changed sign by then, the clew goes to the linear zero between the two points instead.
  - The probe reuses this step's camber side and shading factor.
- New functions: `SIM.luffLine`, `SIM.trimMomentModel`, `SIM.trimHungMR`, `SIM.trimMoment`, `SIM.momentTrimTarget`.
- `SIM.freeChord` is kept, but the physics no longer uses it for fore-and-aft sails. CHECK 24 still tests it.

### Masses and lever arms, with derivations

Materials per ship, new `rigMaterials` block, every value `[assumed]`:

| | Sloop and cutter | Schooner | Basis |
|---|---|---|---|
| Cloth | 0.40 kg/m² | 0.70 kg/m² | ~12 oz/yd² traditional cloth for an 8 m gaff cutter; ~21 oz/yd² (#2 duck class) for 80–150 m² sails |
| Sheet rope | 0.09 kg/m | 0.35 kg/m | 12 mm three-strand; 24 mm, since rope mass goes as diameter² (0.09·4 = 0.36) |
| Spar timber | 450 kg/m³ | 450 kg/m³ | solid Sitka spruce or Douglas fir |
| Spar diameter | length/50 | length/50 | traditional proportion; plain cylinder, no taper |

Geometry rules, all `[assumed]`:
- **Headsail luff.** A declared stay is used as it stands (the schooner).
- The sloop and cutter declare none, so the luff is derived from the sail's own numbers, the same way round 18 derived its height bands:
  - a triangle with its tack at `zLo`, its head on its mast at `zHi`, and its foot level with the tack;
  - its centroid at the declared `xCE` and its area A.
  - That gives `x_tack = (3·xCE − x_mast + 2A/(zHi − zLo))/2`. Sloop jib: tack at x = 6.73 m. Staysail: 4.31 m.
- **Headsail arms.** The clew is `hPerp = 2A/luff` from the luff. The cloth's centroid and the centre of effort are at `hPerp/3`.
- **Sheets.** Each sheet's free span is taken as `hPerp`, and half of it is carried by the clew. A sail has two sheets if it has a pair.
- **Gaff sail.** The aero arm and the cloth arm are `x_mast − xCE`. Boom: CoG at half its length. Gaff: 0.65 × boom, peaked 45°, CoG lever `0.5·L_gaff·cos 45°`. Mainsheet: half of one boom length, at the boom end.
- **Lowered sail.** A lowered headsail or topsail hangs no weight (it lies on deck). A gaff sail's spars and sheet always hang; only its cloth comes down with the throat.

Result (`round19-checks.mjs --masses`):

| Ship | Sail | Hinge, rake | Aero arm | Parts (kg @ m) | Σ m·ρ |
|---|---|---|---|---|---|
| Sloop / cutter | main | mast, 0° | 2.30 m | boom 17.67 @ 2.50 · gaff 4.85 @ 1.15 · cloth 11.20 @ 2.30 · sheet 0.22 @ 5.00 | 76.6 kg·m |
| | staysail | stay, 26.6° | 0.72 m | cloth 3.20 @ 0.72 · sheets 0.20 @ 2.17 | 2.73 kg·m |
| | jib | stay, 35.3° | 0.67 m | cloth 4.00 @ 0.67 · sheets 0.18 @ 2.02 | 3.05 kg·m |
| Schooner | jib | stay, 24.1° | 1.92 m | cloth 38.5 @ 1.92 · sheets 2.02 @ 5.77 | 85.7 kg·m |
| | fore staysail | stay, 15.4° | 1.86 m | cloth 28.0 @ 1.86 · sheets 1.96 @ 5.59 | 63.1 kg·m |
| | foresail | mast, 0° | 3.00 m | boom 38.8 @ 3.25 · gaff 10.7 @ 1.49 · cloth 56.0 @ 3.00 · sheet 1.14 @ 6.50 | 317.5 kg·m |
| | main-topmast staysail | stay, 14.3° | 1.26 m | cloth 24.5 @ 1.26 · sheets 1.32 @ 3.77 | 35.7 kg·m |
| | mainsail | mast, 0° | 4.80 m | boom 163.7 @ 5.25 · gaff 44.9 @ 2.41 · cloth 105 @ 4.80 · sheet 1.84 @ 10.50 | 1491 kg·m |
| | main gaff topsail | topmast, 0° | 2.11 m | cloth 21.0 @ 2.11 · sheet 1.11 @ 6.32 | 51.2 kg·m |

Scale check, sloop jib: the largest weight moment is 3.05 · 9.81 · sin 35.3° ≈ 17 N·m. Goose-winged at TWA 180 its own moment is about 53–60 N·m (115 N of drag on a 0.67 m arm), so it is held out with a margin of three.

---

## 5 · Acceptance rows, round 19

Final build (all three steps, rows rewritten). Rows marked † come from `round19-checks.mjs`. The rest are harness rows.

### Goose-wing holds † — FAIL at 170 and 165 (and at 167, the extra step-1 row)

| TWA | Round 18 | Step 1 | Step 2 | **Step 3 (final)** |
|---|---|---|---|---|
| 180 | holds | holds | holds | **holds** — clew 70°, 115 N, kept 1.000, not aback |
| 175 | holds | holds | holds | **holds** |
| 170 | falls back | holds | holds | **falls back** |
| 167 | falls back | holds | holds | **falls back** |
| 165 | falls back | falls back | falls back | **falls back** |

Diagnostic for TWA 170, at the steady run state (AWA 165.1):

| Clew | 15° | 20° (sheet home) | 25° | 30° | 70° |
|---|---|---|---|---|---|
| Aero moment (N·m) | −3.6 | +2.4 | +8.2 | +14.1 | +53.3 |
| Weight moment (N·m) | −4.9 | −6.3 | −7.7 | −9.0 | −16.4 |
| Net | −8.4 | **−3.9** | +0.6 | +5.1 | +36.9 |

- Weight moves the tipping point from 14.9° (pure geometry) to about 24.6°, beyond the fairlead's 20°.
- A sheet hauled home cannot get the clew past it.
- At TWA 175 the shifted point is about 17°, inside 20°, so it still holds.
- On a run the stalled jib's force is a constant drag along the flow (α saturates at 90°). Its moment is that drag times the arm times the sine of the chord's angle off the into-wind line, so it is weakest exactly where the crew needs it.

### Goose-wing collapses † — PASS at TWS 4, FAIL at 6 and 8; the heavier-wind ordering PASSES

From goose-winged at TWA 180, heading up at 0.25°/s:

| TWS | Round 18 | **Step 3 (final)** | Band 150–165 |
|---|---|---|---|
| 4 m/s | 130.3 | **155.5** (AWA 143.9) | PASS |
| 6 m/s | 130.2 | **142.0** (AWA 125.1) | FAIL |
| 8 m/s | 129.2 | **137.3** (AWA 119.8) | FAIL |

- Heavier wind holds it longer, as the brief predicts: 155.5 → 142.0 → 137.3.
- Weight now brings the collapse 7–25° earlier than pure geometry did. In 6 and 8 m/s the jib's drag still beats its weight until well below 150.

### Beat untouched † — (a) PASS, (b) FAIL, beat shading PASS

| Row | Round 18 | Final | Change | ±2% |
|---|---|---|---|---|
| (a) SOG | 4.076 kn | 4.049 kn | −0.67% | PASS |
| (a) drive | 833.6 N | 827.3 N | −0.75% | PASS |
| (b) SOG | 2.305 kn | 2.160 kn | **−6.28%** | **FAIL** |
| (b) drive | 380.8 N | 354.3 N | **−6.98%** | **FAIL** |
| Beat shading loss | 0% | 0% (827.3 = 827.3 N) | — | PASS |

The whole (b) change comes from step 1; steps 2 and 3 did not move (a) or (b) at all. The working jib sheet at 0.20 now holds the clew at its fairlead, −20°, instead of 2° inside it. At (b)'s apparent wind of about 20° that is 2° less jib incidence. (b)'s own criteria still pass: ratios 0.534 and 0.428 against < 0.6 and < 0.5.

### (c) rewritten — PASS

| Criterion | Measured | |
|---|---|---|
| Beam reach in 5.5–6.5 kn | 5.594 kn | PASS |
| Dead run, jib on the main's side | 3.791 kn (clew −70°) | observed |
| Dead run, goose-winged by the procedure | 3.964 kn (clew +70°) | observed |
| Goose-winged ≥ 0.70 × beam reach | ratio 0.709 | PASS (by 0.04 kn) |
| Goose-winged > main's side | 3.964 vs 3.791 kn | PASS |
| AWS < TWS on the run | 4.05 / 3.96 m/s vs 6 | PASS |

The harness row and the independent run in `round19-checks.mjs` agree to the third decimal.

### (i) rewritten for flat water — PASS

| Variant | Boom starts across | Swing | Peak heel after | Peak yaw after | |
|---|---|---|---|---|---|
| Eased 0.9 | **53.8° by the lee** (round 18: 55.0°) | 2.33 s | 4.80° | 3.48 °/s | crosses — PASS |
| Sheeted 0.1 | 5.4° by the lee | 0.35 s | 1.86° | 3.44 °/s | crosses gently — PASS |

"Crosses gently" had no number in the brief. The harness now tests it as peak heel after the cross below the eased variant's (1.86 vs 4.80°) — my proposed criterion; peak yaw is near-equal and only reported. No angle band and no timing, as asked.

### Everything else

| Ship | Row | Round 18 | Final | |
|---|---|---|---|---|
| Sloop | (a), (b) own criteria | pass | pass | |
| | (d) switched | 12.39 s, exit 3.30 kn | **19.01 s**, exit 3.02 kn | PASS (limit 20 s) |
| | (d) unswitched | 10.10 s, aback 0.518 | 10.82 s, aback 0.752 | PASS |
| | (e) | threshold 0.25–0.5 kn | **no tested speed completes** (heading ends ~90–100° off the wind) | **FAIL** — see §6 |
| | (f) | 42.6°, 1.68 kn | 42.6°, 1.68 kn | PASS |
| | (g), (h), (j) | — | byte-identical rows | PASS |
| | (k) | 7.13 s, 3.573 kn | 7.64 s, 3.574 kn | PASS |
| | (l) v1 / v2 / v3 | −3.61 / 1.58 / −7.84 | −3.56 / 1.52 / −7.92 °/s | PASS |
| Cutter | (m) | +8.8% | +8.8% (5.568 vs 5.119 kn) | PASS |
| | (n) | 3.814 vs 4.076 kn | 3.784 vs 4.049 kn | PASS |
| | (o) | 11.51 s | 11.43 s | PASS |
| | (p) | 7.6 s | 7.98 s | PASS |
| Schooner | (q) | 52.5° · 6.75 kn · 9.8° | unchanged | PASS |
| | (r) | 6.4° worse | 5.5° worse | PASS |
| | (s) | 2.62 lengths, 0.709 | 2.63 lengths, 0.708 | PASS |
| | (t) | 26.0 s | 25.9 s | PASS |
| | **(u)** | 55.6–102.2°, heel ratio 1.085 — FAIL ×2 | **61.2–93.7°, heel ratio 0.977, drift 1.16 kn — PASS all** | |
| | (v) | loss 51.9% | loss 41.3% | PASS |

(u) moved in step 3, not in steps 1 or 2. She now forereaches gently (0.56 kn ahead, 0.85 kn sideways), and her swing falls from 46.7° to 32.5°. I have not traced why. Both backed sails stay aback 100% of the window.

The printed round-13 "peak vs settled heel" line still reads FAIL on all three ships, as in every round since 13. It is the measurement issue the spec records, unchanged.

---

## 6 · What the moment balance did that the brief did not predict

1. **The tack breaks, through a knife edge in the camber model.**
   - For the headsails `i0 = iFlip = 8°` (i0 is the camber offset, iFlip the flip threshold).
   - A free headsail's moment is zero at an effective angle of about 0.5°, so its incidence × camber side sits near −7.5. That is 0.5° short of the flip threshold (−8).
   - Traced through the (e) tack from 2 kn:
     - Before head-to-wind the luffing jib follows that balance point (incidence × camber side stays between −7.4 and −7.65), so its camber never flips.
     - After the sheets are switched, the new working sheet holds the clew at +2°, the camber is still the old tack's, and the jib lifts to *windward* (Fy −150 to −215 N).
     - That pushes the bow back onto the old tack. The sails' yaw moment is −900 to −1900 N·m.
   - The old weathervane rule sat exactly *on* the boundary (incidence × camber side = −8.000, and the test is a strict `<`). The camber flipped in round 18 only because the clew was still on its sheet when the incidence crossed −8.
   - Diagnostic only, not shipped: with `iFlip` 6 the camber does flip, but the balance point is then near that threshold too, so the jib's camber flips back and forth through the tack, and (e) still fails.
   - This is a question about the camber model, not about the moment rule. One option for you: make the camber side of an unloaded (luffing) sail follow the sign of the incidence, and keep the hysteresis only for a loaded sail. I have not built it.
2. **Weight moves a goose-winged jib's tipping point** about 10° outboard at TWA 170. This alone turns the TWA 170 and 167 goose-wing rows from hold into fall back. It is the same physics that makes the collapse row work at TWS 4.
3. **The boom by the lee hardly moved** (55.0° → 53.8°). That is as the brief said: it only gets weight through heel, and on a run heel is about 1°. "Rolling in a seaway" stays on the list as its own item.
4. **Schooner (u) settled** (see §5).
5. **The probe costs one extra force evaluation** per fore-and-aft sail per step, so harness runs are noticeably slower. I did not time it precisely.

---

## 7 · Constants added this round

All `[assumed]`, none fitted, none tuned:
- `rigMaterials` per ship (cloth, sheet, timber density, spar proportion) — table in §4;
- gaff length 0.65 × boom, peaked 45°;
- each sheet's free span = the clew's distance from the luff, half carried by the clew;
- the derived sloop and cutter luff line (tack at `zLo`, head on the mast at `zHi`, centroid at `xCE`).

Nothing else changed. `kShade`, `kBoom`, `iFlip`, `beta` and every table value are as in round 18.

## Files

| File | What it is |
|---|---|
| `index.html` | The build: step 1 `SIM.sheetIntervalOne` / `sheetIntervalTwo`; step 2 `SIM.shadeFactors`; step 3 `SIM.trimMomentModel` and friends, `rigMaterials` on every ship, `trimHinge` on the fore-and-aft types; rows (c) and (i) rewritten. |
| `render-checks.mjs` | CHECK 25 added (step 1). |
| `round19-checks.mjs` | New, kept. G goose-wing procedure, P pressure kept, C collapse heading up, B beat untouched, R (c), I (i), M masses. |
