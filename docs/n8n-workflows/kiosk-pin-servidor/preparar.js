// ====================================================
// PREPARAR PARÁMETROS — Schema real del frontend kiosk
// ====================================================
const body = $input.first().json.body || $input.first().json || {};

// Campos básicos
const empleado_id = parseInt(body.empleado_id);
const empleado_nombre = String(body.empleado_nombre || '');
const tipo = String(body.tipo || '').toLowerCase();
const timestamp_iso = body.timestamp || new Date().toISOString();

// Coordenadas (frontend manda lat/lng, NO latitud/longitud)
const lat = (body.lat !== undefined && body.lat !== null) ? parseFloat(body.lat) : null;
const lng = (body.lng !== undefined && body.lng !== null) ? parseFloat(body.lng) : null;

// Geo info
const geo_autorizada = body.geo_autorizada !== false; // default true
const geo_sitio = String(body.geo_sitio || '');
const geo_distancia = parseInt(body.geo_distancia) || 0;
const geo_motivo = String(body.geo_motivo || '');
const geo_status = String(body.geo_status || (geo_autorizada ? 'autorizado' : 'pendiente_aprobacion'));

// SO (solo en salida)
const so_id = body.so_id ? parseInt(body.so_id) : null;
const so_nombre = String(body.so_nombre || '');

// Bolsa / cuenta indirecta (Fase 1.5 Parte 10 — solo en salida cuando se confirma bolsa)
const cuenta_id = body.cuenta_id ? parseInt(body.cuenta_id) : null;
const cuenta_nombre = String(body.cuenta_nombre || '');

// Supervisor info (informativo, va a chatter)
const supervisor_nombre = String(body.supervisor_nombre || '');

// Estimado (olvidé checar entrada)
const es_estimado = body.es_estimado === true;
const motivo_estimado = String(body.motivo_estimado || '');

// Validación mínima
// fts-suite#486: 'verificar_pin' solo verifica el PIN y responde ANTES de cualquier escritura
// (Code - Validar empleado). Un servidor sin este cambio lo rechaza aquí: nunca escribe.
// 'metricas_pin': solo devuelve los contadores del día (números, nunca un PIN ni un nombre).
const TIPOS_VALIDOS = ['entrada', 'salida', 'salida_comida', 'regreso_comida', 'verificar_pin', 'metricas_pin'];
if (!empleado_id || !tipo || !TIPOS_VALIDOS.includes(tipo)) {
  return [{
    json: {
      _error: true,
      codigo_error: 'DATOS_INCOMPLETOS',
      mensaje: 'Faltan datos requeridos (empleado_id o tipo inválido). Tipo recibido: ' + tipo
    }
  }];
}

// Convertir timestamp del browser a formato Odoo UTC
// Si es_estimado: usar el timestamp del body (la hora declarada)
// Si NO: usar ahora (el browser ya manda la hora actual, pero por consistencia usamos server time)
let fechaParaOdoo;
if (es_estimado) {
  // Frontend manda "2026-04-20T17:00:00" (sin Z, hora local del técnico)
  // Asumimos que es CST (UTC-6) y convertimos a UTC
  const localDate = new Date(timestamp_iso);
  // Si no tiene zona, asumimos local del técnico (CST)
  if (!timestamp_iso.includes('Z') && !timestamp_iso.match(/[+-]\d{2}:?\d{2}$/)) {
    fechaParaOdoo = new Date(localDate.getTime() + (6 * 60 * 60 * 1000));
  } else {
    fechaParaOdoo = localDate;
  }
} else {
  fechaParaOdoo = new Date();
}

const fechaOdooStr = fechaParaOdoo.toISOString().slice(0, 19).replace('T', ' ');

// Para display CST
const fechaCST = new Date(fechaParaOdoo.getTime() - (6 * 60 * 60 * 1000));
const hora_cst = fechaCST.toISOString().substring(11, 16);
const fecha_cst = fechaCST.toISOString().substring(0, 10);

// Ventana de búsqueda de attendances abiertas
// F1.5 fix (2026-05-11): ventana 15 días para consistencia con kiosk/estado-empleado workflow.
// Antes 48h - no detectaba huérfanas >48h y rompía el auto-rescate del Issue 2 (caso Ricardo att 12948 con 95h).
const ahoraUTC = new Date();
const hace15Dias = new Date(ahoraUTC.getTime() - (15 * 24 * 60 * 60 * 1000));
const ventanaInicio = hace15Dias.toISOString().slice(0, 19).replace('T', ' ');

return [{
  json: {
    // Identificación
    empleado_id,
    empleado_nombre,
    tipo,

    // Tiempo
    fechaOdoo: fechaOdooStr,
    hora_cst,
    fecha_cst,
    ventanaInicio,

    // Geo
    lat,
    lng,
    geo_autorizada,
    geo_sitio,
    geo_distancia,
    geo_motivo,
    geo_status,

    // SO
    so_id,
    so_nombre,

    // Bolsa / cuenta indirecta (Fase 1.5 Parte 10)
    cuenta_id,
    cuenta_nombre,

    // Supervisor
    supervisor_nombre,

    // Estimado
    es_estimado,
    motivo_estimado
  }
}];