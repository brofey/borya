// Мультяшные эффекты: звёздочки, надписи, кольцо удара, звёзды над головой.
import * as THREE from 'three';

function starShape(r1 = 1, r2 = 0.45, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  return s;
}

const starGeo = new THREE.ExtrudeGeometry(starShape(), { depth: 0.35, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 });
starGeo.center();

function starMat() {
  return new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ffb000', emissiveIntensity: 0.6, roughness: 0.4, transparent: true });
}

function textSprite(text, { fill = '#ffe04a', stroke = '#1a1a1a', size = 1.6 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.font = '900 150px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 26;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, 256, 132);
  ctx.fillStyle = '#e8332a';
  ctx.fillText(text, 262, 138);
  ctx.fillStyle = fill;
  ctx.fillText(text, 256, 132);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(size * 2, size, 1);
  sp.renderOrder = 10;
  return sp;
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.halo = null;
  }

  starBurst(pos, count = 9, power = 1) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(starGeo, starMat());
      m.scale.setScalar(0.12 + Math.random() * 0.1);
      m.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0.6 + Math.random() * 1.2, Math.sin(a)).multiplyScalar((3 + Math.random() * 3) * power);
      const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      this.scene.add(m);
      this.items.push({ m, life: 0, max: 0.9 + Math.random() * 0.3, update: (it, dt) => {
        v.y -= 14 * dt;
        m.position.addScaledVector(v, dt);
        m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; m.rotation.z += spin.z * dt;
        m.material.opacity = 1 - Math.pow(it.life / it.max, 3);
      } });
    }
  }

  text(pos, str, opts = {}) {
    const sp = textSprite(str, opts);
    sp.position.copy(pos);
    const base = sp.scale.clone();
    this.scene.add(sp);
    this.items.push({ m: sp, life: 0, max: 1.0, update: (it, dt) => {
      const t = it.life / it.max;
      const pop = t < 0.15 ? t / 0.15 * 1.25 : 1.25 - Math.min(0.25, (t - 0.15) * 2);
      sp.scale.copy(base).multiplyScalar(pop);
      sp.position.y += dt * 0.8;
      sp.material.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      sp.material.rotation = Math.sin(it.life * 20) * 0.05;
    } });
  }

  ring(pos, normal) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.75, 40),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, side: THREE.DoubleSide, depthWrite: false })
    );
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    this.scene.add(m);
    this.items.push({ m, life: 0, max: 0.35, update: (it) => {
      const t = it.life / it.max;
      m.scale.setScalar(0.3 + t * 2.2);
      m.material.opacity = 1 - t;
    } });
  }

  // звёзды кружатся над головой
  dizzyStars(target, radius = 1, duration = 3) {
    const g = new THREE.Group();
    const stars = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(starGeo, starMat());
      m.scale.setScalar(0.14 * radius);
      g.add(m);
      stars.push(m);
    }
    this.scene.add(g);
    this.items.push({ m: g, life: 0, max: duration, update: (it) => {
      const t = it.life;
      target.getWorldPosition(g.position);
      g.position.y += radius * 1.35;
      const fade = Math.min(1, t * 4, (it.max - t) * 2);
      stars.forEach((s, i) => {
        const a = t * 3.2 + (i / stars.length) * Math.PI * 2;
        s.position.set(Math.cos(a) * radius * 0.85, Math.sin(a * 2) * 0.08 * radius, Math.sin(a) * radius * 0.85);
        s.rotation.y = a * 2;
        s.material.opacity = fade;
        s.scale.setScalar(0.14 * radius * (0.6 + 0.4 * fade));
      });
    } });
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.m);
    this.items = [];
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life += dt;
      it.update(it, dt);
      if (it.life >= it.max) {
        this.scene.remove(it.m);
        this.items.splice(i, 1);
      }
    }
  }
}
