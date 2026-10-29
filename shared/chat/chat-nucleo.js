/* ═══ shared/chat · NÚCLEO de chat de la suite (#428) · el chat del conceptualizador para cualquier producto ═══
 *
 * Un solo chat tipo WhatsApp para todos los departamentos. El look y las piezas son las del conceptualizador, subidas
 * SIN reescribirlas por shared/chat/subir-del-conceptualizador.js (chat-nucleo-cz.js, -grabadora.js, -archivos.js).
 * Este archivo solo las arma: marco de una o dos columnas, encabezados, lista, chat, barra de escribir y página.
 *
 * El producto NO trae estilos del chat. Le pasa configuración y contenido:
 *
 *   var N = ChatNucleo.crear(raiz, {
 *     producto, titulo, version, atras: { aria, hacer },            // encabezado de la lista (← regresa a la suite)
 *     lista: { …opciones de ChatLista… },                           // filas, filtros, persona, secciones, ⋮ por fila
 *     menuLista: { attrs, hacer },  fab: { texto, attrs, hacer },   // ⋮ y botón flotante de la lista
 *     placeholder, vacioChat, verAdjunto: k => Promise<{ok,b64,tipo,nombre}>,
 *     onEnviar: (texto, archivos, escritoAt) => …,  onReintentar: id => …,  onDescartar: id => …,
 *     gestos: { …lo que ChatGestos.enganchar recibe además de contenedor/cabecera/antesDe… }
 *   });
 *   N.cabecera({ titulo, sub, vivo, avatar: { texto, color, insignia, insigniaColor }, etiquetas: [{ texto, tono }], mas: { attrs, hacer }, vuelve })
 *   N.acciones([{ texto, hacer, fuerte, attrs }], { titulo, nota, aria })   // V1.53b · bolita ⚡ de sugerencias arriba del micrófono
 *   Opciones V1.53b: leerMas (por omisión true: el texto del otro lado se corta a `renglones` (5) con «Leer más» / «Leer menos»
 *   pegado al final; un mensaje con leerMas:false no se corta) · el fab es la bolita «+» redonda (su texto queda como nombre).
 *   N.franja(html) · N.lado(html|null) · N.fijo([{ texto, icono, fuerte, attrs, hacer }], { id })
 *   N.mensajes(lista, { escribiendo: { texto, pasos: [{ t, s }] }, vacio })      // ver «mensaje» abajo
 *   N.chat() / N.lista() · N.pagina({ titulo, sub, atras, mas }) → el elemento de la página (formularios del producto)
 *   N.toast(t) · N.grabar() · N.escribir(t) · N.salida(itemsDeLaCola) · N.listaChat (ChatLista) · N.pieLista(html)
 *   N.modal({ titulo, html, ancho, alCerrar }) → { el, cuerpo, cerrar }   // V1.54 · popup superpuesto (80 % en PC, casi completo en teléfono)
 *
 *   V1.53c (fts-conceptualizador#11 E4) · MODO MARCO, para un producto que ya trae su conducta (el conceptualizador):
 *     ChatNucleo.crear(raiz, { marco: true, producto, vacioChat, placeholder, ranuras: { arriba, abajo, fijo }, fuera })
 *     El núcleo arma el DOM y el look (lista, encabezado, franja, mensajes, ⇊, botón fijo, barra de escribir, velo y avisos)
 *     y NO engancha conducta: ni lista, ni clics en los mensajes, ni la barra de escribir, ni «Leer más» ni la bolita; los
 *     pone el producto sobre los mismos ids. `ranuras.arriba` va entre la franja y los mensajes; `ranuras.abajo`, entre la
 *     flecha ⇊ y el botón fijo; `ranuras.fijo` es el contenido inicial del botón fijo; `fuera` va en la capa de avisos (sus
 *     hojas y modales heredan el look). El clip y la cámara traen id (#lArch, #lCam). N.modal y N.toast funcionan igual.
 *
 * Un mensaje: { id, rol: 'yo'|'el'|'sistema', quien, texto, md, intro, at, llego_at, estado: 'enviado'|'recibido'|'leido'|'error'|
 *   'pendiente'|'enviando'|'subiendo', progreso, error, adjuntos: [{ id | local, clase, nombre, bytes, duracion_s, transcripcion, blob }],
 *   cita: { id, quien, extracto }, dentro: html, despues: html, tono, marca, gesto }
 *   · tono (solo sistema): ambar (por omisión) · rojo · azul · verde · teal
 *   · marca: clases SIN estilo para que el producto o sus pruebas encuentren algo; nunca CSS
 *   · dentro y despues: el contenido del producto armado con las piezas del núcleo: carta (h4, conj, nota, acc, bt si/no),
 *     chn-liga (b + small), chn-et (tono). Ninguna trae CSS del producto.
 *
 * Reglas que cumple: un mensaje en la cola dice «pendiente de enviar» y NUNCA lleva palomita (CLAUDE.md §15); sin señal lo
 * dice el subtítulo (decisión 1 del #428); nada aquí habla con un servidor por su cuenta.
 */
(function (G) {
  'use strict';
  var Z = G.ChatNucleoCz, GR = G.ChatNucleoGrabadora, AR = G.ChatNucleoArchivos;
  var esc = Z.esc, ico = Z.ico;
  // Lo propio del núcleo (lo que el conceptualizador tiene como contenido suyo y aquí es genérico). Prefijo chn-.
  var CSS = [
    '.chn{display:flex;height:100vh;height:100dvh;max-width:1400px;margin:0 auto;background:#fff;color:#111b21;font-family:Roboto,"Google Sans","Segoe UI",system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.4;-webkit-font-smoothing:antialiased;position:relative}',
    '.chn>.app{flex:1;min-width:0;height:100%}',
    '.chn.en-pag>.app{display:none}.chn-pag{display:none;flex:1;min-width:0;flex-direction:column;background:var(--dark,#fff)}.chn.en-pag>.chn-pag{display:flex}',
    '.chn-pag>.chn-pcab{height:52px;display:flex;align-items:center;gap:4px;padding:0 4px 0 6px;background:#fff;border-bottom:1px solid #e7e3dd;flex-shrink:0}',
    '.chn-pcab .chn-pt{flex:1;min-width:0;line-height:1.15;padding-left:6px}.chn-pcab .chn-pt b{display:block;font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.chn-pcab .chn-pt small{display:block;font-size:12.5px;color:#667781;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.chn-pcab button{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#3b4a54;flex-shrink:0;background:none;border:0;cursor:pointer;font:inherit}',
    '.chn-pcab button:hover{background:rgba(11,20,26,.06)}.chn-pcab svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.chn-pag>main{flex:1;overflow-y:auto;min-height:0}',
    // El texto de «elige una conversación» es del producto (el del conceptualizador dice «cotización»). Solo existe a ≥900 px sin chat abierto.
    '@media(min-width:900px){:where(.chn-cz).app:not(.ver-chat) .chat::before{content:attr(data-vacio)}}',
    ':where(.chn-cz) .chn-franja{flex-shrink:0;background:var(--chn-sup);border-bottom:1px solid var(--chn-linea)}:where(.chn-cz) .chn-franja:empty{display:none}',
    ':where(.chn-cz) .chn-lado{display:none}',
    // V1.53c · en modo marco (.chn-marco) el panel lateral es del producto (su #avance): el núcleo no corre nada ni pinta el suyo.
    '@media(min-width:900px){.chn-cz:not(.chn-marco).con-lado .chat>*:not(#ch):not(.chg-barra):not(.chn-lado):not(.abajo){margin-right:300px}.chn-cz:not(.chn-marco).con-lado .abajo{right:312px}',
    '.chn-cz:not(.chn-marco).con-lado .chn-lado{display:block;position:absolute;top:var(--chn-cab);right:0;bottom:0;width:300px;border-left:1px solid var(--chn-linea);background:var(--chn-sup);overflow-y:auto;z-index:4;padding:12px 16px}}',
    '@media(min-width:900px) and (max-width:1279px){.chn-cz.con-lado.ver-chat #lista{display:none!important}.chn-cz.con-lado.ver-chat #ch .vuelve{display:flex}}',
    // sistema con tono · etiquetas con tono · insignia del avatar
    ':where(.chn-cz) .sis.rojo span{background:#fff1f0;color:#8a1c14}:where(.chn-cz) .sis.azul span{background:#e3eefa;color:#1d4f8a}',
    ':where(.chn-cz) .sis.verde span{background:#e7f6ee;color:#0a5c3c}:where(.chn-cz) .sis.teal span{background:#e0f4f5;color:#0e7c86;font-weight:600}',
    '.chn-et{display:inline-block;font-size:10.5px;font-weight:600;border-radius:6px;padding:0 5px;line-height:17px;white-space:nowrap;background:#f6f5f3;color:#667781;flex-shrink:0}',
    '.chn-et.verde,.chn .chl-pill.verde,.chn .chl-av i.verde{background:#e3f4e3;color:#1f6b1f}',
    '.chn-et.ambar,.chn .chl-pill.ambar,.chn .chl-av i.ambar{background:#fff1d6;color:#8a5300}',
    '.chn-et.rojo,.chn .chl-pill.rojo,.chn .chl-av i.rojo{background:#fde7e5;color:#b42318}',
    '.chn-et.naranja,.chn .chl-pill.naranja,.chn .chl-av i.naranja{background:#fef0db;color:#b54708}',
    '.chn-et.pizarra,.chn .chl-pill.pizarra,.chn .chl-av i.pizarra{background:#e8eef4;color:#3b5a75}',
    '.chn-et.azul,.chn .chl-pill.azul,.chn .chl-av i.azul{background:#e3eefa;color:#2e6db4}',
    '.chn-et.morado,.chn .chl-pill.morado,.chn .chl-av i.morado{background:#efe9fb;color:#6941c6}',
    '.chn-et.teal,.chn .chl-pill.teal,.chn .chl-av i.teal{background:#e0f4f5;color:#0e7c86}',
    '.chn-et.gris,.chn .chl-pill.gris,.chn .chl-av i.gris{background:#eceff1;color:#54656f}',
    '.chn-et.borde,.chn .chl-pill.borde,.chn .chl-av i.borde{background:#fff;border:1px solid #e7e3dd;color:#3b4a54}',
    // tonos de etiqueta del núcleo: el producto elige uno, nunca trae CSS (verde ambar rojo naranja pizarra azul morado teal gris borde)
    ':where(.chn-cz) .av{position:relative}:where(.chn-cz) .av i{position:absolute;right:-3px;bottom:-3px;font-style:normal;font-size:10px;font-weight:700;border-radius:8px;padding:0 4px;line-height:16px;border:2px solid #fff;background:#f6f5f3;color:#667781}',
    ':where(.chn-cz) #ch .av i{font-size:8.5px;line-height:12px;padding:0 3px;right:-6px;bottom:-5px;border-width:1.5px}',
    // tarjeta-liga («Ver ficha →») y etapas de la franja
    ':where(.chn-cz) .chn-liga{display:block;width:100%;margin:6px 0 2px;border:1px solid var(--chn-linea);border-radius:10px;padding:8px 10px;background:#fff;text-align:left;font:inherit;font-size:13px;color:inherit;cursor:pointer}',
    ':where(.chn-cz) .chn-liga b{color:var(--chn-acento-osc);font-size:14px;font-weight:600}:where(.chn-cz) .chn-liga small{display:block;color:var(--chn-sec);font-size:12px}',
    ':where(.chn-cz) .chn-pasos{display:flex;gap:6px;padding:5px 12px;overflow-x:auto;scrollbar-width:none;font-size:12px;white-space:nowrap}:where(.chn-cz) .chn-pasos::-webkit-scrollbar{display:none}',
    ':where(.chn-cz) .chn-pasos span{flex-shrink:0;border-radius:10px;padding:1px 8px;background:var(--chn-sup2);border:1px solid var(--chn-linea);color:var(--chn-ter)}',
    ':where(.chn-cz) .chn-pasos span.hecho{background:#e7f6ee;border-color:#b8e3cb;color:#0b6b45}:where(.chn-cz) .chn-pasos span.hecho::before{content:"✓ "}',
    ':where(.chn-cz) .chn-pasos span.actual{background:var(--chn-aviso);border-color:#f0dc8c;color:#8a6400;font-weight:600}',
    // botón fijo con varios botones: el principal resaltado y, si no caben, se desplazan de lado (decisión 2 del #428)
    ':where(.chn-cz) #fijo .chn-fijo-in{display:flex;gap:8px;max-width:100%;overflow-x:auto;scrollbar-width:none;padding:2px 2px 4px}:where(.chn-cz) #fijo .chn-fijo-in::-webkit-scrollbar{display:none}',
    ':where(.chn-cz) #fijo .chn-fijo-in button{flex-shrink:0;white-space:nowrap}:where(.chn-cz) #fijo button.fuerte{background:var(--chn-acento-osc);color:#fff;border-color:var(--chn-acento-osc)}',
    ':where(.chn-cz) .chn-pie-lista{padding:6px 14px 14px;font-size:12px;color:var(--chn-ter);text-align:center}:where(.chn-cz) .chn-pie-lista:empty{display:none}',
    ':where(.chn-cz) #lista .chl{background:transparent}',
    // V1.53c · con la barra inferior del núcleo (ChatWA.barra), el marco cede sus 32 px (solo en teléfono, como el producto)
    'body.con-barra .chn{height:calc(100dvh - 32px)}body.con-barra:has(.chwa-barra[hidden]) .chn{height:100dvh}@media(min-width:900px){body.con-barra .chn{height:100dvh}}',
    // V1.54 · popup superpuesto (machote, vista previa del correo, PDF): 80 % de la pantalla en PC, casi completa en teléfono
    '.chn-modal{position:fixed;inset:0;z-index:210;background:rgba(11,20,26,.45);display:flex;align-items:center;justify-content:center;padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom))}',
    '.chn-modal-c{background:#fff;color:#111b21;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.28);width:min(80vw,1200px);height:80vh;display:flex;flex-direction:column;overflow:hidden;font-family:Roboto,"Segoe UI",system-ui,-apple-system,sans-serif}',
    '@media(max-width:759px){.chn-modal{padding:6px}.chn-modal-c{width:100%;height:calc(100dvh - 12px);border-radius:12px}}',
    '.chn-modal-cab{display:flex;align-items:center;gap:6px;min-height:52px;padding:0 6px 0 16px;border-bottom:1px solid #e7e3dd;flex-shrink:0}',
    '.chn-modal-cab b{flex:1;min-width:0;font-size:16.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.chn-modal-x{width:44px;height:44px;border-radius:50%;border:0;background:none;color:#3b4a54;font-size:22px;line-height:1;cursor:pointer;flex-shrink:0}.chn-modal-x:hover{background:rgba(11,20,26,.06)}',
    '.chn-modal-cu{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch}',
    // V1.53b (#6) · la bolita «+» redonda (también Marketing): el texto queda como nombre accesible y como aviso al pasar el mouse
    // «Leer más» / «Leer menos»: pegado al final del texto, verde WhatsApp y negrita, mismo tamaño, sin subrayado ni fondo
    // bolita de acciones sugeridas: arriba del micrófono; con la flecha ⇊ a la vista, se sube arriba de ella
  ].join('\n');
  /* Las piezas de V1.53b que también usa un producto que todavía pinta su propio chat («Leer más» y la bolita de acciones):
   * sin el alcance .chn-cz y con los colores del núcleo por omisión. Se ponen una vez, desde crear() o desde la pieza. */
  var CSS_PIEZAS = [
    '.fab.chn-mas{width:56px;height:56px;border-radius:50%;padding:0;gap:0;justify-content:center}.fab.chn-mas .ico{width:28px;height:28px;stroke-width:2.3}',
    '.chn-leer{display:inline;padding:0;margin:0;border:0;background:none;color:var(--chn-acento,#1daa61);font:inherit;font-weight:700;line-height:inherit;cursor:pointer;text-decoration:none}',
    '.chn-acc{position:absolute;right:12px;z-index:6;display:none}.chn-acc.on{display:block}',
    '.chn-rayo{position:relative;width:44px;height:44px;border-radius:50%;background:var(--chn-sup,#fff);color:var(--chn-acento-osc,#008069);border:0;cursor:pointer;box-shadow:0 2px 6px rgba(11,20,26,.22);display:flex;align-items:center;justify-content:center}',
    '.chn-rayo svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}',
    '.chn-rayo .n{position:absolute;top:-5px;right:-4px;min-width:18px;height:18px;border-radius:9px;background:var(--chn-acento,#1daa61);color:#fff;font-size:11px;font-weight:700;line-height:18px;padding:0 5px;text-align:center}',
    '.chn-acc-menu{position:absolute;right:52px;bottom:0;background:var(--chn-sup,#fff);color:var(--chn-texto,#111b21);border-radius:14px;box-shadow:0 4px 18px rgba(11,20,26,.22);padding:6px;min-width:220px;max-width:calc(100vw - 90px)}',
    '.chn-acc-menu[hidden]{display:none}.chn-acc-menu small{display:block;font-size:11.5px;color:var(--chn-sec,#667781);padding:4px 12px}',
    '.chn-acc-menu button{display:block;width:100%;text-align:left;padding:10px 12px;border-radius:9px;font:inherit;font-size:14.5px;line-height:1.3;background:none;border:0;color:inherit;cursor:pointer}',
    '.chn-acc-menu button:hover{background:var(--chn-sup2,#f6f5f3)}.chn-acc-menu button.fuerte{color:var(--chn-acento-osc,#008069);font-weight:600}',
    // V1.63i.7 (#16 punto 3, aditivo: solo con `grupo` o `gris` en los renglones) · encabezados de grupo y renglón en gris con su razón
    '.chn-acc-menu.agrupado{max-height:calc(100vh - 150px);max-height:calc(100dvh - 150px);overflow-y:auto;overscroll-behavior:contain}',
    '.chn-acc-menu small.chn-acc-grupo{font-size:11.5px;font-weight:700;letter-spacing:.02em;color:var(--chn-sec,#667781);padding:8px 12px 2px}',
    '.chn-acc-menu small.chn-acc-grupo:not(:first-child){border-top:1px solid var(--chn-borde,#e9edef);margin-top:4px}',
    '.chn-acc-menu button.gris,.chn-acc-menu button.gris.fuerte{color:var(--chn-sec,#667781);font-weight:500;cursor:default}.chn-acc-menu button.gris:hover{background:none}',
    '.chn-acc-menu .chn-acc-razon{display:block;font-size:12.5px;font-weight:400;line-height:1.3;margin-top:3px;color:var(--chn-sec,#667781)}'
  ].join('\n');
  function cssPiezas() { if (!document.getElementById('chn-css-piezas')) { var s = document.createElement('style'); s.id = 'chn-css-piezas'; s.textContent = CSS_PIEZAS; document.head.appendChild(s); } }
  var RAYO = '<svg class="ico s" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3L5 13h6l-1 8 8-10h-6z"/></svg>';
  /* «Leer más» (V1.53b): corta el texto a N renglones con «…» y el enlace pegado al final del último renglón. Trabaja sobre el
   * DOM ya pintado (el texto puede traer negritas, listas o tablas): se quedan los primeros k caracteres de texto con su
   * estructura y se busca el k más grande que cabe. Sin layout (offsetHeight 0) no corta nada. */
  function boton(id, txt) { var b = document.createElement('button'); b.type = 'button'; b.className = 'chn-leer'; b.dataset.leerId = id; b.textContent = txt; return b; }
  function cortarA(t, html, k) {
    t.innerHTML = html;
    var w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT, null), n, usado = 0, corte = null;
    while ((n = w.nextNode())) {
      if (usado + n.nodeValue.length >= k) { n.nodeValue = n.nodeValue.slice(0, Math.max(0, k - usado)).replace(/[\s.,;:]+$/, ''); corte = n; break; }
      usado += n.nodeValue.length;
    }
    if (!corte) return;
    var r = document.createRange(); r.setStartAfter(corte); r.setEndAfter(t.lastChild); r.deleteContents();
    var donde = corte.parentNode; donde.appendChild(document.createTextNode('… ')); donde.appendChild(boton(t.dataset.leer, 'Leer más'));
  }
  function leerMas(t, html, abierto, renglones) {
    t.innerHTML = html;
    var lh = parseFloat(getComputedStyle(t).lineHeight) || 21, max = lh * renglones + 2;
    if (!t.offsetHeight || t.scrollHeight <= max) return;
    if (abierto) { t.appendChild(document.createTextNode(' ')); t.appendChild(boton(t.dataset.leer, 'Leer menos')); return; }
    var lo = 1, hi = t.textContent.length;
    while (lo < hi) { var mid = Math.ceil((lo + hi) / 2); cortarA(t, html, mid); if (t.scrollHeight <= max) lo = mid; else hi = mid - 1; }
    cortarA(t, html, lo);
  }
  /** «Leer más» sobre un contenedor de mensajes. Marca: el texto lleva data-leer="<id>". aplicar() después de cada repintado. */
  function LeerMas(M, op) {
    op = op || {}; cssPiezas();
    var abierto = {}, html = {}, n = op.renglones || 5;
    M.addEventListener('click', function (e) {
      var x = e.target.closest && e.target.closest('[data-leer-id]'); if (!x || !M.contains(x)) return;
      e.preventDefault(); e.stopPropagation();
      var id = x.dataset.leerId, t = x.closest('[data-leer]'); abierto[id] = !abierto[id];
      if (t && html[id] != null) { leerMas(t, html[id], abierto[id], n); if (!abierto[id] && t.scrollIntoView) t.scrollIntoView({ block: 'nearest' }); }
      if (op.alCambiar) op.alCambiar();
    }, true);
    return { aplicar: function () { Array.prototype.forEach.call(M.querySelectorAll('[data-leer]'), function (t) { var id = t.dataset.leer; html[id] = t.innerHTML; leerMas(t, t.innerHTML, !!abierto[id], n); }); },
      abierto: function (id) { return !!abierto[id]; } };
  }
  /** Bolita de acciones sugeridas en el elemento A (posición: el producto o el núcleo ponen A.style.bottom). */
  function Bolita(A, op0) {
    cssPiezas(); A.classList.add('chn-acc');
    var L = [], op = op0 || {}, ab = false;
    function pintar() {
      A.classList.toggle('on', L.length > 0);
      if (!L.length) { ab = false; A.innerHTML = ''; return; }
      // V1.63i.7 (#16 punto 3) · ADITIVO: con `grupo` en los renglones van encabezados por grupo, y con `gris` el renglón no se hace y
      // dice su razón; `op.n` (número) es lo que cuenta la bolita (0 = sin número). Sin esos campos, el HTML es el de siempre.
      if (typeof op.n === 'number' || L.some(function (x) { return x.grupo || x.gris; })) return pintarAgrupado();
      A.innerHTML = '<button type="button" class="chn-rayo" data-chn="rayo" aria-label="' + esc(op.aria || 'Acciones sugeridas') + '" aria-expanded="' + ab + '">' + RAYO +
        (L.length > 1 ? '<span class="n">' + L.length + '</span>' : '') + '</button><div class="chn-acc-menu" role="menu"' + (ab ? '' : ' hidden') + '>' +
        '<small>' + esc(op.titulo || 'Sugerencias') + '</small>' + L.map(function (x, i) { return '<button type="button" role="menuitem" data-acc-i="' + i + '"' + attrs(x.attrs) + (x.fuerte ? ' class="fuerte"' : '') + '>' + esc(x.texto) + '</button>'; }).join('') +
        (op.nota ? '<small>' + esc(op.nota) + '</small>' : '') + '</div>';
      if (op0 && op0.alCambiar) op0.alCambiar();
    }
    function pintarAgrupado() {
      var n = typeof op.n === 'number' ? op.n : L.length, hayG = L.some(function (x) { return x.grupo; }), prev = null;
      A.innerHTML = '<button type="button" class="chn-rayo" data-chn="rayo" aria-label="' + esc((op.aria || 'Acciones sugeridas') + (n > 0 ? ' · ' + n + ' pendiente' + (n === 1 ? '' : 's') : '')) + '" aria-expanded="' + ab + '">' + RAYO +
        (n > 0 ? '<span class="n">' + n + '</span>' : '') + '</button><div class="chn-acc-menu agrupado" role="menu"' + (ab ? '' : ' hidden') + '>' +
        (hayG ? '' : '<small>' + esc(op.titulo || 'Sugerencias') + '</small>') + L.map(function (x, i) {
          var cab = hayG && x.grupo !== prev ? '<small class="chn-acc-grupo" data-chn-grupo>' + esc(x.grupo || '') + '</small>' : ''; prev = x.grupo;
          return cab + '<button type="button" role="menuitem" data-acc-i="' + i + '"' + attrs(x.attrs) + (x.gris ? ' aria-disabled="true" data-gris' : '') +
            ' class="' + [x.fuerte ? 'fuerte' : '', x.gris ? 'gris' : ''].filter(Boolean).join(' ') + '">' + esc(x.texto) +
            (x.gris ? '<span class="chn-acc-razon" data-chn-razon>' + esc(x.gris) + '</span>' : '') + '</button>'; }).join('') +
        (op.nota ? '<small>' + esc(op.nota) + '</small>' : '') + '</div>';
      if (op0 && op0.alCambiar) op0.alCambiar();
    }
    document.addEventListener('click', function (e) {
      if (!L.length) return;
      var r = e.target.closest && e.target.closest('[data-chn="rayo"]'), i = e.target.closest && e.target.closest('[data-acc-i]');
      if (r && A.contains(r)) { ab = !ab; pintar(); return; }
      // V1.63i.7 · un renglón en gris no se hace ni cierra el menú: avisa (alGris) para que se mida y se lea la razón.
      if (i && A.contains(i) && L[+i.dataset.accI] && L[+i.dataset.accI].gris) { var g = L[+i.dataset.accI]; if (g.alGris) g.alGris(i); return; }
      if (i && A.contains(i)) { ab = false; var x = L[+i.dataset.accI]; pintar(); if (x && x.hacer) x.hacer(i); return; }
      if (ab && !A.contains(e.target)) { ab = false; pintar(); }
    });
    return { poner: function (lista, o2) { L = lista || []; if (o2) op = Object.assign({}, op0 || {}, o2); pintar(); }, abierta: function () { return ab; }, n: function () { return L.length; } };
  }

  /** V1.54 · popup superpuesto con ✕ (Esc y tocar fuera también cierran). Devuelve { el, cuerpo, cerrar }. */
  function modal(op) {
    op = op || {}; cssPiezas(); if (!document.getElementById('chn-css')) { var s0 = document.createElement('style'); s0.id = 'chn-css'; s0.textContent = CSS; document.head.appendChild(s0); }
    var f = document.createElement('div'); f.className = 'chn-modal' + (op.marca ? ' ' + op.marca : ''); f.setAttribute('role', 'dialog'); f.setAttribute('aria-modal', 'true');
    f.innerHTML = '<div class="chn-modal-c"' + (op.ancho ? ' style="width:min(' + esc(op.ancho) + ',100%)"' : '') + '><div class="chn-modal-cab"><b>' + esc(op.titulo || '') + '</b>' + (op.cabecera || '') +
      '<button type="button" class="chn-modal-x" data-chn="modal-x" aria-label="Cerrar">✕</button></div><div class="chn-modal-cu"></div></div>';
    var cu = f.querySelector('.chn-modal-cu'); if (op.html != null) cu.innerHTML = op.html;
    (op.dentro || document.body).appendChild(f);
    var cerrado = false;
    function cerrar() { if (cerrado) return; cerrado = true; f.remove(); document.removeEventListener('keydown', tecla); if (op.alCerrar) op.alCerrar(); }
    function tecla(e) { if (e.key === 'Escape') cerrar(); }
    document.addEventListener('keydown', tecla);
    f.addEventListener('click', function (e) { if (e.target === f || (e.target.closest && e.target.closest('[data-chn="modal-x"]'))) cerrar(); });
    var x = f.querySelector('[data-chn="modal-x"]'); if (x) x.focus();
    return { el: f, cuerpo: cu, cerrar: cerrar };
  }

  function attrs(a) { return Object.keys(a || {}).map(function (k) { return ' ' + k + '="' + esc(a[k]) + '"'; }).join(''); }
  function etiquetas(L) { return (L || []).map(function (e) { return '<span class="chn-et ' + esc(e.tono || '') + '">' + esc(e.texto) + '</span>'; }).join(''); }
  function avatar(a) { a = a || {}; return '<div class="av" style="background:' + esc(a.color || '#8696a0') + '">' + esc(a.texto || '?') +
    (a.insignia ? '<i' + (a.insigniaColor ? ' style="color:' + esc(a.insigniaColor) + '"' : '') + '>' + esc(a.insignia) + '</i>' : '') + '</div>'; }
  /** Palomitas del conceptualizador (cz-app tick): una = recibido, doble = lo están trabajando, doble azul = ya contestó. */
  function tick(estado) {
    if (estado === 'leido') return '<span class="tk leido" title="Ya contestó">' + Z.palomita(true) + '</span>';
    if (estado === 'recibido') return '<span class="tk" title="Lo están trabajando">' + Z.palomita(true) + '</span>';
    if (estado === 'error') return '<span class="tk mal">⚠</span>';
    return '<span class="tk" title="Recibido en el servidor">' + Z.palomita(false) + '</span>';
  }
  var RELOJ = '<svg class="ico xs" viewBox="0 0 24 24" aria-hidden="true" style="width:13px;height:13px">' + Z.P.reloj + '</svg>';

  function crear(raiz, o) {
    Z.ponerCss();
    if (!document.getElementById('chn-css')) { var s = document.createElement('style'); s.id = 'chn-css'; s.textContent = CSS; document.head.appendChild(s); }
    cssPiezas();
    var ST = Z.ST, pag = document.getElementById(o.pagina || 'vista'), R = o.ranuras || {};
    ST.verAdjunto = o.verAdjunto; ST.toast = toast;
    raiz.classList.add('chn');
    raiz.innerHTML = '<div class="app chn-cz' + (o.marco ? ' chn-marco' : '') + '" id="app"><aside id="lista"><div class="cab" id="lcab"></div><div class="scroll"><div id="lchl"></div><div class="chn-pie-lista" id="lpie"></div></div>' +
      (o.fab ? '<button class="fab nueva chn-mas" id="bNueva"' + attrs(Object.assign({ 'aria-label': o.fab.texto, title: o.fab.texto }, o.fab.attrs)) + '>' + ico('nuevo') + '</button>' : '') + '</aside>' +
      '<section class="chat" data-vacio="' + esc(o.vacioChat || 'Elige una conversación.') + '"><header class="cab" id="ch"></header><div class="chn-franja" id="chnFranja"></div>' +
      (R.arriba || '') + '<div id="msgs"></div>' + (o.marco ? '' : '<div class="chn-lado" id="chnLado"></div>') + '<button class="abajo" id="bAbajo" type="button" aria-label="Ir al último mensaje">' + ico('abajo2') +
      '<span class="badge" id="nAbajo" style="display:none"></span></button>' + (R.abajo || '') + '<div class="chn-acc" id="chnAcc"></div><div id="fijo">' + (R.fijo || '') + '</div>' +
      '<div class="compose"><div class="caja"><label class="btn-ic" title="Adjuntar fotos, PDFs o audios" aria-label="Adjuntar" id="lArch">' + ico('clip') +
      '<input type="file" id="fArch" multiple hidden accept="' + esc(o.acepta || 'image/*,application/pdf,audio/*,.doc,.docx,.xls,.xlsx,.csv,.txt') + '"></label>' +
      '<textarea id="in" rows="1" placeholder="' + esc(o.placeholder || 'Mensaje') + '" maxlength="20000" aria-label="Mensaje"></textarea>' +
      '<label class="btn-ic" title="Tomar foto" aria-label="Cámara" id="lCam">' + ico('camara') + '<input type="file" id="fCam" accept="image/*" capture="environment" multiple hidden></label></div>' +
      '<div id="grab"></div><button class="redondo" id="bEnviar" data-b="mic" aria-label="Grabar nota de voz">' + ico('mic') + '</button></div></section>' +
      '</div><section class="chn-pag"><header class="chn-pcab" id="pcab"></header></section>' +
      // Fuera de .app (que se esconde en una página) pero dentro del alcance del look: avisos y velo.
      '<div class="chn-cz chn-capa" style="display:contents"><div class="velo" id="velo"></div><div class="cz-toast" id="toast" role="status" aria-live="polite"></div>' + (o.fuera || '') + '</div>';
    if (pag) raiz.querySelector('.chn-pag').appendChild(pag);
    var $ = function (s) { return raiz.querySelector(s); }, APP = $('.app'), M = $('#msgs'), TA = $('#in'), RD = $('#bEnviar');
    // V1.53c · modo marco: el DOM y el look son del núcleo; la conducta la engancha el producto sobre los mismos ids.
    if (o.marco) {
      var tm = null;
      return { raiz: raiz, marco: true, msgs: M, cabeceraEl: $('#ch'), pagEl: pag,
        toast: function (t, ms) { var e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(tm); tm = setTimeout(function () { e.classList.remove('on'); }, ms || 3400); },
        modal: function (op) { return modal(Object.assign({ dentro: raiz.querySelector('.chn-capa') }, op)); },
        franja: function (h) { $('#chnFranja').innerHTML = h || ''; } };
    }
    var est = { cab: null, abajoN: 0, nEl: null, q: null, gz: null };

    var tt = null;
    function toast(t, ms) { var e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { e.classList.remove('on'); }, ms || 3400); }

    // ── lista: el encabezado del conceptualizador + ChatLista (filas, filtros, persona, secciones, ⋮) ──
    function pintarLcab() {
      $('#lcab').innerHTML = est.q === null
        ? '<button class="btn-ic" id="lAtras" aria-label="' + esc((o.atras && o.atras.aria) || 'Volver a la suite') + '">' + ico('atras') + '</button><div class="tit"><b>' + esc(o.titulo) + '</b>' +
          (o.version ? '<span class="ver" title="Build del módulo">' + esc(o.version) + '</span>' : '') + '</div><button class="btn-ic" id="lBuscar" aria-label="Buscar">' + ico('buscar') + '</button>' +
          (o.menuLista ? '<button class="btn-ic"' + attrs(Object.assign({ 'aria-label': 'Opciones' }, o.menuLista.attrs)) + ' data-chn="lmas">' + ico('mas') + '</button>' : '')
        : '<button class="btn-ic" id="lSalBusca" aria-label="Cerrar la búsqueda">' + ico('atras') + '</button><div class="tit"><input id="lQ" placeholder="' + esc((o.lista && o.lista.buscarTexto) || 'Buscar') + '" aria-label="Buscar" value="' + esc(est.q) + '"></div>';
      var q = $('#lQ'); if (q) { q.focus(); q.oninput = function () { est.q = q.value; N.listaChat.buscar(q.value); }; }
    }
    $('#lcab').addEventListener('click', function (e) {
      if (e.target.closest('#lAtras')) { if (o.atras && o.atras.hacer) o.atras.hacer(); else location.href = '../index.html'; }
      else if (e.target.closest('#lBuscar')) { est.q = ''; pintarLcab(); }
      else if (e.target.closest('#lSalBusca')) { est.q = null; N.listaChat.buscar(''); pintarLcab(); }
      else if (e.target.closest('[data-chn="lmas"]') && o.menuLista.hacer) o.menuLista.hacer();
    });
    if (o.fab && o.fab.hacer) $('#bNueva').onclick = o.fab.hacer;

    // ── chat ──
    function cabecera(k) {
      est.cab = k = k || est.cab || {};
      var sub = !navigator.onLine ? 'sin señal · lo que mandes se guarda en el teléfono' : (k.sub || '');
      $('#ch').innerHTML = '<button class="btn-ic vuelve" id="bVuelve" aria-label="Volver">' + ico('atras') + '</button>' + avatar(k.avatar) +
        '<div class="tx"><b><span>' + esc(k.titulo || '') + '</span>' + etiquetas(k.etiquetas) + (o.version ? '<span class="ver" title="Build del módulo">' + esc(o.version) + '</span>' : '') + '</b>' +
        '<small class="' + (k.vivo && navigator.onLine ? 'vivo' : '') + '">' + esc(sub) + '</small></div>' +
        (k.mas ? '<button class="btn-ic"' + attrs(Object.assign({ 'aria-label': 'Opciones' }, k.mas.attrs)) + ' data-chn="cmas">' + ico('mas') + '</button>' : '');
    }
    $('#ch').addEventListener('click', function (e) {
      if (e.target.closest('#bVuelve')) { if (est.cab && est.cab.vuelve) est.cab.vuelve(); else lista(); }
      else if (e.target.closest('[data-chn="cmas"]') && est.cab.mas && est.cab.mas.hacer) est.cab.mas.hacer();
    });
    G.addEventListener('online', function () { if (est.cab) cabecera(); }); G.addEventListener('offline', function () { if (est.cab) cabecera(); });
    function fijo(L, op) {
      L = L || []; op = op || {};
      var F = $('#fijo'); F.style.display = L.length ? 'flex' : 'none';
      F.innerHTML = L.length ? '<div class="chn-fijo-in"' + (op.id ? ' id="' + esc(op.id) + '"' : '') + '>' + L.map(function (b, i) {
        return '<button type="button" data-fj="' + i + '"' + attrs(b.attrs) + ' class="' + (b.fuerte ? 'fuerte' : '') + '"' + (b.apagado ? ' disabled' : '') + '>' + (b.icono ? ico(b.icono, 's') : '') + esc(b.texto) + '</button>'; }).join('') + '</div>' : '';
      F.onclick = function (e) { var b = e.target.closest('[data-fj]'); if (b && L[+b.dataset.fj].hacer) L[+b.dataset.fj].hacer(b); };
      actualizarAbajo();
    }
    function adjuntos(m) {
      var L = (m.adjuntos || []).map(function (a) { var x = Object.assign({}, a); if (a.local && !a.id) x.local = a.local; return x; });
      return L.length ? Z.adjuntosHtml(L, m.rol === 'yo' && !!m.local) : '';
    }
    function mensajes(L, op) {
      op = op || {}; L = L || [];
      var abajo = M.scrollHeight - M.scrollTop - M.clientHeight < 80, arriba0 = M.scrollTop, h = '', ult = '', prev = null, meta = {};
      L.forEach(function (m) { (m.adjuntos || []).forEach(function (a) { if (a.id) meta[a.id] = a; }); });
      ST.adjuntos = meta;
      L.forEach(function (m) {
        var d = Z.separador(m.at); if (d && d !== ult) { ult = d; h += '<div class="dia"><span>' + esc(d) + '</span></div>'; prev = null; }
        if (m.rol === 'sistema') { h += '<div class="sis ' + esc(m.tono || '') + ' ' + esc(m.marca || '') + '"><span>' + esc(m.texto) + '</span></div>'; prev = null; return; }
        var lado = m.rol === 'yo' ? 'yo' : 'el', sig = prev !== lado; prev = lado;
        var pend = /^(pendiente|enviando|subiendo|error)$/.test(m.estado || '');
        var hora = '<span class="hora">' + (m.llego_at && Math.abs(new Date(m.llego_at) - new Date(m.at)) > 120000 ? '<i title="Escrito sin señal; llegó ' + esc(Z.hora(m.llego_at)) + '">⟲</i> ' : '') + esc(Z.hora(m.at)) +
          (lado !== 'yo' ? '' : m.estado === 'error' ? ' <span class="mal">⚠ no se mandó</span>' : m.estado === 'subiendo' ? ' <span class="cola">' + RELOJ + 'subiendo' + (m.progreso != null ? ' ' + Math.round(m.progreso * 100) + '%' : '') + '</span>'
            : m.estado === 'enviando' ? ' <span class="pend-env">' + RELOJ + 'enviando…</span>' : m.estado === 'pendiente' ? ' <span class="pend-env" title="Guardado en el teléfono con su hora real; se manda solo al volver la señal">' + RELOJ + 'pendiente de enviar</span>' : tick(m.estado)) + '</span>';
        var cuerpo = (m.cita && G.ChatGestos ? G.ChatGestos.citaHtml(m.cita.id, m.cita.quien || '', m.cita.extracto || '') : '') + adjuntos(m) +
          (m.texto ? '<div class="txt"' + (lado === 'el' && o.leerMas !== false && m.leerMas !== false && m.id != null ? ' data-leer="' + esc(m.id) + '"' : '') + '>' + (m.md ? Z.md(m.texto) : esc(m.texto)) + '</div>' : '') + (m.dentro || '') +
          (m.estado === 'subiendo' && m.progreso != null ? '<div class="barra"><i style="width:' + Math.round(m.progreso * 100) + '%"></i></div>' : '') + hora + '<div style="clear:both"></div>' +
          (m.estado === 'error' ? '<div class="corr"><span class="err">' + esc(m.error || '') + '</span><button class="boton" data-reint="' + esc(m.id) + '">Reintentar</button><button class="boton" data-desc="' + esc(m.id) + '">Descartar</button></div>' : '');
        var g = m.gesto !== false && !pend && m.id != null;
        if (m.texto || (m.adjuntos || []).length || m.dentro || m.cita)
          h += '<div class="fila ' + lado + (sig ? ' sig' : '') + '"' + (g ? ' data-msg="' + esc(m.id) + '"' : '') + '><div class="b ' + lado + (m.intro ? ' intro' : '') + (pend ? ' pend' : '') + (m.marca ? ' ' + esc(m.marca) : '') + '"' +
            (g ? ' data-chg-id="' + esc(m.id) + '"' : '') + '>' + (lado === 'el' && sig && m.quien ? '<div class="quien">' + esc(m.quien) + '</div>' : '') + cuerpo + '</div></div>';
        if (m.despues) { h += m.despues; prev = null; }
      });
      if (op.escribiendo) {
        var es = op.escribiendo, P_ = es.pasos || [];
        h += '<div class="fila el sig"><button type="button" class="escribe-b' + (est.abierto ? ' abierto' : '') + '" data-chn="escribe" aria-expanded="' + !!est.abierto + '">' +
          '<span class="top"><span class="pts"><i></i><i></i><i></i></span><em>' + esc(es.texto || 'escribiendo…') + '</em><span class="flecha">' + ico('flecha', 's') + '</span></span><span class="pasos">' +
          (P_.map(function (x, i) { var cur = i === P_.length - 1; return '<span class="paso' + (cur ? '' : ' ya') + '"><span class="m">' + (cur ? '<span class="giro"></span>' : '✓') + '</span><span class="pt-tx">' + esc(x.t) + '</span>' + (x.s != null ? '<span class="t">' + x.s + ' s</span>' : '') + '</span>'; }).join('') ||
            '<span class="paso"><span class="m"><span class="giro"></span></span><span class="pt-tx">en la cola</span></span>') + '</span></button></div>';
      }
      if (!h && op.vacio) h = '<div class="sis"><span>' + esc(op.vacio) + '</span></div>';
      var nEl = L.filter(function (m) { return m.rol === 'el'; }).length, nuevas = est.nEl !== null ? Math.max(0, nEl - est.nEl) : 0; est.nEl = nEl;
      M.innerHTML = h;
      if (est.lm) est.lm.aplicar();
      Z.enlazarVoces(M);
      Array.prototype.forEach.call(M.querySelectorAll('[data-foto]'), function (f) { var k = f.dataset.foto; Z.cargarUrl(k).then(function (u) { if (u) f.style.backgroundImage = 'url(' + u + ')'; }); });
      if (est.gz) est.gz.decorar();
      if (abajo || est.irAbajo) { M.scrollTop = M.scrollHeight; est.irAbajo = false; est.abajoN = 0; } else { M.scrollTop = arriba0; est.abajoN += nuevas; }
      actualizarAbajo();
    }
    M.addEventListener('click', function (e) {
      var x;
      // V1.51: listas largas plegadas por md(); lo que la persona abre se queda abierto al repintar (ST.plg).
      if ((x = e.target.closest('[data-plg-res]'))) { var ab = x.getAttribute('aria-expanded') !== 'true', cu = x.parentNode.querySelector('.plg-cuerpo'); ST.plg[x.dataset.plgRes] = ab; x.setAttribute('aria-expanded', ab); if (cu) cu.hidden = !ab; return; }
      if ((x = e.target.closest('[data-chn="escribe"]'))) { est.abierto = !est.abierto; x.classList.toggle('abierto', est.abierto); x.setAttribute('aria-expanded', est.abierto); return; }
      if ((x = e.target.closest('[data-foto]'))) { var gr = x.dataset.grupo.split(','); AR.visor(gr.map(function (k) { var a = ST.adjuntos[k] || {}; return { id: k, nombre: a.nombre || 'foto', cuando: a.created_at }; }), Math.max(0, gr.indexOf(x.dataset.foto)), { obtener: function (f) { return Z.blobDe(f.id); }, aviso: toast }); return; }
      if ((x = e.target.closest('[data-doc]'))) { var k = x.dataset.doc; Z.blobDe(k).then(function (b) { if (!b) return toast('No se pudo bajar el archivo.'); AR.descargar(b, (ST.adjuntos[k] || {}).nombre || ST.nombres[k] || 'archivo'); }); return; }
      if ((x = e.target.closest('[data-reint]')) && o.onReintentar) { o.onReintentar(x.dataset.reint); return; }
      if ((x = e.target.closest('[data-desc]')) && o.onDescartar) { if (confirm('¿Descartar este mensaje? No se manda.')) o.onDescartar(x.dataset.desc); }
    });
    function actualizarAbajo() {
      var b = $('#bAbajo'), arriba = M.scrollHeight - M.scrollTop - M.clientHeight > 80;
      if (!arriba) est.abajoN = 0;
      b.classList.toggle('on', arriba);
      var F = $('#fijo');
      b.style.bottom = ($('.compose').offsetHeight + (F.style.display !== 'none' ? F.offsetHeight : 0) + (est.gz && est.gz.alto ? est.gz.alto() : 0) + 10) + 'px';
      var n = $('#nAbajo'); n.style.display = est.abajoN ? 'flex' : 'none'; n.textContent = est.abajoN;
      // La bolita de acciones va arriba del micrófono; si la flecha ⇊ está a la vista, se sube arriba de ella.
      var A = $('#chnAcc'); if (A) A.style.bottom = (parseFloat(b.style.bottom) || 0) + (arriba ? 52 : 0) + 'px';   // se sube sobre ⇊
    }
    M.addEventListener('scroll', actualizarAbajo, { passive: true });
    $('#bAbajo').onclick = function () { M.scrollTo({ top: M.scrollHeight, behavior: 'smooth' }); est.abajoN = 0; };

    // ── barra de escribir: texto, archivos y la grabadora del conceptualizador ──
    function modo() { var t = TA.value.trim(); RD.innerHTML = ico(t ? 'enviar' : 'mic'); RD.setAttribute('aria-label', t ? 'Enviar' : 'Grabar nota de voz'); }
    var escrito = null;
    TA.addEventListener('input', function () { if (!escrito) escrito = Date.now(); TA.style.height = 'auto'; TA.style.height = Math.min(TA.scrollHeight, 140) + 'px'; modo(); actualizarAbajo(); });
    TA.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && G.innerWidth >= 900) { e.preventDefault(); RD.click(); } });
    RD.onclick = function () {
      var t = TA.value.trim();
      if (t) { TA.value = ''; TA.style.height = 'auto'; var at = escrito || Date.now(); escrito = null; modo(); est.irAbajo = true; if (o.onEnviar) o.onEnviar(t, [], at); return; }
      grabar();
    };
    async function archivos(files) {
      var L = []; for (var i = 0; i < files.length; i++) { var p = await G.ChatMedios.preparar(files[i]); if (p.error) toast(p.error); else L.push(p); }
      if (!L.length) return;
      var t = TA.value.trim(); TA.value = ''; modo(); est.irAbajo = true; var at = escrito || Date.now(); escrito = null;
      if (o.onEnviar) o.onEnviar(t, L, at);
    }
    $('#fArch').onchange = function () { archivos(this.files).then(function () {}); this.value = ''; };
    $('#fCam').onchange = function () { archivos(this.files).then(function () {}); this.value = ''; };
    async function grabar() {
      if (!GR.puede()) return toast('Este navegador no deja grabar. Usa el 📎 para mandar un audio grabado.');
      if (GR.activa('principal')) return;
      try {
        await GR.iniciar('principal', { alCambiar: pintarGrab, alTerminar: async function (r) {
          if (!r || r.duracion_s < 1) return toast('Muy corta: mantén grabando al menos un segundo.');
          if (r.bytes > G.ChatMedios.TOPE) return toast('La nota pasa de 10 MB: grábala en partes.');
          est.irAbajo = true; if (o.onEnviar) o.onEnviar('', [r], r.escrito_at);
        } });
      } catch (e) { pintarGrab(); return toast(e && e.name === 'NotAllowedError' ? 'Da permiso al micrófono para grabar.' : 'No se pudo grabar: ' + (e.message || e)); }
      pintarGrab();
    }
    function pintarGrab() {   // = pintarGrab de cz-app.js
      var c = $('.compose'), g = $('#grab'), on = GR.activa('principal');
      c.classList.toggle('grabando', on);
      var clave = on ? GR.fase('principal') : '';
      if (g.dataset.k !== clave) { g.dataset.k = clave; g.innerHTML = on ? GR.html('principal') : ''; GR.enlazar(g); }
      g.style.display = on ? 'flex' : 'none';
      actualizarAbajo();
    }

    function chat() { APP.classList.add('ver-chat'); raiz.classList.remove('en-pag'); }
    function lista() { APP.classList.remove('ver-chat'); raiz.classList.remove('en-pag'); est.cab = null; }
    function pagina(p) {
      p = p || {};
      raiz.classList.add('en-pag');
      $('#pcab').innerHTML = '<button id="pAtras" aria-label="Volver"><svg viewBox="0 0 24 24" aria-hidden="true">' + Z.P.atras + '</svg></button><div class="chn-pt"><b>' + esc(p.titulo || '') + '</b><small>' +
        esc(!navigator.onLine ? 'sin señal · lo que mandes se guarda en el teléfono' : (p.sub || '')) + '</small></div>' +
        (p.mas ? '<button' + attrs(Object.assign({ 'aria-label': 'Opciones' }, p.mas.attrs)) + ' data-chn="pmas"><svg viewBox="0 0 24 24" aria-hidden="true">' + Z.P.mas + '</svg></button>' : '');
      $('#pAtras').onclick = function () { if (p.atras) p.atras(); else history.back(); };
      var pm = $('[data-chn="pmas"]'); if (pm) pm.onclick = p.mas.hacer;
      document.title = (p.titulo || '') + (o.titulo ? ' · ' + o.titulo : '');
      return pag;
    }

    var N = {
      raiz: raiz, msgs: M, cabeceraEl: $('#ch'), pagEl: pag,
      listaChat: null,
      cabecera: cabecera, franja: function (h) { $('#chnFranja').innerHTML = h || ''; },
      lado: function (h) { APP.classList.toggle('con-lado', !!h); $('#chnLado').innerHTML = h || ''; },
      fijo: fijo, mensajes: mensajes, chat: chat, lista: lista, pagina: pagina, toast: toast,
      acciones: function (L, op) { est.bolita.poner(L, op); },
      grabar: function () { if (!TA.value.trim()) grabar(); else TA.focus(); },
      escribir: function (t) { TA.value = t || ''; TA.dispatchEvent(new Event('input')); TA.focus(); },
      foco: function () { TA.focus(); },
      salida: function (L) { ST.salida = (L || []).map(function (x) { return { archivos: x.archivos || [] }; }); },
      pieLista: function (h) { $('#lpie').innerHTML = h || ''; },
      irAbajo: function () { est.irAbajo = true; },
      gestos: function () { return est.gz; },
      modal: function (op) { return modal(Object.assign({ dentro: raiz.querySelector('.chn-capa') }, op)); }
    };
    if (o.leerMas !== false) est.lm = LeerMas(M, { renglones: o.renglones || 5, alCambiar: actualizarAbajo });
    est.bolita = Bolita($('#chnAcc'), { alCambiar: actualizarAbajo });
    if (o.lista) N.listaChat = G.ChatLista.crear($('#lchl'), Object.assign({ buscador: false }, o.lista));
    if (G.ChatGestos && o.gestos) est.gz = G.ChatGestos.enganchar(Object.assign({ contenedor: M, cabecera: $('#ch'), antesDe: $('.compose'), burbujas: '[data-chg-id]',
      alCambiar: actualizarAbajo, aviso: function (t) { toast(t); } }, o.gestos));
    pintarLcab(); modo();
    // Todos los avisos de la pantalla con el look del núcleo (también los que el producto pide por ChatUI.toast).
    if (G.ChatUI) G.ChatUI.toast = toast;
    return N;
  }

  G.ChatNucleo = { crear: crear, LeerMas: LeerMas, Bolita: Bolita, modal: modal, esc: esc, ico: ico, md: Z.md, hora: Z.hora, corto: Z.corto, separador: Z.separador, color: Z.color, iniciales: Z.iniciales, tick: tick };
})(window);
