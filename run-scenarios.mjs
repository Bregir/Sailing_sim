// Headless verification harness for index.html — kept tool, not scratch.
//
// Loads the single <script> block from index.html into a Node `vm` context
// (with defense-in-depth DOM stubs; the script itself is written so no bare
// top-level statement touches the DOM, so these stubs are a safety net, not
// a requirement) and calls straight into the same SIM.* functions the page
// uses, so a headless run and the in-page behaviour can never diverge.
//
// Usage:
//   node run-scenarios.mjs                     — use index.html's built-in defaults
//   node run-scenarios.mjs --ship topsailCutter — load another SHIPS definition;
//                                                 its own scenario set runs, and
//                                                 the square-sail checks print
//   node run-scenarios.mjs --config file.json  — merge an exported tuning-panel
//                                                 JSON (SIM.config shape) over
//                                                 the built-in defaults first
//   node run-scenarios.mjs --sanity-only       — run only the three §5/§6 sanity checks

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv){
  const out = { config: null, sanityOnly: false, ship: null };
  for (let i=0;i<argv.length;i++){
    if (argv[i]==='--config') out.config = argv[++i];
    else if (argv[i]==='--ship') out.ship = argv[++i];
    else if (argv[i]==='--sanity-only') out.sanityOnly = true;
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

function loadSim(){
  const htmlPath = path.join(__dirname, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Could not find <script> block in index.html');
  const scriptSource = m[1];

  const noop = () => {};
  // initBrowser() actually runs under this stub (typeof window !== 'undefined'
  // is true in the vm context), so this needs to be a fairly complete fake DOM,
  // not just enough to avoid a ReferenceError.
  const fakeEl = () => ({
    value:'', checked:false, style:{}, textContent:'', innerHTML:'',
    width:800, height:600, clientWidth:800, clientHeight:600,
    dataset: {},
    addEventListener: noop, appendChild: noop, getContext: () => null,
    getBoundingClientRect: () => ({left:0,top:0,width:0,height:0}),
    classList: { add:noop, remove:noop, toggle:noop },
    querySelectorAll: () => [],
  });
  const sandbox = {
    console,
    window: { addEventListener: noop, innerWidth:800, innerHeight:600 },
    document: {
      getElementById: () => fakeEl(),
      createElement: () => fakeEl(),
      addEventListener: noop,
      body: fakeEl(),
    },
    requestAnimationFrame: noop,
    cancelAnimationFrame: noop,
    performance: { now: () => 0 },
    alert: noop,
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox, { filename: 'index.html-inline-script' });
  if (!sandbox.SIM) throw new Error('SIM was not exposed on globalThis by index.html');
  return sandbox.SIM;
}

function buildConfig(SIM){
  const cfg = SIM.defaultConfig();
  // --ship first, so an explicit --config can still override anything in it
  if (args.ship) {
    if (!SIM.SHIPS[args.ship]) {
      throw new Error(`unknown ship '${args.ship}' — have: ${Object.keys(SIM.SHIPS).join(', ')}`);
    }
    cfg.ship = SIM.cloneShip(SIM.SHIPS[args.ship]);
    console.log(`[ship] ${cfg.ship.name} (${cfg.ship.id})`);
  }
  if (args.config) {
    const overrideRaw = fs.readFileSync(path.resolve(args.config), 'utf8');
    const override = JSON.parse(overrideRaw);
    SIM.deepMerge(cfg, override);
    console.log(`[config] merged overrides from ${args.config}`);
  }
  return cfg;
}

function fmt(n, d=3){ return Number(n).toFixed(d); }

function runSanityChecks(SIM, config){
  console.log('\n=== SANITY CHECK 1 — §5 sail forces ===');
  const phi0 = 0;
  // round 14: the sail comes from the ship definition by id, not from a
  // config.sails.<name> property that no longer exists. Round 17: by ROLE, not
  // by id -- the §5 force check is about a gaff sail, and a schooner's are
  // called `foresail` and `mainsail`. The sloop's and cutter's first gaff sail
  // is still `main`, so their printed numbers do not move.
  const mainDef = SIM.sailDefs(config).find(d=>d.type==='gaff') || SIM.sailDefs(config)[0];

  // Case A: AWA +45, delta -20, AWS 6, main fully set, heel 0 -> Fx>0, Fy<0
  {
    const wind = { AWA:45, AWS:6, appFlowU: 6*(-Math.cos(deg2rad(45))), appFlowV: 6*(-Math.sin(deg2rad(45))) };
    const sailState = { hT:1, hP:1, delta:-20 };
    const r = SIM.computeSailForces(sailState, wind, config, phi0, mainDef);
    const pass = r.Fx>0 && r.Fy<0;
    console.log(`  A: AWA=45 delta=-20 AWS=6 -> Fx=${fmt(r.Fx)} Fy=${fmt(r.Fy)}  expect Fx>0,Fy<0  ${pass?'PASS':'FAIL'}`);
  }
  // Case B: AWA -45, delta -2 -> Fy>0, |Fx| < 0.3*|Fy|
  {
    const wind = { AWA:-45, AWS:6, appFlowU: 6*(-Math.cos(deg2rad(-45))), appFlowV: 6*(-Math.sin(deg2rad(-45))) };
    const sailState = { hT:1, hP:1, delta:-2 };
    const r = SIM.computeSailForces(sailState, wind, config, phi0, mainDef);
    const pass = r.Fy>0 && Math.abs(r.Fx) < 0.3*Math.abs(r.Fy);
    console.log(`  B: AWA=-45 delta=-2 AWS=6 -> Fx=${fmt(r.Fx)} Fy=${fmt(r.Fy)}  expect Fy>0,|Fx|<0.3|Fy|  ${pass?'PASS':'FAIL'}`);
  }

  console.log('\n=== SANITY CHECK 2 — §6 rudder ===');
  {
    // Band updated for round 9's CnSlope=2.7 (was the 2D value 2*pi*0.7=4.398
    // in rounds 1-8): Cn at 20deg scales by 2.7/4.398 = 0.614, so the round-4
    // figure of ~9.9 kN*m becomes ~6.1 kN*m. Sec 6 of the brief still says
    // "roughly 9-10 kN*m" next to the CnSlope=2.7 default -- that line was not
    // updated when CnSlope was introduced; this band follows the code, not
    // the stale prose (see the report).
    const state = { u:2, v:0, r:0, rudder:{deltaR:20} };
    const f = SIM.computeRudderForces(state, config);
    const pass = f.Mz > 0 && f.Mz >= 5500 && f.Mz <= 6500;
    console.log(`  ahead u=2 deltaR=+20 -> Mz=${fmt(f.Mz/1000,2)} kN*m  expect >0 and ~5.5-6.5 kN*m (CnSlope=2.7)  ${pass?'PASS':'FAIL'}`);
  }
  {
    const state = { u:-1, v:0, r:0, rudder:{deltaR:20} };
    const f = SIM.computeRudderForces(state, config);
    const pass = f.Mz < 0;
    console.log(`  sternway u=-1 deltaR=+20 -> Mz=${fmt(f.Mz,1)}  expect Mz<0 (bow to negative)  ${pass?'PASS':'FAIL'}`);
  }

  console.log('\n=== SANITY CHECK 3 — §6 steady turn rate ===');
  {
    const rDegPerSec = runTurnRateCheck(SIM, config);
    const pass = rDegPerSec >= 7 && rDegPerSec <= 11;
    console.log(`  ahead u=2 (held) deltaR=+20, sails down -> r=${fmt(rDegPerSec,2)} deg/s  expect 7-11 deg/s  ${pass?'PASS':'FAIL'}`);
  }
}
function deg2rad(d){ return d*Math.PI/180; }
function rad2deg(r){ return r*180/Math.PI; }

// §15 square-sail checks. Printed only when the loaded ship actually carries a
// square sail, so the sloop's output is exactly what it was.
function runSquareChecks(SIM, config){
  const sq = config.ship.sails.find(s=>s.type==='square');
  if (!sq) return;
  console.log(`\n=== SANITY CHECK 4 — §15 square sail forces (${sq.name}, A=${sq.A} m², i0=${sq.i0}, clScale=${sq.clScale}) ===`);
  function forceAt(psiY, AWA, AWS){
    const wind = { AWA, AWS, appFlowU: AWS*(-Math.cos(deg2rad(AWA))), appFlowV: AWS*(-Math.sin(deg2rad(AWA))) };
    return SIM.computeSailForces({ h:1, psiY, camberSide:0 }, wind, config, 0, sq);
  }
  {
    // yard braced sharp up on starboard tack, wind 60 deg off the starboard bow
    const r = forceAt(55, 60, 6);
    const pass = Math.abs(r.i-25) < 1e-9 && r.Fx > 0 && r.Fy < 0;
    console.log(`  psiY=+55 AWA=+60 AWS=6 -> i=${fmt(r.i,1)} alpha=${fmt(r.alpha,1)} Fx=${fmt(r.Fx,1)} Fy=${fmt(r.Fy,1)}`);
    console.log(`    expect i=25, Fx>0 (drive forward), Fy<0 (side force to port)  ${pass?'PASS':'FAIL'}`);
  }
  {
    // the same wind with the yard braced the wrong way: a flat plate, aback.
    // Round 16 item 1 reads the incidence off the arm the WIND is on, so i is
    // -85 deg where round 15 printed +95 -- the same plate at the same angle
    // to the flow, measured from the other yardarm. alpha still saturates at
    // 90, so the force is unchanged: pure drag, hard aback.
    const r = forceAt(-55, 60, 6);
    const pass = r.alpha === 90 && r.Cl === 0 && r.aback && r.Fx < 0;
    console.log(`  psiY=-55 AWA=+60 AWS=6 -> i=${fmt(r.i,1)} alpha=${fmt(r.alpha,1)} Cl=${fmt(r.Cl,3)} Cd=${fmt(r.Cd,3)} Fx=${fmt(r.Fx,1)} aback=${r.aback}`);
    console.log(`    expect |i| ~85-95 (either arm), alpha saturated at 90, pure drag (Cl=0), aback, Fx<0  ${pass?'PASS':'FAIL'}`);
  }

  /* Round 16 item 1, the printed check the brief asks for. A yard is a
     symmetric plate: whichever arm the wind is on is the leading one, so the
     incidence must have the same MAGNITUDE for AWA +60 and -60 on a square
     yard, and must not jump as the yard passes through square. */
  console.log('\n=== PRINTED CHECK — §15 wind-relative yardarm (round 16 item 1) ===');
  {
    const iAt = (psiY, AWA) => SIM.yardIncidence(AWA, psiY).i;
    const a = iAt(0, 60), b = iAt(0, -60);
    const symOk = Math.abs(Math.abs(a) - Math.abs(b)) < 1e-9 && Math.abs(Math.abs(a) - 30) < 1e-9;
    console.log(`  psiY=0: AWA=+60 -> i=${fmt(a,1)} deg · AWA=-60 -> i=${fmt(b,1)} deg` +
                `  expect equal magnitude, 30 deg (stalled plate, aback on both)  ${symOk?'PASS':'FAIL'}`);
    const m5 = iAt(-5, 60), z = iAt(0, 60), p5 = iAt(5, 60);
    // one degree of yard is one degree of incidence, so 5 deg either side of
    // square must sit exactly 5 deg either side of the value at square
    const contOk = Math.abs((z - m5) - 5) < 1e-9 && Math.abs((p5 - z) - 5) < 1e-9;
    console.log(`  AWA=+60: psiY=-5 -> i=${fmt(m5,1)} · psiY=0 -> i=${fmt(z,1)} · psiY=+5 -> i=${fmt(p5,1)}` +
                `  expect a smooth 5 deg per 5 deg, no jump through square  ${contOk?'PASS':'FAIL'}`);
  }

  console.log(`\n=== SANITY CHECK 5 — §15 brace interval (braceLim ${sq.braceLim}) ===`);
  const braceCases = [
    [1, 1,  -sq.braceLim, sq.braceLim, 'both eased: the yard is free'],
    [0, 1,   sq.braceLim, sq.braceLim, 'port hauled, starboard eased: pinned braced sharp up'],
    [0.5, 0.5, 0, 0,                   'both at the marks: square'],
  ];
  for (const [eP, eS, lo, hi, what] of braceCases) {
    const iv = SIM.braceInterval(eP, eS, sq.braceLim);
    const pass = Math.abs(iv.lo-lo) < 1e-9 && Math.abs(iv.hi-hi) < 1e-9 && !iv.inverted;
    console.log(`  eP=${eP} eS=${eS} -> [${fmt(iv.lo,1)}, ${fmt(iv.hi,1)}]  expect [${fmt(lo,1)}, ${fmt(hi,1)}]  ${what}  ${pass?'PASS':'FAIL'}`);
  }
  {
    // eP + eS < 1 inverts the interval. Round 16 item 6 makes it unreachable
    // through the actuator instead of collapsing it onto square, so the raw
    // function now reports the inversion rather than hiding it.
    const iv = SIM.braceInterval(0, 0, sq.braceLim);
    const pass = iv.inverted === true;
    console.log(`  eP=0 eS=0 -> [${fmt(iv.lo,1)}, ${fmt(iv.hi,1)}] inverted=${iv.inverted}  expect inverted and NOT collapsed to square  both hauled is unreachable (item 6)  ${pass?'PASS':'FAIL'}`);
  }

  /* Round 16 item 6, the brace-refusal check the brief asks for. A brace
     cannot be hauled while the opposite brace holds the yard: the crew must
     ease the lee brace before hauling the weather one. Run in a dead calm so
     the yard is moved by its braces alone (no weathercocking), which makes the
     "no step larger than the brace rate" bound exact: the interval's bounds
     move at 2*braceLim per unit of ease, so a haul at haulRateMax shifts the
     yard by at most 2*braceLim*haulRateMax*dt per step. */
  console.log('\n=== PRINTED CHECK — §15 braces cannot invert the interval (round 16 item 6) ===');
  {
    const cfg = SIM.cloneConfig(config); cfg.TWS = 0; cfg.liveWind = false;
    const st = SIM.createState({}, cfg);
    const dt = cfg.dt;
    const lineId = side => SIM.lineIdFor(cfg, sq.id, side);
    const eP = () => st.sheets[lineId('port')], eS = () => st.sheets[lineId('stbd')];
    const psiY = () => st.sails[sq.id].psiY;
    const rate = 2*sq.braceLim*Math.max(cfg.haulRateMax, cfg.easeRate)*dt;
    let worstStep = 0, everInverted = false, everBelowOne = false;
    function work(sec, cmds){
      const sheets = {};
      for (const k in cmds) sheets[lineId(k)] = cmds[k];
      for (let n=0;n<Math.round(sec/dt);n++){
        const before = psiY();
        SIM.step(st, { sheets }, dt, cfg);
        worstStep = Math.max(worstStep, Math.abs(psiY() - before));
        if (eP() + eS() < 1 - 1e-9) everBelowOne = true;
        if (SIM.braceIntervalFor(st, sq).inverted) everInverted = true;
      }
    }
    const taut = () => Object.keys(st._braceTaut || {}).length ? 'bar-taut' : '-';
    console.log(`  start (both eased)           eP=${fmt(eP(),3)} eS=${fmt(eS(),3)} psiY=${fmt(psiY(),1)} deg`);
    work(8, { port:-1 });
    const step1 = Math.abs(psiY() - sq.braceLim) < 1e-6;
    console.log(`  haul port home               eP=${fmt(eP(),3)} eS=${fmt(eS(),3)} psiY=${fmt(psiY(),1)} deg  expect +${sq.braceLim}  ${step1?'PASS':'FAIL'}`);
    const eSbefore = eS();
    work(4, { stbd:-1 });
    const step2 = Math.abs(eS() - eSbefore) < 1e-12 && eS() === 1;
    console.log(`  then haul starboard          eP=${fmt(eP(),3)} eS=${fmt(eS(),4)} psiY=${fmt(psiY(),1)} deg  ${taut()}  expect eS stuck at 1.0000, no movement  ${step2?'PASS':'FAIL'}`);
    work(1, { port:1 });
    console.log(`  ease port to the half mark   eP=${fmt(eP(),3)} eS=${fmt(eS(),3)} psiY=${fmt(psiY(),1)} deg`);
    work(6, { stbd:-1 });
    const step3 = Math.abs(eS() - 0.5) < 1e-9 && Math.abs(psiY()) < 1e-6;
    console.log(`  now haul starboard           eP=${fmt(eP(),3)} eS=${fmt(eS(),3)} psiY=${fmt(psiY(),1)} deg  expect eS 0.500 and the yard square  ${step3?'PASS':'FAIL'}`);
    const stepOk = worstStep <= rate + 1e-9;
    console.log(`  largest yard step in all of it: ${fmt(worstStep,4)} deg  expect <= the brace rate ${fmt(rate,4)} deg/step  ${stepOk?'PASS':'FAIL'}`);
    console.log(`  eP+eS never below 1: ${!everBelowOne} · interval never inverted: ${!everInverted}  ${(!everBelowOne && !everInverted)?'PASS':'FAIL'}`);
  }

  console.log('\n=== SANITY CHECK 6 — §15 blanketing on this rig ===');
  {
    const banded = config.ship.sails.filter(s=>SIM.sailBand(s));
    const st = SIM.createState({ psi: deg2rad(-45), u: 2 }, config);
    const wind = SIM.computeWind(st, config, 0);
    const f = SIM.blanketFactors(st, wind, config);
    const shaded = Object.keys(f);
    console.log(`  sails declaring a height band: ${banded.length ? banded.map(s=>`${s.id}[${s.zLo}-${s.zHi} m]`).join(', ') : 'none'}`);
    console.log(`  blanket factors close-hauled: ${shaded.length ? shaded.map(k=>`${k}=${fmt(f[k],3)}`).join(', ') : 'none — no sail shades another on this rig'}`);
  }

  /* Round 16 item 2, the printed check the brief asks for. Zero incidence is
     satisfied by two yard angles 180 deg apart, and dead downwind both of them
     lie outside the braces' reach -- which is where round 15 flipped the yard
     from one limit to the other on the sign of AWA alone. Taking the solution
     nearest the current yard angle instead means the yard stays on the side it
     is already on, and stays there whichever way the wind is called. */
  console.log('\n=== PRINTED CHECK — §15 free yard angle dead downwind (round 16 item 2) ===');
  {
    const cfg = SIM.cloneConfig(config); cfg.TWS = 6; cfg.liveWind = false;
    let allOk = true;
    for (const AWA of [180, -180]) {
      for (const start of [40, -40]) {
        // the yard free (both braces eased) and nothing else moving: run the
        // real actuator so the rate limit and the interval clamp both apply
        const st = SIM.createState({ sails:{ [sq.id]: { psiY: start } } }, cfg);
        const wind = { AWA, AWS: 6, appFlowU: -6*Math.cos(deg2rad(AWA)), appFlowV: -6*Math.sin(deg2rad(AWA)) };
        const type = SIM.SAIL_TYPES.square;
        let psiY = start, worst = 0;
        for (let n=0;n<Math.round(30/cfg.dt);n++){
          const free = type.freeTrim(AWA, sq, 1, psiY);
          const maxStep = cfg.kBoom*wind.AWS*cfg.dt*type.trimRateScale;
          const next = SIM.updateTrim(psiY, free, maxStep, SIM.braceIntervalFor(st, sq));
          worst = Math.max(worst, Math.abs(next - psiY));
          psiY = next;
        }
        const want = start > 0 ? sq.braceLim : -sq.braceLim;
        const ok = Math.abs(psiY - want) < 1e-6 && worst <= cfg.kBoom*6*cfg.dt*0.5 + 1e-9;
        if (!ok) allOk = false;
        console.log(`  AWA=${AWA >= 0 ? '+' : ''}${AWA}, from psiY=${start > 0 ? '+' : ''}${start} -> settles ${fmt(psiY,1)} deg  ` +
                    `expect ${want > 0 ? '+' : ''}${want} (the side it started on), largest step ${fmt(worst,3)} deg  ${ok?'PASS':'FAIL'}`);
      }
    }
    console.log(`    both signs of AWA give the same answer, so a yard no longer slams over when the wind is called +180 instead of -180  ${allOk?'PASS':'FAIL'}`);
  }
}

// §6 sanity check 3: steady turn rate with deltaR=20deg at a HELD u=2 m/s (a
// captive-model style test — forward speed pinned, sway+yaw free to converge),
// sails down (no sail forces), no wind (windage zeroed) so only hull+rudder+
// yaw-damping act. Expect the steady r to settle at 4-8 deg/s.
function runTurnRateCheck(SIM, config){
  const dt = config.dt;
  const hullCfg = SIM.hull(config); // round 14: mass and inertias live in the ship definition
  const heldU = 2;
  const state = { v: 0, r: 0 };
  const wind = { AWS: 0, appFlowU: 0, appFlowV: 0 };
  const steps = Math.round(20/dt);
  for (let n=0;n<steps;n++){
    const hullState = { u: heldU, v: state.v, r: state.r };
    const hull = SIM.computeHullForces(hullState, wind, config);
    const rudder = SIM.computeRudderForces({ u: heldU, v: state.v, r: state.r, rudder:{deltaR:20} }, config);
    const Mz = rudder.Mz + hull.Mz - SIM.computeYawDamping(heldU, state.r, config);
    const Fy = hull.Fy + rudder.Fy;
    const vdot = Fy/hullCfg.m - state.r*heldU;
    const rdot = Mz/hullCfg.Iz;
    state.v += vdot*dt;
    state.r += rdot*dt;
  }
  return rad2deg(state.r);
}

// Round 13 item 1: run (a) 90 s to steady state (same setup as (a) itself),
// scale u/v to 2 kn (the same rescale-in-place idiom buildTackBase/(e) use to
// hit a requested start speed from an (a)-shaped state), ease all five sheets
// fully and run long enough (8 s) for that easing transient to actually
// settle -- otherwise "fully eased" would secretly mean "mid-ring", which is
// not what the spec's plain English asks for -- then haul straight to (a)'s
// trim via a direct state.sheets assignment, the same idiom scenarios (g) and
// (k) already use for a scripted mid-run trim change (not the rate-limited
// haul actuator, which models a winch, not a roll-dynamics step input).
// Peak vs. settled uses (a)'s own convention: peak over a 90 s run, settled =
// mean of the last 20 s.
//
// Measured honestly, this comes out at 0% overshoot (peak occurs at the very
// end of the 90 s window, i.e. heel climbs monotonically). That is a genuine
// model finding, not a check that was measured wrong: the roll ring itself is
// real and fast (period ~2 s, visibly overshooting and undershooting by
// 40%+ peak-to-trough when isolated from the surge dynamics -- see the
// report) but it fully decays within ~5-8 s of the sheets going home, while
// the boat needs on the order of a minute to reaccelerate from the slow speed
// the eased run leaves it at back up to (a)'s ~4 kn cruise. Against a settled
// baseline that is itself still climbing on that slow timescale, the fast
// ring never produces a peak that clears the eventual settled value by 15-40%
// -- it is swamped by, not additive to, the speed-recovery transient.
function runHeelOvershootCheck(SIM, config){
  const cfg = SIM.cloneConfig(config); cfg.TWS = 6; cfg.TWD = 0; cfg.liveWind = false;
  const tackSign = 1, targetTWA = 45;
  const headingDeg = cfg.TWD - tackSign*targetTWA; // same formula setupSteady uses for (a)
  // round 15: build the state from the LOADED ship and trim it by role, so
  // this check runs on any rig instead of assuming the sloop's rope names
  const state = SIM.createState({ psi: deg2rad(headingDeg), u: 1.5 }, cfg);
  SIM.applyTrim(state, cfg, tackSign, { centre:0.15, working:0.20, lazy:1 });
  const controls = { autopilot: { enabled:true, targetTWA, tackSign, Kp: cfg.apKp } };
  const dt = cfg.dt;

  for (let n=0;n<Math.round(90/dt);n++) SIM.step(state, controls, dt, cfg); // settle to (a)

  const targetSpeed = 2*0.5144; // 2 kn, per the item-1 instruction
  const sog = Math.hypot(state.u, state.v);
  const scale = sog>1e-6 ? targetSpeed/sog : 0;
  state.u *= scale; state.v *= scale; // same rescale idiom as buildTackBase/(e)

  SIM.applyTrimAll(state, cfg, 1);
  for (let n=0;n<Math.round(8/dt);n++) SIM.step(state, controls, dt, cfg); // let "fully eased" actually settle

  SIM.applyTrim(state, cfg, tackSign, { centre:0.15, working:0.20, lazy:1 }); // haul to (a)'s trim

  const steps = Math.round(90/dt); // matches (a)'s own 90 s run-to-steady-state
  const heelDegSeries = [];
  for (let n=0;n<steps;n++){
    SIM.step(state, controls, dt, cfg);
    heelDegSeries.push(Math.abs(rad2deg(state.phi)));
  }
  const peakHeel = Math.max(...heelDegSeries);
  const tailN = Math.round(20/dt); // same 20 s steady window (a)'s own measure() uses
  const tail = heelDegSeries.slice(-tailN);
  const settledHeel = tail.reduce((a,b)=>a+b,0)/tail.length;
  const overshootPct = settledHeel>0 ? 100*(peakHeel/settledHeel - 1) : NaN;
  return { peakHeel, settledHeel, overshootPct };
}

function runScenarios(SIM, config){
  if (!SIM.scenarios || !SIM.runAllScenarios) {
    console.log('\n[scenarios] SIM.scenarios / runAllScenarios not implemented yet — skipping.');
    return;
  }
  // the loaded ship's own set (§13 F): the sloop's still reads "a-l", the
  // cutter's reads "m-p"
  const set = SIM.scenariosFor(config);
  const span = set.length ? `${set[0].id[0]}-${set[set.length-1].id[0]}` : 'none';
  console.log(`\n=== SCENARIOS ${span} ===`);
  const results = SIM.runAllScenarios(config);
  let anyFail = false;
  for (const res of results) {
    console.log(`\n-- (${res.id}) ${res.name} --`);
    for (const row of res.rows) {
      const status = row.status.toUpperCase();
      if (row.status==='fail') anyFail = true;
      console.log(`   ${row.key}: measured=${row.value}  expected=${row.range}  [${status}]`);
    }
  }
  if (anyFail) process.exitCode = 1;
}

const SIM = loadSim();
const config = buildConfig(SIM);
runSanityChecks(SIM, config);
runSquareChecks(SIM, config);

console.log('\n=== PRINTED CHECK — heel overshoot (round 13 item 1) ===');
{
  const r = runHeelOvershootCheck(SIM, config);
  const pass = r.overshootPct >= 15 && r.overshootPct <= 40;
  console.log(`  from 2 kn, sheets snapped from fully eased to (a)'s trim -> peak heel ${fmt(r.peakHeel,2)} deg, settled heel ${fmt(r.settledHeel,2)} deg, peak is ${fmt(r.overshootPct,1)}% above settled  expect 15-40%  ${pass?'PASS':'FAIL'}`);
}

if (!args.sanityOnly) runScenarios(SIM, config);
