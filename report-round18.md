# Round 18 — report

Built 2026-10-01 against `spec-2d-sandbox.md` §16 "Round 18", in the order the brief set: (u) first, then the design question (stopped and shown), then the build with Bregir's addition (the lateral-overlap factor, plus the goose-wing row).

**Short version.** Shading is built as one rule for every rig: a sail aft of another shades it, only with the apparent wind abaft the beam, and only where the forward sail sits inside the aft sail's width across the wind. All the shading acceptance rows pass. Three rows fail, and they are reported as fails:

- the sloop's dead run in (c) is now 3.76 kn against 4–5;
- (u) swings out to 102° against 40–100;
- (u)'s heel ratio is 1.085 against ≤ 1.05.

Nothing was tuned. **Corrected in the follow-up below:** the goose-wing verdict in §4 was wrong. The sheets do allow the clew 70° to windward; the free-angle rule pushed it back.

---

## 1 · Amended row (u), re-run before any physics change

Setup: fore staysail **and** fore-topsail backed, mainsheet hard in (0.05), helm lashed a-lee (+35° on starboard tack), TWS 8. Window: the **last 600 s of a 1200 s run**. The hunt period is measured, not assumed, and the window holds at least 4.6 periods in every variant.

**What "backed" means turned out to matter.** Round 17's diagnostic hauled the staysail's weather sheet to 0.25. In this sheet model that holds the clew at **−2.5°**, which is 2.5° to *leeward*. The sail sat flat amidships and was never flagged aback. The weather sheet's range is `[−(es·90 − 20), es·90]`, so the clew only crosses to windward once the ease is below 0.22. Hauled home (0.00), it sits at +20° — the fairlead offset, and the furthest to windward any sheet can pull it. The row is judged on that setting.

| Variant (all with the topsail backed) | Staysail clew | TWA min / mean / max | Hunt period | Drift |
|---|---|---|---|---|
| Round-17 wording, staysail not backed | −49° (drawing) | 9.7 / 52.7 / 82.1 | 141 s | 1.31 kn |
| Staysail weather sheet 0.25 (round 17's "backed") | −2.5° — **not aback** | 59.6 / 75.1 / 92.6 | 87 s | 1.17 kn |
| Staysail weather sheet 0.10 | +11° aback | 55.7 / 74.0 / 102.5 | 133 s | 1.32 kn |
| **Staysail weather sheet home (the row)** | **+20° aback** | **53.0 / 73.8 / 103.9** | **126 s** | **1.33 kn** |

The amended row, as asked:

| | Result |
|---|---|
| Settles | **Not growing, but not quiet.** Heel spread 0.45 → 0.46° (ratio ≈ 1.02, pass), TWA spread 18.8 → 17.7°. She hunts steadily through about 51° on a 126 s cycle |
| Drift | **1.33 kn** — pass |
| TWA min / max | **53.0° / 103.9°** — **FAIL** against 40–100, by 3.9° at the wide end |
| Never inside 30° | **Yes** (closest 53.0°) |

All three md5s were unchanged by this step. The run was a separate script (`round18-checks.mjs`) and `index.html` was not touched: sloop `5b1973ce…`, cutter `f3fa8d9d…`, schooner `8e466ded…`.

**After the shading physics** (same setup, now also the harness's own row (u)):
- drift 1.31 kn — pass;
- closest 55.6° — pass;
- swing 55.6–102.2° — **FAIL**;
- heel ratio second half / first 1.085 — **FAIL** against ≤ 1.05;
- both sails aback 100%.

The heel spread is tiny (0.39 → 0.42°), but the row's criterion is a ratio, and the ratio is over. Per your instruction the row is left as a fail and the band is unchanged.

The harness row (u) now runs the amended setup. It had still run round 17's wording, with the staysail case only as a side note. The criteria are the spec's amended ones; the 40–100° test was added because §16 lists it.

---

## 2 · The design question (answered before building)

**Answer: the simpler rule — an aft sail shades a forward sail only with the apparent wind abaft the beam — with a smooth weight `max(0, −cos AWA)`.** The weight is 0 at the beam, 0.5 at 120° and 1 dead aft.

The sloop was held at steady state in clear air. Both rules were then applied to that same state:

| Point of sail (apparent wind) | Apparent-wind-line rule (§15) | Aft-shades-forward, on/off at 90° | Aft-shades-forward, smooth |
|---|---|---|---|
| Beat, TWA 45 (32.6°) | **−10.4%** (jib shades staysail) | 0.0% | 0.0% |
| Reach, TWA 90 (63.7°) | **−10.4%** (same fault) | 0.0% | 0.0% |
| Run, TWA 160 (150.3°) | −25.9% | −25.9% | −23.1% |

Why the apparent-wind-line rule fails:
- **On the beat and the reach,** the jib and staysail sit almost in line, so the jib shades the staysail at every wind angle.
- **Below 20° apparent,** the jib also shades the main. That is the slot read as a loss, which is the case §16 warned about.

Why the weight is smooth: an on/off switch at the beam would make drive jump 26% as the wind crosses 90°. Ahead of the beam the rule adds nothing; the slot's gain stays where it already lives, in each sail's incidence offset (`i0`).

---

## 3 · What was built

`SIM.shadeFactor(def, wind, rig)` sits in the force path and reads the round-17 `rig` view — no new plumbing. For sail j, every banded sail k **aft of it** (`k.xCE < j.xCE`) multiplies j's wind pressure by:

> `1 − kShade · w(AWA) · heightOverlap · lateralOverlap · setFraction_k`

- `w(AWA) = max(0, −cos AWA)` — the smooth weight from step 2.
- `heightOverlap` — the share of j's height band that k's band covers.
- `lateralOverlap` — **your addition.** Each sail is drawn in plan as a straight chord at its current trim. A boom or clew is hinged half a chord ahead of its centre of effort and swung to its clew angle; a yard is centred on its mast at its yard angle. Both chords are projected across the apparent wind, and this is the share of j's width that k's width covers. It moves continuously with no switch. A sail exactly edge-on to the wind casts no shadow, and the forward sail's width has a floor of a quarter chord, so a near-edge-on jib does not jump from 0 to 1.
- `setFraction_k` — how much of k is hoisted.
- `kShade` — **0.6**, §15's value, now a config coefficient in the tuning panel. Same value; not tuned.

§15's apparent-wind-line rule, its 3-hull-length reach and its half-span lateral test are gone. `SIM.blanketFactors` stays as a thin wrapper for the checks and the HUD.

**Height bands, all `[assumed]`.** A headsail runs from its foot to the head that puts its triangle's centre of effort at the declared `zCE` (`zHi = zLo + 3(zCE − zLo)`). A gaff sail runs from boom to peak.

| Ship | Sail | Band (m above waterline) |
|---|---|---|
| Sloop and cutter | main | 1.2–8.5 |
| | staysail | 0.8–7.4 |
| | jib | 0.8–8.9 |
| Cutter | topsail | 5.5–9.0 (unchanged from §15) |
| Schooner | jib | 2.6–20 |
| | fore staysail | 2.2–16 |
| | foresail | 3–15 |
| | fore topsail | 14–21 (unchanged) |
| | main-topmast staysail | 6–21 |
| | mainsail | 3–20 |
| | main gaff topsail | 15.5–25 |

### md5s

| Step | Sloop | Cutter | Schooner |
|---|---|---|---|
| Before (round 17) | `5b1973ce4000dbd552068bfed7485148` | `f3fa8d9d35ae5101d77b634f3651da30` | `8e466ded82c41d71cb9e93b8cbadea7a` |
| After step 1 ((u) re-run, separate script) | held | held | held |
| Shading code in, no bands yet | held | held | held |
| **Bands on, rows (u) and (v) updated — final** | **`a7bb67c4c32cfd6051ba9ea28a1ec2c6`** | **`60e8c401d7d1cc37b2bd35ba40edb8a6`** | **`7108d7c80c46ca1e21a07e1e8f4928ca`** |

The "code in, no bands" row matters: the new rule is arithmetically inert until a rig declares two or more bands. So every md5 change comes from the bands, plus the schooner's two rows.

---

## 4 · Acceptance rows, with numbers

Each row reads the drive twice at the same steady state: with the shading the physics used, and in clear air (factor forced to 1). SOG comparisons are separate runs with `kShade = 0`, made by `round18-checks.mjs` only — never by a scenario.

### Sloop beat (TWA 45, (a)'s trim) — PASS

- Apparent wind 32.6°; all three sails keep 1.000 of their pressure.
- Drive **834 N shaded vs 834 N clear (+0.0%)**.
- SOG 4.076 vs 4.076 kn.
- The slot is not a loss. It is not modelled as an *extra* gain either; that stays in `i0`.

### Sloop run — the main must shade the headsails — PASS

| | TWA 160 (AWA 150.7°) | TWA 180 (AWA 180°) |
|---|---|---|
| Pressure kept: staysail / jib | 0.721 / 0.582 | 0.436 / 0.258 |
| Headsail drive, shaded / clear | 130 / 202 N (**−35.6%**) | 74 / 219 N (**−66.2%**) |
| Total drive | −13.6% | −25.9% |
| SOG, shaded vs `kShade = 0` | 3.88 vs 4.05 kn (−4.0%) | 3.76 vs 4.08 kn (−7.8%) |
| Main shaded? | no (1.000) | no (1.000) |

**Does the staysail shade the jib on a run? Yes, by a lot.**
- At TWA 160 the staysail takes **30.8%** off the jib's pressure, on top of the main's shadow. With the staysail struck, the jib keeps 0.841; with it set, 0.582.
- At TWA 180 it takes **43.7%** off (0.459 → 0.258).
- The two shadows multiply, which is why the jib is the most-shaded sail on the boat (see finding 1 below).

### Sloop TWA 170, goose-winged jib vs jib on the main's side — *superseded by the follow-up below*

> **This verdict was wrong.** With the lee sheet let fly, the sheet range already reaches +70° to windward. The real block was the free-angle rule, which always sent the clew to leeward. See the follow-up section.

**The sim cannot goose-wing a jib.** There is no whisker pole, and the windward sheet cannot pull the clew further than the fairlead offset: hauled home it holds the clew at **+20°**. A goose-winged jib needs the clew 70–90° out to windward. The numbers I can give:

| | Jib clew | Jib keeps | Jib drive (clear air) | Total drive | SOG |
|---|---|---|---|---|---|
| (a) Jib on the main's side, sailed | −70° | 0.391 | 46 N (118) | 432 N | 3.81 kn |
| (b) Jib held to windward as far as the sheets go, sailed | +20° | 1.000 | 114 N (114) | 484 N | 3.98 kn |
| (c) Jib clew **hand-set** to +70° on (a)'s state — tests the factor, not a sailing state | +70° | 1.000 | 118 N (118) | — | — |

- On the main's side the shadow costs the jib **72 N**. Mirrored to windward (c) it costs **0 N**, so 100% of the loss is recovered. The lateral factor does what you asked.
- Even the sheets' +20° gets the jib out of the main's shadow (b) and is worth +0.17 kn. But a jib 20° off the centreline is not a goose-winged jib.

### Schooner row (v) — running under square canvas, main blanketing the fore — PASS against the proposed criterion

**Proposed criterion** (the spec gave none), at TWA 170, TWS 6, fore topsail set and squared, fore-and-aft sheets 0.9:

1. **The fore-mast canvas (foresail + fore topsail) loses 25–60% of its clear-air drive.** The 150 m² main sits dead upwind of the fore's 150 m². Much less than a quarter would mean the shadow isn't there; more than 60% (`kShade`) would mean it has been double-counted.
2. **The fore topsail keeps at least half its clear-air drive.** It is set above the foresail and spread across both sides of the ship. Drawing in the main's lee is what square canvas forward is *for* on a schooner running.
3. **The main loses nothing** — nothing is aft of it.
4. **She is slower than in clear air.**

**Measured** (apparent wind 162°, yard 0°):

| | Result |
|---|---|
| Fore-mast canvas | **582 vs 1212 N, loss 51.9%** — pass |
| Fore topsail keeps | **55.9%** — pass |
| Main | 1.000 — pass |
| SOG | **5.20 vs 5.80 kn (−10.3%)** — pass |

Pressure kept by every sail:

| Sail | Kept |
|---|---|
| jib | 0.183 |
| fore staysail | 0.284 |
| foresail | 0.412 |
| fore topsail | 0.559 |
| main-topmast staysail | 0.467 |
| mainsail | 1.000 |
| main gaff topsail | 0.730 |

Criteria 1–3 are also a harness row, (v) in the schooner set. Criterion 4 needs a second physics run, so it lives in `round18-checks.mjs` only.

### All twelve sloop scenarios, re-run

| Row | Before | After | |
|---|---|---|---|
| a (beat) | 4.076 kn / 3.69° / 13.16° | identical | PASS |
| b | ratios 0.565 / 0.457 | identical | PASS |
| **c** | 90°: 5.594 · 135°: 4.456 · **180°: 4.075** | 90°: 5.594 · 135°: 4.437 · **180°: 3.757** | **FAIL** (run 4–5 kn) |
| d, e, f, g, h, j | — | byte-identical | PASS |
| i | boom crosses; peak heel 1.47° | boom crosses; peak heel 1.30° | PASS |
| k | final SOG 3.735 | 3.573 | PASS (> 2.5) |
| l | v1 −3.61 · v2 1.58 · v3 −8.07 °/s | v1, v2 identical · v3 −7.84 | PASS |

**(c) fail, diagnostic.** Dead downwind the headsails keep 0.436 and 0.258 of their pressure and lose 145 N between them. That costs 0.32 kn: 4.08 kn in clear air, 3.76 kn shaded. The 4–5 kn band was set before any shading existed, and the run-shading row asks for this exact loss to be measurable. So the two rows now pull against each other. I have not changed either one, and I have not tuned `kShade`, which is the only knob that would close the gap. Three ways out, for you to choose:
1. Re-baseline (c)'s run band.
2. Combine shadows as the strongest single one rather than the product. The jib would then keep 0.459 instead of 0.258 at 180° (finding 1).
3. Accept that a sloop running dead downwind with the jib in the main's lee is slower than 4 kn. That is the case for goose-winging, which the sim cannot do.

### Cutter and schooner sets

| Set | Rows | Changes |
|---|---|---|
| Cutter | m, n, o, p all PASS | Only (o)'s wear changed: 11.17 → 11.42 s, exit 5.18 → 5.16 kn |
| Schooner | q, r, s, t PASS; (u) FAIL ×2 (above); (v) PASS | q, r, s byte-identical; (t) wear 25.55 → 26.03 s, exit 5.75 → 5.61 kn |

### Tools

| Tool | Result |
|---|---|
| `render-checks.mjs` | **all green, 153 assertions** |
| `render-smoke.mjs` | clean |
| `round14-checks.mjs` | all three ships survive a serialise/reload byte-identically (the md5s above); captive-speed roll check 33.4% |

Changes to `render-checks.mjs` CHECK 19:
- **Kept:** the three two-square-sail assertions — 60% lost dead downwind in the same band, nothing lost in a different band, loss scales with hoist. They pass unchanged.
- **Replaced:** round 17's "no shipped rig is shaded" lines, which asserted the deferral this round ends. The new lines, on every shipped rig:
  - nothing is shaded close-hauled or on the beam;
  - running, the forward sails are shaded and the aftmost is not;
  - on the sloop, a goose-winged jib is clear of the shadow (0.296 on the main's side, 1.000 to windward);
  - no step: the jib's factor moves at most 0.008 per half-degree of wind angle (80–180°) and 0.016 per half-degree of its own clew (−80 to +80°).

---

## 5 · What was tuned

**Nothing.** `kShade` 0.6 is §15's number, moved into the config so it is visible and tunable; its value did not change. The bands are new `[assumed]` numbers, derived from each sail's declared `zCE` by the rule in §3, not fitted to any row. The chord geometry used for lateral overlap — length √A, hinged half a chord ahead of `xCE` — is also `[assumed]`.

---

## 6 · What the definition still cannot express

Carried forward from round 17 and still open:
- reefing;
- wind gradient with height;
- grouped lines;
- stay sag, bowlines and lifts;
- a trim limit that depends on the sail below;
- a `heaveTo` block.

The blanketing item is done this round. New this round, in the order they matter:

1. **Shadows multiply.** A sail with several sails aft of it takes the product of all their shadows. The schooner's jib keeps 18% dead downwind with six sails behind it; the sloop's jib keeps 26% with two. In reality the nearest sail's shadow already contains the ones behind it, so the product probably over-counts. "Strongest single shadow" is the obvious alternative. It would ease the (c) run fail, but it is a model change, so it is not made here.
2. **No goose-winging.** No pole, and the windward sheet cannot pull a clew past the fairlead offset (+20°). Running wing-and-wing is the standard answer to the main's shadow, and the sim cannot sail it.
3. **"Aft" means `xCE` is further aft, even on one mast.** The main gaff topsail's `xCE` (−3.5) is forward of the mainsail's (−5.9), so the mainsail shades its own topsail by 27% on a run. That is plausible for the low part of the topsail beside the main's peak, but it comes from the ordering, not from geometry anyone declared.
4. **The cutter's topsail is now shaded on a run** (keeps 0.74). Its declared band (5.5–9 m) overlaps the main's (1.2–8.5 m) by 86%. §15 expected it to be "barely blanketed" because it sits above the gaff peak, but the declared numbers don't say that. Either the band or the expectation is wrong; the band was left alone.
5. **A sail's plan shape for shading is a straight chord,** not the drawn sail, and it is placed from `xCE` rather than from the mast or the stay. That is good enough for "is it inside the shadow". It would not be good enough for a rig where sails overlap heavily in plan, such as a genoa.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The build. `SIM.shadeFactor` and `SIM.sailPlanChord` replace §15's rule, `kShade` is in the config and tuning panel, height bands are on every ship, row (u) is amended and row (v) added. |
| `round18-checks.mjs` | New, kept. Checks U (the amended heave-to with the staysail sweep), D (the design comparison, `--design`), and S1–S4 (the shading rows). |
| `render-checks.mjs` | CHECK 19 rewritten for the new rule; CHECK 24 (free chord, aback) added in the follow-up. |


---

## Follow-up · goose-winging, the free angle and aback (2026-10-01)

Bregir's diagnosis was right, and my §4 verdict was wrong. With the lee sheet let fly, `sheetIntervalTwo` already lets the jib's clew go to +70° to windward. Two rules were in the way.

### What changed, one rule for all fore-and-aft sails

The change covers all three fore-and-aft types — gaff, headsail and gaff topsail. Square sails are untouched.

**1. The free angle is the flow-aligned chord reached by the shorter rotation** (`SIM.freeChord`).
- **The old rule** was `clamp(−AWA − s·i0, ±lim)`, with no wrap. It always sent the clew to leeward.
- **The new rule:** the flow-aligned chord `−AWA` is reached from the current trim by the shorter rotation, §5's camber offset `−s·i0` is applied on that branch, and the result is clamped to the sail's swing.
- **The branch is decided on the flow-aligned chord, not the camber-offset one.** My first version decided it on the camber-offset chord. The camber side flips exactly where the chord points into the wind, so the clew parked at that unstable point (+15° at TWA 170) instead of falling off either way.
- **On a beat nothing changes:** AWA 45 still gives −53°, from either side of it.
- **Dead downwind with the clew on the centreline,** the two rotations tie, and the tie breaks the same way every step.

**2. Aback comes from the incidence** (`SIM.chordAback`).
- **Definition:** the sign of `i = AWA + δ` says which face the wind strikes (§2). A sail is aback when that face points forward, so the wind's pressure pushes the sail aft: `sign(δ)·sin(i) > sin(4°)`. The 4° is the luffing threshold.
- **The old test** was `sign(δ) == sign(AWA)`, which is a side test.
- **No test on `i` alone can separate the cases** — a backed jib on a beat has |i| ≈ 65°, a drawing one ≈ 25°, a goose-winged one ≈ 120°, and one on the main's side ≈ 100°. The rule therefore uses `i` together with the chord's own direction; it never uses the wind's side.

New CHECK 24 in `render-checks.mjs` pins both rules:

| Case | Expected | Result |
|---|---|---|
| Beat, jib backed to windward (AWA 45, clew +20) | aback | ABACK |
| Beat, jib drawing (AWA 45, clew −20) | not aback | not aback |
| Run, jib goose-winged (AWA 170, clew +70) | not aback | not aback |
| Run, jib on the main's side (AWA 170, clew −70) | not aback | not aback |
| Tack, old sheet still made fast (AWA −30, clew −20) | aback | ABACK |
| Tack, sheets switched (AWA −30, clew +20) | not aback | not aback |

### Numbers, before tuning anything (nothing was tuned)

The procedure is the one you described, at the sim's own rates:
1. Run with the jib on the main's side.
2. Let the lee sheet fly.
3. Haul the weather sheet home at 0.25/s, which puts the clew at +20°.
4. Hold 2 s.
5. Ease the weather sheet to 0.8 at 0.5/s.

**Sloop goose-winged at TWA 170 and 180:**

| | TWA 180 | TWA 170 |
|---|---|---|
| Holds? | **YES** — clew 70°, steady | **NO** — falls back to −52°, the main's side |
| Jib drive, goose-winged vs main's side | **115 vs 31 N** | 48 vs 46 N (it fell back) |
| Jib pressure kept | 1.000 vs 0.258 | 0.404 vs 0.391 |
| SOG, goose-winged vs main's side | **3.964 vs 3.757 kn (+5.5%)** | 3.817 vs 3.813 kn |
| Flagged aback | 0% | 0% |

**Why TWA 170 falls back — the sheets are the problem in one place.** Near home, the weather sheet's range `[20 − 90·es, 90·es]` turns inside out, and §5 collapses it to its lower bound, `20 − 90·es`. Easing from home (es 0 → 0.11) therefore *drags the clew inward*, from +20° to +10°, before the range opens again.
- **At TWA 180** the unstable point (the chord pointing into the wind) is at 0°, so the clew survives the drag.
- **At TWA 170** the point is at +15°, and the trace shows the clew going 20.0 → 9.5 → −1.8° within half a second of easing, then across to leeward.
- **Diagnostic only:** with the weather sheet let run to 0.8 in one step — faster than the 0.5/s ease rate allows — TWA 170 holds at 70°, with 114 N of jib drive and 3.978 kn.

Goose-winging by the sheets alone, sweeping TWA:

| TWA | 175 | 170 | 167 | 165 | 162 | 160 | 155 |
|---|---|---|---|---|---|---|---|
| Result | holds | falls back | falls back | falls back | falls back | falls back | falls back |
| Unstable point | 7° | 15° | 19° | 22° | 26° | 29° | 37° |

- **From about TWA 165 down,** the unstable point is beyond +20°, so the sheet hauled home cannot even get the clew past it.
- **Between 165 and 175** the clew gets past it, but the collapse rule drags it back while easing.

Fixing the collapse rule would be a change to §5's sheet model. It is not made; it is flagged for you.

**Heading up from 180, goose-winged, at 0.25°/s:**
- The jib comes across at **TWA 130.2** (AWA 109.6). [Expectation, assumed: ~155–160 — **not met.**]
- On the way it keeps drawing: 115 N at TWA 175, 104 N at 155, 90 N at 145, 70 N at 135.
- In this model nothing makes a goose-winged jib collapse early. It comes across only when the free-angle geometry flips, i.e. when the apparent wind lines up with the clew held at +70° (AWA = 180 − 70 = 110°). A real jib collapses sooner, because it falls into the main's wind shadow or the flow off the main, and loses pressure first. The model's force does not feed back into where the clew wants to go.

**The main by the lee, steering from TWA 170 through dead aft at 0.25°/s, eased to 0.9:**
- The boom comes across **56.8° by the lee** (TWA −123.2, AWA −107.2). [Expectation, assumed: ~15–20 — **not met, reported, not patched.**]
- Along the way the boom stays at −72° at 5, 15, 30 and 45° by the lee.
- **The cause is the same geometry:** the boom only comes across once the wind blows along it from the clew end, which with the boom at 72° is AWA ≈ 108. The flat-plate force model has nothing that makes the leech "catch" the wind and throw the boom across sooner.
- **The old rule erred the other way:** it gybed the moment AWA crossed 180°.

### Every gybe-related scenario, re-run

| Row | Before (old free angle) | After |
|---|---|---|
| (i) eased: boom starts across | t 4.74 s, **5.8°** by the lee | t 21.38 s, **58.8°** by the lee |
| (i) eased: swing / peak heel / peak yaw | 3.10 s / 1.30° / 3.40 °/s | 2.32 s / **4.88°** / 3.46 °/s — PASS (crosses) |
| (i) sheeted 0.1: boom starts across | t 3.35 s, 1.1° by the lee | t 4.83 s, **6.2°** by the lee |
| (i) sheeted: swing / peak heel | 0.358 s / 1.30° | 0.350 s / 1.87° — PASS |
| (d) unswitched: jib aback share during the turn | 0.476 | 0.518 — PASS |
| Cutter (o) wear | 11.42 s, exit 5.16 kn | 11.51 s, exit 5.09 kn — PASS |
| Schooner (t) wear | 26.03 s, exit 5.61 kn | 26.03 s, exit 5.55 kn — PASS |

Everything else is byte-identical, including:
- (c): its dead run is still 3.757 kn, because the tie-break leaves the boom where it was;
- (u): both sails still aback 100%;
- (v);
- the other sloop rows.

**(c) re-run both ways, as asked:**
- TWA 180 run with the jib on the main's side: **3.757 kn** (FAIL against 4–5).
- Goose-winged by the procedure above: **3.964 kn** — still a FAIL, by 0.04 kn.

The (c) decision stays on hold as you asked.

**md5s:**

| Ship | Round 18 final | After this follow-up |
|---|---|---|
| Sloop | `a7bb67c4c32cfd6051ba9ea28a1ec2c6` | **`cc9ec0ab1cf9ec3f41aba56ed52cfdd5`** |
| Cutter | `60e8c401d7d1cc37b2bd35ba40edb8a6` | **`7a4b7497c8dbc1132145f37f154bd51a`** |
| Schooner | `7108d7c80c46ca1e21a07e1e8f4928ca` | **`3514d4369ddfbc0d1be8e2d045938494`** |

| Tool | Result |
|---|---|
| `render-checks.mjs` | green, 157 assertions (CHECK 24 new) |
| `render-smoke.mjs` | clean |
| `round14-checks.mjs` | green, all three reload byte-identically |
| `round18-checks.mjs` | three fails: (u) ×2 as before, and goose-wing at TWA 170 |

### Open, for Bregir

1. **The near-home sheet collapse (§5)** drags a windward clew inward while easing. It blocks goose-winging between TWA 165 and 175, and caps any sheet-only goose-wing at the +20° fairlead offset.
2. **The free angle is pure geometry.** A sail's own force never moves its clew. That is why the goose-winged jib holds to TWA 130 and the main holds to 57° by the lee, against the expectations of ~155–160 and ~15–20°.
3. **(c)'s run band:** 3.76 kn on the main's side, 3.96 kn goose-winged, against 4–5.
