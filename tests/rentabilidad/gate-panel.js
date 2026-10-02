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

  /* `:not(.grupo)` porque desde v1.03 la tabla trae también renglones de grupo:
     contar `tr` a secas mezclaba 10 cabeceras con 225 proyectos. */
  /* ── v1.03 · GRUPOS COLAPSADOS Y EN EL ORDEN DE ODOO ──────────────────────
     Esto se mide ANTES de tocar nada, porque lo que se está verificando es la
     PRIMERA pantalla: si el gate expandiera primero y preguntara después, no
     podría distinguir «abre colapsada» de «abre abierta». */
  const cat = (sobre.datos && sobre.datos.etapas) || null;
  const esV103 = ((sobre._meta && sobre._meta.contrato_version) || '1.00') >= '1.03';
  if (esV103 && cat) {
    t('v1.03 · el contrato trae el catálogo de etapas', cat.length > 0, cat.length + ' etapas');
    t('v1.03 · el catálogo viene ordenado por `sequence` (desempate por id)',
      cat.every((e, i) => i === 0 || e.secuencia === null ||
        cat[i - 1].secuencia === null ||
        e.secuencia > cat[i - 1].secuencia ||
        (e.secuencia === cat[i - 1].secuencia && e.id > cat[i - 1].id)),
      cat.map(e => e.secuencia).join(','));
    /* Los nombres son la CLAVE del agrupado (la columna `etapa` trae el nombre),
       así que dos etapas homónimas se fundirían en un grupo. Hoy no pasa; si
       algún día pasa, es mejor que truene aquí. */
    t('v1.03 · los nombres de etapa son únicos (son la clave del agrupado)',
      new Set(cat.map(e => e.nombre)).size === cat.length);

    t('v1.03 · la vista inicial abre AGRUPADA POR ETAPA',
      D.getElementById('fGrupo').value === 'etapa', D.getElementById('fGrupo').value || '(sin agrupar)');
    const gr0 = D.querySelectorAll('#tabla tbody tr.grupo');
    t('v1.03 · la vista inicial abre COLAPSADA: cero filas de proyecto',
      D.querySelectorAll('#tabla tbody tr:not(.grupo)').length === 0 && gr0.length > 0,
      gr0.length + ' grupos, ' + D.querySelectorAll('#tabla tbody tr:not(.grupo)').length + ' filas de proyecto');
    t('v1.03 · están TODAS las etapas del catálogo, también las vacías',
      gr0.length === cat.length, gr0.length + ' de ' + cat.length);
    const pint = Array.prototype.map.call(gr0, el => el.getAttribute('data-grupo'));
    t('v1.03 · los grupos salen en el orden de Odoo, no alfabético ni por monto',
      pint.join('|') === cat.map(e => e.nombre).join('|'), pint.join(' · '));
    t('v1.03 · no es el orden alfabético (si coincidiera, la prueba no probaría nada)',
      pint.join('|') !== pint.slice().sort((a, b) => a.localeCompare(b, 'es')).join('|'));
    /* Cada cabecera dice su cuenta, y la etapa vacía dice «0 proyectos» en vez
       de desaparecer — es la mitad del punto de traer el catálogo completo. */
    const txt = {};
    Array.prototype.forEach.call(gr0, el => { txt[el.getAttribute('data-grupo')] = el.textContent; });
    const malCuenta = cat.filter(e => (txt[e.nombre] || '').indexOf('· ' + e.proyectos + ' proyectos') < 0);
    t('v1.03 · cada cabecera dice su cuenta en proyectos', malCuenta.length === 0,
      malCuenta.map(e => e.nombre + ' esperaba ' + e.proyectos).join(', '));
    const vacias = cat.filter(e => e.proyectos === 0);
    t('v1.03 · una etapa vacía se ve, con «0 proyectos»',
      vacias.length > 0 && vacias.every(e => /· 0 proyectos/.test(txt[e.nombre] || '')),
      vacias.map(e => e.nombre).join(', ') || '(ninguna vacía en este sobre)');
    /* Un cero que significa «no lo miramos» tiene que decirlo: si no, se lee
       igual que «aquí no hay nadie» (§20 #18). */
    const fuera = cat.filter(e => e.excluida_por_filtro);
    t('v1.03 · la etapa fuera del universo lleva su nota, no sólo un 0',
      fuera.every(e => /fuera del universo del panel/.test(txt[e.nombre] || '')),
      fuera.map(e => e.nombre).join(', ') || '(ninguna excluida)');

    /* Alternar: abrir UNO abre sólo ése. */
    const kAbre = cat.filter(e => e.proyectos > 0)[0].nombre;
    const bot = Array.prototype.filter.call(D.querySelectorAll('#tabla .g-tog'),
      el => el.getAttribute('data-grupo') === kAbre)[0];
    t('v1.03 · la cabecera es un botón alcanzable con el tabulador',
      !!bot && bot.tagName === 'BUTTON' && bot.getAttribute('aria-expanded') === 'false');
    if (bot) {
      bot.onclick();
      const n1 = D.querySelectorAll('#tabla tbody tr:not(.grupo)').length;
      const esperado = sobre.datos.filas.filter(f => f.etapa === kAbre).length;
      t('v1.03 · abrir un grupo muestra EXACTAMENTE sus proyectos y nada más',
        n1 === esperado, n1 + ' filas, esperadas ' + esperado + ' de «' + kAbre + '»');
      const bot2 = Array.prototype.filter.call(D.querySelectorAll('#tabla .g-tog'),
        el => el.getAttribute('data-grupo') === kAbre)[0];
      t('v1.03 · el grupo abierto lo dice (aria-expanded)',
        !!bot2 && bot2.getAttribute('aria-expanded') === 'true');
      bot2.onclick();
      t('v1.03 · volver a apretar lo cierra',
        D.querySelectorAll('#tabla tbody tr:not(.grupo)').length === 0);
    }

    /* Subtotales: POR MONEDA y cuadrando con la suma de los proyectos del grupo.
       Es lo que delata el bug viejo — una sola cifra con signo de pesos sobre un
       grupo que mezcla MXN y USD. */
    const mixtas = cat.filter(e => {
      const fs = sobre.datos.filas.filter(f => f.etapa === e.nombre);
      return new Set(fs.map(f => f.moneda)).size > 1;
    });
    t('v1.03 · hay grupos con dos monedas (si no, la prueba de abajo no prueba nada)',
      mixtas.length > 0, mixtas.length + ' etapas mezclan monedas');
    const malSub = [];
    cat.forEach(e => {
      const el = Array.prototype.filter.call(D.querySelectorAll('#tabla tbody tr.grupo'),
        x => x.getAttribute('data-grupo') === e.nombre)[0];
      if (!el) return;
      /* Por `data-col`, no por posición: el colspan de la etiqueta corrió los
         índices, y una prueba que cuenta celdas se rompe sola. */
      const td = el.querySelector('[data-col="costo_real"]');
      if (!td) { malSub.push(e.nombre + ': no hay celda data-col="costo_real"'); return; }
      const fs = sobre.datos.filas.filter(f => f.etapa === e.nombre && f.estado_dato !== 'sin_presupuesto');
      const por = {};
      fs.forEach(f => { if (typeof f.costo_real === 'number') por[f.moneda] = (por[f.moneda] || 0) + f.costo_real; });
      const monedas = Object.keys(por).sort();
      if (!monedas.length) {
        if (!/—/.test(td.textContent)) malSub.push(e.nombre + ': esperaba raya, dice "' + td.textContent + '"');
        return;
      }
      /* Una cifra por moneda, con el signo de SU moneda: US$ sólo para USD. */
      if (monedas.length !== (td.textContent.match(/\$/g) || []).length)
        malSub.push(e.nombre + ': ' + monedas.length + ' monedas y ' + (td.textContent.match(/\$/g) || []).length + ' cifras');
      monedas.forEach(m => {
        const esperada = W.Panel.dinero(por[m], m);
        if (td.textContent.indexOf(esperada.replace(/<[^>]+>/g, '')) < 0)
          malSub.push(e.nombre + '/' + m + ': esperaba ' + esperada + ', dice "' + td.textContent + '"');
      });
      if (monedas.indexOf('USD') < 0 && /US\$/.test(td.textContent))
        malSub.push(e.nombre + ': dice US$ sin tener dólares');
    });
    t('v1.03 · el subtotal de cada grupo es la suma de SUS proyectos, partida por moneda',
      malSub.length === 0, malSub.slice(0, 4).join(' | '));

    /* «Expandir todo» / «Colapsar todo». */
    D.getElementById('gAbrir').onclick();
    t('v1.03 · «Expandir todo» muestra todos los proyectos',
      D.querySelectorAll('#tabla tbody tr:not(.grupo)').length === sobre.datos.filas.length,
      D.querySelectorAll('#tabla tbody tr:not(.grupo)').length + ' de ' + sobre.datos.filas.length);
    D.getElementById('gCerrar').onclick();
    t('v1.03 · «Colapsar todo» los vuelve a esconder',
      D.querySelectorAll('#tabla tbody tr:not(.grupo)').length === 0);

    /* Quitar la agrupación devuelve la lista plana de siempre, y esconde los dos
       botones: un botón que no hace nada es peor que no tenerlo. */
    D.getElementById('fGrupo').value = '';
    D.getElementById('fGrupo').onchange();
    t('v1.03 · sin agrupar vuelve la lista plana, sin cabeceras',
      D.querySelectorAll('#tabla tbody tr.grupo').length === 0 &&
      D.querySelectorAll('#tabla tbody tr:not(.grupo)').length === sobre.datos.filas.length);
    t('v1.03 · sin agrupar se esconden «expandir/colapsar todo»',
      D.getElementById('gBotones').hidden === true);

    /* Y los TOTALES GENERALES no se movieron: el agrupado es de presentación. */
    t('v1.03 · el conteo general sigue siendo el de siempre',
      /^225 de 225|^\d+ de \d+/.test((D.getElementById('conteo') || {}).textContent || '') &&
      (D.getElementById('conteo') || {}).textContent.indexOf(
        sobre.datos.filas.length + ' de ' + sobre.datos.filas.length) === 0,
      (D.getElementById('conteo') || {}).textContent);

    /* Se deja AGRUPADA Y EXPANDIDA para que las verificaciones de abajo (una
       fila por proyecto, chips, filtro) midan lo mismo que siempre. */
    D.getElementById('fGrupo').value = 'etapa';
    D.getElementById('fGrupo').onchange();
    D.getElementById('gAbrir').onclick();
  }

  const filas = D.querySelectorAll('#tabla tbody tr:not(.grupo)');
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
    const chips = D.querySelectorAll('#tabla tbody tr:not(.grupo) .chip[class*="s-"]');
    t('v1.01 · cada fila pinta su chip de semáforo',
      chips.length === D.querySelectorAll('#tabla tbody tr:not(.grupo)').length,
      chips.length + ' chips en ' + D.querySelectorAll('#tabla tbody tr:not(.grupo)').length + ' filas');
    /* Y que el filtro FILTRE: un select que no hace nada se ve igual que uno
       que sí, hasta que alguien lo usa (regla §20 #11). */
    const antes = D.querySelectorAll('#tabla tbody tr:not(.grupo)').length;
    D.getElementById('fSemaforo').value = 'rojo';
    D.getElementById('fSemaforo').onchange();
    const despues = D.querySelectorAll('#tabla tbody tr:not(.grupo)').length;
    D.getElementById('fSemaforo').value = '';
    D.getElementById('fSemaforo').onchange();
    t('v1.01 · el filtro de semáforo de verdad filtra',
      despues === sobre.datos.resumen.semaforo_rojo && despues < antes,
      despues + ' filas en rojo, esperadas ' + sobre.datos.resumen.semaforo_rojo + ' (de ' + antes + ')');
    t('v1.01 · el filtro se restauró', D.querySelectorAll('#tabla tbody tr:not(.grupo)').length === antes);
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
    /* ── v1.03 · la PRIMERA pantalla, mirada en un navegador de verdad ───────
       jsdom ya comprobó la estructura; esto comprueba que se VEA, y toma las
       capturas de los dos estados a los cuatro anchos (§20 #20). Va antes de
       todo lo demás porque en cuanto se expande o se inyectan muestras, la
       primera pantalla ya no se puede medir. */
    const catN = (sobre.datos && sobre.datos.etapas) ? sobre.datos.etapas.length : 0;
    if (catN) {
      const est0 = await page.evaluate(() => ({
        agrupa: document.getElementById('fGrupo').value,
        grupos: document.querySelectorAll('#tabla tbody tr.grupo').length,
        filas: document.querySelectorAll('#tabla tbody tr:not(.grupo)').length,
        botones: !document.getElementById('gBotones').hidden,
        primero: (document.querySelector('#tabla tbody tr.grupo .g-tog') || {}).textContent || ''
      }));
      t('v1.03 · en el navegador también abre agrupada por etapa y colapsada',
        est0.agrupa === 'etapa' && est0.grupos === catN && est0.filas === 0, est0);
      t('v1.03 · los botones de expandir/colapsar se ven cuando hay agrupación', est0.botones);
      /* La flecha es la única pista visual de que el renglón se abre: si no se
         pinta, nadie descubre que hay algo debajo. */
      t('v1.03 · la cabecera de grupo trae su flecha', /▸/.test(est0.primero), est0.primero.slice(0, 50));
      await AA('cabecera de grupo colapsada', '#tabla tbody tr.grupo .g-tog');
      await AA('cuenta de la cabecera de grupo', '#tabla tbody tr.grupo .g-cuenta');
      for (const w of [380, 760, 900, 1280]) {
        await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150);
        t('v1.03 · colapsada: sin scroll horizontal de página a ' + w + ' px',
          !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
        /* `fullPage`, no el viewport ni el elemento. El viewport a 380 px arranca
           en las tarjetas y la lista queda fuera de cuadro; y capturar `#tabla`
           como elemento sale casi en blanco, porque la tabla es más ancha que su
           contenedor con scroll y Playwright no puede pintar lo que no cabe —era
           el INSTRUMENTO recortando, no la pantalla (§20 #19). `fullPage` da lo
           que vería una persona que baja la página. */
        await page.$eval('.barra', e => e.scrollIntoView());
        await page.screenshot({ path: path.join(OUT, 'rent-etapas-colapsado-' + w + '.png') });
      }
      await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(100);
      await page.click('#gAbrir'); await page.waitForTimeout(250);
      const est1 = await page.evaluate(() => ({
        grupos: document.querySelectorAll('#tabla tbody tr.grupo').length,
        filas: document.querySelectorAll('#tabla tbody tr:not(.grupo)').length,
        abierta: /▾/.test((document.querySelector('#tabla tbody tr.grupo .g-tog') || {}).textContent || '')
      }));
      t('v1.03 · «Expandir todo» en el navegador muestra todos los proyectos',
        est1.filas === sobre.datos.filas.length && est1.grupos === catN && est1.abierta, est1);
      /* El subtotal de un grupo con dos monedas tiene que caber: es DOS cifras
         en una celda, y es justo lo que a 380 px se sale. */
      await AA('subtotal por moneda', '#tabla tbody tr.grupo td.num');
      for (const w of [380, 760, 900, 1280]) {
        await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150);
        t('v1.03 · expandida: sin scroll horizontal de página a ' + w + ' px',
          !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
        await page.$eval('.barra', e => e.scrollIntoView());
        await page.screenshot({ path: path.join(OUT, 'rent-etapas-expandido-' + w + '.png') });
      }
      await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(100);
    }
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
