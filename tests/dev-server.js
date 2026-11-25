/* Servidor de desarrollo de JulyAppGym (sin dependencias).
   Sirve la app y EMULA el script de Apps Script en /exec (mismo protocolo que apps-script/Code.gs),
   guardando los documentos en memoria. Sirve para probar sin tocar la hoja real.

   Uso:  node tests/dev-server.js [puerto]      -> http://127.0.0.1:8080
   En la app: Datos y respaldo > Conexión > URL = http://127.0.0.1:8080/exec

   Utilidades de prueba:  GET /__state (dump)   POST /__mode {"mode":"ok"|"down"|"slow"}   POST /__reset */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function start(port, opts) {
  opts = opts || {};
  const state = { docs: new Map(), mode: 'ok', calls: [], key: opts.key || '' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, body, type) => { res.writeHead(code, { 'Content-Type': type || 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(body); };
    const readBody = cb => { let b = ''; req.on('data', c => b += c); req.on('end', () => cb(b)); };
    if (u.pathname === '/__state') return send(200, JSON.stringify([...state.docs].map(([p, d]) => ({ p, d }))));
    if (u.pathname === '/__calls') return send(200, JSON.stringify(state.calls));
    if (u.pathname === '/__mode') return readBody(b => { state.mode = JSON.parse(b).mode; send(200, '{"ok":true}'); });
    if (u.pathname === '/__reset') { state.docs.clear(); state.calls.length = 0; state.mode = 'ok'; return send(200, '{"ok":true}'); }
    if (u.pathname === '/exec') {
      if (req.method !== 'POST') return send(200, 'JulyAppGym OK (emulado)', 'text/plain');
      return readBody(b => {
        const go = () => {
          if (state.mode === 'down') return send(500, 'down', 'text/plain');
          let r; try { r = JSON.parse(b); } catch (e) { return send(200, JSON.stringify({ ok: false, error: 'bad_request', message: 'JSON inválido' })); }
          state.calls.push(r.action + ' ' + (r.path || ''));
          if (state.key && r.key !== state.key) return send(200, JSON.stringify({ ok: false, error: 'unauthorized', message: 'Clave incorrecta' }));
          if (r.action === 'ping') return send(200, JSON.stringify({ ok: true, version: 'dev' }));
          if (r.action === 'all') return send(200, JSON.stringify({ ok: true, docs: [...state.docs].map(([p, d]) => ({ p, d })) }));
          if (r.action === 'set') {
            if (!/^[\w\-.~:@+]+(\/[\w\-.~:@+]+)+$/.test(r.path || '') || !r.data || typeof r.data !== 'object') return send(200, JSON.stringify({ ok: false, error: 'bad_request', message: 'Ruta o documento inválido' }));
            if (JSON.stringify(r.data).length > 180000) return send(200, JSON.stringify({ ok: false, error: 'too_large', message: 'Documento demasiado grande' }));
            state.docs.set(r.path, JSON.parse(JSON.stringify(r.data))); return send(200, '{"ok":true}');
          }
          if (r.action === 'del') { state.docs.delete(r.path); return send(200, '{"ok":true}'); }
          return send(200, JSON.stringify({ ok: false, error: 'bad_request', message: 'Acción desconocida' }));
        };
        state.mode === 'slow' ? setTimeout(go, 800) : go();
      });
    }
    let f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(404, 'no encontrado', 'text/plain');
    send(200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream');
  });
  return new Promise(ok => server.listen(port || 0, '127.0.0.1', () => ok({ server, state, port: server.address().port })));
}
module.exports = { start };
if (require.main === module) start(+process.argv[2] || 8080).then(s => console.log('JulyAppGym dev en http://127.0.0.1:' + s.port + '  (script emulado en /exec)'));
