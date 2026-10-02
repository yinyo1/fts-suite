#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * GATE DEL PANEL · finanzas/rentabilidad/ · issue #332 pendiente 4
 *
 *   NODE_PATH=<ruta-a-node_modules> node tests/rentabilidad/gate-panel.js [salida.json]
 *   (PW_CHROMIUM=<chromium> opcional; SHOTS_DIR=<dir> para las capturas)
 *
 * DOS ETAPAS. (1) jsdom: contrato y render, sin navegador. (2) Chromium (V1.13,
 * #332): la APARIENCIA — jsdom no calcula estilos, así que no puede decir si un
 * texto se lee. La etapa 2 abre el panel real con el sistema en MODO OSCURO
 * emulado y exige fondo claro, `color-scheme` claro, badge = version.json,
 * contraste AA (≥4.5) en cada pieza de texto, cero scroll horizontal a
 * 380/760/900/1280 y cero errores de consola. Requiere playwright.
 *
 * Carga el panel REAL en jsdom con el armazón REAL, le sirve una salida del
 * motor por un `fetch` falso, y verifica que pinte. Sin red y sin Odoo.
 *
 * Lo que este gate atrapa y una revisión a ojo no:
 *   · que el panel siga leyendo los campos que el motor manda (si el motor
 *     renombra algo, aquí truena en vez de en el celular de Esteban);
 *   · errores de consola, que en un panel son invisibles hasta que alguien
 *     abre las herramientas de desarrollo;
 *   · que la tabla tenga TANTAS filas como proyectos manda el contrato.
 *
 * Por qué se stubea `SuiteAuth` y no se prueba el login: el gate de sesión
 * decide si se PINTA la pantalla, no si se puede leer el dato — eso lo exige
 * el endpoint en el servidor. Probar aquí el login probaría el stub.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..', '..');
const SCRATCH = process.argv[2] || path.join(__dirname, 'golden-pre-extension.json');

let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) {
  console.error('✗ falta jsdom. Correr con NODE_PATH apuntando a un node_modules que lo tenga.');
  process.exit(2);
}

/* El gate acepta el sobre pelado o el golden; si le dan el golden, lo re-arma
   en forma de sobre para poder servirlo por el fetch falso. */
let j = JSON.parse(fs.readFileSync(SCRATCH, 'utf8'));
let sobre = j.datos ? j : {
  ok: true, panel: j.panel, contrato: j.contrato,
  alcance: { tipo: 'periodo', desde: null, hasta: j.leido.slice(0, 10), en: j.leido.slice(0, 10) },
  actor: null, salvedades: (j.salvedades_codigos || []).map(c => ({ codigo: c, dice: 'salvedad ' + c + ' (reconstruida por el gate desde el golden)' })),
  datos: { moneda_presentacion: j.moneda_presentacion,
           tipo_cambio: { usd_mxn: 17.6425, fecha: j.leido.slice(0, 10), fuente: j.tipo_cambio_fuente },
           resumen: j.resumen, columnas: j.columnas, filas: j.filas, detalle: null },
  _meta: j.meta
};

const html = fs.readFileSync(path.join(RAIZ, 'finanzas/rentabilidad/index.html'), 'utf8');
const shell = fs.readFileSync(path.join(RAIZ, 'shared/panel/panel-shell.js'), 'utf8');
const tabla = fs.readFileSync(path.join(RAIZ, 'shared/panel/panel-tabla.js'), 'utf8');
/* el script del panel es el último bloque inline sin src */
const inline = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)
  .map(b => b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
const scriptPanel = inline[inline.length - 1];

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://yinyo1.github.io/fts-suite/finanzas/rentabilidad/' });
const W = dom.window;

const errores = [];
W.console.error = (...a) => errores.push(a.join(' '));
W.onerror = (m) => errores.push('onerror: ' + m);

/* ── stubs mínimos ──────────────────────────────────────────────────────── */
W.SuiteAuth = {
  LLAVE: 'fts_suite_session', LLAVE_SESION: 'fts_suite_session',
  requerir: () => true,
  getToken: () => 'token-de-prueba-del-gate',
  getSession: () => ({ usuario: 'gate', nombre: 'Gate de prueba', scopes: ['rentabilidad:read'] }),
  logout: () => {}
};
let nPedidos = 0;
W.fetch = async () => { nPedidos++; return { ok: true, status: 200, json: async () => sobre }; };

/* ── correr el armazón y el panel ───────────────────────────────────────── */
let fallo = null;
try { W.eval(shell); W.eval(tabla); W.eval(scriptPanel); }
catch (e) { fallo = e; }

function asserts() {
  const D = W.document, out = [];
  const t = (nom, cond, det) => out.push({ nom, cond: !!cond, det: det || '' });

  t('el armazón cargó (window.Panel existe)', !!W.Panel);
  t('el panel montó sin excepción', !fallo, fallo ? String(fallo.message).slice(0, 120) : '');
  t('la cabecera se pintó', !!D.querySelector('header h1'));
  t('el badge de versión está en la cabecera',
    /v1\.0\d/.test((D.querySelector('header .sub') || {}).textContent || ''),
    (D.querySelector('header .sub') || {}).textContent || '(sin .sub)');
  t('el panel pidió el dato al endpoint una vez', nPedidos >= 1, 'pedidos=' + nPedidos);

  const filas = D.querySelectorAll('#tabla tbody tr');
  t('la tabla pintó una fila por proyecto', filas.length === sobre.datos.filas.length,
    filas.length + ' de ' + sobre.datos.filas.length);
  const kpis = D.querySelectorAll('#kpis .kpi');
  t('los KPIs se pintaron', kpis.length >= 4, kpis.length + ' tarjetas');
  t('el conteo de la barra se pintó', /\d+\s+de\s+\d+/.test((D.getElementById('conteo') || {}).textContent || ''),
    (D.getElementById('conteo') || {}).textContent || '');
  t('las salvedades se pintaron', (D.getElementById('salvCuerpo') || {}).innerHTML.length > 20);

  /* ── v1.01 · sólo cuando el sobre trae la extensión ────────────────────────
     Condicionales A PROPÓSITO: el gate tiene que seguir corriendo contra el
     golden del contrato 1, que no trae nada de esto. Si fueran incondicionales,
     el gate dejaría de poder medir la línea base — y la línea base es su razón
     de ser. */
  const cv = (sobre._meta && sobre._meta.contrato_version) || '1.00';
  const esV101 = cv >= '1.01';   /* NO '=== 1.01': con 1.02 el bloque se saltaba solo */
  const esV102 = cv >= '1.02';
  if (esV101) {
    const k2 = D.querySelectorAll('#kpis2 .kpi');
    t('v1.01 · la segunda fila de tarjetas se pintó', k2.length >= 4, k2.length + ' tarjetas');
    t('v1.01 · la leyenda dice los umbrales vigentes',
      /rojo/.test((D.getElementById('leyenda') || {}).textContent || '') &&
      String((D.getElementById('leyenda') || {}).textContent || '')
        .indexOf(String(sobre.datos.semaforo_umbrales.costo_adelante_pts)) >= 0,
      (D.getElementById('leyenda') || {}).textContent.slice(0, 90));
    /* La hora del dato en CST, NO el ISO en UTC. Es el hallazgo #1 de §11 y el
       que más veces se ha colado: se comprueba que NO quede una `Z` a la vista. */
    t('v1.01 · la hora del dato está en CST, no el ISO crudo',
      /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test((D.getElementById('leyenda') || {}).textContent || '') &&
      !/T\d{2}:\d{2}.*Z/.test((D.getElementById('leyenda') || {}).textContent || ''));
    /* Una celda de semáforo por fila: si la columna llega y el panel no la
       entiende, el armazón pintaría el valor crudo y nadie lo notaría. */
    const chips = D.querySelectorAll('#tabla tbody tr .chip[class*="s-"]');
    t('v1.01 · cada fila pinta su chip de semáforo',
      chips.length === D.querySelectorAll('#tabla tbody tr').length,
      chips.length + ' chips en ' + D.querySelectorAll('#tabla tbody tr').length + ' filas');
    /* Y que el filtro FILTRE: un select que no hace nada se ve igual que uno
       que sí, hasta que alguien lo usa (regla §20 #11). */
    const antes = D.querySelectorAll('#tabla tbody tr').length;
    D.getElementById('fSemaforo').value = 'rojo';
    D.getElementById('fSemaforo').onchange();
    const despues = D.querySelectorAll('#tabla tbody tr').length;
    D.getElementById('fSemaforo').value = '';
    D.getElementById('fSemaforo').onchange();
    t('v1.01 · el filtro de semáforo de verdad filtra',
      despues === sobre.datos.resumen.semaforo_rojo && despues < antes,
      despues + ' filas en rojo, esperadas ' + sobre.datos.resumen.semaforo_rojo + ' (de ' + antes + ')');
    t('v1.01 · el filtro se restauró', D.querySelectorAll('#tabla tbody tr').length === antes);
  }

  /* ── v1.02 · la etiqueta de empresa ────────────────────────────────────────
     El defecto que esto vigila no se veía: el panel decía «FTS MX» a 30 de 222
     proyectos que no lo son, y como la aritmética estaba bien, nada fallaba.
     Por eso el invariante se comprueba contra el ID, no contra el rótulo. */
  if (esV102) {
    const filas = sobre.datos.filas;
    const rotos = filas.filter(f => (f.empresa === 'FTS MX') !== (f.empresa_id === 1));
    t('v1.02 · «FTS MX» aparece si y sólo si empresa_id es 1', rotos.length === 0,
      rotos.length + ' filas con el rótulo y el id en desacuerdo');
    const sinId = filas.filter(f => f.empresa_id === null);
    t('v1.02 · un proyecto sin empresa se rotula «sin empresa», no se inventa una',
      sinId.every(f => f.empresa === 'sin empresa'), sinId.length + ' sin empresa_id');
    t('v1.02 · ninguna fila se queda sin etiqueta de empresa',
      filas.every(f => typeof f.empresa === 'string' && f.empresa.length > 0));
    /* El conteo por etiqueta tiene que cuadrar con el total: si una fila se
       cuenta dos veces o ninguna, el desglose miente y nadie lo nota. */
    const porEmp = sobre.datos.resumen.proyectos_por_empresa || {};
    const suma = Object.keys(porEmp).reduce((a, k) => a + porEmp[k], 0);
    t('v1.02 · el desglose por empresa suma el total', suma === filas.length,
      suma + ' de ' + filas.length);
    /* Subsidio simétrico: las dos lecturas existen y la deduplicación nunca
       puede dar más únicas que la suma de las dos. */
    const m = sobre._meta;
    t('v1.02 · la deduplicación del subsidio es coherente',
      m.n_lineas_subsidio_unicas <= (m.n_lineas_cross_company + m.n_lineas_empresa_ajena) &&
      m.n_lineas_subsidio_unicas >= Math.max(m.n_lineas_cross_company, m.n_lineas_empresa_ajena),
      m.n_lineas_cross_company + ' + ' + m.n_lineas_empresa_ajena + ' → ' + m.n_lineas_subsidio_unicas + ' únicas');
  }

  t('cero errores de consola', errores.length === 0, errores.slice(0, 3).join(' | '));
  return out;
}

/* `cargar()` es async y espera al fetch: el render ocurre en microtareas
   DESPUÉS de que `eval` regresa. Sin esta espera el gate se medía a sí mismo y
   reportaba «0 de 222 filas» con el panel perfectamente sano. Se ceden varios
   turnos en vez de uno fijo, y se corta en cuanto la tabla aparece. */
async function esperarRender(intentos) {
  for (let i = 0; i < intentos; i++) {
    await new Promise(r => setTimeout(r, 10));
    if (W.document.querySelectorAll('#tabla tbody tr').length > 0) return i + 1;
  }
  return null;
}

(async () => {
const turnos = await esperarRender(50);
const res = asserts();
console.log('─── Gate del panel · finanzas/rentabilidad/ ───');
console.log('   render listo tras ' + (turnos === null ? 'NUNCA (agotó 50 turnos)' : turnos + ' turno(s)'));
res.forEach(r => console.log('   ' + (r.cond ? '✓' : '✗') + ' ' + r.nom + (r.det ? ('   →  ' + r.det) : '')));
const nav = await etapaNavegador();
console.log('\n   ── etapa 2 · Chromium (apariencia) ──');
nav.forEach(r => console.log('   ' + (r.cond ? '✓' : '✗') + ' ' + r.nom + (r.det ? ('   →  ' + r.det) : '')));
res.push(...nav);
const malos = res.filter(r => !r.cond).length;
console.log('\n   ' + (res.length - malos) + '/' + res.length + ' verificaciones');
if (malos) { console.log('   ✗ ROJO'); process.exit(1); }
console.log('   ✓ verde');
})();

/* ═══ ETAPA 2 · Chromium: modo claro y contraste (V1.13, #332) ══════════════
   Mismo criterio que tests/gate-data-bancos.js: el peor caso es el sistema en
   oscuro, y "se lee" es contraste WCAG medido contra el fondo efectivo. */
async function etapaNavegador() {
  const out = [], t = (nom, cond, det) => out.push({ nom, cond: !!cond, det: det === undefined ? '' : (typeof det === 'string' ? det : JSON.stringify(det)) });
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) { t('playwright disponible para la etapa de apariencia', false, 'falta playwright en NODE_PATH'); return out; }
  const http = require('http');
  const OUT = process.env.SHOTS_DIR || require('os').tmpdir() + '/shots-rentabilidad';
  fs.mkdirSync(OUT, { recursive: true });
  const VER = JSON.parse(fs.readFileSync(path.join(RAIZ, 'finanzas', 'version.json'), 'utf8')).version;
  const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  await new Promise(r => srv.listen(0, r));
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  let modo = null;   // null | 'sesion' | 'red' | 'servidor'
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('fts_suite_session')) localStorage.setItem('fts_suite_session', JSON.stringify({ token: 'x.y.z', actor: 'gate', nombre: 'Gate de prueba', scopes: ['rentabilidad:read'], exp: Math.floor(Date.now() / 1000) + 3600 }));
  });
  await ctx.route('https://primary-production-5c3c.up.railway.app/webhook/**', route => {
    if (modo === 'red') return route.abort('failed');
    if (modo === 'sesion') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'TOKEN_EXPIRED', clase: 'sesion' }) });
    if (modo === 'servidor') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'FALLO_PRUEBA', mensaje: 'falla sembrada por el gate' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sobre) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !(modo && /status of (401|500)|ERR_FAILED|Failed to fetch/.test(m.text()))) errs.push('console: ' + m.text()); });
  const URLP = BASE + '/finanzas/rentabilidad/index.html';
  const listo = () => page.waitForFunction(() => document.querySelectorAll('#tabla tbody tr').length > 0, null, { timeout: 15000 });
  const contraste = sel => page.evaluate(sel => {
    const rgb = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const fondo = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.9) return c; } return { r: 255, g: 255, b: 255 }; };
    const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null && (e.textContent.trim() || /^(INPUT|SELECT)$/.test(e.tagName))).slice(0, 40);
    if (!els.length) return { min: 0, n: 0 };
    let min = 99;
    for (const e of els) { const a = L(rgb(getComputedStyle(e).color)), b = L(fondo(e)); const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (r < min) min = r; }
    return { min: Math.round(min * 100) / 100, n: els.length };
  }, sel);
  const AA = async (nombre, sel) => { const c = await contraste(sel); t('contraste AA (≥4.5) · ' + nombre, c.n > 0 && c.min >= 4.5, c); };
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(URLP); await listo();
    const tema = await page.evaluate(() => {
      const lum = c => { const p = c.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255; };
      return { oscuro: matchMedia('(prefers-color-scheme: dark)').matches, body: lum(getComputedStyle(document.body).backgroundColor),
        cabecera: lum(getComputedStyle(document.querySelector('header')).backgroundColor), tabla: lum(getComputedStyle(document.querySelector('.tablabox')).backgroundColor),
        esquema: getComputedStyle(document.documentElement).colorScheme };
    });
    t('sistema en modo oscuro (emulado) y aun así: fondo, cabecera y tabla claros', tema.oscuro && tema.body > 0.9 && tema.cabecera > 0.9 && tema.tabla > 0.9, tema);
    t('color-scheme: light', /light/.test(tema.esquema) && !/dark/.test(tema.esquema), tema.esquema);
    t('badge = finanzas/version.json (' + VER + ')', ((await page.textContent('#rentBadge').catch(() => '')) || '').trim() === VER, await page.textContent('#rentBadge').catch(() => '(sin badge)'));
    for (const [n, sel] of [['título', 'header h1'], ['badge', '#rentBadge'], ['subtítulo', 'header .sub'], ['quién entró', '.quien'], ['hora del jalón', 'header .jalon'],
      ['Actualizar', '#p-refresh'], ['volver a Finanzas', 'a.volver-suite'], ['KPI · número', '.kpi .n'], ['KPI · etiqueta', '.kpi .l'], ['KPI · nota', '.kpi .n2'],
      ['salvedades', 'details.salv > summary'], ['filtros', 'label.f'], ['selects', '.barra select'], ['buscador', '#fBusca'], ['conteo', '#conteo'],
      ['encabezados', '#tabla th'], ['celdas', '#tabla td'], ['proyecto (liga)', '#tabla .proj'], ['chips de estado', '#tabla .chip'], ['raya «no hay dato»', '#tabla .raya'],
      ['falta', '#tabla .falta'], ['porcentajes', '#tabla .pct-bad, #tabla .pct-warn, #tabla .pct-info'], ['pie', 'footer']]) await AA(n, sel);
    await page.$eval('details.salv', d => d.open = true); await AA('salvedades abiertas', '.salv-item'); await AA('código de salvedad', '.salv-item code');
    await page.$eval('details.salv', d => d.open = false);
    // muestras de cada chip y de los subtotales, dentro de la tabla real: la golden del contrato 1 no
    // trae semáforo ni plan equivocado, y lo que se mide es el CSS, no el dato.
    await page.evaluate(() => {
      const tb = document.querySelector('#tabla tbody');
      tb.insertAdjacentHTML('afterbegin', '<tr id="muestras"><td>' + ['c-completo', 'c-parcial', 'c-sin', 's-verde', 's-ambar', 's-rojo', 's-sin', 'c-planmal']
        .map(c => '<span class="chip ' + c + ' muestra">' + c + '</span> ').join('') + '<span class="c-techo muestra">techo</span></td></tr>' +
        '<tr class="grupo" id="muestraGrupo"><td>SUBTOTAL de muestra</td><td class="num">1,234</td></tr>');
    });
    for (const c of ['c-completo', 'c-parcial', 'c-sin', 's-verde', 's-ambar', 's-rojo', 's-sin', 'c-planmal', 'c-techo']) await AA('chip ' + c, '#muestras .' + c);
    await AA('renglón de subtotal (tr.grupo)', '#muestraGrupo td');
    await page.screenshot({ path: path.join(OUT, 'rent-chips-1280.png'), clip: { x: 0, y: 0, width: 1280, height: 900 } });
    await page.evaluate(() => { document.getElementById('muestras').remove(); document.getElementById('muestraGrupo').remove(); });
    // agrupación real del armazón: subtotales de verdad
    const g = await page.$$eval('#fGrupo option', o => o.map(x => x.value).filter(Boolean));
    if (g.length) {
      await page.selectOption('#fGrupo', g[0]); await page.waitForTimeout(200);
      t('agrupar pinta renglones de subtotal', (await page.$$('#tabla tr.grupo')).length > 0, (await page.$$('#tabla tr.grupo')).length);
      await AA('subtotales reales', '#tabla tr.grupo td');
      await page.screenshot({ path: path.join(OUT, 'rent-agrupado-1280.png') });
      await page.selectOption('#fGrupo', '');
    } else t('hay opciones de agrupación', false, g);
    await page.hover('#tabla tbody tr'); await AA('fila con el cursor encima', '#tabla tbody tr:hover td');
    // estado vacío
    await page.fill('#fBusca', 'zzzz-no-existe'); await page.dispatchEvent('#fBusca', 'input'); await page.waitForTimeout(300);
    t('estado vacío visible', /Sin proyectos con ese filtro/.test(await page.textContent('#tabla tbody')), (await page.textContent('#tabla tbody')).slice(0, 80));
    await AA('estado vacío', '#tabla tbody td');
    await page.screenshot({ path: path.join(OUT, 'rent-vacio-1280.png') });
    await page.fill('#fBusca', ''); await page.dispatchEvent('#fBusca', 'input'); await page.waitForTimeout(300);
    // cuatro anchos
    for (const w of [380, 760, 900, 1280]) {
      await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150);
      t('sin scroll horizontal de página a ' + w + ' px', !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
      await page.screenshot({ path: path.join(OUT, 'rent-' + w + '.png') });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.$eval('footer', e => e.scrollIntoView()); await page.screenshot({ path: path.join(OUT, 'rent-pie-1280.png') });
    // avisos: sesión, red, servidor
    for (const m of ['red', 'servidor', 'sesion']) {
      modo = m; await page.goto(URLP); await page.waitForTimeout(m === 'red' ? 4500 : 800);
      const cl = await page.$eval('#aviso', a => (a.querySelector('.aviso') || {}).className || '');
      t('aviso de ' + m + ' visible', new RegExp('aviso.*' + m).test(cl), cl);
      await AA('aviso de ' + m + ' · texto', '#aviso .aviso p'); await AA('aviso de ' + m + ' · título', '#aviso .aviso h3');
      await page.screenshot({ path: path.join(OUT, 'rent-aviso-' + m + '.png') });
    }
    modo = null;
  } catch (e) { t('la etapa de navegador terminó sin excepción', false, String(e.message).slice(0, 200)); }
  t('cero errores de página y consola (navegador)', errs.length === 0, errs.slice(0, 3));
  await browser.close(); srv.close();
  console.log('   capturas en ' + OUT);
  return out;
}
