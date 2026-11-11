#!/usr/bin/env node
// #486 · config-sync ya no sube llaves de API ni el token de GitHub, y al cargar un blob viejo no las aplica.
// Corre shared/config-sync.js real en Chromium; la API de GitHub va interceptada (no toca el repo). Valores inventados.
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { check, seccion, fin } = require('../nomina-usa/lib/t');
const RAIZ = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(RAIZ, 'shared/config-sync.js'), 'utf8');
const FALSOS = { key_claude: 'sk-ant-FALSO-1', key_groq: 'gsk_FALSO', key_openrouter: 'sk-or-FALSO', key_gemini: 'AIza-FALSO',
  key_github_token: 'ghp_FALSO_A', key_odoo_api: 'odoo-FALSO', ops_github_token: 'ghp_FALSO_B', ops_api_key: 'odoo-FALSO-2', fts_suite_session: '{"token":"x"}' };

(async () => {
  const browser = await chromium.launch(), page = await browser.newPage();
  let subido = null;
  await page.route('https://api.github.com/**', r => {
    if (r.request().method() === 'PUT') { subido = JSON.parse(r.request().postData()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
    return r.fulfill({ status: 404, body: '' });
  });
  await page.route('https://raw.githubusercontent.com/**', r => r.fulfill({ status: 404, body: '' }));
  await page.route('http://localhost:9/', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>t</title>' }));
  await page.goto('http://localhost:9/');
  await page.evaluate(f => { localStorage.clear(); for (const k in f) localStorage.setItem(k, f[k]); localStorage.setItem('ops_n8n_url', 'https://n8n.prueba'); }, FALSOS);
  await page.addScriptTag({ content: SRC });

  seccion('Lista blanca');
  const perm = await page.evaluate(() => ConfigSync.PERMITIDAS);
  check('ninguna llave key_* ni token en PERMITIDAS', !perm.some(k => /^key_|token|_api_key|password/.test(k)), perm.filter(k => /^key_|token/.test(k)));
  check('la configuración del kiosko sigue', perm.indexOf('ops_kiosk_geolocations') >= 0 && perm.indexOf('ops_n8n_url') >= 0);
  const col = await page.evaluate(() => ConfigSync.collectOpsKeys());
  check('collectOpsKeys solo trae ops_n8n_url', JSON.stringify(Object.keys(col)) === '["ops_n8n_url"]', Object.keys(col));

  seccion('Guardar: el blob cifrado no lleva llaves');
  await page.evaluate(() => ConfigSync.save('ghp_TOKEN_DE_ESCRITURA', 'contraseña-prueba'));
  check('hubo PUT a GitHub', !!subido);
  const blob = JSON.parse(Buffer.from(subido.content, 'base64').toString('utf8'));
  const dentro = await page.evaluate(async ([b64, pw]) => {
    const c = Uint8Array.from(atob(b64), x => x.charCodeAt(0)), e = new TextEncoder();
    const km = await crypto.subtle.importKey('raw', e.encode(pw), { name: 'PBKDF2' }, false, ['deriveKey']);
    const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: c.slice(0, 16), iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: c.slice(16, 28) }, k, c.slice(28))));
  }, [blob.data, 'contraseña-prueba']);
  check('el blob descifrado solo trae ops_n8n_url', JSON.stringify(Object.keys(dentro)) === '["ops_n8n_url"]', Object.keys(dentro));
  check('ningún valor falso ni el token viaja en el PUT', !Object.values(FALSOS).concat(['ghp_TOKEN_DE_ESCRITURA']).some(v => JSON.stringify(dentro).indexOf(v) >= 0));

  seccion('Cargar un blob VIEJO con llaves: se ignoran');
  const viejo = await page.evaluate(async pw => {
    const e = new TextEncoder(), salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const km = await crypto.subtle.importKey('raw', e.encode(pw), { name: 'PBKDF2' }, false, ['deriveKey']);
    const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const data = { ops_n8n_url: 'https://n8n.del-blob', ops_kiosk_company_id: '1', key_claude: 'sk-ant-DEL-BLOB', ops_github_token: 'ghp_DEL_BLOB', _github_token: 'ghp_DEL_BLOB_2', fts_machote_v1: '{}', raro_no_permitido: 'x' };
    const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, e.encode(JSON.stringify(data))));
    const all = new Uint8Array(28 + enc.length); all.set(salt, 0); all.set(iv, 16); all.set(enc, 28);
    let s = ''; for (const b of all) s += String.fromCharCode(b); return btoa(s);
  }, 'pw-vieja');
  await page.unroute('https://raw.githubusercontent.com/**');
  await page.route('https://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ v: 1, data: viejo }) }));
  await page.evaluate(() => { localStorage.clear(); });
  await page.evaluate(() => ConfigSync.load('pw-vieja'));
  const ls = await page.evaluate(() => Object.assign({}, localStorage));
  check('aplica la configuración permitida', ls.ops_n8n_url === 'https://n8n.del-blob' && ls.ops_kiosk_company_id === '1');
  check('NO aplica key_claude, tokens ni fts_*', !ls.key_claude && !ls.ops_github_token && !ls.key_github_token && !ls.fts_machote_v1, Object.keys(ls));
  check('NO aplica llaves fuera de la lista blanca', !ls.raro_no_permitido);
  await browser.close(); fin();
})().catch(e => { console.error(e); process.exit(1); });
