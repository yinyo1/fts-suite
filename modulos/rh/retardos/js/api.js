/* ═══ RH · Retardos · cliente del webhook retardos/panel (#334, #123) ═══
 *
 * Dos modos con la MISMA interfaz: RetApi.llamar(datos) → Promise<respuesta>.
 *   real  → POST firmado al webhook: token del Suite + HMAC con ese token + nonce.
 *           La firma la arma retardos/lib/sesion.js, la misma librería que verifica
 *           del lado del servidor (una sola implementación, probada en tests/retardos).
 *   demo  → una copia en memoria de retardos.panel() con datos de EJEMPLO inventados.
 *           Sirve para practicar y para el prototipo. Nunca toca el servidor.
 *
 * Las respuestas se clasifican en UN solo lugar (CLAUDE.md §20 #12b):
 *   sesion   → el servidor contestó que la llave no vale: se borra la sesión y se pide entrar.
 *   red      → no hubo respuesta: reintentar más tarde.
 *   servidor → contestó con un error suyo: se muestra tal cual.
 */
(function (G) {
  'use strict';
  var URL_PANEL = 'https://primary-production-5c3c.up.railway.app/webhook/retardos/panel';
  var ERR_SESION = { TOKEN_AUSENTE: 1, TOKEN_MALFORMADO: 1, FIRMA_INVALIDA: 1, PAYLOAD_ILEGIBLE: 1, TOKEN_EXPIRADO: 1, SCOPE_INSUFICIENTE: 1 };

  function nonce() {
    var A = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', o = '', r = new Uint8Array(24);
    try { crypto.getRandomValues(r); } catch (e) { for (var k = 0; k < 24; k++) r[k] = Math.floor(Math.random() * 256); }
    for (var i = 0; i < r.length; i++) o += A.charAt(r[i] % A.length);
    return o;
  }

  async function llamarReal(datos) {
    var token = G.SuiteAuth && G.SuiteAuth.getToken ? G.SuiteAuth.getToken() : null;
    if (!token) return { ok: false, tipo: 'sesion', error: 'TOKEN_AUSENTE' };
    var ts = Date.now(), n = nonce();
    var cuerpo = { token: token, ts: ts, nonce: n, sig: G.RetardosSesion.firmar(token, ts, n, datos), datos: datos };
    var res, j;
    try {
      res = await fetch(URL_PANEL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    } catch (e) {
      return { ok: false, tipo: 'red', error: 'SIN_RED' };
    }
    try { j = await res.json(); } catch (e) { j = null; }
    if (!j) return { ok: false, tipo: 'servidor', error: 'HTTP_' + res.status };
    if (j.ok === false && ERR_SESION[j.error]) {
      if (j.error !== 'SCOPE_INSUFICIENTE' && G.SuiteAuth && G.SuiteAuth.logout) G.SuiteAuth.logout();
      return Object.assign({ tipo: 'sesion' }, j);
    }
    if (j.ok === false) return Object.assign({ tipo: 'servidor' }, j);
    return j;
  }

  // ─────────────────────────── modo demo ───────────────────────────
  // Datos de EJEMPLO. Ningún nombre ni dato corresponde a una persona real.
  var ESCALERA = [
    { nivel: 1, accion: 'aviso', nombre: 'Aviso', umbral: 1, dias_plazo_firma: 0, requiere_testigos: false, dias_suspension: null, origen: 'recuperado', confirmado: false },
    { nivel: 2, accion: 'carta_compromiso', nombre: 'Carta compromiso', umbral: 3, dias_plazo_firma: 3, requiere_testigos: false, dias_suspension: null, origen: 'propuesto', confirmado: false },
    { nivel: 3, accion: 'acta', nombre: 'Acta administrativa', umbral: 5, dias_plazo_firma: 3, requiere_testigos: true, dias_suspension: null, origen: 'recuperado', confirmado: false },
    { nivel: 4, accion: 'suspension', nombre: 'Suspensión', umbral: 7, dias_plazo_firma: 3, requiere_testigos: true, dias_suspension: 1, origen: 'propuesto', confirmado: false }
  ];
  var CONFIG = {
    modo: { valor: 'sombra', confirmado: false, descripcion: 'sombra: todo correo va a Dirección y RH con [SOMBRA]. real: al empleado.' },
    nivel_maximo_habilitado: { valor: 2, confirmado: false, descripcion: 'Nivel más alto que se notifica. 2 = carta compromiso. Arriba de eso el caso queda como nivel alcanzado, no notificado.' },
    suspensiones_habilitadas: { valor: false, confirmado: false, descripcion: 'Si es false, ninguna suspensión se notifica.' },
    tolerancia_min: { valor: 20, confirmado: false, descripcion: 'Minutos de gracia después de la hora de entrada.' },
    hora_fuente: { valor: 'hora_entrada', confirmado: false, descripcion: 'De dónde sale la hora esperada: la ficha o el calendario.' },
    periodo: { valor: 'mes', confirmado: false, descripcion: 'Ventana en la que se cuentan los retardos.' },
    reincidencia_dias: { valor: 30, confirmado: false, descripcion: 'Días después de cerrar un caso en que un retardo nuevo sube de nivel.' },
    contar_desde: { valor: '2026-09-01', confirmado: false, descripcion: 'Nada antes de esta fecha cuenta.' },
    dias_validacion_rh: { valor: 2, confirmado: false, descripcion: 'Días hábiles para que RH valide una hoja antes del recordatorio.' },
    remitente: { valor: 'sales@fts.mx', confirmado: true, descripcion: 'Buzón que envía.' },
    buzon_receptor: { valor: null, confirmado: false, descripcion: 'Buzón donde llegan las hojas firmadas. Vacío: el lector está apagado.' }
  };
  function persona(id, nombre, puesto, depto) { return { employee_id: id, nombre: nombre, puesto: puesto, departamento: depto }; }
  var P = [
    persona(501, 'Laura Demo', 'Técnica de campo', 'Operaciones'), persona(502, 'Óscar Demo', 'Soldador', 'Operaciones'),
    persona(503, 'Irene Demo', 'Auxiliar administrativa', 'Comercial'), persona(504, 'Tomás Demo', 'Electricista', 'Operaciones'),
    persona(505, 'Rebeca Demo', 'Dibujante', 'Ingenieria'), persona(506, 'Héctor Demo', 'Ayudante general', 'Operaciones'),
    persona(507, 'Noemí Demo', 'Compras', 'Comercial'), persona(508, 'Damián Demo', 'Supervisor de obra', 'Operaciones')
  ];
  function retardosDemo(n, base) {
    var out = [], dia = 1;
    for (var i = 0; i < n; i++) {
      dia += (i % 3 === 2) ? 3 : 1;
      var min = [24, 31, 47, 22, 65, 38, 29, 112, 26][(base + i) % 9];
      var h = 7 * 60 + min;
      out.push({ fecha: ('0' + dia).slice(-2) + '/09/2026', llegada: ('0' + Math.floor(h / 60)).slice(-2) + ':' + ('0' + h % 60).slice(-2), esperada: '07:00', minutos: min });
    }
    return out;
  }
  var hoy = new Date();
  function fecha(dd) { var d = new Date(hoy.getTime() + dd * 86400000); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); }
  function iso(dd) { return new Date(hoy.getTime() + dd * 86400000).toISOString(); }
  var seq = 40;
  function caso(p, nivel, estado, n, dAbierto, dVence, extra) {
    var e = ESCALERA[nivel - 1];
    seq += 1;
    return Object.assign({
      folio: 'RET-2026-' + ('000' + seq).slice(-4), employee_id: p.employee_id, nombre: p.nombre, puesto: p.puesto, departamento: p.departamento,
      nivel: nivel, accion: e.accion, nombre_nivel: e.nombre, estado: estado, periodo: '2026-09', retardos_n: n,
      abierto_at: iso(dAbierto), vence_at: dVence == null ? null : iso(dVence), vence: dVence == null ? null : fecha(dVence),
      ruta: 'correo', modo_al_abrir: 'sombra', dias_abierto: -dAbierto, motivo_apertura: 'umbral',
      email_valido: true, supervisor: 'Damián Demo', requiere_testigos: e.requiere_testigos, dias_suspension: e.dias_suspension,
      retardos: retardosDemo(n, seq), evidencias: [], bitacora: [], envios: [], accion_desde: null, accion_hasta: null
    }, extra || {});
  }
  var CASOS = [
    caso(P[0], 2, 'ESPERANDO_FIRMA', 3, -1, 2),
    caso(P[1], 3, 'VENCIDO', 5, -6, 1, { recordatorios: 1 }),
    caso(P[2], 2, 'FIRMA_RECIBIDA', 4, -4, 0, { evidencias: [{ id: 91, nombre: 'hoja-firmada.jpg', mime: 'image/jpeg', bytes: 184233, origen: 'correo', tipo: 'hoja_firmada', at: iso(-1) }] }),
    caso(P[3], 4, 'SE_NEGO_A_FIRMAR', 8, -7, -2, { motivo_apertura: 'reincidencia' }),
    caso(P[4], 1, 'CERRADO', 1, -3, null),
    caso(P[5], 3, 'ESCALADO', 6, -9, -1, { ruta: 'supervisor', email_valido: false }),
    caso(P[6], 2, 'IMPUGNADO', 3, -5, 1),
    caso(P[7], 4, 'ACCION_PROGRAMADA', 7, -12, null, { accion_desde: fecha(3), accion_hasta: fecha(3) }),
    caso(P[0], 3, 'RETENIDO', 5, 0, null)
  ];
  CASOS.forEach(function (c) {
    c.bitacora = [
      { at: c.abierto_at, evento: 'apertura', de: null, a: 'DETECTADO', actor: 'sistema', motivo: c.retardos_n + ' retardos en ' + c.periodo + ' (nivel ' + c.nivel + ')' },
      { at: c.abierto_at, evento: 'transicion', de: 'DETECTADO', a: 'NOTIFICADO', actor: 'sistema', motivo: 'Correo enviado [SOMBRA]' }
    ];
    if (c.nivel > 1) c.bitacora.push({ at: c.abierto_at, evento: 'transicion', de: 'NOTIFICADO', a: 'ESPERANDO_FIRMA', actor: 'sistema', motivo: 'Plazo al ' + (c.vence || '') });
    if (c.estado !== 'ESPERANDO_FIRMA' && c.estado !== 'CERRADO' && c.nivel > 1)
      c.bitacora.push({ at: iso(-1), evento: 'transicion', de: 'ESPERANDO_FIRMA', a: c.estado, actor: c.estado === 'FIRMA_RECIBIDA' ? 'correo:empleado' : 'sistema', motivo: 'Ejemplo' });
    c.envios = [{ tipo: 'notificacion', estado: 'enviado', modo: 'sombra', enviado_at: c.abierto_at, asunto: '[SOMBRA] [' + c.folio + '] ' + c.nombre_nivel }];
    if (c.estado === 'RETENIDO') {
      c.bitacora = [c.bitacora[0], { at: c.abierto_at, evento: 'transicion', de: 'DETECTADO', a: 'RETENIDO', actor: 'sistema', motivo: 'Nivel alcanzado, no notificado: el nivel 3 no está habilitado (arranque suave)' }];
      c.envios = [];
    }
  });
  var EXCL = [
    { id: 3, employee_id: 504, desde: '2026-09-14', hasta: '2026-09-18', tipo: 'usa', motivo: 'Viaje de trabajo (ejemplo)', activo: true },
    { id: 4, employee_id: 507, desde: '2026-09-21', hasta: '2026-09-22', tipo: 'permiso', motivo: 'Permiso con goce (ejemplo)', activo: true }
  ];
  var TRANS = {
    DETECTADO: ['NOTIFICADO', 'CANCELADO_POR_RH'], NOTIFICADO: ['ESPERANDO_FIRMA', 'CERRADO', 'CANCELADO_POR_RH'],
    ESPERANDO_FIRMA: ['FIRMA_RECIBIDA', 'VENCIDO', 'SE_NEGO_A_FIRMAR', 'IMPUGNADO', 'CANCELADO_POR_RH'],
    VENCIDO: ['FIRMA_RECIBIDA', 'ESCALADO', 'SE_NEGO_A_FIRMAR', 'IMPUGNADO', 'CANCELADO_POR_RH'],
    ESCALADO: ['FIRMA_RECIBIDA', 'SE_NEGO_A_FIRMAR', 'IMPUGNADO', 'CANCELADO_POR_RH'],
    FIRMA_RECIBIDA: ['VALIDADO_RH', 'ESPERANDO_FIRMA', 'IMPUGNADO', 'CANCELADO_POR_RH'],
    SE_NEGO_A_FIRMAR: ['VALIDADO_RH', 'CANCELADO_POR_RH'], IMPUGNADO: ['ESPERANDO_FIRMA', 'VALIDADO_RH', 'CANCELADO_POR_RH'],
    VALIDADO_RH: ['ACCION_PROGRAMADA', 'CERRADO', 'CANCELADO_POR_RH'], ACCION_PROGRAMADA: ['ACCION_VERIFICADA', 'CANCELADO_POR_RH'],
    ACCION_VERIFICADA: ['CERRADO'], RETENIDO: ['CERRADO', 'CANCELADO_POR_RH']
  };
  function mover(c, a, motivo, actor) {
    if ((TRANS[c.estado] || []).indexOf(a) < 0) throw new Error('TRANSICION_INVALIDA ' + c.estado + ' -> ' + a);
    if (a === 'CANCELADO_POR_RH' && !(motivo && motivo.trim().length >= 5)) throw new Error('MOTIVO_OBLIGATORIO');
    c.bitacora.push({ at: new Date().toISOString(), evento: 'transicion', de: c.estado, a: a, actor: actor, motivo: motivo });
    c.estado = a;
  }
  function saludDemo() {
    return { ok: true, problemas: [], modo: 'sombra', casos_abiertos: CASOS.filter(function (c) { return c.estado !== 'CERRADO' && c.estado !== 'CANCELADO_POR_RH'; }).length,
             outbox_pendiente: 0, ultima_deteccion: iso(-0.2), ultima_deteccion_leidos: 212 };
  }

  // Calidad de datos de EJEMPLO (horas decimales; nombres inventados).
  var CALIDAD = [
    { employee_id: 501, nombre: 'Laura Demo', departamento: 'Operaciones', hora_entrada: 7, hora_calendario: 7, dias_con_checada: 58, mediana: 7.2, p25: 6.95, pct_tarde: 34.5, hora_sugerida: 7.5, banderas: {}, revisado: false },
    { employee_id: 503, nombre: 'Irene Demo', departamento: 'Comercial', hora_entrada: 7.5, hora_calendario: 8, dias_con_checada: 55, mediana: 8.1, p25: 7.9, pct_tarde: 61.8, hora_sugerida: 8, banderas: { ficha_vs_calendario: true, correo_personal: true }, revisado: false },
    { employee_id: 504, nombre: 'Tomás Demo', departamento: 'Operaciones', hora_entrada: 7, hora_calendario: 7, dias_con_checada: 60, mediana: 7.05, p25: 6.9, pct_tarde: 8.3, hora_sugerida: 7, banderas: {}, revisado: true, nota: 'Correcto (ejemplo)', revisado_por: 'rh.demo' },
    { employee_id: 505, nombre: 'Rebeca Demo', departamento: 'Ingenieria', hora_entrada: 7, hora_calendario: 8, dias_con_checada: 57, mediana: 10.4, p25: 8.1, pct_tarde: 71.9, hora_sugerida: 10.5, banderas: { ficha_vs_calendario: true, retrasos_mas_180: true }, revisado: false },
    { employee_id: 506, nombre: 'Héctor Demo', departamento: 'Operaciones', hora_entrada: 7, hora_calendario: 7, dias_con_checada: 61, mediana: 7.15, p25: 7, pct_tarde: 18, hora_sugerida: 7, banderas: { dominio_invalido: true, correo_personal: true }, revisado: false },
    { employee_id: 507, nombre: 'Noemí Demo', departamento: 'Comercial', hora_entrada: 11, hora_calendario: 8, dias_con_checada: 0, mediana: null, p25: null, pct_tarde: null, hora_sugerida: null, banderas: { ficha_vs_calendario: true, correo_compartido: true, sin_checadas: true }, revisado: false }
  ];
  var sinSustituir = {};
  function listaFila(c) {
    return { folio: c.folio, employee_id: c.employee_id, nombre: c.nombre, nivel: c.nivel, accion: c.accion, estado: c.estado, periodo: c.periodo,
             retardos_n: c.retardos_n, abierto_at: c.abierto_at, vence_at: c.vence_at, ruta: c.ruta, modo_al_abrir: c.modo_al_abrir,
             dias_abierto: c.dias_abierto, evidencias: c.evidencias.length };
  }
  function datosCaso(c) {
    var o = {}; for (var k in c) if (k !== 'bitacora' && k !== 'evidencias' && k !== 'envios') o[k] = c[k];
    return o;
  }
  async function llamarDemo(d) {
    await new Promise(function (r) { setTimeout(r, 120); });
    var actor = 'rh.demo';
    try {
      if (d.accion === 'listar') {
        return { ok: true, casos: CASOS.filter(function (c) { return d.incluir_cerrados || (c.estado !== 'CERRADO' && c.estado !== 'CANCELADO_POR_RH'); }).map(listaFila), salud: saludDemo() };
      }
      if (d.accion === 'config') return { ok: true, config: CONFIG, escalera: ESCALERA, exclusiones: EXCL.filter(function (x) { return x.activo; }) };
      if (d.accion === 'exclusion_agregar') {
        EXCL.unshift({ id: 10 + EXCL.length, employee_id: d.employee_id ? Number(d.employee_id) : null, desde: d.desde, hasta: d.hasta, tipo: d.tipo, motivo: d.motivo, activo: true });
        return { ok: true, caso: null };
      }
      if (d.accion === 'calidad') return { ok: true, personas: CALIDAD, tolerancia_min: 20, regla_sugerida: 'Primer horario en punto o y media con el que habría llegado tarde en no más del 20% de sus días hábiles de los últimos 90.' };
      if (d.accion === 'calidad_revisar') { CALIDAD.forEach(function (x) { if (x.employee_id === Number(d.employee_id)) { x.revisado = !!d.revisado; x.nota = d.nota; x.revisado_por = actor; } }); return { ok: true }; }
      if (d.accion === 'exclusion_quitar') { EXCL.forEach(function (x) { if (x.id === Number(d.id)) x.activo = false; }); return { ok: true, caso: null }; }
      var c = CASOS.filter(function (x) { return x.folio === d.folio; })[0];
      if (!c) return { ok: false, error: 'FOLIO_INEXISTENTE' };
      if (d.accion === 'caso') return { ok: true, caso: datosCaso(c), bitacora: c.bitacora, evidencias: c.evidencias, envios: c.envios };
      if (d.accion === 'evidencia') {
        var ev = c.evidencias.filter(function (x) { return x.id === Number(d.id); })[0];
        if (!ev) return { ok: false, error: 'EVIDENCIA_INEXISTENTE' };
        c.bitacora.push({ at: new Date().toISOString(), evento: 'evidencia_vista', actor: actor, motivo: 'Consulta desde el panel' });
        return { ok: true, nombre: ev.nombre, mime: ev.mime, bytes: ev.bytes, demo: true, contenido_b64: sinSustituir[ev.id] || null };
      }
      if (d.accion === 'subir_hoja') {
        var id = 100 + Math.floor(Math.random() * 900);
        c.evidencias.push({ id: id, nombre: d.nombre, mime: d.mime, bytes: Math.floor((d.contenido_b64 || '').length * 0.75), origen: 'panel', tipo: d.tipo || 'hoja_firmada', at: new Date().toISOString() });
        sinSustituir[id] = d.contenido_b64;
        if (['ESPERANDO_FIRMA', 'VENCIDO', 'ESCALADO'].indexOf(c.estado) >= 0 && (d.tipo || 'hoja_firmada') === 'hoja_firmada') mover(c, 'FIRMA_RECIBIDA', 'Hoja subida desde el panel', actor);
        return { ok: true };
      }
      if (d.accion === 'validar_firma') {
        if (!c.evidencias.length) return { ok: false, error: 'SIN_EVIDENCIA' };
        mover(c, 'VALIDADO_RH', d.motivo || 'Firma validada por RH', actor);
        if (c.accion === 'carta_compromiso' || c.accion === 'acta') mover(c, 'CERRADO', 'Documento firmado y validado; queda en seguimiento de reincidencia', actor);
      } else if (d.accion === 'rechazar_firma') {
        mover(c, 'ESPERANDO_FIRMA', d.motivo || 'Hoja ilegible o incompleta', actor); c.vence = fecha(2);
        c.envios.push({ tipo: 'pide_hoja', estado: 'pendiente', modo: 'sombra', enviado_at: null, asunto: 'RE: [' + c.folio + '] Falta la hoja firmada' });
      } else if (d.accion === 'registrar_negativa') {
        if ((d.testigo1 || '').trim().length < 3 || (d.testigo2 || '').trim().length < 3) return { ok: false, error: 'FALTAN_TESTIGOS' };
        mover(c, 'SE_NEGO_A_FIRMAR', 'Se negó a firmar ante dos testigos', actor);
      } else if (d.accion === 'impugnar') {
        mover(c, 'IMPUGNADO', d.motivo || 'El trabajador impugna', actor);
      } else if (d.accion === 'programar_accion') {
        if (c.accion !== 'suspension') return { ok: false, error: 'SOLO_SUSPENSION' };
        var dias = Number(d.dias);
        if (!(dias >= 1 && dias <= 8)) return { ok: false, error: 'DIAS_FUERA_DE_LEY' };
        if (c.estado === 'SE_NEGO_A_FIRMAR' || c.estado === 'IMPUGNADO') mover(c, 'VALIDADO_RH', 'RH resuelve y procede', actor);
        var p = d.desde.split('-'); c.accion_desde = p[2] + '/' + p[1] + '/' + p[0]; c.accion_hasta = c.accion_desde;
        mover(c, 'ACCION_PROGRAMADA', 'Suspensión de ' + dias + ' días hábiles desde ' + d.desde, actor);
      } else if (d.accion === 'marcar_ejecutada') {
        mover(c, 'ACCION_VERIFICADA', d.motivo || 'RH confirma que se aplicó', actor); mover(c, 'CERRADO', 'Acción verificada', actor);
      } else if (d.accion === 'cerrar') {
        mover(c, 'CERRADO', d.motivo || 'Cerrado por RH', actor);
      } else if (d.accion === 'cancelar') {
        mover(c, 'CANCELADO_POR_RH', d.motivo, actor);
      } else return { ok: false, error: 'ACCION_DESCONOCIDA' };
      return { ok: true, caso: datosCaso(c) };
    } catch (e) {
      return { ok: false, tipo: 'servidor', error: String(e.message).split(' ')[0], detalle: String(e.message) };
    }
  }

  var api = {
    modo: 'real',
    llamar: function (datos) { return api.modo === 'demo' ? llamarDemo(datos) : llamarReal(datos); }
  };
  G.RetApi = api;
})(window);
