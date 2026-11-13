// 2D-физика шаров на плоскости xz: трение, соударения, борта, лузы.
import { R, HX, HZ, POCKETS, SEGMENTS } from './table.js?v=8';

const E_BALL = 0.96;
const ITER = 12;     // проходов по столкновениям за шаг — импульс проходит через всю пирамиду
const E_CUSHION = 0.78;
const ROLL_DECEL = 6.5;
const DRAG = 0.03;   // было 0.12 — сильно тормозило быстрые шары
const STOP = 0.06;

export class Physics {
  constructor() {
    this.balls = [];
  }

  add(ball) {
    // ball: { num, x, z, vx, vz, active }
    Object.assign(ball, { vx: 0, vz: 0, active: true });
    this.balls.push(ball);
    return ball;
  }

  moving() {
    return this.balls.some((b) => b.active && (b.vx !== 0 || b.vz !== 0));
  }

  // dt — время кадра. Возвращает события за кадр.
  step(dt, onMove) {
    const events = [];
    let maxV = 0;
    for (const b of this.balls) if (b.active) maxV = Math.max(maxV, Math.hypot(b.vx, b.vz));
    const n = Math.min(60, Math.max(1, Math.ceil((maxV * dt) / (R * 0.2))));
    const h = dt / n;
    const act = this.balls.filter((b) => b.active);

    for (let s = 0; s < n; s++) {
      // движение + трение
      for (const b of act) {
        if (!b.active) continue;
        const sp = Math.hypot(b.vx, b.vz);
        if (sp === 0) continue;
        const dx = b.vx * h, dz = b.vz * h;
        b.x += dx; b.z += dz;
        onMove && onMove(b, dx, dz);
        const ns = Math.max(0, sp - (ROLL_DECEL + DRAG * sp) * h);
        if (ns < STOP) { b.vx = 0; b.vz = 0; } else { b.vx *= ns / sp; b.vz *= ns / sp; }
      }
      // шар-шар: сначала разводим пересечения
      const contacts = [];
      for (let i = 0; i < act.length; i++) {
        const a = act[i];
        if (!a.active) continue;
        for (let j = i + 1; j < act.length; j++) {
          const b = act[j];
          if (!b.active) continue;
          let nx = b.x - a.x, nz = b.z - a.z;
          const d2 = nx * nx + nz * nz;
          if (d2 >= 4 * R * R) continue;
          const d = Math.sqrt(d2) || 1e-6;
          nx /= d; nz /= d;
          const overlap = 2 * R - d;
          a.x -= nx * overlap / 2; a.z -= nz * overlap / 2;
          b.x += nx * overlap / 2; b.z += nz * overlap / 2;
          contacts.push({ a, b, nx, nz });
        }
      }
      // импульсы: накапливаем по каждому контакту, пока у всех не будет нужной
      // скорости отскока (−e·скорость сближения). Так удар расходится по всей
      // пирамиде одновременно, а не улетает в один задний шар
      for (const c of contacts) {
        c.rel0 = Math.max(0, (c.a.vx - c.b.vx) * c.nx + (c.a.vz - c.b.vz) * c.nz);
        c.acc = 0;
      }
      for (let it = 0; it < ITER && contacts.length; it++) {
        let worst = 0;
        for (const c of contacts) {
          const rel = (c.a.vx - c.b.vx) * c.nx + (c.a.vz - c.b.vz) * c.nz;
          const lambda = (rel + E_BALL * c.rel0) / 2;
          const acc = Math.max(0, c.acc + lambda);
          const jmp = acc - c.acc;
          c.acc = acc;
          if (jmp === 0) continue;
          worst = Math.max(worst, Math.abs(jmp));
          c.a.vx -= jmp * c.nx; c.a.vz -= jmp * c.nz;
          c.b.vx += jmp * c.nx; c.b.vz += jmp * c.nz;
        }
        if (worst < 1e-3) break;
      }
      for (const c of contacts) {
        if (c.rel0 > 0.05) events.push({ type: 'ball', a: c.a, b: c.b, speed: c.rel0, nx: c.nx, nz: c.nz });
      }
      // борта
      for (const b of act) {
        if (!b.active) continue;
        for (const [x1, z1, x2, z2] of SEGMENTS) {
          const sx = x2 - x1, sz = z2 - z1;
          const L2 = sx * sx + sz * sz;
          let t = ((b.x - x1) * sx + (b.z - z1) * sz) / L2;
          t = Math.max(0, Math.min(1, t));
          const qx = x1 + sx * t, qz = z1 + sz * t;
          let nx = b.x - qx, nz = b.z - qz;
          const d = Math.hypot(nx, nz);
          if (d >= R || d === 0) continue;
          nx /= d; nz /= d;
          b.x = qx + nx * R; b.z = qz + nz * R;
          const vn = b.vx * nx + b.vz * nz;
          if (vn < 0) {
            b.vx -= (1 + E_CUSHION) * vn * nx;
            b.vz -= (1 + E_CUSHION) * vn * nz;
            // немного трения вдоль борта
            b.vx *= 0.97; b.vz *= 0.97;
            events.push({ type: 'cushion', ball: b, speed: -vn, nx, nz });
          }
        }
      }
      // лузы
      for (const b of act) {
        if (!b.active) continue;
        for (const p of POCKETS) {
          if (Math.hypot(b.x - p.x, b.z - p.z) < p.capture) {
            b.active = false;
            events.push({ type: 'pocket', ball: b, pocket: p, vx: b.vx, vz: b.vz });
            b.vx = 0; b.vz = 0;
            break;
          }
        }
        // страховка: улетел за пределы
        if (b.active && (Math.abs(b.x) > HX + 3 || Math.abs(b.z) > HZ + 3)) {
          let best = POCKETS[0], bd = Infinity;
          for (const p of POCKETS) { const dd = Math.hypot(b.x - p.x, b.z - p.z); if (dd < bd) { bd = dd; best = p; } }
          b.active = false;
          events.push({ type: 'pocket', ball: b, pocket: best, vx: 0, vz: 0 });
          b.vx = 0; b.vz = 0;
        }
      }
    }
    return events;
  }

  // Свободно ли место для шара
  freeAt(x, z, ignore) {
    if (Math.abs(x) > HX - R || Math.abs(z) > HZ - R) return false;
    for (const p of POCKETS) if (Math.hypot(x - p.x, z - p.z) < p.r + R) return false;
    for (const b of this.balls) if (b !== ignore && b.active && Math.hypot(b.x - x, b.z - z) < 2 * R + 0.02) return false;
    return true;
  }

  // Трассировка линии прицела: первый шар или борт на пути
  trace(from, dx, dz, ignore) {
    let bestT = Infinity, hitBall = null;
    for (const b of this.balls) {
      if (b === ignore || !b.active) continue;
      const fx = b.x - from.x, fz = b.z - from.z;
      const t = fx * dx + fz * dz;
      if (t <= 0) continue;
      const perp2 = fx * fx + fz * fz - t * t;
      const rr = 4 * R * R;
      if (perp2 > rr) continue;
      const tt = t - Math.sqrt(rr - perp2);
      if (tt < bestT) { bestT = tt; hitBall = b; }
    }
    // борта (приближённо — прямоугольник)
    let tw = Infinity;
    if (dx > 0) tw = Math.min(tw, (HX - R - from.x) / dx);
    if (dx < 0) tw = Math.min(tw, (-HX + R - from.x) / dx);
    if (dz > 0) tw = Math.min(tw, (HZ - R - from.z) / dz);
    if (dz < 0) tw = Math.min(tw, (-HZ + R - from.z) / dz);
    if (tw < bestT) return { t: Math.max(0, tw), ball: null };
    return { t: bestT, ball: hitBall };
  }

  // Свободен ли коридор от a до b для шара (кроме исключений)
  clearPath(ax, az, bx, bz, ignore = []) {
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz) || 1e-6;
    const ux = dx / L, uz = dz / L;
    for (const o of this.balls) {
      if (!o.active || ignore.includes(o)) continue;
      const fx = o.x - ax, fz = o.z - az;
      const t = fx * ux + fz * uz;
      if (t < 0 || t > L) continue;
      if (Math.abs(fx * uz - fz * ux) < 2 * R - 0.05) return false;
    }
    return true;
  }
}
