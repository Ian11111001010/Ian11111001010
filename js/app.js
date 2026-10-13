/* ==========================================================================
   ГК «РЕМЕСЛО» — интерактив фасадного лендинга
   Vanilla JS + GSAP (через CDN с graceful-degradation)
   ========================================================================== */
(function () {
  'use strict';

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DESKTOP = () => window.matchMedia('(hover:hover) and (pointer:fine)').matches;

  /* ---------- 0. Прогресс-бар + шапка ---------- */
  const bar = $('.progress-bar');
  const header = $('.site-header');
  function onScrollUI() {
    const st = window.scrollY;
    const h = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.width = (h > 0 ? (st / h) * 100 : 0) + '%';
    if (header) header.classList.toggle('scrolled', st > 30);
  }
  addEventListener('scroll', onScrollUI, { passive: true });
  onScrollUI();

  /* ---------- 1. Мобильное меню ---------- */
  const burger = $('.burger');
  const mobMenu = $('.mobile-menu');
  if (burger && mobMenu) {
    burger.addEventListener('click', () => {
      const open = mobMenu.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });
    $$('a', mobMenu).forEach(a => a.addEventListener('click', () => {
      mobMenu.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }));
  }

  /* ---------- 2. Reveal-on-scroll («сборка как конструктор») ---------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal, .assembly').forEach(el => io.observe(el));

  /* ---------- 3. Магнитные кнопки (тактильный отклик) ---------- */
  if (DESKTOP() && !REDUCED) {
    $$('.magnetic').forEach(btn => {
      btn.addEventListener('mousemove', ev => {
        const r = btn.getBoundingClientRect();
        const x = (ev.clientX - r.left - r.width / 2) * 0.25;
        const y = (ev.clientY - r.top - r.height / 2) * 0.35;
        btn.style.transform = `translate(${x}px, ${y}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
      btn.addEventListener('mousedown', () => { btn.style.transition = 'transform .08s'; });
      btn.addEventListener('mouseup', () => { btn.style.transition = ''; });
    });
  }

  /* ---------- 4. HERO: параллакс exploded-узла от мыши ---------- */
  const nodeSvg = $('#nodeSvg');
  if (nodeSvg && DESKTOP() && !REDUCED) {
    const layers = $$('.layer', nodeSvg);
    const heroSec = $('#hero');
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
    heroSec.addEventListener('mousemove', ev => {
      const r = heroSec.getBoundingClientRect();
      tx = ((ev.clientX - r.left) / r.width - 0.5) * 2;   // -1..1
      ty = ((ev.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    heroSec.addEventListener('mouseleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
    function tick() {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      layers.forEach(l => {
        const d = +l.dataset.depth || 10;
        l.setAttribute('transform', `translate(${(cx * d).toFixed(2)}, ${(cy * d * 0.45).toFixed(2)})`);
      });
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) { raf = requestAnimationFrame(tick); }
      else raf = null;
    }
  }

  /* ---------- 5. HERO: селектор роли → подзаголовок + таб ЦА ---------- */
  const roleCopy = {
    dev: 'Вентилируемые фасады и&nbsp;СПК в&nbsp;Москве и&nbsp;МО. Изучим проект до&nbsp;договора, зафиксируем смету и&nbsp;возьмём на&nbsp;себя организацию работ.',
    gc: 'Субподряд фасадного объёма: сильный ИТР, график поставок и&nbsp;исполнительная документация, которую принимают с&nbsp;первой попытки.',
    arch: 'Проработаем сложные узлы и&nbsp;сохраним авторское решение: материалы, образцы и&nbsp;детали доезжают до&nbsp;площадки без искажений.'
  };
  const heroSub = $('#heroSub');
  const rsBtns = $$('.rs-btn');
  const tabBtns = $$('.tab-btn');

  function setRole(role, scrollTab) {
    rsBtns.forEach(b => {
      const on = b.dataset.role === role;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (heroSub) {
      heroSub.style.opacity = 0;
      setTimeout(() => { heroSub.innerHTML = roleCopy[role] || roleCopy.dev; heroSub.style.opacity = 1; }, 220);
    }
    const map = { dev: 'dev', gc: 'gc', arch: 'arch' };
    const t = tabBtns.find(b => b.dataset.tab === map[role]);
    if (t) activateTab(t, false);
    if (scrollTab) $('#personalization')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  }
  rsBtns.forEach(b => b.addEventListener('click', () => setRole(b.dataset.role, false)));
  if (heroSub) heroSub.style.transition = 'opacity .25s';

  /* ---------- 6. Табы персонализации ---------- */
  function activateTab(btn, focusPanel) {
    tabBtns.forEach(b => b.classList.toggle('is-active', b === btn));
    $$('.tab-panel').forEach(p => {
      const on = p.dataset.panel === btn.dataset.tab;
      p.classList.toggle('is-active', on);
      p.hidden = !on;
    });
    if (btn.dataset.tab === 'gc') playGantt();
    if (focusPanel) btn.focus();
  }
  tabBtns.forEach(b => b.addEventListener('click', () => activateTab(b)));
  // клавиатурная навигация табов
  $('.tabs-nav')?.addEventListener('keydown', e => {
    const i = tabBtns.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const n = tabBtns[(i + (e.key === 'ArrowRight' ? 1 : tabBtns.length - 1)) % tabBtns.length];
      n.focus(); activateTab(n, true);
    }
  });

  /* Гант: проигрываем при первом показе панели/скролле */
  const gantt = $('#gantt');
  let ganttPlayed = false;
  function playGantt() {
    if (!gantt || ganttPlayed) return;
    ganttPlayed = true;
    $$('.g-bar', gantt).forEach((b, i) => { b.style.transitionDelay = (i * 0.12) + 's'; });
    requestAnimationFrame(() => gantt.closest('.gantt-card') && gantt.classList.add('played'));
  }
  if (gantt) new IntersectionObserver(es => es.forEach(e => e.isIntersecting && playGantt()), { threshold: .4 }).observe(gantt);

  /* ---------- 7. Before/After слайдер (застройщик) ---------- */
  const ba = $('#baSlider');
  if (ba) {
    let dragging = false;
    const setPos = clientX => {
      const r = ba.getBoundingClientRect();
      const p = Math.min(96, Math.max(4, ((clientX - r.left) / r.width) * 100));
      ba.style.setProperty('--pos', p + '%');
    };
    ba.addEventListener('pointerdown', e => { dragging = true; ba.setPointerCapture(e.pointerId); setPos(e.clientX); });
    ba.addEventListener('pointermove', e => { if (dragging) setPos(e.clientX); });
    ['pointerup', 'pointercancel'].forEach(ev => ba.addEventListener(ev, () => dragging = false));
    ba.style.setProperty('--pos', '50%');
  }

  /* ---------- 8. Сравнение «замысел ↔ факт» (архитектор) ---------- */
  const cmp = $('#cmpWidget'), cmpRange = $('#cmpRange');
  if (cmp && cmpRange) {
    const sync = () => cmp.style.setProperty('--pos', cmpRange.value + '%');
    cmpRange.addEventListener('input', sync); sync();
  }

  /* ---------- 9. Риски: чертёж + аккордеон (красные → зелёные) ---------- */
  const risksSec = $('.risks');
  if (risksSec) {
    new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) risksSec.classList.add('drawn');
    }), { threshold: .25 }).observe(risksSec);

    const zones = $$('.risk-zone');
    const accItems = $$('.acc-item');

    function markZone(step, state) { // state: 'hide' | 'risk' | 'solved'
      const z = zones.find(z => +z.dataset.step === step);
      if (!z) return;
      z.classList.toggle('show', state !== 'hide');
      z.classList.toggle('solved', state === 'solved');
    }
    function openItem(item, auto) {
      accItems.forEach(i => {
        const on = i === item;
        i.classList.toggle('is-open', on);
        $('.acc-head', i).setAttribute('aria-expanded', String(on));
        markZone(+i.dataset.step, on ? 'solved' : 'risk'); // открытая зона — «решена», остальные — красные
      });
      if (!auto) item.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
    }
    accItems.forEach(item => {
      const head = $('.acc-head', item);
      head.addEventListener('click', () => {
        if (item.classList.contains('is-open')) {
          item.classList.remove('is-open');
          head.setAttribute('aria-expanded', 'false');
          markZone(+item.dataset.step, 'risk');
        } else openItem(item, false);
      });
      markZone(+item.dataset.step, item.classList.contains('is-open') ? 'solved' : 'risk');
    });
    // авто-подсветка следующего пункта при скролле по секции
    const autoIO = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting && !e.target.classList.contains('is-open')) openItem(e.target, true);
    }), { threshold: .75 });
    accItems.slice(1).forEach(i => autoIO.observe(i));
  }

  /* ---------- 10. Производство: курсор по техлинии ---------- */
  const steps = $$('.proc-step');
  const pop = $('#procPopover');
  function showStep(step) {
    if (!step || step.classList.contains('is-active') || !pop) return;
    steps.forEach(s => s.classList.toggle('is-active', s === step));
    let data;
    try { data = JSON.parse(step.dataset.step); } catch (e) { return; }
    $('#ppTitle').textContent = data.t;
    $('#ppDesc').textContent = data.d;
    $('#ppMeta').innerHTML = (data.m || []).map(m => `<li>${m}</li>`).join('');
    pop.classList.remove('flash'); void pop.offsetWidth; pop.classList.add('flash');
  }
  steps.forEach(s => {
    s.addEventListener('mouseenter', () => showStep(s));
    s.addEventListener('click', () => showStep(s));
    s.addEventListener('focus', () => showStep(s));
    s.tabIndex = 0;
  });
  if (steps.length) showStep(steps[0]);

  /* ---------- 11. Материалы: тап-флип для тач-устройств ---------- */
  $$('.mat-card').forEach(card => {
    card.addEventListener('click', () => {
      if (!DESKTOP()) card.classList.toggle('flipped');
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('flipped'); }
    });
    card.tabIndex = 0;
  });

  /* ---------- 12. Таймлайн: прогресс по скроллу + подсветка этапов ---------- */
  const tl = $('#timeline');
  if (tl) {
    const prog = $('.tl-progress', tl);
    const items = $$('.tl-item', tl);
    function tlUpdate() {
      const r = tl.getBoundingClientRect();
      const vh = innerHeight;
      const total = r.height;
      const passed = Math.min(Math.max(vh * 0.55 - r.top, 0), total);
      if (prog) prog.style.height = passed + 'px';
      items.forEach(it => {
        const dr = it.querySelector('.tl-dot').getBoundingClientRect();
        it.classList.toggle('lit', dr.top < vh * 0.62);
      });
    }
    addEventListener('scroll', () => requestAnimationFrame(tlUpdate), { passive: true });
    tlUpdate();
  }

  /* ---------- 13. Карусель кейсов: свайп + стрелки + dots ---------- */
  const carousel = $('#caseCarousel');
  const track = $('#caseTrack');
  if (carousel && track) {
    const cards = $$('.case-card', track);
    const counter = $('#caseCounter');
    const dotsWrap = $('#caseDots');
    let index = 0;

    function perView() {
      const w = innerWidth;
      return w <= 640 ? 1 : w <= 1080 ? 2 : 3;
    }
    function maxIndex() { return Math.max(0, cards.length - perView()); }
    function apply(anim) {
      const pv = perView();
      const gap = 20;
      const cw = (carousel.clientWidth - gap * (pv - 1)) / pv;
      track.style.transition = anim === false ? 'none' : '';
      track.style.transform = `translateX(${-index * (cw + gap)}px)`;
      if (counter) counter.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(maxIndex() + 1).padStart(2, '0');
      renderDots();
    }

    function renderDots() {
      if (!dotsWrap) return;
      const n = maxIndex() + 1;
      dotsWrap.innerHTML = '';
      for (let d = 0; d < n; d++) {
        const b = document.createElement('button');
        b.setAttribute('aria-label', `Кейс ${d + 1}`);
        b.className = d === index ? 'on' : '';
        b.addEventListener('click', () => go(d));
        dotsWrap.appendChild(b);
      }
    }

    $('#caseNext')?.addEventListener('click', () => go(index + 1));
    $('#casePrev')?.addEventListener('click', () => go(index - 1));
    carousel.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    });

    // drag/swipe
    let down = false, startX = 0, curX = 0;
    carousel.addEventListener('pointerdown', e => {
      down = true; startX = curX = e.clientX;
      carousel.classList.add('dragging');
      track.style.transition = 'none';
    });
    carousel.addEventListener('pointermove', e => { if (down) curX = e.clientX; });
    function endDrag() {
      if (!down) return;
      down = false; carousel.classList.remove('dragging');
      const dx = curX - startX;
      const th = carousel.clientWidth * 0.14;
      if (dx < -th) go(index + 1);
      else if (dx > th) go(index - 1);
      else apply(true);
      track.style.transition = '';
    }
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => carousel.addEventListener(ev, endDrag));

    addEventListener('resize', () => { go(Math.min(index, maxIndex())); });
    apply(false);
  }

  /* ---------- 14. Форма: 2 шага + dropzone + валидация ---------- */
  const form = $('#leadForm');
  if (form) {
    const fSteps = $$('.f-step', form);
    const stepInd = $('#stepInd');
    function gotoStep(n) {
      fSteps.forEach(s => s.classList.toggle('is-active', s.dataset.step === String(n)));
      if (stepInd) stepInd.textContent = n === 3 ? 'ГОТОВО' : String(n).padStart(2, '0') + ' / 02';
    }
    const err = (input, on) => {
      const field = input.closest('.f-field');
      if (field) field.classList.toggle('show-err', on);
      input.classList.toggle('invalid', on);
    };
    $('#toStep2')?.addEventListener('click', () => {
      const type = $('#objType'), area = $('#objArea');
      let ok = true;
      if (!type.value) { type.focus(); ok = false; }
      const av = parseFloat(area.value);
      err(area, !(av >= 100)); if (!(av >= 100)) ok = false;
      if (ok) { gotoStep(2); $('#fName')?.focus(); }
    });
    $('#backStep1')?.addEventListener('click', () => gotoStep(1));

    // маска телефона (простая)
    const phone = $('#fPhone');
    phone?.addEventListener('input', () => {
      let v = phone.value.replace(/\D/g, '').slice(0, 11);
      if (v.startsWith('8')) v = '7' + v.slice(1);
      let out = '+7';
      if (v.length > 1) out += ' (' + v.slice(1, 4);
      if (v.length >= 5) out += ') ' + v.slice(4, 7);
      if (v.length >= 8) out += '-' + v.slice(7, 9);
      if (v.length >= 10) out += '-' + v.slice(9, 11);
      phone.value = out;
    });

    // dropzone
    const dz = $('#dropzone'), fileInput = $('#fFile'), fileList = $('#dzFiles');
    let picked = [];
    function renderFiles() {
      fileList.innerHTML = picked.map(f => `<li>✓ ${f.name} · ${(f.size / 1024).toFixed(0)} КБ</li>`).join('');
    }
    dz?.addEventListener('click', () => fileInput.click());
    dz?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput?.addEventListener('change', () => { picked = picked.concat(Array.from(fileInput.files)); renderFiles(); });
    ['dragenter', 'dragover'].forEach(ev => dz?.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz?.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz?.addEventListener('drop', e => {
      picked = picked.concat(Array.from(e.dataTransfer.files));
      renderFiles();
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#fName'), email = $('#fEmail');
      let ok = true;
      err(name, name.value.trim().length < 2); if (name.value.trim().length < 2) ok = false;
      const phOk = phone.value.replace(/\D/g, '').length === 11;
      err(phone, !phOk); if (!phOk) ok = false;
      if (email.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) { err(email, true); ok = false; } else err(email, false);
      const consent = $('#fConsent');
      if (!consent.checked) { consent.closest('.f-consent').style.color = 'var(--red)'; ok = false; }
      if (!ok) return;
      $('#okRef').textContent = 'REF: RM-2026-' + String(Math.floor(1000 + Math.random() * 9000));
      gotoStep(3);
    });
  }

  /* ---------- 15. Sticky CTA (моб.) ---------- */
  const sticky = $('#stickyCta');
  if (sticky) {
    const contact = $('#contact');
    addEventListener('scroll', () => {
      const past = scrollY > innerHeight * 0.9;
      const atForm = contact && contact.getBoundingClientRect().top < innerHeight * 0.85;
      sticky.classList.toggle('show', past && !atForm);
    }, { passive: true });
  }

  /* ---------- 16. GSAP — усиление плавности (с CSS/IO-фолбэком) ---------- */
  function enhanceWithGSAP() {
    if (!window.gsap || !window.ScrollTrigger || REDUCED) return;
    gsap.registerPlugin(ScrollTrigger);

    // параллакс фона hero при скролле
    gsap.to('.hero-img', {
      yPercent: 12, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
    gsap.to('.hero-left', {
      y: -60, autoAlpha: .25, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: '20% top', end: 'bottom top', scrub: true }
    });

    // «сборка» заголовков секций: линии складываются как конструктор
    $$('.section h2').forEach(h => {
      gsap.fromTo(h, { y: 34, opacity: 0, skewY: 1.2 }, {
        y: 0, opacity: 1, skewY: 0, duration: .9, ease: 'power3.out',
        scrollTrigger: { trigger: h, start: 'top 85%', once: true }
      });
    });

    // лёгкий параллаallax галерей производства
    $$('.pg-img img').forEach(img => {
      gsap.fromTo(img, { yPercent: -6 }, {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: img.closest('.pg-img'), start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });
  }
  if (window.gsap) enhanceWithGSAP();
  else window.addEventListener('load', enhanceWithGSAP); // ждём defer-скрипты
})();
