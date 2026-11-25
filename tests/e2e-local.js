const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const path = require('path');
const URL = process.env.APP_URL || 'http://127.0.0.1:8080/index.html';
const results = [];
const ok = (name, cond, extra) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' -> ' + extra : '')); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.googleapis|fonts\.gstatic|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForSelector('.card.empty');
  ok('estado vacío sin personas', (await page.textContent('main')).includes('Crea el primer perfil'));
  ok('banner modo local', (await page.textContent('main')).includes('Modo local'));

  // crear persona
  await page.click('[data-act=newPerson]');
  await page.fill('#pf-name', 'Julián');
  await page.fill('#pf-h', '173');
  await page.click('[data-mact="1"]');
  await page.waitForSelector('.hello');
  ok('perfil creado y home', (await page.textContent('.hello')).includes('Julián'));

  // mediciones
  await page.click('.nav [data-v=measures]');
  await page.click('[data-act=newMeas]');
  await page.fill('#mv-date', '2026-08-05');
  await page.fill('#mv-peso', '83,5');
  await page.fill('#mv-grasa_pct', '26.2');
  await page.fill('#mv-abdomen', '96');
  await page.click('[data-mact="1"]');
  await page.click('[data-act=newMeas]');
  await page.fill('#mv-date', '2026-09-29');
  await page.fill('#mv-peso', '81.9');
  const imc = await page.inputValue('#mv-imc');
  ok('IMC automático', imc === '27,4', imc);
  await page.fill('#mv-grasa_pct', '25.6');
  await page.click('[data-mact="1"]');
  const mtxt = await page.textContent('main');
  ok('delta peso -1,6', mtxt.includes('−1,6'), '');
  ok('histórico lista 2 valoraciones', (mtxt.match(/valores/g) || []).length >= 2);

  // rutinas
  await page.click('.nav [data-v=routines]');
  await page.click('[data-act=newCycle]');
  await page.fill('#pc-name', 'Ciclo 1');
  await page.fill('#pc-days', '3');
  await page.click('[data-mact="1"]');
  await page.waitForSelector('.dayc');
  ok('ciclo con 3 días vacíos', (await page.$$('.dayc')).length === 3);
  await page.click('[data-act=pasteEx][data-d="0"]');
  const text = [
    '*** TORSO A1***','Press pecho sent maq - 3X12','Vuelos pectorales maq - 2X15','Halon polea cerrado sent 3X12','Remo polea abierto sent - 3X12','Pull down polea pie - 2X15','Flexión codos barra polea - 2X15p',
    '*** PIERNA A2.1***','Calentamiento','Abducción cadera unipodal libre 2X12','Rotación cadera pide 2X12','Extensión cadera libre pie 2X12','Balanceo talones puntas pie 2X12','Prensa incl maq - 3X12 320360360','Aduccion cadera maq - 2X20','Estocada estática - 3X15','Elevación talones maq pie - 2X15','Extensión rodilla maq - 3X15 135135135','Flexión rodilla sent maq - 3X12','Crunch abdomen sent maq - 3X15',
    '***FULL BODY***','Calentamiento:','*Circulos brazos 2X15','Flexion ext columna 2X15','Sentadilla 2X15','Press pecho maq sent - 3X12','Remo sent maq - 3X15'
  ].join('\n');
  await page.fill('#pr-text', text);
  const prev = await page.textContent('#pr-prev');
  ok('vista previa 22 ejercicios', prev.includes('22 ejercicios'), prev);
  await page.click('[data-mact="1"]');
  await page.waitForTimeout(300);
  const days = await page.evaluate(() => window.JulyApp.S.cycles[0].days.map(d => ({ n: d.name, c: d.exercises.length, w: d.exercises.filter(e => e.section === 'warmup').length })));
  ok('días rellenados en orden', JSON.stringify(days) === JSON.stringify([{n:'TORSO A1',c:6,w:0},{n:'PIERNA A2.1',c:11,w:4},{n:'FULL BODY',c:5,w:3}]), JSON.stringify(days));
  const ex = await page.evaluate(() => window.JulyApp.S.cycles[0].days[1].exercises.filter(e => /Prensa|Extensión rodilla/.test(e.name)).map(e => [e.name, e.notes]));
  ok('referencia de pesos dividida', JSON.stringify(ex).includes('320/360/360') && JSON.stringify(ex).includes('135/135/135'), JSON.stringify(ex));

  // sesión
  await page.click('.nav [data-v=home]');
  const btn = await page.textContent('.btn.big');
  ok('sugiere primer día', btn.includes('TORSO A1'), btn);
  await page.click('.btn.big');
  await page.waitForSelector('.sess-prog');
  ok('sesión 6 ejercicios', (await page.$$('.ex')).length === 6);
  // primer ejercicio: 3 series
  const first = '.ex:nth-of-type(1)';
  const rows = await page.$$('.ex >> nth=0 >> .set:not(.hd)');
  ok('3 series en primer ejercicio', rows.length === 3, String(rows.length));
  await page.fill('.set[data-i="0"] input[data-bind=w] >> nth=0', '61');
  await page.fill('.set[data-i="0"] input[data-bind=r] >> nth=0', '12');
  await page.click('.set[data-i="0"] .chk >> nth=0');
  await page.click('.set[data-i="1"] .chk >> nth=0');
  await page.click('.set[data-i="2"] .chk >> nth=0');
  const live = await page.evaluate(() => window.JulyApp.S.live.exercises[0].sets.map(s => [s.weight, s.reps, s.done]));
  ok('series registradas', JSON.stringify(live) === JSON.stringify([[61,12,true],[61,12,true],[61,12,true]]) || JSON.stringify(live).includes('61'), JSON.stringify(live));
  ok('primer ejercicio completado', await page.evaluate(() => document.querySelector('.ex').classList.contains('done')));
  const pt = await page.textContent('.sess-prog');
  ok('progreso 1 de 6', pt.includes('1 de 6'), pt.trim());
  // terminar con pendientes
  await page.click('[data-act=finishSession]');
  await page.click('[data-mact="1"]');
  await page.waitForSelector('.bsum');
  ok('detalle de sesión', (await page.textContent('main')).includes('Press pecho'));
  await page.waitForTimeout(700);

  // segunda sesión: referencia anterior
  await page.click('.nav [data-v=train]');
  await page.click('[data-act=startDay] >> nth=0');
  await page.waitForSelector('.sess-prog');
  const lastline = await page.textContent('.lastline');
  ok('referencia de la última vez', lastline.includes('61×12'), lastline.trim());
  const ph = await page.getAttribute('.set[data-i="0"] input[data-bind=w] >> nth=0', 'placeholder');
  ok('placeholder con peso anterior', ph === '61', ph);
  // marcar sin escribir usa anterior
  await page.click('.set[data-i="0"] .chk >> nth=0');
  const w0 = await page.evaluate(() => window.JulyApp.S.live.exercises[0].sets[0].weight);
  ok('marcar sin escribir copia el anterior', w0 === 61, String(w0));
  // volver y persistencia
  await page.click('[data-act=back]');
  await page.waitForTimeout(700);
  const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('julyapp_cache_v1_local'))).filter(k => k.includes('/sessions/')).length);
  ok('2 sesiones persistidas', stored === 2, String(stored));

  // progreso
  await page.click('.nav [data-v=progress]');
  await page.waitForSelector('svg.chart');
  ok('gráfica corporal', true);
  await page.selectOption('#pg-b', 'grasa_pct');
  ok('comparación dos métricas', (await page.$$('svg.chart .ln2')).length === 1);
  await page.click('[data-act=progTab][data-t=ex]');
  await page.waitForSelector('#pe-ex');
  ok('progreso de ejercicios', (await page.textContent('main')).includes('Press pecho'));
  await page.click('[data-act=exMetric][data-m=e1]');
  ok('1RM rotulado estimación', (await page.textContent('main')).includes('ESTIMACIÓN'));

  // exportar JSON
  await page.click('.who');
  await page.click('[data-act=go][data-v=data]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export][data-k=json]')]);
  const fp = path.resolve(__dirname, 'backup_test.json');
  await dl.saveAs(fp);
  const json = JSON.parse(require('fs').readFileSync(fp, 'utf8'));
  ok('JSON de respaldo', json.app === 'entreno-familiar' && json.people[0].sessions.length === 2 && json.people[0].measurements.length === 2 && json.people[0].cycles.length === 1, JSON.stringify([json.people[0].sessions.length, json.people[0].measurements.length]));
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export][data-k=csv-sets]')]);
  const fp2 = path.resolve(__dirname, 'sets_test.csv'); await dl2.saveAs(fp2);
  const csv = require('fs').readFileSync(fp2, 'utf8');
  ok('CSV de series', csv.includes('Press pecho sent maq') && csv.split('\n')[0].includes('Peso'), csv.split('\n').slice(0,3).join(' | '));

  await page.screenshot({ path: path.resolve(__dirname, 'shot_data.png') });
  ok('sin errores de consola', errors.length === 0, errors.join(' || '));
  console.log(results.join('\n'));
  await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error('TEST CRASH', e); process.exit(1); });
