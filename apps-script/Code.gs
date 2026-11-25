/**
 * JulyAppGym - puente entre la app y la hoja de Google (Google Apps Script).
 *
 * Instalación: ver docs/INSTALACION.md. Este script debe crearse DESDE la hoja
 * (Extensiones > Apps Script) para que quede asociado a ella.
 *
 * Modelo: la hoja "docs" es una tabla de documentos, una fila por documento:
 *   A path (p. ej. people/abc/sessions/xyz) | B coleccion | C id | D..G datos_1..4 (JSON en trozos) | H actualizado
 * La app solo habla con doPost. Acciones: ping, all, set, del.
 * Las hojas "Mediciones", "Series" y "Rutinas" son vistas legibles que se generan a partir de "docs"
 * (menú JulyAppGym > Actualizar vistas). No las edites: se reescriben.
 *
 * Seguridad: si defines la propiedad de script APP_KEY (Configuración del proyecto > Propiedades del
 * script), todas las llamadas deben traer esa clave. Es protección ligera, pensada para uso familiar.
 */

var VERSION = '1.0.0';
var DOCS = 'docs';
var CHUNK = 45000;          // las celdas admiten 50.000 caracteres
var MAXCHUNKS = 4;          // máximo ~180 KB por documento
var COL_CHUNK0 = 4;         // columna D
var COL_UPDATED = COL_CHUNK0 + MAXCHUNKS; // columna H

function doGet() {
  return ContentService.createTextOutput('JulyAppGym OK v' + VERSION);
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    checkKey_(req.key);
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try { out = handle_(req); } finally { lock.releaseLock(); }
  } catch (err) {
    out = { ok: false, error: (err && err.code) || 'server', message: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('APP_KEY');
  if (expected && String(key || '') !== expected) {
    var e = new Error('Clave incorrecta'); e.code = 'unauthorized'; throw e;
  }
}

function fail_(code, msg) { var e = new Error(msg); e.code = code; throw e; }

function handle_(req) {
  switch (req.action) {
    case 'ping': ensureSheet_(); return { ok: true, version: VERSION };
    case 'all': return { ok: true, docs: readAll_() };
    case 'set': return setDoc_(req.path, req.data);
    case 'del': return delDoc_(req.path);
  }
  fail_('bad_request', 'Acción desconocida: ' + req.action);
}

function ensureSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DOCS);
  if (!sh) {
    sh = ss.insertSheet(DOCS);
    var head = ['path', 'coleccion', 'id'];
    for (var i = 1; i <= MAXCHUNKS; i++) head.push('datos_' + i);
    head.push('actualizado');
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, sh.getMaxRows() - 1, head.length).setNumberFormat('@'); // texto plano
  }
  return sh;
}

function validPath_(path) {
  if (typeof path !== 'string' || !/^[A-Za-z0-9_\-.~:@+]+(\/[A-Za-z0-9_\-.~:@+]+)+$/.test(path)) fail_('bad_request', 'Ruta inválida');
}

function readAll_() {
  var sh = ensureSheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var rows = sh.getRange(2, 1, n, COL_CHUNK0 - 1 + MAXCHUNKS).getValues();
  return parseRows_(rows);
}

/** Pura (testeable): filas de la hoja -> [{p, d}] */
function parseRows_(rows) {
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    var json = '';
    for (var k = 0; k < MAXCHUNKS; k++) json += (r[COL_CHUNK0 - 1 + k] || '');
    if (!json) continue;
    try { out.push({ p: String(r[0]), d: JSON.parse(json) }); } catch (e) { /* fila dañada: se ignora */ }
  }
  return out;
}

/** Pura (testeable): documento -> trozos de JSON */
function toChunks_(data) {
  var json = JSON.stringify(data);
  if (json.length > CHUNK * MAXCHUNKS) fail_('too_large', 'El documento es demasiado grande (' + json.length + ' caracteres)');
  var parts = [];
  for (var k = 0; k < MAXCHUNKS; k++) parts.push(json.substr(k * CHUNK, CHUNK));
  return parts;
}

function findRow_(sh, path) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var hit = sh.getRange(2, 1, last - 1, 1).createTextFinder(path).matchEntireCell(true).matchCase(true).findNext();
  return hit ? hit.getRow() : 0;
}

function setDoc_(path, data) {
  validPath_(path);
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail_('bad_request', 'El documento debe ser un objeto');
  var sh = ensureSheet_();
  var parts = toChunks_(data);
  var cut = path.lastIndexOf('/');
  var row = [path, path.slice(0, cut), path.slice(cut + 1)].concat(parts).concat([new Date().toISOString()]);
  var r = findRow_(sh, path);
  if (r) {
    sh.getRange(r, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  } else {
    var nr = sh.getLastRow() + 1;
    sh.getRange(nr, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  }
  return { ok: true };
}

function delDoc_(path) {
  validPath_(path);
  var sh = ensureSheet_();
  var r = findRow_(sh, path);
  if (r) sh.deleteRow(r);
  return { ok: true };
}

/* ============ Vistas legibles (para abrir en Excel / Sheets) ============ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('JulyAppGym')
    .addItem('Actualizar vistas (Mediciones, Series, Rutinas)', 'actualizarVistas')
    .addToUi();
}

function actualizarVistas() {
  var docs = readAll_();
  var views = buildViews_(docs);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Mediciones', 'Series', 'Rutinas'].forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.clear();
    var rows = views[name];
    sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
}

function byPrefix_(docs, prefix) {
  return docs.filter(function (d) { return d.p.indexOf(prefix) === 0 && d.p.indexOf('/', prefix.length) < 0; });
}

/** Pura (testeable): [{p,d}] -> {Mediciones:[[...]], Series:[[...]], Rutinas:[[...]]} */
function buildViews_(docs) {
  var people = docs.filter(function (d) { return /^people\/[^\/]+$/.test(d.p); });
  var med = [], ser = [], rut = [];
  // columnas de mediciones: unión de tipos de todas las personas, en orden de aparición
  var keys = [], names = {};
  people.forEach(function (pp) {
    (pp.d.types || []).forEach(function (t) {
      if (!names[t.key]) { names[t.key] = t.name + (t.unit ? ' (' + t.unit + ')' : ''); keys.push(t.key); }
    });
  });
  med.push(['Persona', 'Fecha'].concat(keys.map(function (k) { return names[k]; })).concat(['Notas']));
  ser.push(['Persona', 'Fecha', 'Día', 'Ejercicio', 'Serie', 'Peso', 'Unidad', 'Reps', 'Hecha', 'RPE', 'RIR']);
  rut.push(['Persona', 'Ciclo', 'Estado', 'Día', 'Orden', 'Ejercicio', 'Sección', 'Series', 'Reps', 'Unidad', 'Descanso', 'Notas']);

  people.forEach(function (pp) {
    var pid = pp.p.split('/')[1], pname = pp.d.name || pid, base = 'people/' + pid + '/';
    var ms = byPrefix_(docs, base + 'measurements/').map(function (x) { return x.d; });
    ms.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    ms.forEach(function (m) {
      med.push([pname, m.date].concat(keys.map(function (k) { var v = (m.values || {})[k]; return v == null ? '' : v; })).concat([m.notes || '']));
    });
    var ss = byPrefix_(docs, base + 'sessions/').map(function (x) { return x.d; });
    ss.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    ss.forEach(function (s) {
      (s.exercises || []).forEach(function (e) {
        (e.sets || []).forEach(function (st) {
          ser.push([pname, s.date, s.dayName || '', e.name || '', st.n, st.weight == null ? '' : st.weight, e.unit || '', st.reps == null ? '' : st.reps, st.done ? 1 : 0, st.rpe == null ? '' : st.rpe, st.rir == null ? '' : st.rir]);
        });
      });
    });
    byPrefix_(docs, base + 'cycles/').map(function (x) { return x.d; }).forEach(function (c) {
      (c.days || []).forEach(function (day) {
        (day.exercises || []).forEach(function (e, i) {
          rut.push([pname, c.name || '', c.status || '', day.name || '', i + 1, e.name || '', e.section || '', e.sets == null ? '' : e.sets, e.reps == null ? '' : e.reps, e.unit || '', e.rest == null ? '' : e.rest, e.notes || '']);
        });
      });
    });
  });
  return { Mediciones: med, Series: ser, Rutinas: rut };
}
