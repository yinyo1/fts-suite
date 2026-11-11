// ═══ FTS Kiosk — Conexión Odoo via n8n webhooks ═══
// Todas las llamadas pasan por n8n como proxy seguro.
// El token/credenciales de Odoo vive en el servidor n8n,
// nunca en el navegador.

// URL default — se usa si localStorage no tiene ops_n8n_url aún.
// public-config.json de GitHub sobreescribe esto en primer login.
const N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';

const N8N_BASE = () => {
  const url = localStorage.getItem('ops_n8n_url') || N8N_DEFAULT;
  return url.replace(/\/$/, '');
};

async function n8nFetch(endpoint, body, retries){
  if(body === undefined) body = {};
  if(retries === undefined) retries = 2;
  const base = N8N_BASE();
  if(!base) throw new Error('n8n no configurado');

  for(var i = 0; i <= retries; i++){
    try{
      var controller = new AbortController();
      var timer = setTimeout(function(){ controller.abort(); }, 10000);
      var res = await fetch(base + endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  controller.signal
      });
      clearTimeout(timer);
      if(!res.ok) throw new Error('n8n ' + res.status);
      return res.json();
    } catch(e){
      if(i === retries) throw e;
      console.log('[n8n] Reintentando (' + (i+1) + '/' + retries + ')…');
      await new Promise(function(r){ setTimeout(r, 2000); });
    }
  }
}

async function getEmpleados(){
  const companyId = parseInt(localStorage.getItem('ops_kiosk_company_id') || '1', 10);
  const data = await n8nFetch('/webhook/kiosk/empleados', { company_id: companyId });
  return (data && data.empleados) || [];
}

async function getSOs(){
  const companyId = parseInt(localStorage.getItem('ops_kiosk_company_id') || '1', 10);
  const data = await n8nFetch('/webhook/kiosk/sos', { company_id: companyId });
  return (data && data.sos) || [];
}

// Zona USA: el catálogo de una empresa concreta (1 = FTS MX, 6 = FTS USA LLC).
// OJO: que el servidor respete company_id NO está verificado (kiosk/sos no está
// habilitado para MCP). ZonaUSA.combinarCatalogos detecta si lo ignora.
async function getSOsCompania(companyId){
  const data = await n8nFetch('/webhook/kiosk/sos', { company_id: companyId });
  const r = Array.isArray(data) ? data[0] : data;
  return (r && r.sos) || [];
}

// B3: plan del día del empleado (pre-llenado de SO en salida)
async function getPlanDia(empleadoId){
  return n8nFetch('/webhook/planeacion/dia', { empleado_id: empleadoId });
}

async function registrarCheckin(payload){
  return n8nFetch('/webhook/kiosk/checkin', payload);
}

// fts-suite#486: el PIN se verifica en el servidor. tipo 'verificar_pin' NUNCA escribe
// (un servidor sin el cambio lo rechaza en Preparar parámetros). 1 reintento, no 2:
// cada intento malo cuenta para el bloqueo.
async function verificarPin(empleadoId, pin){
  return n8nFetch('/webhook/kiosk/checkin', {
    empleado_id: empleadoId,
    tipo: 'verificar_pin',
    pin: String(pin || ''),
    dispositivo_id: (window.kioskDispositivoId ? window.kioskDispositivoId() : null)
  }, 1);
}

async function getAsistenciaHoy(empleadoId){
  return n8nFetch('/webhook/kiosk/asistencia', { empleado_id: empleadoId });
}

async function getAsistenciaRango(empleadoId, desde, hasta){
  return n8nFetch('/webhook/kiosk/asistencia-rango', {
    empleado_id: empleadoId,
    fecha_desde: desde,
    fecha_hasta: hasta
  });
}

async function testConnection(){
  try{
    const res = await n8nFetch('/webhook/kiosk/ping', {});
    return { ok: true, data: res };
  } catch(e){
    return { ok: false, error: e.message };
  }
}

window.OdooKiosk = {
  getEmpleados,
  getSOs,
  getSOsCompania,
  getPlanDia,
  registrarCheckin,
  verificarPin,
  getAsistenciaHoy,
  getAsistenciaRango,
  testConnection
};
