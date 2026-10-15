/* ═══ Marketing · Seguimiento en la tarjeta (Lanzamiento 15-oct) ═══
 *
 * Sustituye al grupo de WhatsApp de marketing. Cada prospecto enviado a CRM (o traído de
 * «Prospecto Lead») es una TARJETA con su propio chat sobre el núcleo de chat:
 *   · la persona escribe o graba lo que pasó («marqué al conmutador, me pasaron con compras, no contestó»);
 *   · el motor actualiza el resumen, propone el siguiente paso con fecha y sugiere qué decir o dónde más buscar;
 *   · con UN toque se escriben nota y actividad en el lead de Odoo (marketing/odoo-lead, lista blanca);
 *     si odoo-lead no está encendido, queda registrado como «pendiente de credencial» y no se escribe nada.
 * Responsable visible y reasignable, conservando toda la historia (quién la trajo, quién la trabaja).
 *
 * Rutas: #/ «Mis tarjetas» · #/equipo todas · #/t/<tarjeta>
 * Lo que este archivo NUNCA hace: escribir en Odoo por su cuenta, ni marcar «escrito» sin read-back.
 */
(function (G) {
  'use strict';
  var M = G.Mkt, U = G.ChatUI, esc = U.esc, C = M.cliente, $ = function (s) { return document.querySelector(s); };
  var V = $('#vista'), Q = M.cola();
  var est = { filtro: 'hoy', tarjetas: [], hoy: null, t: null, hilo: null, sondeo: null };
  var yo = function () { return M.sesion().actor || ''; };
  var FILTROS = [['hoy', 'Hoy'], ['vencidas', 'Vencidas'], ['sin_toque', 'Sin toque 7 días'], ['todas', 'Todas']];
  var CANAL = { conmutador: '☎️ conmutador', llamada: '📞 llamada', correo: '✉️ correo', whatsapp: '💬 WhatsApp', visita: '🤝 visita', linkedin: 'in LinkedIn', portal: '🧾 portal', otro: '· otro' };
  var RES = { sin_respuesta: 'sin respuesta', transferido: 'transferido', contesto: 'contestó', cita: 'cita', envio_info: 'pidió info', rechazo: 'rechazo', alta_proveedor: 'alta de proveedor', otro: 'otro' };

  function ir(h) { if (location.hash === h) ruta(); else location.hash = h; }
  function parar() { clearTimeout(est.sondeo); est.sondeo = null; }
  function vacio(ic, t, p) { return '<div class="ch-vacio"><div class="ic">' + ic + '</div><h2>' + esc(t) + '</h2><p>' + p + '</p></div>'; }
  function fechaCorta(f) { if (!f) return '—'; var d = new Date(f + 'T12:00:00'); return isNaN(d) ? f : d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }); }
  function cuenta(L, k) { return L.filter(function (t) { return k === 'todas' ? true : k === 'vencidas' ? t.vencida : k === 'hoy' ? t.hoy : t.sin_toque; }).length; }

  // ── Mis tarjetas ─────────────────────────────────────────────────────────
  async function vLista(equipo) {
    parar();
    M.cab(equipo ? 'Tarjetas del equipo' : 'Mis tarjetas', 'Marketing · Seguimiento', '../index.html');
    if (!M.tiene('marketing:crm')) { V.innerHTML = '<div class="ch-wrap">' + vacio('🔒', 'Seguimiento pide el permiso marketing:crm', 'Pídelo a Esteban.') + '</div>'; return; }
    V.innerHTML = '<div class="ch-wrap"><p class="ch-nota">Cargando tarjetas…</p></div>';
    var r = await C.pedir('tarjetas', { texto: equipo ? 'todas' : 'mias' });
    if (!r.ok) { V.innerHTML = '<div class="ch-wrap"><div class="ch-hall amar"><div class="ic">⚠️</div><div>' + esc(r.mensaje || r.error) + '</div></div></div>'; return; }
    est.tarjetas = r.tarjetas.filter(function (t) { return t.estado === 'abierta' || t.estado === 'pausada'; }); est.hoy = r.hoy; est.equipo = !!equipo;
    pintarLista();
  }
  function pintarLista() {
    var L = est.tarjetas, f = est.filtro;
    var lista = L.filter(function (t) { return f === 'todas' ? true : f === 'vencidas' ? t.vencida : f === 'hoy' ? t.hoy : t.sin_toque; });
    V.innerHTML = '<div class="ch-tabs" role="tablist">' + FILTROS.map(function (x) {
        return '<button class="ch-tab' + (f === x[0] ? ' on' : '') + '" data-f="' + x[0] + '">' + x[1] + ' (' + cuenta(L, x[0]) + ')</button>'; }).join('') + '</div>' +
      '<div class="ch-wrap"><div class="ch-fila"><button class="ch-btn ch-btn-s" data-ir="' + (est.equipo ? '#/' : '#/equipo') + '">' + (est.equipo ? '👤 Solo las mías' : '👥 Las del equipo') + '</button>' +
      '<button class="ch-btn ch-btn-s" id="traer">⤓ Traer «Prospecto Lead» de Odoo</button></div>' +
      (cuenta(L, 'vencidas') ? '<div class="ch-hall rojo"><div class="ic">⏰</div><div><b>' + cuenta(L, 'vencidas') + ' con el siguiente paso vencido.</b> Ábrela, cuenta qué pasó y el motor te propone la nueva fecha.</div></div>' : '') +
      (lista.length ? '<div class="ch-lista">' + lista.map(fila).join('') + '</div>'
        : vacio('📇', f === 'hoy' ? 'Nada para hoy' : 'Nada aquí', 'Cada prospecto que envías a CRM nace aquí como tarjeta. También puedes traer las de «Prospecto Lead».')) + '</div>';
    V.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { est.filtro = b.getAttribute('data-f'); pintarLista(); }; });
    $('#traer').onclick = traer;
  }
  function fila(t) {
    var s = t.siguiente || {};
    var marca = t.vencida ? '<span class="ch-pill r">vencida</span>' : t.hoy ? '<span class="ch-pill o">hoy</span>' : t.sin_toque ? '<span class="ch-pill a">sin toque</span>' : '<span class="ch-pill">' + esc(t.etapa) + '</span>';
    return '<button class="ch-ses" data-ir="#/t/' + esc(t.id) + '"><div class="av">' + esc((t.empresa || '?').charAt(0).toUpperCase()) + '</div>' +
      '<div class="t"><b>' + esc(t.empresa) + (t.ciudad ? ' · ' + esc(t.ciudad) : '') + '</b><span>' + (s.fecha ? fechaCorta(s.fecha) + ' · ' + esc(s.resumen || '') : 'sin siguiente paso') + '</span>' +
      '<span>' + (t.responsable !== yo() ? 'la trabaja ' + esc(t.responsable) + ' · ' : '') + (t.traida_por !== t.responsable ? 'la trajo ' + esc(t.traida_por) : t.toques + ' toque' + (t.toques === 1 ? '' : 's')) + '</span></div>' +
      '<div class="m">' + marca + (t.odoo_pendientes ? '<span class="ch-pill b">' + t.odoo_pendientes + ' por Odoo</span>' : '') + '</div></button>';
  }
  async function traer() {
    var b = $('#traer'); b.disabled = true; b.textContent = 'pidiendo al motor…';
    var r = await C.pedir('tarjetas_traer', {});
    b.disabled = false; b.textContent = '⤓ Traer «Prospecto Lead» de Odoo';
    if (r.ok) U.toast(r.ya_en_cola ? 'Ya está en cola: el motor las trae en cuanto pueda.' : 'En cola. El motor lee «Prospecto Lead» con el conector de solo lectura y las agrega sin duplicar.', 4500);
    else U.toast(r.clase === 'red' ? 'Necesita red.' : (r.mensaje || r.error));
  }

  // ── Una tarjeta: su chat y lo que propone el motor ────────────────────────
  async function vTarjeta(id) {
    parar();
    V.innerHTML = '<div class="ch-wrap"><p class="ch-nota">Abriendo la tarjeta…</p></div>';
    var r = await C.pedir('tarjeta', { datos: { tarjeta_id: id } });
    if (!r.ok) { V.innerHTML = '<div class="ch-wrap">' + vacio('⚠️', 'No se pudo abrir la tarjeta', esc(r.mensaje || r.error)) + '</div>'; return; }
    est.t = r;
    V.innerHTML = '<div id="cab"></div><div class="ch-chat" id="chat" aria-live="polite"></div><div id="barra"></div>';
    U.barra($('#barra'), { placeholder: 'Cuenta qué pasó (o graba una nota)', onEnviar: async function (txt, arch, at) {
      await Q.encolar({ sesion_id: est.t.tarjeta.sesion_id }, txt, arch, at); pintarChat();
    } });
    U.enlazar($('#chat'), C, Q);
    pintarCab(); await refrescar();
  }
  function pintarCab() {
    var r = est.t, t = r.tarjeta, s = t.siguiente || {}, f = r.ficha || {};
    M.cab(t.empresa, (t.ciudad ? t.ciudad + ' · ' : '') + t.etapa, function () { ir('#/'); });
    var ult = (r.toques || []).filter(function (q) { return q.estado === 'procesado'; }).slice(-1)[0];
    var pend = (r.toques || []).filter(function (q) { return q.estado === 'sin_procesar'; }).length;
    var acc = f.acceso || {}, plat = ['compras', 'contratistas'].map(function (k) { var x = acc[k]; if (!x) return ''; x = typeof x === 'string' ? { plataforma: x } : x;
      return x.plataforma && x.plataforma !== 'no_encontrado' ? '<span class="ch-pill b">' + (k === 'compras' ? 'compras: ' : 'contratistas: ') + esc(x.plataforma) + (x.confianza ? ' · ' + esc(x.confianza) : '') + '</span> ' : ''; }).join('');
    $('#cab').innerHTML = '<div class="ch-wrap" style="padding-bottom:4px">' +
      '<div class="ch-card"><div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:180px">' +
      '<div style="font-size:12px;color:var(--muted2)">La trajo <b>' + esc(t.traida_por) + '</b> · la trabaja <b>' + esc(t.responsable) + '</b>' + (t.odoo_lead_id ? ' · lead #' + esc(t.odoo_lead_id) : ' · lead pendiente') + '</div>' +
      '<p style="font-size:14px;margin:6px 0 0">' + esc(t.resumen || 'Sin resumen todavía: cuenta el primer toque.') + '</p>' + (plat ? '<div style="margin-top:6px">' + plat + '</div>' : '') + '</div>' +
      '<div style="text-align:right;flex-shrink:0">' + (t.vencida ? '<span class="ch-pill r">vencida</span>' : t.hoy ? '<span class="ch-pill o">hoy</span>' : '') + ' ' + (t.sin_toque ? '<span class="ch-pill a">sin toque 7 d</span>' : '') + '</div></div></div>' +
      '<div class="ch-card"><h3>Siguiente paso</h3><p style="font-size:14px;margin:0"><b>' + (s.fecha ? fechaCorta(s.fecha) : 'sin fecha') + '</b>' + (s.resumen ? ' · ' + esc(s.resumen) : '') + '</p>' +
      (t.sugerencia ? '<p class="ch-nota" style="margin-top:8px">💡 ' + esc(t.sugerencia) + '</p>' : '') +
      (pend ? '<p class="ch-nota" style="margin-top:8px">⏳ ' + pend + ' toque' + (pend === 1 ? '' : 's') + ' esperando al motor: la propuesta llega aquí.</p>' : '') +
      (ult && ult.canal ? '<p style="font-size:12px;color:var(--muted2);margin:8px 0 0">Último toque: ' + esc(CANAL[ult.canal] || ult.canal) + (ult.resultado ? ' · ' + esc(RES[ult.resultado] || ult.resultado) : '') + (ult.avanzo_etapa ? ' · avanzó' : '') + (ult.odoo ? ' · Odoo: ' + esc(ult.odoo.estado.replace('_', ' ')) : '') + '</p>' : '') +
      '<div class="ch-fila" style="margin-top:10px"><button class="ch-btn ch-btn-g" id="aOdoo"' + (s.fecha ? '' : ' disabled') + '>✓ Escribir nota y actividad en Odoo</button>' +
      '<button class="ch-btn ch-btn-s" id="cambiar">✎ Cambiar</button></div>' +
      '<div class="ch-fila" style="margin-top:6px"><button class="ch-btn ch-btn-s" id="reasignar">👤 Reasignar</button><button class="ch-btn ch-btn-s" id="estado">⋯ Estado</button>' +
      (t.ficha_id ? '<a class="ch-btn ch-btn-s" href="../prospectador/index.html#/f/' + esc(t.ficha_id) + '">📄 Ficha</a>' : '') + '</div></div></div>';
    $('#aOdoo').onclick = aOdoo; $('#cambiar').onclick = cambiar; $('#reasignar').onclick = reasignar; $('#estado').onclick = estado;
  }
  async function refrescar() {
    if (!location.hash.startsWith('#/t/') || !est.t) return;
    var h = await C.pedir('hilo', { sesion_id: est.t.tarjeta.sesion_id });
    if (h.ok) {
      var antes = est.hilo && est.hilo.trabajo;
      est.hilo = h.hilo;
      if (h.hilo.tarjeta && (antes && !h.hilo.trabajo)) {   // el motor acaba de entregar: se relee la tarjeta
        var r = await C.pedir('tarjeta', { datos: { tarjeta_id: est.t.tarjeta.id } }); if (r.ok) { est.t = r; pintarCab(); }
      } else if (h.hilo.tarjeta) { est.t.tarjeta = h.hilo.tarjeta; }
    }
    await pintarChat();
    est.sondeo = setTimeout(refrescar, est.hilo && est.hilo.trabajo ? 3000 : 15000);
  }
  async function pintarChat() {
    var ch = $('#chat'); if (!ch) return;
    var h = est.hilo, html = [];
    if (h) {
      html = h.mensajes.map(function (m) { return U.burbuja(m, yo()); });
      if (h.trabajo) html.push('<div class="ch-escribiendo">' + (h.trabajo.estado === 'tomado' ? '✍️ ' + esc(h.trabajo.paso || 'pensando el siguiente paso…') : '⏳ en cola · el motor propone en cuanto lo tome') + '</div>');
    }
    var cola = (await Q.salida()).filter(function (it) { return it.sesion_id === est.t.tarjeta.sesion_id; });
    cola.forEach(function (it) { html.push(U.pendiente(it, Q)); });
    ch.innerHTML = html.join('') || '<div class="ch-sistema">Cuenta qué pasó: a quién marcaste, qué te dijeron, qué sigue.</div>';
  }

  // ── Acciones ─────────────────────────────────────────────────────────────
  function modal(html) {
    var cap = document.createElement('div'); cap.className = 'ch-visor';
    cap.innerHTML = '<div class="ch-card" style="max-width:440px;width:100%">' + html + '</div>';
    document.body.appendChild(cap); cap.querySelector('[data-no]').onclick = function () { cap.remove(); }; return cap;
  }
  /** «Con un toque escribe nota y actividad en el lead»: odoo-lead si está encendido; si no, queda pendiente de credencial. */
  async function aOdoo() {
    var t = est.t.tarjeta, s = t.siguiente || {};
    var ult = (est.t.toques || []).slice(-1)[0];
    var nota = (ult ? ult.texto : '') + (t.resumen ? '\n\nResumen: ' + t.resumen : '');
    var datos = { tarjeta_id: t.id, toque_id: ult ? ult.id : null, nota: nota.slice(0, 3800), actividad: { tipo: s.tipo || 'llamada', fecha: s.fecha, resumen: s.resumen || 'Seguimiento' } };
    if (s.fecha < est.t.hoy || !s.fecha) { U.toast('El siguiente paso tiene fecha pasada: cámbialo primero.'); return; }
    var b = $('#aOdoo'); b.disabled = true; b.textContent = 'enviando…';
    var r = t.odoo_lead_id ? await C.webhook('/webhook/marketing/odoo-lead', 'toque', { datos: datos }, { timeout: 60000 }) : { ok: false, error: 'NO_PUBLICADO' };
    if (r.ok && r.estado === 'escrito') U.toast('Escrito y releído en Odoo.', 4000);
    else if (r.error === 'NO_PUBLICADO' || r.error === 'SIN_LEAD') {
      var g = await C.pedir('toque_odoo', { datos: datos });
      if (!g.ok) { b.disabled = false; b.textContent = '✓ Escribir nota y actividad en Odoo'; U.toast(g.mensaje || g.error); return; }
      U.toast(t.odoo_lead_id ? 'Pendiente de credencial: no se escribió nada en Odoo; quedó registrado y se manda sin recapturar.' : 'La tarjeta aún no tiene lead en Odoo: quedó registrado y se manda cuando exista.', 5000);
    } else { b.disabled = false; b.textContent = '✓ Escribir nota y actividad en Odoo'; U.toast(r.clase === 'red' ? 'Sin señal: no se mandó.' : (r.mensaje || r.error)); return; }
    var x = await C.pedir('tarjeta', { datos: { tarjeta_id: t.id } }); if (x.ok) { est.t = x; pintarCab(); }
  }
  function cambiar() {
    var s = est.t.tarjeta.siguiente || {};
    var cap = modal('<h3>Siguiente paso</h3><label class="ch-campo">Tipo<select id="st"><option value="llamada">Llamada</option><option value="correo">Correo</option><option value="visita">Visita</option></select></label><br>' +
      '<label class="ch-campo">Fecha<input type="date" id="sf" min="' + esc(est.t.hoy) + '" value="' + esc(s.fecha && s.fecha >= est.t.hoy ? s.fecha : est.t.hoy) + '"></label><br>' +
      '<label class="ch-campo">Qué se va a hacer<input id="sr" value="' + esc(s.resumen || '') + '"></label>' +
      '<div class="ch-fila" style="margin-top:10px"><button class="ch-btn ch-btn-s" data-no>Cancelar</button><button class="ch-btn ch-btn-p" id="ok">Guardar</button></div>');
    cap.querySelector('#st').value = s.tipo || 'llamada';
    cap.querySelector('#ok').onclick = async function () {
      var r = await C.pedir('tarjeta_siguiente', { datos: { tarjeta_id: est.t.tarjeta.id, tipo: cap.querySelector('#st').value, fecha: cap.querySelector('#sf').value, resumen: cap.querySelector('#sr').value.trim() } });
      if (r.ok) { cap.remove(); est.t.tarjeta = r.tarjeta; pintarCab(); U.toast('Guardado.'); } else U.toast(r.mensaje || r.error);
    };
  }
  function reasignar() {
    var cap = modal('<h3>Reasignar</h3><p class="ch-nota">La historia completa se queda; también se queda quién la trajo.</p><br>' +
      '<label class="ch-campo">Usuario de la suite de quien la va a trabajar<input id="ra" autocomplete="off" placeholder="nombre.apellido"></label><br>' +
      '<label class="ch-campo">Por qué (opcional)<input id="rr"></label>' +
      '<div class="ch-fila" style="margin-top:10px"><button class="ch-btn ch-btn-s" data-no>Cancelar</button><button class="ch-btn ch-btn-p" id="ok">Reasignar</button></div>');
    cap.querySelector('#ok').onclick = async function () {
      var r = await C.pedir('tarjeta_reasignar', { texto: cap.querySelector('#ra').value.trim().toLowerCase(), datos: { tarjeta_id: est.t.tarjeta.id, razon: cap.querySelector('#rr').value.trim() } });
      if (r.ok) { cap.remove(); est.t.tarjeta = r.tarjeta; pintarCab(); U.toast('Ahora la trabaja ' + r.tarjeta.responsable + '.'); } else U.toast(r.mensaje || r.error);
    };
  }
  function estado() {
    var cap = modal('<h3>Estado de la tarjeta</h3><label class="ch-campo">Estado<select id="ee"><option value="abierta">Abierta</option><option value="pausada">Pausada</option><option value="ganada">Ganada (pasó a cotizar)</option><option value="perdida">Perdida</option></select></label><br>' +
      '<label class="ch-campo">Por qué (obligatorio si se pausa o se pierde: es lo que aprende)<textarea id="er" rows="2"></textarea></label>' +
      '<div class="ch-fila" style="margin-top:10px"><button class="ch-btn ch-btn-s" data-no>Cancelar</button><button class="ch-btn ch-btn-p" id="ok">Guardar</button></div>');
    cap.querySelector('#ee').value = est.t.tarjeta.estado;
    cap.querySelector('#ok').onclick = async function () {
      var r = await C.pedir('tarjeta_estado', { texto: cap.querySelector('#ee').value, datos: { tarjeta_id: est.t.tarjeta.id, razon: cap.querySelector('#er').value.trim() } });
      if (r.ok) { cap.remove(); est.t.tarjeta = r.tarjeta; pintarCab(); U.toast('Guardado.'); } else U.toast(r.mensaje || r.error);
    };
  }

  // ── Ruteo ────────────────────────────────────────────────────────────────
  function ruta() {
    parar();
    var h = (location.hash || '#/').slice(2).split('/');
    if (h[0] === 't' && h[1]) return vTarjeta(h[1]);
    return vLista(h[0] === 'equipo');
  }
  document.addEventListener('click', function (e) { var t = e.target.closest('[data-ir]'); if (t && !t.disabled) { e.preventDefault(); ir(t.getAttribute('data-ir')); } });
  window.addEventListener('hashchange', ruta);
  Q.oir(function () { if (location.hash.startsWith('#/t/')) pintarChat(); });
  G.MktSeguimiento = { arrancar: async function () {
    U.red(document.getElementById('red'));
    var ok = await Q.iniciar(); if (!ok) U.toast('Este navegador no guarda la cola: no cierres la pestaña sin señal.', 5000);
    ruta();
  } };
})(window);
