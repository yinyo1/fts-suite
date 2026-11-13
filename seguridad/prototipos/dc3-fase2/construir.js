// Arma el PROTOTIPO de la Fase 2 del DC-3 (#507) a partir del seguridad/index.html REAL.
// No reescribe la app: hace reemplazos exactos (cada uno debe calzar UNA vez) y agrega encima
// la capa de Odoo simulado (capa-odoo.js / capa-odoo.css).
//
// Uso:  node seguridad/prototipos/dc3-fase2/construir.js <carpeta_vendor>
//   <carpeta_vendor> trae jspdf.umd.min.js (2.5.1) y jszip.min.js (3.10.1) bajados de cdnjs;
//   se verifica que su sha384 sea el MISMO `integrity` que usa producción.
// Salidas (junto a este archivo):
//   dc3-fase2-prototipo.html           documento completo: se abre directo en el navegador, sin red
//   dc3-fase2-prototipo.artefacto.html el mismo contenido sin <html>/<head>/<body>, para el visor de claude.ai
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AQUI = __dirname;
const SEG = path.resolve(AQUI, '..', '..');
const RAIZ = path.resolve(SEG, '..');
const VENDOR = path.resolve(process.argv[2] || '');
const leer = p => fs.readFileSync(p, 'utf8');
const scriptSeguro = s => s.replace(/<\/script/gi, '<\\/script');

let html = leer(path.join(SEG, 'index.html'));
const versionApp = (html.match(/const APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
const build = (html.match(/const DC3_BUILD\s*=\s*'([^']+)'/) || [])[1];
if (versionApp !== '1.2.0') throw new Error('Se esperaba seguridad/index.html v1.2.0 y es ' + versionApp);

function una(buscar, poner) {
  const n = html.split(buscar).length - 1;
  if (n !== 1) throw new Error('Reemplazo debe calzar 1 vez y calza ' + n + ': ' + buscar.slice(0, 80));
  html = html.replace(buscar, () => poner);
}
function vendor(nombre, etiqueta) {
  const m = etiqueta.match(/integrity="([^"]+)"/);
  const js = fs.readFileSync(path.join(VENDOR, nombre));
  const sri = 'sha384-' + crypto.createHash('sha384').update(js).digest('base64');
  if (!m || m[1] !== sri) throw new Error(nombre + ': la huella no coincide con la de producción');
  return '<script>/* ' + nombre + ' · cdnjs · ' + sri + ' (misma huella que producción) */\n' + scriptSeguro(js.toString('utf8')) + '\n</script>';
}

// 1. Librerías (las mismas versiones, verificadas) dentro del archivo: funciona sin internet.
const tagPdf = html.match(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/2\.5\.1\/jspdf\.umd\.min\.js"[^>]*><\/script>/)[0];
const tagZip = html.match(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/3\.10\.1\/jszip\.min\.js"[^>]*><\/script>/)[0];
una(tagPdf, vendor('jspdf.umd.min.js', tagPdf));
una(tagZip, vendor('jszip.min.js', tagZip));
// 2. Reglas de fechas (el mismo archivo de producción).
una('<script src="js/dc3-periodo.js?v=1.2.0"></script>', '<script>\n' + scriptSeguro(leer(path.join(SEG, 'js', 'dc3-periodo.js'))) + '\n</script>');
// 3. Estilos compartidos de la suite (el mismo archivo).
una('<link rel="stylesheet" href="../shared/fts-styles.css">', '<style>\n' + leer(path.join(RAIZ, 'shared', 'fts-styles.css')) + '\n</style>');
// 4. Sesión: en lugar de auth-suite.js, una sesión DEMO de instructor (sin login, sin red).
una('<script src="../shared/auth-suite.js"></script>',
  '<script>/* PROTOTIPO: sesión demo; no existe login ni usuarios reales */\n' +
  'window.FTSAuth={getSession:function(){return{userId:"demo",username:"demo",nombre:"PROTOTIPO",role:"master",modulos:"all",loginTime:Date.now(),lastActivity:Date.now()};},isLoggedIn:function(){return true;},logout:function(){},canAccess:function(){return true;},isMaster:function(){return true;}};\n</script>');
// 5. Sin service worker: el prototipo no guarda nada en caché.
una("if('serviceWorker' in navigator){", "if(false && 'serviceWorker' in navigator){ /* PROTOTIPO: sin service worker */");
// 6. Videos (necesitan red y servidor; fuera del alcance de la Fase 2) → capa de Odoo simulado.
una('<script src="js/videos.js"></script>',
  '<style>\n' + leer(path.join(AQUI, 'capa-odoo.css')) + '\n</style>\n<script>\n' + scriptSeguro(leer(path.join(AQUI, 'capa-odoo.js'))) + '\n</script>');
// 7. Título.
una('<title>FTS · Seguridad Industrial</title>', '<title>DC-3 Prototipo Fase 2</title>');

const sello = '<!-- PROTOTIPO DC-3 Fase 2 (#507) · generado de seguridad/index.html v' + versionApp + ' (' + build + ') · datos demo -->\n';
fs.writeFileSync(path.join(AQUI, 'dc3-fase2-prototipo.html'), html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + sello));

// Variante para el visor: el visor pone su propio esqueleto (<html><head><body>).
let art = html;
for (const [a, b] of [['<!DOCTYPE html>\n', ''], ['<html lang="es">\n', ''], ['<head>\n', ''], ['</head>\n<body>\n', ''], ['</body>\n</html>', '']]) {
  if (art.split(a).length - 1 !== 1) throw new Error('esqueleto: ' + JSON.stringify(a));
  art = art.replace(a, '');
}
art = art.replace(/<meta charset="UTF-8">\n<meta name="viewport"[^>]*>\n/, '');
const t = art.match(/<title>[^<]*<\/title>\n/)[0];
art = t + sello + art.replace(t, '');
fs.writeFileSync(path.join(AQUI, 'dc3-fase2-prototipo.artefacto.html'), art);
console.log('OK · v' + versionApp + ' · ' + build + ' · ' + Math.round(html.length / 1024) + ' KB');
