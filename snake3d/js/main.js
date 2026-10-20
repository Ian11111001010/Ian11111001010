// ============================================================
// SERPENTINE — Game Core: цикл, состояния, физика, скоринг
// Полная игра: 8 уровней, комбо, хищники, опасности, сохранение
// ============================================================
import * as THREE from '../vendor/three.module.js';
import { BIOMES, LEVEL_ORDER } from './biomes.js';
import { generateLevel, CELL, worldToCell, cellToWorld } from './level.js';
import { buildWorld, animateDecor } from './world.js';
import { Snake } from './snake.js';
import { Food, Predator, BurstFX } from './entities.js';
import { audio } from './audio.js';
import { ui } from './ui.js';

window.__audio = audio;

const SAVE_KEY = 'serpentine_save_v1';

// ---------- СОСТОЯНИЯ ----------
const ST = { MENU: 'menu', INTRO: 'intro', PLAY: 'play', PAUSE: 'pause', COMPLETE: 'complete', DEAD: 'dead', VICTORY: 'victory' };

class Game {
  constructor() {
    // --- рендерер
    this.canvas = document.getElementById('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
    this.camera.rotation.order = 'YXZ';

    this.state = ST.MENU;
    this.time = 0;
    this.shake = { mag: 0 };
    this.fx = new BurstFX(this.scene);

    // --- настройки и сохранения
    this.settings = { volume: 0.9, sensitivity: 1.0, quality: 'high', invertY: false, shake: true };
    this.save = this.loadSave();

    // --- ввод
    this.keys = {};
    this.mouseDX = 0;
    this.pointerLocked = false;
    this.bindInput();
    this.bindUI();
    this.applyQuality();

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    // фоновая сцена меню — красивая живая картинка под UI
    this.menuWorld = null;
    this.buildMenuBackdrop();

    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ================= СОХРАНЕНИЯ =================
  loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && Array.isArray(s.levels)) return s;
    } catch (e) {}
    return { levels: LEVEL_ORDER.map(() => ({ unlocked: false, done: false, best: 0 })), totalScore: 0, firstRun: true };
  }
  writeSave() { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); }

  // ================= ФОН МЕНЮ =================
  buildMenuBackdrop() {
    const biome = BIOMES.garden;
    const level = generateLevel(0, 42);
    this.menuWorld = buildWorld(this.scene, biome, level, 12345);
    this.scene.fog = new THREE.FogExp2(biome.fog.color, biome.fog.density);
    this.menuCamAngle = 0;
  }
  clearSceneGameObjects() {
    if (this.worldObj) {
      this.scene.remove(this.worldObj.world);
      this.scene.remove(this.worldObj.ambient);
      this.scene.remove(this.worldObj.dir);
      this.worldObj.world.traverse(o => o.geometry && o.geometry.dispose());
      this.worldObj = null;
    }
    if (this.snake) { this.snake.dispose(); this.snake = null; }
    for (const f of this.foods || []) f.dispose();
    this.foods = [];
    for (const p of this.predators || []) p.dispose();
    this.predators = [];
  }

  // ================= СТАРТ УРОВНЯ =================
  startLevel(idx) {
    this.levelIdx = idx;
    this.clearSceneGameObjects();
    if (this.menuWorld) { // убираем фон меню
      this.scene.remove(this.menuWorld.world);
      this.scene.remove(this.menuWorld.ambient); this.scene.remove(this.menuWorld.dir);
      this.menuWorld = null;
    }
    this.clearSceneGameObjects();

    const biomeKey = LEVEL_ORDER[idx];
    const biome = BIOMES[biomeKey];
    this.biome = biome;
    this.level = generateLevel(idx, Math.floor(Date.now() / 10000) % 100000);

    this.worldObj = buildWorld(this.scene, biome, this.level, this.level.seed);
    this.scene.fog = new THREE.FogExp2(biome.fog.color, biome.fog.density);
    // связать слайдеры с мешами по позиции
    if (this.level.sliders && this.level.sliders.length) {
      for (const s of this.level.sliders) {
        s.mesh = this.worldObj.sliderMeshes.find(m =>
          Math.abs(m.position.x - cellToWorld(s.x)) < 0.01 && Math.abs(m.position.z - cellToWorld(s.z)) < 0.01);
      }
    }

    // --- змея
    this.snake = new Snake(this.scene, biome);
    this.snake.speed = 4.2 + idx * 0.12;
    const R = this.level.half * CELL;
    this.snake.head.position.set(0, 0.55, R - 6);
    this.snake.heading = -Math.PI / 2; // к центру (в сторону -Z)
    this.snake.targetHeading = -Math.PI / 2;
    this.snake._resetPath();

    // --- игровые счётчики
    this.score = 0; this.levelScoreStart = 0;
    this.eaten = 0; this.targetCount = biome ? this.level.template.targets : 10;
    this.hp = 3; this.combo = 0; this.maxCombo = 0; this.comboTimer = 0;
    this.lengthCells = 8; this.snake.setLength(8);
    this.timeLimit = this.level.template.timeBonus;
    this.elapsed = 0;
    this.noDamage = true;
    this.goldenSpawned = 0;
    this.foods = [];
    this.predators = [];
    this.sliderPhase = 0;
    this.quakeT = 0;
    this.wellPulse = 0;

    // спавн стартовой еды
    for (let i = 0; i < 3; i++) this.spawnFood();
    // хищники уровня
    const tpl = this.level.template;
    for (let i = 0; i < tpl.movingEnemies; i++) {
      const ang = (i / tpl.movingEnemies) * Math.PI * 2;
      const r = R - 4;
      this.predators.push(new Predator(this.scene, biome, Math.cos(ang) * r, Math.sin(ang) * r, 2.4 + idx * 0.15));
    }

    audio.stopAmbient(); // интро тишина; музыка — со старта игры
    this.pendingMusic = true;

    // интро
    const mechText = this.getMechanicText(idx);
    ui.showLevelIntro(biome, idx + 1, mechText);
    this.state = ST.INTRO;
  }

  getMechanicText(idx) {
    const t = [
      '🎓 ОБУЧЕНИЕ: Соберите все плоды. Стены смертельны — следите за стрелкой языка!',
      '🌪️ ПЕСЧАНАЯ БУРЯ: Ветер сносит змею вправо. Поправляйте курс постоянно!',
      '🧊 СКОЛЬЗКИЙ ЛЁД: Повороты инертны. Красные плиты — провалы, обходите их!',
      '🌋 ЛАВА ПОДНИМАЕТСЯ: Светящиеся столбы пульсируют, красные зоны жгут. Быстрые враги-жуки охотятся на вас!',
      '🐾 ХИЩНИКИ ДЖУНГЛЕЙ: 4 жука преследуют вас. Рывок (Space) — ваш спасительный бросок!',
      '💾 МАТРИЦА: Зелёные круги — телепорты. Фиолетовые стены движутся по сетке!',
      '🌊 ТЕЧЕНИЯ: Синие полосы толкают змею. Тело длинное — берегите хвост от врагов!',
      '🌌 АСТРАЛЬНЫЙ ШТОРМ: Гравитационные колодцы притягивают. Реальность мерцает. Финальное испытание!',
    ];
    return t[idx] || '';
  }

  beginPlay() {
    ui.hideLevelIntro();
    ui.show(null);
    document.body.classList.add('in-game');
    this.state = ST.PLAY;
    audio.init(); audio.resume();
    if (this.pendingMusic) { audio.startAmbient(this.biome.music); this.pendingMusic = false; }
    // обратный отсчёт 3-2-1 — змея ждёт, игрок ориентируется
    this._countdown = 3.2;
    this.clock.getDelta();
    ui.setCountdown('3');
  }

  tickCountdown(dt) {
    if (this._countdown <= 0) { ui.setCountdown(null); return true; }
    this._countdown -= dt;
    const n = Math.ceil(this._countdown - 0.2);
    const label = n >= 1 ? String(Math.min(3, n)) : 'ПОГНАЛИ!';
    if (label !== this._cdLabel) {
      this._cdLabel = label;
      ui.setCountdown(label);
      audio.countdownBeep(n <= 1);
    }
    // после «ПОГНАЛИ!» запрашиваем pointer lock — уже внутри пользовательского клика/клавиши
    if (this._countdown <= 0) {
      ui.setCountdown(null); this._cdLabel = null;
      this.requestLock();
      return true;
    }
    return false;
  }

  requestLock() {
    // pointer lock для мышиного управления (по желанию пользователя)
    if (this.canvas.requestPointerLock) {
      try { this.canvas.requestPointerLock(); } catch (e) {}
    }
  }

  // ================= СПАВН ЕДЫ =================
  spawnFood(kind) {
    const R = this.level.half - 1;
    let x, z, tries = 0, wx = 0, wz = 0;
    do {
      x = Math.floor(Math.random() * (R * 2 + 1)) - R;
      z = Math.floor(Math.random() * (R * 2 + 1)) - R;
      wx = cellToWorld(x); wz = cellToWorld(z);
      tries++;
      if (tries >= 60) break;
    } while (
      // не на препятствия/слайдер/опасную зону
      ['obstacle', 'slider', 'hazard'].includes(this.level.grid[`${x},${z}`]) ||
      // не слишком близко к голове змеи
      Math.hypot(wx - this.snake.head.position.x, wz - this.snake.head.position.z) < 5 ||
      // не в теле змеи
      this.snake.segments.some(s => s.visible && Math.hypot(wx - s.position.x, wz - s.position.z) < 1.5) ||
      // не рядом с другой едой
      this.foods.some(f => Math.hypot(wx - f.group.position.x, wz - f.group.position.z) < 3));
    const f = new Food(this.scene, this.biome, kind || 'normal');
    f.group.position.x = wx; f.group.position.z = wz;
    f.cell = [x, z];
    this.foods.push(f);
    return f;
  }

  // ================= ОСНОВНОЙ ЦИКЛ =================
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    if (this.state === ST.MENU || this.state === ST.VICTORY) {
      // кинематографичный облёт фона меню
      if (this.menuWorld) {
        this.menuCamAngle += dt * 0.08;
        const r = 26;
        this.camera.position.set(Math.cos(this.menuCamAngle) * r, 7 + Math.sin(this.menuCamAngle * 0.7) * 3, Math.sin(this.menuCamAngle) * r);
        this.camera.lookAt(0, 1.5, 0);
        animateDecor(this.menuWorld, this.time);
      }
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === ST.PLAY) {
      this.updatePlay(dt);
    }
    if (this.state === ST.DEAD || this.state === ST.COMPLETE) {
      // замедленный мир на фоне экрана результатов
      this.fx.update(dt * 0.4);
      if (this.worldObj) animateDecor(this.worldObj, this.time);
    }
    if (this.state !== ST.PAUSE) this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // ================= ГЕЙМПЛЕЙ =================
  updatePlay(dt) {
    const snake = this.snake, tpl = this.level.template;

    // обратный отсчёт перед стартом движения
    if (this._countdown > 0) {
      this.tickCountdown(dt);
      snake.update(0, {}, {}); // поза/тело обновляются, движения нет
      this.updateCamera(dt);
      return;
    }
    this.elapsed += dt;

    // --- время вышло?
    if (this.elapsed >= this.timeLimit) return this.die('Время истекло — ночь поглотила змею');

    // --- ввод направления
    const sens = this.settings.sensitivity;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) snake.targetHeading += 3.4 * sens * dt;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) snake.targetHeading -= 3.4 * sens * dt;
    if (this.pointerLocked) {
      snake.targetHeading -= this.mouseDX * 0.0032 * sens * (this.settings.invertY ? -1 : 1);
      this.mouseDX = 0;
    }
    snake.dashing = !!(this.keys['Space'] || this.keys['ShiftLeft']);
    const boost = this.keys['KeyW'] || this.keys['ArrowUp'];
    const effects = { speedMul: boost ? 1.25 : 1 };

    // --- биомные механики
    const hp = snake.head.position;
    const cx = worldToCell(hp.x), cz = worldToCell(hp.z);
    const ctype = this.level.grid[`${cx},${cz}`];

    if (tpl.wind) { // пустыня — снос ветром (вдоль меняющегося направления бури)
      const windAng = this.time * 0.23;
      effects.pushX = Math.cos(windAng) * tpl.wind * 4.5 * (1 + Math.sin(this.time * 0.7) * 0.4);
      effects.pushZ = Math.sin(windAng) * tpl.wind * 4.5 * (1 + Math.sin(this.time * 0.7) * 0.4);
    }
    if (ctype === 'current') { // океан — течение толкает вдоль полосы (по X)
      effects.pushX = 3.4 * (0.7 + 0.5 * Math.sin(this.time * 0.9 + cz));
    }
    if (this.biome.slowWater) { // вода замедляет змею
      effects.speedMul *= (1 - this.biome.slowWater);
    }
    if (ctype === 'well') { // пустота — гравилколодец тянет к центру клетки
      const wx = cellToWorld(cx), wz = cellToWorld(cz);
      effects.pushX = (wx - hp.x) * 2.5; effects.pushZ = (wz - hp.z) * 2.5;
    }
    if (tpl.flicker) { // пустота — мерцание света
      this.worldObj.ambient.intensity = this.biome.lights.ambient.intensity * (0.75 + 0.5 * Math.abs(Math.sin(this.time * 2.1)));
    }
    if (this.biome.slippery) { // лёд — инерция поворота
      snake.turnRate = 2.1;
    } else snake.turnRate = 3.1 + this.levelIdx * 0.05;

    // землетрясение пустыни/вулкана — тряска
    if (tpl.hazardType === 'quake' && Math.sin(this.time * 0.5) > 0.93) {
      this.quakeT = 0.5;
    }
    if (this.quakeT > 0) { this.quakeT -= dt; this.addShake(0.06); }

    // движущиеся стены кибер-мира
    if (tpl.hazardType === 'wallSlide') {
      this.sliderPhase += dt;
      if (this.sliderPhase > 4) {
        this.sliderPhase = 0;
        this.moveSliders();
      }
      // плавная анимация мешей к клеткам
      for (const s of this.level.sliders) {
        const m = s.mesh;
        if (m) { m.position.x += (cellToWorld(s.x) - m.position.x) * Math.min(1, dt * 6); m.position.z += (cellToWorld(s.z) - m.position.z) * Math.min(1, dt * 6); }
      }
    }

    // --- обновляем змею
    const wasDashing = snake._didDash;
    snake.update(dt, this.keys, effects);
    // звук/эффект начала рывка
    if (snake._didDash && !wasDashing) {
      audio.dash();
      this.addShake(0.08);
      this.fx.burst(snake.head.position, 0xffffff, 12, 2, 0.06, -2);
    }

    // --- телепорт
    if (ctype === 'teleport') this.tryTeleport(snake, cx, cz);

    // --- столкновения со стенами арены
    const R = this.level.half * CELL - 0.45;
    if (Math.abs(snake.head.position.x) > R || Math.abs(snake.head.position.z) > R) {
      // возврат на границу + урон
      snake.head.position.x = THREE.MathUtils.clamp(snake.head.position.x, -R, R);
      snake.head.position.z = THREE.MathUtils.clamp(snake.head.position.z, -R, R);
      audio.hitWall(); this.addShake(0.35);
      this.fx.burst(snake.head.position, 0xffaa44, 20, 4);
      this.damage('Вы врезались в каменную стену');
      snake.targetHeading += Math.PI * 0.8; // разворот
    }

    // --- препятствия
    if (ctype === 'obstacle' || ctype === 'slider') {
      snake.head.position.x -= Math.cos(snake.heading) * 0.6;
      snake.head.position.z -= Math.sin(snake.heading) * 0.6;
      audio.hitWall(); this.addShake(0.3);
      this.fx.burst(snake.head.position, 0xffcc66, 16, 3);
      this.damage(ctype === 'slider' ? 'Движущаяся стена расплющила змею' : 'Вы врезались в скалу');
      snake.targetHeading += Math.PI * 0.7;
    }

    // --- опасные клетки (лава/провал) — мгновенный урон + отброс назад
    if (ctype === 'hazard') {
      if (!this._hazCd || this.time - this._hazCd > 1.2) {
        this._hazCd = this.time;
        audio.poisonEat(); this.addShake(0.25);
        this.fx.burst(snake.head.position, 0xff3300, 26, 4);
        this.damage(tpl.hazardType === 'collapse' ? 'Провал под льдом!' : 'Лава обожгла чешую!');
        // откат
        snake.head.position.x -= Math.cos(snake.heading) * 1.4;
        snake.head.position.z -= Math.sin(snake.heading) * 1.4;
      }
    }

    // --- кусаем себя
    if (snake.selfCollisionCheck()) {
      if (!this._selfCd || this.time - this._selfCd > 1.5) {
        this._selfCd = this.time;
        audio.biteSelf(); this.addShake(0.2);
        this.damage('Вы проглотили собственный хвост');
      }
    }

    // --- хищники
    const blocked = (x, z) => this.level.grid[`${x},${z}`] === 'obstacle' || this.level.grid[`${x},${z}`] === 'slider';
    for (const p of this.predators) {
      p.update(dt, snake.head.position, blocked, this.level.half, this.time);
      if (p.distTo(snake.head.position) < 1.0) {
        if (!this._predCd || this.time - this._predCd > 1.4) {
          this._predCd = this.time;
          audio.hurt(); this.addShake(0.3);
          this.fx.burst(snake.head.position, 0xff2244, 22, 4);
          this.damage('Хищник впился в вашу плоть');
          // оттолкнуть жука
          p.heading += Math.PI;
        }
      }
    }

    // --- еда
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      f.update(dt, this.time);
      const d = Math.hypot(f.group.position.x - snake.head.position.x, f.group.position.z - snake.head.position.z);
      if (d < 1.15) {
        this.eatFood(f);
        f.dispose();
        this.foods.splice(i, 1);
      }
    }
    // поддерживать 3 обычных плода
    const normals = this.foods.filter(f => f.kind === 'normal').length;
    if (normals < 3) this.spawnFood('normal');
    // редкий золотой плод
    if (Math.random() < dt * 0.03 && this.goldenSpawned < 3 && normals >= 2) {
      this.spawnFood('golden'); this.goldenSpawned++;
    }
    // ядовитый — не слишком часто, и не больше двух одновременно
    if (Math.random() < dt * 0.015 && this.foods.filter(f=>f.kind==='poison').length < 2) {
      this.spawnFood('poison');
    }

    // --- комбо таймер
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

    // --- визуальный туман яда
    if (this._poisonT > 0) {
      this._poisonT -= dt;
      const k = Math.min(1, this._poisonT / 4);
      this.scene.fog.density = this.biome.fog.density * (1 + k * 1.6);
      ui.setPoisonOverlay(k * 0.5);
    } else if (this.scene.fog.density !== this.biome.fog.density) {
      this.scene.fog.density += (this.biome.fog.density - this.scene.fog.density) * Math.min(1, dt * 3);
      ui.setPoisonOverlay(0);
    }

    // --- HUD
    this.updateHUD();
    this.fx.update(dt);
    animateDecor(this.worldObj, this.time);

    // победное сердцебиение при 1 оставшемся плоде
    audio.heartbeat(this.remainingFruits <= 1 && this.eaten > 0);
  }

  get remainingFruits() { return this.targetCount - this.eaten; }

  eatFood(f) {
    const snake = this.snake;
    snake.biteAnimation();
    if (f.kind === 'poison') {
      audio.poisonEat();
      snake.slowTimer = 5;
      this._poisonT = 4; // визуальный «туман яда» на экране
      this.addShake(0.12);
      this.fx.burst(f.group.position, 0x9932cc, 30, 3.5);
      ui.toast('☠️ Ядовитый плод! Скорость и разум туманны…', 'red');
      this.combo = 0;
      return;
    }
    this.eaten++;
    this.combo++; this.comboTimer = 4.5;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = Math.min(this.combo, 8);
    const base = f.kind === 'golden' ? 500 : 100;
    const pts = base * mult;
    this.score += pts;
    this.lengthCells += f.kind === 'golden' ? 3 : 1.6;
    snake.setLength(this.lengthCells);
    if (f.kind === 'golden') {
      audio.goldenEat();
      this.fx.burst(f.group.position, 0xffd700, 40, 4.5);
      this.fx.ring(f.group.position, 0xffd700);
      ui.toast(`✨ ЗОЛОТОЙ ПЛОД +${pts}`, 'gold');
      snake.dashEnergy = 1;
      if (this.hp < 3) { this.hp++; ui.healFlash(); ui.toast('❤️ Золотая сила вернула сердце!', 'green'); }
    } else {
      audio.eat(Math.min(this.combo, 12));
      this.fx.burst(f.group.position, this.biome.food.color, 18, 3);
      this.fx.ring(f.group.position, this.biome.food.glow);
    }
    if (this.combo >= 3) ui.toast(`🔥 Комбо ×${this.combo}! +${pts}`, 'green');
    this.addShake(0.05);

    // цель достигнута?
    if (this.eaten >= this.targetCount) this.completeLevel();
  }

  damage(reason) {
    this.hp--;
    this.noDamage = false;
    this.combo = 0;
    ui.damageFlash();
    this.lastDeathReason = reason;
    if (this.hp <= 0) return this.die(reason);
    ui.toast(`❤️ −1 · ${reason}`, 'red');
    // короткая неуязвимость через knockback уже сделан
  }

  die(reason) {
    if (this.state !== ST.PLAY) return;
    this.state = ST.DEAD;
    audio.gameOver();
    audio.heartbeat(false);
    audio.stopAmbient();
    this.snake.alive = false;
    this.fx.burst(this.snake.head.position, 0xff3355, 60, 6, 0.15, -3);
    this.addShake(0.6);
    document.exitPointerLock?.();
    setTimeout(() => {
      ui.showGameOver({
        score: this.score, length: Math.floor(this.lengthCells),
        levelIcon: this.biome.icon, levelName: this.biome.name,
        eaten: this.eaten, target: this.targetCount,
      });
      document.getElementById('go-reason').textContent = reason;
      ui.show('game-over');
      document.body.classList.remove('in-game');
    }, 900);
  }

  moveSliders() {
    const half = this.level.half;
    for (const s of this.level.sliders) {
      delete this.level.grid[s.cellKey];
      let nx = s.x + s.dir[0], nz = s.z + s.dir[1];
      if (Math.abs(nx) >= half - 1 || Math.abs(nz) >= half - 1 || this.level.grid[`${nx},${nz}`]) {
        s.dir = [-s.dir[0], -s.dir[1]];
        nx = s.x + s.dir[0]; nz = s.z + s.dir[1];
      }
      s.x = nx; s.z = nz; s.cellKey = `${nx},${nz}`;
      this.level.grid[s.cellKey] = 'slider';
    }
  }

  tryTeleport(snake, cx, cz) {
    const tp = this.level.teleports[0];
    if (!tp) return;
    const other = (cx === tp.a[0] && cz === tp.a[1]) ? tp.b : (cx === tp.b[0] && cz === tp.b[1]) ? tp.a : null;
    if (!other) return;
    if (this._tpCd && this.time - this._tpCd < 1) return;
    this._tpCd = this.time;
    audio.dash(); audio.uiClick();
    this.fx.burst(snake.head.position, 0x44ff88, 30, 4);
    snake.head.position.x = cellToWorld(other[0]);
    snake.head.position.z = cellToWorld(other[1]);
    // прочищаем путь чтобы не телепорнуться обратно
    snake.path.unshift({ x: snake.head.position.x, z: snake.head.position.z });
    this.fx.burst(snake.head.position, 0x44ff88, 30, 4);
    ui.toast('💾 Телепорт активирован', 'green');
  }

  completeLevel() {
    this.state = ST.COMPLETE;
    audio.heartbeat(false);
    audio.levelComplete();
    document.exitPointerLock?.();
    const timeLeft = Math.max(0, this.timeLimit - this.elapsed);
    const base = this.eaten * 100;
    const lenBonus = Math.floor(this.lengthCells * 50);
    const timeBonus = Math.floor(timeLeft * 25);
    const comboBonus = this.maxCombo * 150;
    const perfect = this.noDamage ? 2500 : 0;
    const total = this.score + lenBonus + timeBonus + comboBonus + perfect;
    const ratio = total / (base + lenBonus + this.timeLimit * 25 + this.targetCount * 150 + 2500);
    const rank = ratio > 0.55 ? 'S' : ratio > 0.42 ? 'A' : ratio > 0.3 ? 'B' : 'C';

    // сохранить прогресс
    const last = this.levelIdx === LEVEL_ORDER.length - 1;
    this.save.levels[this.levelIdx] = {
      unlocked: true, done: true,
      best: Math.max(this.save.levels[this.levelIdx].best, total),
    };
    if (!last) this.save.levels[this.levelIdx + 1].unlocked = true;
    this.save.totalScore = Math.max(this.save.totalScore, this.calcTotalScore());
    this.writeSave();

    setTimeout(() => {
      audio.stopAmbient();
      if (last) return this.showVictory(total);
      ui.showLevelComplete({ base, lenBonus, timeBonus, comboBonus, perfect, total, rank, last });
      ui.show('level-complete');
      document.body.classList.remove('in-game');
    }, 1200);
  }

  calcTotalScore() {
    return this.save.levels.reduce((a, l) => a + (l.best || 0), 0);
  }

  showVictory(finalScore) {
    this.state = ST.VICTORY;
    audio.stopAmbient();
    audio.levelComplete();
    document.getElementById('final-score').textContent = (finalScore || this.calcTotalScore()).toLocaleString('ru-RU');
    ui.show('victory-screen');
    document.body.classList.remove('in-game');
    if (!this.menuWorld) this.buildMenuBackdrop();
  }

  quitToMenu() {
    this.state = ST.MENU;
    audio.stopAmbient(); audio.heartbeat(false);
    this.clearSceneGameObjects();
    if (!this.menuWorld) this.buildMenuBackdrop();
    const biome = BIOMES.garden;
    this.scene.fog = new THREE.FogExp2(biome.fog.color, biome.fog.density);
    ui.show('main-menu');
    document.body.classList.remove('in-game');
    document.exitPointerLock?.();
  }

  // ================= КАМЕРА =================
  updateCamera(dt) {
    const snake = this.snake;
    if (!snake) return;
    const fwdX = Math.cos(snake.heading), fwdZ = Math.sin(snake.heading);
    // камера в "глазах" змеи, смотрит вдоль курса
    this.camera.position.set(
      snake.head.position.x - fwdX * 0.1,
      snake.head.position.y + 0.14,
      snake.head.position.z - fwdZ * 0.1);
    const bob = this.settings.shake ? Math.sin(this.time * 7) * 0.02 * (snake.dashing ? 2 : 1) : 0;
    this._lookTarget = this._lookTarget || new THREE.Vector3();
    this._lookTarget.set(
      snake.head.position.x + fwdX * 6,
      snake.head.position.y + 0.1 + bob * 8,
      snake.head.position.z + fwdZ * 6);
    this.camera.up.set(Math.sin(this.time * 2.1) * (this.settings.shake ? 0.06 : 0), 1, 0);
    this.camera.lookAt(this._lookTarget);
    if (this.settings.shake) this.camera.rotateZ(bob * 0.6);
    // FOV эффект рывка
    const targetFov = (snake.dashing && snake.dashEnergy > 0 ? 88 : 75) + (this.keys['KeyW'] ? 4 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6);
    this.camera.updateProjectionMatrix();
    // тряска
    if (this.shake.mag > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake.mag;
      this.camera.position.y += (Math.random() - 0.5) * this.shake.mag;
      this.shake.mag *= Math.pow(0.02, dt);
    }
  }

  addShake(m) { if (this.settings.shake) this.shake.mag = Math.max(this.shake.mag, m); }

  // ================= HUD =================
  updateHUD() {
    const snake = this.snake;
    const secs = Math.max(0, this.timeLimit - this.elapsed);
    const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    // --- предупреждение о низком времени (каждую секунду последних 10)
    if (secs <= 10) {
      const w = Math.ceil(secs);
      if (w !== this._lastWarn) {
        this._lastWarn = w;
        audio.countdownBeep(w <= 3);
        if (w <= 5 && w > 0) ui.toast(`⏳ Осталось ${w} сек!`, 'red');
      }
    } else this._lastWarn = 0;
    // направление к ближайшей еде (учитывая heading камеры)
    let foodDir = null, foodDist = undefined;
    let nearest = null, nd = 1e9;
    for (const f of this.foods) {
      if (f.kind === 'poison') continue;
      const d = f.group.position.distanceTo(snake.head.position);
      if (d < nd) { nd = d; nearest = f; }
    }
    if (nearest) {
      const dx = nearest.group.position.x - snake.head.position.x;
      const dz = nearest.group.position.z - snake.head.position.z;
      // угол к еде в мировых координатах относительно курсовой оси
      const angFood = Math.atan2(dz, dx);
      let rel = angFood - snake.heading;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      // стрелка ▲ смотрит вверх => 0 rad = впереди; справа от нас = по часовой = положительный CSS-поворот
      foodDir = rel;
      foodDist = nd;
    }
    ui.setHud({
      score: this.score, length: Math.floor(this.lengthCells),
      eaten: this.eaten, target: this.targetCount,
      levelName: `${this.biome.icon} ${this.biome.name}`,
      time: `${m}:${s.toString().padStart(2, '0')}`,
      combo: this.combo, dash: snake.dashEnergy, hp: this.hp,
      foodDir, foodDist,
    });
    document.getElementById('combo-mini').textContent = this.combo > 1 ? `×${this.combo}` : '—';
    // миникарта
    const obs = [];
    for (const [k, v] of Object.entries(this.level.grid)) {
      if (v === 'obstacle' || v === 'slider') { const [x, z] = k.split(',').map(Number); obs.push([x, z]); }
    }
    const bodyPts = snake.segments.filter(s => s.visible).map(s => [worldToCell(s.position.x), worldToCell(s.position.z)]);
    const foodPts = this.foods.map(f => [worldToCell(f.group.position.x), worldToCell(f.group.position.z)]);
    ui.minimapCells(obs, bodyPts, [worldToCell(snake.head.position.x), worldToCell(snake.head.position.z)], foodPts, this.level.half);
  }

  // ================= ВВОД =================
  bindInput() {
    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (this.state === ST.INTRO) { this.beginPlay(); return; }
      if (e.code === 'Escape') {
        if (this.state === ST.PLAY) this.pause();
        else if (this.state === ST.PAUSE) this.resume();
      }
      if (e.code === 'KeyH' && this.state === ST.PLAY) {
        ui.toast(this.getMechanicText(this.levelIdx).slice(2), 'gold');
      }
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) this.mouseDX = e.movementX;
    });
    this.canvas.addEventListener('click', () => {
      if (this.state === ST.PLAY && document.pointerLockElement !== this.canvas) this.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      // авто-пауза: браузер забрал фокус/лок (Alt+Tab, сворачивание) — игра не должна «убивать» змею
      if (!this.pointerLocked && this.state === ST.PLAY && !this._autoPauseCd) {
        this._autoPauseCd = true;
        setTimeout(() => { this._autoPauseCd = false; }, 600);
        this.pause();
      }
    });
    addEventListener('blur', () => { if (this.state === ST.PLAY) this.pause(); });
    // клик по интро — старт
    document.getElementById('level-intro').addEventListener('click', () => {
      if (this.state === ST.INTRO) this.beginPlay();
    });
  }

  pause() {
    if (this.state !== ST.PLAY) return;
    this.state = ST.PAUSE;
    audio.heartbeat(false);
    document.exitPointerLock?.();
    ui.showPause(this.settings);
    ui.show('pause-screen');
    document.body.classList.remove('in-game');
  }
  resume() {
    ui.hidePause();
    ui.show(null);
    document.body.classList.add('in-game');
    this.state = ST.PLAY;
    this.clock.getDelta(); // сброс большого dt
    this.requestLock();
  }

  // ================= UI BINDINGS =================
  bindUI() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', () => { audio.init(); audio.resume(); audio.uiClick(); fn(); });

    on('btn-play', () => {
      if (this.save.firstRun) {
        this.save.firstRun = false; this.writeSave();
        ui.show('tutorial-screen');
      } else {
        const next = this.save.levels.findIndex(l => l.unlocked && !l.done);
        this.startLevel(next === -1 ? 0 : next);
      }
    });
    on('btn-tutorial-go', () => this.startLevel(0));
    on('btn-levels', () => { this.openLevelSelect(); });
    on('btn-back-levels', () => ui.show('main-menu'));
    on('btn-settings', () => {
      document.getElementById('set-vol').value = this.settings.volume * 100;
      document.getElementById('set-sens').value = this.settings.sensitivity * 100;
      document.getElementById('set-quality').value = this.settings.quality;
      document.getElementById('set-invert').checked = this.settings.invertY;
      document.getElementById('set-shake').checked = this.settings.shake;
      ui.show('settings-screen');
    });
    on('btn-back-settings', () => {
      this.settings.volume = document.getElementById('set-vol').value / 100;
      this.settings.sensitivity = document.getElementById('set-sens').value / 100;
      this.settings.quality = document.getElementById('set-quality').value;
      this.settings.invertY = document.getElementById('set-invert').checked;
      this.settings.shake = document.getElementById('set-shake').checked;
      audio.setVolume(this.settings.volume);
      this.applyQuality();
      ui.show('main-menu');
    });

    on('btn-resume', () => this.resume());
    on('btn-restart-level', () => { ui.hidePause(); this.startLevel(this.levelIdx); });
    on('btn-quit', () => this.quitToMenu());

    on('btn-next-level', () => this.startLevel(Math.min(this.levelIdx + 1, LEVEL_ORDER.length - 1)));
    on('btn-replay', () => this.startLevel(this.levelIdx));
    on('btn-go-retry', () => this.startLevel(this.levelIdx));
    on('btn-go-menu', () => this.quitToMenu());
    on('btn-vic-menu', () => this.quitToMenu());
    on('btn-vic-replay', () => this.startLevel(0));

    // пауза-настройки
    document.getElementById('pause-vol').addEventListener('input', (e) => {
      this.settings.volume = e.target.value / 100; audio.setVolume(this.settings.volume);
    });
    document.getElementById('opt-sensitivity').addEventListener('input', (e) => { this.settings.sensitivity = e.target.value / 100; });
    document.getElementById('opt-quality').addEventListener('change', (e) => { this.settings.quality = e.target.value; this.applyQuality(); });
    document.getElementById('opt-invert').addEventListener('change', (e) => { this.settings.invertY = e.target.checked; });

    ui.show('main-menu');
    ui.bindSoundHover();
  }
    const self = this;
    ui.updateMenuLevels(LEVEL_ORDER.map((key, i) => ({
      icon: BIOMES[key].icon, num: BIOMES[key].num, name: BIOMES[key].name,
      unlocked: self.save.levels[i].unlocked || i === 0,
      done: self.save.levels[i].done,
      best: self.save.levels[i].best,
      onStart: (idx) => self.startLevel(idx),
    })));
    ui.show('level-screen');
  }

  applyQuality() {
    const q = this.settings.quality;
    this.renderer.setPixelRatio(q === 'low' ? 0.75 : q === 'medium' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.setSize(innerWidth, innerHeight);
  }
}

// старт
const game = new Game();
// отладочные/тестовые хуки (используются автотестами; безвредны в бою)
window.__game = game;
window.__testEatNearest = () => {
  const g = window.__game;
  if (g.state !== 'play' || !g.foods.length) return false;
  let best = null, bd = 1e9;
  for (const f of g.foods) {
    const d = f.group.position.distanceTo(g.snake.head.position);
    if (d < bd) { bd = d; best = f; }
  }
  if (best) { g.eatFood(best); best.dispose(); g.foods.splice(g.foods.indexOf(best), 1); return true; }
  return false;
};
window.__autopilot = (on) => {
  const g = window.__game;
  if (!on) { if (g._ap) clearInterval(g._ap); g._ap = null; return; }
  g._ap = setInterval(() => {
    if (g.state === 'intro') g.beginPlay();
    if (g.state === 'play') window.__testEatNearest();
  }, 250);
};
