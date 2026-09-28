#!/usr/bin/env node
/* Arma docs/retardos/prototipo.html desde el módulo real (modulos/rh/retardos) en modo de
 * ejemplo, para que el prototipo no se desvíe de lo que se construyó. Datos inventados.
 * Uso: node docs/retardos/armar-prototipo.js */
const fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '..', '..'), M = path.join(R, 'modulos', 'rh', 'retardos');
const css = fs.readFileSync(path.join(M, 'css', 'retardos.css'), 'utf8');
const api = fs.readFileSync(path.join(M, 'js', 'api.js'), 'utf8');
const app = fs.readFileSync(path.join(M, 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(M, 'index.html'), 'utf8');
const cuerpo = html.slice(html.indexOf('<div class="rh-topbar">'), html.indexOf('<script src='));
const intro = fs.readFileSync(path.join(__dirname, 'prototipo-intro.html'), 'utf8');
const out = '<title>Retardos v2</title>\n<meta name="description" content="Prototipo del ciclo de retardos: deteccion, correo con folio, hoja firmada, validacion de RH y verificacion.">\n' +
  '<style>\n' + css + '\n' + intro.split('<!--CSS-->')[1] + '\n</style>\n' +
  cuerpo.replace('<div class="wrap hid" id="app">', intro.split('<!--CSS-->')[2] + '\n<div class="wrap hid" id="app">') +
  '<script>\nwindow.RET_FORZAR_DEMO = true;\nwindow.SuiteAuth = { login: async function () { return { ok: false, mensaje: "En el prototipo solo hay datos de ejemplo." }; }, isValid: function () { return false; }, tieneScope: function () { return false; }, logout: function () {}, getToken: function () { return null; }, getSession: function () { return null; } };\n</script>\n' +
  '<script>\n' + api + '\n</script>\n<script>\n' + app.replace("fetch('version.json'", "if (!G.RET_FORZAR_DEMO) fetch('version.json'") + '\n</script>\n';
fs.writeFileSync(path.join(__dirname, 'prototipo.html'), out);
console.log('prototipo.html', out.length, 'bytes');
