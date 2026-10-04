// Round-18 checks (spec §16 "Round 18"). Kept tool, not scratch.
//
//   U.  Amended row (u) on the schooner, re-run BEFORE any shading physics:
//       fore staysail AND fore-topsail backed, mainsheet hard in, helm a-lee.
//       Measured over a long window (the last 600 s of a 1200 s run, i.e. at
//       least two hunt periods of the ~150 s swing round 17 found), and the
//       hunt period itself is measured so the window can be checked against it.
//
// It calls the same SIM.* functions and the same setupSteady() the harness's
// row (u) uses, from a separate file, so running it cannot move any harness md5.
//
// Usage: node round18-checks.mjs [--u-only]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const PROJ = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
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
const wrap = d => ((d + 180) % 360 + 360) % 360 - 180;
const r2d = r => r*180/Math.PI;

/* ==========================================================================
   U. AMENDED ROW (u) -- heave-to with the fore staysail backed
   ========================================================================== */
function heaveTo({ backStaysail, stayEase = 0.25, runSec, windowSec }){
  const cfg = SIM.cloneConfig(SIM.defaultConfig());
  cfg.ship = SIM.cloneShip(SIM.SHIPS.topsailSchooner);
  cfg.TWS = 8; cfg.TWD = 0; cfg.liveWind = false;
  const dt = cfg.dt;
  // identical to the harness's row (u): settle sailing at TWA 50, topsail set
  const built = box.setupSteady(cfg, {tackSign:1, targetTWA:50, eM:0.18, eWorking:0.24, eLazy:1.0});
  const st = built.state;
  SIM.setHoist(st, cfg, 'foreTopsail', 1);
  SIM.braceTo(st, cfg, 'foreTopsail', 45);
  for (let n=0;n<Math.round(240/dt);n++) SIM.step(st, built.controls, dt, cfg);
  // heave to: topsail braced aback, main hard in, headsails let go ...
  SIM.braceTo(st, cfg, 'foreTopsail', -55);
  SIM.applyTrim(st, cfg, 1, { centre:0.05, working:1.0, lazy:1.0 });
  // ... and (amended 2026-10-01) the fore staysail backed: weather sheet hauled
  if (backStaysail) {
    SIM.setSheet(st, cfg, 'foreStaysail', 'stbd', stayEase);
    SIM.setSheet(st, cfg, 'foreStaysail', 'port', 1.0);
  }
  st.rudder.mode = 'lashed'; st.rudder.deltaR = 35;   // a-lee on starboard tack
  const t0 = st.tSim, w = [];
  for (let n=0;n<Math.round(runSec/dt);n++){
    SIM.step(st, {}, dt, cfg);
    if (st.tSim - t0 >= runSec - windowSec) w.push({
      t: st.tSim - t0,
      twa: Math.abs(wrap(r2d(st.psi) - cfg.TWD)),
      sog: Math.hypot(st.u, st.v)/0.5144, u: st.u/0.5144, v: st.v/0.5144,
      phi: r2d(st.phi),
      stayDelta: st.sails.foreStaysail.delta,
      stayAback: !!st.sails.foreStaysail.aback, topAback: !!st.sails.foreTopsail.aback,
      ok: isFinite(st.u)&&isFinite(st.psi)&&isFinite(st.phi),
    });
  }
  const avg = f => w.reduce((a,s)=>a+f(s),0)/w.length;
  const sd = (arr, f) => { const m = arr.reduce((a,s)=>a+f(s),0)/arr.length;
    return Math.sqrt(arr.reduce((a,s)=>a+(f(s)-m)**2,0)/arr.length); };
  const half = w.length>>1;
  const twaMean = avg(s=>s.twa);
  // hunt period: mean spacing of upward crossings of the mean TWA, crossings
  // counted only after a 2-deg excursion so jitter does not register
  const ups = []; let below = false;
  for (const s of w) {
    if (s.twa < twaMean - 2) below = true;
    else if (below && s.twa > twaMean) { ups.push(s.t); below = false; }
  }
  const period = ups.length >= 2 ? (ups[ups.length-1]-ups[0])/(ups.length-1) : NaN;
  return {
    twaMin: Math.min(...w.map(s=>s.twa)), twaMax: Math.max(...w.map(s=>s.twa)), twaMean,
    twaSd1: sd(w.slice(0,half), s=>s.twa), twaSd2: sd(w.slice(half), s=>s.twa),
    heelSd1: sd(w.slice(0,half), s=>s.phi), heelSd2: sd(w.slice(half), s=>s.phi),
    drift: avg(s=>s.sog), forereach: avg(s=>s.u), leeway: avg(s=>Math.abs(s.v)),
    stayDelta: avg(s=>s.stayDelta),
    stayAback: avg(s=>s.stayAback?1:0), topAback: avg(s=>s.topAback?1:0),
    period, cycles: ups.length ? ups.length-1 : 0,
    finite: w.every(s=>s.ok), windowSec,
  };
}

console.log('\n=== ROUND-18 CHECK U - amended row (u), heave-to with the fore staysail backed ===');
{
  const RUN = 1200, WIN = 600;
  /* What "backed" means in this model. The weather (starboard) sheet's
     interval is [-(es*lim - beta), es*lim]; with es = 0.25 on lim 90 that is
     [-2.5, 22.5], and the wind holds the clew at its lee end, -2.5 deg --
     sheeted flat amidships, NOT aback. The clew only crosses to windward once
     es*lim < beta (es < 0.222), and sits at beta - es*lim. Round 17's
     diagnostic used 0.25, so the sweep runs that and two truly backed values. */
  const variants = [
    ['round-17 wording (topsail only)', { backStaysail:false }],
    ['staysail weather sheet 0.25 (round-17 diagnostic)', { backStaysail:true, stayEase:0.25 }],
    ['staysail weather sheet 0.10', { backStaysail:true, stayEase:0.10 }],
    ['staysail weather sheet 0.00 (hauled home)', { backStaysail:true, stayEase:0.0 }],
  ];
  const res = {};
  for (const [name, opt] of variants) {
    const m = heaveTo({ ...opt, runSec:RUN, windowSec:WIN });
    res[name] = m;
    console.log(`  -- ${name}: window = last ${m.windowSec} s of ${RUN} s`);
    console.log(`     TWA min/mean/max ${fmt(m.twaMin,1)} / ${fmt(m.twaMean,1)} / ${fmt(m.twaMax,1)} deg`);
    console.log(`     hunt period ${isFinite(m.period)?fmt(m.period,0)+' s':'none detected'} (${m.cycles} full cycles in window)`);
    console.log(`     TWA sd first/second half ${fmt(m.twaSd1)} / ${fmt(m.twaSd2)} · heel sd ${fmt(m.heelSd1)} / ${fmt(m.heelSd2)}`);
    console.log(`     drift ${fmt(m.drift)} kn (forereach ${fmt(m.forereach)} kn, sideways ${fmt(m.leeway)} kn)`);
    console.log(`     fore staysail clew ${fmt(m.stayDelta,1)} deg (+ = starboard = windward), aback ${fmt(100*m.stayAback,0)}% · fore topsail aback ${fmt(100*m.topAback,0)}%`);
  }
  // the criterion is judged with the staysail truly backed, weather sheet home
  const a = res['staysail weather sheet 0.00 (hauled home)'];
  console.log('  criterion judged on: staysail weather sheet hauled home (0.00)');
  check('fore staysail actually aback', a.stayAback >= 0.9, `${fmt(100*a.stayAback,0)}%, clew ${fmt(a.stayDelta,1)} deg`);
  const winOk = !isFinite(a.period) || WIN >= 2*a.period;
  check('window covers at least two hunt periods', winOk && WIN >= 300,
        `${WIN} s vs period ${isFinite(a.period)?fmt(a.period,0)+' s':'none'}`);
  // the harness row's own test, no slack: second-half sd over first-half sd <= 1.05
  const settles = a.twaSd2 <= 1.05*a.twaSd1 && a.heelSd2 <= 1.05*a.heelSd1;
  check("settles (no oscillation growing: TWA and heel sd ratio, second half / first <= 1.05)", settles,
        `TWA ${fmt(a.twaSd1)} -> ${fmt(a.twaSd2)} (${fmt(a.twaSd2/a.twaSd1,3)}), heel ${fmt(a.heelSd1)} -> ${fmt(a.heelSd2)} (${fmt(a.heelSd2/a.heelSd1,3)})`);
  check('drift under 1.5 kn', a.drift < 1.5, `${fmt(a.drift)} kn`);
  check('lies 40-100 deg off the true wind', a.twaMin >= 40 && a.twaMax <= 100,
        `${fmt(a.twaMin,1)}-${fmt(a.twaMax,1)} deg`);
  check('never comes inside 30 deg', a.twaMin >= 30, `closest ${fmt(a.twaMin,1)} deg`);
  check('fore topsail aback (the square mechanism still exercised)', a.topAback >= 0.9, `${fmt(100*a.topAback,0)}%`);
  check('no NaN', a.finite, String(a.finite));
}

if (argv.includes('--u-only')) { console.log(fails ? `\n${fails} FAIL(s)` : '\nall green'); process.exit(fails?1:0); }

/* ==========================================================================
   D. DESIGN QUESTION -- which shading rule gets the sign right?
   The sloop is sailed to steady state at TWA 45 / 90 / 160 with NO shading
   (so the state is the same for both rules), then each rule's pressure
   factors are applied to that one state and the drive compared with none.
     Rule A -- the apparent-wind line, exactly as §15 words it: k shades j when
               bands overlap, k is upwind of j along the apparent wind within
               3 LWL, and within half k's span of the line through j.
     Rule B -- "aft sail shades forward sail when the apparent wind is abaft
               the beam": k shades j when bands overlap and k is AFT of j,
               weighted by how far abaft the beam the wind is.
   Both use §15's strength, 1 - 0.6*overlapFraction*h_k. Bands are the
   proposed sloop bands below, injected into a cloned ship only here.
   ========================================================================== */
const SLOOP_BANDS = { main:[1.2, 8.5], staysail:[0.8, 7.4], jib:[0.8, 8.9] };   // [assumed]
function bandOf(d){ return (d.zLo===undefined||d.zHi===undefined) ? null : {lo:d.zLo, hi:d.zHi}; }
function ruleA(state, wind, cfg){
  const defs = SIM.sailDefs(cfg), out = {}, why = [];
  const afu = wind.appFlowU/wind.AWS, afv = wind.appFlowV/wind.AWS;
  const reach = 3*SIM.hull(cfg).LWL;
  for (const j of defs) { const bj = bandOf(j); if (!bj) continue; let f = 1;
    for (const k of defs) { if (k===j) continue; const bk = bandOf(k); if (!bk) continue;
      const ov = Math.min(bj.hi,bk.hi)-Math.max(bj.lo,bk.lo); if (!(ov>0)) continue;
      const dx = k.xCE - j.xCE, along = dx*afu, up = -along;
      if (!(up>0) || up>reach) continue;
      const lat = Math.hypot(dx - along*afu, -along*afv);
      if (lat > 0.5*SIM.sailType(k).span(k)) continue;
      const g = 0.6*Math.min(1, ov/(bj.hi-bj.lo))*SIM.setFraction(state, k);
      f *= 1 - g; why.push(`${k.id}->${j.id} ${fmt(100*g,0)}%`);
    }
    if (f!==1) out[j.id] = f; }
  return { f: out, why };
}
function ruleB(state, wind, cfg, ramp){
  const defs = SIM.sailDefs(cfg), out = {}, why = [];
  const awa = Math.abs(wind.AWA);                          // deg, 0 = head to wind
  const w = ramp ? Math.max(0, -Math.cos(awa*Math.PI/180)) : (awa > 90 ? 1 : 0);
  if (w > 0) for (const j of defs) { const bj = bandOf(j); if (!bj) continue; let f = 1;
    for (const k of defs) { if (k===j || !(k.xCE < j.xCE)) continue; const bk = bandOf(k); if (!bk) continue;
      const ov = Math.min(bj.hi,bk.hi)-Math.max(bj.lo,bk.lo); if (!(ov>0)) continue;
      const g = 0.6*w*Math.min(1, ov/(bj.hi-bj.lo))*SIM.setFraction(state, k);
      f *= 1 - g; why.push(`${k.id}->${j.id} ${fmt(100*g,0)}%`);
    }
    if (f!==1) out[j.id] = f; }
  return { f: out, why };
}
if (argv.includes('--design')) {
  console.log('\n=== ROUND-18 CHECK D - design question: apparent-wind line vs aft-shades-forward ===');
  const base = SIM.cloneConfig(SIM.defaultConfig());
  base.TWS = 6; base.TWD = 0; base.liveWind = false;
  base.kShade = 0;   // the state is sailed in clear air, as it was when this was decided
  const banded = SIM.cloneConfig(base);
  for (const d of banded.ship.sails) if (SLOOP_BANDS[d.id]) { d.zLo = SLOOP_BANDS[d.id][0]; d.zHi = SLOOP_BANDS[d.id][1]; }
  const points = [ ['beat', 45, 0.15, 0.20], ['reach', 90, 0.55, 0.55], ['run', 160, 0.90, 0.90] ];
  for (const [name, twa, eM, eW] of points) {
    const built = box.setupSteady(base, { tackSign:1, targetTWA:twa, eM, eWorking:eW, eLazy:1.0 });
    for (let n=0;n<Math.round(90/base.dt);n++) SIM.step(built.state, built.controls, base.dt, base);
    const st = built.state;
    const wind = SIM.computeWind(st, base, st.tSim);
    const rig = SIM.rigView(st, banded);
    const drive = fac => { let tot = 0; const per = {};
      for (const d of SIM.sailDefs(banded)) {
        const r = SIM.computeSailForces(JSON.parse(JSON.stringify(st.sails[d.id])), wind, banded, st.phi, d, fac[d.id] === undefined ? 1 : fac[d.id], rig);
        per[d.id] = r.Fx; tot += r.Fx; }
      return { tot, per }; };
    const none = drive({}), A = ruleA(st, wind, banded), B = ruleB(st, wind, banded, false), Br = ruleB(st, wind, banded, true);
    const dA = drive(A.f), dB = drive(B.f), dBr = drive(Br.f);
    const pct = x => `${x.tot>=none.tot?'+':''}${fmt(100*(x.tot/none.tot-1),1)}%`;
    const perS = x => Object.keys(x.per).map(k=>`${k} ${fmt(x.per[k],0)}`).join(' · ');
    console.log(`  -- ${name}: TWA ${twa}, steady AWA ${fmt(wind.AWA,1)} deg, AWS ${fmt(wind.AWS,2)} m/s, SOG ${fmt(Math.hypot(st.u,st.v)/0.5144,2)} kn`);
    console.log(`     no shading           drive ${fmt(none.tot,0)} N   (${perS(none)})`);
    console.log(`     A  apparent-wind line drive ${fmt(dA.tot,0)} N ${pct(dA)}  shades: ${A.why.join(', ')||'nothing'}`);
    console.log(`     B  aft->fwd, step 90 drive ${fmt(dB.tot,0)} N ${pct(dB)}  shades: ${B.why.join(', ')||'nothing'}`);
    console.log(`     B' aft->fwd, -cos ramp drive ${fmt(dBr.tot,0)} N ${pct(dBr)}  shades: ${Br.why.join(', ')||'nothing'}`);
  }
  // where Rule A flips on a beat: the lateral test against AWA, per pair
  console.log('  -- Rule A on a beat, which pairs pass the lateral test as AWA varies (no shading = blank):');
  const st0 = SIM.createState({ psi:0, u:2 }, banded);
  for (const awa of [15, 20, 25, 30, 35, 45, 60, 75]) {
    const a = awa*Math.PI/180, AWS = 6;
    const wind = { AWA: awa, AWS, appFlowU: -AWS*Math.cos(a), appFlowV: -AWS*Math.sin(a) };
    console.log(`     AWA ${String(awa).padStart(3)}: ${ruleA(st0, wind, banded).why.join(', ') || '-'}`);
  }
}

/* ==========================================================================
   S. SHADING ACCEPTANCE (round 18 step 3) -- the rule as built in index.html
   Each row sails a ship to steady state with the shipped physics, then reads
   the drive two ways AT THAT ONE STATE: with the shading the step used, and
   with an explicit clear-air factor of 1. Where a row also compares SOG, the
   clear-air run sets kShade = 0 in its own config -- a comparison run made by
   this check, never by a scenario.
   ========================================================================== */
function sail(shipId, { tws=6, twa, eM, eW, eLazy=1.0, settle=120, kShade, prep }){
  const cfg = SIM.cloneConfig(SIM.defaultConfig());
  if (shipId !== 'sloop') cfg.ship = SIM.cloneShip(SIM.SHIPS[shipId]);
  cfg.TWS = tws; cfg.TWD = 0; cfg.liveWind = false;
  if (kShade !== undefined) cfg.kShade = kShade;
  const built = box.setupSteady(cfg, { tackSign:1, targetTWA:twa, eM, eWorking:eW, eLazy });
  if (prep) prep(built.state, cfg);
  const n = Math.round(settle/cfg.dt), last = Math.round(30/cfg.dt); let sog = 0;
  for (let i=0;i<n;i++){ SIM.step(built.state, built.controls, cfg.dt, cfg);
    if (i >= n-last) sog += Math.hypot(built.state.u, built.state.v)/0.5144; }
  return { st: built.state, cfg, sog: sog/last };
}
// per-sail drive at one state; clear = true forces a factor of 1 on every sail
function drives(st, cfg, clear, override){
  const wind = SIM.computeWind(st, cfg, st.tSim);
  const sails = JSON.parse(JSON.stringify(st.sails));
  if (override) override(sails);
  const rig = { sails, config: cfg };
  const per = {}, shade = {}; let tot = 0;
  for (const d of SIM.sailDefs(cfg)) {
    const r = SIM.computeSailForces(JSON.parse(JSON.stringify(sails[d.id])), wind, cfg, st.phi, d, clear ? 1 : undefined, rig);
    per[d.id] = r.Fx; shade[d.id] = r.shade; tot += r.Fx;
  }
  return { per, shade, tot, AWA: wind.AWA };
}
const pc = (a, b) => `${a>=b?'+':''}${fmt(100*(a/b-1),1)}%`;
const fN = x => fmt(x, 0);

console.log('\n=== ROUND-18 CHECK S1 - sloop beat: the headsails and main together must NOT lose drive ===');
{
  const opt = { twa:45, eM:0.15, eW:0.20, settle:90 };
  const r = sail('sloop', opt), r0 = sail('sloop', { ...opt, kShade:0 });
  const sh = drives(r.st, r.cfg, false), cl = drives(r.st, r.cfg, true);
  console.log(`  steady AWA ${fmt(sh.AWA,1)} deg; pressure kept ${Object.entries(sh.shade).map(([k,v])=>`${k} ${fmt(v,3)}`).join(' · ')}`);
  check('total drive, shaded vs clear air at the same state, not lower', sh.tot >= cl.tot - 1e-9,
        `${fN(sh.tot)} N vs ${fN(cl.tot)} N (${pc(sh.tot, cl.tot)})`);
  check('steady SOG, shaded run vs kShade = 0 run, within 0.5%', Math.abs(r.sog/r0.sog - 1) <= 0.005,
        `${fmt(r.sog,3)} vs ${fmt(r0.sog,3)} kn`);
}

console.log('\n=== ROUND-18 CHECK S2 - sloop run: the main must measurably shade the headsails ===');
for (const twa of [160, 180]) {
  const opt = { twa, eM:0.9, eW:0.9, settle:120 };
  const r = sail('sloop', opt), r0 = sail('sloop', { ...opt, kShade:0 });
  const sh = drives(r.st, r.cfg, false), cl = drives(r.st, r.cfg, true);
  const hsS = sh.per.staysail + sh.per.jib, hsC = cl.per.staysail + cl.per.jib;
  // the staysail's own share of the jib's shadow: the jib with the staysail struck
  const noStay = drives(r.st, r.cfg, false, sails => { sails.staysail.h = 0; });
  const stayOnJib = 1 - sh.shade.jib/noStay.shade.jib;
  console.log(`  -- TWA ${twa}: steady AWA ${fmt(sh.AWA,1)} deg, clews main ${fmt(r.st.sails.main.delta,1)} · staysail ${fmt(r.st.sails.staysail.delta,1)} · jib ${fmt(r.st.sails.jib.delta,1)} deg`);
  console.log(`     pressure kept: staysail ${fmt(sh.shade.staysail,3)} · jib ${fmt(sh.shade.jib,3)} (jib with the staysail struck: ${fmt(noStay.shade.jib,3)}) · main ${fmt(sh.shade.main,3)}`);
  console.log(`     drive N, shaded / clear: main ${fN(sh.per.main)}/${fN(cl.per.main)} · staysail ${fN(sh.per.staysail)}/${fN(cl.per.staysail)} · jib ${fN(sh.per.jib)}/${fN(cl.per.jib)} · total ${fN(sh.tot)}/${fN(cl.tot)} (${pc(sh.tot, cl.tot)})`);
  console.log(`     the staysail shades the jib: ${fmt(100*stayOnJib,1)}% off the jib's pressure on top of the main's shadow`);
  console.log(`     steady SOG shaded ${fmt(r.sog,3)} kn vs kShade = 0 ${fmt(r0.sog,3)} kn (${pc(r.sog, r0.sog)})`);
  check(`TWA ${twa}: headsail drive at least 10% below clear air`, hsS <= 0.9*hsC, `${fN(hsS)} vs ${fN(hsC)} N (${pc(hsS, hsC)})`);
  check(`TWA ${twa}: the main itself is not shaded (nothing aft of it)`, sh.shade.main === 1, fmt(sh.shade.main,3));
}

console.log("\n=== ROUND-18 CHECK S3 - sloop goose-winged: TWA 170 and 180, heading up, and the main by the lee ===");
{
  /* Goose-winging, done the way a crew does it and nothing else: on a run
     with the jib on the main's side, let the lee (port) sheet fly, haul the
     weather (starboard) sheet at the haul rate until the clew is past the
     unstable point (the chord pointing into the wind) -- or the sheet is
     home -- hold 2 s, then ease the weather sheet to 0.8 and let the wind
     carry the clew out. Same autopilot, same trim on everything else. */
  const HAUL = 0.25, EASE = 0.5;   // ease-units/s, the handling defaults
  function runSloop(twa, goose, extraSec, onStep, instantEase){
    const cfg = SIM.cloneConfig(SIM.defaultConfig());
    cfg.TWS = 6; cfg.TWD = 0; cfg.liveWind = false;
    const built = box.setupSteady(cfg, { tackSign:1, targetTWA:twa, eM:0.9, eWorking:0.9, eLazy:1.0 });
    const st = built.state, ctl = built.controls, dt = cfg.dt;
    for (let n=0;n<Math.round(120/dt);n++) SIM.step(st, ctl, dt, cfg);
    let phase = goose ? 'haul' : 'done', hold = 0, pastAt = null;
    const log = [];
    for (let n=0;n<Math.round(extraSec/dt);n++){
      if (phase === 'haul') {
        SIM.setSheet(st, cfg, 'jib', 'port', 1.0);
        const es = SIM.getSheet(st, cfg, 'jib', 'stbd');
        // past the unstable point: the clew is to windward of the chord that
        // points into the wind, i.e. the shorter rotation now goes OUT
        // the unstable point is the chord pointing straight into the wind,
        // 180 deg from the flow-aligned one (-AWA); past it the shorter
        // rotation to the flow-aligned chord goes OUT
        const w = SIM.computeWind(st, cfg, st.tSim), d = st.sails.jib.delta;
        const past = d > 0 && wrapD(-w.AWA - d) > 0;
        // a crew hauls it home; `past` is only recorded, for the report
        if (past && pastAt === null) pastAt = { d, t: n*dt };
        if (es <= 0) { phase = 'hold'; hold = 0; }
        else SIM.setSheet(st, cfg, 'jib', 'stbd', Math.max(0, es - HAUL*dt));
      } else if (phase === 'hold') {
        hold += dt; if (hold >= 2) phase = 'ease';
      } else if (phase === 'ease') {
        const es = SIM.getSheet(st, cfg, 'jib', 'stbd');
        if (es >= 0.8) phase = 'done'; else SIM.setSheet(st, cfg, 'jib', 'stbd', instantEase ? 0.8 : Math.min(0.8, es + EASE*dt));
      }
      if (onStep) onStep(st, ctl, cfg, phase, n*dt);
      SIM.step(st, ctl, dt, cfg);
      const L = st._last;
      log.push({ t:n*dt, phase, jibD: st.sails.jib.delta, mainD: st.sails.main.delta,
        jibFx: L.sailF.jib.Fx, tot: L.sailFx, sog: Math.hypot(st.u,st.v)/0.5144,
        twa: wrapD(cfg.TWD - r2d(st.psi)), AWA: L.wind.AWA, jibAback: !!st.sails.jib.aback,
        jibShade: L.sailF.jib.shade });
    }
    return { log, st, cfg, pastAt };
  }
  const wrapD = d => ((d + 180) % 360 + 360) % 360 - 180;
  const mean = (a, f) => a.reduce((x, s) => x + f(s), 0)/a.length;

  // --- goose-winged vs same side, TWA 170 and 180 ---
  for (const twa of [170, 180]) {
    const same = runSloop(twa, false, 180), goose = runSloop(twa, true, 180);
    const tail = r => r.log.filter(s => s.t >= 120);          // last 60 s
    const ts = tail(same), tg = tail(goose);
    const holds = tg.every(s => s.jibD > 0);
    const outAt = goose.log.find(s => s.phase === 'done');
    console.log(`  -- TWA ${twa}`);
    const w0 = goose.log[0];
    console.log(`     procedure: unstable point at clew ${fmt(wrapD(180 - w0.AWA),1)} deg; weather sheet home after ${fmt(goose.log.find(s=>s.phase!=='haul')?.t ?? NaN,1)} s puts the clew at ${fmt(goose.log.find(s=>s.phase!=='haul')?.jibD ?? NaN,1)} deg (${goose.pastAt ? `past the point at t ${fmt(goose.pastAt.t,1)} s` : 'NEVER past the point'}); eased to 0.8 by t ${fmt(outAt?.t ?? NaN,1)} s`);
    console.log(`     goose-winged: clew ${fmt(mean(tg,s=>s.jibD),1)} deg (main ${fmt(mean(tg,s=>s.mainD),1)}), holds the last 60 s: ${holds?'YES':'NO'} · jib pressure kept ${fmt(mean(tg,s=>s.jibShade),3)} · jib aback ${fmt(100*mean(tg,s=>s.jibAback?1:0),0)}%`);
    console.log(`     jib drive ${fmt(mean(tg,s=>s.jibFx),0)} N goose-winged vs ${fmt(mean(ts,s=>s.jibFx),0)} N on the main's side (kept ${fmt(mean(ts,s=>s.jibShade),3)})`);
    console.log(`     total sail drive ${fmt(mean(tg,s=>s.tot),0)} vs ${fmt(mean(ts,s=>s.tot),0)} N · SOG ${fmt(mean(tg,s=>s.sog),3)} vs ${fmt(mean(ts,s=>s.sog),3)} kn (${fmt(100*(mean(tg,s=>s.sog)/mean(ts,s=>s.sog)-1),1)}%)`);
    if (!holds) {
      // diagnostic only: the same, but the weather sheet let run to 0.8 in one step -- faster than the 0.5/s ease rate allows
      const gi = runSloop(twa, true, 180, null, true), ti = tail(gi);
      console.log(`     DIAGNOSTIC, weather sheet let run in one step (not reachable at the ease rate): clew ${fmt(mean(ti,s=>s.jibD),1)} deg, holds ${ti.every(s=>s.jibD>0)?'YES':'NO'}, jib drive ${fmt(mean(ti,s=>s.jibFx),0)} N, SOG ${fmt(mean(ti,s=>s.sog),3)} kn`);
      const trace = gi.log.length ? goose.log.filter(s=>s.t>=3.5&&s.t<=8 && Math.round(s.t*120)%30===0).map(s=>`t${fmt(s.t,2)} ${fmt(s.jibD,1)}`).join(' ') : '';
      console.log(`     why it falls back at the ease rate -- clew while easing: ${trace}`);
    }
    check(`TWA ${twa}: the goose-winged jib holds out to windward with the sheets alone`, holds, `clew ${fmt(Math.min(...tg.map(s=>s.jibD)),1)}-${fmt(Math.max(...tg.map(s=>s.jibD)),1)} deg`);
    check(`TWA ${twa}: goose-winged is not flagged aback (aback comes from incidence)`, mean(tg,s=>s.jibAback?1:0) === 0, `${fmt(100*mean(tg,s=>s.jibAback?1:0),0)}%`);
  }

  // --- from how far off dead aft can the sheets alone get the clew across? ---
  {
    const rows = [];
    for (const twa of [175, 170, 167, 165, 162, 160, 155]) {
      const g = runSloop(twa, true, 60);
      const tl = g.log.filter(s => s.t >= 40);
      rows.push(`${twa}: ${tl.every(s => s.jibD > 0) ? 'holds' : 'falls back'} (unstable ${fmt(wrapD(180 - g.log[0].AWA),0)}, sheet reaches +20)`);
    }
    console.log(`  -- goose-winging by the sheets alone, by TWA: ${rows.join(' · ')}`);
  }

  // --- heading up from 180, goose-winged: where does the jib come across? ---
  {
    const RATE = 0.25;     // deg/s of autopilot target, slow enough to stay quasi-steady
    let crossed = null, first = null;
    const r = runSloop(180, true, 60 + 70/RATE, (st, ctl, cfg, phase, t) => {
      if (t >= 60) ctl.autopilot.targetTWA = Math.max(110, 180 - RATE*(t-60));
      if (t >= 60 && crossed === null && st.sails.jib.delta < 0) {
        crossed = { twa: Math.abs(wrapD(cfg.TWD - r2d(st.psi))), AWA: SIM.computeWind(st, cfg, st.tSim).AWA, t };
      }
    });
    const before = r.log.filter(s => s.t >= 60 && (crossed === null || s.t < crossed.t));
    first = before.find(s => s.jibShade < 1 || s.jibAback);
    const collapse = before.find(s => s.jibFx < 0.25*mean(r.log.filter(x=>x.t>=50&&x.t<60), x=>x.jibFx));
    console.log(`  -- heading up from TWA 180 at ${RATE} deg/s, goose-winged`);
    console.log(`     jib comes across at TWA ${crossed ? fmt(crossed.twa,1) : 'never (to 110)'}${crossed ? `, AWA ${fmt(crossed.AWA,1)}` : ''}  [expectation, assumed: ~155-160]`);
    console.log(`     its drive first falls below a quarter of the dead-run value at TWA ${collapse ? fmt(Math.abs(collapse.twa),1) : '-'}`);
    const pick = [175,165,155,145,135,125].map(x => before.find(s => Math.abs(s.twa) <= x)).filter(Boolean);
    console.log(`     on the way: ${pick.map(s=>`TWA ${fmt(Math.abs(s.twa),0)}: clew ${fmt(s.jibD,0)}, drive ${fmt(s.jibFx,0)} N${s.jibAback?' ABACK':''}`).join(' · ')}`);
  }

  // --- the main by the lee: how far past dead aft before the boom comes across ---
  {
    const RATE = 0.25;
    let cross = null;
    const r = runSloop(170, false, 30 + 100/RATE, (st, ctl, cfg, phase, t) => {
      if (t >= 30) ctl.autopilot.targetTWA = Math.min(270, 170 + RATE*(t-30));
      if (cross === null && st.sails.main.delta > 0) {
        const twa = wrapD(cfg.TWD - r2d(st.psi));
        cross = { twa, past: 180 - Math.abs(twa), AWA: SIM.computeWind(st, cfg, st.tSim).AWA, t };
      }
    });
    console.log(`  -- main by the lee: steering from TWA 170 through dead aft at ${RATE} deg/s, main eased 0.9`);
    console.log(`     boom comes across ${cross ? `${fmt(cross.past,1)} deg by the lee (TWA ${fmt(cross.twa,1)}, AWA ${fmt(cross.AWA,1)})` : 'NEVER within 90 deg by the lee'}  [expectation, assumed: ~15-20]`);
    const by = [5,15,30,45,60].map(x => r.log.find(s => s.t >= 30 && s.twa < 0 && 180 - Math.abs(s.twa) >= x)).filter(Boolean);
    console.log(`     on the way: ${by.map(s=>`${fmt(180-Math.abs(s.twa),0)} by the lee: boom ${fmt(s.mainD,0)}, AWA ${fmt(s.AWA,0)}`).join(' · ')}`);
  }
}

console.log('\n=== ROUND-18 CHECK S4 - schooner row (v): running under square canvas, main blanketing the fore ===');
{
  /* Proposed criterion (round 18; the spec gave none):
       1. the fore-mast canvas (foresail + fore topsail) loses 25-60% of its
          clear-air drive at the same state -- the 150 m2 main sits dead
          upwind of the fore's 150 m2, so well under a quarter means the
          shadow is not there, and more than kShade (60%) means it has been
          double-counted;
       2. the fore topsail keeps at least half its clear-air drive -- it is
          set above the foresail and spread across both sides of the ship,
          and drawing in the main's lee is what square canvas forward is for;
       3. the main loses nothing (nothing is aft of it);
       4. steady SOG below the same run with kShade = 0. */
  const prep = (st, cfg) => { SIM.setHoist(st, cfg, 'foreTopsail', 1); SIM.braceTo(st, cfg, 'foreTopsail', 0); };
  const opt = { twa:170, eM:0.9, eW:0.9, settle:240, prep };
  const r = sail('topsailSchooner', opt), r0 = sail('topsailSchooner', { ...opt, kShade:0 });
  const sh = drives(r.st, r.cfg, false), cl = drives(r.st, r.cfg, true);
  const fS = sh.per.foresail + sh.per.foreTopsail, fC = cl.per.foresail + cl.per.foreTopsail;
  const loss = 1 - fS/fC, topKeep = sh.per.foreTopsail/cl.per.foreTopsail;
  console.log(`  steady AWA ${fmt(sh.AWA,1)} deg; yard ${fmt(r.st.sails.foreTopsail.psiY,1)} deg; clews main ${fmt(r.st.sails.mainsail.delta,1)} · foresail ${fmt(r.st.sails.foresail.delta,1)} deg`);
  console.log(`  pressure kept: ${Object.entries(sh.shade).map(([k,v])=>`${k} ${fmt(v,3)}`).join(' · ')}`);
  console.log(`  drive N shaded/clear: ${Object.keys(sh.per).map(k=>`${k} ${fN(sh.per[k])}/${fN(cl.per[k])}`).join(' · ')}`);
  check('fore-mast canvas loses 25-60% of its clear-air drive', loss >= 0.25 && loss <= 0.60, `${fN(fS)} vs ${fN(fC)} N, loss ${fmt(100*loss,1)}%`);
  check('fore topsail keeps at least half its clear-air drive', topKeep >= 0.5, `${fmt(100*topKeep,1)}%`);
  check('the main loses nothing', sh.shade.mainsail === 1, fmt(sh.shade.mainsail,3));
  check('steady SOG below the kShade = 0 run', r.sog < r0.sog, `${fmt(r.sog,3)} vs ${fmt(r0.sog,3)} kn (${pc(r.sog, r0.sog)})`);
}

console.log(fails ? `\n${fails} FAIL(s)` : '\nall green');
process.exitCode = fails ? 1 : 0;
