/* ═══ RH · Retardos · pantalla (#334) ═══
 *
 * Lo que RH hace aquí, en orden de frecuencia (complemento S2: RH recolecta las firmas):
 *   1. Firmas por recolectar: imprimir la hoja, citar a la persona, recolectar la firma
 *      (o la negativa con dos testigos) y subir la hoja escaneada o en foto.
 *   2. Hojas por confirmar: el lector sugiere, RH confirma, corrige, pide de nuevo o
 *      registra la impugnación. La sugerencia nunca cierra un caso sola.
 *   3. Reincidencia acumulada: semáforo por persona y alertas de "activar modo suspensión",
 *      que se atienden aquí (cambiar, posponer o descartar con motivo) y nunca cambian el modo.
 *   4. Programar y confirmar una suspensión (sólo en modo con suspensión, 1 a 8 días).
 *
 * La pantalla NO decide estados: pide la acción al servidor y pinta lo que el servidor
 * devuelve (CLAUDE.md §8, la UI no es fuente de verdad). Un 200 sin ok:true no cuenta.
 * Sin guiones largos en los textos.
 */
(function (G) {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var E = {
    DETECTADO: ['Detectado', 'e-otro'], NOTIFICADO: ['Notificado', 'e-otro'], ESPERANDO_FIRMA: ['RH recolecta firma', 'e-espera'],
    VENCIDO: ['Vencido', 'e-vencido'], ESCALADO: ['Escalado', 'e-escalado'], FIRMA_RECIBIDA: ['Hoja por confirmar', 'e-recibida'],
    SE_NEGO_A_FIRMAR: ['Se negó a firmar', 'e-negativa'], IMPUGNADO: ['Impugnado', 'e-impugnado'], VALIDADO_RH: ['Validado por RH', 'e-validado'],
    ACCION_PROGRAMADA: ['Suspensión programada', 'e-programada'], ACCION_VERIFICADA: ['Suspensión verificada', 'e-verificada'],
    CERRADO: ['Cerrado', 'e-cerrado'], CANCELADO_POR_RH: ['Cancelado por RH', 'e-otro'],
    RETENIDO: ['Nivel de suspensión alcanzado, no aplicado', 'e-retenido']
  };
  var NIVEL = { aviso: 'Aviso', carta_compromiso: 'Carta compromiso', acta: 'Acta administrativa', suspension: 'Suspensión',
    aviso_jornada_1: 'Jornada: 1er aviso', aviso_jornada_2: 'Jornada: 2do aviso', aviso_jornada_3: 'Jornada: 3er aviso' };
  function esJor(c) { return String(c.folio || '').indexOf('JOR-') === 0 || c.tipo === 'jornada'; }
  var CUBETAS = [
    { id: 'recolectar', t: 'Firmas por recolectar', q: 'Imprimir, citar y subir la hoja. Por vencimiento', clase: '', estados: ['ESPERANDO_FIRMA', 'VENCIDO', 'ESCALADO', 'DETECTADO', 'NOTIFICADO'] },
    { id: 'rh', t: 'Casos con hoja recibida', q: 'Confírmala en Hojas por confirmar', clase: 'rh', estados: ['FIRMA_RECIBIDA'] },
    { id: 'vencidos', t: 'Vencidos o escalados', q: 'RH no subió la hoja a tiempo', clase: 'urge', estados: ['VENCIDO', 'ESCALADO'] },
    { id: 'resolver', t: 'Por resolver', q: 'Negativa, impugnación o validado', clase: '', estados: ['SE_NEGO_A_FIRMAR', 'IMPUGNADO', 'VALIDADO_RH', 'ACCION_PROGRAMADA'] },
    { id: 'retenidos', t: 'Suspensión alcanzada, no aplicada', q: 'Modo sin suspensión: cuenta como antecedente', clase: 'ret', estados: ['RETENIDO'] },
    { id: 'sinjefe', t: 'Falta jefe en Odoo', q: 'El aviso salió con copia a Dirección. Asignar jefe en Odoo', clase: 'urge', f: faltaJefe }
  ];
  function faltaJefe(c) { return c.jefe_estado === 'sin_jefe' || c.jefe_estado === 'jefe_sin_correo'; }
  function enCubeta(b, c) { return b.f ? b.f(c) : b.estados.indexOf(c.estado) >= 0; }
  function chipPista(c) { return c.pista === 'real' ? '<span class="chip e-real">' + (c.modo_al_abrir === 'piloto' ? 'real · piloto' : 'real') + '</span>' : ''; }
  function chipJefe(c) { return faltaJefe(c) ? '<span class="chip e-vencido">' + (c.jefe_estado === 'sin_jefe' ? 'falta jefe en Odoo' : 'jefe sin correo') + '</span>' : ''; }
  var st = { casos: [], salud: null, filtro: 'todos', vista: 'lista', folio: null, editor: false, cerrados: false, hojas: [], reinc: null, jor: null, jSem: null, medidas: [], piloto: null };

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
      ARCHIVO_ILEGIBLE: 'El archivo está vacío o dañado.', SOLO_LECTURA: 'Tu usuario sólo puede consultar.',
      LECTURA_YA_DECIDIDA: 'Esa hoja ya la resolvió alguien más. Recarga.', SIN_CASO_LIGADO: 'La hoja no está ligada a un caso: corrige el folio primero.',
      CASO_NO_ESPERA_HOJA: 'El caso ya no espera hoja. Recarga para ver su estado.', FOLIO_INEXISTENTE: 'Ese folio no existe.',
      MAXIMO_10_ARCHIVOS: 'Sube máximo 10 archivos a la vez.', TIPO_NO_ACEPTADO: 'Sólo PDF o fotos (JPG, PNG).', ARCHIVO_DEMASIADO_GRANDE: 'El archivo pesa demasiado.',
      SEMANAS_INVALIDAS: 'Pospón entre 1 y 26 semanas.', DECISION_INVALIDA: 'Elige una de las opciones.',
      HORAS_INVALIDAS: 'Revisa las horas: van de 0 a 168 y el descuento no puede pasar del faltante.', SEMANA_INEXISTENTE: 'Esa semana ya no está en la lista. Recarga.',
      YA_TIENE_CASO: 'Esa semana ya abrió un aviso: se atiende desde el caso.', MEDIDA_INEXISTENTE: 'Esa propuesta ya no existe. Recarga.', MEDIDA_YA_DECIDIDA: 'Esa propuesta ya se decidió. Recarga.'
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
    st.casos = r.casos || []; st.salud = r.salud || null; st.piloto = r.piloto || null;
    pintarSalud(); pintarResumen(); pintarLista();
  }
  function pintarSalud() {
    var s = st.salud, h = '';
    if (!s) { $('#salud').innerHTML = ''; return; }
    var pl = st.piloto || {}, nPl = (pl.empleados || []).length;
    if (s.modo === 'real') h += '<div class="aviso bien"><div><b>Modo real' + (pl.real_inicio ? ' desde ' + esc(fechaCorta(pl.real_inicio)) : '') + '</b>Los avisos nuevos llegan a cada persona, con copia a RH y a su jefe directo. Los casos que se abrieron en sombra siguen en sombra.</div></div>';
    else {
      if (pl.habilitado === true && pl.inicio && nPl) h += '<div class="aviso bien"><div><b>Piloto activo desde ' + esc(fechaCorta(pl.inicio)) + '</b>' + nPl + ' personas reciben avisos reales (casos marcados <i>real · piloto</i>). Sólo cuentan los retardos desde esa hora. El resto de la plantilla sigue en sombra.</div></div>';
      else if (pl.habilitado === true && nPl) h += '<div class="aviso demo"><div><b>Piloto listo, todavía sin arrancar</b>' + nPl + ' personas recibirán avisos reales en cuanto se publique esta versión. Mientras tanto todo sigue en sombra.</div></div>';
      else if (pl.habilitado === false && pl.inicio) h += '<div class="aviso mal"><div><b>Piloto apagado</b>Se apagó con el interruptor. Nadie recibe avisos reales.</div></div>';
      h += '<div class="aviso sombra"><div><b>Modo sombra</b>' + (pl.habilitado === true && pl.inicio && nPl ? 'Fuera del piloto, ningún' : 'Ningún') + ' correo llega a los empleados. Cada correo se desvía a Dirección y RH con la etiqueta [SOMBRA] y el destinatario real en el cuerpo.</div></div>';
    }
    if (s.ok === false) {
      h += '<div class="aviso mal"><div><b>El monitor encontró problemas</b><ul>' + (s.problemas || []).map(function (p) { return '<li>' + esc(p.detalle) + '</li>'; }).join('') + '</ul></div></div>';
    }
    var ult = s.ultima_deteccion ? 'Última revisión de asistencias: ' + fechaCorta(s.ultima_deteccion) + ', ' + (s.ultima_deteccion_leidos || 0) + ' checadas leídas.' : 'La revisión de asistencias todavía no ha corrido.';
    $('#salud').innerHTML = h;
    $('#pie').textContent = ult + (s.outbox_pendiente ? ' Correos por salir: ' + s.outbox_pendiente + '.' : '');
  }
  function contar(b) { return st.casos.filter(function (c) { return enCubeta(b, c); }).length; }
  function pintarResumen() {
    $('#resumen').innerHTML = CUBETAS.map(function (b) {
      return '<button class="cubeta ' + b.clase + '" data-cubeta="' + b.id + '" aria-pressed="' + (st.filtro === b.id) + '">' +
             '<span class="n">' + contar(b) + '</span><span class="l">' + esc(b.t) + '</span><span class="q">' + esc(b.q) + '</span></button>';
    }).join('');
  }
  function visibles() {
    var b = CUBETAS.filter(function (x) { return x.id === st.filtro; })[0];
    var cs = b ? st.casos.filter(function (c) { return enCubeta(b, c); }) : st.casos.slice();
    if (st.filtro === 'recolectar') cs.sort(function (a, c) { return String(a.vence_at || '9') < String(c.vence_at || '9') ? -1 : 1; });
    return cs;
  }
  function pintarLista() {
    var cs = visibles();
    $('#filtro-t').textContent = st.filtro === 'todos' ? (st.cerrados ? 'Todos los casos' : 'Casos abiertos') : CUBETAS.filter(function (x) { return x.id === st.filtro; })[0].t;
    $('#ver-todos').classList.toggle('hid', st.filtro === 'todos');
    if (!cs.length) { $('#lista').innerHTML = '<div class="vacio">No hay casos en esta vista.</div>'; return; }
    var imprimir = st.filtro === 'recolectar';
    $('#lista').innerHTML = '<div class="tabla-wrap"><table><thead><tr><th>Folio</th><th>Persona</th><th>Nivel</th><th class="num">Retardos</th><th>Estado</th><th>Vence</th><th class="num">Días abierto</th>' + (imprimir ? '<th></th>' : '') + '</tr></thead><tbody>' +
      cs.map(function (c) {
        return '<tr class="fila" tabindex="0" data-folio="' + esc(c.folio) + '"><td class="folio">' + esc(c.folio) + '</td>' +
          '<td class="quien2"><b>' + esc(c.nombre || ('Empleado ' + c.employee_id)) + '</b><span>' + esc(c.periodo) + (c.ruta === 'supervisor' ? ' · entrega por supervisor' : '') + '</span>' + (chipPista(c) || chipJefe(c) ? '<span class="chips2">' + chipPista(c) + ' ' + chipJefe(c) + '</span>' : '') + '</td>' +
          '<td class="nivel"><i>' + c.nivel + '</i>' + esc(NIVEL[c.accion] || c.accion) + '</td>' +
          '<td class="n">' + (esJor(c) ? '<span class="nivel">jornada</span>' : c.retardos_n) + '</td><td>' + chip(c.estado) + '</td>' +
          '<td class="num vence">' + (c.vence_at ? fechaDia(c.vence_at) : '') + '</td><td class="n">' + (c.dias_abierto == null ? '' : c.dias_abierto) + '</td>' +
          (imprimir ? '<td><button class="btn" data-imprimir="' + esc(c.folio) + '">Imprimir hoja</button></td>' : '') + '</tr>';
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
      a.push(['imprimir', 'Imprimir hoja', 'pri'], ['subir', 'Subir hoja recolectada'], ['negativa', 'Se negó a firmar (sin hoja)'], ['impugnar', 'Registrar impugnación']);
    }
    if (s === 'FIRMA_RECIBIDA') a.push(['ir_hojas', 'Confirmar en Hojas por confirmar', 'pri'], ['impugnar', 'Registrar impugnación']);
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
  function bloqueJornadaCaso(c) {
    var j = c.jornada || {};
    return '<section class="caja bloque"><h2>Semana ' + esc(j.semana || c.periodo) + ': ' + esc(j.horas_efectivas || '') + ' de ' + esc(j.umbral || '') + ' horas efectivas</h2>' +
      '<div class="nivel">Viernes ' + esc(j.desde || '') + ' a jueves ' + esc(j.hasta || '') + ', hora del centro (CST). Aviso ' + esc(j.aviso_n || c.nivel) + ' de 3. Faltante: ' + esc(j.faltante || '') + '.</div>' +
      '<div class="tabla-wrap"><table><thead><tr><th>Día</th><th class="num">Registradas</th><th class="num">Comida</th><th class="num">Efectivas</th><th>Nota</th></tr></thead><tbody>' +
      (j.dias || []).map(function (x) { return '<tr><td>' + esc(x.dia) + ' ' + esc(x.fecha) + '</td><td class="n">' + esc(x.brutas) + '</td><td class="n">' + esc(x.comida) + '</td><td class="n">' + esc(x.efectivas) + '</td><td class="nivel">' + esc(x.nota || '') + '</td></tr>'; }).join('') +
      '</tbody></table></div></section>';
  }
  function pintarDetalle(r) {
    var c = r.caso || {}, evs = r.evidencias || [], bit = r.bitacora || [], env = r.envios || [];
    var acts = st.editor ? acciones(c, evs) : [];
    var retardos = (c.retardos || []).map(function (x) {
      return '<tr><td class="num">' + esc(x.fecha) + '</td><td class="num">' + esc(x.llegada) + '</td><td class="num">' + esc(x.esperada) + '</td><td class="n">' + esc(x.minutos) + '</td></tr>';
    }).join('');
    var h = '<button class="btn volver-lista" id="volver">← Volver a la lista</button>' +
      '<div class="cab"><div><h1>' + esc(c.nombre) + '</h1><div class="sub"><span class="folio">' + esc(c.folio) + '</span> · ' + esc(c.nombre_nivel) + ' · periodo ' + esc(c.periodo) + '</div></div><span class="sp"></span>' + chipPista(c) + ' ' + chip(c.estado) + '</div>' +
      (c.leyenda_jefe ? '<div class="aviso mal"><div><b>' + esc(c.leyenda_jefe) + '</b>' + (c.jefe_estado === 'sin_jefe' ? 'El aviso salió a la persona con copia a RH y a Dirección, y lleva esta leyenda arriba. Asigna el jefe directo en Odoo (campo Gerente de la ficha) para que los siguientes le lleguen.' : 'El aviso salió con copia a RH y a Dirección. Carga un correo de empresa al jefe en Odoo.') + '</div></div>' : '') +
      '<div class="detalle"><div style="display:grid;gap:14px;min-width:0">' +
      (esJor(c) ? bloqueJornadaCaso(c) :
      '<section class="caja bloque"><h2>' + esc(c.retardos_n) + ' retardos en el periodo</h2>' +
        (c.motivo_apertura === 'reincidencia' ? '<div class="aviso mal" style="margin:0"><div><b>Reincidencia</b>Ya tenía un documento firmado y validado en los últimos días. Por eso sube de nivel.</div></div>' : '') +
        '<div class="nivel">Hora del centro (CST). Tolerancia de ' + esc(c.tolerancia_min == null ? 15 : c.tolerancia_min) + ' minutos al segundo: llegar a los 15:00 no es retardo, a los 15:01 sí. El premio de puntualidad (PPA) es otra regla: se gana checando a más tardar ' + esc(c.ppa_minutos == null ? 5 : c.ppa_minutos) + ' minutos después de la entrada y lo calcula Nómina.</div>' +
        '<div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Llegó</th><th>Entrada</th><th class="num">Minutos tarde</th></tr></thead><tbody>' + retardos + '</tbody></table></div></section>') +
      (acts.length ? '<section class="caja bloque"><h2>Qué sigue</h2><div class="acciones">' + acts.map(function (a) {
        return '<button class="btn ' + (a[2] || '') + '" data-accion="' + a[0] + '">' + esc(a[1]) + '</button>'; }).join('') + '</div><div id="form-accion"></div></section>' : '') +
      '<section class="caja bloque"><h2>Hojas y constancias</h2>' + (evs.length ? evs.map(function (e) {
        return '<div class="ev"><span><b>' + esc(e.nombre) + '</b><br><span class="nivel">' + esc(e.tipo === 'hoja_firmada' ? 'Hoja firmada' : e.tipo) + ' · llegó por ' + esc(e.origen) + ' · ' + fechaCorta(e.at) + '</span></span>' +
               '<button class="btn" data-ver="' + esc(e.id) + '">Ver</button></div>'; }).join('') + '<div id="visor"></div>'
        : '<div class="nivel">Todavía no hay ninguna hoja. RH la sube cuando la recolecte (aquí, en Hojas por confirmar o en la carpeta de hojas) y el lector la liga sola por el código QR.</div>') + '</section>' +
      '</div><div style="display:grid;gap:14px;min-width:0">' +
      '<section class="caja bloque"><h3>Datos</h3><dl class="dl">' +
        '<dt>Puesto</dt><dd>' + esc(c.puesto) + '</dd><dt>Área</dt><dd>' + esc(c.departamento) + '</dd>' +
        '<dt>Correo</dt><dd>' + (c.email_valido ? 'registrado' : '<span class="chip e-vencido">sin correo válido</span>') + '</dd>' +
        '<dt>Jefe directo</dt><dd>' + (faltaJefe(c) ? chipJefe(c) : esc(c.supervisor || 'sin jefe')) + '</dd>' +
        '<dt>Pista</dt><dd>' + (c.pista === 'real' ? 'real' + (c.modo_al_abrir === 'piloto' ? ' (piloto)' : '') : 'sombra') + '</dd>' +
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
    if (tipo === 'imprimir') return imprimir(st.folio);
    if (tipo === 'ir_hojas') return hojas(st.folio);
    var F = {
      subir: '<label>Archivo (PDF o foto, máximo 8 MB)<input type="file" id="f-archivo" accept="application/pdf,image/*"></label><div class="nivel">El lector la revisa en unos minutos y aparece en Hojas por confirmar.</div><button class="btn pri" data-enviar="subir_hoja">Subir hoja</button>',
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
      if (d.tipo === 'hoja_firmada') { d.accion = 'subir_hojas'; d.archivos = [{ nombre: d.nombre, mime: d.mime, contenido_b64: d.contenido_b64, folio: st.folio }]; delete d.contenido_b64; }
    }
    if ($('#f-motivo')) d.motivo = $('#f-motivo').value.trim();
    if ($('#f-t1')) { d.testigo1 = $('#f-t1').value.trim(); d.testigo2 = $('#f-t2').value.trim(); }
    if ($('#f-version')) { d.version = $('#f-version').value.trim(); d.motivo = 'El trabajador impugna'; }
    if ($('#f-desde')) { d.desde = $('#f-desde').value; d.dias = Number($('#f-dias').value); if (!d.desde) { err.textContent = 'Elige el primer día.'; return; } }
    boton.disabled = true;
    var r;
    try { r = await pedir(d); } catch (e) { return; } finally { boton.disabled = false; }
    if (!r || r.ok !== true) { err.textContent = mensajeError(r || {}); return; }
    toast(d.accion === 'subir_hojas' ? 'Subida. El lector la revisa y aparece en Hojas por confirmar.' : 'Listo. El caso quedó actualizado.');
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
    var claves = ['modo', 'modo_sanciones', 'tolerancia_min', 'dias_habiles', 'zona_horaria', 'hora_fuente', 'periodo', 'reincidencia_dias', 'contar_desde', 'dias_recoleccion_rh', 'correo_modo', 'dias_validacion_rh', 'hojas_carpeta', 'buzon_receptor', 'real_desde', 'real_inicio', 'piloto_employee_ids', 'piloto_habilitado', 'piloto_inicio', 'aviso_cc_rh', 'aviso_cc_sin_jefe', 'leyenda_sin_jefe', 'ppa_minutos'];
    var clavesJ = ['jornada_umbral_horas', 'jornada_comida_min', 'jornada_comida_fin_de_semana', 'jornada_comida_fds_min_horas', 'jornada_usar_calendario', 'jornada_tolerancia_calendario_h', 'jornada_horas_max_asistencia', 'jornada_ventana_dias', 'jornada_plazo_correccion_dias', 'jornada_desde', 'jornada_envio', 'modo_medidas_jornada', 'jornada_tipo_nomina_descuento'];
    var escJ = r.escalera_jornada || [], fest = r.festivos || [], pls = r.plantillas || [];
    function val(v) { return v == null ? 'sin definir' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); }
    function dl(ks) { return ks.filter(function (k) { return cfg[k]; }).map(function (k) {
      return '<dt>' + esc(k.replace(/_/g, ' ')) + '</dt><dd><b class="num">' + esc(val(cfg[k].valor)) + '</b> ' + (cfg[k].confirmado ? '' : '<span class="chip e-espera">por confirmar</span>') + '<br><span class="nivel">' + esc(cfg[k].descripcion || '') + '</span></dd>'; }).join(''); }
    $('#ajustes').innerHTML =
      '<div class="aviso demo"><div><b>Valores por confirmar</b>Lo marcado "por confirmar" salió de la reconstrucción del sistema anterior o es una propuesta. Dirección y RH los confirman antes de pasar a modo real.</div></div>' +
      '<div class="detalle"><section class="caja bloque"><h2>Escalera de medidas</h2><div class="tabla-wrap"><table><thead><tr><th>Nivel</th><th>Medida</th><th class="num">Desde</th><th class="num">Plazo firma</th><th>Testigos</th><th>Estado</th></tr></thead><tbody>' +
        esc2.map(function (e) { return '<tr><td class="n">' + e.nivel + '</td><td>' + esc(e.nombre) + (e.dias_suspension ? ' (' + e.dias_suspension + ' día)' : '') + '</td><td class="n">' + e.umbral + ' retardos</td><td class="n">' + (e.dias_plazo_firma ? e.dias_plazo_firma + ' días háb.' : 'no firma') + '</td><td>' + (e.requiere_testigos ? 'dos' : 'no') + '</td><td>' + (e.confirmado ? '<span class="chip e-validado">confirmado</span>' : '<span class="chip e-espera">por confirmar</span>') + ' <span class="nivel">' + esc(e.origen) + '</span></td></tr>'; }).join('') +
        '</tbody></table></div></section>' +
      '<section class="caja bloque"><h2>Reglas de retardo</h2><dl class="dl">' + dl(claves) + '</dl></section></div>' +
      '<div class="detalle" style="margin-top:14px"><section class="caja bloque"><h2>Jornada semanal FTS</h2>' +
        '<div class="nivel">Semana de viernes 00:00 a jueves 23:59:59, hora del centro. Una asistencia que cruza el corte se parte en dos. El corte corre el viernes a las 08:00.</div>' +
        '<dl class="dl">' + dl(clavesJ) + '</dl></section>' +
      '<section class="caja bloque"><h2>Avisos de jornada</h2><ul class="linea">' +
        escJ.map(function (e) { return '<li><div><b>' + e.nivel + '. ' + esc(e.nombre) + '</b> ' + (e.confirmado ? '<span class="chip e-validado">confirmado</span>' : '<span class="chip e-espera">por confirmar</span>') + '<br><span class="nivel">' + esc(e.nota || '') + '</span></div></li>'; }).join('') +
        '</ul><div class="nivel">La propuesta de medida del tercer aviso queda retenida mientras modo medidas jornada sea "retenidas".</div></section></div>' +
      '<div class="detalle" style="margin-top:14px"><section class="caja bloque"><h2>Días feriados</h2><div class="nivel">Toda la empresa. No cuentan como retardo y bajan 9.6 horas el umbral de la semana. Sembrados los del artículo 74 de la LFT; Dirección agrega los que decida la empresa.</div>' +
        '<div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Nombre</th><th></th></tr></thead><tbody>' +
        (fest.length ? fest.map(function (f) { return '<tr><td class="num">' + esc(f.fecha) + '</td><td>' + esc(f.nombre) + '</td><td>' + (st.editor ? '<button class="btn" data-quitar-festivo="' + esc(f.fecha) + '">Quitar</button>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="3" class="vacio">Ninguno.</td></tr>') +
        '</tbody></table></div>' +
        (st.editor ? '<div class="form"><div class="fila2"><label>Fecha<input type="date" id="f-fecha"></label><label>Nombre<input id="f-nombre"></label></div><button class="btn pri" id="f-agregar">Agregar feriado</button><div id="f-err" class="err"></div></div>' : '') + '</section>' +
      '<section class="caja bloque"><h2>Textos de los correos</h2><div class="nivel">Todos dicen "texto pendiente de validación de RH" hasta que RH los apruebe. Cómo se reemplazan: docs/retardos/PLANTILLAS.md.</div><ul class="linea">' +
        pls.map(function (t) { return '<li><div><b>' + esc(t.clave) + '</b> ' + (t.estado_texto === 'validado_rh' ? '<span class="chip e-validado">validado por RH</span>' : '<span class="chip e-espera">pendiente de RH</span>') + '</div></li>'; }).join('') + '</ul></section></div>' +
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

  async function festivo(accion, fecha, boton) {
    var d = { accion: accion, fecha: fecha };
    if (accion === 'festivo_agregar') {
      d.nombre = ($('#f-nombre').value || '').trim();
      if (!d.fecha || d.nombre.length < 3) { $('#f-err').textContent = 'Escribe la fecha y el nombre del feriado.'; return; }
    } else d.motivo = 'Quitado desde el panel';
    if (boton) boton.disabled = true;
    var r; try { r = await pedir(d); } catch (e) { return; } finally { if (boton) boton.disabled = false; }
    if (!r || r.ok !== true) { toast(mensajeError(r || {})); return; }
    toast(accion === 'festivo_agregar' ? 'Feriado agregado.' : 'Feriado quitado.'); ajustes();
  }

  // ── Jornada semanal FTS (reglas R3) ──
  var DIA = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  var ESTJ = { cumple: ['Cumple', 'e-validado'], incumple: ['Incumple', 'e-vencido'], revisar: ['Por revisar', 'e-espera'], exento: ['Exento', 'e-otro'], no_aplica: ['No aplica', 'e-otro'] };
  var SEMJ = { rojo: ['Rojo', 'e-vencido'], amarillo: ['Amarillo', 'e-espera'], verde: ['Verde', 'e-validado'], gris: ['Revisar datos', 'e-otro'] };
  var MOTJ = { sin_salida: 'Entrada sin salida', salida_no_leida: 'Salida sin leer', asistencia_mas_de_max: 'Asistencia de más de 16 horas', incidencia_pendiente: 'Incidencia abierta en Odoo', en_disputa: 'Horario en disputa', sin_asistencias: 'Sin ninguna asistencia en la semana' };
  function hm(h) {
    if (h == null || h === '') return '';
    var m = Math.round(Number(h) * 60), neg = m < 0; m = Math.abs(m);
    return (neg ? '-' : '') + Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2);
  }
  // Numeración de Nómina: jueves 23-jul-2026 = S30, sin reinicio en enero; el año es el del jueves.
  function semId(desde) {
    var v = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10)) + 6 * 86400000;
    return 'S' + (30 + Math.round((v - Date.UTC(2026, 6, 23)) / (7 * 86400000))) + '/' + new Date(v).getUTCFullYear();
  }
  function fDia(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : esc(iso); }
  function chipJ(m, k) { var e = m[k] || [k, 'e-otro']; return '<span class="chip ' + e[1] + '">' + esc(e[0]) + '</span>'; }
  function motivosTxt(ms) { return (ms || []).map(function (m) { return esc(MOTJ[m] || m); }).join(', '); }
  function tablaDias(ds) {
    return '<div class="tabla-wrap"><table class="dias"><thead><tr><th>Día</th><th class="num">Registradas</th><th class="num">Comida</th><th class="num">Efectivas</th><th>Nota</th></tr></thead><tbody>' +
      (ds || []).map(function (x) {
        var nota = x.prorrateo ? 'Cubierto: ' + String(x.prorrateo).replace('nomina:', 'Nómina, ').replace(/_/g, ' ') : (x.motivos && x.motivos.length ? motivosTxt(x.motivos) : (!x.laborable && x.brutas ? 'Fin de semana: suma horas, nunca es retardo' : (x.laborable && !x.brutas ? 'No checó' : '')));
        return '<tr class="' + (x.laborable ? '' : 'fds') + '"><td>' + DIA[x.dow] + ' ' + fDia(x.fecha) + '</td><td class="n">' + hm(x.brutas) + '</td><td class="n">' + hm(x.comida) + '</td><td class="n">' + hm(x.efectivas) + '</td><td class="nivel">' + nota + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  async function jornada(sem) {
    st.vista = 'jornada'; mostrarVista();
    $('#jornada').innerHTML = '<div class="caja vacio">Cargando…</div>';
    var r; try { r = await pedir({ accion: 'jornada', semana: sem || st.jSem || undefined }); } catch (e) { return; }
    if (!r || r.ok !== true) { $('#jornada').innerHTML = '<div class="caja vacio">' + mensajeError(r || {}) + '</div>'; return; }
    st.jor = r; st.jSem = r.semana;
    var ps = r.personas || [], pr = r.por_revisar || [], cuenta = { rojo: 0, amarillo: 0, verde: 0, gris: 0 };
    ps.forEach(function (p) { cuenta[p.semaforo] = (cuenta[p.semaforo] || 0) + 1; });
    var rg = r.reglas || {};
    var opciones = (r.semanas || []).map(function (d) { return '<option value="' + esc(d) + '"' + (d === r.desde ? ' selected' : '') + '>Semana del viernes ' + fDia(d) + '</option>'; }).join('');
    $('#jornada').innerHTML =
      '<div class="aviso sombra"><div><b>Jornada semanal FTS: ' + esc(rg.umbral) + ' horas efectivas de viernes a jueves</b>' +
        'Se descuentan ' + esc(rg.comida_min) + ' minutos de comida por día trabajado. Sábado y domingo nunca son retardo, pero sus horas cuentan. Un feriado, permiso, incapacidad, vacaciones o día que no cuenta baja 9.6 horas el umbral. ' +
        'Los avisos abren desde la semana del ' + esc(r.avisos_desde || 'sin definir') + '. Las medidas del tercer aviso quedan ' + esc(rg.modo_medidas === 'habilitadas' ? 'habilitadas' : 'retenidas') + '.</div></div>' +
      '<div class="cab"><h1>Semana ' + esc(r.semana) + '</h1><span class="nivel">viernes ' + fDia(r.desde) + ' a jueves ' + fDia(r.hasta) + '</span><span class="sp"></span>' +
        (opciones ? '<select id="j-semana" aria-label="Semana">' + opciones + '</select>' : '') + '</div>' +
      '<div class="resumen"><div class="cubeta"><span class="n sem-rojo">' + cuenta.rojo + '</span><span class="l">Rojo</span><span class="q">3er aviso o 3 semanas cortas en 8</span></div>' +
        '<div class="cubeta"><span class="n sem-amarillo">' + cuenta.amarillo + '</span><span class="l">Amarillo</span><span class="q">Semana corta o aviso en la ventana</span></div>' +
        '<div class="cubeta"><span class="n sem-verde">' + cuenta.verde + '</span><span class="l">Verde</span><span class="q">Cumplió</span></div>' +
        '<div class="cubeta rh"><span class="n">' + pr.length + '</span><span class="l">Jornada por revisar</span><span class="q">Datos incompletos: no sale aviso</span></div></div>' +
      '<section class="caja bloque" style="margin-bottom:14px"><h2>Jornada por revisar</h2><div class="nivel">Entrada sin salida, asistencias de más de 16 horas, incidencias abiertas o una semana sin asistencias. Aquí no sale ningún aviso hasta que RH confirma, corrige o marca que no aplica.</div>' +
        (pr.length ? pr.map(function (x) {
          var id = x.employee_id + '|' + x.semana;
          return '<div class="ev alerta"><div><b>' + esc(x.nombre || ('Empleado ' + x.employee_id)) + '</b> · semana ' + esc(x.semana) + ' · ' + hm(x.horas_efectivas) + ' de ' + hm(x.umbral) + ' horas<br><span class="nivel">' +
            (x.motivos || []).map(function (m) { return (m.fecha ? fDia(m.fecha) + ': ' : '') + motivosTxt(m.motivos); }).join(' · ') + '</span>' +
            '<details><summary>Ver los días</summary>' + tablaDias(x.desglose) + '</details></div>' +
            (st.editor ? '<div class="acciones"><button class="btn" data-jrev="' + esc(id) + '" data-decision="confirmar">Confirmar horas</button><button class="btn" data-jrev="' + esc(id) + '" data-decision="corregir">Corregir horas</button><button class="btn" data-jrev="' + esc(id) + '" data-decision="no_aplica">No aplica</button></div>' : '') +
            '<div id="jf-' + esc(id.replace(/[^A-Za-z0-9]/g, '_')) + '" class="alerta-form"></div></div>';
        }).join('') : '<div class="nivel">Nada por revisar.</div>') + '</section>' +
      '<div class="caja"><div class="tabla-wrap"><table class="jornada"><thead><tr><th>Persona</th><th>Semáforo</th><th>Estado</th><th class="num">Efectivas</th><th class="num">Umbral</th><th class="num">Faltante</th><th>Aviso</th><th></th></tr></thead><tbody>' +
      (ps.length ? ps.map(function (p) {
        var k = 'jd-' + p.employee_id;
        return '<tr><td class="quien2"><b>' + esc(p.nombre || ('Empleado ' + p.employee_id)) + '</b><span>' + esc(p.departamento || '') + (p.umbral_fuente === 'calendario' ? ' · umbral de su calendario' : '') + (p.dias_prorrateo ? ' · ' + p.dias_prorrateo + (Number(p.dias_prorrateo) === 1 ? ' día cubierto' : ' días cubiertos') : '') + '</span></td>' +
          '<td>' + chipJ(SEMJ, p.semaforo) + '</td><td>' + chipJ(ESTJ, p.estado) + '</td><td class="n">' + hm(p.horas_corregidas != null ? p.horas_corregidas : p.horas_efectivas) + '</td><td class="n">' + hm(p.umbral) + '</td><td class="n">' + (p.faltante ? hm(p.faltante) : '') + '</td>' +
          '<td>' + (p.folio ? '<button class="enlace" data-folio="' + esc(p.folio) + '">' + esc(p.folio) + '</button> <span class="nivel">aviso ' + esc(p.aviso_n) + '</span>' : '') + '</td>' +
          '<td><button class="btn" data-desglose="' + k + '" aria-expanded="false">Días</button></td></tr>' +
          '<tr class="hid desglose" id="' + k + '"><td colspan="8">' + tablaDias(p.desglose) + '</td></tr>';
      }).join('') : '<tr><td colspan="8" class="vacio">Esta semana todavía no tiene corte.</td></tr>') + '</tbody></table></div></div>';
  }
  function formJornada(id, decision) {
    var box = $('#jf-' + id.replace(/[^A-Za-z0-9]/g, '_'));
    var x = ((st.jor || {}).por_revisar || []).filter(function (q) { return q.employee_id + '|' + q.semana === id; })[0] || {};
    var T = {
      confirmar: '<div class="nivel">Se toman las ' + hm(x.horas_efectivas) + ' horas calculadas. Si quedan abajo del umbral y la semana ya abre avisos, sale el aviso.</div>',
      corregir: '<label>Horas efectivas correctas (decimal, por ejemplo 47.5)<input id="jf-horas" inputmode="decimal"></label>',
      no_aplica: '<div class="nivel">La semana no se evalúa. Queda en la bitácora con el motivo.</div>'
    };
    box.innerHTML = '<div class="form" style="margin-top:8px">' + T[decision] + '<label>Motivo (queda en la bitácora)<input id="jf-motivo"></label><button class="btn pri" data-jrev-enviar="' + esc(id) + '" data-decision="' + decision + '">Guardar</button><div id="jf-err" class="err"></div></div>';
  }
  async function enviarJornada(id, decision, boton) {
    var pz = id.split('|'), d = { accion: 'jornada_revisar', employee_id: Number(pz[0]), semana: pz[1], decision: decision, motivo: ($('#jf-motivo').value || '').trim() };
    if (decision === 'corregir') { d.horas_efectivas = Number(String($('#jf-horas').value).replace(',', '.')); if (!(d.horas_efectivas >= 0)) { $('#jf-err').textContent = 'Escribe las horas.'; return; } }
    if (d.motivo.length < 5) { $('#jf-err').textContent = 'Escribe el motivo (al menos 5 letras).'; return; }
    boton.disabled = true;
    var r; try { r = await pedir(d); } catch (e) { return; } finally { boton.disabled = false; }
    if (!r || r.ok !== true) { $('#jf-err').textContent = mensajeError(r || {}); return; }
    toast('Guardado: la semana queda ' + ((ESTJ[r.estado] || [r.estado])[0]).toLowerCase() + (r.folio ? ', aviso ' + r.folio : '') + '.');
    jornada(st.jSem);
  }

  // ── Propuestas de medida (3er aviso de jornada) ──
  var ESTM = { propuesta: ['Propuesta, sin decidir', 'e-vencido'], retenida: ['Retenida', 'e-retenido'], por_aplicar: ['Por aplicar en Nómina', 'e-programada'], verificada: ['Verificada en Nómina', 'e-verificada'], descartada: ['Descartada', 'e-otro'] };
  async function medidas() {
    st.vista = 'medidas'; mostrarVista();
    $('#medidas').innerHTML = '<div class="caja vacio">Cargando…</div>';
    var r; try { r = await pedir({ accion: 'medidas' }); } catch (e) { return; }
    if (!r || r.ok !== true) { $('#medidas').innerHTML = '<div class="caja vacio">' + mensajeError(r || {}) + '</div>'; return; }
    st.medidas = r.medidas || [];
    var ret = r.modo_medidas_jornada !== 'habilitadas';
    $('#medidas').innerHTML =
      '<div class="aviso ' + (ret ? 'sombra' : 'mal') + '"><div><b>Medidas ' + (ret ? 'retenidas' : 'habilitadas') + '</b>' +
        (ret ? 'El tercer aviso de jornada abre una propuesta. RH decide y la decisión queda en la bitácora, pero la medida no se aplica ni se manda a Nómina hasta que Legal confirme.' : 'Un descuento registrado se verifica contra Nómina · Incidencias antes del corte. RH lo captura en Nómina.') + '</div></div>' +
      '<div class="caja"><div class="tabla-wrap"><table><thead><tr><th>Persona</th><th>Folio</th><th>Semana</th><th class="num">Faltante</th><th>Estado</th><th>Decisión</th><th></th></tr></thead><tbody>' +
      (st.medidas.length ? st.medidas.map(function (m) {
        var dd = m.decision ? esc(m.decision.decision) + (m.decision.horas ? ' ' + hm(m.decision.horas) + ' h' : '') + ' · ' + esc(m.decision.motivo || '') + ' <span class="nivel">(' + esc(m.decidido_por || '') + ')</span>' : '';
        return '<tr><td class="quien2"><b>' + esc(m.nombre || ('Empleado ' + m.employee_id)) + '</b><span>' + esc(m.departamento || '') + '</span></td><td><button class="enlace" data-folio="' + esc(m.folio) + '">' + esc(m.folio) + '</button></td><td>' + esc(m.semana) + '</td>' +
          '<td class="n">' + hm(m.horas_propuestas) + '</td><td>' + chipJ(ESTM, m.estado) + '</td><td>' + dd + '</td>' +
          '<td>' + (st.editor && (m.estado === 'propuesta' || m.estado === 'retenida') ? '<button class="btn" data-medida="' + m.id + '">Decidir</button>' : '') + '</td></tr>' +
          '<tr class="hid" id="mf-' + m.id + '"><td colspan="7"></td></tr>';
      }).join('') : '<tr><td colspan="7" class="vacio">No hay propuestas.</td></tr>') + '</tbody></table></div></div>';
  }
  function formMedida(id) {
    var m = st.medidas.filter(function (x) { return String(x.id) === String(id); })[0] || {};
    var fila = $('#mf-' + id); fila.classList.remove('hid');
    fila.firstChild.innerHTML = '<div class="form"><div class="nivel">Faltante de la semana: ' + hm(m.horas_propuestas) + ' horas. La decisión es de RH; ninguna medida se aplica sola.</div>' +
      '<div class="fila2"><label>Decisión<select id="mf-dec"><option value="descuento">Descuento de tiempo no laborado</option><option value="otra">Otra medida</option><option value="ninguna">Ninguna</option></select></label>' +
      '<label>Horas a descontar (hasta ' + hm(m.horas_propuestas) + ')<input id="mf-horas" inputmode="decimal"></label></div>' +
      '<label>Detalle (si es otra medida)<input id="mf-detalle"></label><label>Motivo (queda en la bitácora)<input id="mf-motivo"></label>' +
      '<button class="btn pri" data-medida-enviar="' + m.id + '">Guardar decisión</button><div id="mf-err" class="err"></div></div>';
  }
  async function enviarMedida(id, boton) {
    var d = { accion: 'medida_decidir', medida_id: Number(id), decision: $('#mf-dec').value, detalle: ($('#mf-detalle').value || '').trim(), motivo: ($('#mf-motivo').value || '').trim() };
    if (d.decision === 'descuento') d.horas = Number(String($('#mf-horas').value).replace(',', '.'));
    if (d.motivo.length < 5) { $('#mf-err').textContent = 'Escribe el motivo (al menos 5 letras).'; return; }
    boton.disabled = true;
    var r; try { r = await pedir(d); } catch (e) { return; } finally { boton.disabled = false; }
    if (!r || r.ok !== true) { $('#mf-err').textContent = mensajeError(r || {}); return; }
    toast(r.nota || 'Decisión registrada.'); medidas();
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
        var usado = (p.correo_usado || []).map(function (x) { return esc(x.email) + ' <span class="nivel">(' + esc(x.campo) + ')</span>'; }).join(', ');
        var otros = (p.correos || []).filter(function (x) { return !x.usable; }).map(function (x) { return esc(x.email) + ' <span class="nivel">(' + esc(x.motivo) + ')</span>'; }).join(', ');
        return '<tr><td class="quien2"><b>' + esc(p.nombre || ('Empleado ' + p.employee_id)) + '</b><span>' + esc(p.departamento || '') + ' · núm. ' + esc(p.employee_id) + ' · ' + esc(p.dias_con_checada) + ' días con checada</span>' +
          (b ? '<div class="chips">' + b + '</div>' : '') +
          '<div class="correo">Correo que se usa: ' + (usado || '<b>ninguno</b>') + '<br><span class="nivel">' + esc(p.correo_motivo || '') + '</span>' + (otros ? '<br><span class="nivel">Descartados: </span>' + otros : '') + '</div></td>' +
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

  // ── Imprimir la hoja (la genera el mismo retardos/lib/pdf.js que manda el correo) ──
  async function imprimir(folio) {
    var r; try { r = await pedir({ accion: 'caso', folio: folio }); } catch (e) { return; }
    if (!r || r.ok !== true) { toast(mensajeError(r || {})); return; }
    try {
      var h = G.RetardosPDF.hoja(r.caso);
      var u8 = new Uint8Array(h.binario.length);
      for (var i = 0; i < h.binario.length; i++) u8[i] = h.binario.charCodeAt(i) & 255;
      var url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' }));
      var w = window.open(url, '_blank', 'noopener');
      if (!w) { var a = document.createElement('a'); a.href = url; a.download = h.nombre; document.body.appendChild(a); a.click(); a.remove(); }
      toast('Hoja de ' + folio + ' lista para imprimir.');
    } catch (e) { toast('No se pudo generar la hoja.'); }
  }

  // ── Hojas por confirmar (complemento S2) ──
  var SUG = {
    lista_para_validar: 'e-validado', revisar_falta_firma: 'e-espera', revisar_folio: 'e-vencido',
    revisar_impugnacion: 'e-impugnado', revisar_ilegible: 'e-vencido', revisar_inyeccion: 'e-vencido'
  };
  var CAMPO = { trabajador: 'Trabajador', rh: 'RH', jefe: 'Jefe', testigo1: 'Testigo 1', testigo2: 'Testigo 2' };
  async function hojas(folio) {
    st.vista = 'hojas'; st.hojasFolio = folio || null; mostrarVista();
    $('#hojas').innerHTML = '<div class="caja vacio">Cargando…</div>';
    var r; try { r = await pedir({ accion: 'hojas' }); } catch (e) { return; }
    if (!r || r.ok !== true) { $('#hojas').innerHTML = '<div class="caja vacio">' + mensajeError(r || {}) + '</div>'; return; }
    st.hojas = r.lecturas || [];
    var ls = st.hojasFolio ? st.hojas.filter(function (l) { return l.folio === st.hojasFolio || (l.caso && l.caso.folio === st.hojasFolio); }) : st.hojas;
    var m = r.metrica || {}, proc = r.hojas_en_proceso || [];
    $('#hojas').innerHTML =
      '<div class="aviso demo"><div><b>El lector sólo sugiere</b>Lee el código QR, busca tinta en cada recuadro de firma, la casilla de negativa y los comentarios. La decisión es de RH: ningún caso se cierra hasta que alguien confirma aquí.</div></div>' +
      '<div class="resumen"><div class="cubeta rh"><span class="n">' + st.hojas.length + '</span><span class="l">Hojas por confirmar</span></div>' +
        '<div class="cubeta"><span class="n">' + proc.length + '</span><span class="l">En proceso</span><span class="q">El lector las revisa cada 5 minutos</span></div>' +
        '<div class="cubeta"><span class="n">' + (m.pct_acierto == null ? 'sin datos' : esc(m.pct_acierto) + ' %') + '</span><span class="l">Aciertos del lector</span><span class="q">' + esc(m.aciertos || 0) + ' de ' + esc(m.decididas || 0) + ' en 30 días</span></div></div>' +
      (st.editor ? '<section class="caja bloque" style="margin-bottom:14px"><h2>Subir hojas</h2><div class="nivel">Una o varias (máximo 10 y 8 MB cada una). Pueden venir varias hojas en un mismo PDF: el lector las separa por el código QR.</div>' +
        '<div class="acciones"><input type="file" id="h-archivos" accept="application/pdf,image/*" multiple><button class="btn pri" id="h-subir">Subir</button></div><div id="h-err" class="err"></div></section>' : '') +
      (st.hojasFolio ? '<div class="cab"><h1>Hojas del folio ' + esc(st.hojasFolio) + '</h1><button class="enlace" data-vista="hojas">ver todas</button></div>' : '') +
      (ls.length ? ls.map(tarjetaHoja).join('') : '<div class="caja vacio">No hay hojas por confirmar.</div>') +
      (proc.length ? '<section class="caja bloque" style="margin-top:14px"><h3>En proceso</h3><ul class="linea">' + proc.map(function (p) {
        return '<li><span class="cuando">' + esc(p.estado) + '</span><span class="que"><b>' + esc(p.nombre) + '</b>' + (p.error ? '<br><span>' + esc(p.error) + '</span>' : '') + '</span></li>'; }).join('') + '</ul></section>' : '');
  }
  function tarjetaHoja(l) {
    var res = l.resultado || {}, f = res.firmas || {}, c = l.caso;
    var firmas = Object.keys(CAMPO).map(function (k) {
      var p = f[k] && f[k].presente;
      return '<span class="chip ' + (p ? 'e-validado' : 'e-otro') + '">' + (p ? 'Sí: ' : 'No: ') + esc(CAMPO[k]) + '</span>';
    }).join(' ');
    var com = res.comentarios || {};
    var d = function (k, t, cls) { return st.editor ? '<button class="btn ' + (cls || '') + '" data-decidir="' + k + '" data-lectura="' + l.lectura_id + '">' + t + '</button>' : ''; };
    return '<section class="caja hoja-tarjeta" id="lectura-' + l.lectura_id + '"><div class="hoja-cab"><span class="chip ' + (SUG[l.sugerencia] || 'e-otro') + '">' + esc(l.sugerencia_texto) + '</span>' +
      '<span class="folio">' + esc(l.folio || 'sin folio') + '</span>' + (l.pagina > 1 ? '<span class="nivel">página ' + l.pagina + '</span>' : '') + '</div>' +
      '<div class="hoja-cuerpo"><div class="hoja-datos">' +
        '<dl class="dl"><dt>Caso</dt><dd>' + (c ? esc(c.nombre || '') + ' · ' + esc(NIVEL[c.accion] || c.accion) + ' · ' + chip(c.estado) : '<b>sin caso ligado</b>') + '</dd>' +
        '<dt>Firmas</dt><dd class="chips">' + firmas + '</dd>' +
        '<dt>Negativa</dt><dd>' + (l.negativa ? '<b>marcada</b>' : 'no marcada') + '</dd>' +
        '<dt>Comentarios</dt><dd>' + (com.presente ? (com.transcripcion ? '«' + esc(com.transcripcion) + '»' + (com.inconformidad ? ' <span class="chip e-impugnado">inconformidad</span>' : '') : '<b>hay texto escrito</b>; léelo en la hoja') : 'sin comentarios') + '</dd>' +
        '<dt>Legibilidad</dt><dd>' + esc(res.legibilidad || '') + (l.confianza != null ? ' · confianza ' + Math.round(Number(l.confianza) * 100) + ' %' : '') + ((res.banderas || []).length ? ' · ' + esc(res.banderas.join(', ')) : '') + '</dd>' +
        '<dt>Llegó por</dt><dd>' + esc(l.hoja && l.hoja.origen) + ' · ' + esc(l.hoja && l.hoja.nombre) + '</dd></dl>' +
        '<div class="acciones">' + '<button class="btn" data-ver-hoja="' + l.hoja_id + '" data-lectura="' + l.lectura_id + '">Ver hoja</button>' +
          d('firmada', 'Confirmar firmada', 'pri') + d('negativa', 'Confirmar negativa') + d('impugnacion', 'Registrar impugnación') +
          d('corregir', 'Corregir folio') + d('pedir', 'Pedir de nuevo') + d('descartar', 'Descartar', 'peligro') + '</div>' +
        '<div id="hf-' + l.lectura_id + '"></div></div>' +
      '<div class="hoja-visor" id="hv-' + l.lectura_id + '"></div></div></section>';
  }
  async function verHoja(hojaId, lecturaId) {
    var v = $('#hv-' + lecturaId); v.innerHTML = '<div class="nivel">Abriendo…</div>';
    var r; try { r = await pedir({ accion: 'hoja_ver', hoja_id: Number(hojaId) }); } catch (e) { return; }
    if (!r || r.ok !== true) { v.innerHTML = '<div class="err">' + mensajeError(r || {}) + '</div>'; return; }
    var url = r.url_demo || null;
    if (!url && r.contenido_b64) {
      var bin = atob(r.contenido_b64), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      url = URL.createObjectURL(new Blob([u8], { type: r.mime }));
    }
    if (!url) { v.innerHTML = '<div class="visor">' + hojaEjemplo() + '</div>'; return; }
    v.innerHTML = /^image[/]/.test(r.mime) ? '<div class="visor"><img alt="Hoja escaneada" src="' + url + '"></div>'
      : '<div class="visor"><iframe title="Hoja escaneada" src="' + url + '" style="width:100%;height:520px;border:0"></iframe></div><a class="enlace" href="' + url + '" target="_blank" rel="noopener">Abrir en otra pestaña</a>';
  }
  function formDecidir(lecturaId, tipo) {
    var l = st.hojas.filter(function (x) { return String(x.lectura_id) === String(lecturaId); })[0] || {};
    var com = (l.resultado && l.resultado.comentarios) || {};
    var F = {
      firmada: '<label>Nota (opcional)<input id="hd-nota"></label><button class="btn pri" data-enviar-hoja="firmada" data-lectura="' + lecturaId + '">Confirmar firmada</button>',
      negativa: '<div class="fila2"><label>Testigo 1 (nombre completo)<input id="hd-t1" autocomplete="off"></label><label>Testigo 2 (nombre completo)<input id="hd-t2" autocomplete="off"></label></div><button class="btn pri" data-enviar-hoja="negativa" data-lectura="' + lecturaId + '">Confirmar negativa</button>',
      impugnacion: '<label>Lo que dice la persona<textarea id="hd-version" rows="3">' + esc(com.transcripcion || '') + '</textarea></label><button class="btn pri" data-enviar-hoja="impugnacion" data-lectura="' + lecturaId + '">Registrar impugnación</button>',
      corregir: '<label>Folio correcto<input id="hd-folio" placeholder="RET-2026-0000" autocomplete="off"></label><button class="btn pri" data-enviar-hoja="corregir" data-lectura="' + lecturaId + '">Ligar a este folio</button>',
      pedir: '<label>Motivo<select id="hd-motivo"><option value="falta_firma">Falta una firma</option><option value="ilegible">No se lee</option><option value="folio">Folio o nombre no coinciden</option><option value="otro">Otro</option></select></label><label>Nota<input id="hd-nota"></label><button class="btn pri" data-enviar-hoja="pedir" data-lectura="' + lecturaId + '">Pedir de nuevo</button>',
      descartar: '<label>Motivo<select id="hd-motivo"><option value="duplicada">Es otra copia de una hoja ya confirmada</option><option value="inyeccion">Trae texto ajeno o instrucciones</option><option value="ajena">No es una hoja de retardos</option></select></label><label>Nota (obligatoria)<input id="hd-nota"></label><button class="btn peligro" data-enviar-hoja="descartar" data-lectura="' + lecturaId + '">Descartar</button>'
    };
    $('#hf-' + lecturaId).innerHTML = '<div class="form">' + F[tipo] + '<div id="hd-err" class="err"></div></div>';
  }
  async function enviarDecision(lecturaId, tipo, boton) {
    var d = { lectura_id: Number(lecturaId) }, val = function (id) { var e = $(id); return e ? e.value.trim() : ''; };
    if (tipo === 'firmada' || tipo === 'negativa' || tipo === 'impugnacion') { d.accion = 'hoja_confirmar'; d.resultado = tipo; }
    if (tipo === 'corregir') { d.accion = 'hoja_corregir'; d.folio = val('#hd-folio').toUpperCase(); if (!/^RET-[0-9]{4}-[0-9]{4}/.test(d.folio)) { $('#hd-err').textContent = 'Escribe el folio completo, por ejemplo RET-2026-0041.'; return; } }
    if (tipo === 'pedir') { d.accion = 'hoja_pedir_de_nuevo'; d.motivo = val('#hd-motivo'); }
    if (tipo === 'descartar') { d.accion = 'hoja_descartar'; d.motivo = val('#hd-motivo'); }
    if ($('#hd-nota')) d.nota = val('#hd-nota');
    if (tipo === 'negativa') { d.testigo1 = val('#hd-t1'); d.testigo2 = val('#hd-t2'); }
    if (tipo === 'impugnacion') d.version = val('#hd-version');
    boton.disabled = true;
    var r; try { r = await pedir(d); } catch (e) { return; } finally { boton.disabled = false; }
    if (!r || r.ok !== true) { $('#hd-err').textContent = mensajeError(r || {}); return; }
    toast(tipo === 'corregir' ? 'Ligada al folio. Ahora confírmala.' : 'Listo. La decisión quedó en la bitácora.');
    hojas(st.hojasFolio);
  }
  async function subirVarias(boton) {
    var fs = Array.prototype.slice.call($('#h-archivos').files || []), err = $('#h-err');
    if (!fs.length) { err.textContent = 'Elige al menos un archivo.'; return; }
    if (fs.length > 10) { err.textContent = mensajeError({ error: 'MAXIMO_10_ARCHIVOS' }); return; }
    if (fs.some(function (f) { return f.size > 8 * 1024 * 1024; })) { err.textContent = 'Algún archivo pesa más de 8 MB.'; return; }
    boton.disabled = true;
    var archivos = [];
    for (var i = 0; i < fs.length; i++) archivos.push({ nombre: fs[i].name, mime: fs[i].type || 'application/pdf', contenido_b64: await leerArchivo(fs[i]) });
    var r; try { r = await pedir({ accion: 'subir_hojas', archivos: archivos }); } catch (e) { return; } finally { boton.disabled = false; }
    if (!r || r.ok !== true) { err.textContent = mensajeError(r || {}); return; }
    var dup = (r.archivos || []).filter(function (a) { return a.duplicada; }).length, mal = (r.archivos || []).filter(function (a) { return a.ok === false; }).length;
    toast('Subidas ' + (archivos.length - mal) + '.' + (dup ? ' ' + dup + ' ya se habían recibido antes.' : '') + (mal ? ' ' + mal + ' no se aceptaron.' : ''));
    hojas(st.hojasFolio);
  }

  // ── Reincidencia acumulada y alertas de modo (complemento S2) ──
  var SEM = { rojo: ['Rojo', 'e-vencido'], amarillo: ['Amarillo', 'e-espera'], verde: ['Verde', 'e-validado'] };
  var EST_AL = { abierta: ['Sin atender', 'e-vencido'], pospuesta: ['Pospuesta', 'e-espera'], descartada: ['Descartada', 'e-otro'], decidido_cambiar: ['Se decidió cambiar', 'e-impugnado'] };
  async function reincidencia() {
    st.vista = 'reincidencia'; mostrarVista();
    $('#reincidencia').innerHTML = '<div class="caja vacio">Cargando…</div>';
    var r; try { r = await pedir({ accion: 'reincidencia' }); } catch (e) { return; }
    if (!r || r.ok !== true) { $('#reincidencia').innerHTML = '<div class="caja vacio">' + mensajeError(r || {}) + '</div>'; return; }
    st.reinc = r;
    var ps = r.personas || [], al = r.alertas || [], cuenta = { rojo: 0, amarillo: 0, verde: 0 };
    ps.forEach(function (p) { cuenta[p.semaforo] = (cuenta[p.semaforo] || 0) + 1; });
    var ab = al.filter(function (a) { return a.estado === 'abierta'; }).length;
    $('#reincidencia').innerHTML =
      '<div class="aviso sombra"><div><b>Modo de sanciones: ' + esc(r.modo_sanciones === 'con_suspension' ? 'con suspensión' : 'sin suspensión') + '</b>' +
        'Aviso, carta compromiso y acta funcionan. El nivel de suspensión se registra como antecedente y no se notifica. Una alerta sólo recomienda: el modo lo cambian Esteban, RH y Legal con el checklist de MODO_SUSPENSION.md.</div></div>' +
      '<div class="resumen"><div class="cubeta urge"><span class="n">' + ab + '</span><span class="l">Alertas sin atender</span></div>' +
        '<div class="cubeta"><span class="n sem-rojo">' + cuenta.rojo + '</span><span class="l">Semáforo rojo</span></div>' +
        '<div class="cubeta"><span class="n sem-amarillo">' + cuenta.amarillo + '</span><span class="l">Semáforo amarillo</span></div>' +
        '<div class="cubeta"><span class="n sem-verde">' + cuenta.verde + '</span><span class="l">Semáforo verde</span></div></div>' +
      '<section class="caja bloque" style="margin-bottom:14px"><h2>Alertas "Recomendación: activar modo suspensión"</h2>' +
        (al.length ? al.map(function (a) {
          var e = EST_AL[a.estado] || [a.estado, 'e-otro'];
          var ev = Object.keys(a.evidencia || {}).map(function (k) { return k.replace(/_/g, ' ') + ': ' + (Array.isArray(a.evidencia[k]) ? a.evidencia[k].join(', ') : a.evidencia[k]); }).join(' · ');
          return '<div class="ev alerta"><div><span class="chip ' + e[1] + '">' + esc(e[0]) + '</span> <b>' + esc(a.texto) + '</b><br><span class="nivel">' +
            (a.nombre ? esc(a.nombre) + ' · ' : 'Toda la plantilla · ') + esc(ev) +
            (a.posponer_hasta ? ' · vuelve el ' + esc(a.posponer_hasta) : '') + (a.motivo ? ' · ' + esc(a.motivo) : '') + '</span></div>' +
            (st.editor && (a.estado === 'abierta' || a.estado === 'pospuesta') ? '<div class="acciones"><button class="btn" data-alerta="' + a.id + '" data-decision="cambiar">Cambiar a modo suspensión</button><button class="btn" data-alerta="' + a.id + '" data-decision="posponer">Posponer</button><button class="btn peligro" data-alerta="' + a.id + '" data-decision="descartar">Descartar</button></div>' : '') +
            '<div id="af-' + a.id + '" class="alerta-form"></div></div>';
        }).join('') : '<div class="nivel">No hay alertas.</div>') + '</section>' +
      '<div class="caja"><div class="tabla-wrap"><table class="reinc"><thead><tr><th>Persona</th><th>Semáforo</th><th class="num">Meses con caso</th><th class="num">Seguidos</th><th class="num">Cartas 90 / 180 d</th><th class="num">Actas 90 / 180 d</th><th class="num">Suspensión no aplicada</th><th>Tendencia 30 d</th></tr></thead><tbody>' +
      (ps.length ? ps.map(function (p) {
        var s = SEM[p.semaforo] || [p.semaforo, 'e-otro'];
        return '<tr><td class="quien2"><b>' + esc(p.nombre || ('Empleado ' + p.employee_id)) + '</b><span>' + esc(p.departamento || '') + '</span></td><td><span class="chip ' + s[1] + '">' + s[0] + '</span></td>' +
          '<td class="n">' + p.meses_con_casos + '</td><td class="n">' + p.meses_consecutivos + '</td><td class="n">' + p.cartas_90 + ' / ' + p.cartas_180 + '</td><td class="n">' + p.actas_90 + ' / ' + p.actas_180 + '</td>' +
          '<td class="n">' + p.suspension_no_aplicada + '</td><td>' + esc(p.tendencia) + ' <span class="nivel">(' + esc(p.retardos_30d) + ' contra ' + esc(p.promedio_30d_previo) + ')</span></td></tr>';
      }).join('') : '<tr><td colspan="8" class="vacio">Nadie tiene casos.</td></tr>') + '</tbody></table></div></div>';
  }
  function formAlerta(id, decision) {
    var F = {
      cambiar: '<div class="nivel">Esto registra la decisión en la bitácora. El modo <b>no</b> cambia aquí: se cambia con el checklist y el SQL de MODO_SUSPENSION.md, con Legal.</div><label>Motivo<input id="al-motivo"></label>',
      posponer: '<div class="fila2"><label>Semanas<input type="number" id="al-semanas" min="1" max="26" value="4"></label><label>Motivo<input id="al-motivo"></label></div>',
      descartar: '<label>Motivo (queda en la bitácora)<input id="al-motivo"></label>'
    };
    $('#af-' + id).innerHTML = '<div class="form" style="margin-top:8px">' + F[decision] + '<button class="btn pri" data-enviar-alerta="' + id + '" data-decision="' + decision + '">Guardar decisión</button><div id="al-err" class="err"></div></div>';
  }
  async function enviarAlerta(id, decision, boton) {
    var d = { accion: 'alerta_atender', alerta_id: Number(id), decision: decision, motivo: ($('#al-motivo') || {}).value || '' };
    if ($('#al-semanas')) d.semanas = Number($('#al-semanas').value);
    if (d.motivo.trim().length < 5) { $('#al-err').textContent = 'Escribe el motivo (al menos 5 letras).'; return; }
    boton.disabled = true;
    var r; try { r = await pedir(d); } catch (e) { return; } finally { boton.disabled = false; }
    if (!r || r.ok !== true) { $('#al-err').textContent = mensajeError(r || {}); return; }
    toast(decision === 'cambiar' ? 'Decisión registrada. El modo sigue igual hasta aplicar el checklist.' : 'Decisión registrada.');
    reincidencia();
  }

  function mostrarVista() {
    $('#v-lista').classList.toggle('hid', st.vista !== 'lista');
    $('#detalle').classList.toggle('hid', st.vista !== 'detalle');
    $('#ajustes').classList.toggle('hid', st.vista !== 'ajustes');
    $('#calidad').classList.toggle('hid', st.vista !== 'calidad');
    $('#hojas').classList.toggle('hid', st.vista !== 'hojas');
    $('#reincidencia').classList.toggle('hid', st.vista !== 'reincidencia');
    $('#jornada').classList.toggle('hid', st.vista !== 'jornada');
    $('#medidas').classList.toggle('hid', st.vista !== 'medidas');
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
    if (t.id === 'f-agregar') return festivo('festivo_agregar', $('#f-fecha').value, t);
    if (t.dataset.quitarFestivo) return festivo('festivo_quitar', t.dataset.quitarFestivo, t);
    if (t.dataset.desglose) { var fd = document.getElementById(t.dataset.desglose); var ab = fd.classList.toggle('hid'); t.setAttribute('aria-expanded', String(!ab)); return; }
    if (t.dataset.jrev) return formJornada(t.dataset.jrev, t.dataset.decision);
    if (t.dataset.jrevEnviar) return enviarJornada(t.dataset.jrevEnviar, t.dataset.decision, t);
    if (t.dataset.medida) return formMedida(t.dataset.medida);
    if (t.dataset.medidaEnviar) return enviarMedida(t.dataset.medidaEnviar, t);
    if (t.dataset.vista) {
      if (t.dataset.vista === 'ajustes') return ajustes(); if (t.dataset.vista === 'calidad') return calidad();
      if (t.dataset.vista === 'hojas') return hojas(); if (t.dataset.vista === 'reincidencia') return reincidencia();
      if (t.dataset.vista === 'jornada') return jornada(); if (t.dataset.vista === 'medidas') return medidas();
      st.vista = 'lista'; mostrarVista(); return cargar();
    }
    if (t.dataset.imprimir) return imprimir(t.dataset.imprimir);
    if (t.id === 'h-subir') return subirVarias(t);
    if (t.dataset.verHoja) return verHoja(t.dataset.verHoja, t.dataset.lectura);
    if (t.dataset.decidir) return formDecidir(t.dataset.lectura, t.dataset.decidir);
    if (t.dataset.enviarHoja) return enviarDecision(t.dataset.lectura, t.dataset.enviarHoja, t);
    if (t.dataset.alerta) return formAlerta(t.dataset.alerta, t.dataset.decision);
    if (t.dataset.enviarAlerta) return enviarAlerta(t.dataset.enviarAlerta, t.dataset.decision, t);
    if (t.dataset.revisar) return formRevisar(t.dataset.revisar, t.dataset.valor);
    if (t.dataset.guardarRevision) return guardarRevision(t.dataset.guardarRevision, t.dataset.valor, t);
    if (t.dataset.cubeta) { st.filtro = st.filtro === t.dataset.cubeta ? 'todos' : t.dataset.cubeta; pintarResumen(); return pintarLista(); }
    if (t.dataset.folio) return abrir(t.dataset.folio);
    if (t.dataset.accion) return form(t.dataset.accion);
    if (t.dataset.enviar) return enviar(t.dataset.enviar, t);
    if (t.dataset.ver) return ver(t.dataset.ver);
    if (t.dataset.quitar) return quitarExclusion(t.dataset.quitar);
  });
  document.addEventListener('change', function (ev) { if (ev.target && ev.target.id === 'j-semana') jornada(semId(ev.target.value)); });
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
