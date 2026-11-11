// Стол для американского пула: геометрия, лузы, борта (сегменты для физики), шары и кий.
import * as THREE from 'three';

export const R = 1;          // радиус шара (и Бори)
export const HX = 36;        // половина длины игрового поля
export const HZ = 18;        // половина ширины
const CW = 1.4;              // ширина резинового борта
const RW = 3.2;              // ширина деревянной рамы
const CG = 3.3;              // отступ борта от угла (угловая луза)
const SG = 2.3;              // половина ширины средней лузы
const RAIL_H = 1.45;

export const POCKETS = [
  { x: -HX - 0.7, z: -HZ - 0.7, r: 2.4, capture: 1.95 },
  { x: 0, z: -HZ - 1.25, r: 2.15, capture: 1.85 },
  { x: HX + 0.7, z: -HZ - 0.7, r: 2.4, capture: 1.95 },
  { x: -HX - 0.7, z: HZ + 0.7, r: 2.4, capture: 1.95 },
  { x: 0, z: HZ + 1.25, r: 2.15, capture: 1.85 },
  { x: HX + 0.7, z: HZ + 0.7, r: 2.4, capture: 1.95 },
];

// Сегменты бортов: [x1, z1, x2, z2]
function buildSegments() {
  const segs = [];
  for (const sz of [-1, 1]) {
    const z = sz * HZ;
    segs.push([-HX + CG, z, -SG, z], [SG, z, HX - CG, z]);
    // губки средней лузы
    segs.push([-SG, z, -SG + 0.45, z + sz * CW], [SG, z, SG - 0.45, z + sz * CW]);
  }
  for (const sx of [-1, 1]) {
    const x = sx * HX;
    segs.push([x, -HZ + CG, x, HZ - CG]);
  }
  // губки угловых луз
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * HX, cz = sz * HZ;
    segs.push([cx - sx * CG, cz, cx - sx * CG + sx * CW, cz + sz * CW]);
    segs.push([cx, cz - sz * CG, cx + sx * CW, cz - sz * CG + sz * CW]);
  }
  return segs;
}
export const SEGMENTS = buildSegments();

function feltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#17643e';
  ctx.fillRect(0, 0, 256, 256);
  const img = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(18, 9);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a2c17';
  ctx.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(${30 + Math.random() * 40},${12 + Math.random() * 15},5,${0.15 + Math.random() * 0.25})`;
    ctx.lineWidth = 0.5 + Math.random() * 2;
    ctx.beginPath();
    const y = Math.random() * 64;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.08, 0.08);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTable(scene) {
  const g = new THREE.Group();
  scene.add(g);
  const X0 = HX + CW, Z0 = HZ + CW;           // внутренний край рамы
  const X1 = X0 + RW, Z1 = Z0 + RW;           // внешний край

  // сукно
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(X0 * 2, Z0 * 2), new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95 }));
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  g.add(felt);

  // разметка: точки и линия дома
  const markMat = new THREE.MeshBasicMaterial({ color: '#cfe8d8', transparent: true, opacity: 0.35 });
  for (const x of [-HX / 2, HX / 2]) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), markMat);
    d.rotation.x = -Math.PI / 2; d.position.set(x, 0.01, 0);
    g.add(d);
  }
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, HZ * 2), markMat);
  line.rotation.x = -Math.PI / 2; line.position.set(-HX / 2, 0.01, 0);
  g.add(line);

  // деревянная рама с вырезами под лузы: контур = прямоугольник ∪ круги луз
  const shape = new THREE.Shape();
  shape.moveTo(-X1, -Z1); shape.lineTo(X1, -Z1); shape.lineTo(X1, Z1); shape.lineTo(-X1, Z1); shape.lineTo(-X1, -Z1);
  const pts = [];
  const per = [[-X0, -Z0, X0, -Z0], [X0, -Z0, X0, Z0], [X0, Z0, -X0, Z0], [-X0, Z0, -X0, -Z0]];
  for (const [ax, az, bx, bz] of per) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.15);
    for (let i = 0; i < n; i++) {
      let x = ax + (bx - ax) * (i / n), z = az + (bz - az) * (i / n);
      for (const p of POCKETS) {
        const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
        if (d < p.r) { x = p.x + (dx / (d || 1)) * p.r; z = p.z + (dz / (d || 1)) * p.r; }
      }
      pts.push(new THREE.Vector2(x, z));
    }
  }
  shape.holes.push(new THREE.Path(pts.reverse()));
  const frameGeo = new THREE.ExtrudeGeometry(shape, { depth: RAIL_H, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 2, curveSegments: 4 });
  frameGeo.rotateX(Math.PI / 2);
  frameGeo.translate(0, RAIL_H, 0);
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), color: '#b98a6a', roughness: 0.35, metalness: 0.05 });
  const frame = new THREE.Mesh(frameGeo, wood);
  frame.castShadow = frame.receiveShadow = true;
  g.add(frame);

  // ромбики-прицелы на раме
  const diamondMat = new THREE.MeshStandardMaterial({ color: '#f3ead2', roughness: 0.3, metalness: 0.2 });
  const dg = new THREE.CircleGeometry(0.28, 4);
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    const x = -HX + (i * HX * 2) / 8;
    for (const sz of [-1, 1]) {
      const d = new THREE.Mesh(dg, diamondMat);
      d.rotation.x = -Math.PI / 2; d.position.set(x, RAIL_H + 0.16, sz * (Z0 + RW / 2));
      g.add(d);
    }
  }
  for (let i = 1; i < 4; i++) {
    const z = -HZ + (i * HZ * 2) / 4;
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(dg, diamondMat);
      d.rotation.x = -Math.PI / 2; d.position.set(sx * (X0 + RW / 2), RAIL_H + 0.16, z);
      g.add(d);
    }
  }

  // резиновые борта: призмы вдоль сегментов
  const cushMat = new THREE.MeshStandardMaterial({ color: '#145c38', roughness: 0.9 });
  for (const [x1, z1, x2, z2] of SEGMENTS) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const isJaw = len < 3;
    // нормаль внутрь стола
    let nx = -(z2 - z1) / len, nz = (x2 - x1) / len;
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    if (nx * -mx + nz * -mz < 0) { nx = -nx; nz = -nz; }
    const depth = isJaw ? 0.5 : CW;
    const b = new THREE.Mesh(new THREE.BoxGeometry(len + (isJaw ? 0 : 0.2), 1.25, depth), cushMat);
    b.position.set(mx - nx * depth / 2, 0.62, mz - nz * depth / 2);
    b.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    b.receiveShadow = true;
    g.add(b);
  }

  // лузы: чёрные колодцы + хромированные ободки
  const holeMat = new THREE.MeshBasicMaterial({ color: '#030303' });
  const chrome = new THREE.MeshStandardMaterial({ color: '#d8d8dc', metalness: 1, roughness: 0.2 });
  for (const p of POCKETS) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 0.85, 6, 40), holeMat);
    h.position.set(p.x, -2.98, p.z);
    g.add(h);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r + 0.05, 0.16, 8, 40), chrome);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(p.x, RAIL_H + 0.1, p.z);
    g.add(ring);
  }

  // корпус и ножки
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#3a1c0e', roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(X1 * 2 - 1, 6, Z1 * 2 - 1), bodyMat);
  body.position.y = -3.05;
  body.receiveShadow = true;
  g.add(body);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.1, 22, 16), bodyMat);
    leg.position.set(sx * (X1 - 4), -17, sz * (Z1 - 4));
    g.add(leg);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#1c1410', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -28;
  floor.receiveShadow = true;
  g.add(floor);

  // лампы над столом
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#1f5c3a', roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fff3d0' });
  const lamps = new THREE.Group();
  g.add(lamps);
  for (const x of [-22, 0, 22]) {
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 4.5, 3, 24, 1, true), shadeMat);
    shade.position.set(x, 30, 0);
    lamps.add(shade);
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), bulbMat);
    bulb.rotation.x = Math.PI / 2; bulb.position.set(x, 29.2, 0);
    lamps.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 40, 6), new THREE.MeshBasicMaterial({ color: '#111' }));
    cord.position.set(x, 51.5, 0);
    lamps.add(cord);
  }
  g.userData.lamps = lamps;
  return g;
}

// ---------- шары ----------
export const BALL_COLORS = ['#ffffff', '#f2c014', '#1f4fbf', '#d8241f', '#5b2c8f', '#f07a18', '#1d8a4a', '#7a1f1f', '#111111'];

function ballTexture(num) {
  const color = BALL_COLORS[num > 8 ? num - 8 : num];
  const striped = num > 8;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = striped ? '#f4f1e8' : color;
  ctx.fillRect(0, 0, 512, 256);
  if (striped) { ctx.fillStyle = color; ctx.fillRect(0, 68, 512, 120); }
  for (const cx of [128, 384]) {
    ctx.fillStyle = '#f4f1e8';
    ctx.beginPath(); ctx.ellipse(cx, 128, 40, 46, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 50px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(num), cx, 131);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createBallMesh(num) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(R, 40, 28),
    new THREE.MeshPhysicalMaterial({ map: ballTexture(num), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 })
  );
  m.castShadow = true;
  m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  return m;
}

// Пирамида: биток смотрит вершиной на дом, 8 — в центре
export function rackPositions() {
  const solids = [2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  shuffle(solids); shuffle(stripes);
  const order = [];
  const res = [];
  const fx = HX / 2;
  for (let i = 0; i < 5; i++) for (let j = 0; j <= i; j++) order.push([i, j]);
  const corner1 = stripes.pop(), corner2 = solids.pop();
  const rest = shuffle([...solids, ...stripes]);
  for (const [i, j] of order) {
    let num;
    if (i === 0) num = 1;
    else if (i === 2 && j === 1) num = 8;
    else if (i === 4 && j === 0) num = corner1;
    else if (i === 4 && j === 4) num = corner2;
    else num = rest.pop();
    // небольшой случайный разброс — каждый разбой немного другой
    const jit = () => (Math.random() - 0.5) * 0.04;
    res.push({ num, x: fx + i * (Math.sqrt(3) * R + 0.012) + jit(), z: (j - i / 2) * (2 * R + 0.012) + jit() });
  }
  return res;
}

// ---------- кий ----------
export function createCue() {
  const g = new THREE.Group();
  const piece = (rTop, rBot, len, x, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 24), mat);
    m.rotation.z = -Math.PI / 2;
    m.position.x = x + len / 2;
    m.castShadow = true;
    g.add(m);
  };
  const mat = (color, rough = 0.4) => new THREE.MeshStandardMaterial({ color, roughness: rough, transparent: true });
  piece(0.075, 0.07, 0.07, 0, mat('#3b7bd8', 0.9));
  piece(0.078, 0.075, 0.3, 0.07, mat('#f3efe4'));
  piece(0.13, 0.078, 13.0, 0.37, mat('#e2c28c', 0.35));
  piece(0.145, 0.13, 0.3, 13.37, mat('#1a1a1a'));
  piece(0.18, 0.145, 4, 13.67, mat('#6b2a17', 0.3));
  piece(0.2, 0.18, 3, 17.67, mat('#151515', 0.8));
  piece(0.21, 0.2, 2.5, 20.67, mat('#6b2a17', 0.3));
  piece(0.21, 0.21, 0.15, 23.17, mat('#111'));
  g.rotation.order = 'YZX';
  g.userData.setOpacity = (o) => g.traverse((m) => { if (m.material) m.material.opacity = o; });
  return g;
}
