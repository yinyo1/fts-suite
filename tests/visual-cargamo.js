// ═══ Revisión visual — Operaciones · Carga MO (la pantalla de Ulises) ═══
//
// POR QUÉ. `tests/gate-cruce-rh.js` prueba la lógica del cruce con 52 asserts, pero no
// ve la pantalla: no sabe si los dos selectores de archivo caben en la barra, si el
// panel del cruce se pinta antes o después de los avisos, ni si el aviso de "no
// cargaste el archivo de RH" aparece cuando no se cargó. Eso solo sale mirando.
//
// LO QUE ESTA PRUEBA CUBRE Y LO QUE NO. Cubre la mitad de RH: cargar el archivo que
// manda Magaly y ver el panel del cruce. NO carga un Excel de CONTPAQi — esos son
// nómina real y viven fuera del repo (`scripts/local/smoke-front-cargamo.js` los usa).
// Por eso el cruce se ejercita con la lista de RH contra una nómina vacía, que es un
// estado real y además el más ruidoso: todos salen como "RH la mandó y no aparece".
//
// CÓMO SE CORRE (el navegador YA está en el contenedor — NO correr `playwright install`):
//   npm i playwright@1.62.1
//   node tests/visual-cargamo.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const CANDIDATOS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium'
].filter(Boolean);
const EXE = CANDIDATOS.find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

const OUT = process.env.SHOTS_DIR || require('os').tmpdir() + '/shots-cargamo';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0; const fails = []; let vp = '';
function check(n, c, d) {
  if (c) { pass++; console.log('✓ [' + vp + '] ' + n); return true; }
  fails.push('[' + vp + '] ' + n + (d ? ' → ' + d : ''));
  console.log('✗ [' + vp + '] ' + n + (d ? ' → ' + d : ''));
  return false;
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function servir() {
  return new Promise(res => {
    const s = http.createServer((req, rep) => {
      const p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rep.writeHead(404); return rep.end('no'); }
      rep.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
      rep.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}
// El CDN de SheetJS y el catálogo por API de GitHub están fuera de la lista blanca del
// proxy: sus errores son del entorno, no de la página, y no deben ensuciar el veredicto.
const esDelEntorno = t => /ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED|ERR_TUNNEL|cdnjs|api\.github|raw\.githubusercontent|fonts\.g|net::ERR|Failed to fetch|XLSX is not defined/.test(t);

const VIEWPORTS = [['desktop-1440', 1440, 900], ['laptop-1280', 1280, 800], ['movil-390', 390, 844]];

// Un Excel con la FORMA de la lista de raya de CONTPAQi. No son datos reales —esos
// viven fuera del repo— pero sí la estructura que el resolver exige: la línea del
// periodo, los cinco marcadores en su orden, y la fila TOTAL GRAL.
// Se arma con nuestro propio escritor de xlsx, que produce paquetes sin comprimir y
// SheetJS los abre igual.
function archivoContpaqi() {
  const Exc = require(path.join(RAIZ, 'modulos', 'rh', 'nomina-incidencias', 'js', 'excel.js'));
  const n = v => ({ v: v, n: true });
  const filas = [
    ['CONTPAQi'],
    ['Nóminas®', 'SERVICIO FTS'],
    ['', 'Lista de Raya (forma tabular)'],
    ['', 'Periodo 36 al 36 SEMANA FTS del 28/08/2026 al 03/09/2026'],
    [],
    ['Código', 'Empleado', 'SUELDO', 'PREMIO DE ASISTENCIA Y PUNTUALIDAD', 'VACACIONES A TIEMPO',
     'BONO', 'OTRAS PERCEPCIONES', 'TOTAL PERCEPCIONES', 'OTRAS DEDUCCIONES', 'TOTAL DEDUCCIONES', 'NETO'],
    // 013 Gibrán: RH pidió 2 días de vacaciones y aquí NO vienen → se debe cazar.
    ['013', 'SOLIS CARRILLO GILBERTO GIBRAN', n(3000), n(0), n(0), n(0), n(0), n(3000), n(0), n(0), n(3000)],
    // 005 Leonel: RH le dio el premio y aquí SÍ viene → no debe generar hallazgo.
    ['005', 'CRUZ CRISTOBAL LEONEL', n(4000), n(250), n(0), n(0), n(0), n(4250), n(0), n(0), n(4250)],
    // 027 Mateo: RH lo mandó; aquí trae un BONO que RH nunca pidió → se debe cazar.
    ['027', 'SALAZAR MATEO', n(4000), n(0), n(0), n(1500), n(0), n(5500), n(0), n(0), n(5500)],
    // 099: cobra y RH no lo listó → se debe cazar.
    ['099', 'FANTASMA QUE NADIE PIDIO', n(2000), n(0), n(0), n(0), n(0), n(2000), n(0), n(0), n(2000)],
    ['', 'TOTAL GRAL', n(13000), n(250), n(0), n(1500), n(0), n(14750), n(0), n(0), n(14750)]
  ];
  return Buffer.from(Exc.libro([{ nombre: 'Hoja1', filas: filas }]));
}

// El archivo que manda RH, generado con el MISMO código que lo genera en producción.
// Escribirlo a mano aquí sería probar contra una imitación.
function archivoRH() {
  const Des = require(path.join(RAIZ, 'modulos', 'rh', 'nomina-incidencias', 'js', 'despacho.js'));
  const SEMANA = { id: 'S36/2026', desde: '2026-08-28', hasta: '2026-09-03', dias: 5 };
  const base = o => Object.assign({ id: 1, nombre: 'X', puesto: 'p', departamento: 'd',
    dias_mexico: 5, declaraciones: [], estados: [], ppa: { aplica: false } }, o);
  const personas = [
    base({ id: 62, nombre: 'Gilberto Gibran Solís Carrillo', codigo: '013', dias_mexico: 3,
           declaraciones: [{ tipo: 'vacaciones', valores: { dias: 2 } }] }),
    base({ id: 6,  nombre: 'Leonel Cruz Cristobal', codigo: '005', ppa: { aplica: true, sugerido: true } }),
    base({ id: 75, nombre: 'Mateo Salazar', codigo: '027', dias_mexico: 2,
           declaraciones: [{ tipo: 'trabajo_usa', valores: { dias: 3, so: 'SO11846' } }] })
  ];
  return Des.texto({ semana: SEMANA, personas: personas, disputas: [] },
                   { version: 2, actor: 'magaly.perez', fecha: '2026-09-04 15:00' });
}

(async () => {
  console.log('Chromium: ' + (EXE || '(default)'));
  const tmpCsv = path.join(OUT, 'rh-S36.csv');
  fs.writeFileSync(tmpCsv, archivoRH(), 'utf8');
  const tmpXls = path.join(OUT, 'contpaqi-S36.xlsx');
  fs.writeFileSync(tmpXls, archivoContpaqi());

  const srv = await servir();
  const base = 'http://127.0.0.1:' + srv.address().port + '/operaciones/carga-mo/index.html';
  const navegador = await chromium.launch(EXE ? { executablePath: EXE } : {});

  for (const [nombre, w, h] of VIEWPORTS) {
    vp = nombre;
    const ctx = await navegador.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

    // Se siembra la sesión REAL que lee la página (fts_fin_session con expires_at
    // futuro). No se stubbea la puerta: se pasa por ella.
    await page.addInitScript(() => {
      localStorage.setItem('fts_fin_session', JSON.stringify({
        token: 'prueba', user: 'finanzas',
        expires_at: new Date(Date.now() + 3600e3).toISOString()
      }));
    });
    // SheetJS viene de cdnjs y el proxy de este entorno lo bloquea: sin el, la pagina
    // no puede abrir NINGUN Excel y la prueba mediria una pantalla mutilada. Se sirve
    // la MISMA version desde node_modules y se responde la peticion del CDN con ella.
    // No se stubbea la lectura del Excel — se ejercita de verdad, con la libreria real.
    const sheetJs = path.join(RAIZ, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js');
    if (fs.existsSync(sheetJs)) {
      await page.route('**/xlsx.full.min.js', r =>
        r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(sheetJs) }));
    }
    // El catálogo se pide a la API de GitHub, también bloqueada por el proxy. Se
    // responde con el archivo del repo — el MISMO que la página leería en producción,
    // y en el mismo formato (base64 dentro de `content`), para que el camino de
    // decodificación se ejercite igual y no se salte con un atajo de prueba.
    const catPath = path.join(RAIZ, 'shared', 'operaciones', 'contpaqi_conceptos.json');
    const catRaw = fs.readFileSync(catPath);
    await page.route('**/api.github.com/**contpaqi_conceptos.json**', r =>
      r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ content: catRaw.toString('base64'), sha: 'prueba' }) }));
    await page.route('**/raw.githubusercontent.com/**contpaqi_conceptos.json**', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: catRaw }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    check('la puerta deja pasar con sesión válida',
      await page.locator('#main').isVisible());

    // ── la barra: los DOS archivos ────────────────────────────────────────
    check('la barra ofrece el archivo de CONTPAQi', await page.locator('#drop').isVisible());
    check('y el archivo de RH, en la misma barra',  await page.locator('#drop-rh').isVisible());
    const bRh = await page.locator('#drop-rh').boundingBox();
    check('el selector de RH cabe en el ancho',
      !!bRh && bRh.x >= 0 && (bRh.x + bRh.width) <= w + 1,
      bRh ? Math.round(bRh.x + bRh.width) + ' de ' + w : 'sin botón');

    // ── nómina cargada, SIN archivo de RH: la pantalla lo DICE ────────────
    // Es el assert que impide el peor mensaje posible: una validación en verde que
    // en realidad no comparó nada contra lo que RH pidió.
    await page.fill('#f-vie', '2026-08-28');
    await page.setInputFiles('#file', tmpXls);
    await page.waitForTimeout(500);
    check('el Excel de CONTPAQi se leyó', await page.locator('#c-kpi').isVisible());

    const txtVacio = await page.locator('#rh-panel').textContent();
    check('con nómina y sin archivo de RH, la pantalla avisa que no se comparó nada',
      /No se cargó el archivo de RH/.test(txtVacio), (txtVacio || '').slice(0, 70));
    check('y explica que la nómina se validó contra sí misma',
      /contra sí misma/.test(txtVacio));

    await page.screenshot({ path: path.join(OUT, nombre + '-1-sin-rh.png'), fullPage: true });

    // ── se carga el archivo de RH ─────────────────────────────────────────
    await page.setInputFiles('#file-rh', tmpCsv);
    await page.waitForTimeout(500);

    check('el nombre del archivo de RH aparece en la barra',
      /rh-S36\.csv/.test(await page.locator('#fname-rh').textContent()),
      await page.locator('#fname-rh').textContent());

    const txt = await page.locator('#rh-panel').textContent();
    check('el panel dice de qué semana es el archivo de RH', /S36\/2026/.test(txt), txt.slice(0, 80));
    check('y su versión', /v2/.test(txt), txt.slice(0, 80));
    check('cruza a las 3 personas del archivo', /3 personas/.test(txt), txt.slice(0, 120));

    // Los cuatro hallazgos que el archivo sintético provoca a propósito. Cada uno es
    // una forma real de equivocarse al capturar, y la pantalla tiene que decirlos.
    check('caza lo que RH pidió y la nómina no trae (vacaciones de 013)',
      /no refleja/.test(txt), txt.slice(0, 200));
    check('caza lo que la nómina trae y RH no pidió (bono de 027)',
      /movimiento que RH no pidió/.test(txt));
    check('caza a quien cobra sin que RH lo haya listado (099)',
      /RH no incluyó en la semana/.test(txt));
    check('y NO inventa hallazgos donde los dos coinciden (premio de 005)',
      !/CRUZ CRISTOBAL LEONEL/.test(txt) && !/005 Leonel/.test(txt), 'apareció 005');
    check('cada hallazgo dice qué hacer', /→ /.test(txt));
    check('el botón de validar se cierra cuando el cruce no cuadra',
      await page.locator('#send').isDisabled());
    check('y el botón dice POR QUE está cerrado',
      /no coincide con lo que pidió rh/i.test(await page.locator('#send').textContent()),
      await page.locator('#send').textContent());

    const bPanel = await page.locator('#rh-panel').boundingBox();
    check('el panel del cruce cabe en el ancho',
      !!bPanel && bPanel.x >= 0 && (bPanel.x + bPanel.width) <= w + 1,
      bPanel ? Math.round(bPanel.x + bPanel.width) + ' de ' + w : 'sin panel');

    // El panel del cruce va ANTES de los avisos: contesta la pregunta más cara.
    const orden = await page.evaluate(() => {
      const a = document.getElementById('rh-panel');
      const b = document.getElementById('c-msgs');
      if (!a || !b) return null;
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'antes' : 'despues';
    });
    check('el cruce se lee ANTES que los avisos del archivo', orden === 'antes', String(orden));

    await page.screenshot({ path: path.join(OUT, nombre + '-2-con-rh.png'), fullPage: true });

    const desb = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    check('la página no desborda a lo ancho', desb <= 1, desb + 'px');

    const propios = errores.filter(t => !esDelEntorno(t));
    check('cero errores de JavaScript propios', propios.length === 0, propios.slice(0, 2).join(' | '));

    await ctx.close();
  }

  await navegador.close();
  srv.close();

  console.log('\nCapturas en: ' + OUT);
  console.log('═'.repeat(64));
  if (fails.length) { console.log('FALLARON ' + fails.length + ':'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('VISUAL VERDE — ' + pass + '/' + pass + ' checks en ' + VIEWPORTS.length + ' anchos');
})();
