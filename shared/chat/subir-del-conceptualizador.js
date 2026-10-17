#!/usr/bin/env node
/* ═══ shared/chat · sube al núcleo las piezas del conceptualizador, SIN reescribirlas (#428) ═══
 *
 * El conceptualizador es la referencia del chat de la suite. Sus piezas genéricas se COPIAN de su código tal cual,
 * desde una sola fuente, y nadie las edita a mano en shared/chat:
 *
 *   comercial/conceptualizador/index.html  → el CSS del chat (encabezado, lista, fondo, burbujas, palomitas, hora,
 *                                             separador, sistema, «escribiendo…», voz, fotos, documentos, tarjetas,
 *                                             botón fijo, ⇊, barra de escribir, menús), con cada selector bajo
 *                                             `:where(.chn-cz)` (misma especificidad que en el original) y sus
 *                                             variables renombradas a --chn-*.
 *   comercial/conceptualizador/js/cz-app.js → utilidades, íconos, markdown, nota de voz (▶/❚❚, onda, salto, 1×/1.5×/2×),
 *                                             álbum y documento: funciones copiadas por nombre.
 *   js/cz-grabadora.js · js/cz-archivos.js  → tal cual, con su global renombrado (ChatNucleoGrabadora / ChatNucleoArchivos).
 *
 *   node shared/chat/subir-del-conceptualizador.js            regenera chat-nucleo-cz.js, chat-nucleo-grabadora.js y chat-nucleo-archivos.js
 *   node shared/chat/subir-del-conceptualizador.js --revisar  sale con 1 si lo generado no coincide con el conceptualizador de hoy
 *
 * Si el conceptualizador cambia su look o su voz, se corre esto y TODOS los productos lo reciben (CLAUDE.md §20 #25).
 */
'use strict';
const fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..', '..'), CZ = path.join(RAIZ, 'comercial', 'conceptualizador');
const SALE = __dirname, REVISAR = process.argv.includes('--revisar');
const leer = f => fs.readFileSync(f, 'utf8');
const AVISO = n => '/* ═══ GENERADO por shared/chat/subir-del-conceptualizador.js desde ' + n + ' · NO SE EDITA A MANO ═══\n' +
  ' * Para cambiarlo se cambia en el conceptualizador y se vuelve a generar (y se revisa con --revisar). */\n';

/* ── 1 · CSS ─────────────────────────────────────────────────────────────────────────────────────────────── */
const html = leer(path.join(CZ, 'index.html'));
const estilo = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
// Las variables del conceptualizador pasan a --chn-* (modo oscuro después: un solo lugar).
const VARS = ['fondo', 'sup2', 'sup', 'linea', 'texto', 'sec', 'ter', 'acento-osc', 'acento', 'sale', 'entra', 'azul', 'aviso', 'rojo', 'sombra', 'radio',
  'cab', 'pie', 'wa-osc', 'wa-teal', 'green', 'red', 'border', 'd3', 'd4', 'text', 'muted2', 'muted', 'o'];
const renVars = s => s.replace(/--([a-z0-9-]+)/g, (m, v) => VARS.includes(v) ? '--chn-' + v : m);
// Lo genérico del chat. Un selector entra solo si TODAS sus clases e ids están aquí (lo del producto se queda en él).
const GENERICO = new Set(('app ver-chat chat lista ch cab tit ver btn-ic vuelve av tx vivo chips chip on ini chip-av sep scroll fila-arch n nota-arch ses presion t h nuevo u p ' +
  'meta badge quien-ses est enviada cerrada archivada local abierta mas vacio pie fab nueva senal msgs dia sis fila yo sig b el pend quien txt li sp intro hora tk leido mal cola ok ' +
  'barra album n1 n2 n3 n4 foto sube pie-adj doc ic voz play cuerpo onda perilla voz-pie vel trans et giro escribe carta conj acc der boton si no hecho gris corr err ' +
  'nota tabla r tot velo oscuro menu destaca hoja-ses asa cabh dlg cuenta acciones cz-toast compose caja redondo grab bandeja tira mini prep fijo espera fx abajo ' +
  'escribe-b top pts flecha pasos abierto paso m pt-tx bt enviando decide pend-env ico s xs brilla caja-razon lin mic-dict estado acc-r cambiar resalta plg plg-res plg-ic plg-tx plg-cuerpo chev dud trad').split(/\s+/));
function partirReglas(css) {   // reglas de primer nivel: { sel, cuerpo } o { at, interior }
  const out = []; let i = 0;
  while (i < css.length) {
    const a = css.indexOf('{', i); if (a < 0) break;
    const cab = css.slice(i, a).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    let d = 1, j = a + 1; while (j < css.length && d) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; }
    out.push(cab.startsWith('@') ? { at: cab, interior: css.slice(a + 1, j - 1) } : { sel: cab, cuerpo: css.slice(a + 1, j - 1) });
    i = j;
  }
  return out;
}
function tokens(sel) { return (sel.match(/[.#][a-zA-Z][\w-]*/g) || []).map(t => t.slice(1)); }
function selGenerico(sel) {
  if (/^(html|body)\b/.test(sel) || /\bbody\./.test(sel)) return null;
  if (/^\.(czv|cza|grab)\b/.test(sel)) return sel;                                // capas y grabadora: van tal cual
  const T = tokens(sel); if (!T.length && !/^(\*|button|svg)$/.test(sel)) return null;
  if (!T.every(t => GENERICO.has(t))) return null;
  return /^\.app\b/.test(sel) ? ':where(.chn-cz)' + sel : ':where(.chn-cz) ' + sel;   // .app ES la raíz (.app.chn-cz), no un descendiente
}
function reglas(lista) {
  const out = [];
  for (const r of lista) {
    if (r.at) {
      if (/^@keyframes/.test(r.at)) { out.push(r.at + '{' + r.interior + '}'); continue; }
      if (/^@media/.test(r.at) && !/print/.test(r.at)) { const dentro = reglas(partirReglas(r.interior)); if (dentro.length) out.push(r.at + '{' + dentro.join('') + '}'); }
      continue;
    }
    if (r.sel === ':root') { out.push(':where(.chn-cz),.chn-capa{' + r.cuerpo.trim() + '}'); continue; }
    const S = r.sel.split(',').map(s => s.trim()).map(selGenerico).filter(Boolean);
    if (S.length) out.push(S.join(',') + '{' + r.cuerpo.trim() + '}');
  }
  return out;
}
const CSS = renVars(reglas(partirReglas(estilo)).join('\n'));

/* ── 2 · funciones de cz-app.js, copiadas por nombre ─────────────────────────────────────────────────────── */
const app = leer(path.join(CZ, 'js', 'cz-app.js')).split('\n');
function sacar(nombre) {
  const n = nombre.replace(/[$]/g, '\\$&'), re = new RegExp('^  (async )?function ' + n + '\\(|^  var ' + n + ' = ');
  const i = app.findIndex(l => re.test(l)); if (i < 0) throw new Error('No encontré ' + nombre + ' en cz-app.js');
  let d = 0, j = i, vio = false;
  for (; j < app.length; j++) {
    // Sin cadenas, sin escapes y sin clases de caracteres: un regex como /\(([^)]*)\)/ no debe mover la cuenta (V1.51, partirTranscripcion).
    const l = app[j].replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/\\./g, '').replace(/\[[^\]]*\]/g, '[]');
    for (const c of l) { if ('{(['.includes(c)) { d++; vio = true; } else if ('})]'.includes(c)) d--; }
    if (vio && d === 0) break;
  }
  return app.slice(i, j + 1).join('\n');
}
const FUNCIONES = ['$', '$$', 'esc', 'P', 'ico', 'palomita', 'MES', 'fecha', 'hora', 'diaDe', 'separador', 'corto', 'peso', 'iniciales', 'md', 'PALETA', 'color',
  'dur', 'barrasDe', 'durDe', 'vozHtml', 'selVoz', 'pararVoz', 'conDuracion', 'prepararAudio', 'alternar', 'actualizarVoz', 'rafVoz', 'ciclo', 'enlazarVoces',
  'cargarUrl', 'blobDe', 'adjuntosHtml',
  // V1.51 (main, 16-oct): md() pliega las listas largas y adjuntosHtml() separa original, traducción y transcripción dudosa.
  'hashCorto', 'plegable', 'plegarListas', 'partirTranscripcion', 'transcripcionHtml'];
const CUERPO = FUNCIONES.map(sacar).join('\n');
const NUCLEO_CZ = AVISO('comercial/conceptualizador/index.html (CSS) y js/cz-app.js (funciones)') +
`(function (G) {
  'use strict';
  /* Lo que las funciones copiadas esperan encontrar en cz-app.js. El núcleo lo llena (ChatNucleo.crear). */
  var ST = { urls: {}, cargando: {}, nombres: {}, salida: [], player: null, rate: 1, plg: {} };
  var C = { verAdjunto: function (k) { return ST.verAdjunto ? ST.verAdjunto(k) : Promise.resolve({ ok: false }); } };
  function toast(t) { if (ST.toast) ST.toast(t); }
  function adjuntosPorId() { return ST.adjuntos || {}; }
  // ── copiado de cz-app.js ──
` + CUERPO.split('\n').map(l => l).join('\n') + `
  ST.durs = ST.durs || {};
  var CSS = ${JSON.stringify(CSS)};
  function ponerCss() { if (document.getElementById('chn-cz-css')) return; var s = document.createElement('style'); s.id = 'chn-cz-css'; s.textContent = CSS; document.head.appendChild(s); }
  G.ChatNucleoCz = { ST: ST, css: CSS, ponerCss: ponerCss, P: P, ico: ico, esc: esc, palomita: palomita, hora: hora, separador: separador, corto: corto, peso: peso,
    iniciales: iniciales, md: md, color: color, dur: dur, vozHtml: vozHtml, enlazarVoces: enlazarVoces, pararVoz: pararVoz, cargarUrl: cargarUrl, blobDe: blobDe,
    adjuntosHtml: adjuntosHtml };
})(window);
`;

/* ── 3 · grabadora y archivos, tal cual ──────────────────────────────────────────────────────────────────── */
function tal(f, de, a) {
  const s = leer(path.join(CZ, 'js', f));
  if (s.split('G.' + de + ' =').length !== 2) throw new Error(f + ': esperaba UN «G.' + de + ' =»');
  return AVISO('comercial/conceptualizador/js/' + f) + s.replace('G.' + de + ' =', 'G.' + a + ' =');
}
const SALIDAS = {
  'chat-nucleo-cz.js': NUCLEO_CZ,
  'chat-nucleo-grabadora.js': tal('cz-grabadora.js', 'CzGrabadora', 'ChatNucleoGrabadora'),
  'chat-nucleo-archivos.js': tal('cz-archivos.js', 'CzArchivos', 'ChatNucleoArchivos')
};
let malos = 0;
for (const [n, t] of Object.entries(SALIDAS)) {
  const f = path.join(SALE, n);
  // Que coincida con el conceptualizador no prueba que compile: un recorte mal contado da un archivo roto que «coincide» (V1.51).
  try { new (require('vm').Script)(t, { filename: n }); } catch (e) { console.log('  FALLA ' + n + ' no compila: ' + e.message); malos++; continue; }
  if (REVISAR) { const ok = fs.existsSync(f) && leer(f) === t; console.log((ok ? '  OK    ' : '  FALLA ') + n + (ok ? ' coincide con el conceptualizador' : ' NO coincide: corre node shared/chat/subir-del-conceptualizador.js')); if (!ok) malos++; }
  else { fs.writeFileSync(f, t); console.log('escrito ' + n + ' · ' + t.length + ' bytes'); }
}
if (!REVISAR) console.log('CSS: ' + CSS.split('\n').length + ' reglas · funciones: ' + FUNCIONES.length);
process.exit(malos ? 1 : 0);
