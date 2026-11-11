#!/usr/bin/env node
// #486 · PMO manda el token de sesión de la suite (no una firma HMAC) y no trae secretos en el HTML.
// Se corre contra el ARCHIVO que se va a publicar:
//   node tests/seguridad/pmo-token.js [ruta/al/pmo.html]      (por omisión pmo/index.html)
// Hasta que se aplique el parche (docs/seguridad/PMO-VERIFICACION-SERVIDOR.md) esta prueba FALLA contra main: es a propósito.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('../nomina-usa/lib/t');
const RAIZ = path.resolve(__dirname, '..', '..');
const ARCH = path.resolve(process.argv[2] || path.join(RAIZ, 'pmo/index.html'));
const OUT = process.env.SHOTS_DIR || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
// Token FALSO armado en ejecución (encabezado y cuerpo de prueba, firma inventada): no es un secreto.
const TOKEN = [Buffer.from('{"alg":"none"}').toString('base64url'), Buffer.from('{"sub":"prueba"}').toString('base64url'), 'firma-de-prueba'].join('.');

seccion('Estático');
const src = fs.readFileSync(ARCH, 'utf8');
check('sin cadenas de 64 hex en el HTML', !/[0-9a-f]{64}/.test(src));
check('sin HMAC en el cliente', !/HMAC|signRequest|HARDCODED_SECRET/.test(src));
check('carga shared/auth-jwt.js', /<script src="\.\.\/shared\/auth-jwt\.js"><\/script>/.test(src));

(async () => {
  const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]);
    const p = u === '/pmo/index.html' ? ARCH : path.join(RAIZ, u);
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(fs.readFileSync(p)); });
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const base = 'http://127.0.0.1:' + srv.address().port, browser = await chromium.launch();
  for (const conSesion of [true, false]) {
    seccion(conSesion ? 'Con sesión de la suite' : 'Sin sesión de la suite');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(([t, con]) => {
      localStorage.setItem('fts_session', JSON.stringify({ userId: 7, username: 'prueba', nombre: 'Prueba', role: 'master', modulos: ['*'], loginTime: Date.now(), lastActivity: Date.now() }));
      localStorage.setItem('PMO_CHAT_SECRET', 'viejo');
      if (con) localStorage.setItem('fts_suite_session', JSON.stringify({ token: t, exp: Math.floor(Date.now() / 1000) + 3600, actor: 'prueba', scopes: ['pmo:write'] }));
    }, [TOKEN, conSesion]);
    const cuerpos = [], errs = [];
    await ctx.route(/^https:\/\//, r => { const u = r.request().url();
      if (/\/webhook\/pmo-(chat|direct-op)$/.test(u)) { cuerpos.push({ u, b: JSON.parse(r.request().postData() || '{}') });
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, no_commit: true, kind: 'clarify', user_message: 'ok', summary: 's' }) }); }
      return r.fulfill({ status: 404, body: '' }); });
    const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
    await page.goto(base + '/pmo/index.html'); await page.waitForTimeout(800);
    check('borra la copia vieja del secreto en localStorage', await page.evaluate(() => localStorage.getItem('PMO_CHAT_SECRET') === null));
    await page.evaluate(() => { document.getElementById('pmo-chat-fab').click(); });
    await page.fill('#pmo-chat-input', 'C1-15 a 50%'); await page.click('#pmo-chat-send'); await page.waitForTimeout(500);
    await page.evaluate(() => window.dispatchDirectOp && window.dispatchDirectOp({ type: 'set_pct', id: 'C1-15', pct: 50 }, 'pct')); await page.waitForTimeout(500);
    const chat = cuerpos.find(c => /pmo-chat$/.test(c.u)), dir = cuerpos.find(c => /direct-op$/.test(c.u));
    if (conSesion) {
      check('chat: manda message + token, sin firma ni timestamp', chat && chat.b.token === TOKEN && chat.b.message === 'C1-15 a 50%' && !('signature' in chat.b) && !('timestamp' in chat.b), chat && Object.keys(chat.b));
      check('edición directa: manda op + token, sin firma', dir && dir.b.token === TOKEN && dir.b.op && dir.b.op.id === 'C1-15' && !('signature' in dir.b), dir && Object.keys(dir.b));
    } else {
      check('chat sin sesión: NO llama al webhook y avisa', !chat && /Entra a la suite/.test(await page.evaluate(() => document.getElementById('pmo-chat-status').textContent)));
    }
    check('cero errores de JavaScript', errs.length === 0, errs.join(' | '));
    if (OUT && conSesion) for (const w of [380, 760, 900, 1280]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150); await page.screenshot({ path: path.join(OUT, 'pmo-' + w + '.png') }); }
    await ctx.close();
  }
  await browser.close(); srv.close(); fin();
})().catch(e => { console.error(e); process.exit(1); });
