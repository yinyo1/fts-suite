/* ═══ Conceptualizador · pantalla ═══
 *
 * Tres vistas: Casos · Conversación · Lo que aprendió. Todo sale del servidor
 * (conceptualizador/suite); la pantalla no guarda estado propio salvo el caso
 * abierto, y NUNCA pinta "listo" sin que el servidor lo diga (§8 fts-suite).
 */
(function (G) {
  'use strict';
  var VERSION = 'V1.00';
  var C = G.CzCliente;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ST = { vista: 'casos', caso: null, hilo: null, motor: null, casos: [], aprendio: null,
             vistos: {}, sondeo: null, enviando: false, filtroAp: 'reglas' };
  try { ST.caso = sessionStorage.getItem('cz_caso') || null; } catch (e) {}

  function toast(t) {
    var d = document.createElement('div'); d.className = 'toast'; d.textContent = t;
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3200);
  }
  function aviso(r) {
    if (!r || r.ok) return;
    toast(r.clase === 'red' ? 'Sin conexión. Se reintenta solo.' : (r.mensaje || ('No se pudo: ' + (r.error || 'error'))));
  }
  var cst = function (iso) { if (!iso) return ''; var d = new Date(iso);
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  var dinero = function (n, m) { if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (m ? ' ' + m : ''); };

  // ── Indicador del motor ─────────────────────────────────────────────────
  function pintarMotor() {
    var m = ST.motor, el = $('#motor');
    if (!m) { el.className = 'motor gris'; el.innerHTML = '<span class="pt"></span>Motor: consultando…'; return; }
    var rapido = m.modo === 'rapido';
    el.className = 'motor ' + (rapido ? 'verde' : 'ambar');
    el.innerHTML = '<span class="pt"></span>' + (rapido ? 'Motor rápido activo' : 'Motor de respaldo (respuestas en minutos)') +
      (m.pendientes ? ' · ' + m.pendientes + ' en cola' : '');
  }

  // ── Casos ───────────────────────────────────────────────────────────────
  function vCasos() {
    var h = '<div class="sec"><div class="sec-t">Nuevo caso</div>' +
      '<div class="nuevo"><input id="nTit" placeholder="Título corto (ej. alimentación 2 bombas)" maxlength="120">' +
      '<div class="fila"><input id="nCli" placeholder="Cliente / planta" maxlength="120">' +
      '<select id="nPais"><option value="mx">MX · MXN</option><option value="usa">USA · USD</option></select></div>' +
      '<textarea id="nTxt" rows="3" placeholder="Platícale el trabajo: alcance, levantamiento, lo que tengas. Primero se satura de datos."></textarea>' +
      '<button class="btn btn-p" id="nOk">Abrir caso</button></div></div>';
    h += '<div class="sec"><div class="sec-t">Casos</div>';
    if (!ST.casos.length) h += '<p class="vacio">Todavía no hay casos.</p>';
    ST.casos.forEach(function (c) {
      h += '<button class="caso" data-id="' + esc(c.id) + '"><div class="ct">' + esc(c.titulo) +
        (c.demo ? ' <span class="chip">demo</span>' : '') + '</div><div class="cm">' + esc(c.cliente || 'sin cliente') + ' · ' +
        esc(c.pais.toUpperCase()) + ' · ' + esc(c.autor) + ' · ' + cst(c.updated_at) +
        (Number(c.pendientes) ? ' · <b class="cola">' + c.pendientes + ' en proceso</b>' : '') +
        (c.estado === 'cerrado' ? ' · cerrado' : '') + '</div></button>';
    });
    $('#vista').innerHTML = h + '</div>';
    $('#nOk').onclick = async function () {
      var txt = $('#nTxt').value.trim(); if (!txt) return toast('Escribe primero de qué se trata el trabajo.');
      this.disabled = true;
      var r = await C.enviar({ titulo: $('#nTit').value.trim(), cliente: $('#nCli').value.trim(), pais: $('#nPais').value, texto: txt });
      this.disabled = false;
      if (!r.ok) return aviso(r);
      abrir(r.caso_id);
    };
    Array.prototype.forEach.call(document.querySelectorAll('.caso'), function (b) { b.onclick = function () { abrir(b.dataset.id); }; });
  }

  // ── Conversación ────────────────────────────────────────────────────────
  var ESTADO = { pendiente: ['en cola', 'cola'], tomado: ['procesando', 'proc'], listo: ['lista', 'ok'], error: ['error', 'err'] };
  function vConversacion() {
    var H = ST.hilo; if (!H || !H.caso) { $('#vista').innerHTML = '<p class="vacio">Cargando…</p>'; return; }
    var c = H.caso, h = '<div class="cab"><b>' + esc(c.titulo) + '</b><span>' + esc(c.cliente || '') + ' · ' + c.pais.toUpperCase() +
      (c.carpeta ? ' · <code>' + esc(c.carpeta.replace(/^casos\//, '')) + '</code>' : '') + '</span></div><div class="chat">';
    var porTrabajo = {}; (H.trabajos || []).forEach(function (t) { porTrabajo[t.id] = t; });
    (H.mensajes || []).forEach(function (m) {
      var t = m.trabajo_id && porTrabajo[m.trabajo_id];
      var est = m.rol === 'usuario' && t ? ESTADO[t.estado] : null;
      h += '<div class="msg ' + (m.rol === 'usuario' ? 'yo' : 'el') + '"><div class="mt">' + esc(m.texto) + '</div>' +
        ((m.adjuntos || []).length ? '<div class="adj">📎 ' + m.adjuntos.map(function (a) { return esc(a.nombre); }).join(', ') + '</div>' : '') +
        '<div class="mm">' + (m.rol === 'usuario' ? esc(m.autor) : 'conceptualizador' + (m.autor.indexOf('respaldo') >= 0 ? ' · respaldo' : '')) +
        ' · ' + cst(m.created_at) + (est ? ' · <span class="st ' + est[1] + '">' + est[0] + (t.error ? ': ' + esc(t.error) : '') + '</span>' : '') + '</div></div>';
    });
    (H.eventos || []).forEach(function (e) {
      h += '<div class="ev">' + (e.tipo === 'rechazar' ? '✕ Rechazó' : e.tipo === 'aceptar' ? '✓ Aceptó' : '• ' + esc(e.tipo)) + ' ' +
        esc(e.concepto || '') + (e.razon ? ' — <i>' + esc(e.razon) + '</i>' : '') + ' <span>' + cst(e.created_at) + '</span></div>';
    });
    h += '</div>';
    // El cuadro va pegado al chat, no flotando: flotante tapaba el BOM (visto en captura a 380 px).
    h += '<div class="comp"><textarea id="cTxt" rows="2" placeholder="Escribe al conceptualizador…"></textarea>' +
      '<div class="fila"><label class="adjb">📎<input type="file" id="cArch" accept=".txt,.md,.csv,.json,text/*" hidden></label>' +
      '<span id="cAdj" class="org"></span><button class="btn btn-p env" id="cOk">Enviar</button></div></div>';
    var U = H.ultima;
    if (U) {
      var decididos = {}; (H.eventos || []).forEach(function (e) { if (e.concepto) decididos[e.concepto] = e.tipo; });
      if ((U.conceptos || []).length) {
        h += '<div class="sec"><div class="sec-t">Conceptos propuestos</div>';
        U.conceptos.forEach(function (k) {
          var d = decididos[k.id + ' · ' + k.concepto] || decididos[k.id];
          h += '<div class="con"><div><b>' + esc(k.id) + '</b> ' + esc(k.concepto) + '<div class="org">origen: ' + esc(k.origen) + '</div></div>' +
            (d ? '<span class="st ' + (d === 'aceptar' ? 'ok' : 'err') + '">' + (d === 'aceptar' ? 'aceptado' : 'rechazado') + '</span>'
               : '<div class="bt"><button class="si" data-k="' + esc(k.id) + '">Aceptar</button><button class="no" data-k="' + esc(k.id) + '">Rechazar</button></div>') + '</div>';
        });
        h += '</div>';
      }
      var B = U.bom || {}, mat = B.materiales || [], mo = B.mano_obra || [];
      if (mat.length || mo.length) {
        var tot = {}; mat.concat(mo).forEach(function (r) { if (typeof r.importe === 'number') tot[r.moneda] = (tot[r.moneda] || 0) + r.importe; });
        h += '<div class="sec"><div class="sec-t">BOM · <span class="costo">COSTO de FTS, no precio de venta</span></div>';
        mat.forEach(function (r) {
          h += '<div class="bom"><div class="bd">' + esc(r.descripcion) + '</div><div class="bn">' + esc(r.qty) + ' ' + esc(r.unidad) + ' · ' + esc(r.tipo) +
            ' · <b>' + dinero(r.importe, r.moneda) + '</b></div><div class="bf">' + esc(r.formula || '') + ' · ' +
            (r.liga && /^https?:/.test(r.liga) ? '<a href="' + esc(r.liga) + '" target="_blank" rel="noopener">' + esc(r.fuente) + '</a>' : esc(r.fuente || 'sin fuente')) + '</div></div>';
        });
        mo.forEach(function (r) {
          h += '<div class="bom mo"><div class="bd">MO · ' + esc(r.rol) + '</div><div class="bn">' + esc(r.personas) + ' pers × ' + esc(r.dias) + ' d × ' +
            esc(r.horas_dia) + ' h × ' + esc(r.tarifa) + ' = <b>' + dinero(r.importe, r.moneda) + '</b></div><div class="bf">' + esc(r.origen || '') + '</div></div>';
        });
        h += '<div class="tot">' + Object.keys(tot).map(function (m) { return 'Costo ' + m + ': <b>' + dinero(tot[m], m) + '</b>'; }).join(' · ') + '</div></div>';
      }
      if ((U.preguntas || []).length) h += '<div class="sec"><div class="sec-t">Preguntas pendientes</div><ol class="preg">' +
        U.preguntas.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol></div>';
    }
    $('#vista').innerHTML = h;
    var chat = $('.chat'); if (chat) chat.scrollTop = chat.scrollHeight;
    var adj = [];
    $('#cArch').onchange = function () {
      var f = this.files[0]; if (!f) return;
      if (f.size > 200000) return toast('Archivo muy grande: pega el texto o súbelo en partes.');
      var rd = new FileReader(); rd.onload = function () { adj = [{ nombre: f.name, tipo: f.type || 'text/plain', texto: String(rd.result) }]; $('#cAdj').textContent = f.name; };
      rd.readAsText(f);
    };
    $('#cOk').onclick = async function () {
      var txt = $('#cTxt').value.trim(); if (!txt || ST.enviando) return;
      ST.enviando = true; this.disabled = true;
      var r = await C.enviar({ caso_id: H.caso.id, texto: txt, adjuntos: adj });
      ST.enviando = false; this.disabled = false;
      if (!r.ok) return aviso(r);
      $('#cTxt').value = ''; await cargarHilo(); sondear(true);
    };
    Array.prototype.forEach.call(document.querySelectorAll('.con .si, .con .no'), function (b) {
      b.onclick = function () { decidir(b.dataset.k, b.classList.contains('si')); };
    });
  }

  async function decidir(id, acepta) {
    var k = (ST.hilo.ultima.conceptos || []).filter(function (x) { return x.id === id; })[0]; if (!k) return;
    var razon = '';
    if (!acepta) {
      razon = (prompt('¿Por qué se rechaza «' + k.concepto + '»? (obligatorio: así aprende)') || '').trim();
      if (razon.length < 3) return toast('Para rechazar hay que decir por qué.');
    }
    var r = await C.evento({ caso_id: ST.hilo.caso.id, tipo: acepta ? 'aceptar' : 'rechazar', concepto: k.id, razon: razon,
      datos: { concepto: k.concepto, origen: k.origen } });
    if (!r.ok) return aviso(r);
    toast(acepta ? 'Aceptado.' : 'Rechazo anotado: se aprende ahora.');
    await cargarHilo(); sondear(true);
  }

  // ── Lo que aprendió ─────────────────────────────────────────────────────
  function vAprendio() {
    var A = ST.aprendio && ST.aprendio.resumen;
    if (!A) { $('#vista').innerHTML = '<p class="vacio">El motor todavía no ha mandado lo aprendido. Aparece con la primera respuesta.</p>'; return; }
    var grupos = [['reglas', 'Reglas', A.reglas], ['observaciones', 'Observaciones', A.observaciones], ['en_disputa', 'En disputa', A.en_disputa],
                  ['cuarentena', 'Cuarentena', A.cuarentena], ['descartadas', 'Descartadas', A.descartadas]];
    var h = '<div class="pst">' + grupos.map(function (g) { return '<button class="pf' + (ST.filtroAp === g[0] ? ' on' : '') + '" data-g="' + g[0] + '">' +
      g[1] + ' <b>' + (g[2] || []).length + '</b></button>'; }).join('') + '</div>';
    var sel = grupos.filter(function (g) { return g[0] === ST.filtroAp; })[0], items = sel[2] || [];
    h += '<p class="org nota">Regla = 3 casos y 2 personas (en USA, 3 casos de Richard). Actualizado ' + cst(ST.aprendio.created_at) + '</p>';
    if (!items.length) h += '<p class="vacio">Nada aquí.</p>';
    items.forEach(function (i) {
      h += '<div class="lec"><div>' + esc(i.texto).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</div><div class="org">' +
        (i.conteo ? i.conteo + '/' + A.umbral + ' casos · ' + esc((i.personas || []).join(', ')) + (i.falta ? ' · ' + esc(i.falta) : '') + ' · ' : '') +
        (i.razon ? esc(i.razon) + ' · ' : '') + esc(i.alcance || '') + (i.cliente ? ' (' + esc(i.cliente) + ')' : '') +
        (i.demo ? ' · <span class="chip">demo</span>' : '') + '</div>' +
        ((i.contradicciones || []).length ? '<div class="disp">' + i.contradicciones.map(function (c) { return '✕ ' + esc(c.autor) + ': ' + esc(c.razon); }).join('<br>') + '</div>' : '') + '</div>';
    });
    $('#vista').innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('.pf'), function (b) { b.onclick = function () { ST.filtroAp = b.dataset.g; vAprendio(); }; });
  }

  // ── Datos y sondeo ──────────────────────────────────────────────────────
  async function cargarCasos() { var r = await C.casos(); if (r.ok) { ST.casos = r.casos || []; ST.motor = r.motor; pintarMotor(); } else aviso(r); }
  async function cargarHilo() {
    if (!ST.caso) return;
    var r = await C.hilo(ST.caso); if (!r.ok) return aviso(r);
    ST.motor = r.motor; pintarMotor();
    var antes = ST.hilo && ST.hilo.caso && ST.hilo.caso.id === ST.caso ? (ST.hilo.mensajes || []).length : null;
    ST.hilo = r.hilo;
    var ahora = (r.hilo.mensajes || []), nuevosMotor = antes !== null ? ahora.slice(antes).filter(function (m) { return m.rol === 'motor'; }) : [];
    if (nuevosMotor.length) avisarLlegada();
    if (ST.vista === 'conversacion') vConversacion();
  }
  function avisarLlegada() {
    toast('Llegó la respuesta del conceptualizador.');
    try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) {}
    try { if (document.hidden && G.Notification && Notification.permission === 'granted') new Notification('Conceptualizador', { body: 'Llegó la respuesta.' }); } catch (e) {}
  }
  function hayEnCurso() { return ST.hilo && (ST.hilo.trabajos || []).some(function (t) { return t.estado === 'pendiente' || t.estado === 'tomado'; }); }
  /** La pantalla consulta sola: cada 4 s mientras hay algo en proceso, cada 20 s si no. */
  function sondear(ya) {
    clearTimeout(ST.sondeo);
    ST.sondeo = setTimeout(async function () {
      if (ST.vista === 'conversacion') await cargarHilo();
      else if (ST.vista === 'casos') { await cargarCasos(); vCasos(); }
      else { var e = await C.estado(); if (e.ok) { ST.motor = e.motor; pintarMotor(); } }
      sondear();
    }, ya ? 1500 : (hayEnCurso() ? 4000 : 20000));
  }

  async function abrir(id) {
    ST.caso = id; try { sessionStorage.setItem('cz_caso', id); } catch (e) {}
    ST.hilo = null; ir('conversacion'); await cargarHilo(); sondear();
    try { if (G.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  }
  async function ir(v) {
    ST.vista = v;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.classList.toggle('on', t.dataset.v === v); });
    if (v === 'casos') { vCasos(); await cargarCasos(); vCasos(); }
    else if (v === 'conversacion') { if (!ST.caso) return ir('casos'); vConversacion(); }
    else { var r = await C.aprendio(); if (r.ok) ST.aprendio = r.aprendizaje; else aviso(r); vAprendio(); }
  }

  G.CzApp = { arrancar: function () {
    if (G.__ftsSinAcceso) return;
    $('#ver').textContent = VERSION;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.onclick = function () { ir(t.dataset.v); }; });
    pintarMotor();
    if (ST.caso) abrir(ST.caso); else ir('casos');
    sondear();
  }, VERSION: VERSION };
})(window);
