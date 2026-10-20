// Автотест Serpentine через Playwright: загрузка, меню, старт уровня, геймплей, скриншоты
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8077/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/shot_menu.png' });
  console.log('MENU OK, errors so far:', errors.length);

  await page.click('#btn-play');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/shot_tutorial.png' });
  await page.click('#btn-tutorial-go');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/shot_intro.png' });
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/shot_gameplay.png' });

  for (let i = 0; i < 6; i++) {
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(350);
    await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(350);
    await page.keyboard.up('KeyD');
  }
  await page.screenshot({ path: '/tmp/shot_gameplay2.png' });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/shot_pause.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const state = await page.evaluate(() => ({
    hudVisible: getComputedStyle(document.getElementById('hud-layer')).display,
    score: document.getElementById('hud-score').textContent,
    eaten: document.getElementById('hud-eaten').textContent,
  }));
  console.log('STATE:', JSON.stringify(state));
  console.log('TOTAL ERRORS:', errors.length);
  errors.slice(0, 10).forEach(e => console.log('ERR:', e));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
