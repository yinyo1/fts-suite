/* ═══ Marketing · Prospectador (#407 §3–§4) ═══
 *
 * Sesiones tipo WhatsApp sobre el núcleo de chat. Rutas por hash:
 *   #/                 lista de sesiones + uso del día
 *   #/nueva/empresa    una empresa · #/nueva/lista  hasta 10 (con presupuesto antes de correr)
 *   #/s/<id>           la conversación (id = uuid del servidor o «l-<local>» si aún no sube)
 *   #/f/<ficha>        la ficha · #/e/<ficha> editar y rebuscar · #/crm/<ficha> Enviar a CRM
 *
 * Lo que este archivo NUNCA hace: escribir en Odoo por su cuenta. «Enviar a CRM» pasa por
 * marketing/odoo-buscar (solo lectura) y marketing/odoo-lead (usuario de servicio, read-back);
 * si el segundo no está encendido, el envío queda REGISTRADO como pendiente de credencial.
 */
(function (G) {
  'use strict';
  var M = G.Mkt, U = G.ChatUI, esc = U.esc, C = M.cliente, $ = function (s) { return document.querySelector(s); };
  var V = $('#vista'), Q = M.cola();
  var est = { sesiones: [], uso: null, motor: null, hilo: null, sesionId: null, sondeo: null, ficha: null, fichaTab: 'resumen', crm: null };
  var yo = function () { return M.sesion().actor || ''; };

  function ir(h) { if (location.hash === h) ruta(); else location.hash = h; }
  function vacio(ic, t, p) { return '<div class="ch-vacio"><div class="ic">' + ic + '</div><h2>' + esc(t) + '</h2><p>' + p + '</p></div>'; }
  function parar() { clearTimeout(est.sondeo); est.sondeo = null; }

  // ── Lista ───────────────────────────────────────────────────────────────
  async function vLista() {
    M.cab('Prospectador', 'Marketing · sesiones', '../index.html');
    V.innerHTML = '<div class="ch-wrap"><div class="ch-fila"><button class="ch-btn ch-btn-p" data-ir="#/nueva/empresa">＋ Una empresa</button>' +
      '<button class="ch-btn ch-btn-s" data-ir="#/nueva/lista">＋ Una lista (hasta 10)</button></div><div id="uso"></div><div id="lista">' +
      '<p class="ch-nota">Cargando sesiones…</p></div></div>';
    var locales = (await Q.sesionesLocales()).filter(function (s) { return !s.sesion_id && s.tipo !== 'lead'; });
    var r = await C.pedir('sesiones', {});
    var u = await C.pedir('uso', {});
    if (u.ok) { est.uso = u.uso; $('#uso').innerHTML = M.usoHtml(u.uso); }
    var L = $('#lista');
    if (!r.ok) { L.innerHTML = '<div class="ch-hall amar"><div class="ic">⚠️</div><div>' + esc(r.mensaje || r.error) + (r.clase === 'red' ? '<br>Lo que captures sin señal se guarda en el teléfono.' : '') + '</div></div>'; }
    est.sesiones = r.ok ? r.sesiones.filter(function (s) { return s.tipo !== 'lead' || true; }) : [];
    est.motor = r.motor;
    var filas = locales.map(function (s) {
      return '<button class="ch-ses" data-ir="#/s/l-' + esc(s.local_id) + '"><div class="av">' + (s.tipo === 'lista' ? '≡' : '…') + '</div><div class="t"><b>' + esc(s.titulo) + '</b><span>' +
        (s.error ? '⚠️ ' + esc(s.error) : 'pendiente de enviar · se da de alta al volver la red') + '</span></div><div class="m">' + U.fecha(s.creado) + '<span class="ch-pill a">en el teléfono</span></div></button>';
    }).concat(est.sesiones.map(function (s) {
      var t = s.trabajo ? (s.trabajo.estado === 'tomado' ? (s.trabajo.paso || 'trabajando') : 'en cola') : (s.ultimo ? (s.ultimo.rol === 'persona' ? 'Tú: ' : '') + s.ultimo.texto : '');
      var ic = s.tipo === 'lista' ? '≡' : s.tipo === 'lead' ? '📇' : s.tipo === 'senal' ? '📡' : esc((s.titulo || '?').charAt(0).toUpperCase());
      var pill = s.trabajo ? '<span class="ch-pill b">' + (s.trabajo.estado === 'tomado' ? 'trabajando' : 'en cola') + '</span>' : '<span class="ch-pill">' + esc(s.tipo) + '</span>';
      return '<button class="ch-ses" data-ir="#/s/' + esc(s.id) + '"><div class="av">' + ic + '</div><div class="t"><b>' + esc(s.titulo) + '</b><span>' + esc(t || '') +
        (s.autor !== yo() ? ' · ' + esc(s.autor_nombre || s.autor) : '') + '</span></div><div class="m">' + U.fecha(s.updated_at) + pill + '</div></button>';
    }));
    if (r.ok || locales.length) L.innerHTML = filas.length ? '<div class="ch-lista">' + filas.join('') + '</div>' + motorNota(est.motor)
      : vacio('🔎', 'Todavía no hay sesiones', 'Empieza con una empresa o con una lista. El motor busca primero en casa (Odoo y la lista negra) y después en la web.') + motorNota(est.motor);
  }
  function motorNota(m) {
    if (!m) return '';
    return '<p class="ch-nota" style="margin-top:10px">' + (m.vivo ? '🟢 El motor está despierto' : '🟡 El motor no está despierto ahora: lo que mandes queda en cola y se atiende en cuanto arranque') +
      (m.pendientes ? ' · ' + m.pendientes + ' en cola' : '') + '.</p>';
  }

  // ── Nueva sesión ─────────────────────────────────────────────────────────
  async function vNueva(tipo) {
    M.cab(tipo === 'lista' ? 'Lista nueva' : 'Empresa nueva', 'Prospectador', function () { ir('#/'); });
    if (!est.uso) { var u = await C.pedir('uso', {}); if (u.ok) est.uso = u.uso; }
    V.innerHTML = '<div class="ch-wrap"><div class="ch-card">' + (tipo === 'lista'
      ? '<label class="ch-campo">Empresas, una por renglón (hasta 10). Si sabes la ciudad, después de una coma.<textarea id="emp" rows="8" placeholder="Empresa Demo Norte, Apodaca&#10;Otra Empresa, Saltillo"></textarea></label>'
      : '<label class="ch-campo">Empresa<input id="emp" autocomplete="off" placeholder="Nombre de la empresa"></label><br><label class="ch-campo">Ciudad de la planta (si la sabes)<input id="ciu" autocomplete="off" placeholder="Ej. Apodaca, NL"></label>') +
      '<br><label class="ch-campo">Algo que el motor deba saber (opcional)<textarea id="not" rows="2" placeholder="Ej. la conocí en la expo, les interesa vapor"></textarea></label></div>' +
      '<div id="pres"></div><button class="ch-btn ch-btn-p full" id="go">Prospectar</button>' +
      '<p class="ch-nota">El buzón todavía no se consulta en esta versión (queda «buzón pendiente» en la ficha). LinkedIn nunca se usa con credenciales: la ficha te da la búsqueda armada para pegar.</p></div>';
    function lista() {
      var t = $('#emp').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      if (tipo !== 'lista') t = t.slice(0, 1);
      return t.map(function (x) { var p = x.split(','); return { empresa: p[0].trim(), ciudad: (tipo === 'lista' ? p.slice(1).join(',').trim() : ($('#ciu').value || '').trim()) }; });
    }
    function pinta() { var n = Math.max(1, lista().length); $('#pres').innerHTML = M.presupuestoHtml(n, est.uso) + (tipo === 'lista' && lista().length > 10 ? '<p class="ch-err">Una lista lleva hasta 10 empresas.</p>' : ''); }
    V.addEventListener('input', pinta); pinta();
    $('#go').onclick = async function () {
      var emps = lista(); if (!emps.length || emps[0].empresa.length < 2) { U.toast('Escribe la empresa.'); return; }
      if (emps.length > 10) { U.toast('Hasta 10 empresas por lista.'); return; }
      var nota = $('#not').value.trim();
      var titulo = tipo === 'lista' ? 'Lista · ' + emps.length + ' empresas' : emps[0].empresa + (emps[0].ciudad ? ' · ' + emps[0].ciudad : '');
      var s = await Q.nuevaSesion({ tipo: tipo === 'lista' ? 'lista' : 'empresa', titulo: titulo.slice(0, 120), datos: { empresas: emps } });
      var txt = tipo === 'lista' ? 'prospecta esta lista:\n' + emps.map(function (e) { return '· ' + e.empresa + (e.ciudad ? ' en ' + e.ciudad : ''); }).join('\n')
        : 'prospecta ' + emps[0].empresa + (emps[0].ciudad ? ' en ' + emps[0].ciudad : '');
      await Q.encolar({ local_id: s.local_id }, txt + (nota ? '\n\n' + nota : ''), [], Date.now());
      ir('#/s/l-' + s.local_id);
    };
  }

  // ── Conversación ─────────────────────────────────────────────────────────
  async function resolverSesion(id) {
    if (id.indexOf('l-') !== 0) return { sesion_id: id };
    var s = (await Q.sesionesLocales()).filter(function (x) { return x.local_id === id.slice(2); })[0];
    return s ? { sesion_id: s.sesion_id, local_id: s.local_id, local: s } : null;
  }
  async function vSesion(id) {
    parar();
    var d = await resolverSesion(id);
    if (!d) { V.innerHTML = vacio('🤷', 'No encontré esa sesión', 'Puede que se haya quitado del teléfono.'); return; }
    if (d.local && d.sesion_id) { history.replaceState(null, '', '#/s/' + d.sesion_id); id = d.sesion_id; }
    est.sesionId = d.sesion_id || null; est.local = d.local_id || null;
    V.innerHTML = '<div class="ch-chat" id="chat" aria-live="polite"></div><div class="ch-chips" id="chips"></div><div id="barra"></div>';
    U.barra($('#barra'), { placeholder: 'Mensaje para el motor', onEnviar: async function (t, arch, at) {
      await Q.encolar(est.sesionId ? { sesion_id: est.sesionId } : { local_id: est.local }, t, arch, at); pintarChat();
    } });
    U.enlazar($('#chat'), C, Q);
    M.cab(d.local ? d.local.titulo : 'Sesión', 'Prospectador', function () { ir('#/'); });
    await refrescar();
  }
  async function refrescar() {
    if (!location.hash.startsWith('#/s/')) return;
    if (est.sesionId) {
      var r = await C.pedir('hilo', { sesion_id: est.sesionId });
      if (r.ok) { est.hilo = r.hilo; est.motor = r.motor; if (r.hilo.uso) est.uso = r.hilo.uso; }
      else if (r.clase !== 'red') U.toast(r.mensaje || r.error);
    } else {
      var s = (await Q.sesionesLocales()).filter(function (x) { return x.local_id === est.local; })[0];
      if (s && s.sesion_id) { est.sesionId = s.sesion_id; history.replaceState(null, '', '#/s/' + s.sesion_id); return refrescar(); }
      est.hilo = null;
    }
    await pintarChat();
    var trabajando = est.hilo && est.hilo.trabajo;
    est.sondeo = setTimeout(refrescar, trabajando ? 3000 : 15000);
  }
  async function pintarChat() {
    var ch = $('#chat'); if (!ch) return;
    var h = est.hilo, html = [];
    if (h) {
      var s = h.sesion;
      M.cab(s.titulo, (s.tipo === 'lista' ? 'Lista' : s.tipo === 'lead' ? 'Lead rápido' : s.tipo === 'senal' ? 'Señal del radar' : 'Empresa') +
        ' · ' + (h.fichas || []).reduce(function (a, f) { return a + (f.consultas || 0); }, 0) + ' consultas', function () { ir('#/'); });
      html = h.mensajes.map(function (m) {
        return U.burbuja(m, yo(), { extra: function (mm) {
          var fid = mm.datos && mm.datos.ficha_id; if (!fid) return '';
          var f = (h.fichas || []).filter(function (x) { return x.id === fid; })[0]; if (!f) return '';
          return '<button class="ch-tarjeta" data-ir="#/f/' + esc(f.id) + '"><b>Ver ficha →</b><br><span style="font-size:12px;color:var(--muted2)">' + esc(f.empresa) +
            (f.ciudad ? ' · ' + esc(f.ciudad) : '') + ' · ' + esc(f.estado) + (f.filtro && f.filtro.tipo && f.filtro.tipo !== 'limpio' ? ' · ' + esc(f.filtro.tipo) : '') + '</span></button>';
        } });
      });
      if (h.trabajo) html.push('<div class="ch-escribiendo">' + (h.trabajo.estado === 'tomado' ? '✍️ ' + esc(h.trabajo.paso || 'trabajando…') : '⏳ en cola' + (est.motor && !est.motor.vivo ? ' · el motor no está despierto ahora' : '')) + '</div>');
      $('#chips').innerHTML = (h.fichas || []).map(function (f) { return '<button class="ch-chip" data-ir="#/f/' + esc(f.id) + '">📄 ' + esc(f.empresa) + ' · ' + esc(f.estado) + '</button>'; }).join('') ||
        '<span class="ch-nota" style="background:none;padding:0">La ficha aparece aquí en cuanto el motor la guarde.</span>';
    } else {
      $('#chips').innerHTML = '<span class="ch-nota" style="background:none;padding:0">Sin señal: la sesión se da de alta sola al volver la red.</span>';
    }
    var cola = (await Q.salida()).filter(function (it) { return (est.sesionId && it.sesion_id === est.sesionId) || (est.local && it.sesion_local === est.local); });
    cola.forEach(function (it) { html.push(U.pendiente(it, Q)); });
    var abajo = ch.scrollHeight - ch.scrollTop - ch.clientHeight < 80;
    ch.innerHTML = html.join('') || '<div class="ch-sistema">Escribe la empresa (y la ciudad si la sabes), pega una lista o manda una foto.</div>';
    if (abajo) window.scrollTo(0, document.body.scrollHeight);
  }

  // ── Ficha ────────────────────────────────────────────────────────────────
  function val(f, ruta) {   // lo editado a mano gana sobre lo del motor
    if (f.editado && f.editado[ruta] !== undefined) return f.editado[ruta];
    return ruta.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, f.datos);
  }
  async function cargarFicha(id) {
    var r = await C.pedir('ficha', { ficha_id: id });
    if (!r.ok) { V.innerHTML = vacio('⚠️', 'No se pudo abrir la ficha', esc(r.mensaje || r.error)); return null; }
    est.ficha = r.ficha; return r.ficha;
  }
  function volverSesion(f) { return function () { ir('#/s/' + f.datos_sesion); }; }
  async function vFicha(id) {
    parar(); var f = await cargarFicha(id); if (!f) return;
    M.cab(f.empresa, 'Ficha · v' + f.version + ' · ' + f.consultas + ' consultas', function () { history.back(); });
    var t = est.fichaTab, d = f.datos || {};
    var tabs = [['resumen', 'Resumen'], ['contactos', 'Contactos'], ['tecnica', 'Pestaña técnica']].map(function (x) {
      return '<button class="ch-tab' + (t === x[0] ? ' on' : '') + '" data-tab="' + x[0] + '">' + x[1] + '</button>'; }).join('');
    var c = '';
    var filtro = f.filtro && f.filtro.tipo ? '<div class="ch-hall ' + (f.filtro.tipo === 'limpio' ? 'verde' : f.filtro.tipo === 'tibia' ? 'amar' : 'rojo') + '"><div class="ic">' +
      (f.filtro.tipo === 'limpio' ? '✅' : f.filtro.tipo === 'tibia' ? '🟡' : '⛔') + '</div><div><b>Filtro barato: ' + esc(f.filtro.tipo) + '</b> · ' + esc(f.filtro.razon || '') +
      (f.filtro.penetracion ? '<br>Ya hay relación: esto es <b>penetración de cuenta</b>, no prospección en frío.' : '') + '</div></div>' : '';
    if (t === 'resumen') {
      var g = val(f, 'grupo');
      c = filtro + '<div class="ch-card"><h3>Empresa</h3><dl class="ch-kv"><dt>Empresa</dt><dd>' + esc(val(f, 'razon_social') || f.empresa) + '</dd>' +
        (g ? '<dt>Grupo</dt><dd>' + esc(g.grupo || g) + '</dd>' : '') + '<dt>Planta</dt><dd>' + esc(val(f, 'planta') || f.ciudad || '—') + '</dd>' +
        '<dt>Giro</dt><dd>' + esc(val(f, 'giro') || '—') + '</dd><dt>Tamaño</dt><dd>' + esc(val(f, 'tamano') || '—') + '</dd>' +
        '<dt>Puntaje</dt><dd>' + esc(d.puntaje == null ? '—' : d.puntaje) + '</dd><dt>Estado</dt><dd>' + esc(f.estado) + '</dd></dl></div>' +
        '<div class="ch-card"><h3>Señal y gancho</h3><p style="font-size:13px"><span class="ch-pill b">señal</span> ' + esc(d.senal && (d.senal.titulo || d.senal) || '—') +
        (d.senal && d.senal.liga ? ' · <a href="' + esc(d.senal.liga) + '" target="_blank" rel="noopener">fuente</a>' : '') + '</p>' +
        '<p style="font-size:13px;margin-top:6px"><span class="ch-pill o">gancho</span> ' + esc(val(f, 'gancho') || '—') + '</p>' +
        (val(f, 'nota') ? '<p class="ch-nota" style="margin-top:6px">✏️ ' + esc(val(f, 'nota')) + '</p>' : '') + '</div>' +
        '<div class="ch-card"><h3>Qué tan completa quedó</h3>' + ((d.pendientes || []).map(function (p) { return '<div class="ch-nota" style="margin-top:6px">⏳ ' + esc(p) + '</div>'; }).join('') || '<p class="ch-nota">Sin pendientes declarados.</p>') +
        '<div class="ch-nota" style="margin-top:6px">📭 Buzón pendiente: M0b y M0c se declaran sin acceso en esta versión.</div></div>';
    } else if (t === 'contactos') {
      var cs = d.contactos || [];
      c = '<div class="ch-card"><h3>Contactos (' + cs.length + ')</h3>' + (cs.map(function (x, i) {
        var pu = val(f, 'contactos.' + i + '.puesto') || x.puesto;
        return '<div style="border-top:1px solid var(--border);padding:10px 0;font-size:13px"><b>' + esc(x.nombre || 'Contacto ' + (i + 1)) + '</b> ' +
          (x.valor ? '<span class="ch-pill g">de valor</span>' : '<span class="ch-pill">contexto</span>') + (x.en_revision ? ' <span class="ch-pill a">en revisión</span>' : '') +
          '<div style="color:var(--muted2);font-size:12px">' + esc(pu || '') + (x.nivel ? ' · ' + esc(x.nivel) : '') + (x.cercania != null ? ' · cercanía ' + esc(x.cercania) : '') + '</div>' +
          '<div style="color:var(--muted2);font-size:12px">correo: ' + esc(x.correo_verificado ? 'verificado' : x.correo_candidato ? 'candidato (sin verificar)' : 'sin patrón') + (x.fuente ? ' · ' + esc(x.fuente) : '') + '</div></div>';
      }).join('') || '<p class="ch-nota">Sin contactos todavía.</p>') + '</div>' +
        (d.patron ? '<div class="ch-card"><h3>Patrón de correo</h3><p style="font-size:13px"><b>' + esc(d.patron.forma || '') + '</b> <span class="ch-pill g">' + esc(d.patron.nivel || '') + '</span><br><span style="color:var(--muted2);font-size:12px">' + esc(d.patron.fuente || '') + '</span></p></div>' : '') +
        (d.linkedin_busqueda ? '<div class="ch-card"><h3>Búsqueda para LinkedIn (pegar, sin credenciales)</h3><pre class="ch-diff">' + esc(d.linkedin_busqueda) + '</pre><button class="ch-btn ch-btn-s" id="copiaLi">Copiar</button></div>' : '');
    } else {
      var mods = d.modulos || {};
      c = '<div class="ch-card"><h3>Corrida</h3><dl class="ch-kv"><dt>Consultas</dt><dd>' + f.consultas + ' de ' + ((est.uso && est.uso.consultas_por_ficha) || 30) + '</dd>' +
        Object.keys(mods).map(function (k) { return '<dt>' + esc(k) + '</dt><dd>' + esc(mods[k]) + '</dd>'; }).join('') +
        '<dt>Versiones</dt><dd>' + f.versiones + '</dd><dt>Ficha HTML</dt><dd>' + (f.html_adjunto ? '<a href="#" data-adj="' + esc(f.html_adjunto) + '">ver</a>' : '—') + '</dd></dl></div>' +
        (f.envios && f.envios.length ? '<div class="ch-card"><h3>Envíos a CRM</h3>' + f.envios.map(function (e) {
          return '<div class="ch-nota" style="margin-top:6px">' + esc(e.decision) + ' · <b>' + esc(e.estado) + '</b> · ' + U.fecha(e.created_at) + (e.readback && e.readback.id ? ' · releído #' + esc(e.readback.id) : '') + '</div>'; }).join('') + '</div>' : '');
    }
    var cerrada = f.estado === 'enviada' || f.estado === 'descartada';
    V.innerHTML = '<div class="ch-tabs">' + tabs + '</div><div class="ch-wrap">' + c +
      '<div class="ch-fila"><button class="ch-btn ch-btn-s" data-ir="#/e/' + esc(f.id) + '">✏️ Editar y rebuscar</button>' +
      '<button class="ch-btn ch-btn-p" data-ir="#/crm/' + esc(f.id) + '"' + (f.estado === 'descartada' ? ' disabled' : '') + '>📤 Enviar a CRM</button></div>' +
      (cerrada ? '' : '<button class="ch-btn ch-btn-r full" id="desc">Descartar…</button>') + '</div>';
    V.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { est.fichaTab = b.getAttribute('data-tab'); vFicha(id); }; });
    U.enlazar(V, C, Q);
    if ($('#copiaLi')) $('#copiaLi').onclick = function () { try { navigator.clipboard.writeText(d.linkedin_busqueda); U.toast('Copiada'); } catch (e) {} };
    if ($('#desc')) $('#desc').onclick = function () { descartar(f); };
  }
  function descartar(f) {
    var cap = document.createElement('div'); cap.className = 'ch-visor';
    cap.innerHTML = '<div class="ch-card" style="max-width:420px;width:100%"><h3>Descartar ' + esc(f.empresa) + '</h3>' +
      '<label class="ch-campo">Por qué (obligatorio: es lo que aprende)<select id="cat"><option value="competidor">Competidor o colega</option><option value="cliente">Ya es cliente</option>' +
      '<option value="duplicado">Duplicado</option><option value="fuera_de_giro">Fuera de giro</option><option value="sin_planta">Sin planta en MX</option><option value="otro">Otro</option></select></label><br>' +
      '<label class="ch-campo">Motivo<textarea id="mot" rows="3" placeholder="Ej. vende lo mismo que FTS; posible aliado"></textarea></label><p class="ch-err ch-oculto" id="me">Escribe el motivo (5 letras o más).</p>' +
      '<div class="ch-fila" style="margin-top:10px"><button class="ch-btn ch-btn-s" id="no">Cancelar</button><button class="ch-btn ch-btn-r" id="si">Descartar</button></div></div>';
    document.body.appendChild(cap);
    cap.querySelector('#no').onclick = function () { cap.remove(); };
    cap.querySelector('#si').onclick = async function () {
      var m = cap.querySelector('#mot').value.trim(); if (m.length < 5) { cap.querySelector('#me').classList.remove('ch-oculto'); return; }
      var r = await C.pedir('ficha_descartar', { ficha_id: f.id, texto: m, tipo: cap.querySelector('#cat').value });
      if (r.ok) { cap.remove(); U.toast('Descartada. El motivo queda como evidencia.'); vFicha(f.id); } else U.toast(r.mensaje || r.error);
    };
  }

  // ── Editar y rebuscar ────────────────────────────────────────────────────
  var REBUSCAR = [['M5', 'Solo contactos', 'M5 · ~10 a 14 consultas'], ['senal', 'Solo señal', '~3 consultas'],
                  ['patron', 'Solo patrón de correo', 'Odoo · 0 consultas web'], ['grupo', 'Solo grupo y relaciones', 'Odoo + ~2 consultas'], ['M2', 'Solo vacantes', '~4 consultas']];
  async function vEditar(id) {
    parar(); var f = await cargarFicha(id); if (!f) return;
    M.cab('Editar y rebuscar', f.empresa, function () { ir('#/f/' + id); });
    var cs = (f.datos && f.datos.contactos) || [];
    V.innerHTML = '<div class="ch-wrap"><div class="ch-card"><h3>Corregir a mano</h3>' +
      '<label class="ch-campo">Planta (ciudad)<input data-k="planta" value="' + esc(val(f, 'planta') || f.ciudad || '') + '"></label><br>' +
      '<label class="ch-campo">Giro<input data-k="giro" value="' + esc(val(f, 'giro') || '') + '"></label><br>' +
      '<label class="ch-campo">Gancho<textarea data-k="gancho" rows="2">' + esc(val(f, 'gancho') || '') + '</textarea></label><br>' +
      cs.slice(0, 8).map(function (x, i) { return '<label class="ch-campo">Puesto · ' + esc(x.nombre || 'contacto ' + (i + 1)) + '<input data-k="contactos.' + i + '.puesto" value="' + esc(val(f, 'contactos.' + i + '.puesto') || x.puesto || '') + '"></label><br>'; }).join('') +
      '<label class="ch-campo">Nota para quien da seguimiento<textarea data-k="nota" rows="2">' + esc(val(f, 'nota') || '') + '</textarea></label>' +
      '<p class="ch-nota" style="margin-top:8px">Lo editado a mano queda marcado como tal, un rebuscar no lo pisa y es evidencia para que el motor aprenda.</p>' +
      '<button class="ch-btn ch-btn-p full" id="guardar" style="margin-top:8px">Guardar</button></div>' +
      '<div class="ch-card"><h3>Rebuscar solo una parte</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">' +
      REBUSCAR.map(function (x) { return '<button class="ch-btn ch-btn-s" style="flex-direction:column;align-items:flex-start;text-align:left" data-rb="' + x[0] + '"><b>' + x[1] + '</b><span style="font-size:11px;font-weight:400">' + x[2] + '</span></button>'; }).join('') +
      '</div><p class="ch-nota" style="margin-top:8px">Reabre la corrida y corre ese módulo solo; cuenta contra tus consultas del día.</p></div></div>';
    $('#guardar').onclick = async function () {
      var cambios = {};
      V.querySelectorAll('[data-k]').forEach(function (i) { var k = i.getAttribute('data-k'), v = i.value.trim(); if ((val(f, k) || (k === 'planta' ? f.ciudad : '') || '') !== v && !(k.indexOf('contactos.') === 0 && v === (cs[+k.split('.')[1]] || {}).puesto)) cambios[k] = v; });
      if (!Object.keys(cambios).length) { U.toast('No hay cambios.'); return; }
      var r = await C.pedir('ficha_editar', { ficha_id: f.id, datos: cambios });
      if (r.ok) { U.toast('Guardado (versión ' + r.ficha.version + ')'); ir('#/f/' + f.id); } else U.toast(r.mensaje || r.error);
    };
    V.querySelectorAll('[data-rb]').forEach(function (b) { b.onclick = async function () {
      var r = await C.pedir('rebuscar', { ficha_id: f.id, texto: b.getAttribute('data-rb') });
      if (r.ok) { U.toast('En cola. El motor contesta en la sesión.'); } else U.toast(r.mensaje || r.error);
    }; });
  }

  // ── Enviar a CRM (los tres pasos de la maqueta) ───────────────────────────
  async function vCrm(id) {
    parar(); var f = await cargarFicha(id); if (!f) return;
    est.crm = { ficha: f, paso: 1, busqueda: null, origenBusqueda: null, decision: null, motivo: '', actividad: { tipo: 'llamada', fecha: M.hoyISO(), resumen: '' } };
    M.cab('Enviar a CRM', f.empresa, function () { ir('#/f/' + id); });
    if (!M.tiene('marketing:crm')) { V.innerHTML = '<div class="ch-wrap">' + vacio('🔒', 'Enviar a CRM pide el permiso marketing:crm', 'Pídelo a Esteban. Mientras, la ficha queda lista en la sesión.') + '</div>'; return; }
    V.innerHTML = '<div class="ch-wrap"><p class="ch-nota">Buscando en Odoo antes de proponer nada…</p></div>';
    var d = f.datos || {};
    var r = await C.webhook('/webhook/marketing/odoo-buscar', 'buscar', { ficha_id: f.id, datos: { empresa: f.empresa, ciudad: f.ciudad, grupo: d.grupo && d.grupo.empresas ? d.grupo : null } }, { timeout: 60000 });
    if (r.ok && r.busqueda) { est.crm.busqueda = r.busqueda; est.crm.origenBusqueda = 'Odoo, ahora (' + U.hora(Date.now()) + ')'; }
    else if (d.busqueda) { est.crm.busqueda = d.busqueda; est.crm.origenBusqueda = 'la búsqueda que hizo el motor al prospectar (' + U.fecha(f.updated_at) + '). ' +
      (r.error === 'NO_PUBLICADO' ? 'La búsqueda en vivo espera la credencial de Odoo de Marketing.' : 'La búsqueda en vivo falló: ' + (r.mensaje || r.error)); }
    else { est.crm.busqueda = null; est.crm.origenBusqueda = r.error === 'NO_PUBLICADO' ? 'sin búsqueda: la búsqueda en vivo espera la credencial de Odoo de Marketing y la ficha no trae la del motor' : (r.mensaje || r.error); }
    var b = est.crm.busqueda; est.crm.decision = b ? b.decision_sugerida : null;
    pintarCrm();
  }
  function pasos(p) { return '<div class="ch-pasos"><span class="' + (p >= 1 ? 'on' : '') + '">1 · Lo que ya hay</span><span class="' + (p >= 2 ? 'on' : '') + '">2 · Lo que escribiría</span><span class="' + (p >= 3 ? 'on' : '') + '">3 · Hecho</span></div>'; }
  function propuesta() {
    var c = est.crm, f = c.ficha, b = c.busqueda || {}, d = f.datos || {};
    var origen = f.origen === 'radar' ? 'Radar' : f.origen === 'lead' ? 'Lead rápido' : 'Prospección';
    var ses = M.sesion();
    if (c.decision === 'nada') return 'Nada. Se registra en la ficha que se decidió no escribir.';
    var nota = 'mail.message  (nota en el chatter)\n  «' + origen + ' · desde la FTS Suite» · hecha por ' + (ses.nombre || ses.actor) + '\n  gancho, señal y contactos de valor por puesto, con su fuente\n  correos candidatos SOLO en la nota, marcados «sin verificar»\nmail.activity  (obligatoria)\n  ' + c.actividad.tipo + ' · ' + c.actividad.fecha + ' · ' + (c.actividad.resumen || '…');
    if (c.decision === 'crear_lead') return 'crm.lead  (create)\n  name:        ' + f.empresa + (f.ciudad ? ' · ' + f.ciudad : '') + '\n  partner_id:  ' + (b.partner_destino || '(ninguno: va partner_name)') +
      '\n  stage_id:    17 · Prospecto Lead\n  etiqueta:    Origen · ' + origen + '\n  NO se crea ningún partner ni contacto\n' + nota;
    if (c.decision === 'nota_lead') return 'En el lead abierto #' + (b.lead_destino || '?') + ' (no se mueve de etapa):\n' + nota;
    return 'En el partner #' + (b.partner_destino || '?') + ' (cuenta viva):\n' + nota;
  }
  function pintarCrm() {
    var c = est.crm, f = c.ficha, b = c.busqueda;
    if (c.paso === 1) {
      var h = [];
      if (!b) h.push('<div class="ch-hall amar"><div class="ic">⚠️</div><div><b>No hay búsqueda previa</b><br>' + esc(c.origenBusqueda) + '. Sin ella no se ofrece «crear».</div></div>');
      else {
        h.push('<p class="ch-nota">Fuente: ' + esc(c.origenBusqueda) + '. Capas: nombre normalizado, leads por nombre y por partner, partner comercial, grupo y SO confirmadas por nombre.</p>');
        if (b.veredicto) h.push('<div class="ch-hall ' + (b.veredicto.frena_crear ? 'rojo' : b.veredicto.tipo === 'limpio' ? 'verde' : 'amar') + '"><div class="ic">' + (b.veredicto.frena_crear ? '⛔' : b.veredicto.tipo === 'limpio' ? '✅' : '🟡') + '</div><div><b>' + esc(b.veredicto.tipo) + '</b> · ' + esc(b.veredicto.razon) + (b.veredicto.penetracion ? '<br>Ya es cliente: esto es penetración de cuenta.' : '') + '</div></div>');
        if ((b.partners || []).length) h.push('<div class="ch-hall amar"><div class="ic">👥</div><div><b>' + b.partners_total + ' partner(s) con nombre equivalente</b><br>' + b.partners.slice(0, 6).map(function (p) { return '#' + esc(p.id) + ' «' + esc(p.nombre) + '» · ' + esc(p.por); }).join('<br>') + '</div></div>');
        if ((b.leads_abiertos || []).length) h.push('<div class="ch-hall rojo"><div class="ic">📂</div><div><b>' + b.leads_abiertos.length + ' lead(s) abierto(s)</b><br>' + b.leads_abiertos.slice(0, 5).map(function (l) { return '#' + esc(l.id) + ' «' + esc(l.nombre) + '» · ' + esc(l.etapa) + (l.dias != null ? ' · hace ' + l.dias + ' días' : '') + ' · por ' + esc(l.por); }).join('<br>') + '</div></div>');
        if (b.so_confirmadas && (b.so_confirmadas.empresa || b.so_confirmadas.grupo)) h.push('<div class="ch-hall verde"><div class="ic">🧾</div><div><b>SO confirmadas</b>: ' + b.so_confirmadas.empresa + ' a su nombre · ' + b.so_confirmadas.grupo + ' del grupo' + (b.consulta && b.consulta.grupo ? ' (' + esc(b.consulta.grupo) + ')' : '') + '</div></div>');
      }
      var opts = [['nota_lead', 'Agregar nota y actividad al lead abierto' + (b && b.lead_destino ? ' #' + b.lead_destino : ''), !(b && b.lead_destino)],
                  ['nota_partner', 'Agregar nota y actividad a la cuenta viva' + (b && b.partner_destino ? ' (partner #' + b.partner_destino + ')' : ''), !(b && b.partner_destino)],
                  ['crear_lead', 'Crear lead nuevo en «Prospecto Lead»', !b], ['nada', 'No escribir nada', false]];
      V.innerHTML = '<div class="ch-wrap">' + pasos(1) + h.join('') + '<div class="ch-card"><h3>¿Qué hago?</h3>' + opts.map(function (o) {
        return '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;padding:6px 0;' + (o[2] ? 'opacity:.45' : 'cursor:pointer') + '"><input type="radio" name="dec" value="' + o[0] + '"' + (c.decision === o[0] ? ' checked' : '') + (o[2] ? ' disabled' : '') + '> ' + esc(o[1]) + (b && b.decision_sugerida === o[0] ? ' <span class="ch-pill g">sugerido</span>' : '') + '</label>'; }).join('') +
        '<label class="ch-campo' + (c.decision === 'crear_lead' && b && b.lead_abierto_grupo ? '' : ' ch-oculto') + '" id="motw">Ya hay un lead abierto del grupo: escribe por qué creas otro (obligatorio)<textarea id="mot" rows="2">' + esc(c.motivo) + '</textarea></label>' +
        '<p class="ch-nota" style="margin-top:8px">El motivo es lo que aprende el sistema. Nunca se confirma nada ni se mueve de etapa un lead ajeno.</p></div>' +
        '<button class="ch-btn ch-btn-p full" id="sig"' + (c.decision ? '' : ' disabled') + '>Ver lo que escribiría →</button></div>';
      V.querySelectorAll('input[name=dec]').forEach(function (i) { i.onchange = function () { c.decision = i.value; pintarCrm(); }; });
      if ($('#mot')) $('#mot').oninput = function () { c.motivo = $('#mot').value; };
      $('#sig').onclick = function () {
        if (c.decision === 'crear_lead' && b && b.lead_abierto_grupo && (c.motivo || '').trim().length < 10) { U.toast('Escribe el motivo (10 letras o más): ya hay un lead abierto del grupo.'); return; }
        c.paso = 2; pintarCrm();
      };
    } else if (c.paso === 2) {
      V.innerHTML = '<div class="ch-wrap">' + pasos(2) + '<div class="ch-card"><h3>Se escribiría</h3><pre class="ch-diff" id="diff">' + esc(propuesta()) + '</pre></div>' +
        (c.decision === 'nada' ? '' : '<div class="ch-card"><h3>Actividad (obligatoria)</h3><label class="ch-campo">Tipo<select id="at"><option value="llamada">Llamada</option><option value="correo">Correo</option><option value="visita">Visita</option></select></label><br>' +
          '<label class="ch-campo">Fecha<input type="date" id="af" min="' + M.hoyISO() + '" value="' + esc(c.actividad.fecha) + '"></label><br>' +
          '<label class="ch-campo">Qué se va a hacer<input id="ar" value="' + esc(c.actividad.resumen) + '" placeholder="Ej. Llamar al conmutador y pedir a mantenimiento"></label>' +
          '<p class="ch-err ch-oculto" id="ae">Sin actividad fechada (de hoy en adelante) no se envía: un lead sin siguiente paso se muere en «Prospecto Lead».</p></div>') +
        '<div class="ch-fila"><button class="ch-btn ch-btn-s" id="atr">← Volver</button><button class="ch-btn ch-btn-g" id="env">' + (c.decision === 'nada' ? 'Registrar que no se escribe' : 'Enviar a Odoo') + '</button></div></div>';
      if ($('#at')) { $('#at').value = c.actividad.tipo; ['#at', '#af', '#ar'].forEach(function (s) { $(s).oninput = $(s).onchange = function () { c.actividad = { tipo: $('#at').value, fecha: $('#af').value, resumen: $('#ar').value.trim() }; $('#diff').textContent = propuesta(); }; }); }
      $('#atr').onclick = function () { c.paso = 1; pintarCrm(); };
      $('#env').onclick = enviarCrm;
    } else {
      V.innerHTML = '<div class="ch-wrap">' + pasos(3) + c.resultado + '<button class="ch-btn ch-btn-s full" data-ir="#/f/' + esc(f.id) + '">Volver a la ficha</button></div>';
    }
  }
  async function enviarCrm() {
    var c = est.crm, f = c.ficha;
    if (c.decision !== 'nada' && (!c.actividad.fecha || c.actividad.fecha < M.hoyISO() || (c.actividad.resumen || '').length < 5)) { $('#ae').classList.remove('ch-oculto'); return; }
    if (!navigator.onLine) { U.toast('Enviar a CRM necesita red: busca antes de escribir. Queda en la ficha.'); return; }
    var btn = $('#env'); btn.disabled = true; btn.textContent = 'enviando…';
    var b = c.busqueda || {};
    var datos = { decision: c.decision, motivo: c.motivo || null, actividad: c.decision === 'nada' ? null : c.actividad,
      busqueda: { lead_destino: b.lead_destino || null, partner_destino: b.partner_destino || null, lead_abierto_grupo: !!b.lead_abierto_grupo,
                  resumen: b.resumen || null, veredicto: b.veredicto || null, origen: c.origenBusqueda },
      propuesta: { texto: propuesta() } };
    var r = c.decision === 'nada' ? { ok: false, error: 'NADA' } : await C.webhook('/webhook/marketing/odoo-lead', 'enviar_crm', { ficha_id: f.id, datos: datos }, { timeout: 60000 });
    if (r.ok && r.estado === 'escrito') {
      c.resultado = '<div class="ch-hall verde"><div class="ic">✅</div><div><b>Escrito y releído en Odoo.</b><br>Registro #' + esc((r.readback || {}).id || '') + '</div></div>';
    } else if (c.decision === 'nada' || r.error === 'NO_PUBLICADO') {
      var g = await C.pedir('crm_registrar', { ficha_id: f.id, datos: datos });
      if (!g.ok) { btn.disabled = false; btn.textContent = 'Enviar a Odoo'; U.toast(g.mensaje || g.error); return; }
      c.resultado = c.decision === 'nada' ? '<div class="ch-hall verde"><div class="ic">📝</div><div><b>Registrado:</b> se decidió no escribir en Odoo.</div></div>'
        : '<div class="ch-hall amar"><div class="ic">⏳</div><div><b>Pendiente de credencial.</b><br>No se escribió nada en Odoo: el envío a Odoo de Marketing todavía no está encendido. Quedó registrado con tu búsqueda, tu decisión y la actividad del ' + esc(c.actividad.fecha) + '; se manda sin recapturar en cuanto exista la credencial.</div></div>';
    } else {
      btn.disabled = false; btn.textContent = 'Enviar a Odoo';
      U.toast(r.clase === 'red' ? 'Sin señal: no se mandó.' : (r.mensaje || r.error)); return;
    }
    c.paso = 3; pintarCrm();
  }

  // ── Ruteo ────────────────────────────────────────────────────────────────
  function ruta() {
    parar();
    var h = (location.hash || '#/').slice(2).split('/'), k = h[0], a = h[1];
    if (k === 'nueva') return vNueva(a);
    if (k === 's' && a) return vSesion(a);
    if (k === 'f' && a) return vFicha(a);
    if (k === 'e' && a) return vEditar(a);
    if (k === 'crm' && a) return vCrm(a);
    return vLista();
  }
  document.addEventListener('click', function (e) { var t = e.target.closest('[data-ir]'); if (t && !t.disabled) { e.preventDefault(); ir(t.getAttribute('data-ir')); } });
  window.addEventListener('hashchange', ruta);
  Q.oir(function (x) { if (location.hash.startsWith('#/s/')) pintarChat(); else if (!location.hash || location.hash === '#/') { if (x && (x.sesion || x.errorSesion)) vLista(); } });
  G.MktProspectador = { arrancar: async function () {
    U.red(document.getElementById('red'));
    var ok = await Q.iniciar(); if (!ok) U.toast('Este navegador no guarda la cola: no cierres la pestaña sin señal.', 5000);
    ruta();
  } };
})(window);
