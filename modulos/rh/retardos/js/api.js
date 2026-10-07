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
    modo_sanciones: { valor: 'sin_suspension', confirmado: false, descripcion: 'sin_suspension: aviso, carta y acta funcionan; el nivel de suspensión queda como alcanzado, no aplicado. El cambio lo deciden Esteban, RH y Legal.' },
    dias_recoleccion_rh: { valor: 3, confirmado: false, descripcion: 'Días hábiles que tiene RH para recolectar la firma y subir la hoja.' },
    correo_modo: { valor: 'preferente', confirmado: false, descripcion: 'preferente: correo de empresa; si no hay, el personal. ambos: a los dos.' },
    hojas_carpeta: { valor: null, confirmado: false, descripcion: 'Carpeta de OneDrive o SharePoint donde RH deja hojas escaneadas. Vacía: sólo se suben desde el panel.' },
    real_desde: { valor: null, confirmado: false, descripcion: 'Fecha del paso a real. Sin ella no se evalúan las alertas globales.' },
    real_inicio: { valor: null, confirmado: true, descripcion: 'Instante exacto del paso a real. Lo pone la base sola al cambiar modo a real.' },
    piloto_employee_ids: { valor: [505, 507], confirmado: true, descripcion: 'Empleados del piloto. Reciben avisos reales desde piloto_inicio aunque modo siga en sombra.' },
    piloto_habilitado: { valor: true, confirmado: true, descripcion: 'Interruptor del piloto. false lo apaga sin tocar código.' },
    piloto_inicio: { valor: null, confirmado: true, descripcion: 'Arranque del piloto. Lo fija retardos/enviar la primera vez que corre después del merge.' },
    aviso_cc_rh: { valor: ['rh.uno@ejemplo.mx', 'rh.dos@ejemplo.mx'], confirmado: true, descripcion: 'Copia de todo aviso de retardo o jornada, además del jefe directo según Odoo.' },
    aviso_cc_sin_jefe: { valor: ['direccion@ejemplo.mx'], confirmado: true, descripcion: 'Copia adicional cuando la persona no tiene jefe directo en Odoo.' },
    leyenda_sin_jefe: { valor: 'Falta asignarle jefe en Odoo', confirmado: true, descripcion: 'Leyenda visible arriba del correo cuando falta el jefe directo.' },
    ppa_minutos: { valor: 5, confirmado: true, descripcion: 'Sólo texto: el PPA se gana checando a más tardar estos minutos después de la entrada. Lo calcula Nómina, no Retardos.' },
    tolerancia_min: { valor: 15, confirmado: false, descripcion: 'Minutos de gracia después de la hora de entrada, al segundo: 15:00 no es retardo, 15:01 sí.' },
    dias_habiles: { valor: [1, 2, 3, 4, 5], confirmado: false, descripcion: 'Días en que se cuenta retardo: lunes a viernes. Sábado y domingo nunca son retardo, pero sus horas cuentan para la jornada.' },
    zona_horaria: { valor: 'America/Monterrey', confirmado: false, descripcion: 'Hora del centro (CST, UTC-6 todo el año). Toda fecha y hora se convierte en un solo lugar.' },
    jornada_umbral_horas: { valor: 48, confirmado: false, descripcion: 'Horas efectivas de la semana FTS (viernes 00:00 a jueves 23:59:59). Si el calendario de la persona dice otra cosa, se usa el suyo y se marca en Calidad.' },
    jornada_comida_min: { valor: 30, confirmado: false, descripcion: 'Minutos de comida que se descuentan por día trabajado, sin duplicar una comida que Odoo ya haya registrado.' },
    jornada_comida_fin_de_semana: { valor: 'desde_horas', confirmado: false, descripcion: 'Sábado y domingo: siempre, nunca, o sólo si trabajó al menos jornada_comida_fds_min_horas.' },
    jornada_comida_fds_min_horas: { valor: 6, confirmado: false, descripcion: 'Horas mínimas trabajadas en fin de semana para descontar comida.' },
    jornada_ventana_dias: { valor: 90, confirmado: false, descripcion: 'Ventana en que se cuentan los avisos de jornada para llegar al tercero.' },
    jornada_plazo_correccion_dias: { valor: 3, confirmado: false, descripcion: 'Días que tiene la persona para corregir un olvido de checada después del aviso.' },
    jornada_desde: { valor: '2026-10-02', confirmado: false, descripcion: 'Primera semana FTS que puede abrir avisos de jornada. Las anteriores se calculan y no abren casos.' },
    jornada_envio: { valor: 'inmediato', confirmado: false, descripcion: 'inmediato: el aviso sale el viernes del corte. lunes: espera al lunes, por si Nómina todavía captura.' },
    modo_medidas_jornada: { valor: 'retenidas', confirmado: false, descripcion: 'retenidas: la propuesta de medida del tercer aviso se registra y no se aplica. habilitadas: RH la registra y se verifica contra Nómina.' },
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
      var min = [16, 31, 47, 22, 65, 38, 29, 112, 26][(base + i) % 9], sg = (base * 7 + i * 13) % 60;
      var h = 7 * 60 + min;
      out.push({ fecha: ('0' + dia).slice(-2) + '/09/2026', llegada: ('0' + Math.floor(h / 60)).slice(-2) + ':' + ('0' + h % 60).slice(-2) + ':' + ('0' + sg).slice(-2), esperada: '07:00', minutos: min });
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
      ruta: 'correo', modo_al_abrir: 'sombra', pista: 'sombra', jefe_estado: 'ok', leyenda_jefe: null, ppa_minutos: 5, tipo: 'retardo', dias_abierto: -dAbierto, motivo_apertura: 'umbral',
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
    caso(P[0], 4, 'RETENIDO', 7, 0, null),
    caso(P[4], 1, 'NOTIFICADO', 1, 0, null, { pista: 'real', modo_al_abrir: 'piloto', periodo: '2026-10' }),
    caso(P[6], 1, 'NOTIFICADO', 2, 0, null, { pista: 'real', modo_al_abrir: 'piloto', periodo: '2026-10', jefe_estado: 'sin_jefe', supervisor: null, leyenda_jefe: 'Falta asignarle jefe en Odoo' })
  ];
  CASOS.forEach(function (c) {
    c.bitacora = [
      { at: c.abierto_at, evento: 'apertura', de: null, a: 'DETECTADO', actor: 'sistema', motivo: c.retardos_n + ' retardos en ' + c.periodo + ' (nivel ' + c.nivel + ')' },
      { at: c.abierto_at, evento: 'transicion', de: 'DETECTADO', a: 'NOTIFICADO', actor: 'sistema', motivo: c.pista === 'real' ? 'Correo enviado a la persona (piloto)' : 'Correo enviado [SOMBRA]' }
    ];
    if (c.nivel > 1) c.bitacora.push({ at: c.abierto_at, evento: 'transicion', de: 'NOTIFICADO', a: 'ESPERANDO_FIRMA', actor: 'sistema', motivo: 'Plazo al ' + (c.vence || '') });
    if (c.estado !== 'ESPERANDO_FIRMA' && c.estado !== 'CERRADO' && c.nivel > 1)
      c.bitacora.push({ at: iso(-1), evento: 'transicion', de: 'ESPERANDO_FIRMA', a: c.estado, actor: c.estado === 'FIRMA_RECIBIDA' ? 'correo:empleado' : 'sistema', motivo: 'Ejemplo' });
    var mEnv = c.pista === 'real' ? 'real' : 'sombra';
    c.envios = [{ tipo: 'notificacion', estado: 'enviado', modo: mEnv, enviado_at: c.abierto_at, asunto: (mEnv === 'real' ? '' : '[SOMBRA] ') + '[' + c.folio + '] ' + (c.nivel > 1 ? 'Recolectar firma: ' : '') + c.nombre_nivel }];
    if (c.nivel > 1) c.envios.push({ tipo: 'aviso_trabajador', estado: 'enviado', modo: 'sombra', enviado_at: c.abierto_at, asunto: '[SOMBRA] [' + c.folio + '] ' + c.nombre_nivel + ': Recursos Humanos te va a citar' });
    if (c.estado === 'RETENIDO') {
      c.bitacora = [c.bitacora[0], { at: c.abierto_at, evento: 'transicion', de: 'DETECTADO', a: 'RETENIDO', actor: 'sistema', motivo: 'Nivel de suspensión alcanzado, no aplicado (modo sin suspensión). Cuenta como antecedente.' }];
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
  var CORREOS = {
    501: [{ email: 'laura.demo@fts.mx', campo: 'work_email', tipo: 'empresa', usable: true, motivo: 'ok' }],
    503: [{ email: 'irene.demo@example.com', campo: 'work_email', tipo: 'personal', usable: true, motivo: 'ok' }],
    504: [{ email: 'tomas.demo@fts.mx', campo: 'work_email', tipo: 'empresa', usable: true, motivo: 'ok' }, { email: 'tomas.demo@example.com', campo: 'private_email', tipo: 'personal', usable: true, motivo: 'ok' }],
    505: [{ email: 'rebeca.demo@fts.mx', campo: 'work_email', tipo: 'empresa', usable: true, motivo: 'ok' }],
    506: [{ email: 'hector.demo@gmai.com', campo: 'work_email', tipo: 'personal', usable: false, motivo: 'invalido' }],
    507: [{ email: 'ventas@fts.mx', campo: 'work_email', tipo: 'empresa', usable: false, motivo: 'generico' }]
  };
  CALIDAD.forEach(function (p) {
    p.correos = CORREOS[p.employee_id] || [];
    var u = p.correos.filter(function (x) { return x.usable; });
    p.correo_usado = u.filter(function (x) { return x.tipo === 'empresa'; }).slice(0, 1);
    if (!p.correo_usado.length) p.correo_usado = u.slice(0, 1);
    p.correo_motivo = !p.correo_usado.length ? 'sin correo utilizable: la hoja va sólo a RH y al jefe'
      : (p.correo_usado[0].tipo === 'empresa' ? 'correo de empresa' : 'no tiene correo de empresa utilizable: se usa el personal');
  });

  // Hojas por confirmar de EJEMPLO: las imágenes son las hojas inventadas de las pruebas del lector.
  var FIX = '../../../retardos/hojas/tests/fixtures/';
  function fir(t, r, j, t1, t2) { var f = function (v) { return { presente: v, confianza: 0.97 }; }; return { trabajador: f(t), rh: f(r), jefe: f(j), testigo1: f(t1), testigo2: f(t2) }; }
  var LECT = [
    { lectura_id: 71, hoja_id: 31, pagina: 1, folio: CASOS[2].folio, folio_fuente: 'qr', sugerencia: 'lista_para_validar', sugerencia_texto: 'Lista para validar', negativa: false, confianza: 0.99,
      hoja: { nombre: 'escaneo-rh-0928.jpg', mime: 'image/jpeg', origen: 'panel', url: FIX + '01-completa.jpg' }, caso: { folio: CASOS[2].folio, nivel: 2, accion: 'carta_compromiso', estado: 'FIRMA_RECIBIDA', nombre: CASOS[2].nombre },
      resultado: { firmas: fir(true, true, true, false, false), negativa: { marcada: false }, comentarios: { presente: false }, legibilidad: 'buena', banderas: [] } },
    { lectura_id: 72, hoja_id: 32, pagina: 1, folio: CASOS[1].folio, folio_fuente: 'qr', sugerencia: 'revisar_impugnacion', sugerencia_texto: 'Revisar: posible impugnación (el comentario expresa inconformidad)', negativa: false, confianza: 0.9,
      hoja: { nombre: 'foto-celular.jpg', mime: 'image/jpeg', origen: 'carpeta', url: FIX + '05-inconformidad.jpg' }, caso: { folio: CASOS[1].folio, nivel: 3, accion: 'acta', estado: 'FIRMA_RECIBIDA', nombre: CASOS[1].nombre },
      resultado: { firmas: fir(true, true, true, true, true), negativa: { marcada: false }, comentarios: { presente: true, transcripcion: 'No estoy de acuerdo, el dia 3 tenia permiso de mi jefe para llegar tarde.', inconformidad: true, fuente: 'ocr' }, legibilidad: 'buena', banderas: [] } },
    { lectura_id: 73, hoja_id: 33, pagina: 1, folio: CASOS[5].folio, folio_fuente: 'qr', sugerencia: 'revisar_falta_firma', sugerencia_texto: 'Revisar: falta firma (testigo1, testigo2)', negativa: true, confianza: 0.95,
      hoja: { nombre: 'negativa.jpg', mime: 'image/jpeg', origen: 'panel', url: FIX + '04-negativa-sin-testigos.jpg' }, caso: { folio: CASOS[5].folio, nivel: 3, accion: 'acta', estado: 'FIRMA_RECIBIDA', nombre: CASOS[5].nombre },
      resultado: { firmas: fir(false, true, false, false, false), negativa: { marcada: true }, comentarios: { presente: false }, legibilidad: 'buena', banderas: [] } },
    { lectura_id: 74, hoja_id: 34, pagina: 1, folio: 'RET-2026-9999', folio_fuente: 'qr', sugerencia: 'revisar_folio', sugerencia_texto: 'Revisar: folio o nombre no coinciden (el folio no existe)', negativa: false, confianza: 0.99,
      hoja: { nombre: 'hoja-sin-caso.jpg', mime: 'image/jpeg', origen: 'correo', url: FIX + '08-folio-inexistente.jpg' }, caso: null,
      resultado: { firmas: fir(true, true, true, false, false), negativa: { marcada: false }, comentarios: { presente: false }, legibilidad: 'regular', banderas: ['foto_inclinada'] } }
  ];
  CASOS[1].estado = 'FIRMA_RECIBIDA'; CASOS[5].estado = 'FIRMA_RECIBIDA';
  var METRICA = { dias: 30, decididas: 18, aciertos: 16, pct_acierto: 88.9, por_confirmar: LECT.length };
  var ENPROCESO = [{ hoja_id: 35, nombre: 'lote-tarde.pdf', estado: 'pendiente', intentos: 0 }];

  var REINC = [
    { employee_id: 501, nombre: 'Laura Demo', departamento: 'Operaciones', meses_con_casos: 3, meses_consecutivos: 3, cartas_90: 1, cartas_180: 1, actas_90: 1, actas_180: 1, suspension_no_aplicada: 1, meses_suspension_ventana: 1, retardos_30d: 7, promedio_30d_previo: 4.3, tendencia: 'sube', semaforo: 'rojo' },
    { employee_id: 502, nombre: 'Óscar Demo', departamento: 'Operaciones', meses_con_casos: 2, meses_consecutivos: 2, cartas_90: 1, cartas_180: 1, actas_90: 1, actas_180: 1, suspension_no_aplicada: 0, meses_suspension_ventana: 0, retardos_30d: 5, promedio_30d_previo: 5, tendencia: 'igual', semaforo: 'amarillo' },
    { employee_id: 503, nombre: 'Irene Demo', departamento: 'Comercial', meses_con_casos: 1, meses_consecutivos: 1, cartas_90: 1, cartas_180: 1, actas_90: 0, actas_180: 0, suspension_no_aplicada: 0, meses_suspension_ventana: 0, retardos_30d: 1, promedio_30d_previo: 3.7, tendencia: 'baja', semaforo: 'verde' },
    { employee_id: 508, nombre: 'Damián Demo', departamento: 'Operaciones', meses_con_casos: 2, meses_consecutivos: 1, cartas_90: 0, cartas_180: 1, actas_90: 0, actas_180: 1, suspension_no_aplicada: 0, meses_suspension_ventana: 0, retardos_30d: 2, promedio_30d_previo: 2.7, tendencia: 'igual', semaforo: 'amarillo' }
  ];
  var ALERTAS = [
    { id: 5, alcance: 'individual', disparador: 'reincide_tras_acta', texto: 'Una persona volvió a tener caso el mes siguiente a firmar un acta.', employee_id: 501, nombre: 'Laura Demo',
      evidencia: { acta: 'RET-2026-0031', caso_siguiente: CASOS[8].folio }, estado: 'abierta', creado_at: iso(-2) },
    { id: 4, alcance: 'global', disparador: 'plantilla_en_acta', texto: 'Una parte de la plantilla activa mayor al límite está en nivel de acta o superior.', employee_id: null, nombre: null,
      evidencia: { personas_en_acta_o_mas: 5, activos: 29, pct: 17.2 }, estado: 'pospuesta', posponer_hasta: '2026-10-12', motivo: 'Esperar la corrección de horas de entrada (ejemplo)', atendida_por: 'rh.demo', creado_at: iso(-9) }
  ];
  var sinSustituir = {};
  // ── Jornada semanal FTS de EJEMPLO (viernes a jueves, hora del centro) ──
  var ESCALERA_J = [
    { nivel: 1, accion: 'aviso_jornada_1', nombre: 'Primer aviso de jornada incompleta', requiere_firma: false, propone_medida: false, confirmado: false, nota: 'Correo a la persona con copia a RH y al jefe.' },
    { nivel: 2, accion: 'aviso_jornada_2', nombre: 'Segundo aviso de jornada incompleta', requiere_firma: false, propone_medida: false, confirmado: false, nota: 'Correo a la persona con copia a RH y al jefe.' },
    { nivel: 3, accion: 'aviso_jornada_3', nombre: 'Tercer aviso de jornada incompleta', requiere_firma: true, propone_medida: true, confirmado: false, nota: 'Hoja con QR que RH imprime y recolecta. Abre una propuesta de medida que queda retenida.' }
  ];
  var FESTIVOS = [
    { fecha: '2026-09-16', nombre: 'Día de la Independencia (LFT art. 74)', creado_por: 'semilla_lft_art74' },
    { fecha: '2026-11-16', nombre: 'Revolución Mexicana, tercer lunes de noviembre (LFT art. 74)', creado_por: 'semilla_lft_art74' },
    { fecha: '2026-12-25', nombre: 'Navidad (LFT art. 74)', creado_por: 'semilla_lft_art74' }
  ];
  var PLANTILLAS = ['notificacion_aviso', 'jornada_aviso', 'jornada_aviso_3', 'jornada_rh_recolectar', 'jornada_por_revisar', 'jornada_sin_correo', 'comunicado_arranque'].map(function (k) {
    return { clave: k, asunto: '', estado_texto: 'pendiente_validacion_rh', variables: [] };
  });
  // Día a día de una semana: [brutas, comida descontada] de viernes a jueves; null = no checó.
  function dias(desde, hs, extra) {
    var d0 = new Date(desde + 'T12:00:00Z'), out = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(d0.getTime() + i * 86400000), dow = ((d.getUTCDay() + 6) % 7) + 1, b = hs[i];
      var com = b == null || b === 0 ? 0 : (dow >= 6 ? (b >= 6 ? 0.5 : 0) : 0.5);
      var x = { fecha: d.toISOString().slice(0, 10), dow: dow, laborable: dow <= 5, brutas: b || 0, comida: com, efectivas: b ? Math.round((b - com) * 100) / 100 : 0, prorrateo: null, motivos: [] };
      if (extra && extra[i]) Object.assign(x, extra[i]);
      out.push(x);
    }
    return out;
  }
  function semanaFila(p, sem, desde, hs, extra, estadoForzado, umbral) {
    var ds = dias(desde, hs, extra), ef = 0, br = 0, com = 0, pr = 0;
    ds.forEach(function (x) { ef += x.efectivas; br += x.brutas; com += x.comida; if (x.prorrateo) pr += 1; });
    var um = Math.round(((umbral || 48) - pr * 9.6) * 100) / 100; ef = Math.round(ef * 100) / 100;
    var est = estadoForzado || (ef >= um ? 'cumple' : 'incumple');
    var h = new Date(new Date(desde + 'T12:00:00Z').getTime() + 6 * 86400000).toISOString().slice(0, 10);
    return { employee_id: p.employee_id, nombre: p.nombre, departamento: p.departamento, semana: sem, desde: desde, hasta: h,
      horas_brutas: Math.round(br * 100) / 100, comida_h: com, horas_efectivas: Math.round(ef * 100) / 100, umbral_persona: umbral || 48,
      umbral_fuente: umbral ? 'calendario' : 'config', dias_prorrateo: pr, umbral: um, faltante: est === 'incumple' ? Math.round((um - ef) * 100) / 100 : 0,
      estado: est, motivos_revision: est === 'revisar' ? ds.filter(function (x) { return x.motivos.length; }).map(function (x) { return { fecha: x.fecha, motivos: x.motivos }; }) : [],
      desglose: ds, folio: null, caso_estado: null, aviso_n: null, incumple_8s: 0, avisos_ventana: 0, revisado_por: null };
  }
  var S1 = 'S39/2026', D1 = '2026-09-18', S0 = 'S38/2026', D0 = '2026-09-11';
  var JSEM = [
    // Laura: cumple con un sábado trabajado (el sábado nunca es retardo; sus horas sí cuentan).
    semanaFila(P[0], S1, D1, [10.1, 4.5, null, 10.2, 10, 10.1, 10.2]),
    // Óscar: tercer aviso en la ventana, falta un día completo.
    Object.assign(semanaFila(P[1], S1, D1, [10.1, null, null, 10, null, 10.1, 9.9]), { folio: 'JOR-2026-0003', caso_estado: 'ESPERANDO_FIRMA', aviso_n: 3, incumple_8s: 3, avisos_ventana: 3 }),
    // Irene: 47:59, un minuto abajo. El umbral es exacto.
    Object.assign(semanaFila(P[2], S1, D1, [10.1, null, null, 10.1, 10.1, 10.1, 10.0833]), { folio: 'JOR-2026-0002', caso_estado: 'NOTIFICADO', aviso_n: 1, avisos_ventana: 1 }),
    // Tomás: festivo del miércoles 16 no aplica en esta semana; semana con vacaciones de Nómina.
    semanaFila(P[3], S1, D1, [10.1, null, null, 10.1, 10.1, null, null], { 5: { prorrateo: 'nomina:vacaciones' }, 6: { prorrateo: 'nomina:vacaciones' } }),
    // Rebeca: entrada sin salida el martes: a revisión, no a aviso.
    semanaFila(P[4], S1, D1, [10.1, null, null, 10.1, 0, 10.1, 10.1], { 4: { motivos: ['sin_salida'] } }, 'revisar'),
    // Héctor: una asistencia de 19 horas: a revisión.
    semanaFila(P[5], S1, D1, [10.1, null, null, 19.2, 10.1, 10.1, 10.1], { 3: { motivos: ['asistencia_mas_de_max'] } }, 'revisar'),
    // Noemí: calendario de 50.5 horas en vez de 48 (se marca en Calidad).
    semanaFila(P[6], S1, D1, [10.1, null, null, 10.1, 10.1, 10.1, 10.1], null, null, 50.5),
    semanaFila(P[7], S1, D1, [10.3, null, null, 10.2, 10.1, 10.4, 10.2]),
    // Semana anterior, con el festivo del 16 prorrateado.
    semanaFila(P[0], S0, D0, [10.1, null, null, 10.1, 10.1, 0, 10.1], { 5: { prorrateo: 'festivo' } }),
    Object.assign(semanaFila(P[1], S0, D0, [10.1, null, null, 8.2, 10.1, 0, 7.5], { 5: { prorrateo: 'festivo' } }), { folio: 'JOR-2026-0001', caso_estado: 'NOTIFICADO', aviso_n: 2 })
  ];
  JSEM.forEach(function (x) { if (x.estado === 'incumple' || x.estado === 'revisar') x.incumple_8s = x.incumple_8s || 1; });
  function semaforoJ(x) { return x.estado === 'revisar' ? 'gris' : ((x.aviso_n || 0) >= 3 || x.incumple_8s >= 3) ? 'rojo' : (x.estado === 'incumple' || x.avisos_ventana > 0) ? 'amarillo' : 'verde'; }
  function jornadaDemo(sem) {
    var s = sem || S1, desde = s === S0 ? D0 : D1;
    var ps = JSEM.filter(function (x) { return x.semana === s; }).map(function (x) { return Object.assign({}, x, { semaforo: semaforoJ(x) }); });
    var ord = { revisar: 0, incumple: 1, cumple: 2 };
    ps.sort(function (a, b) { return (a.estado in ord ? ord[a.estado] : 3) - (b.estado in ord ? ord[b.estado] : 3) || (a.nombre < b.nombre ? -1 : 1); });
    return { ok: true, semana: s, desde: desde, hasta: ps.length ? ps[0].hasta : desde, semanas: [D1, D0], avisos_desde: '2026-10-02', personas: ps,
      por_revisar: JSEM.filter(function (x) { return x.estado === 'revisar' && !x.revisado_por; }).map(function (x) {
        return { employee_id: x.employee_id, nombre: x.nombre, semana: x.semana, desde: x.desde, horas_efectivas: x.horas_efectivas, umbral: x.umbral, motivos: x.motivos_revision, desglose: x.desglose }; }),
      reglas: { umbral: 48, comida_min: 30, comida_fds: 'desde_horas', comida_fds_min_horas: 6, ventana_dias: 90, modo_medidas: 'retenidas' } };
  }
  var MEDIDAS = [
    { id: 1, caso_id: 900, employee_id: 502, nombre: 'Óscar Demo', departamento: 'Operaciones', folio: 'JOR-2026-0003', caso_estado: 'ESPERANDO_FIRMA', semana: S1,
      propuesta: 'descuento_tiempo_no_laborado', horas_propuestas: JSEM[1].faltante, estado: 'propuesta', decision: null, decidido_por: null, creado_at: iso(-0.1) }
  ];

  (function () {
    var j = caso(P[1], 3, 'ESPERANDO_FIRMA', 0, 0, 3);
    var js = JSEM[1];
    function hm(h) { var m = Math.round(h * 60); return Math.floor(m / 60) + ':' + ('0' + m % 60).slice(-2); }
    Object.assign(j, { folio: 'JOR-2026-0003', tipo: 'jornada', accion: 'aviso_jornada_3', nombre_nivel: 'Tercer aviso de jornada incompleta', periodo: S1, retardos: [],
      requiere_testigos: false, dias_suspension: null,
      jornada: { semana: S1, desde: '18/09/2026', hasta: '24/09/2026', aviso_n: 3, horas_brutas: hm(js.horas_brutas), comida: hm(js.comida_h),
        horas_efectivas: hm(js.horas_efectivas), umbral: hm(js.umbral), faltante: hm(js.faltante),
        dias: js.desglose.map(function (x) { var D = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
          return { dia: D[x.dow], fecha: x.fecha.slice(8, 10) + '/' + x.fecha.slice(5, 7), brutas: hm(x.brutas), comida: hm(x.comida), efectivas: hm(x.efectivas), nota: x.brutas ? '' : (x.laborable ? 'no checó' : '') }; }) } });
    j.bitacora = [{ at: j.abierto_at, evento: 'apertura', de: null, a: 'DETECTADO', actor: 'sistema', motivo: 'Semana ' + S1 + ' abajo de 48 horas efectivas (aviso 3 de 3)' },
      { at: j.abierto_at, evento: 'transicion', de: 'DETECTADO', a: 'ESPERANDO_FIRMA', actor: 'sistema', motivo: 'RH imprime la hoja con QR y la recolecta' }];
    j.envios = [{ tipo: 'aviso_trabajador', estado: 'enviado', modo: 'sombra', enviado_at: j.abierto_at, asunto: '[SOMBRA] [' + j.folio + '] Tercer aviso de jornada semanal incompleta' }];
    CASOS.push(j);
  })();
  function listaFila(c) {
    return { folio: c.folio, employee_id: c.employee_id, nombre: c.nombre, nivel: c.nivel, accion: c.accion, estado: c.estado, periodo: c.periodo,
             retardos_n: c.retardos_n, abierto_at: c.abierto_at, vence_at: c.vence_at, ruta: c.ruta, modo_al_abrir: c.modo_al_abrir, tipo: c.tipo, pista: c.pista, jefe_estado: c.jefe_estado,
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
        return { ok: true, casos: CASOS.filter(function (c) { return d.incluir_cerrados || (c.estado !== 'CERRADO' && c.estado !== 'CANCELADO_POR_RH'); }).map(listaFila), salud: saludDemo(), piloto: { empleados: [505, 507], habilitado: true, inicio: iso(-0.5), modo: 'sombra', real_inicio: null } };
      }
      if (d.accion === 'config') return { ok: true, config: CONFIG, escalera: ESCALERA, escalera_jornada: ESCALERA_J, exclusiones: EXCL.filter(function (x) { return x.activo; }), festivos: FESTIVOS, plantillas: PLANTILLAS };
      if (d.accion === 'jornada') return jornadaDemo(d.semana);
      if (d.accion === 'medidas') return { ok: true, modo_medidas_jornada: 'retenidas', medidas: MEDIDAS };
      if (d.accion === 'jornada_revisar') {
        if (String(d.motivo || '').trim().length < 5) return { ok: false, error: 'MOTIVO_OBLIGATORIO' };
        var jr = JSEM.filter(function (x) { return x.employee_id === Number(d.employee_id) && x.semana === d.semana; })[0];
        if (!jr) return { ok: false, error: 'SEMANA_INEXISTENTE' };
        var hh = d.decision === 'corregir' ? Number(d.horas_efectivas) : jr.horas_efectivas;
        if (d.decision === 'no_aplica') jr.estado = 'no_aplica';
        else if (d.decision === 'confirmar' || d.decision === 'corregir') { if (!(hh >= 0 && hh <= 168)) return { ok: false, error: 'HORAS_INVALIDAS' }; jr.horas_corregidas = d.decision === 'corregir' ? hh : null; jr.estado = hh >= jr.umbral ? 'cumple' : 'incumple'; jr.faltante = jr.estado === 'incumple' ? Math.round((jr.umbral - hh) * 100) / 100 : 0; }
        else return { ok: false, error: 'DECISION_INVALIDA' };
        jr.revisado_por = actor; jr.revision_nota = d.motivo;
        return { ok: true, estado: jr.estado, folio: null };
      }
      if (d.accion === 'medida_decidir') {
        if (String(d.motivo || '').trim().length < 5) return { ok: false, error: 'MOTIVO_OBLIGATORIO' };
        var md = MEDIDAS.filter(function (x) { return x.id === Number(d.medida_id); })[0];
        if (!md) return { ok: false, error: 'MEDIDA_INEXISTENTE' };
        if (md.estado !== 'propuesta' && md.estado !== 'retenida') return { ok: false, error: 'MEDIDA_YA_DECIDIDA' };
        if (d.decision === 'descuento' && !(Number(d.horas) > 0 && Number(d.horas) <= md.horas_propuestas)) return { ok: false, error: 'HORAS_INVALIDAS' };
        if (['descuento', 'otra', 'ninguna'].indexOf(d.decision) < 0) return { ok: false, error: 'DECISION_INVALIDA' };
        md.estado = d.decision === 'ninguna' ? 'descartada' : 'retenida'; md.decidido_por = actor;
        md.decision = { decision: d.decision, horas: d.horas || null, detalle: d.detalle || null, motivo: d.motivo, modo_medidas_jornada: 'retenidas' };
        return { ok: true, estado: md.estado, nota: md.estado === 'retenida' ? 'Decisión registrada. La medida queda RETENIDA: no se aplica ni se manda a Nómina hasta que Legal confirme.' : null };
      }
      if (d.accion === 'festivo_agregar' || d.accion === 'festivo_quitar') {
        if (String(d.motivo || d.nombre || '').trim().length < 3) return { ok: false, error: 'MOTIVO_OBLIGATORIO' };
        FESTIVOS = FESTIVOS.filter(function (f) { return f.fecha !== d.fecha; });
        if (d.accion === 'festivo_agregar') { FESTIVOS.push({ fecha: d.fecha, nombre: d.nombre, creado_por: actor }); FESTIVOS.sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; }); }
        return { ok: true };
      }
      if (d.accion === 'exclusion_agregar') {
        EXCL.unshift({ id: 10 + EXCL.length, employee_id: d.employee_id ? Number(d.employee_id) : null, desde: d.desde, hasta: d.hasta, tipo: d.tipo, motivo: d.motivo, activo: true });
        return { ok: true, caso: null };
      }
      if (d.accion === 'calidad') return { ok: true, personas: CALIDAD, tolerancia_min: 15, regla_sugerida: 'Primer horario en punto o y media con el que habría llegado tarde en no más del 20% de sus días hábiles de los últimos 90.' };
      if (d.accion === 'calidad_revisar') { CALIDAD.forEach(function (x) { if (x.employee_id === Number(d.employee_id)) { x.revisado = !!d.revisado; x.nota = d.nota; x.revisado_por = actor; } }); return { ok: true }; }
      if (d.accion === 'hojas') return { ok: true, lecturas: LECT, hojas_en_proceso: ENPROCESO, metrica: METRICA };
      if (d.accion === 'hoja_ver') {
        var lh = LECT.filter(function (x) { return x.hoja_id === Number(d.hoja_id); })[0];
        if (!lh) return { ok: false, error: 'HOJA_INEXISTENTE' };
        return { ok: true, nombre: lh.hoja.nombre, mime: lh.hoja.mime, url_demo: lh.hoja.url, contenido_b64: sinSustituir['h' + lh.hoja_id] || null };
      }
      if (d.accion === 'subir_hojas' || d.accion === 'subir_hoja') {
        var arch = d.archivos || [{ nombre: d.nombre, mime: d.mime, contenido_b64: d.contenido_b64 }];
        if (arch.length > 10) return { ok: false, error: 'MAXIMO_10_ARCHIVOS' };
        arch.forEach(function (a) { ENPROCESO.push({ hoja_id: 200 + ENPROCESO.length, nombre: a.nombre, estado: 'pendiente', intentos: 0 }); });
        return { ok: true, archivos: arch.map(function (a, i) { return { ok: true, nombre: a.nombre, hoja_id: 200 + i, duplicada: false }; }) };
      }
      if (['hoja_confirmar', 'hoja_corregir', 'hoja_pedir_de_nuevo', 'hoja_descartar'].indexOf(d.accion) >= 0) {
        var l = LECT.filter(function (x) { return x.lectura_id === Number(d.lectura_id); })[0];
        if (!l) return { ok: false, error: 'LECTURA_INEXISTENTE' };
        var cc = l.caso ? CASOS.filter(function (x) { return x.folio === l.caso.folio; })[0] : null;
        if (d.accion === 'hoja_corregir') {
          var c2 = CASOS.filter(function (x) { return x.folio === d.folio; })[0];
          if (!c2) return { ok: false, error: 'FOLIO_INEXISTENTE' };
          l.caso = { folio: c2.folio, nivel: c2.nivel, accion: c2.accion, estado: c2.estado, nombre: c2.nombre }; l.folio = c2.folio;
          return { ok: true };
        }
        if (d.accion === 'hoja_confirmar') {
          if (!cc) return { ok: false, error: 'SIN_CASO_LIGADO' };
          if (d.resultado === 'negativa' && ((d.testigo1 || '').trim().length < 3 || (d.testigo2 || '').trim().length < 3)) return { ok: false, error: 'FALTAN_TESTIGOS' };
          if (d.resultado === 'firmada') { mover(cc, 'VALIDADO_RH', 'Hoja firmada confirmada por RH', actor); if (cc.accion !== 'suspension') mover(cc, 'CERRADO', 'Documento firmado y validado; queda en seguimiento de reincidencia', actor); }
          else if (d.resultado === 'negativa') { mover(cc, 'SE_NEGO_A_FIRMAR', 'Se negó a firmar ante dos testigos', actor); mover(cc, 'VALIDADO_RH', 'Negativa documentada con dos testigos, confirmada por RH', actor); if (cc.accion !== 'suspension') mover(cc, 'CERRADO', 'Documento firmado y validado; queda en seguimiento de reincidencia', actor); }
          else mover(cc, 'IMPUGNADO', d.nota || 'El trabajador impugna en la hoja', actor);
        } else if (d.accion === 'hoja_pedir_de_nuevo') {
          if (cc && cc.estado === 'FIRMA_RECIBIDA') mover(cc, 'ESPERANDO_FIRMA', 'RH pide la hoja de nuevo: ' + (d.motivo || 'otro'), actor);
        } else if ((d.nota || '').trim().length < 5) return { ok: false, error: 'MOTIVO_OBLIGATORIO' };
        LECT.splice(LECT.indexOf(l), 1); METRICA.decididas += 1; METRICA.aciertos += 1; METRICA.por_confirmar = LECT.length;
        return { ok: true, caso: cc ? datosCaso(cc) : null };
      }
      if (d.accion === 'reincidencia') return { ok: true, modo_sanciones: 'sin_suspension', personas: REINC, alertas: ALERTAS,
        disparadores: { individual: { ventana_dias: 90, meses_suspension: 2, actas_firmadas: 2, reincide_tras_acta: true }, global: { semanas_real: 8, reduccion_min_pct: 30, pct_plantilla_acta: 15 } } };
      if (d.accion === 'alerta_atender') {
        var al = ALERTAS.filter(function (x) { return x.id === Number(d.alerta_id); })[0];
        if (!al) return { ok: false, error: 'ALERTA_INEXISTENTE' };
        if ((d.motivo || '').trim().length < 5) return { ok: false, error: 'MOTIVO_OBLIGATORIO' };
        if (d.decision === 'posponer' && !(Number(d.semanas) >= 1 && Number(d.semanas) <= 26)) return { ok: false, error: 'SEMANAS_INVALIDAS' };
        al.estado = { posponer: 'pospuesta', descartar: 'descartada', cambiar: 'decidido_cambiar' }[d.decision] || al.estado;
        al.motivo = d.motivo; al.atendida_por = actor;
        if (d.decision === 'posponer') al.posponer_hasta = new Date(Date.now() + Number(d.semanas) * 7 * 86400000).toISOString().slice(0, 10);
        return { ok: true, modo_sanciones: 'sin_suspension' };
      }
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
