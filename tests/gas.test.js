/* Prueba las funciones puras de apps-script/Code.gs (sin Google): troceado, lectura de filas y vistas. */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { ContentService: {}, SpreadsheetApp: {}, LockService: {}, PropertiesService: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('PASS ' + m); };

// troceado
const small = { a: 1 }; const parts = ctx.toChunks_(small);
ok(parts.length === 4 && parts[0] === '{"a":1}' && parts[1] === '', 'documento pequeño en un trozo');
const big = { t: 'x'.repeat(100000) }; const bp = ctx.toChunks_(big);
ok(bp.join('') === JSON.stringify(big) && bp[0].length === 45000, 'documento de 100k se reparte en trozos de 45k');
let threw = null; try { ctx.toChunks_({ t: 'y'.repeat(200000) }); } catch (e) { threw = e; }
ok(threw && threw.code === 'too_large', 'documento > 180k se rechaza con too_large');

// lectura de filas (roundtrip con trozos)
const rows = [['people/a/sessions/s1', 'people/a/sessions', 's1'].concat(bp).concat([''])].map(r => r.slice(0, 7));
const parsed = ctx.parseRows_(rows);
ok(parsed.length === 1 && parsed[0].d.t.length === 100000 && parsed[0].p === 'people/a/sessions/s1', 'parseRows_ reconstruye el JSON de varios trozos');
ok(ctx.parseRows_([['x/y', '', '', '{roto', '', '', '']]).length === 0, 'una fila dañada se ignora sin romper');
ok(ctx.parseRows_([['', '', '', '{"a":1}', '', '', '']]).length === 0, 'fila sin path se ignora');

// vistas
const docs = [
  { p: 'people/j', d: { name: 'Julián', types: [{ key: 'peso', name: 'Peso', unit: 'kg' }, { key: 'abdomen', name: 'Abdomen', unit: 'cm' }] } },
  { p: 'people/k', d: { name: 'Karla', types: [{ key: 'peso', name: 'Peso', unit: 'kg' }, { key: 'pecho', name: 'Pecho', unit: 'cm' }] } },
  { p: 'people/j/measurements/m2', d: { date: '2026-09-29', values: { peso: 81.9 }, notes: 'ayunas' } },
  { p: 'people/j/measurements/m1', d: { date: '2026-08-05', values: { peso: 83.5, abdomen: 96 } } },
  { p: 'people/k/measurements/m3', d: { date: '2026-10-01', values: { pecho: 90 } } },
  { p: 'people/j/sessions/s1', d: { date: '2026-11-25', dayName: 'TORSO A1', exercises: [{ name: 'Press pecho', unit: 'lb', sets: [{ n: 1, weight: 68, reps: 12, done: true }, { n: 2, weight: 75, reps: 12, done: false, rpe: 8 }] }] } },
  { p: 'people/j/cycles/c1', d: { name: 'Ciclo 1', status: 'active', days: [{ name: 'TORSO A1', exercises: [{ name: 'Press pecho', section: 'main', sets: 3, reps: 12, unit: 'lb', notes: '' }] }] } },
];
const v = ctx.buildViews_(docs);
ok(JSON.stringify(v.Mediciones[0]) === JSON.stringify(['Persona', 'Fecha', 'Peso (kg)', 'Abdomen (cm)', 'Pecho (cm)', 'Notas']), 'Mediciones: columnas = unión de tipos');
ok(v.Mediciones.length === 4 && v.Mediciones[1][1] === '2026-08-05' && v.Mediciones[2][1] === '2026-09-29', 'Mediciones: ordenadas por fecha');
ok(v.Mediciones[2][3] === '' && v.Mediciones[2][5] === 'ayunas', 'Mediciones: campos vacíos y notas');
ok(v.Mediciones[3][0] === 'Karla' && v.Mediciones[3][4] === 90, 'Mediciones: otra persona, otra columna');
ok(v.Series.length === 3 && v.Series[1].join('|') === 'Julián|2026-11-25|TORSO A1|Press pecho|1|68|lb|12|1||' && v.Series[2][8] === 0 && v.Series[2][9] === 8, 'Series: una fila por serie');
ok(v.Rutinas.length === 2 && v.Rutinas[1].join('|') === 'Julián|Ciclo 1|active|TORSO A1|1|Press pecho|main|3|12|lb||', 'Rutinas: una fila por ejercicio');
ok(v.Series[0].length === v.Series[1].length && v.Rutinas[0].length === v.Rutinas[1].length && v.Mediciones[0].length === v.Mediciones[1].length, 'filas rectangulares');
console.log('\n' + n + ' pruebas OK');
