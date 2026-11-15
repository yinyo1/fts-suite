/* ═══ DC-3 v1.3.0 (#507 Etapa 3) · trabajadores desde Odoo ═══
 *
 * Lo ÚNICO que cambia en la app es de dónde sale el trabajador: además de capturarlo a mano,
 * se puede buscar en Odoo (webhook seguridad/dc3-empleados) y llega con nombre, CURP y puesto.
 * Pestañas, cursos, fechas, tope de 12 h, PDF y firmas son el código de siempre.
 *
 * Envuelve cuatro funciones existentes (igual que el prototipo aprobado):
 *   addWorker        → la misma captura manual, más el formato oficial de la CURP
 *   renderWorkerList → la misma lista, más origen, puesto y lo que falta por capturar
 *   validarGenerar   → las mismas reglas, más «trabajador incompleto bloquea»
 *   _loteValidar     → las mismas reglas del lote, más «trabajador incompleto bloquea»
 *
 * Acceso: cuenta personal SuiteAuth con scope dc3:empleados, petición firmada con HMAC del
 * propio token + nonce (retardos/lib/sesion.js, la misma librería que verifica el servidor).
 * Sin sesión, sin scope, sin red o con error del servidor: la app sigue en captura manual.
 *
 * Datos personales: la CURP vive SOLO en memoria (inst.workers). Nada de este archivo escribe
 * en localStorage, sessionStorage ni caché; la búsqueda no devuelve CURP (solo «tiene CURP»),
 * y la CURP llega únicamente al elegir a la persona.
 */
(function () {
  'use strict';
  var URL_DC3 = 'https://primary-production-5c3c.up.railway.app/webhook/seguridad/dc3-empleados';
  var SCOPE = 'dc3:empleados';
  var TIEMPO_MS = 8000;
  var ERR_SESION = { TOKEN_AUSENTE: 1, TOKEN_MALFORMADO: 1, FIRMA_INVALIDA: 1, PAYLOAD_ILEGIBLE: 1, TOKEN_EXPIRADO: 1, SCOPE_INSUFICIENTE: 1 };
  var CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var O = window.DC3_ODOO = { cayo: null, CURP_RE: CURP_RE, URL: URL_DC3 };

  // ── Sesión: ¿puede esta persona buscar en Odoo? ──
  function estadoSesion() {
    var A = window.SuiteAuth;
    if (!A || !A.isValid || !A.isValid()) return 'sin_sesion';
    if (!A.tieneScope(SCOPE)) return 'sin_scope';
    return 'ok';
  }
  O.estadoSesion = estadoSesion;

  function nonce() {
    var A = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', o = '', r = new Uint8Array(24);
    try { crypto.getRandomValues(r); } catch (e) { for (var k = 0; k < 24; k++) r[k] = Math.floor(Math.random() * 256); }
    for (var i = 0; i < r.length; i++) o += A.charAt(r[i] % A.length);
    return o;
  }

  // Una sola puerta para el servidor. Clasifica la respuesta en UN lugar (CLAUDE.md §20 #12b):
  //   sesion   → la llave no vale (o le falta el permiso)
  //   red      → no hubo respuesta en 8 s
  //   servidor → contestó con un error suyo
  // Un tropiezo de red de un instante (la conexión falla en menos de 3 s) se reintenta UNA vez
  // con un nonce nuevo; un timeout de 8 s no se reintenta: ahí ya se pasa a captura manual.
  async function llamar(datos) {
    var t0 = Date.now(), r = await llamarUnaVez(datos);
    if (r && r.tipo === 'red' && r.error === 'SIN_RESPUESTA' && Date.now() - t0 < 3000) r = await llamarUnaVez(datos);
    return r;
  }
  async function llamarUnaVez(datos) {
    var token = window.SuiteAuth && window.SuiteAuth.getToken ? window.SuiteAuth.getToken() : null;
    if (!token) return { ok: false, tipo: 'sesion', error: 'TOKEN_AUSENTE' };
    if (!window.RetardosSesion) return { ok: false, tipo: 'servidor', error: 'SIN_FIRMA' };
    var ts = Date.now(), n = nonce();
    var cuerpo = { token: token, ts: ts, nonce: n, sig: window.RetardosSesion.firmar(token, ts, n, datos), datos: datos };
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var reloj = setTimeout(function () { if (ctl) ctl.abort(); }, TIEMPO_MS);
    var res, j;
    try {
      res = await fetch(URL_DC3, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: ctl ? ctl.signal : undefined });
    } catch (e) { clearTimeout(reloj); return { ok: false, tipo: 'red', error: (e && e.name === 'AbortError') ? 'SIN_RESPUESTA_8S' : 'SIN_RESPUESTA' }; }
    clearTimeout(reloj);
    try { j = await res.json(); } catch (e) { j = null; }
    if (!j) return { ok: false, tipo: 'servidor', error: 'HTTP_' + res.status };
    if (j.ok === false && ERR_SESION[j.error]) {
      if (j.error !== 'SCOPE_INSUFICIENTE' && window.SuiteAuth && window.SuiteAuth.logout) window.SuiteAuth.logout();
      return Object.assign({ tipo: 'sesion' }, j);
    }
    if (j.ok === false) return Object.assign({ tipo: 'servidor' }, j);
    return j;
  }
  O.llamar = llamar;

  // ── Qué le falta a un trabajador para poder imprimir ──
  function faltan(w) {
    var f = [];
    if (!w.ap || !w.nom) f.push('nombre');
    if (!w.curp) f.push('curp');
    else if (!CURP_RE.test(w.curp)) f.push('curp_invalida');
    return f;
  }
  var TXT = { nombre: 'nombre sin separar en apellidos', curp: 'sin CURP', curp_invalida: 'CURP inválida' };
  O.faltan = faltan;
  function armarNombre(w) { w.name = (w.ap + ' ' + (w.am || '') + ' ' + w.nom).replace(/\s+/g, ' ').trim(); }

  // Trabajadores capturados a mano antes de esta versión: ya traían nombre armado y CURP.
  function completarViejo(w) {
    if (w.fuente) return;
    w.fuente = 'manual';
    if (w.ap === undefined) { w.ap = String(w.name || '').split(' ')[0] || ''; w.am = ''; w.nom = String(w.name || ''); }
    if (w.puesto === undefined) w.puesto = '';
  }

  // ── Alta de un trabajador elegido en Odoo ──
  async function elegir(id, ctx) {
    var ya = inst.workers.findIndex(function (w) { return w.odoo_id === id; });
    if (ya >= 0) { inst.selWorkers.add(ya); toast('ℹ️ Ya estaba en la lista; quedó seleccionado'); refrescar(); return; }
    var r = await llamar({ accion: 'detalle', id: id });
    if (!r || r.ok !== true || !r.empleado) { falla(r, ctx); return; }
    var e = r.empleado;
    var w = { fuente: 'odoo', odoo_id: e.id, nombreOdoo: e.nombre, ap: e.ap || '', am: e.am || '', nom: e.nom || '', curp: String(e.curp || '').toUpperCase(), puesto: e.puesto || '', name: '' };
    if (w.ap && w.nom) armarNombre(w); else w.name = norm(e.nombre);
    inst.workers.push(w);
    inst.selWorkers.add(inst.workers.length - 1);
    var f = faltan(w);
    toast(f.length ? '⚠️ Agregado, pero ' + f.map(function (k) { return TXT[k]; }).join(' y ') : '✅ Trabajador agregado desde Odoo');
    refrescar();
  }

  function refrescar() {
    renderWorkerList();
    if (typeof renderGenSummary === 'function') renderGenSummary();
    var pl = document.getElementById('tp-lote');
    if (pl && pl.classList.contains('on')) renderLote();
    pintarSeleccion();
  }

  // ── Odoo/n8n no respondió, o la sesión no sirve: aviso y a captura manual sin perder nada ──
  function falla(r, ctx) {
    var tipo = (r && r.tipo) || 'servidor';
    O.cayo = tipo === 'sesion' ? (r.error === 'SCOPE_INSUFICIENTE' ? 'sin_scope' : 'sin_sesion') : tipo;
    document.querySelectorAll('.po-res').forEach(function (x) { x.innerHTML = ''; });
    pintarAvisos();
    toast(tipo === 'red' ? '⚠️ Odoo no respondió. Pasé a captura manual' : (tipo === 'sesion' ? '⚠️ Tu sesión personal no sirve para buscar. Captura a mano' : '⚠️ El servidor contestó con un error. Captura a mano'));
    var tb = document.querySelector('#s-inst .tab-row .tab');
    if (ctx !== 'w' && tb) { tb.click(); if (tb.scrollIntoView) tb.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    var x = document.getElementById('new-ap'); if (x) x.focus();
  }
  function avisoHtml() {
    var s = O.cayo || estadoSesion();
    if (s === 'red') return '<div class="po-caida"><b>Odoo no respondió.</b> Sigue con la captura manual (Apellido paterno, materno, nombre y CURP). Lo que ya elegiste se conserva.</div>';
    if (s === 'servidor') return '<div class="po-caida"><b>El servidor contestó con un error.</b> Sigue con la captura manual; lo que ya elegiste se conserva.</div>';
    if (s === 'sin_sesion') return '<div class="po-info">Para buscar en Odoo entra con tu <b>cuenta personal</b>. <a href="#" class="po-entrar">Entrar con mi cuenta personal</a> · Mientras, captura a mano.</div>';
    if (s === 'sin_scope') return '<div class="po-info">Tu cuenta personal no tiene permiso para buscar empleados (<code>dc3:empleados</code>). Pídelo a Dirección; mientras, captura a mano.</div>';
    return '';
  }
  function pintarAvisos() {
    var s = O.cayo || estadoSesion(), puede = (s === 'ok' || s === 'red' || s === 'servidor');
    document.querySelectorAll('.po-aviso').forEach(function (a) { a.innerHTML = avisoHtml(); });
    document.querySelectorAll('.po-q').forEach(function (q) { q.disabled = !puede; q.placeholder = puede ? 'Nombre o CURP (mín. 3 letras)' : 'Búsqueda en Odoo no disponible'; });
    document.querySelectorAll('.po-entrar').forEach(function (a) {
      a.onclick = function (ev) { ev.preventDefault(); try { sessionStorage.setItem('fts_suite_destino', location.href); } catch (e) {} location.href = '../shared/login.html'; };
    });
  }
  O.pintarAvisos = pintarAvisos;

  // ── Buscador (uno por pestaña) ──
  function buscador(ctx, titulo, sub) {
    var d = document.createElement('div');
    d.className = 'card po-card'; d.id = 'po-' + ctx;
    d.innerHTML =
      '<div class="card-hd"><div class="card-icon" style="font-size:16px">🔎</div><div><div class="card-title">' + titulo + '</div><div class="card-sub">' + sub + '</div></div></div>' +
      '<div class="card-body" style="display:flex;flex-direction:column;gap:8px">' +
      '<div class="po-aviso"></div>' +
      '<div class="po-fila"><input type="text" class="po-q" id="po-q-' + ctx + '" placeholder="Nombre o CURP (mín. 3 letras)" autocomplete="off" aria-label="Buscar empleado en Odoo">' +
      (ctx === 'w' ? '' : '<button class="btn btn-s po-manual" type="button">✍️ Capturar a mano</button>') + '</div>' +
      '<div class="po-res" id="po-res-' + ctx + '"></div>' +
      (ctx === 'w' ? '' : '<div class="po-sel" id="po-sel-' + ctx + '"></div>') +
      '</div>';
    var q = d.querySelector('.po-q'), res = d.querySelector('.po-res');
    var t = null, turno = 0;
    q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(correr, 300); });
    async function correr() {
      var mio = ++turno, txt = q.value;
      if (norm(txt).length < 3) { res.innerHTML = ''; return; }
      res.innerHTML = '<div class="po-hint">Buscando en Odoo…</div>';
      var r = await llamar({ accion: 'buscar', q: txt });
      if (mio !== turno) return;
      if (!r || r.ok !== true) { falla(r, ctx); return; }
      if (O.cayo) { O.cayo = null; pintarAvisos(); }
      var lista = r.resultados || [];
      if (!lista.length) { res.innerHTML = '<div class="po-hint">Sin coincidencias en empleados activos. Revisa la ortografía o captura a mano.</div>'; return; }
      res.innerHTML = '<div class="po-lista">' + lista.map(function (e) {
        var ch = (!e.tiene_curp ? '<span class="po-chip bad">Sin CURP</span>' : (!e.curp_valida ? '<span class="po-chip bad">CURP inválida</span>' : '')) +
          (e.nombre_separado ? '' : '<span class="po-chip warn">Nombre sin separar</span>') +
          (e.puesto ? '' : '<span class="po-chip warn">Sin puesto</span>');
        return '<button type="button" class="po-it" data-id="' + esc(e.id) + '"><span class="po-who"><b>' + esc(e.nombre_dc3 || e.nombre) + '</b><span>' + esc(e.puesto || '—') + '</span>' +
          (ch ? '<span class="po-chips">' + ch + '</span>' : '') + '</span><span class="po-mas">＋</span></button>';
      }).join('') + '</div>';
      res.querySelectorAll('.po-it').forEach(function (b) {
        b.addEventListener('click', async function () { b.disabled = true; await elegir(Number(b.dataset.id), ctx); q.value = ''; res.innerHTML = ''; });
      });
    }
    var m = d.querySelector('.po-manual');
    if (m) m.addEventListener('click', function () { document.querySelector('#s-inst .tab-row .tab').click(); setTimeout(function () { document.getElementById('new-ap').focus(); }, 60); });
    return d;
  }
  function pintarSeleccion() {
    ['g', 'l'].forEach(function (ctx) {
      var el = document.getElementById('po-sel-' + ctx); if (!el) return;
      var lista = inst.workers.map(function (w, i) { return { w: w, i: i }; }).filter(function (x) { return ctx === 'l' || inst.selWorkers.has(x.i); });
      el.innerHTML = lista.length
        ? '<div class="po-hint">' + (ctx === 'g' ? 'Seleccionados para este DC-3:' : 'Trabajadores en la lista:') + '</div><div class="po-chips">' +
          lista.map(function (x) { completarViejo(x.w); var f = faltan(x.w); return '<span class="po-chip ' + (f.length ? 'bad' : 'ok') + '">' + (x.w.fuente === 'odoo' ? '🔗 ' : '✍️ ') + esc(x.w.name) + (f.length ? ' · ' + f.map(function (k) { return TXT[k]; }).join(', ') : '') + '</span>'; }).join('') + '</div>'
        : '<div class="po-hint">Aún no hay trabajadores. Búscalos aquí o captúralos a mano.</div>';
    });
  }

  // ── Envolturas de funciones existentes ──
  window.addWorker = function () {
    var ap = document.getElementById('new-ap').value.trim().toUpperCase();
    var am = document.getElementById('new-am').value.trim().toUpperCase();
    var nom = document.getElementById('new-nom').value.trim().toUpperCase();
    var curp = document.getElementById('new-curp').value.trim().toUpperCase();
    if (!ap) { toast('⚠️ Ingresa el apellido paterno'); return; }
    if (!nom) { toast('⚠️ Ingresa el nombre'); return; }
    if (curp.length !== 18) { toast('⚠️ CURP debe tener 18 caracteres'); return; }
    if (!CURP_RE.test(curp)) { toast('⚠️ La CURP no tiene el formato oficial'); return; }
    var w = { fuente: 'manual', ap: ap, am: am, nom: nom, curp: curp, puesto: '', name: '' }; armarNombre(w);
    inst.workers.push(w);
    inst.selWorkers.add(inst.workers.length - 1);
    ['new-ap', 'new-am', 'new-nom', 'new-curp'].forEach(function (id) { document.getElementById(id).value = ''; });
    refrescar();
    toast('✅ Trabajador agregado');
  };

  window.renderWorkerList = function () {
    var el = document.getElementById('worker-list');
    if (!inst.workers.length) {
      el.innerHTML = '<p style="font-size:13px;color:var(--muted2);text-align:center;padding:16px">No hay trabajadores. Agrégalos arriba.</p>';
      return;
    }
    el.innerHTML = inst.workers.map(function (w, i) {
      completarViejo(w);
      var f = faltan(w);
      var fix = f.length ? '<div class="po-fix" onclick="event.stopPropagation()">' +
        '<div class="po-fix-t">⛔ ' + f.map(function (k) { return TXT[k]; }).join(' y ').replace(/^./, function (c) { return c.toUpperCase(); }) + '. Complétalo para imprimir. Lo que captures aquí solo va al PDF; no se escribe en Odoo.' + (w.nombreOdoo && f.indexOf('nombre') >= 0 ? ' En Odoo: «' + esc(w.nombreOdoo) + '».' : '') + '</div>' +
        (f.indexOf('nombre') >= 0 ? '<div class="po-fix-g"><input data-i="' + i + '" data-k="ap" placeholder="Apellido paterno" value="' + esc(w.ap) + '"><input data-i="' + i + '" data-k="am" placeholder="Apellido materno" value="' + esc(w.am) + '"><input data-i="' + i + '" data-k="nom" placeholder="Nombre(s)" value="' + esc(w.nom) + '"></div>' : '') +
        (f.some(function (k) { return k.indexOf('curp') === 0; }) ? '<div class="po-fix-g"><input data-i="' + i + '" data-k="curp" maxlength="18" placeholder="CURP (18 caracteres)" value="' + esc(w.curp) + '"></div>' : '') +
        '<button type="button" class="btn btn-s po-fix-ok" data-i="' + i + '">Guardar para este PDF</button></div>' : '';
      return '<div class="worker-row ' + (inst.selWorkers.has(i) ? 'sel' : '') + (f.length ? ' po-mal' : '') + '" onclick="toggleWorker(' + i + ')">' +
        '<div class="wr-chk">' + (inst.selWorkers.has(i) ? '✓' : '') + '</div>' +
        '<div class="wr-info"><strong>' + esc(w.name) + '</strong><span>' + esc(w.curp || '— sin CURP —') + '</span>' +
        '<span class="po-org">' + (w.fuente === 'odoo' ? '🔗 Odoo · ' + esc(w.puesto || 'sin puesto') : '✍️ Captura manual') + '</span>' + fix + '</div></div>';
    }).join('');
    el.querySelectorAll('.po-fix input').forEach(function (x) { x.addEventListener('input', function () { x.value = x.value.toUpperCase(); }); });
    el.querySelectorAll('.po-fix-ok').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var i = Number(b.dataset.i), w = inst.workers[i];
        var val = function (k) { var x = el.querySelector('.po-fix input[data-i="' + i + '"][data-k="' + k + '"]'); return x ? x.value.trim().toUpperCase() : null; };
        var c = { ap: val('ap'), am: val('am'), nom: val('nom'), curp: val('curp') };
        if (c.ap !== null && !c.ap) { toast('⚠️ Ingresa el apellido paterno'); return; }
        if (c.nom !== null && !c.nom) { toast('⚠️ Ingresa el nombre'); return; }
        if (c.curp !== null && c.curp.length !== 18) { toast('⚠️ CURP debe tener 18 caracteres'); return; }
        if (c.curp !== null && !CURP_RE.test(c.curp)) { toast('⚠️ La CURP no tiene el formato oficial'); return; }
        Object.keys(c).forEach(function (k) { if (c[k] !== null) w[k] = c[k]; });
        w.manual = true; armarNombre(w); refrescar(); toast('✅ Datos completados para este PDF');
      });
    });
  };
  var _toggle = window.toggleWorker;
  window.toggleWorker = function (i) { _toggle(i); pintarSeleccion(); renderGenSummary(); };

  var _validarGenerar = window.validarGenerar;
  window.validarGenerar = function () {
    var v = _validarGenerar();
    var malos = Array.from(inst.selWorkers).map(function (i) { return inst.workers[i]; }).filter(function (w) { if (!w) return false; completarViejo(w); return faltan(w).length; });
    if (!malos.length) return v;
    var err = malos.map(function (w) { return w.name + ': ' + faltan(w).map(function (k) { return TXT[k]; }).join(' y ') + ' (complétalo en Trabajadores)'; });
    return { ok: false, msg: malos.length + ' trabajador(es) con datos por completar', errores: err.concat(v.errores || []), ini: v.ini, fin: v.fin };
  };

  var _loteValidar = window._loteValidar;
  window._loteValidar = function () {
    var r = _loteValidar();
    lote.asg.forEach(function (a) {
      var w = inst.workers[a.empleado]; if (w) completarViejo(w);
      var f = w ? faltan(w) : [];
      if (f.length) r.porAsignacion[a.id].errores.unshift({ tipo: 'trabajador', texto: 'Faltan datos del trabajador (' + f.map(function (k) { return TXT[k]; }).join(' y ') + '). Complétalo en Trabajadores' });
    });
    r.conError = lote.asg.filter(function (a) { return r.porAsignacion[a.id].errores.length; }).length;
    return r;
  };
  var _renderLote = window.renderLote;
  window.renderLote = function () { _renderLote(); pintarSeleccion(); };

  function montar() {
    if (document.getElementById('po-w')) return;
    document.getElementById('tp-workers').prepend(buscador('w', 'Buscar en Odoo', 'Empleados activos de SERVICIOS FTS. O captúralo a mano abajo.'));
    document.getElementById('tp-generate').prepend(buscador('g', 'Trabajadores', 'Busca en Odoo para agregar y seleccionar'));
    document.getElementById('tp-lote').prepend(buscador('l', 'Trabajadores', 'Busca en Odoo para agregarlos a la matriz'));
    pintarAvisos(); pintarSeleccion();
  }
  O.montar = montar;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
  // La sesión personal puede cambiar en otra pestaña (entrar o salir): se repinta al volver.
  window.addEventListener('focus', function () { if (!O.cayo || O.cayo === 'sin_sesion' || O.cayo === 'sin_scope') { O.cayo = null; pintarAvisos(); } });
})();
