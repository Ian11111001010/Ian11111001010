// ============================================================
// SERPENTINE — World Builder: построение визуального мира уровня
// Пол, стены, декор биома, небо, частицы, освещение
// ============================================================
import * as THREE from '../vendor/three.module.js';
import { CELL } from './level.js';
import { BIOMES as BIOMES_REF } from './biomes.js';

// ---------- ПРОЦЕДУРНЫЕ ТЕКСТУРЫ ----------
function canvasTex(size, drawFn, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  drawFn(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeFloorTexture(biome, half) {
  return canvasTex(512, (ctx, s) => {
    const cellsPerSide = 8;
    const cs = s / cellsPerSide;
    const c1 = '#' + biome.floor.color1.toString(16).padStart(6, '0');
    const c2 = '#' + biome.floor.color2.toString(16).padStart(6, '0');
    for (let i = 0; i < cellsPerSide; i++)
      for (let j = 0; j < cellsPerSide; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? c1 : c2;
        ctx.fillRect(i * cs, j * cs, cs, cs);
        // лёгкий шум текстуры
        for (let n = 0; n < 40; n++) {
          ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`;
          ctx.fillRect(i * cs + Math.random() * cs, j * cs + Math.random() * cs, 3, 3);
        }
      }
    // сетка
    const gc = '#' + biome.floor.gridColor.toString(16).padStart(6, '0');
    ctx.strokeStyle = gc; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
    for (let i = 0; i <= cellsPerSide; i++) {
      ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(s, i * cs); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, half); // одна клетка шага = одна клетка текстуры
}

// ---------- ДЕКОР БИОМОВ ----------
const decorFactories = {
  tree(rng, palette) {
    const g = new THREE.Group();
    const trunkH = 1.6 + rng() * 1.4;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.22, trunkH, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }));
    trunk.position.y = trunkH / 2;
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.9 + rng() * 0.5, 1.8 + rng(), 7),
      new THREE.MeshStandardMaterial({ color: rng() < 0.5 ? 0x2e7d32 : 0x388e3c, roughness: 0.8, flatShading: true }));
    crown.position.y = trunkH + 0.7;
    g.add(trunk, crown);
    return g;
  },
  bush(rng) {
    const g = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5 + rng() * 0.3, 0),
      new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.9, flatShading: true }));
    g.position.y = 0.35; g.scale.y = 0.7;
    return g;
  },
  rock(rng) {
    const m = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.4 + rng() * 0.4, 0),
      new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 1, flatShading: true }));
    m.position.y = 0.3; m.rotation.set(rng(), rng(), rng());
    m.scale.y = 0.7;
    return m;
  },
  flower(rng) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x2f6f2f }));
    stem.position.y = 0.25;
    const cols = [0xff6b9d, 0xffd93d, 0xff8c42, 0xc084fc];
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5),
      new THREE.MeshStandardMaterial({ color: cols[Math.floor(rng() * cols.length)], emissive: 0x221100 }));
    head.position.y = 0.52;
    g.add(stem, head);
    return g;
  },
  cactus(rng) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a8f3f, roughness: 0.7 });
    const h = 1.2 + rng() * 1.2;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, h, 7), mat);
    body.position.y = h / 2;
    g.add(body);
    if (rng() < 0.7) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.7, 6), mat);
      arm.position.set(0.35, h * 0.6, 0); arm.rotation.z = -0.9;
      g.add(arm);
    }
    return g;
  },
  ruins(rng) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 0.95, flatShading: true });
    const broken = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.8 + rng() * 1.4, 8), mat);
    broken.position.y = broken.geometry.parameters.height / 2;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.15, 0.95), mat);
    cap.position.y = broken.geometry.parameters.height + 0.05;
    cap.rotation.y = rng() * 0.4;
    g.add(broken, cap);
    return g;
  },
  skull(rng) {
    const g = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 }));
    head.scale.set(1, 0.9, 1.15); head.position.y = 0.3;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xd8ccb0 }));
    jaw.position.set(0, 0.12, 0.18);
    g.add(head, jaw);
    return g;
  },
  icicle(rng) {
    const h = 1 + rng() * 1.6;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.22 + rng() * 0.15, h, 6),
      new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, transmission: 0.4, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.85 }));
    m.position.y = h / 2;
    return m;
  },
  crystal(rng) {
    const g = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x7fd8ff, transmission: 0.5, roughness: 0.1, transparent: true, opacity: 0.8, emissive: 0x1a4a6a });
    for (let i = 0; i < 3; i++) {
      const h = 0.6 + rng() * 1.1;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, h, 5), mat);
      c.position.set((rng() - 0.5) * 0.6, h / 2, (rng() - 0.5) * 0.6);
      c.rotation.z = (rng() - 0.5) * 0.5;
      g.add(c);
    }
    return g;
  },
  boulder(rng) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + rng() * 0.5, 1),
      new THREE.MeshStandardMaterial({ color: 0x8a9aa8, roughness: 0.95, flatShading: true }));
    m.position.y = 0.45; m.scale.y = 0.75; m.rotation.y = rng() * 6;
    return m;
  },
  lavaspire(rng) {
    const h = 1.2 + rng() * 1.6;
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35 + rng() * 0.2, h, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a1512, roughness: 1, flatShading: true }));
    cone.position.y = h / 2;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xff5522 }));
    glow.position.y = h;
    g.userData.glow = glow;
    g.add(cone, glow);
    return g;
  },
  ember(rng) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1 + rng() * 0.1, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xff7733 }));
    m.position.y = 0.15;
    m.userData.float = true;
    return m;
  },
  vine(rng) {
    const g = new THREE.Group();
    const len = 1.5 + rng() * 1.5;
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, len, 5),
      new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 0.8 }));
    v.position.y = len / 2; v.rotation.z = (rng() - 0.5) * 0.3;
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4aa85a, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.18, 5), leafMat);
      l.position.set(0.1 * (i % 2 ? 1 : -1), 0.3 + i * len / 5, 0);
      l.rotation.set(0.3, rng(), 0.5);
      g.add(l);
    }
    g.add(v);
    return g;
  },
  mushroom(rng) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }));
    stem.position.y = 0.25;
    const glow = rng() < 0.5;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: glow ? 0x44ddff : 0xdd4455, emissive: glow ? 0x115566 : 0x330a0a }));
    cap.position.y = 0.5;
    g.add(stem, cap);
    return g;
  },
  fern(rng) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a9a4a, side: THREE.DoubleSide, roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), mat);
      f.position.y = 0.4;
      f.rotation.y = (i / 5) * Math.PI * 2;
      f.rotation.x = -0.5;
      g.add(f);
    }
    return g;
  },
  pylon(rng) {
    const h = 2 + rng() * 2.5;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x141428, emissive: 0x220044, roughness: 0.3, metalness: 0.6 }));
    body.position.y = h / 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.56, h * 0.8, 0.06),
      new THREE.MeshBasicMaterial({ color: rng() < 0.5 ? 0x00e5ff : 0xff00cc }));
    strip.position.set(0, h / 2, 0.28);
    g.add(body, strip);
    g.userData.pulse = strip;
    return g;
  },
  holowall(rng) {
    const w = 1.5 + rng() * 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.2),
      new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    m.position.y = 1.1; m.rotation.y = rng() * Math.PI;
    m.userData.holo = true;
    return m;
  },
  coral(rng) {
    const g = new THREE.Group();
    const cols = [0xff6a88, 0xffa855, 0xa86aff, 0x55ddbb];
    const mat = new THREE.MeshStandardMaterial({ color: cols[Math.floor(rng() * cols.length)], roughness: 0.6, emissive: 0x112233 });
    for (let i = 0; i < 4; i++) {
      const h = 0.4 + rng() * 0.8;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, h, 5), mat);
      branch.position.set((rng() - 0.5) * 0.4, h / 2, (rng() - 0.5) * 0.4);
      branch.rotation.z = (rng() - 0.5) * 0.6;
      g.add(branch);
    }
    return g;
  },
  kelp(rng) {
    const g = new THREE.Group();
    const len = 1.5 + rng() * 2;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a8a5a, roughness: 0.7 });
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, len, 5), mat);
    stalk.position.y = len / 2;
    g.add(stalk);
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.16), mat);
      l.position.set(0.15, 0.3 + i * len / 5.5, 0);
      l.rotation.z = 0.4;
      g.add(l);
    }
    g.userData.sway = true;
    return g;
  },
  bubble(rng) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.15 + rng() * 0.2, 8, 6),
      new THREE.MeshPhysicalMaterial({ color: 0xaaddff, transmission: 0.9, roughness: 0.05, transparent: true, opacity: 0.5 }));
    m.position.y = 0.5 + rng() * 2;
    m.userData.float = true;
    return m;
  },
  monolith(rng) {
    const h = 2.5 + rng() * 2.5;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, emissive: 0x1a0a3a, roughness: 0.2, metalness: 0.8 }));
    m.position.y = h / 2; m.rotation.y = rng() * Math.PI;
    return m;
  },
  orb(rng) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.25 + rng() * 0.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: [0xcc88ff, 0x88aaff, 0xff88cc][Math.floor(rng() * 3)] }));
    m.position.y = 1 + rng() * 2.5;
    m.userData.float = true;
    return m;
  },
  rune(rng) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0xaa66ff }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.9 + rng();
    g.add(ring);
    g.userData.spin = ring;
    return g;
  },
};

// ---------- ЧАСТИЦЫ БИОМА ----------
function makeParticles(type, half) {
  const N = type === 'snow' || type === 'sand' || type === 'data' ? 420 : 260;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const R = half * CELL;
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 2 * R;
    pos[i * 3 + 1] = Math.random() * 7;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 2 * R;
    switch (type) {
      case 'fireflies': vel[i*3]=(Math.random()-.5)*.2; vel[i*3+1]=(Math.random()-.5)*.15; vel[i*3+2]=(Math.random()-.5)*.2; break;
      case 'sand': vel[i*3]=1.5+Math.random(); vel[i*3+1]=(Math.random()-.5)*.2; vel[i*3+2]=(Math.random()-.5)*.5; break;
      case 'snow': vel[i*3]=(Math.random()-.5)*.3; vel[i*3+1]=-0.4-Math.random()*.4; vel[i*3+2]=(Math.random()-.5)*.3; break;
      case 'embers': vel[i*3]=(Math.random()-.5)*.3; vel[i*3+1]=0.6+Math.random()*1.2; vel[i*3+2]=(Math.random()-.5)*.3; break;
      case 'spores': vel[i*3]=(Math.random()-.5)*.2; vel[i*3+1]=0.1+Math.random()*.3; vel[i*3+2]=(Math.random()-.5)*.2; break;
      case 'data': vel[i*3]=0; vel[i*3+1]=-1.2-Math.random(); vel[i*3+2]=0; break;
      case 'bubbles': vel[i*3]=(Math.random()-.5)*.1; vel[i*3+1]=0.3+Math.random()*.5; vel[i*3+2]=(Math.random()-.5)*.1; break;
      case 'stardust': vel[i*3]=(Math.random()-.5)*.15; vel[i*3+1]=(Math.random()-.5)*.15; vel[i*3+2]=(Math.random()-.5)*.15; break;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const colors = { fireflies: 0xffee88, sand: 0xe8c890, snow: 0xffffff, embers: 0xff6622, spores: 0xccff99, data: 0x00e5ff, bubbles: 0x99ddff, stardust: 0xcc99ff };
  const mat = new THREE.PointsMaterial({
    color: colors[type] || 0xffffff, size: type === 'data' ? 0.08 : 0.12,
    transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData = { vel, type, R };
  return pts;
}

export function updateParticles(pts, dt, time) {
  const { vel, type, R } = pts.userData;
  const pos = pts.geometry.attributes.position.array;
  const N = pos.length / 3;
  for (let i = 0; i < N; i++) {
    let x = pos[i*3], y = pos[i*3+1], z = pos[i*3+2];
    if (type === 'fireflies') {
      x += Math.sin(time * 1.3 + i) * 0.004 + vel[i*3] * dt * 0.3;
      y += Math.cos(time * 0.9 + i * 1.7) * 0.003;
      z += Math.cos(time * 1.1 + i * 0.7) * 0.004;
    } else {
      x += vel[i*3] * dt; y += vel[i*3+1] * dt; z += vel[i*3+2] * dt;
    }
    if (y > 8) y = 0.1; if (y < 0) y = 7.5;
    if (x > R) x = -R; if (x < -R) x = R;
    if (z > R) z = -R; if (z < -R) z = R;
    pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z;
  }
  pts.geometry.attributes.position.needsUpdate = true;
}

// ---------- СБОРКА МИРА ----------
export function buildWorld(scene, biome, level, rngSeed) {
  const world = new THREE.Group();
  scene.add(world);
  const rng = (() => { let a = rngSeed | 0; return () => { a = (a * 16807) % 2147483647; return (a - 1) / 2147483646; }; })();
  const half = level.half;
  const R = half * CELL;

  // --- ПОЛ
  const floorTex = makeFloorTexture(biome, half);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.05 });
  if (biome === BIOMES_REF.cyber) floorMat.emissive = new THREE.Color(0x001a22), floorMat.emissiveIntensity = 0.6;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  world.add(floor);

  // --- СТЕНЫ (толстые, с капителем)
  const wallH = 3.2;
  const wallMat = new THREE.MeshStandardMaterial({
    color: biome.wall.color, emissive: biome.wall.emissive, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({
    color: biome.wall.trim, emissive: biome.wall.trim, emissiveIntensity: 0.35, roughness: 0.5 });
  const wallDefs = [
    [0, -R - 0.5, R * 2 + 2, 1], [0, R + 0.5, R * 2 + 2, 1],
    [-R - 0.5, 0, 1, R * 2 + 2], [R + 0.5, 0, 1, R * 2 + 2],
  ];
  for (const [cx, cz, sx, sz] of wallDefs) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(sx * CELL / 2, wallH, sz * CELL / 2), wallMat);
    w.position.set(cx, wallH / 2, cz);
    w.castShadow = w.receiveShadow = true;
    world.add(w);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(sx * CELL / 2 + 0.1, 0.18, sz * CELL / 2 + 0.1), trimMat);
    trim.position.set(cx, wallH + 0.09, cz);
    world.add(trim);
  }

  // --- ПРЕПЯТСТВИЯ и ОПАСНЫЕ ЗОНЫ
  const obstacleMeshes = [];
  const hazardMeshes = [];
  const sliderMeshes = [];
  const obstMat = new THREE.MeshStandardMaterial({
    color: biome.wall.color, emissive: biome.wall.emissive, roughness: 0.8, flatShading: true });
  const hazMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.5 });
  const curMat = new THREE.MeshBasicMaterial({ color: 0x33aaff, transparent: true, opacity: 0.35 });
  const wellMat = new THREE.MeshBasicMaterial({ color: 0x9944ff, transparent: true, opacity: 0.45 });
  for (const [k, type] of Object.entries(level.grid)) {
    const [x, z] = k.split(',').map(Number);
    const wx = x * CELL, wz = z * CELL;
    if (type === 'obstacle') {
      const h = 1.4 + rng() * 1.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.92, h, CELL * 0.92), obstMat.clone());
      m.material.color.offsetHSL(0, 0, (rng() - 0.5) * 0.08);
      m.position.set(wx, h / 2, wz);
      m.rotation.y = rng() < 0.3 ? (rng() - 0.5) * 0.3 : 0;
      m.castShadow = m.receiveShadow = true;
      world.add(m); obstacleMeshes.push(m);
    } else if (type === 'hazard') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.98, 0.12, CELL * 0.98), hazMat.clone());
      m.position.set(wx, 0.07, wz);
      world.add(m); hazardMeshes.push(m);
    } else if (type === 'current') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), curMat.clone());
      m.rotation.x = -Math.PI / 2; m.position.set(wx, 0.03, wz);
      world.add(m); hazardMeshes.push(m);
    } else if (type === 'well') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(CELL * 0.5, CELL * 0.2, 0.4, 12), wellMat.clone());
      m.position.set(wx, 0.2, wz);
      world.add(m); hazardMeshes.push(m);
    } else if (type === 'slider') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.95, 2.6, CELL * 0.95),
        new THREE.MeshStandardMaterial({ color: 0x2a2a4a, emissive: 0xff00cc, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.7 }));
      m.position.set(wx, 1.3, wz);
      m.castShadow = true;
      world.add(m); sliderMeshes.push(m);
    } else if (type === 'teleport') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.1, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x44ff88 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(wx, 0.15, wz);
      world.add(ring);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 20),
        new THREE.MeshBasicMaterial({ color: 0x115522, transparent: true, opacity: 0.7 }));
      pad.position.set(wx, 0.03, wz);
      world.add(pad);
      hazardMeshes.push(ring);
    }
  }

  // --- НЕБО (градиентная сфера)
  const skyGeo = new THREE.SphereGeometry(90, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: false,
    uniforms: { topColor: { value: new THREE.Color(biome.sky.top) }, bottomColor: { value: new THREE.Color(biome.sky.bottom) } },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos;
      void main(){ float h = normalize(vPos).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottomColor, topColor, pow(h,0.7)), 1.0); }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  world.add(sky);
  // солнце
  if (!biome.sky.stars) {
    const sunDir = biome.sky.sunPos;
    const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 10),
      new THREE.MeshBasicMaterial({ color: biome.sky.sun, fog: false }));
    sun.position.set(sunDir[0] * 70, Math.max(8, sunDir[1] * 70), sunDir[2] * 70);
    world.add(sun);
  } else {
    // звёзды
    const sg = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 500; i++) {
      const th = rng() * Math.PI * 2, ph = Math.acos(rng());
      sp.push(Math.sin(ph) * Math.cos(th) * 80, Math.abs(Math.cos(ph)) * 80, Math.sin(ph) * Math.sin(th) * 80);
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    world.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, fog: false })));
  }

  // --- ДЕКОР по периметру (за стенами) и иногда внутри свободных углов
  const animDecor = [];
  const decoCount = 34;
  for (let i = 0; i < decoCount; i++) {
    const kind = biome.decor[Math.floor(rng() * biome.decor.length)];
    const factory = decorFactories[kind];
    if (!factory) continue;
    const obj = factory(rng);
    // размещаем вдоль стен снаружи и немного внутри
    let x, z;
    if (i < decoCount * 0.65) {
      const side = Math.floor(rng() * 4);
      const along = (rng() * 2 - 1) * (R + 6);
      const out = R + 2 + rng() * 8;
      if (side === 0) { x = along; z = -out; }
      else if (side === 1) { x = along; z = out; }
      else if (side === 2) { x = -out; z = along; }
      else { x = out; z = along; }
    } else {
      // внутри у краёв арены, но не на препятствиях
      let tries = 0;
      do {
        const edge = rng() < 0.5;
        x = edge ? (rng() * 2 - 1) * (R - 1) : (rng() < 0.5 ? -R + 1.5 : R - 1.5);
        z = edge ? (rng() < 0.5 ? -R + 1.5 : R - 1.5) : (rng() * 2 - 1) * (R - 1);
        tries++;
      } while (tries < 8 && (level.grid[`${Math.round(x/CELL)},${Math.round(z/CELL)}`]));
    }
    obj.position.x += x; obj.position.z += z;
    obj.rotation.y = rng() * Math.PI * 2;
    world.add(obj);
    if (obj.userData.spin || obj.userData.float || obj.userData.sway || obj.userData.pulse || obj.userData.glow || obj.userData.holo)
      animDecor.push(obj);
  }

  // --- ЧАСТИЦЫ
  const particles = makeParticles(biome.particles, half);
  world.add(particles);

  // --- СВЕТ
  const ambient = new THREE.AmbientLight(biome.lights.ambient.color, biome.lights.ambient.intensity);
  const dir = new THREE.DirectionalLight(biome.lights.dir.color, biome.lights.dir.intensity);
  const sd = biome.sky.sunPos;
  dir.position.set(sd[0] * 25, Math.max(10, sd[1] * 30), sd[2] * 25);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.left = -R - 4; dir.shadow.camera.right = R + 4;
  dir.shadow.camera.top = R + 4; dir.shadow.camera.bottom = -R - 4;
  dir.shadow.camera.far = 80;
  scene.add(ambient, dir);
  const pointLights = [];
  if (biome.pointLights) for (const pl of biome.pointLights) {
    const l = new THREE.PointLight(pl.color, 22, 30, 1.8);
    l.position.set(pl.pos[0], pl.pos[1], pl.pos[2]);
    world.add(l); pointLights.push(l);
  }

  return { world, obstacleMeshes, hazardMeshes, sliderMeshes, animDecor, particles, ambient, dir, pointLights, sky, rng };
}

// Анимация декораций вызывается из game loop
export function animateDecor(worldObj, time) {
  for (const o of worldObj.animDecor) {
    if (o.userData.spin) o.userData.spin.rotation.z = time * 0.8;
    if (o.userData.float) o.position.y += Math.sin(time * 1.5 + o.position.x) * 0.002;
    if (o.userData.sway) o.rotation.z = Math.sin(time * 0.9 + o.position.x) * 0.08;
    if (o.userData.pulse) o.userData.pulse.material.color.setHSL((time * 0.1) % 1, 1, 0.6);
    if (o.userData.glow) o.userData.glow.scale.setScalar(1 + Math.sin(time * 3 + o.position.x) * 0.3);
    if (o.userData.holo) o.material.opacity = 0.12 + Math.sin(time * 2 + o.position.z) * 0.06;
  }
  updateParticles(worldObj.particles, 1 / 60, time);
  for (const m of worldObj.hazardMeshes) {
    if (m.material.transparent && m.geometry.type !== 'TorusGeometry')
      m.material.opacity = 0.35 + Math.sin(time * 2.5) * 0.15;
  }
}
