// ============================================================
// SERPENTINE — Snake: движение, сегменты, голова от первого лица,
// язык, зрение (глаза по бокам), рост, столкновения
// ============================================================
import * as THREE from '../vendor/three.module.js';
import { CELL } from './level.js';

const SEG_SPACING = 0.62;   // расстояние между сегментами вдоль пути
const HEAD_Y = 0.55;        // высота глаз над землёй

export class Snake {
  constructor(scene, biome) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.speed = 4.2;              // м/с базовая
    this.turnRate = 3.1;           // рад/с скорость поворота
    this.heading = 0;              // куда смотрим (вокруг Y)
    this.targetHeading = 0;
    this.path = [];                // история точек [{x,z}] для тела
    this.lengthCells = 8;          // "клетки" длины — растёт при поедании
    this.segments = [];            // меши тела
    this.maxSegments = 90;

    // рывок
    this.dashEnergy = 1;
    this.dashing = false;
    this.slippery = !!biome.slippery; // лёд — занос
    this._slide = 0;

    // яд / эффекты
    this.slowTimer = 0;
    this.alive = true;

    this._buildBody(biome);
    this._resetPath();
  }

  _resetPath() {
    // заполняем историю позади головы
    this.path = [];
    const back = new THREE.Vector3(Math.cos(this.heading), 0, Math.sin(this.heading));
    for (let i = 0; i < 400; i++) {
      this.path.push({ x: -back.x * i * 0.1, z: -back.z * i * 0.1 });
    }
  }

  _bodyMaterials(biome) {
    const scaleMat = new THREE.MeshStandardMaterial({
      color: biome.snakeScale, roughness: 0.35, metalness: 0.25,
      emissive: biome.snakeScale, emissiveIntensity: 0.12, flatShading: true });
    const bellyMat = new THREE.MeshStandardMaterial({
      color: biome.snakeBelly, roughness: 0.6 });
    return { scaleMat, bellyMat };
  }

  _buildBody(biome) {
    const { scaleMat, bellyMat } = this._bodyMaterials(biome);
    this.scaleMat = scaleMat; this.bellyMat = bellyMat;

    // ---------- ГОЛОВА ----------
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.72), scaleMat);
    skull.castShadow = true;
    this.head.add(skull);
    // морда
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.34), scaleMat);
    snout.position.set(0, -0.04, 0.5);
    this.head.add(snout);
    // нижняя челюсть
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.36), bellyMat);
    jaw.position.set(0, -0.17, 0.52);
    this.jaw = jaw;
    this.head.add(jaw);
    // глаза (видны в отражении/от third-person, и как "наросты" по бокам periphery)
    const eyeWhiteM = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffaa00, emissiveIntensity: 0.8 });
    const pupilM = new THREE.MeshBasicMaterial({ color: 0x110800 });
    for (const s of [-1, 1]) {
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), eyeWhiteM);
      ew.position.set(s * 0.26, 0.07, 0.24);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), pupilM);
      p.position.set(s * 0.29, 0.07, 0.3);
      this.head.add(ew, p);
    }
    // язык (высовывается периодически + при поедании)
    this.tongue = new THREE.Group();
    const tm = new THREE.MeshBasicMaterial({ color: 0xff3366 });
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.4, 5), tm);
    tb.rotation.x = Math.PI / 2; tb.position.z = 0.2;
    const forkL = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.14, 4), tm);
    forkL.rotation.x = Math.PI / 2; forkL.position.set(-0.03, 0, 0.45); forkL.rotation.z = 0.4;
    const forkR = forkL.clone(); forkR.position.x = 0.03; forkR.rotation.z = -0.4;
    this.tongue.add(tb, forkL, forkR);
    this.tongue.position.set(0, -0.08, 0.66);
    this.tongue.visible = false;
    this.head.add(this.tongue);

    this.head.position.y = HEAD_Y;
    this.group.add(this.head);

    // ---------- ШЕЯ (первые сегменты крупнее) и ТЕЛО ----------
    const segGeoBig = new THREE.IcosahedronGeometry(0.3, 1);
    const segGeo = new THREE.IcosahedronGeometry(0.26, 1);
    const tailGeo = new THREE.ConeGeometry(0.2, 0.55, 6);
    tailGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < this.maxSegments; i++) {
      let m;
      if (i === this.maxSegments - 1) { m = new THREE.Mesh(tailGeo, scaleMat); }
      else m = new THREE.Mesh(i < 6 ? segGeoBig : segGeo, scaleMat);
      m.castShadow = true;
      m.visible = false;
      this.group.add(m);
      this.segments.push(m);
    }

    // камера от первого лица — внутри головы
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 300);
    this.camera.rotation.order = 'YXZ';
  }

  get position() { return this.head.position; }

  setLength(cells) {
    this.lengthCells = cells;
  }

  get visibleCount() {
    return Math.min(Math.floor(this.lengthCells * CELL / SEG_SPACING) + 6, this.maxSegments);
  }

  update(dt, input, effects = {}) {
    if (!this.alive) return;
    // --- поворот к целевому направлению (льдинка: инерция — поворот «проскальзывает» вперёд)
    let diff = this.targetHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = this.turnRate * dt;
    const turn = THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);
    this.heading += turn;
    if (this.slippery) this._slide += turn * 0.45; // запас «заноса»
    if (this._slide !== 0) {
      const s = Math.sign(this._slide) * Math.min(Math.abs(this._slide), dt * 1.6);
      this.heading += s; this._slide -= s;
    }

    // --- скорость (яд, рывок, течения, ветер)
    let speed = this.speed;
    if (this.slowTimer > 0) { this.slowTimer -= dt; speed *= 0.55; }
    let didDash = false;
    if (this.dashing && this.dashEnergy > 0.2) {
      speed *= 1.9; this.dashEnergy = Math.max(0, this.dashEnergy - dt * 0.5); didDash = true;
    } else this.dashEnergy = Math.min(1, this.dashEnergy + dt * 0.22);
    this._didDash = didDash;
    speed *= (effects.speedMul || 1);

    const vx = Math.cos(this.heading) * speed;
    const vz = Math.sin(this.heading) * speed;
    let nx = this.head.position.x + vx * dt + (effects.pushX || 0) * dt;
    let nz = this.head.position.z + vz * dt + (effects.pushZ || 0) * dt;

    this.head.position.x = nx;
    this.head.position.z = nz;
    this.head.rotation.y = -this.heading + Math.PI / 2;
    // лёгкое покачивание головы — "змееподобная" походка
    this.head.position.y = HEAD_Y + Math.sin(performance.now() * 0.004 * (speed / 4)) * 0.035;
    this.head.rotation.z = Math.sin(performance.now() * 0.003) * 0.05;
    this.jaw.rotation.x = this._jawOpen > 0 ? -this._jawOpen : Math.sin(performance.now() * 0.002) * 0.03;

    // --- запись пути
    const last = this.path[0];
    const ddx = this.head.position.x - last.x, ddz = this.head.position.z - last.z;
    if (ddx * ddx + ddz * ddz > 0.01) {
      this.path.unshift({ x: this.head.position.x, z: this.head.position.z });
      if (this.path.length > 2600) this.path.pop();
    }

    // --- позиционирование сегментов вдоль пути
    const count = this.visibleCount;
    let pi = 0, acc = 0;
    let prevPt = { x: this.head.position.x, z: this.head.position.z };
    for (let s = 0; s < count; s++) {
      const targetDist = (s + 1) * SEG_SPACING;
      while (pi < this.path.length - 1 && acc < targetDist) {
        const np = this.path[pi + 1];
        const segLen = Math.hypot(np.x - prevPt.x, np.z - prevPt.z);
        if (acc + segLen >= targetDist) {
          const t = (targetDist - acc) / Math.max(segLen, 1e-6);
          prevPt = { x: prevPt.x + (np.x - prevPt.x) * t, z: prevPt.z + (np.z - prevPt.z) * t };
          acc = targetDist;
          break;
        }
        acc += segLen; prevPt = np; pi++;
      }
      const m = this.segments[s];
      m.visible = true;
      const wob = Math.sin(performance.now() * 0.005 - s * 0.5) * 0.06;
      m.position.set(prevPt.x, 0.3 + wob * (s > 3 ? 1 : 0.3), prevPt.z);
      if (s > 0) {
        const pm = this.segments[s - 1];
        m.lookAt(pm.position);
      }
      // чешуйчатое дыхание
      const breathe = 1 + Math.sin(performance.now() * 0.003 + s * 0.4) * 0.05;
      m.scale.setScalar(breathe);
    }
    for (let s = count; s < this.maxSegments; s++) this.segments[s].visible = false;

    // --- язык
    this._tongueT = (this._tongueT || 0) - dt;
    if (this._tongueT <= 0) {
      this._tongueT = 1.5 + Math.random() * 3;
      this._flick();
    }
    if (this._tongueAnim > 0) {
      this._tongueAnim -= dt;
      this.tongue.visible = true;
      const k = Math.sin((1 - this._tongueAnim / 0.4) * Math.PI);
      this.tongue.scale.setScalar(0.4 + k);
      this.tongue.rotation.x = Math.sin(this._tongueAnim * 40) * 0.2;
    } else this.tongue.visible = false;
  }

  _flick() { this._tongueAnim = 0.4; }
  biteAnimation() { this._tongueAnim = 0.5; this._jawOpen = 0.6; setTimeout(() => this._jawOpen = 0, 180); }

  // Проверка столкновения головы с телом (кусает себя)
  selfCollisionCheck() {
    const hp = this.head.position;
    const startIdx = Math.floor(1.6 / SEG_SPACING); // шея не считается
    for (let s = startIdx; s < this.visibleCount; s += 2) {
      const m = this.segments[s];
      const dx = m.position.x - hp.x, dz = m.position.z - hp.z;
      if (dx * dx + dz * dz < 0.36) return true;
    }
    return false;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
