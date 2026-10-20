// ============================================================
// SERPENTINE — UI Controller: меню, HUD, оверлеи, настройки
// ============================================================

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.toastQueue = [];
  }

  show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (screenId) $(screenId).classList.add('active');
    document.body.classList.toggle('in-game', screenId === null || screenId === 'hud-layer');
  }

  setHud(data) {
    $('hud-score').textContent = data.score.toLocaleString('ru-RU');
    $('hud-length').textContent = data.length;
    $('hud-eaten').textContent = `${data.eaten}/${data.target}`;
    $('hud-level-name').textContent = data.levelName;
    $('hud-time').textContent = data.time;
    // комбо
    const comboEl = $('hud-combo');
    if (data.combo > 1) {
      comboEl.textContent = `x${data.combo}`;
      comboEl.classList.add('show');
      comboEl.style.color = data.combo >= 5 ? '#ffd700' : data.combo >= 3 ? '#ff8c42' : '#fff';
    } else comboEl.classList.remove('show');
    // энергия рывка
    $('dash-fill').style.transform = `scaleY(${data.dash})`;
    $('dash-orb').classList.toggle('ready', data.dash > 0.99);
    // здоровье
    for (let i = 0; i < 3; i++) {
      const h = document.querySelectorAll('#hud-hearts .heart')[i];
      h.classList.toggle('lost', i >= data.hp);
    }
    // прогресс цели
    $('target-fill').style.width = `${Math.min(100, (data.eaten / data.target) * 100)}%`;
    // стрелка к еде
    if (data.foodDir !== null && data.foodDist !== undefined) {
      const ar = $('food-arrow');
      ar.style.display = 'block';
      ar.style.transform = `translateX(-50%) rotate(${data.foodDir}rad)`;
      $('food-dist').textContent = Math.round(data.foodDist) + ' м';
      ar.classList.toggle('close', data.foodDist < 6);
    } else $('food-arrow').style.display = 'none';
  }

  minimapCells(cells, snakePts, headPt, foods, size) {
    const cv = $('minimap');
    const ctx = cv.getContext('2d');
    const S = cv.width;
    ctx.clearRect(0, 0, S, S);
    const scale = S / (size * 2);
    const toPx = (cx, cz) => [(cx + size) * scale, (cz + size) * scale];
    // препятствия
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const c of cells) {
      const [x, y] = toPx(c[0], c[1]);
      ctx.fillRect(x - 1, y - 1, scale + 2, scale + 2);
    }
    // еда
    ctx.fillStyle = '#ff5566';
    for (const f of foods) {
      const [x, y] = toPx(f[0], f[1]);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
    }
    // тело
    ctx.fillStyle = 'rgba(120,255,160,0.7)';
    for (const p of snakePts) {
      const [x, y] = toPx(p[0], p[1]);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // голова
    if (headPt) {
      const [x, y] = toPx(headPt[0], headPt[1]);
      ctx.fillStyle = '#aaffff';
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
    }
  }

  toast(text, cls = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.innerHTML = text;
    $('toasts').appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2200);
  }

  damageFlash() {
    const f = $('damage-flash');
    f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash');
  }
  healFlash() {
    const f = $('heal-flash');
    f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash');
  }

  setCountdown(label) {
    let el = document.getElementById('countdown-big');
    if (!el) {
      el = document.createElement('div');
      el.id = 'countdown-big';
      document.getElementById('hud-layer').appendChild(el);
    }
    if (label === null) { el.classList.remove('show'); return; }
    el.textContent = label;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    if (label === 'ПОГНАЛИ!') el.classList.add('go'); else el.classList.remove('go');
  }

  setPoisonOverlay(k) {
    let el = document.getElementById('poison-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'poison-overlay';
      document.body.appendChild(el);
    }
    el.style.opacity = k.toFixed(3);
  }

  showPause(settings) {
    $('pause-screen').classList.add('active');
    $('pause-vol').value = settings.volume;
    $('opt-sensitivity').value = settings.sensitivity;
    $('opt-quality').value = settings.quality;
    $('opt-invert').checked = settings.invertY;
  }
  hidePause() { $('pause-screen').classList.remove('active'); }

  showLevelIntro(biome, levelNum, mechanicText) {
    $('intro-icon').textContent = biome.icon;
    $('intro-num').textContent = `УРОВЕНЬ ${levelNum}`;
    $('intro-name').textContent = biome.name;
    $('intro-desc').textContent = biome.desc;
    $('intro-mechanic').textContent = mechanicText;
    this.show('level-intro');
  }
  hideLevelIntro() { $('level-intro').classList.remove('active'); }

  showLevelComplete(stats) {
    $('lc-title').textContent = stats.last ? 'ВОЗРОЖДЕНИЕ ЗАВЕРШЕНО' : 'УРОВЕНЬ ПРОЙДЕН';
    $('lc-base').textContent = stats.base.toLocaleString('ru-RU');
    $('lc-len').textContent = '+' + stats.lenBonus.toLocaleString('ru-RU');
    $('lc-time').textContent = '+' + stats.timeBonus.toLocaleString('ru-RU');
    $('lc-combo').textContent = '+' + stats.comboBonus.toLocaleString('ru-RU');
    $('lc-perfect').textContent = stats.perfect ? '+2500' : '—';
    $('lc-total').textContent = stats.total.toLocaleString('ru-RU');
    $('lc-rank').textContent = stats.rank;
    $('lc-rank').className = 'rank rank-' + stats.rank.toLowerCase();
    $('lc-next-label').textContent = stats.last ? 'ФИНАЛ' : 'СЛЕДУЮЩИЙ УРОВЕНЬ';
    this.show('level-complete');
  }

  showGameOver(stats) {
    $('go-score').textContent = stats.score.toLocaleString('ru-RU');
    $('go-length').textContent = stats.length;
    $('go-level').textContent = `${stats.levelIcon} ${stats.levelName}`;
    $('go-eaten').textContent = `${stats.eaten}/${stats.target}`;
    this.show('game-over');
  }

  updateMenuLevels(levels) {
    const wrap = $('level-select');
    wrap.innerHTML = '';
    levels.forEach((lv, i) => {
      const b = document.createElement('button');
      b.className = 'level-card' + (lv.unlocked ? '' : ' locked') + (lv.done ? ' done' : '');
      b.innerHTML = `<span class="lc-icon">${lv.icon}</span><span class="lc-num">${lv.num}</span>` +
        (lv.best ? `<span class="lc-best">★ ${lv.best}</span>` : '');
      b.title = lv.unlocked ? lv.name : 'Пройдите предыдущий уровень';
      if (lv.unlocked) b.addEventListener('click', () => lv.onStart(i));
      wrap.appendChild(b);
    });
  }

  bindSoundHover() {
    document.querySelectorAll('button').forEach(b => {
      b.onmouseenter = () => window.__audio?.uiHover();
    });
  }
}

export const ui = new UI();
