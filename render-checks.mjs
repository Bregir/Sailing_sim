// Round-6 render checks. Loads the page's inline script into a Node vm exactly
// as run-scenarios.mjs does, then asserts the numbers the canvas actually
// paints: SIM.render.worldToScreen for the heading-up camera, and
// SIM.render.boatGeometry for every part that swings (draw() builds its paths
// from boatGeometry and nothing else -- no ctx.rotate on any delta remains).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const PROJ = path.dirname(fileURLToPath(import.meta.url));
// Optional: point SEJLSIM_ROUND5 at a directory holding index.round5.html to get
// the round-5 column in check 1 alongside the round-6 one.
const ROUND5 = process.env.SEJLSIM_ROUND5 ? `${process.env.SEJLSIM_ROUND5}/index.round5.html` : null;

function loadSim(htmlPath){
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  const noop = () => {};
  const fakeEl = () => ({
    value:'', checked:false, style:{}, textContent:'', innerHTML:'',
    width:800, height:600, clientWidth:800, clientHeight:600, dataset:{},
    addEventListener: noop, appendChild: noop, getContext: () => null,
    getBoundingClientRect: () => ({left:0,top:0,width:0,height:0}),
    classList: { add:noop, remove:noop, toggle:noop }, querySelectorAll: () => [],
  });
  const sandbox = {
    console,
    window: { addEventListener: noop, innerWidth:800, innerHeight:600 },
    document: { getElementById: () => fakeEl(), createElement: () => fakeEl(), addEventListener: noop, body: fakeEl() },
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    performance: { now: () => 0 }, alert: noop,
  };
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: htmlPath });
  return sandbox;
}

const f2 = n => Number(n).toFixed(1);
const pt = p => `(${f2(p[0])}, ${f2(p[1])})`;
const mark = ok => ok ? 'PASS' : 'FAIL';
let fails = 0;
function check(label, ok, detail){ if(!ok) fails++; console.log(`  ${mark(ok)}  ${label}  ${detail}`); }

/* ---- 1. heading-up camera transform (spec 12/6) ---- */
console.log('\n=== CHECK 1 - heading-up camera transform (spec 12 item 6) ===');
console.log('  camera at origin, psi = 90 deg (heading east), scale 10, centre (400,300)');
const camCases = [['round 6', `${PROJ}/index.html`]];
if (ROUND5 && fs.existsSync(ROUND5)) camCases.unshift(['round 5', ROUND5]);
else console.log('  (round-5 column skipped: set SEJLSIM_ROUND5 to a directory holding index.round5.html)');
for (const [tag, file] of camCases) {
  const S = loadSim(file).SIM;
  const cam = { x:0, y:0, cx:400, cy:300, scale:10, headingUp:true, psi:Math.PI/2 };
  const ahead = S.render.worldToScreen(cam, 10, 0);    // 10 m east = 10 m ahead
  const stbd  = S.render.worldToScreen(cam, 0, -10);   // 10 m south = 10 m to starboard
  const okA = Math.abs(ahead[0]-400)<1e-9 && Math.abs(ahead[1]-200)<1e-9;
  const okS = Math.abs(stbd[0]-500)<1e-9 && Math.abs(stbd[1]-300)<1e-9;
  console.log(`  [${tag}] 10 m ahead, world (10, 0)  -> ${pt(ahead)}   expect (400.0, 200.0)  above the boat   ${mark(okA)}`);
  console.log(`  [${tag}] 10 m stbd,  world (0, -10) -> ${pt(stbd)}   expect (500.0, 300.0)  right of the boat ${mark(okS)}`);
  if (tag === 'round 6' && !(okA && okS)) fails++;
  // directions must agree with positions: bearing psi+90 (starboard) points right
  const relDeg = S.render.worldAngleToScreen(cam, 90+90)*180/Math.PI;
  console.log(`  [${tag}] worldAngleToScreen(bearing psi+90) = ${f2(relDeg)} deg  expect +90 (points right)`);
}

/* ---- everything below is round 6 only ---- */
const box = loadSim(`${PROJ}/index.html`);
const SIM = box.SIM;
const config = SIM.defaultConfig();
const scale = 20;

function geomFor(over){
  const st = SIM.createState(over||{});
  return SIM.render.boatGeometry(st, config, scale);
}

console.log('\n=== CHECK 2 - positive delta swings to starboard (+x on screen) ===');
for (const d of [30, -30]) {
  const g = geomFor({ sails:{ main:{delta:d}, jib:{delta:d}, staysail:{delta:d} } });
  const clewMain = g.sails.main.clew;     // aft end of the boom / gaff quad
  const clewJib  = g.sails.jib.clew;
  const clewStay = g.sails.staysail.clew;
  const want = d > 0 ? 'starboard, x > 0' : 'port, x < 0';
  const ok = (d>0) === (clewMain[0]>0) && (d>0) === (clewJib[0]>0) && (d>0) === (clewStay[0]>0);
  check(`delta = ${d>0?'+':''}${d} deg -> ${want}`,
        ok, `main clew ${pt(clewMain)}  jib clew ${pt(clewJib)}  staysail clew ${pt(clewStay)}`);
}

console.log('\n=== CHECK 3 - rudder blade and tiller (spec 8, round-6 item 4) ===');
for (const dR of [20, -20]) {
  const g = geomFor({ rudder:{ deltaR:dR } });
  const b = g.rudder.bladeTip, t = g.rudder.tillerTip;
  const ok = (dR>0) === (b[0]>0) && (dR>0) === (t[0]<0);
  check(`rudder ${dR>0?'+':''}${dR} deg -> blade ${dR>0?'stbd':'port'}, tiller ${dR>0?'port':'stbd'}`,
        ok, `blade tip ${pt(b)}  tiller tip ${pt(t)}  (stock ${pt(g.rudder.stock)})`);
}

console.log('\n=== CHECK 4 - both tacks, scenario (a) trim, 90 s of real physics ===');
// setupSteady is a top-level function in the page script, so it is on the sandbox
// global -- same preset the (a) scenario uses, mirrored by tackSign.
for (const tackSign of [1, -1]) {
  const cfg = SIM.cloneConfig(config); cfg.TWS = 6; cfg.TWD = 0; cfg.liveWind = false;
  const built = box.setupSteady(cfg, { tackSign, targetTWA:45, eM:0.15, eWorking:0.20, eLazy:1.0 });
  const st = built.state, ctrls = built.controls;
  for (let n=0; n<Math.round(90/cfg.dt); n++) SIM.step(st, ctrls, cfg.dt, cfg);
  const awa = st._last.wind.AWA;
  const g = SIM.render.boatGeometry(st, cfg, scale);
  const dM = st.sails.main.delta, dJ = st.sails.jib.delta;
  // leeward is the side away from the wind: AWA > 0 (wind from starboard) => sails to port
  const wantPort = awa > 0;
  const ok = wantPort === (dM < 0) && wantPort === (g.sails.main.clew[0] < 0)
          && wantPort === (dJ < 0) && wantPort === (g.sails.jib.clew[0] < 0);
  check(`${tackSign>0?'starboard':'port'} tack: AWA ${f2(awa)} deg -> sails drawn to ${wantPort?'port':'starboard'} (leeward)`,
        ok, `main delta ${f2(dM)} deg clew ${pt(g.sails.main.clew)}  jib delta ${f2(dJ)} deg clew ${pt(g.sails.jib.clew)}`);
}

console.log('\n=== CHECK 5 - default zoom from canvas height (spec 8) ===');
for (const hpx of [400, 600, 900, 1400]) {
  const sc = SIM.render.defaultScale(hpx, config);
  const span = SIM.hull(config).LWL*sc/hpx;
  const ok = sc >= 4 && sc <= 40;
  check(`canvas ${hpx} px tall -> ${f2(sc)} px/m`, ok, `hull spans ${(span*100).toFixed(1)}% of height (target ~25%, clamped to 4-40)`);
}

console.log('\n=== CHECK 6 - wave drift is integrated from simulated time ===');
// a TWS step must change the drift RATE, not jump the phase
SIM.render.waves = { drift:[0,0], lastT:null, cx:0, cy:0 };
SIM.render.advanceWaves(0, 6, 0, 0, 0);
SIM.render.advanceWaves(10, 6, 0, 0, 0);
const d10 = SIM.render.waves.drift[0];
SIM.render.advanceWaves(10.5, 12, 0, 0, 0);          // gust: TWS doubles
const d105 = SIM.render.waves.drift[0];
const jump = d105 - d10;
check('10 s at TWS 6 then a 0.5 s gust to TWS 12', Math.abs(d10-36)<1e-9 && Math.abs(jump-3.6)<1e-9,
      `drift 0->10 s = ${f2(d10)} m (0.6*6*10 = 36.0), gust step = ${f2(jump)} m (0.6*12*0.5 = 3.6); phase does not jump`);
SIM.render.advanceWaves(0, 6, 0, 0, 0);              // state replaced (reset / scenario button)
check('time going backwards re-bases instead of racing', Math.abs(SIM.render.waves.drift[0]-d105)<1e-9,
      `drift unchanged at ${f2(SIM.render.waves.drift[0])} m`);
// the crests are laid out relative to the camera, so the camera's own downwind
// motion must come back out of the drift or the water would ride along with the boat
SIM.render.waves = { drift:[0,0], lastT:null, cx:0, cy:0 };
SIM.render.advanceWaves(0, 0, 0, 0, 0);
SIM.render.advanceWaves(5, 0, 0, 0, -10);            // TWD 0 -> downwind is south: 10 m downwind
check('camera moves 10 m downwind in a dead calm -> crests stay put in the world',
      Math.abs(SIM.render.waves.drift[0]+10)<1e-9, `drift = ${f2(SIM.render.waves.drift[0])} m (expect -10.0)`);

console.log('\n=== CHECK 7 - wave crests sit where the drift says, and move downwind ===');
{
  // one layer, crest wobble off, so the drawn vertices can be read exactly
  const saved = SIM.render.waveLayers;
  const lam = 11;
  SIM.render.waveLayers = [{ lambda:lam, driftFrac:0.60, alpha:0.15, width:1.4, wobble:0 }];
  const cam = { x:0, y:0, cx:300, cy:300, scale:10, headingUp:false, psi:0 };
  const wind = { TWD:0, TWS:6 };   // wind from north -> crests run east-west, drift south
  function crestPhase(driftM){
    SIM.render.waves = { drift:[driftM], lastT:0 };
    const pts = [];
    const rec = { save(){}, restore(){}, beginPath(){}, stroke(){},
                  moveTo(x,y){ pts.push([x,y]); }, lineTo(x,y){ pts.push([x,y]); } };
    SIM.render.drawWaves(rec, cam, wind, 600, 600);
    // world downwind coordinate of each vertex: south is -y in the world, +y on screen
    const ss = pts.map(p=>(p[1]-cam.cy)/cam.scale);
    const xs = pts.map(p=>p[0]);
    const mods = ss.map(v=>((v%lam)+lam)%lam);
    const target = ((driftM%lam)+lam)%lam;
    const worst = Math.max(...mods.map(m=>Math.min(Math.abs(m-target), lam-Math.abs(m-target))));
    return { n:pts.length, worst, target, xSpan:Math.max(...xs)-Math.min(...xs) };
  }
  const a0 = crestPhase(0);
  const a1 = crestPhase(0.60*6*1);          // 1 s at TWS 6
  check('every crest vertex lies on k*lambda + drift, and the crests run across the wind',
        a0.worst < 1e-9 && a0.xSpan > 600,
        `${a0.n} vertices, worst phase error ${a0.worst.toExponential(1)} m, crests span ${a0.xSpan.toFixed(0)} px across a 600 px canvas`);
  check('after 1 s at TWS 6 the crests have moved 3.6 m downwind',
        a1.worst < 1e-9 && Math.abs(a1.target-3.6) < 1e-9,
        `phase now ${a1.target.toFixed(2)} m (0.6*6*1 = 3.60), worst error ${a1.worst.toExponential(1)} m`);
  SIM.render.waveLayers = saved;
  SIM.render.waves = { drift:[0,0], lastT:null };
}

console.log('\n=== CHECK 8 - signed leeway / STERNWAY (spec 12 round 7) ===');
{
  // SIM.isSternway is the same function draw() and updateReadouts call -- this
  // exercises the shipped threshold, not a restated copy of it.
  const aText = SIM.leewayText(-1, 0.2);
  const aFlag = SIM.isSternway(-1);
  const aOk = aText === '11° to starboard (astern)' && aFlag === true;
  check('u = -1, v = 0.2 -> "11 deg to starboard (astern)", STERNWAY set', aOk, `leewayText = "${aText}", SIM.isSternway(-1) = ${aFlag}`);
  const bText = SIM.leewayText(1, 0.2);
  const bFlag = SIM.isSternway(1);
  const bOk = bText === '11° to starboard' && bFlag === false;
  check('u = +1, v = 0.2 -> "11 deg to starboard", no flag', bOk, `leewayText = "${bText}", SIM.isSternway(1) = ${bFlag}`);
}

console.log('\n=== CHECK 9 - speckle layer: count and determinism (spec 12 round 7 item 6) ===');
{
  const camera = { x:0, y:0, cx:400, cy:300, scale:20, headingUp:false, psi:0 };
  const rec = { save(){}, restore(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, stroke(){}, fill(){} };
  const n = SIM.render.drawSpeckles(rec, camera, 800, 600);
  check('at 20 px/m, 800x600 canvas draws >= 200 flecks', n >= 200, `${n} flecks drawn`);

  const cellA1 = SIM.render.speckleForCell(3, -7);
  const cellA2 = SIM.render.speckleForCell(3, -7);
  const same = JSON.stringify(cellA1) === JSON.stringify(cellA2);
  check('the same cell (3, -7) yields the same flecks on repeated calls', same,
        `${cellA1.length} flecks both times, ${same ? 'identical' : 'DIFFERED'}`);
  const cellB = SIM.render.speckleForCell(3, -6);
  const distinctCells = JSON.stringify(cellA1) !== JSON.stringify(cellB);
  check('a different cell (3, -6) yields a different fleck set', distinctCells,
        `cell (3,-7): ${cellA1.length} flecks, cell (3,-6): ${cellB.length} flecks`);
  const countsOk = cellA1.every(f => f.tick !== undefined) && cellA1.length >= 6 && cellA1.length <= 10;
  check('each cell yields 6-10 flecks', countsOk, `cell (3,-7) has ${cellA1.length} flecks`);

  // Coverage, not just count: a fixed cell-radius cap left a speckle-free
  // vignette outside a few hundred pixels once zoomed out past ~15 px/m --
  // at 4 px/m (the wheel's minimum, well inside the normal 4-40 range, §8)
  // barely an eighth of the canvas was covered. Bin actual fleck screen
  // positions on a 10x10 grid over the real panel-adjusted canvas size and
  // require every bin -- corners included -- to have at least one fleck.
  const w = 930, h = 900;
  for (const scale of [4, 6, 8, 10, 20, 40]) {
    const camera = { x:0, y:0, cx:w/2, cy:h/2, scale, headingUp:false, psi:0 };
    const bins = 10, grid = new Array(bins*bins).fill(0);
    const recCov = { save(){}, restore(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, stroke(){}, fill(){} };
    const origWorldToScreen = SIM.render.worldToScreen;
    SIM.render.worldToScreen = function(cam, wx, wy){
      const [sx, sy] = origWorldToScreen(cam, wx, wy);
      if (sx>=0 && sx<w && sy>=0 && sy<h) {
        const bx = Math.min(bins-1, Math.floor(sx/w*bins)), by = Math.min(bins-1, Math.floor(sy/h*bins));
        grid[by*bins+bx]++;
      }
      return [sx, sy];
    };
    SIM.render.drawSpeckles(recCov, camera, w, h);
    SIM.render.worldToScreen = origWorldToScreen;
    const filled = grid.filter(c=>c>0).length;
    const cornersOk = grid[0]>0 && grid[bins-1]>0 && grid[grid.length-bins]>0 && grid[grid.length-1]>0;
    check(`scale ${scale} px/m, ${w}x${h} canvas: speckles reach all 4 corners, >=95% bin coverage`,
          cornersOk && filled >= 95, `${filled}/100 bins covered, corners: ${cornersOk ? 'all reached' : 'MISSING'}`);
  }
}

console.log('\n=== CHECK 10 - mast hinge (mast.x) and boom overhang (spec 12 round 8 item 2) ===');
{
  const cfg = SIM.defaultConfig();
  const scale = 20;
  for (const d of [30, -30]) {
    const st = SIM.createState({ sails: { main: { delta: d } } }, cfg);
    const g = SIM.render.boatGeometry(st, cfg, scale);
    const expectedMastY = -SIM.mastDef(cfg, 'main').x*scale;
    const hinge = g.sails.main.hinge;
    const hingeOk = Math.abs(g.mastY - expectedMastY) < 1e-9
                 && Math.abs(hinge[0] - 0) < 1e-9
                 && Math.abs(hinge[1] - expectedMastY) < 1e-9;
    check(`delta = ${d>0?'+':''}${d} deg: boom hinge sits at (0, mastY), mastY = -mast.x*scale`,
          hingeOk, `mastY = ${g.mastY.toFixed(2)} px (expect ${expectedMastY.toFixed(2)}), hinge point = (${hinge[0].toFixed(2)}, ${hinge[1].toFixed(2)})`);
    const clewOk = (d > 0) === (g.sails.main.clew[0] > 0);
    check(`delta = ${d>0?'+':''}${d} deg: clew sign unchanged (round 6/7 rule -- to starboard for positive delta)`,
          clewOk, `main clew (aft corner) = (${g.sails.main.clew[0].toFixed(2)}, ${g.sails.main.clew[1].toFixed(2)})`);
  }
  // boom overhang ~0.6 m past the transom, with the default mast.x and main.A
  const st0 = SIM.createState({}, cfg);
  const g0 = SIM.render.boatGeometry(st0, cfg, scale);
  const transomM = SIM.hull(cfg).LWL*0.45;
  const boomTipM = g0.sails.main.clew[1]/scale; // world metres, from the CLR (delta=0, so no rotation)
  const overhangM = boomTipM - transomM;
  const overhangOk = overhangM > 0.4 && overhangM < 0.8;
  check('default boom overhangs the transom by roughly 0.6 m (spec: "about 0.6 m")',
        overhangOk, `boom tip ${boomTipM.toFixed(3)} m from the CLR, transom at ${transomM.toFixed(3)} m, overhang ${overhangM.toFixed(3)} m`);
}

console.log('\n=== CHECK 11 - HUD text (spec 12 round 8 item 1), printed check from the report requirement ===');
{
  const st = SIM.createState({ u:-0.4, v:0.1, psi: box.deg2rad(359.4) }, SIM.defaultConfig());
  const wind = { TWA: 1, AWA: 1 };
  const hud = SIM.render.hudText(st, wind);
  console.log(`  state: u=-0.4 v=0.1 psi=359.4deg, wind: TWA=1deg AWA=1deg`);
  console.log(`  HUD big line : "${hud.full}"`);
  console.log(`  HUD info line: "${hud.infoLine}"`);
  const bigOk = hud.full === '-0.8 kn STERNWAY';
  check('big line reads "-0.8 kn STERNWAY" (spec expects "−0.8 kn STERNWAY")', bigOk, `got "${hud.full}"`);
  const infoOk = hud.infoLine === 'SOG 0.8 kn · HDG 359° · TWA 1° · AWA 1°';
  check('info line reads "SOG 0.8 kn · HDG 359° · TWA 1° · AWA 1°"', infoOk, `got "${hud.infoLine}"`);
}

console.log('\n=== CHECK 12 - deck schematic: working/lazy, fairlead sign, load colour (spec 12 round 10 item 5) ===');
{
  const cfg = SIM.defaultConfig();
  const scale = SIM.render.deckScale;

  // -- working/lazy per tack, via the same setupSteady() (a) uses elsewhere in
  // this file, so the check exercises a real state, not a hand-built AWA. --
  for (const tackSign of [1, -1]) {
    const c = SIM.cloneConfig(cfg); c.TWS = 6; c.TWD = 0; c.liveWind = false;
    const built = box.setupSteady(c, { tackSign, targetTWA:45, eM:0.15, eWorking:0.20, eLazy:1.0 });
    const st = built.state;
    for (let n=0; n<Math.round(90/c.dt); n++) SIM.step(st, built.controls, c.dt, c);
    const wind = st._last.wind;
    const sheets = SIM.render.deckSheets(st, wind, c, scale);
    const byId = Object.fromEntries(sheets.map(s=>[s.id, s]));
    // lines are addressed through the definition, not by a literal 'eJp'
    const jibP = byId[SIM.lineIdFor(c,'jib','port')],  jibS = byId[SIM.lineIdFor(c,'jib','stbd')];
    const stayP = byId[SIM.lineIdFor(c,'staysail','port')], stayS = byId[SIM.lineIdFor(c,'staysail','stbd')];
    const mainSh = byId[SIM.lineIdFor(c,'main','centre')];
    const wantPortWorking = wind.AWA > 0; // starboard tack (AWA>0) -> leeward/working = port
    const ok = jibP.working === wantPortWorking && jibS.working === !wantPortWorking
            && stayP.working === wantPortWorking && stayS.working === !wantPortWorking
            && mainSh.working === true;
    check(`${tackSign>0?'starboard':'port'} tack (AWA ${f2(wind.AWA)} deg): ${wantPortWorking?'port':'starboard'} sheets working, ${wantPortWorking?'starboard':'port'} lazy`,
          ok, `${jibP.id}.working=${jibP.working} ${jibS.id}.working=${jibS.working} ${stayP.id}.working=${stayP.working} ${stayS.id}.working=${stayS.working} ${mainSh.id}.working=${mainSh.working}`);
    // every cleat prints its key (round 14 item 5)
    const labelled = sheets.every(s=>s.label && s.label.indexOf(SIM.keyLabel(s.key)) >= 0);
    check('every cleat label carries its sail and its key', labelled,
          sheets.map(s=>s.label).join('  |  '));
  }

  // -- port fairleads sit at x < 0 in the schematic, starboard at x > 0 --
  {
    const cleats = SIM.render.deckCleats(cfg, scale);
    // by side, straight off the definition -- so this holds for any rig
    let ok = true, detail = [];
    for (const { line, sail } of SIM.allLines(cfg)) {
      const x = cleats[line.id][0];
      const good = line.side === 'port' ? x < 0 : line.side === 'stbd' ? x > 0 : x === 0;
      if (!good) ok = false;
      detail.push(`${line.id}(${line.side}).x=${f2(x)}`);
    }
    check('port fairleads at x<0, starboard at x>0, centre sheets on the centreline',
          ok, detail.join(' '));
  }

  // -- cleats scale with LWL, not fixed metres: deckCleats used to hard-code
  // metre offsets (mainY=2.9, jibY=1.8 etc.) that ignored LWL, so at a
  // shortened hull the main cleat drifted past the transom. The transom is
  // at y = 0.45*L (boatGeometry's hull outline); the cleat must stay forward
  // of it, and the cleat/L ratio must be identical at two different LWLs. --
  {
    const cShort = SIM.cloneConfig(cfg); SIM.hull(cShort).LWL = 5;
    const mainLine = SIM.lineIdFor(cfg, 'main', 'centre');
    const cleatsDefault = SIM.render.deckCleats(cfg, scale);
    const cleatsShort = SIM.render.deckCleats(cShort, scale);
    const transomYShort = 0.45*SIM.hull(cShort).LWL*scale;
    const ratioDefault = cleatsDefault[mainLine][1] / (SIM.hull(cfg).LWL*scale);
    const ratioShort = cleatsShort[mainLine][1] / (SIM.hull(cShort).LWL*scale);
    const ok = cleatsShort[mainLine][1] < transomYShort && Math.abs(ratioDefault - ratioShort) < 1e-9;
    check('cleats scale with LWL: main cleat stays forward of the transom at LWL=5',
          ok, `LWL=5: main.y=${cleatsShort[mainLine][1].toFixed(1)} transom.y=${transomYShort.toFixed(1)}; main.y/L ratio default=${ratioDefault.toFixed(4)} LWL=5=${ratioShort.toFixed(4)}`);
  }

  // -- load -> colour hits all three bands at 0, 0.5*loadRef, loadRef --
  {
    const loadRef = cfg.loadRef;
    const c0 = SIM.render.loadColor(0, loadRef);
    const c1 = SIM.render.loadColor(0.5*loadRef, loadRef);
    const c2 = SIM.render.loadColor(loadRef, loadRef);
    const ok = c0.band === 'slack' && c1.band === 'drawing' && c2.band === 'red'
            && c0.color !== c1.color && c1.color !== c2.color && c0.color !== c2.color;
    check('load->colour: 0 -> slack, 0.5*loadRef -> drawing, loadRef -> red, three distinct colours',
          ok, `0 -> ${c0.band} ${c0.color}; 0.5*loadRef -> ${c1.band} ${c1.color}; loadRef -> ${c2.band} ${c2.color}`);
  }
}

console.log('\n=== CHECK 13 - §14 key map, generated from the ship definition (round 14 item 4; modifiers per round 16 item 7) ===');
{
  const cfg = SIM.defaultConfig();
  const jibPort = SIM.lineIdFor(cfg, 'jib', 'port');
  const jibPortKey = SIM.lineDef(cfg, jibPort).line.key;
  check('the jib port sheet is bound to Digit1 by the definition (§14 bowsprit row, outer pair, left)',
        jibPortKey === 'Digit1', `line ${jibPort} -> key ${jibPortKey}`);

  const haul = SIM.buildControlsFromInput({ keys:new Set(['Digit1']) }, cfg);
  check('Digit1 (plain) hauls the port jib sheet', haul.sheets[jibPort] === -1,
        `sheets = ${JSON.stringify(haul.sheets)}`);
  const ease = SIM.buildControlsFromInput({ keys:new Set(['Digit1']), mods:{shift:true} }, cfg);
  check('Shift+Digit1 eases it', ease.sheets[jibPort] === 1, `sheets = ${JSON.stringify(ease.sheets)}`);
  // round 16 item 7: let fly is hold-Space + the key. Ctrl is the browser's.
  const fly = SIM.buildControlsFromInput({ keys:new Set(['Digit1']), mods:{space:true} }, cfg);
  check('Space+Digit1 lets it fly, and issues no haul/ease', fly.letFly.indexOf(jibPort) >= 0 && fly.sheets[jibPort] === undefined,
        `letFly = ${JSON.stringify(fly.letFly)}, sheets = ${JSON.stringify(fly.sheets)}`);
  const alt = SIM.buildControlsFromInput({ keys:new Set(['Digit1']), mods:{alt:true} }, cfg);
  check('Alt+Digit1 is reserved and does nothing to this sheet', alt.sheets[jibPort] === undefined && alt.letFly.length === 0,
        `sheets = ${JSON.stringify(alt.sheets)}, letFly = ${JSON.stringify(alt.letFly)}`);
  /* Round 17 step 6: the reserved-chord TABLE is the enforcement, so this
     asserts the table and the refusal together rather than a list of chords
     someone remembered to type here. Print it too -- it is the answer to
     "which combinations may a later round not use". */
  console.log('  reserved-chord table (SIM.RESERVED_CHORDS), refused by buildControlsFromInput:');
  for (const r of SIM.RESERVED_CHORDS) {
    console.log(`    ${r.mod}${r.keys === '*' ? ' + any key' : ' + ' + r.keys.map(k=>SIM.keyLabel(k)).join('/')}: ${r.reason}`);
  }
  {
    // every entry in the table refuses, on a key that IS bound on this ship
    const probes = [];
    for (const r of SIM.RESERVED_CHORDS) {
      const codes = r.keys === '*' ? ['Digit1','KeyQ','KeyE'] : r.keys;
      for (const code of codes) probes.push([r.mod, code]);
    }
    probes.push(['ctrl','Digit1']);   // and in combination with a layer we do use
    const leaks = probes.filter(([mod, code])=>{
      const mods = {}; mods[mod] = true; mods.shift = true; mods.space = true;
      const c = SIM.buildControlsFromInput({ keys:new Set([code]), mods }, cfg);
      return Object.keys(c.sheets).length > 0 || c.letFly.length > 0;
    });
    check('every combination in the reserved table produces no command, even with Shift and Space also held',
          leaks.length === 0,
          leaks.length ? leaks.map(([m,c])=>`${m}+${c}`).join(', ')
                       : `${probes.length} probes across ${SIM.RESERVED_CHORDS.length} table entries, all refused`);
    const named = SIM.isReservedChord({ alt:true }, 'KeyD');
    check('isReservedChord names the entry that refuses, so the reason is reportable',
          !!named && named.mod === 'alt' && /Firefox/.test(named.reason),
          named ? `alt+KeyD -> "${named.reason.slice(0, 60)}..."` : 'no entry matched alt+KeyD');
    // the layers we DO use are not in the table
    const layersUsed = ['shift', 'space'];
    const clash = layersUsed.filter(l=>SIM.RESERVED_CHORDS.some(r=>r.mod === l));
    check('the layers actually in use (Shift = ease, Space = let fly) are not in the reserved table',
          clash.length === 0, clash.length ? `clashes: ${clash.join(', ')}` : 'Shift and Space are both free of browser chords');
  }

  // the haul really moves the rope, through the normal rate-limited actuator
  {
    const st = SIM.createState({}, cfg);
    const before = st.sheets[jibPort];
    SIM.step(st, haul, cfg.dt, cfg);
    check('one physics step of Digit1 hauls the sheet in', st.sheets[jibPort] < before,
          `ease ${before.toFixed(4)} -> ${st.sheets[jibPort].toFixed(4)}`);
    const st2 = SIM.createState({ sheets:{} }, cfg);
    st2.sheets[jibPort] = 0.2;
    SIM.step(st2, fly, cfg.dt, cfg);
    check('one physics step of Space+Digit1 casts the sheet off completely', st2.sheets[jibPort] === 1,
          `ease 0.2 -> ${st2.sheets[jibPort]}`);
  }

  // helm on the numpad
  const num4 = SIM.buildControlsFromInput({ keys:new Set(['Numpad4']) }, cfg);
  const num6 = SIM.buildControlsFromInput({ keys:new Set(['Numpad6']) }, cfg);
  check('Numpad4 -> positive tillerCmd, Numpad6 -> negative', num4.tillerCmd > 0 && num6.tillerCmd < 0,
        `Numpad4: ${num4.tillerCmd}, Numpad6: ${num6.tillerCmd}`);
  {
    const st = SIM.createState({}, cfg);
    SIM.step(st, num4, cfg.dt, cfg);
    check('Numpad4, one physics step -> deltaR positive (tiller to port, bow to starboard)', st.rudder.deltaR > 0,
          `deltaR after one step = ${st.rudder.deltaR.toFixed(4)} deg`);
  }
  const num5 = SIM.buildControlsFromInput({ keys:new Set(['Numpad5']) }, cfg);
  check('Numpad5 sets rudderCenter (amidships, and takes the helm back)', num5.rudderCenter === true,
        `rudderCenter = ${num5.rudderCenter}`);
  {
    const st = SIM.createState({ rudder:{ deltaR:20, mode:'lashed' } }, cfg);
    SIM.step(st, num5, cfg.dt, cfg);
    check('Numpad5, one step -> the helm is held again and the rudder is coming back to centre',
          st.rudder.mode === 'held' && st.rudder.deltaR < 20,
          `mode = ${st.rudder.mode}, deltaR = ${st.rudder.deltaR.toFixed(3)} deg`);
  }

  // the whole sloop grid, as §14 specifies it
  const wantGrid = [['jib','port','Digit1'], ['jib','stbd','Digit5'], ['staysail','port','KeyQ'],
                    ['staysail','stbd','KeyT'], ['main','centre','KeyE']];
  const gridOk = wantGrid.every(([sail, side, code]) => {
    const id = SIM.lineIdFor(cfg, sail, side);
    return id && SIM.lineDef(cfg, id).line.key === code;
  });
  check('sloop grid: jib 1/5, staysail Q/T, main E',
        gridOk, wantGrid.map(([s,side,code])=>`${s}.${side}=${code}`).join(' '));

  // every line sits where the §14 grid says its key sits
  const misplaced = SIM.allLines(cfg).filter(({line}) =>
    SIM.gridKey(line.station, line.column, line.side) !== line.key);
  check('every line sits on the key SIM.KEY_GRID gives its (station, column, side)', misplaced.length === 0,
        misplaced.length ? misplaced.map(e=>`${e.line.id}@${e.line.station}/${e.line.column}/${e.line.side} has ${e.line.key}, grid says ${SIM.gridKey(e.line.station,e.line.column,e.line.side)}`).join('; ')
                         : SIM.allLines(cfg).map(e=>`${e.line.id}=${SIM.keyLabel(e.line.key)}`).join(' '));

  /* The key list as bound, for the report: every rope key this ship actually
     answers to, plus the modifier layer and the helm, read out of the
     definition rather than retyped from §14. */
  {
    for (const shipId of Object.keys(SIM.SHIPS)) {
      const c = SIM.defaultConfig(); c.ship = SIM.cloneShip(SIM.SHIPS[shipId]);
      const ropes = SIM.allLines(c).map(({line, sail}) =>
        `${SIM.keyLabel(line.key)}=${sail.short}${line.side==='centre'?'':'/'+line.side}` +
        (line.kind==='bracePair' ? ' brace' : '')).join('  ');
      console.log(`  key list as bound (${SIM.hull(c).name}): ${ropes}`);
    }
    console.log('  modifiers: plain = haul · Shift = ease · hold Space = let fly · Alt = reserved (sail above) · Ctrl/Meta = the browser\'s');
    console.log(`  helm: ${Object.entries(SIM.HELM_KEYS).map(([k,v])=>`${SIM.keyLabel(v)} ${k}`).join(' · ')} · P pause · 0 reset position`);
  }

  /* Round 17 step 6: selection, walked through. The fixture is the sloop with
     a gaff topsail declared above the main, so two sails share KeyE -- which
     is the whole reason selection exists. */
  {
    const sel = SIM.defaultConfig();
    sel.ship = SIM.cloneShip(SIM.SHIPS.sloop);
    sel.ship.sails.push({
      id:'gaffTop', name:'Gaff topsail', short:'GAFF T', type:'gaff-topsail',
      mast:'main', above:'main', A:9, xCE:-1.0, zCE:8.0, deltaLim:60, i0:6, hoist:'single',
      lines: [ { id:'eGT', kind:'sheet', side:'centre', key:'KeyE', station:'fore', column:'centre', layer:'above' } ],
    });
    const press = (code, selected, mods) => SIM.buildControlsFromInput(
      { keys:new Set([code]), mods: mods || {}, selectedSail: selected || null }, sel);

    const none = press('KeyE', null);
    check('nothing selected: KeyE hauls the MAINSHEET — the base rope, the one with no `layer`',
          none.sheets.eM === -1 && none.sheets.eGT === undefined,
          `sheets = ${JSON.stringify(none.sheets)}`);
    const onTop = press('KeyE', 'gaffTop');
    check("gaff topsail selected: the same KeyE hauls the TOPSAIL's sheet instead",
          onTop.sheets.eGT === -1 && onTop.sheets.eM === undefined,
          `sheets = ${JSON.stringify(onTop.sheets)}`);
    const onMain = press('KeyE', 'main');
    check('main selected: KeyE is the mainsheet again — selecting the base sail is not a special case',
          onMain.sheets.eM === -1 && onMain.sheets.eGT === undefined,
          `sheets = ${JSON.stringify(onMain.sheets)}`);
    const wrongKey = press('Digit1', 'gaffTop');
    check('a selected sail has no rope on Digit1, so Digit1 is DEAD rather than working the jib',
          Object.keys(wrongKey.sheets).length === 0 && wrongKey.letFly.length === 0,
          `sheets = ${JSON.stringify(wrongKey.sheets)}, letFly = ${JSON.stringify(wrongKey.letFly)}`);
    const easeTop = press('KeyE', 'gaffTop', {shift:true});
    const flyTop  = press('KeyE', 'gaffTop', {space:true});
    check('the modifiers work on the selected sail: Shift eases it, Space lets it fly',
          easeTop.sheets.eGT === 1 && flyTop.letFly.indexOf('eGT') >= 0 && flyTop.sheets.eGT === undefined,
          `Shift -> ${JSON.stringify(easeTop.sheets)} · Space -> letFly ${JSON.stringify(flyTop.letFly)}`);

    // cycling: definition order, and off either end is "nothing selected"
    const ids = SIM.selectableSails(sel);
    let cur = null; const walk = [];
    for (let k=0;k<ids.length+1;k++) { cur = SIM.cycleSelection(sel, cur, 1); walk.push(cur); }
    check('Tab cycles bow to stern in definition order, then off the end to nothing',
          walk.slice(0, ids.length).join(',') === ids.join(',') && walk[ids.length] === null,
          `${ids.length} sails: ${walk.map(x=>x===null?'(none)':x).join(' -> ')}`);
    check('Shift+Tab from nothing selects the last sail, so the cycle runs both ways',
          SIM.cycleSelection(sel, null, -1) === ids[ids.length-1],
          `back from (none) -> ${SIM.cycleSelection(sel, null, -1)}`);

    // clicking: a sail's own drawing selects it, open water selects nothing
    {
      const st = SIM.createState({}, sel);
      const scale = SIM.render.deckScale;
      const g = SIM.render.boatGeometry(st, sel, scale);
      // each sail's CLEW is its own point, so a click there must pick that sail
      const hits = SIM.sailDefs(sel).map(d=>{
        const pnt = g.sails[d.id].clew;
        return [d.id, SIM.render.pickSail(st, sel, scale, pnt[0], pnt[1])];
      });
      const wrong = hits.filter(([want, got])=>got !== want);
      check('clicking a sail at its own clew picks that sail; open water picks none',
            wrong.length === 0 && SIM.render.pickSail(st, sel, scale, 900, 900) === null,
            `${hits.map(([w,g2])=>`${w}->${g2}`).join(' ')} · far off the hull -> ${SIM.render.pickSail(st, sel, scale, 900, 900)}`);
      /* Where a sail and the sail above it share a point -- the gaff topsail
         is tacked at the main's own hinge -- the click goes to the sail listed
         first, which is the big one. Reaching the upper sail is a click on its
         clew or a press of Tab, not a pixel hunt at the mast. */
      const atMast = g.sails.main.hinge;
      check('at the mast, where the main and the topsail above it coincide, the click picks the MAIN',
            SIM.render.pickSail(st, sel, scale, atMast[0], atMast[1]) === 'main',
            `click at the main's hinge ${pt(atMast)} -> ${SIM.render.pickSail(st, sel, scale, atMast[0], atMast[1])}`);
    }
  }

  // the round-13 bindings are gone: no sheet, tiller or helm command comes out
  const retired = ['KeyA','KeyD','KeyX','KeyC','KeyL','KeyR','KeyF','KeyG','KeyY','KeyH','KeyU','KeyJ'];
  const stillLive = retired.filter(code=>{
    const c = SIM.buildControlsFromInput({ keys:new Set([code]) }, cfg);
    return Object.keys(c.sheets).length > 0 || c.letFly.length > 0 || c.tillerCmd || c.rudderCenter;
  });
  check('the retired round-13 bindings (A/D/X/C/L, R/F, G, Y/H, U/J) are dead on the sloop', stillLive.length === 0,
        stillLive.length ? `still live: ${stillLive.join(', ')}` : 'all twelve produce no command');
}

console.log('\n=== CHECK 14 - rudder free mode (spec 12 round 11 item 5) ===');
{
  function settleFreeRudder(u, v, r, startDeltaR, seconds){
    const st = SIM.createState({ u, v, r, rudder:{ deltaR:startDeltaR, mode:'free' } }, config);
    const wind = { AWA:0, AWS:0 };
    const sailForces = {
      main:{load:0, camberSide:1}, staysail:{load:0, camberSide:1}, jib:{load:0, camberSide:1},
    };
    for (let n=0; n<Math.round(seconds/config.dt); n++) SIM.stepActuators(st, {}, config.dt, config, wind, sailForces);
    return st.rudder.deltaR;
  }
  const dNeutral = settleFreeRudder(2, 0, 0, 15, 3);
  const mzNeutral = SIM.computeRudderForces({ u:2, v:0, r:0, rudder:{ deltaR:dNeutral } }, config).Mz;
  check('u=2, v=0, r=0: free rudder settles at 0 deg', Math.abs(dNeutral) < 0.5,
        `settled at ${dNeutral.toFixed(2)} deg from a 15 deg start`);
  check('...and its Mz is ~0', Math.abs(mzNeutral) < 50, `Mz = ${mzNeutral.toFixed(2)} N*m`);

  const dSide = settleFreeRudder(2, 0.3, 0, 0, 3);
  check('u=2, v=0.3, r=0: free rudder settles near -8.5 deg', Math.abs(dSide - (-8.5)) < 0.5,
        `settled at ${dSide.toFixed(2)} deg`);
}

console.log('\n=== CHECK 15 - masthead leans with heel (spec 12 round 12 item 2) ===');
{
  const cfg = SIM.defaultConfig();
  const scale = 20;
  for (const phiDeg of [-15, 15, 0]) {
    const st = SIM.createState({ phi: box.deg2rad(phiDeg) }, cfg);
    const g = SIM.render.boatGeometry(st, cfg, scale);
    const want = phiDeg < 0 ? 'x < 0' : phiDeg > 0 ? 'x > 0' : 'x == 0';
    const ok = phiDeg < 0 ? g.mast.head[0] < 0 : phiDeg > 0 ? g.mast.head[0] > 0 : Math.abs(g.mast.head[0]) < 1e-9;
    check(`phi = ${phiDeg} deg -> masthead ${want}`, ok, `mast.head = ${pt(g.mast.head)}, mast.foot = ${pt(g.mast.foot)}`);
  }
  const stHeeled = SIM.createState({ phi: box.deg2rad(20) }, cfg);
  const gHeeled = SIM.render.boatGeometry(stHeeled, cfg, scale);
  const footOk = gHeeled.mast.foot[0] === 0 && gHeeled.mast.foot[1] === gHeeled.mastY;
  check('mast foot stays at (0, mastY) regardless of heel', footOk, `foot = ${pt(gHeeled.mast.foot)}`);
}

console.log('\n=== CHECK 16 - the definition drives the state, square sail included (rounds 14-15) ===');
{
  const cfg = SIM.defaultConfig();
  const st = SIM.createState({}, cfg);
  const sailIds = SIM.sailDefs(cfg).map(s=>s.id);
  const lineIds = SIM.allLines(cfg).map(e=>e.line.id);
  const sailsOk = JSON.stringify(Object.keys(st.sails)) === JSON.stringify(sailIds);
  const linesOk = JSON.stringify(Object.keys(st.sheets)) === JSON.stringify(lineIds);
  check('state.sails is keyed by the definition\'s sail ids, in definition order', sailsOk,
        `state: [${Object.keys(st.sails)}] definition: [${sailIds}]`);
  check('state.sheets is keyed by the definition\'s line ids, in definition order', linesOk,
        `state: [${Object.keys(st.sheets)}] definition: [${lineIds}]`);
  const idsUnchanged = sailIds.join(',') === 'main,staysail,jib' && lineIds.join(',') === 'eM,eSp,eSs,eJp,eJs';
  check('the sloop keeps round 13\'s ids, so the harness output cannot move on a rename', idsUnchanged,
        `sails ${sailIds.join(',')}; lines ${lineIds.join(',')}`);

  // every hoist role in the definition exists as a state field
  let hoistOk = true, hoistDetail = [];
  for (const def of SIM.sailDefs(cfg)) {
    const kind = SIM.hoistKind(def);
    for (const role of kind.roles) {
      const f = kind.fields[role];
      if (typeof st.sails[def.id][f] !== 'number') hoistOk = false;
      hoistDetail.push(`${def.id}.${role}=${f}`);
    }
  }
  check('every hoist role named by the definition exists in state', hoistOk, hoistDetail.join(' '));

  // the cutter's state carries the square sail's OWN trim variable
  const cut = SIM.defaultConfig();
  cut.ship = SIM.cloneShip(SIM.SHIPS.topsailCutter);
  const cs = SIM.createState({}, cut);
  const trimOk = cs.sails.topsail.psiY === 0 && cs.sails.topsail.delta === undefined
              && cs.sails.main.delta === 0 && cs.sails.main.psiY === undefined;
  check('a square sail is stated by psiY, a fore-and-aft sail by delta', trimOk,
        `topsail keys [${Object.keys(cs.sails.topsail)}], main keys [${Object.keys(cs.sails.main)}]`);
  const cutLines = SIM.allLines(cut).map(e=>e.line.id);
  check('the cutter adds a brace pair and nothing else',
        cutLines.join(',') === 'eM,eSp,eSs,eJp,eJs,bTp,bTs', cutLines.join(','));
  let stepThrew = '';
  try { SIM.step(cs, {}, cut.dt, cut); } catch (e) { stepThrew = e.message; }
  check('the cutter steps without throwing', stepThrew === '', stepThrew || 'stepped clean');

  // an UNKNOWN type still throws, in physics and in render
  const bogus = SIM.cloneConfig(cfg);
  SIM.sailDef(bogus, 'jib').type = 'lateen';
  let threw = '';
  try { SIM.step(SIM.createState({}, bogus), {}, bogus.dt, bogus); } catch (e) { threw = e.message; }
  check('a sail of an unknown type throws rather than sailing silently', /unknown sail type/.test(threw),
        threw || 'no error thrown');
}

console.log('\n=== CHECK 17 - hoist made visible (spec 12 round 12 item 3) ===');
{
  const cfg = SIM.defaultConfig();
  const scale = 20;
  function polygonArea(pts){
    let a = 0;
    for (let i=0;i<pts.length;i++){
      const [x1,y1] = pts[i], [x2,y2] = pts[(i+1)%pts.length];
      a += x1*y2 - x2*y1;
    }
    return Math.abs(a)/2;
  }
  // The round-11 main shape, computed independently of boatGeometry's current
  // formula, as ground truth for "area equals the round-11 value at hoist 1".
  function round11MainArea(config, sc){
    const boomLen = 0.55*Math.sqrt(SIM.sailDef(config, 'main').A)*1.718*sc;
    return polygonArea([
      [0,0], [boomLen*0.08, boomLen*0.35], [boomLen*0.05, boomLen*0.95], [-boomLen*0.02, boomLen*0.95],
    ]);
  }
  const refArea = round11MainArea(cfg, scale);

  const gFull = SIM.render.boatGeometry(SIM.createState({}, cfg), cfg, scale); // fully hoisted default
  const areaFull = polygonArea(gFull.sails.main.poly);
  check('hoist 1 (hT=1,pk=1): main polygon area equals the round-11 value', Math.abs(areaFull-refArea) < 1e-6,
        `area = ${areaFull.toFixed(3)} px^2, round-11 reference = ${refArea.toFixed(3)} px^2`);

  const gDown = SIM.render.boatGeometry(SIM.createState({ sails:{ main:{ hT:0, hP:0 } } }, cfg), cfg, scale);
  const areaDown = polygonArea(gDown.sails.main.poly);
  check('hoist 0 (hT=0): main polygon area is ~0', areaDown < 1e-6, `area = ${areaDown.toExponential(2)} px^2`);

  const yPreserved = Math.abs(gDown.sails.main.poly[1][1]-gFull.sails.main.poly[1][1]) < 1e-6
                  && Math.abs(gDown.sails.main.poly[2][1]-gFull.sails.main.poly[2][1]) < 1e-6;
  check('hoist 0: outline still spans the boom\'s length -- reads as a bundle lying along it', yPreserved,
        `main[1].y=${gDown.sails.main.poly[1][1].toFixed(2)} (hoist1=${gFull.sails.main.poly[1][1].toFixed(2)}), main[2].y=${gDown.sails.main.poly[2][1].toFixed(2)} (hoist1=${gFull.sails.main.poly[2][1].toFixed(2)})`);

  const gNoPeak = SIM.render.boatGeometry(SIM.createState({ sails:{ main:{ hT:1, hP:0 } } }, cfg), cfg, scale); // pk=0
  const peakCollapsed = Math.abs(gNoPeak.sails.main.poly[1][0]) < 1e-6;
  const clewStillOut = Math.abs(gNoPeak.sails.main.poly[2][0]) > 1e-6;
  check('gaff droop (pk=0, hT=1): peak corner collapses onto the boom, clew corner unaffected', peakCollapsed && clewStillOut,
        `main[1].x=${gNoPeak.sails.main.poly[1][0].toFixed(3)} (peak), main[2].x=${gNoPeak.sails.main.poly[2][0].toFixed(3)} (clew, hoist-only)`);

  const gJibFull = SIM.render.boatGeometry(SIM.createState({}, cfg), cfg, scale);
  const gJibDown = SIM.render.boatGeometry(SIM.createState({ sails:{ jib:{ h:0 } } }, cfg), cfg, scale);
  const fullLen = Math.hypot(gJibFull.sails.jib.clew[0]-gJibFull.sails.jib.tack[0], gJibFull.sails.jib.clew[1]-gJibFull.sails.jib.tack[1]);
  const downLen = Math.hypot(gJibDown.sails.jib.clew[0]-gJibDown.sails.jib.tack[0], gJibDown.sails.jib.clew[1]-gJibDown.sails.jib.tack[1]);
  check('jib hoist 0: clew collapses onto the tack (hoist 1 length preserved)', downLen < 1e-6 && fullLen > 1,
        `h=0 clew-tack dist=${downLen.toExponential(2)} px, h=1 clew-tack dist=${fullLen.toFixed(2)} px`);
  const bundleLen = Math.hypot(gJibDown.sails.jib.bundle[1][0]-gJibDown.sails.jib.bundle[0][0], gJibDown.sails.jib.bundle[1][1]-gJibDown.sails.jib.bundle[0][1]);
  check('jib bundle segment present near the tack when dropped', bundleLen > 1, `bundle length = ${bundleLen.toFixed(2)} px`);
}

console.log('\n=== CHECK 18 - square sail: yard, chord angle and belly (spec 15) ===');
{
  const cfg = SIM.defaultConfig();
  cfg.ship = SIM.cloneShip(SIM.SHIPS.topsailCutter);
  const scale = 20;

  // the chord angle the force model sees: the direction of the AFT yardarm
  const mapOk = Math.abs(SIM.yardChordAngle(55) - (-35)) < 1e-9
             && Math.abs(SIM.yardChordAngle(-55) - (35)) < 1e-9
             && Math.abs(SIM.yardChordAngle(0) - (-90)) < 1e-9;
  check('deltaEq = -sign(psiY)*(90-|psiY|), with psiY = 0 taken as -90', mapOk,
        `psiY +55 -> ${SIM.yardChordAngle(55)}, 0 -> ${SIM.yardChordAngle(0)}, -55 -> ${SIM.yardChordAngle(-55)}`);

  // psiY > 0 puts the STARBOARD yardarm forward (screen: +x, and -y is forward)
  for (const psiY of [40, -40]) {
    const st = SIM.createState({ sails:{ topsail:{ psiY } } }, cfg);
    const g = SIM.render.boatGeometry(st, cfg, scale);
    const y = g.sails.topsail.yard;
    const stbdForward = y.stbd[1] < y.port[1];
    const ok = (psiY > 0) === stbdForward && (y.stbd[0] > y.port[0]);
    check(`psiY = ${psiY > 0 ? '+' : ''}${psiY} deg -> ${psiY > 0 ? 'starboard' : 'port'} yardarm forward`,
          ok, `port arm ${pt(y.port)}, starboard arm ${pt(y.stbd)}`);
  }
  {
    const st = SIM.createState({}, cfg);   // psiY = 0
    const g = SIM.render.boatGeometry(st, cfg, scale);
    const y = g.sails.topsail.yard;
    const across = Math.abs(y.port[1] - y.stbd[1]) < 1e-9 && Math.abs(y.stbd[0] + y.port[0]) < 1e-9;
    const lenOk = Math.abs(Math.hypot(y.stbd[0]-y.port[0], y.stbd[1]-y.port[1]) - 1.1*Math.sqrt(12)*scale) < 1e-9;
    check('psiY = 0 -> the yard lies athwartships, 1.1*sqrt(A) long', across && lenOk,
          `port ${pt(y.port)} stbd ${pt(y.stbd)}, length ${Math.hypot(y.stbd[0]-y.port[0], y.stbd[1]-y.port[1]).toFixed(2)} px ` +
          `(1.1*sqrt(12)*${scale} = ${(1.1*Math.sqrt(12)*scale).toFixed(2)})`);
  }
  // the belly lies on the side the resultant pushes, and collapses when furled
  {
    const set = SIM.createState({ sails:{ topsail:{ bellySign: 1 } } }, cfg);
    const gSet = SIM.render.boatGeometry(set, cfg, scale).sails.topsail;
    const fwdBelly = gSet.ctrl[1] < gSet.yard.centre[1];
    const aft = SIM.createState({ sails:{ topsail:{ bellySign: -1 } } }, cfg);
    const gAft = SIM.render.boatGeometry(aft, cfg, scale).sails.topsail;
    check('bellySign +1 bellies the sail forward of the yard, -1 aft', fwdBelly && gAft.ctrl[1] > gAft.yard.centre[1],
          `+1 ctrl ${pt(gSet.ctrl)}, -1 ctrl ${pt(gAft.ctrl)}, yard centre ${pt(gSet.yard.centre)}`);
    const furled = SIM.createState({ sails:{ topsail:{ h: 0 } } }, cfg);
    const gF = SIM.render.boatGeometry(furled, cfg, scale).sails.topsail;
    const collapsed = Math.abs(gF.ctrl[0]-gF.yard.centre[0]) < 1e-9 && Math.abs(gF.ctrl[1]-gF.yard.centre[1]) < 1e-9;
    check('furled (h = 0): the sail collapses onto the yard -- a bundle along it', collapsed && gF.hoistFrac === 0,
          `ctrl ${pt(gF.ctrl)} vs yard centre ${pt(gF.yard.centre)}`);
  }
  // the yard leans to leeward with heel, at its own height
  {
    const heeled = SIM.createState({ phi: box.deg2rad(20) }, cfg);
    const g = SIM.render.boatGeometry(heeled, cfg, scale);
    const want = SIM.sailDef(cfg,'topsail').zCE*Math.sin(box.deg2rad(20))*scale;
    const got = g.sails.topsail.yard.centre[0];
    const mastLean = g.masts.main.head[0];
    check('heeled 20 deg: the yard leans by zCE*sin(phi), less than the masthead',
          Math.abs(got-want) < 1e-9 && Math.abs(got) < Math.abs(mastLean),
          `yard centre x = ${got.toFixed(2)} px (zCE*sin20*scale = ${want.toFixed(2)}), masthead x = ${mastLean.toFixed(2)}`);
  }
  // braces run from the yardarms to cleats at the mast row's inner pair (W/R)
  {
    const st = SIM.createState({ sails:{ topsail:{ psiY: 40 } } }, cfg);
    const wind = SIM.computeWind(st, cfg, 0);
    const sheets = SIM.render.deckSheets(st, wind, cfg, SIM.render.deckScale);
    const g = SIM.render.boatGeometry(st, cfg, SIM.render.deckScale);
    const byId = Object.fromEntries(sheets.map(s=>[s.id, s]));
    const arms = g.sails.topsail.arms;
    const same = (a,b) => Math.abs(a[0]-b[0]) < 1e-9 && Math.abs(a[1]-b[1]) < 1e-9;
    const attachOk = same(byId.bTp.clew, arms.port) && same(byId.bTs.clew, arms.stbd);
    const keysOk = byId.bTp.key === 'KeyW' && byId.bTs.key === 'KeyR';
    const bothTaut = byId.bTp.taut && byId.bTs.taut;
    check('each brace runs from its own yardarm to a W/R cleat, and both are taut ropes (round 16 item 4)',
          attachOk && keysOk && bothTaut,
          `${byId.bTp.label} from ${pt(byId.bTp.clew)} to ${pt(byId.bTp.cleat)}; ${byId.bTs.label} from ${pt(byId.bTs.clew)} to ${pt(byId.bTs.cleat)}`);

    /* Round 16 item 4: which brace is being WORKED follows the yard, not the
       wind. On starboard-tack trim (psiY > 0) the yard rests on its lower
       bound, which the port brace sets, so the port brace is the working one
       and the starboard brace is the upper bound just holding on. Both carry
       the yard's load, because both are taut -- unlike a lazy sheet. */
    const load = (state, psiY) => {
      const w = SIM.computeWind(state, cfg, 0);
      SIM.step(state, {}, cfg.dt, cfg);   // one step so sailF exists for the colours
      state.sails.topsail.psiY = psiY;    // the step weathercocks the free yard; read the angle asked for
      return Object.fromEntries(SIM.render.deckSheets(state, w, cfg, SIM.render.deckScale).map(s=>[s.id, s]));
    };
    for (const psiY of [40, -40]) {
      const s2 = SIM.createState({ psi: box.deg2rad(-45), u: 2, sails:{ topsail:{ psiY } } }, cfg);
      const by = load(s2, psiY);
      const wantWorking = psiY > 0 ? 'bTp' : 'bTs';
      const wantLazy    = psiY > 0 ? 'bTs' : 'bTp';
      const ok = by[wantWorking].working && !by[wantLazy].working
              && by[wantLazy].load === by[wantWorking].load && by[wantWorking].load > 0;
      check(`psiY = ${psiY > 0 ? '+' : ''}${psiY}: the ${psiY > 0 ? 'port' : 'starboard'} brace is the one worked, and both carry the yard's load`,
            ok, `bTp working=${by.bTp.working} load=${by.bTp.load.toFixed(1)} N · bTs working=${by.bTs.working} load=${by.bTs.load.toFixed(1)} N`);
    }
    {
      const sq = SIM.createState({ psi: box.deg2rad(-45), u: 2 }, cfg);   // psiY = 0
      const by = load(sq, 0);
      check('a square yard has no leading brace: neither is dimmed', by.bTp.working && by.bTs.working,
            `bTp working=${by.bTp.working}, bTs working=${by.bTs.working}`);
    }
    // a lazy SHEET still shows no tension and is still the slack one
    {
      const s3 = SIM.createState({ psi: box.deg2rad(-45), u: 2 }, cfg);
      const by = load(s3, 0);
      check('a lazy sheet is still slack and untensioned, so braces and sheets read differently',
            by.eJs.load === 0 && !by.eJs.taut && by.eJp.working,
            `jib stbd (lazy) load=${by.eJs.load} taut=${by.eJs.taut} · jib port (working) load=${by.eJp.load.toFixed(1)} N`);
    }
    const cleats = SIM.render.deckCleats(cfg, SIM.render.deckScale);
    check('brace cleats sit abreast the mast, port to port and starboard to starboard',
          cleats.bTp[0] < 0 && cleats.bTs[0] > 0 && Math.abs(cleats.bTp[1] - g.masts.main.y) < 1e-9,
          `bTp ${pt(cleats.bTp)} bTs ${pt(cleats.bTs)} mast y ${g.masts.main.y.toFixed(1)}`);
  }
}

console.log('\n=== CHECK 19 - blanketing (spec 15) ===');
{
  /* Two square sails on one mast, 6 m apart fore and aft: the fixture the brig
     will be made of. With the wind dead astern the after sail is directly
     upwind of the forward one, in its own band, so the forward sail loses 60%
     of its dynamic pressure; lift the after sail's band clear and it loses
     nothing. */
  const base = SIM.defaultConfig();
  const hull = JSON.parse(JSON.stringify(SIM.hull(base)));
  function twoSquares(bandOfAft){
    const cfg = SIM.defaultConfig();
    cfg.ship = {
      id:'fixture', name:'fixture', hull,
      masts: [ { id:'m', x:0, height:12 } ],
      sails: [
        { id:'fwd', name:'Fwd', short:'FWD', type:'square', mast:'m', A:12, xCE:3, zCE:7.2,
          zLo:5.5, zHi:9.0, braceLim:55, i0:5, clScale:0.8, hoist:'setfurl',
          lines:[ { id:'fp', kind:'bracePair', side:'port', key:'KeyW', station:'fore', column:'brace' },
                  { id:'fs', kind:'bracePair', side:'stbd', key:'KeyR', station:'fore', column:'brace' } ] },
        { id:'aft', name:'Aft', short:'AFT', type:'square', mast:'m', A:12, xCE:-3, zCE:7.2,
          zLo:bandOfAft[0], zHi:bandOfAft[1], braceLim:55, i0:5, clScale:0.8, hoist:'setfurl',
          lines:[ { id:'ap', kind:'bracePair', side:'port', key:'KeyS', station:'main', column:'brace' },
                  { id:'as', kind:'bracePair', side:'stbd', key:'KeyF', station:'main', column:'brace' } ] },
      ],
    };
    return cfg;
  }
  // wind dead astern: heading = TWD + 180, so the apparent flow runs forward
  function factors(cfg){
    const st = SIM.createState({ psi: Math.PI }, cfg);   // TWD 0, heading 180 -> TWA 180
    const wind = SIM.computeWind(st, cfg, 0);
    return { f: SIM.blanketFactors(st, wind, cfg), TWA: wind.TWA };
  }
  {
    const cfg = twoSquares([5.5, 9.0]);            // same band
    const { f, TWA } = factors(cfg);
    const ok = Math.abs((f.fwd === undefined ? 1 : f.fwd) - 0.4) < 1e-9 && f.aft === undefined;
    check('same band, directly downwind: the shaded sail keeps 40% of its pressure (loses 60%)',
          ok, `TWA ${TWA.toFixed(0)} deg -> fwd factor ${f.fwd === undefined ? 1 : f.fwd.toFixed(3)}, aft factor ${f.aft === undefined ? 1 : f.aft.toFixed(3)}`);
  }
  {
    const cfg = twoSquares([0.5, 4.0]);            // a band that does not reach the other
    const { f } = factors(cfg);
    const ok = f.fwd === undefined && f.aft === undefined;
    check('different bands: no overlap, so nothing is lost', ok,
          `fwd factor ${f.fwd === undefined ? 1 : f.fwd.toFixed(3)}, aft factor ${f.aft === undefined ? 1 : f.aft.toFixed(3)}`);
  }
  {
    // half the shading sail set -> half the loss, and a furled one shades nothing
    const cfg = twoSquares([5.5, 9.0]);
    const st = SIM.createState({ psi: Math.PI }, cfg);
    SIM.setHoist(st, cfg, 'aft', 0.5);
    const half = SIM.blanketFactors(st, SIM.computeWind(st, cfg, 0), cfg);
    SIM.setHoist(st, cfg, 'aft', 0);
    const none = SIM.blanketFactors(st, SIM.computeWind(st, cfg, 0), cfg);
    check('the loss scales with how much of the shading sail is set', Math.abs(half.fwd - 0.7) < 1e-9 && none.fwd === undefined,
          `aft set 0.5 -> fwd factor ${half.fwd.toFixed(3)}; aft furled -> ${none.fwd === undefined ? 1 : none.fwd.toFixed(3)}`);
  }
  /* Round 18: every shipped fore-and-aft sail declares a band, and the rule is
     "an aft sail shades a forward one, with the apparent wind abaft the beam,
     in proportion to how far abaft, and only where the forward sail is inside
     the aft one's width across the wind". Round 17 asserted the deferral here;
     these lines assert the rule that replaced it, on every shipped rig. */
  const fore = (cfg) => SIM.sailDefs(cfg).filter(d => SIM.sailType(d).trimField === 'delta');
  // a state with the wind at AWA (stationary boat, so AWA = TWA) and every boom
  // and clew at `delta`
  function at(cfg, awa, delta){
    const st = SIM.createState({ psi: -awa*Math.PI/180 }, cfg);   // TWD 0, starboard side
    for (const d of fore(cfg)) st.sails[d.id].delta = delta(d);
    return { st, wind: SIM.computeWind(st, cfg, 0) };
  }
  for (const id of Object.keys(SIM.SHIPS)) {
    const cfg = SIM.defaultConfig();
    cfg.ship = SIM.cloneShip(SIM.SHIPS[id]);
    const banded = SIM.sailDefs(cfg).filter(s=>SIM.sailBand(s)).map(s=>s.id);
    {
      const { st, wind } = at(cfg, 45, () => -25);
      const f = SIM.blanketFactors(st, wind, cfg);
      check(`${id}: close-hauled (AWA 45), sails sheeted: nothing is shaded -- the slot is not a shadow`,
            Object.keys(f).length === 0, `banded: [${banded}], factors ${JSON.stringify(f)}`);
    }
    {
      const { st, wind } = at(cfg, 90, () => -60);
      const f = SIM.blanketFactors(st, wind, cfg);
      check(`${id}: wind on the beam: nothing is shaded (the weight is 0 at 90 deg)`,
            Object.keys(f).length === 0, `factors ${JSON.stringify(f)}`);
    }
    {
      const { st, wind } = at(cfg, 175, () => -75);
      const f = SIM.blanketFactors(st, wind, cfg);
      const aftmost = fore(cfg).reduce((a, d) => d.xCE < a.xCE ? d : a);
      const shaded = Object.keys(f).filter(k => f[k] < 1);
      check(`${id}: running, everything to leeward: the forward sails are shaded and the aftmost (${aftmost.id}) is not`,
            shaded.length > 0 && f[aftmost.id] === undefined,
            Object.entries(f).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(' · '));
    }
  }
  {
    // the goose-winged jib: same run, its clew mirrored to windward
    const cfg = SIM.defaultConfig();
    const same = at(cfg, 175, () => -75), goose = at(cfg, 175, d => d.id === 'jib' ? 75 : -75);
    const fs = SIM.blanketFactors(same.st, same.wind, cfg).jib, fg = SIM.blanketFactors(goose.st, goose.wind, cfg).jib;
    check('sloop run: a jib goose-winged to windward is out of the shadow; on the main\'s side it is in it',
          fs < 0.8 && fg === undefined, `jib keeps ${fs.toFixed(3)} on the main's side, ${fg === undefined ? '1.000' : fg.toFixed(3)} goose-winged`);
  }
  {
    // smooth: no step as the wind goes abaft the beam, and none as the jib's
    // clew is swung across from leeward to windward
    const cfg = SIM.defaultConfig();
    let maxA = 0, prev = null;
    for (let awa = 80; awa <= 180; awa += 0.5) {
      const { st, wind } = at(cfg, awa, () => -75);
      const f = SIM.blanketFactors(st, wind, cfg).jib; const v = f === undefined ? 1 : f;
      if (prev !== null) maxA = Math.max(maxA, Math.abs(v - prev)); prev = v;
    }
    let maxD = 0; prev = null;
    for (let dj = -80; dj <= 80; dj += 0.5) {
      const { st, wind } = at(cfg, 175, d => d.id === 'jib' ? dj : -75);
      const f = SIM.blanketFactors(st, wind, cfg).jib; const v = f === undefined ? 1 : f;
      if (prev !== null) maxD = Math.max(maxD, Math.abs(v - prev)); prev = v;
    }
    check('no switch: the jib\'s factor moves less than 0.02 per half-degree of AWA (80-180) and of its own clew (-80..+80)',
          maxA < 0.02 && maxD < 0.02, `largest step ${maxA.toFixed(4)} per 0.5 deg AWA, ${maxD.toFixed(4)} per 0.5 deg of clew`);
  }
}

console.log('\n=== CHECK 20 - hull outline and declared deck cleats (spec 16 step 2) ===');
{
  /* The sloop declares no `deck`, so it must come out of the fallback path
     with exactly the pixels round 16 drew. Snapshot, not a recomputation --
     recomputing from CLEAT_LAYOUT would pass even if both moved together. */
  const sloopWant = { eM:[0,86.1], eSp:[-29.400000000000002,-30], eSs:[29.400000000000002,-30],
                      eJp:[-39.9,54.6], eJs:[39.9,54.6] };
  const cfg = SIM.defaultConfig();
  const got = SIM.render.deckCleats(cfg, SIM.render.deckScale);
  const same = Object.keys(sloopWant).every(id => got[id] && got[id][0] === sloopWant[id][0] && got[id][1] === sloopWant[id][1])
            && Object.keys(got).length === Object.keys(sloopWant).length;
  check('sloop, with no `deck` declared: cleats bit-identical to round 16', same,
        Object.keys(got).map(id=>`${id}${pt(got[id])}`).join(' '));

  // the outline the drawing uses is the outline the checks measure against
  {
    const o = SIM.render.hullOutline(cfg);
    const L = SIM.hull(cfg).LWL;
    const ok = o.halfB === 0.12*L && o.ctrlB === 0.14*L && o.bow === 0.5*L && o.transom === -0.45*L;
    check('a hull with no `beam` keeps the old 0.12/0.14 * LWL outline, to the bit', ok,
          `halfB ${o.halfB} (0.12*LWL = ${0.12*L}) · ctrlB ${o.ctrlB} (0.14*LWL = ${0.14*L}) · bow ${o.bow} · transom ${o.transom}`);
    // and the half-beam function agrees with the outline at its own landmarks
    const atSh = SIM.render.hullHalfBeam(cfg, o.shoulder);
    const atBow = SIM.render.hullHalfBeam(cfg, o.bow);
    const mid = SIM.render.hullHalfBeam(cfg, (o.bow+o.shoulder)/2);
    check('half-beam: 0 at the stem, full at the shoulder, between the two amidships of the bow curve',
          Math.abs(atBow) < 1e-9 && Math.abs(atSh - o.halfB) < 1e-9 && mid > 0 && mid < o.ctrlB,
          `stem ${atBow.toFixed(3)} m · shoulder ${atSh.toFixed(3)} m · half way ${mid.toFixed(3)} m (halfB ${o.halfB.toFixed(3)}, ctrlB ${o.ctrlB.toFixed(3)})`);
    check('a hull that declares `beam` uses half of it', (()=>{
            const c2 = SIM.defaultConfig(); c2.ship = SIM.cloneShip(SIM.SHIPS.sloop);
            c2.ship.hull.beam = 3.0;
            const o2 = SIM.render.hullOutline(c2);
            return o2.halfB === 1.5 && Math.abs(o2.ctrlB - 1.75) < 1e-12;
          })(), 'beam 3.0 -> halfB 1.50 m, ctrlB 1.75 m');
  }

  /* A declared deck plan has to survive three rules, checked on a fixture here
     so the code is exercised from this step on, and on every shipped ship that
     declares cleats -- which from step 7 is the schooner. */
  function auditDeck(label, cfg){
    const declared = (cfg.ship.deck && cfg.ship.deck.cleats) || null;
    if (!declared) return false;
    const ids = Object.keys(declared);
    const outboard = ids.filter(id=>{
      const c = declared[id];
      return Math.abs(c.x) > SIM.render.hullHalfBeam(cfg, c.y) + 1e-9;
    });
    check(`${label}: every declared cleat sits inside the hull outline`, outboard.length === 0,
          outboard.length ? outboard.map(id=>`${id} at x=${declared[id].x} but the hull is ${SIM.render.hullHalfBeam(cfg, declared[id].y).toFixed(2)} m half-wide at y=${declared[id].y}`).join('; ')
                          : `${ids.length} cleats, widest ${Math.max(...ids.map(id=>Math.abs(declared[id].x))).toFixed(2)} m off the centreline`);

    let closest = Infinity, pair = '';
    for (let i=0;i<ids.length;i++) for (let j=i+1;j<ids.length;j++) {
      const a = declared[ids[i]], b = declared[ids[j]];
      const d = Math.hypot(a.x-b.x, a.y-b.y);
      if (d < closest) { closest = d; pair = `${ids[i]}/${ids[j]}`; }
    }
    check(`${label}: no two cleats within 0.4 m of each other`, closest >= 0.4,
          `closest pair ${pair} at ${closest.toFixed(2)} m`);

    /* A fore-and-aft sail's own sheet must be cleated between its mast and the
       next mast aft -- that is where the horse is, and a sheet led past the
       next mast would foul it. Stated as a rule over the definition rather
       than as "the foresail's cleat", so it holds for a brig too. */
    const masts = SIM.mastDefs(cfg).slice().sort((a,b)=>b.x-a.x);   // bow to stern
    const bad = [];
    for (const { line, sail } of SIM.allLines(cfg)) {
      if (line.side !== 'centre' || !declared[line.id]) continue;
      const mi = masts.findIndex(mt=>mt.id === sail.mast);
      if (mi < 0 || mi === masts.length-1) continue;                // the aftmost sheets to the quarter
      const own = masts[mi].x, next = masts[mi+1].x;
      const y = declared[line.id].y;
      if (!(y < own && y > next)) bad.push(`${line.id} at y=${y}, masts ${own}/${next}`);
    }
    check(`${label}: a fore-and-aft sheet is cleated between its own mast and the next aft`, bad.length === 0,
          bad.length ? bad.join('; ') : 'every centre sheet forward of the aftmost mast is on a horse between the masts');
    return true;
  }

  // fixture: the sloop's hull given a beam and an explicit deck plan
  {
    const fx = SIM.defaultConfig();
    fx.ship = SIM.cloneShip(SIM.SHIPS.sloop);
    fx.ship.hull.beam = 2.4;
    fx.ship.deck = { cleats: { eM:{x:0,y:-2.6}, eSp:{x:-0.9,y:0.9}, eSs:{x:0.9,y:0.9},
                               eJp:{x:-0.7,y:2.2}, eJs:{x:0.7,y:2.2} } };
    auditDeck('fixture (sloop hull, beam 2.4, declared cleats)', fx);
    const cl = SIM.render.deckCleats(fx, 10);
    check('a declared cleat is placed in metres: x to starboard, y forward (screen y aft)',
          cl.eJs[0] === 7 && cl.eJs[1] === -22 && cl.eM[0] === 0 && cl.eM[1] === 26,
          `eJs {x:0.7,y:2.2} at scale 10 -> ${pt(cl.eJs)} · eM {x:0,y:-2.6} -> ${pt(cl.eM)}`);
  }

  // every shipped ship that declares a deck plan (the schooner, from step 7)
  {
    let audited = 0;
    for (const id of Object.keys(SIM.SHIPS)) {
      const c = SIM.defaultConfig(); c.ship = SIM.cloneShip(SIM.SHIPS[id]);
      if (auditDeck(id, c)) audited++;
    }
    console.log(`  shipped ships declaring a deck plan: ${audited} of ${Object.keys(SIM.SHIPS).length}` +
                (audited ? '' : ' — none yet; the fixture above is what exercises the rules'));
  }
}

console.log('\n=== CHECK 21 - booms and the burgee (spec 16 step 3) ===');
{
  /* Two rules over every shipped rig, because a boom that fouls the mast
     behind it or hangs metres past the transom is a definition error the
     drawing would show and nobody would measure. Taken with the boom
     AMIDSHIPS, and against the SPAR's length, not the drawn sail's 0.95 of it
     -- it is the spar that hits the mast. */
  for (const id of Object.keys(SIM.SHIPS)) {
    const cfg = SIM.defaultConfig();
    cfg.ship = SIM.cloneShip(SIM.SHIPS[id]);
    const o = SIM.render.hullOutline(cfg);
    const masts = SIM.mastDefs(cfg).slice().sort((a,b)=>b.x-a.x);   // bow to stern
    const boomed = SIM.sailDefs(cfg).filter(d=>SIM.render.SAIL_GEOMETRY[d.type] && d.type === 'gaff');

    const fouls = [];
    for (const d of boomed) {
      const mi = masts.findIndex(mt=>mt.id === d.mast);
      if (mi < 0 || mi === masts.length-1) continue;
      const tip = SIM.boomTip(cfg, d), next = masts[mi+1].x;
      if (tip - next < 0.5) fouls.push(`${d.id}: tip at ${tip.toFixed(2)} m, ${masts[mi+1].id} mast at ${next.toFixed(2)} m -> ${(tip-next).toFixed(2)} m`);
    }
    check(`${id}: no boom tip comes within 0.5 m of the next mast aft`, fouls.length === 0,
          fouls.length ? fouls.join('; ')
                       : boomed.filter(d=>masts.findIndex(mt=>mt.id===d.mast) < masts.length-1)
                              .map(d=>`${d.id} clears by ${(SIM.boomTip(cfg,d) - masts[masts.findIndex(mt=>mt.id===d.mast)+1].x).toFixed(2)} m`).join(', ')
                         || 'no boom has a mast aft of it');

    const aftmost = boomed.filter(d=>d.mast === masts[masts.length-1].id);
    const over = aftmost.map(d=>({ id:d.id, m: o.transom - SIM.boomTip(cfg, d) }));
    const bad = over.filter(x=>!(x.m >= 0 && x.m <= 1.5));
    check(`${id}: the aftmost boom overhangs the transom by 0-1.5 m`, bad.length === 0 && over.length > 0,
          over.map(x=>`${x.id} overhangs by ${x.m.toFixed(2)} m (transom at ${o.transom.toFixed(2)} m)`).join('; ') || 'no boomed sail on the aftmost mast');
  }

  // boomLen is declarable, and the formula is only the default
  {
    const cfg = SIM.defaultConfig();
    const main = SIM.sailDef(cfg, 'main');
    const dflt = SIM.boomLength(main);
    const declared = SIM.boomLength(Object.assign({}, main, { boomLen: 8.25 }));
    check('boomLen defaults to 0.55*sqrt(A)*1.718 and is overridden when declared',
          Math.abs(dflt - 0.55*Math.sqrt(28)*1.718) < 1e-12 && declared === 8.25,
          `sloop main A=28 -> ${dflt.toFixed(3)} m by formula; declared 8.25 -> ${declared} m`);
  }

  // the burgee flies at the main truck: aftmost mast by default, or the claimer
  {
    const cfg = SIM.defaultConfig();
    const g = SIM.render.boatGeometry(SIM.createState({}, cfg), cfg, 20);
    check('one mast: the burgee mast is that mast (unchanged from round 16)',
          g.burgeeMast === g.mast, `burgee at mast '${g.burgeeMast.id}'`);

    const two = SIM.defaultConfig();
    two.ship = SIM.cloneShip(SIM.SHIPS.sloop);
    two.ship.masts = [ { id:'fore', x: 3.0, height: 8 }, { id:'main', x: -1.0, height: 9 } ];
    const g2 = SIM.render.boatGeometry(SIM.createState({}, two), two, 20);
    check('two masts, neither claiming it: the burgee flies at the AFTMOST masthead',
          g2.burgeeMast.id === 'main', `burgee at '${g2.burgeeMast.id}', not '${SIM.mastDefs(two)[0].id}'`);

    two.ship.masts[0].burgee = true;
    const g3 = SIM.render.boatGeometry(SIM.createState({}, two), two, 20);
    check('a mast may claim the burgee with `burgee: true`', g3.burgeeMast.id === 'fore',
          `burgee at '${g3.burgeeMast.id}'`);
  }
}

console.log('\n=== CHECK 22 - stays as geometry (spec 16 step 4) ===');
{
  /* Point in triangle, barycentric. The sail's own plane: tack and clew on the
     deck, head aloft on the mast. */
  function inTriangle(p, a, b, c){
    const v0 = [b[0]-a[0], b[1]-a[1]], v1 = [c[0]-a[0], c[1]-a[1]], v2 = [p[0]-a[0], p[1]-a[1]];
    const den = v0[0]*v1[1] - v1[0]*v0[1];
    if (Math.abs(den) < 1e-12) return false;
    const u = (v2[0]*v1[1] - v1[0]*v2[1])/den;
    const w = (v0[0]*v2[1] - v2[0]*v0[1])/den;
    return u >= 0 && w >= 0 && u + w <= 1;
  }

  /* The rule that keeps the physics numbers and the drawing honest: a stayed
     sail's DECLARED centre of effort has to fall inside the triangle its own
     stay draws -- tack (x, z), head (mast x, stay head z), clew (tack x minus
     the foot, tack z). If it does not, either xCE/zCE or the stay is wrong,
     and until step 4 nothing could tell. */
  let stayed = 0;
  for (const id of Object.keys(SIM.SHIPS)) {
    const cfg = SIM.defaultConfig();
    cfg.ship = SIM.cloneShip(SIM.SHIPS[id]);
    if (!cfg.ship.stays) continue;
    stayed++;
    const bad = [], named = [];
    for (const def of SIM.sailDefs(cfg)) {
      if (!def.stay) continue;
      const sg = SIM.stayGeometry(cfg, def);
      if (!sg) { bad.push(`${def.id} names stay '${def.stay}', which this ship does not declare`); continue; }
      const tack = [sg.tack.x, sg.tack.z];
      const head = [sg.head.x, sg.head.z];
      const clew = [sg.tack.x - sg.foot, sg.tack.z];
      const ok = inTriangle([def.xCE, def.zCE], tack, head, clew);
      named.push(`${def.id} on '${sg.stayId}': luff ${sg.luff.toFixed(1)} m, foot ${sg.foot.toFixed(1)} m, CE (${def.xCE}, ${def.zCE})`);
      if (!ok) bad.push(`${def.id}: CE (${def.xCE}, ${def.zCE}) is outside tack (${tack}) / head (${head}) / clew (${clew[0].toFixed(1)}, ${clew[1]})`);
    }
    check(`${id}: every stayed sail's declared xCE/zCE falls inside the sail its stay draws`,
          bad.length === 0, bad.length ? bad.join('; ') : named.join(' · '));

    // and the drawn tack really is the stay's deck fitting, not a function of xCE
    const st = SIM.createState({}, cfg);
    const g = SIM.render.boatGeometry(st, cfg, 10);
    const off = SIM.sailDefs(cfg).filter(d=>d.stay && SIM.stayGeometry(cfg, d)).filter(d=>{
      const sg = SIM.stayGeometry(cfg, d);
      return Math.abs(g.sails[d.id].tack[1] - (-sg.tack.x*10)) > 1e-9;
    });
    check(`${id}: each headsail is drawn tacked at its stay's own deck fitting`, off.length === 0,
          off.length ? off.map(d=>d.id).join(', ')
                     : SIM.sailDefs(cfg).filter(d=>d.stay && SIM.stayGeometry(cfg,d))
                         .map(d=>`${d.id} tack at ${(-g.sails[d.id].tack[1]/10).toFixed(1)} m fwd`).join(' · '));
  }
  console.log(`  shipped ships declaring stays: ${stayed} of ${Object.keys(SIM.SHIPS).length}` +
              (stayed ? '' : ' — none yet; the fixture below is what exercises the geometry'));

  /* Fixture, so step 4 is exercised before the schooner exists: the sloop's
     rig given two real stays. The sloop itself keeps opting out. */
  {
    const fx = SIM.defaultConfig();
    fx.ship = SIM.cloneShip(SIM.SHIPS.sloop);
    fx.ship.stays = [
      { id:'foreStay', tack:{ x: 2.6, z: 0.9 }, head:{ mast:'main', z: 8.0 } },
      { id:'jibStay',  tack:{ x: 4.2, z: 1.2 }, head:{ mast:'main', z: 9.0 } },
    ];
    SIM.sailDef(fx, 'staysail').stay = 'foreStay';
    SIM.sailDef(fx, 'jib').stay = 'jibStay';
    const sg = SIM.stayGeometry(fx, SIM.sailDef(fx, 'staysail'));
    const wantLuff = Math.hypot(2.6 - 1.0, 8.0 - 0.9);
    check('stayGeometry: luff is the stay itself, foot is 2A/luff for the area declared',
          Math.abs(sg.luff - wantLuff) < 1e-12 && Math.abs(sg.foot - 2*8/wantLuff) < 1e-12,
          `staysail A=8 on a ${sg.luff.toFixed(2)} m luff -> foot ${sg.foot.toFixed(2)} m`);

    const g = SIM.render.boatGeometry(SIM.createState({}, fx), fx, 10);
    const plain = SIM.render.boatGeometry(SIM.createState({}, SIM.defaultConfig()), SIM.defaultConfig(), 10);
    check('with a stay the tack moves to the stay fitting; without one it is the old xCE-derived point',
          Math.abs(g.sails.staysail.tack[1] - (-26)) < 1e-9 && Math.abs(plain.sails.staysail.tack[1] - (-(2.4/7)*70*0.9)) < 1e-9,
          `stayed tack ${g.sails.staysail.tack[1].toFixed(2)} px (stay at 2.6 m fwd, scale 10) · unstayed ${plain.sails.staysail.tack[1].toFixed(2)} px`);

    // the stayed head leans by the STAY's height, not the masthead's
    const heeled = SIM.render.boatGeometry(SIM.createState({ phi: box.deg2rad(20) }, fx), fx, 10);
    const wantX = 8.0*Math.sin(box.deg2rad(20))*10;
    check("a stayed sail's head leans to leeward by its stay's own height, not the masthead's",
          Math.abs(heeled.sails.staysail.head[0] - wantX) < 1e-9 && Math.abs(heeled.sails.staysail.head[0]) < Math.abs(heeled.masts.main.head[0]),
          `head x ${heeled.sails.staysail.head[0].toFixed(2)} px (stay head 8 m -> ${wantX.toFixed(2)}), masthead ${heeled.masts.main.head[0].toFixed(2)} px`);

    // a named stay that does not resolve is an error, not a silent fallback
    const typo = SIM.defaultConfig();
    typo.ship = SIM.cloneShip(fx.ship);
    SIM.sailDef(typo, 'jib').stay = 'nosuchstay';
    check('a sail naming a stay the ship does not declare resolves to null, so the check above catches it',
          SIM.stayGeometry(typo, SIM.sailDef(typo, 'jib')) === null,
          "jib.stay = 'nosuchstay' -> stayGeometry null");
  }
}

console.log('\n=== CHECK 23 - gaff topsail and sibling state (spec 16 step 5) ===');
{
  /* A fixture: the sloop's main with a gaff topsail declared above it, so the
     mechanism is exercised whether or not a shipped ship carries one. */
  function withTopsail(){
    const cfg = SIM.defaultConfig();
    cfg.ship = SIM.cloneShip(SIM.SHIPS.sloop);
    cfg.ship.hull.name = 'fixture';
    cfg.ship.sails.push({
      id:'gaffTop', name:'Gaff topsail', short:'GAFF T', type:'gaff-topsail',
      mast:'main', above:'main',
      A:9, xCE:-1.0, zCE:8.0, deltaLim:60, i0:6, hoist:'single',
      lines: [ { id:'eGT', kind:'sheet', side:'centre', key:'KeyE', station:'fore', column:'centre', layer:'above' } ],
    });
    return cfg;
  }
  const cfg = withTopsail();
  const wind = { AWA: 45, AWS: 6, appFlowU: -6*Math.cos(box.deg2rad(45)), appFlowV: -6*Math.sin(box.deg2rad(45)) };
  const gt = SIM.sailDef(cfg, 'gaffTop');

  // force the topsail at a drawing clew angle, and vary only the PARENT's peak
  function at(peak, hoist){
    const st = SIM.createState({ sails: { main: { hP: peak }, gaffTop: { h: hoist, delta: -30 } } }, cfg);
    const rig = SIM.rigView(st, cfg);
    return SIM.computeSailForces(st.sails.gaffTop, wind, cfg, 0, gt, undefined, rig);
  }

  const up = at(1, 1), half = at(0.5, 1), down = at(0, 1);
  check('parent peak UP: the topsail has its full area and makes force',
        Math.abs(up.Aeff - 9) < 1e-9 && up.Fx !== 0,
        `Aeff ${up.Aeff.toFixed(3)} m2 (A = 9), Fx ${up.Fx.toFixed(1)} N, Fy ${up.Fy.toFixed(1)} N`);
  check('parent peak DROPPED: effective area is zero and the force goes with it',
        down.Aeff === 0 && down.Fx === 0 && down.Fy === 0 && down.Mz === 0,
        `Aeff ${down.Aeff} m2, Fx ${down.Fx} N, Fy ${down.Fy} N, Mz ${down.Mz} N*m`);
  check('and it scales in between, so scandalizing the main takes the topsail with it',
        Math.abs(half.Aeff - 4.5) < 1e-9 && Math.abs(half.Fx/up.Fx - 0.5) < 1e-9,
        `peak 1.0 -> ${up.Aeff.toFixed(2)} m2 / ${up.Fx.toFixed(1)} N · peak 0.5 -> ${half.Aeff.toFixed(2)} m2 / ${half.Fx.toFixed(1)} N · peak 0 -> ${down.Aeff.toFixed(2)} m2 / ${down.Fx.toFixed(1)} N`);

  // its own halyard still scales it, independently of the parent
  {
    const h1 = at(1, 1), h5 = at(1, 0.5), h0 = at(1, 0);
    check("the topsail's own halyard scales it too, with the parent's peak up",
          Math.abs(h5.Aeff - 4.5) < 1e-9 && h0.Aeff === 0 && Math.abs(h1.Aeff - 9) < 1e-9,
          `hoist 1.0 -> ${h1.Aeff.toFixed(2)} m2 · 0.5 -> ${h5.Aeff.toFixed(2)} m2 · 0 -> ${h0.Aeff.toFixed(2)} m2`);
  }

  /* The plumbing is general, not a gaff-topsail special case: with NO rig view
     the sail reports itself not set rather than NaN, which is what protects
     the direct callers (run-scenarios.mjs calls computeSailForces with six
     arguments) and what round 18 will lean on. */
  {
    const st = SIM.createState({ sails: { gaffTop: { delta: -30 } } }, cfg);
    const noRig = SIM.computeSailForces(st.sails.gaffTop, wind, cfg, 0, gt, undefined);
    const orphan = SIM.cloneShip(cfg.ship);
    const oc = SIM.defaultConfig(); oc.ship = orphan;
    SIM.sailDef(oc, 'gaffTop').above = 'nosuchsail';
    const st2 = SIM.createState({ sails: { gaffTop: { delta: -30 } } }, oc);
    const orphaned = SIM.computeSailForces(st2.sails.gaffTop, wind, oc, 0, SIM.sailDef(oc,'gaffTop'), undefined, SIM.rigView(st2, oc));
    check('no rig view, or a parent that does not exist: area 0, no force, no NaN',
          noRig.Aeff === 0 && noRig.Fx === 0 && orphaned.Aeff === 0 && isFinite(orphaned.Fx),
          `no view -> Aeff ${noRig.Aeff}, Fx ${noRig.Fx} · above:'nosuchsail' -> Aeff ${orphaned.Aeff}, Fx ${orphaned.Fx}`);
  }

  // the whole step runs, and the drawing collapses with the parent's peak
  {
    const st = SIM.createState({ sails: { main: { hP: 1 }, gaffTop: { delta: -30 } } }, cfg);
    for (let n=0;n<20;n++) SIM.step(st, {}, cfg.dt, cfg);
    const gUp = SIM.render.boatGeometry(st, cfg, 20).sails.gaffTop;
    const st2 = SIM.createState({ sails: { main: { hP: 0 }, gaffTop: { delta: -30 } } }, cfg);
    for (let n=0;n<20;n++) SIM.step(st2, {}, cfg.dt, cfg);
    const gDown = SIM.render.boatGeometry(st2, cfg, 20).sails.gaffTop;
    const spanUp = Math.hypot(gUp.clew[0]-gUp.tack[0], gUp.clew[1]-gUp.tack[1]);
    const spanDown = Math.hypot(gDown.clew[0]-gDown.tack[0], gDown.clew[1]-gDown.tack[1]);
    check('the drawn topsail collapses onto its tack when the parent peak is down, and a bundle shows',
          spanUp > 10 && spanDown < 1e-9 && gDown.gaffFrac === 0 && gDown.bundle.length === 2,
          `peak up: foot ${spanUp.toFixed(1)} px · peak down: foot ${spanDown.toFixed(1)} px, gaffFrac ${gDown.gaffFrac}`);
    check('a full physics step with a gaff topsail aboard produces finite state',
          isFinite(st.u) && isFinite(st.phi) && isFinite(st.r) && isFinite(st.sails.gaffTop.delta),
          `u ${st.u.toFixed(4)} m/s, phi ${box.rad2deg(st.phi).toFixed(2)} deg, topsail clew ${st.sails.gaffTop.delta.toFixed(2)} deg`);
  }

  // peakRatio is the shared helper, and gives the gaff type the same number it always had
  {
    const main = SIM.sailDef(SIM.defaultConfig(), 'main');
    const r = SIM.peakRatio(main, { hT: 1, hP: 0.4 });
    const single = SIM.peakRatio(SIM.sailDef(SIM.defaultConfig(), 'jib'), { h: 0.6 });
    check('peakRatio: peak/throat for a gaff sail, the halyard itself for a single-hoist sail',
          Math.abs(r - 0.4) < 1e-12 && Math.abs(single - 0.6) < 1e-12,
          `gaff throat 1.0 peak 0.4 -> ${r} · single hoist 0.6 -> ${single}`);
  }
}

console.log('\n=== CHECK 24 - free chord by the shorter rotation, aback from incidence (round 18 follow-up) ===');
{
  const jib = SIM.sailDef(SIM.defaultConfig(), 'jib');
  const free = (AWA, s, cur) => SIM.freeChord(AWA, jib, s, cur);
  // on a beat the rule gives what the old clamp gave: -AWA - s*i0
  check('beat: the free clew angle is still -AWA - s*i0 (AWA 45 -> -53, from either side of it)',
        free(45, 1, -20) === -53 && free(45, 1, -60) === -53, `from -20: ${free(45,1,-20)} · from -60: ${free(45,1,-60)}`);
  // on a run the branch follows the clew: out to windward stays out
  check('run AWA 170: a clew at +70 (to windward) is carried further OUT, one at -70 further to leeward',
        free(170, -1, 70) === 90 && free(170, 1, -70) === -90, `from +70: ${free(170,-1,70)} · from -70: ${free(170,1,-70)}`);
  check('run AWA 170: the unstable point is the chord into the wind, +10: just past it goes out, just short comes back',
        free(170, -1, 11) > 11 && free(170, 1, 9) < 9, `from +11: ${free(170,-1,11)} · from +9: ${free(170,1,9)}`);
  const ab = (AWA, delta) => SIM.chordAback({ AWA, delta, i: ((AWA + delta + 180) % 360 + 360) % 360 - 180, luffThreshold: 4 });
  const cases = [
    ['beat, jib backed to windward (AWA 45, clew +20)', 45, 20, true],
    ['beat, jib drawing (AWA 45, clew -20)', 45, -20, false],
    ['run, jib goose-winged (AWA 170, clew +70)', 170, 70, false],
    ['run, jib on the main\'s side (AWA 170, clew -70)', 170, -70, false],
    ['tack, old sheet still made fast (AWA -30, clew -20)', -30, -20, true],
    ['tack, sheets switched (AWA -30, clew +20)', -30, 20, false],
  ];
  const bad = cases.filter(([, a, d, want]) => ab(a, d) !== want);
  check('aback means the wind pressure pushes the sail aft, whichever side the clew is on', bad.length === 0,
        cases.map(([n, a, d]) => `${n}: ${ab(a, d) ? 'ABACK' : 'not aback'}`).join(' · '));
}

console.log('\n=== CHECK 25 - sheet interval: a sheet only ever gives room (round 19 step 1) ===');
{
  const cfg = SIM.defaultConfig();
  const beta = cfg.beta;
  const eps = 1e-9;
  const grid = []; for (let k = 0; k <= 100; k++) grid.push(k/100);
  for (const def of SIM.sailDefs(cfg).filter(d => d.lines.some(l => l.kind === 'sheetPair'))) {
    const L = def.deltaLim;
    const one = (e, side) => SIM.sheetIntervalOne(e, side, L, beta);
    // mirror: port at ease e is exactly the starboard interval negated
    const mirrorBad = grid.filter(e => { const p = one(e,'port'), s = one(e,'stbd'); return p.lo !== -s.hi || p.hi !== -s.lo; });
    check(`${def.id}: port interval is the negated starboard interval at every ease (0.01 grid)`, mirrorBad.length === 0,
          `${grid.length - mirrorBad.length}/${grid.length} eases mirror exactly${mirrorBad.length ? `; first bad e=${mirrorBad[0]}` : ''}`);
    // monotone: easing never takes room away, for either side
    let monoBad = null;
    for (const side of ['port','stbd']) for (let a = 0; a < grid.length; a++) for (let b = a+1; b < grid.length; b++) {
      const i1 = one(grid[a], side), i2 = one(grid[b], side);
      if (!(i2.lo <= i1.lo + eps && i2.hi >= i1.hi - eps) && !monoBad) monoBad = `${side} e ${grid[a]} -> ${grid[b]}`;
    }
    check(`${def.id}: for e2 > e1 the interval at e2 contains the interval at e1 (both sides, every pair on the grid)`, !monoBad, monoBad || 'all pairs nested');
    const ps = one(0,'port'), ss = one(0,'stbd');
    check(`${def.id}: hauled home is +-beta exactly`, ps.lo === -beta && ps.hi === -beta && ss.lo === beta && ss.hi === beta,
          `port [${ps.lo}, ${ps.hi}] · stbd [${ss.lo}, ${ss.hi}] · beta ${beta}`);
    const inv = [];
    for (const side of ['port','stbd']) for (let k = 0; k <= 1000; k++) { const iv = one(k/1000, side); if (iv.hi < iv.lo) inv.push(`${side} ${k/1000}`); }
    check(`${def.id}: no single-sheet interval ever inverts (0.001 grid)`, inv.length === 0, inv.length ? `inverted at ${inv.slice(0,3).join(', ')}` : '2002 intervals, none inverted');
    // the old rule's tell: easing a hauled sheet dragged the clew inward
    const old = (es) => { const lo = -(es*L - beta), hi = es*L; return hi < lo ? lo : null; };
    check(`${def.id}: easing the starboard sheet from home never lowers its outer bound (round 18 dragged it +${beta} -> +${(beta - 0.11*L).toFixed(1)} by e 0.11)`,
          grid.every((e, k) => k === 0 || one(e,'stbd').hi >= one(grid[k-1],'stbd').hi),
          `outer bound at e 0, 0.05, 0.11, 0.2, 0.3: ${[0,0.05,0.11,0.2,0.3].map(e => one(e,'stbd').hi.toFixed(1)).join(', ')}` +
          ` (old collapsed clew at e 0.05, 0.11: ${[0.05,0.11].map(e => old(e)).map(x => x === null ? '-' : x.toFixed(1)).join(', ')})`);
    // the pair: both hard -> flat amidships, as §5 has always said
    const both = SIM.sheetIntervalTwo(0, 0, L, beta);
    check(`${def.id}: both sheets hauled home -> empty intersection, clew flat amidships`, both.empty && both.lo === 0 && both.hi === 0, JSON.stringify(both));
    // and from beta/deltaLim up, round 18's interval to the bit
    const r18 = (ep, es) => { const lowP = -ep*L, highP = ep*L - beta, lowS = -(es*L - beta), highS = es*L;
      return { lo: Math.max(lowP, lowS), hi: Math.min(highP, highS) }; };
    const same = grid.filter(e => e >= beta/L).every(ep => grid.filter(e => e >= beta/L).every(es => {
      const a = SIM.sheetIntervalTwo(ep, es, L, beta), b = r18(ep, es);
      return (a.empty && b.hi < b.lo) || (a.lo === b.lo && a.hi === b.hi); }));
    check(`${def.id}: every ease pair >= beta/deltaLim (${(beta/L).toFixed(3)}) gives round 18's interval bit for bit`, same, same ? 'identical' : 'DIFFERS');
  }
}

console.log(`\n${fails === 0 ? 'ALL RENDER CHECKS PASS' : fails + ' RENDER CHECK(S) FAILED'}`);
process.exitCode = fails ? 1 : 0;
