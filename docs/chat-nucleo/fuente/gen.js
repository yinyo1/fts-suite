#!/usr/bin/env node
/* Arma prototipo-nucleo.html (autocontenido): núcleo + demo + escena «Comparar» con las capturas reales incrustadas.
 *   node gen.js <dir capturas> <salida.html> */
'use strict';
const fs = require('fs'), path = require('path');
const A = __dirname, CAP = process.argv[2], OUT = process.argv[3];
const r = f => fs.readFileSync(path.join(A, f), 'utf8');
const img = f => { const p = path.join(CAP, f); return fs.existsSync(p) ? 'data:image/png;base64,' + fs.readFileSync(p).toString('base64') : ''; };
const anchos = [380, 900, 1280];
const filas = anchos.map(w => ({ w, cols: [
  ['Conceptualizador hoy (main, V1.42)', img('cz-' + w + '-abajo.png')],
  ['Conceptualizador con el núcleo', img('nucleo-cz-' + w + '.png')],
  ['Marketing hoy (v3)', img('mkt-hoy-' + w + '.png')],
  ['Marketing con el núcleo', img('nucleo-mkt-' + w + '.png')]
] }));
const comparar = filas.map(f => '<section class="cmp-w"><h2>' + f.w + ' px</h2><div class="cmp-g">' + f.cols.map(c =>
  '<figure><figcaption>' + c[0] + '</figcaption>' + (c[1] ? '<img alt="' + c[0] + ' a ' + f.w + ' px" src="' + c[1] + '">' : '<p class="falta">(sin captura)</p>') + '</figure>').join('') + '</div></section>').join('');
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Núcleo de chat · prototipo</title>
<style>
html,body{height:100%;margin:0;background:#fff}
${r('nucleo.css')}
.esc{position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:400;font:13px system-ui,sans-serif}
.esc summary{list-style:none;cursor:pointer;background:#111b21;color:#fff;border-radius:14px;padding:4px 12px;opacity:.85}
.esc[open] summary{opacity:1}.esc nav{background:#fff;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.25);margin-top:6px;padding:6px 0;min-width:240px}
.esc a{display:block;padding:9px 16px;color:#111b21;text-decoration:none}.esc a:hover{background:#f6f5f3}
.limpio .esc{display:none}
#cmp{display:none;font-family:system-ui,sans-serif;padding:16px;background:#f4f5f7;min-height:100%;box-sizing:border-box}
#cmp h1{font-size:18px;margin:36px 0 6px}#cmp p.lead{color:#555;font-size:13px;max-width:760px;margin:0 0 12px}
.cmp-w h2{font-size:15px;margin:18px 0 8px}
.cmp-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
.cmp-g figure{margin:0;background:#fff;border-radius:10px;padding:8px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.cmp-g figcaption{font-size:12.5px;font-weight:600;margin-bottom:6px}.cmp-g img{width:100%;height:auto;display:block;border:1px solid #e7e3dd;border-radius:6px}
.falta{color:#999;font-size:12px}
@media(prefers-color-scheme:dark){#cmp{background:#1b1f22;color:#e9edef}.cmp-g figure{background:#22282c}#cmp p.lead{color:#aebac1}}
</style></head><body>
<details class="esc"><summary>Escenas ▾</summary><nav>
<a href="?p=cz">Conceptualizador · núcleo</a><a href="?p=cz&amp;abrir=1">Conceptualizador · chat abierto</a>
<a href="?p=mkt">Prospectador · núcleo</a><a href="?p=mkt&amp;abrir=1">Prospectador · chat abierto</a>
<a href="?p=comparar">Comparar con las pantallas de hoy</a></nav></details>
<div id="app"></div>
<div id="cmp"><h1>Núcleo de chat · antes y con el núcleo</h1>
<p class="lead">Mismo núcleo para los dos productos. «Hoy» son capturas de la pantalla real: el conceptualizador de main (V1.42), sacado con el simulador local; Marketing v3, de su prueba de pantalla del 15-oct. «Con el núcleo» es este prototipo, con datos demo.</p>${comparar}</div>
<script>${r('nucleo.js')}</script>
<script>${r('demo.js')}</script>
<script>
(function(){var q=new URLSearchParams(location.search),p=q.get('p')||'cz';
if(q.get('limpio'))document.documentElement.classList.add('limpio');
if(p==='comparar'){document.getElementById('cmp').style.display='block';return;}
var D=DEMO[p]||DEMO.cz,N=ChatNucleo.crear(document.getElementById('app'),D.conf);N.pintar(D.filas);
if(q.get('abrir')||matchMedia('(min-width:900px)').matches)N.abrir(D.abrir);
window._N=N;})();
</script></body></html>`;
fs.writeFileSync(OUT, html);
console.log(OUT, Math.round(html.length / 1024) + ' KB');
