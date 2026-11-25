# JulyAppGym

App de celular (PWA) para registrar entrenamientos de gimnasio, medidas corporales y progreso de varias personas de una familia (3 hoy). Cada persona tiene su perfil, rutinas, sesiones y mediciones. Los datos viven en una **hoja de Google Sheets** en el Drive del dueño; la app habla con ella a través de un pequeño script de **Google Apps Script**.

- Sin frameworks ni build: HTML + CSS + JavaScript puro. Se publica tal cual en GitHub Pages.
- Idioma de la interfaz y de los datos: español. Números con coma decimal en pantalla, punto en los datos.
- Origen: prototipo hecho en Claude Artifacts ("Entreno Familiar"); se migró aquí cambiando solo la capa de almacenamiento (`Store`).

> Instalación paso a paso: [`docs/INSTALACION.md`](docs/INSTALACION.md)

## Mapa de archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Página única. Carga `config.js`, `app.js`, `app.css` y registra el service worker. |
| `app.js` | **Toda la lógica** (un solo archivo, ~1.600 líneas, dentro de una IIFE). Está dividido por bloques con comentarios `/* ===== Nombre ===== */`: utilidades, `Store`, estado `S`, tipos de medición, gráficas SVG, vistas (inicio, entrenar, sesión, historial, rutinas/ciclos, medidas, progreso, perfil, datos), arranque. Se busca con grep por esos encabezados. |
| `app.css` | Estilos y tokens de color (claro/oscuro automático). |
| `config.js` | `scriptUrl` y `appKey` opcionales (ver seguridad). |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: instalable y abre sin red con la caché local. |
| `apps-script/Code.gs` | El puente con la hoja. Se pega en Apps Script (no se ejecuta desde GitHub). |
| `seed/julian_inicial.json` | Respaldo con el perfil de Julián, su programa, 27 ejercicios y el Ciclo 1 (3 días). Se carga con *Datos y respaldo > Importar*. |
| `tests/` | `dev-server.js` (sirve la app y emula el script), `gas.test.js`, `e2e-local.js`, `e2e-sheet.js`, `e2e-pwa.js`. |

## Cómo guarda los datos

```
App (celular) <-> caché local (localStorage) <-> fetch POST <-> Apps Script (Code.gs) <-> hoja "docs"
```

`Store` (en `app.js`) tiene dos modos:

- **`sheet`**: hay URL de script. Cada cambio se aplica al instante en memoria y caché local (optimista) y se mete en una **cola de envío (outbox)** persistida en localStorage; se envía en orden. Si no hay red, queda pendiente y se reintenta en el siguiente ciclo. Cada 20 s (con la app visible), al volver a la app y al recuperar conexión se hace un `pull`: baja **todos** los documentos y fusiona las diferencias (si hubo una escritura local durante el pull, descarta ese pull y repite). Solo se vuelve a dibujar si algo cambió.
- **`local`**: sin URL. Todo queda en el navegador (sirve para probar). Se muestra un aviso.

Resolución de conflictos: **gana la última escritura** de cada documento. Es suficiente porque cada persona escribe sobre sus propios documentos (`people/{pid}/…`).

La app **no sabe nada de Google**: solo del protocolo de abajo. Se puede cambiar el backend sin tocar las vistas.

### Protocolo del script (`POST` a la URL `/exec`, cuerpo JSON como `text/plain` para evitar preflight de CORS)

| Petición | Respuesta |
|---|---|
| `{action:"ping", key}` | `{ok:true, version}` |
| `{action:"all", key}` | `{ok:true, docs:[{p:"people/x/sessions/y", d:{…}}]}` |
| `{action:"set", key, path, data}` | `{ok:true}` (reemplaza el documento) |
| `{action:"del", key, path}` | `{ok:true}` |
| error | `{ok:false, error:"unauthorized"|"bad_request"|"too_large"|"server", message}` |

`too_large` y `bad_request` son fatales: la app descarta esa operación de la cola. Cualquier otro error deja la operación en la cola.

### Hoja de cálculo

- `docs`: una fila por documento. `path | coleccion | id | datos_1..datos_4 | actualizado`. El JSON se parte en trozos de 45.000 caracteres (límite de celda 50.000), máximo ~180 KB por documento. **Es la fuente de verdad: no editar a mano.**
- `Mediciones`, `Series`, `Rutinas`: vistas legibles (para Excel/Sheets) que se regeneran desde `docs` con el menú **JulyAppGym > Actualizar vistas**. Se sobrescriben cada vez. La app no las lee.

## Modelo de datos

Documentos con ruta `people/{pid}` y colecciones planas debajo. `id` de documento = último segmento de la ruta (no se repite dentro del documento).

```
people/{pid}                    {name, heightCm, gymUnit:'lb'|'kg', color, types[], createdAt}
people/{pid}/measurements/{id}  {date:'YYYY-MM-DD', values:{typeKey:number}, notes, createdAt, updatedAt}
people/{pid}/exercises/{id}     {name, group, createdAt}                    // catálogo del usuario
people/{pid}/programs/{id}      {name, goal, createdAt}
people/{pid}/cycles/{id}        {programId, name, start, end, status:'active'|'archived', createdAt,
                                 days:[{id, name, exercises:[{id, eid, name, section:'main'|'warmup',
                                   sets, reps, unit:'lb'|'kg'|'placas'|'sin', targetWeight, rest, notes, link}]}]}
people/{pid}/sessions/{id}      {date, startedAt, endedAt, status:'in_progress'|'done', cycleId, cycleName, dayId, dayName, notes,
                                 exercises:[{rid, eid, name, unit, track:'sets'|'check', section, plannedSets, plannedReps,
                                   targetWeight, rest, notes, link, done, note,
                                   sets:[{n, weight, reps, done, rpe, rir}]}]}
```

`types[]` (por persona) define las mediciones disponibles: `{key, name, group:'composicion'|'perimetros', unit, dec, better:'up'|'down'|'neutral', active}`. Hay 18 por defecto (`defaultTypes()`); se pueden agregar tipos en la app sin tocar código. `measurements.values` solo guarda las claves que se llenaron (todos los campos son opcionales).

Reglas importantes de diseño (no romperlas sin hablarlo con el dueño):

1. **El historial nunca cambia.** Una sesión guarda una *copia* del plan y de los nombres de ejercicio al iniciarse. Editar o archivar un ciclo no altera sesiones pasadas. Los ciclos se versionan creando uno nuevo (p. ej. el entrenador cambia de 3 a 4 días).
2. **Los días de la rutina son parametrizables** (3 hoy, 4 mañana): se editan en la app, no en código.
3. **Unidades**: `lb`/`kg` entran en volumen y 1RM (se convierten a la unidad de la persona). **`placas`** es el número de placa/pasador de máquinas sin peso marcado: no es convertible, no suma volumen ni 1RM, solo se compara "mismo número de placa". `sin` = sin peso.
4. **Cálculos derivados**: volumen = peso × reps; 1RM por Epley solo hasta 12 reps y siempre rotulado "ESTIMACIÓN"; tendencias por regresión lineal con ≥3 puntos y ≥14 días, rotuladas como estimación. La referencia "última vez" se deriva en memoria de las sesiones (no hay documento de caché).
5. Una celda de la hoja original como `115115130` significaba 3 series (115, 115, 130 lb). Si se importa historial, se parte según el número de series conocido de ese ejercicio.

## Respaldo, exportar e importar

*Datos y respaldo*: JSON completo (`app:'entreno-familiar'`, `version:1`; el tag se mantiene para ser compatible con respaldos del prototipo), CSV (separador `;`, coma decimal, BOM) y Excel (.xlsx, con SheetJS 0.18.5 desde cdnjs, se carga solo al exportar). La importación de JSON **fusiona por id y nunca borra**.

## Seguridad (límites reales)

- Es una app familiar de baja seguridad. El script se publica como "cualquier usuario": **quien tenga la URL `/exec` puede leer y escribir la hoja**. La clave `APP_KEY` (opcional) agrega una barrera ligera, pero si `config.js` está en un repositorio público, la URL y la clave quedarían públicas.
- Por eso **no se recomienda poner la URL en `config.js` si el repo es público**: cada celular la pega una vez en *Datos y respaldo > Conexión* y queda guardada en ese dispositivo.
- No hay contraseña por perfil: todos ven todos los perfiles.

## Desarrollo y pruebas

```bash
node tests/dev-server.js 8080     # app en http://127.0.0.1:8080 y script emulado en /exec
node tests/gas.test.js            # funciones puras de Code.gs (troceado, filas, vistas)
# E2E (necesitan playwright-core y Chrome; PW_PATH=ruta a playwright-core, opcional):
node tests/e2e-local.js           # requiere el dev-server en 8080; flujos completos en modo local
node tests/e2e-sheet.js           # dos celulares, caída de red, cola, borrado, clave
node tests/e2e-pwa.js             # service worker, manifest, apertura sin red
```

Al cambiar archivos del shell de la app, sube `CACHE` en `sw.js` si añades/renombras archivos; el service worker usa *red primero*, así que los cambios llegan en la siguiente apertura.

Al cambiar `Code.gs`: pegar en Apps Script y **crear una nueva versión del despliegue** (*Implementar > Administrar implementaciones > editar > Nueva versión*); si no, la URL sigue ejecutando el código anterior.

## Pendiente / ideas

- Cargar el historial real: mediciones de la hoja de Excel (ojo con el valor atípico 38.1 que hay que revisar con el dueño) y sesiones de gimnasio (regla de las celdas `115115130`, valores con "p" como número de placa, fechas revisadas con el dueño, ordenar por fecha y no por columna). Aún no hay importador de Excel/pegado; hoy solo importa el JSON propio.
- Sesión "en curso" abandonada: hoy se continúa o se cancela a mano.
- Autenticación real por perfil (si algún día hace falta), por ejemplo con un backend distinto de Apps Script.
