// ============================================================
// SERPENTINE — Генерация уровней: арена, стены, препятствия, зоны
// Процедурная генерация с сидами + вручную настроенные шаблоны
// ============================================================

export const CELL = 2;           // размер клетки мира в метрах
export const ARENA = { min: -20, max: 20 }; // границы поля (в клетках: ±10)

// Шаблон уровня: какие механики включены
export const LEVEL_TEMPLATES = [
  // 1. Сад — обучение
  { biome: 'garden', size: 16, obstacles: 8, hazardType: null, movingEnemies: 0, wind: 0,
    targets: 12, timeBonus: 90, seedOffset: 0 },
  // 2. Пустыня — ветер песчаной бури
  { biome: 'desert', size: 18, obstacles: 14, hazardType: 'quake', movingEnemies: 0, wind: 0.35,
    targets: 16, timeBonus: 100, seedOffset: 101 },
  // 3. Лёд — скользкий пол
  { biome: 'ice', size: 18, obstacles: 16, hazardType: 'collapse', movingEnemies: 0, wind: 0,
    targets: 18, timeBonus: 110, seedOffset: 202 },
  // 4. Вулкан — движущиеся лавовые столбы
  { biome: 'volcano', size: 20, obstacles: 18, hazardType: 'lavaRise', movingEnemies: 3, wind: 0,
    targets: 20, timeBonus: 120, seedOffset: 303 },
  // 5. Джунгли — блуждающие тени хищника
  { biome: 'jungle', size: 20, obstacles: 22, hazardType: null, movingEnemies: 4, wind: 0,
    targets: 22, timeBonus: 130, seedOffset: 404 },
  // 6. Кибер — телепорты и движущиеся стены
  { biome: 'cyber', size: 22, obstacles: 20, hazardType: 'wallSlide', movingEnemies: 2, wind: 0,
    targets: 24, timeBonus: 140, seedOffset: 505, teleports: true },
  // 7. Океан — течения
  { biome: 'ocean', size: 22, obstacles: 24, hazardType: 'current', movingEnemies: 5, wind: 0,
    targets: 26, timeBonus: 150, seedOffset: 606 },
  // 8. Пустота — гравитационные аномалии, всё мигает
  { biome: 'void', size: 24, obstacles: 26, hazardType: 'gravityWell', movingEnemies: 6, wind: 0,
    targets: 30, timeBonus: 160, seedOffset: 707, flicker: true },
];

// PRNG с сидом (mulberry32)
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ключевая механика: поле в клетках, блокирующие препятствия
export function generateLevel(templateIdx, seed) {
  const tpl = LEVEL_TEMPLATES[templateIdx];
  const rng = makeRng(seed + tpl.seedOffset);
  const half = Math.floor(tpl.size / 2);
  const grid = {}; // "x,z" -> тип ('obstacle' | 'hazard' | 'teleport-a' | 'teleport-b')
  const key = (x, z) => `${x},${z}`;

  const centerFree = (x, z, r = 3) => Math.abs(x) <= r && Math.abs(z) <= r;

  // --- Статичные препятствия: кластеры (выглядят как формации, не случайные кубики)
  let placed = 0, guard = 0;
  while (placed < tpl.obstacles && guard < 400) {
    guard++;
    const cx = Math.floor(rng() * (half * 2 - 1)) - half + 1;
    const cz = Math.floor(rng() * (half * 2 - 1)) - half + 1;
    if (centerFree(cx, cz, 4)) continue;
    // кластер 1-3 блока
    const cluster = 1 + Math.floor(rng() * 3);
    let ok = true;
    const cells = [];
    for (let i = 0; i < cluster; i++) {
      const ox = cx + (i === 1 ? (rng() < 0.5 ? 1 : 0) : 0);
      const oz = cz + (i === 2 ? (rng() < 0.5 ? 1 : 0) : 0);
      if (Math.abs(ox) >= half || Math.abs(oz) >= half || centerFree(ox, oz, 3) || grid[key(ox, oz)]) { ok = false; break; }
      cells.push([ox, oz]);
    }
    if (!ok) continue;
    for (const [x, z] of cells) grid[key(x, z)] = 'obstacle';
    placed += cells.length;
  }

  // --- Опасные клетки (лава/провалы/течения) — кольцом или полосой
  if (tpl.hazardType === 'collapse' || tpl.hazardType === 'lavaRise') {
    const rings = tpl.hazardType === 'collapse' ? 2 : 3;
    for (let ring = 0; ring < rings; ring++) {
      const r = half - 3 - ring * 4;
      if (r < 4) break;
      const arcStart = rng() * Math.PI * 2;
      const arcLen = Math.PI * (0.6 + rng() * 0.8);
      for (let a = 0; a < arcLen; a += 0.28) {
        const x = Math.round(Math.cos(arcStart + a) * r);
        const z = Math.round(Math.sin(arcStart + a) * r);
        if (Math.abs(x) < half && Math.abs(z) < half && !grid[key(x, z)] && !centerFree(x, z, 2)) {
          grid[key(x, z)] = 'hazard';
        }
      }
    }
  }
  if (tpl.hazardType === 'current') {
    // полосы течений
    for (let s = 0; s < 3; s++) {
      const row = Math.floor(rng() * (half * 2 - 4)) - half + 2;
      for (let x = -half + 1; x < half; x++) {
        if (!grid[key(x, row)] && !centerFree(x, row, 2)) grid[key(x, row)] = 'current';
      }
    }
  }
  if (tpl.hazardType === 'gravityWell') {
    for (let w = 0; w < 4; w++) {
      const wx = Math.floor(rng() * (half * 2 - 6)) - half + 3;
      const wz = Math.floor(rng() * (half * 2 - 6)) - half + 3;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const k = key(wx + dx, wz + dz);
        if (!grid[k] && !centerFree(wx + dx, wz + dz, 2)) grid[k] = 'well';
      }
    }
  }

  if (tpl.hazardType === 'wallSlide') {
    // движущиеся стены: пары клеток, которые игра смещает каждые N секунд
    const sliders = [];
    for (let w = 0; w < 4; w++) {
      const x = Math.floor(rng() * (half * 2 - 6)) - half + 3;
      const z = Math.floor(rng() * (half * 2 - 6)) - half + 3;
      if (!grid[key(x, z)] && !centerFree(x, z, 4)) {
        grid[key(x, z)] = 'slider';
        sliders.push({ x, z, dir: rng() < 0.5 ? [1, 0] : [0, 1], phase: rng() * 6 });
      }
    }
    return finalize({ template: tpl, half, grid, teleports: [], sliders, seed: seed + tpl.seedOffset, rng });
  }

  // --- Телепорты (кибер-уровень)
  const teleports = [];
  if (tpl.teleports) {
    const findFree = () => {
      for (let g = 0; g < 100; g++) {
        const x = Math.floor(rng() * (half * 2 - 2)) - half + 1;
        const z = Math.floor(rng() * (half * 2 - 2)) - half + 1;
        if (!grid[key(x, z)] && !centerFree(x, z, 4)) return [x, z];
      }
      return [half - 2, -half + 2];
    };
    const a = findFree(), b = findFree();
    grid[key(a[0], a[1])] = 'teleport';
    grid[key(b[0], b[1])] = 'teleport';
    teleports.push({ a, b });
  }

  return finalize({ template: tpl, half, grid, teleports, sliders: [], seed: seed + tpl.seedOffset, rng });
}

function finalize(level) {
  // перенумеровать клетки слайдеров для отслеживания
  level.sliders.forEach((s, i) => { s.id = i; s.cellKey = `${s.x},${s.z}`; });
  return level;
}

// Проверка занятости клетки
export function isBlocked(level, x, z) {
  const k = `${x},${z}`;
  const t = level.grid[k];
  return t === 'obstacle';
}
export function cellType(level, x, z) {
  return level.grid[`${x},${z}`] || null;
}

// Преобразование мир <-> клетка
export function worldToCell(v) { return Math.round(v / CELL); }
export function cellToWorld(c) { return c * CELL; }
