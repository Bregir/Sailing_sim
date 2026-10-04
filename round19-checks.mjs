// Round-19 checks -- kept tool, not scratch. Loads index.html's inline script
// into a Node vm the same way run-scenarios.mjs does and runs the shipped
// physics; nothing here changes a config value the harness uses, so running it
// cannot move any harness md5.
//
//   node round19-checks.mjs            -- everything
//   node round19-checks.mjs --goose    -- G: goose-wing procedure, TWA 180/175/170/167/165
//   node round19-checks.mjs --kept     -- P: pressure each sail keeps (step 2)
//   node round19-checks.mjs --collapse -- C: goose-wing collapse heading up, TWS 4/6/8
//   node round19-checks.mjs --beat     -- B: (a), (b) and the beat-shading row vs round 18
//   node round19-checks.mjs --c        -- R: (c) rewritten (reach / goose-winged run / jib on main's side)
//   node round19-checks.mjs --i        -- I: (i) rewritten, by-the-lee angle
//   node round19-checks.mjs --masses   -- M: masses and lever arms of the step-3 moment balance
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const PROJ = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const want = k => argv.length === 0 || argv.includes(k);
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
const mean = (a, f) => a.reduce((x, s) => x + f(s), 0)/a.length;
const twaOf = (st, cfg) => wrapD(cfg.TWD - r2d(st.psi));

/* Round 18's values at md5 cc9ec0ab... (the harness output this round starts
   from), for the "beat untouched" row: within +-2%. */
const R18 = { a: { sog: 4.076, drive: 833.599 }, b: { sog: 2.305, drive: 380.837 } };

/* The goose-wing procedure, as round 18 ran it and §16 step 1 restates it:
   on a run with the jib on the main's side, let the lee (port) sheet fly,
   haul the weather (starboard) sheet home at the haul rate, hold 2 s, then
   ease it to 0.8 at the ease rate. Same autopilot, same trim on the rest. */
const HAUL = 0.25, EASE = 0.5;
function sloopRun({ twa, tws = 6, goose, pre = 120, extraSec, onStep, shipId = 'sloop' }){
  const cfg = SIM.cloneConfig(SIM.defaultConfig());
  if (shipId !== 'sloop') cfg.ship = SIM.cloneShip(SIM.SHIPS[shipId]);
  cfg.TWS = tws; cfg.TWD = 0; cfg.liveWind = false;
  const built = box.setupSteady(cfg, { tackSign:1, targetTWA:twa, eM:0.9, eWorking:0.9, eLazy:1.0 });
  const st = built.state, ctl = built.controls, dt = cfg.dt;
  for (let n=0;n<Math.round(pre/dt);n++) SIM.step(st, ctl, dt, cfg);
  let phase = goose ? 'haul' : 'done', hold = 0, doneAt = null;
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
      if (es >= 0.8) { phase = 'done'; doneAt = t; } else SIM.setSheet(st, cfg, 'jib', 'stbd', Math.min(0.8, es + EASE*dt));
    }
    if (onStep) onStep(st, ctl, cfg, phase, t);
    SIM.step(st, ctl, dt, cfg);
    const L = st._last;
    log.push({ t, phase, jibD: st.sails.jib.delta, mainD: st.sails.main.delta,
      jibFx: L.sailF.jib.Fx, tot: L.sailFx, sog: Math.hypot(st.u,st.v)/0.5144,
      twa: twaOf(st, cfg), AWA: L.wind.AWA, AWS: L.wind.AWS, jibAback: !!st.sails.jib.aback,
      jibShade: L.sailF.jib.shade });
  }
  return { log, st, cfg, doneAt };
}

/* ---------------------------------------------------------------------- */
if (want('--goose')) {
  console.log('\n=== ROUND-19 CHECK G - goose-wing procedure (step 1 row; acceptance "goose-wing holds") ===');
  console.log('  lee sheet let fly, weather sheet hauled home at 0.25/s, held 2 s, eased to 0.8 at 0.5/s; then 60 s');
  for (const twa of [180, 175, 170, 167, 165]) {
    const g = sloopRun({ twa, goose: true, extraSec: 75 });
    const home = g.log.find(s => s.phase === 'hold');
    const tail = g.log.filter(s => s.t >= g.log[g.log.length-1].t - 40);
    const holds = tail.every(s => s.jibD > 0);
    const drawing = mean(tail, s => s.jibFx) > 0;
    const aback = mean(tail, s => s.jibAback ? 1 : 0);
    const unstable = wrapD(180 - g.log[0].AWA);
    console.log(`  -- TWA ${twa}: AWA ${fmt(g.log[0].AWA,1)}, unstable point (chord into the wind) at clew ${fmt(unstable,1)} deg; sheet home -> clew ${fmt(home ? home.jibD : NaN,1)} deg`);
    console.log(`     last 40 s: clew ${fmt(Math.min(...tail.map(s=>s.jibD)),1)} to ${fmt(Math.max(...tail.map(s=>s.jibD)),1)} deg · jib drive ${fmt(mean(tail,s=>s.jibFx),0)} N · kept ${fmt(mean(tail,s=>s.jibShade),3)} · aback ${fmt(100*aback,0)}% · SOG ${fmt(mean(tail,s=>s.sog),3)} kn`);
    check(`TWA ${twa}: goose-winged jib holds (clew to windward, drawing, not aback)`, holds && drawing && aback === 0,
          holds ? (drawing ? (aback === 0 ? 'holds' : 'holds but ABACK') : 'holds but NOT drawing') : 'FALLS BACK to the main\'s side');
  }
}

/* ---------------------------------------------------------------------- */
function kept(shipId, twa, prep, settle){
  const cfg = SIM.cloneConfig(SIM.defaultConfig());
  if (shipId !== 'sloop') cfg.ship = SIM.cloneShip(SIM.SHIPS[shipId]);
  cfg.TWS = 6; cfg.TWD = 0; cfg.liveWind = false;
  const built = box.setupSteady(cfg, { tackSign:1, targetTWA:twa, eM:0.9, eWorking:0.9, eLazy:1.0 });
  if (prep) prep(built.state, cfg);
  for (let n=0;n<Math.round(settle/cfg.dt);n++) SIM.step(built.state, built.controls, cfg.dt, cfg);
  const wind = SIM.computeWind(built.state, cfg, built.state.tSim);
  const rig = SIM.rigView(built.state, cfg);
  const out = {};
  for (const d of SIM.sailDefs(cfg)) out[d.id] = SIM.shadeFactor(d, wind, rig);
  return { out, AWA: wind.AWA, st: built.state };
}
if (want('--kept')) {
  console.log('\n=== ROUND-19 CHECK P - pressure each sail keeps (step 2) ===');
  for (const twa of [160, 180]) {
    const r = kept('sloop', twa, null, 120);
    console.log(`  sloop TWA ${twa} (AWA ${fmt(r.AWA,1)}): ${Object.entries(r.out).map(([k,v])=>`${k} ${fmt(v,3)}`).join(' · ')}`);
    check(`sloop TWA ${twa}: the aftmost sail (main) is unshaded`, r.out.main === 1, fmt(r.out.main,3));
  }
  const prep = (st, cfg) => { SIM.setHoist(st, cfg, 'foreTopsail', 1); SIM.braceTo(st, cfg, 'foreTopsail', 0); };
  const v = kept('topsailSchooner', 170, prep, 240);
  console.log(`  schooner (v) TWA 170 (AWA ${fmt(v.AWA,1)}): ${Object.entries(v.out).map(([k,x])=>`${k} ${fmt(x,3)}`).join(' · ')}`);
  check('schooner (v): the aftmost sail (mainsail) is unshaded', v.out.mainsail === 1, fmt(v.out.mainsail,3));
}

/* ---------------------------------------------------------------------- */
if (want('--collapse')) {
  console.log('\n=== ROUND-19 CHECK C - goose-wing collapses: from TWA 180, head up at 0.25 deg/s ===');
  const RATE = 0.25, res = {};
  for (const tws of [4, 6, 8]) {
    let crossed = null;
    const r = sloopRun({ twa: 180, tws, goose: true, extraSec: 45 + 70/RATE, onStep: (st, ctl, cfg, phase, t) => {
      if (t >= 45) ctl.autopilot.targetTWA = Math.max(110, 180 - RATE*(t-45));
      if (t >= 45 && crossed === null && st.sails.jib.delta < 0) {
        const w = SIM.computeWind(st, cfg, st.tSim);
        crossed = { twa: Math.abs(twaOf(st, cfg)), AWA: w.AWA, t };
      }
    }});
    const outAtStart = r.log.filter(s => s.t >= 40 && s.t < 45).every(s => s.jibD > 0);
    res[tws] = crossed ? crossed.twa : NaN;
    const before = r.log.filter(s => s.t >= 45 && (!crossed || s.t < crossed.t));
    const pick = [175,170,165,160,155,150,145,140,135].map(x => before.find(s => Math.abs(s.twa) <= x)).filter(Boolean);
    console.log(`  -- TWS ${tws}: goose-winged at the start ${outAtStart ? 'yes' : 'NO'}; jib comes across at TWA ${crossed ? fmt(crossed.twa,1) : 'never (to 110)'}${crossed ? ` (AWA ${fmt(crossed.AWA,1)})` : ''}`);
    console.log(`     on the way: ${pick.map(s=>`TWA ${fmt(Math.abs(s.twa),0)}: clew ${fmt(s.jibD,0)}, drive ${fmt(s.jibFx,0)} N`).join(' · ')}`);
    check(`TWS ${tws}: jib comes across between TWA 150 and 165`, outAtStart && crossed && crossed.twa >= 150 && crossed.twa <= 165,
          crossed ? `TWA ${fmt(crossed.twa,1)}` : 'did not cross');
  }
  check('heavier wind holds it longer (crosses at a lower TWA as TWS rises 4 -> 6 -> 8)', res[4] > res[6] && res[6] > res[8],
        `TWA ${fmt(res[4],1)} / ${fmt(res[6],1)} / ${fmt(res[8],1)}`);
}

/* ---------------------------------------------------------------------- */
if (want('--beat')) {
  console.log('\n=== ROUND-19 CHECK B - beat untouched: (a), (b) and the beat-shading row, against round 18 ===');
  const cfg = SIM.defaultConfig();
  for (const id of ['a', 'b']) {
    const r = SIM.runScenario(SIM.scenarios.find(sc => sc.id === id), cfg);
    const sog = r.measured.sog, drive = r.measured.drive;
    const dS = sog/R18[id].sog - 1, dD = drive/R18[id].drive - 1;
    check(`(${id}) SOG within +-2% of round 18`, Math.abs(dS) <= 0.02, `${fmt(sog,3)} vs ${R18[id].sog} kn (${fmt(100*dS,2)}%)`);
    check(`(${id}) total drive within +-2% of round 18`, Math.abs(dD) <= 0.02, `${fmt(drive,1)} vs ${R18[id].drive} N (${fmt(100*dD,2)}%)`);
  }
  // round 18's S1: steady (a), drive read with the physics' shading and in clear air at that one state
  const c2 = SIM.cloneConfig(SIM.defaultConfig()); c2.TWS = 6; c2.TWD = 0; c2.liveWind = false;
  const built = box.setupSteady(c2, { tackSign:1, targetTWA:45, eM:0.15, eWorking:0.20, eLazy:1.0 });
  for (let n=0;n<Math.round(90/c2.dt);n++) SIM.step(built.state, built.controls, c2.dt, c2);
  const st = built.state, wind = SIM.computeWind(st, c2, st.tSim);
  const rig = { sails: JSON.parse(JSON.stringify(st.sails)), config: c2 };
  let sh = 0, cl = 0; const k = [];
  for (const d of SIM.sailDefs(c2)) {
    const a = SIM.computeSailForces(JSON.parse(JSON.stringify(rig.sails[d.id])), wind, c2, st.phi, d, undefined, rig);
    const b = SIM.computeSailForces(JSON.parse(JSON.stringify(rig.sails[d.id])), wind, c2, st.phi, d, 1, rig);
    sh += a.Fx; cl += b.Fx; k.push(`${d.id} ${fmt(a.shade,3)}`);
  }
  console.log(`  beat-shading row: AWA ${fmt(wind.AWA,1)}; kept ${k.join(' · ')}`);
  check('beat-shading row: shading loss still 0%', sh >= cl - 1e-9, `${fmt(sh,1)} N shaded vs ${fmt(cl,1)} N clear`);
}

/* ---------------------------------------------------------------------- */
if (want('--c')) {
  console.log('\n=== ROUND-19 CHECK R - (c) rewritten: beam reach; dead run goose-winged; dead run jib on the main\'s side ===');
  const cfg = SIM.defaultConfig();
  const c = SIM.runScenario(SIM.scenarios.find(sc => sc.id === 'c'), cfg);
  const reach = c.measured.sog90;
  const g = sloopRun({ twa: 180, goose: true, extraSec: 120 });
  const s = sloopRun({ twa: 180, goose: false, extraSec: 120 });
  const tail = r => r.log.filter(x => x.t >= r.log[r.log.length-1].t - 20);
  const gs = mean(tail(g), x => x.sog), ss = mean(tail(s), x => x.sog);
  const aws = mean(tail(g), x => x.AWS);
  console.log(`  beam reach (harness (c), TWA 90): ${fmt(reach,3)} kn · goose-winged run ${fmt(gs,3)} kn (clew ${fmt(mean(tail(g),x=>x.jibD),1)}) · jib on the main's side ${fmt(ss,3)} kn (clew ${fmt(mean(tail(s),x=>x.jibD),1)})`);
  if (c.measured.sogGoose !== undefined)
    console.log(`  harness row (c) itself: goose-winged ${fmt(c.measured.sogGoose,3)} kn (clew ${fmt(c.measured.jibGoose,1)}) · main's side ${fmt(c.measured.sog180,3)} kn (clew ${fmt(c.measured.jibSame,1)})`);
  check('reach band 5.5-6.5 kn', reach >= 5.5 && reach <= 6.5, fmt(reach,3));
  check('goose-winged run SOG >= 0.70 x beam-reach SOG', gs >= 0.70*reach, `${fmt(gs,3)} vs ${fmt(0.70*reach,3)} kn (ratio ${fmt(gs/reach,3)})`);
  check('goose-winged run faster than jib on the main\'s side', gs > ss, `${fmt(gs,3)} vs ${fmt(ss,3)} kn`);
  check('AWS < TWS on the run', aws < 6, `AWS ${fmt(aws,3)} m/s`);
}

/* ---------------------------------------------------------------------- */
if (want('--i')) {
  console.log('\n=== ROUND-19 CHECK I - (i) rewritten for flat water: by-the-lee angle when the eased boom starts across ===');
  const cfg = SIM.defaultConfig();
  for (const id of ['i-eased', 'i-sheeted']) {
    const r = SIM.runScenario(SIM.scenarios.find(sc => sc.id === id), cfg);
    const sm = r.samples;
    let k = -1;
    for (let j=1;j<sm.length;j++) if (sm[j-1].sails.main.delta !== 0 && Math.sign(sm[j-1].sails.main.delta) !== Math.sign(sm[j].sails.main.delta)) { k = j; break; }
    if (k < 0) { check(`${id}: boom crosses`, false, 'never'); continue; }
    let i0 = k; while (i0 > 0 && Math.abs(sm[i0].sails.main.delta - sm[i0-1].sails.main.delta) > 0.05) i0--;
    const twa = wrapD(0 - r2d(sm[i0].psi));
    const lee = twa < 0 ? 180 + twa : -(180 - twa);
    console.log(`  ${id}: starts across at t ${fmt(sm[i0].t,2)} s, TWA ${fmt(twa,1)} -> ${fmt(lee,1)} deg by the lee; swing ${fmt(r.measured.swingDuration,3)} s, peak heel ${fmt(r.measured.peakHeelAfter,2)} deg, peak yaw ${fmt(r.measured.peakYawAfter,2)} deg/s`);
    check(`${id}: boom crosses`, true, `at ${fmt(lee,1)} deg by the lee`);
  }
}

/* ---------------------------------------------------------------------- */
if (want('--masses') && SIM.trimMomentModel) {
  console.log('\n=== ROUND-19 CHECK M - masses and lever arms of the step-3 moment balance ===');
  for (const shipId of Object.keys(SIM.SHIPS)) {
    const cfg = SIM.cloneConfig(SIM.defaultConfig()); cfg.ship = SIM.cloneShip(SIM.SHIPS[shipId]);
    for (const d of SIM.sailDefs(cfg)) {
      const m = SIM.trimMomentModel(cfg, d);
      if (!m) continue;
      console.log(`  ${shipId.padEnd(16)} ${d.id.padEnd(20)} hinge ${m.hinge.padEnd(4)} rake ${fmt(m.rakeDeg,1).padStart(5)} deg · aero arm ${fmt(m.armCE,2)} m · ` +
        m.parts.map(p => `${p.what} ${fmt(p.kg,2)} kg @ ${fmt(p.arm,2)} m`).join(' + ') + ` = ${fmt(m.sumMR,2)} kg*m`);
    }
  }
}

console.log(fails ? `\n${fails} FAIL(s)` : '\nall green');
process.exitCode = fails ? 1 : 0;
