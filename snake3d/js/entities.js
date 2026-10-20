// ============================================================
// SERPENTINE — Сущности: еда, хищники-жуки, эффекты частиц
// ============================================================
import * as THREE from '../vendor/three.module.js';
import { CELL } from './level.js';

// ---------- ЕДА ----------
export class Food {
  constructor(scene, biome, kind = 'normal') {
    this.kind = kind; // normal | golden | poison
    this.scene = scene;
    this.group = new THREE.Group();
    const color = kind === 'golden' ? 0xffd700 : kind === 'poison' ? 0x9932cc : biome.food.color;
    const glow = kind === 'golden' ? 0xffee88 : kind === 'poison' ? 0xbb66ff : biome.food.glow;

    // плод: сфера + листик + ореол
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1),
      new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: 0.55, roughness: 0.4, flatShading: true }));
    body.castShadow = true;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 5),
      new THREE.MeshStandardMaterial({ color: 0x4caf50, emissive: 0x1a3a1a }));
    leaf.position.y = 0.4; leaf.rotation.z = 0.4;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.14, depthWrite: false }));
    this.group.add(body, leaf, halo);
    this.body = body; this.halo = halo;
    this.group.position.y = 0.55;
    scene.add(this.group);
    this.taken = false;
    this._t = Math.random() * 10;
  }
  get position() { return this.group.position; }
  update(dt, time) {
    this.group.position.y = 0.55 + Math.sin(time * 2 + this._t) * 0.12;
    this.body.rotation.y = time * 1.2;
    const p = 1 + Math.sin(time * 3 + this._t) * 0.08;
    this.halo.scale.setScalar(p);
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => o.geometry && o.geometry.dispose());
  }
}

// ---------- ХИЩНИК (жук-светлячок, атакует по прямой) ----------
export class Predator {
  constructor(scene, biome, x, z, speed) {
    this.scene = scene;
    this.speed = speed;
    this.group = new THREE.Group();
    const shellColor = biome.name.includes('Пустота') ? 0x332255 : 0x222233;
    const glowColor = 0xff2244;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6),
      new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.3, metalness: 0.6, flatShading: true }));
    shell.scale.set(1.2, 0.75, 1);
    shell.castShadow = true;
    const eyeM = new THREE.MeshBasicMaterial({ color: glowColor });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), eyeM);
      e.position.set(s * 0.18, 0.08, 0.42);
      this.group.add(e);
    }
    // лапки
    const legM = new THREE.MeshStandardMaterial({ color: 0x111118 });
    this.legs = [];
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.4, 4), legM);
      leg.position.set(-0.25 + i * 0.25, -0.12, s * 0.3);
      leg.rotation.x = s * 0.6;
      this.group.add(leg); this.legs.push(leg);
    }
    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8),
      new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.1, depthWrite: false }));
    this.group.add(shell, aura);
    this.group.position.set(x, 0.55, z);
    scene.add(this.group);
    this.heading = Math.atan2(-z, -x);
    this.alive = true;
  }
  get position() { return this.group.position; }
  update(dt, targetPos, blockedFn, half, time) {
    if (!this.alive) return;
    // охота: к игроку, если далеко — патрулирование
    const dx = targetPos.x - this.group.position.x;
    const dz = targetPos.z - this.group.position.z;
    const desired = Math.atan2(dz, dx);
    let diff = desired - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += THREE.MathUtils.clamp(diff, -1.8 * dt, 1.8 * dt);
    const vx = Math.cos(this.heading) * this.speed;
    const vz = Math.sin(this.heading) * this.speed;
    let nx = this.group.position.x + vx * dt;
    let nz = this.group.position.z + vz * dt;
    const R = half * CELL - 0.6;
    if (Math.abs(nx) > R || Math.abs(nz) > R || blockedFn(Math.round(nx / CELL), Math.round(nz / CELL))) {
      this.heading += Math.PI * 0.6 + (Math.random() - 0.5);
      return;
    }
    this.group.position.x = nx; this.group.position.z = nz;
    this.group.rotation.y = -this.heading + Math.PI / 2;
    this.group.position.y = 0.55 + Math.sin(time * 6) * 0.05;
    for (let i = 0; i < this.legs.length; i++)
      this.legs[i].rotation.z = Math.sin(time * 14 + i) * 0.5;
  }
  distTo(p) {
    return Math.hypot(this.group.position.x - p.x, this.group.position.z - p.z);
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => o.geometry && o.geometry.dispose());
  }
}

// ---------- СИСТЕМА ЧАСТИЦ ВЗРЫВА/ПОЕДАНИЯ ----------
export class BurstFX {
  constructor(scene) {
    this.scene = scene;
    this.pools = [];
  }
  burst(pos, color, count = 24, spread = 3, size = 0.1, gravity = -6) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const v = [];
    for (let i = 0; i < count; i++) {
      p[i*3] = pos.x; p[i*3+1] = pos.y; p[i*3+2] = pos.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      const sp = spread * (0.4 + Math.random() * 0.6);
      v.push(new THREE.Vector3(Math.sin(ph)*Math.cos(th)*sp, Math.abs(Math.cos(ph))*sp*0.8+1, Math.sin(ph)*Math.sin(th)*sp));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.pools.push({ pts, v, life: 1, gravity });
  }
  ring(pos, color) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    m.rotation.x = Math.PI / 2;
    m.position.copy(pos); m.position.y = 0.1;
    this.scene.add(m);
    this.pools.push({ pts: m, ring: true, life: 1 });
  }
  update(dt) {
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const f = this.pools[i];
      f.life -= dt * (f.ring ? 2.2 : 1.4);
      if (f.life <= 0) {
        this.scene.remove(f.pts);
        f.pts.geometry && f.pts.geometry.dispose();
        f.pts.material && f.pts.material.dispose();
        this.pools.splice(i, 1);
        continue;
      }
      if (f.ring) {
        f.pts.scale.setScalar(1 + (1 - f.life) * 6);
        f.pts.material.opacity = f.life;
      } else {
        const arr = f.pts.geometry.attributes.position.array;
        for (let j = 0; j < f.v.length; j++) {
          f.v[j].y += f.gravity * dt;
          arr[j*3] += f.v[j].x * dt; arr[j*3+1] += f.v[j].y * dt; arr[j*3+2] += f.v[j].z * dt;
        }
        f.pts.geometry.attributes.position.needsUpdate = true;
        f.pts.material.opacity = f.life;
      }
    }
  }
}
