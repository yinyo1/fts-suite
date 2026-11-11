// ====================================================
// VALIDAR EMPLEADO + PIN EN EL SERVIDOR (fts-suite#486, 11-nov-2026)
// ----------------------------------------------------
// Antes: «sin PIN — frontend ya validó». El PIN de todo el roster viajaba al
// navegador en kiosk/empleados y el kiosko comparaba ahí.
// Ahora: si el body trae `pin`, se compara AQUÍ contra hr.employee.pin.
//   - MODO (ver PIN_MODO abajo):
//       'tolerante' → sin pin, sigue como antes (se cuenta como sin_pin).
//       'estricto'  → sin pin, se rechaza con PIN_REQUERIDO.
//   - Límite de intentos en staticData: 5 fallos por empleado / 15 min y
//     20 fallos por dispositivo / 15 min → bloqueo de 15 min.
//   - `tipo: 'verificar_pin'` → responde antes de cualquier escritura (un servidor
//     viejo lo rechaza en Preparar parámetros: nunca escribe).
// El PIN real NUNCA sale de este nodo: se borra del objeto antes de devolver
// y las dos respuestas del workflow son listas blancas.
// Falla cerrado: si algo truena con pin presente, se rechaza. Sin pin (modo
// tolerante) sigue el camino de siempre.
// ====================================================
const PIN_MODO = 'tolerante';           // 'tolerante' | 'estricto'
const MAX_FALLOS_EMPLEADO = 5;
const MAX_FALLOS_DISPOSITIVO = 20;
const VENTANA_MS = 15 * 60 * 1000;
const BLOQUEO_MS = 15 * 60 * 1000;

const params = $('Code - Preparar parámetros').item.json;
const empleados = $input.all().map(item => item.json);

function rechazo(codigo, mensaje, extra) {
  return [{ json: Object.assign({}, params, { _error: true, codigo_error: codigo, mensaje: mensaje, error_msg: mensaje }, extra || {}) }];
}

// ── Métricas (fuente de la alarma del correo diario): solo números, antes de todo ──
if (params.tipo === 'metricas_pin') {
  let m = {};
  try { const s = $getWorkflowStaticData('global'); m = (s && s.pin_metricas) || {}; } catch (e) { m = {}; }
  return rechazo('PIN_METRICAS', 'Contadores del PIN por día (CST).', { pin_metricas: JSON.parse(JSON.stringify(m)) });
}

// ── Lo que ya hacía este nodo (sin cambios) ──
if (empleados.length === 0 || !empleados[0].id) {
  return rechazo('EMPLEADO_NO_EXISTE', 'Empleado no encontrado en el sistema (id: ' + params.empleado_id + ')');
}
const empleado = Object.assign({}, empleados[0]);
const pinOdoo = (empleado.pin === false || empleado.pin == null) ? '' : String(empleado.pin);
delete empleado.pin;                       // el PIN real no viaja río abajo

if (empleado.active !== true) {
  return rechazo('EMPLEADO_INACTIVO', 'Empleado no activo');
}

// ── PIN ──
let body = {};
let headers = {};
try {
  const wh = $('Webhook').first().json;
  body = (wh && wh.body) || {};
  headers = (wh && wh.headers) || {};
} catch (e) { body = {}; }

const pinVino = body.pin !== undefined && body.pin !== null && String(body.pin) !== '';
const soloVerificar = params.tipo === 'verificar_pin' || body.solo_verificar_pin === true;

// Contadores (fuente de la alarma). Fecha en CST (UTC-6).
let sd = null;
try { sd = $getWorkflowStaticData('global'); } catch (e) { sd = null; }
function contar(clave) {
  try {
    if (!sd) return;
    const dia = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
    sd.pin_metricas = sd.pin_metricas || {};
    const m = sd.pin_metricas[dia] = sd.pin_metricas[dia] || {};
    m[clave] = (m[clave] || 0) + 1;
    const dias = Object.keys(sd.pin_metricas).sort();
    while (dias.length > 35) delete sd.pin_metricas[dias.shift()];
  } catch (e) { /* un contador nunca tumba una checada */ }
}

if (!pinVino) {
  if (soloVerificar) return rechazo('PIN_REQUERIDO', 'Teclea tu PIN.');
  contar('sin_pin');
  if (PIN_MODO === 'estricto') {
    return rechazo('PIN_REQUERIDO', 'Actualiza el kiosko (recarga la página) y vuelve a intentar.');
  }
  return [{ json: Object.assign({}, params, { empleado_nombre: params.empleado_nombre || empleado.name, odoo_employee_data: empleado, _valido: true, pin_verificado: false }) }];
}

try {
  contar('con_pin');
  const ahora = Date.now();
  sd.pin_intentos = sd.pin_intentos || {};
  const tabla = sd.pin_intentos;
  // limpieza de llaves viejas
  for (const k of Object.keys(tabla)) {
    const r = tabla[k];
    if (!r || ((r.hasta || 0) < ahora && (r.desde || 0) + VENTANA_MS < ahora)) delete tabla[k];
  }
  const ip = String(headers['x-forwarded-for'] || headers['x-real-ip'] || '').split(',')[0].trim();
  const disp = String(body.dispositivo_id || '').slice(0, 64);
  const kEmp = 'e:' + params.empleado_id;
  const kDis = disp ? 'd:' + disp : (ip ? 'ip:' + ip : 'd:?');

  function bloqueadoHasta(k) { const r = tabla[k]; return (r && r.hasta && r.hasta > ahora) ? r.hasta : 0; }
  const bq = Math.max(bloqueadoHasta(kEmp), bloqueadoHasta(kDis));
  if (bq) {
    contar('bloqueado');
    const min = Math.max(1, Math.ceil((bq - ahora) / 60000));
    return rechazo('PIN_BLOQUEADO', 'Demasiados intentos. Espera ' + min + ' min o avisa a tu supervisor.', { minutos_bloqueo: min });
  }

  function fallo(k, max) {
    let r = tabla[k];
    if (!r || (r.desde || 0) + VENTANA_MS < ahora) r = { n: 0, desde: ahora };
    r.n += 1;
    if (r.n >= max) { r.hasta = ahora + BLOQUEO_MS; r.n = 0; r.desde = ahora; }
    tabla[k] = r;
    return r;
  }

  if (!pinOdoo) {
    contar('sin_pin_odoo');
    fallo(kDis, MAX_FALLOS_DISPOSITIVO);
    return rechazo('PIN_NO_CONFIGURADO', 'No tienes PIN configurado. Avisa a RH.');
  }

  // comparación de longitud constante
  const a = String(body.pin), b = pinOdoo;
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);

  if (dif !== 0) {
    contar('malo');
    const re = fallo(kEmp, MAX_FALLOS_EMPLEADO);
    fallo(kDis, MAX_FALLOS_DISPOSITIVO);
    if (re.hasta && re.hasta > ahora) {
      contar('bloqueado');
      return rechazo('PIN_BLOQUEADO', 'Demasiados intentos. Espera ' + Math.ceil(BLOQUEO_MS / 60000) + ' min o avisa a tu supervisor.', { minutos_bloqueo: Math.ceil(BLOQUEO_MS / 60000) });
    }
    return rechazo('PIN_INCORRECTO', 'PIN incorrecto. Intenta de nuevo.', { intentos_restantes: Math.max(0, MAX_FALLOS_EMPLEADO - re.n) });
  }

  // acierto
  contar('ok');
  delete tabla[kEmp];
  if (soloVerificar) {
    return rechazo('PIN_VERIFICADO', 'PIN correcto.', { pin_verificado: true });
  }
  return [{ json: Object.assign({}, params, { empleado_nombre: params.empleado_nombre || empleado.name, odoo_employee_data: empleado, _valido: true, pin_verificado: true }) }];
} catch (e) {
  contar('error');
  return rechazo('PIN_ERROR_SERVIDOR', 'No se pudo verificar tu PIN. Intenta de nuevo en un momento.');
}
