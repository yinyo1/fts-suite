#!/usr/bin/env node
// ═══ Capa 2 · Paridad en el navegador (A1 del plan SuiteAuth, issue #419) ═══
//
// La Capa 1 (tests/auth/matriz-paridad.js) es un MODELO: copia las condiciones
// del código y calcula qué ve cada persona. Un modelo puede estar mal copiado.
// Esta capa abre las páginas DE VERDAD en Chromium, con el repo servido en local,
// siembra la sesión de cada persona y lee el resultado del DOM (tarjeta atenuada,
// redirección, overlay, alerta). Después compara celda por celda contra la Capa 1.
// Si no coinciden, el modelo está mal — no se arregla aquí ni en producción: se
// reporta.
//
// LO QUE ESTA PRUEBA NO USA (y por qué se puede correr en cualquier lado):
//  · Ninguna contraseña real. `users-suite.json` se sirve MODIFICADO: mismos
//    usuarios, roles y árboles de módulos, pero cada `password_hash` se reemplaza
//    por el SHA-256 de una contraseña de prueba (`prueba-<usuario>`). El archivo
//    real se lee sólo para copiar roles y módulos; sus hashes no salen de memoria.
//  · Ningún secreto. `ops-config.json` se sirve como un blob NUEVO, cifrado aquí
//    mismo con la contraseña de prueba del master y con un token falso adentro.
//    El blob real nunca se pide ni se descifra.
//  · Ninguna red externa. Toda petición fuera de 127.0.0.1 se intercepta: los
//    archivos de GitHub se sirven del disco y los webhooks de n8n se contestan
//    con datos vacíos. Si algo intenta salir, se bloquea y se anota.
//  · Ningún JWT real. Las sesiones Suite son objetos sembrados con los scopes del
//    snapshot (`suite_usuarios.snapshot.json`); la firma es basura a propósito
//    porque el navegador no la verifica (la verifica el servidor, que aquí no hay).
//
// CÓMO SE CORRE (el Chromium ya está en el contenedor; NO correr `playwright install`):
//   node tests/auth/navegador-paridad.js                 # todo, con capturas
//   node tests/auth/navegador-paridad.js --sin-capturas  # sólo la grilla y P-xx
//   SALIDA=/tmp/x node tests/auth/navegador-paridad.js   # dónde dejar resultados
// Sale con 1 si una celda o una prueba P-xx falla.

'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..', '..');
const SALIDA = process.env.SALIDA || path.join(__dirname, 'linea-base');
const CAPTURAS = !process.argv.includes('--sin-capturas');
fs.mkdirSync(SALIDA, { recursive: true });

const EXE = [process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium']
  .filter(Boolean).find(x => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } });

// ── Capa 1: el modelo contra el que se compara ──
const MODELO = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'matriz-paridad.js'), '--json']).toString());
const PERSONAS = MODELO.personas;
const SNAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'suite_usuarios.snapshot.json'), 'utf8'));

// ── Fixtures sin credenciales reales ──
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const passPrueba = u => 'prueba-' + u;              // nunca es una contraseña real
const REAL = JSON.parse(fs.readFileSync(path.join(RAIZ, 'shared/users-suite.json'), 'utf8'));
const USERS_FALSO = JSON.stringify({
  ...REAL,
  users: REAL.users.map(u => ({ ...u, password_hash: sha256(passPrueba(u.username)) }))
});
const TOKEN_FALSO = 'TOKEN-DE-PRUEBA-NO-REAL';

async function blobOpsConfigFalso() {
  // Mismo formato que shared/config-sync.js (salt16 + iv12 + AES-GCM, PBKDF2-SHA256 100k),
  // cifrado con la contraseña DE PRUEBA del master.
  const wc = crypto.webcrypto.subtle;
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const km = await wc.importKey('raw', Buffer.from(passPrueba('ftsmaster')), { name: 'PBKDF2' }, false, ['deriveKey']);
  const key = await wc.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = Buffer.from(await wc.encrypt({ name: 'AES-GCM', iv }, key,
    Buffer.from(JSON.stringify({ _github_token: TOKEN_FALSO, ops_demo_mode: '1' }))));
  return JSON.stringify({ v: 1, updated: '2026-10-15T00:00:00Z', data: Buffer.concat([salt, iv, ct]).toString('base64') });
}

function sesionClasica(username) {
  const u = REAL.users.find(x => x.username === username);
  if (!u || !u.activo) return null;
  return { userId: u.id, username: u.username, nombre: u.nombre, role: u.role, modulos: u.modulos,
           loginTime: Date.now(), lastActivity: Date.now() };
}
function scopesSnap(username) {
  const u = SNAP.usuarios.find(x => x.username === username);
  if (!u || !u.activo) return null;
  return String(u.scopes || '').split(',').map(s => s.trim()).filter(Boolean);
}
function sesionSuite(username, scopesExtra) {
  const sc = scopesSnap(username);
  if (!sc) return null;
  return { token: 'prueba.' + Buffer.from(username).toString('base64') + '.firma-falsa',
           actor: username, nombre: username, empleado_id: null,
           scopes: sc.concat(scopesExtra || []), exp: Math.floor(Date.now() / 1000) + 8 * 3600,
           debe_cambiar_password: false };
}
const sesionFin = () => ({ token: 'prueba.fin.firma-falsa', user: 'finanzas',
  expires_at: new Date(Date.now() + 2 * 3600e3).toISOString(), role: null });

// ── Servidor local del repo ──
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function servir() {
  return new Promise(res => {
    const s = http.createServer((req, rep) => {
      let p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
      if (p.endsWith(path.sep)) p = path.join(p, 'index.html');
      if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rep.writeHead(404); return rep.end('no'); }
      rep.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
      rep.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

// ── Red: nada sale del contenedor ──
const RED = { bloqueadas: new Set(), webhooks: new Set(), interruptores: 0 };
function enrutar(ctx, opts) {
  opts = opts || {};
  return ctx.route('**/*', async route => {
    const req = route.request(); const u = new URL(req.url());
    if (u.hostname === '127.0.0.1') return route.continue();
    if (/interruptor/i.test(u.pathname)) RED.interruptores++;
    if (u.hostname === 'raw.githubusercontent.com' && u.pathname.includes('/yinyo1/fts-suite/main/')) {
      const rel = u.pathname.split('/yinyo1/fts-suite/main/')[1];
      if (rel === 'shared/users-suite.json') return opts.usersCaido ? route.fulfill({ status: 503, body: 'caido' }) : route.fulfill({ status: 200, contentType: 'application/json', body: USERS_FALSO });
      if (rel === 'shared/ops-config.json') return route.fulfill({ status: 200, contentType: 'application/json', body: opts.blob });
      const local = path.join(RAIZ, rel);
      if (local.startsWith(RAIZ) && fs.existsSync(local) && fs.statSync(local).isFile())
        return route.fulfill({ status: 200, contentType: TIPOS[path.extname(local)] || 'text/plain', body: fs.readFileSync(local) });
      return route.fulfill({ status: 404, body: 'no' });
    }
    if (u.hostname === 'api.github.com') {
      if (u.pathname.endsWith('/contents/shared/users-suite.json'))
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ content: Buffer.from(USERS_FALSO).toString('base64'), sha: 'prueba' }) });
      RED.bloqueadas.add('api.github.com' + u.pathname.replace(/[0-9a-f]{20,}/g, '…'));
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    if (u.hostname.endsWith('.up.railway.app')) {
      RED.webhooks.add(u.pathname);
      if (opts.n8nCaido) return route.abort('connectionrefused');
      if (u.pathname.endsWith('/auth/suite-login')) {
        let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
        const ses = b.password === passPrueba(b.username) ? sesionSuite(b.username) : null;
        const body = ses
          ? { ok: true, token: ses.token, actor: ses.actor, nombre: ses.nombre, empleado_id: null, scopes: ses.scopes, exp: ses.exp, debe_cambiar_password: true }
          : { ok: false, error: 'CREDENCIALES', mensaje: 'Usuario o contraseña incorrectos.' };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, success: true, rows: [], data: [], items: [], casos: [], machotes: [], total: 0 }) });
    }
    RED.bloqueadas.add(u.hostname);
    return route.abort('blockedbyclient');
  });
}

async function contexto(browser, base, sesiones, opts) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await enrutar(ctx, opts);
  await ctx.addInitScript(s => {
    try {
      if (sessionStorage.getItem('__sembrado')) return;      // sólo en la primera carga del contexto… por pestaña
      sessionStorage.setItem('__sembrado', '1');
      if (s.clasica) localStorage.setItem('fts_session', JSON.stringify(Object.assign(s.clasica, { lastActivity: Date.now() })));
      if (s.suite) localStorage.setItem('fts_suite_session', JSON.stringify(s.suite));
      if (s.fin) localStorage.setItem('fts_fin_session', JSON.stringify(s.fin));
      localStorage.setItem('ops_n8n_url', 'https://primary-production-5c3c.up.railway.app');
    } catch (e) {}
  }, sesiones || {});
  return ctx;
}

// ── Lectura del DOM ──
const ERRORES = [];   // P-12
async function abrir(ctx, base, ruta, espera) {
  const page = await ctx.newPage();
  const dialogos = [];
  page.on('dialog', d => { dialogos.push(d.message()); d.accept().catch(() => {}); });
  page.on('pageerror', e => ERRORES.push({ ruta, error: String(e.message || e).slice(0, 200) }));
  try { await page.goto(base + ruta, { waitUntil: 'load', timeout: 20000 }); } catch (e) {}
  await page.waitForTimeout(espera || 1500);
  return { page, dialogos };
}
function rutaFinal(page) { try { return new URL(page.url()).pathname.replace(/\/$/, '/index.html'); } catch (e) { return ''; } }
function norm(r) { return ('/' + r).replace(/\/+/g, '/').replace(/\/$/, '/index.html'); }

async function estadoPagina(p, ruta) {
  const { page, dialogos } = p;
  if (rutaFinal(page) !== norm(ruta)) return 'niega';
  if (dialogos.some(m => /no tienes acceso|acceso restringido|sesión no válida/i.test(m))) return 'niega';
  const bloqueo = await page.evaluate(() => {
    // offsetParent es null en elementos position:fixed (los overlays): se usa getClientRects.
    const vis = id => { const e = document.getElementById(id); if (!e) return false; const cs = getComputedStyle(e);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0; };
    return !!window.__ftsSinAcceso || vis('auth-gate') || vis('cmAuthOverlay');
  }).catch(() => false);
  return bloqueo ? 'niega' : 'abre';
}
// Pantallas que, sin permiso, se quedan en su lugar y piden contraseña (NomAuth,
// RetAuth, FinAuth): "abre" = no hay un campo de contraseña visible.
async function pidePassword(page) {
  return page.evaluate(() => [...document.querySelectorAll('input[type=password]')]
    .some(i => i.getClientRects().length > 0 && getComputedStyle(i).visibility !== 'hidden')).catch(() => false);
}

// Cada lector recibe la persona y devuelve { objetivo: valor }.
const PAGINAS = [
  { ruta: 'index.html', leer: async (p) => {
      const r = await p.page.evaluate(() => {
        const ov = document.getElementById('login-overlay');
        const entra = ov && getComputedStyle(ov).display === 'none';
        const op = id => { const c = document.getElementById(id); return c && c.style.opacity === '0.4' ? 'atenuada' : 'activa'; };
        const rh = document.getElementById('card-rh');
        const cm = document.getElementById('card-config-master');
        return { entra, cards: { seguridad: op('card-seguridad'), ingenieria: op('card-ingenieria'), operaciones: op('card-operaciones'),
          finanzas: op('card-finanzas'), comercial: op('card-comercial'), hatch: op('card-hatch'), odoo: op('card-odoo') },
          rh: rh && rh.classList.contains('active') ? 'activa' : 'próximamente',
          cfg: cm && getComputedStyle(cm).display !== 'none' ? 'visibles' : 'ocultas' };
      });
      const o = { 'lanzador · entrar': r.entra ? 'entra' : 'sin lanzador' };
      for (const m of Object.keys(r.cards)) o['lanzador · ' + m] = r.entra ? r.cards[m] : '—';
      o['lanzador · rh'] = r.entra ? r.rh : '—';
      o['lanzador · config/hatch visibles'] = r.entra ? r.cfg : '—';
      return o;
  } },
  { ruta: 'seguridad/index.html', espera: 2000, leer: async (p) => {
      const st = await estadoPagina(p, 'seguridad/index.html');
      if (st === 'niega') return { 'seguridad/ (página)': 'niega', 'seguridad · tarjeta instructor': '—', 'seguridad · tarjeta empleado': '—', 'seguridad · tarjeta IPERC': '—' };
      const r = await p.page.evaluate(() => {
        const vis = sel => { const el = document.querySelector(sel); if (!el) return null;
          const card = el.closest('.mode-card,.card,[class*="card"]') || el; return getComputedStyle(card).display !== 'none'; };
        return { ins: vis('[onclick*="goInstPin"],[onclick*="s-pin"]'), emp: vis('[onclick*="goEmpAccess"],[onclick*="s-emp"]'),
                 ipe: vis('[onclick*="s-iperc-pin"],[onclick*="bypassIpercLogin"]') };
      });
      const f = v => v === null ? 'NO ENCONTRADA' : (v ? 'visible' : 'oculta');
      return { 'seguridad/ (página)': 'abre', 'seguridad · tarjeta instructor': f(r.ins),
               'seguridad · tarjeta empleado': f(r.emp), 'seguridad · tarjeta IPERC': f(r.ipe) };
  } },
  { ruta: 'seguridad/iperc/index.html', leer: async p => ({ 'seguridad/iperc/ (página)': await estadoPagina(p, 'seguridad/iperc/index.html') }) },
  { ruta: 'operaciones/index.html', leer: async (p) => {
      const st = await estadoPagina(p, 'operaciones/index.html');
      if (st === 'niega') return { 'operaciones/ (página)': 'niega', 'operaciones · tarjeta kiosk': '—', 'operaciones · tarjeta incidencias': '—', 'operaciones · tarjeta planeacion': '—', 'operaciones · tarjeta dashboard': '—' };
      const r = await p.page.evaluate(() => Object.fromEntries(['kiosk', 'incidencias', 'planeacion', 'dashboard'].map(k => {
        const c = document.getElementById('card-' + k); return [k, c ? (c.style.opacity === '0.4' ? 'atenuada' : 'activa') : 'NO ENCONTRADA']; })));
      const o = { 'operaciones/ (página)': 'abre' };
      for (const k of Object.keys(r)) o['operaciones · tarjeta ' + k] = r[k];
      return o;
  } },
  { ruta: 'operaciones/planeacion/index.html', espera: 2500, leer: async p => ({ 'operaciones/planeacion/ (página)': await estadoPagina(p, 'operaciones/planeacion/index.html') }) },
  { ruta: 'operaciones/confirmar-horas/index.html', espera: 2500, leer: async p => ({ 'operaciones/confirmar-horas/': await estadoPagina(p, 'operaciones/confirmar-horas/index.html') }) },
  { ruta: 'operaciones/incidencias/index.html', parte: 'a', leer: async p => ({ 'operaciones/incidencias/ + /empleado': await estadoPagina(p, 'operaciones/incidencias/index.html') }) },
  { ruta: 'operaciones/incidencias/empleado/index.html', parte: 'b', leer: async p => ({ 'operaciones/incidencias/ + /empleado': await estadoPagina(p, 'operaciones/incidencias/empleado/index.html') }) },
  { ruta: 'operaciones/incidencias/supervisor/index.html', leer: async p => ({ 'operaciones/incidencias/supervisor': await estadoPagina(p, 'operaciones/incidencias/supervisor/index.html') }) },
  ...['modulos/rh/index.html', 'modulos/rh/visor-checkins.html', 'modulos/rh/visor-incidencias.html', 'modulos/rh/empleados/index.html'].map(r => (
    { ruta: r, leer: async p => ({ 'modulos/rh/ (hub, visores, empleados)': await estadoPagina(p, r) }) })),
  { ruta: 'ingenieria/index.html', leer: async p => ({ 'ingenieria/': await estadoPagina(p, 'ingenieria/index.html') }) },
  { ruta: 'pmo/index.html', leer: async p => ({ 'pmo/': await estadoPagina(p, 'pmo/index.html') }) },
  { ruta: 'hatch/index.html', espera: 2500, leer: async p => ({ 'hatch/': await estadoPagina(p, 'hatch/index.html') }) },
  ...['shared/admin/config-master.html', 'shared/admin/editor-asistencias.html'].map(r => (
    { ruta: r, espera: 2500, leer: async p => ({ 'admin/config-master + editor-asistencias': await estadoPagina(p, r) }) })),
  { ruta: 'comercial/index.html', leer: async p => ({ 'comercial/ + machote': await estadoPagina(p, 'comercial/index.html') }) },
  { ruta: 'comercial/machote/index.html', espera: 3000, leer: async (p) => {
      const st = await estadoPagina(p, 'comercial/machote/index.html');
      const dir = st === 'abre' ? await p.page.evaluate(() => !!document.querySelector('a[href="#/control"]')).catch(() => false) : false;
      return { 'comercial/ + machote': st, 'machote · dirección': dir ? 'abre' : 'niega' };
  } },
  { ruta: 'comercial/conceptualizador/index.html', leer: async p => ({ 'comercial/conceptualizador': await estadoPagina(p, 'comercial/conceptualizador/index.html') }) },
  { ruta: 'marketing/index.html', leer: async (p) => {
      const st = await estadoPagina(p, 'marketing/index.html');
      if (st === 'niega') return { 'marketing/': 'niega', 'marketing · bandeja': 'niega', 'marketing · crm/seguimiento': 'niega' };
      const r = await p.page.evaluate(() => ({ b: document.getElementById('card-bandeja').classList.contains('reservado'),
                                                s: document.getElementById('card-seg').classList.contains('reservado') }));
      return { 'marketing/': 'abre', 'marketing · bandeja': r.b ? 'niega' : 'abre', 'marketing · crm/seguimiento': r.s ? 'niega' : 'abre' };
  } },
  { ruta: 'finanzas/rentabilidad/index.html', leer: async p => ({ 'finanzas/rentabilidad': await estadoPagina(p, 'finanzas/rentabilidad/index.html') }) },
  { ruta: 'finanzas/data-bancos/index.html', leer: async p => ({ 'finanzas/data-bancos': await estadoPagina(p, 'finanzas/data-bancos/index.html') }) },
  { ruta: 'modulos/rh/nomina-incidencias/index.html', espera: 2000, leer: async p => ({ 'rh/nomina-incidencias': await pidePassword(p.page) ? 'niega' : 'abre' }) },
  { ruta: 'modulos/rh/retardos/index.html', espera: 2000, leer: async (p) => {
      if (await pidePassword(p.page)) return { 'rh/retardos (lectura)': 'niega', 'rh/retardos (editor)': 'niega' };
      await p.page.click('[data-vista="hojas"]', { timeout: 3000 }).catch(() => {});
      await p.page.waitForTimeout(800);
      const ed = await p.page.evaluate(() => /Subir hojas/.test(document.body.innerText)).catch(() => false);
      return { 'rh/retardos (lectura)': 'abre', 'rh/retardos (editor)': ed ? 'abre' : 'niega' };
  } }
];

// ── P-xx ──
const P = {};
function prueba(id, ok, detalle) { P[id] = P[id] || { ok: true, detalles: [] }; if (!ok) P[id].ok = false; P[id].detalles.push((ok ? '✓ ' : '✗ ') + detalle); }

async function main() {
  if (!EXE) { console.error('No encontré Chromium en /opt/pw-browsers'); process.exit(2); }
  const srv = await servir(); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const blob = await blobOpsConfigFalso();
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const medido = {};   // medido[obj][quien] = valor

  // ── Grilla: P-06 / P-07 (y las celdas del lanzador de P-01) ──
  async function porPersona(per) {
    const ses = { clasica: sesionClasica(per.clasico), suite: per.suite ? sesionSuite(per.suite) : null };
    const ctx = await contexto(browser, base, ses, { blob });
    const parciales = {};
    for (const pg of PAGINAS) {
      const p = await abrir(ctx, base, pg.ruta, pg.espera);
      let o = {};
      try { o = await pg.leer(p); } catch (e) { o = { ['ERROR ' + pg.ruta]: String(e.message).slice(0, 80) }; }
      await p.page.close();
      for (let [k, v] of Object.entries(o)) {
        if (pg.parte) { (parciales[k] = parciales[k] || []).push(v); continue; }
        // Si una fila se lee en varias páginas (RH, admin, comercial), todas deben coincidir.
        if (medido[k] && medido[k][per.quien] !== undefined && medido[k][per.quien] !== v) v = medido[k][per.quien] + '≠' + v;
        (medido[k] = medido[k] || {})[per.quien] = v;
      }
    }
    for (const [k, vs] of Object.entries(parciales)) (medido[k] = medido[k] || {})[per.quien] = vs.every(x => x === vs[0]) ? vs[0] : vs.join('≠');
    await ctx.close();
  }
  const cola = [...PERSONAS];
  await Promise.all([1, 2, 3, 4].map(async () => { while (cola.length) await porPersona(cola.shift()); }));

  const comparacion = []; let rotas = 0;
  for (const f of MODELO.filas) {
    const fila = { obj: f.obj, celdas: [] };
    for (const c of f.celdas) {
      const dom = (medido[f.obj] || {})[c.quien];
      const ok = dom === c.hoy;
      if (!ok) rotas++;
      fila.celdas.push({ quien: c.quien, modelo: c.hoy, dom, ok });
    }
    comparacion.push(fila);
  }
  const celdas = comparacion.length * PERSONAS.length;

  // ── P-01 · login clásico en el lanzador ──
  for (const per of PERSONAS.filter(x => x.clasico)) {
    const ctx = await contexto(browser, base, {}, { blob });
    const p = await abrir(ctx, base, 'index.html', 800);
    await p.page.fill('#login-user', per.clasico); await p.page.fill('#login-pass', passPrueba(per.clasico));
    await p.page.click('#login-btn'); await p.page.waitForTimeout(3500);   // PBKDF2 100k + ConfigSync
    const pg0 = PAGINAS[0]; const o = await pg0.leer(p);
    const tok = await p.page.evaluate(() => localStorage.getItem('ops_github_token'));
    const filas = MODELO.filas.filter(f => f.obj.startsWith('lanzador'));
    const dif = filas.filter(f => o[f.obj] !== f.celdas.find(c => c.quien === per.quien).hoy).map(f => f.obj + '=' + o[f.obj]);
    const esMaster = REAL.users.find(u => u.username === per.clasico).role === 'master';
    prueba('P-01', o['lanzador · entrar'] === 'entra' && !dif.length, per.quien + ': entra y tarjetas = matriz' + (dif.length ? ' · DIFIEREN ' + dif.join(', ') : ''));
    prueba('P-01', esMaster ? tok === TOKEN_FALSO : !tok, per.quien + ': token de GitHub ' + (tok === TOKEN_FALSO ? 'restaurado (blob de prueba)' : tok ? 'OTRO VALOR' : 'no restaurado') + (esMaster ? ' — se espera restaurado' : ' — se espera ausente'));
    await ctx.close();
  }

  // ── P-02 · contraseña mala y usuario inexistente ──
  for (const [u, pw, etiqueta] of [['ana.acevedo', 'mala', 'contraseña mala'], ['no.existe', 'mala', 'usuario inexistente']]) {
    const ctx = await contexto(browser, base, {}, { blob });
    const p = await abrir(ctx, base, 'index.html', 800);
    await p.page.fill('#login-user', u); await p.page.fill('#login-pass', pw);
    await p.page.click('#login-btn'); await p.page.waitForTimeout(1500);
    const r = await p.page.evaluate(() => ({ msg: document.getElementById('login-error').textContent,
      ov: getComputedStyle(document.getElementById('login-overlay')).display, ses: !!localStorage.getItem('fts_session') }));
    prueba('P-02', r.ov !== 'none' && !r.ses && r.msg === 'Usuario o contraseña incorrectos', etiqueta + ': rechaza con «' + r.msg + '»');
    await ctx.close();
  }

  // ── P-03 · login SuiteAuth en shared/login.html ──
  for (const u of SNAP.usuarios) {
    const ctx = await contexto(browser, base, {}, { blob });
    const p = await abrir(ctx, base, 'shared/login.html', 600);
    await p.page.fill('#u', u.username); await p.page.fill('#p', passPrueba(u.username));
    await p.page.click('#b'); await p.page.waitForTimeout(1500);
    const r = await p.page.evaluate(() => { let s = null; try { s = JSON.parse(localStorage.getItem('fts_suite_session')); } catch (e) {}
      return { url: location.pathname, sc: s && s.scopes, msg: (document.getElementById('m') || {}).textContent || '' }; });
    if (u.activo) prueba('P-03', r.url.endsWith('/index.html') && !r.url.includes('/shared/') && Array.isArray(r.sc) && r.sc.join(',') === u.scopes,
      u.username + ': entra y guarda sus ' + (r.sc || []).length + ' scopes');
    else prueba('P-03', !r.sc && /incorrect/i.test(r.msg), u.username + ' (inactivo): rechazado con «' + r.msg + '»');
    await ctx.close();
  }
  {
    const ctx = await contexto(browser, base, { suite: sesionSuite('erick.belmont') }, { blob });
    const p = await abrir(ctx, base, 'shared/login.html?falta=comercial:read', 600);
    const t = await p.page.evaluate(() => document.getElementById('falta').textContent);
    prueba('P-03', /no tiene el permiso «comercial:read»/.test(t), '?falta= con sesión explica el scope: «' + t.slice(0, 90) + '…»');
    await ctx.close();
  }
  prueba('P-03', true, 'NOTA: el plan dice «las 11 cuentas activas»; el snapshot tiene ' + SNAP.usuarios.length + ' cuentas, ' + SNAP.usuarios.filter(u => u.activo).length + ' activas. Se probaron todas las del snapshot.');

  // ── P-04 / P-05 · lanzador con sesión Suite y sin sesión clásica ──
  for (const [id, extra, et] of [['P-04', [], 'sin suite:clasico'], ['P-05', ['suite:clasico'], 'CON suite:clasico (interruptor aún no existe = apagado)']]) {
    const ctx = await contexto(browser, base, { suite: sesionSuite('pablo.bayly', extra) }, { blob });
    const p = await abrir(ctx, base, 'index.html', 1200);
    const ov = await p.page.evaluate(() => getComputedStyle(document.getElementById('login-overlay')).display);
    prueba(id, ov !== 'none', 'sesión Suite ' + et + ': muestra el login clásico (overlay ' + ov + ')');
    await ctx.close();
  }

  // ── P-07 · Nómina: la misma llave, dos formatos ──
  // NomAuth (nom-auth.js) exige `expires_at`; SuiteAuth (auth-jwt.js) guarda `exp`.
  // Se mide con las dos formas para que la diferencia quede a la vista.
  for (const u of ['ana.acevedo', 'magaly.perez', 'esteban.delacruz']) {
    const ss = sesionSuite(u);
    const forma = Object.assign({}, ss, { expires_at: new Date(ss.exp * 1000).toISOString(), user: u });
    delete forma.exp;
    for (const [ses, et] of [[ss, 'sesión de shared/login.html (exp)'], [forma, 'sesión de su propio login (expires_at)']]) {
      const ctx = await contexto(browser, base, { suite: ses }, { blob });
      const p = await abrir(ctx, base, 'modulos/rh/nomina-incidencias/index.html', 2000);
      const abre = !(await pidePassword(p.page));
      const tiene = ss.scopes.includes('nomina:write');
      const esperado = et.includes('expires_at') ? tiene : false;
      prueba('P-07', abre === esperado, 'Nómina · ' + u + ' · ' + et + ': ' + (abre ? 'abre' : 'pide login') + (tiene ? '' : ' (sin nomina:write)'));
      await p.page.close(); await ctx.close();
    }
  }
  // Y al revés: una sesión con forma NomAuth no le sirve a SuiteAuth (Comercial).
  {
    const ss = sesionSuite('esteban.delacruz');
    const forma = Object.assign({}, ss, { expires_at: new Date(ss.exp * 1000).toISOString() }); delete forma.exp;
    const ctx = await contexto(browser, base, { suite: forma }, { blob });
    const p = await abrir(ctx, base, 'comercial/index.html', 1200);
    const st = await estadoPagina(p, 'comercial/index.html');
    prueba('P-07', st === 'niega', 'Comercial con la sesión que deja el login de Nómina: ' + st + ' (se espera niega: SuiteAuth exige exp)');
    await ctx.close();
  }

  // ── P-08 · FinAuth intacto ──
  for (const [ruta, et] of [['finanzas/index.html', 'Finanzas'], ['operaciones/carga-mo/index.html', 'Carga MO'], ['comercial/leads.html', 'Leads']]) {
    for (const [ses, espera, nom] of [[{ fin: sesionFin() }, false, 'con token Finanzas'],
      [{ clasica: sesionClasica('ftsmaster'), suite: sesionSuite('esteban.delacruz') }, true, 'sólo clásico+Suite master']]) {
      const ctx = await contexto(browser, base, ses, { blob });
      const p = await abrir(ctx, base, ruta, 2000);
      const pide = await pidePassword(p.page);
      prueba('P-08', pide === espera, et + ' ' + nom + ': ' + (pide ? 'pide su login' : 'abre'));
      await p.page.close(); await ctx.close();
    }
  }

  // ── P-09 · cerrar una sesión no toca las otras ──
  {
    const todas = { clasica: sesionClasica('ftsmaster'), suite: sesionSuite('esteban.delacruz'), fin: sesionFin() };
    const llaves = () => ({ c: !!localStorage.getItem('fts_session'), s: !!localStorage.getItem('fts_suite_session'), f: !!localStorage.getItem('fts_fin_session') });
    let ctx = await contexto(browser, base, todas, { blob });
    let p = await abrir(ctx, base, 'index.html', 1200);
    await p.page.evaluate(() => window.doLogout());
    let r = await p.page.evaluate(llaves);
    prueba('P-09', !r.c && r.s && r.f, 'logout clásico: fts_session=' + r.c + ' fts_suite_session=' + r.s + ' fts_fin_session=' + r.f);
    await ctx.close();
    ctx = await contexto(browser, base, todas, { blob });
    p = await abrir(ctx, base, 'shared/login.html?falta=x', 800);
    await p.page.evaluate(() => window.SuiteAuth.logout()); r = await p.page.evaluate(llaves);
    prueba('P-09', r.c && !r.s && r.f, 'logout Suite: fts_session=' + r.c + ' fts_suite_session=' + r.s + ' fts_fin_session=' + r.f);
    await ctx.close();
    ctx = await contexto(browser, base, todas, { blob });
    p = await abrir(ctx, base, 'finanzas/index.html', 1200);
    await p.page.evaluate(() => window.FinAuth.logout()); r = await p.page.evaluate(llaves);
    prueba('P-09', r.c && r.s && !r.f, 'logout Finanzas: fts_session=' + r.c + ' fts_suite_session=' + r.s + ' fts_fin_session=' + r.f);
    await ctx.close();
  }

  // ── P-10 · inactividad de 30 min en el clásico ──
  for (const [min, debeSeguir] of [[31, false], [29, true]]) {
    const ctx = await browser.newContext(); await enrutar(ctx, { blob });
    await ctx.addInitScript(m => { if (sessionStorage.getItem('__s')) return; sessionStorage.setItem('__s', '1');
      localStorage.setItem('fts_session', JSON.stringify({ userId: 1, username: 'ftsmaster', nombre: 'FTS Master', role: 'master',
        modulos: 'all', loginTime: Date.now() - m * 60e3, lastActivity: Date.now() - m * 60e3 })); }, min);
    const p = await abrir(ctx, base, 'seguridad/index.html', 1500);
    const r = { ruta: rutaFinal(p.page), ses: await p.page.evaluate(() => !!localStorage.getItem('fts_session')) };
    prueba('P-10', debeSeguir ? (r.ses && r.ruta.endsWith('seguridad/index.html')) : (!r.ses && r.ruta === '/index.html'),
      min + ' min sin actividad: ' + (r.ses ? 'sigue dentro' : 'sesión cerrada') + ' (página ' + r.ruta + ')');
    await ctx.close();
  }

  // ── P-11 · interruptores caídos / n8n caído ──
  prueba('P-11', RED.interruptores === 0, 'hoy ninguna página pide un endpoint de interruptores (' + RED.interruptores + ' peticiones): el interruptor nace en A3');
  {
    const ctx = await contexto(browser, base, { clasica: sesionClasica('felipe.perez') }, { blob, n8nCaido: true });
    const p = await abrir(ctx, base, 'index.html', 1500); const o = await PAGINAS[0].leer(p);
    const dif = MODELO.filas.filter(f => f.obj.startsWith('lanzador')).filter(f => o[f.obj] !== f.celdas.find(c => c.quien === 'Felipe').hoy);
    prueba('P-11', !dif.length, 'n8n caído: el lanzador clásico de Felipe se pinta igual (' + (dif.length ? 'DIFIERE' : 'idéntico') + ')');
    await ctx.close();
  }

  // ── P-15 · la puerta del ftsmaster de respaldo (C2) ──
  // Documenta el comportamiento de HOY: si users-suite.json no se puede leer y el
  // navegador no tiene fts_master_hash, el lanzador ofrece "activar" la cuenta master
  // con CUALQUIER contraseña de 6+ caracteres (auth-suite.js:60-73, 91-102; index.html:218-228).
  // Hoy esta prueba pasa si la puerta EXISTE. Cuando se cierre (C2) se invierte la expectativa.
  {
    const C2_CERRADA = process.env.C2_CERRADA === '1';
    const ctx = await contexto(browser, base, {}, { blob, usersCaido: true });
    const p = await abrir(ctx, base, 'index.html', 800);
    await p.page.fill('#login-user', 'ftsmaster'); await p.page.fill('#login-pass', 'cualquiera-123');
    await p.page.click('#login-btn'); await p.page.waitForTimeout(1500);
    const r = await p.page.evaluate(() => ({ box: getComputedStyle(document.getElementById('first-login-box')).display,
      msg: document.getElementById('login-error').textContent }));
    const abierta = r.box !== 'none';
    prueba('P-15', C2_CERRADA ? !abierta : abierta, 'users-suite.json caído + contraseña inventada para ftsmaster: ' +
      (abierta ? 'OFRECE ACTIVAR LA CUENTA MASTER («' + r.msg + '»): puerta abierta, se cierra en C2' : 'rechaza'));
    await ctx.close();
  }

  // ── P-13 · capturas a 4 anchos ──
  const capturas = [];
  if (CAPTURAS) {
    const dir = path.join(SALIDA, 'capturas'); fs.mkdirSync(dir, { recursive: true });
    const escenas = [
      ['lanzador-login', 'index.html', {}],
      ['lanzador-esteban', 'index.html', { clasica: sesionClasica('ftsmaster') }],
      ['lanzador-montalvo', 'index.html', { clasica: sesionClasica('monty') }],
      ['login-suite-falta', 'shared/login.html?falta=comercial:read', { suite: sesionSuite('erick.belmont') }]
    ];
    for (const [nom, ruta, ses] of escenas) for (const w of [380, 760, 900, 1280]) {
      const ctx = await contexto(browser, base, ses, { blob });
      const page = await ctx.newPage(); await page.setViewportSize({ width: w, height: 900 });
      page.on('pageerror', e => ERRORES.push({ ruta, error: String(e.message).slice(0, 200) }));
      try { await page.goto(base + ruta, { waitUntil: 'load' }); } catch (e) {}
      await page.waitForTimeout(1200);
      const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
      const f = path.join(dir, nom + '-' + w + '.png'); await page.screenshot({ path: f });
      capturas.push({ escena: nom, ancho_vp: w, scrollWidth: ancho, archivo: path.relative(SALIDA, f) });
      await ctx.close();
    }
    prueba('P-13', true, capturas.length + ' capturas de línea base (no hay pantalla nueva en A1). Desborde horizontal: ' +
      (capturas.filter(c => c.scrollWidth > c.ancho_vp).map(c => c.escena + '@' + c.ancho_vp + '=' + c.scrollWidth).join(', ') || 'ninguno'));
  }

  // ── P-12 · pageerror ──
  const porRuta = {};
  for (const e of ERRORES) { const k = e.ruta + ' · ' + e.error; porRuta[k] = (porRuta[k] || 0) + 1; }
  prueba('P-12', ERRORES.length === 0, ERRORES.length + ' pageerror en total' + (ERRORES.length ? ' (línea base de HOY, con webhooks vacíos): ' + Object.keys(porRuta).length + ' distintos' : ''));

  await browser.close(); srv.close();

  // ── Salida ──
  const resultado = { medido_utc: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: RAIZ }).toString().trim(),
    grilla: { celdas, coinciden: celdas - rotas, rotas: comparacion.flatMap(f => f.celdas.filter(c => !c.ok).map(c => ({ obj: f.obj, ...c }))) },
    pruebas: P, pageerrors: porRuta, red: { bloqueadas: [...RED.bloqueadas].sort(), webhooks_interceptados: [...RED.webhooks].sort() }, capturas };
  fs.writeFileSync(path.join(SALIDA, 'resultado.json'), JSON.stringify(resultado, null, 1));
  const md = ['| Objetivo | ' + PERSONAS.map(p => p.quien).join(' | ') + ' |', '|---|' + PERSONAS.map(() => '---').join('|') + '|']
    .concat(comparacion.map(f => '| ' + f.obj + ' | ' + f.celdas.map(c => c.ok ? c.dom : '❌ modelo ' + c.modelo + ' · DOM ' + c.dom).join(' | ') + ' |'));
  fs.writeFileSync(path.join(SALIDA, 'grilla.md'), md.join('\n') + '\n');

  console.log('\nCAPA 2 · navegador vs modelo: ' + (celdas - rotas) + '/' + celdas + ' celdas coinciden');
  for (const r of resultado.grilla.rotas) console.log('  ✗ ' + r.obj + ' · ' + r.quien + ': modelo=' + r.modelo + ' DOM=' + r.dom);
  for (const id of Object.keys(P).sort()) { console.log((P[id].ok ? '✓ ' : '✗ ') + id); for (const d of P[id].detalles) console.log('     ' + d); }
  if (Object.keys(porRuta).length) { console.log('pageerror distintos:'); for (const [k, n] of Object.entries(porRuta)) console.log('   ' + n + '× ' + k); }
  console.log('bloqueadas (no salieron):', [...RED.bloqueadas].sort().join(', ') || 'ninguna');
  console.log('Resultados en ' + SALIDA);
  const fallaP = Object.entries(P).some(([id, v]) => !v.ok && id !== 'P-12');
  process.exit(rotas === 0 && !fallaP ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(2); });
