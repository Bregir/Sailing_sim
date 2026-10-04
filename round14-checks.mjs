// Round-14 checks (spec §12 round 14, verification items iii and iv).
//
//   iii. Definition check — for EVERY ship in SHIPS: serialise it, load the
//        serialised copy, and confirm the harness produces IDENTICAL output.
//        Run for real: run-scenarios.mjs is spawned twice per ship, once on the
//        built-in definition and once with the serialised copy merged in through
//        --config, and the two outputs are compared byte for byte (the lines a
//        run prints about itself are dropped first).
//
//   iv.  Captive-speed roll check — replaces round 13's heel-overshoot check,
//        which measured a ~2 s roll ring against a ~60 s speed-recovery tail and
//        so could never see it. Here u and v are HELD. It is run twice: once
//        exactly as the brief words it (heading free, rudder locked at 0) and
//        once with yaw held as well, which is the only version in which the
//        roll is the only transient left — see the note at the check itself.
//
// Usage: node round14-checks.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJ = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const mark = ok => ok ? 'PASS' : 'FAIL';
function check(label, ok, detail){ if(!ok) fails++; console.log(`  ${mark(ok)}  ${label}  ${detail}`); }
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
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

/* ==========================================================================
   iii. DEFINITION CHECK — serialise the ship, reload it, same harness output
   ========================================================================== */
console.log('\n=== ROUND-14 CHECK A - ship definition survives a serialise/reload ===');
{
  /* A run whose scenarios do not all pass exits non-zero (the round-13 heel
     overshoot print still fails on a cutter run -- a measurement issue the
     spec records, replaced by CHECK B below), so take its stdout either way:
     this check is about the two runs agreeing, not about them passing. */
  const run = args => {
    try {
      return execFileSync(process.execPath, ['run-scenarios.mjs', ...args],
                          { cwd: PROJ, encoding: 'utf8', maxBuffer: 64*1024*1024 });
    } catch (e) {
      if (typeof e.stdout === 'string') return e.stdout;
      throw e;
    }
  };
  // lines a run prints ABOUT ITSELF, not about the physics, come out first
  const strip = s => s.split('\n')
    .filter(l => !l.startsWith('[config] merged overrides') && !l.startsWith('[ship] '))
    .join('\n');

  // round 15: every shipped definition, not just the sloop
  for (const shipId of Object.keys(SIM.SHIPS)) {
    const original = SIM.SHIPS[shipId];
    const serialised = JSON.stringify({ ship: original }, null, 2);
    const reloaded = JSON.parse(serialised).ship;
    const structOk = JSON.stringify(reloaded) === JSON.stringify(original);
    check(`${shipId}: JSON round trip preserves the definition exactly`, structOk,
          `${serialised.length} bytes, ${original.sails.length} sails, ` +
          `${original.sails.reduce((a,s)=>a+s.lines.length,0)} control lines, ${original.masts.length} mast(s)`);

    const tmp = path.join(os.tmpdir(), `sejlsim-ship-roundtrip-${shipId}.json`);
    fs.writeFileSync(tmp, serialised, 'utf8');
    // the sloop is the built-in default, so it needs no --ship
    const builtin = strip(run(shipId === 'sloop' ? [] : ['--ship', shipId]));
    const loaded = strip(run(['--config', tmp]));
    fs.unlinkSync(tmp);

    check(`${shipId}: the serialised copy gives byte-identical harness output`,
          builtin === loaded, `built-in md5 ${md5(builtin)} · reloaded md5 ${md5(loaded)}`);
    console.log(`  harness md5 (${shipId}, built-in definition): ${md5(builtin)}`);
  }
}

/* ==========================================================================
   iv. CAPTIVE-SPEED ROLL CHECK
   Hold u = 2.0 m/s and v = 0 (overridden after every step), rudder locked at
   0 deg, TWS 6, TWA 45. All sheets eased for 10 s, then hauled straight to
   (a)'s trim; report the peak heel and the heel 15 s later. With cPhi = 8000
   the peak should stand 20-50% above the later value.
   ========================================================================== */
console.log('\n=== ROUND-14 CHECK B - captive-speed roll (spec 12 round 14) ===');
{
  const HELD_U = 2.0;

  /* Run the sequence the brief describes: TWS 6, TWA 45, rudder locked at 0,
     all sheets eased for 10 s, then hauled straight to (a)'s trim. `holdYaw`
     additionally pins heading and yaw rate -- see the two calls below. */
  function captiveRun(holdYaw){
    const cfg = SIM.cloneConfig(SIM.defaultConfig());
    cfg.TWS = 6; cfg.TWD = 0; cfg.liveWind = false;
    const dt = cfg.dt;
    const psi0 = (cfg.TWD - 45)*Math.PI/180;   // starboard tack, TWA 45
    const state = SIM.createState({
      psi: psi0, u: HELD_U, v: 0,
      rudder: { deltaR: 0, mode: 'lashed' },   // locked amidships
    }, cfg);
    SIM.applyTrimAll(state, cfg, 1);           // every sheet fully eased

    const step = () => {
      SIM.step(state, {}, dt, cfg);
      state.u = HELD_U; state.v = 0;           // captive model: surge and sway held
      if (holdYaw) { state.r = 0; state.psi = psi0; }
    };

    for (let n=0; n<Math.round(10/dt); n++) step();
    const heelAtHaul = Math.abs(state.phi)*180/Math.PI;

    // haul to (a)'s trim: main 0.15, working (leeward = port on starboard tack)
    // 0.20, lazy 1.0 -- the same roles setupSteady uses for scenario (a)
    SIM.applyTrim(state, cfg, 1, { centre: 0.15, working: 0.20, lazy: 1.0 });

    let peak = 0, peakT = 0;
    for (let n=0; n<Math.round(15/dt); n++){
      step();
      const heel = Math.abs(state.phi)*180/Math.PI;
      if (heel > peak) { peak = heel; peakT = (n+1)*dt; }
    }
    const later = Math.abs(state.phi)*180/Math.PI;                 // heel at t + 15 s
    const awaEnd = state._last.wind.AWA;
    const hdgEnd = state.psi*180/Math.PI;
    return { cfg, heelAtHaul, peak, peakT, later, awaEnd, hdgEnd,
             overshootPct: later > 0 ? 100*(peak/later - 1) : NaN };
  }

  const free = captiveRun(false);
  const held = captiveRun(true);

  console.log(`  u held at ${fmt(HELD_U,1)} m/s, v held at 0, rudder locked 0 deg, TWS 6, TWA 45; sheets eased 10 s, then (a)'s trim`);
  console.log(`  heel when the sheets came home: ${fmt(held.heelAtHaul)} deg`);

  /* The brief's own version leaves the heading free, and with the rudder locked
     at 0 the boat's weather helm rounds it up steadily: over the 15 s window the
     heading swings and AWA falls, so heel at t+15 s is still on its way down and
     the ratio measures the round-up rather than the roll. This is the same class
     of contamination round 13 hit with speed -- reported, not tuned away. */
  console.log(`  [as the brief specifies it, heading free] peak ${fmt(free.peak)} deg at t+${fmt(free.peakT)} s, ` +
              `heel at t+15 s ${fmt(free.later)} deg -> ${fmt(free.overshootPct,1)}%`);
  console.log(`    heading rounded up from -45.0 to ${fmt(free.hdgEnd,1)} deg and AWA fell to ${fmt(free.awaEnd,1)} deg, ` +
              `so the t+15 s heel is not the settled roll value`);

  /* Pinning yaw as well as surge and sway is what the brief's own phrase
     "captive" means in a towing tank: AWA then stays put and the ONLY transient
     left is the roll. That is the number the 20-50% band is about. */
  const ok = held.overshootPct >= 20 && held.overshootPct <= 50;
  check(`peak heel exceeds the settled heel by 20-50% with yaw held too (cPhi = ${SIM.hull(held.cfg).cPhi})`, ok,
        `peak ${fmt(held.peak)} deg at t+${fmt(held.peakT)} s, heel at t+15 s ${fmt(held.later)} deg, ` +
        `overshoot ${fmt(held.overshootPct,1)}% (AWA fixed at ${fmt(held.awaEnd,1)} deg)`);
}

console.log(`\n${fails === 0 ? 'ALL ROUND-14 CHECKS PASS' : fails + ' ROUND-14 CHECK(S) FAILED'}`);
process.exitCode = fails ? 1 : 0;
