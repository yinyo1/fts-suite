// ═══ FTS Kiosk — Conexión Odoo via n8n ═══
// Todas las llamadas pasan por n8n como proxy seguro

const ODOO_CFG = () => ({
  n8nUrl: localStorage.getItem('ops_n8n_url') || '',
  apiKey: localStorage.getItem('ops_api_key') || ''
});

async function odooFetch(endpoint, body){
  const cfg = ODOO_CFG();
  if(!cfg.n8nUrl) throw new Error('n8n no configurado');
  const url = cfg.n8nUrl.replace(/\/$/, '') + endpoint;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key':    cfg.apiKey || ''
    },
    body: JSON.stringify(body || {})
  });
  if(!res.ok){
    throw new Error('Error n8n: ' + res.status + ' ' + res.statusText);
  }
  return res.json();
}

async function getEmpleados(){
  return odooFetch('/kiosk/empleados', {});
}

async function getSOs(){
  return odooFetch('/kiosk/sos', {});
}

async function registrarCheckin(data){
  // data: { empleado_id, so_id, tipo, foto_b64, lat, lng, timestamp }
  return odooFetch('/kiosk/checkin', data);
}

async function getAsistenciaHoy(empleadoId){
  return odooFetch('/kiosk/asistencia', { empleado_id: empleadoId });
}

async function getAsistenciaRango(empleadoId, desde, hasta){
  return odooFetch('/kiosk/asistencia-rango', {
    empleado_id: empleadoId,
    fecha_desde: desde,
    fecha_hasta: hasta
  });
}

async function testConnection(){
  try{
    const res = await odooFetch('/kiosk/ping', {});
    return { ok:true, data:res };
  } catch(e){
    return { ok:false, error:e.message };
  }
}

window.OdooKiosk = { getEmpleados, getSOs, registrarCheckin, getAsistenciaHoy, getAsistenciaRango, testConnection };
