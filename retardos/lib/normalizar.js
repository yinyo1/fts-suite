/* retardos/lib/normalizar.js · Contrato con Odoo de Retardos v2 (#334)
 *
 * Toma lo que el Code node de `retardos/detectar` leyó por RPC y arma el
 * payload de `retardos.ingestar(p)`. Es también la PRUEBA DE CONTRATO: si Odoo
 * deja de mandar un campo que usamos, o lo manda con otra forma, esto truena
 * con CONTRATO_ROTO:<modelo>.<campo> en vez de seguir con datos vacíos.
 * Un vacío que se ve como "nadie llegó tarde" es exactamente como murió el
 * sistema anterior (CLAUDE.md §20 #11).
 *
 * JS puro, sin diagonales invertidas (se embebe en n8n).
 */
(function (raiz) {
  var CAMPOS = {
    'hr.attendance': ['id', 'employee_id', 'check_in', 'check_out', 'worked_hours', 'in_mode', 'out_mode',
                      'x_studio_horario_en_disputa', 'x_studio_incidencia_pendiente_id'],
    'hr.employee': ['id', 'name', 'job_title', 'company_id', 'active', 'x_studio_hora_entrada', 'work_email',
                    'private_email', 'parent_id', 'department_id', 'resource_calendar_id'],
    'resource.calendar.attendance': ['calendar_id', 'dayofweek', 'hour_from', 'hour_to', 'day_period']
  };

  function m2oId(v) {
    if (Array.isArray(v)) return v.length ? v[0] : null;
    if (v && typeof v === 'object') return v.id == null ? null : v.id;
    if (typeof v === 'number') return v;
    return null;
  }
  function m2oNombre(v) {
    if (Array.isArray(v)) return v.length > 1 ? v[1] : null;
    if (v && typeof v === 'object') return v.name || v.display_name || null;
    return null;
  }
  function roto(modelo, campo, detalle) {
    var e = new Error('CONTRATO_ROTO:' + modelo + '.' + campo + (detalle ? ' (' + detalle + ')' : ''));
    e.codigo = 'CONTRATO_ROTO';
    return e;
  }

  // Valida la forma de una lista de registros contra el contrato.
  function validar(modelo, filas) {
    if (!Array.isArray(filas)) throw roto(modelo, '*', 'no es lista');
    var req = CAMPOS[modelo];
    for (var i = 0; i < Math.min(filas.length, 50); i++) {
      for (var j = 0; j < req.length; j++) {
        if (!(req[j] in filas[i])) throw roto(modelo, req[j], 'ausente');
      }
    }
    if (modelo === 'hr.attendance') {
      for (var k = 0; k < filas.length; k++) {
        var f = filas[k];
        if (typeof f.check_in !== 'string' || f.check_in.length < 19) throw roto(modelo, 'check_in', 'formato');
        if (m2oId(f.employee_id) == null && f.employee_id !== false) throw roto(modelo, 'employee_id', 'forma');
        if (f.check_out !== false && f.check_out !== null && (typeof f.check_out !== 'string' || f.check_out.length < 19)) throw roto(modelo, 'check_out', 'formato');
        if (f.worked_hours !== false && f.worked_hours !== null && typeof f.worked_hours !== 'number') throw roto(modelo, 'worked_hours', 'tipo');
      }
    }
    if (modelo === 'hr.employee') {
      for (var h = 0; h < filas.length; h++) {
        var x = filas[h].x_studio_hora_entrada;
        if (x !== false && x !== null && typeof x !== 'number') throw roto(modelo, 'x_studio_hora_entrada', 'tipo');
      }
    }
    return true;
  }

  // Hora de entrada por calendario: la hora_from más temprana de lunes a viernes.
  function horasCalendario(filas) {
    var m = {};
    for (var i = 0; i < filas.length; i++) {
      var r = filas[i], cid = m2oId(r.calendar_id), dow = parseInt(r.dayofweek, 10);
      if (cid == null || isNaN(dow) || dow > 4) continue;
      if (m[cid] == null || r.hour_from < m[cid]) m[cid] = r.hour_from;
    }
    return m;
  }

  // Jornada del calendario: horas de presencia por semana sin renglones de comida, días (ISO, 1 = lunes) y si trae comida.
  // Odoo: dayofweek '0' = lunes. Un calendario de dos semanas (week_type) cuenta la mitad de cada renglón.
  function calendarios(filas) {
    var m = {};
    for (var i = 0; i < filas.length; i++) {
      var r = filas[i], cid = m2oId(r.calendar_id), dow = parseInt(r.dayofweek, 10);
      if (cid == null || isNaN(dow)) continue;
      var c = m[cid] || (m[cid] = { id: cid, nombre: m2oNombre(r.calendar_id), horas_semana: 0, dias: [], tiene_comida: false });
      if (r.day_period === 'lunch') { c.tiene_comida = true; continue; }
      var h = (typeof r.hour_to === 'number' && typeof r.hour_from === 'number') ? r.hour_to - r.hour_from : 0;
      var f = (r.week_type === '0' || r.week_type === '1') ? 0.5 : 1;
      c.horas_semana = Math.round((c.horas_semana + h * f) * 100) / 100;
      if (c.dias.indexOf(dow + 1) < 0) c.dias.push(dow + 1);
    }
    Object.keys(m).forEach(function (k) { m[k].dias.sort(); });
    return m;
  }

  // Estados terminales del almacén de incidencias (CLAUDE.md §3, esEstadoTerminal).
  var TERMINAL = ['aprobada_tal_cual', 'aprobada_con_ajuste', 'aprobada_por_direccion', 'rechazada_por_rh', 'rechazada_por_direccion'];

  function correosDe(e) {
    var out = [], campos = ['work_email', 'private_email'];
    for (var i = 0; i < campos.length; i++) {
      var v = e[campos[i]];
      if (typeof v === 'string' && v.indexOf('@') > 0) out.push({ campo: campos[i], email: v.trim().toLowerCase() });
    }
    return out;
  }

  // Odoo entrega datetimes en UTC sin sufijo Z (CLAUDE.md §11 #1).
  function aISO(utc) { return String(utc).replace(' ', 'T') + 'Z'; }

  function normalizar(entrada) {
    var att = entrada.att || [], emp = entrada.emp || [], cal = entrada.cal || [];
    validar('hr.attendance', att);
    validar('hr.employee', emp);
    validar('resource.calendar.attendance', cal);
    var hc = horasCalendario(cal), cals = calendarios(cal);
    var empleados = [];
    for (var i = 0; i < emp.length; i++) {
      var e = emp[i];
      empleados.push({
        employee_id: e.id, nombre: e.name || null, puesto: e.job_title || null,
        company_id: m2oId(e.company_id), activo: e.active !== false,
        hora_entrada: typeof e.x_studio_hora_entrada === 'number' ? e.x_studio_hora_entrada : null,
        hora_calendario: hc[m2oId(e.resource_calendar_id)] == null ? null : hc[m2oId(e.resource_calendar_id)],
        email: e.work_email || null, parent_id: m2oId(e.parent_id), departamento: m2oNombre(e.department_id),
        // Todos los correos de la ficha, con el campo de donde salen. La resolución (empresa primero,
        // si no personal, u opción ambos) vive en Postgres: retardos.destinatarios().
        correos: correosDe(e),
        calendario: cals[m2oId(e.resource_calendar_id)] || (m2oId(e.resource_calendar_id) == null ? null
          : { id: m2oId(e.resource_calendar_id), nombre: m2oNombre(e.resource_calendar_id), horas_semana: null, dias: null, tiene_comida: null })
      });
    }
    // Incidencias abiertas (olvidos, auto-cierre) por attendance: la semana de jornada va a revisión.
    var abiertas = {};
    var incs0 = (entrada.incidencias && entrada.incidencias.incidencias) || [];
    for (var q0 = 0; q0 < incs0.length; q0++) {
      var i0 = incs0[q0];
      if (TERMINAL.indexOf(String(i0.status || '')) >= 0) continue;
      var ids0 = [i0.attendance_id, i0.attendance_id_nuevo];
      for (var z0 = 0; z0 < ids0.length; z0++) if (typeof ids0[z0] === 'number') abiertas[ids0[z0]] = true;
    }
    var checadas = [];
    for (var j = 0; j < att.length; j++) {
      var a = att[j], eid = m2oId(a.employee_id);
      if (eid == null) continue;
      checadas.push({
        attendance_id: a.id, employee_id: eid, check_in_utc: aISO(a.check_in),
        check_out_utc: typeof a.check_out === 'string' ? aISO(a.check_out) : null,
        worked_hours: typeof a.worked_hours === 'number' ? a.worked_hours : null,
        in_mode: a.in_mode || null, out_mode: a.out_mode || null,
        disputa: a.x_studio_horario_en_disputa === true,
        incidencia_pendiente: a.x_studio_incidencia_pendiente_id || '',
        incidencia_abierta: abiertas[a.id] === true
      });
    }
    // Olvidos de entrada del almacén de incidencias (cualquier estado que no sea rechazo).
    var olv = [];
    var incs = (entrada.incidencias && entrada.incidencias.incidencias) || [];
    for (var k = 0; k < incs.length; k++) {
      var inc = incs[k];
      if (inc.tipo !== 'olvido_entrada') continue;
      if (String(inc.status || '').indexOf('rechazada') === 0) continue;
      var ids = [inc.attendance_id, inc.attendance_id_nuevo];
      for (var q = 0; q < ids.length; q++) if (typeof ids[q] === 'number') olv.push(ids[q]);
    }
    return {
      workflow: entrada.workflow || 'retardos/detectar',
      desde: entrada.desde, hasta: entrada.hasta,
      empleados: empleados, checadas: checadas, olvido_entrada_att: olv
    };
  }

  var api = { normalizar: normalizar, validar: validar, CAMPOS: CAMPOS, m2oId: m2oId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.RetardosNormalizar = api;
})(typeof window !== 'undefined' ? window : this);
