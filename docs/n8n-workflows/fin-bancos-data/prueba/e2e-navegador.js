// e2e de Data Bancos (#370), evidencia del issue. NO trae datos: respuestas.json (datos reales de producción,
// capturados de las ejecuciones del webhook) vive fuera del repo, en E2E_DIR.
//   NODE_PATH=<playwright+xlsx> E2E_DIR=<dir> node e2e-navegador.js grabar|real modo 'grabar': la página real contra un relleno, graba los cuerpos que manda.
// modo 'real': la página real contra las respuestas de PRODUCCIÓN capturadas (respuestas.json), descarga y coteja.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright'); const XLSX = require('xlsx');
const MODO = process.argv[2], ROOT = path.resolve(__dirname, '..', '..', '..', '..'), D = process.env.E2E_DIR || require('os').tmpdir() + '/e2e-data-bancos';
fs.mkdirSync(D, { recursive: true });
const norm = b => { const o = Object.assign({}, b); delete o.token; return JSON.stringify(Object.keys(o).sort().reduce((a, k) => (a[k] = o[k], a), {})); };
const RESP = MODO === 'real' ? JSON.parse(fs.readFileSync(D + '/respuestas.json', 'utf8')) : {};
const CAT = [{ cid:'bbva-general-3326', banco:'BBVA', nombre:'General', masc:'…3326', mon:'MXN', n:1, periodos:['2026-08'] },
             { cid:'bbva-nomina-1293', banco:'BBVA', nombre:'Nomina', masc:'…1293', mon:'MXN', n:1, periodos:['2026-08'] },
             { cid:'bbva-usd-4211', banco:'BBVA', nombre:'USD', masc:'…4211', mon:'USD', n:1, periodos:['2026-08'] }];
const grabados = [], sinMatch = [];
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' }[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const BASE = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const ctx = await b.newContext({ acceptDownloads: true, timezoneId: 'America/Monterrey' });
  await ctx.addInitScript(() => localStorage.setItem('fts_suite_session', JSON.stringify({ token:'x.y.z', actor:'e2e', nombre:'E2E', scopes:['bancos_data:read'], exp: Math.floor(Date.now()/1000) + 3600 })));
  await ctx.route('https://primary-production-5c3c.up.railway.app/webhook/**', async route => {
    const ruta = new URL(route.request().url()).pathname.replace('/webhook/', ''), cuerpo = JSON.parse(route.request().postData());
    const k = ruta + ' ' + norm(cuerpo);
    if (MODO === 'grabar') { grabados.push({ ruta, cuerpo: JSON.parse(norm(cuerpo)) });
      const body = ruta === 'fin/bancos-data' ? { ok:true, total:1, por_moneda:[{mon:'MXN',n:1,abonos:'1',cargos:'0',neto:'1'}], catalogo:CAT, actualizado:new Date().toISOString(),
        filas:[{fecha:'2026-08-01',monto:'1.00',mon:'MXN',desc:'x',banco:'BBVA',cuenta:'General …3326',cid:'bbva-general-3326',ref:'',tipo:'abono',periodo:'2026-08',fuente:'x.pdf',sha:'a'}] }
        : cuerpo.formato === 'csv' ? { ok:true, total:1, csv:'\uFEFFFecha', por_moneda:[] } : { ok:true, total:1, cols:cuerpo.cols, filas:[], por_moneda:[] };
      return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(body) }); }
    const r = RESP[k]; if (!r) { sinMatch.push(k); return route.fulfill({ status:599, body:'{}' }); }
    return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(r) });
  });
  await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/xlsx/**', r => r.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js')) }));
  const pg = await ctx.newPage(); const err = []; pg.on('pageerror', e => err.push(e.message));
  const listo = () => pg.waitForFunction(() => /movimientos/.test(document.getElementById('count').textContent));
  const out = { pantallas: [] };
  const foto = async (paso) => out.pantallas.push({ paso, conteo: await pg.textContent('#count'), cuentas: await pg.textContent('#ctasLbl'),
    sumas: await pg.$$eval('.db-sum', s => s.map(x => x.getAttribute('data-mon') + '|' + x.querySelector('b').textContent)), filas: (await pg.$$('#tbl tbody tr')).length,
    columnas: await pg.$$eval('#tbl thead th', t => t.map(x => x.getAttribute('data-k'))), stamp: await pg.textContent('#stamp') });
  await pg.setViewportSize({ width: 1280, height: 900 });
  await pg.goto(BASE + '/finanzas/data-bancos/index.html'); await listo(); await foto('1 cargar (este año, todas)');
  await pg.fill('#fTxt', 'spei'); await pg.waitForTimeout(900); await foto('2 buscar "spei"');
  await pg.click('#btnCtas'); await pg.uncheck('#ctasMenu input[data-cid="bbva-usd-4211"]'); await pg.waitForTimeout(700); await foto('3 droplist: 2 cuentas');
  await pg.uncheck('#ctasMenu input[data-cid="bbva-nomina-1293"]'); await pg.waitForTimeout(700); await foto('4 droplist: sólo General'); await pg.click('h1');
  await pg.click('#tbl thead th[data-k="monto"]'); await pg.waitForTimeout(700); await foto('5 ordenar por Monto');
  await pg.click('#btnDots'); await pg.check('#menuCols input[data-col="ref"]'); await pg.click('h1'); await foto('6 columna Referencia');
  const [dc] = await Promise.all([pg.waitForEvent('download'), pg.click('#btnCsv')]);
  const [dx] = await Promise.all([pg.waitForEvent('download'), pg.click('#btnXlsx')]);
  if (MODO === 'real') {
    fs.copyFileSync(await dc.path(), D + '/descarga.csv'); fs.copyFileSync(await dx.path(), D + '/descarga.xlsx');
    out.csv_nombre = dc.suggestedFilename(); out.xlsx_nombre = dx.suggestedFilename();
    await pg.screenshot({ path: D + '/e2e-real-1280.png' });
  }
  out.errores = err; out.sin_match = sinMatch;
  if (MODO === 'grabar') fs.writeFileSync(D + '/pasos.json', JSON.stringify(grabados, null, 1));
  fs.writeFileSync(D + '/salida-' + MODO + '.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ modo: MODO, pedidos: grabados.length, errores: err, sin_match: sinMatch.length }));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
