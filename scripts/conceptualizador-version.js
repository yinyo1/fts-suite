#!/usr/bin/env node
/* comercial/conceptualizador · las tres versiones dicen lo mismo (fts-conceptualizador#12, bug del 25-oct 22:30 CST).
 * La V1.63e.3 subió version.json y dejó la VERSION de la pantalla en V1.63e.2: «Hay versión nueva · Actualizar» se ofrecía
 * sin fin. Falla (código 1) si no coinciden:
 *   · version.json → version, y el primer renglón de su historial;
 *   · js/cz-app.js → var VERSION = '…';
 *   · index.html  → todos los <script src="js/cz-….js?v=…"> (y cada archivo existe).
 * Corre en GitHub Actions (.github/workflows/conceptualizador-version.yml) y antes de cada push (.githooks/pre-push, con
 * `git config core.hooksPath .githooks`).   node scripts/conceptualizador-version.js */
'use strict';
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '..', 'comercial', 'conceptualizador'), errores = [];
const vj = JSON.parse(fs.readFileSync(path.join(D, 'version.json'), 'utf8')), V = vj.version;
if (!/^V[0-9]/.test(String(V || ''))) errores.push('version.json no trae «version»');
if (!vj.historial || !vj.historial[0] || vj.historial[0].version !== V) errores.push('el primer renglón del historial de version.json no es ' + V);
const app = fs.readFileSync(path.join(D, 'js', 'cz-app.js'), 'utf8'), m = app.match(/var VERSION = '([^']+)';/);
if (!m) errores.push('js/cz-app.js no trae var VERSION'); else if (m[1] !== V) errores.push('js/cz-app.js dice VERSION = ' + m[1] + ' y version.json dice ' + V);
const html = fs.readFileSync(path.join(D, 'index.html'), 'utf8'), rx = /src="(js\/cz-[a-z0-9-]+\.js)(?:\?v=([^"]*))?"/g;
let n = 0, x;
while ((x = rx.exec(html))) { n++;
  if (!fs.existsSync(path.join(D, x[1]))) errores.push('index.html carga ' + x[1] + ' y no existe');
  if (x[2] !== V) errores.push('index.html carga ' + x[1] + '?v=' + (x[2] || '(sin ?v=)') + ' y version.json dice ' + V); }
if (!n) errores.push('index.html no carga ningún js/cz-*.js');
if (errores.length) { console.error('VERSION DESIGUAL en comercial/conceptualizador:'); errores.forEach(e => console.error('  · ' + e)); process.exit(1); }
console.log('OK · comercial/conceptualizador en ' + V + ' (version.json, cz-app.js y ' + n + ' scripts con ?v=' + V + ')');
