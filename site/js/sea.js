// The Agent Sea · Leeway Live
// A night ocean where every gold ship is an AI agent and every lighthouse is a Leeway check.
// Waves are one analytic sum of sines shared by the GPU (water surface) and the CPU (ships ride it).
import * as THREE from 'three';
import { RoomEnvironment } from '../assets/RoomEnvironment.js';

const $ = (s) => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches;
const DPR = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickAction = () => (Math.random() < 0.1 ? pick(ACTIONS.filter((x) => x.ok < 0.1)) : pick(ACTIONS.filter((x) => x.ok >= 0.1)));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ------------------------------------------------------------------ agents & checks (data) */
const ACTIONS = [
  { a: 'x402 · 0.02 USDC · weather API', ok: 0.97 },
  { a: 'x402 · 0.05 USDC · market data', ok: 0.96 },
  { a: 'swap 0.4 ETH → USDC · Base', ok: 0.85 },
  { a: 'swap 1,200 USDC → PEPE', ok: 0.55 },
  { a: 'send 25 USDC · invoice #212', ok: 0.9 },
  { a: 'unlimited approval → 0x2222…2222', ok: 0.02 },
  { a: 'Permit2 · unlimited · wallet spender', ok: 0.03 },
  { a: 'pay 5 USDC · research feed', ok: 0.75 },
  { a: 'swap 0.05 ETH → AERO', ok: 0.88 },
  { a: 'bridge 300 USDC → Arbitrum', ok: 0.7 },
];
const BLOCK_REASON = ['policy: above daily limit', 'simulation: drainer pattern', 'risk score 91 · honeypot', 'owner denied in Telegram', 'counterparty flagged'];
const LIGHTHOUSES = [
  { name: 'Policy engine', desc: 'limits · allowlists · hard cap' },
  { name: 'Simulation', desc: 'eth_simulateV1 on live state' },
  { name: 'Risk scan', desc: 'honeypot · mint · taxes · LP lock' },
  { name: 'Human approval', desc: 'Telegram · CLI · webhook' },
  { name: 'x402 settlement', desc: 'USDC · EIP-3009 · receipts' },
];

const stats = { agents: 0, checks: 18204 + Math.floor(Math.random() * 400), blocked: 1932 + Math.floor(Math.random() * 60) };
const fmt = (n) => n.toLocaleString('en-US');
function renderStats() {
  $('#stAgents').textContent = fmt(stats.agents);
  $('#stChecks').textContent = fmt(stats.checks);
  $('#stBlocked').textContent = fmt(stats.blocked);
}
function logEvent(id, action, ok, where) {
  const li = document.createElement('li');
  if (!ok) li.className = 'bad';
  const dot = document.createElement('i');
  const text = document.createElement('span');
  const b = document.createElement('b'); b.textContent = id;
  text.append(b, ` · ${action}${where ? ` · ${where}` : ''}`);
  const em = document.createElement('em'); em.textContent = ok ? 'ALLOWED' : 'BLOCKED';
  li.append(dot, text, em);
  const ol = $('#seaLog');
  ol.prepend(li);
  while (ol.children.length > 9) ol.lastChild.remove();
}
const newId = () => `agent#${Math.floor(rnd(100, 9999))}`;

/* ------------------------------------------------------------------ waves (shared GPU/CPU) */
const AMP = reduced ? 0.5 : 1;
const WAVES = [
  // direction (x, z), amplitude, wavelength, speed
  [0.9, 0.42, 0.42, 16, 1.1],
  [-0.35, 0.94, 0.26, 9.5, 1.35],
  [0.62, -0.78, 0.15, 6.2, 1.7],
  [-0.84, -0.54, 0.08, 3.4, 2.3],
].map(([dx, dz, a, len, s]) => { const l = Math.hypot(dx, dz); return { dx: dx / l, dz: dz / l, a: a * AMP, k: (2 * Math.PI) / len, w: s * (reduced ? 0.6 : 1) }; });
function waveAt(x, z, t) {
  let h = 0, gx = 0, gz = 0;
  for (const w of WAVES) {
    const ph = w.k * (w.dx * x + w.dz * z) - w.w * t;
    h += w.a * Math.sin(ph);
    const c = w.a * w.k * Math.cos(ph);
    gx += c * w.dx; gz += c * w.dz;
  }
  return { h, gx, gz };
}
const WAVE_GLSL = `
  uniform vec4 uW[${WAVES.length}];
  uniform vec2 uD[${WAVES.length}];
  uniform float uT;
  vec3 wave(vec2 p) {
    float h = 0.0; vec2 g = vec2(0.0);
    for (int i = 0; i < ${WAVES.length}; i++) {
      float ph = uW[i].y * dot(uD[i], p) - uW[i].z * uT;
      h += uW[i].x * sin(ph);
      g += uW[i].x * uW[i].y * cos(ph) * uD[i];
    }
    return vec3(h, g);
  }`;

/* ------------------------------------------------------------------ scene */
let renderer;
const canvas = $('#sea');
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
} catch (e) {
  document.body.classList.add('no-webgl');
  canvas.style.display = 'none';
  console.warn('[sea] WebGL unavailable, showing the static sea', e);
}

if (renderer) initScene(); else initFallback();

function initFallback() {
  // keep the HUD alive without WebGL: a lightweight event generator
  stats.agents = (mobile ? 10 : 18) + Math.floor(rnd(1180, 1260));
  renderStats();
  setInterval(() => {
    const act = pickAction(), ok = act.ok >= 0.1 && Math.random() < 0.86;
    stats.checks++; if (!ok) stats.blocked++;
    logEvent(newId(), act.a, ok, pick(LIGHTHOUSES).name);
    renderStats();
  }, 1400);
}

function initScene() {
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const FOG = new THREE.Color(0x05070f);
  scene.fog = new THREE.FogExp2(FOG, 0.016);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);

  // the moon sits low over the horizon, behind the fleet: a gold glitter path runs to the viewer
  const MOON = new THREE.Vector3(0.2, 0.075, -1).normalize();

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const moonLight = new THREE.DirectionalLight(0xffd9a0, 2.6); moonLight.position.copy(MOON).multiplyScalar(50);
  const rim = new THREE.DirectionalLight(0x8fa6ff, 0.7); rim.position.set(-20, 12, 30);
  scene.add(moonLight, rim, new THREE.HemisphereLight(0x22305a, 0x0a0705, 0.5));

  /* ---------- sky dome: zenith navy, gold horizon band, stars, moon ---------- */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMoon: { value: MOON }, uT: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uMoon; uniform float uT;
      float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 zen = vec3(0.008,0.012,0.035), mid = vec3(0.02,0.03,0.07);
        vec3 col = mix(mid, zen, smoothstep(0.0, 0.6, y));
        float toMoon = max(dot(d, uMoon), 0.0);
        float band = exp(-abs(y) * 9.0);
        col += vec3(0.85,0.52,0.18) * band * (0.05 + 0.4 * pow(toMoon, 8.0));
        col += vec3(1.0,0.76,0.42) * (pow(toMoon, 1600.0) * 1.6 + pow(toMoon, 200.0) * 0.32 + pow(toMoon, 30.0) * 0.06);
        float disc = smoothstep(0.99955, 0.99975, toMoon);
        col = mix(col, vec3(1.0,0.9,0.7) * 7.0, disc);
        // stars (cell hash on the direction), twinkle, fade near the horizon
        vec3 cell = floor(d * 220.0);
        float s = hash(cell);
        float star = step(0.9965, s) * smoothstep(0.05, 0.35, y);
        star *= 0.5 + 0.5 * sin(uT * (1.0 + s * 3.0) + s * 40.0);
        col += vec3(0.85,0.88,1.0) * star * 0.9;
        if (y < 0.0) col = mix(col, vec3(0.012,0.016,0.03), smoothstep(0.0, -0.05, y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  scene.add(sky);

  /* ---------- water ---------- */
  const SEG = mobile ? 120 : 220;
  const waterGeo = new THREE.PlaneGeometry(320, 320, SEG, SEG); waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uT: { value: 0 }, uMoon: { value: MOON }, uFog: { value: FOG },
      uW: { value: WAVES.map((w) => new THREE.Vector4(w.a, w.k, w.w, 0)) },
      uD: { value: WAVES.map((w) => new THREE.Vector2(w.dx, w.dz)) },
    },
    vertexShader: `${WAVE_GLSL}
      varying vec3 vW; varying vec3 vN; varying float vH;
      void main(){
        vec3 p = (modelMatrix * vec4(position,1.0)).xyz;
        vec3 w = wave(p.xz);
        p.y += w.x;
        vH = w.x;
        vN = normalize(vec3(-w.y, 1.0, -w.z));
        vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: `
      uniform float uT; uniform vec3 uMoon; uniform vec3 uFog;
      varying vec3 vW; varying vec3 vN; varying float vH;
      // fine ripples: a few small travelling sines perturb the normal for the glitter
      vec2 ripple(vec2 p, float t){
        vec2 g = vec2(0.0);
        g += 0.050 * cos(dot(p, vec2(1.7, 0.9)) * 2.1 - t * 2.6) * vec2(1.7, 0.9);
        g += 0.040 * cos(dot(p, vec2(-1.1, 1.9)) * 2.7 - t * 3.1) * vec2(-1.1, 1.9);
        g += 0.028 * cos(dot(p, vec2(2.3, -1.4)) * 3.9 - t * 3.7) * vec2(2.3, -1.4);
        g += 0.020 * cos(dot(p, vec2(-2.9, -0.7)) * 5.3 - t * 4.4) * vec2(-2.9, -0.7);
        return g;
      }
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float dist = length(cameraPosition - vW);
        vec2 r = ripple(vW.xz, uT) * smoothstep(90.0, 10.0, dist);
        vec3 N = normalize(vN + vec3(-r.x, 0.0, -r.y));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        // reflected sky: same palette as the dome
        float ry = max(R.y, 0.0);
        float toMoon = max(dot(R, uMoon), 0.0);
        vec3 skyc = mix(vec3(0.02,0.03,0.07), vec3(0.008,0.012,0.035), smoothstep(0.0, 0.6, ry));
        skyc += vec3(0.85,0.52,0.18) * exp(-ry * 9.0) * (0.025 + 0.22 * pow(toMoon, 10.0));
        vec3 deep = vec3(0.004, 0.009, 0.022);
        vec3 crest = vec3(0.02, 0.045, 0.09);
        vec3 base = mix(deep, crest, smoothstep(-0.4, 0.6, vH));
        vec3 col = mix(base, skyc, fres);
        // gold moon glitter: a tight hot core and a broad warm sheen
        float sp = pow(toMoon, 1800.0) * 11.0 + pow(toMoon, 420.0) * 0.45 + pow(toMoon, 60.0) * 0.035;
        col += vec3(1.0, 0.76, 0.38) * sp;
        // atmospheric fade to the horizon glow
        float f = 1.0 - exp(-dist * 0.016);
        vec3 haze = uFog + vec3(0.32,0.2,0.07) * pow(max(dot(normalize(vW - cameraPosition), uMoon), 0.0), 14.0) * 0.32;
        col = mix(col, haze, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  scene.add(water);

  /* ---------- gold ship (Drift mark) ---------- */
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xffdc8a, metalness: 1, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 2.2 });
  const K = 0.034;
  const drift = () => {
    const a = (8 * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const rot = ([x, y]) => [20 + (x - 20) * c - (y - 20) * sn, 20 + (x - 20) * sn + (y - 20) * c];
    const main = [[10, 4], [10, 30.5], [25, 30.5]].map(rot);
    const jib = [[14.6, 8.4], [28.4, 30.5], [33, 30.5]].map(rot);
    const hull = [[5, 34.2], [35, 34.2], [32.4, 37.2], [7.6, 37.2]];
    return [main, jib, hull].map((poly) => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2((x - 20) * K, (37.2 - y) * K))));
  };
  const shipGeo = new THREE.ExtrudeGeometry(drift(), { depth: 0.09, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.018, bevelSegments: 3, curveSegments: 1 });
  shipGeo.translate(0, -0.02, -0.045);

  // soft glow texture shared by ship glints and lighthouse lamps
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,240,200,0.55)'); g.addColorStop(0.5, 'rgba(255,200,120,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  /* ---------- lighthouses ---------- */
  const LH = [];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.9, metalness: 0.1, flatShading: true });
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x1b1c24, roughness: 0.45, metalness: 0.6 });
  const bandMat = new THREE.MeshPhysicalMaterial({ color: 0xffd98a, metalness: 1, roughness: 0.25, envMapIntensity: 2 });
  const beamGeo = new THREE.ConeGeometry(2.6, 18, 40, 1, true); beamGeo.translate(0, -9, 0); beamGeo.rotateZ(Math.PI / 2); // apex at origin, opening along +x
  const ringR = mobile ? 15 : 19;
  LIGHTHOUSES.forEach((d, i) => {
    const ang = (i / LIGHTHOUSES.length) * Math.PI * 2 + 0.5;
    const r = ringR * (i % 2 ? 1.18 : 0.88);
    const pos = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r - 4);
    const g = new THREE.Group(); g.position.copy(pos);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), rockMat); rock.scale.set(1.4, 0.55, 1.2); rock.position.y = -0.05; rock.rotation.y = i;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 2.6, 24), towerMat); tower.position.y = 1.55;
    const band1 = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.345, 0.12, 24), bandMat); band1.position.y = 1.0;
    const band2 = band1.clone(); band2.position.y = 2.0; band2.scale.setScalar(0.88);
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24), bandMat); gallery.position.y = 2.9;
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1cc });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 12), lampMat); lamp.position.y = 3.12;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.36, 24), bandMat); cap.position.y = 3.46;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe2a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.position.y = 3.12; glow.scale.setScalar(4);
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uColor: { value: new THREE.Color(0xffe6b0) }, uI: { value: 1 } },
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
        void main(){ vP = position; vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uI; varying vec3 vP; varying vec3 vN; varying vec3 vV;
        void main(){
          float along = clamp(vP.x / 18.0, 0.0, 1.0);
          float fall = pow(1.0 - along, 1.6);
          float edge = pow(abs(dot(normalize(vN), vV)), 1.4);
          float a = fall * edge * 0.32 * uI;
          gl_FragColor = vec4(uColor * a, a);
          #include <colorspace_fragment>
        }`,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.y = 3.12;
    const beam2 = new THREE.Mesh(beamGeo, beamMat); beam2.position.y = 3.12; beam2.rotation.y = Math.PI;
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 4.5, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1.6;
    g.add(rock, tower, band1, band2, gallery, lamp, cap, glow, beam, beam2, hit);
    scene.add(g);
    LH.push({ ...d, g, pos, beam, beam2, beamMat, glow, lampMat, hit, spin: rnd(0.35, 0.6) * (i % 2 ? -1 : 1), flash: null, checks: Math.floor(rnd(2400, 4600)), blocked: 0 });
    LH[i].blocked = Math.floor(LH[i].checks * rnd(0.07, 0.13));
  });
  const BEAM_IDLE = new THREE.Color(0xffe6b0), GREEN = new THREE.Color(0x3dff9a), RED = new THREE.Color(0xff3b3b);

  /* ---------- ships ---------- */
  const SHIPS = [];
  const N = mobile ? 10 : 18;
  const TRAIL = 46;
  for (let i = 0; i < N; i++) {
    const mesh = new THREE.Mesh(shipGeo, gold);
    mesh.scale.setScalar(rnd(1.55, 1.85));
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc46a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    glint.scale.set(3.4, 1.3, 1);
    const tg = new THREE.BufferGeometry();
    const tp = new Float32Array(TRAIL * 3), tc = new Float32Array(TRAIL * 3);
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    trail.frustumCulled = false;
    scene.add(mesh, glint, trail);
    const from = Math.floor(Math.random() * LH.length);
    let to = (from + 1 + Math.floor(Math.random() * (LH.length - 1))) % LH.length;
    const start = LH[from].pos.clone().lerp(LH[to].pos, Math.random());
    start.x += rnd(-3, 3); start.z += rnd(-3, 3);
    const s = {
      mesh, glint, trail, tp, tc, id: newId(), act: pickAction(), pos: start, heading: Math.atan2(LH[to].pos.z - start.z, LH[to].pos.x - start.x),
      speed: rnd(1.1, 1.9), from, to, side: rnd(2.2, 3.4) * (Math.random() < 0.5 ? -1 : 1), state: 'sail', stateT: 0, lastSample: 0, hist: [],
    };
    for (let k = 0; k < TRAIL; k++) s.hist.push(start.clone());
    SHIPS.push(s);
  }
  stats.agents = N + Math.floor(rnd(1180, 1260)); // the visible fleet is a window onto the whole sea
  renderStats();

  const checkAt = (s, lh) => {
    const okP = s.act.ok < 0.1 ? 0 : 0.86 + (s.act.ok - 0.5) * 0.12;
    const ok = Math.random() < okP;
    lh.flash = { color: ok ? GREEN : RED, t: 0 };
    lh.checks++; stats.checks++;
    if (!ok) { lh.blocked++; stats.blocked++; }
    logEvent(s.id, s.act.a, ok, ok ? lh.name : pick(BLOCK_REASON));
    renderStats();
    if (focus.lh === lh) renderFocus(lh);
    s.result = ok ? 'ALLOWED' : 'BLOCKED';
    if (ok) {
      s.from = s.to;
      s.to = (s.to + 1 + Math.floor(Math.random() * (LH.length - 1))) % LH.length;
      s.state = 'sail';
      if (Math.random() < 0.45) s.act = pickAction();
    } else {
      // blocked: the ship turns back toward where it came from and slows down for a while
      const back = s.from; s.from = s.to; s.to = back;
      s.state = 'blocked'; s.stateT = 0;
      s.act = pick(ACTIONS.filter((x) => x.ok > 0.5));
    }
  };

  /* ---------- camera rig ---------- */
  const rig = { az: 1.62, pol: 1.34, rad: mobile ? 46 : 38, target: new THREE.Vector3(0, 1.2, -3) };
  const goal = { az: rig.az, pol: rig.pol, rad: rig.rad, target: rig.target.clone() };
  let fly = null, lastInput = performance.now();
  const clampGoal = () => { goal.pol = THREE.MathUtils.clamp(goal.pol, 0.8, 1.46); goal.rad = THREE.MathUtils.clamp(goal.rad, 12, 64); };
  const pointers = new Map();
  let pinch0 = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
    canvas.classList.add('is-drag'); lastInput = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = -(e.clientY / innerHeight) * 2 + 1; mouse.cx = e.clientX; mouse.cy = e.clientY; mouse.in = true;
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) { goal.rad *= pinch0 / d; pinch0 = d; clampGoal(); }
      return;
    }
    goal.az -= (e.clientX - p.x) * 0.0042; goal.pol -= (e.clientY - p.y) * 0.003; clampGoal();
    p.x = e.clientX; p.y = e.clientY; fly = null; lastInput = performance.now();
  });
  const up = (e) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0;
    if (!pointers.size) canvas.classList.remove('is-drag');
    if (p && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 6) click(e);
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { mouse.in = false; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); goal.rad *= Math.exp(e.deltaY * 0.0011); clampGoal(); lastInput = performance.now(); }, { passive: false });

  /* ---------- picking: hover ships, click lighthouses ---------- */
  const ray = new THREE.Raycaster();
  const mouse = { x: 0, y: 0, cx: 0, cy: 0, in: false };
  const tip = $('#seaTip'), focusEl = $('#seaFocus');
  const focus = { lh: null };
  const renderFocus = (lh) => {
    $('#focusName').textContent = `Lighthouse · ${lh.name}`;
    $('#focusDesc').textContent = lh.desc;
    $('#focusChecks').textContent = fmt(lh.checks);
    $('#focusBlocked').textContent = fmt(lh.blocked);
  };
  function click(e) {
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(LH.map((l) => l.hit), false)[0];
    if (hit) {
      const lh = LH.find((l) => l.hit === hit.object);
      focus.lh = lh; renderFocus(lh); focusEl.classList.add('is-on'); focusEl.setAttribute('aria-hidden', 'false');
      fly = { t: 0, from: { az: rig.az, pol: rig.pol, rad: rig.rad, target: rig.target.clone() }, to: { az: goal.az, pol: 1.16, rad: 13, target: lh.pos.clone().setY(1.4) } };
    } else if (focus.lh) {
      focus.lh = null; focusEl.classList.remove('is-on'); focusEl.setAttribute('aria-hidden', 'true');
      fly = { t: 0, from: { az: rig.az, pol: rig.pol, rad: rig.rad, target: rig.target.clone() }, to: { az: rig.az, pol: 1.34, rad: mobile ? 46 : 38, target: new THREE.Vector3(0, 1.2, -3) } };
    }
    lastInput = performance.now();
  }
  const shortAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const projected = new THREE.Vector3();
  let hoverShip = null, pickClock = 0;

  /* ---------- resize / visibility ---------- */
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = w / h < 0.8 ? 58 : 42; camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();
  let hidden = document.hidden;
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; clock.getDelta(); });

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  const tmpF = new THREE.Vector3(), tmpU = new THREE.Vector3(), tmpS = new THREE.Vector3(), m4 = new THREE.Matrix4(), gc = new THREE.Color(), trailCol = new THREE.Color(0xffc56a);
  let t = 0;
  renderer.setAnimationLoop(() => {
    if (hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    water.material.uniforms.uT.value = t;
    sky.material.uniforms.uT.value = t;

    // camera: eased fly-to, damped orbit, idle drift
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 1.7);
      const k = ease(fly.t);
      goal.az = fly.from.az + shortAngle(fly.to.az - fly.from.az) * k;
      goal.pol = THREE.MathUtils.lerp(fly.from.pol, fly.to.pol, k);
      goal.rad = THREE.MathUtils.lerp(fly.from.rad, fly.to.rad, k);
      goal.target.lerpVectors(fly.from.target, fly.to.target, k);
      if (fly.t >= 1) fly = null;
    } else if (!reduced && performance.now() - lastInput > 4000) {
      goal.az += dt * 0.022;
    }
    const damp = 1 - Math.pow(0.0015, dt);
    rig.az += shortAngle(goal.az - rig.az) * damp;
    rig.pol += (goal.pol - rig.pol) * damp;
    rig.rad += (goal.rad - rig.rad) * damp;
    rig.target.lerp(goal.target, damp);
    camera.position.set(
      rig.target.x + rig.rad * Math.sin(rig.pol) * Math.cos(rig.az),
      rig.target.y + rig.rad * Math.cos(rig.pol),
      rig.target.z + rig.rad * Math.sin(rig.pol) * Math.sin(rig.az),
    );
    const wc = waveAt(camera.position.x, camera.position.z, t).h;
    camera.position.y = Math.max(camera.position.y, wc + 2.2);
    camera.lookAt(rig.target);

    // lighthouses: rotating beams, check flashes
    for (const lh of LH) {
      lh.beam.rotation.y += lh.spin * dt; lh.beam2.rotation.y = lh.beam.rotation.y + Math.PI;
      let col = BEAM_IDLE, I = 1;
      if (lh.flash) {
        lh.flash.t += dt;
        const f = Math.max(0, 1 - lh.flash.t / 1.4);
        col = gc.copy(BEAM_IDLE).lerp(lh.flash.color, Math.min(1, f * 1.6));
        I = 1 + f * 2.2;
        if (lh.flash.t > 1.4) lh.flash = null;
      }
      lh.beamMat.uniforms.uColor.value.copy(col);
      lh.beamMat.uniforms.uI.value = I;
      lh.glow.material.color.copy(col);
      lh.glow.scale.setScalar(4 + (I - 1) * 2.2 + Math.sin(t * 2 + lh.pos.x) * 0.15);
      lh.lampMat.color.copy(col);
    }

    // ships: steer toward the gap beside the next lighthouse, ride the waves
    for (const s of SHIPS) {
      const lh = LH[s.to];
      const dx = lh.pos.x - s.pos.x, dz = lh.pos.z - s.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      // aim at a point beside the lighthouse so the ship sails past, not into the rock
      const ax = lh.pos.x + (-dz / d) * s.side, az = lh.pos.z + (dx / d) * s.side;
      const want = Math.atan2(az - s.pos.z, ax - s.pos.x);
      s.heading += shortAngle(want - s.heading) * Math.min(1, dt * (s.state === 'blocked' ? 1.6 : 0.9));
      let v = s.speed * (s.state === 'blocked' ? 0.55 : 1);
      if (s.state === 'blocked') { s.stateT += dt; if (s.stateT > 5) s.state = 'sail'; }
      s.pos.x += Math.cos(s.heading) * v * dt;
      s.pos.z += Math.sin(s.heading) * v * dt;
      if (Math.hypot(ax - s.pos.x, az - s.pos.z) < 1.6) checkAt(s, lh);

      const w = waveAt(s.pos.x, s.pos.z, t);
      s.pos.y = w.h;
      tmpF.set(Math.cos(s.heading), 0, Math.sin(s.heading));
      tmpU.set(-w.gx, 1, -w.gz).normalize().lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize();
      tmpS.crossVectors(tmpF, tmpU).normalize();
      tmpF.crossVectors(tmpU, tmpS).normalize();
      m4.makeBasis(tmpF, tmpU, tmpS);
      s.mesh.quaternion.setFromRotationMatrix(m4);
      s.mesh.position.set(s.pos.x, s.pos.y + 0.02, s.pos.z);
      s.glint.position.set(s.pos.x, s.pos.y + 0.05, s.pos.z);

      // wake trail
      s.lastSample += dt;
      if (s.lastSample > 0.09) {
        s.lastSample = 0;
        s.hist.pop(); s.hist.unshift(new THREE.Vector3(s.pos.x - tmpF.x * 0.5, 0, s.pos.z - tmpF.z * 0.5));
      }
      for (let k = 0; k < TRAIL; k++) {
        const p = s.hist[k];
        s.tp[k * 3] = p.x; s.tp[k * 3 + 1] = waveAt(p.x, p.z, t).h + 0.04; s.tp[k * 3 + 2] = p.z;
        const fade = Math.pow(1 - k / TRAIL, 1.8) * (s.state === 'blocked' ? 0.5 : 0.75);
        const c = s.state === 'blocked' && k < 18 ? RED : trailCol;
        s.tc[k * 3] = c.r * fade; s.tc[k * 3 + 1] = c.g * fade; s.tc[k * 3 + 2] = c.b * fade;
      }
      s.trail.geometry.attributes.position.needsUpdate = true;
      s.trail.geometry.attributes.color.needsUpdate = true;
    }

    // hover tooltip (picked at ~12 Hz)
    pickClock += dt;
    if (mouse.in && !pointers.size && pickClock > 0.08) {
      pickClock = 0;
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(SHIPS.map((s) => s.mesh), false)[0];
      hoverShip = hit ? SHIPS.find((s) => s.mesh === hit.object) : null;
      canvas.style.cursor = hoverShip ? 'pointer' : '';
    }
    if (hoverShip) {
      projected.copy(hoverShip.mesh.position).setY(hoverShip.mesh.position.y + 1.4).project(camera);
      const x = (projected.x * 0.5 + 0.5) * innerWidth, y = (-projected.y * 0.5 + 0.5) * innerHeight;
      $('#tipId').textContent = hoverShip.id;
      $('#tipAction').textContent = hoverShip.act.a;
      const st = $('#tipState');
      const state = hoverShip.state === 'blocked' ? 'blocked · turning back' : hoverShip.result === 'ALLOWED' ? 'last check · allowed' : `sailing to ${LH[hoverShip.to].name}`;
      st.textContent = state;
      st.className = hoverShip.state === 'blocked' ? 'bad' : hoverShip.result === 'ALLOWED' ? '' : 'sail';
      tip.style.transform = `translate3d(${Math.round(Math.min(innerWidth - 220, x + 14))}px, ${Math.round(Math.max(70, y - 30))}px, 0)`;
      tip.classList.add('is-on');
    } else tip.classList.remove('is-on');

    renderer.render(scene, camera);
  });

  // a few events right away so the log is never empty
  for (let i = 0; i < 5; i++) {
    const s = SHIPS[(i * 3) % SHIPS.length]; const ok = s.act.ok >= 0.1 && Math.random() < 0.85;
    logEvent(s.id, s.act.a, ok, ok ? pick(LH).name : pick(BLOCK_REASON));
  }
  // test hooks for screenshots: hover a ship / focus a lighthouse programmatically
  window.__sea = {
    focus: (i = 0) => { const lh = LH[i]; const r = new THREE.Vector3(); lh.hit.getWorldPosition(r); r.project(camera); click({ clientX: (r.x * 0.5 + 0.5) * innerWidth, clientY: (-r.y * 0.5 + 0.5) * innerHeight }); },
    shipScreen: (i = 0) => { const p = SHIPS[i].mesh.position.clone().setY(SHIPS[i].mesh.position.y + 0.4).project(camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; },
    lhScreen: (i = 0) => { const p = LH[i].pos.clone().setY(1.6).project(camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; },
  };
}
