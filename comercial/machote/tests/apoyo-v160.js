#!/usr/bin/env node
/* V1.60 (fts-conceptualizador#20, bloque A) · Apoyo autorizado por el dueño (puede_mover) en la pantalla del machote. Adaptada de supervisor-v159.js. El servidor se finge (determinismo; el contenedor no alcanza Railway).
 *   S1. Sin el scope: el machote ajeno se abre en SÓLO LECTURA (como hoy) y no sube nada.
 *   S2. Con `comercial:supervisor`: se abre editable, con la franja «Editando como supervisor»; al tocarlo sube SOLO ese, con su id_local
 *       del dueño y el motivo «editado como supervisor». Archivar no se ofrece en lo ajeno.
 *   S3. El dueño ve el aviso cuando la última versión la guardó otra persona.
 *   S4. El historial dice «editado por … · como supervisor».
 *   node comercial/machote/tests/supervisor-v159.js   (capturas en /tmp o en $CAPTURAS) */
'use strict';
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '../../..'), CAP = process.env.CAPTURAS || fs.mkdtempSync('/tmp/apoyo-v160-');
let fallas = 0; const ok = (n, c, x) => { console.log((c ? '✓ ' : '✗ ') + n + (c || x === undefined ? '' : ' → ' + JSON.stringify(x).slice(0, 300))); if (!c) fallas++; };
const doc = (nom) => ({ nombre: nom, estado: 'borrador', moneda: 'MXN', margenes: {}, secciones: [] });
function servir() { return new Promise(r => { const s = http.createServer((q, res) => { let f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' }); fs.createReadStream(f).pipe(res); }); s.listen(0, () => r(s)); }); }
async function pagina(nav, base, actor, scopes, w, delegado) {
  const p = await nav.newPage({ viewport: { width: w || 1280, height: 900 } }); const errores = []; p.on('pageerror', e => errores.push(e.message)); p.errores = errores; p.guard = [];
  await p.addInitScript(([actor, scopes]) => { const pl = { sub: actor, nombre: actor, scopes, exp: Math.floor(Date.now() / 1000) + 3600 };
    localStorage.setItem('fts_suite_session', JSON.stringify({ token: 'x.' + btoa(JSON.stringify(pl)).replace(/=+$/, '') + '.y', actor, nombre: actor, scopes, exp: pl.exp, empleado_id: null })); }, [actor, scopes]);
  await p.route(/primary-production/, async r => { const u = r.request().url(); const j = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (/machotes-leer/.test(u)) { const b = JSON.parse(r.request().postData() || '{}');
      if (b.machote_id) return j({ ok: true, modo: 'historial', versiones: [
        { version: 2, estado: 'borrador', autor: 'sup.uno', autor_nombre: 'Supervisor Uno', dueno: 'dueno.dos', guardada_at: '2026-11-10T20:00:00Z', motivo: 'editado como supervisor', documento: doc('Lo de Dos') },
        { version: 1, estado: 'borrador', autor: 'dueno.dos', autor_nombre: 'Dueño Dos', dueno: 'dueno.dos', guardada_at: '2026-11-09T20:00:00Z', documento: doc('Lo de Dos') }] });
      return j({ ok: true, modo: 'lista', actor, es_admin: false, total: 2, machotes: [
        { id: 'uuid-mio', id_local: 'M-MIO-1', documento: doc('Lo mío'), dueno: actor, dueno_nombre: actor, ajeno: false, version: 2, versiones: 2, estado: 'borrador',
          folio: 1, folio_txt: 'COT-0001', autor: 'sup.uno', autor_nombre: 'Supervisor Uno', guardada_at: '2026-11-10T20:00:00Z' },
        { id: 'uuid-de-dos', id_local: 'M-DOS-1', documento: doc('Lo de Dos'), dueno: 'dueno.dos', dueno_nombre: 'Dueño Dos', ajeno: true, delegado: delegado === true, version: 1, versiones: 1, estado: 'borrador', folio: 7, folio_txt: 'COT-0007' }] }); }
    if (/machote-guardar/.test(u)) { const c = JSON.parse(r.request().postData() || '{}'); p.guard.push(c); return j({ ok: true, machote_id: 'x', id_local: c.id_local, version: 2, versiones: 2 }); }
    if (/suite\/perfiles/.test(u)) return j({ ok: true, personas: [] });
    return j({ ok: true }); });
  await p.goto(base + '/comercial/machote/index.html'); await p.waitForTimeout(1500); return p;
}
(async () => {
  const s = await servir(), base = 'http://localhost:' + s.address().port, nav = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  try {
    let p = await pagina(nav, base, 'apoyo.uno', ['comercial:read'], 1280, false);
    await p.evaluate(() => { location.hash = '#/m/uuid-de-dos'; }); await p.waitForTimeout(800);
    ok('A1 servidor sin «delegado» (interruptor apagado o no autorizado): sólo lectura, como hoy', /sólo lectura/.test(await p.textContent('#vista')) && !(await p.$('.aviso-supervisor')));
    await p.fill('input.cab-nombre', 'x').catch(() => {}); await p.waitForTimeout(800);
    ok('A1 no sube nada', p.guard.length === 0, p.guard.length);
    await p.screenshot({ path: path.join(CAP, 'a1-sin-delegado-1280.png') }); await p.close();
    for (const w of [380, 760, 900, 1280]) {
      p = await pagina(nav, base, 'apoyo.uno', ['comercial:read'], w, true);
      await p.evaluate(() => { location.hash = '#/m/uuid-de-dos'; }); await p.waitForTimeout(800);
      const t = await p.textContent('#vista');
      if (w === 1280) {
        ok('A2 delegado: editable con la franja «Editando como apoyo»', /Editando como apoyo/.test(t) && !/sólo lectura/.test(t) && !/Editando como supervisor/.test(t), t.slice(0, 200));
        await p.fill('input.cab-nombre', 'Lo de Dos (apoyo)'); await p.dispatchEvent('input.cab-nombre', 'change'); await p.waitForTimeout(1500);
        const g = p.guard.filter(c => c.id_local === 'M-DOS-1');
        ok('A2 sube SOLO el que tocó, con el id_local del dueño y motivo «editado como apoyo»', g.length >= 1 && g.every(c => c.motivo === 'editado como apoyo') && !p.guard.some(c => c.id_local === 'M-MIO-1'), p.guard.map(c => [c.id_local, c.motivo]));
        ok('A2 no se ofrece archivar lo ajeno', !(await p.$('#vista [data-archivar], #vista .archivar')));
      }
      ok('A2 ' + w + ' sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await p.screenshot({ path: path.join(CAP, 'a2-apoyo-' + w + '.png') });
      ok('A2 ' + w + ' sin errores de consola', p.errores.length === 0, p.errores); await p.close();
    }
    p = await pagina(nav, base, 'sup.uno', ['comercial:read', 'comercial:supervisor'], 1280, true);
    await p.evaluate(() => { location.hash = '#/m/uuid-de-dos'; }); await p.waitForTimeout(800);
    ok('A3 supervisor que además es delegado: sigue diciendo «Editando como supervisor»', /Editando como supervisor/.test(await p.textContent('#vista')));
    await p.close();
    console.log(fallas ? fallas + ' FALLAS' : 'TODO OK · capturas en ' + CAP);
  } finally { await nav.close(); s.close(); }
  process.exit(fallas ? 1 : 0);
})();
