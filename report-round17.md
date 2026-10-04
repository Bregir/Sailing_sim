# Round 17 — report

Built 2026-09-10, against `spec-2d-sandbox.md` §16 steps 1–7, with `report-round16.md` as the detail.

Both decisions §16 took were honoured: **no layer modifier was built** (the gaff topsail's sheet is reached by selecting the sail), and **no height bands were given to the gaff sails**, so row (v) is not in this round's set. Selection stayed inside step 6 — the hold-`Tab` fallback was not needed.

## The md5 pair after every numbered step

| Step | sloop | cutter |
|---|---|---|
| 1 · `handling` + `SIM.handling()` | `5b1973ce…` HOLDS | `f3fa8d9d…` HOLDS |
| 2 · `deck.cleats` + `hull.beam` | `5b1973ce…` HOLDS | `f3fa8d9d…` HOLDS |
| 3 · `boomLen` + `masts[].burgee` | `5b1973ce…` HOLDS | `f3fa8d9d…` HOLDS |
| 4 · `stays` as geometry | `5b1973ce…` HOLDS | `f3fa8d9d…` HOLDS |
| 5 · `gaff-topsail` + sibling state | `5b1973ce…` HOLDS | `f3fa8d9d…` HOLDS |
| 6 · selection + reserved-chord table | `5b1973ce…` HOLDS | `f3fa8d9d…` HOLDS |
| 7 · `SHIPS.topsailSchooner` + q–u | `5b1973ce…` HOLDS | `f3fa8d9d…` HOLDS |

Full values: sloop `5b1973ce4000dbd552068bfed7485148`, cutter `f3fa8d9d35ae5101d77b634f3651da30` — the round-16 values, unchanged. Step 7 added only new numbers.

The schooner's own harness md5, for the next round to hold against: **`8e466ded82c41d71cb9e93b8cbadea7a`**.

`render-checks.mjs` **141 assertions green** (was 98; four new groups, CHECK 20–23, plus extensions to 13 and 19). `render-smoke.mjs` clean. `round14-checks.mjs`: all three ships survive a serialise/reload with byte-identical harness output, and the captive-speed roll check still reads 33.4%.

---

## Steps 1–6, what changed

**1 · `handling`.** `SIM.handling(config, name)` reads the ship's `handling` block and falls back to the global config exactly as `SIM.hull()` does. Nine call sites moved onto it — `haulRateMax` and `loadRef` in `haulEase`, `easeRate`, `halyardRate`, `kBoom`, the three `tillerRate` sites in the helm block, and `loadRef` again in the schematic's rope colours and line widths. All nine, in this one step, or `handling` would have been a half-truth on the schooner.

**2 · `deck.cleats` + `hull.beam`.** The hull outline was inline in `drawBoatBody` as fractions of LWL, which is why a cleat could only ever be a fraction of *length*. It is now `SIM.render.hullOutline(config)` in metres, with `SIM.render.hullHalfBeam(config, yFwd)` inverting the bow quadratic — and the checks measure against the same function the drawing uses, so a cleat cannot drift outboard of the hull without something noticing. A hull with no `beam` keeps the literal `0.12*LWL` / `0.14*LWL` expressions, so the sloop's outline is bit-identical rather than merely equal.

**3 · `boomLen` + `masts[].burgee`.** `SIM.boomLength(def)` takes the declared length or the round-8 formula; `SIM.boomTip(config, def)` is where the spar's after end lies with the boom amidships, which is what fouls a mast. The burgee now flies at the aftmost masthead unless a mast claims it with `burgee: true` — it flew from `masts[0]`, which on a schooner is the fore, and nobody flies a burgee at the fore.

**4 · `stays`.** `SIM.stayGeometry(config, def)` gives a stayed headsail its tack, its head, its luff, and the foot that a triangular sail of its area needs on that luff (`A = ½·luff·foot`). `xCE`/`zCE` stay the physics numbers and are **not** derived — CHECK 22 asserts instead that the declared centre of effort falls inside the sail the stay draws. Stays are optional; the sloop opts out. Worth knowing: the sloop's `stay:'fore'` / `stay:'head'` were dead fields — nothing read either — and they still are.

**5 · `gaff-topsail` and sibling state.** The force path carries one extra argument, `rig = { sails, config }`, built once per step from the state *before* that step's forces so every sail sees the same rig and loop order cannot change a number. It is deliberately general, not a parent pointer: any per-type handler can read any other sail through it, which is what round 18's shading will do. `SIM.parentSail` / `SIM.parentState` / `SIM.peakRatio` are the lookups; the gaff type's own `pk` now goes through `peakRatio` too, same arithmetic. `undefined` is a valid `rig` — `run-scenarios.mjs` calls `computeSailForces` with six arguments — and a handler that cannot find its parent reports the sail **not set** rather than NaN.

**6 · Selection, and the reserved-chord table.** `SIM.lineForKey(config, code, selectedSailId)` is the routing rule. `SIM.RESERVED_CHORDS` is now what *refuses* a browser chord, not a hand-written test — `buildControlsFromInput` consults it and CHECK 13 asserts both the table and the refusal.

---

## Steps 2–4, the geometry checks

```
topsailSchooner: every declared cleat sits inside the hull outline
    11 cleats, widest 3.00 m off the centreline                                    PASS
topsailSchooner: no two cleats within 0.4 m of each other
    closest pair eFSp/bFTp at 1.22 m                                               PASS
topsailSchooner: a fore-and-aft sheet is cleated between its own mast and the next aft
    every centre sheet forward of the aftmost mast is on a horse between the masts  PASS
topsailSchooner: no boom tip comes within 0.5 m of the next mast aft
    foresail clears by 0.80 m                                                      PASS
topsailSchooner: the aftmost boom overhangs the transom by 0-1.5 m
    mainsail overhangs by 0.80 m (transom at -10.80 m)                             PASS
topsailSchooner: every stayed sail's declared xCE/zCE falls inside the sail its stay draws
    jib on 'jibStay': luff 19.1 m, foot 5.8 m, CE (9.5, 8.5)
    foreStaysail on 'foreStay': luff 14.3 m, foot 5.6 m, CE (7.5, 7)
    mainTopmastStaysail on 'mainTopStay': luff 18.6 m, foot 3.8 m, CE (0.5, 11.5)   PASS
topsailSchooner: each headsail is drawn tacked at its stay's own deck fitting
    jib 14.0 m fwd · foreStaysail 10.0 m fwd · mainTopmastStaysail 3.5 m fwd        PASS
```

Plus, on the fallback side: the sloop's cleats come out bit-identical to round 16 with no `deck` declared, a hull with no `beam` keeps the old outline to the bit, and `boomLength` defaults to `0.55·√A·1.718` and is overridden when declared.

**Three corrections to the round-16 draft**, each caught by a check §16 asked for:

1. The draft's mainmast at −3.5 m with a 12.5 m boom overhangs the transom by **5.2 m** — it fails §16's own 0–1.5 m rule. Masts moved to fore **+6.2**, main **−1.1**; booms **6.5** and **10.5**; foresail 100 → **80 m²**, mainsail 140 → **150 m²** to keep the proportions sane. Sail area 460 m², still 17.9 m² per tonne^⅔.
2. The draft's cleat positions were outboard of the hull at their own stations — jib sheets at 2.4 m where the hull is 2.24 m half-wide at 8 m forward, braces at 3.2 m where it is 2.79 m. All moved inboard.
3. Pre-existing, untouched, flagged: **the sloop's own cleats sit outboard of its drawn outline** — `CLEAT_LAYOUT` puts them at 0.14–0.20·LWL against a 0.12·LWL half-beam. It reads acceptably because the outline bulges to 0.14 at the shoulder, and fixing it would move the sloop's pixels. A later presentation round's job.

## Step 5, the gaff topsail with the parent's peak up and down

```
parent peak UP:      Aeff 9.000 m2 (A = 9), Fx 156.6 N, Fy -230.7 N              PASS
parent peak DROPPED: Aeff 0 m2, Fx 0 N, Fy 0 N, Mz 0 N*m                         PASS
and in between:      peak 1.0 -> 9.00 m2 / 156.6 N · 0.5 -> 4.50 m2 / 78.3 N
                     · 0 -> 0.00 m2 / 0.0 N                                      PASS
its own halyard:     hoist 1.0 -> 9.00 m2 · 0.5 -> 4.50 m2 · 0 -> 0.00 m2        PASS
no rig view, or above:'nosuchsail': Aeff 0, Fx 0, no NaN                         PASS
the drawing: peak up foot 54.0 px · peak down foot 0.0 px, gaffFrac 0, bundle    PASS
peakRatio: gaff throat 1.0 peak 0.4 -> 0.4 · single hoist 0.6 -> 0.6             PASS
```

So scandalizing the sail below takes the topsail with it, linearly, in the force *and* in the drawing — the first sail in the model whose force depends on another sail's state.

## Step 6, selection walked through

```
nothing selected: KeyE hauls the MAINSHEET — the base rope, the one with no `layer`   PASS
gaff topsail selected: the same KeyE hauls the TOPSAIL's sheet instead                PASS
main selected: KeyE is the mainsheet again — selecting the base sail is not special   PASS
a selected sail has no rope on Digit1, so Digit1 is DEAD rather than working the jib   PASS
the modifiers work on the selected sail: Shift eases it, Space lets it fly             PASS
Tab cycles bow to stern in definition order, then off the end to nothing
    4 sails: main -> staysail -> jib -> gaffTop -> (none)                              PASS
Shift+Tab from nothing selects the last sail, so the cycle runs both ways               PASS
clicking a sail at its own clew picks that sail; open water picks none                  PASS
at the mast, where the main and the topsail above it coincide, the click picks the MAIN PASS
```

In words: **click a sail or one of its cleats to select it; `Tab` / `Shift+Tab` cycle bow to stern and off either end to nothing; `Escape`, a click on open water, or changing ship clears it.** While a sail is selected its grid keys work *that* sail and a key it has no rope on is dead — no silent fall-through, which is the invisible-modifier problem §16 warned about. The selection is visible two ways: a dashed ring round the sail in the schematic with its cleats and labels in the selection colour, and a line under the deck widget naming the sail and which keys are now live.

`Tab` here **cycles** the selection. It is not the hold-`Tab` layer that §16 rejected — nothing is ever held.

One thing the click rule needed: a gaff topsail is tacked at its parent's own hinge, so a click at the mast is ambiguous. Ties go to the sail listed first, which is the big one; reaching the upper sail is a click on its clew or a press of `Tab`, not a pixel hunt.

## Step 6, the reserved-chord table as CHECK 13 asserts it

```
reserved-chord table (SIM.RESERVED_CHORDS), refused by buildControlsFromInput:
  ctrl + any key: Ctrl+W/T/N close, open and switch tabs and cannot be intercepted
                  at all; Ctrl+A/S/D/F/R/Z/X/C/V are select-all, save, bookmark,
                  find, reload, undo, cut, copy, paste
  meta + any key: the OS layer -- Cmd on macOS, the Windows key elsewhere
  alt + any key:  Alt+F/E/D open Chrome's menu and address bar on Windows, and
                  Firefox drops its menu bar on Alt RELEASE whatever the key was
                  -- which is why the sail-above layer became selection (§13 D')

every combination in the table produces no command, even with Shift and Space
  also held — 10 probes across 3 entries, all refused                            PASS
isReservedChord names the entry that refuses, so the reason is reportable        PASS
the layers actually in use (Shift = ease, Space = let fly) are not in the table  PASS
```

The table is the enforcement, not a comment: adding a modifier layer in a later round means arguing with it first.

**The key list as bound**, read out of the definitions:

```
Gaff sloop:       E=MAIN  Q=STAYS'L/port  T=STAYS'L/stbd  1=JIB/port  5=JIB/stbd
Topsail cutter:   the same, plus  W=TOPS'L/port brace  R=TOPS'L/stbd brace
Topsail schooner: 1=JIB/port  5=JIB/stbd  Q=F.STAY'L/port  T=F.STAY'L/stbd  E=FORE
                  W=F.TOPS'L/port brace  R=F.TOPS'L/stbd brace
                  A=M.STAY'L/port  G=M.STAY'L/stbd  D=MAIN  D=M.GAFF T
helm: Num4 / Num6 / Num5 / Num0 / NumEnter · P pause · 0 reset position
modifiers: plain = haul · Shift = ease · hold Space = let fly · Ctrl/Meta = the browser's
```

`D` appears twice on the schooner. That is the point of step 6.

---

## Step 7, the schooner: rows q–u

### (q) Close-hauled under fore-and-aft canvas, topsail furled — **passes**

```
Best VMG close-hauled angle (deg TWA):  52.5    expected 50-58            PASS
SOG at that angle (kn):                  6.75   expected 5-7              PASS
Heel at that angle (deg):                9.79   expected 8-14             PASS
Weather helm to hold her (deg, +ve):     4.38                             observed
Leeway (deg):                            0.91                             observed
The sheet trim that angle wanted:        0.24                             observed
The sweep (TWA -> SOG / VMG, best trim at each angle):
  40.8:5.15/3.79  44.7:5.70/3.95  48.6:6.21/4.02  52.5:6.78/4.04
  56.5:7.10/3.84  60.6:7.19/3.46
```

Two things about how this row is measured, because the first version of it was wrong:

- **VMG is against the track, not the heading.** She crabs to leeward by her leeway angle, so the wind angle made good is TWA + leeway. Measured off the heading, the best angle would always be the highest one tried.
- **The trim is swept at every angle, not held.** My first version used one close-hauled trim across the whole range, and reported that she *cannot sail at TWA 60* — 1.05 kn with 32° of leeway. That was the trim, not the boat: sheeted for 42° the sails are stalled by 60°. Each (angle, trim) pair is now its own run to steady state, and 60° comes out at 7.19 kn.

Weather helm is reported the way (g) does it (`weatherHelm = −deltaR` on starboard tack), so +4.4° means she wants 4.4° of rudder to hold her — a little more than the sloop's +2.3° at the same wind, which is a big main aft doing what a big main aft does.

### (r) The same with the topsail set and braced sharp — **passes**

```
Pointing worsens by (deg, close edge of the groove):  6.40   expected 3-8  PASS
Close edge, topsail furled vs set (deg TWA):          40.8 -> 47.2        observed
SOG at the furled ship's best angle (kn):  6.78 furled vs 6.79 set
                                           (+0.11%)  no better, within 1%  PASS
Best VMG angle either way (deg TWA):  52.5 furled, 52.5 set               observed
Topsail shivering or aback while braced sharp: 100% of the time, alpha 3.4 observed
VMG by angle, furled vs set (kn):
  40.8:3.79/3.24  44.7:3.95/3.48  48.6:4.02/3.74  52.5:4.04/4.04
  56.5:3.84/3.90  60.6:3.46/3.57
```

**A finding worth keeping.** The topsail braced sharp does **not move the best-VMG angle** — it takes away the *high end* of the groove. Measured directly, braced to 55° close-hauled it contributes about **−1000 N** of drive at TWA 41–49 (with the side force to *windward*), crosses zero at about 53°, and is drawing by 60°. So the optimum sits exactly where the sail is neutral and does not move; what goes is her ability to sail high at all.

That is why the row measures pointing as the **close edge of the useful groove** — the lowest angle at which she still makes 90% of her own best VMG — rather than as a shift in the optimum. My first version measured the optimum, found it unchanged, and reported −0.01°. The words "she cannot point as high" are about the edge, not the peak.

### (s) Tack from TWA 50 to TWA 50, topsail furled — **passes**

```
Through the wind in (boat-lengths):    2.62    expected 0-6               PASS
Exit SOG as a fraction of entry:       0.709   expected >= 0.55           PASS
Entry / exit SOG (kn):                 5.82 -> 4.13                      observed
Time through (s):                      35.4                              observed
Miss-stays threshold:                  3.5-2.5 kn                        observed
Entry-speed sweep (kn -> through?):
  5.5:37.5s  4.5:45.9s  3.5:59.7s  2.5:stuck  2:stuck  1.5:stuck  1:stuck
```

She misses stays below about 3 kn, which is the point of §16's instruction to report the threshold as (e) does: a schooner *should* be able to miss stays from slow.

### (t) Wear from TWA 130 to TWA 130, topsail set — **passes**

```
Wear completed in (s):     25.6    expected 0-90                          PASS
Yard swings through square: 40 deg -> min |psiY| 0 deg -> -40 deg         PASS
No NaN anywhere, no sail stuck: true                                      PASS
Exit SOG on the new tack (kn):  5.75                                      observed
```

### (u) Heave-to — **three of four; one honest FAIL**

```
Drift over the ground (kn):                          1.30  expected 0-1.5  PASS
Heel oscillation, second half vs first:              0.99  expected 0-1.05 PASS
Closest she comes to the wind while lying (deg TWA): 9.67  expected >= 30  FAIL
Fore topsail aback:                    100% of the settled window          PASS
Lies at (deg off the true wind):  54.4 mean, ranging 9.7-82.1
                                  (72.5 deg of swing)                     observed
Forereach / leeway (kn):          -0.58 ahead, 0.65 sideways              observed
With the fore staysail ALSO backed (not in the brief):
  lies 55.3-97.8 deg (swing 42.4), drift 1.21 kn, forereach +0.18 kn,
  heel sd 0.34 vs 0.96                                                    observed
No NaN: true                                                              PASS
```

Set up exactly as §16 words it — fore-topsail backed, mainsheet hard in (0.05), helm lashed a-lee, headsails let fly — she does not lie quietly. She **hunts on a ~150 s period between TWA 10° and 82°**: the 150 m² main sheeted hard rounds her up until she is head to wind and stops driving, then the 70 m² backed topsail slowly pays her off until the main fills again. Steady, not diverging — which is why the variance-ratio test passes at 0.99 — but coming to 10° off the wind is luffing into irons, not heaving-to.

Two measurement notes, since the first version of this row was wrong twice:

- The **helm sign**. I lashed −35°, copying the sloop's (f). (f) is on *port* tack when it lashes (it has just tacked); this row never leaves starboard, where a-lee is the tiller to port, `deltaR = +35`. With the wrong sign she made 1.9 kn of sternway.
- The **window**. She hunts on ~150 s and my window was 90 s, so the two halves sampled different parts of one swing and the oscillation ratio read 2.44. The window is now the last 300 s of a 600 s run — round 13's lesson in a new place: a slow transient has to be measured over more than one period of itself.

**Backing the fore staysail as well fixes it**, and it is what a crew actually does to heave a schooner to: she then lies between 55° and 98°, forereaching gently at +0.18 kn instead of making sternway, with a third of the heel movement. That is an addition to the setup §16 specifies, so it is reported as a diagnostic and the criterion is left against the brief. **This is a decision for you, not something I should change: should row (u) back a headsail too?**

---

## Which `[assumed]` hull numbers were tuned, and against what

**One: `cU`, 1200 → 400, tuned on (q).** Nothing else moved.

The round-16 draft scaled `cU` with wetted area, `L²` — the sloop's 130 × (24/7)² ≈ 1530, rounded to 1200. That gave 3.7 kn close-hauled against (q)'s 5–7 kn band. The reason is worth keeping, because it will come back for the brig:

> Both rigs carry the same canvas for their size — sail area / displacement^(2/3) is **18.3 on the sloop and 17.9 on the schooner** — so sail *drive* also scales as `L²`. If drag scales as `L²` too, the two cancel and the long hull sails at the *same speed* as the short one instead of faster. The real pair is not like that: a 24 m schooner in 12 kn of wind does 5–7 kn close-hauled where a 7 m gaff sloop does 4. So in this model's single-coefficient form, `cU` has to grow a little more slowly than **length** — 400/130 = 3.1 over a length ratio of 3.4 — not as its square.

At `cU` 400, (q) reads 52.5° / 6.75 kn / 9.8° heel: all three criteria in band on the first value tried after the sweep.

**Held at their scaled values, and this is a result rather than an omission:**

- **`xCLR` 1.0** — swept to 1.8 and 2.6; the helm went from +4.4° to +4.8° to +5.2° of weather helm, i.e. the knob works in the direction the tooltip claims but weakly, because `kHeelYaw` dominates at this size. Locked amidships she rounds up from every value tried, including `xCLR` −1.0. +4.4° is seamanlike and (q) has no helm criterion, so it stays where the geometry put it.
- **`Nr` 550000** — (s) passes on it: through in 2.6 boat-lengths keeping 71% of her speed. Lowering it to 300000 and 180000 shortened the tack to 27 s and 25 s from 33 s, which is *better* but not needed, and the scaled value is the defensible one.
- **`cV` 75000** — (u)'s drift passes on it (1.30 kn). Raising it to 150000 and 300000 made heaving-to *worse*, not better: she made 1.95 kn of sternway instead of lying. The knob was not the problem; the helm sign was.

Everything else — `m`, `LWL`, `beam`, `Iz`, `Ix`, `GM`, `kWave`, `kHeelYaw`, `Nrr`, `cPhi`, `xR`, `AR`, `CnSlope`, `Awind`, `zWind` — is untouched from the round-16 first pass. They are still `[assumed]`; nothing in q–u contradicted them, which is weaker than confirming them.

**The `handling` block** was not tuned either. Its six values are still the report's first pass, and the only one q–u pressed on is `easeRate` 0.25 against `haulRateMax` 0.08 — ease must outrun haul or round 16's brace refusal would stall a brace change, and 0.25 > 0.08 holds.

---

## What the definition still cannot express

Carried forward from round 16, less what step 5 delivered:

1. **Reefing** — area and `zCE` both change with the reef, and no hoist kind expresses it.
2. **Wind gradient with height (§4).** Without it `zCE` affects heel but not drive, so a topsail high up is worth no more per square metre than a course, and per-yard trim offsets still fail §13 D′'s rule 1.
3. **Grouped lines** — one key moving several. Trivial on a one-yard rig; essential on the brig, and step 6 deliberately built only the *select* half of §13 D′.
4. **Blanketing between fore-and-aft sails** — round 18, by §16's decision. CHECK 19 now asserts the deferral for all three shipped rigs rather than leaving it as a remembered fact: the schooner declares one banded sail and nothing is shaded, so **her fore does keep drawing in the main's lee**, exactly as §16 records.
5. **Stay sag, bowlines, lifts** — all still borderline or deferred under D′, and none has physics.

New this round:

6. **A sail's trim limit cannot depend on the sail it is set above.** The gaff topsail is sheeted to its parent's gaff, so its real clew range follows the parent's boom; it gets a fixed `deltaLim: 60` instead. The plumbing to fix it exists now (`rig` reaches `trimInterval` in the same way), but no round has asked for it.
7. **A ship cannot say how her crew heaves her to.** (u) shows the manoeuvre is a property of the rig — back the topsail on a brig, back a headsail on a schooner — and nothing in the definition carries that. It matters once there are acceptance sets per ship, which there now are.

## Files

`index.html` is the build. `render-checks.mjs` has four new groups (CHECK 20 hull outline and declared cleats, 21 booms and burgee, 22 stays, 23 gaff topsail and sibling state) and an extended CHECK 13 and 19. `run-scenarios.mjs` gained one fix: `runSanityChecks` looked up the sail id `'main'`, which a schooner does not have — it now takes the ship's first `gaff` sail by role, which is still `main` on the sloop and cutter, so their printed numbers do not move.
