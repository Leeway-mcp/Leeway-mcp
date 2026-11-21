// Mandate MCP · interactive hero globe
// Dotted land, fresnel atmosphere, gold gateway nodes you can hover / click,
// agent-transaction arcs between nodes, drag-to-spin with inertia.
import * as THREE from 'three';

export const NODES = [
  { name: 'Dubai', country: 'UAE', lat: 25.2, lon: 55.27, agents: 1842, ms: 31, vol: '412K' },
  { name: 'London', country: 'United Kingdom', lat: 51.5, lon: -0.12, agents: 2310, ms: 24, vol: '598K' },
  { name: 'Frankfurt', country: 'Germany', lat: 50.11, lon: 8.68, agents: 1655, ms: 22, vol: '377K' },
  { name: 'Zug', country: 'Switzerland', lat: 47.17, lon: 8.52, agents: 904, ms: 27, vol: '268K' },
  { name: 'Lagos', country: 'Nigeria', lat: 6.52, lon: 3.38, agents: 733, ms: 48, vol: '121K' },
  { name: 'Nairobi', country: 'Kenya', lat: -1.29, lon: 36.82, agents: 418, ms: 52, vol: '74K' },
  { name: 'Cape Town', country: 'South Africa', lat: -33.92, lon: 18.42, agents: 512, ms: 55, vol: '96K' },
  { name: 'Mumbai', country: 'India', lat: 19.08, lon: 72.88, agents: 1967, ms: 39, vol: '305K' },
  { name: 'Singapore', country: 'Singapore', lat: 1.35, lon: 103.82, agents: 2744, ms: 19, vol: '811K' },
  { name: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69, agents: 2128, ms: 21, vol: '642K' },
  { name: 'Seoul', country: 'South Korea', lat: 37.57, lon: 126.98, agents: 1590, ms: 23, vol: '455K' },
  { name: 'Sydney', country: 'Australia', lat: -33.87, lon: 151.21, agents: 688, ms: 44, vol: '139K' },
  { name: 'New York', country: 'United States', lat: 40.71, lon: -74.0, agents: 3105, ms: 18, vol: '1.2M' },
  { name: 'San Francisco', country: 'United States', lat: 37.77, lon: -122.42, agents: 2876, ms: 17, vol: '987K' },
  { name: 'São Paulo', country: 'Brazil', lat: -23.55, lon: -46.63, agents: 1021, ms: 41, vol: '188K' },
  { name: 'Toronto', country: 'Canada', lat: 43.65, lon: -79.38, agents: 977, ms: 26, vol: '204K' },
];

// lat/lon → unit vector, matching the land-dot sampling below
function latLon(lat, lon, r) {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(-Math.cos(la) * Math.cos(lo) * r, Math.sin(la) * r, Math.cos(la) * Math.sin(lo) * r);
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.18, 'rgba(255,205,110,.85)');
  g.addColorStop(0.45, 'rgba(240,170,60,.25)'); g.addColorStop(1, 'rgba(240,170,60,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function initGlobe(canvas, makeStage, { reduced, isMobile, DPR }) {
  const stage = makeStage(canvas, { fov: 30, z: 9.2 });
  const { scene, camera } = stage;
  const R = 2.2;
  const group = new THREE.Group();
  const tilt = new THREE.Group(); // fixed axial tilt, group spins inside it
  tilt.rotation.set(0.38, 0, 0.12);
  tilt.add(group);
  scene.add(tilt);
  group.rotation.y = 0.6;

  /* ---------- core + atmosphere ---------- */
  // light comes from the upper-left (view space) so the sphere reads as a lit 3D body
  const LIGHT = new THREE.Vector3(-0.55, 0.5, 0.67).normalize();
  const core = new THREE.Mesh(new THREE.SphereGeometry(R * 0.995, 128, 128), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#04050d') }, uLit: { value: new THREE.Color('#1b2a6b') }, uRim: { value: new THREE.Color('#7f9bff') }, uLight: { value: LIGHT } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform vec3 uLit; uniform vec3 uRim; uniform vec3 uLight; varying vec3 vN; varying vec3 vV;
      void main(){
        float diff = max(dot(vN, uLight), 0.);
        float spec = pow(max(dot(reflect(-uLight, vN), vV), 0.), 24.) * 0.35;
        float f = pow(1. - max(dot(vN, vV), 0.), 3.2);
        vec3 c = uColor + uLit * pow(diff, 1.4) * 0.9 + vec3(0.6,0.7,1.) * spec;
        c = mix(c, uRim, f * (0.35 + 0.65 * smoothstep(-0.3, 0.6, dot(vN, uLight) + 0.4)));
        c += vec3(1.) * pow(f, 7.) * 0.8;
        gl_FragColor = vec4(c, 1.); }`,
  }));
  group.add(core);

  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.22, 96, 96), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float d = dot(vN, vV); float g = smoothstep(0.0, 0.55, -d) * pow(1.0 - abs(d), 2.0); gl_FragColor = vec4(vec3(0.36,0.48,1.0) * g * 2.2, g); }`,
  }));
  scene.add(atmo);

  /* ---------- land dots ---------- */
  const dotUniforms = { uTime: { value: 0 }, uSize: { value: 2.7 * DPR }, uLight: { value: LIGHT } };
  const img = new Image();
  img.src = 'assets/earth-water.png';
  img.onload = () => {
    const cw = 800, ch = 400;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch).data;
    const lum = (lat, lon) => {
      const x = Math.floor(((lon + 180) / 360) * cw) % cw;
      const y = Math.min(ch - 1, Math.floor(((90 - lat) / 180) * ch));
      return data[(y * cw + x) * 4];
    };
    const waterIsBright = lum(0, -140) > 128;
    const isLand = (lat, lon) => (waterIsBright ? lum(lat, lon) < 128 : lum(lat, lon) > 128);
    const N = isMobile ? 40000 : 70000;
    const pos = [], rnd = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const lat = Math.asin(y) * 180 / Math.PI, lon = Math.atan2(z, -x) * 180 / Math.PI;
      if (!isLand(lat, lon)) continue;
      pos.push(x * R, y * R, z * R); rnd.push(Math.random());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 1));
    group.add(new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: dotUniforms,
      vertexShader: `attribute float aRnd; uniform float uTime; uniform float uSize; uniform vec3 uLight; varying float vA; varying float vR; varying float vL;
        void main(){ vec4 mv = modelViewMatrix*vec4(position * 1.004,1.); vec3 n = normalize(normalMatrix*normalize(position));
          float facing = dot(n, normalize(-mv.xyz));
          vA = smoothstep(-0.05, 0.45, facing); vR = aRnd;
          vL = 0.45 + 0.75 * max(dot(n, uLight), 0.);          // lit side brighter, night side dimmer
          float tw = 0.8 + 0.2*sin(uTime*1.5 + aRnd*40.);
          gl_PointSize = uSize * tw * (0.6 + 0.4 * facing) * (8.5 / -mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; varying float vR; varying float vL;
        void main(){ float d = length(gl_PointCoord-.5); if(d>.5) discard;
          vec3 col = mix(vec3(0.82,0.88,1.0), vec3(1.0,0.86,0.55), step(0.975, vR));
          gl_FragColor = vec4(col * 1.3 * vL, smoothstep(.5,.2,d) * vA); }`,
    })));
  };

  /* ---------- gold gateway nodes ---------- */
  const glow = glowTexture();
  const nodeObjs = NODES.map((n, i) => {
    const p = latLon(n.lat, n.lon, R);
    const normal = p.clone().normalize();
    const g = new THREE.Group();
    g.position.copy(p);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const spikeH = 0.16 + (n.agents / 3105) * 0.22;
    const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.012, spikeH, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, depthWrite: false }));
    spike.position.y = spikeH / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }));
    head.position.y = spikeH;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc860, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.22); halo.position.y = spikeH;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 40), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004;
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.9, depthWrite: false }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.003;
    // invisible, generous hit target
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = spikeH * 0.7;
    hit.userData.index = i;
    g.add(spike, head, halo, ring, base, hit);
    group.add(g);
    return { data: n, g, head, halo, ring, spike, hit, normal, top: new THREE.Vector3(0, spikeH, 0), seed: Math.random(), hover: 0 };
  });

  /* ---------- arcs between nodes ---------- */
  const arcVS = `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
  const arcFS = `uniform float uTime; uniform float uSeed; uniform float uHi; varying float vT;
    void main(){ float head = fract(uTime*0.25 + uSeed); float d = head - vT;
      float tail = smoothstep(0.3, 0.0, d) * step(0.0, d);
      vec3 col = mix(vec3(1.,0.72,0.3), vec3(1.,0.96,0.85), tail);
      gl_FragColor = vec4(col, 0.06 + uHi*0.25 + tail*(0.75 + uHi*0.25)); }`;
  const pairs = [[0, 1], [0, 8], [0, 7], [1, 12], [2, 9], [3, 13], [4, 14], [5, 0], [6, 11], [8, 9], [9, 13], [10, 8], [12, 13], [12, 14], [15, 1], [7, 8], [2, 0], [11, 8], [14, 6], [13, 9]];
  const arcs = pairs.map(([a, b]) => {
    const A = latLon(NODES[a].lat, NODES[a].lon, R), B = latLon(NODES[b].lat, NODES[b].lon, R);
    const dist = A.distanceTo(B);
    const mid = A.clone().add(B).multiplyScalar(0.5).setLength(R + dist * 0.42);
    const pts = new THREE.QuadraticBezierCurve3(A, mid, B).getPoints(90);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute('aT', new THREE.Float32BufferAttribute(pts.map((_, i) => i / 90), 1));
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: arcVS, fragmentShader: arcFS, uniforms: { uTime: { value: 0 }, uSeed: { value: Math.random() }, uHi: { value: 0 } } });
    const line = new THREE.Line(geo, mat);
    group.add(line);
    return { a, b, mat };
  });

  /* ---------- orbit rings + satellites (pass in front of / behind the planet → reads as 3D) ---------- */
  const orbitGroup = new THREE.Group();
  orbitGroup.rotation.set(1.18, 0, -0.32);
  scene.add(orbitGroup);
  const ORB = R * 1.26;
  const orbitRing = new THREE.Mesh(new THREE.TorusGeometry(ORB, 0.0045, 8, 256), new THREE.MeshBasicMaterial({ color: 0xe7b94f, transparent: true, opacity: 0.45, depthWrite: false }));
  orbitGroup.add(orbitRing);
  const orbit2 = new THREE.Group();
  orbit2.rotation.set(1.5, 0.5, 0.6);
  scene.add(orbit2);
  orbit2.add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.18, 0.003, 8, 256), new THREE.MeshBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.22, depthWrite: false })));
  const sats = [0, 2.1, 4.2].map((phase, k) => {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff0c8 })));
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc860, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    h.scale.setScalar(0.32); s.add(h);
    (k === 2 ? orbit2 : orbitGroup).add(s);
    return { s, phase, r: k === 2 ? R * 1.18 : ORB, speed: k === 2 ? -0.35 : 0.28 };
  });

  /* ---------- sizing ---------- */
  stage.onResize = (w, h) => {
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fit = R * 2.6;
    camera.position.z = Math.max(fit / (2 * tan), fit / (2 * tan * (w / h)));
  };
  stage.onResize(canvas.clientWidth, canvas.clientHeight);

  /* ---------- interaction ---------- */
  const card = document.getElementById('globeCard');
  const visual = canvas.parentElement;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2(9, 9);
  let hovered = -1, selected = -1, lastUser = -1e9;
  let dragging = false, lastX = 0, lastY = 0, velY = 0, velX = 0, pitch = 0;
  const hits = nodeObjs.map((o) => o.hit);

  const setNDC = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const facing = (o) => {
    const wn = o.normal.clone().applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()));
    const wp = o.g.getWorldPosition(new THREE.Vector3());
    return wn.dot(camera.position.clone().sub(wp).normalize());
  };
  const pick = () => {
    ray.setFromCamera(ndc, camera);
    const res = ray.intersectObjects(hits, false).find((h) => facing(nodeObjs[h.object.userData.index]) > 0.15);
    return res ? res.object.userData.index : -1;
  };

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; fly = null; lastX = e.clientX; lastY = e.clientY; velY = 0; velX = 0;
    canvas.setPointerCapture?.(e.pointerId);
    lastUser = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    setNDC(e);
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      velY = dx * 0.0055; velX = dy * 0.004;
      group.rotation.y += velY;
      pitch = THREE.MathUtils.clamp(pitch + velX, -0.45, 0.45);
      canvas.classList.add('is-grabbing');
      lastUser = performance.now();
    }
  });
  // fly-to: rotate the planet so node i faces the camera, centred vertically
  const TAU = Math.PI * 2, TILT_X = tilt.rotation.x;
  let fly = null, holdUntil = 0;
  const chips = [...document.querySelectorAll('[data-node]')];
  const focus = (i, byUser) => {
    const p = nodeObjs[i].g.position;
    const cur = group.rotation.y;
    let ty = -Math.atan2(p.x, p.z);
    ty = cur + ((((ty - cur) % TAU) + TAU + Math.PI) % TAU - Math.PI);   // shortest way round
    const tp = THREE.MathUtils.clamp(Math.atan2(p.y, Math.hypot(p.x, p.z)) - TILT_X, -0.7, 0.7);
    fly = { y: ty, p: tp };
    selected = i;
    holdUntil = performance.now() + (byUser ? 7000 : 3600);
    chips.forEach((c) => c.classList.toggle('is-on', +c.dataset.node === i));
  };
  chips.forEach((c) => c.addEventListener('click', () => { lastUser = performance.now(); focus(+c.dataset.node, true); }));

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false; canvas.classList.remove('is-grabbing');
    setNDC(e);
    const i = pick();
    if (i >= 0 && Math.abs(velY) < 0.02) { lastUser = performance.now(); focus(i, true); }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => { dragging = false; canvas.classList.remove('is-grabbing'); });
  canvas.addEventListener('pointerleave', () => { ndc.set(9, 9); });

  // auto-tour: while the user is idle, fly to a node every few seconds
  let tourAt = performance.now() + 2600;
  const autoSelect = (now) => {
    if (now - lastUser < 9000 || now < tourAt) return;
    tourAt = now + 5600;
    let i; do { i = Math.floor(Math.random() * nodeObjs.length); } while (i === selected);
    focus(i, false);
  };

  const tmp = new THREE.Vector3();
  // cache layout so the per-frame card update never forces a reflow
  let cr = canvas.getBoundingClientRect(), vr = visual.getBoundingClientRect();
  const measure = () => { cr = canvas.getBoundingClientRect(); vr = visual.getBoundingClientRect(); };
  new ResizeObserver(measure).observe(visual);
  let cardOn = null, cardLeft = null, lastXY = '';
  const setOn = (v) => { if (v !== cardOn) { cardOn = v; card.classList.toggle('is-on', v); } };
  const showCard = (i) => {
    if (!card) return;
    if (i < 0) { setOn(false); return; }
    const o = nodeObjs[i];
    if (card.dataset.i !== String(i)) {
      card.dataset.i = i;
      const n = o.data;
      const live = Math.round(n.agents * (0.9 + Math.random() * 0.2));
      card.innerHTML = `<div class="gc__head"><i></i><b>${n.name}</b><span>${n.country}</span></div>
        <div class="gc__grid"><div><em>Agents</em><strong>${live.toLocaleString('en-US')}</strong></div>
        <div><em>Latency</em><strong>${n.ms}ms</strong></div><div><em>24h volume</em><strong>$${n.vol}</strong></div></div>
        <div class="gc__foot">gateway-${n.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 6)}.mandate · <span>● healthy</span></div>`;
    }
    o.g.localToWorld(tmp.copy(o.top));
    tmp.project(camera);
    const x = Math.round((tmp.x * 0.5 + 0.5) * cr.width + (cr.left - vr.left));
    const y = Math.round((-tmp.y * 0.5 + 0.5) * cr.height + (cr.top - vr.top));
    const xy = `${x},${y}`;
    if (xy !== lastXY) { lastXY = xy; card.style.transform = `translate3d(${x}px, ${y}px, 0)`; }
    const left = x > vr.width * 0.62;
    if (left !== cardLeft) { cardLeft = left; card.classList.toggle('is-left', left); }
    setOn(facing(o) > 0.1);
  };
  let lastCursor = '';

  /* ---------- frame ---------- */
  let intro = reduced ? 1 : 0;
  let lastScroll = scrollY, spin = 0;
  stage.update = (t, dt) => {
    const now = performance.now();
    intro = Math.min(1, intro + dt * 0.6);
    const e = 1 - Math.pow(1 - intro, 3);
    scene.scale.setScalar(0.85 + 0.15 * e);

    const ds = scrollY - lastScroll; lastScroll = scrollY;
    spin = (spin + ds * 0.00012) * 0.9;

    hovered = dragging ? -1 : pick();
    const cur = dragging ? 'grabbing' : hovered >= 0 ? 'pointer' : 'grab';
    if (cur !== lastCursor) { lastCursor = cur; canvas.style.cursor = cur; }

    const holding = now < holdUntil;
    if (fly && !dragging) {
      const k = Math.min(1, dt * 3.2);
      group.rotation.y += (fly.y - group.rotation.y) * k;
      pitch += (fly.p - pitch) * k;
      if (Math.abs(fly.y - group.rotation.y) < 0.003 && Math.abs(fly.p - pitch) < 0.003) fly = null;
    } else if (!dragging) {
      velY *= 0.94;
      // always spinning like a globe; slows down while a node is hovered / just selected
      const auto = hovered >= 0 || holding ? 0.02 : reduced ? 0.08 : 0.24;
      group.rotation.y += velY + dt * (auto + (1 - e) * 1.2) + spin;
      if (!holding) pitch *= 0.99;                       // drift back to the default tilt
    }
    group.rotation.x = pitch;
    orbitGroup.rotation.y = t * 0.05;
    sats.forEach((s) => { const a = s.phase + t * s.speed; s.s.position.set(Math.cos(a) * s.r, Math.sin(a) * s.r, 0); });

    if (!dragging) autoSelect(now);
    const active = hovered >= 0 ? hovered : selected;
    nodeObjs.forEach((o, i) => {
      const target = i === active ? 1 : 0;
      o.hover += (target - o.hover) * Math.min(1, dt * 10);
      const k = 1 + o.hover * 0.9;
      o.head.scale.setScalar(k);
      o.halo.scale.setScalar(0.3 * k *(1 + 0.15 * Math.sin(t * 3 + o.seed * 9)));
      const p = (t * 0.55 + o.seed) % 1;
      o.ring.scale.setScalar(1 + p * (3 + o.hover * 3));
      o.ring.material.opacity = (1 - p) * (0.75 + o.hover * 0.25);
    });
    arcs.forEach((a) => {
      a.mat.uniforms.uTime.value = t;
      const hi = active >= 0 && (a.a === active || a.b === active) ? 1 : 0;
      a.mat.uniforms.uHi.value += (hi - a.mat.uniforms.uHi.value) * Math.min(1, dt * 6);
    });
    dotUniforms.uTime.value = t;
    showCard(active);
  };
  return stage;
}
