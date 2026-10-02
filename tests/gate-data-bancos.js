#!/usr/bin/env node
// ═══ Gate · Finanzas / Data Bancos (#370) ═══════════════════════════════════════════════════
//
// Monta la pantalla REAL (finanzas/data-bancos/index.html, con el armazón real de shared/panel/)
// en Chromium, contra un servidor FALSO que implementa el contrato de fin/bancos-data y
// fin/bancos-data-exportar sobre datos SINTÉTICOS (nada de la base real entra al repo).
// Verifica punto por punto el comportamiento aprobado en el prototipo
// (docs/bancos/prototipo-data-bancos.html) y deja capturas a 380 / 760 / 900 / 1280 px (§20 #20).
//
// CÓMO SE CORRE.  NODE_PATH=<node_modules con playwright y xlsx> node tests/gate-data-bancos.js
//   capturas en $SHOTS_DIR (por omisión <tmp>/shots-data-bancos)
//
// REGLA DE USO. Si un cambio lo rompe, se arregla el cambio — nunca el assert.

'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
let chromium, XLSX;
try { ({ chromium } = require('playwright')); XLSX = require('xlsx'); }
catch (e) { console.error('✗ Falta playwright o xlsx (NODE_PATH).'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS_DIR || require('os').tmpdir() + '/shots-data-bancos';
fs.mkdirSync(OUT, { recursive: true });
const VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'finanzas', 'version.json'), 'utf8')).version;
let pass = 0, fail = 0; const fallos = [];
function check(n, c, d) { if (c) { pass++; console.log('✓ ' + n); } else { fail++; fallos.push(n + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); console.log('✗ ' + n, d === undefined ? '' : d); } }

// ── datos sintéticos: 3 cuentas, 2 monedas, 620 movimientos ──
const CUENTAS = [
  { cid:'bbva-general-0011', banco:'BBVA', nombre:'General', masc:'…0011', mon:'MXN' },
  { cid:'bbva-nomina-0022',  banco:'BBVA', nombre:'Nomina',  masc:'…0022', mon:'MXN' },
  { cid:'bbva-usd-0033',     banco:'BBVA', nombre:'USD',     masc:'…0033', mon:'USD' }
];
const DESC = ['SPEI ENVIADO PROVEEDOR SINTÉTICO', 'SPEI RECIBIDO COBRANZA ÑANDÚ', 'COMISION MEMBRESIA', 'PAGO NOMINA TRASPASO', 'DEPOSITO EN EFECTIVO'];
const FILAS = [];
for (let i = 0; i < 620; i++) {
  const c = CUENTAS[i % 3], y = i < 300 ? 2026 : 2024, m = 1 + (i % 8), d = 1 + (i % 27);
  const signo = i % 4 === 0 ? 1 : -1, monto = (signo * (100 + (i * 37) % 9000 + (i % 100) / 100)).toFixed(2);
  FILAS.push({ fecha: `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`, monto, mon: c.mon, desc: DESC[i % 5] + ' ' + i,
    banco: c.banco, cuenta: c.nombre + ' ' + c.masc, cid: c.cid, ref: i % 3 ? String(700000 + i) : '', tipo: signo < 0 ? 'cargo' : 'abono',
    periodo: `${y}-${String(m).padStart(2,'0')}`, fuente: `BBVA_${c.nombre}_${y}-${String(m).padStart(2,'0')}.pdf`, sha: 'a'.repeat(64), ord: i });
}
const PERIODOS = [...new Set(FILAS.map(f => f.periodo))].sort();
const TIT = { fecha:'Fecha', monto:'Monto', mon:'Moneda', desc:'Descripción', banco:'Banco', cuenta:'Cuenta', ref:'Referencia', tipo:'Tipo', periodo:'Mes del estado', fuente:'Fuente (PDF)' };
const pedidos = [];
let modo403 = false;
let modoFallo = null; // 'red' (sin respuesta) o 'servidor' (500): sólo para ver los avisos en claro
function filtrar(b) {
  return FILAS.filter(f => (!b.desde || f.fecha >= b.desde) && (!b.hasta || f.fecha <= b.hasta)
    && (!Array.isArray(b.cuentas) || b.cuentas.includes(f.cid)) && (!b.tipo || f.tipo === b.tipo)
    && (!b.texto || f.desc.toLowerCase().includes(b.texto.toLowerCase()) || f.ref.toLowerCase().includes(b.texto.toLowerCase())));
}
function porMoneda(rows) {
  const o = {}; rows.forEach(f => { const x = o[f.mon] = o[f.mon] || { mon:f.mon, n:0, a:0, c:0 }; x.n++; const v = Math.round(Number(f.monto) * 100); if (v > 0) x.a += v; else x.c += v; });
  return Object.values(o).sort((a, b) => a.mon < b.mon ? -1 : 1).map(x => ({ mon:x.mon, n:x.n, abonos:(x.a/100).toFixed(2), cargos:(x.c/100).toFixed(2), neto:((x.a+x.c)/100).toFixed(2) }));
}
function ordenar(rows, k, d) {
  const v = f => k === 'monto' ? Math.abs(Number(f.monto)) : f[k === 'desc' ? 'desc' : k];
  return rows.slice().sort((a, b) => { const x = v(a), y = v(b); return x < y ? -d : x > y ? d : (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.ord - a.ord); });
}
function servidorFalso(ruta, b) {
  pedidos.push({ ruta, b });
  if (modo403) return { status:403, body:{ ok:false, error:'SCOPE_INSUFICIENTE', clase:'sesion', mensaje:'Tu cuenta no carga el permiso bancos_data:read.' } };
  const rows = filtrar(b);
  if (ruta.endsWith('/fin/bancos-data')) {
    const ord = ordenar(rows, b.sort || 'fecha', b.dir === 1 ? 1 : -1);
    return { status:200, body:{ ok:true, total:rows.length, offset:b.offset || 0, por_pagina:500, por_moneda:porMoneda(rows),
      catalogo: CUENTAS.map(c => Object.assign({ n: FILAS.filter(f => f.cid === c.cid).length, periodos: PERIODOS }, c)),
      actualizado:'2026-09-29T17:30:36.228Z', filas: ord.slice(b.offset || 0, (b.offset || 0) + 500) } };
  }
  const cols = b.cols; const ord = ordenar(rows, 'fecha', -1);
  if (b.formato === 'filas') return { status:200, body:{ ok:true, total:rows.length, por_moneda:porMoneda(rows), cols, formato:'filas', filas: ord.map(f => { const o = {}; cols.forEach(c => o[c] = f[c]); return o; }) } };
  const esc = x => { x = String(x == null ? '' : x); return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
  const csv = '\uFEFF' + [cols.map(c => esc(TIT[c])).join(','), ...ord.map(f => cols.map(c => esc(f[c])).join(','))].join('\r\n');
  return { status:200, body:{ ok:true, total:rows.length, por_moneda:porMoneda(rows), cols, formato:'csv', csv } };
}

// ── servidor estático del repo ──
const TIPOS = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ acceptDownloads: true });
  const errores = [];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  await ctx.addInitScript(e => {
    if (!localStorage.getItem('fts_suite_session')) localStorage.setItem('fts_suite_session', JSON.stringify({ token:'x.y.z', actor:'prueba', nombre:'Prueba Gate', scopes:['bancos_data:read'], exp:e }));
    localStorage.setItem('fts_fin_session', JSON.stringify({ token:'x.y.z', user:'finanzas', expires_at: new Date(Date.now() + 3600e3).toISOString() }));
  }, exp);
  await ctx.route('https://primary-production-5c3c.up.railway.app/webhook/**', async route => {
    if (modoFallo === 'red') return route.abort('failed');
    if (modoFallo === 'servidor') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok:false, error:'FALLO_PRUEBA', mensaje:'falla sembrada por el gate' }) });
    const r = servidorFalso(new URL(route.request().url()).pathname, JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
  });
  await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/xlsx/**', route =>
    route.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js')) }));
  const page = await ctx.newPage();
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  // El 403 que provoca la prueba 11 lo registra Chromium como error de recurso: ése es esperado y sólo ése.
  page.on('console', m => { if (m.type() === 'error' && !(modo403 && /status of 403/.test(m.text())) && !(modoFallo && /status of 500|ERR_FAILED|Failed to fetch/.test(m.text()))) errores.push('console: ' + m.text()); });
  // El peor caso para el modo claro: el sistema en modo OSCURO. La página tiene que salir clara igual.
  await page.emulateMedia({ colorScheme: 'dark' });
  // Contraste WCAG del texto contra su fondo efectivo (sube por los ancestros hasta un fondo opaco).
  const contraste = sel => page.evaluate(sel => {
    const rgb = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1 }; };
    const L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const fondo = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.9) return c; } return { r:255, g:255, b:255 }; };
    const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null && (e.textContent.trim() || /^(INPUT|SELECT)$/.test(e.tagName))).slice(0, 25);
    if (!els.length) return { min: 0, n: 0 };
    let min = 99;
    for (const e of els) { const a = L(rgb(getComputedStyle(e).color)), b = L(fondo(e)); const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (r < min) min = r; }
    return { min: Math.round(min * 100) / 100, n: els.length };
  }, sel);
  const AA = async (nombre, sel) => { const c = await contraste(sel); check('contraste AA (≥4.5) · ' + nombre, c.n > 0 && c.min >= 4.5, c); };
  const URLP = BASE + '/finanzas/data-bancos/index.html';
  const listo = () => page.waitForFunction(() => /movimientos/.test(document.getElementById('count').textContent));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(URLP); await listo();

  // 0 · MODO CLARO aunque el sistema esté en oscuro (V1.12)
  const tema = await page.evaluate(() => {
    const lum = c => { const p = c.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255; };
    return { prefiereOscuro: matchMedia('(prefers-color-scheme: dark)').matches, body: lum(getComputedStyle(document.body).backgroundColor),
      cabecera: lum(getComputedStyle(document.querySelector('header')).backgroundColor), tabla: lum(getComputedStyle(document.querySelector('.db-tblbox')).backgroundColor),
      esquema: getComputedStyle(document.documentElement).colorScheme, fecha: getComputedStyle(document.getElementById('fDesde')).colorScheme };
  });
  check('el sistema está en modo oscuro (emulado) y aun así: fondo, cabecera y tabla claros', tema.prefiereOscuro && tema.body > 0.9 && tema.cabecera > 0.9 && tema.tabla > 0.9, tema);
  check('color-scheme: light en la página y en el selector de fecha', /light/.test(tema.esquema) && !/dark/.test(tema.esquema) && tema.fecha === 'light', tema);
  for (const [n, s] of [['título', 'header h1'], ['quién entró', '.quien'], ['hora del jalón', '.jalon'], ['badge', '#dbBadge'], ['Actualizar', '#p-refresh'],
    ['subtítulo', '.db-sub'], ['nota de cobertura', '#cobertura'], ['etiquetas de filtros', '.db-f label'], ['campo de fecha', '#fDesde'], ['buscador', '#fTxt'],
    ['tipo', '#fTipo'], ['botón Cuentas', '#btnCtas'], ['atajos', '.db-atajo'], ['conteo', '#count'], ['CSV', '#btnCsv'], ['Excel', '#btnXlsx'], ['⋮', '#btnDots'],
    ['encabezados ordenables', 'table.db-tbl th'], ['cargos (rojo)', 'table.db-tbl td.neg'], ['abonos (verde)', 'table.db-tbl td.pos'], ['descripción', 'table.db-tbl td.desc'],
    ['celdas', 'table.db-tbl td'], ['pie por moneda', '.db-sum'], ['títulos del pie', '.db-sum b'], ['mapa de columnas', 'details.db-mapa summary'], ['pie de página', 'footer']]) await AA(n, s);
  await page.click('#btnCtas'); await AA('droplist de Cuentas', '#ctasMenu label'); await page.click('h1');
  await page.click('#btnDots'); await AA('menú ⋮', '#menuCols label'); await AA('título del menú ⋮', '#menu h4'); await page.click('h1');
  await page.hover('table.db-tbl tbody tr'); await AA('fila con el cursor encima', 'table.db-tbl tbody tr:hover td');
  const hov = await page.$eval('table.db-tbl tbody tr', tr => getComputedStyle(tr).backgroundColor);
  check('la fila con el cursor no se oscurece (#1a2129 del armazón)', !/26, 33, 41/.test(hov), hov);

  // 1 · badge y cabecera
  check('badge = finanzas/version.json (' + VER + ')', (await page.textContent('#dbBadge')).trim() === VER, await page.textContent('#dbBadge'));
  check('quién entró en la cabecera', /Prueba Gate/.test(await page.textContent('header')));
  // 2 · columnas por defecto y en orden
  const ths = async () => (await page.$$eval('#tbl thead th', t => t.map(x => x.textContent.replace(/[▲▼]/g, '').trim())));
  check('columnas por defecto: Fecha, Monto, Moneda, Descripción, Banco, Cuenta', JSON.stringify(await ths()) === JSON.stringify(['Fecha','Monto','Moneda','Descripción','Banco','Cuenta']), await ths());
  check('primer pedido: cuentas = null (todas), fecha desc', pedidos[0].b.cuentas === null && pedidos[0].b.sort === 'fecha' && pedidos[0].b.dir === -1);
  // 3 · Monto: número puro con signo y color
  const m0 = await page.$eval('#tbl tbody td.num', td => ({ t: td.textContent, c: td.className }));
  check('Monto sin símbolo de divisa y con color', !/\$|MXN|USD/.test(m0.t) && /(neg|pos)/.test(m0.c), m0);
  // 4 · droplist de cuentas
  check('droplist: "Todas (3)"', (await page.textContent('#ctasLbl')) === 'Todas (3)');
  await page.click('#btnCtas');
  await page.uncheck('#ctasMenu input[data-cid="bbva-usd-0033"]'); await listo();
  check('droplist: "2 cuentas"', (await page.textContent('#ctasLbl')) === '2 cuentas');
  check('pedido con las 2 cuentas', JSON.stringify(pedidos[pedidos.length-1].b.cuentas) === JSON.stringify(['bbva-general-0011','bbva-nomina-0022']));
  await page.uncheck('#ctasMenu input[data-cid="bbva-nomina-0022"]'); await listo();
  check('droplist: nombre si es una ("General …0011")', (await page.textContent('#ctasLbl')) === 'General …0011');
  const n0 = pedidos.length;
  await page.uncheck('#ctasMenu input[data-cid="bbva-general-0011"]');
  check('droplist: "Ninguna" y pide seleccionar', (await page.textContent('#ctasLbl')) === 'Ninguna' && /Selecciona al menos una cuenta/.test(await page.textContent('#tbl tbody')));
  check('cero cuentas: no se pregunta al servidor', pedidos.length === n0);
  check('cero cuentas: descargas deshabilitadas', await page.$eval('#btnCsv', b => b.disabled) && await page.$eval('#btnXlsx', b => b.disabled));
  await page.check('#ctasTodas'); await listo();
  check('"Todas" restaura (y vuelve a mandar null)', (await page.textContent('#ctasLbl')) === 'Todas (3)' && pedidos[pedidos.length-1].b.cuentas === null);
  await page.click('h1'); // cierra el menú
  // 5 · orden por encabezado (servidor)
  await page.click('#tbl thead th[data-k="monto"]'); await page.waitForTimeout(150);
  check('clic en Monto: sort=monto dir=1', pedidos[pedidos.length-1].b.sort === 'monto' && pedidos[pedidos.length-1].b.dir === 1);
  await page.click('#tbl thead th[data-k="monto"]'); await page.waitForTimeout(150);
  const mags = await page.$$eval('#tbl tbody td.num', t => t.map(x => Math.abs(Number(x.textContent.replace(/,/g, '')))));
  check('segundo clic: dir=-1 y magnitudes descendentes', pedidos[pedidos.length-1].b.dir === -1 && mags.every((v, i) => i === 0 || mags[i-1] >= v));
  await page.click('#tbl thead th[data-k="fecha"]'); await page.waitForTimeout(150);
  check('clic en Fecha: vuelve a fecha desc', pedidos[pedidos.length-1].b.sort === 'fecha' && pedidos[pedidos.length-1].b.dir === -1);
  // 6 · paginación de 500 + pie por moneda
  await page.click('[data-atajo="todo"]'); await listo();
  check('atajo "Todo": desde = inicio de la base', pedidos[pedidos.length-1].b.desde === PERIODOS[0] + '-01', pedidos[pedidos.length-1].b.desde);
  check('500 de 620 y aviso de que la descarga lleva todos', (await page.$$('#tbl tbody tr')).length === 500 && /620 movimientos \(mostrando 500; la descarga lleva todos\)/.test(await page.textContent('#count')));
  await page.click('#btnMas'); await page.waitForTimeout(200);
  check('"Cargar más": 620 filas', (await page.$$('#tbl tbody tr')).length === 620 && pedidos[pedidos.length-1].b.offset === 500);
  const sums = await page.$$eval('.db-sum', s => s.map(x => x.getAttribute('data-mon')));
  check('pie: una caja por moneda, sin mezclar (MXN y USD)', JSON.stringify(sums) === JSON.stringify(['MXN','USD']), sums);
  for (const w of [380, 1280]) {
    await page.setViewportSize({ width: w, height: 900 }); await page.$eval('.db-sums', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(OUT, `data-bancos-pie-${w}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  // 7 · menú ⋮ y persistencia por usuario
  await page.click('#btnDots'); await page.check('#menuCols input[data-col="ref"]'); await page.check('#menuCols input[data-col="fuente"]');
  check('⋮ agrega Referencia y Fuente', (await ths()).includes('Referencia') && (await ths()).includes('Fuente (PDF)'));
  check('la preferencia se guarda por usuario', await page.evaluate(() => !!localStorage.getItem('fts_databancos_cols_v1:prueba')));
  await page.reload(); await listo();
  check('persiste al recargar', (await ths()).includes('Referencia') && (await ths()).includes('Fuente (PDF)'));
  // 8 · descargas: nombre, BOM, columnas visibles, XLSX numérico y con fecha
  const [dc] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
  const hoy = await page.evaluate(() => window.__dataBancos.S.hasta), desde = await page.evaluate(() => window.__dataBancos.S.desde);
  check('CSV: nombre data-bancos_<desde>_<hasta>_todas.csv', dc.suggestedFilename() === `data-bancos_${desde}_${hoy}_todas.csv`, dc.suggestedFilename());
  const csvb = fs.readFileSync(await dc.path());
  check('CSV: arranca con BOM UTF-8', csvb[0] === 0xEF && csvb[1] === 0xBB && csvb[2] === 0xBF);
  const csvt = csvb.toString('utf8').replace(/^\uFEFF/, '');
  check('CSV: columnas visibles en orden, con acentos', csvt.split('\r\n')[0] === 'Fecha,Monto,Moneda,Descripción,Banco,Cuenta,Referencia,Fuente (PDF)', csvt.split('\r\n')[0]);
  const esperadas = filtrar(pedidos[pedidos.length-1].b).length;
  check('CSV: lleva TODO lo filtrado', csvt.split('\r\n').length - 1 === esperadas, [csvt.split('\r\n').length - 1, esperadas]);
  const [dx] = await Promise.all([page.waitForEvent('download'), page.click('#btnXlsx')]);
  check('XLSX: nombre', dx.suggestedFilename() === `data-bancos_${desde}_${hoy}_todas.xlsx`, dx.suggestedFilename());
  const wb = XLSX.read(fs.readFileSync(await dx.path()), { cellDates: true }); const ws = wb.Sheets[wb.SheetNames[0]];
  check('XLSX: encabezado', ws.A1.v === 'Fecha' && ws.B1.v === 'Monto' && ws.C1.v === 'Moneda');
  check('XLSX: Monto numérico', ws.B2.t === 'n', ws.B2);
  check('XLSX: Fecha como fecha', ws.A2.t === 'd' || (ws.A2.t === 'n' && /y/.test(ws.A2.z || '')), ws.A2);
  check('XLSX: Moneda en su columna', ['MXN','USD'].includes(ws.C2.v));
  check('XLSX: mismo conteo que lo filtrado', XLSX.utils.sheet_to_json(ws).length === esperadas);
  // Monto visible y Moneda oculta: la moneda entra sola a la descarga (nunca un monto sin moneda)
  await page.click('#btnDots'); await page.uncheck('#menuCols input[data-col="mon"]'); await page.click('h1');
  check('Moneda oculta: la descarga la agrega junto a Monto', JSON.stringify(await page.evaluate(() => window.__dataBancos.colsExport()).then(c => c.slice(0, 3))) === JSON.stringify(['fecha','monto','mon']));
  await page.click('#btnDots'); await page.check('#menuCols input[data-col="mon"]'); await page.uncheck('#menuCols input[data-col="ref"]'); await page.uncheck('#menuCols input[data-col="fuente"]'); await page.click('h1');
  // 9 · filtro sin filas: recuerda la cobertura
  await page.fill('#fTxt', 'zzzz-no-existe'); await page.waitForTimeout(600);
  await AA('estado vacío', '.db-empty'); await AA('estado vacío · cobertura', '.db-cta');
  await page.screenshot({ path: path.join(OUT, 'data-bancos-vacio-1280.png') });
  check('sin filas: dice la cobertura de la base', /Sin movimientos con este filtro/.test(await page.textContent('#tbl tbody')) && /General …0011: 2024-01/.test(await page.textContent('#tbl tbody')));
  check('aviso de cobertura: validados + Chase en Odoo', /validados contra su estado de cuenta/.test(await page.textContent('#cobertura')) && /Chase no vive en esta base/.test(await page.textContent('#cobertura')));
  await page.fill('#fTxt', ''); await page.waitForTimeout(600);
  // 10 · capturas a los cuatro anchos (con la fila más larga posible: todas las columnas)
  await page.click('#btnDots'); for (const k of ['ref','tipo','periodo','fuente']) await page.check('#menuCols input[data-col="' + k + '"]'); await page.click('h1');
  for (const w of [380, 760, 900, 1280]) {
    await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150);
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check('sin scroll horizontal de página a ' + w + ' px', !hscroll);
    await page.screenshot({ path: path.join(OUT, `data-bancos-${w}.png`), fullPage: false });
  }
  await page.click('#btnDots'); await page.screenshot({ path: path.join(OUT, 'data-bancos-menu-cols.png') }); await page.click('h1');
  await page.setViewportSize({ width: 380, height: 800 }); await page.click('#btnCtas'); await page.screenshot({ path: path.join(OUT, 'data-bancos-ctas-380.png') }); await page.click('h1');
  // 11 · token sin el scope → aviso de sesión que nombra el permiso
  modo403 = true; await page.click('#p-refresh'); await page.waitForTimeout(300);
  check('403: aviso nombra bancos_data:read', /bancos_data:read/.test(await page.textContent('#aviso')), await page.textContent('#aviso'));
  await AA('aviso de sesión · texto', '#aviso .aviso p'); await AA('aviso de sesión · título', '#aviso .aviso h3');
  await page.screenshot({ path: path.join(OUT, 'data-bancos-aviso-sesion.png') });
  modo403 = false;
  // El 403 borra la llave de sesión (§20 #12b); se recarga para que el init la vuelva a sembrar.
  await page.reload(); await listo();
  for (const f of ['red', 'servidor']) {
    modoFallo = f; await page.click('#p-refresh'); await page.waitForTimeout(f === 'red' ? 4000 : 400);
    const cl = await page.$eval('#aviso', a => (a.querySelector('.aviso') || {}).className || '');
    check('aviso de ' + f + ' visible', new RegExp('aviso.*' + f).test(cl), cl);
    await AA('aviso de ' + f + ' · texto', '#aviso .aviso p'); await AA('aviso de ' + f + ' · título', '#aviso .aviso h3');
    await page.screenshot({ path: path.join(OUT, 'data-bancos-aviso-' + f + '.png') });
  }
  modoFallo = null; await page.click('#p-refresh'); await listo();
  // 12 · el submenú en Finanzas
  await page.setViewportSize({ width: 1280, height: 900 });
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errores.push('pageerror(finanzas): ' + e.message));
  await p2.goto(BASE + '/finanzas/index.html'); await p2.waitForSelector('.nav-item[data-route="data-bancos"]');
  const sub = await p2.$eval('.nav-item[data-route="data-bancos"]', a => ({ cls: a.className, href: a.getAttribute('href'), prev: a.previousElementSibling && a.previousElementSibling.getAttribute('data-route') }));
  check('Finanzas: "Data Bancos" es submenú de Instrumentos de pago', /nav-sub/.test(sub.cls) && sub.href === 'data-bancos/index.html' && sub.prev === 'instrumentos-pago', sub);
  await p2.$eval('.nav-item[data-route="data-bancos"]', a => a.scrollIntoView({ block: 'center' }));
  await p2.screenshot({ path: path.join(OUT, 'finanzas-sidebar.png') });
  check('cero errores de página y consola', errores.length === 0, errores);

  await browser.close(); srv.close();
  console.log('\n─── Gate · Finanzas / Data Bancos ───\n   ' + pass + '/' + (pass + fail) + ' checks · capturas en ' + OUT);
  if (fail) { console.log('\n   FALLOS:'); fallos.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
  console.log('   ✓ verde');
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
