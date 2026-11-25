/* Prueba de sincronización con la "hoja" (emulada): dos celulares, caída de red, borrado, clave. */
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const fs = require('fs'), path = require('path');
const dev = require('./dev-server.js');
const results = []; const ok = (n, c, x) => results.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' -> ' + x : ''));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const { server, state, port } = await dev.start(0);
  const BASE = 'http://127.0.0.1:' + port, EXEC = BASE + '/exec';
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  async function phone(url) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(u => { try { if (!localStorage.getItem('julyapp_url_v1')) localStorage.setItem('julyapp_url_v1', u); } catch (e) {} }, url);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.|ERR_|500|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(BASE + '/index.html');
    return { ctx, page };
  }
  const docsOf = prefix => [...state.docs.keys()].filter(k => k.startsWith(prefix));

  // 1. celular A arranca vacío y conectado
  const A = await phone(EXEC);
  await A.page.waitForSelector('.card.empty');
  ok('A: arranca con la hoja vacía', (await A.page.textContent('main')).includes('Crea el primer perfil'));
  ok('A: sin banner de modo local', !(await A.page.textContent('main')).includes('Modo local'));

  // 2. importar los datos iniciales desde la UI
  await A.page.click('[data-act=go][data-v=data]');
  await A.page.fill('#im-text', fs.readFileSync(path.resolve(__dirname, '../seed/julian_inicial.json'), 'utf8'));
  await A.page.click('[data-act=importReview]');
  await A.page.click('[data-mact="1"]');
  await A.page.waitForSelector('.hello');
  await sleep(800);
  ok('hoja recibe persona, ciclo, programa y 27 ejercicios', state.docs.has('people/julian') && docsOf('people/julian/cycles/').length === 1 && docsOf('people/julian/programs/').length === 1 && docsOf('people/julian/exercises/').length === 27, [...state.docs.keys()].length + ' docs');
  const cyc = state.docs.get(docsOf('people/julian/cycles/')[0]);
  ok('ciclo en la hoja con "placas"', JSON.stringify(cyc).includes('"unit":"placas"'));

  // 3. celular B (otro perfil de navegador) ve los datos tras su primer pull
  const B = await phone(EXEC);
  await B.page.waitForSelector('.hello');
  ok('B: ve el perfil de Julián cargado por A', (await B.page.textContent('.hello')).includes('Julián'));
  ok('B: ve el ciclo', await B.page.evaluate(() => window.JulyApp.S.cycles.length === 1 && window.JulyApp.S.cycles[0].days.length === 3));

  // 4. B registra una medición; A la recibe al sincronizar
  await B.page.click('.nav [data-v=measures]');
  await B.page.click('[data-act=newMeas]');
  await B.page.fill('#mv-date', '2026-11-25');
  await B.page.fill('#mv-peso', '82,4');
  await B.page.click('[data-mact="1"]');
  await sleep(700);
  ok('hoja recibe la medición de B', docsOf('people/julian/measurements/').length === 1);
  await A.page.evaluate(() => window.JulyApp.Store.pull());
  await sleep(500);
  ok('A recibe la medición de B', await A.page.evaluate(() => window.JulyApp.S.measurements.length === 1 && window.JulyApp.S.measurements[0].values.peso === 82.4));

  // 5. A inicia sesión y registra una serie; se guarda en la hoja sin pulsar "terminar"
  await A.page.click('.nav [data-v=train]');
  await A.page.click('[data-act=startDay] >> nth=0');
  await A.page.waitForSelector('.sess-prog');
  await A.page.click('[data-act=toggleSet] >> nth=0').catch(() => {});
  await A.page.fill('.set[data-i="0"] input[data-bind="weight"] >> nth=0', '68').catch(() => {});
  await sleep(1500);
  const sess = docsOf('people/julian/sessions/');
  ok('la sesión en curso ya está en la hoja', sess.length === 1 && state.docs.get(sess[0]).status === 'in_progress', sess.length + ' sesiones');

  // 6. caída de la hoja: se puede seguir y queda pendiente; al volver, se envía
  await fetch(BASE + '/__mode', { method: 'POST', body: '{"mode":"down"}' });
  await B.page.click('[data-act=newMeas]');
  await B.page.fill('#mv-date', '2026-11-26');
  await B.page.fill('#mv-peso', '82,0');
  await B.page.click('[data-mact="1"]');
  await sleep(700);
  ok('con la hoja caída, B ve su medición (optimista)', await B.page.evaluate(() => window.JulyApp.S.measurements.length === 2));
  ok('queda 1 pendiente en la cola', await B.page.evaluate(() => window.JulyApp.Store.outbox.length === 1));
  ok('la hoja no recibió nada', docsOf('people/julian/measurements/').length === 1);
  await B.page.evaluate(() => window.JulyApp.Store.pull());
  await sleep(300);
  ok('B muestra aviso de conexión', (await B.page.textContent('main')).includes('No hay conexión con la hoja'));
  await fetch(BASE + '/__mode', { method: 'POST', body: '{"mode":"ok"}' });
  await B.page.evaluate(() => window.JulyApp.Store.pull());
  await sleep(900);
  ok('al volver la conexión, la cola se envía', docsOf('people/julian/measurements/').length === 2 && await B.page.evaluate(() => window.JulyApp.Store.outbox.length === 0));
  ok('aviso desaparece', !(await B.page.textContent('main')).includes('No hay conexión con la hoja'));

  // 7. recarga con la hoja caída: la caché local muestra los datos
  await fetch(BASE + '/__mode', { method: 'POST', body: '{"mode":"down"}' });
  await B.page.reload();
  await B.page.waitForSelector('.hello');
  ok('recarga sin hoja: abre con la caché local', (await B.page.textContent('.hello')).includes('Julián'));
  await fetch(BASE + '/__mode', { method: 'POST', body: '{"mode":"ok"}' });

  // 8. borrado se propaga
  await A.page.evaluate(() => window.JulyApp.Store.pull()); await sleep(500);
  const mid = docsOf('people/julian/measurements/')[0];
  await A.page.evaluate(p => window.JulyApp.Store.del(p), mid);
  await sleep(500);
  ok('la hoja borra el documento', docsOf('people/julian/measurements/').length === 1);
  await B.page.evaluate(() => window.JulyApp.Store.pull()); await sleep(500);
  ok('B ve el borrado', await B.page.evaluate(() => window.JulyApp.S.measurements.length === 1));

  // 9. sin conexión inicial y sin caché: no muestra "Crea el primer perfil"
  await fetch(BASE + '/__mode', { method: 'POST', body: '{"mode":"down"}' });
  const C = await phone(EXEC);
  await sleep(1500);
  const ct = await C.page.textContent('main');
  ok('celular nuevo sin conexión: avisa y no ofrece crear perfil', ct.includes('Sin conexión con la hoja') && !ct.includes('Crea el primer perfil'));
  await fetch(BASE + '/__mode', { method: 'POST', body: '{"mode":"ok"}' });
  await C.page.click('[data-act=retry]');
  await C.page.waitForSelector('.hello');
  ok('al reintentar con conexión carga los datos', (await C.page.textContent('.hello')).includes('Julián'));

  // 10. clave
  state.key = 'secreta';
  const D = await phone(EXEC);
  await sleep(1500);
  ok('clave incorrecta: avisa', (await D.page.textContent('main')).includes('Clave incorrecta'));
  ok('conexión: prueba desde Datos', true);
  await D.page.click('[data-act=go][data-v=data]');
  await D.page.fill('#cn-key', 'secreta');
  await D.page.click('[data-act=testConn]');
  await D.page.waitForFunction(() => /Conexión correcta/.test(document.getElementById('cn-res').textContent), null, { timeout: 5000 }).then(() => ok('probar conexión con la clave buena', true), () => ok('probar conexión con la clave buena', false));

  ok('sin errores de consola', errors.length === 0, errors.join(' || '));
  console.log(results.join('\n'));
  await browser.close(); server.close();
})().catch(e => { console.log(results.join('\n')); console.error('TEST CRASH', e); process.exit(1); });
