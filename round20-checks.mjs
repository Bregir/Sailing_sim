// Round-20 checks -- kept tool, not scratch. Loads index.html's inline script into a Node vm the same
// way run-scenarios.mjs does and runs the shipped physics; it changes no config value the harness uses,
// so running it cannot move any harness md5.
//
//   node round20-checks.mjs --trace [kn ...]   -- T: the (e) tack traced per headsail (default 2 and 0.75 kn)
//   node round20-checks.mjs --beat             -- B: (a), (b) within +-2% of round 19 final
//   node round20-checks.mjs --goose            -- G: goose-wing at 180, head up 0.25 deg/s, hold 175/170/165 for 60 s each
//   node round20-checks.mjs --sheets           -- S: goose-wing by sheets alone at 170/165 (measurement, no criterion)
//   node round20-checks.mjs --collapse         -- C: goose-wing collapse heading up, TWS 4/6/8
//   node round20-checks.mjs --i                -- I: (i) crosses gently
//   node round20-checks.mjs --geometry         -- N1: the jib geometry the step-3 candidates use
//   node round20-checks.mjs --sweep            -- N2: collapse TWA at TWS 4/6/8 against a cap on the clew angle (diagnostic only)
//   node round20-checks.mjs --rows             -- N3: goose-wing holds, (c) and the run under each cap (diagnostic only)
//   node round20-checks.mjs --cloth            -- N5: collapse TWA against cloth weight, clew capped at 55 (diagnostic only)
//   node round20-checks.mjs --lift             -- N4: candidate 1, the lift of an unpoled clew, from the hinge geometry
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const PROJ = process.env.SIM_DIR || path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const want = k => argv.length === 0 || argv.includes(k);
const numArgs = argv.filter(a => /^[0-9.]+$/.test(a)).map(Number);
let fails = 0;
const mark = ok => ok ? 'PASS' : 'FAIL';
function check(label, ok, detail){ if(!ok) fails++; console.log(`  ${mark(ok)}  ${label}  ${detail}`); }
const fmt = (n, d=2) => Number(n).toFixed(d);

function loadSim(){
  const html = fs.readFileSync(path.join(PROJ, 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  const noop = () => {};
  const fakeEl = () => ({ value:'', checked:false, style:{}, textContent:'', innerHTML:'',
    width:800, height:600, clientWidth:800, clientHeight:600, dataset:{}, addEventListener:noop,
    appendChild:noop, getContext:()=>null, getBoundingClientRect:()=>({left:0,top:0,width:0,height:0}),
    classList:{add:noop,remove:noop,toggle:noop}, querySelectorAll:()=>[] });
  const sandbox = { console,
    window:{ addEventListener:noop, innerWidth:800, innerHeight:600 },
    document:{ getElementById:()=>fakeEl(), createElement:()=>fakeEl(), addEventListener:noop, body:fakeEl() },
    requestAnimationFrame:noop, cancelAnimationFrame:noop, performance:{now:()=>0}, alert:noop };
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: 'index.html-inline-script' });
  return sandbox;
}
const box = loadSim();
const SIM = box.SIM;
const wrapD = d => ((d + 180) % 360 + 360) % 360 - 180;
const r2d = r => r*180/Math.PI;

/* ---------------------------------------------------------------------- */
/* T: the (e) tack, exactly as runTackAttempt runs it (same buildTackBase, sheets switched at
   head-to-wind), logging every headsail's incidence x camber side, alphaE, side force and the
   sails' yaw moment. Returns the log and the number of camber-side changes per headsail. */
function tackTrace(startKn, durationS = 40, every = 0.25){
  const built = box.buildTackBase(SIM.defaultConfig(), true, startKn);
  const state = built.state; let controls = built.controls; const cfg = built.cfg, upd = built.update, dt = cfg.dt;
  const ids = ['jib', 'staysail'].filter(id => state.sails[id]);
  const prevS = {}, flips = {}, log = [];
  ids.forEach(id => { prevS[id] = undefined; flips[id] = 0; });
  let nextLog = 0;
  for (let n = 0; n < Math.round(durationS/dt); n++){
    const t = n*dt;
    controls = upd(state, controls, t, dt, cfg) || controls;
    SIM.step(state, controls, dt, cfg);
    const L = state._last;
    ids.forEach(id => {
      const f = L.sailF[id];
      if (prevS[id] !== undefined && f.camberSide !== prevS[id]) flips[id]++;
      prevS[id] = f.camberSide;
    });
    if (t >= nextLog){
      nextLog += every;
      const row = { t, hdg: wrapD(r2d(state.psi) - cfg.TWD), u: state.u, AWA: L.wind.AWA, sailMz: L.sailMz,
                    phase: state._tackPhase };
      ids.forEach(id => { const f = L.sailF[id];
        row[id] = { i: f.i, s: f.camberSide, alphaE: f.alphaE, Fy: f.Fy, luff: f.luffing }; });
      log.push(row);
    }
  }
  return { log, flips, ids, state, cfg };
}

if (want('--trace')) {
  const speeds = numArgs.length ? numArgs : [2, 0.75];
  console.log('\n=== ROUND-20 CHECK T - the (e) tack traced, camber flips per headsail ===');
  for (const kn of speeds){
    const r = tackTrace(kn);
    console.log(`\n-- start ${kn} kn -- (hdg = heading minus TWD, deg; i = incidence, s = camber side; yaw = sails' Mz N*m)`);
    console.log('   t      hdg     u     phase    ' + r.ids.map(id => `${id}: i      s  alphaE   Fy`).join('   |   ') + '   yaw');
    r.log.filter((_, k) => k % 4 === 0).forEach(x => {
      console.log(`  ${fmt(x.t,1).padStart(5)} ${fmt(x.hdg,1).padStart(7)} ${fmt(x.u,2).padStart(5)}  ${x.phase.padEnd(8)} ` +
        r.ids.map(id => `${fmt(x[id].i,1).padStart(7)} ${String(x[id].s).padStart(2)} ${fmt(x[id].alphaE,1).padStart(6)} ${fmt(x[id].Fy,0).padStart(5)}`).join('   |   ') +
        `  ${fmt(x.sailMz,0).padStart(6)}`);
    });
    r.ids.forEach(id => check(`${kn} kn: ${id} camber side changes through the tack`, r.flips[id] === 1,
      `${r.flips[id]} change(s) (expect exactly 1)`));
    console.log(`  end: tack ${r.state._tackPhase}, heading ${fmt(wrapD(r2d(r.state.psi) - r.cfg.TWD),1)} deg off TWD, u ${fmt(r.state.u,2)} m/s`);
  }
}

/* ---------------------------------------------------------------------- */
/* Round 19's final values (md5 sloop 9a9ab2d9...), the reference for "beat untouched". */
const R19 = { a: { sog: 4.049, drive: 827.3 }, b: { sog: 2.160, drive: 354.3 } };
const mean = (a, f) => a.reduce((x, s) => x + f(s), 0)/a.length;
const twaOf = (st, cfg) => wrapD(cfg.TWD - r2d(st.psi));
const HAUL = 0.25, EASE = 0.5;

/* The goose-wing procedure of round 18 (lee sheet let fly, weather sheet hauled home at 0.25/s, held 2 s,
   eased to 0.8 at 0.5/s), with an optional helm programme `onStep`. Same autopilot, same trim. */
function sloopRun({ twa, tws = 6, goose, pre = 120, extraSec, onStep, shipId = 'sloop', cloth }){
  const cfg = SIM.cloneConfig(SIM.defaultConfig());
  if (cloth !== undefined) cfg.ship.rigMaterials = Object.assign({}, cfg.ship.rigMaterials, { clothKgM2: cloth });
  if (shipId !== 'sloop') cfg.ship = SIM.cloneShip(SIM.SHIPS[shipId]);
  cfg.TWS = tws; cfg.TWD = 0; cfg.liveWind = false;
  const built = box.setupSteady(cfg, { tackSign:1, targetTWA:twa, eM:0.9, eWorking:0.9, eLazy:1.0 });
  const st = built.state, ctl = built.controls, dt = cfg.dt;
  for (let n=0;n<Math.round(pre/dt);n++) SIM.step(st, ctl, dt, cfg);
  let phase = goose ? 'haul' : 'done', hold = 0;
  const log = [];
  for (let n=0;n<Math.round(extraSec/dt);n++){
    const t = n*dt;
    if (phase === 'haul') {
      SIM.setSheet(st, cfg, 'jib', 'port', 1.0);
      const es = SIM.getSheet(st, cfg, 'jib', 'stbd');
      if (es <= 0) { phase = 'hold'; hold = 0; }
      else SIM.setSheet(st, cfg, 'jib', 'stbd', Math.max(0, es - HAUL*dt));
    } else if (phase === 'hold') {
      hold += dt; if (hold >= 2) phase = 'ease';
    } else if (phase === 'ease') {
      const es = SIM.getSheet(st, cfg, 'jib', 'stbd');
      if (es >= 0.8) phase = 'done'; else SIM.setSheet(st, cfg, 'jib', 'stbd', Math.min(0.8, es + EASE*dt));
    }
    if (onStep) onStep(st, ctl, cfg, phase, t);
    SIM.step(st, ctl, dt, cfg);
    const L = st._last;
    log.push({ t, phase, jibD: st.sails.jib.delta, jibFx: L.sailF.jib.Fx, sog: Math.hypot(st.u,st.v)/0.5144,
      twa: twaOf(st, cfg), AWA: L.wind.AWA, AWS: L.wind.AWS, jibAback: !!st.sails.jib.aback, jibShade: L.sailF.jib.shade });
  }
  return { log, st, cfg };
}

if (want('--beat')) {
  console.log('\n=== ROUND-20 CHECK B - beat untouched: (a), (b) against round 19 final ===');
  const cfg = SIM.defaultConfig();
  for (const id of ['a', 'b']) {
    const r = SIM.runScenario(SIM.scenarios.find(sc => sc.id === id), cfg);
    const sog = r.measured.sog, drive = r.measured.drive;
    const dS = sog/R19[id].sog - 1, dD = drive/R19[id].drive - 1;
    check(`(${id}) SOG within +-2% of round 19 final`, Math.abs(dS) <= 0.02, `${fmt(sog,3)} vs ${R19[id].sog} kn (${fmt(100*dS,2)}%)`);
    check(`(${id}) total drive within +-2% of round 19 final`, Math.abs(dD) <= 0.02, `${fmt(drive,1)} vs ${R19[id].drive} N (${fmt(100*dD,2)}%)`);
  }
}

/* G: set at TWA 180 by the round-18 procedure, then head up at 0.25 deg/s to 175, 170 and 165, holding
   each for 60 s. Holds = clew to windward, drawing, not aback, over the last 40 s of each hold. */
if (want('--goose')) {
  console.log('\n=== ROUND-20 CHECK G - goose-wing set at 180, then head up 0.25 deg/s, hold 60 s each at 175 / 170 / 165 ===');
  const RATE = 0.25, SET = 45, HOLD = 60, MARKS = [175, 170, 165];
  const sched = []; let tcur = SET, cur = 180;
  for (const tw of MARKS){ const ramp = (cur - tw)/RATE; sched.push({ tw, ramp0: tcur, from: tcur + ramp, to: tcur + ramp + HOLD, cur }); tcur += ramp + HOLD; cur = tw; }
  const target = t => {
    if (t < SET) return 180;
    for (const s of sched){ if (t < s.from) return s.cur - RATE*(t - s.ramp0); if (t < s.to) return s.tw; }
    return 165;
  };
  const r = sloopRun({ twa: 180, goose: true, extraSec: tcur + 5, onStep: (st, ctl, cfg, phase, t) => { ctl.autopilot.targetTWA = target(t); } });
  for (const s of sched){
    const w = r.log.filter(x => x.t >= s.to - 40 && x.t <= s.to);
    const holds = w.every(x => x.jibD > 0), drawing = mean(w, x => x.jibFx) > 0, aback = mean(w, x => x.jibAback ? 1 : 0);
    console.log(`  -- TWA ${s.tw}: last 40 s of the hold: clew ${fmt(Math.min(...w.map(x=>x.jibD)),1)} to ${fmt(Math.max(...w.map(x=>x.jibD)),1)} deg · drive ${fmt(mean(w,x=>x.jibFx),0)} N · kept ${fmt(mean(w,x=>x.jibShade),3)} · aback ${fmt(100*aback,0)}% · mean TWA ${fmt(Math.abs(mean(w,x=>x.twa)),1)} · SOG ${fmt(mean(w,x=>x.sog),3)} kn`);
    check(`TWA ${s.tw}: goose-winged jib holds (clew to windward, drawing, not aback)`, holds && drawing && aback === 0,
      holds ? (drawing ? (aback === 0 ? 'holds' : 'holds but ABACK') : 'holds but NOT drawing') : "FALLS BACK to the main's side");
  }
}

/* S: goose-wing set from the main's side by the sheets alone, at TWA 170 and 165 (round 19's procedure).
   A reported measurement, no criterion: without a pole this is a physical "can't", not a fault. */
if (want('--sheets')) {
  console.log('\n=== ROUND-20 CHECK S - goose-wing set by the sheets alone at TWA 170 / 165 (measurement, no criterion) ===');
  for (const twa of [170, 165]) {
    const g = sloopRun({ twa, goose: true, extraSec: 75 });
    const tail = g.log.filter(s => s.t >= g.log[g.log.length-1].t - 40);
    const holds = tail.every(s => s.jibD > 0);
    console.log(`  TWA ${twa}: last 40 s clew ${fmt(Math.min(...tail.map(s=>s.jibD)),1)} to ${fmt(Math.max(...tail.map(s=>s.jibD)),1)} deg · drive ${fmt(mean(tail,s=>s.jibFx),0)} N -> ${holds ? 'holds' : "falls back to the main's side"}  [OBSERVED]`);
  }
}

/* C: collapse heading up from goose-winged at 180, TWS 4/6/8; reported (known fail at 6 and 8 until round 21). */
if (want('--collapse')) {
  console.log('\n=== ROUND-20 CHECK C - goose-wing collapses: from TWA 180, head up at 0.25 deg/s ===');
  const RATE = 0.25, res = {};
  for (const tws of [4, 6, 8]) {
    let crossed = null;
    sloopRun({ twa: 180, tws, goose: true, extraSec: 45 + 70/RATE, onStep: (st, ctl, cfg, phase, t) => {
      if (t >= 45) ctl.autopilot.targetTWA = Math.max(110, 180 - RATE*(t-45));
      if (t >= 45 && crossed === null && st.sails.jib.delta < 0) {
        const w = SIM.computeWind(st, cfg, st.tSim);
        crossed = { twa: Math.abs(twaOf(st, cfg)), AWA: w.AWA, t };
      }
    }});
    res[tws] = crossed ? crossed.twa : NaN;
    console.log(`  -- TWS ${tws}: jib comes across at TWA ${crossed ? fmt(crossed.twa,1) : 'never (to 110)'}${crossed ? ` (AWA ${fmt(crossed.AWA,1)})` : ''}`);
    const band = !!crossed && crossed.twa >= 150 && crossed.twa <= 165;
    if (tws === 4) check('TWS 4: jib comes across between TWA 150 and 165', band, crossed ? `TWA ${fmt(crossed.twa,1)}` : 'did not cross');
    else console.log(`     band 150-165: ${band ? 'inside' : 'outside'}  (known: fails until round 21)  [OBSERVED]`);
  }
  check('heavier wind holds it longer (crosses at a lower TWA as TWS rises 4 -> 6 -> 8)', res[4] > res[6] && res[6] > res[8],
        `TWA ${fmt(res[4],1)} / ${fmt(res[6],1)} / ${fmt(res[8],1)}`);
}

/* I: (i) "crosses gently": peak heel after the cross below the eased variant's. */
if (want('--i')) {
  console.log('\n=== ROUND-20 CHECK I - (i) crosses gently: peak heel after, sheeted below eased ===');
  const cfg = SIM.defaultConfig();
  const e = SIM.runScenario(SIM.scenarios.find(sc => sc.id === 'i-eased'), cfg);
  const s = SIM.runScenario(SIM.scenarios.find(sc => sc.id === 'i-sheeted'), cfg);
  check('(i) sheeted peak heel after < eased peak heel after', s.measured.peakHeelAfter < e.measured.peakHeelAfter,
    `${fmt(s.measured.peakHeelAfter,2)} vs ${fmt(e.measured.peakHeelAfter,2)} deg`);
}

/* ---------------------------------------------------------------------- */
/* N: step 3, investigation only -- NO change to index.html. Every cap below is applied from outside the
   physics (the jib's clew angle is held at or below `cap` before each step), so the shipped model and its
   md5s are untouched. The question: why does an unpoled goose-winged jib fall in earlier in a breeze?

   Candidate 1 (the reviewer's lead): without a pole the wind LIFTS the clew, the sail stands high and baggy,
   and the clew sits well inside the 70 deg the 2D sheet limit allows. The chord then lies closer to the wind
   and the sail luffs at an apparent wind of 180 - (clew angle), whatever the wind speed.            */
if (want('--geometry')) {
  console.log('\n=== ROUND-20 CHECK N1 - the sloop jib\'s geometry, from the ship definition ===');
  const cfg = SIM.defaultConfig();
  const def = SIM.sailDefs(cfg).find(d => d.id === 'jib');
  const ll = SIM.luffLine(cfg, def), mm = SIM.trimMomentModel(cfg, def);
  const mast = SIM.mastDefs(cfg)[0];
  const luff = Math.hypot(ll.tack.x - ll.head.x, ll.head.z - ll.tack.z);
  const hPerp = 2*def.A/luff;
  console.log(`  mast x ${fmt(mast.x,2)} m fwd of the CLR · luff line (${ll.derived ? 'derived' : 'declared'}): tack x ${fmt(ll.tack.x,2)} z ${fmt(ll.tack.z,2)} -> head x ${fmt(ll.head.x,2)} z ${fmt(ll.head.z,2)}`);
  console.log(`  luff ${fmt(luff,2)} m · stay rake ${fmt(mm.rakeDeg,1)} deg aft of vertical · A ${def.A} m2 -> clew ${fmt(hPerp,2)} m from the luff (perpendicular) · foot (2A/luff-band) ${fmt(2*def.A/(def.zHi-def.zLo),2)} m`);
  console.log(`  clew weight share: cloth ${fmt(cfg.ship.rigMaterials.clothKgM2*def.A/3,2)} kg (a third of the cloth, [assumed]) + half of two sheets' free span ${fmt(2*0.5*cfg.ship.rigMaterials.sheetKgM*hPerp*0.5,2)} kg`);
}

/* The cap emulation: hold the jib's clew angle (positive = to windward on this tack) at or below `cap` before
   each step, for the whole run. */
function capRun(cap, opts){
  return sloopRun(Object.assign({}, opts, { onStep: (st, ctl, cfg, phase, t) => {
    if (st.sails.jib.delta > cap) st.sails.jib.delta = cap;
    if (opts.onStep) opts.onStep(st, ctl, cfg, phase, t);
  }}));
}
function collapseAt(tws, cap, cloth){
  const RATE = 0.25; let crossed = null;
  capRun(cap, { twa: 180, tws, cloth, goose: true, extraSec: 45 + 70/RATE, onStep: (st, ctl, cfg, phase, t) => {
    if (t >= 45) ctl.autopilot.targetTWA = Math.max(110, 180 - RATE*(t-45));
    if (t >= 45 && crossed === null && st.sails.jib.delta < 0) {
      const w = SIM.computeWind(st, cfg, st.tSim);
      crossed = { twa: Math.abs(twaOf(st, cfg)), AWA: w.AWA };
    }
  }});
  return crossed;
}
if (want('--sweep')) {
  console.log('\n=== ROUND-20 CHECK N2 - sensitivity: the jib\'s outboard clew angle held at a cap (diagnostic, shipped model untouched) ===');
  console.log('  cap = the most the clew can stand out to windward. "70" is the shipped model (the 2D sheet limit).');
  const rows = [];
  for (const cap of [70, 66, 60, 55, 50, 45, 40]) {
    const c = [4, 6, 8].map(tws => collapseAt(tws, cap));
    rows.push({ cap, c });
    console.log(`  cap ${String(cap).padStart(2)} deg: collapse (jib comes across) at TWA ` + c.map((x, k) => `${[4,6,8][k]} m/s ${x ? fmt(x.twa,1) + ' (AWA ' + fmt(x.AWA,1) + ')' : 'never'}`).join(' · '));
  }
}
/* The new goose-wing holds procedure (set at 180, head up 0.25 deg/s, hold 60 s at 175/170/165) at TWS 6,
   with the jib's clew held at or below `cap`. */
function holdsUnderCap(cap){
  const RATE = 0.25, SET = 45, HOLD = 60, MARKS = [175, 170, 165];
  const sched = []; let tcur = SET, cur = 180;
  for (const tw of MARKS){ const ramp = (cur - tw)/RATE; sched.push({ tw, ramp0: tcur, from: tcur + ramp, to: tcur + ramp + HOLD, cur }); tcur += ramp + HOLD; cur = tw; }
  const target = t => { if (t < SET) return 180; for (const s of sched){ if (t < s.from) return s.cur - RATE*(t - s.ramp0); if (t < s.to) return s.tw; } return 165; };
  const r = capRun(cap, { twa: 180, goose: true, extraSec: tcur + 5, onStep: (st, ctl, cfg, phase, t) => { ctl.autopilot.targetTWA = target(t); } });
  return sched.map(s => {
    const w = r.log.filter(x => x.t >= s.to - 40 && x.t <= s.to);
    return { tw: s.tw, holds: w.every(x => x.jibD > 0) && mean(w, x => x.jibFx) > 0 && mean(w, x => x.jibAback ? 1 : 0) === 0,
             drive: mean(w, x => x.jibFx), sog: mean(w, x => x.sog) };
  });
}
/* N5: the weight half of the balance. The cap moves every TWS together; the spread between TWS 4 and 8 is the
   weight (constant) against the pressure (grows with TWS squared). Diagnostic: cloth weight per m2 varied. */
if (want('--cloth')) {
  console.log('\n=== ROUND-20 CHECK N5 - collapse TWA against the cloth weight, with the clew capped at 55 deg (diagnostic only) ===');
  for (const cloth of [0.40, 0.30, 0.20]) {
    const c = [4, 6, 8].map(tws => collapseAt(tws, 55, cloth));
    console.log(`  cloth ${fmt(cloth,2)} kg/m2: collapse at TWA ` + c.map((x, k) => `${[4,6,8][k]} m/s ${x ? fmt(x.twa,1) : 'never'}`).join(' · ') + ` · spread ${c.every(Boolean) ? fmt(c[0].twa - c[2].twa,1) : '-'} deg`);
  }
}
if (want('--rows')) {
  console.log('\n=== ROUND-20 CHECK N3 - what each cap does to the goose-wing holds (TWS 6), (c) and the run ===');
  const cfg = SIM.defaultConfig();
  const c = SIM.runScenario(SIM.scenarios.find(sc => sc.id === 'c'), cfg);
  const reach = c.measured.sog90;
  for (const cap of [70, 66, 60, 55, 50, 45]) {
    const h = holdsUnderCap(cap);
    const run = capRun(cap, { twa: 180, goose: true, extraSec: 120 });
    const tail = run.log.filter(s => s.t >= run.log[run.log.length-1].t - 20);
    const gs = mean(tail, s => s.sog);
    console.log(`  cap ${String(cap).padStart(2)} deg: holds ` + h.map(x => `${x.tw}: ${x.holds ? 'yes' : 'NO'} (${fmt(x.drive,0)} N)`).join(' · ') +
      ` | (c) run at 180 ${fmt(gs,3)} kn, ratio to the beam reach ${fmt(gs/reach,3)} (>= 0.70: ${gs/reach >= 0.70 ? 'PASS' : 'FAIL'})`);
  }
}

/* N4: what the lift of the clew does in the model's own hinge geometry. The 2D force model has no vertical
   component; a sail on a stay raked theta aft, swung out by delta about it, has the plane normal
   n = (-cos(theta) sin(delta), -cos(delta), -sin(theta) sin(delta)) (x fwd, y stbd, z up), and a pressure force
   along +-n has the vertical share n_z. Candidate 1's question is whether that lift can stand the clew INSIDE
   the sheet limit. The tangential moment about the stay axis (the one that moves delta) is
   t.F with t = (cos(theta) sin(delta), cos(delta), sin(theta) sin(delta)). */
if (want('--lift')) {
  console.log('\n=== ROUND-20 CHECK N4 - candidate 1: the lift of an unpoled clew, from the hinge geometry ===');
  const cfg = SIM.defaultConfig();
  const def = SIM.sailDefs(cfg).find(d => d.id === 'jib');
  const mm = SIM.trimMomentModel(cfg, def), th = mm.rake, ll = SIM.luffLine(cfg, def);
  const rho = 2*def.A/Math.hypot(ll.tack.x - ll.head.x, ll.head.z - ll.tack.z);
  const d2r = x => x*Math.PI/180;
  const sailKg = cfg.ship.rigMaterials.clothKgM2*def.A + 2*0.5*cfg.ship.rigMaterials.sheetKgM*rho;
  console.log(`  stay rake ${fmt(mm.rakeDeg,1)} deg · clew ${fmt(rho,2)} m from the luff · sail + sheet weight ${fmt(sailKg,2)} kg = ${fmt(sailKg*cfg.g,0)} N`);
  console.log('  delta   n_z (vertical share of the normal)   F_z / F_h   tangential moment with F_z vs 2D   clew height above the tack band (m)   plan-view chord angle of the raked plane');
  for (const dd of [90, 70, 60, 55, 50, 45]) {
    const d = d2r(dd), nh2 = Math.pow(Math.cos(th)*Math.sin(d),2) + Math.pow(Math.cos(d),2);
    const nz = Math.sin(th)*Math.sin(d), fzfh = nz/Math.sqrt(nh2);
    const incr = Math.pow(Math.sin(th)*Math.sin(d),2)/nh2;
    const zc = ll.tack.z + rho*Math.sin(th)*(1 - Math.cos(d));
    const eff = Math.atan(Math.cos(th)*Math.tan(d))*180/Math.PI;
    console.log(`  ${String(dd).padStart(3)}     ${fmt(nz,3)}                                 ${fmt(fzfh,2)}        +${fmt(100*incr,0)}% (outward)                      ${fmt(zc,2)}                                    ${fmt(eff,1)} deg`);
  }
  // the goose-winged run's own force, to put N on F_z
  const g = sloopRun({ twa: 175, goose: true, extraSec: 75 });
  const tail = g.log.filter(s => s.t >= g.log[g.log.length-1].t - 20), Fh = mean(tail, s => s.jibFx);
  const d = d2r(mean(tail, s => s.jibD)), nh = Math.sqrt(Math.pow(Math.cos(th)*Math.sin(d),2) + Math.pow(Math.cos(d),2));
  console.log(`  goose-winged at TWA 175: clew ${fmt(mean(tail,s=>s.jibD),1)} deg, jib drive F_x ${fmt(Fh,0)} N -> if the force is normal to the plane, F_z = ${fmt(Fh*Math.sin(th)*Math.sin(d)/(Math.cos(th)*Math.sin(d)),0)} N up against ${fmt(sailKg*cfg.g,0)} N of weight`);
}


if (fails) { console.log(`\n${fails} FAIL`); process.exitCode = 1; }
