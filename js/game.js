// Боря-биток: американский пул (восьмёрка), где биток — голова Бори.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createHead } from './head.js?v=3';
import { FX } from './fx.js?v=3';
import { R, HX, HZ, POCKETS, buildTable, createBallMesh, rackPositions, createCue, BALL_COLORS } from './table.js?v=3';
import { Physics } from './physics.js?v=3';
import * as sfx from './audio.js?v=3';

const $ = (id) => document.getElementById(id);
const UP = new THREE.Vector3(0, 1, 0);
const mobile = Math.min(innerWidth, innerHeight) < 700;

// ---------- рендер и сцена ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.75 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0e1013');
scene.fog = new THREE.Fog('#0e1013', 120, 260);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 600);
scene.add(new THREE.HemisphereLight('#fff6e8', '#2a3a30', 1.0));
const sun = new THREE.DirectionalLight('#fff1d6', 2.3);
sun.position.set(6, 70, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 28, bottom: -28, near: 30, far: 110 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun);
const fill = new THREE.DirectionalLight('#ffe6d6', 0.8);
fill.position.set(-20, 25, 40);
scene.add(fill);

const table = buildTable(scene);
const fx = new FX(scene);

// ---------- Боря ----------
const head = createHead({ radius: R });
scene.add(head.root);
const physics = new Physics();
const borya = physics.add({ num: 0, x: -HX / 2, z: 0, mesh: head.root });

// синяки сохраняются навсегда (в браузере)
const BRUISE_KEY = 'borya-bruises';
try {
  const saved = JSON.parse(localStorage.getItem(BRUISE_KEY) || '[]');
  for (const b of saved) head.applyBruise(b);
} catch (e) { /* нет хранилища */ }
function saveBruises() {
  try { localStorage.setItem(BRUISE_KEY, JSON.stringify(head.bruises.slice(-300))); } catch (e) { /* ignore */ }
  updateBruiseCount();
}
function bruise(point, strength) {
  head.addBruise(point, strength);
  saveBruises();
}

// ---------- кий и прицел ----------
const cue = createCue();
scene.add(cue);
const cueTip = new THREE.Object3D();
cue.add(cueTip);

const guide = new THREE.Group();
scene.add(guide);
const ribbonMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });
const ribbonMat2 = new THREE.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.7, depthWrite: false });
const ribbonMat3 = new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.45, depthWrite: false });
function ribbon(mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.order = 'YXZ';
  guide.add(m);
  return m;
}
const rMain = ribbon(ribbonMat), rObj = ribbon(ribbonMat2), rCue = ribbon(ribbonMat3);
const ghost = new THREE.Mesh(new THREE.RingGeometry(R - 0.08, R, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
ghost.rotation.x = -Math.PI / 2;
guide.add(ghost);
function setRibbon(m, ax, az, bx, bz, w) {
  const len = Math.hypot(bx - ax, bz - az);
  m.visible = len > 0.05;
  m.position.set((ax + bx) / 2, 0.04, (az + bz) / 2);
  m.rotation.set(-Math.PI / 2, 0, 0);
  m.rotation.y = 0;
  m.rotation.z = Math.atan2(-(bz - az), bx - ax);
  m.scale.set(len, w, 1);
}
// плоскость ленточки лежит в XY и поворачивается вокруг Z — после поворота X на -90° это поворот в плоскости стола

// ---------- шары ----------
const balls = [];
function setupBalls() {
  for (const b of balls) scene.remove(b.mesh);
  balls.length = 0;
  physics.balls.length = 0;
  physics.balls.push(borya);
  Object.assign(borya, { x: -HX / 2, z: 0, vx: 0, vz: 0, active: true });
  for (const p of rackPositions()) {
    const mesh = createBallMesh(p.num);
    scene.add(mesh);
    const b = physics.add({ num: p.num, x: p.x, z: p.z, mesh });
    balls.push(b);
  }
  syncMeshes();
}
const groupOf = (n) => (n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe');
const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _d = new THREE.Vector3();
function onMove(b, dx, dz) {
  if (b === borya) {
    _d.set(dx, 0, dz);
    head.roll(_d);
    shot.ride += Math.hypot(dx, dz);
    return;
  }
  const len = Math.hypot(dx, dz);
  _ax.set(dz / len, 0, -dx / len);
  _q.setFromAxisAngle(_ax, len / R);
  b.mesh.quaternion.premultiply(_q);
}
function syncMeshes() {
  for (const b of physics.balls) if (b.active) b.mesh.position.set(b.x, R, b.z);
}

// ---------- состояние игры ----------
const G = {
  mode: 'cpu',
  players: [],
  cur: 0,
  state: 'menu',
  isBreak: true,
  ballInHand: false,
  aim: 0,
  power: 0,
  charging: false,
  camMode: 'behind',
  aimDist: 15,
  yawOff: 0, pitchOff: 0,
};
const shot = { firstHit: null, pocketed: [], scratch: false, ride: 0, maxV: 0, ownBefore: false };
const falling = [];
let time = 0, stateT = 0;
let exprBase = 'idle', exprUntil = 0;
function flash(name, dur) { head.setExpression(name); exprUntil = time + dur; }
function setBase(n) { exprBase = n; if (time >= exprUntil) head.setExpression(n); }
function setState(s) { G.state = s; stateT = 0; }

const P = () => G.players[G.cur];
const isCPU = () => P() && P().cpu;
function groupCleared(pl) {
  if (!pl.group) return false;
  return balls.filter((b) => groupOf(b.num) === pl.group).every((b) => !b.active);
}
function legalNums(pl) {
  if (!pl.group) return balls.filter((b) => b.active && b.num !== 8).map((b) => b.num);
  if (groupCleared(pl)) return [8];
  return balls.filter((b) => b.active && groupOf(b.num) === pl.group).map((b) => b.num);
}

// ---------- старт партии ----------
function newGame(mode) {
  G.mode = mode;
  G.players = mode === 'cpu'
    ? [{ name: 'Ты', group: null, cpu: false }, { name: 'Компьютер', group: null, cpu: true }]
    : [{ name: 'Игрок 1', group: null, cpu: false }, { name: 'Игрок 2', group: null, cpu: false }];
  G.cur = 0;
  G.isBreak = true;
  G.ballInHand = false;
  falling.length = 0;
  fx.clear();
  setupBalls();
  head.root.visible = true;
  head.root.scale.setScalar(1);
  G.aim = 0;
  $('menu').hidden = true;
  $('over').hidden = true;
  $('hud').hidden = false;
  toast('Разбой! Первым бьёт: ' + P().name);
  startTurn();
}

function startTurn() {
  updateHUD();
  if (!borya.active) respawnBorya();
  if (G.ballInHand) {
    if (isCPU()) { aiPlace(); G.ballInHand = false; beginAim(); }
    else { setState('place'); $('place').hidden = false; toast('Шар с руки: перетащи Борю и нажми «Готово»'); }
  } else beginAim();
}

function beginAim() {
  $('place').hidden = true;
  G.ballInHand = false;
  G.power = 0;
  G.charging = false;
  G.yawOff = (Math.random() - 0.5) * 1.0;
  G.pitchOff = -0.25 + Math.random() * 0.6;
  setState('aim');
  setBase('aim');
  cue.visible = true;
  cue.userData.setOpacity(1);
  ai.phase = 'think';
  ai.t = 0;
  updateHUD();
}

function respawnBorya() {
  let x = -HX / 2, z = 0;
  outer: for (let r = 0; r < 30; r += 1.2) {
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const tx = -HX / 2 + Math.cos(a) * r, tz = Math.sin(a) * r;
      if (physics.freeAt(tx, tz, borya)) { x = tx; z = tz; break outer; }
    }
  }
  Object.assign(borya, { x, z, vx: 0, vz: 0, active: true });
  head.root.visible = true;
  head.root.position.set(x, R, z);
  head.root.scale.setScalar(0.01);
  popT = 0;
  head.rightUp(camera.position.clone().sub(head.root.position), 0.01);
}
let popT = 1;

// ---------- удар ----------
let strikeFrom = 0;
function aimDir() { return new THREE.Vector3(Math.cos(G.aim), 0, Math.sin(G.aim)); }
function cueGap() { return 0.35 + G.power * 4.5; }
function placeCue(gap) {
  const d = aimDir();
  cue.visible = true;
  cue.position.set(borya.x - d.x * (R + gap), R + 0.1, borya.z - d.z * (R + gap));
  cue.rotation.set(0, Math.atan2(d.z, -d.x), 0.1);
}

function shoot() {
  if (G.state !== 'aim' || G.power < 0.02) { G.power = 0; return; }
  strikeFrom = cueGap();
  setState('strike');
}

function impact() {
  const d = aimDir();
  const p = G.power;
  const speed = 3 + 52 * Math.pow(p, 1.15);
  borya.vx = d.x * speed;
  borya.vz = d.z * speed;
  Object.assign(shot, { firstHit: null, pocketed: [], scratch: false, ride: 0, maxV: speed, ownBefore: groupCleared(P()) });
  const pos = head.root.position;
  const contact = pos.clone().addScaledVector(d, -R);
  head.setFaceTarget(null);
  head.lookAt(null);
  head.impulse(d, 0.5 + p * 0.8);
  head.setTremble(0);
  bruise(contact.clone().add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.3, 0)), 0.3 + 0.7 * p);
  fx.ring(contact, d.clone().negate());
  fx.starBurst(contact.clone().add(new THREE.Vector3(0, 0.4, 0)), 4 + Math.round(p * 10), 0.6 + p);
  fx.text(pos.clone().add(new THREE.Vector3(0, 2.6, 0)), p > 0.55 ? 'БАЦ!' : p > 0.25 ? 'ТУК!' : 'тык', { size: 1.1 + p });
  sfx.bonk(p);
  flash('hit', 0.3 + p * 0.35);
  setBase('roll');
  chaseDir.copy(d);
  setState('moving');
}

// ---------- события физики ----------
function handleEvents(events) {
  for (const e of events) {
    if (e.type === 'ball') {
      sfx.clack(Math.min(1, e.speed / 30));
      const withB = e.a === borya ? e.b : e.b === borya ? e.a : null;
      if (withB) {
        if (shot.firstHit === null) shot.firstHit = withB.num;
        const n = new THREE.Vector3(withB.x - borya.x, 0, withB.z - borya.z).normalize();
        head.impulse(n, Math.min(1, e.speed / 25));
        if (e.speed > 12) flash('oof', 0.3);
        if (e.speed > 26) bruise(head.root.position.clone().addScaledVector(n, R), Math.min(0.7, (e.speed - 26) / 30 + 0.2));
        if (e.speed > 25) fx.starBurst(head.root.position.clone().addScaledVector(n, R).add(new THREE.Vector3(0, 0.6, 0)), 5, 0.6);
      }
    } else if (e.type === 'cushion') {
      sfx.thud(Math.min(1, e.speed / 30));
      if (e.ball === borya) {
        const n = new THREE.Vector3(-e.nx, 0, -e.nz);
        head.impulse(n, Math.min(1, e.speed / 20));
        if (e.speed > 8) flash('oof', 0.35);
        if (e.speed > 16) {
          fx.text(head.root.position.clone().add(new THREE.Vector3(0, 2.4, 0)), 'ОЙ!', { size: 1 });
          fx.starBurst(head.root.position.clone().addScaledVector(n, R).add(new THREE.Vector3(0, 0.6, 0)), 6, 0.6);
        }
        if (e.speed > 28) bruise(head.root.position.clone().addScaledVector(n, R), Math.min(0.7, (e.speed - 28) / 30 + 0.2));
      }
    } else if (e.type === 'pocket') {
      sfx.pocket();
      const b = e.ball;
      falling.push({ b, p: e.pocket, t: 0, x: b.x, z: b.z });
      if (b === borya) {
        shot.scratch = true;
        head.setExpression('scared');
        exprBase = 'scared';
        sfx.whistle();
        fx.text(new THREE.Vector3(e.pocket.x, 4, e.pocket.z), 'А-А-А!', { size: 1.5 });
      } else {
        shot.pocketed.push(b.num);
        if (borya.active) flash('happy', 0.9);
      }
    }
  }
}

function updateFalling(dt) {
  for (let i = falling.length - 1; i >= 0; i--) {
    const f = falling[i];
    f.t += dt;
    const k = Math.min(1, f.t / 0.35);
    const x = f.x + (f.p.x - f.x) * k, z = f.z + (f.p.z - f.z) * k;
    const y = R - Math.max(0, f.t - 0.15) * Math.max(0, f.t - 0.15) * 30;
    f.b.mesh.position.set(x, y, z);
    if (f.b === borya) head.root.position.set(x, y, z);
    if (y < -5) {
      f.b.mesh.visible = f.b === borya ? false : false;
      if (f.b === borya) head.root.visible = false;
      falling.splice(i, 1);
    }
  }
}

// ---------- разбор хода ----------
function resolve() {
  const pl = P(), op = G.players[1 - G.cur];
  const s = shot;
  let foul = null;
  if (s.scratch) foul = 'Боря упал в лузу!';
  else if (s.firstHit === null) foul = 'не задет ни один шар';
  else if (pl.group && s.firstHit !== 8 && groupOf(s.firstHit) !== pl.group) foul = 'первым задет чужой шар';
  else if (s.firstHit === 8 && !(pl.group && s.ownBefore) && !G.isBreak) foul = 'первой задета восьмёрка';

  if (s.pocketed.includes(8)) {
    if (G.isBreak) {
      respot8();
      toast('Восьмёрка на разбое — возвращаем на точку');
    } else {
      const win = pl.group && s.ownBefore && !foul;
      gameOver(win ? G.cur : 1 - G.cur, win ? 'Чисто забил восьмёрку!' : (foul ? 'Восьмёрка с фолом' : 'Восьмёрка забита раньше времени'));
      return;
    }
  }
  let assigned = '';
  if (!pl.group && !G.isBreak && !foul) {
    const first = s.pocketed.find((n) => n !== 8);
    if (first) {
      pl.group = groupOf(first);
      op.group = pl.group === 'solid' ? 'stripe' : 'solid';
      assigned = `${pl.name}: ${pl.group === 'solid' ? 'сплошные' : 'полосатые'}. `;
    }
  }
  const own = s.pocketed.filter((n) => n !== 8 && (pl.group ? groupOf(n) === pl.group : true));
  const pre = assigned;
  assigned = '';
  G.isBreak = false;
  if (foul) {
    G.cur = 1 - G.cur;
    G.ballInHand = true;
    toast(`Фол: ${foul} Шар с руки — ${P().name}`, 2600);
  } else if (own.length > 0) {
    toast(`${pre}Забито: ${own.length}. ${pl.name} — ещё удар`);
  } else {
    G.cur = 1 - G.cur;
    toast(`${pre}Ход: ${P().name}`);
  }
  startTurn();
}

function respot8() {
  const b = balls.find((x) => x.num === 8);
  let x = HX / 2;
  while (!physics.freeAt(x, 0, b) && x < HX - 2) x += 0.5;
  Object.assign(b, { x, z: 0, vx: 0, vz: 0, active: true });
  b.mesh.visible = true;
  b.mesh.position.set(x, R, 0);
}

function gameOver(winner, reason) {
  setState('over');
  cue.visible = false;
  guide.visible = false;
  const w = G.players[winner];
  $('overTitle').textContent = G.mode === 'cpu' ? (winner === 0 ? '🏆 Победа!' : '😿 Компьютер победил') : `🏆 ${w.name} победил!`;
  $('overText').textContent = `${reason} Синяков у Бори: ${head.bruises.length}`;
  $('over').hidden = false;
  $('hud').hidden = true;
  setBase('happy');
  if (borya.active) head.rightUp(camera.position.clone().sub(head.root.position), 0.8);
  sfx.fanfare();
}

// ---------- компьютер ----------
const ai = { phase: 'think', t: 0, target: 0, power: 0 };
const DECEL = 6.5;
function planFrom(cx, cz, pl) {
  const legal = legalNums(pl);
  let best = null;
  for (const b of balls) {
    if (!b.active || !legal.includes(b.num)) continue;
    for (const p of POCKETS) {
      // точка прицела — устье лузы
      const tx = p.x - Math.sign(p.x) * (p.x === 0 ? 0 : 0.9), tz = p.z - Math.sign(p.z) * (p.x === 0 ? 1.2 : 0.9);
      let ux = tx - b.x, uz = tz - b.z;
      const d2 = Math.hypot(ux, uz);
      ux /= d2; uz /= d2;
      if (p.x === 0 && Math.abs(uz) < 0.6) continue;
      const gx = b.x - ux * 2 * R, gz = b.z - uz * 2 * R;
      let vx = gx - cx, vz = gz - cz;
      const d1 = Math.hypot(vx, vz);
      if (d1 < 0.1) continue;
      vx /= d1; vz /= d1;
      const cos = vx * ux + vz * uz;
      if (cos < 0.3) continue;
      if (!physics.clearPath(cx, cz, gx, gz, [borya, b])) continue;
      if (!physics.clearPath(b.x, b.z, tx, tz, [b, borya])) continue;
      const score = (cos * cos) / (1 + d1 * 0.02 + d2 * 0.03);
      const vObj = Math.sqrt(2 * DECEL * (d2 + 2)) / (0.97 * cos);
      const v0 = Math.min(55, Math.max(6, Math.sqrt(vObj * vObj + 2 * DECEL * d1) * 1.25));
      if (!best || score > best.score) best = { score, angle: Math.atan2(vz, vx), speed: v0 };
    }
  }
  return best;
}
function aiPlan() {
  const pl = P();
  let best = planFrom(borya.x, borya.z, pl);
  if (!best) {
    // нет прямого удара — бьём в ближайший свой шар
    const legal = legalNums(pl);
    let nb = null, nd = Infinity;
    for (const b of balls) {
      if (!b.active || !legal.includes(b.num)) continue;
      const d = Math.hypot(b.x - borya.x, b.z - borya.z);
      if (d < nd) { nd = d; nb = b; }
    }
    best = nb ? { angle: Math.atan2(nb.z - borya.z, nb.x - borya.x), speed: 22 } : { angle: Math.random() * 6.28, speed: 20 };
  }
  ai.target = best.angle + (Math.random() - 0.5) * 0.035;
  ai.power = Math.pow(Math.max(0, (best.speed - 3) / 52), 1 / 1.15);
  if (G.isBreak) { ai.target = Math.atan2(-borya.z, HX / 2 - borya.x) + (Math.random() - 0.5) * 0.02; ai.power = 0.92; }
}
function aiPlace() {
  let bestPos = null, bestScore = -1;
  for (let i = 0; i < 80; i++) {
    const x = (Math.random() * 2 - 1) * (HX - 2), z = (Math.random() * 2 - 1) * (HZ - 2);
    if (!physics.freeAt(x, z, borya)) continue;
    const plan = planFrom(x, z, P());
    const sc = plan ? plan.score : 0;
    if (sc > bestScore) { bestScore = sc; bestPos = [x, z]; }
  }
  if (bestPos) {
    Object.assign(borya, { x: bestPos[0], z: bestPos[1], vx: 0, vz: 0, active: true });
    head.root.position.set(borya.x, R, borya.z);
  }
}
function aiUpdate(dt) {
  ai.t += dt;
  if (ai.phase === 'think' && ai.t > 0.7) { aiPlan(); ai.phase = 'turn'; ai.t = 0; }
  else if (ai.phase === 'turn') {
    let diff = ((ai.target - G.aim + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const stepA = Math.sign(diff) * Math.min(Math.abs(diff), dt * 2.2);
    G.aim += stepA;
    if (Math.abs(diff) < 0.002 && ai.t > 0.6) { G.aim = ai.target; ai.phase = 'pull'; ai.t = 0; }
  } else if (ai.phase === 'pull') {
    G.power = Math.min(ai.power, G.power + dt * 0.9);
    if (G.power >= ai.power && ai.t > 0.5) { ai.phase = 'done'; shoot(); }
  }
}

// ---------- камера ----------
const camPos = new THREE.Vector3(-HX / 2 - 15, 9, 0);
const camLook = new THREE.Vector3(0, 0, 0);
const camUp = new THREE.Vector3(0, 1, 0);
const chaseDir = new THREE.Vector3(1, 0, 0);
camera.position.copy(camPos);
function topView(out) {
  const ax = HX + 6, az = HZ + 6;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const portrait = camera.aspect < 1;
  const h = (portrait ? Math.max(ax, az / camera.aspect) : Math.max(az, ax / camera.aspect)) / t * 1.12;
  out.pos.set(0, h, 0.001);
  out.look.set(0, 0, 0);
  out.up.set(portrait ? -1 : 0, 0, portrait ? 0 : -1);
}
const want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), rate: 4 };
function updateCamera(dt) {
  const hp = new THREE.Vector3(borya.x, R, borya.z);
  want.up.set(0, 1, 0);
  want.rate = 4;
  const st = G.state;
  if ((st === 'aim' || st === 'strike' || st === 'over' || st === 'menu') && G.camMode === 'top' && st !== 'menu') topView(want);
  else if (st === 'place') topView(want);
  else if (st === 'aim' || st === 'strike') {
    const d = aimDir();
    want.pos.copy(hp).addScaledVector(d, -G.aimDist).add(new THREE.Vector3(0, G.aimDist * 0.42, 0));
    want.look.copy(hp).addScaledVector(d, G.aimDist * 0.5);
    want.rate = 6;
  } else if (st === 'moving' || st === 'settle') {
    const sp = Math.hypot(borya.vx, borya.vz);
    if (borya.active) {
      if (sp > 1) {
        const prev = chaseDir.clone();
        chaseDir.lerp(new THREE.Vector3(borya.vx / sp, 0, borya.vz / sp), 1 - Math.exp(-2.5 * dt));
        // при развороте на 180° вектор может схлопнуться — поворачиваем через бок
        if (chaseDir.lengthSq() < 0.04) chaseDir.set(-prev.z, 0, prev.x);
        chaseDir.normalize();
      }
      if (st === 'settle' || sp > 1 || !physics.moving()) {
        want.pos.copy(hp).addScaledVector(chaseDir, -12).add(new THREE.Vector3(0, 6, 0));
        want.look.copy(hp).addScaledVector(chaseDir, 3);
      } else {
        // Боря встал, но шары ещё катятся — поднимаемся и смотрим на самый быстрый
        let fb = null, fv = 0;
        for (const b of balls) { const v = Math.hypot(b.vx, b.vz); if (b.active && v > fv) { fv = v; fb = b; } }
        const tgt = fb ? new THREE.Vector3(fb.x, R, fb.z) : hp;
        const dir = tgt.clone().sub(hp).setY(0);
        if (dir.lengthSq() > 1) dir.normalize(); else dir.copy(chaseDir);
        want.pos.copy(hp).addScaledVector(dir, -14).add(new THREE.Vector3(0, 14, 0));
        want.look.copy(hp).lerp(tgt, 0.6);
        want.rate = 2;
      }
      want.rate = Math.max(want.rate, 3.5);
    } else {
      // Боря в лузе
      const f = falling.find((x) => x.b === borya);
      const p = f ? f.p : POCKETS[0];
      want.look.set(p.x, 0, p.z);
      want.pos.copy(camPos);
      want.rate = 3;
    }
  } else if (st === 'over' || st === 'menu') {
    const a = time * 0.08;
    want.pos.set(Math.cos(a) * 60, 32, Math.sin(a) * 40);
    want.look.set(0, 0, 0);
    want.rate = 1.5;
  }
  const k = 1 - Math.exp(-want.rate * dt);
  camPos.lerp(want.pos, k);
  camLook.lerp(want.look, k);
  camUp.lerp(want.up, k).normalize();
  camera.position.copy(camPos);
  camera.up.copy(camUp);
  camera.lookAt(camLook);
  table.userData.lamps.visible = camera.position.y < 27;
}

// ---------- ввод ----------
const raycaster = new THREE.Raycaster();
const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R);
function tablePoint(ev) {
  const v = new THREE.Vector2((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(v, camera);
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(tablePlane, p) ? p : null;
}
let drag = null;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (ev) => {
  sfx.unlockAudio();
  if (isCPU()) return;
  drag = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
  canvas.setPointerCapture(ev.pointerId);
  pointerAct(ev, true);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag || drag.id !== ev.pointerId) return;
  pointerAct(ev, false);
  drag.x = ev.clientX; drag.y = ev.clientY;
});
const endDrag = (ev) => { if (drag && drag.id === ev.pointerId) drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function pointerAct(ev, first) {
  if (G.state === 'place') {
    const p = tablePoint(ev);
    if (p && physics.freeAt(p.x, p.z, borya)) {
      borya.x = p.x; borya.z = p.z;
      head.root.position.set(p.x, R, p.z);
    }
  } else if (G.state === 'aim') {
    if (G.camMode === 'top') {
      const p = tablePoint(ev);
      if (p && Math.hypot(p.x - borya.x, p.z - borya.z) > 0.5) G.aim = Math.atan2(p.z - borya.z, p.x - borya.x);
    } else if (!first) {
      G.aim += (ev.clientX - drag.x) * 0.0035;
    }
  }
}
canvas.addEventListener('wheel', (ev) => {
  G.aimDist = Math.max(7, Math.min(45, G.aimDist * (1 + Math.sign(ev.deltaY) * 0.1)));
  ev.preventDefault();
}, { passive: false });

// сила удара: тянем ползунок вниз и отпускаем
const powerEl = $('power');
let pdrag = null;
powerEl.addEventListener('pointerdown', (ev) => {
  sfx.unlockAudio();
  if (G.state !== 'aim' || isCPU()) return;
  pdrag = { y: ev.clientY, id: ev.pointerId };
  powerEl.setPointerCapture(ev.pointerId);
  G.charging = true;
});
powerEl.addEventListener('pointermove', (ev) => {
  if (!pdrag || pdrag.id !== ev.pointerId) return;
  const h = powerEl.querySelector('.track').getBoundingClientRect().height;
  G.power = Math.max(0, Math.min(1, (ev.clientY - pdrag.y) / (h * 0.9)));
});
const releasePower = (ev) => {
  if (!pdrag || pdrag.id !== ev.pointerId) return;
  pdrag = null;
  G.charging = false;
  shoot();
};
powerEl.addEventListener('pointerup', releasePower);
powerEl.addEventListener('pointercancel', (ev) => { pdrag = null; G.charging = false; G.power = 0; });

// клавиатура
const keys = {};
addEventListener('keydown', (ev) => {
  sfx.unlockAudio();
  if (ev.repeat) return;
  keys[ev.code] = true;
  if (ev.code === 'Space' && G.state === 'aim' && !isCPU()) { G.charging = true; G.power = 0; spaceT = 0; }
  if (ev.code === 'Space' && G.state === 'place') confirmPlace();
  if (ev.code === 'KeyC') toggleCam();
});
addEventListener('keyup', (ev) => {
  keys[ev.code] = false;
  if (ev.code === 'Space' && G.charging && !pdrag) { G.charging = false; shoot(); }
});
let spaceT = 0;

// кнопки тонкой доводки
for (const [id, dir] of [['left', -1], ['right', 1]]) {
  const el = $(id);
  el.addEventListener('pointerdown', (ev) => { fine = dir; el.setPointerCapture(ev.pointerId); });
  el.addEventListener('pointerup', () => { fine = 0; });
  el.addEventListener('pointercancel', () => { fine = 0; });
}
let fine = 0;

function toggleCam() {
  G.camMode = G.camMode === 'top' ? 'behind' : 'top';
  $('cam').textContent = G.camMode === 'top' ? '🎥 За Борей' : '🗺️ Сверху';
}
$('cam').addEventListener('click', toggleCam);
function syncSnd() { $('snd').textContent = sfx.isMuted() ? '🔇' : '🔊'; }
$('snd').addEventListener('click', () => { sfx.setMuted(!sfx.isMuted()); syncSnd(); });
syncSnd();
$('menuBtn').addEventListener('click', showMenu);
function confirmPlace() {
  if (G.state !== 'place') return;
  G.ballInHand = false;
  beginAim();
}
$('ready').addEventListener('click', confirmPlace);
$('playCpu').addEventListener('click', () => { sfx.unlockAudio(); newGame('cpu'); });
$('playPvp').addEventListener('click', () => { sfx.unlockAudio(); newGame('pvp'); });
$('again').addEventListener('click', () => newGame(G.mode));
$('toMenu').addEventListener('click', showMenu);
$('heal').addEventListener('click', () => {
  if (!confirm('Вылечить Борю? Все синяки исчезнут.')) return;
  head.healAll();
  saveBruises();
});
function showMenu() {
  setState('menu');
  cue.visible = false;
  $('menu').hidden = false;
  $('over').hidden = true;
  $('hud').hidden = true;
  $('place').hidden = true;
  setBase('idle');
  updateBruiseCount();
}

// ---------- HUD ----------
function updateBruiseCount() {
  const n = (head.bruises || []).length;
  $('bruises').textContent = `🤕 ${n}`;
  $('healCount').textContent = n;
  $('heal').hidden = n === 0;
}
function updateHUD() {
  G.players.forEach((pl, i) => {
    const el = $('p' + i);
    el.classList.toggle('active', i === G.cur);
    el.querySelector('.name').textContent = pl.name;
    el.querySelector('.group').textContent = pl.group ? (pl.group === 'solid' ? 'сплошные' : 'полосатые') : 'стол открыт';
    const dots = el.querySelector('.dots');
    dots.innerHTML = '';
    if (pl.group) {
      for (const b of balls.filter((x) => groupOf(x.num) === pl.group).sort((a, c) => a.num - c.num)) {
        const s = document.createElement('span');
        s.className = 'dot' + (b.active ? '' : ' gone') + (b.num > 8 ? ' stripe' : '');
        s.style.setProperty('--c', BALL_COLORS[b.num > 8 ? b.num - 8 : b.num]);
        s.textContent = b.num;
        dots.appendChild(s);
      }
      if (groupCleared(pl)) {
        const s = document.createElement('span');
        s.className = 'dot eight';
        s.textContent = '8';
        dots.appendChild(s);
      }
    }
  });
  const human = !isCPU();
  $('power').classList.toggle('disabled', !human);
  $('fine').hidden = !human || G.camMode === 'top';
  $('turn').textContent = isCPU() ? 'Компьютер думает…' : `Ход: ${P().name}`;
  updateBruiseCount();
}
let toastTimer = 0;
function toast(msg, dur = 1800) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

// ---------- главный цикл ----------
const clock = new THREE.Clock();
function frame() {
  tick(Math.min(clock.getDelta(), 1 / 30));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function tick(dt) {
  time += dt;
  stateT += dt;
  if (time >= exprUntil && head.expression !== exprBase) head.setExpression(exprBase);

  const st = G.state;
  if (st === 'aim') {
    if (isCPU()) aiUpdate(dt);
    else {
      const rot = (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0) + fine;
      if (rot) G.aim += rot * dt * (keys.ShiftLeft || keys.ShiftRight || fine ? 0.12 : 0.7);
      if (G.charging && !pdrag) { spaceT += dt; G.power = Math.min(1, spaceT / 1.3); }
    }
    const idle = G.charging || isCPU() ? 0 : 0.25 * (0.5 + 0.5 * Math.sin(time * 2.4));
    placeCue(cueGap() + idle);
    head.lookAt(cueTip.getWorldPosition(new THREE.Vector3()));
    const toCam = camera.position.clone().sub(head.root.position).setY(0).normalize().applyAxisAngle(UP, G.yawOff);
    toCam.y = G.pitchOff;
    head.setFaceTarget(toCam);
    head.setTremble(0.3 + G.power * 1.5);
    updateGuide();
  } else if (st === 'strike') {
    const k = Math.min(1, stateT / 0.09);
    placeCue(strikeFrom * (1 - k) - 0.05 * k);
    if (k >= 1) impact();
    updateGuide();
  } else if (st === 'moving') {
    const events = physics.step(dt, onMove);
    handleEvents(events);
    syncMeshes();
    shot.maxV = Math.max(shot.maxV, Math.hypot(borya.vx, borya.vz));
    if (cue.visible) {
      const d = aimDir();
      cue.position.addScaledVector(d, dt * 2);
      let o = 0;
      cue.traverse((m) => { if (m.material) { m.material.opacity = Math.max(0, m.material.opacity - dt * 2); o = m.material.opacity; } });
      if (o <= 0) cue.visible = false;
    }
    const bs = Math.hypot(borya.vx, borya.vz);
    if (borya.active && exprBase !== 'scared') setBase(bs > 6 ? 'roll' : 'idle');
    if (!physics.moving() && falling.length === 0 && stateT > 0.3) {
      setState('settle');
      if (borya.active && shot.ride > 12 && shot.maxV > 14) {
        setBase('dizzy');
        head.rightUp(camera.position.clone().sub(head.root.position), 0.9);
        head.wobbleKick(new THREE.Vector3(0, 0, 1), 0.3);
        fx.dizzyStars(head.root, R, 2.2);
        settleWait = 2.0;
      } else settleWait = 0.4;
    }
  } else if (st === 'settle') {
    if (stateT > settleWait) resolve();
  }
  if (st !== 'aim' && st !== 'strike') guide.visible = false;
  if (st === 'aim' || st === 'strike') guide.visible = true;
  if (st === 'menu') head.lookAt(camera.position);

  updateFalling(dt);
  if (popT < 1) {
    popT = Math.min(1, popT + dt / 0.5);
    const s = popT === 1 ? 1 : 1 - Math.pow(2, -10 * popT) * Math.cos(popT * 12);
    head.root.scale.setScalar(Math.max(0.01, s));
  }
  if (borya.active && !falling.some((f) => f.b === borya)) head.root.position.set(borya.x, R, borya.z);
  head.update(dt, time);
  fx.update(dt);
  updateCamera(dt);
}
let settleWait = 0;

function updateGuide() {
  const d = aimDir();
  const tr = physics.trace(borya, d.x, d.z, borya);
  const gx = borya.x + d.x * tr.t, gz = borya.z + d.z * tr.t;
  setRibbon(rMain, borya.x + d.x * R, borya.z + d.z * R, gx - d.x * R * 0.9, gz - d.z * R * 0.9, 0.14);
  ghost.position.set(gx, 0.05, gz);
  if (tr.ball) {
    const nx = (tr.ball.x - gx) / (2 * R), nz = (tr.ball.z - gz) / (2 * R);
    const legal = legalNums(P()).includes(tr.ball.num);
    ghost.material.color.set(legal ? '#ffffff' : '#ff4a3d');
    ribbonMat2.color.set(legal ? '#ffd23a' : '#ff4a3d');
    const dot = d.x * nx + d.z * nz;
    const L = 4 + 10 * dot;
    setRibbon(rObj, tr.ball.x + nx * R, tr.ball.z + nz * R, tr.ball.x + nx * (R + L), tr.ball.z + nz * (R + L), 0.14);
    let tx = d.x - dot * nx, tz = d.z - dot * nz;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const Lc = 6 * (1 - dot);
    setRibbon(rCue, gx, gz, gx + tx * Lc, gz + tz * Lc, 0.1);
  } else {
    ghost.material.color.set('#ffffff');
    rObj.visible = false;
    rCue.visible = false;
  }
  // полоска силы
  $('pfill').style.height = `${G.power * 100}%`;
  $('pval').textContent = Math.round(G.power * 100);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// старт: меню поверх вращающегося стола
setupBalls();
head.root.position.set(borya.x, R, borya.z);
head.rightUp(new THREE.Vector3(-1, 0, 0.6), 0.01);
showMenu();
window.__game = { tick, render: () => renderer.render(scene, camera), G, physics, head, newGame, borya, balls, shoot, setPower: (p) => { G.power = p; }, setAim: (a) => { G.aim = a; } };
frame();
