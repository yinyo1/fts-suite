#!/usr/bin/env node
// #486 · Todo <script src="https://…"> lleva integrity + crossorigin, y la librería carga de verdad desde el CDN.
// Parte 1 (estática): barre los HTML del repo. Parte 2 (red real): abre cada página tocada en Chromium,
// deja pasar SOLO los CDN y exige que el global de la librería exista y que no haya error de integridad.
//   SHOTS_DIR=<dir> node tests/seguridad/sri-cdn.js     (capturas a 380/760/900/1280)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { execSync } = require('child_process');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('../nomina-usa/lib/t');
const RAIZ = path.resolve(__dirname, '..', '..');
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const CDN = /^https:\/\/(cdn\.sheetjs\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//;

seccion('Estática: <script src=https://…> con integrity');
const html = execSync('git ls-files "*.html"', { cwd: RAIZ }).toString().trim().split('\n');
const sin = [];
for (const f of html) {
  const s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
  for (const m of s.matchAll(/<script\b[^>]*\bsrc="(https:\/\/[^"]+)"[^>]*>/g))
    if (!/\bintegrity="sha(256|384|512)-/.test(m[0]) || !/\bcrossorigin="anonymous"/.test(m[0])) sin.push(f + ' → ' + m[1]);
}
check('ningún script externo sin integrity/crossorigin', sin.length === 0, sin);
check('no queda xlsx 0.18.5 en HTML', !html.some(f => /xlsx\/0\.18\.5/.test(fs.readFileSync(path.join(RAIZ, f), 'utf8'))));

const PAGINAS = [
  ['operaciones/carga-mo/index.html', 'XLSX'], ['seguridad/iperc/index.html', 'XLSX'], ['seguridad/index.html', 'jspdf'],
  ['operaciones/planeacion/index.html', 'html2canvas'], ['operaciones/kiosk/index.html', 'faceapi'],
  ['shared/mi-perfil/index.html', 'faceapi'], ['operaciones/incidencias/empleado/index.html', 'faceapi'], ['hatch/index.html', 'jspdf']
];
const CACHE = {};
function bajar(u) { if (!(u in CACHE)) { try { CACHE[u] = execSync('curl -sSfL --max-time 60 ' + JSON.stringify(u), { maxBuffer: 1 << 26 }); } catch (e) { CACHE[u] = null; } } return CACHE[u]; }
function servir() { return new Promise(res => { const s = http.createServer((q, r) => { const p = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

(async () => {
  const srv = await servir(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  for (const [pag, glob] of PAGINAS) {
    seccion('Red real · ' + pag);
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { try { localStorage.setItem('fts_session', JSON.stringify({ userId: 1, username: 'prueba', nombre: 'Prueba', role: 'master', modulos: ['*'], loginTime: Date.now(), lastActivity: Date.now() })); localStorage.setItem('ops_demo_mode', '1'); } catch (e) {} });
    // Los bytes del CDN los baja curl (sale por el proxy del entorno) y se le dan al navegador TAL CUAL:
    // la integridad se verifica contra el contenido REAL que sirve el CDN hoy.
    await ctx.route(/^https?:\/\//, r => { const u = r.request().url(); if (u.startsWith(base)) return r.continue();
      if (CDN.test(u)) { const b = bajar(u); return r.fulfill({ status: b ? 200 : 502, body: b || '', headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }); }
      return r.fulfill({ status: 404, body: '' }); });
    const page = await ctx.newPage(), cons = [], cdnOk = [];
    page.on('console', m => { if (m.type() === 'error') cons.push(m.text()); });
    page.on('requestfailed', q => { if (CDN.test(q.url())) cons.push('FALLO ' + q.url() + ' ' + (q.failure() || {}).errorText); });
    page.on('response', r => { if (CDN.test(r.url()) && /\.js(\?|$)/.test(r.url())) cdnOk.push(r.status()); });
    await page.goto(base + '/' + pag, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(g => !!window[g] || (g === 'jspdf' && !!(window.jspdf || window.jsPDF)), glob, { timeout: 30000 }).catch(() => {});
    const hay = await page.evaluate(g => !!window[g] || (g === 'jspdf' && !!(window.jspdf || window.jsPDF)), glob);
    check('el CDN respondió 200', cdnOk.length > 0 && cdnOk.every(s => s === 200), cdnOk.concat(cons));
    check('window.' + glob + ' existe (la integridad calzó)', hay);
    check('sin error de integridad en consola', !cons.some(t => /integrity|Subresource/i.test(t)), cons.filter(t => /integrity/i.test(t)));
    if (glob === 'XLSX') check('XLSX.version es 0.20.3', (await page.evaluate(() => XLSX.version)) === '0.20.3', await page.evaluate(() => XLSX.version));
    if (OUT) { const nom = pag.replace(/\/index\.html$/, '').replace(/\//g, '_');
      for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150); await page.screenshot({ path: path.join(OUT, nom + '-' + w + '.png') }); } }
    await ctx.close();
  }
  await browser.close(); srv.close(); fin();
})().catch(e => { console.error(e); process.exit(1); });
