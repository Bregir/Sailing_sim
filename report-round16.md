# Round 16 — report

Built 2026-09-10, against `spec-2d-sandbox.md` §15 "Round 16 — square-sail corrections", items 1–7.

**Verification, up front.**

| | |
|---|---|
| sloop harness md5 | `5b1973ce4000dbd552068bfed7485148` — **unchanged**, checked after every one of the seven items |
| cutter harness md5 | `f3fa8d9d35ae5101d77b634f3651da30` (was `01be6e51818b4ae2f2d397e6b48cce45`) |
| `render-checks.mjs` | 19 groups, **98 assertions, all green** (7 new) |
| `render-smoke.mjs` | clean in all modes; one new case, a brace hauled bar-taut |
| `round14-checks.mjs` | serialise/reload identical for both ships; captive-speed roll 33.4% |
| cutter scenarios | **m, n, o, p all pass** — (p) for the first time |

The one FAIL in a cutter run is the round-13 heel-overshoot print, which the spec already records as measured wrong rather than modelled wrong (round 14 replaced it with check B, which passes). It was not touched.

---

## Item 1 + item 2 — one helper, not two corrections

The two items turn out to be the same piece of arithmetic seen from either end.

A yard is a symmetric plate hung at its middle, so **both** arms are candidates for the "aft" arm the clew rule wants, and `deltaEq` is two-valued: `deltaEq` and `deltaEq ± 180`. Round 15 broke the tie on the sign of `psiY`, which put a 180° step in the incidence at `psiY = 0`. Round 16 lets the wind break it — and the arm whose incidence lands inside `|i| ≤ 90` is found by folding one expression:

```js
SIM.yardIncidence = function(AWA, psiY){
  let i = wrapDeg(AWA + psiY - 90);
  if (i > 90) i -= 180; else if (i <= -90) i += 180;
  return { i, delta: wrapDeg(i - AWA) };
};
```

It works for both signs of `psiY` because the two mappings — `psiY − 90` for a positive yard angle, `psiY + 90` for a negative one — differ by exactly 180, which the fold absorbs.

Item 2 then falls out. Zero incidence is satisfied by two yard angles 180° apart; the one **nearest** the current `psiY` is `psiY − i`, because that folded `i` is already inside ±90. So `freeTrim` is one subtraction, and the clamp to `±braceLim` comes *after* the choice — which matters, because a yard braced hard the wrong way must still know which way round to feather rather than settling on the limit it is already against.

**Printed check — item 1 (wind-relative yardarm):**

```
psiY=0: AWA=+60 -> i=-30.0 deg · AWA=-60 -> i=30.0 deg
        expect equal magnitude, 30 deg (stalled plate, aback on both)   PASS
AWA=+60: psiY=-5 -> i=-35.0 · psiY=0 -> i=-30.0 · psiY=+5 -> i=-25.0
        expect a smooth 5 deg per 5 deg, no jump through square         PASS
```

Equal magnitude, opposite sign: the plate meets the flow at 30° either way, stalled and aback on both, which is the physical claim §15 makes. One degree of yard is one degree of incidence right through square.

**Printed check — item 2 (free yard angle dead downwind):**

```
AWA=+180, from psiY=+40 -> settles 55.0 deg   expect +55, largest step 0.300 deg   PASS
AWA=+180, from psiY=-40 -> settles -55.0 deg  expect -55, largest step 0.300 deg   PASS
AWA=-180, from psiY=+40 -> settles 55.0 deg   expect +55, largest step 0.300 deg   PASS
AWA=-180, from psiY=-40 -> settles -55.0 deg  expect -55, largest step 0.300 deg   PASS
```

Both signs of AWA give the same answer, so a yard no longer slams from one limit to the other when the wind is called +180 instead of −180.

The round-15 sanity row for `psiY = −55` at AWA +60 now prints `i = −85` where it printed `+95`: the same plate at the same angle to the flow, measured from the other yardarm. `alphaE` still saturates at 90, `Cl` is still 0, the force is unchanged — pure drag, hard aback, `Fx = −158.8 N`. The check's wording was updated, its assertion was not.

## Item 3 — (p) rewritten, and it passes

```
-- (p) Topsail aback and the fore-and-aft sheets let fly -- bringing her up --
   Topsail flagged aback: 100% of the time; yard at -55 deg, braces home at 4.358 s   [PASS]
   Time to fall below 1.5 kn (s): 7.6                            expected 0-15        [PASS]
   SOG over the 15 s (kn): 4.001 -> 0.673 (min 0.667, settles 1.327;
                                           drawing and sheeted she made 4.718)        [OBSERVED]
   Why: backed topsail vs the rest of the rig (N of drive): -141.6 against 310.5      [OBSERVED]
```

She comes below 1.5 kn at **7.6 s** of the 15 allowed and settles at 1.33 kn, against the 4.72 kn she was making drawing and sheeted. The topsail's own drive is −142 N against 310 N from the rest of the rig — the fore-and-aft sails are weathercocking with their sheets gone, so what is left of their drive no longer swamps the brake. Round 15's numbers were −292 N against 1150 N, which is why the backed topsail alone could not stop her.

One thing worth knowing about the row order: the topsail reads aback from the very first step, *before* the braces have moved. At TWA 60 a yard braced as sharp as 45° is already nearly feathered (|i| a few degrees) — the same fact scenario (n) measures, that a square sail is useless on the wind. So the honest number for "the braces are home" is when the yard reaches its limit, 4.4 s, and that is what the row prints.

## Item 4 — braces as two taut ropes

Both braces of a braced yard are taut, so "lazy" cannot mean slack. Which one is being **worked** follows the yard, not the wind: on starboard-tack trim (`psiY > 0`) the yard rests on its *lower* bound, which the port brace sets, so the port brace is the one the crew hauls and the starboard brace is the upper bound just holding on.

- straight lines, no ease-bow (`sag = 0` for a `bracePair`)
- thickness by load, and **both** braces carry the yard's load — unlike a lazy sheet, which shows no tension
- working brace at full alpha, the other dimmed to 0.5 — and **not dotted**, because a dotted line reads as slack
- a square yard (`psiY = 0`) has no leading brace, so neither is dimmed
- a brace hauled bar-taut against its mate draws red whatever the sail load says: it is the rope, not the sail, that is at its limit

New assertions in CHECK 18:

```
PASS  each brace runs from its own yardarm to a W/R cleat, and both are taut ropes
PASS  psiY = +40: the port brace is the one worked, and both carry the yard's load
        bTp working=true load=473.1 N · bTs working=false load=473.1 N
PASS  psiY = -40: the starboard brace is the one worked, and both carry the yard's load
PASS  a square yard has no leading brace: neither is dimmed
PASS  a lazy sheet is still slack and untensioned, so braces and sheets read differently
        jib stbd (lazy) load=0 taut=false · jib port (working) load=442.3 N
```

## Item 6 — the refusal, and the answer to the sheet question

**Brace-refusal check**, run in a dead calm so the yard is moved by its braces alone:

```
start (both eased)           eP=1.000 eS=1.000   psiY=0.0 deg
haul port home               eP=0.000 eS=1.000   psiY=55.0 deg   expect +55                PASS
then haul starboard          eP=0.000 eS=1.0000  psiY=55.0 deg   bar-taut, no movement     PASS
ease port to the half mark   eP=0.500 eS=1.000   psiY=55.0 deg
now haul starboard           eP=0.500 eS=0.500   psiY=0.0 deg    eS 0.500, yard square     PASS
largest yard step in all of it: 0.2292 deg   expect <= the brace rate 0.4583 deg/step      PASS
eP+eS never below 1: true · interval never inverted: true                                  PASS
```

The refusal is a floor on the haul, not a rejected step: a brace comes in until the pair goes bar-taut at `eP + eS = 1` and stops there. Easing is never restrained, and a pair that is *already* over-hauled (only an imported or hand-set state can be) is held rather than shoved back out, so nothing can move a rope the wrong way.

Round 15's collapse-to-square is gone from `SIM.braceInterval`. An interval that inverts anyway is now reported (`inverted: true`) and `SIM.updateTrim` **jams the spar where it stands** instead of teleporting it to the middle — which is what an over-hauled pair of braces physically does.

The hint has two homes: the schematic draws the offending rope red and prints `R bar-taut — ease the other brace` along its bottom edge, and the cleat tooltip adds `— bar-taut, ease the other brace first` on hover.

**Should the same refusal follow for headsail sheet pairs? No — and for a sharper reason than "leave the sloop alone."**

A brace bounds the yard on **one** side only: it can pull its own arm aft and nothing else. When both are hauled the two bounds cross over and there is no angle that satisfies them, so round 15's collapse-to-square was an arbitrary pick — which is exactly why the yard jumped.

A jib sheet bounds its clew on **both** sides; that is what the `beta` fairlead offset models. So the pair's interval shrinks *symmetrically* as the sheets come in and never crosses over:

| `eP`, `eS` | clew interval |
|---|---|
| 1.0, 1.0 | `[−70°, +70°]` |
| 0.5, 0.5 | `[−25°, +25°]` |
| 0.25, 0.25 | `[−2.5°, +2.5°]` |
| 0.2, 0.2 | `[0°, 0°]` |

`[0, 0]` there is the real trim of a jib sheeted flat amidships, reached smoothly — not a jump. Refusing the haul would forbid a trim the boat actually has. **Recommendation: leave the sloop's sheet rule exactly as it is.**

## Item 7 — the modifier layer off `Ctrl`

Let fly is now **hold `Space` + the rope's key**. `Space` is not a real modifier key, so it is latched in `ui.mods.space` from its own keydown/keyup rather than read off the event, and its keydown calls `preventDefault` so the page does not scroll. Pause moved to `P` (guarding `event.repeat`).

Two rules now hold for every layer, and the second is the one that was missing:

1. every combination the handler acts on calls `preventDefault`
2. a key held with `Ctrl` or `Meta` is the **browser's** chord — it is neither acted on nor defaulted away, so `Ctrl+R` still reloads and `Ctrl+T` still opens a tab

There is also a `blur` listener that clears held keys and the `Space` latch: a focus-stealing chord can eat the `keyup`, which would otherwise leave a rope hauling with nobody on it.

**The key list as bound** (read out of the definition by CHECK 13, not retyped from §14):

```
Gaff sloop:      E=MAIN  Q=STAYS'L/port  T=STAYS'L/stbd  1=JIB/port  5=JIB/stbd
Topsail cutter:  the same, plus  W=TOPS'L/port brace  R=TOPS'L/stbd brace
modifiers: plain = haul · Shift = ease · hold Space = let fly · Alt = reserved (sail above)
           · Ctrl/Meta = the browser's
helm: Num4 toPort · Num6 toStbd · Num5 centre · Num0 free · NumEnter lash
      · P pause · 0 reset position
```

New assertions: `Space+Digit1` lets fly and issues no haul/ease; one physics step of it casts the sheet off completely; and `Ctrl+`, `Meta+`, `Ctrl+Shift+`, `Ctrl+Space+Digit1` each produce **no** command at all.

Captions, tooltips and the `keyGridHint` were all updated, and the Pause button reads `Pause (P)`.

---

# Item 5 — `SHIPS.topsailSchooner`, proposed (no code written)

Everything below is a **draft for review**. Nothing in it has been added to `index.html`.

## The object

```js
topsailSchooner: {
  id: 'topsailSchooner',
  name: 'Topsail schooner',

  /* All hull numbers are FIRST-PASS SCALINGS of the sloop's, not measurements.
     Each is tagged with the acceptance row that should tune it (§13 C: "same
     equations, new numbers ... and need their own acceptance numbers"). */
  hull: {
    name: 'Topsail schooner',
    m: 130000,                     // kg — 130 t, mid of §13 C's 100-150 t     [assumed]
    LWL: 24.0,                     // m                                        [assumed]
    beam: 6.8,                     // m — NEW FIELD, see schema change 1       [assumed]
    Iz: 130000*Math.pow(24.0/4,2), // = 4.68e6, the sloop's own LWL/4 formula
    Ix: 130000*2.7*2.7,            // = 9.48e5, roll radius ~0.4*beam
    GM: 1.2,                       // m — GM/beam falls from the sloop's 0.4 to 0.18  [assumed]
    cU: 1200,                      // surge drag ~ wetted area ~ L^2; tuned by (q)    [assumed]
    kWave: 0.5,                    // unchanged — dimensionless
    cV: 75000,                     // sway/keel drag, same L^2 scaling                [assumed]
    xCLR: 1.0,                     // m +fwd — the sloop's 0.3 is 0.043*LWL; tuned by (q)/(s)  [assumed]
    kHeelYaw: 55000,               // N*m per (m/s)^2, moment ~ L^3; tuned by (q)     [assumed]
    Nr: 550000,                    // yaw damping ~ L^4; tuned by (s)                 [assumed]
    Nrr: 2.5e6,                    // ~ L^5                                           [assumed]
    cPhi: 800000,                  // 32% of critical at the schooner's own roll period,
                                   // the same fraction cPhi=8000 is on the sloop     [assumed]
    xR: -13.0,                     // m — the sloop's -0.543*LWL                      [assumed]
    AR: 7.0,                       // m^2 — 0.012*L^2, deliberately SMALLER relatively
                                   // than the sloop's 0.018*L^2 (§13 C)              [assumed]
    CnSlope: 2.7,                  // unchanged — same foil aspect ratio
    Awind: 90,                     // m^2 ~ L^2                                       [assumed]
    zWind: 5.0,                    // m ~ L                                           [assumed]
  },

  /* Per-ship handling rates — schema change 5. Absent on the sloop and cutter,
     which therefore keep the global config values and stay byte-identical. */
  handling: {
    haulRateMax: 0.08,   // 12 s to bring a sheet home, against the sloop's 4  [assumed]
    easeRate:    0.25,
    halyardRate: 0.02,   // ~50 s to hoist a 140 m2 gaff sail                  [assumed]
    tillerRate:  12,     // a wheel with several turns lock to lock            [assumed]
    kBoom:       5,      // a 140 m2 boom weathercocks slowly                  [assumed]
    loadRef:     20000,  // N — the reference load for the haul throttle and
                         // the rope colours, set for this rig's sails         [assumed]
  },

  masts: [
    { id:'fore', x:  7.0, height: 22 },   // topmast, carries the square topsail
    { id:'main', x: -3.5, height: 24 },
  ],

  /* Stays as geometry — schema change 2. `tack` is where the stay is made fast
     (m, same frame as xCE: +fwd of the CLR, z above the waterline); `head` is
     the mast it lands on and the height it lands at. */
  stays: [
    { id:'jibStay',    tack:{ x: 14.0, z: 2.6 }, head:{ mast:'fore', z: 20 } },
    { id:'foreStay',   tack:{ x: 10.5, z: 2.2 }, head:{ mast:'fore', z: 16 } },
    { id:'mainTopStay',tack:{ x:  4.5, z: 3.0 }, head:{ mast:'main', z: 21 } },
  ],

  /* Deck plan — schema change 1. `cleats` are absolute metres in the hull frame
     (x +stbd, y +fwd), so a schooner's two mast rows and its wide waist are
     described rather than derived from LWL fractions. A ship that gives none
     falls back to SIM.render.CLEAT_LAYOUT exactly as now. */
  deck: {
    cleats: {
      eJp:{ x:-2.4, y: 8.5 },  eJs:{ x: 2.4, y: 8.5 },   // jib sheets, forward rail
      eFSp:{ x:-2.8, y: 5.5 }, eFSs:{ x: 2.8, y: 5.5 },  // fore staysail sheets
      eF:{ x: 0.0,  y: -0.5 },                           // foresail sheet, led aft to the horse
      bFTp:{ x:-3.2, y: 7.0 }, bFTs:{ x: 3.2, y: 7.0 },  // fore braces, abreast the foremast
      eMTp:{ x:-3.0, y: 0.5 }, eMTs:{ x: 3.0, y: 0.5 },  // main-topmast staysail sheets
      eM:{ x: 0.0,  y: -9.0 },                           // mainsheet, on the quarter
      eMGT:{ x: 1.6, y: -7.0 },                          // main gaff topsail sheet
    },
  },

  sails: [
    { id:'jib', name:'Jib', short:'JIB', type:'headsail', mast:'fore', stay:'jibStay',
      A:55, xCE:12.0, zCE:9.0, deltaLim:90, i0:8, hoist:'single',
      lines: [
        { id:'eJp', kind:'sheetPair', side:'port', key:'Digit1', station:'bowsprit', column:'outer' },
        { id:'eJs', kind:'sheetPair', side:'stbd', key:'Digit5', station:'bowsprit', column:'outer' },
      ] },

    { id:'foreStaysail', name:'Fore staysail', short:"F.STAY'L", type:'headsail',
      mast:'fore', stay:'foreStay',
      A:40, xCE:9.0, zCE:7.5, deltaLim:90, i0:8, hoist:'single',
      lines: [
        { id:'eFSp', kind:'sheetPair', side:'port', key:'KeyQ', station:'fore', column:'stay' },
        { id:'eFSs', kind:'sheetPair', side:'stbd', key:'KeyT', station:'fore', column:'stay' },
      ] },

    /* The fore boom is stopped by the main shrouds long before a mainsail's is,
       which is what the smaller deltaLim says. boomLen is explicit here --
       schema change 3 -- because the sloop's formula would put this boom
       almost onto the mainmast. */
    { id:'foresail', name:'Foresail', short:'FORE', type:'gaff', mast:'fore',
      A:100, xCE:4.5, zCE:10.5, deltaLim:65, boomLen:8.0, i0:3, hoist:'throat+peak',
      lines: [ { id:'eF', kind:'sheet', side:'centre', key:'KeyE', station:'fore', column:'centre' } ] },

    { id:'foreTopsail', name:'Fore topsail', short:"F.TOPS'L", type:'square', mast:'fore',
      A:70, xCE:7.0, zCE:17.5, zLo:14.0, zHi:21.0,
      braceLim:55, i0:5, clScale:0.8, hoist:'setfurl',
      lines: [
        { id:'bFTp', kind:'bracePair', side:'port', key:'KeyW', station:'fore', column:'brace' },
        { id:'bFTs', kind:'bracePair', side:'stbd', key:'KeyR', station:'fore', column:'brace' },
      ] },

    { id:'mainTopmastStaysail', name:'Main-topmast staysail', short:"M.STAY'L",
      type:'headsail', mast:'main', stay:'mainTopStay',
      A:35, xCE:1.5, zCE:12.0, deltaLim:85, i0:8, hoist:'single',
      lines: [
        { id:'eMTp', kind:'sheetPair', side:'port', key:'KeyA', station:'main', column:'stay' },
        { id:'eMTs', kind:'sheetPair', side:'stbd', key:'KeyG', station:'main', column:'stay' },
      ] },

    { id:'mainsail', name:'Mainsail', short:'MAIN', type:'gaff', mast:'main',
      A:140, xCE:-7.0, zCE:11.5, deltaLim:80, boomLen:12.5, i0:3, hoist:'throat+peak',
      lines: [ { id:'eM', kind:'sheet', side:'centre', key:'KeyD', station:'main', column:'centre' } ] },

    /* NEW TYPE, and the one genuinely new mechanism in this rig: a triangular
       sail whose foot IS the mainsail's gaff. `above` (schema change 4) names
       the parent, which gives it both its geometry and -- the part the model
       cannot do today -- its area, since a gaff topsail goes slack the moment
       the mainsail's peak is dropped. Its line takes the parent's grid position
       and is reached through the layer modifier, so no new key is spent. */
    { id:'mainGaffTopsail', name:'Main gaff topsail', short:'M.GAFF T', type:'gaff-topsail',
      mast:'main', above:'mainsail',
      A:30, xCE:-5.5, zCE:18.5, deltaLim:60, i0:6, hoist:'single',
      lines: [ { id:'eMGT', kind:'sheet', side:'centre', key:'KeyD',
                 station:'main', column:'centre', layer:'above' } ] },
  ],
},
```

Sail area 470 m², or 18.4 m² per tonne^⅔ — a fast working schooner, not an extreme one.

## The schema changes it needs

### 1. Per-mast cleat positions

**Today.** `SIM.render.CLEAT_LAYOUT` is one global table keyed `station + '/' + column`, giving `y` as either a fraction of LWL or the literal `'mast'`, and `beam` as a fraction of LWL.

**What breaks.** `'fore/centre'` and `'main/centre'` both give `y: 0.41·LWL`, so the foresail's sheet would be cleated at the same station as the mainsheet — 11 m aft of its own boom. And `beam` as a fraction of *length* is only right for a boat with the sloop's proportions; a schooner's waist is relatively narrower, so every cleat drifts outboard of the hull it is drawn on.

**Proposal.** `deck.cleats` on the ship definition: absolute metres in the same frame `xCE` already uses (`x` +starboard, `y` +forward), keyed by line id. `SIM.render.deckCleats` reads it when present and falls back to `CLEAT_LAYOUT` when absent — so the sloop and the cutter are untouched, pixel for pixel. Add `beam` to `hull` so the schematic can draw a hull of the right proportion instead of scaling breadth off length.

**Check.** Every declared cleat lies inside the hull outline; no two cleats within 0.4 m; the foresail's sheet cleat lies between the two masts. And with `deck` absent, the sloop's cleat positions are bit-identical to round 16's.

### 2. Stays as geometry, with the tack from the stay

**Today.** A headsail's drawn tack is `-(def.xCE/hull.LWL)*L*0.9` — reverse-engineered from the centre of effort. Worth knowing: the sloop's headsails already carry `stay:'fore'` and `stay:'head'`, and **nothing reads either field.** It is a dead placeholder.

**What breaks.** A schooner has three stays that matter and one of them (`mainTopStay`) runs *between* the masts, ending on deck abaft the foremast. No function of `xCE` places that.

**Proposal.** `stays: [ { id, tack:{x,z}, head:{mast,z} } ]` on the ship; a headsail says `stay:'<id>'` and the renderer takes its tack point, its head point (which then leans with heel at the *stay's* head height, not the masthead's) and its luff length — which is what the hoist scales along.

**Keep `xCE`/`zCE` as the physics numbers.** They are tunable and the harness depends on them; deriving them from stay geometry would move the sloop's md5, and this is not a physics round. The stay drives geometry only. To stop the two drifting apart silently, add a check that each sail's declared `xCE` falls inside the triangle it is drawn as.

**Stays are optional.** A ship that declares none keeps the current `xCE` fudge, so the sloop's render-checks hold unchanged. Giving the sloop real stays is a small presentation round of its own, with its own pixel updates.

**Check.** Each headsail's drawn tack sits at its stay's tack within 1 cm; each head sits on the named mast at the named height; with `stays` absent the sloop's headsail geometry is unchanged.

### 3. A second gaff sail hinged at its own mast

**Today, already right.** `SIM.render.SAIL_GEOMETRY.gaff` hinges at `mast.y` and takes its mast from `masts[def.mast]`, so a second gaff sail on a second mast draws in the right place. Round 14 did that work.

**What breaks.**

- `boomLen = 0.55·sqrt(A)·1.718·scale`. The constant 1.718 was solved so the *sloop's* boom reaches 0.6 m past its transom. On this schooner it gives the mainsail an 11.2 m boom from `x = −3.5` — a tip at −14.1 m against a transom at −10.8 m, 3.3 m of overhang. The foresail's would come out at 9.5 m, tip at −2.0 m, which clears the mainmast at −3.5 by 1.5 m. That happens to work, and it works by accident.
  → **`boomLen: <m>` becomes an optional per-sail field**, the current formula staying the default.
- The burgee and `drawBoatBody` hang off `masts[0]`, the *foremost* mast. A schooner flies her burgee at the main truck, which is the aftmost. → `masts` gains an optional `burgee: true`, defaulting to the last mast when no mast claims it.
- `deltaLim` already exists and is where "the fore boom is stopped by the main shrouds" lives — 65° against the mainsail's 80°. No schema change, but it is the field that has to be set, not forgotten.
- **The gaff topsail is a genuinely new type.** Its physics can reuse the headsail handler (one sheet, one `delta`, one hoist), and rule 1 of §13 D′ is satisfied: it adds area high up, which shows in heel and, through `kHeelYaw`, in the weather helm. What it needs that does not exist is below.

**Check.** No boom tip comes within 0.5 m of the next mast aft; the aftmost boom overhangs the transom by 0–1.5 m; the burgee flies at the aftmost masthead.

### 4. `above` relations for the layer key

**Proposal.** `above: '<sailId>'` on the upper sail, and `layer: 'above'` on its line. The line keeps the *same* `(station, column, side)` as the parent's line, so `SIM.gridKey` returns the same code and the modifier disambiguates: `SIM.buildControlsFromInput` routes the key to the `layer:'above'` line when the layer modifier is held and to the base line when it is not. That is one added branch in a function that already has three.

**A finding, and it is awkward.** The first ship that needs the layer needs it on `KeyD` — and round 16 item 7 has just established that `Alt+D` opens Chrome's address bar on Windows, and that Firefox drops its menu bar on `Alt` release. `Alt` cannot be the layer key for this ship.

Two ways out:

1. **hold `Tab` + key** — item 7's own candidate. Focus move is preventable, `Tab` has no letter chords. Cheap, and consistent with `Space` now being a held modifier rather than a chord.
2. **skip the modifier entirely and go to §13 D′ selection** — click or cycle a sail, then the grid keys act on that sail alone. This is where the brig has to end up regardless, and D′ says selection *replaces* the `Alt` layer.

**Recommendation: declare `above` as data now** — it is a fact about the rig, not about the keyboard — bind it to hold-`Tab` in round 17, and let selection take over when the brig lands. The definition does not change either way, which is the point of putting the relation in the data.

**Check.** `Alt`, and any binding, is refused by the key check if the combination appears on the browser-reserved list — i.e. make the reserved list a table CHECK 13 asserts against, rather than a comment. That is the durable form of item 7's rule.

### 5. Per-ship handling rates

**Today.** `haulRateMax` 0.25, `easeRate` 0.5, `halyardRate` 0.1, `tillerRate` 40, `kBoom` 12 and `loadRef` 1500 are global config.

**What breaks.** Every one of them is wrong on a 130 t schooner. The mainsheet is a multi-part tackle on 140 m²; the boom weathercocks slowly; the helm is a wheel with several turns lock to lock; and `loadRef` — which throttles the haul rate *and* sets the rope colours — is calibrated for a 28 m² sail, so every rope on the schooner would draw permanently red.

**Proposal.** `handling: { … }` in the ship definition, with `SIM.handling(config, name)` returning the ship's value or falling back to `config[name]`, exactly as `SIM.hull(config)` already does for hull numbers. The sloop and cutter declare none.

**Check.** With `handling` absent the sloop's harness md5 does not move. With the schooner's numbers, a sheet takes the stated seconds to come home from full ease and the rope colours span all three bands over a normal working range.

## Line classification, general or trim (§13 D′)

The brief says this is part of the review before the round is written, so here it is in full.

| Line | Tier | Note |
|---|---|---|
| jib sheets `1`/`5` | **general** | one order moves both clews |
| fore staysail sheets `Q`/`T` | **general** | |
| foresail sheet `E` | **general** | |
| fore braces `W`/`R` | **general** | grouped by default; one yard here, so grouping is trivial on this ship and is first exercised for real on the brig |
| main-topmast staysail sheets `A`/`G` | **general** | |
| mainsheet `D` | **general** | |
| main gaff topsail sheet (layer on `D`) | **general** | it is a sail, not a shape adjustment |
| halyards and set/furl, per sail | **general**, Rig panel | as now — touched twice a day |
| helm | **general**, numpad | as now |
| per-yard brace offset | **not admitted** | one yard on this ship, and rule 1 fails anyway until §4 has a wind gradient with height — without one the offset changes nothing measurable |
| boom vangs, tack downhauls, bowlines, lifts | **not admitted** | no physics behind any of them yet (rule 1) |
| reef, per sail | **deferred, would be general** | genuinely physical — area *and* `zCE` both drop — but it needs a reef model first, which is a physics decision, not a schema one |

`KeyS`/`KeyF` (main braces) and `Digit2`/`Digit4` (flying jib) map to nothing on this rig and stay dead, which is what §14 says should happen.

## Acceptance set, proposed (§13 F)

The sloop's twelve and the cutter's four stay with their own ships. Six for the schooner:

| # | Setup | Expected |
|---|---|---|
| q | Close-hauled, all fore-and-aft canvas, topsail furled, TWS 6, 180 s | settles at TWA 50–58°, SOG 5–7 kn, heel 8–14° |
| r | The same with the topsail set and braced sharp | pointing worsens by 3–8° and SOG is no better — the square sail's price on the wind, at schooner scale |
| s | Tack from TWA 50 starboard to TWA 50 port, topsail furled | through in under 6 boat-lengths; exit SOG at least 55% of entry; a schooner should be *able* to miss stays from slow, so report the threshold as (e) does |
| t | Wear from TWA 130 to TWA 130, topsail set | yard through square and re-braced; under 90 s; no NaN, nothing stuck |
| u | Heave-to: fore-topsail backed, mainsheet hard in, helm lashed a-lee | settles; drift under 1.5 kn; no oscillation — the manoeuvre §13 F names, and the one (p) is no longer testing |
| v | Running TWA 170 under square topsail and both gaff sails | the mainsail measurably blankets the foresail |

Row **v** is the interesting one: the schooner is the **first rig on which §15's blanketing does anything at all**. It is inert on both shipped rigs because only square sails carry height bands. Making v work means giving the gaff sails `zLo`/`zHi` — which is a physics decision the spec has deliberately postponed (§15's round-15 note: "the main shading the headsails is real and will be its own accounted round"). Worth deciding before round 17, because it changes whether v is in the set.

## What the definition still cannot express

1. **A sail whose force depends on another sail's state.** The gaff topsail goes slack when the mainsail's peak is dropped. Nothing in `SIM.SAIL_TYPES` can read a sibling's state — `effArea(sailState, def, phi)` sees only its own. This is the first such dependency in the model, and it needs one more argument on the type handlers, not a new concept.
2. **Reefing** — area and `zCE` both change with the reef, and no hoist kind expresses it.
3. **Wind gradient with height (§4).** Without it `zCE` affects heel but not drive, so a topsail high up is worth no more per square metre than a course, and per-yard trim offsets fail rule 1.
4. **Grouped lines** — one key moving several lines. Trivial on this rig (one yard), essential on the brig.
5. **Sail selection (§13 D′)** — the eventual replacement for the layer modifier.
6. **Stay sag, bowlines, lifts** — all listed in D′ as borderline or deferred, and none has physics yet.
7. **Blanketing between fore-and-aft sails** — needs bands on gaff sails, as above.

## Suggested order for round 17

Schema before ship, and md5 after each step:

1. `handling` + `SIM.handling()` — smallest, and the fallback pattern the rest copy.
2. `deck.cleats` + `hull.beam`, with the `CLEAT_LAYOUT` fallback.
3. `boomLen` per sail, `masts[].burgee`, plus the boom-clearance check.
4. `stays` + tack-from-stay geometry, sloop opted out.
5. The `gaff-topsail` type and the sibling-state argument on the type handlers — the only physics in the round.
6. `above` + `layer`, bound to hold-`Tab`; make the browser-reserved chord list a table CHECK 13 asserts against.
7. `SHIPS.topsailSchooner` and its acceptance set q–v; tune the `[assumed]` hull numbers against q and s.

Steps 1–4 and 6 should leave both shipped ships byte-identical. Step 5 does not touch them either (no existing sail is a `gaff-topsail` and no existing type reads a sibling). Only step 7 adds numbers, and they are all new.
