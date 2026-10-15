/* ═══ Marketing v3 · Prospectador: una conversación por empresa (#421) ═══
 *
 * Lo propio de Marketing encima del núcleo shared/chat/ (lista, gestos, panel de archivos, grabadora, cola).
 * Rutas (las de ficha, edición y Enviar a CRM siguen en prospectador.js):
 *   #/            lista tipo WhatsApp: dueño, etapa, nivel y origen; «Mis conversaciones» con lo que vence hoy arriba
 *   #/c/<id>      la conversación de UNA empresa: ficha → Enviar a CRM → toques → reasignación → cuarentena o
 *                 reactivación → cierre con motivo. Todo en el mismo hilo.
 *   #/nueva       prospectar una empresa: si ya tiene conversación (nombre normalizado, grupo o lead), abre ESA
 *   #/tablero     ⋮ tablero del equipo (marketing:equipo): frío por nosotros contra frío por mercado
 *
 * Toques en etapa 2: la propuesta mecánica (toque-base.js, la MISMA que usa el motor) responde al instante;
 * el mensaje se guarda sin disparar un trabajo y el motor entra en ráfaga o cuando la persona pide sugerencia.
 * Lo que NUNCA hace: escribir en Odoo por su cuenta (Enviar a CRM y el toque pasan por marketing/odoo-lead).
 */
(function (G) {
  'use strict';
  var M = G.Mkt, U = G.ChatUI, esc = U.esc, $ = function (s) { return document.querySelector(s); };
  /* Los campos propios del v3 viajan DENTRO de `datos`, que va firmado (igual que tarjeta_id en Seguimiento): la cadena
   * canónica de la firma no cambia y chat/suite copia `datos.conversacion_id` al pedido. Un solo lugar lo arma. */
  var C0 = M.cliente, PROPIOS = ['conversacion_id', 'hasta', 'razon', 'empresa', 'ciudad', 'resumen'];
  var C = { producto: C0.producto, clase: C0.clase, subir: C0.subir, webhook: C0.webhook,
    pedir: function (modo, campos, opc) {
      var c = Object.assign({}, campos || {}), d = Object.assign({}, c.datos || {});
      PROPIOS.forEach(function (k) { if (c[k] !== undefined) { d[k] = c[k]; delete c[k]; } });
      if (Object.keys(d).length) c.datos = d;
      return C0.pedir(modo, c, opc);
    } };
  var V = $('#vista'), Q = M.cola();
  var est = { convs: [], lista: null, conv: null, det: null, hilo: null, sondeo: null, gestos: null, barra: null, propLocal: {}, yo: '' };
  var ORIGEN = { radar: 'Radar', manual: 'Manual', investigacion: 'Investigación', nuevo_lead: 'Nuevo lead' };
  var COLOR = { 1: '#b42318', 2: '#b54708', 3: '#3b5a75' };
  var MOTIVO = { sin_necesidad: 'No tiene la necesidad', competencia: 'Eligió competencia', sin_contacto: 'Sin forma de contacto', precalificacion: 'No pasamos precalificación', otro: 'Otro' };
  var CSS = [
    '.mkc-cab{display:flex;gap:8px;align-items:center;padding:8px 12px 2px;flex-wrap:wrap}.mkc-cab .sp{flex:1}',
    '.mkc-info{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px 12px;background:var(--dark2,#fff);border-bottom:1px solid var(--border)}',
    '.mkc-pill{font-size:11.5px;font-weight:600;border-radius:6px;padding:0 7px;line-height:20px;white-space:nowrap;background:var(--dark3,#f6f5f3);color:var(--muted2,#667781)}',
    '.mkc-n1{background:#fde7e5;color:#b42318}.mkc-n2{background:#fef0db;color:#b54708}.mkc-n3{background:#e8eef4;color:#3b5a75}',
    '.mkc-e1{background:#efe9fb;color:#6941c6}.mkc-e2{background:#e0f4f5;color:#0e7c86}.mkc-cuar{background:#e3eefa;color:#2e6db4}.mkc-frio{background:#fff1f0;color:#d13438}.mkc-cerr{background:#eceff1;color:#54656f}',
    '.chl-pill.n1{background:#fde7e5;color:#b42318}.chl-pill.n2{background:#fef0db;color:#b54708}.chl-pill.n3{background:#e8eef4;color:#3b5a75}',
    '.chl-pill.e1{background:#efe9fb;color:#6941c6}.chl-pill.e2{background:#e0f4f5;color:#0e7c86}.chl-pill.cuar{background:#e3eefa;color:#2e6db4}.chl-pill.frio{background:#fff1f0;color:#d13438}.chl-pill.cerr{background:#eceff1;color:#54656f}.chl-pill.du{background:#fff;border:1px solid #e7e3dd;color:#3b4a54}',
    '.chl-av i.n1{background:#fde7e5;color:#b42318}.chl-av i.n2{background:#fef0db;color:#b54708}.chl-av i.n3{background:#e8eef4;color:#3b5a75}',
    '.mkc-etapas{display:flex;gap:2px;padding:6px 12px;font-size:12px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--border)}',
    '.mkc-etapas span{flex-shrink:0;padding:3px 10px;border-radius:12px;color:var(--muted)}.mkc-etapas span.ya{color:var(--muted2)}.mkc-etapas span.ya::before{content:"✓ "}.mkc-etapas span.on{background:#e0f4f5;color:#0e7c86;font-weight:600}',
    '.mkc-acc{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--border)}',
    '.mkc-sis{text-align:center;margin:8px auto;max-width:92%}.mkc-sis span{display:inline-block;font-size:12.5px;padding:6px 12px;border-radius:8px;background:#fff3c4;color:#54656f}',
    '.mkc-sis.frio span{background:#fff1f0;color:#8a1c14}.mkc-sis.cuar span{background:#e3eefa;color:#1d4f8a}.mkc-sis.reac span{background:#e7f6ee;color:#0a5c3c}.mkc-sis.etapa span{background:#e0f4f5;color:#0e7c86;font-weight:600}',
    '.mkc-prop{margin-top:6px;border:1px dashed #9ed3c0;border-radius:10px;padding:8px 10px;font-size:13px;background:rgba(255,255,255,.6)}.mkc-prop b{display:block;font-size:12px;color:#0e7c86;margin-bottom:2px}',
    '.mkc-tab{width:100%;border-collapse:collapse;font-size:13.5px;min-width:520px}.mkc-tab th,.mkc-tab td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}.mkc-tab td.n{text-align:right;font-variant-numeric:tabular-nums}',
    '.mkc-ancho .ch-app{max-width:1400px}.mkc-dos{display:grid;grid-template-columns:minmax(340px,400px) 1fr;align-items:start}',
    '.mkc-dos>aside{position:sticky;top:56px;max-height:calc(100vh - 56px);overflow:auto;border-right:1px solid var(--border);background:var(--dark2,#fff)}',
    '.mkc-dos>section{min-width:0;display:flex;flex-direction:column;min-height:calc(100vh - 56px)}',
    '.mkc-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.mkc-kpi{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:var(--dark2,#fff)}.mkc-kpi b{font-size:22px;display:block;font-variant-numeric:tabular-nums}.mkc-kpi small{color:var(--muted2);font-size:12.5px}'
  ].join('\n');
  (function () { var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); })();

  function yo() { return est.yo || M.sesion().actor || ''; }
  function ir(h) { if (location.hash === h) G.MktConv.ruta(); else location.hash = h; }
  function parar() { clearTimeout(est.sondeo); est.sondeo = null; }
  function corto(u) { u = String(u || ''); return u === yo() ? 'Tú' : u.split(/[._]/)[0].replace(/^./, function (c) { return c.toUpperCase(); }); }
  function etapaTxt(c) { return c.etapa === 2 ? 'Etapa 2 · Seguimiento' : 'Etapa 1 · Prospección'; }
  function pillsDe(c) {
    var p = [{ texto: corto(c.dueno), clase: 'du' }, { texto: 'Etapa ' + c.etapa, clase: 'e' + c.etapa }, { texto: 'N' + c.nivel, clase: 'n' + c.nivel }, { texto: ORIGEN[c.origen] || c.origen }];
    if (c.estado === 'cuarentena') p.push({ texto: 'Cuarentena', clase: 'cuar' });
    if (c.estado === 'cerrada') p.push({ texto: c.cierre === 'por_cotizar' ? 'Por cotizar' : 'Perdida', clase: 'cerr' });
    if (c.frio === 'nos') p.push({ texto: 'Enfriándose', clase: 'frio' });
    if (c.frio === 'mercado' && c.estado === 'curso') p.push({ texto: 'Fría por mercado', clase: 'frio' });
    return p;
  }
  function modal(html) {
    var cap = document.createElement('div'); cap.className = 'ch-visor';
    cap.innerHTML = '<div class="ch-card" style="max-width:440px;width:100%" role="dialog">' + html + '</div>';
    document.body.appendChild(cap); var no = cap.querySelector('[data-no]'); if (no) no.onclick = function () { cap.remove(); };
    return cap;
  }

  // ── Lista ───────────────────────────────────────────────────────────────
  function vacioHtml(ic, t, p) { return '<div class="ch-vacio"><div class="ic">' + ic + '</div><h2>' + esc(t) + '</h2><p>' + p + '</p></div>'; }
  function ancho() { return G.matchMedia('(min-width:900px)').matches; }
  /** Desde 900 px: lista a la izquierda y conversación a la derecha (como WhatsApp en escritorio). */
  function dosPaneles(derecha) {
    document.body.classList.add('mkc-ancho');
    V.innerHTML = '<div class="mkc-dos"><aside id="lado"><div class="mkc-cab"><button class="ch-btn ch-btn-p" style="flex:0 0 auto" data-ir="#/nueva">＋ Empresa</button><span class="sp"></span>' +
      '<button class="ch-btn ch-btn-s" style="flex:0 0 auto;min-width:0" id="mas" aria-label="Más opciones">⋮</button></div><div id="lst"></div><p class="ch-nota" id="mot" style="margin:10px 12px"></p></aside>' +
      '<section id="convp">' + derecha + '</section></div>';
    $('#mas').onclick = menuLista;
    est.lista = G.ChatLista.crear($('#lst'), opcionesLista());
    if (est.convs.length) est.lista.pintar(est.convs);
  }
  async function vLista() {
    parar(); est.conv = null;
    M.cab('Prospectador', 'Marketing · una conversación por empresa', '../index.html');
    if (ancho()) { dosPaneles('<div class="ch-vacio" style="margin-top:20vh"><div class="ic">💬</div><h2>Elige una conversación</h2><p>Una empresa = una conversación, con todo su historial.</p></div>'); await cargarLista(); return; }
    document.body.classList.remove('mkc-ancho');
    V.innerHTML = '<div class="mkc-cab"><button class="ch-btn ch-btn-p" style="flex:0 0 auto" data-ir="#/nueva">＋ Empresa</button><span class="sp"></span>' +
      '<button class="ch-btn ch-btn-s" style="flex:0 0 auto;min-width:0" id="mas" aria-label="Más opciones">⋮</button></div><div id="lst"></div><p class="ch-nota" id="mot" style="margin:10px 12px"></p>';
    $('#mas').onclick = menuLista;
    est.lista = G.ChatLista.crear($('#lst'), opcionesLista());
    await cargarLista();
  }
  function opcionesLista() {
    return {
      producto: 'marketing', buscarTexto: 'Buscar empresa, grupo o ciudad',
      clave: function (c) { return c.id; },
      titulo: function (c) { return c.empresa + (c.ciudad ? ' · ' + c.ciudad.split(',')[0] : ''); },
      vista: function (c) {
        if (c.trabajo) return c.trabajo.estado === 'tomado' ? '✍️ ' + (c.trabajo.paso || 'el motor está trabajando') : '⏳ en cola';
        var u = c.ultimo; if (!u) return 'Sin mensajes todavía';
        return (u.rol === 'persona' ? (u.autor === yo() ? 'Tú: ' : corto(u.autor) + ': ') : u.rol === 'motor' ? 'Motor: ' : '') + u.texto;
      },
      hora: function (c) { return c.vence_hoy ? 'vence hoy' : U.fecha(c.ultimo ? c.ultimo.at : c.updated_at); },
      horaClase: function (c) { return c.vence_hoy ? 'vence' : c.no_leidos ? 'nuevo' : ''; },
      avatar: function (c) { return { letra: c.empresa.charAt(0), color: c.estado === 'curso' ? COLOR[c.nivel] : '#8696a0', insignia: 'N' + c.nivel, insigniaClase: 'n' + c.nivel }; },
      etiquetas: pillsDe, noLeidos: function (c) { return c.no_leidos || 0; }, fijada: function (c) { return c.fijada; },
      buscarEn: function (c) { return [c.empresa, c.grupo, c.ciudad, c.clave].join(' '); },
      filtros: [
        { id: 'vista', unico: true, opciones: [
          { id: 'mias', texto: 'Mis conversaciones', contar: true, f: function (c) { return c.dueno === yo() && c.estado === 'curso' && !c.archivada; } },
          { id: 'todas', texto: 'Todas', f: function (c) { return c.estado !== 'cerrada' && !c.archivada; } },
          { id: 'curso', texto: 'En curso', contar: true, f: function (c) { return c.estado === 'curso' && !c.archivada; } },
          { id: 'cerradas', texto: 'Cerradas', contar: true, f: function (c) { return c.estado === 'cerrada'; } },
          { id: 'cuar', texto: 'En cuarentena', contar: true, f: function (c) { return c.estado === 'cuarentena'; } },
          { id: 'arch', texto: 'Archivadas', f: function (c) { return c.archivada; } }] },
        { id: 'nivel', opciones: [1, 2, 3].map(function (n) { return { id: 'n' + n, texto: 'N' + n, f: function (c) { return c.nivel === n; } }; }) },
        { id: 'origen', opciones: Object.keys(ORIGEN).map(function (k) { return { id: k, texto: ORIGEN[k], f: function (c) { return c.origen === k; } }; }) }
      ],
      menuPersonas: { titulo: 'Dueño', opciones: function () {
        var vistos = {}; est.convs.forEach(function (c) { vistos[c.dueno] = 1; });
        return [{ id: 'todos', texto: 'Todos' }].concat(Object.keys(vistos).sort().map(function (d) { return { id: d, texto: d === yo() ? 'Tú (' + d + ')' : d }; }));
      }, f: function (c, p) { return c.dueno === p; } },
      secciones: function (st) { return st.sel.vista === 'mias' ? [{ titulo: 'Vence hoy', f: function (c) { return c.vence_hoy || (c.nivel === 1 && c.estado === 'curso'); } }] : null; },
      restoTitulo: 'Después',
      orden: function (a, b) { return a.nivel - b.nivel || String((b.ultimo || {}).at || b.updated_at).localeCompare(String((a.ultimo || {}).at || a.updated_at)); },
      acciones: accionesFila, onAbrir: function (c) { ir('#/c/' + c.id); }, seleccionada: function () { return est.conv; },
      vacio: 'No hay conversaciones con estos filtros.'
    };
  }
  async function cargarLista() {
    var r = await C.pedir('conversaciones', {});
    if (!r.ok && r.error === 'MODO_DESCONOCIDO') {
      // Contrato frontend↔servidor (CLAUDE.md §8): la pantalla nueva llegó antes que el servidor del v3. Se usa la vista anterior.
      est.apagado = true; U.toast('Marketing v3 todavía no está encendido en el servidor: se muestra la vista anterior.', 6000);
      G.dispatchEvent(new HashChangeEvent('hashchange')); return;
    }
    if (!r.ok) { $('#lst').innerHTML = vacioHtml('⚠️', 'No se pudo cargar la lista', esc(r.mensaje || r.error) + (r.clase === 'red' ? '<br>Lo que mandes sin señal se guarda en el teléfono.' : '')); return; }
    est.convs = r.conversaciones; est.yo = r.yo || est.yo; est.equipo = r.equipo;
    if (est.lista && $('#lst')) est.lista.pintar(est.convs);
    var m = r.motor; if ($('#mot') && m) $('#mot').textContent = (m.vivo ? '🟢 El motor está despierto' : '🟡 El motor no está despierto: lo que mandes queda en cola') + (m.pendientes ? ' · ' + m.pendientes + ' en cola' : '') + '.';
    if (!est.conv) est.sondeo = setTimeout(function () { if (!location.hash || location.hash === '#/') cargarLista(); }, 30000);
  }
  function accionesFila(c) {
    var a = [{ texto: c.fijada ? '📌 Quitar de fijadas' : '📌 Fijar', hacer: function () { marca(c, c.fijada ? 'conv_desfijar' : 'conv_fijar'); } },
             { texto: '✏️ Renombrar', hacer: function () { renombrar(c); } },
             { texto: c.archivada ? '🗄️ Sacar de archivadas' : '🗄️ Archivar (sin borrar)', hacer: function () { marca(c, c.archivada ? 'conv_desarchivar' : 'conv_archivar'); } }];
    if (M.tiene('marketing:crm')) a.push({ texto: '↪️ Reasignar', nota: 'conserva toda la historia', hacer: function () { reasignar(c, false); } });
    return a;
  }
  function menuLista() {
    G.ChatLista.hoja('Prospectador', [
      { texto: '📊 Tablero del equipo', nota: est.equipo ? 'frío por nosotros contra frío por mercado' : 'pide el permiso marketing:equipo', apagado: !est.equipo, hacer: function () { ir('#/tablero'); } },
      { texto: '📡 Radar en vivo', nota: 'reservado', apagado: true },
      { texto: '🗂️ Pipeline', nota: 'la vista de leads de antes', hacer: function () { location.href = '../../comercial/leads.html'; } },
      { texto: '🔄 Traer «Prospecto Lead» de Odoo', nota: 'crea las conversaciones que falten, sin duplicar', apagado: !M.tiene('marketing:crm'), hacer: traer }
    ]);
  }
  async function traer() {
    var r = await C.pedir('tarjetas_traer', {});
    U.toast(r.ok ? (r.ya_en_cola ? 'Ya está en cola.' : 'En cola: el motor trae los leads y abre las conversaciones que falten.') : (r.mensaje || r.error), 4000);
  }
  async function marca(c, modo) {
    var r = await C.pedir(modo, { conversacion_id: c.id });
    if (!r.ok) { U.toast(r.mensaje || r.error); return; }
    if (est.conv) cargarConv(); else cargarLista();
  }
  function renombrar(c) {
    var cap = modal('<h3>Renombrar</h3><label class="ch-campo">Nombre en la lista<input id="rn" value="' + esc(c.empresa) + '"></label>' +
      '<div class="ch-fila" style="margin-top:10px"><button class="ch-btn ch-btn-s" data-no>Cancelar</button><button class="ch-btn ch-btn-p" id="ok">Guardar</button></div>');
    cap.querySelector('#ok').onclick = async function () {
      var r = await C.pedir('conv_renombrar', { conversacion_id: c.id, texto: cap.querySelector('#rn').value });
      if (r.ok) { cap.remove(); U.toast('Renombrada.'); if (est.conv) cargarConv(); else cargarLista(); } else U.toast(r.mensaje || r.error);
    };
  }
  function reasignar(c, aSeguimiento) {
    var cap = modal('<h3>' + (aSeguimiento ? 'Pasar a quien da seguimiento' : 'Reasignar') + '</h3>' +
      '<label class="ch-campo">Usuario de la suite de quien la va a trabajar<input id="ra" autocomplete="off" placeholder="nombre.apellido"></label><br>' +
      '<label class="ch-campo">Por qué (opcional)<input id="rz"></label>' +
      (aSeguimiento ? '<p class="ch-nota" style="margin-top:8px">Pasa a Etapa 2: se cierra la prospección y el motor consolida sus lecciones de búsqueda. La historia completa se queda.</p>' : '<p class="ch-nota" style="margin-top:8px">La historia completa se queda.</p>') +
      '<div class="ch-fila" style="margin-top:10px"><button class="ch-btn ch-btn-s" data-no>Cancelar</button><button class="ch-btn ch-btn-p" id="ok">' + (aSeguimiento ? 'Pasar' : 'Reasignar') + '</button></div>');
    cap.querySelector('#ok').onclick = async function () {
      var r = await C.pedir('conv_reasignar', { conversacion_id: c.id, texto: cap.querySelector('#ra').value.trim(), razon: cap.querySelector('#rz').value, datos: aSeguimiento ? { etapa: 2 } : {} });
      if (r.ok) { cap.remove(); U.toast('Listo. La historia se queda.'); if (est.conv) cargarConv(); else cargarLista(); } else U.toast(r.mensaje || r.error);
    };
  }

  // ── Nueva empresa ───────────────────────────────────────────────────────
  async function vNueva() {
    parar();
    M.cab('Empresa nueva', 'Prospectador', function () { ir('#/'); });
    var u = await C.pedir('uso', {});
    V.innerHTML = '<div class="ch-wrap"><div class="ch-card">' +
      '<label class="ch-campo">Empresa<input id="emp" autocomplete="off" placeholder="Nombre de la empresa"></label><br>' +
      '<label class="ch-campo">Ciudad de la planta (si la sabes)<input id="ciu" autocomplete="off" placeholder="Ej. Apodaca, NL"></label><br>' +
      '<label class="ch-campo">Algo que el motor deba saber (opcional)<textarea id="not" rows="2" placeholder="Ej. la conocí en la expo, les interesa vapor"></textarea></label></div>' +
      '<div id="pres">' + (u.ok ? M.presupuestoHtml(1, u.uso) : '') + '</div>' +
      '<button class="ch-btn ch-btn-p full" id="go">Prospectar</button>' +
      '<p class="ch-nota">Si la empresa ya tiene conversación (mismo nombre normalizado, grupo o lead de Odoo), se abre esa: no se duplica. Otra planta de la misma marca en otra ciudad es otra conversación.</p>' +
      '<p class="ch-nota">Abrir una conversación nueva necesita señal. Dentro de una conversación, lo que mandes sin señal se guarda en el teléfono.</p></div>';
    $('#go').onclick = async function () {
      var emp = $('#emp').value.trim(), ciu = $('#ciu').value.trim(), nota = $('#not').value.trim();
      if (emp.length < 2) { U.toast('Escribe la empresa.'); return; }
      if (!navigator.onLine) { U.toast('Sin señal: abrir una conversación nueva necesita red.'); return; }
      this.disabled = true;
      var r = await C.pedir('conv_abrir', { datos: { empresa: emp, ciudad: ciu, origen: 'manual' } });
      if (!r.ok) { this.disabled = false; U.toast(r.mensaje || r.error, 5000); return; }
      var c = r.conversacion;
      if (r.ya_existia) U.toast('Ya había conversación de esta empresa: se abrió esa.', 4000);
      else await Q.encolar({ sesion_id: c.sesion_id }, 'prospecta ' + emp + (ciu ? ' en ' + ciu : '') + (nota ? '\n\n' + nota : ''), [], Date.now());
      ir('#/c/' + c.id);
    };
  }

  // ── Conversación ─────────────────────────────────────────────────────────
  async function vConv(id) {
    parar();
    est.conv = id; est.det = null; est.hilo = null; est.gestos = null;
    M.cab('Conversación', 'Prospectador', function () { ir('#/'); });
    var html = '<div id="info" class="mkc-info"></div><div id="etp" class="mkc-etapas"></div><div id="acc" class="mkc-acc"></div>' +
      '<div class="ch-chat" id="chat" aria-live="polite"><p class="ch-nota">Cargando…</p></div><div class="ch-chips" id="chips"></div><div id="barra"></div>';
    if (ancho()) { dosPaneles(html); if (!est.convs.length) C.pedir('conversaciones', {}).then(function (r) { if (r.ok) { est.convs = r.conversaciones; est.yo = r.yo || est.yo; est.equipo = r.equipo; if (est.lista && $('#lst')) est.lista.pintar(est.convs); } }); }
    else { document.body.classList.remove('mkc-ancho'); V.innerHTML = html; }
    est.barra = U.barra($('#barra'), { placeholder: 'Cuenta qué pasó (texto o voz)', onEnviar: enviar });
    U.enlazar($('#chat'), C, Q);
    $('#chat').addEventListener('click', clicChat);
    await cargarConv();
  }
  async function cargarConv() {
    var id = est.conv; if (!id) return;
    var r = await C.pedir('conv', { conversacion_id: id });
    if (!r.ok) { if (r.clase !== 'red') $('#chat').innerHTML = vacioHtml('⚠️', 'No se pudo abrir la conversación', esc(r.mensaje || r.error)); est.sondeo = setTimeout(cargarConv, 15000); return; }
    est.det = r;
    var h = await C.pedir('hilo', { sesion_id: r.conversacion.sesion_id });
    if (h.ok) est.hilo = h.hilo;
    pintarConv();
    var ult = est.hilo && est.hilo.mensajes.length ? est.hilo.mensajes[est.hilo.mensajes.length - 1].id : 0;
    if (ult && r.conversacion.no_leidos) C.pedir('conv_leido', { conversacion_id: id, hasta: ult });
    est.sondeo = setTimeout(cargarConv, est.hilo && est.hilo.trabajo ? 3000 : 15000);
  }
  function pintarConv() {
    var d = est.det, c = d.conversacion;
    M.cab(c.empresa, (c.ciudad ? c.ciudad + ' · ' : '') + etapaTxt(c), function () { ir('#/'); });
    $('#info').innerHTML = pillsDe(c).map(function (p) { return '<span class="mkc-pill ' + (p.clase ? 'mkc-' + p.clase : '') + '">' + esc(p.clase === 'du' ? 'Dueño: ' + p.texto : p.texto) + '</span>'; }).join('') +
      (c.siguiente && c.siguiente.fecha ? '<span class="mkc-pill">Siguiente: ' + esc(c.siguiente.tipo || '') + ' ' + esc(c.siguiente.fecha) + '</span>' : '') +
      (c.leads && c.leads.length ? '<span class="mkc-pill">Odoo: lead ' + c.leads.map(function (l) { return '#' + l; }).join(', ') + '</span>' : '');
    var fichas = d.fichas || [], enviada = fichas.some(function (f) { return f.estado === 'enviada'; }) || (c.leads || []).length;
    var cerrada = c.estado === 'cerrada', fin = c.cierre === 'perdida' ? 'Perdida' : 'Por cotizar';
    $('#etp').innerHTML = '<span class="' + (c.etapa === 1 && !cerrada ? 'on' : 'ya') + '">Etapa 1 · Prospección</span>' +
      '<span class="' + (enviada ? 'ya' : '') + '">' + (enviada ? 'Enviada a CRM' : 'Enviar a CRM') + '</span>' +
      '<span class="' + (c.etapa === 2 && !cerrada ? 'on' : c.etapa === 2 ? 'ya' : '') + '">Etapa 2 · Seguimiento</span>' +
      '<span class="' + (cerrada ? 'on' : '') + '">' + fin + '</span>';
    var crm = M.tiene('marketing:crm'), b = [];
    var fUlt = fichas.filter(function (f) { return f.estado !== 'descartada'; }).slice(-1)[0];
    if (fUlt) b.push('<button class="ch-btn ch-btn-s" data-ir="#/f/' + esc(fUlt.id) + '">📄 Ficha</button>');
    if (fUlt && crm && c.estado === 'curso') b.push('<button class="ch-btn ' + (enviada ? 'ch-btn-s' : 'ch-btn-p') + '" data-ir="#/crm/' + esc(fUlt.id) + '">📤 Enviar a CRM</button>');
    if (c.estado === 'curso' && c.etapa === 1 && crm) b.push('<button class="ch-btn ch-btn-s" data-acc="pasar">➡️ Pasar a seguimiento</button>');
    if (c.estado === 'curso' && c.etapa === 2) b.push('<button class="ch-btn ch-btn-s" data-acc="sugerir">💡 Pedir sugerencia</button>');
    if (c.estado === 'curso' && c.etapa === 2 && d.tarjeta_id && crm) b.push('<button class="ch-btn ch-btn-s" data-acc="odoo" id="aOdoo">✓ Escribir nota y actividad en Odoo</button>');
    if (c.estado === 'cuarentena') b.push('<button class="ch-btn ch-btn-p" data-acc="reactivar">♻️ Reactivar</button>');
    if (c.estado === 'cerrada') b.push('<button class="ch-btn ch-btn-s" data-acc="reabrir">Reabrir</button>');
    b.push('<button class="ch-btn ch-btn-s" data-acc="mas" aria-label="Más opciones de la conversación" style="flex:0 0 auto;min-width:0">⋮</button>');
    $('#acc').innerHTML = b.join('');
    $('#acc').onclick = function (e) { var x = e.target.closest('[data-acc]'); if (x) accion(x.getAttribute('data-acc')); };
    pintarHilo();
  }
  function quienDe(m) { return m.rol === 'motor' ? 'Motor de Marketing' : m.rol === 'sistema' ? 'Sistema' : (m.autor === yo() ? 'Tú' : m.autor); }
  function toquePorCliente(cid) { return (est.det && est.det.toques || []).filter(function (t) { return t.cliente_id === cid; })[0]; }
  function propuestaHtml(p, revisada) {
    if (!p) return '';
    var s = p.siguiente || {};
    return '<div class="mkc-prop"><b>' + (revisada ? 'Propuesta (revisada por el motor)' : 'Propuesta al instante') + '</b>' + esc(p.resumen || '') +
      (s.fecha ? '<br>Siguiente: ' + esc(s.tipo || '') + ' el ' + esc(s.fecha) + ' · ' + esc(s.resumen || '') : '') +
      (p.sugerencia ? '<br><span style="color:var(--muted2)">' + esc(p.sugerencia) + '</span>' : '') +
      '<div style="margin-top:6px"><button class="ch-btn ch-btn-s" style="min-width:0;flex:0 0 auto;height:30px;font-size:12.5px" data-corregir="1">🎙️ Corregir por voz</button></div></div>';
  }
  function burbuja(m) {
    if (m.rol === 'sistema') {
      var k = (m.datos && m.datos.conv) || '';
      var cl = k === 'frio_nos' ? 'frio' : k === 'cuarentena' ? 'cuar' : k === 'reactivacion' ? 'reac' : (k === 'etapa' || k === 'reasignacion' || k === 'cierre') ? 'etapa' : '';
      return '<div class="mkc-sis ' + cl + '"><span>' + esc(m.texto) + '</span></div>';
    }
    var marca = G.ChatGestos ? G.ChatGestos.marcador.leer(m.texto) : null;
    var mm = marca ? Object.assign({}, m, { texto: marca.resto }) : m;
    var html = U.burbuja(mm, yo(), { extra: function (x) {
      var out = '', fid = x.datos && x.datos.ficha_id;
      if (fid) { var f = (est.det.fichas || []).filter(function (y) { return y.id === fid; })[0];
        if (f) out += '<button class="ch-tarjeta" data-ir="#/f/' + esc(f.id) + '"><b>Ver ficha →</b><br><span style="font-size:12px;color:var(--muted2)">Cuenta primero · ' + esc(f.estado) + ' · ' + esc(f.consultas || 0) + ' consultas</span></button>'; }
      if (x.rol === 'persona' && x.cliente_id) {
        var t = toquePorCliente(x.cliente_id);
        if (t) out += propuestaHtml(t.motor || t.propuesta || est.propLocal[x.cliente_id], !!t.motor);
        else if (est.propLocal[x.cliente_id]) out += propuestaHtml(est.propLocal[x.cliente_id], false);
      }
      return out;
    } });
    if (marca) html = html.replace(/(<div class="ch-msg [^"]*">)/, '$1' + G.ChatGestos.citaHtml(marca.id, '', marca.extracto));
    return html.replace('<div class="ch-msg ', '<div data-chg-id="' + esc(m.id) + '" class="ch-msg ');
  }
  async function pintarHilo() {
    var ch = $('#chat'); if (!ch) return;
    var h = est.hilo, html = [];
    if (h) {
      html = h.mensajes.map(burbuja);
      if (h.trabajo) html.push('<div class="ch-escribiendo">' + (h.trabajo.estado === 'tomado' ? '✍️ ' + esc(h.trabajo.paso || 'trabajando…') : '⏳ en cola') + '</div>');
    }
    var cola = (await Q.salida()).filter(function (it) { return h && it.sesion_id === h.sesion.id; });
    cola.forEach(function (it) {
      var p = est.propLocal[it.cliente_id];
      html.push(U.pendiente(it, Q).replace(/<\/div>$/, (p ? propuestaHtml(p, false) : '') + '</div>'));
    });
    var abajo = ch.scrollHeight - ch.scrollTop - ch.clientHeight < 80;
    ch.innerHTML = html.join('') || '<div class="ch-sistema">Escribe qué pasó, pega lo que encontraste o manda una foto.</div>';
    if (abajo || !est.pintado) { window.scrollTo(0, document.body.scrollHeight); est.pintado = true; }
    if (!est.gestos && G.ChatGestos) {
      // Los gestos de la conversación anterior (esta pantalla no recarga entre conversaciones) se quitan antes de volver a engancharlos.
      Array.prototype.forEach.call(document.querySelectorAll('.chg-menu, .chg-barra, .chg-resp'), function (e) { e.remove(); });
      est.gestos = G.ChatGestos.enganchar({
        contenedor: ch, cabecera: document.querySelector('.topbar'), antesDe: $('#barra'), burbujas: '[data-chg-id]',
        mensaje: function (id) { var m = (est.hilo.mensajes || []).filter(function (x) { return x.id === id; })[0]; if (!m) return null;
          var mk = G.ChatGestos.marcador.leer(m.texto); return { quien: quienDe(m), texto: mk ? mk.resto : (m.texto || (m.adjuntos || []).map(function (a) { return a.transcripcion || a.nombre; }).join(' ')), voz: (m.adjuntos || []).some(function (a) { return a.clase === 'audio'; }) }; },
        onResponder: function () {}, onCancelarRespuesta: function () {},
        puedeReenviar: function () { return true; }, onReenviar: reenviar,
        aviso: function (t) { U.toast(t); }
      });
    }
    if (est.gestos) est.gestos.decorar();
  }
  function clicChat(e) {
    if (e.target.closest('[data-corregir]')) { e.preventDefault(); corregir(e.target.closest('[data-chg-id]')); }
  }
  /** Corregir por voz: cita la propuesta y abre el micrófono. */
  function corregir(burb) {
    if (burb && est.gestos) est.gestos.responder(Number(burb.getAttribute('data-chg-id')) || burb.getAttribute('data-chg-id'));
    if (est.barra && est.barra.grabar) est.barra.grabar();
  }
  async function enviar(texto, archivos, at) {
    var c = est.det && est.det.conversacion; if (!c) return;
    if (/^\/cierre\s*$/i.test(texto) && !archivos.length) { cerrar(); return; }
    var r = est.gestos && est.gestos.respondiendo();
    if (r) { var m = (est.hilo.mensajes || []).filter(function (x) { return x.id === r; })[0]; if (m) texto = G.ChatGestos.marcador.armar(r, G.ChatGestos.marcador.quitar(m.texto), texto); est.gestos.enviada(); }
    var it = await Q.encolar({ sesion_id: c.sesion_id }, texto, archivos, at);
    if (c.etapa === 2 && c.estado === 'curso' && texto && G.MktToqueBase) {
      // La propuesta mecánica responde AL INSTANTE (la misma base que usa el motor); se guarda en el toque cuando el mensaje llega.
      var f = (est.det.fichas || []).slice(-1)[0] || null;
      est.propLocal[it.cliente_id] = G.MktToqueBase.proponer({ texto: G.ChatGestos ? G.ChatGestos.marcador.quitar(texto) : texto, hoy: M.hoyISO(), ficha: f });
    }
    pintarHilo();
  }
  function reenviar(id) {
    var m = (est.hilo.mensajes || []).filter(function (x) { return x.id === id; })[0]; if (!m) return;
    var otros = est.convs.length ? est.convs : [];
    var cargar = otros.length ? Promise.resolve(otros) : C.pedir('conversaciones', {}).then(function (r) { est.convs = r.ok ? r.conversaciones : []; return est.convs; });
    cargar.then(function (lst) {
      var cand = lst.filter(function (c) { return c.id !== est.conv && c.estado !== 'cerrada'; }).slice(0, 30);
      if (!cand.length) { U.toast('No hay otra conversación a dónde reenviar.'); return; }
      G.ChatLista.hoja('Reenviar a…', cand.map(function (c) { return { texto: c.empresa, nota: (c.ciudad || '') + ' · N' + c.nivel + ' · ' + corto(c.dueno), hacer: async function () {
        var t = '↪ Reenviado de ' + est.det.conversacion.empresa + ' (' + quienDe(m) + '):\n' + G.ChatGestos.marcador.quitar(m.texto || '');
        await Q.encolar({ sesion_id: c.sesion_id }, t, [], Date.now());
        U.toast('Reenviado a ' + c.empresa + (m.adjuntos && m.adjuntos.length ? ' (solo el texto)' : '') + '.');
      } }; }));
    });
  }
  async function accion(k) {
    var c = est.det.conversacion;
    if (k === 'pasar') return reasignar(c, true);
    if (k === 'sugerir') { var r = await C.pedir('conv_sugerir', { conversacion_id: c.id }); U.toast(r.ok ? 'Pedida. El motor contesta aquí.' : (r.mensaje || r.error)); return cargarConv(); }
    if (k === 'reactivar') { var r2 = await C.pedir('conv_reactivar', { conversacion_id: c.id }); U.toast(r2.ok ? 'Reactivada.' : (r2.mensaje || r2.error)); return cargarConv(); }
    if (k === 'reabrir') { var r3 = await C.pedir('conv_reabrir', { conversacion_id: c.id }); U.toast(r3.ok ? 'Reabierta.' : (r3.mensaje || r3.error)); return cargarConv(); }
    if (k === 'odoo') return aOdoo();
    if (k === 'mas') return masConv();
  }
  function masConv() {
    var c = est.det.conversacion, crm = M.tiene('marketing:crm'), d = est.det;
    G.ChatLista.hoja(c.empresa, [
      { texto: '🗂️ Archivos, enlaces y docs.', nota: 'Enlaces junta la evidencia de la ficha y de las señales', hacer: archivos },
      { texto: '↪️ Reasignar', nota: 'conserva toda la historia', apagado: !crm, hacer: function () { reasignar(c, false); } },
      { texto: '❄️ Mandar a cuarentena', nota: 'se archiva; el lead SIGUE abierto en Odoo con actividad a 90 días', apagado: c.estado !== 'curso', hacer: async function () {
        var r = await C.pedir('conv_cuarentena', { conversacion_id: c.id }); U.toast(r.ok ? 'En cuarentena.' : (r.mensaje || r.error)); cargarConv(); } },
      { texto: '✔ Cerrar · Por cotizar o perdida', nota: 'también escribiendo /cierre', apagado: c.estado === 'cerrada', hacer: cerrar },
      { texto: '⬇️ Exportar chat', hacer: function () { G.ChatPanel.exportar({ titulo: c.empresa + (c.ciudad ? ' · ' + c.ciudad : ''), mensajes: (est.hilo || {}).mensajes || [], quien: quienDe }); } },
      { texto: c.fijada ? '📌 Quitar de fijadas' : '📌 Fijar', hacer: function () { marca(c, c.fijada ? 'conv_desfijar' : 'conv_fijar'); } },
      { texto: '✏️ Renombrar', hacer: function () { renombrar(c); } },
      { texto: c.archivada ? '🗄️ Sacar de archivadas' : '🗄️ Archivar (sin borrar)', hacer: function () { marca(c, c.archivada ? 'conv_desarchivar' : 'conv_archivar'); } },
      { texto: '🕘 Historia de antes (' + (d.historial || []).length + ')', nota: 'tarjetas y sesiones que ahora viven aquí', apagado: !(d.historial || []).length, hacer: historial }
    ]);
  }
  function archivos() {
    var d = est.det, extra = [];
    (d.conversacion.evidencia || []).forEach(function (e) { if (e.liga) extra.push({ titulo: e.titulo || e.liga, liga: e.liga, fecha: e.fecha, nota: 'evidencia · ' + (e.tipo || '') }); });
    (d.fichas || []).forEach(function (f) { (f.por_que || []).forEach(function (x) { if (x.liga) extra.push({ titulo: x.texto || x.liga, liga: x.liga, fecha: x.fecha, nota: 'ficha · por qué esta planta' }); }); });
    G.ChatPanel.archivos({ titulo: 'Archivos, enlaces y docs.', mensajes: (est.hilo || {}).mensajes || [], cliente: C, enlacesExtra: extra });
  }
  function historial() {
    G.ChatLista.hoja('Historia de antes', (est.det.historial || []).map(function (h) {
      return { texto: h.titulo, nota: ({ tarjeta: 'tarjeta de seguimiento', prospectador: 'sesión del Prospectador', lead: 'Nuevo lead', historial: 'historia' }[h.rol] || h.rol) + ' · ' + U.fecha(h.at),
        hacer: async function () {
          var r = await C.pedir('hilo', { sesion_id: h.sesion_id });
          if (r.ok) G.ChatPanel.exportar({ titulo: h.titulo + ' (historia)', mensajes: r.hilo.mensajes, quien: quienDe }); else U.toast(r.mensaje || r.error);
        } };
    }));
  }
  function cerrar() {
    var c = est.det.conversacion;
    var cap = modal('<h3>Cerrar ' + esc(c.empresa) + '</h3>' +
      '<label style="display:flex;gap:8px;padding:6px 0;font-size:14px"><input type="radio" name="ci" value="por_cotizar" checked> Por cotizar (pasa al conceptualizador)</label>' +
      '<label style="display:flex;gap:8px;padding:6px 0;font-size:14px"><input type="radio" name="ci" value="perdida"> Perdida</label>' +
      '<label class="ch-campo ch-oculto" id="mw">Motivo (obligatorio: es lo que aprende)<select id="mo">' + Object.keys(MOTIVO).map(function (k) { return '<option value="' + k + '">' + MOTIVO[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="ch-campo">Nota (obligatoria si el motivo es «Otro»)<input id="mt"></label>' +
      '<div class="ch-fila" style="margin-top:10px"><button class="ch-btn ch-btn-s" data-no>Cancelar</button><button class="ch-btn ch-btn-p" id="ok">Cerrar</button></div>');
    cap.querySelectorAll('input[name=ci]').forEach(function (i) { i.onchange = function () { cap.querySelector('#mw').classList.toggle('ch-oculto', i.value !== 'perdida' || !i.checked); }; });
    cap.querySelector('#ok').onclick = async function () {
      var ci = cap.querySelector('input[name=ci]:checked').value;
      var r = await C.pedir('conv_cerrar', { conversacion_id: c.id, datos: { cierre: ci, motivo: ci === 'perdida' ? cap.querySelector('#mo').value : null, texto: cap.querySelector('#mt').value } });
      if (r.ok) { cap.remove(); U.toast('Cerrada.'); cargarConv(); } else U.toast(r.mensaje || r.error, 5000);
    };
  }
  /** «Con un toque escribe nota y actividad en el lead»: el mismo webhook de antes (marketing/odoo-lead, modo toque). */
  async function aOdoo() {
    var d = est.det, c = d.conversacion, s = c.siguiente || {};
    var ult = (est.hilo.mensajes || []).filter(function (m) { return m.rol === 'persona'; }).slice(-1)[0];
    var nota = (ult ? G.ChatGestos.marcador.quitar(ult.texto) : '') + (c.resumen ? '\n\nResumen: ' + c.resumen : '');
    if (!s.fecha || s.fecha < d.hoy) { U.toast('El siguiente paso no tiene fecha de hoy en adelante: cuenta el toque o pide sugerencia primero.'); return; }
    var datos = { tarjeta_id: d.tarjeta_id, toque_id: null, nota: nota.slice(0, 3800), actividad: { tipo: s.tipo || 'llamada', fecha: s.fecha, resumen: s.resumen || 'Seguimiento' } };
    var b = $('#aOdoo'); if (b) { b.disabled = true; b.textContent = 'enviando…'; }
    var r = await C.webhook('/webhook/marketing/odoo-lead', 'toque', { datos: datos }, { timeout: 60000 });
    if (r.ok && r.estado === 'escrito') U.toast('Escrito y releído en Odoo.', 4000);
    else if (r.error === 'NO_PUBLICADO' || r.error === 'SIN_LEAD') {
      var g = await C.pedir('toque_odoo', { datos: datos });
      U.toast(g.ok ? 'Pendiente de credencial: quedó registrado y se manda sin recapturar.' : (g.mensaje || g.error), 5000);
    } else U.toast(r.clase === 'red' ? 'Sin señal: no se mandó.' : (r.mensaje || r.error));
    cargarConv();
  }

  // ── Tablero del equipo ───────────────────────────────────────────────────
  async function vTablero() {
    parar();
    M.cab('Tablero del equipo', 'Prospectador', function () { ir('#/'); });
    var r = await C.pedir('tablero', {});
    if (!r.ok) { V.innerHTML = '<div class="ch-wrap">' + vacioHtml('🔒', 'Sin tablero', esc(r.mensaje || r.error)) + '</div>'; return; }
    var pp = r.por_persona || [], s = function (k) { return pp.reduce(function (a, p) { return a + (p[k] || 0); }, 0); };
    var sem = {}; (r.curvas || []).forEach(function (x) { var k = 'N' + x.nivel; sem[k] = sem[k] || {}; sem[k][x.semana] = (sem[k][x.semana] || 0) + x.por_cotizar; });
    var semanas = []; for (var i = 7; i >= 0; i--) { var d = new Date(Date.now() - i * 7 * 864e5); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); semanas.push(d.toISOString().slice(0, 10)); }
    V.innerHTML = '<div class="ch-wrap"><div class="mkc-kpis">' +
      '<div class="mkc-kpi"><b>' + s('en_curso') + '</b><small>en curso</small></div><div class="mkc-kpi"><b>' + s('n1') + '</b><small>N1 · se atienden hoy</small></div>' +
      '<div class="mkc-kpi"><b style="color:#d13438">' + s('frio_nos') + '</b><small>frío por nosotros<br>sin toque en el plazo</small></div>' +
      '<div class="mkc-kpi"><b style="color:#2e6db4">' + s('frio_mercado') + '</b><small>frío por mercado<br>cadencia agotada o cuarentena</small></div></div>' +
      '<div class="ch-card" style="overflow-x:auto"><h3>Por persona</h3><p class="ch-nota">«Frío por nosotros» es nuestro: no se tocó a tiempo (N1 2 · N2 5 · N3 10 días hábiles). «Frío por mercado» es del cliente: se agotó la cadencia.</p>' +
      '<table class="mkc-tab"><thead><tr><th>Dueño</th><th>En curso</th><th>Etapa 1</th><th>Etapa 2</th><th>N1</th><th>Frío por nosotros</th><th>Frío por mercado</th><th>Avisos 30 días</th></tr></thead><tbody>' +
      pp.map(function (p) { return '<tr><td>' + esc(p.dueno) + '</td><td class="n">' + p.en_curso + '</td><td class="n">' + p.etapa1 + '</td><td class="n">' + p.etapa2 + '</td><td class="n">' + p.n1 +
        '</td><td class="n" style="color:#d13438">' + p.frio_nos + '</td><td class="n" style="color:#2e6db4">' + p.frio_mercado + '</td><td class="n">' + p.avisos_30d + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="ch-card" style="overflow-x:auto"><h3>Por cotizar por semana y nivel (8 semanas)</h3><table class="mkc-tab"><thead><tr><th>Nivel</th>' + semanas.map(function (w) { return '<th>' + w.slice(5) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      ['N1', 'N2', 'N3'].map(function (k) { return '<tr><td>' + k + '</td>' + semanas.map(function (w) { return '<td class="n">' + ((sem[k] || {})[w] || 0) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' +
      '<p class="ch-nota" style="margin-top:8px">Las curvas por etapa y los «por qué no» los consolida el motor los lunes.</p></div>' +
      '<div class="ch-card"><h3>Avisos recientes</h3>' + ((r.avisos || []).slice(0, 12).map(function (a) { return '<div class="ch-nota" style="margin-top:6px">' + esc(a.texto) + ' · ' + U.fecha(a.at) + '</div>'; }).join('') || '<p class="ch-nota">Sin avisos.</p>') + '</div></div>';
  }

  Q.oir(function (x) {
    if (!est.conv) return;
    if (x && x.enviado && est.det && x.sesion_id === est.det.conversacion.sesion_id) {
      // El mensaje ya llegó: guarda la propuesta mecánica en su toque (si fue toque de etapa 2).
      Object.keys(est.propLocal).forEach(function (cid) {
        C.pedir('conv_propuesta_base', { conversacion_id: est.det.conversacion.id, cliente_id: cid, datos: est.propLocal[cid] }).then(function (r) { if (r.ok && r.toques) delete est.propLocal[cid]; });
      });
      parar(); cargarConv();
    } else pintarHilo();
  });

  try { G.matchMedia('(min-width:900px)').addEventListener('change', function () { if (!est.apagado) G.MktConv.ruta(); }); } catch (e) {}

  G.MktConv = {
    ruta: function () {
      if (est.apagado) return false;
      var h = (location.hash || '#/').slice(2).split('/'), k = h[0], a = h[1];
      if (k === 'c' && a) { vConv(a); return true; }
      if (k === 'nueva') { vNueva(); return true; }
      if (k === 'tablero') { vTablero(); return true; }
      if (k === '' || k === undefined) { vLista(); return true; }
      return false;   // f/, e/, crm/ y s/ los atiende prospectador.js
    },
    parar: parar,
    /** Desde una ficha o una sesión de antes: abre la conversación de su empresa. */
    abrirDe: async function (campos) {
      var r = await C.pedir('conv', campos);
      if (r.ok) ir('#/c/' + r.conversacion.id); else U.toast(r.mensaje || r.error);
    }
  };
})(window);
