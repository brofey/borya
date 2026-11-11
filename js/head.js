// Голова-биток: процедурная 3D-модель + выражения лица + физика серёжек.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

const SKIN = '#efc2a8';
const SKIN_DARK = '#e2a48f';

// lon = 0 — лицо (+z), lon > 0 — в сторону +x
function dirLL(lat, lon) {
  return new THREE.Vector3(
    Math.sin(lon) * Math.cos(lat),
    Math.sin(lat),
    Math.cos(lon) * Math.cos(lat)
  );
}

// Ставит объект на направление dir, локальная +z смотрит наружу
function placeOut(obj, dir, dist) {
  obj.position.copy(dir).multiplyScalar(dist);
  _m.lookAt(dir, new THREE.Vector3(), UP);
  obj.quaternion.setFromRotationMatrix(_m);
  return obj;
}

const gauss = (a, s) => Math.exp(-(a * a) / (s * s));

// Рельеф лица поверх идеального шара
export function faceRelief(lat, lon) {
  const al = Math.abs(lon);
  let h = 0;
  const t = Math.min(1, Math.max(0, (0.06 - lat) / 0.2));
  h += (0.012 + 0.065 * t * t) * gauss(lon, 0.055 + 0.03 * t) * (lat > -0.15 ? 1 : gauss(lat + 0.15, 0.025)) * (lat < 0.06 ? 1 : gauss(lat - 0.06, 0.06));
  h += 0.07 * gauss(lat + 0.14, 0.045) * gauss(lon, 0.06);                 // кончик носа
  h += 0.04 * gauss(lat + 0.155, 0.035) * gauss(al - 0.07, 0.035);         // крылья носа
  h += 0.022 * gauss(lat - 0.21, 0.07) * gauss(al - 0.3, 0.2);             // надбровья
  h -= 0.02 * gauss(lat - 0.05, 0.09) * gauss(al - 0.34, 0.12);            // глазницы
  h += 0.025 * gauss(lat + 0.13, 0.12) * gauss(al - 0.5, 0.15);            // скулы
  h += 0.012 * gauss(lat + 0.355, 0.025) * gauss(lon, 0.17);               // верхняя губа
  h += 0.02 * gauss(lat + 0.43, 0.035) * gauss(lon, 0.15);                 // нижняя губа
  h += 0.05 * gauss(lat + 0.64, 0.13) * gauss(lon, 0.24);                 // подбородок
  return h;
}

function surf(lat, lon, off = 0) {
  return dirLL(lat, lon).multiplyScalar(1 + faceRelief(lat, lon) + off);
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- текстуры ----------
function makeSkinTexture() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const base = new THREE.Color(SKIN);
  const stub = new THREE.Color('#6f5f52');
  const pink = new THREE.Color('#e9a89a');
  const d = img.data;
  for (let py = 0; py < H; py++) {
    const th = (py + 0.5) / H * Math.PI;
    for (let px = 0; px < W; px++) {
      const ph = (px + 0.5) / W * Math.PI * 2;
      const x = -Math.cos(ph) * Math.sin(th);
      const y = Math.cos(th);
      const z = Math.sin(ph) * Math.sin(th);
      // короткий ёжик по бокам и на затылке (как на фото в профиль)
      const hair = 0.06 + 0.2 * Math.max(0, -z);
      let dens = smooth(hair + 0.18, hair - 0.06, y) * smooth(0.42, 0.08, z) * smooth(-0.98, -0.75, y);
      // лёгкая щетина на подбородке
      dens += 0.22 * smooth(0.35, 0.7, z) * smooth(-0.5, -0.72, y);
      const n = Math.random();
      const a = Math.min(1, dens * (0.35 + 0.65 * n) * 0.48);
      // макушка чуть светлее, низ лица чуть розовее
      const top = 0.04 * smooth(0.3, 1, y);
      const low = 0.25 * smooth(-0.1, -0.6, y) * smooth(0.2, 0.8, z);
      let r = base.r + top, g = base.g + top, b = base.b + top;
      r += (pink.r - r) * low; g += (pink.g - g) * low; b += (pink.b - b) * low;
      r += (stub.r - r) * a; g += (stub.g - g) * a; b += (stub.b - b) * a;
      const i = (py * W + px) * 4;
      d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Полярная развёртка: верх канваса — центр зрачка, низ — край радужки
function makeIrisTexture() {
  const W = 256, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.0, '#050505');
  g.addColorStop(0.36, '#080808');
  g.addColorStop(0.40, '#5f6b52');
  g.addColorStop(0.62, '#8d9c86');
  g.addColorStop(0.86, '#7b8c7c');
  g.addColorStop(1.0, '#3a4640');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * W;
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(170,175,140,0.35)' : 'rgba(60,75,60,0.35)';
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, H * 0.42);
    ctx.lineTo(x + (Math.random() - 0.5) * 6, H * (0.75 + Math.random() * 0.2));
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSpiralTexture() {
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fbfbf7';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 30;
  const turns = 3;
  // спираль Архимеда в полярной развёртке — наклонные прямые
  for (let k = -1; k <= turns; k++) {
    ctx.beginPath();
    ctx.moveTo(0, (k * H) / turns);
    ctx.lineTo(W, ((k + 1) * H) / turns);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ---------- выражения ----------
export const EXPRESSIONS = {
  idle:  { lid: 0.72, squint: 0.15, browY: 0.0,  browWorry: 0.0,  browAngry: 0,   smile: 0.45, open: 0.0,  width: 1.0,  blush: 0.0, sweat: 0, spiral: 0 },
  aim:   { lid: 1.0,  squint: 0.0,  browY: 0.05, browWorry: 1.0,  browAngry: 0,   smile: -0.6, open: 0.08, width: 0.65, blush: 0.0, sweat: 1, spiral: 0 },
  hit:   { lid: 0.0,  squint: 1.0,  browY: -0.04, browWorry: 0.0, browAngry: 1.0, smile: -0.3, open: 1.0,  width: 1.25, blush: 1.0, sweat: 0, spiral: 0 },
  roll:  { lid: 1.0,  squint: 0.0,  browY: 0.07, browWorry: 0.7,  browAngry: 0,   smile: -0.2, open: 0.7,  width: 0.8,  blush: 0.5, sweat: 0, spiral: 0 },
  oof:   { lid: 0.1,  squint: 0.9,  browY: -0.02, browWorry: 0.0, browAngry: 0.7, smile: -0.5, open: 0.45, width: 1.1,  blush: 0.8, sweat: 0, spiral: 0 },
  dizzy: { lid: 1.0,  squint: 0.0,  browY: 0.03, browWorry: 0.5,  browAngry: 0,   smile: 0.25, open: 0.22, width: 0.9,  blush: 0.4, sweat: 0, spiral: 1 },
  happy: { lid: 0.55, squint: 0.5,  browY: 0.04, browWorry: 0.0,  browAngry: 0,   smile: 1.0,  open: 0.25, width: 1.15, blush: 0.4, sweat: 0, spiral: 0 },
};

// ---------- модель ----------
export function createHead({ radius = 1 } = {}) {
  const R = radius;

  // root → wobble → align → scale → unalign → spin → face
  const root = new THREE.Group();
  const wobble = new THREE.Group();
  const align = new THREE.Group();
  const scaler = new THREE.Group();
  const unalign = new THREE.Group();
  const spin = new THREE.Group();
  const face = new THREE.Group();
  root.add(wobble); wobble.add(align); align.add(scaler); scaler.add(unalign); unalign.add(spin); spin.add(face);
  face.scale.setScalar(R);

  const skinTex = makeSkinTexture();
  const skinMat = new THREE.MeshPhysicalMaterial({
    map: skinTex, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.3, sheenColor: new THREE.Color('#ffb4a0'),
  });
  const skinPlain = new THREE.MeshPhysicalMaterial({
    color: SKIN, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.35,
  });
  const lidMat = new THREE.MeshStandardMaterial({ color: SKIN_DARK, roughness: 0.6, side: THREE.DoubleSide });
  const innerEarMat = new THREE.MeshStandardMaterial({ color: '#d98f80', roughness: 0.7 });
  const silver = new THREE.MeshStandardMaterial({ color: '#e8e8ec', metalness: 1, roughness: 0.18 });
  const browMat = new THREE.MeshStandardMaterial({ color: '#8c6d55', roughness: 0.9 });
  const lashMat = new THREE.MeshStandardMaterial({ color: '#4a3a32', roughness: 0.8 });
  const lipMat = new THREE.MeshStandardMaterial({ color: '#b86b63', roughness: 0.6 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: '#4a1418', roughness: 0.8 });
  const teethMat = new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.4 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: '#d0636a', roughness: 0.6 });
  const eyeWhite = new THREE.MeshPhysicalMaterial({ color: '#f7f5f0', roughness: 0.15, clearcoat: 1 });
  const irisMat = new THREE.MeshPhysicalMaterial({ map: makeIrisTexture(), roughness: 0.2, clearcoat: 1 });
  const spiralTex = makeSpiralTexture();
  const spiralMat = new THREE.MeshStandardMaterial({ map: spiralTex, roughness: 0.4 });
  const blushMat = new THREE.MeshBasicMaterial({ color: '#ff6b78', transparent: true, opacity: 0, depthWrite: false });
  const sweatMat = new THREE.MeshPhysicalMaterial({ color: '#a8dcff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 });

  const meshes = [];
  const add = (parent, geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    parent.add(m);
    meshes.push(m);
    return m;
  };

  // череп: сфера с рельефом лица (нос, подбородок, скулы, губы)
  const skull = new THREE.SphereGeometry(1, 320, 200);
  {
    const pos = skull.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).normalize();
      const lat = Math.asin(_v.y), lon = Math.atan2(_v.x, _v.z);
      _v.multiplyScalar(1 + faceRelief(lat, lon));
      pos.setXYZ(i, _v.x, _v.y, _v.z);
    }
    skull.computeVertexNormals();
  }
  add(face, skull, skinMat);

  // ноздри
  for (const s of [-1, 1]) {
    const nostril = add(face, new THREE.SphereGeometry(0.017, 12, 8), mouthMat, false);
    placeOut(nostril, dirLL(-0.172, s * 0.034), 0);
    nostril.position.copy(surf(-0.172, s * 0.034, -0.004));
    nostril.scale.set(1.3, 0.7, 0.6);
  }

  // ---------- глаза ----------
  const RE = 0.115;
  const eyes = [];
  for (const s of [-1, 1]) {
    const eg = placeOut(new THREE.Group(), dirLL(0.06, s * 0.34), 1 - RE * 0.5);
    face.add(eg);
    const ball = new THREE.Group();
    eg.add(ball);
    add(ball, new THREE.SphereGeometry(RE, 32, 24), eyeWhite, false);
    const iris = add(ball, new THREE.SphereGeometry(RE * 1.004, 48, 12, 0, Math.PI * 2, 0, 0.55), irisMat, false);
    iris.rotation.x = Math.PI / 2;
    const spiral = add(ball, new THREE.SphereGeometry(RE * 1.006, 48, 12, 0, Math.PI * 2, 0, 1.05), spiralMat, false);
    spiral.rotation.x = Math.PI / 2;
    spiral.visible = false;
    const hl = add(ball, new THREE.SphereGeometry(RE * 0.13, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), false);
    hl.position.copy(dirLL(0.22, -0.2)).multiplyScalar(RE * 1.0);

    const upper = add(eg, new THREE.SphereGeometry(RE * 1.05, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat, false);
    const lash = add(upper, new THREE.TorusGeometry(RE * 1.05, 0.008, 6, 32, Math.PI), lashMat, false);
    lash.rotation.x = Math.PI / 2;
    const lower = add(eg, new THREE.SphereGeometry(RE * 1.04, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidMat, false);

    eyes.push({ s, group: eg, ball, iris, spiral, upper, lower, gx: 0, gy: 0 });
  }

  // ---------- брови ----------
  const brows = [];
  for (const s of [-1, 1]) {
    const pivot = placeOut(new THREE.Group(), dirLL(0.29, s * 0.34), 1.0);
    face.add(pivot);
    const b = add(pivot, new THREE.CapsuleGeometry(0.022, 0.16, 4, 10), browMat, false);
    b.rotation.z = Math.PI / 2;
    const holder = new THREE.Group();
    pivot.add(holder);
    holder.add(b);
    b.scale.z = 0.55;
    brows.push({ s, holder });
  }

  // ---------- уши и серёжки ----------
  const hoops = [];
  for (const s of [-1, 1]) {
    const ep = placeOut(new THREE.Group(), dirLL(-0.04, s * 1.66), 0.97);
    face.add(ep);
    // локальная +x у правого уха смотрит назад, у левого — вперёд
    const fwd = s > 0 ? -1 : 1;
    const ear = new THREE.Group();
    ep.add(ear);
    ear.rotation.y = -fwd * 0.45; // задний край отходит от головы
    const outer = add(ear, new THREE.SphereGeometry(1, 32, 20), skinPlain);
    outer.scale.set(0.13, 0.22, 0.05);
    outer.position.set(-fwd * 0.04, 0, 0.04);
    const inner = add(ear, new THREE.SphereGeometry(1, 24, 16), innerEarMat, false);
    inner.scale.set(0.075, 0.14, 0.03);
    inner.position.set(-fwd * 0.03, 0.01, 0.07);
    const lobe = add(ear, new THREE.SphereGeometry(0.05, 16, 12), skinPlain);
    lobe.position.set(-fwd * 0.0, -0.18, 0.05);

    // пирсинг в хряще (на фото — маленький гвоздик сверху уха)
    if (s < 0) {
      const stud = add(ear, new THREE.SphereGeometry(0.016, 12, 8), silver, false);
      stud.position.set(-fwd * 0.1, 0.13, 0.08);
    }

    const holder = new THREE.Group();
    holder.position.set(-fwd * 0.0, -0.2, 0.08);
    ear.add(holder);
    const L = 0.085;
    const ring = add(holder, new THREE.TorusGeometry(L, 0.012, 10, 40), silver);
    ring.position.set(0, -L, 0);
    hoops.push({ holder, L, pos: new THREE.Vector3(), prev: new THREE.Vector3(), init: false });
  }

  // ---------- рот ----------
  const mouth = new THREE.Group();
  face.add(mouth);
  let mouthLine = add(mouth, new THREE.BufferGeometry(), lipMat, false);
  const mouthOpen = add(mouth, new THREE.SphereGeometry(1, 32, 16), mouthMat, false);
  placeOut(mouthOpen, dirLL(-0.4, 0), 1.0);
  const teeth = add(mouthOpen, new THREE.SphereGeometry(1, 24, 12), teethMat, false);
  teeth.position.set(0, 0.55, 0.45);
  teeth.scale.set(0.75, 0.32, 0.5);
  const tongue = add(mouthOpen, new THREE.SphereGeometry(1, 24, 12), tongueMat, false);
  tongue.position.set(0, -0.55, 0.45);
  tongue.scale.set(0.6, 0.4, 0.5);
  let lastMouthKey = '';

  function rebuildMouth(smile, width, open) {
    const key = `${smile.toFixed(2)}|${width.toFixed(2)}|${open > 0.12}`;
    if (key === lastMouthKey) return;
    lastMouthKey = key;
    const pts = [];
    const w = 0.2 * width;
    for (let i = 0; i <= 16; i++) {
      const t = i / 8 - 1;
      const lat = -0.39 + smile * 0.055 * (t * t) - smile * 0.015;
      pts.push(surf(lat, t * w, 0.006));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.014, 6);
    mouthLine.geometry.dispose();
    mouthLine.geometry = geo;
  }

  // ---------- румянец и пот ----------
  const blush = [];
  for (const s of [-1, 1]) {
    const b = add(face, new THREE.CircleGeometry(0.11, 24), blushMat, false);
    placeOut(b, dirLL(-0.18, s * 0.5), 1 + faceRelief(-0.18, s * 0.5) + 0.006);
    b.scale.set(1.2, 0.8, 1);
    blush.push(b);
  }
  const sweat = new THREE.Group();
  face.add(sweat);
  const drop = new THREE.Group();
  sweat.add(drop);
  add(drop, new THREE.SphereGeometry(0.045, 16, 12), sweatMat, false);
  const cone = add(drop, new THREE.ConeGeometry(0.044, 0.08, 16), sweatMat, false);
  cone.position.y = 0.05;
  let sweatP = 0;

  // ---------- состояние ----------
  const cur = { ...EXPRESSIONS.idle };
  let target = { ...EXPRESSIONS.idle };
  let exprName = 'idle';
  let lookTarget = null;
  let blinkT = 2 + Math.random() * 3, blinkPhase = -1;
  let spiralAngle = 0;

  const squash = { s: 0, v: 0, axis: new THREE.Vector3(1, 0, 0) };
  const righting = { active: false, t: 0, dur: 0.9, from: new THREE.Quaternion(), to: new THREE.Quaternion() };
  const wob = { amp: 0, t: 0, axis: new THREE.Vector3(1, 0, 0) };
  let tremble = 0;

  function setExpression(name) {
    if (!EXPRESSIONS[name]) return;
    exprName = name;
    target = { ...EXPRESSIONS[name] };
  }

  function lookAt(p) { lookTarget = p ? p.clone() : null; }

  function impulse(dirWorld, strength = 1) {
    squash.axis.copy(dirWorld).setY(0);
    if (squash.axis.lengthSq() < 1e-6) squash.axis.set(1, 0, 0);
    squash.axis.normalize();
    align.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), squash.axis);
    unalign.quaternion.copy(align.quaternion).invert();
    squash.v += 7 * strength;
  }

  // поворот при качении на вектор смещения (мировой)
  function roll(delta) {
    const dist = delta.length();
    if (dist < 1e-6) return;
    _v.crossVectors(UP, delta).normalize();
    _q.setFromAxisAngle(_v, dist / R);
    spin.quaternion.premultiply(_q);
  }

  // вернуть лицо вертикально, смотря в направлении faceDir
  function rightUp(faceDir, dur = 0.9) {
    const d = _v2.copy(faceDir).setY(0).normalize();
    _m.lookAt(d, new THREE.Vector3(), UP);
    righting.to.setFromRotationMatrix(_m);
    righting.from.copy(spin.quaternion);
    righting.t = 0; righting.dur = dur; righting.active = true;
  }

  function wobbleKick(axisWorld, amp = 0.25) {
    wob.axis.copy(axisWorld).normalize();
    wob.amp = amp; wob.t = 0;
  }

  function setTremble(v) { tremble = v; }

  const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  function update(dt, time) {
    dt = Math.min(dt, 1 / 30);
    const k = 1 - Math.exp(-14 * dt);
    for (const key in target) cur[key] += (target[key] - cur[key]) * k;

    // сквош/стретч
    squash.v += (-320 * squash.s - 11 * squash.v) * dt;
    squash.s += squash.v * dt;
    const s = Math.max(-0.35, Math.min(0.45, squash.s));
    scaler.scale.set(1 - s, 1 + s * 0.55, 1 + s * 0.55);

    // самовыравнивание
    if (righting.active) {
      righting.t += dt / righting.dur;
      const t = Math.min(1, righting.t);
      spin.quaternion.slerpQuaternions(righting.from, righting.to, easeOutBack(t));
      if (t >= 1) righting.active = false;
    }

    // покачивание + дрожь + лёгкое дыхание в покое
    wob.t += dt;
    const wa = wob.amp * Math.exp(-3 * wob.t) * Math.sin(wob.t * 11);
    wobble.quaternion.setFromAxisAngle(wob.axis, wa);
    if (tremble > 0) {
      _q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.03 * tremble, 0, (Math.random() - 0.5) * 0.03 * tremble));
      wobble.quaternion.multiply(_q);
    }
    if (exprName === 'idle') {
      _q.setFromEuler(new THREE.Euler(Math.sin(time * 1.3) * 0.025, Math.sin(time * 0.7) * 0.04, Math.sin(time * 0.9) * 0.02));
      wobble.quaternion.multiply(_q);
    }
    if (exprName === 'dizzy') {
      _q.setFromEuler(new THREE.Euler(Math.sin(time * 4) * 0.08, 0, Math.cos(time * 4) * 0.1));
      wobble.quaternion.multiply(_q);
    }

    root.updateMatrixWorld(true);

    // моргание
    blinkT -= dt;
    if (blinkT <= 0 && blinkPhase < 0) { blinkPhase = 0; }
    let blinkMul = 1;
    if (blinkPhase >= 0) {
      blinkPhase += dt / 0.16;
      blinkMul = Math.abs(1 - 2 * Math.min(1, blinkPhase));
      if (blinkPhase >= 1) { blinkPhase = -1; blinkT = 1.5 + Math.random() * 3.5; }
    }
    if (cur.spiral > 0.5 || cur.lid < 0.3) blinkMul = 1;

    const lid = cur.lid * blinkMul;
    spiralAngle += dt * 9;
    for (const e of eyes) {
      e.upper.rotation.x = 0.08 - lid * 0.92;
      e.lower.rotation.x = 0.8 - cur.squint * 0.78;
      e.spiral.visible = cur.spiral > 0.5;
      e.iris.visible = !e.spiral.visible;
      e.spiral.rotation.y = spiralAngle * e.s;

      let gx = 0, gy = 0;
      if (lookTarget && cur.spiral < 0.5) {
        const v = e.group.worldToLocal(_v.copy(lookTarget));
        gx = Math.atan2(v.x, v.z);
        gy = Math.atan2(v.y, Math.hypot(v.x, v.z));
        gx = Math.max(-0.6, Math.min(0.6, gx));
        gy = Math.max(-0.35, Math.min(0.35, gy));
      }
      if (cur.spiral > 0.5) { gx = 0; gy = 0; }
      e.gx += (gx - e.gx) * (1 - Math.exp(-18 * dt));
      e.gy += (gy - e.gy) * (1 - Math.exp(-18 * dt));
      e.ball.rotation.set(-e.gy, e.gx, 0);
    }

    for (const b of brows) {
      b.holder.position.y = cur.browY;
      b.holder.rotation.z = -b.s * (cur.browWorry * 0.38 - cur.browAngry * 0.42);
    }

    rebuildMouth(cur.smile, cur.width, cur.open);
    mouthLine.visible = cur.open < 0.12;
    mouthOpen.visible = !mouthLine.visible;
    mouthOpen.scale.set(0.17 * cur.width, 0.035 + 0.13 * cur.open, 0.03);
    teeth.visible = cur.open > 0.35;
    tongue.visible = cur.open > 0.15;

    blushMat.opacity = cur.blush * 0.5;

    // капля пота сползает по виску
    if (cur.sweat > 0.05) {
      sweatP += dt * 0.35;
      if (sweatP > 1) sweatP = 0;
      const lat = 0.42 - sweatP * 0.45;
      placeOut(sweat, dirLL(lat, 0.78), 1.02);
      drop.scale.setScalar(cur.sweat * (sweatP < 0.1 ? sweatP * 10 : 1));
      sweatMat.opacity = 0.85 * Math.min(1, (1 - sweatP) * 3);
    }
    sweat.visible = cur.sweat > 0.05;

    // серёжки: маятник в мировых координатах (Верле)
    const center = root.getWorldPosition(new THREE.Vector3());
    const g = -30 * R;
    for (const h of hoops) {
      const p = h.holder.getWorldPosition(new THREE.Vector3());
      if (!h.init) { h.pos.set(p.x, p.y - h.L * R, p.z); h.prev.copy(h.pos); h.init = true; }
      const vel = _v.copy(h.pos).sub(h.prev).multiplyScalar(0.985);
      h.prev.copy(h.pos);
      h.pos.add(vel);
      h.pos.y += g * dt * dt;
      // длина подвеса
      const off = _v2.copy(h.pos).sub(p);
      off.setLength(h.L * R);
      h.pos.copy(p).add(off);
      // не проходить сквозь голову
      const fromC = _v2.copy(h.pos).sub(center);
      if (fromC.length() < R * 1.04) { fromC.setLength(R * 1.04); h.pos.copy(center).add(fromC); }
      // ориентация держателя
      const local = h.holder.parent.worldToLocal(h.pos.clone()).sub(h.holder.position).normalize();
      h.holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), local);
    }
  }

  return {
    root, spin, face, radius: R, meshes,
    setExpression, lookAt, impulse, roll, rightUp, wobbleKick, setTremble, update,
    get expression() { return exprName; },
  };
}
