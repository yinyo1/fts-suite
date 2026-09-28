/* ═══ RH · Retardos · pantalla (#334) ═══
 *
 * Lo que RH hace aquí, en orden de frecuencia:
 *   1. Ver qué casos esperan algo de RH (hoja recibida, negativa, impugnación).
 *   2. Abrir el caso, mirar la hoja firmada y validarla o pedirla de nuevo.
 *   3. Registrar lo que pasó fuera del correo: se negó a firmar (dos testigos),
 *      impugnó, entregó la hoja en papel.
 *   4. Programar y confirmar una suspensión (1 a 8 días, art. 423 fr. X LFT).
 *
 * La pantalla NO decide estados: pide la acción al servidor y pinta lo que el servidor
 * devuelve (CLAUDE.md §8, la UI no es fuente de verdad). Un 200 sin ok:true no cuenta.
 * Sin guiones largos en los textos.
 */
(function (G) {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var E = {
    DETECTADO: ['Detectado', 'e-otro'], NOTIFICADO: ['Notificado', 'e-otro'], ESPERANDO_FIRMA: ['Esperando firma', 'e-espera'],
    VENCIDO: ['Vencido', 'e-vencido'], ESCALADO: ['Escalado', 'e-escalado'], FIRMA_RECIBIDA: ['Hoja recibida', 'e-recibida'],
    SE_NEGO_A_FIRMAR: ['Se negó a firmar', 'e-negativa'], IMPUGNADO: ['Impugnado', 'e-impugnado'], VALIDADO_RH: ['Validado por RH', 'e-validado'],
    ACCION_PROGRAMADA: ['Suspensión programada', 'e-programada'], ACCION_VERIFICADA: ['Suspensión verificada', 'e-verificada'],
    CERRADO: ['Cerrado', 'e-cerrado'], CANCELADO_POR_RH: ['Cancelado por RH', 'e-otro'],
    RETENIDO: ['Nivel alcanzado, no notificado', 'e-retenido']
  };
  var NIVEL = { aviso: 'Aviso', carta_compromiso: 'Carta compromiso', acta: 'Acta administrativa', suspension: 'Suspensión' };
  var CUBETAS = [
    { id: 'rh', t: 'Esperan a RH', q: 'Hoja recibida, negativa o impugnación', clase: 'rh', estados: ['FIRMA_RECIBIDA', 'SE_NEGO_A_FIRMAR', 'IMPUGNADO', 'VALIDADO_RH'] },
    { id: 'espera', t: 'Esperando firma', q: 'Dentro del plazo', clase: '', estados: ['ESPERANDO_FIRMA', 'DETECTADO', 'NOTIFICADO'] },
    { id: 'vencidos', t: 'Vencidos o escalados', q: 'Sin hoja al vencer el plazo', clase: 'urge', estados: ['VENCIDO', 'ESCALADO'] },
    { id: 'programadas', t: 'Suspensiones programadas', q: 'Por aplicar y verificar', clase: '', estados: ['ACCION_PROGRAMADA'] },
    { id: 'retenidos', t: 'Nivel alcanzado, no notificado', q: 'Arranque suave: no se le escribió a la persona', clase: 'ret', estados: ['RETENIDO'] }
  ];
  var st = { casos: [], salud: null, filtro: 'todos', vista: 'lista', folio: null, editor: false, cerrados: false };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function chip(estado) { var e = E[estado] || [estado, 'e-otro']; return '<span class="chip ' + e[1] + '">' + esc(e[0]) + '</span>'; }
  function fechaCorta(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'America/Monterrey' }) + ' ' +
           d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey' });
  }
  function fechaDia(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'America/Monterrey' }); }
  function toast(t) {
    var viejo = document.querySelector('.toast'); if (viejo) viejo.remove();
    var el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t;
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 3200);
  }
  function mensajeError(r) {
    var M = {
      SIN_RED: 'No hubo respuesta del servidor. Revisa tu conexión y vuelve a intentar.',
      TOKEN_EXPIRADO: 'Tu sesión venció. Vuelve a entrar.', FIRMA_INVALIDA: 'Tu sesión ya no es válida. Vuelve a entrar.',
      SCOPE_INSUFICIENTE: 'Tu usuario puede consultar pero no modificar casos. Pide el permiso retardos:write.',
      REPLAY: 'Esa petición ya se había recibido. Recarga la pantalla.', FUERA_DE_VENTANA: 'El reloj de tu equipo no coincide con el del servidor. Revisa la hora del equipo.',
      SIN_EVIDENCIA: 'Primero sube la hoja firmada o la constancia.', FALTAN_TESTIGOS: 'Escribe el nombre completo de los dos testigos.',
      DIAS_FUERA_DE_LEY: 'La suspensión va de 1 a 8 días (artículo 423 fracción X de la LFT).', MOTIVO_OBLIGATORIO: 'Escribe el motivo (al menos 5 letras).',
      TRANSICION_INVALIDA: 'Ese paso no aplica en el estado actual del caso. Recarga para ver el estado vigente.',
      ARCHIVO_ILEGIBLE: 'El archivo está vacío o dañado.', SOLO_LECTURA: 'Tu usuario sólo puede consultar.'
    };
    return M[r.error] || ('El servidor no aceptó la acción (' + esc(r.error || 'sin código') + ').');
  }

  async function pedir(datos) {
    var r = await G.RetApi.llamar(datos);
    if (r && r.tipo === 'sesion' && r.error !== 'SCOPE_INSUFICIENTE') { mostrarPuerta(mensajeError(r)); throw new Error('SESION'); }
    return r;
  }

  // ── Arranque y puerta ──
  function mostrarPuerta(msg) {
    $('#app').classList.add('hid'); $('#puerta').classList.remove('hid'); $('#salir').classList.add('hid'); $('#quien').textContent = '';
    var e = $('#login-err'); if (msg) { e.textContent = msg; e.classList.remove('hid'); } else e.classList.add('hid');
  }
  function entrarApp(nombre) {
    $('#puerta').classList.add('hid'); $('#app').classList.remove('hid'); $('#salir').classList.remove('hid');
    $('#quien').textContent = nombre || '';
    $('#aviso-demo').classList.toggle('hid', G.RetApi.modo !== 'demo');
    cargar();
  }
  async function entrar() {
    var u = $('#u').value.trim(), p = $('#p').value;
    if (!u || !p) return mostrarPuerta('Escribe usuario y contraseña.');
    $('#entrar').disabled = true;
    var r = await G.SuiteAuth.login(u, p);
    $('#entrar').disabled = false;
    if (!r.ok) return mostrarPuerta(r.mensaje || 'No se pudo entrar.');
    if (!G.SuiteAuth.tieneScope('retardos:read')) { G.SuiteAuth.logout(); return mostrarPuerta('Tu usuario no tiene el permiso retardos:read. Pídelo a Dirección.'); }
    st.editor = G.SuiteAuth.tieneScope('retardos:write');
    entrarApp(r.sesion.nombre);
  }
  function modoDemo() {
    G.RetApi.modo = 'demo'; st.editor = true;
    $('#modo').textContent = 'EJEMPLO'; $('#modo').classList.remove('hid');
    entrarApp('rh.demo');
  }

  // ── Lista ──
  async function cargar() {
    $('#lista').innerHTML = '<div class="vacio">Cargando casos…</div>';
    var r;
    try { r = await pedir({ accion: 'listar', incluir_cerrados: st.cerrados }); } catch (e) { return; }
    if (!r || r.ok !== true) { $('#lista').innerHTML = '<div class="vacio">' + mensajeError(r || {}) + '</div>'; return; }
    st.casos = r.casos || []; st.salud = r.salud || null;
    pintarSalud(); pintarResumen(); pintarLista();
  }
  function pintarSalud() {
    var s = st.salud, h = '';
    if (!s) { $('#salud').innerHTML = ''; return; }
    if (s.modo === 'sombra') h += '<div class="aviso sombra"><div><b>Modo sombra</b>Ningún correo llega a los empleados. Cada correo se desvía a Dirección y RH con la etiqueta [SOMBRA] y el destinatario real en el cuerpo.</div></div>';
    if (s.ok === false) {
      h += '<div class="aviso mal"><div><b>El monitor encontró problemas</b><ul>' + (s.problemas || []).map(function (p) { return '<li>' + esc(p.detalle) + '</li>'; }).join('') + '</ul></div></div>';
    }
    var ult = s.ultima_deteccion ? 'Última revisión de asistencias: ' + fechaCorta(s.ultima_deteccion) + ', ' + (s.ultima_deteccion_leidos || 0) + ' checadas leídas.' : 'La revisión de asistencias todavía no ha corrido.';
    $('#salud').innerHTML = h;
    $('#pie').textContent = ult + (s.outbox_pendiente ? ' Correos por salir: ' + s.outbox_pendiente + '.' : '');
  }
  function contar(estados) { return st.casos.filter(function (c) { return estados.indexOf(c.estado) >= 0; }).length; }
  function pintarResumen() {
    $('#resumen').innerHTML = CUBETAS.map(function (b) {
      return '<button class="cubeta ' + b.clase + '" data-cubeta="' + b.id + '" aria-pressed="' + (st.filtro === b.id) + '">' +
             '<span class="n">' + contar(b.estados) + '</span><span class="l">' + esc(b.t) + '</span><span class="q">' + esc(b.q) + '</span></button>';
    }).join('');
  }
  function visibles() {
    var b = CUBETAS.filter(function (x) { return x.id === st.filtro; })[0];
    return b ? st.casos.filter(function (c) { return b.estados.indexOf(c.estado) >= 0; }) : st.casos;
  }
  function pintarLista() {
    var cs = visibles();
    $('#filtro-t').textContent = st.filtro === 'todos' ? (st.cerrados ? 'Todos los casos' : 'Casos abiertos') : CUBETAS.filter(function (x) { return x.id === st.filtro; })[0].t;
    $('#ver-todos').classList.toggle('hid', st.filtro === 'todos');
    if (!cs.length) { $('#lista').innerHTML = '<div class="vacio">No hay casos en esta vista.</div>'; return; }
    $('#lista').innerHTML = '<div class="tabla-wrap"><table><thead><tr><th>Folio</th><th>Persona</th><th>Nivel</th><th class="num">Retardos</th><th>Estado</th><th>Vence</th><th class="num">Días abierto</th></tr></thead><tbody>' +
      cs.map(function (c) {
        return '<tr class="fila" tabindex="0" data-folio="' + esc(c.folio) + '"><td class="folio">' + esc(c.folio) + '</td>' +
          '<td class="quien2"><b>' + esc(c.nombre || ('Empleado ' + c.employee_id)) + '</b><span>' + esc(c.periodo) + (c.ruta === 'supervisor' ? ' · entrega por supervisor' : '') + '</span></td>' +
          '<td class="nivel"><i>' + c.nivel + '</i>' + esc(NIVEL[c.accion] || c.accion) + '</td>' +
          '<td class="n">' + c.retardos_n + '</td><td>' + chip(c.estado) + '</td>' +
          '<td class="num">' + (c.vence_at ? fechaDia(c.vence_at) : '') + '</td><td class="n">' + (c.dias_abierto == null ? '' : c.dias_abierto) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ── Detalle ──
  async function abrir(folio) {
    st.folio = folio; st.vista = 'detalle'; mostrarVista();
    $('#detalle').innerHTML = '<div class="caja vacio">Cargando ' + esc(folio) + '…</div>';
    var r;
    try { r = await pedir({ accion: 'caso', folio: folio }); } catch (e) { return; }
    if (!r || r.ok !== true) { $('#detalle').innerHTML = '<div class="caja vacio">' + mensajeError(r || {}) + '</div>'; return; }
    pintarDetalle(r);
  }
  function acciones(c, evs) {
    var a = [], s = c.estado;
    if (['ESPERANDO_FIRMA', 'VENCIDO', 'ESCALADO'].indexOf(s) >= 0) {
      a.push(['subir', 'Subir hoja entregada en papel', 'pri'], ['negativa', 'Se negó a firmar'], ['impugnar', 'Registrar impugnación']);
    }
    if (s === 'FIRMA_RECIBIDA') a.push(['validar', 'Validar firma', 'pri'], ['rechazar', 'Pedir la hoja otra vez'], ['impugnar', 'Registrar impugnación']);
    if (s === 'SE_NEGO_A_FIRMAR') {
      a.push(['constancia', 'Subir constancia de negativa']);
      if (c.accion === 'suspension') a.push(['programar', 'Programar suspensión', 'pri']);
      else a.push(['validar', 'Validar y cerrar', 'pri']);
    }
    if (s === 'IMPUGNADO') {
      a.push(['rechazar', 'No procede: pedir firma']);
      if (c.accion === 'suspension') a.push(['programar', 'No procede: programar suspensión', 'pri']);
    }
    if (s === 'VALIDADO_RH') { if (c.accion === 'suspension') a.push(['programar', 'Programar suspensión', 'pri']); a.push(['cerrar', 'Cerrar caso']); }
    if (s === 'ACCION_PROGRAMADA') a.push(['ejecutada', 'Confirmar que se aplicó', 'pri']);
    if (s === 'RETENIDO') a.push(['cerrar', 'Cerrar: ya se atendió en persona']);
    if (s !== 'CERRADO' && s !== 'CANCELADO_POR_RH' && s !== 'ACCION_VERIFICADA') a.push(['cancelar', 'Cancelar caso', 'peligro']);
    return a;
  }
  function pintarDetalle(r) {
    var c = r.caso || {}, evs = r.evidencias || [], bit = r.bitacora || [], env = r.envios || [];
    var acts = st.editor ? acciones(c, evs) : [];
    var retardos = (c.retardos || []).map(function (x) {
      return '<tr><td class="num">' + esc(x.fecha) + '</td><td class="num">' + esc(x.llegada) + '</td><td class="num">' + esc(x.esperada) + '</td><td class="n">' + esc(x.minutos) + '</td></tr>';
    }).join('');
    var h = '<button class="btn volver-lista" id="volver">← Volver a la lista</button>' +
      '<div class="cab"><div><h1>' + esc(c.nombre) + '</h1><div class="sub"><span class="folio">' + esc(c.folio) + '</span> · ' + esc(c.nombre_nivel) + ' · periodo ' + esc(c.periodo) + '</div></div><span class="sp"></span>' + chip(c.estado) + '</div>' +
      '<div class="detalle"><div style="display:grid;gap:14px;min-width:0">' +
      '<section class="caja bloque"><h2>' + esc(c.retardos_n) + ' retardos en el periodo</h2>' +
        (c.motivo_apertura === 'reincidencia' ? '<div class="aviso mal" style="margin:0"><div><b>Reincidencia</b>Ya tenía un documento firmado y validado en los últimos días. Por eso sube de nivel.</div></div>' : '') +
        '<div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Llegó</th><th>Entrada</th><th class="num">Minutos tarde</th></tr></thead><tbody>' + retardos + '</tbody></table></div></section>' +
      (acts.length ? '<section class="caja bloque"><h2>Qué sigue</h2><div class="acciones">' + acts.map(function (a) {
        return '<button class="btn ' + (a[2] || '') + '" data-accion="' + a[0] + '">' + esc(a[1]) + '</button>'; }).join('') + '</div><div id="form-accion"></div></section>' : '') +
      '<section class="caja bloque"><h2>Hojas y constancias</h2>' + (evs.length ? evs.map(function (e) {
        return '<div class="ev"><span><b>' + esc(e.nombre) + '</b><br><span class="nivel">' + esc(e.tipo === 'hoja_firmada' ? 'Hoja firmada' : e.tipo) + ' · llegó por ' + esc(e.origen) + ' · ' + fechaCorta(e.at) + '</span></span>' +
               '<button class="btn" data-ver="' + esc(e.id) + '">Ver</button></div>'; }).join('') + '<div id="visor"></div>'
        : '<div class="nivel">Todavía no hay ninguna hoja. Cuando la persona responda el correo con la hoja firmada, aparece aquí sola.</div>') + '</section>' +
      '</div><div style="display:grid;gap:14px;min-width:0">' +
      '<section class="caja bloque"><h3>Datos</h3><dl class="dl">' +
        '<dt>Puesto</dt><dd>' + esc(c.puesto) + '</dd><dt>Área</dt><dd>' + esc(c.departamento) + '</dd>' +
        '<dt>Correo</dt><dd>' + (c.email_valido ? 'registrado' : '<span class="chip e-vencido">sin correo válido</span>') + '</dd>' +
        '<dt>Supervisor</dt><dd>' + esc(c.supervisor || 'sin supervisor') + '</dd>' +
        '<dt>Plazo</dt><dd class="num">' + esc(c.vence || 'no aplica') + '</dd>' +
        (c.accion_desde ? '<dt>Suspensión</dt><dd class="num">' + esc(c.accion_desde) + ' al ' + esc(c.accion_hasta) + '</dd>' : '') +
        '<dt>Testigos</dt><dd>' + (c.requiere_testigos ? 'requiere dos' : 'no requiere') + '</dd></dl></section>' +
      '<section class="caja bloque"><h3>Correos</h3><ul class="linea">' + (env.length ? env.map(function (v) {
        return '<li><span class="cuando">' + (v.enviado_at ? fechaCorta(v.enviado_at) : 'pendiente') + '</span><span class="que"><b>' + esc(v.asunto || v.tipo) + '</b><br><span>' + esc(v.estado) + (v.modo ? ' · ' + esc(v.modo) : '') + '</span></span></li>'; }).join('') : '<li><span></span><span class="que"><span>Sin correos.</span></span></li>') + '</ul></section>' +
      '<section class="caja bloque"><h3>Bitácora</h3><ul class="linea">' + bit.map(function (b) {
        return '<li><span class="cuando">' + fechaCorta(b.at) + '</span><span class="que"><b>' + esc(b.a ? (E[b.a] || [b.a])[0] : b.evento) + '</b> · ' + esc(b.actor) + '<br><span>' + esc(b.motivo || '') + '</span></span></li>'; }).join('') + '</ul></section>' +
      '</div></div>';
    $('#detalle').innerHTML = h;
    $('#detalle').dataset.accion = c.accion;
  }

  function form(tipo) {
    var F = {
      subir: '<label>Archivo (PDF o foto, máximo 8 MB)<input type="file" id="f-archivo" accept="application/pdf,image/*"></label><button class="btn pri" data-enviar="subir_hoja">Subir hoja</button>',
      constancia: '<label>Constancia de negativa firmada por los testigos<input type="file" id="f-archivo" accept="application/pdf,image/*"></label><button class="btn pri" data-enviar="constancia">Subir constancia</button>',
      negativa: '<div class="fila2"><label>Testigo 1<input id="f-t1" autocomplete="off"></label><label>Testigo 2<input id="f-t2" autocomplete="off"></label></div><button class="btn pri" data-enviar="registrar_negativa">Registrar negativa</button>',
      impugnar: '<label>Lo que dice la persona<textarea id="f-version" rows="3"></textarea></label><button class="btn pri" data-enviar="impugnar">Registrar impugnación</button>',
      validar: '<label>Nota de validación (opcional)<input id="f-motivo"></label><button class="btn pri" data-enviar="validar_firma">Validar</button>',
      rechazar: '<label>Por qué se pide otra vez<input id="f-motivo" placeholder="Por ejemplo: la foto no se lee"></label><button class="btn pri" data-enviar="rechazar_firma">Pedir la hoja otra vez</button>',
      programar: '<div class="fila2"><label>Primer día<input type="date" id="f-desde"></label><label>Días hábiles (1 a 8)<input type="number" id="f-dias" min="1" max="8" value="1"></label></div><button class="btn pri" data-enviar="programar_accion">Programar</button>',
      ejecutada: '<label>Cómo se confirmó<input id="f-motivo" placeholder="Por ejemplo: cargada en Nómina, sin checadas esos días"></label><button class="btn pri" data-enviar="marcar_ejecutada">Confirmar</button>',
      cerrar: '<label>Motivo<input id="f-motivo"></label><button class="btn pri" data-enviar="cerrar">Cerrar caso</button>',
      cancelar: '<label>Motivo de la cancelación (obligatorio, queda en la bitácora)<input id="f-motivo"></label><button class="btn peligro" data-enviar="cancelar">Sí, cancelar el caso</button>'
    };
    $('#form-accion').innerHTML = '<div class="form">' + F[tipo] + '<div id="f-err" class="err"></div></div>';
  }
  function leerArchivo(f) {
    return new Promise(function (ok, mal) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { mal(new Error('ARCHIVO_ILEGIBLE')); };
      r.readAsDataURL(f);
    });
  }
  async function enviar(accion, boton) {
    var d = { accion: accion, folio: st.folio }, err = $('#f-err');
    if (accion === 'subir_hoja' || accion === 'constancia') {
      var f = $('#f-archivo').files[0];
      if (!f) { err.textContent = 'Elige un archivo.'; return; }
      if (f.size > 8 * 1024 * 1024) { err.textContent = 'El archivo pesa más de 8 MB.'; return; }
      d.accion = 'subir_hoja'; d.nombre = f.name; d.mime = f.type || 'application/pdf';
      d.tipo = accion === 'constancia' ? 'constancia_negativa' : 'hoja_firmada';
      d.contenido_b64 = await leerArchivo(f);
    }
    if ($('#f-motivo')) d.motivo = $('#f-motivo').value.trim();
    if ($('#f-t1')) { d.testigo1 = $('#f-t1').value.trim(); d.testigo2 = $('#f-t2').value.trim(); }
    if ($('#f-version')) { d.version = $('#f-version').value.trim(); d.motivo = 'El trabajador impugna'; }
    if ($('#f-desde')) { d.desde = $('#f-desde').value; d.dias = Number($('#f-dias').value); if (!d.desde) { err.textContent = 'Elige el primer día.'; return; } }
    boton.disabled = true;
    var r;
    try { r = await pedir(d); } catch (e) { return; } finally { boton.disabled = false; }
    if (!r || r.ok !== true) { err.textContent = mensajeError(r || {}); return; }
    toast('Listo. El caso quedó actualizado.');
    abrir(st.folio);
  }
  async function ver(id) {
    var v = $('#visor'); v.innerHTML = '<div class="nivel">Abriendo…</div>';
    var r;
    try { r = await pedir({ accion: 'evidencia', folio: st.folio, id: Number(id) }); } catch (e) { return; }
    if (!r || r.ok !== true) { v.innerHTML = '<div class="err">' + mensajeError(r || {}) + '</div>'; return; }
    if (!r.contenido_b64) { v.innerHTML = '<div class="visor">' + hojaEjemplo() + '</div>'; return; }
    var bin = atob(r.contenido_b64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([u8], { type: r.mime }));
    if (/^image[/]/.test(r.mime)) v.innerHTML = '<div class="visor"><img alt="Hoja firmada" src="' + url + '"></div>';
    else v.innerHTML = '<div class="visor"><iframe title="Hoja firmada" src="' + url + '" style="width:100%;height:520px;border:0"></iframe></div>' +
                       '<a class="enlace" href="' + url + '" target="_blank" rel="noopener">Abrir en otra pestaña</a>';
  }
  function hojaEjemplo() {
    return '<svg viewBox="0 0 320 200" role="img" aria-label="Hoja firmada de ejemplo" style="display:block;width:100%;max-width:420px;margin:0 auto">' +
      '<rect x="40" y="10" width="240" height="180" rx="4" fill="var(--card)" stroke="var(--border)"/>' +
      '<rect x="56" y="26" width="120" height="8" rx="2" fill="var(--muted)"/><rect x="200" y="26" width="64" height="8" rx="2" fill="var(--muted)"/>' +
      '<rect x="56" y="50" width="208" height="5" rx="2" fill="var(--border)"/><rect x="56" y="62" width="190" height="5" rx="2" fill="var(--border)"/><rect x="56" y="74" width="200" height="5" rx="2" fill="var(--border)"/>' +
      '<path d="M66 150 C 80 128, 92 160, 104 140 S 128 150, 140 136" fill="none" stroke="var(--blue)" stroke-width="2"/>' +
      '<line x1="56" y1="160" x2="150" y2="160" stroke="var(--muted2)"/><line x1="170" y1="160" x2="264" y2="160" stroke="var(--muted2)"/>' +
      '<text x="56" y="176" font-size="8" fill="var(--muted2)">Firma del trabajador</text><text x="170" y="176" font-size="8" fill="var(--muted2)">Recursos Humanos</text></svg>' +
      '<div class="nivel" style="padding:8px 12px">Vista de ejemplo. Con datos reales aquí se ve la foto o el PDF que mandó la persona.</div>';
  }

  // ── Ajustes ──
  async function ajustes() {
    st.vista = 'ajustes'; mostrarVista();
    $('#ajustes').innerHTML = '<div class="caja vacio">Cargando…</div>';
    var r;
    try { r = await pedir({ accion: 'config' }); } catch (e) { return; }
    if (!r || r.ok !== true) { $('#ajustes').innerHTML = '<div class="caja vacio">' + mensajeError(r || {}) + '</div>'; return; }
    var cfg = r.config || {}, esc2 = r.escalera || [], ex = r.exclusiones || [];
    var claves = ['modo', 'nivel_maximo_habilitado', 'suspensiones_habilitadas', 'tolerancia_min', 'hora_fuente', 'periodo', 'reincidencia_dias', 'contar_desde', 'dias_validacion_rh', 'buzon_receptor'];
    function val(v) { return v == null ? 'sin definir' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); }
    $('#ajustes').innerHTML =
      '<div class="aviso demo"><div><b>Valores por confirmar</b>Lo marcado "por confirmar" salió de la reconstrucción del sistema anterior o es una propuesta. Dirección y RH los confirman antes de pasar a modo real.</div></div>' +
      '<div class="detalle"><section class="caja bloque"><h2>Escalera de medidas</h2><div class="tabla-wrap"><table><thead><tr><th>Nivel</th><th>Medida</th><th class="num">Desde</th><th class="num">Plazo firma</th><th>Testigos</th><th>Estado</th></tr></thead><tbody>' +
        esc2.map(function (e) { return '<tr><td class="n">' + e.nivel + '</td><td>' + esc(e.nombre) + (e.dias_suspension ? ' (' + e.dias_suspension + ' día)' : '') + '</td><td class="n">' + e.umbral + ' retardos</td><td class="n">' + (e.dias_plazo_firma ? e.dias_plazo_firma + ' días háb.' : 'no firma') + '</td><td>' + (e.requiere_testigos ? 'dos' : 'no') + '</td><td>' + (e.confirmado ? '<span class="chip e-validado">confirmado</span>' : '<span class="chip e-espera">por confirmar</span>') + ' <span class="nivel">' + esc(e.origen) + '</span></td></tr>'; }).join('') +
        '</tbody></table></div></section>' +
      '<section class="caja bloque"><h2>Reglas</h2><dl class="dl">' + claves.filter(function (k) { return cfg[k]; }).map(function (k) {
        return '<dt>' + esc(k.replace(/_/g, ' ')) + '</dt><dd><b class="num">' + esc(val(cfg[k].valor)) + '</b> ' + (cfg[k].confirmado ? '' : '<span class="chip e-espera">por confirmar</span>') + '<br><span class="nivel">' + esc(cfg[k].descripcion || '') + '</span></dd>'; }).join('') + '</dl></section></div>' +
      '<section class="caja bloque" style="margin-top:14px"><h2>Días que no cuentan</h2><div class="nivel">Permisos, vacaciones, viajes o trabajo en campo de una persona. Un retardo en estos días no cuenta. Los días feriados de toda la empresa los agrega Dirección aparte.</div>' +
        '<div class="tabla-wrap"><table><thead><tr><th>Quién</th><th>Desde</th><th>Hasta</th><th>Tipo</th><th>Motivo</th><th></th></tr></thead><tbody>' +
        (ex.length ? ex.map(function (x) { return '<tr><td>' + 'Empleado ' + esc(x.employee_id) + '</td><td class="num">' + esc(x.desde) + '</td><td class="num">' + esc(x.hasta) + '</td><td>' + esc(x.tipo) + '</td><td>' + esc(x.motivo) + '</td><td>' + (st.editor ? '<button class="btn" data-quitar="' + esc(x.id) + '">Quitar</button>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="vacio">Ninguno.</td></tr>') +
        '</tbody></table></div>' +
        (st.editor ? '<div class="form"><div class="fila2"><label>Número de empleado<input id="x-emp" inputmode="numeric"></label><label>Tipo<select id="x-tipo"><option value="permiso">Permiso</option><option value="vacaciones">Vacaciones</option><option value="incapacidad">Incapacidad</option><option value="usa">Trabajo en USA</option><option value="campo">Trabajo en campo</option><option value="horario_especial">Horario especial</option><option value="no_aplica">No aplica el control</option><option value="otro">Otro</option></select></label></div>' +
          '<div class="fila2"><label>Desde<input type="date" id="x-desde"></label><label>Hasta<input type="date" id="x-hasta"></label></div><label>Motivo<input id="x-motivo"></label>' +
          '<button class="btn pri" id="x-agregar">Agregar</button><div id="x-err" class="err"></div></div>' : '') + '</section>';
  }
  async function agregarExclusion() {
    var d = { accion: 'exclusion_agregar', employee_id: $('#x-emp').value.trim() || null, tipo: $('#x-tipo').value, desde: $('#x-desde').value, hasta: $('#x-hasta').value, motivo: $('#x-motivo').value.trim() };
    if (!/^[0-9]+$/.test(String(d.employee_id || ''))) { $('#x-err').textContent = 'Escribe el número de empleado.'; return; }
    d.employee_id = Number(d.employee_id);
    if (!d.desde || !d.hasta || d.motivo.length < 5) { $('#x-err').textContent = 'Llena las dos fechas y un motivo.'; return; }
    if (d.hasta < d.desde) { $('#x-err').textContent = 'La fecha final va después de la inicial.'; return; }
    var r; try { r = await pedir(d); } catch (e) { return; }
    if (!r || r.ok !== true) { $('#x-err').textContent = mensajeError(r || {}); return; }
    toast('Agregado.'); ajustes();
  }
  async function quitarExclusion(id) {
    var r; try { r = await pedir({ accion: 'exclusion_quitar', id: Number(id), motivo: 'Quitado desde el panel' }); } catch (e) { return; }
    if (!r || r.ok !== true) { toast(mensajeError(r || {})); return; }
    toast('Quitado.'); ajustes();
  }

  // ── Calidad de datos (retardos_0005) ──
  function hhmm(h) {
    if (h == null || h === '') return '';
    var n = Number(h), m = Math.round(n * 60);
    return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
  }
  var BANDERAS = {
    ficha_vs_calendario: 'Ficha y calendario no coinciden', sin_correo: 'Sin correo', correo_personal: 'Correo personal',
    dominio_invalido: 'Dominio de correo inválido', correo_compartido: 'Correo compartido', retrasos_mas_180: 'Retrasos de más de 3 h',
    sin_checadas: 'Sin checadas en 90 días', sin_hora_entrada: 'Sin hora de entrada'
  };
  async function calidad() {
    st.vista = 'calidad'; mostrarVista();
    $('#calidad').innerHTML = '<div class="caja vacio">Cargando…</div>';
    var r;
    try { r = await pedir({ accion: 'calidad' }); } catch (e) { return; }
    if (!r || r.ok !== true) { $('#calidad').innerHTML = '<div class="caja vacio">' + mensajeError(r || {}) + '</div>'; return; }
    st.calidad = r.personas || [];
    var cuenta = {}; st.calidad.forEach(function (p) { Object.keys(p.banderas || {}).forEach(function (b) { cuenta[b] = (cuenta[b] || 0) + 1; }); });
    var revisados = st.calidad.filter(function (p) { return p.revisado; }).length;
    $('#calidad').innerHTML =
      '<div class="aviso demo"><div><b>La hora sugerida es sólo una referencia</b>' + esc(r.regla_sugerida || '') + ' Nada de esta pantalla cambia la ficha en Odoo: si RH decide corregir una hora, la corrige en Odoo y aquí marca "revisado".</div></div>' +
      '<div class="resumen">' + '<div class="cubeta"><span class="n">' + revisados + ' / ' + st.calidad.length + '</span><span class="l">Personas revisadas</span></div>' +
        Object.keys(BANDERAS).filter(function (b) { return cuenta[b]; }).map(function (b) {
          return '<div class="cubeta"><span class="n">' + cuenta[b] + '</span><span class="l">' + esc(BANDERAS[b]) + '</span></div>'; }).join('') + '</div>' +
      '<div class="caja"><div class="tabla-wrap"><table class="calidad"><thead><tr><th>Persona y banderas</th><th class="num">Ficha</th><th class="num">Sugerida</th><th class="num">Tarde con su hora</th><th class="num">Mediana</th><th class="num">Percentil 25</th><th class="num">Calendario</th><th>Revisión</th></tr></thead><tbody>' +
      st.calidad.map(function (p) {
        var b = Object.keys(p.banderas || {}).map(function (k) { return '<span class="chip e-espera">' + esc(BANDERAS[k] || k) + '</span>'; }).join('');
        var cambia = p.hora_sugerida != null && Number(p.hora_sugerida) !== Number(p.hora_entrada);
        return '<tr><td class="quien2"><b>' + esc(p.nombre || ('Empleado ' + p.employee_id)) + '</b><span>' + esc(p.departamento || '') + ' · núm. ' + esc(p.employee_id) + ' · ' + esc(p.dias_con_checada) + ' días con checada</span>' +
          (b ? '<div class="chips">' + b + '</div>' : '') + '</td>' +
          '<td class="n">' + hhmm(p.hora_entrada) + '</td>' +
          '<td class="n">' + (cambia ? '<b class="cambia">' + hhmm(p.hora_sugerida) + '</b>' : hhmm(p.hora_sugerida)) + '</td>' +
          '<td class="n">' + (p.pct_tarde == null ? '' : esc(p.pct_tarde) + ' %') + '</td>' +
          '<td class="n">' + hhmm(p.mediana) + '</td><td class="n">' + hhmm(p.p25) + '</td><td class="n">' + hhmm(p.hora_calendario) + '</td>' +
          '<td>' + (p.revisado ? '<span class="chip e-validado" title="' + esc((p.nota || '') + ' · ' + (p.revisado_por || '')) + '">revisado</span>' + (st.editor ? ' <button class="enlace" data-revisar="' + esc(p.employee_id) + '" data-valor="0">quitar</button>' : '')
                         : (st.editor ? '<button class="btn" data-revisar="' + esc(p.employee_id) + '" data-valor="1">Marcar revisado</button>' : '')) + '</td></tr>';
      }).join('') + '</tbody></table></div></div><div id="form-revisar"></div>';
  }
  function formRevisar(id, valor) {
    var p = (st.calidad || []).filter(function (x) { return String(x.employee_id) === String(id); })[0] || {};
    $('#form-revisar').innerHTML = '<div class="form" style="margin-top:12px"><b>' + esc(p.nombre || ('Empleado ' + id)) + '</b>' +
      '<label>Qué se decidió (queda en la bitácora)<input id="rv-nota" placeholder="' + (valor === '1' ? 'Por ejemplo: su entrada real es 8:00; se corrige en Odoo' : 'Por qué se quita la marca') + '"></label>' +
      '<button class="btn pri" data-guardar-revision="' + esc(id) + '" data-valor="' + valor + '">' + (valor === '1' ? 'Marcar revisado' : 'Quitar la marca') + '</button><div id="rv-err" class="err"></div></div>';
    $('#rv-nota').focus();
  }
  async function guardarRevision(id, valor, boton) {
    var nota = $('#rv-nota').value.trim();
    if (nota.length < 5) { $('#rv-err').textContent = 'Escribe qué se decidió.'; return; }
    boton.disabled = true;
    var r; try { r = await pedir({ accion: 'calidad_revisar', employee_id: Number(id), revisado: valor === '1', nota: nota }); } catch (e) { return; } finally { boton.disabled = false; }
    if (!r || r.ok !== true) { $('#rv-err').textContent = mensajeError(r || {}); return; }
    toast('Guardado.'); calidad();
  }

  function mostrarVista() {
    $('#v-lista').classList.toggle('hid', st.vista !== 'lista');
    $('#detalle').classList.toggle('hid', st.vista !== 'detalle');
    $('#ajustes').classList.toggle('hid', st.vista !== 'ajustes');
    $('#calidad').classList.toggle('hid', st.vista !== 'calidad');
    document.querySelectorAll('[data-vista]').forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.vista === st.vista || (t.dataset.vista === 'lista' && st.vista === 'detalle'))); });
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, tr.fila'); if (!t) return;
    if (t.id === 'entrar') return entrar();
    if (t.id === 'demo') return modoDemo();
    if (t.id === 'salir') { if (G.RetApi.modo !== 'demo') G.SuiteAuth.logout(); G.RetApi.modo = 'real'; $('#modo').classList.add('hid'); return mostrarPuerta(); }
    if (t.id === 'volver') { st.vista = 'lista'; mostrarVista(); return cargar(); }
    if (t.id === 'ver-todos') { st.filtro = 'todos'; pintarResumen(); return pintarLista(); }
    if (t.id === 'cerrados') { st.cerrados = !st.cerrados; t.textContent = st.cerrados ? 'Ocultar cerrados' : 'Incluir cerrados'; st.filtro = 'todos'; return cargar(); }
    if (t.id === 'x-agregar') return agregarExclusion();
    if (t.dataset.vista) { if (t.dataset.vista === 'ajustes') return ajustes(); if (t.dataset.vista === 'calidad') return calidad(); st.vista = 'lista'; mostrarVista(); return cargar(); }
    if (t.dataset.revisar) return formRevisar(t.dataset.revisar, t.dataset.valor);
    if (t.dataset.guardarRevision) return guardarRevision(t.dataset.guardarRevision, t.dataset.valor, t);
    if (t.dataset.cubeta) { st.filtro = st.filtro === t.dataset.cubeta ? 'todos' : t.dataset.cubeta; pintarResumen(); return pintarLista(); }
    if (t.dataset.folio) return abrir(t.dataset.folio);
    if (t.dataset.accion) return form(t.dataset.accion);
    if (t.dataset.enviar) return enviar(t.dataset.enviar, t);
    if (t.dataset.ver) return ver(t.dataset.ver);
    if (t.dataset.quitar) return quitarExclusion(t.dataset.quitar);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('tr.fila')) abrir(ev.target.dataset.folio);
    if (ev.key === 'Enter' && ev.target.id === 'p') entrar();
  });

  function iniciar() {
    fetch('version.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (v) { if (v && v.version) $('#ver-badge').textContent = v.version; }).catch(function () {});
    if (G.RET_FORZAR_DEMO) return modoDemo();
    if (G.SuiteAuth && G.SuiteAuth.isValid() && G.SuiteAuth.tieneScope('retardos:read')) {
      st.editor = G.SuiteAuth.tieneScope('retardos:write');
      var s = G.SuiteAuth.getSession(); return entrarApp(s && s.nombre);
    }
    mostrarPuerta();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window);
