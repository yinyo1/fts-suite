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

async function n8nFetch(endpoint, body){
  const base = N8N_BASE();
  if(!base) throw new Error('n8n no configurado');
  const res = await fetch(base + endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body || {})
  });
  if(!res.ok) throw new Error('n8n error: ' + res.status);
  return res.json();
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

async function registrarCheckin(payload){
  return n8nFetch('/webhook/kiosk/checkin', payload);
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
  registrarCheckin,
  getAsistenciaHoy,
  getAsistenciaRango,
  testConnection
};
