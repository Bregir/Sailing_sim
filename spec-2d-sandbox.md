---
title: Gaff Sloop Physics Sandbox — Implementation Brief
type: spec
tags:
  - sejlsim
  - spec
  - dispatch-brief
updated: 2026-10-04
---

# Gaff Sloop Physics Sandbox — Implementation Brief

> Self-contained brief for a coding agent (target model: Sonnet). It inherits no other instructions — everything needed is here. Read all of it before writing code.

## 1. What to build

A single self-contained `index.html` (vanilla JS + `<canvas>`, no dependencies, no build step, must run from `file://`) that simulates a small gaff-rigged sloop seen top-down, with hands-on controls for tiller, sheets and halyards, and a tuning panel for every physical coefficient.

Purpose: tune the *feel* of the sailing model before any 3D or first-person work exists. It is a physics sandbox, not a game. No scoring, no scenery, no 3D.

Success is defined by the acceptance scenarios in §9, measured with real numbers — not by the code looking right.

## 2. Conventions

- SI units internally (m, s, kg, N, rad). UI shows degrees and knots (1 kn = 0.5144 m/s).
- World frame: x east, y north. Compass angles clockwise from north, 0 = north. Canvas y is inverted — handle it in the renderer only.
- Boat frame: x forward (surge, velocity `u`), y to starboard (sway, velocity `v`). Yaw rate `r` positive = bow turning to starboard. Heel `phi` positive = heeled to starboard (leaning right).
- Wind direction is where the wind comes **from** (meteorological). True wind speed `TWS`, direction `TWD`. Apparent wind angle `AWA` in boat frame, signed: positive = wind from starboard (starboard tack), range −180..180. `AWS` = apparent wind speed.
- Sail/clew angle `delta` per sail: angle of the boom (main) or clew (jibs) off the centreline, positive = clew to starboard. Leeward = the side opposite the wind: on starboard tack (AWA > 0) the sails want negative `delta`.
- Geometric incidence `i = AWA + delta` (signed; its sign says which face the wind strikes). The angle of attack used in the coefficient tables is the *effective* one, `alphaE = s·i + i0` (camber side `s`, offset `i0`), defined in §5.

## 3. State

Boat: position `(x, y)`, heading `psi`, body velocities `(u, v)`, yaw rate `r`, heel `phi`, heel rate `phidot`.

Per sail (main, staysail, jib): halyard hoist `h` in 0..1 (main has two: throat `hT`, peak `hP`), current clew angle `delta`, camber side `camberSide` (±1, §5), flags `luffing`, `aback`.

Sheets, all as **ease** `e` in 0..1 (0 = hauled flat amidships, 1 = fully eased, no restraint): main `eM` (one sheet, symmetric); staysail `eSp`, `eSs` (port, starboard); jib `eJp`, `eJs`.

Rudder angle `deltaR` (−35°..+35°, positive = rudder blade to starboard, which turns the bow to **starboard** when moving ahead), `lashed` flag.

## 4. Wind

UI sets base `TWS` (0–15 m/s) and `TWD`. Optional "live wind" toggle adds: direction wander ±10° with a ~60 s period, speed gusts ±30% with a ~10–20 s period, both from smoothed noise (sum of two or three sines with irrational period ratios is fine; no library).

True wind vector as a **flow** (direction the air moves) in world frame, rotated into the boat frame. Apparent wind flow = true wind flow − boat velocity (boat frame). Derive `AWS`, `AWA` (sign per §2). Expose `TWA` (true wind angle, same sign convention) for the readouts.

## 5. Sail model

Each sail has: area `A` (m²), centre of effort `xCE` along the centreline relative to the hull's centre of lateral resistance (CLR, which is the boat-frame origin; positive = forward), `zCE` height above the waterline, and a max clew angle `deltaLim`.

Defaults (roughly an 8 m gaff sloop):

| Sail | A | xCE | zCE | deltaLim | i0 |
|---|---|---|---|---|---|
| Main (gaff) | 28 | −1.3 | 4.5 | 80° | 3° |
| Staysail | 8 | +2.4 | 3.0 | 90° | 8° |
| Jib | 10 | +4.0 | 3.5 | 90° | 8° |

`i0` is each sail's **incidence offset** — camber plus the slot effect, defined below. Also in config: `iFlip = 8°`.

**Effective area.** Jibs and staysail: `Aeff = A · h · cos(phi)`. Main: `Aeff = A · hT · (0.6 + 0.4·pk) · cos(phi)` where `pk = clamp(hP / max(hT, 0.05), 0, 1)`. Lift multiplier for the main: `qShape = 0.5 + 0.5·pk` — a peak set lower than the throat gives a baggy, twisted sail. Dropping the peak with the throat up is **scandalizing** and should cut drive by roughly half.

**Clew freedom from sheets.** Each sheet is a rope of fixed length from the clew to a fairlead on its own side of the deck, so it limits the clew's excursion *in every direction*, not only outboard. Model it as an interval on `delta`:

- Main (single sheet, near the centreline): `delta ∈ [−eM·deltaLim, +eM·deltaLim]`.
- A port sheet with ease `ep`: `delta ∈ [−ep·deltaLim, ep·deltaLim − beta]`, `beta = 20°` (fairlead offset). A starboard sheet with ease `es`: `delta ∈ [−(es·deltaLim − beta), es·deltaLim]`. If a single sheet's interval inverts (upper bound below lower — happens when that sheet is nearly fully hauled), collapse it to its lower bound: the clew sits where the sheet holds it. The jib's allowed interval is the **intersection** of both sheets' intervals. If the intersection is empty (both hauled hard) the sail sits at `delta = 0`, flat on the centreline.

This is what makes a backed jib emerge on its own: after a tack with the old working sheet still made fast, the clew is held near the centreline on the new windward side.

**Where the wind wants the clew.** A free sail streams where its force is zero, which for a cambered sail is a little *beyond* the wind: `deltaFree = clamp(−AWA − s·i0, −deltaLim, +deltaLim)` with `s` the sail's camber side (below). Actual `delta` moves toward `deltaFree` with a first-order lag whose rate scales with wind pressure: rate `= kBoom · AWS` (default `kBoom = 12 °/s per m/s`, so at 5 m/s the boom swings 60°/s), then clamped into the allowed interval. A gybe (AWA changing sign dead downwind) therefore swings the boom across on its own, fast, unless the sheet stops it.

**Incidence.** Signed geometric incidence `i = AWA + delta`, wrapped to −180..180 (both in degrees; `delta` positive = clew to starboard, so the chord's leading direction is `−delta`). Check: wind from starboard at AWA +45 with the clew 20° to port (`delta = −20`) gives `i = 25` — a drawing sail. The sign of `i` says which face the wind strikes.

**Camber and the slot — why a sail is not a flat plate.** A cloth sail has camber, so it makes lift at zero geometric incidence and only collapses when the wind gets round onto its back. On a sloop the main's circulation also bends the air ahead of it upward onto the jib (upwash), while the jib's downwash flattens the flow onto the main — so the jib draws at a smaller geometric angle than the main does and, when pinching, the main is the first to luff. Both are one offset per sail, `i0` (table above: jibs 8°, main 3°), and one piece of state per sail, the **camber side** `s ∈ {+1, −1}` (`+1` = camber bulging to port, lift to port):

1. Initialise `s = sign(i)` (or +1 if `i = 0`) the first time the sail is computed.
2. If `s·i < −iFlip` (the wind is well onto the back of the camber) flip `s = −s` — the sail snaps across and fills on the other side. This hysteresis is what makes a backed sail fill *as* a backed sail rather than flutter about zero.
3. Effective angle of attack `alphaE = s·i + i0`. If `alphaE < 0` the sail is **collapsed** — set `alphaE = 0` (no lift, only `Cd(0)` drag). Use `alpha = min(alphaE, 90)` in the coefficient tables.
4. **Lift acts to port when `s > 0`, to starboard when `s < 0`**, perpendicular to the apparent wind flow; drag always along the flow.

`luffing = s·i < 4°` is the display flag (the luff is lifting or the sail has collapsed). `aback` is also only a display flag: set it when the clew is on the windward side, i.e. `sign(delta) == sign(AWA)` with both non-zero.

The consequence that matters most: coming out of a tack, the jibs (sheeted to 18°, `i0` 8) fill once `|AWA|` passes 10°, the main (12°, `i0` 3) at 9° — so the headsails pull the bow off onto the new course before the main can round it up. With flat-plate sails (round 4 and earlier) the jibs did not fill until 22° and the main rounded the boat up into irons every time; traced tick by tick on the Cowork side, that was the whole d-switch failure.

Coefficient tables on `|alpha|` in degrees, linear interpolation, all editable in the tuning panel:

| |alpha| | 0 | 4 | 10 | 20 | 25 | 30 | 45 | 60 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|
| Cl | 0 | 0.20 | 0.70 | 1.35 | 1.50 | 1.30 | 0.90 | 0.60 | 0 |
| Cd | 0.05 | 0.08 | 0.15 | 0.25 | 0.32 | 0.42 | 0.90 | 1.05 | 1.20 |

The 10–30° drag values are deliberately high (best lift/drag ≈ 5, not 9): a low-aspect gaff rig with a sagging luff and a twisted head has heavy induced drag, and that — not the hull — is what stops it pointing higher than ~45° true. Past stall (45° and up) the table is flat-plate-like: the resultant is normal to the chord (`Cd/Cl = tan alpha`), so a sail held near the centreline and struck at a large angle pushes sideways, not forward.

Forces: `q = 0.5 · 1.225 · AWS²`. Lift `L = q · Aeff · Cl · qShape` (qShape = 1 for jibs) perpendicular to the apparent wind flow, on the side given by the camber side `s`; drag `D = q · Aeff · Cd` along the apparent wind flow. Resolve both into boat-frame drive `Fx` and side force `Fy`.

Sanity check the agent must run and print: AWA +45°, `delta = −20°`, AWS 6 m/s, main fully set, heel 0 → `Fx > 0` and `Fy < 0` (drive forward, side force to port; with the defaults ≈ +437 N / −768 N). Then AWA −45°, `delta = −2°` → `Fy > 0` and `|Fx| < 0.3·|Fy|` (backed: pushed to starboard, essentially no drive).

Per-sail moments about the boat origin:

- Yaw from side force: `Mz += Fy · xCE`. (A sail forward of the CLR pushes the bow off the wind; the main, aft, pulls it up.)
- Yaw from heel — the physical origin of weather helm: when heeled, the drive force acts offset to leeward by `zCE · sin(phi)`, so `Mz += −Fx · zCE · sin(phi)` with the sign chosen so it turns the bow **toward the wind**. Verify the sign numerically on both tacks.
- Heel: `Mx += Fy · zCE`.

## 6. Hull, keel, rudder

Defaults: mass `m = 4000 kg`, `LWL = 7.0 m`, yaw inertia `Iz = m · (LWL/4)²`, roll inertia `Ix = m · 1.0²`, `GM = 1.0 m`, water density `rhoW = 1025`.

- **Surge drag:** `Fx −= cU · u · |u| · (1 + kWave · (|u|/vHull)^6)`, `vHull = 1.25·sqrt(LWL)` m/s (≈ 3.3 m/s ≈ 6.4 kn). Default `cU = 130` (N·s²/m²), `kWave = 0.5`. Tune `cU` so scenario (c) lands in range.
- **Sway (keel):** `FyKeel = −cV · v · sqrt(u² + v²)`, default `cV = 6500`. Tune so close-hauled leeway is 3–6°. It acts at `xCLR` (default `+0.3 m`, i.e. slightly forward of the origin) **only to the extent the water flows along the keel**: `Fy += FyKeel` and `Mz += FyKeel · xCLR · (|u| / V)` with `V = sqrt(u² + v²)` (guard `V ≈ 0`). Sailing with a few degrees of leeway the factor is ~1; a boat drifting sideways with sails down has `u ≈ 0`, no lever, and lies beam-on as a real one does. `xCLR` is the **one balance knob**: moving it forward adds weather helm at all wind speeds (the keel's resisting force then pulls the bow up), moving it aft adds lee helm. Sign check: starboard tack → sails push to port → boat slides to port (`v < 0`) → keel force to starboard → with `xCLR > 0` the bow turns to starboard, toward the wind.
- **Heel-induced weather helm (hull).** A heeled hull's immersed shape is asymmetric and tries to round up; on most boats this, not the sail-plan offset, is the main source of weather helm, and it is what lets the mainsheet trim the balance (more main → more heel → more weather helm). `Mz += −kHeelYaw · u·|u| · sin(phi)`, default `kHeelYaw = 1500` (N·m per m²/s²). Sign check: starboard tack heels to port (`phi < 0`), so the term is positive — bow to starboard, toward the wind. It scales with speed², so it is absent at a tack exit and does not change the irons threshold.
- **Windage:** hull + rig drag downwind, `q_air · Awind · 1.0` with `Awind = 8 m²`, applied at the origin at height `zWind = 1.5 m` (adds a little heel). This gives drift when hove-to or with sails down.
- **Rudder** — model it as a flat plate hinged at `xR = −3.8 m`, area `AR = 0.9 m²`, so the sign can never be wrong and sternway needs no special case:
  1. Water velocity at the rudder in the boat frame: `(u, v + r·xR)`. Flow relative to the blade: `w = (−u, −(v + r·xR))`.
  2. Blade unit normal for rudder angle `deltaR` (positive = trailing edge to starboard): `n = (sin deltaR, cos deltaR)`.
  3. Normal flow component `wn = w · n` (signed). Effective incidence `alphaR = asin(wn / |w|)`; `Cn(|alphaR|) = CnSlope · sin(|alphaR|)` capped at 30°, then falling linearly to 0.5 at 60° and holding. `CnSlope` is a config value (tuning panel, JSON export), default **2.7 per radian** — the lift slope of a foil of aspect ratio ~1.5 (`2π·AR/(AR+2)`), not the 2D value 4.4 used in rounds 1–8. A rudder held amidships resists yaw through this same slope, so it also sets how much the sails can steer the boat.
  4. Force on the blade `F_R = 0.5 · rhoW · AR · Cn(|alphaR|) · |w|² · sign(wn) · n` — magnitude from the coefficient and the full flow speed squared, direction along the normal on the side the flow pushes. (Rounds 1–3 used `|w| · wn` here, which multiplies `Cn` by an extra `sin alphaR` and made the rudder three times too weak at 20°.) Apply at `(xR, 0)`: `Fx += F_R.x`, `Fy += F_R.y`, `Mz += xR · F_R.y`.
  
  Sanity check the agent must run and print: moving ahead at 2 m/s with `deltaR = +20°`, `Mz` must be **positive** (bow to starboard) and roughly 6 kN·m (5.5–6.5 with `CnSlope = 2.7`; it was ~9.9 with the old 2D slope); with `u = −1 m/s` (sternway) and the same rudder, `Mz` must be **negative**.
- **Yaw damping** — comes from the hull's lateral resistance and therefore **scales with forward speed**: `Mz −= (Nr · |u| + Nrr · |r|) · r`, defaults `Nr = 4000` (N·m·s² per m·rad), `Nrr = 5000` (N·m·s²). The small `Nrr` term only stops a stationary boat spinning forever. Note that the rudder already damps yaw on its own — in a turn the stern's sideways motion (`r · xR`) reduces the blade's incidence and roughly halves its force — so `Nr` is only the *additional* hull damping; the value 16000 tried in round 2 double-counted it and gave 2.7 °/s; 7000 was set against the round-3 rudder and was lowered to 4000 in round 9 once the rudder's own slope was corrected. With this form, damping and rudder authority fade together as the boat slows, so a tack stays crisp at 4 kn and becomes marginal near 1 kn. (A speed-independent `r·|r|` form was tried in round 1 and cannot satisfy both (d) and (e) — do not go back to it.) Sanity check the agent must run and print: steady turn rate with `deltaR = 20°` at `u = 2 m/s` (held), sails down — expect 7–11 °/s. (A real 8 m keelboat turns in two to three boat lengths; the geometric ceiling, where the blade merely aligns with the flow, is `u·tan(deltaR)/|xR|` ≈ 11 °/s here.)
- **Roll damping:** `Mx −= cPhi · phidot`, default `cPhi = 8000` (round 13; damping ratio ≈ 0.3 against the ~2 s natural roll period, so sheeting home at low speed heels the boat past its equilibrium and it stands back up as the roll settles — the round-1 value 2.5e4 was critical damping and hid this). Floor ~5000 before the hove-to scenario (f) starts to ring.
- **Righting moment:** `Mx −= m · 9.81 · GM · sin(phi)`.

Equations of motion in the boat frame (semi-implicit Euler, fixed step `dt = 1/120 s`, accumulate to real time, render each animation frame): `u̇ = Fx/m + r·v`, `v̇ = Fy/m − r·u`, `ṙ = Mz/Iz`, `φ̈ = Mx/Ix`, then rotate `(u, v)` by `psi` into world velocity and integrate position. Time scale control 0.5×–4× and pause.

## 7. Controls

Everything has a slider **and** a key. Haul rate on a sheet is limited by the load on it: `haulRate = 0.25/s · (1 − 0.7 · min(load/loadRef, 1))` where `load` is the current |force| on that sail and `loadRef = 1500 N`; easing is always at 0.5/s. Halyards move at 0.1/s (a full hoist takes ~10 s).

Suggested keys (document them on screen): `A` turns the bow to **port**, `D` to starboard — game convention, so `A` pushes the tiller to starboard (rate 40°/s, spring-free — it stays where you leave it); the tiller widget still shows the tiller. `L` lash/unlash; main `Q` haul / `E` ease; jib starboard sheet `R`/`F`, jib port sheet `T`/`G`; staysail starboard `Y`/`H`, staysail port `U`/`J`; halyards via sliders only. `Space` pause, `0` reset position. The tiller widget is also mouse-draggable. Label it **tiller**: pushing the tiller to port turns the bow to starboard — get this right and say so on the widget.

Wind: sliders for TWS and TWD, "live wind" toggle. A "test autopilot" toggle (heading-hold P controller on `deltaR`, gain `apKp = 3`, editable) exists **only** so scenarios can hold a course; it is off by default and clearly labelled.

Tuning panel: every coefficient and table value in §5–6 as a number input, with reset-to-defaults, export JSON, import JSON.

## 8. Display

Top-down canvas, camera following the boat, north-up (toggle heading-up). **Scale:** default so the hull's LWL spans about 25% of the canvas height (`scale ≈ 0.25·canvasHeight/LWL` px/m, recomputed on resize); mouse-wheel zooms between 4 and 40 px/m and a slider shows the value. Draw the boat in the boat frame with bow up before rotation; **positive `delta` is to starboard, which is +x on screen — check the main and the jibs against the same rule** (round 5 shipped the main mirrored).

**Water that moves.** The static grid alone gives no sense of motion. Add, cheapest first: (1) two layers of faint wave crests — long, low-contrast bands perpendicular to the true wind, drifting downwind at ~0.6·TWS, phase driven by simulated time only; (2) a bow wave — two short curved white strokes from the stem spreading aft, length and opacity proportional to SOG, gone below 0.3 kn; (3) a foam wake — the existing 30 s track drawn as a band whose width grows with speed and whose opacity fades with age, so the leeway angle between heading line and wake stays readable. Keep the faint grid underneath for scale.

**Boat.** Hull outline; mast as a dot; main as a filled quadrilateral (boom + gaff) at `delta`; jibs as curved lines from tack to clew; a **tiller** drawn at the stern at the rudder angle (tiller to port when the rudder is to starboard), so the helm is visible without reading a number. Sail colour: drawing = white, luffing = grey with a flutter, aback = orange. A true-wind arrow in a corner, an apparent-wind arrow (burgee) at the mast, a heading line and a course-over-ground line from the bow.

**Panel.** Base font 14 px, readouts 13 px, sliders tall enough to grab; the panel may scroll. Readouts (numbers, not gauges): SOG kn, heading, TWS/TWA, AWS/AWA, heel °, leeway °, rudder °, and a **helm balance** bar: the yaw moment from sails + heel alone (what the helmsman is holding against), signed weather/lee. Per sail: hoist, sheet interval, delta, alpha, state.

## 9. Acceptance scenarios

Each is a preset button that sets wind, sails, sheets, rudder/autopilot, and boat state, runs for the stated time, and prints measured values next to the expected range with a pass/fail mark. Run every one before reporting.

| # | Setup | Expected |
|---|---|---|
| a | TWS 6 m/s. All sails full. eM 0.15, working jib/staysail sheets 0.20, lazy sheets 1.0. Autopilot holds TWA 45°. 90 s. | Steady SOG 3.5–4.5 kn; leeway 3–6°; heel 10–20°. |
| b | As (a) but autopilot TWA 30°. | SOG below 60% of (a)'s and total drive below 50% of (a)'s — pinching costs nearly half the speed. |
| c | TWS 6. Autopilot TWA 90°, eM 0.55, working sheets 0.55. Then TWA 135°, eM 0.85, sheets 0.85. Then TWA 180°, eM 0.9, sheets 0.9. 90 s each. | Beam or broad reach is the fastest point (5.5–6.5 kn); run slowest (4–5 kn) with AWS < TWS. |
| d | From (a) steady state: rudder 25° toward the wind until heading has passed TWD by 45°, then autopilot on the new tack. Two variants: sheets switched at head-to-wind, and sheets **not** switched. | Tack completes in < 20 s, exit speed > 2 kn. Unswitched variant: jib flagged aback, bow driven through faster, then boat stalls/pays off until the sheets are switched. |
| e | As (d) with sheets switched, but sweep the start speed: 2.0, 1.5, 1.0, 0.75, 0.5, 0.25 kn. For each, record whether the tack completes (heading passes TWD by 45° within 40 s) or the boat ends in irons (heading stays within ±20° of TWD and `u` goes negative). | A threshold exists **between 0.25 and 1.5 kn**: above it the tack completes, below it the boat ends in irons with sternway. Report the threshold; if even 0.25 kn completes, report that as a finding. With sternway the bow falls off and the helm effect is reversed (observe manually; not auto-measured). |
| f | Start exactly as (a) (TWA 45°, sheets 0.15/0.20) but TWS 8 and eM 0.3; reach steady state. Tack with **25°** rudder without touching the jib sheets; when heading has passed TWD by 45°, lash the tiller to leeward hard over (rudder 35° to windward) and leave everything. 120 s. | Boat settles 40–70° off the wind, SOG < 2 kn (forereaching slowly), drifting to leeward 0.5–1.5 kn, no oscillation growing over the last 30 s. |
| g | Autopilot TWA 60°, eM 0.3, TWS stepped 4 → 6 → 8 → 10, 40 s each. Then eM 0.6 at 10. Then hT = hP = 0. | Measure the rudder **signed** (weather helm positive). Heel and signed rudder both increase monotonically with TWS; at 4 m/s the rudder is within ±2° of neutral and at 6 m/s it shows **+1 to +4° of weather helm** (a boat should want to luff, gently, with all sails set); easing the main reduces both and takes the helm to lee or near neutral; with the main down the helm goes to lee (bow falls off). |
| h | Beam reach steady at TWS 6 (trim as in (c)); set hP = 0 with hT = 1. | Drive force drops 35–65%, heel drops, speed falls. |
| i | Run, TWA 170°, eM 0.9. Steer through dead downwind to TWA −150°. Variant: eM 0.1 first. | Boom crosses within ~1 s and boat heels and rounds up hard; sheeted-in variant crosses gently. |
| j | All sails down, TWS 10, rudder amidships and free (the rudder stays in the model — never remove or zero it for a scenario). 60 s. | Lies a-hull between beam-on and wind-on-the-quarter (90–150° off the wind) and drifts 1–2.5 kn. Report the angle. |
| k | **In-irons recovery.** Start stopped, head to wind, TWS 6, all sails up, all sheets fully eased, tiller amidships. At t = 5 s haul the jib's **port** sheet to 0.1 (backing the jib on the port side). When heading is 40° off the wind, release it to 1.0, haul the starboard jib and staysail sheets to 0.2, main to 0.15. 90 s. | Backing the jib pays the bow off to **starboard** (away from the backed side) within 20 s; after sheeting normally the boat accelerates to > 2.5 kn on port tack. |

| l | **Sail steering.** From (a)'s steady state, helm amidships and unlashed (rudder 0°, no autopilot). Variant 1: ease the main fully (`eM = 1`). Variant 2: ease both jib and staysail working sheets fully. 12 s each; measure the mean yaw rate over the last 6 s. | Variant 1 bears away (bow to leeward) at **≥ 3 °/s**; variant 2 rounds up (bow to windward) at **≥ 1.2 °/s**. |

If a scenario fails, adjust **defaults** within physically plausible ranges (say which ones and why) rather than changing the model, unless the model is clearly wrong — then say what and why.

## 10. Code shape and rules

- One file. Sections in this order, each behind a clear comment banner: `CONFIG` (all defaults, with unit and one-line meaning per value), `WIND`, `SAILS`, `HULL`, `INTEGRATOR`, `CONTROLS`, `RENDER`, `SCENARIOS`, `MAIN`.
- Physics must not depend on frame rate. Comments in English. No frameworks, no external assets, no localStorage.
- Do not add features beyond this brief (no 3D, no crew, no damage, no scenery). Where the brief is silent, choose the simplest thing and note it.
- Never report a scenario as passing from reading the code — run it and report the measured numbers.
- One model for all scenarios. A scenario may set wind, sails, sheets, rudder and initial state — never alter the physics or a config value for one scenario (no per-scenario `AR = 0` or similar). If a scenario seems to need such a workaround, that is a finding for the report, not a fix.

## 11. Report back

At most 300 words: the three sanity checks (§5 sail forces, §6 rudder sign, §6 turn rate) with printed values; a table of the twelve scenarios with measured values and pass/fail; a list of default values changed from this brief with one reason each; anything in the model you believe is wrong, in one line each. Deliver `index.html` alongside.

## 12. Revision log

**Round 1 (2026-09-04, built).** 8/11 scenarios passed. The agent's default changes `cU 60→130`, `cV 2500→6500`, `kWave 3→0.5`, `AR 0.6→0.9`, `cPhi 6e4→2.5e4`, `apKp = 3` are accepted and are now the values in §5–7. Its `cR 4e5→1500` is **not** accepted: at that value the boat has effectively no yaw damping, which is the shared root cause of the (e) and (f) failures and of the "structural conflict" the report described.

**Round 2 (this revision) — four changes; implement all, then re-run everything:**

1. **§6 yaw damping** — replace `cR · r · |r|` with `(Nr · |u| + Nrr · |r|) · r` (`Nr = 16000`, `Nrr = 5000`). Remove `cR` from config and the tuning panel; add `Nr`, `Nrr`. New printed sanity check: steady turn rate, 20° rudder, 2 m/s, sails down → 4–8 °/s.
2. **§5 Cd table** — raise 4–30° drag to `0.08 / 0.15 / 0.25 / 0.32 / 0.42`. Fixes (b) pointing too high. Expect (a) and (c) to shift; re-tune `cU`/`cV` within range if needed and report the change.
3. **§5 main `xCE`** — `−0.6 → −1.3`. Removes the ~9° lee helm at 4 m/s seen in (g).
4. **§9 scenarios** — (e) becomes a start-speed sweep that reports the irons threshold; (g) is measured signed and gains a light-air neutrality criterion. Update the harness accordingly.

Expected after round 2: (b), (e), (f), (g) pass; (a), (c), (d) may need small default re-tuning; the rest unchanged. If (f) still forereaches above 1.5 kn after the damping change, report it as a model question rather than tuning it away.

**Round 2 (built).** The speed-scaled damping form is right, but `Nr = 16000` double-counted the rudder's own inflow damping: measured turn rate 2.7 °/s against the 4–8 °/s target, which is why (d), (e) and (f) all failed to get through the tack. (b) now passes on its two real criteria (1.53 kn, drive 0.36); the "intermittent luffing" clause was unmeasurable and is dropped. (g) is monotonic signed but still shows 6° lee helm in light air.

**Round 3 (this revision) — three changes; implement all, then re-run everything:**

1. **§6 `Nr` 16000 → 7000.** Turn-rate sanity check unchanged (4–8 °/s at 20°, 2 m/s). Scenario (d) limit relaxed to < 20 s.
2. **§6 keel lever `xCLR`** (new config value, default 0.5 m, in the tuning panel and the JSON export): keel side force now produces `Mz += FyKeel · xCLR`. In scenario (g), tune `xCLR` within 0–1.5 m until the 4 m/s rudder is within ±3°, then keep that value everywhere and report it.
3. **§9 (b)** — luffing clause removed.

Order matters: fix `Nr`, confirm the turn rate, then tune `xCLR` on (g), then run the full set. Expected after round 3: all eleven pass. If (f) completes its tack but then forereaches above 1.5 kn hove-to, report it as a model question, not a tuning problem.

**Round 3 (built).** `xCLR = 0.3` chosen on (g), which now passes fully; (b) passes. (d-switch), (e) and (f) still fail to get through the tack; (j) newly fails (weathervanes and runs off at 2.9 kn). Root cause found in the brief itself: the §6 rudder force used `|w| · wn`, an extra factor `sin alphaR`, making the rudder ~3× too weak — measured `Mz = 3390 N·m` at 20°/2 m/s where ~9900 is right. The agent had also zeroed `AR` for scenario (j), a per-scenario override that hid the keel-lever problem in earlier rounds.

**Round 4 (this revision) — four changes; implement all, then re-run everything:**

1. **§6 rudder force** — `F_R = 0.5·rhoW·AR·Cn(|alphaR|)·|w|²·sign(wn)·n`. Sign checks unchanged; the ahead check should now print ~9–10 kN·m. Turn-rate sanity target becomes 7–11 °/s; `Nr` stays 7000.
2. **§6 keel lever** — `Mz += FyKeel·xCLR·(|u|/V)`. `xCLR` default is now 0.3 (the round-3 value). Re-check (g) at 4 m/s; if it drifts out of ±3°, re-tune `xCLR` within 0–1.5 and report.
3. **§9 (j)** — remove the `AR = 0` override; rudder amidships and free. New §10 rule: one model for all scenarios.
4. **§9 (e)** — threshold window 0.25–1.5 kn; a tack that completes even from 0.25 kn is a finding, not a failure.

Order: fix the rudder, print the ahead-Mz and turn-rate checks, then the keel lever, then (g), then everything. Expected after round 4: all eleven pass. Two things I want reported even if they pass: the (e) threshold, and (f)'s hove-to forereaching speed.

**Round 4 (built).** Rudder now right (9.9 kN·m, 7.7 °/s); (g) fully passes; d-noswitch and k pass. d-switch, e, f, j still failed. Rather than reason from the report again, the Cowork side pulled `index.html` and the harness into its own workspace and traced d-switch tick by tick. Finding: the sails were flat plates — zero lift at zero incidence — so after head-to-wind the jibs (sheeted 18°) did not fill until AWA 22° while the main (12°) filled at 16° and, sitting 1.3 m aft of the CLR, rounded the boat back up into irons every time. Real sails have camber and the jib sits in the main's upwash, so the headsails fill first. Adding that (below) made d-switch complete in 14.8 s with 2.9 kn exit and gave an (e) irons threshold of 0.25–0.5 kn, in a patched copy on the Cowork side — same harness, same config otherwise. The same tracing showed (f)'s scenario never tacked at all (it started at TWA 35° with 35° of stalled rudder), and that (j) lies wind-on-the-quarter at 2.3 kn, which is what a boat lying a-hull in 20 kn actually does — my 0.5–1 kn expectation was wrong.

**Round 5 (this revision) — one model change, five scenario corrections; implement all, then re-run everything:**

1. **§5 camber and slot.** Per-sail `i0` (main 3, staysail 8, jib 8) and `iFlip` (8) in config, tuning panel and JSON export; per-sail state `camberSide`; effective incidence `alphaE = s·i + i0` clamped at 0; lift side from `s`; `luffing = s·i < 4°`; `deltaFree = clamp(−AWA − s·i0, ±deltaLim)`. Remove the old `|alpha|/4` luff scaling. The §5 sanity check should now print ≈ +437 / −768 N for case A; case B unchanged in sign.
2. **§9 (b)** — relative expectation (SOG < 60% of (a), drive < 50%).
3. **§9 (c)/(h)** — reach trims 0.55 / 0.85 / 0.9 (with camber the old 0.5 over-sheets); (h) band 35–65%.
4. **§9 (f)** — start from (a)'s trim at TWA 45°, tack with 25°, lash 35° after passing +45°; expectation 40–70° and < 2 kn.
5. **§9 (j)** — a-hull expectation: 90–150° off the wind, 1–2.5 kn; report the angle.

Expected after round 5: all eleven pass. Do not tune anything for this round — if a scenario misses, report the number; the point of round 5 is to confirm the Cowork-side result in the real file.

**Round 5 (built).** 11/11, no tuning. Bregir's first hands-on test (2026-09-07): physics reads right, presentation does not — the main is drawn on the windward side (render sign only; δ, heel and forces are consistent), the boat is too small on screen, nothing shows motion through the water, and the panel text is too small.

**Round 6 (this revision) — presentation only, no physics or config changes; the harness must produce identical numbers before and after:**

1. **Main sail mirror** — the boom must swing to +x (starboard) for positive `delta`, matching the jibs. Fix the rotation sign; verify visually on both tacks with the (a) scenario preset and its mirror (autopilot TWA −45).
2. **Camera** — default scale from canvas height (§8), mouse-wheel zoom 4–40 px/m, zoom slider.
3. **Water** — wave bands, bow wave, foam wake per §8; phase from simulated time, never wall-clock.
4. **Tiller** drawn at the stern at the rudder angle.
5. **Panel** — 14 px base, 13 px readouts, taller sliders; the scenario section stays.
6. **Heading-up camera transform is mirrored** (found in the same test: with the tiller to port the world swung as if the boat turned to port, while the physics turned it to starboard — verified numerically on the Cowork side). In heading-up mode a world offset `(dx east, dy north)` must be rotated so the heading points up the screen: `rx = dx·cos(psi) − dy·sin(psi)`, `ry = dx·sin(psi) + dy·cos(psi)`, then `sx = cx + rx·scale`, `sy = cy − ry·scale` (the round-5 code used `−psi`). **Printed check the agent must run:** camera at origin, `psi = 90°` (heading east), scale 10, centre (400, 300): the point 10 m ahead (east, `(10, 0)`) must land at `(400, 200)` — above the boat — and the point 10 m to starboard (south, `(0, −10)`) at `(500, 300)` — right of the boat. Round 5 gives `(400, 400)` and `(300, 300)`. The direction-to-screen helper (`worldAngleToScreen`) is already consistent with the boat; after the fix, positions and directions agree.

Report: a screenshot description is not verification — print the heading-up check above, state that `run-scenarios.mjs` output is byte-identical to round 5 (diff the two runs), and list which of the six items are done.

**Round 6 (built, 2026-09-07).** All six items; harness output byte-identical to round 5 (md5 65038ad963cc0e439c5a27862d8f48d6). Heading-up check prints (400, 200) and (500, 300). Found and fixed on the way: the rudder blade was drawn with the same mirrored rotation as the main; everything that swings now goes through one `swingPoint` helper whose sign is asserted headlessly in `render-checks.mjs` (kept, alongside `render-smoke.mjs`). Wave phase is anchored at the camera, not the world origin, so a wandering wind does not sweep crests sideways far from the start. Flagged, not changed: the boom is drawn from a mast at the boat-frame origin with a 4.8 m spar, so it overhangs the transom and reads thin — a mast position (`xMast`, about +1.0 m forward of the CLR) and a boom length derived from the sail geometry belong in the next presentation round.

**Feel test 2 (2026-09-07).** Bregir reported the helm acting reversed and the boat "still moving forward" head-to-wind. Screenshots showed Leeway 179.8° / 176.7°: the boat was making **sternway** — in irons exactly as a real one would be — and with sternway the helm reverses, as it should. The physics was right; the display hid it: SOG is unsigned, leeway prints ~180° instead of saying "astern", and the bow wave is drawn from unsigned speed so a boat going backwards still shows a bow wave.

**Round 7 — presentation only, no physics or config changes; harness output must stay byte-identical:**

1. **Speed readout** — show `u` signed as "Speed through water" (negative = astern) beside SOG, and a bold **STERNWAY** flag on the readout panel whenever `u < −0.05 m/s`.
2. **Leeway readout** — compute from the direction of motion relative to the *nearer* end of the boat: when `u ≥ 0`, `leeway = atan2(v, u)`; when `u < 0`, `leeway = atan2(v, −u)` and the line reads e.g. "12° to port (astern)". Never print values near 180°.
3. **Bow wave** — only when `u > 0.15 m/s`, scaled by `u`; when `u < −0.15 m/s` draw a smaller wave at the transom instead. Foam wake unchanged (it is the track and is correct either way).
4. **On-boat label** — when making sternway, draw "STERNWAY" in small caps beside the hull, same colour as the aback flag.
5. **Tiller widget caption** — add one line: "With sternway the helm reverses: tiller to port turns the bow to port."
6. **Water texture that stays with the water — the most important item.** Bregir's second look found the real cause: the wave crests propagate downwind at ~0.6·TWS, so head-to-wind with 0.4 m/s of sternway the crests stream aft past the boat at ~3 m/s and read as six knots of forward motion. A sailor judges way through the water by the surface itself, not by crest propagation. Add a **speckle layer fixed to the world**: small foam flecks and short ripple ticks, generated deterministically per 4 m grid cell from a hash of the cell coordinates (no randomness at draw time), 6–10 per cell, drawn **above** the wave bands and with roughly **twice their contrast**. The boat's motion relative to this layer is what the eye must read. Halve the wave bands' contrast so they become a faint wind-direction hint. Keep the faint grid. Printed check: at 20 px/m the speckle layer draws ≥ 200 flecks in an 800×600 canvas; the same cell hashes to the same flecks on every frame (deterministic).

Report: `run-scenarios.mjs` byte-identical (md5), `render-checks.mjs` still passing, the speckle count/determinism check, plus one printed check: state `u = −1`, `v = 0.2` → leeway line reads "11° to starboard (astern)" and the STERNWAY flag is set; `u = +1`, `v = 0.2` → "11° to starboard", no flag.

**Round 7 (built, 2026-09-07).** All six items; harness byte-identical (md5 65038ad963cc0e439c5a27862d8f48d6); `render-checks.mjs` 30 assertions, incl. the leeway/flag check verbatim. Speckle layer: 2277 flecks at 20 px/m, deterministic per cell; a first draft capped the cell radius and left only ~13% of the canvas covered when zoomed out, so it was replaced by a 4→8→16→32 m level-of-detail ladder with full coverage at every zoom (bins and corners checked). The transom wave first drew into the hull (sign) — caught by pixel-sampling a screenshot, fixed. `SIM.isSternway` is the single threshold for the panel flag, the on-boat label and the check. Transom wave scaled by u/1.5 so it reads at real sternway speeds.

**Feel test 3 (2026-09-07).** "It sails pretty well." Requests: a speed readout in the water area; the boom geometry leftover from round 6.

**Round 8 — presentation only, no physics or config changes; harness output must stay byte-identical:**

1. **HUD in the canvas.** Top-left, under the true-wind arrow, in a translucent box: speed through water in large type (`u` in kn, signed, e.g. "+4.2 kn" / "−0.8 kn" with STERNWAY in the aback colour when negative), then one smaller line "SOG 4.3 kn · HDG 302° · TWA 57° · AWA 64°". Monospace, 22 px for the speed, 13 px for the line, readable against the water in both heading modes. It is a duplicate of panel values — the panel stays.
2. **Mast position and boom length.** Add `xMast` to config (default +1.0 m forward of the CLR, tuning panel and JSON export, display-only) and hinge the main at `(0, −xMast)` in the boat frame instead of the origin. Boom length from the sail: `boomLen = 0.55·sqrt(A_main)·k` with `k` chosen so the default boom reaches about 0.6 m past the transom (a gaff sloop's boom does overhang). Move the mast dot and the burgee to `xMast`. The foresail tacks stay where they are. `render-checks.mjs` must assert the boom hinge is at `xMast` and the clew sign is unchanged.

Report: harness md5 identical; `render-checks.mjs` passing with the new assertion; a screenshot description of the HUD is not verification — print the HUD text produced for `u = −0.4, v = 0.1, psi = 359.4°, TWA 1°, AWA 1°` (expect "−0.8 kn STERNWAY" and the line).

**Round 9 — physics: sail-steering strength.** Feel test 3: "you can almost steer by sail pressure alone" — the model bore away at 2.9 °/s with the main let fly and rounded up at only 0.9 °/s with the jibs let fly (measured on the Cowork side). Two things dulled it: the rudder's 2D lift slope (a rudder amidships resisted yaw too strongly) and an `Nr` set against the pre-round-4 rudder. Changes, all verified in a patched copy (11/11 still pass, irons threshold unchanged at 0.25–0.5 kn, turn-rate check 8.0 °/s):

1. **§6 `CnSlope`** — new config value, default 2.7 /rad, replacing the hard-coded `2π·0.7`; tuning panel and JSON export.
2. **§6 `Nr`** 7000 → 4000.
3. **§9 scenario (l)** — sail steering, two variants, added to the harness.

Expected: bear-away ≥ 3.5 °/s, round-up ≥ 1.5 °/s, all other scenarios unchanged within their bands, sanity turn rate 7–11 °/s. Not changed, deliberately: main `xCE` (−1.3). Moving it to −1.8 doubles round-up authority but lets the boat tack from a standstill (no irons threshold) — that trade is Bregir's to make in the tuning panel, not a default.

**Round 10 — presentation: a cockpit-first control panel.** Feel test 3: halyards and sheets are mixed together and the sheets are read as tiny text. A real deck separates them — sheets and helm are in the cockpit and in constant use, halyards live at the mast and are touched twice a day. No physics, config or scenario changes; harness output byte-identical.

1. **Two tiers.** Top tier, always open, titled *Cockpit*: the tiller widget, then the deck schematic (below), then the on-canvas HUD's companion numbers if space allows. Second tier, collapsed by default, titled *Rig*: the four halyards (throat, peak, jib, staysail) as sliders, the lash toggle, and the autopilot (test) controls. Wind, time and tuning stay where they are.
2. **Deck schematic** (dedicated widget, ~300 px wide, fixed scale, bow up — not the water view). Draw the hull outline, mast at `xMast`, the three clews at their current `delta`, and the **five sheets as lines from clew to cleat**: main sheet to a cleat on the centreline at the stern; jib port/starboard sheets to fairleads on the port/starboard quarter; staysail port/starboard sheets to fairleads abreast the mast. The line **length follows the ease** (hauled = short, straight; eased = long, slack curve); **thickness and colour follow the load** on that sail (slack grey, drawing amber, ≥ 70% of `loadRef` red). On the current tack the **working** sheet (leeward side) is drawn bright and the lazy one dimmed; the main sheet is always bright. Each cleat carries its key pair (`Q/E`, `R/F`, `T/G`, `Y/H`, `U/J`). Sails are coloured as in the water view (white / grey luffing / orange aback).
3. **Interaction.** Dragging a cleat toward the clew eases, away hauls; it goes through the same rate-limited actuator as the keys (`haulRate` with the load limit), so a loaded sheet still comes in slowly. Hover shows the ease value as a tooltip; no permanent numbers.
4. **Per-sail text lines** move to a collapsible *Details* section under the readouts.
5. `render-checks.mjs`: assert that for a starboard-tack state (AWA > 0) the port sheets are drawn as working and the starboard ones lazy, and the reverse for port tack; that a port fairlead is at x < 0 in the schematic; and that the load→colour mapping hits all three bands at 0, 0.5·loadRef and loadRef.

Report: harness md5 identical; `render-checks.mjs` passing with the new assertions; list which of the five items are done.

**Rounds 8 and 9 (built, 2026-09-07).** Round 8: harness byte-identical; HUD prints "−0.8 kn STERNWAY" for the check state; boom overhang 0.600 m; `xMast` live in panel and JSON; the burgee's position now rotates with the boat (it only tracked the mast at heading north before). Round 9: `CnSlope` 2.7 applied in both the below-stall and stall branches (a first pass missed the second and would have left a step at 30°); `Nr` 4000; turn rate 8.02 °/s; ahead-Mz 6.08 kN·m; twelve scenarios pass with no re-tuning; (l) bear-away 3.74 °/s, round-up 1.59 °/s; (e) threshold 0.25–0.5 kn; (g) light-air −2.58°. Two stale numbers in this brief were corrected above (ahead-Mz band, scenario count). (f)'s heel now settles dead flat.

**Round 10 (built, 2026-09-07).** All five items. Harness md5 4a9e142e8c1b4899a24309c43d1951a7 — identical to the round-9 baseline (the md5 changed at round 9 because the physics did; it has not changed since). `render-checks.mjs` gained CHECK 12 (working/lazy side per tack, port fairlead at x < 0, three load-colour bands) plus a check that the cleats scale with LWL. Mid-round corrections the agent flagged: the five direct sheet sliders were first removed as "replaced by the schematic", then restored as a collapsed *Sheets (direct)* section — now routed through the rate-limited actuator like keys and cleat-drag, so a slider is approached at the haul rate rather than set instantly (accepted; the spec's "everything has a slider and a key" stands). Cleat positions became fractions of LWL; the HUD builds its nodes once; a scenario run clears any stale slider target. Hover and cleat-drag remain human-verified only (screenshot + DOM), as the tiller drag has been since round 6.

**Feel test 4 (2026-09-08).** "Headsails have a lot of steering authority, the main very little; with all sails set the headsails push the boat off the wind even though the main should be trimmable for balance." Measured: with (a) trim and helm amidships the boat carries lee helm (−1.7° at 6 m/s). Round 3's "within ±3° of neutral" criterion was mine and was wrong — a boat should carry slight weather helm. `xCLR` proved a weak lever (0.3→0.7 moved the 6 m/s balance only from −1.7° to −0.3° and erased the irons threshold). The missing physics is the hull's heel-induced yaw moment.

**Round 11 — physics (heel term, free rudder) and controls (A/D, X):**

1. **§6 `kHeelYaw`** — new config value, default 1500, tuning panel and JSON export; `Mz += −kHeelYaw·u·|u|·sin(phi)` in the hull forces. Verified on the Cowork side: (g) rudder −0.7 / +2.3 / +6.3 / +11.2° at TWS 4/6/8/10, easing the main +11.2 → −5.3°, dropping it → −34.7°; (l) 3.6 / 1.6 °/s; d-switch 12.1 s, exit 3.3 kn; irons threshold 0.25–0.5 kn; (f) 42.6°, 1.68 kn; (a) 4.08 kn. All twelve pass. (2500 was also tried: +4.9° at 6 m/s but the irons threshold vanished — do not go above ~2000 by default.)
2. **§9 (g)** — criterion changed to the weather-helm band above; `xCLR` stays 0.3 and is no longer tuned by the scenario.
3. **§7 A/D swap** — `A` = bow to port (tiller to starboard), `D` = bow to starboard; update the widget caption and the sternway caption accordingly. `render-checks.mjs`: assert that the `a` key produces a negative `tillerCmd`/`deltaR` change.

4. **`X` = rudder amidships** — sets the rudder target to 0° through the normal tiller rate (not a jump); also un-lashes and un-frees.
5. **Rudder free (let go of the tiller).** A third helm state beside *held* and *lashed*: `state.rudder.mode ∈ {held, lashed, free}`, checkbox "Free (tiller let go)" in the Cockpit next to Lashed, key `C` toggles it. When free, the blade weathercocks to the local water flow so it carries no force: each step move `deltaR` toward `atan2(−(v + r·xR), u)` (the angle at which `wn = 0`; for `u ≤ 0.05 m/s` hold the current angle), clamped to ±35°, at three times the tiller rate — a let-go tiller swings quickly. Held, lashed or any A/D/X input returns the mode to *held*. This is what lets the sails' balance be judged on its own, without the locked rudder damping the swing. `render-checks.mjs`: with `u = 2, v = 0, r = 0` the free rudder settles at 0° and its `Mz` is ~0; with `u = 2, v = 0.3, r = 0` it settles near −8.5°. Add scenario (l) **variant 3**: as variant 1 (main let fly) but rudder *free* — report the yaw rate; expected larger than variant 1's.

Report: sanity checks and all twelve scenarios per §11 (the harness md5 will change — it is a physics round), the key-direction check, the free-rudder checks, and (l) variant 3's rate against variant 1's.

**Round 11 (built, 2026-09-08).** All five items, no re-tuning; harness md5 5d75fa0dd5889986c37f0bb49b73fd1f (physics round). (g): −0.72° at 4 m/s, +2.30° at 6, easing the main → −5.3°, dropping it → −34.7°. (l): locked-rudder bear-away 3.62 °/s, round-up 1.57 °/s; **free-rudder bear-away 8.36 °/s** — with the tiller let go the boat swings more than twice as fast, which is what a helmsman means by "steering with the sails". Free-rudder checks: settles at 0.00° / −8.53° as predicted. Agent's choices where the brief was silent: `X` is held-to-centre like A/D (not a latch) and overrides the autopilot while pressed. `render-checks.mjs` now 14 checks.

**Feel test 5 (2026-09-08).** Balance now reads right; the heel-induced weather helm makes sense. Requests: swap Q/E; make heel visible; make sails visibly come down when their halyards are eased; the deck schematic is too abstract (dots and key-codes, no sails) and would not survive a square sail.

**Round 12 — presentation only, no physics or config changes; harness output must stay byte-identical:**

1. **Q/E swap** — `Q` eases the main, `E` hauls. Update captions and the cleat label.
2. **Heel made visible.** Top-down, a heeled rig's masthead sits to leeward by `mastHeight · sin(phi)` (config `mastHeight`, default 9 m, display-only). Draw the mast as a line from its foot at `xMast` to the displaced masthead; hang the burgee and the heads of the sails from the masthead so the whole rig visibly leans — in the water view and in the schematic. Add an inclinometer to the HUD (a bubble on a short arc, degrees beside it). Under the helm-balance bar add a second bar splitting the yaw moment into **sails** and **hull** (the `kHeelYaw` term plus the keel lever), same sign convention, so the hull term can be watched growing with speed. `render-checks.mjs`: heel to port (`phi < 0`) puts the masthead at x < 0.
3. **Sails come down.** Hoist is drawn, in both views. Main: the sail quadrilateral's height along the mast scales with `hT`, the gaff's angle to the boom scales with `pk` (peak dropped → gaff droops toward the boom — that is what scandalizing looks like), and at `hT ≈ 0` the sail is a thin muted bundle lying along the boom. Jibs: the curved sail scales with `h` from the tack toward the foot, and at `h ≈ 0` is a thin muted bundle on the foredeck along its stay. `render-checks.mjs`: at hoist 0 the drawn sail polygon has near-zero area and the bundle is present; at hoist 1 the area equals the round-11 value.
4. **Deck schematic, second version.** Replace the dots-and-codes drawing with the **same boat drawing as the water view** (`boatGeometry`, including items 2 and 3) at a fixed scale that fills the ~300 px widget, bow up. Overlay the five sheets from each clew to a cleat drawn *as a cleat* (small T), labelled with sail name and keys ("JIB · R/F", "STAYS'L · T/G", "MAIN · Q/E"); working sheets solid, lazy sheets faint and dotted; load colouring as before. One visual language for both views, so a square sail later is one more shape with braces to labelled cleats. Existing CHECK 12 assertions must still pass against the new geometry.

Report: harness md5 identical to round 11 (5d75fa0dd5889986c37f0bb49b73fd1f); `render-checks.mjs` passing with the new assertions; items done.

**Round 12 (built, 2026-09-08).** All four items; harness md5 unchanged (5d75fa0dd5889986c37f0bb49b73fd1f). `render-checks.mjs` 17 groups / 58 assertions, three new: masthead lean sign, Q/E direction, hoist geometry (area 0 at hoist 0, round-11 area at hoist 1, peak-corner-only droop, jib clew onto tack at h = 0 with bundle present). Agent's choices where the brief was silent: all five sheets labelled by sail and key (the brief listed three); the inclinometer bubble leans with the rig rather than against it like a real fluid bubble, for consistency with the drawn mast; the main at zero hoist is a zero-area outline along the boom rather than a separate bundle shape.

**Feel test 6 (2026-09-08).** Round 12 accepted ("looks more alive and real now"). Roll damping: `cPhi` 8000 tried in the panel and approved as default. Requests: a tooltip on every tuning value; an analysis of a ship-type selector (sloop, topsail schooner, brig).

**Round 13 — one default, one presentation item:**

1. **§6 `cPhi` 25000 → 8000** (physics default; harness md5 changes). Scenario (f)'s heel-oscillation criterion must still pass; report its ratio. Also report (a) heel and the peak-vs-settled heel when scenario (a)'s sheets are hauled from fully eased at 2 kn (new printed check: peak heel should exceed settled heel by 15–40%).
2. **Tooltips.** Every tuning-panel value gets a `title` tooltip: one plain-language sentence saying what it does physically, its unit, and which way to move it for which effect (e.g. `kHeelYaw`: "Weather helm the heeled hull produces, N·m per (m/s)². Higher = boat rounds up harder as it heels and speeds up."). Also the sail table columns and the scenario buttons. No text from the spec pasted verbatim — written for the panel.

## 13. Ship types — analysis (not yet a build brief)

Bregir wants a ship selector: **sloop** (as now), **topsail schooner**, **brig**. What it takes, in order:

**A. Ship definition as data (the refactor; one round, and the biggest).** Today the sloop is hard-wired: three named sails, five named sheets, key bindings, scenario trims, cleat positions and render geometry all refer to `main/staysail/jib` by name. A selector needs a *ship definition* the whole program reads: hull (mass, LWL, inertias, GM, drag and keel coefficients, `xCLR`, `kHeelYaw`, `Nr`, rudder area and position, windage), masts (position, height), and a list of sails, each with a **type** (`gaff`, `headsail`, `square`, `gaff-topsail`), attachment (mast or stay), area, `xCE`, `zCE`, limits, `i0`, and its **control lines** (one sheet; two sheets; a brace pair; halyards or clewlines for set/furl). Physics iterates the sail list; the deck schematic, HUD, keys and tuning panel are generated from it. Acceptance: with the sloop definition loaded, the harness output is **byte-identical** to round 13 — the refactor must change nothing observable before it adds anything.

**B. Square-sail physics (one round).** Same cambered-plate force model; the yard's brace angle is the chord angle; the two braces are the two-sheet interval model with the yard limited to about 30° from the centreline by the shrouds — which is the physical reason square-riggers cannot point above ~65–70° true. Camber side flips freely; a sail aback is a normal working state (backing a topsail to stop, box-hauling). Add a simple **blanketing** factor: a sail directly downwind of another on the same ship, within ~15° of the apparent wind line, loses a share of its wind — this is what makes running under square canvas feel like it does. Render: yard drawn at the brace angle, sail as a curve billowing to leeward from it, per mast.

**C. Hull scaling.** Schooner ~25–30 m, 100–150 t; brig ~30–35 m, 250–350 t. Same equations, new numbers: rudder relatively smaller, yaw inertia far larger, turns take boat-lengths not seconds. Acceleration and irons behave differently and need their own acceptance numbers.

**D. Controls for many lines.** The sloop's ten keys do not scale to a brig's six brace pairs, six sheet pairs, spanker and headsails. Two things are needed: **grouping** (braces on one mast move together by default — "brace the fore yards" — with per-yard trim available), and **select-then-act** in the schematic (click a cleat or a group, then two keys or a drag haul/ease). This is also the seed of the crew/orders layer the first-person game will need.

**D′. Two tiers of control — principle (Bregir, 2026-09-08, during the pause).** As rigs grow, every rope falls into one of two tiers, and the ship definition must say which. **General** lines are grouped and live on the §14 grid: they are what a watch officer orders — "brace the fore yards", "ease the main sheet" — and one key moves the whole group (all braces on a mast; both clews of a course; a staysail pair). **Trim** lines are sail-specific and reached by *selecting a sail* (click it in the schematic, or cycle with a key) after which the same grid keys act on that sail alone, plus a small per-sail trim panel. Group actions apply a delta to every member, preserving whatever offsets trim has set; a "square up" action clears offsets. Selection replaces the `Alt` layer (§14) — it scales to any number of sails per mast and has no browser-chord problem. **Decided 2026-09-10:** `Alt` is retired without ever being bound, and the *selection half* of this principle lands in round 17 (§16 step 6) rather than a stopgap modifier — the first ship needing a layer needs `Alt+D`, a browser chord, and building hold-`Tab` would mean teaching a binding this section has already decided to replace. The grouping half waits for the brig, where it is first exercised for real. Two rules govern what is admitted: **(1) no mechanism without physics** — a control exists only if the model makes it change something measurable (thrust, pointing, balance, heel, load, or a limit), otherwise it is window dressing and is not built; **(2) every mechanism is classified general or trim in the definition**, and the classification is part of the review before the round is written. First pass, subject to the physics being in place: general — braces per mast, fore-and-aft sheets, staysail sheet pairs, set/furl and reef per sail, helm. Trim — per-yard brace offset (needs a wind gradient with height in §4 first; without it the offset changes nothing and fails rule 1), course tacks and sheets as shape (flatter foot → lower effective camber, higher lift slope on the wind), bowlines (weather leech held forward → the luff threshold moves several degrees, sail draws closer to the wind), lifts (top up the lee yardarm → a few degrees more brace before the yard fouls the stay, less chafe; small, borderline under rule 1 — decide when the brig is specified). Halyards stay in the Rig panel as now.

**E. Rig definitions.** *Topsail schooner*: two masts; gaff foresail and mainsail, staysail + jib (+ flying jib), one or two square topsails on the fore — the natural first step, since everything but the topsails already exists. *Brig*: two masts, each with course, topsail, topgallant (six square sails), a gaff spanker on the main, three headsails; grouped braces essential.

**F. Scenarios per ship.** The sloop's twelve stay bound to the sloop. Each new rig gets its own short acceptance set once it exists: pointing angle (schooner ~55°, brig ~65–70° true), a tack and a wear (a brig may miss stays and must be able to box-haul), heave-to under backed topsail, running under square canvas with blanketing.

**Order and size (revised 2026-09-08).** A (with the §14 key map) → B → **topsail cutter** (the sloop plus one square topsail on its mast — the smallest rig that exercises every square-sail mechanism) → topsail schooner (E, F) → brig (D, D′, E, F) → selector UI. Roughly five to seven rounds plus feel tests; A and D are the two that decide whether the rest is pleasant or painful. The crew/orders layer is a separate project after this.

## 14. Controls v2 — the deck as a keyboard (standard for all ships)

Agreed 2026-09-08 (Bregir's grid, two refinements). The left-hand block of the keyboard is the ship seen from above: **rows are stations from bow to stern, columns are rope types, left is port, right is starboard.** One key is one rope. **Plain key = haul, `Shift` = ease, hold `Space` + key = let fly (cast off completely; was `Ctrl` until round 16 — `Ctrl` chords belong to the browser, see round 16 item 7), `Alt` = **retired unbuilt** (2026-09-10): the sail above is reached by *selecting* it (§13 D′, §16 step 6), not by a modifier — `Alt+F/E/D` are browser chords, and selection is what the brig needs anyway** (gaff topsail, topmast staysail, or an upper yard when braces are not grouped).

| Row | Station | Outer pair (port / stbd) | Inner pair (port / stbd) | Centre (single) |
|---|---|---|---|---|
| `1 2 3 4 5` | bowsprit | `1`/`5` jib sheets | `2`/`4` flying-jib sheets | `3` spare (spritsail) |
| `Q W E R T` | foremast (or the only mast) | `Q`/`T` sheets of the staysail on this mast's forestay | `W`/`R` braces of this mast's yards (grouped by default) | `E` this mast's fore-and-aft sail sheet (gaff foresail / mainsail / course clew) |
| `A S D F G` | mainmast | `A`/`G` main-staysail sheets | `S`/`F` braces | `D` mainsheet / spanker |
| `Z X C V B` | mizzen | `Z`/`B` mizzen-staysail sheets | `X`/`V` braces | `C` mizzen sheet |

Helm on the numpad: `4` tiller to port (bow to starboard), `6` tiller to starboard, `5` amidships and take the helm, `0` free (let go), `Enter` lash. Halyards and set/furl stay in the Rig panel (sliders) — they are touched twice a day. `P` pause (was `Space`, which becomes the let-fly modifier in round 16), `0` on the main keyboard reset position (unchanged).

Rules: working sheets are on the leeward side, so on starboard tack you are on left-hand keys, as in a cockpit facing forward. Every cleat in the deck schematic prints its key. A ship definition (§13 A) maps its lines onto this grid; a sail with no line at a position leaves the key dead. The sloop becomes: jib `1`/`5`, staysail `Q`/`T`, main `E`, helm on the numpad — the old A/D, Q/E, R/F, T/G, Y/H, U/J bindings are retired when this lands, which is with the ship-definition refactor (round 14), not before.

Known limit: one staysail pair per mast row; a second staysail between the same masts (e.g. main-topmast staysail) lives on `Alt` or in the panel.

**Round 13 (built, 2026-09-08).** `cPhi` 8000 default; md5 5b1973ce4000dbd552068bfed7485148; twelve scenarios pass, (f) ratio 0, (a) heel unchanged at 13.2° (damping changes transients only). Tooltips on 33 scalars, sail columns, coefficient cells, 15 scenario buttons and the Rig-panel duplicates. The peak-vs-settled check as I wrote it **failed for a measurement reason, not a physics one**: the ring is real (~2 s period, ~40% peak-to-trough at captive speed) but decays in 5–8 s while the boat takes ~60 s to reaccelerate, so a "settled" baseline measured after the run is higher than the peak. Lesson kept: fast transients are measured at captive speed (`u` held), not against a slow steady-state tail. The check is rewritten that way below for future use. Bregir's hands-on verdict on 8000 stands.

**Round 14 — the ship-definition refactor (§13 A) and the controls standard (§14). One round, the biggest since round 1. No physics change: with the sloop definition loaded the harness must be byte-identical to round 13 (md5 5b1973ce4000dbd552068bfed7485148).**

Purpose: everything that today says `main`, `staysail`, `jib`, `eM`, `eJp`… by name must instead read one **ship definition** object, so that a second ship is a second object and nothing else.

1. **`SHIPS.sloop` definition** (a plain object in `CONFIG`, exported/imported with the tuning JSON):
   - `hull`: every hull number now in config (`m, LWL, Iz, Ix, GM, cU, kWave, cV, xCLR, kHeelYaw, Nr, Nrr, cPhi, xR, AR, CnSlope, Awind, zWind`) plus `name`.
   - `masts`: array of `{ id, x, height }` — the sloop has one, `{ id:'main', x: xMast, height: mastHeight }`.
   - `sails`: array. Each: `{ id, name, type: 'gaff' | 'headsail' | 'square', mast, A, xCE, zCE, deltaLim, i0, hoist: 'throat+peak' | 'single' | 'setfurl', lines: [...] }`. A line: `{ id, kind: 'sheet' | 'sheetPair' | 'bracePair', side: 'port' | 'stbd' | 'centre', key }`. Sheets keep their `e` (ease 0..1) semantics; a `bracePair` is the same two-interval model applied to a yard (round 15 implements the square type — this round only carries the field).
   - `helm`: `{ xR, AR }` may stay in `hull`; keys for the helm come from §14 and are not per-ship.
2. **State shape.** `state.sails` becomes a map keyed by sail `id`; `state.sheets` a map keyed by line `id`. The sloop's ids are chosen so the *values* the harness prints are unchanged (`main`, `staysail`, `jib`; lines `eM`, `eJp`, `eJs`, `eSp`, `eSs`) — the harness output must not change, and renaming ids is not allowed to be the reason it does.
3. **Physics loop** iterates `ship.sails`; per-type force code is selected by `type` (`gaff` and `headsail` exist; `square` throws "not implemented" this round). Actuators iterate `lines`.
4. **Controls** are generated from `ship` + §14: each line's `key` from the definition; plain = haul, `Shift` = ease, `Ctrl` = let fly; `Alt` reserved. Helm on the numpad per §14 (`4`/`6`/`5`/`0`/`Enter`), with `A`/`D`/`X`/`C`/`L` **removed**. The sloop definition assigns jib `1`/`5`, staysail `Q`/`T`, main `E`. The keyboard handler must use `event.code` (`Digit1`, `KeyQ`, `Numpad4`…) so layouts do not matter.
5. **Panel and schematic** are generated: the tuning panel lists `hull` fields and one row per sail with its properties; the Rig section lists one halyard control per sail according to `hoist`; the deck schematic places one cleat per line — position from a small table by `(station row, column, side)` mapped onto the hull outline — and prints the key. The scenario code references sails and lines by id through the definition, never by hard-coded property names.
6. **Selector stub.** A `<select>` with the single entry "Gaff sloop", wired so that choosing a ship rebuilds state, panel, schematic and key map. Round 15 adds the topsail cutter.
7. **Verification, in this order, each printed:** (i) harness md5 identical to round 13 — run after every stage of the refactor, not only at the end; (ii) `render-checks.mjs` all green with the key-direction check rewritten for the new bindings (`Digit1` hauls the port jib sheet, `Shift+Digit1` eases it, `Numpad4` drives `deltaR` positive); (iii) a new **definition check**: loading `SHIPS.sloop`, serialising it, and loading the serialised copy gives identical harness output; (iv) the captive-speed roll check (below).

**Captive-speed roll check (replaces round 13's).** Hold `u = 2.0 m/s` and `v = 0` (override each step), rudder locked at 0, TWS 6, TWA 45, all sheets eased for 10 s, then haul to (a)'s trim: report peak heel and heel at t + 15 s; expect the peak to exceed the later value by 20–50% with `cPhi = 8000`.

Report: the four verification items with numbers; the list of every place a sail or line name was hard-coded before and what it reads now; anything the definition cannot yet express.

**Round 14 (built, 2026-09-08).** Byte-identical (5b1973ce…), checked after every stage; 76 render assertions; serialise-reload identical; `SHIPS.sloop` drives physics, actuators, panel, Rig, schematic, HUD and keys; §14 bindings live, old ones retired; selector stub in place. The captive-speed roll check as I worded it was again contaminated — this time by yaw (the locked rudder let weather helm round the boat up during the 15 s) — and reads 33% when yaw is held too; both numbers print. The agent's list of what the definition cannot yet express is adopted as the agenda for §15 and later: square sails and blanketing (§15), grouping and "sail above" (brig), stays as real geometry and per-mast cleat layout (schooner), per-ship handling rates and per-ship acceptance sets (schooner).

## 15. Square sails — physics and the topsail cutter

**The yard.** A square sail hangs from a yard on a mast. Its trim is the **yard angle** `psiY`, in degrees from square (yard athwartships = 0). Sign: `psiY > 0` means the **starboard yardarm is forward** — the trim for wind from starboard. The shrouds stop the yard at `braceLim` from square (default **55°**, leaving the yard 35° off the centreline — the historical "braced sharp up", and the reason a square-rigger cannot sail closer than about 60–65° to the true wind).

**Braces are the two-sheet interval on the yard.** Port brace ease `eP`, starboard `eS`, both 0..1. Hauling the port brace pulls the port yardarm aft, i.e. raises `psiY`; so the port brace is a **lower bound**, the starboard brace an **upper bound**:
`psiY ∈ [ braceLim·(1 − 2·eP), braceLim·(2·eS − 1) ]`.
Checks: both eased (1,1) → free, ±55°; port hauled, starboard eased (0,1) → pinned at +55°; both at 0.5 → square; both hauled (0,0) → **not reachable**: from round 16 a haul that would invert the interval (`eP + eS < 1`) is refused, the brace going bar-taut — you ease one brace before hauling the other (round 15 collapsed an inverted interval to square, which made the yard jump; see round 16 item 6). Where the wind wants the yard: the angle at which incidence is zero (the yard weathercocks like a boom), approached with the boom-lag rule at half the rate (`kBoom·AWS·0.5`) — a yard is heavier than a boom. Two yard angles zero the incidence, 180° apart; from round 16 item 2 the one **nearest the current `psiY`** is taken, which is exactly `psiY − i` once `i` is the arm-selected incidence above. Dead downwind both solutions lie outside `±braceLim`, and picking by the sign of AWA (round 15) slammed the yard from limit to limit as AWA crossed ±180.

**One force model for every sail.** Map the yard onto the existing incidence rule with an equivalent clew angle: `deltaEq = −sign(psiY)·(90 − |psiY|)` — the direction of the *aft* yardarm measured like a clew (`psiY = 0` → treat as `deltaEq = −90`). Then `i = AWA + deltaEq`, camber side `s` with the same hysteresis (a square sail's camber flips freely; being aback is a normal working state), `alphaE = s·i + i0` with `i0 = 5` (camber, no slot), and the standard tables scaled by a per-type `clScale = 0.8` (a square sail has less shape control than a gaff sail). Lift and drag resolve exactly as now; `xCE` is the mast position, `zCE` the sail's height. Check: `psiY = +55`, AWA +60 → `i = 25`, drive forward, side force to port. Check: `psiY = −55` with AWA +60 (braced the wrong way) → `alphaE` saturates at 90, pure drag, aback.

**Which yardarm (round 16 item 1).** A yard is a symmetric plate hung at its middle, so *both* arms are candidates for the "aft" arm the clew rule wants and `deltaEq` is two-valued (`deltaEq` and `deltaEq ± 180`). The wind decides: use the arm whose incidence lands within `|i| ≤ 90`, which is the same as folding `i = AWA + psiY − 90` into `(−90, 90]` — one expression for either sign of `psiY`, so the mapping is continuous through square and AWA +60 and −60 give the same incidence magnitude on the same yard. Round 15 broke the tie on the sign of `psiY` instead, which put a 180° step at `psiY = 0`.

**Set and furl.** A topsail is hoisted on its yard: `hoist = 'setfurl'`, one slider `h` in the Rig panel; effective area scales with `h`, and the drawn sail with it (furled = a bundle along the yard). No sheets, tacks or clewlines in the sandbox — braces plus set/furl are the two controls that matter for feel.

**Blanketing.** Each sail gets a height band `[zLo, zHi]`. For sail *j*, any sail *k* whose band overlaps, that lies within 3 hull-lengths upwind of *j* along the apparent-wind line and within half a yard-length laterally of it, reduces *j*'s dynamic pressure by `1 − 0.6·overlapFraction·h_k`. On the cutter the topsail sits above the gaff peak, so it is barely blanketed; the rule exists so that running under square canvas on the brig later behaves as it should (main course in the fore's lee). `render-checks.mjs`: a sail directly downwind in the same band loses 60%; one in a different band loses nothing.

**Render.** Yard as a line through the mast at `psiY` (length `yardLen`, default `1.1·sqrt(A)`), sail as a filled curve from the yard bulging to the camber side, scaled by `h`; the same colour states as other sails. In the schematic the braces run from the yardarms to cleats at the mast row's inner pair (`W`/`R`) per §14 — from round 16 item 4 as two **taut** ropes, straight, thickness by load, with the working brace bright and the other only dimmed (a dotted line reads as slack, and neither brace of a braced yard is). Which one is working follows the yard, not the wind: on starboard-tack trim (`psiY > 0`) the yard rests on its lower bound, so the port brace is the one being worked.

**`SHIPS.topsailCutter`.** The sloop's hull and three sails unchanged, plus one square topsail on the (only) mast: `{ id:'topsail', type:'square', A: 12, xCE: +1.0, zCE: 7.2, zLo: 5.5, zHi: 9.0, braceLim: 55, i0: 5, clScale: 0.8, hoist:'setfurl', lines: [bracePair W/R] }`. Mast height 9 → 11 (topmast). Deck-schematic cleats for the braces abreast the mast.

**Cutter acceptance set (runs with `--ship topsailCutter`; the sloop's twelve are untouched):**

| # | Setup | Expected |
|---|---|---|
| m | Topsail set and trimmed, autopilot TWA 100°, TWS 6, gaff/headsail trims as (c). 120 s. | SOG at least 8% above the sloop's at the same point of sail; heel larger. |
| n | Close-hauled as (a), topsail set and braced sharp (`psiY = 55`). 90 s. Then furl it. | Set: topsail flagged luffing or aback ≥ 70% of the time and SOG ≤ the sloop's (a). Furled: SOG within 1% of the sloop's (a). |
| o | Wear ship from TWA 120° starboard tack to TWA 120° port tack with topsail set: square the yard as the stern passes through the wind, then brace for the new tack. | Yard swings through 0 and re-braces; boat completes the wear in < 40 s; no NaN, no sail stuck. |
| p | TWA 60°, 4 kn, topsail set. Haul the *wrong* brace so the yard goes aback (`psiY → −55`) **and** let fly the main, staysail and jib sheets. 30 s. | Topsail flagged aback; SOG falls below 1.5 kn **within 15 s** — how a cutter with a topsail is brought up short. (Round 16 item 3; round 15 asked the backed topsail to do it alone, which a cutter's 12 m² cannot against 46 m² of fore-and-aft canvas — that expectation moves to the brig.) |

**Round 15 — build the above.** Sloop harness must stay byte-identical (5b1973ce…) with the sloop selected — the square code path must not touch the sloop's numbers. Report: the two square-sail force checks, the brace-interval checks, the blanketing check, the four cutter scenarios with numbers, and anything the definition still cannot express.

**Round 15 (built, 2026-09-08).** Square type, braces, blanketing rule, `SHIPS.topsailCutter`, `--ship`; sloop byte-identical; cutter with topsail furled bit-identical to the sloop. m, n, o pass (reach +8.8%, topsail useless on the wind and identical when furled, wear in 11 s). **p failed for a reason in the scenario, not the model:** a backed 12 m² topsail against 46 m² of drawing fore-and-aft canvas costs 0.4 kn; with the fore-and-aft sheets let fly the cutter is below 1.5 kn in 7.8 s. Agent's model notes adopted below (two-valued chord mapping at `psiY = 0`, ambiguous free angle downwind, braces drawn like slack sheets). Blanketing is inert on both shipped rigs because only square sails carry height bands — deliberately: on a beat the headsail overlap is the slot, a gain; on a run the main shading the headsails is real and will be its own accounted round for the sloop.

**Round 16 — square-sail corrections (cutter only; sloop byte-identical, 5b1973ce…):**

1. **Wind-relative yardarm.** Compute the incidence for both yardarms — `deltaEq` and `deltaEq ± 180` — and use the one with `|i| ≤ 90`. A square yard then gives the same incidence magnitude for AWA +60 and −60 (30°, stalled plate, aback on both), and the mapping is continuous through `psiY = 0`. Check: print `i` for `psiY = 0` at AWA ±60 and for `psiY = ±5` at AWA +60 (no jump).
2. **Free yard angle.** Of the two `psiY` values in `±braceLim` that zero the incidence, take the one nearest the current `psiY`. Check: AWA +180 and −180 from `psiY = +40` both settle at +55; from `psiY = −40` at −55.
3. **(p) rewritten:** TWA 60°, 4 kn, topsail set; haul the wrong brace *and* let fly main, staysail and jib sheets. Expected: topsail aback, SOG < 1.5 kn within 15 s. The original "backed topsail alone stops the ship" moves to the brig's set.
4. **Braces drawn as two taut ropes** from the yardarms to their cleats, thickness by load, no ease-bow; the working brace bright, the other dimmed (both are taut on a braced yard, so "lazy" means the one not being worked — the upper-bound brace on starboard-tack trim).
5. **Schooner definition draft, not code.** Produce, as a report only, the proposed `SHIPS.topsailSchooner` object and the schema changes it needs — per-mast fore-and-aft cleat positions, stays as geometry (tack position from the stay, not `xCE`), the second gaff sail hinged at its own mast, `above` relations for `Alt`, per-ship handling rates — for review here before round 17 writes any code.

6. **Braces cannot invert the interval — hauling is refused, not resolved.** Feel test 7 (cutter, 2026-09-08): with one brace hauled home, or both braces hauled, the yard "snaps one way or the other or resets". Cause: whenever `lim(1−2eP) > lim(2eS−1)` (i.e. `eP + eS < 1`) the interval inverts and the collapse rule jumps the yard to square, and items 1–2 add their own flips at `psiY = 0`. A real brace cannot be hauled while the opposite brace holds the yard — the crew must *ease the lee brace before hauling the weather brace*. Model it that way: the ease actuator refuses a haul that would make `eP + eS < 1` (the brace goes bar-taut and stops; tooltip/HUD hint "ease the other brace"). The interval then never inverts, the yard never jumps, and hauling one brace fully with the other at 1 pins the yard at `±braceLim` as before. Delete the collapse-to-square rule in §15 for braces. Check: from (1,1) haul port to 0 → `psiY` = +55; then haul starboard → `eS` stops at 1.0 (no movement); ease port to 0.5 → starboard can now haul to 0.5 → square; no step in `psiY` larger than the brace rate in any of it. Headsail sheet pairs keep their current rule for now (sloop md5 must not change); flag in the report whether the same refusal rule should follow for them in a later sloop round.
7. **Modifier layer: `Ctrl` is unusable in a browser — replace it.** `Ctrl` + the grid keys are browser chords: `Ctrl+W/T/N` and `Ctrl+1…8` cannot be intercepted at all (close tab, new tab, switch tab), and `Ctrl+A/S/D/F/R/Z/X/C/V` are select-all, save, bookmark, find, reload, undo, cut, copy, paste. §14 is amended: **let fly = hold `Space` + key** (`Space` has no browser chord; the handler calls `preventDefault` so it does not scroll, and pause moves to `P`). `Alt` stays for "the sail above" until the schooner needs it, but note the conflicts for that round: `Alt+F/E/D` open Chrome's menu / address bar on Windows, and Firefox shows the menu bar on `Alt` release — the candidate replacement is hold `Tab` + key (focus move is preventable, no letter chords). Rule for all layers: every handled combination calls `preventDefault`, and no binding may rely on a chord the browser reserves. Update the cleat labels, tooltips and the keys check (CHECK 13) accordingly.

Report: the two printed checks, (p)'s numbers, the brace-refusal check, the key list as bound, cutter md5 (changes), sloop md5 (must not), and the schooner draft.

**Round 16 (built, 2026-09-10).** All seven items. Sloop byte-identical (5b1973ce…); cutter md5 **f3fa8d9d35ae5101d77b634f3651da30** (was 01be6e51…). `render-checks.mjs` 98 assertions green, `render-smoke.mjs` clean (one new case: a brace bar-taut), round-14 checks green. Item 1 and item 2 collapse into one helper, `SIM.yardIncidence(AWA, psiY)`: folding `AWA + psiY − 90` into `(−90, 90]` both selects the arm and, subtracted from `psiY`, gives the nearest zero-incidence angle — so the two corrections are one line of arithmetic rather than two special cases. Printed: `psiY = 0` gives `i = ∓30°` at AWA ±60 (equal magnitude, opposite sign — both stalled, both aback) and `−35 / −30 / −25` for `psiY = −5 / 0 / +5` at AWA +60, exactly 5° per 5° with no step; the free angle settles at ±55 from ±40 at AWA ±180 and gives the same answer for both signs of AWA. Item 6's refusal reads exactly as the brief's sequence, largest yard step 0.229° against a brace rate of 0.458°/step, and the interval never inverts; the "ease the other brace" hint is a red rope plus a caption in the schematic and a line in the cleat tooltip. **(p) now passes:** aback throughout, braces home at 4.4 s, below 1.5 kn at **7.6 s** of the 15 allowed, settling at 1.33 kn against the 4.72 kn she made drawing and sheeted. Round 15's `braceInterval` collapse-to-square is gone; an interval that inverts anyway (only a hand-set or imported state can make one now) jams the spar where it stands instead of teleporting it. Answering item 6's question: **the same refusal should NOT follow for headsail sheet pairs**, and for a sharper reason than "leave the sloop alone". A brace bounds the yard on ONE side only — it can pull its arm aft and nothing else — so when both are hauled the two bounds cross over and there is no angle that satisfies them; round 15's collapse-to-square was an arbitrary pick, which is why the yard jumped. A jib sheet bounds its clew on BOTH sides (that is what the `beta` fairlead offset models), so the pair's interval shrinks symmetrically as the sheets come in — `[-70, 70]` at (1, 1), `[-25, 25]` at (0.5, 0.5), `[-2.5, 2.5]` at (0.25, 0.25) — and reaches `[0, 0]` at about (0.2, 0.2), which is the real trim of a jib sheeted flat amidships, not a jump. The sloop's rule is right as it stands, and refusing the haul there would forbid a trim the boat actually has. Agent's choices where the brief was silent: a key held with `Ctrl` or `Meta` is neither acted on nor `preventDefault`-ed (so `Ctrl+R` still reloads); a `blur` listener clears held keys and the `Space` latch, since a focus-stealing chord can eat the `keyup`; `P` guards `event.repeat`. Schooner draft delivered as `report-round16.md` — its findings for round 17 are that the gaff topsail needs a sail whose force depends on another sail's state (the first such dependency in the model), and that the first ship to need the `Alt` layer needs `Alt+D`, which is one of the browser chords item 7 just retired.

## 16. The topsail schooner (round 17) and the shading round (round 18)

Written 2026-09-10 from the round-16 report (`report-round16.md`), which holds the full `SHIPS.topsailSchooner` draft, the five schema changes with their code sites, the general/trim classification and the hull numbers with their `[assumed]` tags. **That report is the detail; this section is the brief.** The agent must read both, and may take the report's object and numbers as proposed unless this section overrides them.

**Two decisions taken here before the round was written (Bregir, 2026-09-10):**

- **The layer modifier is not built.** `above` goes into the definition as data — it is a fact about the rig — but the gaff topsail's sheet is reached by *selecting the sail*, not by holding a key. See step 6. Hold-`Tab` was rejected because §13 D′ already says selection replaces the layer; building the modifier would mean teaching fingers a binding we have decided to retire.
- **Blanketing bands stay off the gaff sails, and row (v) is dropped from this round's set.** Reason in full: the rule cannot be given to one rig and not another without breaking §10's one-model rule, and applied to the sloop as §15 words it, it gets the beat wrong — the apparent wind ~25° off the bow puts the main roughly on the jib's downwind line, so a naive height-band rule would *shade* the main where the real effect is the slot, a gain. That sign needs its own acceptance rows and a deliberate sloop re-baseline. It becomes **round 18** (below). Known and accepted consequence: until then the schooner runs wrong — her fore keeps drawing in the main's lee.

### Round 17 — build the topsail schooner

Schema before ship, and **both shipped ships byte-identical after every step except where noted** (sloop `5b1973ce4000dbd552068bfed7485148`, cutter `f3fa8d9d35ae5101d77b634f3651da30`). Report the pair of md5s after each numbered step, not only at the end — this is the discipline that has caught every refactor bug since round 14.

1. **`handling` + `SIM.handling(config, name)`** — per-ship handling rates falling back to global config exactly as `SIM.hull(config)` does. Ships that declare none are unaffected. This is the smallest change and the fallback pattern the rest copy, so it goes first.
2. **`deck.cleats` + `hull.beam`**, with the `CLEAT_LAYOUT` fallback intact. Checks: every declared cleat inside the hull outline; no two within 0.4 m; the foresail's sheet cleat between the two masts; sloop cleats bit-identical with `deck` absent.
3. **`boomLen` per sail** (formula stays the default), **`masts[].burgee`** (defaulting to the aftmost mast). Checks: no boom tip within 0.5 m of the next mast aft; the aftmost boom overhangs the transom by 0–1.5 m.
4. **`stays` as geometry** — `{ id, tack:{x,z}, head:{mast,z} }`, a headsail naming its stay, the renderer taking tack, head and luff length from it. `xCE`/`zCE` stay the physics numbers and are *not* derived from the stay; add a check that each sail's `xCE` falls inside the triangle it is drawn as, so the two cannot drift apart silently. Stays are optional; the sloop opts out and keeps its current geometry. Giving the sloop real stays is a later presentation round.
5. **The `gaff-topsail` type, and sibling state on the type handlers** — the only physics in the round. A triangular sail whose foot is the parent gaff sail's gaff: it takes its geometry and its *effective area* from the parent, and goes slack when the parent's peak is dropped. This is the model's first sail whose force depends on another sail's state, so `effArea` and the force path gain one argument giving read access to the sibling's state. **Build that argument as the general mechanism it is, not as a gaff-topsail special case** — round 18 needs exactly the same plumbing for shading. Checks: peak dropped → the topsail's effective area goes to zero and its force with it; peak up → area and force scale with hoist; no existing sail reads a sibling, so both shipped ships stay byte-identical.
6. **Sail selection (the select half of §13 D′).** Click a sail or its cleat in the schematic to select it; while a sail is selected the §14 grid keys act on *that sail's* lines, so `KeyD` hauls the main gaff topsail's sheet with the topsail selected and the mainsheet without. `Escape`, a click on empty water, or selecting another sail clears it. The selection must be visible — the sail highlighted in the schematic and named in the HUD — because an invisible selection is worse than an invisible modifier. Add a keyboard-only way to cycle the selection. **Not in this round:** group deltas, offset preservation, "square up" — there are no real groups on a one-yard rig, and they are first exercised on the brig. Also in this step: make the browser-reserved chord list a **table that CHECK 13 asserts against**, so item 7's rule is enforced rather than remembered. If selection turns out to sprawl beyond this step, fall back to hold-`Tab` for the layer and **say so in the report** rather than quietly expanding the round.
7. **`SHIPS.topsailSchooner` and its acceptance set.** Take the report's object as proposed. Every hull number in it is `[assumed]`; tune them against (q) and (s) and print what moved and why.

### The schooner's acceptance set (§13 F)

The sloop's twelve and the cutter's four stay with their own ships.

| # | Setup | Expected |
|---|---|---|
| q | Close-hauled, all fore-and-aft canvas, topsail furled, TWS 6, 180 s | settles at TWA 50–58°, SOG 5–7 kn, heel 8–14° |
| r | As (q) with the topsail set and braced sharp | pointing worsens by 3–8° and SOG is no better — the square sail's price on the wind, at schooner scale |
| s | Tack from TWA 50 starboard to TWA 50 port, topsail furled | through in under 6 boat-lengths; exit SOG ≥ 55% of entry; report the miss-stays threshold as (e) does — a schooner should be *able* to miss stays from slow |
| t | Wear from TWA 130 to TWA 130, topsail set | yard through square and re-braced; under 90 s; no NaN, nothing stuck |
| u | Heave-to: **fore staysail backed**, fore-topsail backed, mainsheet hard in, helm lashed a-lee (**amended 2026-10-01**, see below) | settles; drift under 1.5 kn; lies 40–100° off the true wind and never comes inside 30°; no oscillation |

Row (v) — running under square canvas with the main blanketing the fore — belongs to round 18 and is added to this set there.

**Row (u) amended 2026-10-01 (Bregir's call on round 17's open question).** Back the fore staysail as well, and treat the round-17 FAIL as a fault in the brief rather than in the model. Reason: heaving-to on a fore-and-aft rig *is* a backed headsail balanced against a mainsail sheeted hard in, with the helm a-lee — the headsail's forward centre of effort is what stops her rounding up. The original wording was square-rig practice (back the topsail), which is right for the brig and wrong for a schooner, and the agent's diagnostic proves it on this hull: topsail alone she hunts between TWA 10° and 82° on a ~150 s period, luffing into irons at the top of each swing; with the staysail backed too she lies between 55° and 98°, forereaches gently at +0.18 kn instead of making sternway, and her heel movement falls to a third. The expectation gains the angle criterion the first version lacked — "settles" was never measurable on its own, which is how a 72° hunt passed two of the three tests it was given. The topsail stays backed in the row so the square mechanism is still exercised.

**Consequence for the definition (round 17 finding 7), to be built with the brig, not before.** How a ship is hove-to is a property of her rig — back a headsail on a schooner, back the main topsail on a brig — and nothing in the definition carries it. Add a `heaveTo` block naming which sails are backed, which are sheeted hard and which way the helm goes, so the manoeuvre comes from the ship rather than from each acceptance row. Until then every rig's (u)-equivalent spells its own setup out, as this one now does.

### Round 18 — shading (the blanketing round), both rigs at once

Also carries one piece of unfinished business from round 17: **re-run the amended row (u)** (fore staysail backed) and report it, before any shading work. Not part of round 17. Written here so the deferral is a plan rather than a gap. The round gives fore-and-aft sails height bands and settles the sign of the interaction on every point of sail, using the sibling-state plumbing from step 5. It is a **physics round: the sloop's md5 moves deliberately**, with before/after printed and the twelve sloop scenarios re-run. Acceptance must include, at minimum: on a beat the sloop's headsails and main together **must not** lose drive (the slot is a gain — this is the case a naive downwind-line rule gets backwards); on a run the sloop's main **must** measurably shade the headsails; and the schooner's row (v). The first-pass ordering question the round has to answer is whether shading is computed on the apparent-wind line at all, or on a simpler "aft sail shades forward sail when the apparent wind is abaft the beam" rule that cannot misfire on a beat.

### Report back for round 17

Per step: the two md5s. Then the boom/cleat/stay geometry checks, the gaff-topsail area-and-force check with the parent's peak up and down, a walk-through of selection (what is selected, which key does what, how it clears), the reserved-chord table as CHECK 13 asserts it, the five schooner rows q–u with numbers, which `[assumed]` hull numbers were tuned and against what, and anything the definition still cannot express.

**Round 17 (built, 2026-09-10).** All seven steps; both decisions honoured (no layer modifier — the gaff topsail's sheet is reached by selecting the sail; no bands on the gaff sails, so no row (v)). Selection stayed inside step 6, so the hold-`Tab` fallback was not needed. **Sloop `5b1973ce…` and cutter `f3fa8d9d…` held after every one of the seven steps**, checked as each landed; step 7 added only new numbers. `render-checks.mjs` 141 assertions green (was 98; new groups CHECK 20 hull outline and declared cleats, 21 booms and burgee, 22 stays, 23 gaff topsail and sibling state, plus extensions to 13 and 19); `render-smoke.mjs` clean; all three ships survive a serialise/reload byte-identically, the schooner's own harness md5 being **8e466ded82c41d71cb9e93b8cbadea7a**. **q, r, s, t pass. (u) is three of four.** Detail and every number: `report-round17.md`.

The round's findings, in the order they matter:

1. **Only `cU` was tuned — 1200 → 400, on (q).** `xCLR`, `Nr` and `cV` were each swept and each held at the round-16 scaled value; the rest were untouched and are still `[assumed]`. The reason `cU` had to move is a scaling result the brig will meet again: both rigs carry the same canvas for their size (sail area / displacement^(2/3) is 18.3 on the sloop, 17.9 on the schooner), so sail *drive* scales as `L²` — and if drag scales as `L²` too, the two cancel and the longer hull sails at the *same* speed as the short one instead of faster. Real vessels do not behave that way, so in this model's single-coefficient form `cU` must grow a little more slowly than **length** (400/130 = 3.1 over a length ratio of 3.4), not as its square. At 400, (q) reads 52.5° TWA / 6.75 kn / 9.8° heel — all three criteria in band.
2. **A square topsail braced sharp does not move the best-VMG angle; it removes the high end of the groove.** Measured directly, braced to 55° close-hauled the fore topsail contributes about **−1000 N** of drive at TWA 41–49 with its side force to windward, crosses zero near 53° and draws by 60°. So the optimum sits exactly where the sail is neutral and stays there, while the close edge of the useful groove moves from 40.8° to 47.2° — the 6.4° that (r) reports. "She cannot point as high" is a claim about the edge, not the peak, and the row had to be measured that way to mean anything.
3. **(u) as worded does not settle.** Fore-topsail backed, mainsheet hard in, helm a-lee, headsails let fly: she hunts on a ~150 s period between TWA 10° and 82° — the 150 m² main rounds her up until she is head to wind and stops driving, then the 70 m² backed topsail pays her off until it fills again. Steady, not diverging (the variance ratio reads 0.99), but coming to 10° off the wind is luffing into irons, not lying to. **Backing the fore staysail as well fixes it** — she then lies between 55° and 98°, forereaching gently at +0.18 kn instead of making sternway, with a third of the heel movement — and that is what a crew actually does to heave a schooner to. It is an addition to the setup this section specifies, so it is reported as a diagnostic and the criterion is left against the brief. **Open question for Bregir: should row (u) back a headsail too?** — **answered 2026-10-01: yes.** The row is amended above; the agent's reading was right, and the fault was in the brief, which wrote square-rig practice for a fore-and-aft rig. Re-run (u) as amended at the start of round 18 and report it with that round's numbers; no other row changes.
4. **Three corrections to the round-16 draft**, each caught by a check this section asked for: the draft's mainmast at −3.5 m with a 12.5 m boom overhangs the transom by 5.2 m against step 3's own 0–1.5 m rule (masts moved to fore +6.2 / main −1.1, booms 6.5 / 10.5, foresail 80 m², mainsail 150 m², total 460 m²); the draft's cleats sat outboard of the hull at their own stations; and, pre-existing and untouched, **the sloop's own cleats sit outboard of its drawn outline** (`CLEAT_LAYOUT` puts them at 0.14–0.20·LWL against a 0.12·LWL half-beam) — a later presentation round's job, since fixing it moves the sloop's pixels.
5. **Two of my own measurement errors, both the same class as round 13's.** (q) first reported that she *cannot sail at TWA 60* (1.05 kn, 32° of leeway) — that was one close-hauled trim held across the whole sweep, not the boat; sheeted for 42° the sails are stalled by 60°, and with the trim swept at every angle 60° comes out at 7.19 kn. And (u) first read a diverging oscillation because the window was 90 s against a ~150 s hunt — a slow transient has to be measured over more than one period of itself. VMG is now taken against the **track**, not the heading: measured off the heading, leeway is free and the best angle is always the highest one tried.
6. **Step 5's `rig` argument is the general mechanism, not a parent pointer.** `{ sails, config }`, built once per step from the state before that step's forces, so every sail sees the same rig and loop order cannot move a number; `undefined` is valid and a handler that cannot find its parent reports the sail *not set* rather than NaN. Round 18's shading needs exactly this and nothing more.
7. **Two new things the definition cannot express** (the round-16 list otherwise stands, less what step 5 delivered): a sail's trim limit cannot depend on the sail it is set above — a gaff topsail is sheeted to its parent's gaff, so its real clew range follows that boom, and it gets a fixed `deltaLim` instead; and a ship cannot say **how her crew heaves her to**, which (u) shows is a property of the rig (back the topsail on a brig, back a headsail on a schooner) and which matters now that acceptance sets are per ship.

Agent's choices where the brief was silent: `Tab` / `Shift+Tab` cycle the selection bow to stern and off either end to nothing (a cycle, not the rejected hold-`Tab` layer — nothing is held); a click where a sail and the sail above it coincide goes to the one listed first, i.e. the larger; `hull.beam` and `deck.cleats` are both optional with the old behaviour as the fallback, so the sloop is bit-identical rather than merely equal; the "fore-and-aft sheet is cleated between its own mast and the next aft" check is written as a rule over the definition rather than as "the foresail's cleat", so it holds for a brig; and `runSanityChecks` now finds its gaff sail by **role** rather than by the id `'main'`, which a schooner does not have.

**Round 18 (built, 2026-10-01).** Shading built as one rule: an aft sail shades a forward one only with the apparent wind abaft the beam (smooth from 0 at the beam), scaled by lateral overlap. Follow-up in the same round fixed `freeTrim` (shorter rotation to the flow-aligned chord, for every fore-and-aft sail) and `isAback` (pressure pushes the sail aft, not which side it is on), so a goose-winged jib now emerges from the sheets at TWA 175–180. md5s now: sloop `cc9ec0ab1cf9ec3f41aba56ed52cfdd5`, cutter `7a4b7497c8dbc1132145f37f154bd51a`, schooner `3514d4369ddfbc0d1be8e2d045938494`. Fails reported, nothing tuned: (c) run 3.76 / 3.96 kn goose-winged against 4–5; (u) 55.6–102.2° and heel ratio 1.085. Open before round 19 is written, in this order: (1) the free angle ignores the sail's own force (jib crosses at TWA 130, boom holds to 57° by the lee); (2) §5's near-home sheet collapse blocks goose-winging at TWA 165–175; (3) (c)'s run band; plus shadows multiplying (schooner jib keeps 18%). Every number and trace: `report-round18.md`.

### Round 19 — sheets that only ever give room, shadows that scale, and a clew held out by its own sail

Written 2026-10-03 from the design walk on round 18's three open questions (Bregir, in Cowork). Target: Claude Code, Opus — a physics round. **All three md5s move deliberately.** Print the three md5s before step 1 and after every step, and re-run every ship's full acceptance set after every step. Nothing is tuned to make a row pass: a fail is reported as a fail, with the diagnostic. Every new constant is `[assumed]` and must be derived from geometry or materials, not fitted.

**Step 1 — the sheet interval (supersedes §5's two-sheet rule and its collapse clause).** Two faults in `SIM.sheetIntervalTwo`, both confirmed by running it:
- *Port and starboard are not mirror images.* A starboard sheet hauled home holds the clew at +20° (its fairlead); a port sheet hauled home holds it at 0°, not −20°. The cause is the collapse step, which always picks the *lower* bound regardless of side.
- *Easing a hauled sheet drags the clew inward.* From ease 0 to 0.11 the starboard interval collapses to `20 − 90·es`, pulling the clew from +20° to +10° before the interval opens. A rope cannot do that; this is what blocked goose-winging at TWA 165–175.

The principle, agreed: **a sheet bounds how far the clew may be from its fairlead. Hauled home, the clew sits at the fairlead; easing only ever gives more room; port and starboard are exact mirrors.** A suggested form that does this and leaves every ease ≥ `beta/deltaLim` (≈ 0.22) byte-identical: port `[−max(beta, ep·deltaLim), ep·deltaLim − beta]`, starboard `[beta − es·deltaLim, max(beta, es·deltaLim)]`. Neither can invert, so the collapse clause goes. The empty-intersection rule (both sheets hard → `delta = 0`) stays. The agent may choose another form if it can say why it is better. Checks (new render-check group):
- Mirror: for every ease on a 0.01 grid, the port interval is the negated starboard interval.
- Monotone: for e2 > e1, the interval at e2 contains the interval at e1.
- Hauled home is ±`beta` exactly, and no single-sheet interval ever inverts.
- Re-run round 18's goose-wing procedure (lee sheet let fly, weather sheet hauled home, held 2 s, eased to 0.8 at 0.5/s) at TWA 175, 170, 167 and 165, and report hold or fall back for each. This is still before step 3, so the jib is held by geometry alone.
- Report which sloop scenarios used a sheet below 0.22 and how much each moved. (a)'s working sheets are 0.20, and (k) backs the jib with the port sheet at 0.1.

**Step 2 — a sail's shadow scales with the pressure it gets itself (answers round 18 finding 1, "shadows multiply").** Today a sail standing in another sail's shadow casts as deep a shadow as one in clear air. That is why the sloop's jib keeps only 26% dead downwind and the schooner's jib keeps 18%. The air behind a sail is slowed by that sail's drag, and its drag scales with the pressure it actually receives. So each sail k's term becomes `kShade · w(AWA) · heightOverlap · lateralOverlap · setFraction_k · kept_k`, where `kept_k` is k's own pressure factor. Compute from aft to forward, so each sail's `kept` is known before it casts its shadow. The aftmost sail keeps 1, so a two-sail interaction is unchanged. No new knob. Checks:
- The beat row is still 0% loss.
- The aftmost sail is still unshaded.
- The no-step checks in CHECK 19 still pass.
- Print the pressure each sail keeps on the sloop at TWA 160 and 180, and on the schooner's (v). The expectation for the sloop's jib at 180 is roughly 0.37, against 0.258 today `[assumed, Cowork estimate]`.
- Re-run (v) against its unchanged criteria.

**Step 3 — the clew is held out by its own sail, against weight (answers open question 1).** Today `freeChord` is a weathervane rule: the clew goes to the flow-aligned chord at rate `kBoom·AWS` whatever the pressure, so a sail with almost no pressure holds its angle as firmly as a full one. Replace the target with a **moment balance about the sail's hinge**. For a headsail the hinge is its stay; for a gaff sail it is the mast. The moment has two parts:
- **Aerodynamic.** The sail's own force about the hinge, taken from the force model as computed, *including shading*. It pushes the clew outward while the wind strikes the face that holds it out. It falls off as the wind comes toward the chord, and it falls off as pressure drops.
- **Gravity.** The weight of cloth and sheet, plus spars for a gaff sail, about the hinge axis. A headsail's stay is raked, so its weight swings the clew toward the centreline even upright. A boom on a near-vertical mast has a gravity moment only through heel `phi`.

The clew moves toward the side the net moment drives it, capped at today's rate `kBoom·AWS`, and the sheets clamp it as now. A pressed sail behaves as today, because its pressure dwarfs its weight. A weakly pressed sail is held weakly. In particular, **a goose-winged headsail without a pole stays out only while its own pressure carries its weight.** When the wind comes too far forward, or the jib falls into the main's shadow, the clew sinks inward past the unstable point and the jib comes across.

The rule is one rule for every fore-and-aft sail; square sails are untouched. The masses are derived from area and length, with stated assumptions (for example, canvas kg/m², sheet kg/m, spar kg/m), and listed with `[assumed]` tags. Keep `SIM.chordAback` as it is.

Why the boom gets no rule of its own (Bregir, 2026-10-03): a stiff sail is pushed out until the wind blows along it. On flat water, sailing far by the lee is not wrong; dinghies sail 20–30° by the lee. A gaff boat's 15–20° comes from rolling and yawing in a seaway, and the sim has gusts but no sea-induced roll. So the boom only gets what the general weight term gives it through heel. **"Rolling in a seaway"** goes on the list as its own future physics item, and it will bring the gybe point forward with no new rule.

**Acceptance, round 19:**

| Row | Setup | Expected |
|---|---|---|
| Goose-wing holds | Sloop, TWS 6, run, goose-wing procedure as in step 1, at TWA 180, 175, 170, 165 | Holds at all four: clew to windward, jib drawing, not aback |
| Goose-wing collapses | From a goose-winged TWA 180, head up at 0.25°/s | The jib comes across between **TWA 150 and 165**. Report the angle at TWS 4, 6 and 8; heavier wind should hold it longer |
| Beat untouched | (a), (b) and the round-18 beat-shading row | SOG and total drive within ±2% of round 18's values; shading loss still 0% |
| (c) rewritten | TWS 6: beam reach as now; dead run **goose-winged** by the procedure; dead run with the jib on the main's side | Goose-winged run SOG ≥ **0.70 ×** beam-reach SOG, and goose-winged > main's side. This replaces the 4–5 kn band, which was set before shading existed. The 5.5–6.5 kn reach band and "AWS < TWS on the run" stay |
| (i) rewritten for flat water | As now | The eased boom crosses when steered through to −150°; report the by-the-lee angle at which it starts across, and there is no angle band. The sheeted-in variant crosses gently. The "~1 s" timing is dropped |
| Everything else | All sloop, cutter and schooner rows | Re-run and report against their current criteria. (u) keeps its band; report it, because steps 1 and 3 may move it |

**Report back for round 19:** the three md5s before and after each step; the step-1 checks and the scenario trims that moved; per-sail pressure kept (step 2); the masses and lever arms used in step 3, with their derivation; every acceptance row with numbers; anything the moment balance did that the brief did not predict. Keep it in `report-round19.md`.

**Round 19 (built, 2026-10-03).** All three steps; nothing tuned; detail in `report-round19.md`. Step 1 and step 2 work as specified (the sloop's jib keeps 0.372 dead downwind; the schooner's jib 0.18 → 0.38). Step 3 works — schooner (u) now passes all four tests — and did three things the brief did not predict: weight moves a goose-winged jib's tipping point ~10° outboard (past the 20° a sheet hauled home reaches), the jib comes across at TWA 155.5 / 142.0 / 137.3 at TWS 4 / 6 / 8, and **the sloop's tack breaks** ((e) completes at no speed; (d) 19.0 s against 20) through a knife edge in the camber model. Final md5s: sloop `9a9ab2d921324a974d5f28df7deb0b6d`, cutter `e9f8fcaa876abf1188cc2453a28d2f43`, schooner `83df12eb4f20848e8c1e6a8f29fb3c9a`.

### Round 20 — camber of an unloaded sail, two acceptance fixes, and an investigation (no model change in step 3)

Written 2026-10-04 from the round-19 review (Bregir, in Cowork). The first round worked through `run-dispatch` (`dispatch-round20.md`). Same discipline as round 19: md5s of all three ships before step 1 and after every step; every ship's acceptance set re-run after every step; nothing tuned; fails reported as fails.

**Step 1 — an unloaded sail has no camber of its own (fixes the broken tack).** Round 19 §6: for the headsails `i0 = iFlip = 8°`, and the moment balance parks a free, luffing headsail at an effective angle of about 0.5° — just inside the flip threshold — so its camber never flips through a tack and the jib lifts the wrong way afterwards. The physics: a cloth sail's camber is made by its pressure; cloth with no load has no memory of which side it bellied. The rule, replacing §5's flip rule:
- A sail whose effective angle `alphaE = s·i + i0` is **below the luffing threshold (`luffThreshold`, 4°) is unloaded**: its camber side follows the side the wind strikes, `s = sign(i)` — with a dead band, so `s` does not change while `|i| < 1°` `[assumed, to stop chatter at i ≈ 0]`.
- A sail at or above the threshold is loaded and **keeps** its camber side. The fixed `iFlip` hysteresis is retired; say whether any row or check still read it.
- Prove it is not a moved knife edge: trace the (e) tack from 2 kn and from 0.75 kn as round 19 §6 did (incidence × camber side, `alphaE`, jib side force, sails' yaw moment through the tack), and show the camber flips **once** per headsail per tack — no flip-flop. Also run the `iFlip` 6 diagnostic's failure case under the new rule.

**Step 2 — two acceptance rows rewritten (rows only, no physics).**
- **Beat untouched** now reads: (a) and (b) SOG and total drive within ±2% of **round 19's final values**. Round 19's (b) −6.3% came from step 1's sheet rule doing what was agreed (a 0.20 sheet now holds the clew at its fairlead) and is accepted as expected.
- **Goose-wing holds** is set the way a crew sets it without a pole: goose-wing at TWA 180 by the round-18 procedure, then head up at 0.25°/s to 175, 170 and 165, holding each for 60 s. Expected: **holds at all three** (clew to windward, drawing, not aback). Setting the goose-wing from the main's side by the sheets alone at 165–170 becomes a **reported measurement with no criterion** — without a pole that is a physical "can't", not a fault.
- **(i) "crosses gently"** — the round-19 agent's criterion is confirmed: peak heel after the cross below the eased variant's.

**Step 3 — investigation only: why an unpoled goose-winged jib collapses earlier in a breeze. Do not change `index.html` in this step;** a diagnostic script is fine. Round 19 has the jib crossing at TWA 142 and 137 in 6 and 8 m/s; the sailor's experience is that it falls in earlier, on flat water too. The reviewer's lead `[assumed]`: without a pole, the wind *lifts* the clew rather than pushing it further out — the sail stands high and baggy, perhaps 45–55° out instead of the 70° the 2D sheet limit allows — so the wind comes along the sail sooner, independent of wind speed. (Twist was considered and rejected: an upper sail opening outward holds *longer*, not shorter.) Deliver, with numbers:
- One or more candidate mechanisms, each grounded in geometry (stay rake, luff and foot length, sheet lead) — the clew-lift lead first, anything else you find second.
- For each: the outboard angle it predicts for the clew, the collapse TWA at TWS 4, 6 and 8, and what it does to the goose-wing rows, (c) and the run.
- The constants each needs, with derivation and `[assumed]` tags, and your recommendation. Round 21 builds the chosen one.

**Acceptance, round 20:**

| Row | Expected |
|---|---|
| (d) | Tack completes in < 20 s, exit > 2 kn; report the margin |
| (e) | A threshold exists again between 0.25 and 1.5 kn |
| Camber trace (step 1) | One flip per headsail per tack, no flip-flop |
| Beat untouched (rewritten) | (a), (b) within ±2% of round 19 final |
| Goose-wing holds (rewritten) | Holds at 175, 170, 165 after setting at 180 |
| Goose-wing collapses | Report TWS 4 / 6 / 8. Known: 6 and 8 fail until round 21 — not a round-20 fail unless TWS 4 leaves its band |
| Schooner (u) | Still passes all four |
| Everything else | Re-run and report against current criteria |

**Report back for round 20** in `report-round20.md` on the branch: md5s per step; the camber traces; every acceptance row with numbers; step 3's candidates, numbers and recommendation; anything the new camber rule did that the brief did not predict.
