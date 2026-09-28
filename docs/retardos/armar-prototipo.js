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
const pdfjs = fs.readFileSync(path.join(R, 'retardos', 'lib', 'pdf.js'), 'utf8');
// Las hojas de ejemplo del lector (inventadas) van incrustadas: el artefacto no ve el repo.
const FIX = path.join(R, 'retardos', 'hojas', 'tests', 'fixtures');
let apiP = api.replace(/FIX \+ '([0-9a-z-]+\.jpg)'/g, (_, f) => "'data:image/jpeg;base64," + fs.readFileSync(path.join(FIX, f)).toString('base64') + "'");
if (/FIX \+ '/.test(apiP)) throw new Error('Quedó una hoja sin incrustar');
const out = '<title>Retardos v2</title>\n<meta name="description" content="Prototipo del ciclo de retardos: deteccion, hoja a RH, recoleccion de firma, lector de hojas con confirmacion de RH, reincidencia y alertas de modo.">\n' +
  '<style>\n' + css + '\n' + intro.split('<!--CSS-->')[1] + '\n</style>\n' +
  cuerpo.replace('<div class="wrap hid" id="app">', intro.split('<!--CSS-->')[2] + '\n<div class="wrap hid" id="app">') +
  '<script>\nwindow.RET_FORZAR_DEMO = true;\nwindow.SuiteAuth = { login: async function () { return { ok: false, mensaje: "En el prototipo solo hay datos de ejemplo." }; }, isValid: function () { return false; }, tieneScope: function () { return false; }, logout: function () {}, getToken: function () { return null; }, getSession: function () { return null; } };\n</script>\n' +
  '<script>\n' + pdfjs + '\n</script>\n<script>\n' + apiP + '\n</script>\n<script>\n' + app.replace("fetch('version.json'", "if (!G.RET_FORZAR_DEMO) fetch('version.json'")
     // El visor de artefactos no deja abrir ni descargar archivos: en el prototipo se dice así, sin fingir.
     .replace("var w = window.open(url, '_blank', 'noopener');", "if (G.RET_FORZAR_DEMO) { toast('Hoja de ' + folio + ' generada (' + h.bytes + ' bytes). En el prototipo no se puede abrir el PDF; en el panel se abre para imprimir.'); return; }\n      var w = window.open(url, '_blank', 'noopener');") + '\n</script>\n';
fs.writeFileSync(path.join(__dirname, 'prototipo.html'), out);
console.log('prototipo.html', out.length, 'bytes');
