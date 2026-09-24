// tests/kiosko-blindaje/sistema.js
//
// Modelo del sistema de asistencia tal como funciona HOY, con un interruptor por
// bloque del plan de blindaje (B1..B10). Con todos los interruptores en false el
// modelo replica producción; cada interruptor encendido modela el diseño nuevo de
// ese bloque. Nada de aquí toca producción: todo vive en memoria.
//
// Fuente de cada comportamiento "actual" (HOY):
//   kiosk/checkin            a7mEjjdwIzzvomXs  (nodos citados en cada función)
//   kiosk/estado-empleado    U13fngg2dTKgDQ8Y  (nodo "Code - Clasificar estado")
//   incidencias/resolver     Oc2ceMHX2O0L0y2X  (nodo "Code - Aplicar accion")
//   crear-olvido-checkout    IRtG38Aknb5SW15h
//   rh/watchdog/sin-checkin  Q19zFeJQytSfBjdb  (nodo "Code - MAIN")
//   frontend                 operaciones/kiosk/js/kiosk.js, operaciones/kiosk/js/odoo.js

'use strict';

const { OdooModelo, cst, fmtCst, H } = require('./odoo-modelo');

const MIN = 60 * 1000;
const DIA = 24 * H;
const BLOQUES = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10'];

function disenoActual() { const d = {}; BLOQUES.forEach(b => { d[b] = false; }); return d; }
function disenoNuevo()  { const d = {}; BLOQUES.forEach(b => { d[b] = true;  }); return d; }

// Día CST (medianoche UTC del día) de un instante.
function diaCst(ms) { const d = new Date(ms - 6 * H); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
// HH:MM en el día CST de 'base' -> ms UTC.
function horaEnDia(base, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return diaCst(base) + (h + 6) * H + m * MIN;
}
function hhmmDe(ms) { const d = new Date(ms - 6 * H); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); }

class Sistema {
  constructor(diseno) {
    this.d = Object.assign(disenoActual(), diseno || {});
    this.odoo = new OdooModelo();
    this.incidencias = [];
    this.bitacora = [];          // intentos fallidos registrados POR EL SISTEMA (B1)
    this.alertas = [];           // alertas al supervisor
    this.intentos = [];          // verdad del modelo: todo intento del empleado y si logró su efecto
    this.ejecuciones = [];       // ejecuciones de servidor (como las de n8n)
    this.reportesWatchdog = [];
    this.fallas = { redCaida: 0, lecturaOdoo: 0, lento: 0 };
    this.saturadoHasta = 0;
    this.sigInc = 1;
    this.sigIntento = 1;
    this.procesados = new Map();  // B1: intento_id -> respuesta (idempotencia de reintentos)
  }

  clonar() {
    const s = new Sistema(this.d);
    s.odoo = this.odoo.clonar();
    s.incidencias = this.incidencias.map(i => JSON.parse(JSON.stringify(i)));
    s.bitacora = this.bitacora.slice(); s.alertas = this.alertas.slice();
    s.intentos = this.intentos.slice(); s.ejecuciones = this.ejecuciones.slice();
    s.reportesWatchdog = this.reportesWatchdog.slice();
    s.fallas = Object.assign({}, this.fallas); s.saturadoHasta = this.saturadoHasta; s.sigInc = this.sigInc;
    s.sigIntento = this.sigIntento; s.procesados = new Map(this.procesados);
    return s;
  }

  // ─── umbrales ────────────────────────────────────────────────────────────
  // HOY: estado-empleado usa 14/24 h y ventana 15 d ("Code - Clasificar estado",
  // UMBRAL_ZONA_GRIS=14, UMBRAL_ERROR_CRITICO=24; "Code - Preparar parámetros",
  // hace15Dias). kiosk/checkin usa 6/16 h y ventana 15 d ("Code - Analizar
  // candados"; "Code - Preparar parámetros").
  // B6: un solo juego para los dos y búsqueda de abiertos sin ventana.
  umbralesEstado()  { return this.d.B6 ? { zg: 14, ec: 16, ventana: null } : { zg: 14, ec: 24, ventana: 15 * DIA }; }
  umbralesCheckin() { return this.d.B6 ? { bloqueo: 14, zg: 16, ventana: null } : { bloqueo: 6, zg: 16, ventana: 15 * DIA }; }

  abiertos(emp, now, ventana) {
    return this.odoo.del(emp)
      .filter(r => r.check_out == null && (ventana == null || r.check_in >= now - ventana))
      .sort((a, b) => b.check_in - a.check_in);
  }

  // ─── kiosk/estado-empleado ───────────────────────────────────────────────
  estado(emp, now) {
    const u = this.umbralesEstado();
    const ab = this.abiertos(emp, now, u.ventana)[0] || null;
    let estado = 'sin_registro', horas = 0;
    if (ab) {
      horas = (now - ab.check_in) / H;
      estado = horas < u.zg ? 'activo' : (horas < u.ec ? 'zona_gris' : 'error_critico');
    }
    return { estado, horas, abierto: ab ? Object.assign({}, ab) : null, botones: this.botones(estado, ab, now) };
  }

  // renderEstadoBotones (kiosk.js:1801-1864). HOY:
  //   sin_registro: Registrar entrada (1812) + "Llegué pero olvidé checar entrada" (1835)
  //   activo:       Checar salida (1815) + "Salí pero olvidé checar salida" (1840)
  //   zona_gris:    "Seguí en turno" (1818) + "Olvidé checar salida" (1851)
  //   error_critico: "Resolver ahora" (1821), sin secundario (1853-1855)
  botones(estado, ab, now) {
    const b = [];
    if (estado === 'sin_registro') b.push('entrada', 'olvide_entrada');
    if (estado === 'activo') {
      b.push('salida', 'olvide_salida');
      if (this.d.B5 && ab && diaCst(ab.check_in) === diaCst(now)) b.push('corregir_entrada');
    }
    if (estado === 'zona_gris') b.push('segui_en_turno', 'olvide_salida');
    if (estado === 'error_critico') {
      b.push('resolver');
      if (this.d.B7) b.push('olvide_salida', 'emergencia');
    }
    return b;
  }

  // ─── frontend: acción del empleado ───────────────────────────────────────
  // Devuelve { pantalla: 'exito'|'error', logrado, validacion, detalle }.
  accion(emp, boton, now, args) {
    args = args || {};
    const est = this.estado(emp, now);
    if (!est.botones.includes(boton)) throw new Error('Botón no disponible en ' + est.estado + ': ' + boton);
    let r;
    switch (boton) {
      case 'entrada':        r = this.postCheckin(emp, 'entrada', now, {}); break;
      case 'resolver':       r = this.postCheckin(emp, 'entrada', now, { hora_real: this.d.B5 ? args.hora_real : undefined }); break;
      case 'salida':
      case 'segui_en_turno': r = this.postCheckin(emp, 'salida', now, { so: args.so }); break;
      case 'olvide_entrada': r = this.olvideEntrada(emp, now, args); break;
      case 'olvide_salida':  r = this.olvideSalida(emp, now, args, est); break;
      case 'corregir_entrada': r = this.corregirEntrada(emp, now, args, est); break;
      case 'emergencia':     r = this.emergencia(emp, now, est); break;
      default: throw new Error('botón desconocido ' + boton);
    }
    this.intentos.push({ emp, t: now, boton, logrado: r.logrado, pantalla: r.pantalla, validacion: !!r.validacion });
    return Object.assign({ boton, estadoAntes: est.estado }, r);
  }

  // n8nFetch (odoo.js:15-40): timeout 10 s (odoo.js:24), 2 reintentos (odoo.js:17),
  // `if(!res.ok) throw` (odoo.js:32). registrarAsistencia (kiosk.js:1080-1236)
  // pinta la confirmación ANTES del POST (kiosk.js:1127); solo muestra error si
  // `accion_valida === false` (kiosk.js:1191); en el catch solo pone checkinOk=false
  // (kiosk.js:1201) y sigue a autoReturn (kiosk.js:1235).
  // Un 200 cuyo cuerpo no es JSON hace fallar `return res.json()` (odoo.js:33), que
  // no está esperado dentro del try: el rechazo sale sin reintento al catch de
  // registrarAsistencia. En ambos casos la pantalla que queda es la de éxito.
  postCheckin(emp, tipo, now, opts) {
    const antes = this.odoo.clonar();
    let t = now, resp = null, llego = false;
    const intento = 'k' + (this.sigIntento++);   // B1: un id por intento, igual en los reintentos
    for (let i = 0; i < 3; i++) {
      if (this.fallas.redCaida > 0) { this.fallas.redCaida--; t += 12 * 1000; continue; }
      if (t < this.saturadoHasta) { t += 12 * 1000; continue; }  // n8n saturado: no ejecuta
      if (this.d.B1 && this.procesados.has(intento)) { resp = { latencia: 300, body: this.procesados.get(intento) }; llego = true; break; }
      const s = this.checkinServidor(emp, tipo, t, opts);
      if (this.d.B1 && s.body) this.procesados.set(intento, s.body);
      if (s.latencia > 10000) { t += 12 * 1000; continue; }    // cliente abortó: HTTP 499
      resp = s; llego = true; break;
    }
    const logrado = this.efectoLogrado(antes, emp, tipo);
    let pantalla;
    if (!llego && this.d.B1 && this.procesados.has(intento)) {
      // B1: tras agotar el tiempo, el kiosko CONSULTA el intento por su id (kiosk/intento)
      // antes de decidir. Si el servidor sí lo procesó, esa es la respuesta.
      resp = { latencia: 300, body: this.procesados.get(intento) }; llego = true;
    }
    if (!llego) {
      pantalla = this.d.B1 ? 'error' : 'exito';
      if (this.d.B1) this.registrarFalla(emp, now, 'SIN_RESPUESTA', 'cliente');
    } else if (resp.body === null) {
      pantalla = this.d.B1 ? 'error' : 'exito';    // con B1 ya no hay cuerpos nulos
    } else if (resp.body.accion_valida === false) {
      pantalla = 'error';
    } else {
      pantalla = this.d.B1 ? ((resp.body.success === true && resp.body.attendance_id) ? 'exito' : 'error') : 'exito';
    }
    const ult = this.ejecuciones[this.ejecuciones.length - 1];
    return { pantalla, logrado, respuesta: resp ? resp.body : null, http: llego ? 200 : 499,
             detalleOdoo: (llego && resp.body === null && ult) ? ult.error : null };
  }

  efectoLogrado(antes, emp, tipo) {
    const a = antes.del(emp), d = this.odoo.del(emp);
    if (tipo === 'entrada') return d.filter(r => r.check_out == null).some(r => !a.find(x => x.id === r.id));
    const abiertosAntes = a.filter(r => r.check_out == null);
    return abiertosAntes.some(r => { const n = this.odoo.leer(r.id); return n && n.check_out != null; });
  }

  registrarFalla(emp, t, codigo, origen) {
    this.bitacora.push({ emp, t, codigo, origen });
    // Alerta con límite de frecuencia: una por empleado por hora.
    const ultima = this.alertas.filter(a => a.emp === emp).slice(-1)[0];
    if (!ultima || t - ultima.t > H) this.alertas.push({ emp, t, codigo });
  }

  // ─── kiosk/checkin (a7mEjjdwIzzvomXs) ────────────────────────────────────
  checkinServidor(emp, tipo, now, opts) {
    const ej = { emp, tipo, t: now, nodos: [], error: null, escribioTrasLecturaFallida: false };
    this.ejecuciones.push(ej);
    let latencia = 2500;
    if (this.fallas.lento > 0) { this.fallas.lento--; latencia = 13000; }
    const u = this.umbralesCheckin();

    // "Odoo - Buscar pendientes": onError=continueRegularOutput, retryOnFail=false.
    let lecturaFallo = false, abiertas;
    const leer = () => {
      if (this.fallas.lecturaOdoo > 0) { this.fallas.lecturaOdoo--; return null; }
      return this.abiertos(emp, now, u.ventana);
    };
    abiertas = leer();
    if (abiertas === null) {
      lecturaFallo = true; latencia = 135000; this.saturadoHasta = now + 135000;
      ej.nodos.push('Buscar pendientes: ECONNRESET');
      if (this.d.B2) {
        for (let k = 0; k < 2 && abiertas === null; k++) abiertas = leer();
        if (abiertas === null) {
          ej.error = 'ODOO_NO_RESPONDE';
          this.registrarFalla(emp, now, 'ODOO_NO_RESPONDE', 'servidor');
          return { latencia, body: { success: false, accion_valida: false, codigo_error: 'ODOO_NO_RESPONDE',
                   error_msg: 'No pude verificar tu registro en Odoo. No se guardó nada. Intenta de nuevo.' } };
        }
        lecturaFallo = false;
      } else {
        abiertas = [];   // el item de parámetros no trae `id` y el filtro lo descarta: 0 abiertas
      }
    }

    const falla = (err) => {
      ej.error = err.message;
      if (this.d.B1) {
        this.registrarFalla(emp, now, 'ODOO_RECHAZO', 'servidor');
        return { latencia, body: { success: false, accion_valida: false, codigo_error: 'ODOO_RECHAZO', error_msg: err.message } };
      }
      return { latencia, body: null };   // el flujo truena sin Respond: HTTP 200 sin JSON
    };
    const candado = (codigo, msg) => ({ latencia, body: { success: false, accion_valida: false, codigo_error: codigo, error_msg: msg } });

    if (tipo === 'entrada') {
      if (abiertas.length === 0) {
        try {
          if (lecturaFallo) ej.escribioTrasLecturaFallida = true;
          const id = this.odoo.crear({ emp, check_in: now });
          return { latencia, body: { success: true, accion_valida: true, attendance_id: id } };
        } catch (e) { return falla(e); }
      }
      const p = abiertas[0];
      const h = (now - p.check_in) / H;
      if (h < u.bloqueo) return candado('YA_TIENES_ENTRADA', 'Ya tienes una entrada registrada');
      if (h < u.zg) return candado('ZONA_GRIS', 'ZONA_GRIS:' + h.toFixed(1));
      // Auto-rescate F1.5: cierra a 9.6 h con TAG y crea entrada nueva con la hora del clic.
      const incId = 'INC-AUTO-CIERRE-' + emp + '-' + (this.sigInc++);
      const inc = { id: incId, tipo: 'auto_cierre_pendiente', emp, att: p.id, status: 'pendiente_rh',
                    tag: true, base: p.check_in, creada: now };
      if (this.d.B7) this.incidencias.push(inc);   // B7: persistir ANTES de escribir en Odoo
      try { this.odoo.escribir(p.id, { check_out: p.check_in + 9.6 * H, disputa: true }); }
      catch (e) { if (this.d.B7) inc.nota = 'cierre rechazado por Odoo: ' + e.message; return falla(e); }
      let id;
      try { id = this.odoo.crear({ emp, check_in: now }); } catch (e) { return falla(e); }
      if (!this.d.B7) this.incidencias.push(inc);   // HOY el PUT va después de las dos escrituras
      if (this.d.B5 && opts.hora_real) {
        this.incidencias.push({ id: 'INC-OLV-' + emp + '-' + (this.sigInc++), tipo: 'olvido_entrada', emp, att: id,
          status: 'pendiente_supervisor', declarada: opts.hora_real, base: now, tag: true, creada: now });
        this.odoo.escribir(id, { disputa: true });
      }
      return { latencia, body: { success: true, accion_valida: true, attendance_id: id, es_estimado: true } };
    }

    // tipo salida
    if (abiertas.length === 0) return candado('NO_HAY_ENTRADA', 'No tienes ninguna entrada abierta');
    const p = abiertas[0];
    const h = (now - p.check_in) / H;
    if (this.d.B6 && h >= u.zg) return candado('DECLARA_SALIDA', 'Llevas ' + h.toFixed(1) + ' h. Declara tu hora real de salida.');
    try {
      if (lecturaFallo) ej.escribioTrasLecturaFallida = true;
      this.odoo.escribir(p.id, { check_out: now, so: opts.so || null });
      return { latencia, body: { success: true, accion_valida: true, attendance_id: p.id } };
    } catch (e) { return falla(e); }
  }

  // "Llegué pero olvidé checar entrada" (kiosk.js:2165-2250): checkin NORMAL con la
  // hora actual y, si el checkin no cayó en el catch, incidencia paralela
  // (crear-olvido-entrada JLiuczUd61xVNp36) con la hora declarada.
  olvideEntrada(emp, now, args) {
    if (now - args.hora > 12 * H || args.hora > now + MIN) return { pantalla: 'error', logrado: false, validacion: true };
    const r = this.postCheckin(emp, 'entrada', now, {});
    if (r.respuesta && r.respuesta.success) {
      this.incidencias.push({ id: 'INC-OLV-' + emp + '-' + (this.sigInc++), tipo: 'olvido_entrada', emp,
        att: r.respuesta.attendance_id, status: 'pendiente_supervisor', declarada: args.hora, base: now, tag: true, creada: now });
    }
    return r;
  }

  // confirmarOlvideCheckout (kiosk.js:1962-2090) + crear-olvido-checkout (IRtG38Aknb5SW15h).
  // HOY: candidato = HH:MM tecleado en el día CST del check_in, +1 día si queda antes
  // (kiosk.js:2022-2024); rechaza futuro, más de 12 h atrás (kiosk.js:2037) y más de 24 h
  // de turno. Los errores de este camino SÍ se ven (alert en el catch).
  olvideSalida(emp, now, args, est) {
    const ab = est.abierto;
    if (!ab) return { pantalla: 'error', logrado: false, validacion: true };
    let cand = horaEnDia(ab.check_in, args.tecleada);
    if (cand < ab.check_in) cand += DIA;
    let corregido = false;
    if (this.d.B9 && cand - ab.check_in > 16 * H && cand - 12 * H > ab.check_in) {
      // Guarda AM/PM: "¿Quisiste decir HH+12?". El empleado confirma su hora real.
      cand -= 12 * H; corregido = true;
    }
    if (cand > now + MIN) return { pantalla: 'error', logrado: false, validacion: true };
    const limiteAtras = (this.d.B7 || this.d.B6) ? null : 12 * H;
    if (limiteAtras != null && now - cand > limiteAtras) return { pantalla: 'error', logrado: false, validacion: true, detalle: 'mas de 12 h' };
    if (cand - ab.check_in > 24 * H) return { pantalla: 'error', logrado: false, validacion: true };
    try {
      this.odoo.escribir(ab.id, { check_out: cand, disputa: true });
    } catch (e) {
      if (this.d.B1) this.registrarFalla(emp, now, 'ODOO_RECHAZO', 'servidor');
      return { pantalla: 'error', logrado: false, detalle: e.message };
    }
    this.incidencias.push({ id: 'INC-OLV-CHK-' + emp + '-' + (this.sigInc++), tipo: 'olvido_checkout', emp, att: ab.id,
      status: 'pendiente_supervisor', declarada: cand, base: ab.check_in, tag: true, creada: now });
    return { pantalla: 'exito', logrado: true, corregidoAmPm: corregido };
  }

  // B5: "Corregir mi hora de entrada" sobre el registro abierto. No crea registro nuevo:
  // abre una incidencia olvido_entrada sobre el MISMO attendance.
  corregirEntrada(emp, now, args, est) {
    const ab = est.abierto;
    this.incidencias.push({ id: 'INC-OLV-' + emp + '-' + (this.sigInc++), tipo: 'olvido_entrada', emp, att: ab.id,
      status: 'pendiente_supervisor', declarada: args.hora, base: ab.check_in, tag: true, creada: now });
    this.odoo.escribir(ab.id, { disputa: true });
    return { pantalla: 'exito', logrado: true };
  }

  // B7: salida de emergencia. Persiste la incidencia a RH y supervisor antes de todo.
  emergencia(emp, now, est) {
    this.incidencias.push({ id: 'INC-BLOQUEO-' + emp + '-' + (this.sigInc++), tipo: 'bloqueo', emp,
      att: est.abierto ? est.abierto.id : null, status: 'pendiente_rh', creada: now });
    this.alertas.push({ emp, t: now, codigo: 'BLOQUEO' });
    return { pantalla: 'exito', logrado: true };
  }

  // ─── incidencias/resolver (Oc2ceMHX2O0L0y2X) ─────────────────────────────
  // HOY ("Code - Aplicar accion"): aplicaHora solo si accion ∈ {ajustar, rechazar} Y
  // tipo ∈ {olvido_entrada, olvido_checkout}. auto_cierre_pendiente nunca escribe la
  // hora; "aprobar" nunca la escribe. La respuesta es success:true en ambos casos y el
  // panel dice "✓ Accion ... aplicada" (panel-incidencias/index.html:1108).
  // Devuelve { panel: 'aplicada'|'no_aplicada'|'error', horaPedida, campo, att }.
  resolver(incId, accion, hhmm, now, opts) {
    opts = opts || {};
    const inc = this.incidencias.find(i => i.id === incId);
    if (!inc) throw new Error('incidencia inexistente ' + incId);
    const tipo = inc.tipo;
    let campo = null, valor = null;
    if (tipo === 'olvido_entrada') {
      campo = 'check_in';
      if (accion === 'ajustar') valor = horaEnDia(inc.base, hhmm);
      else if (accion === 'aprobar' && this.d.B4) valor = inc.declarada;
    } else if (tipo === 'olvido_checkout') {
      campo = 'check_out';
      if (accion === 'ajustar') { valor = horaEnDia(inc.base, hhmm); if (valor < inc.base) valor += DIA; }
    } else if (tipo === 'auto_cierre_pendiente') {
      campo = 'check_out';
      if (accion === 'ajustar' && this.d.B4) { valor = horaEnDia(inc.base, hhmm); if (valor < inc.base) valor += DIA; }
    }
    const pidioHora = (accion === 'ajustar') || (accion === 'aprobar' && !!hhmm);
    const res = { panel: 'aplicada', horaPedida: pidioHora ? hhmm : null, campo, att: inc.att, valor };
    if (valor != null) {
      if (this.d.B3) {
        const choque = this.traslapes(inc.emp, inc.att, campo, valor, now);
        if (choque.length) {
          const micros = choque.every(r => r.check_out != null && r.check_out - r.check_in < 5 * MIN);
          if (opts.absorber && micros) choque.forEach(r => this.odoo.borrar(r.id));
          else { res.panel = 'no_aplicada'; res.detalle = 'traslapa con ' + choque.map(r => r.id).join(', '); return res; }
        }
      }
      try { this.odoo.escribir(inc.att, { [campo]: valor }); }
      catch (e) { res.panel = 'error'; res.detalle = e.message; return res; }
    } else if (pidioHora && this.d.B4) {
      res.panel = 'no_aplicada';   // B4: si no se escribe, la pantalla lo dice
    }
    inc.status = accion === 'ajustar' ? 'aprobada_con_ajuste' : 'aprobada_tal_cual';
    if (inc.tag && inc.att) { const r = this.odoo.leer(inc.att); if (r) this.odoo.escribir(inc.att, { disputa: false }); inc.tag = false; }
    return res;
  }

  // Intervalos que chocarían con [check_in, check_out) del registro att tras el cambio.
  traslapes(emp, att, campo, valor, now) {
    const r = Object.assign({}, this.odoo.leer(att), { [campo]: valor });
    const fin = r.check_out != null ? r.check_out : Infinity;
    return this.odoo.del(emp).filter(o => o.id !== att &&
      o.check_in < fin && (o.check_out == null ? Infinity : o.check_out) > r.check_in);
  }

  // ─── B8: "Reparar registro" (RH) ─────────────────────────────────────────
  reparar(att, cambios, now) {
    if (!this.d.B8) throw new Error('NO_DISPONIBLE: la suite no tiene herramienta de reparación para RH');
    const r = this.odoo.leer(att);
    if (cambios.borrar) { this.odoo.borrar(att); return { panel: 'aplicada' }; }
    const campos = Object.keys(cambios);
    for (const c of campos) {
      const choque = this.traslapes(r.emp, att, c, cambios[c], now);
      if (choque.length) return { panel: 'no_aplicada', detalle: 'traslapa con ' + choque.map(x => x.id).join(', ') };
    }
    try { this.odoo.escribir(att, Object.assign({ disputa: true }, cambios)); }
    catch (e) { return { panel: 'error', detalle: e.message }; }
    return { panel: 'aplicada' };
  }

  // ─── rh/watchdog/sin-checkin (Q19zFeJQytSfBjdb, "Code - MAIN") ───────────
  // HOY: último check_in por empleado; alerta si ≥ 5 días hábiles sin check_in. No sabe
  // de intentos fallidos. B10: cuenta la bitácora; quien intentó y falló sale como
  // "bloqueado", no como "ausente"; y marca a quien tenga ≥ 2 fallas en 24 h.
  watchdog(empleados, now) {
    const rep = [];
    for (const emp of empleados) {
      const ultimo = Math.max(0, ...this.odoo.del(emp).map(r => r.check_in));
      const habiles = diasHabiles(ultimo, now);
      const fallas24 = this.bitacora.filter(b => b.emp === emp && now - b.t < DIA).length;
      if (this.d.B10) {
        const fallasVentana = this.bitacora.filter(b => b.emp === emp && b.t > ultimo).length;
        if (fallas24 >= 2 || (habiles >= 5 && fallasVentana > 0)) rep.push({ emp, tipo: 'bloqueado', t: now });
        else if (habiles >= 5) rep.push({ emp, tipo: 'ausente', t: now });
      } else if (habiles >= 5) rep.push({ emp, tipo: 'ausente', t: now });
    }
    this.reportesWatchdog.push(...rep);
    return rep;
  }
}

function diasHabiles(desde, hasta) {
  let n = 0; let c = diaCst(desde) + DIA; const fin = diaCst(hasta);
  while (c <= fin) { const w = new Date(c).getUTCDay(); if (w !== 0 && w !== 6) n++; c += DIA; }
  return n;
}

module.exports = { Sistema, disenoActual, disenoNuevo, BLOQUES, cst, fmtCst, horaEnDia, hhmmDe, diaCst, H, MIN, DIA };
