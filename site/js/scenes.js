// AURUM MCP · Three.js scenes (globe + procedural gold objects)
import * as THREE from 'three';
import { RoomEnvironment } from '../assets/RoomEnvironment.js';
import { initGlobe } from './globe.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 900px)').matches;
const DPR = Math.min(devicePixelRatio, isMobile ? 1.5 : 2);

const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = (e.clientY / innerHeight) * 2 - 1;
}, { passive: true });

/* =========================================================
   Scene manager: one renderer per canvas, render only when visible
   ========================================================= */
const scenes = [];
function makeStage(canvas, { fov = 35, z = 6 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  camera.position.set(0, 0, z);
  const stage = { canvas, renderer, scene, camera, visible: false, update: null };
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stage.onResize?.(w, h);
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  new IntersectionObserver((e) => { stage.visible = e[0].isIntersecting; }, { rootMargin: '120px' }).observe(canvas);
  scenes.push(stage);
  return stage;
}

const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  pointer.sx += (pointer.x - pointer.sx) * 0.05;
  pointer.sy += (pointer.y - pointer.sy) * 0.05;
  for (const s of scenes) {
    if (!s.visible) continue;
    // gentle ambient motion is kept even with reduced-motion; only big intro/tour effects are dropped
    s.update?.(t, dt);
    s.renderer.render(s.scene, s.camera);
  }
  requestAnimationFrame(loop);
}

/* =========================================================
   Gold material + environment
   ========================================================= */
function goldEnv(stage) {
  const pmrem = new THREE.PMREMGenerator(stage.renderer);
  stage.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  const key = new THREE.DirectionalLight(0xfff4dc, 3.2); key.position.set(3, 4, 5);
  const rim = new THREE.DirectionalLight(0xffd08a, 2.2); rim.position.set(-5, -2, -3);
  const top = new THREE.DirectionalLight(0xffffff, 1.6); top.position.set(0, 6, 1);
  const fill = new THREE.DirectionalLight(0x9fb0ff, 0.5); fill.position.set(-4, 3, 2);
  stage.scene.add(key, rim, top, fill, new THREE.HemisphereLight(0xfff0d0, 0x2a1a08, 0.6));
  stage.renderer.toneMappingExposure = 1.25;
}
const gold = (opts = {}) => new THREE.MeshPhysicalMaterial({
  color: 0xffdf92, metalness: 1, roughness: 0.18, clearcoat: 0.5, clearcoatRoughness: 0.1,
  envMapIntensity: 2.1, ...opts,
});

/* squircle (rounded square) curve for the chain links */
class Squircle extends THREE.Curve {
  constructor(size = 1, power = 0.42) { super(); this.size = size; this.p = power; }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2 + Math.PI / 4;
    const c = Math.cos(a), s = Math.sin(a);
    return target.set(Math.sign(c) * Math.pow(Math.abs(c), this.p) * this.size, Math.sign(s) * Math.pow(Math.abs(s), this.p) * this.size, 0);
  }
}
const linkGeo = (size = 1, tube = 0.2) => new THREE.TubeGeometry(new Squircle(size), 260, tube, 32, true);

/* =========================================================
   GOLD OBJECT SCENES
   ========================================================= */
function chainGroup(n = 3) {
  const g = new THREE.Group();
  const mat = gold();
  const geo = linkGeo(1, 0.2);
  const spacing = 1.25;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.x = (i - (n - 1) / 2) * spacing;
    // alternate ±45° so neighbouring links are perpendicular (interlocked) yet all read on screen
    m.rotation.x = i % 2 ? -Math.PI / 4 : Math.PI / 4;
    g.add(m);
  }
  return g;
}

const BUILDERS = {
  chain(stage) {
    const g = chainGroup(3);
    g.rotation.set(0.35, -0.65, 0.35);
    g.scale.setScalar(1.1);
    stage.scene.add(g);
    stage.update = (t) => {
      g.rotation.y = -0.65 + Math.sin(t * 0.4) * 0.25 + pointer.sx * 0.25;
      g.rotation.x = 0.35 + Math.cos(t * 0.3) * 0.08 + pointer.sy * 0.15;
      g.position.y = Math.sin(t * 0.8) * 0.06;
    };
    stage.camera.position.z = 8.6;
  },
  chainSmall(stage) {
    const g = chainGroup(2);
    g.rotation.set(0.6, 0.6, -0.4);
    stage.scene.add(g);
    stage.update = (t) => { g.rotation.y = 0.6 + t * 0.25; g.rotation.x = 0.6 + Math.sin(t * 0.5) * 0.2; };
    stage.camera.position.z = 6;
  },
  frame(stage) {
    const m = new THREE.Mesh(linkGeo(1.15, 0.3), gold({ roughness: 0.13 }));
    stage.scene.add(m);
    stage.update = (t) => {
      m.rotation.x = 0.5 + Math.sin(t * 0.5) * 0.25 + pointer.sy * 0.2;
      m.rotation.y = t * 0.45 + pointer.sx * 0.3;
      m.position.y = Math.sin(t * 0.9) * 0.08;
    };
    stage.camera.position.z = 6.2;
  },
  core(stage) {
    const g = new THREE.Group();
    const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), gold({ flatShading: true, roughness: 0.2 }));
    g.add(ico);
    const shell = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.25, 1)), new THREE.LineBasicMaterial({ color: 0xe7b94f, transparent: true, opacity: 0.35 }));
    g.add(shell);
    // nodes on the shell vertices
    const pos = new THREE.IcosahedronGeometry(1.25, 1).getAttribute('position');
    const seen = new Set();
    const nodeGeo = new THREE.SphereGeometry(0.055, 16, 16);
    const nodeMat = gold({ roughness: 0.1 });
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
      if (seen.has(k)) continue; seen.add(k);
      const n = new THREE.Mesh(nodeGeo, nodeMat);
      n.position.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      g.add(n);
    }
    const rings = [0, 1, 2].map((i) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.6 + i * 0.12, 0.018, 12, 160), gold({ roughness: 0.25 }));
      r.rotation.set(Math.PI / 2 + i * 0.5, i * 0.7, 0);
      g.add(r); return r;
    });
    stage.scene.add(g);
    stage.update = (t) => {
      ico.rotation.y = t * 0.6; ico.rotation.x = t * 0.3;
      shell.rotation.y = -t * 0.15;
      g.children.forEach((c) => { if (c.geometry === nodeGeo) c.scale.setScalar(1 + 0.3 * Math.sin(t * 2 + c.position.x * 5)); });
      rings.forEach((r, i) => { r.rotation.z = t * (0.2 + i * 0.1) * (i % 2 ? -1 : 1); });
      g.rotation.y = pointer.sx * 0.4; g.rotation.x = pointer.sy * 0.25;
    };
    stage.camera.position.z = 6.4;
  },
  coin(stage) {
    const faceTex = coinFaceTexture();
    const edgeTex = coinEdgeTexture();
    const faceMat = gold({ bumpMap: faceTex, bumpScale: 3.5, roughnessMap: faceTex, roughness: 0.22 });
    const edgeMat = gold({ bumpMap: edgeTex, bumpScale: 2, roughness: 0.25 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.2, 128, 1), [edgeMat, faceMat, faceMat]);
    coin.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(coin);
    stage.scene.add(holder);
    // a few small coins floating behind
    const small = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 48), [edgeMat, faceMat, faceMat]);
      s.position.set((Math.random() - 0.5) * 4.4, (Math.random() - 0.5) * 3.4, -1.5 - Math.random());
      s.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      s.userData.s = Math.random() * 10;
      stage.scene.add(s); small.push(s);
    }
    stage.update = (t) => {
      holder.rotation.y = Math.sin(t * 0.5) * 0.55 + pointer.sx * 0.5;
      holder.rotation.x = Math.cos(t * 0.4) * 0.12 + pointer.sy * 0.3;
      holder.position.y = Math.sin(t * 0.9) * 0.06;
      small.forEach((s) => { s.rotation.x += 0.006; s.rotation.y += 0.01; s.position.y += Math.sin(t + s.userData.s) * 0.0015; });
    };
    stage.camera.position.z = 5.6;
  },
  ring(stage) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.26, 64, 200), gold({ roughness: 0.14 }));
    ring.scale.set(1, 1, 1.25);
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.6, 4, 1), gold({ flatShading: true, roughness: 0.18 }));
    const g = new THREE.Group(); g.add(ring, pyr);
    g.rotation.x = 0.15;
    stage.scene.add(g);
    stage.update = (t) => {
      ring.rotation.y = Math.sin(t * 0.5) * 0.6 + pointer.sx * 0.3;
      ring.rotation.x = Math.cos(t * 0.4) * 0.15;
      pyr.rotation.y = t * 0.8;
      pyr.position.y = Math.sin(t * 1.2) * 0.06;
    };
    stage.camera.position.z = 4.6;
  },
  ringSmall(stage) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.22, 48, 160), gold({ roughness: 0.15 }));
    ring.scale.z = 1.3;
    stage.scene.add(ring);
    stage.update = (t) => { ring.rotation.y = 0.9 + Math.sin(t * 0.4) * 0.4; ring.rotation.x = 0.3 + Math.cos(t * 0.3) * 0.2; };
    stage.camera.position.z = 4.2;
  },
};

/* procedural coin face: rings, rays, a globe-like grid and the AUR mark */
function coinFaceTexture() {
  const s = 1024, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, s, s);
  const cx = s / 2;
  const ring = (r, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.arc(cx, cx, r, 0, Math.PI * 2); x.stroke(); };
  ring(490, 28, '#d0d0d0'); ring(455, 6, '#555'); ring(330, 10, '#cfcfcf');
  // reeded inner border beads
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    x.fillStyle = '#c8c8c8';
    x.beginPath(); x.arc(cx + Math.cos(a) * 425, cx + Math.sin(a) * 425, 6, 0, 7); x.fill();
  }
  // text around
  x.save(); x.translate(cx, cx);
  x.font = '600 58px Instrument Sans, Arial'; x.fillStyle = '#e0e0e0'; x.textAlign = 'center';
  const txt = 'AURUM · AGENT ECONOMY · MCP · ';
  for (let i = 0; i < txt.length; i++) {
    x.save(); x.rotate((i / txt.length) * Math.PI * 2); x.fillText(txt[i], 0, -360); x.restore();
  }
  x.restore();
  // globe grid
  x.save(); x.beginPath(); x.arc(cx, cx, 300, 0, 7); x.clip();
  x.strokeStyle = '#9a9a9a'; x.lineWidth = 4;
  for (let i = -4; i <= 4; i++) { x.beginPath(); x.ellipse(cx, cx, Math.abs(i) * 70 + 4, 300, 0, 0, 7); x.stroke(); }
  for (let i = -4; i <= 4; i++) { x.beginPath(); x.moveTo(0, cx + i * 68); x.lineTo(s, cx + i * 68); x.stroke(); }
  x.restore();
  // central mark
  x.save(); x.translate(cx, cx + 20);
  x.fillStyle = '#f2f2f2';
  x.beginPath(); x.moveTo(0, -190); x.lineTo(150, 120); x.lineTo(0, 70); x.lineTo(-150, 120); x.closePath(); x.fill();
  x.fillStyle = '#6a6a6a';
  x.beginPath(); x.moveTo(0, -60); x.lineTo(55, 60); x.lineTo(0, 40); x.lineTo(-55, 60); x.closePath(); x.fill();
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI / 2;
  return t;
}
function coinEdgeTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 32;
  const x = c.getContext('2d');
  for (let i = 0; i < 1024; i += 8) { x.fillStyle = '#ddd'; x.fillRect(i, 0, 4, 32); x.fillStyle = '#444'; x.fillRect(i + 4, 0, 4, 32); }
  return new THREE.CanvasTexture(c);
}

/* =========================================================
   boot
   ========================================================= */
function boot() {
  try {
    const globe = document.getElementById('globe');
    if (globe) initGlobe(globe, makeStage, { reduced, isMobile, DPR });
    // gold scenes are created lazily as they approach the viewport:
    // each one is a WebGL context + shader compile, too costly to pay all at load
    const lazy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        lazy.unobserve(en.target);
        const build = BUILDERS[en.target.dataset.scene];
        if (!build) return;
        try {
          const stage = makeStage(en.target, { fov: 35, z: 6 });
          goldEnv(stage);
          build(stage);
          stage.visible = true;
        } catch (err) { console.warn('[aurum] scene failed', err); }
      });
    }, { rootMargin: '600px 0px' });
    document.querySelectorAll('.gold-scene').forEach((cv) => lazy.observe(cv));
    loop();
  } catch (err) {
    console.warn('[aurum] WebGL unavailable, falling back to static visuals', err);
    document.documentElement.classList.add('no-webgl');
  }
}
if (document.fonts?.ready) document.fonts.ready.then(boot); else boot();
