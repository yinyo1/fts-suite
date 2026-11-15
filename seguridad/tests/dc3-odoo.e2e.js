// DC-3 v1.3.0 (#507 Etapa 3): trabajadores desde Odoo, sobre la app real con Chromium headless.
// Uso:  BASE=http://localhost:8765 node seguridad/tests/dc3-odoo.e2e.js <carpeta_salida>
//   Modo SIMULADO (siempre): el webhook seguridad/dc3-empleados se intercepta y un simulador
//     verifica la firma HMAC de verdad (retardos/lib/sesion.js) y contesta con empleados INVENTADOS.
//   Modo EN VIVO (si LIVE_TOKEN): sin interceptar; el token es de un usuario de prueba zz.* con
//     dc3:empleados (lo firma el TMP del issue). Busca a una persona real, completa a mano lo que
//     falte con datos INVENTADOS y genera el PDF. Nada se escribe en Odoo (el webhook es de lectura).
// Todo lo que se guarda en <carpeta_salida> queda fuera del repo.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const S = require('../../retardos/lib/sesion.js');
const { espia, leerPagina } = require('./lib/dc3-pdf');

const BASE = (process.env.BASE || 'http://localhost:8765').replace(/\/$/, '');
const OUT = path.resolve(process.argv[2] || 'dc3-odoo-salida');
const LIVE = process.env.LIVE_TOKEN || '';
const LIVE_Q = process.env.LIVE_Q || 'ramiro';
fs.mkdirSync(OUT, { recursive: true });
const R = []; let sec = '';
function check(n, ok, d) { R.push({ sec, n, ok: !!ok }); console.log((ok ? 'OK   ' : 'FALLA ') + '[' + sec + '] ' + n + (d ? '  → ' + String(d).slice(0, 220) : '')); }
const CURP_RE_TXT = /[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d/;

// ── Simulador del webhook (empleados inventados; CURP con XXX) ──
const SECRETO = 'solo-para-la-prueba-' + 'x'.repeat(30);
const EMP = [
  { id: 9001, nombre: 'Laura Patricia Gómez Treviño', ap: 'GOMEZ', am: 'TREVIÑO', nom: 'LAURA PATRICIA', curp: 'GOTL900215MNLXXX04', puesto: 'Segurista' },
  { id: 9002, nombre: 'Rodrigo Villarreal Ochoa', ap: 'VILLARREAL', am: 'OCHOA', nom: 'RODRIGO', curp: 'VIOR880702HNLXXX09', puesto: 'Técnico Electromecánico' },
  { id: 9003, nombre: 'Martín Elizondo Cárdenas', ap: 'ELIZONDO', am: 'CARDENAS', nom: 'MARTIN', curp: '', puesto: 'Soldador' },
  { id: 9004, nombre: 'Sofía Ramírez Garza', ap: '', am: '', nom: '', curp: 'RAGS950911MNLXXX02', puesto: 'Auxiliar de Operaciones' },
  { id: 9005, nombre: 'Héctor Iván Saldívar Peña', ap: 'SALDIVAR', am: 'PEÑA', nom: 'HECTOR IVAN', curp: 'SAPH910310HNLXXX0', puesto: 'Chofer' }
];
function b64j(o) { return S._b64url(Array.from(Buffer.from(JSON.stringify(o)))); }
function token(scopes, vida) { const a = Math.floor(Date.now() / 1000); const si = b64j({ alg: 'HS256', typ: 'JWT' }) + '.' + b64j({ sub: 'zz.dc3', scopes, iat: a, exp: a + (vida || 900) }); return si + '.' + S._b64url(S._hmac(SECRETO, si)); }
function sesionSuite(tok, scopes) { return JSON.stringify({ token: tok, actor: 'zz.dc3', nombre: 'ZZ DC3', empleado_id: null, scopes, exp: Math.floor(Date.now() / 1000) + 900 }); }
function simulador(modo, log) {
  const vistos = new Set();
  return async route => {
    if (modo === 'cae') { log.push('intento'); return route.abort('connectionfailed'); }
    if (modo === 'tropiezo' && !log.includes('tropezo')) { log.push('tropezo'); return route.abort('connectionfailed'); }
    if (modo === 'lento') { await new Promise(r => setTimeout(r, 9500)); return route.abort('timedout'); }
    if (modo === 'error') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"FALLO_RESPUESTA"}' });
    const b = JSON.parse(route.request().postData() || '{}'); log.push(b);
    const resp = (code, o) => route.fulfill({ status: code, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(o) });
    if (modo === 'expira') return resp(401, { ok: false, error: 'TOKEN_EXPIRADO' });
    const v = S.verificarJWT(String(b.token || ''), SECRETO, b.datos && b.datos.accion === 'faltantes' ? 'rh:read' : 'dc3:empleados');
    if (!v.ok) return resp(401, { ok: false, error: v.error });
    if (S.firmar(b.token, b.ts, b.nonce, b.datos) !== b.sig) return resp(401, { ok: false, error: 'HMAC_INVALIDO' });
    if (vistos.has(b.nonce)) return resp(401, { ok: false, error: 'NONCE_REPETIDO' }); vistos.add(b.nonce);
    const d = b.datos;
    const sa = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    if (d.accion === 'buscar') return resp(200, { ok: true, resultados: EMP.filter(e => sa(e.nombre).includes(sa(d.q))).map(e => ({ id: e.id, nombre: e.nombre, nombre_dc3: e.ap && e.nom ? [e.ap, e.am, e.nom].join(' ') : null, puesto: e.puesto, tiene_curp: !!e.curp, curp_valida: /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(e.curp), nombre_separado: !!(e.ap && e.nom) })) });
    if (d.accion === 'detalle') { const e = EMP.find(x => x.id === d.id); return e ? resp(200, { ok: true, empleado: { id: e.id, nombre: e.nombre, ap: e.ap, am: e.am, nom: e.nom, curp: e.curp, curp_valida: e.curp.length === 18, puesto: e.puesto } }) : resp(200, { ok: false, error: 'NO_ENCONTRADO' }); }
    return resp(401, { ok: false, error: 'ACCION_INVALIDA' });
  };
}

async function abrir(b, o) {
  const ctx = await b.newContext({ viewport: { width: o.w || 380, height: 820 }, acceptDownloads: true });
  await ctx.addInitScript(([s]) => { localStorage.setItem('fts_session', JSON.stringify({ userId: 'e2e', username: 'prueba.e2e', nombre: 'PRUEBA E2E', role: 'master', modulos: 'all', loginTime: Date.now(), lastActivity: Date.now() })); if (s) localStorage.setItem('fts_suite_session', s); else localStorage.removeItem('fts_suite_session'); }, [o.suite || null]);
  const log = [];
  if (o.modo) await ctx.route('**/webhook/seguridad/dc3-empleados', simulador(o.modo, log));
  // En vivo desde un origen que no es yinyo1.github.io (rama local): la petición REAL se reenvía al
  // webhook REAL con el Origin permitido; la respuesta es la del servidor, sin tocarla.
  if (!o.modo && !/yinyo1\.github\.io/.test(BASE)) await ctx.route('**/webhook/seguridad/dc3-empleados', async r => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST' } });
    const resp = await r.fetch({ headers: Object.assign({}, r.request().headers(), { origin: 'https://yinyo1.github.io' }) });
    await r.fulfill({ response: resp, headers: Object.assign({}, resp.headers(), { 'access-control-allow-origin': '*' }) });
  });
  const p = await ctx.newPage(); p.__err = []; p.on('pageerror', e => p.__err.push(e.message)); p.on('dialog', d => { p.__err.push('alerta ' + d.message()); d.dismiss(); });
  await p.goto(BASE + '/seguridad/index.html?e2e=' + Date.now()); await p.waitForTimeout(1800);
  await p.locator('[onclick="goInstPin()"]').first().click(); await p.waitForTimeout(400);
  return { p, ctx, log };
}
async function tab(p, t) { await p.locator('#s-inst .tab-row .tab', { hasText: t }).click(); await p.waitForTimeout(150); }
async function alta(p, ap, am, nom, curp) { await tab(p, 'Trabajadores'); await p.fill('#new-ap', ap); await p.fill('#new-am', am); await p.fill('#new-nom', nom); await p.fill('#new-curp', curp); await p.click('#tp-workers button.btn-p'); await p.waitForTimeout(150); }
async function elegir(p, ctx, q, quien) { const n0 = await p.evaluate(() => inst.workers.length); await p.fill('#po-q-' + ctx, q); const it = p.locator('#po-res-' + ctx + ' .po-it', { hasText: quien }); await it.first().waitFor({ timeout: 12000 }); await it.first().click(); await p.waitForFunction(n => inst.workers.length > n || /Ya estaba/.test(document.body.textContent), n0, { timeout: 12000 }).catch(() => {}); await p.waitForTimeout(300); }
async function cursos(p, ids) { await p.evaluate(ids => { inst.selCourses.clear(); ids.forEach(i => inst.selCourses.add(i)); renderCourseSelector(); renderGenSummary(); }, ids); }
async function fechas(p, a, z) { await tab(p, 'Generar DC-3'); await p.fill('#inst-fecha', a); await p.dispatchEvent('#inst-fecha', 'change'); await p.fill('#inst-fecha-fin', z); await p.dispatchEvent('#inst-fecha-fin', 'change'); }
async function soloSel(p, idx) { await p.evaluate(i => { inst.selWorkers.clear(); i.forEach(x => inst.selWorkers.add(x)); renderWorkerList(); renderGenSummary(); }, idx); }
async function generar(p, archivo) { await espia(p); const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#tp-generate button.btn-p')]); const f = path.join(OUT, archivo); await dl.saveAs(f); return { f, pags: (await p.evaluate(() => window.__pags)).map(leerPagina) }; }
async function noDescarga(p) { let h = false; const fn = () => { h = true; }; p.on('download', fn); await p.click('#tp-generate button.btn-p'); await p.waitForTimeout(1500); p.off('download', fn); return !h; }
const puestoDe = pg => { const t = pg.textos, a = t.indexOf('Puesto*'), z = t.indexOf('DATOS DE LA EMPRESA'); return t.slice(a + 1, z).join(' '); };
const png = (f, pref) => execFileSync('pdftoppm', ['-r', '100', '-png', '-f', '1', '-l', '1', f, path.join(OUT, pref)]);
async function almacen(p) {
  return p.evaluate(async () => {
    const RE = /[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d/;
    const vol = s => { let o = ''; for (let i = 0; i < s.length; i++) { const k = s.key(i); o += k + '=' + s.getItem(k) + '\n'; } return o; };
    let ls = '', ss = '', enCache = false, entradas = 0;
    try { ls = vol(localStorage); } catch (e) {} try { ss = vol(sessionStorage); } catch (e) {}
    try { for (const n of await caches.keys()) { const c = await caches.open(n); for (const rq of await c.keys()) { entradas++; const t = await (await c.match(rq)).text().catch(() => ''); if (RE.test(t) && !/jspdf|jszip/.test(rq.url)) enCache = true; } } } catch (e) {}
    return { ls: RE.test(ls), ss: RE.test(ss), enCache, entradas };
  });
}

(async () => {
  const b = await chromium.launch();

  sec = 'sin-sesion';
  { const { p, ctx } = await abrir(b, { suite: null, modo: 'ok' });
    const av = await p.textContent('#po-w .po-aviso'); const dis = await p.isDisabled('#po-q-w');
    check('sin cuenta personal: avisa cómo entrar y el buscador queda apagado', /cuenta personal/.test(av) && dis, av.trim());
    await alta(p, 'MANUAL', 'SIN', 'SESION', 'MASS900101HNLXXX01');
    await cursos(p, [1]); await fechas(p, '2026-11-20', '2026-11-20'); await soloSel(p, [0]);
    const A = await generar(p, 'S1-manual-sin-sesion.pdf');
    check('captura manual sin sesión: genera el PDF oficial, Puesto* vacío', A.pags[0].curp === 'MASS900101HNLXXX01' && puestoDe(A.pags[0]) === '', puestoDe(A.pags[0]));
    await p.screenshot({ path: path.join(OUT, 'S1-sin-sesion-380.png'), fullPage: false });
    check('sin errores de JavaScript', !p.__err.length, p.__err.join(' | ')); await ctx.close(); }

  sec = 'sin-scope';
  { const { p, ctx, log } = await abrir(b, { suite: sesionSuite(token([]), []), modo: 'ok' });
    const av = await p.textContent('#po-w .po-aviso');
    check('sesión personal sin dc3:empleados: lo dice, no llama al servidor y se captura a mano', /no tiene permiso/.test(av) && await p.isDisabled('#po-q-w') && log.length === 0, av.trim());
    await alta(p, 'MANUAL', 'SIN', 'PERMISO', 'MASP900101HNLXXX01');
    check('la captura manual sigue funcionando', await p.evaluate(() => inst.workers.length === 1));
    await ctx.close(); }

  sec = 'odoo-ok';
  { const { p, ctx, log } = await abrir(b, { suite: sesionSuite(token(['dc3:empleados']), ['dc3:empleados']), modo: 'ok' });
    check('con dc3:empleados: buscador encendido y sin aviso', !(await p.isDisabled('#po-q-w')) && (await p.textContent('#po-w .po-aviso')).trim() === '');
    await elegir(p, 'w', 'laura', 'LAURA');
    const w0 = await p.evaluate(() => inst.workers[0]);
    check('empleado de Odoo completo: nombre en orden DC-3, CURP y puesto', w0.name === 'GOMEZ TREVIÑO LAURA PATRICIA' && w0.curp === 'GOTL900215MNLXXX04' && w0.puesto === 'Segurista' && w0.fuente === 'odoo', JSON.stringify(w0));
    const buscar = log.find(x => x.datos.accion === 'buscar'), det = log.find(x => x.datos.accion === 'detalle');
    check('cada petición va firmada (token + ts + nonce + sig HMAC válida) y con nonce distinto', log.length >= 2 && log.every(x => x.token && x.sig === S.firmar(x.token, x.ts, x.nonce, x.datos)) && new Set(log.map(x => x.nonce)).size === log.length);
    check('la búsqueda pide solo nombre; la CURP llega únicamente en «detalle»', buscar && det && det.datos.id === 9001);
    await elegir(p, 'w', 'laura', 'LAURA');
    check('elegir a la misma persona dos veces no la duplica', await p.evaluate(() => inst.workers.length === 1));
    await cursos(p, [7]); await fechas(p, '2026-11-20', '2026-11-20'); await soloSel(p, [0]);
    const A = await generar(p, 'S4-odoo-completo.pdf'); png(A.f, 'S4-pdf');
    check('PDF oficial con Puesto* lleno desde Odoo, CURP en 18 casillas y 12 h en un día', puestoDe(A.pags[0]) === 'Segurista' && A.pags[0].curpN === 18 && A.pags[0].periodo === '2026-11-20 a 2026-11-20' && A.pags[0].firmas.length === 3, puestoDe(A.pags[0]));
    // sin CURP: bloquea hasta capturarla
    await tab(p, 'Generar DC-3'); await elegir(p, 'g', 'elizondo', 'ELIZONDO');
    await soloSel(p, [1]); await fechas(p, '2026-11-20', '2026-11-20');
    check('empleado sin CURP: Generar lo bloquea con el motivo', /sin CURP/.test(await p.textContent('#gen-val')) && await noDescarga(p));
    await p.screenshot({ path: path.join(OUT, 'S5-sin-curp-bloquea-380.png'), fullPage: true });
    await tab(p, 'Trabajadores'); await p.fill('.po-fix input[data-i="1"][data-k="curp"]', 'EICM850101HNLXXX07'); await p.click('.po-fix-ok[data-i="1"]');
    await fechas(p, '2026-11-20', '2026-11-20');
    const B = await generar(p, 'S5-curp-capturada.pdf');
    check('con la CURP capturada a mano ya genera, con Puesto* Soldador', B.pags[0].curp === 'EICM850101HNLXXX07' && puestoDe(B.pags[0]) === 'Soldador');
    // lote mezclado + nombre sin separar
    await tab(p, 'Impresión por Lote'); await elegir(p, 'l', 'sofia', 'Sofía'); await alta(p, 'MANUAL', 'LOTE', 'ANDREA', 'MALA900101MNLXXX01');
    await tab(p, 'Impresión por Lote'); await p.fill('#lote-ini', '2026-11-20');
    for (const wi of [0, 2, 3]) await p.locator(`#lote-mx td.lm-cel input[data-w="${wi}"][data-c="1"]`).check();
    await p.waitForTimeout(200);
    check('lote: nombre sin separar bloquea el ZIP', await p.locator('#lote-btn').isDisabled() && /con error/.test(await p.textContent('#lote-estado')));
    await tab(p, 'Trabajadores'); for (const [k, v] of [['ap', 'RAMIREZ'], ['am', 'GARZA'], ['nom', 'SOFIA']]) await p.fill(`.po-fix input[data-i="2"][data-k="${k}"]`, v); await p.click('.po-fix-ok[data-i="2"]');
    await tab(p, 'Impresión por Lote');
    await espia(p); const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#lote-btn')]);
    const zp = path.join(OUT, 'S6-lote.zip'); await dl.saveAs(zp);
    const nombres = JSON.parse(execFileSync('python3', ['-I', '-c', 'import sys,zipfile,json;print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))', zp]).toString());
    const pl = (await p.evaluate(() => window.__pags)).map(leerPagina);
    check('lote mezclado (Odoo + Odoo corregido + manual): ZIP con 3 PDF, Puesto* lleno solo los de Odoo', nombres.length === 3 && pl.map(puestoDe).join('|') === 'Segurista|Auxiliar de Operaciones|', nombres.join(',') + ' · ' + pl.map(puestoDe).join('|'));
    const al = await almacen(p);
    check('ninguna CURP en localStorage, sessionStorage ni caché', !al.ls && !al.ss && !al.enCache, JSON.stringify(al));
    check('sin errores de JavaScript', !p.__err.length, p.__err.join(' | ')); await ctx.close(); }

  for (const [modo, txt] of [['cae', 'Odoo no respondió'], ['lento', 'Odoo no respondió'], ['error', 'error']]) {
    sec = 'falla-' + modo;
    const { p, ctx } = await abrir(b, { suite: sesionSuite(token(['dc3:empleados']), ['dc3:empleados']), modo: 'ok' });
    await elegir(p, 'w', 'laura', 'LAURA'); await alta(p, 'MANUAL', 'ANTES', 'CAIDA', 'MAAC900101HNLXXX01');
    await tab(p, 'Impresión por Lote'); await p.fill('#lote-ini', '2026-11-20'); await p.locator('#lote-mx th.lm-cur input[data-c="1"]').check();
    const antes = await p.evaluate(() => ({ w: inst.workers.length, a: lote.asg.length, s: [...inst.selWorkers].join() }));
    const intentos = [];
    await ctx.unroute('**/webhook/seguridad/dc3-empleados'); await ctx.route('**/webhook/seguridad/dc3-empleados', simulador(modo, intentos));
    const t0 = Date.now(); await p.fill('#po-q-l', 'rodrigo');
    await p.waitForSelector('#tp-workers .po-caida', { timeout: 15000 }).catch(() => {});
    const seg = (Date.now() - t0) / 1000;
    const desp = await p.evaluate(() => ({ w: inst.workers.length, a: lote.asg.length, s: [...inst.selWorkers].join(), tab: document.querySelector('.tab-pane.on').id, aviso: (document.querySelector('#tp-workers .po-caida') || {}).textContent || '' }));
    check('pasa sola a captura manual con aviso claro (' + seg.toFixed(1) + ' s)', desp.tab === 'tp-workers' && new RegExp(txt).test(desp.aviso) && seg < (modo === 'lento' ? 12 : 5), desp.aviso);
    check('no se pierde lo ya elegido', antes.w === desp.w && antes.a === desp.a && antes.s === desp.s, JSON.stringify({ antes, desp }));
    if (modo === 'cae') check('si la conexión sigue caída, reintenta una sola vez y para', intentos.filter(x => x === 'intento').length === 2, intentos.length + ' intentos');
    if (modo === 'cae') await p.screenshot({ path: path.join(OUT, 'S7-n8n-caido-380.png'), fullPage: false });
    await alta(p, 'MANUAL', 'TRAS', 'CAIDA', 'MATC920303MNLXXX03');
    check('la captura manual sigue funcionando', await p.evaluate(() => inst.workers.length === 3));
    check('sin errores de JavaScript', !p.__err.length, p.__err.join(' | ')); await ctx.close();
  }

  sec = 'tropiezo';
  { const { p, ctx, log } = await abrir(b, { suite: sesionSuite(token(['dc3:empleados']), ['dc3:empleados']), modo: 'tropiezo' });
    await elegir(p, 'w', 'laura', 'LAURA');
    check('una falla de red de un instante se reintenta sola y no manda a captura manual', await p.evaluate(() => inst.workers.length === 1 && !document.querySelector('#tp-workers .po-caida')) && log.includes('tropezo'));
    await ctx.close(); }

  sec = 'token-vencido';
  { const { p, ctx } = await abrir(b, { suite: sesionSuite(token(['dc3:empleados']), ['dc3:empleados']), modo: 'expira' });
    await p.fill('#po-q-w', 'laura'); await p.waitForSelector('#tp-workers .po-info', { timeout: 10000 }).catch(() => {});
    const r = await p.evaluate(() => ({ aviso: (document.querySelector('#tp-workers .po-aviso') || {}).textContent || '', sesion: !!localStorage.getItem('fts_suite_session') }));
    check('el servidor dice TOKEN_EXPIRADO: borra la sesión personal y pide entrar de nuevo; manual disponible', /cuenta personal/.test(r.aviso) && !r.sesion, JSON.stringify(r));
    await ctx.close(); }

  if (LIVE) {
    sec = 'EN-VIVO';
    const { p, ctx } = await abrir(b, { suite: sesionSuite(LIVE, ['dc3:empleados']), modo: null });
    await p.fill('#po-q-w', LIVE_Q);
    await p.locator('#po-res-w .po-it').first().waitFor({ timeout: 15000 });
    const n = await p.locator('#po-res-w .po-it').count();
    check('webhook real: la búsqueda devuelve empleados activos (' + n + ')', n >= 1);
    await p.locator('#po-res-w .po-it').first().click();
    await p.waitForFunction(() => inst.workers.length > 0, null, { timeout: 15000 }).catch(() => {});
    const avisoVivo = await p.evaluate(() => ((document.querySelector('#tp-workers .po-aviso') || {}).textContent || '').trim());
    if (avisoVivo) console.log('aviso en vivo: ' + avisoVivo);
    const w = await p.evaluate(() => inst.workers[0] && { fuente: inst.workers[0].fuente, puesto: inst.workers[0].puesto, odoo: !!inst.workers[0].odoo_id, faltan: window.DC3_ODOO.faltan(inst.workers[0]), nombreOdoo: inst.workers[0].nombreOdoo });
    check('empleado real elegido desde Odoo (con puesto de Odoo)', w && w.fuente === 'odoo' && w.odoo && !!w.puesto, JSON.stringify({ fuente: w && w.fuente, puesto: w && w.puesto, faltan: w && w.faltan }));
    if (w.faltan.length) {
      await tab(p, 'Trabajadores');
      if (w.faltan.includes('nombre')) { const pz = w.nombreOdoo.toUpperCase().split(/\s+/); const ap = pz.length > 2 ? pz[pz.length - 2] : pz[pz.length - 1]; const am = pz.length > 2 ? pz[pz.length - 1] : ''; const nom = pz.slice(0, pz.length > 2 ? pz.length - 2 : pz.length - 1).join(' ');
        await p.fill('.po-fix input[data-i="0"][data-k="ap"]', ap); await p.fill('.po-fix input[data-i="0"][data-k="am"]', am); await p.fill('.po-fix input[data-i="0"][data-k="nom"]', nom); }
      if (w.faltan.some(k => k.startsWith('curp'))) await p.fill('.po-fix input[data-i="0"][data-k="curp"]', 'XEXX010101HNLXXX01'); // CURP INVENTADA de prueba
      await p.click('.po-fix-ok[data-i="0"]');
    }
    await cursos(p, [1]); await fechas(p, '2026-11-20', '2026-11-20'); await soloSel(p, [0]);
    const A = await generar(p, 'LIVE-empleado-real.pdf');
    check('PDF del empleado real: Puesto* desde Odoo y 3 firmas', puestoDe(A.pags[0]) === w.puesto && A.pags[0].firmas.length === 3, 'puesto=' + puestoDe(A.pags[0]));
    const al = await almacen(p);
    check('en vivo: ninguna CURP en localStorage, sessionStorage ni caché', !al.ls && !al.ss && !al.enCache, JSON.stringify(al));
    check('sin errores de JavaScript', !p.__err.length, p.__err.join(' | ')); await ctx.close();
  }

  await b.close();
  const f = R.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify(R, null, 1));
  console.log(f ? `\n${f} FALLA(S) de ${R.length}` : `\nTodas pasan (${R.length})`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
