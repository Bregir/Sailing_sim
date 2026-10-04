// Smoke test: the harness never calls draw() (getContext returns null there),
// so drive the real draw() against a recording 2D context in every mode that
// matters and make sure it completes without throwing and paints something.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const PROJ = path.dirname(fileURLToPath(import.meta.url));

function loadSim(htmlPath){
  const html = fs.readFileSync(htmlPath, 'utf8');
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
  vm.runInContext(m[1], sandbox, { filename: htmlPath });
  return sandbox;
}

function recordingCtx(){
  const c = { ops:0, strokes:0, fills:0, texts:0, depth:0, maxDepth:0 };
  const bump = () => { c.ops++; };
  for (const k of ['clearRect','beginPath','moveTo','lineTo','quadraticCurveTo','arc','closePath','setLineDash','translate','rotate','scale','fillRect','strokeRect'])
    c[k] = bump;
  c.save = () => { c.ops++; c.depth++; c.maxDepth = Math.max(c.maxDepth, c.depth); };
  c.restore = () => { c.ops++; c.depth--; if (c.depth < 0) throw new Error('ctx.restore() without a matching save()'); };
  c.stroke = () => { c.ops++; c.strokes++; };
  c.fill = () => { c.ops++; c.fills++; };
  c.fillText = () => { c.ops++; c.texts++; };
  // rough monospace metric so the HUD's width math (round 8) runs without a
  // real canvas -- not pixel-accurate, only needs to be non-zero and finite
  c.measureText = (s) => ({ width: (s ? s.length : 0) * 8 });
  return c;
}

const box = loadSim(`${PROJ}/index.html`);
const SIM = box.SIM;
const cfg = SIM.cloneConfig(SIM.defaultConfig());
cfg.TWS = 6; cfg.TWD = 30;

// 60 s of real sailing so there is a wake, a bow wave and filled sails
const built = box.setupSteady(cfg, { tackSign:1, targetTWA:45, eM:0.15, eWorking:0.20, eLazy:1.0 });
const st = built.state;
for (let n=0; n<Math.round(60/cfg.dt); n++) SIM.step(st, built.controls, cfg.dt, cfg);
const wind = st._last.wind;

const cases = [
  ['north-up, default zoom',   { headingUp:false, scale:SIM.render.defaultScale(900, cfg) }, st],
  ['heading-up, default zoom', { headingUp:true,  scale:SIM.render.defaultScale(900, cfg) }, st],
  ['north-up, zoom 4 (min)',   { headingUp:false, scale:4 },  st],
  ['heading-up, zoom 40 (max)',{ headingUp:true,  scale:40 }, st],
];
// a stopped boat with luffing + aback sails and no wake
const stopped = SIM.createState({});
stopped.sails.main.luffing = true; stopped.sails.jib.aback = true;
cases.push(['stopped, empty wake, luffing + aback', { headingUp:false, scale:20 }, stopped]);
// far from the world origin with live wind on: the case that showed the wave
// field sweeping sideways when the crest phase was anchored at the origin
const far = SIM.createState({});
Object.assign(far, { x: st.x + 800, y: st.y - 600, psi: st.psi, u: st.u, v: st.v, r: st.r, phi: st.phi, tSim: st.tSim });
far.wake = st.wake.map(p=>({ x:p.x+800, y:p.y-600, t:p.t }));
cases.push(['800 m from the origin, live wind on', { headingUp:true, scale:20 }, far]);

let bad = 0;
for (const [label, camOver, state] of cases) {
  const cam = Object.assign({ x:state.x, y:state.y, cx:600, cy:450, psi:state.psi }, camOver);
  const ctx = recordingCtx();
  let w = wind;
  if (state === stopped) w = SIM.computeWind(state, cfg, state.tSim);
  if (state === far) { const lc = SIM.cloneConfig(cfg); lc.liveWind = true; w = SIM.computeWind(state, lc, state.tSim); }
  try {
    SIM.render.draw(ctx, state, w, cam, cfg, 1200, 900);
  } catch (e) {
    bad++; console.log(`  FAIL  ${label}: ${e.message}`); continue;
  }
  const ok = ctx.depth === 0 && ctx.strokes > 20 && ctx.fills > 0;
  if (!ok) bad++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${label}: ${ctx.ops} ops, ${ctx.strokes} strokes, ${ctx.fills} fills, save/restore balanced (depth ${ctx.depth}, max nesting ${ctx.maxDepth})`);
}
/* Round 15: the topsail cutter, whose square topsail is a shape neither view
   had before -- a yard through the mast with the sail bellying off it. Run at
   a reaching state with the yard braced, at a furled one, and hard aback. */
const cutCfg = SIM.cloneConfig(SIM.defaultConfig());
cutCfg.ship = SIM.cloneShip(SIM.SHIPS.topsailCutter);
cutCfg.TWS = 6; cutCfg.TWD = 30;
function cutterState(psiY, hoist){
  const b = box.setupSteady(cutCfg, { tackSign:1, targetTWA:100, eM:0.55, eWorking:0.55, eLazy:1.0 });
  SIM.setHoist(b.state, cutCfg, 'topsail', hoist);
  SIM.braceTo(b.state, cutCfg, 'topsail', psiY);
  for (let n=0; n<Math.round(40/cutCfg.dt); n++) SIM.step(b.state, b.controls, cutCfg.dt, cutCfg);
  return b.state;
}
const cutSet = cutterState(45, 1), cutFurled = cutterState(45, 0), cutAback = cutterState(-55, 1);
/* Round 16 item 6: the yard braced hard up with the port brace home, then the
   starboard brace hauled against it -- the haul is refused and the rope comes
   bar-taut, which the schematic draws red with a caption. */
const cutBarTaut = (()=>{
  const st = cutterState(55, 1);
  const sheets = {}; sheets[SIM.lineIdFor(cutCfg, 'topsail', 'stbd')] = -1;
  for (let n=0;n<10;n++) SIM.step(st, { sheets }, cutCfg.dt, cutCfg);
  return st;
})();
for (const [label, state] of [
  ['cutter: topsail set and braced', cutSet],
  ['cutter: topsail furled', cutFurled],
  ['cutter: topsail hard aback', cutAback],
]) {
  const cam = { x:state.x, y:state.y, cx:600, cy:450, psi:state.psi, headingUp:false, scale:20 };
  const ctx = recordingCtx();
  try {
    SIM.render.draw(ctx, state, state._last.wind, cam, cutCfg, 1200, 900);
  } catch (e) { bad++; console.log(`  FAIL  ${label}: ${e.message}`); continue; }
  const ok = ctx.depth === 0 && ctx.strokes > 20 && ctx.fills > 0;
  if (!ok) bad++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${label}: ${ctx.ops} ops, ${ctx.strokes} strokes, ${ctx.fills} fills, save/restore balanced (depth ${ctx.depth})`);
}

// deck schematic (round 10): its own always-bow-up, fixed-scale draw path,
// exercised at a normal sailing state and at a luffing/aback stopped one
for (const [label, state, w, c] of [
  ['deck: sailing (a)', st, wind, cfg],
  ['deck: stopped, luffing + aback', stopped, SIM.computeWind(stopped, cfg, stopped.tSim), cfg],
  ['deck: cutter, topsail braced', cutSet, cutSet._last.wind, cutCfg],
  ['deck: cutter, topsail aback', cutAback, cutAback._last.wind, cutCfg],
  // round 16 item 6: a brace hauled bar-taut adds the red rope and the
  // "ease the other brace" caption, which is its own code path
  ['deck: cutter, brace bar-taut', cutBarTaut, cutBarTaut._last.wind, cutCfg],
]) {
  const ctx = recordingCtx();
  try {
    SIM.render.drawDeck(ctx, state, w, c, 300, 280);
  } catch (e) {
    bad++; console.log(`  FAIL  ${label}: ${e.message}`); continue;
  }
  // Round 12: drawDeck now shares drawBoatBody with the water view (hull +
  // main sail fill + 2 mast dots = 4 fills; no more separate clew dots, since
  // the water view never had them either -- "one visual language for both
  // views" per §12 item 4) plus 5 sheets + cleat T-marks, well over 5 strokes.
  const ok = ctx.depth === 0 && ctx.strokes >= 5 && ctx.fills >= 4;
  if (!ok) bad++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${label}: ${ctx.ops} ops, ${ctx.strokes} strokes, ${ctx.fills} fills, save/restore balanced (depth ${ctx.depth})`);
}

console.log(bad ? `\n${bad} SMOKE CASE(S) FAILED` : '\nDRAW RUNS CLEAN IN ALL MODES');
process.exitCode = bad ? 1 : 0;
