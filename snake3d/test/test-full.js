// Полный прогон: все 8 уровней через автопилот + скриншоты каждого биома
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:8077/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  for (let lvl = 0; lvl < 8; lvl++) {
    await page.evaluate((i) => { window.__autopilot(false); window.__game.startLevel(i); }, lvl);
    await page.waitForTimeout(600);
    await page.evaluate(() => { window.__game.beginPlay(); window.__autopilot(true); });
    // ждём завершения уровня (complete или dead) до 40 сек
    let result = 'timeout';
    for (let t = 0; t < 80; t++) {
      await page.waitForTimeout(500);
      result = await page.evaluate(() => window.__game.state);
      if (result === 'complete' || result === 'dead' || result === 'victory') break;
    }
    await page.evaluate(() => window.__autopilot(false));
    await page.screenshot({ path: `/tmp/shot_level${lvl+1}_${result}.png` });
    const info = await page.evaluate(() => ({ eaten: window.__game.eaten, target: window.__game.targetCount, score: window.__game.score, hp: window.__game.hp }));
    console.log(`LVL ${lvl+1}: state=${result}`, JSON.stringify(info));
    if (result === 'dead') { console.log('  -> DEAD, retry once with more autopilot time'); 
      await page.evaluate((i) => { window.__game.startLevel(i); }, lvl);
      await page.waitForTimeout(400);
      await page.evaluate(() => { window.__game.beginPlay(); window.__autopilot(true); });
      for (let t = 0; t < 80; t++) { await page.waitForTimeout(500);
        const r = await page.evaluate(() => window.__game.state);
        if (r !== 'play' && r !== 'intro') break; }
      await page.evaluate(() => window.__autopilot(false));
      console.log('  retry result:', await page.evaluate(() => window.__game.state));
    }
  }
  console.log('TOTAL ERRORS:', errors.length);
  errors.slice(0, 8).forEach(e => console.log('ERR:', e));
  await browser.close();
})();
