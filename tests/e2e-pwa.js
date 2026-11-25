/* Comprueba que la PWA es instalable y abre sin red (service worker + manifest). */
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const dev = require('./dev-server.js');
(async () => {
  const { server, port } = await dev.start(0);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const res = [];
  const ok = (n, c, x) => res.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' -> ' + x : ''));
  await p.goto('http://127.0.0.1:' + port + '/index.html');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForSelector('.card.empty');
  ok('service worker activo y controlando la página', await p.evaluate(() => !!navigator.serviceWorker.controller));
  const man = await p.evaluate(async () => { const r = await fetch('manifest.webmanifest'); return r.json(); });
  ok('manifest con nombre, display standalone e íconos', man.name === 'JulyAppGym' && man.display === 'standalone' && man.icons.length === 3);
  const icons = await p.evaluate(async (icons) => Promise.all(icons.map(async i => { const r = await fetch(i.src); const bl = await r.blob(); return r.ok && bl.type === 'image/png'; })), man.icons);
  ok('íconos del manifest existen como PNG', icons.every(Boolean));
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('.card.empty', { timeout: 8000 }).then(() => ok('sin red: la app abre desde la caché del service worker', true), () => ok('sin red: la app abre desde la caché del service worker', false));
  await p.screenshot({ path: __dirname + '/pwa_offline.png' });
  console.log(res.join('\n')); await b.close(); server.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
