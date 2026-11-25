# Instalación de JulyAppGym

Tiempo estimado: 20–30 minutos. Necesitas: tu cuenta personal de Google (Drive), tu cuenta de GitHub y el repositorio `juliancarreno/julyappgym`.

Son tres partes: **A.** la hoja y el script (la base de datos), **B.** publicar la app en GitHub Pages, **C.** instalarla en los celulares y cargar los datos iniciales.

---

## A. La hoja de Google y el script

1. Entra a Google Drive con tu cuenta **personal** (no la de DXC) y crea una hoja de cálculo nueva. Ponle de nombre `JulyAppGym - datos`.
2. En la hoja: **Extensiones > Apps Script**. Se abre el editor.
   - Debe abrirse *desde la hoja* para que el script quede asociado a ella.
3. Borra el código que trae (`function myFunction() {…}`), abre el archivo `apps-script/Code.gs` de este proyecto, copia **todo** su contenido y pégalo. Guarda (ícono del disquete). Si quieres, ponle un nombre al proyecto (arriba a la izquierda).
4. *(Opcional, recomendado)* Clave: en el editor, engranaje **Configuración del proyecto > Propiedades del script > Agregar propiedad**. Nombre: `APP_KEY`. Valor: una clave que inventes (por ejemplo, una palabra larga). Guarda. Si lo haces, la app te pedirá esa misma clave al conectarse.
5. Publica el script: **Implementar > Nueva implementación**.
   - Tipo (engranaje): **Aplicación web**.
   - Descripción: `JulyAppGym`.
   - Ejecutar como: **Yo** (tu cuenta).
   - Quién tiene acceso: **Cualquier usuario**.
   - Pulsa **Implementar**. Google pedirá autorizar: *Revisar permisos* > elige tu cuenta > si aparece "Google no ha verificado esta app", pulsa **Configuración avanzada > Ir a (nombre del proyecto) (no seguro)** > **Permitir**. Es tu propio script, el aviso es normal.
6. Copia la **URL de la aplicación web** (termina en `/exec`). Es la "llave" de tu base de datos: guárdala en un lugar privado.
7. Prueba: pega la URL en el navegador. Debe decir `JulyAppGym OK v1.0.0`.
8. Vuelve a la hoja y recárgala (F5). Aparece el menú **JulyAppGym**. La pestaña `docs` se crea sola la primera vez que la app guarda algo.

> Si algún día cambias `Code.gs`: pega el nuevo código y, en **Implementar > Administrar implementaciones**, edita la implementación y elige **Nueva versión**. Si no, la URL sigue usando el código anterior.

---

## B. Publicar la app en GitHub Pages

En tu computador, dentro de la carpeta local del repositorio (`C:\JULIAN\DEVELOPER\july-app-gym`):

1. Verifica que estén **el contenido** del proyecto (los archivos `index.html`, `app.js`, `app.css`, `config.js`, `sw.js`, `manifest.webmanifest` y las carpetas `icons`, `apps-script`, `docs`, `seed`, `tests`, más `README.md` y `.gitignore`).
2. Sube los cambios:
   ```bash
   git add .
   git commit -m "JulyAppGym: primera versión"
   git push
   ```
3. En GitHub: repositorio **Settings > Pages**. En *Build and deployment*: Source **Deploy from a branch**, Branch **main**, carpeta **/ (root)**. Guarda.
4. Espera 1–2 minutos. La app queda en `https://juliancarreno.github.io/julyappgym/` (revisa la URL exacta que muestra Pages).
   - Pages gratis requiere que el repositorio sea **público**. En el repositorio solo está el código: **los datos no están ahí**, están en tu hoja.

> **No pongas la URL del script en `config.js` si el repositorio es público**: cualquiera podría verla. Pégala en cada celular (paso C.2).

---

## C. Instalar en los celulares y cargar datos

1. Abre `https://juliancarreno.github.io/julyappgym/` en el celular.
2. Ve a la pantalla de datos: en la pantalla inicial vacía toca **Importar un respaldo**; si ya hay un perfil, toca tu nombre arriba a la derecha y luego **Datos**. Ahí está la tarjeta **Conexión con la hoja de Google**: pega la URL `/exec` (y la clave, si pusiste `APP_KEY`) > **Probar conexión** (debe decir "Conexión correcta") > **Guardar y conectar**.
3. Instálala como app:
   - **Android (Chrome):** menú ⋮ > **Instalar app** o **Agregar a la pantalla principal**.
   - **iPhone (Safari):** botón Compartir > **Agregar a la pantalla de inicio**.
   - En iPhone, la app instalada guarda su configuración aparte de Safari: **repite el paso 2 dentro de la app instalada** (una sola vez).
4. **Datos iniciales (solo en un celular, una vez):** en la misma pantalla de datos, tarjeta *Importar respaldo*, elige el archivo `seed/julian_inicial.json` (o pega su contenido) > **Revisar importación** > **Importar**. Crea el perfil de Julián con su programa, los 27 ejercicios y el Ciclo 1 (Torso A1, Pierna A2.1, Full Body). Después abre cualquier otro celular conectado: debe aparecer lo mismo.
5. Cada persona crea su perfil (arriba a la derecha > **Agregar persona**) y registra sus sesiones.

## Ver los datos en la hoja

En la hoja: menú **JulyAppGym > Actualizar vistas**. Se generan las pestañas `Mediciones`, `Series` y `Rutinas`, legibles y listas para filtrar o descargar como Excel. No las edites: se reescriben cada vez. La pestaña `docs` es la base real; tampoco se edita a mano.

## Copias de seguridad

- Google Sheets guarda historial de versiones (**Archivo > Historial de versiones**).
- Además, en la app: **Datos y respaldo > Respaldo completo (JSON)** de vez en cuando.

## Si algo falla

| Síntoma | Qué revisar |
|---|---|
| "Sin conexión con la hoja" al abrir | URL mal copiada (debe terminar en `/exec`); el acceso de la implementación debe ser **Cualquier usuario**; si tienes `APP_KEY`, la clave debe coincidir. Usa *Probar conexión*. |
| "Clave incorrecta" | La clave de la app no coincide con `APP_KEY` del script. |
| Cambié `Code.gs` y no pasa nada | Falta **Nueva versión** de la implementación (ver arriba). |
| No veo la última versión de la app | Cierra la app por completo y ábrela dos veces; el service worker actualiza en la siguiente apertura. |
| Un celular no ve lo del otro | La app sincroniza cada ~20 s con la pantalla abierta, o al volver a ella. Revisa que ambos usen la misma URL del script. |
